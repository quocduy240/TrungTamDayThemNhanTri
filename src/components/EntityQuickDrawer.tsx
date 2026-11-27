import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Phone,
  QrCode,
  Save,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { EducationLevel, Student, Teacher, TeacherGroup } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { normalizeLookupKey, type WorkspaceIndexes } from '../lib/workspaceIntegrity';
import { InlineErrorAlert } from './ContextualReloginBanner';

export type QuickDrawerTarget =
  | { type: 'STUDENT'; id: string }
  | { type: 'TEACHER'; id: string };

export interface CrossNavIntent {
  tab: 'timetable' | 'students' | 'teachers' | 'scores' | 'tuition';
  classFilter?: string;
  teacherId?: string;
  studentId?: string;
  timetableSubTab?: 'SCHEDULE' | 'AVAILABILITY' | 'LEAVES' | 'ROOMS';
  shiftLabel?: string;
}

interface EntityQuickDrawerProps {
  target: QuickDrawerTarget | null;
  workspace: WorkspacePayload;
  indexes: WorkspaceIndexes | null;
  canEdit: boolean;
  canSeeFinance: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onCrossNavigate: (intent: CrossNavIntent) => void;
  onOpenQrCard?: (student: Student) => void;
  onRequestRelogin?: () => void;
}

const DAY_LABELS: Record<string, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
};

const PERIOD_LABELS: Record<string, string> = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
};

