import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  GraduationCap,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { CampusCode, PrintTemplate, SiteConfig, Teacher, TeacherGroup } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import {
  ALL_GRADES,
  CAMPUS_OPTIONS,
  formatTeachableGrades,
  MULTI_SUBJECT_SUPPORT_LABEL,
  resolveCampusFromRoom,
  teacherSupportsMultiSubject,
} from '../lib/timetableEngine';
import { ensureSystemPrintTemplates, type WorkspaceIndexes } from '../lib/workspaceIntegrity';
import { UniversalSmartImportModal } from './UniversalSmartImportModal';
import { CustomPrintTemplateStudio } from './CustomPrintTemplateStudio';
import { InlineErrorAlert } from './ContextualReloginBanner';
import { SafeDeleteConfirmModal } from './SafeDeleteConfirmModal';
import type { CrossNavIntent, QuickDrawerTarget } from './EntityQuickDrawer';

interface TeachersDirectoryModuleProps {
  workspace: WorkspacePayload;
  indexes: WorkspaceIndexes | null;
  siteConfig?: Partial<SiteConfig>;
  onRefresh: () => Promise<void>;
  onOpenDrawer: (target: QuickDrawerTarget) => void;
  onCrossNavigate: (intent: CrossNavIntent) => void;
  onRequestRelogin?: () => void;
}

export const TeachersDirectoryModule: React.FC<TeachersDirectoryModuleProps> = ({
  workspace,
  indexes,
  siteConfig,
  onRefresh,
  onOpenDrawer,
  onCrossNavigate,
  onRequestRelogin,
}) => {
  const canManage =
    workspace.user.role === 'SUPER_ADMIN' ||
    workspace.user.role === 'ADMIN' ||
    workspace.user.role === 'MANAGER';

  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | TeacherGroup>('ALL');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ON_LEAVE'>('ALL');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPrintStudio, setShowPrintStudio] = useState(false);
  const [localTemplates, setLocalTemplates] = useState<PrintTemplate[]>(() =>
    ensureSystemPrintTemplates(workspace.printTemplates),
  );

  const [creating, setCreating] = useState(false);
  const [deletingTeacher, setDeletingTeacher] = useState<Teacher | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newTeacher, setNewTeacher] = useState({
    name: '',
    shortName: '',
    teacherGroup: 'SUBJECT' as TeacherGroup,
    subjects: 'Toán',
    teachableGrades: [] as number[],
    campuses: ['CS1', 'CS2'] as CampusCode[],
    multiSubjectSupport: false,
    degree: 'Cử nhân Sư phạm',
    experienceYears: 4,
    phone: '',
    email: '',
    roomDefault: workspace.rooms[0]?.name || 'Phòng 1',
  });

  const toggleNewTeacherGrade = (grade: number) => {
    setNewTeacher((prev) => ({
      ...prev,
      teachableGrades: prev.teachableGrades.includes(grade)
        ? prev.teachableGrades.filter((g) => g !== grade)
        : [...prev.teachableGrades, grade].sort((a, b) => a - b),
    }));
  };

  const toggleNewTeacherCampus = (campus: CampusCode) => {
    setNewTeacher((prev) => {
      const exists = prev.campuses.includes(campus);
      const next = exists ? prev.campuses.filter((c) => c !== campus) : [...prev.campuses, campus];
      return { ...prev, campuses: next.length > 0 ? next : [campus] };
    });
  };

  const mergedTemplates = useMemo(
    () => ensureSystemPrintTemplates(workspace.printTemplates?.length ? workspace.printTemplates : localTemplates),
    [workspace.printTemplates, localTemplates],
  );

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    workspace.teachers.forEach((t) => (t.subjects || []).forEach((s) => set.add(s)));
    return Array.from(set).sort();
  }, [workspace.teachers]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.teachers.filter((t) => {
      if (groupFilter !== 'ALL' && t.teacherGroup !== groupFilter) return false;
      if (subjectFilter !== 'ALL' && !(t.subjects || []).includes(subjectFilter)) return false;
      if (roomFilter !== 'ALL' && t.roomDefault !== roomFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.shortName.toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.subjects || []).some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [workspace.teachers, search, groupFilter, subjectFilter, roomFilter, statusFilter]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (groupFilter !== 'ALL') parts.push(groupFilter === 'SUBJECT' ? 'GV Bộ môn' : 'GV Trả bài');
    if (subjectFilter !== 'ALL') parts.push(`Môn: ${subjectFilter}`);
    if (roomFilter !== 'ALL') parts.push(`Phòng: ${roomFilter}`);
    if (statusFilter !== 'ALL') parts.push(statusFilter === 'ACTIVE' ? 'Đang dạy' : 'Đang nghỉ');
    if (search.trim()) parts.push(`Từ khóa "${search.trim()}"`);
    return parts.length > 0 ? parts.join(' · ') : 'Toàn bộ đội ngũ Giáo viên Trung tâm';
  }, [groupFilter, subjectFilter, roomFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const total = workspace.teachers.length;
    const subjectCount = workspace.teachers.filter((t) => t.teacherGroup === 'SUBJECT').length;
    const tutorCount = workspace.teachers.filter((t) => t.teacherGroup === 'TUTOR_REVIEW').length;
    const weeklySlots = workspace.timetable.filter((s) => s.status !== 'OFF').length;
    const pendingLeaves = workspace.teacherLeaves.filter((l) => l.status === 'PENDING').length;
    return { total, subjectCount, tutorCount, weeklySlots, pendingLeaves };
  }, [workspace.teachers, workspace.timetable, workspace.teacherLeaves]);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const parsedSubjects = newTeacher.subjects
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiRequest<{ teacher: Teacher }>('/api/v1/teachers', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeacher.name,
          shortName: newTeacher.shortName || newTeacher.name.split(' ').slice(-2).join(' '),
          teacherGroup: newTeacher.teacherGroup,
          subjects: parsedSubjects,
          teachableGrades: newTeacher.teachableGrades,
          campuses: newTeacher.campuses,
          multiSubjectSupport: newTeacher.multiSubjectSupport,
          degree: newTeacher.degree,
          experienceYears: Number(newTeacher.experienceYears) || 0,
          phone: newTeacher.phone,
          email: newTeacher.email || undefined,
          roomDefault: newTeacher.roomDefault,
        }),
      });
      setFeedback(`Đã thêm giáo viên ${res.teacher.name} (${res.teacher.shortName}) vào hồ sơ Trung tâm.`);
      setNewTeacher({
        name: '',
        shortName: '',
        teacherGroup: 'SUBJECT',
        subjects: 'Toán',
        teachableGrades: [],
        campuses: ['CS1', 'CS2'],
        multiSubjectSupport: false,
        degree: 'Cử nhân Sư phạm',
        experienceYears: 4,
        phone: '',
        email: '',
        roomDefault: workspace.rooms[0]?.name || 'Phòng 1',
      });
      setShowCreateForm(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể thêm giáo viên mới.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Quản lý Đội ngũ Giáo viên
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Hồ sơ chuyên môn, phân nhóm Bộ môn / Trả bài, nhập danh sách đa chiều và in ấn chuẩn Trung tâm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                Nhập GV đa chiều (Excel / AI)
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172e6e] transition whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                Thêm Giáo viên
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowPrintStudio(true)}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-bold hover:bg-amber-100 transition whitespace-nowrap"
          >
            <Printer className="w-4 h-4 text-amber-700" />
            In Danh sách GV tùy biến
          </button>
        </div>
      </div>

      {/* Compact Tabular KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-xs font-medium text-slate-500">Tổng số Giáo viên</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-xs font-medium text-slate-500">GV Bộ môn</div>
          <div className="text-2xl font-extrabold text-[#1E3A8A] tabular-nums mt-0.5">{stats.subjectCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-xs font-medium text-slate-500">GV Trả bài / Kèm sát</div>
          <div className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-0.5">{stats.tutorCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <div className="text-xs font-medium text-slate-500">Tổng ca dạy / tuần</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">{stats.weeklySlots}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-slate-500">Đơn nghỉ chờ duyệt</div>
          <div className="text-2xl font-extrabold text-amber-600 tabular-nums mt-0.5">{stats.pendingLeaves}</div>
        </div>
      </div>

      <InlineErrorAlert
        message={errorMsg}
        onRequestRelogin={onRequestRelogin}
        onDismiss={() => setErrorMsg(null)}
      />
      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:bg-emerald-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Collapsible Create Form */}
      {showCreateForm && canManage && (
        <form
          onSubmit={handleCreateTeacher}
          className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#1E3A8A]" />
              Thêm hồ sơ Giáo viên mới
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Thu gọn
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên đầy đủ *</label>
              <input
                type="text"
                required
                value={newTeacher.name}
                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                placeholder="VD: Cô Trần Thị Thu Thảo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên gọi tắt (hiển thị TKB)</label>
              <input
                type="text"
                value={newTeacher.shortName}
                onChange={(e) => setNewTeacher({ ...newTeacher, shortName: e.target.value })}
                placeholder="VD: Cô Thảo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phân nhóm GV</label>
              <select
                value={newTeacher.teacherGroup}
                onChange={(e) => {
                  const nextGroup = e.target.value as TeacherGroup;
                  setNewTeacher((prev) => ({
                    ...prev,
                    teacherGroup: nextGroup,
                    multiSubjectSupport: nextGroup === 'TUTOR_REVIEW' ? true : prev.multiSubjectSupport,
                    subjects:
                      nextGroup === 'TUTOR_REVIEW' && prev.subjects.trim() === 'Toán'
                        ? `${MULTI_SUBJECT_SUPPORT_LABEL}, Trả bài, Soạn bài`
                        : prev.subjects,
                  }));
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="SUBJECT">Giáo viên Bộ môn (dạy nhiều khối / nhiều phòng)</option>
                <option value="TUTOR_REVIEW">Giáo viên Trả bài &amp; Kiểm tra (Hỗ trợ nhiều môn)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Môn chuyên môn</label>
              <input
                type="text"
                value={newTeacher.subjects}
                onChange={(e) => setNewTeacher({ ...newTeacher, subjects: e.target.value })}
                placeholder="Toán, Lý hoặc Hỗ trợ nhiều môn..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Trình độ / Bằng cấp</label>
              <input
                type="text"
                value={newTeacher.degree}
                onChange={(e) => setNewTeacher({ ...newTeacher, degree: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
              <input
                type="text"
                value={newTeacher.phone}
                onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                placeholder="0947..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gmail công vụ (để đăng nhập)</label>
              <input
                type="email"
                value={newTeacher.email}
                onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                placeholder="giaovien@gmail.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng ưu tiên (có thể xếp mọi phòng)</label>
              <select
                value={newTeacher.roomDefault}
                onChange={(e) => setNewTeacher({ ...newTeacher, roomDefault: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {workspace.rooms.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({resolveCampusFromRoom(r)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-grade, Multi-campus (CS1/CS2) & Multi-subject Tutor Specialization */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">Khối lớp có thể giảng dạy</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setNewTeacher((p) => ({ ...p, teachableGrades: [] }))}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      newTeacher.teachableGrades.length === 0
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    Mọi khối
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTeacher((p) => ({ ...p, teachableGrades: [6, 7, 8, 9] }))}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-slate-600 border border-slate-300 hover:border-[#1E3A8A] cursor-pointer"
                  >
                    Cấp 2
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTeacher((p) => ({ ...p, teachableGrades: [10, 11, 12] }))}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-slate-600 border border-slate-300 hover:border-[#1E3A8A] cursor-pointer"
                  >
                    Cấp 3
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_GRADES.map((g) => {
                  const selected = newTeacher.teachableGrades.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleNewTeacherGrade(g)}
                      className={`min-w-[36px] px-2 py-1 rounded-lg text-xs font-bold tabular-nums border transition cursor-pointer ${
                        selected
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-[#1E3A8A]'
                      }`}
                    >
                      K{g}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-slate-500">
                Hiện chọn: <strong className="text-slate-700">{formatTeachableGrades(newTeacher.teachableGrades)}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-800">Cơ sở nhận lớp (CS1 / CS2)</div>
              <div className="space-y-1.5">
                {CAMPUS_OPTIONS.map((c) => {
                  const checked = newTeacher.campuses.includes(c.code);
                  return (
                    <label
                      key={c.code}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                        checked
                          ? 'bg-white border-[#1E3A8A] text-[#1E3A8A]'
                          : 'bg-white/60 border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNewTeacherCampus(c.code)}
                        className="rounded border-slate-300 text-[#1E3A8A]"
                      />
                      <span>{c.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="text-[11px] text-slate-500">
                Giáo viên được phép xếp linh hoạt mọi phòng trống tại các cơ sở đã chọn.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="text-xs font-bold text-slate-800">Chuyên môn Hỗ trợ Trả bài &amp; Kiểm tra</div>
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newTeacher.multiSubjectSupport}
                  onChange={(e) =>
                    setNewTeacher((prev) => ({ ...prev, multiSubjectSupport: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-emerald-400 text-emerald-700"
                />
                <span className="text-xs text-slate-800 leading-snug">
                  <strong className="text-emerald-900">{MULTI_SUBJECT_SUPPORT_LABEL}</strong>
                  <span className="block text-[11px] text-slate-600 mt-0.5">
                    Dùng cho GV Trả bài / Kèm nhóm nhỏ: kiểm tra soạn bài, dò bài nhiều môn, bổ túc kiến thức.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={creating}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172e6e] disabled:opacity-60"
            >
              {creating ? 'Đang lưu...' : 'Lưu Giáo viên mới'}
            </button>
          </div>
        </form>
      )}

      {/* Multi-Criteria Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên GV, môn dạy, SĐT, Gmail..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#1E3A8A]"
            />
          </div>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | TeacherGroup)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">Tất cả nhóm GV</option>
            <option value="SUBJECT">GV Bộ môn</option>
            <option value="TUTOR_REVIEW">GV Trả bài / Kèm sát</option>
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">Tất cả môn dạy</option>
            {subjectOptions.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs"
            >
              <option value="ALL">Mọi phòng</option>
              {workspace.rooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ON_LEAVE')}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs"
            >
              <option value="ALL">Mọi TT</option>
              <option value="ACTIVE">Đang dạy</option>
              <option value="ON_LEAVE">Nghỉ phép</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
          <span>
            Hiển thị <strong className="text-slate-900 tabular-nums">{filteredTeachers.length}</strong> /{' '}
            <span className="tabular-nums">{workspace.teachers.length}</span> giáo viên · {filterSummary}
          </span>
          {(search || groupFilter !== 'ALL' || subjectFilter !== 'ALL' || roomFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setGroupFilter('ALL');
                setSubjectFilter('ALL');
                setRoomFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="text-[#1E3A8A] font-semibold hover:underline"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* High-Density Teachers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Giáo viên</th>
                <th className="py-3 px-3">Phân nhóm &amp; Môn</th>
                <th className="py-3 px-3">Liên hệ</th>
                <th className="py-3 px-3">Phòng &amp; Khối lượng</th>
                <th className="py-3 px-3">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác &amp; Liên kết nhanh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">
                    Không tìm thấy giáo viên phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((t) => {
                  const slots = indexes?.slotsByTeacherId.get(t.id) || [];
                  const assignedClasses = Array.from(new Set(slots.map((s) => s.centerClass))).sort();
                  const assignedStudents = indexes?.studentsByTeacherId.get(t.id) || [];
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer({ type: 'TEACHER', id: t.id })}
                          className="text-left group"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-[#1E3A8A] transition">
                            {t.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Tên TKB: <span className="font-semibold text-slate-700">{t.shortName}</span> · {t.degree} ({t.experienceYears} năm KN)
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs font-bold text-[#1E3A8A]">
                          {t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài & Kèm sát' : 'GV Bộ môn'}
                          {teacherSupportsMultiSubject(t) && (
                            <span className="ml-1.5 font-semibold text-emerald-700">· Hỗ trợ nhiều môn</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{(t.subjects || []).join(', ')}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {formatTeachableGrades(t.teachableGrades)} · Cơ sở: {(t.campuses && t.campuses.length > 0 ? t.campuses : ['CS1', 'CS2']).join(' & ')}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs text-slate-800 tabular-nums flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {t.phone || 'Chưa cập nhật'}
                        </div>
                        {t.email && (
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{t.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs font-semibold text-slate-800">
                          Ưu tiên {t.roomDefault} · <span className="tabular-nums text-[#1E3A8A]">{slots.length} ca/tuần</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">
                          {assignedClasses.length > 0
                            ? `${assignedClasses.join(', ')} (${assignedStudents.length} HS)`
                            : `Rảnh ${(t.availability || []).length}/36 ca tuần`}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                            t.status === 'ACTIVE' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              t.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          {t.status === 'ACTIVE' ? 'Đang dạy' : 'Nghỉ phép'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onOpenDrawer({ type: 'TEACHER', id: t.id })}
                            className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {canManage ? 'Sửa nhanh' : 'Chi tiết'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onCrossNavigate({ tab: 'timetable', teacherId: t.id })}
                            className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            Lịch dạy
                          </button>
                          <button
                            type="button"
                            onClick={() => onCrossNavigate({ tab: 'students', teacherId: t.id })}
                            className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                          >
                            <GraduationCap className="w-3.5 h-3.5" />
                            HS ({assignedStudents.length})
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setDeletingTeacher(t)}
                              title="Xóa hồ sơ giáo viên an toàn (nhập đúng tên)"
                              className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <UniversalSmartImportModal
        open={showImportModal}
        entityType="TEACHERS"
        workspace={workspace}
        onClose={() => setShowImportModal(false)}
        onSuccess={async (msg) => {
          setFeedback(msg);
          await onRefresh();
        }}
      />

      <CustomPrintTemplateStudio
        open={showPrintStudio}
        entityType="TEACHERS"
        teachers={filteredTeachers}
        indexes={indexes}
        templates={mergedTemplates}
        canManageTemplates={canManage}
        filterSummary={filterSummary}
        siteConfig={siteConfig}
        onClose={() => setShowPrintStudio(false)}
        onTemplatesChanged={(next) => {
          setLocalTemplates(next);
          void onRefresh();
        }}
        onRequestRelogin={onRequestRelogin}
      />
      {/* 2-Step Safe Teacher Delete Confirmation Modal */}
      <SafeDeleteConfirmModal
        open={Boolean(deletingTeacher)}
        entityType="TEACHER"
        targetName={deletingTeacher?.name || ''}
        targetSubLabel={
          deletingTeacher
            ? `Tên TKB: ${deletingTeacher.shortName} · ${
                deletingTeacher.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài & Kèm sát' : 'GV Bộ môn'
              } · Môn: ${(deletingTeacher.subjects || []).join(', ')}`
            : ''
        }
        requesterLabel={`${workspace.user.name} (${workspace.user.email})`}
        impactSummary={
          deletingTeacher
            ? [
                `Xóa "${deletingTeacher.name}" khỏi danh sách Giáo viên đang hoạt động.`,
                `Lưu trữ hồ sơ nhân sự vào kho Giáo viên đã lưu trữ để phục vụ đối chiếu lịch sử.`,
                `Gỡ ${(indexes?.slotsByTeacherId.get(deletingTeacher.id) || []).length} ca dạy trên Thời khóa biểu hiện tại và ghi nhật ký thay đổi TKB.`,
              ]
            : []
        }
        onConfirmDelete={async ({ confirmName, reason }) => {
          if (!deletingTeacher) return;
          await apiRequest(`/api/v1/teachers/${encodeURIComponent(deletingTeacher.id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ confirmName, reason }),
          });
          const removedName = deletingTeacher.name;
          setDeletingTeacher(null);
          await onRefresh();
          setFeedback(
            `Đã xóa hồ sơ giáo viên "${removedName}", lưu trữ lịch sử nhân sự và cập nhật Thời khóa biểu.`,
          );
        }}
        onClose={() => setDeletingTeacher(null)}
      />
    </div>
  );
};