export const EntityQuickDrawer: React.FC<EntityQuickDrawerProps> = ({
  target,
  workspace,
  indexes,
  canEdit,
  canSeeFinance,
  onClose,
  onSaved,
  onCrossNavigate,
  onOpenQrCard,
  onRequestRelogin,
}) => {
  const [subTab, setSubTab] = useState<'EDIT' | 'LINKS'>('EDIT');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const student = useMemo(() => {
    if (!target || target.type !== 'STUDENT') return null;
    return indexes?.studentById.get(target.id) || workspace.students.find((s) => s.id === target.id) || null;
  }, [target, indexes, workspace.students]);

  const teacher = useMemo(() => {
    if (!target || target.type !== 'TEACHER') return null;
    return indexes?.teacherById.get(target.id) || workspace.teachers.find((t) => t.id === target.id) || null;
  }, [target, indexes, workspace.teachers]);

  // Student form draft
  const [stForm, setStForm] = useState({
    fullName: '',
    grade: 7,
    centerClass: '',
    schoolClass: '',
    school: '',
    homeroomTeacherId: '',
    homeroomTeacher: '',
    roomId: '',
    room: '',
    parentName: '',
    parentPhone: '',
    packageType: 'ALL_IN_ONE' as Student['packageType'],
    hasBoarding: false,
    hasShuttle: false,
    annualPrepaid: false,
    enrolledSubjects: '',
    status: 'ACTIVE' as Student['status'],
  });

  // Teacher form draft
  const [teaForm, setTeaForm] = useState({
    name: '',
    shortName: '',
    teacherGroup: 'SUBJECT' as TeacherGroup,
    subjects: '',
    degree: '',
    experienceYears: 3,
    phone: '',
    email: '',
    roomDefault: '',
    status: 'ACTIVE' as Teacher['status'],
  });

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubTab('EDIT');
    if (student) {
      setStForm({
        fullName: student.fullName,
        grade: student.grade,
        centerClass: student.centerClass,
        schoolClass: student.schoolClass || '',
        school: student.school || '',
        homeroomTeacherId: student.homeroomTeacherId || '',
        homeroomTeacher: student.homeroomTeacher || '',
        roomId: student.roomId || '',
        room: student.room || '',
        parentName: student.parentName || '',
        parentPhone: student.parentPhone || '',
        packageType: student.packageType,
        hasBoarding: Boolean(student.hasBoarding),
        hasShuttle: Boolean(student.hasShuttle),
        annualPrepaid: Boolean(student.annualPrepaid),
        enrolledSubjects: (student.enrolledSubjects || []).join(', '),
        status: student.status,
      });
    } else if (teacher) {
      setTeaForm({
        name: teacher.name,
        shortName: teacher.shortName,
        teacherGroup: teacher.teacherGroup,
        subjects: (teacher.subjects || []).join(', '),
        degree: teacher.degree || '',
        experienceYears: teacher.experienceYears || 0,
        phone: teacher.phone || '',
        email: teacher.email || '',
        roomDefault: teacher.roomDefault || '',
        status: teacher.status,
      });
    }
  }, [student?.id, teacher?.id]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  if (!target || (!student && !teacher)) return null;

  // O(1) indexed relations
  const studentSlots = student
    ? indexes?.slotsByClassKey.get(normalizeLookupKey(student.centerClass)) || []
    : [];
  const studentScores = student ? indexes?.scoresByStudentId.get(student.id) || [] : [];
  const studentTuition = student ? indexes?.tuitionByStudentId.get(student.id) || [] : [];
  const studentAttendance = student ? indexes?.attendanceByStudentId.get(student.id) || [] : [];

  const teacherSlots = teacher ? indexes?.slotsByTeacherId.get(teacher.id) || [] : [];
  const teacherStudents = teacher ? indexes?.studentsByTeacherId.get(teacher.id) || [] : [];
  const teacherLeaves = teacher ? indexes?.pendingLeavesByTeacherId.get(teacher.id) || [] : [];
  const teacherClasses = Array.from(new Set(teacherSlots.map((s) => s.centerClass))).sort();

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !canEdit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const selectedTeacher = workspace.teachers.find((t) => t.id === stForm.homeroomTeacherId);
      const selectedRoom = workspace.rooms.find((r) => r.id === stForm.roomId);
      const gradeNum = Math.min(12, Math.max(1, Number(stForm.grade) || 7));
      const level: EducationLevel = gradeNum <= 5 ? 'CAP_1' : gradeNum <= 9 ? 'CAP_2' : 'CAP_3';

      const res = await apiRequest<{
        student: Student;
        synced?: { updatedScores: number; updatedAttendance: number; updatedTuition: number };
      }>(`/api/v1/students/${encodeURIComponent(student.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: stForm.fullName,
          grade: gradeNum,
          level,
          centerClass: stForm.centerClass,
          schoolClass: stForm.schoolClass,
          school: stForm.school,
          homeroomTeacherId: stForm.homeroomTeacherId,
          homeroomTeacher: selectedTeacher ? selectedTeacher.shortName || selectedTeacher.name : stForm.homeroomTeacher,
          roomId: stForm.roomId,
          room: selectedRoom ? selectedRoom.name : stForm.room,
          parentName: stForm.parentName,
          parentPhone: stForm.parentPhone,
          packageType: stForm.packageType,
          hasBoarding: stForm.hasBoarding,
          hasShuttle: stForm.hasShuttle,
          annualPrepaid: stForm.annualPrepaid,
          enrolledSubjects: stForm.enrolledSubjects
            .split(/[,;]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          status: stForm.status,
        }),
      });
      const s = res.synced;
      const syncText =
        s && s.updatedScores + s.updatedAttendance + s.updatedTuition > 0
          ? ` (Đã tự đồng bộ ${s.updatedScores} điểm, ${s.updatedAttendance} điểm danh, ${s.updatedTuition} phiếu học phí)`
          : '';
      setSuccessMsg(`Đã lưu hồ sơ học sinh ${res.student.fullName}.${syncText}`);
      await onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ học sinh.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher || !canEdit) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<{
        teacher: Teacher;
        synced?: { updatedSlots: number; updatedStudents: number; updatedLeaves: number };
      }>(`/api/v1/teachers/${encodeURIComponent(teacher.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: teaForm.name,
          shortName: teaForm.shortName,
          teacherGroup: teaForm.teacherGroup,
          subjects: teaForm.subjects
            .split(/[,;]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          degree: teaForm.degree,
          experienceYears: Number(teaForm.experienceYears) || 0,
          phone: teaForm.phone,
          email: teaForm.email,
          roomDefault: teaForm.roomDefault,
          status: teaForm.status,
        }),
      });
      const s = res.synced;
      const syncText =
        s && s.updatedSlots + s.updatedStudents + s.updatedLeaves > 0
          ? ` (Đã đồng bộ ${s.updatedSlots} ca TKB, ${s.updatedStudents} học sinh, ${s.updatedLeaves} đơn nghỉ)`
          : '';
      setSuccessMsg(`Đã lưu hồ sơ giáo viên ${res.teacher.name}.${syncText}`);
      await onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ giáo viên.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={student ? `Hồ sơ nhanh học sinh ${student.fullName}` : `Hồ sơ nhanh giáo viên ${teacher?.name}`}
        className="relative z-10 w-full max-w-[490px] bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#1E3A8A] text-white flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center font-extrabold text-base text-amber-300 shrink-0">
              {student ? <GraduationCap className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold truncate">
                  {student ? student.fullName : teacher?.name}
                </h3>
              </div>
              <p className="text-xs text-blue-100 mt-0.5 tabular-nums truncate">
                {student
                  ? `${student.code} · ${student.centerClass} · Khối ${student.grade}`
                  : `${teacher?.shortName} · ${teacher?.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng ngăn kéo"
            className="p-2 rounded-lg text-blue-100 hover:bg-white/15 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tab Switcher */}
        <div className="px-5 pt-3 pb-0 border-b border-slate-200 bg-slate-50 flex items-center gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('EDIT')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              subTab === 'EDIT'
                ? 'border-[#1E3A8A] text-[#1E3A8A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {canEdit ? 'Sửa nhanh hồ sơ (Đồng bộ chéo)' : 'Chi tiết hồ sơ'}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('LINKS')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              subTab === 'LINKS'
                ? 'border-[#1E3A8A] text-[#1E3A8A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Liên kết chéo ({student ? `${studentSlots.length} ca · ${studentScores.length} điểm` : `${teacherSlots.length} ca · ${teacherStudents.length} HS`})
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <InlineErrorAlert
            message={errorMsg}
            onRequestRelogin={onRequestRelogin}
            onDismiss={() => setErrorMsg(null)}
          />
          {successMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STUDENT MODE */}
          {student && subTab === 'EDIT' && (
            <form id="drawer-student-form" onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên Học sinh</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={stForm.fullName}
                    onChange={(e) => setStForm({ ...stForm, fullName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lớp Trung tâm</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={stForm.centerClass}
                    onChange={(e) => setStForm({ ...stForm, centerClass: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
                  <select
                    disabled={!canEdit}
                    value={stForm.grade}
                    onChange={(e) => setStForm({ ...stForm, grade: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                      <option key={g} value={g}>
                        Khối {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trường học</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={stForm.school}
                    onChange={(e) => setStForm({ ...stForm, school: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lớp chính khóa</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={stForm.schoolClass}
                    onChange={(e) => setStForm({ ...stForm, schoolClass: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GV phụ trách (Khóa ngoại)</label>
                  <select
                    disabled={!canEdit}
                    value={stForm.homeroomTeacherId}
                    onChange={(e) => {
                      const found = workspace.teachers.find((t) => t.id === e.target.value);
                      setStForm({
                        ...stForm,
                        homeroomTeacherId: e.target.value,
                        homeroomTeacher: found ? found.shortName || found.name : stForm.homeroomTeacher,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="">-- Chọn giáo viên --</option>
                    {workspace.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.shortName} ({t.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng học mặc định</label>
                  <select
                    disabled={!canEdit}
                    value={stForm.roomId}
                    onChange={(e) => {
                      const found = workspace.rooms.find((r) => r.id === e.target.value);
                      setStForm({
                        ...stForm,
                        roomId: e.target.value,
                        room: found ? found.name : stForm.room,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {workspace.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Phụ huynh</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={stForm.parentName}
                    onChange={(e) => setStForm({ ...stForm, parentName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SĐT / Zalo Phụ huynh</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={stForm.parentPhone}
                    onChange={(e) => setStForm({ ...stForm, parentPhone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gói học</label>
                  <select
                    disabled={!canEdit}
                    value={stForm.packageType}
                    onChange={(e) =>
                      setStForm({ ...stForm, packageType: e.target.value as Student['packageType'] })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="ALL_IN_ONE">Trọn gói (Toán-Lý-Hóa-Anh-Văn)</option>
                    <option value="PER_SUBJECT">Học theo môn lẻ</option>
                    <option value="TUTORING">Kèm 1-1 / Bồi dưỡng nâng cao</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái học tập</label>
                  <select
                    disabled={!canEdit}
                    value={stForm.status}
                    onChange={(e) => setStForm({ ...stForm, status: e.target.value as Student['status'] })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="ACTIVE">Đang theo học</option>
                    <option value="PAUSED">Tạm nghỉ / Bảo lưu</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Môn đăng ký (phân cách dấu phẩy)</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={stForm.enrolledSubjects}
                    onChange={(e) => setStForm({ ...stForm, enrolledSubjects: e.target.value })}
                    placeholder="Toán, Ngữ Văn, Tiếng Anh"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={stForm.hasBoarding}
                    onChange={(e) => setStForm({ ...stForm, hasBoarding: e.target.checked })}
                    className="rounded border-slate-300 text-[#1E3A8A]"
                  />
                  Bán trú
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={stForm.hasShuttle}
                    onChange={(e) => setStForm({ ...stForm, hasShuttle: e.target.checked })}
                    className="rounded border-slate-300 text-[#1E3A8A]"
                  />
                  Đưa rước
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={stForm.annualPrepaid}
                    onChange={(e) => setStForm({ ...stForm, annualPrepaid: e.target.checked })}
                    className="rounded border-slate-300 text-[#1E3A8A]"
                  />
                  Đóng trọn 12 tháng
                </label>
              </div>
            </form>
          )}

          {student && subTab === 'LINKS' && (
            <div className="space-y-4">
              {/* Quick metrics */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Ca học / tuần</div>
                  <div className="text-lg font-extrabold text-[#1E3A8A] tabular-nums mt-0.5">{studentSlots.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">ĐTB gần nhất</div>
                  <div className="text-lg font-extrabold text-emerald-700 tabular-nums mt-0.5">
                    {studentScores.length > 0
                      ? (studentScores.reduce((sum, s) => sum + s.score, 0) / studentScores.length).toFixed(1)
                      : '—'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Điểm danh</div>
                  <div className="text-lg font-extrabold text-slate-900 tabular-nums mt-0.5">
                    {studentAttendance.length} buổi
                  </div>
                </div>
              </div>

              {/* Weekly Schedule */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Thời khóa biểu lớp {student.centerClass}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      onCrossNavigate({ tab: 'timetable', classFilter: student.centerClass });
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    Mở TKB <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {studentSlots.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có ca học nào xếp cho lớp {student.centerClass}.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {studentSlots.slice(0, 6).map((sl) => (
                      <div key={sl.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{DAY_LABELS[sl.day] || sl.day}</span>
                          <span className="text-slate-500"> · {PERIOD_LABELS[sl.period]} ({sl.timeRange})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-[#1E3A8A]">{sl.subject}</span>
                          <span className="text-slate-500"> · {sl.teacherName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Scores */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Điểm kiểm tra gần nhất ({studentScores.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      onCrossNavigate({ tab: 'scores', studentId: student.id });
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    Mở Học bạ <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {studentScores.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có đầu điểm nào.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {studentScores.slice(0, 4).map((sc) => (
                      <div key={sc.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{sc.subject}</span>
                          <span className="text-slate-500"> · {sc.date}</span>
                        </div>
                        <span className="font-extrabold tabular-nums text-[#1E3A8A]">
                          {sc.score.toFixed(1)}/{sc.maxScore}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tuition summary */}
              {canSeeFinance && (
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Học phí &amp; Công nợ ({studentTuition.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        onCrossNavigate({ tab: 'tuition', studentId: student.id });
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                    >
                      Mở Học phí <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {studentTuition.length === 0 ? (
                    <p className="text-xs text-slate-500">Chưa có phiếu thu học phí.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {studentTuition.slice(0, 3).map((tu) => (
                        <div key={tu.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-800">{tu.monthLabel}</span>
                          <div className="text-right tabular-nums">
                            <span className="font-bold text-slate-900">
                              {tu.totalAmount.toLocaleString('vi-VN')}đ
                            </span>
                            <span
                              className={`ml-2 text-[11px] font-bold ${
                                tu.status === 'PAID'
                                  ? 'text-emerald-700'
                                  : tu.status === 'OVERDUE'
                                    ? 'text-red-600'
                                    : 'text-amber-700'
                              }`}
                            >
                              {tu.status === 'PAID' ? 'Đã đóng' : tu.status === 'OVERDUE' ? 'Quá hạn' : 'Đến hạn'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TEACHER MODE */}
          {teacher && subTab === 'EDIT' && (
            <form id="drawer-teacher-form" onSubmit={handleSaveTeacher} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên Giáo viên</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={teaForm.name}
                    onChange={(e) => setTeaForm({ ...teaForm, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên hiển thị trên TKB</label>
                  <input
                    type="text"
                    required
                    disabled={!canEdit}
                    value={teaForm.shortName}
                    onChange={(e) => setTeaForm({ ...teaForm, shortName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phân nhóm Giáo viên</label>
                  <select
                    disabled={!canEdit}
                    value={teaForm.teacherGroup}
                    onChange={(e) =>
                      setTeaForm({ ...teaForm, teacherGroup: e.target.value as TeacherGroup })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="SUBJECT">Giáo viên Bộ môn</option>
                    <option value="TUTOR_REVIEW">Giáo viên Trả bài &amp; Kèm sát</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Môn giảng dạy (phân cách dấu phẩy)</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={teaForm.subjects}
                    onChange={(e) => setTeaForm({ ...teaForm, subjects: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trình độ / Bằng cấp</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={teaForm.degree}
                    onChange={(e) => setTeaForm({ ...teaForm, degree: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kinh nghiệm (năm)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    disabled={!canEdit}
                    value={teaForm.experienceYears}
                    onChange={(e) => setTeaForm({ ...teaForm, experienceYears: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={teaForm.phone}
                    onChange={(e) => setTeaForm({ ...teaForm, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gmail công vụ</label>
                  <input
                    type="email"
                    disabled={!canEdit}
                    value={teaForm.email}
                    onChange={(e) => setTeaForm({ ...teaForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng mặc định</label>
                  <select
                    disabled={!canEdit}
                    value={teaForm.roomDefault}
                    onChange={(e) => setTeaForm({ ...teaForm, roomDefault: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    {workspace.rooms.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                    {!workspace.rooms.some((r) => r.name === teaForm.roomDefault) && teaForm.roomDefault && (
                      <option value={teaForm.roomDefault}>{teaForm.roomDefault}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    disabled={!canEdit}
                    value={teaForm.status}
                    onChange={(e) => setTeaForm({ ...teaForm, status: e.target.value as Teacher['status'] })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    <option value="ACTIVE">Đang giảng dạy</option>
                    <option value="ON_LEAVE">Đang nghỉ phép</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Khi đổi <strong>Tên hiển thị trên TKB</strong>, hệ thống tự động đồng bộ lại toàn bộ ca dạy trên Thời khóa biểu, danh sách Học sinh chủ nhiệm và Đơn xin nghỉ.
              </p>
            </form>
          )}

          {teacher && subTab === 'LINKS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Ca dạy / tuần</div>
                  <div className="text-lg font-extrabold text-[#1E3A8A] tabular-nums mt-0.5">{teacherSlots.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Học sinh phụ trách</div>
                  <div className="text-lg font-extrabold text-emerald-700 tabular-nums mt-0.5">{teacherStudents.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">Đơn nghỉ chờ</div>
                  <div className="text-lg font-extrabold text-amber-700 tabular-nums mt-0.5">{teacherLeaves.length}</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Các lớp đang đứng lớp ({teacherClasses.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      onCrossNavigate({ tab: 'students', teacherId: teacher.id });
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    Xem toàn bộ HS <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {teacherClasses.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có lớp nào phân công trên Thời khóa biểu.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {teacherClasses.map((cls) => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => {
                          onCrossNavigate({ tab: 'students', classFilter: cls });
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition"
                      >
                        {cls}
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Lịch giảng dạy tuần này
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      onCrossNavigate({ tab: 'timetable', teacherId: teacher.id });
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    Mở TKB lọc sẵn <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {teacherSlots.length === 0 ? (
                  <p className="text-xs text-slate-500">Chưa có tiết dạy nào trong tuần.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {teacherSlots.slice(0, 7).map((sl) => (
                      <div key={sl.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{DAY_LABELS[sl.day] || sl.day}</span>
                          <span className="text-slate-500"> · {PERIOD_LABELS[sl.period]} ({sl.timeRange})</span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-[#1E3A8A]">{sl.centerClass}</span>
                          <span className="text-slate-500"> · {sl.subject} ({sl.room})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 space-y-2.5 shrink-0">
          {subTab === 'EDIT' && canEdit && (
            <button
              type="submit"
              form={student ? 'drawer-student-form' : 'drawer-teacher-form'}
              disabled={saving}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-[#172e6e] text-white text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu & đồng bộ...' : 'Lưu thay đổi & Đồng bộ chéo'}
            </button>
          )}

          {/* Cross-table instant jumps */}
          <div className="flex flex-wrap items-center gap-1.5">
            {student ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCrossNavigate({ tab: 'timetable', classFilter: student.centerClass });
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  TKB lớp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCrossNavigate({ tab: 'scores', studentId: student.id });
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Học bạ
                </button>
                {canSeeFinance && (
                  <button
                    type="button"
                    onClick={() => {
                      onCrossNavigate({ tab: 'tuition', studentId: student.id });
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Học phí
                  </button>
                )}
                {onOpenQrCard && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenQrCard(student);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900 hover:bg-amber-100 transition whitespace-nowrap"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Thẻ QR
                  </button>
                )}
              </>
            ) : teacher ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCrossNavigate({ tab: 'timetable', teacherId: teacher.id });
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Lịch dạy TKB
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCrossNavigate({ tab: 'students', teacherId: teacher.id });
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  HS đang phụ trách
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCrossNavigate({ tab: 'timetable', teacherId: teacher.id, timetableSubTab: 'AVAILABILITY' });
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition whitespace-nowrap"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Lịch rảnh &amp; Nghỉ phép
                </button>
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
};
