import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Check,
  Copy,
  Download,
  RefreshCw,
  Trash2,
  UserX,
  X,
} from 'lucide-react';
import type { DayOfWeek, SessionPeriod, ShiftCode, TimetableSlot } from '../types';
import {
  apiRequest,
  buildZaloReportText,
  downloadStudentIcs,
  type WorkspacePayload,
} from '../lib/api';

interface TimetableModuleProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}

const DAYS: { code: DayOfWeek; label: string; date: string }[] = [
  { code: 'T2', label: 'Thứ Hai', date: '23/11' },
  { code: 'T3', label: 'Thứ Ba', date: '24/11' },
  { code: 'T4', label: 'Thứ Tư', date: '25/11' },
  { code: 'T5', label: 'Thứ Năm', date: '26/11' },
  { code: 'T6', label: 'Thứ Sáu', date: '27/11' },
  { code: 'T7', label: 'Thứ Bảy', date: '28/11' },
];

const SHIFT_ROWS: { period: SessionPeriod; shift: ShiftCode; title: string; time: string }[] = [
  { period: 'SANG', shift: 'CA_1', title: 'Sáng · Ca 1', time: '07:15–08:45' },
  { period: 'SANG', shift: 'CA_2', title: 'Sáng · Ca 2', time: '09:15–10:45' },
  { period: 'CHIEU', shift: 'CA_1', title: 'Chiều · Ca 1', time: '13:30–15:00' },
  { period: 'CHIEU', shift: 'CA_2', title: 'Chiều · Ca 2', time: '15:15–16:45' },
  { period: 'TOI', shift: 'CA_1', title: 'Tối · Ca 1 (Trả bài / Bù TD)', time: '17:30–19:00' },
  { period: 'TOI', shift: 'CA_2', title: 'Tối · Ca 2', time: '19:00–20:30' },
];

const CLASS_OPTIONS = ['Tất cả lớp', 'Lớp 4,5', 'Lớp 6A1', 'Lớp 6A2', 'Lớp 7A1', 'Lớp 7NC', 'Lớp 8A1', 'Lớp 9A1', 'Lớp 10', 'Lớp 11'];
const ROOM_OPTIONS = ['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 4', 'Phòng 5'];

interface SubstituteSuggestion {
  slot: TimetableSlot;
  substituteTeachers: {
    teacherId: string;
    teacherName: string;
    fullName: string;
    subjects: string[];
    matchScore: string;
    isExactSubject: boolean;
  }[];
  eveningMakeupSuggestion: {
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    timeRange: string;
    room: string;
    reason: string;
  };
}

export const TimetableModule: React.FC<TimetableModuleProps> = ({ workspace, onRefresh }) => {
  const isStaff =
    workspace.user.role === 'SUPER_ADMIN' ||
    workspace.user.role === 'ADMIN' ||
    workspace.user.role === 'TEACHER';

  const [viewMode, setViewMode] = useState<'MASTER' | 'PERSONAL' | 'PE_MAKEUP'>('MASTER');
  const [classFilter, setClassFilter] = useState<string>('Tất cả lớp');
  const [teacherFilter, setTeacherFilter] = useState<string>('ALL');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(workspace.students[0]?.id || '');

  // Add Slot Form + Real-Time Conflict Check
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSlot, setNewSlot] = useState({
    day: 'T4' as DayOfWeek,
    period: 'SANG' as SessionPeriod,
    shift: 'CA_1' as ShiftCode,
    centerClass: 'Lớp 6A1',
    subject: 'Toán',
    teacherId: workspace.teachers[0]?.id || 't-man',
    room: 'Phòng 1',
    slotType: 'MAIN' as TimetableSlot['slotType'],
    note: '',
  });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [savingSlot, setSavingSlot] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Teacher emergency absence & auto-substitution
  const [subModal, setSubModal] = useState<SubstituteSuggestion | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [copiedZalo, setCopiedZalo] = useState(false);

  const filteredSlots = useMemo(() => {
    return workspace.timetable.filter((slot) => {
      if (classFilter !== 'Tất cả lớp' && slot.centerClass !== classFilter) return false;
      if (teacherFilter !== 'ALL' && slot.teacherId !== teacherFilter) return false;
      return true;
    });
  }, [workspace.timetable, classFilter, teacherFilter]);

  const selectedStudent = useMemo(
    () => workspace.students.find((s) => s.id === selectedStudentId) || workspace.students[0],
    [workspace.students, selectedStudentId],
  );

  const personalSlots = useMemo(() => {
    if (!selectedStudent) return [];
    return workspace.timetable.filter((s) => s.centerClass === selectedStudent.centerClass);
  }, [workspace.timetable, selectedStudent]);

  async function runConflictCheck(candidate = newSlot) {
    try {
      const res = await apiRequest<{ hasConflict: boolean; conflicts: string[] }>(
        '/api/v1/timetable/check-conflict',
        {
          method: 'POST',
          body: JSON.stringify(candidate),
        },
      );
      setConflicts(res.conflicts);
    } catch {
      // ignore transient errors
    }
  }

  async function handleCreateSlot(e: React.FormEvent) {
    e.preventDefault();
    setSavingSlot(true);
    setStatusMessage('');
    try {
      await apiRequest('/api/v1/timetable', {
        method: 'POST',
        body: JSON.stringify(newSlot),
      });
      await onRefresh();
      setShowAddForm(false);
      setConflicts([]);
      setStatusMessage('Đã thêm tiết học mới và đồng bộ thông báo tới học sinh & phụ huynh.');
    } catch (err: unknown) {
      setConflicts([err instanceof Error ? err.message : 'Xung đột lịch học.']);
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleOpenSubstitute(slot: TimetableSlot) {
    setSubLoading(true);
    setStatusMessage('');
    try {
      const res = await apiRequest<SubstituteSuggestion>(
        `/api/v1/timetable/${slot.id}/suggest-substitute`,
        { method: 'POST' },
      );
      setSubModal(res);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Không thể tìm giáo viên dạy thay.');
    } finally {
      setSubLoading(false);
    }
  }

  async function handleApplySubstitute(payload: { newTeacherId?: string; action?: string }) {
    if (!subModal) return;
    setSubLoading(true);
    try {
      await apiRequest(`/api/v1/timetable/${subModal.slot.id}/substitute`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSubModal(null);
      await onRefresh();
      setStatusMessage('Đã cập nhật dạy thay / đổi ca và tự động gửi thông báo Zalo + Email.');
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Không thể áp dụng thay đổi.');
    } finally {
      setSubLoading(false);
    }
  }

  async function handleDeleteSlot(id: string) {
    try {
      await apiRequest(`/api/v1/timetable/${id}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Không thể xóa tiết học.');
    }
  }

  async function handleExportIcs() {
    if (!selectedStudent) return;
    try {
      await downloadStudentIcs(selectedStudent.id, `TKB-NhanTri-${selectedStudent.code}.ics`);
      setStatusMessage(`Đã tải file Google Calendar (.ics) cho em ${selectedStudent.fullName}.`);
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : 'Lỗi xuất lịch .ics');
    }
  }

  function handleCopyPersonalZalo() {
    if (!selectedStudent) return;
    const text = buildZaloReportText(
      selectedStudent,
      workspace.scores,
      workspace.timetable,
      workspace.attendance,
    );
    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  }

  return (
    <div className="space-y-6">
      {/* Header & Mode Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Thời khóa biểu động &amp; Chống xung đột lịch
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Tuần 13 (23/11 – 28/11) · Đồng bộ lịch dạy giáo viên, phòng học, lịch Thể dục và Google Calendar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'MASTER', label: 'TKB Tổng trung tâm' },
              { id: 'PERSONAL', label: 'TKB Cá nhân & Google Cal' },
              { id: 'PE_MAKEUP', label: 'Bù lịch Thể dục tối' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id as 'MASTER' | 'PERSONAL' | 'PE_MAKEUP')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === tab.id
                    ? 'bg-white text-blue-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isStaff && (
            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                runConflictCheck();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Thêm tiết &amp; Kiểm tra trùng</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-950 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Smart Add Slot Form with Live Conflict Checker */}
      {showAddForm && isStaff && (
        <form
          onSubmit={handleCreateSlot}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950">
              Lên lịch học tự động (Tự kiểm tra trùng Giáo viên / Phòng / Lớp)
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Thứ trong tuần</label>
              <select
                value={newSlot.day}
                onChange={(e) => {
                  const next = { ...newSlot, day: e.target.value as DayOfWeek };
                  setNewSlot(next);
                  runConflictCheck(next);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {DAYS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label} ({d.date})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Buổi &amp; Ca học</label>
              <select
                value={`${newSlot.period}_${newSlot.shift}`}
                onChange={(e) => {
                  const [period, shift] = e.target.value.split('_') as [SessionPeriod, ShiftCode];
                  const next = { ...newSlot, period, shift };
                  setNewSlot(next);
                  runConflictCheck(next);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {SHIFT_ROWS.map((r) => (
                  <option key={`${r.period}_${r.shift}`} value={`${r.period}_${r.shift}`}>
                    {r.title} ({r.time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lớp trung tâm</label>
              <select
                value={newSlot.centerClass}
                onChange={(e) => {
                  const next = { ...newSlot, centerClass: e.target.value };
                  setNewSlot(next);
                  runConflictCheck(next);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {CLASS_OPTIONS.slice(1).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Giáo viên đứng lớp</label>
              <select
                value={newSlot.teacherId}
                onChange={(e) => {
                  const next = { ...newSlot, teacherId: e.target.value };
                  setNewSlot(next);
                  runConflictCheck(next);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {workspace.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.shortName} ({t.subjects.join(', ')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Môn học / Nội dung</label>
              <input
                type="text"
                required
                value={newSlot.subject}
                onChange={(e) => setNewSlot({ ...newSlot, subject: e.target.value })}
                placeholder="VD: Đại số, Ngữ Văn, Trả bài..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phòng học</label>
              <select
                value={newSlot.room}
                onChange={(e) => {
                  const next = { ...newSlot, room: e.target.value };
                  setNewSlot(next);
                  runConflictCheck(next);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {ROOM_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phân loại ca</label>
              <select
                value={newSlot.slotType}
                onChange={(e) =>
                  setNewSlot({ ...newSlot, slotType: e.target.value as TimetableSlot['slotType'] })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="MAIN">Học chính môn</option>
                <option value="TRA_BAI">Trả bài &amp; Soạn bài</option>
                <option value="BU_THE_DUC">Học bù Thể dục</option>
                <option value="PHU_DAO">Phụ đạo / Nâng cao</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ghi chú nhanh</label>
              <input
                type="text"
                value={newSlot.note}
                onChange={(e) => setNewSlot({ ...newSlot, note: e.target.value })}
                placeholder="Tùy chọn..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {conflicts.length > 0 ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Phát hiện xung đột lịch — Vui lòng đổi giáo viên, phòng hoặc ca học:
              </p>
              {conflicts.map((c, idx) => (
                <p key={idx}>• {c}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Hợp lệ · Không trùng giáo viên, phòng học hay lịch lớp.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={savingSlot || conflicts.length > 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              {savingSlot ? 'Đang lưu...' : 'Lưu vào TKB & Đồng bộ'}
            </button>
          </div>
        </form>
      )}

      {/* VIEW 1: MASTER TIMETABLE MATRIX */}
      {viewMode === 'MASTER' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Lọc theo lớp:</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-900"
              >
                {CLASS_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Lọc giáo viên:</span>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="ALL">Tất cả giáo viên</option>
                {workspace.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.shortName} ({t.subjects[0]})
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs text-slate-500 ml-auto font-mono-num">
              Hiển thị {filteredSlots.length} tiết · Thứ Ba (24/11) nghỉ định kỳ theo TKB Tuần 13
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[980px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <th className="py-3 px-4 font-semibold w-44 border-r border-slate-200">Buổi / Ca học</th>
                  {DAYS.map((d) => (
                    <th key={d.code} className="py-3 px-3 font-semibold border-r border-slate-200 last:border-r-0">
                      <span className="text-slate-950">{d.label}</span>
                      <span className="ml-1.5 font-mono-num text-slate-500">{d.date}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {SHIFT_ROWS.map((row) => (
                  <tr key={`${row.period}_${row.shift}`} className="align-top">
                    <td className="py-3 px-4 bg-slate-50/70 border-r border-slate-200">
                      <p className="font-bold text-slate-900">{row.title}</p>
                      <p className="font-mono-num text-slate-500 mt-0.5">{row.time}</p>
                    </td>
                    {DAYS.map((day) => {
                      if (day.code === 'T3') {
                        return (
                          <td
                            key={day.code}
                            className="py-3 px-3 bg-slate-50/40 text-slate-400 text-center border-r border-slate-200 align-middle"
                          >
                            Nghỉ
                          </td>
                        );
                      }
                      const cellSlots = filteredSlots.filter(
                        (s) => s.period === row.period && s.shift === row.shift && s.day === day.code,
                      );
                      return (
                        <td
                          key={day.code}
                          className="p-2 border-r border-slate-200 last:border-r-0 space-y-2"
                        >
                          {cellSlots.length === 0 ? (
                            <span className="text-slate-300 block text-center py-2">—</span>
                          ) : (
                            cellSlots.map((slot) => (
                              <div
                                key={slot.id}
                                className={`p-2.5 rounded-lg border transition-colors ${
                                  slot.slotType === 'BU_THE_DUC'
                                    ? 'bg-amber-50/80 border-amber-200'
                                    : slot.status === 'SUBSTITUTED'
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-white border-slate-200 hover:border-blue-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-blue-950">{slot.centerClass}</span>
                                  <span className="text-[11px] text-slate-500">{slot.room}</span>
                                </div>
                                <p className="font-semibold text-slate-900 mt-0.5">{slot.subject}</p>
                                <p className="text-[11px] text-slate-600">{slot.teacherName}</p>
                                {slot.note && (
                                  <p className="text-[11px] text-amber-800 mt-1 leading-snug">{slot.note}</p>
                                )}
                                {isStaff && (
                                  <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSubstitute(slot)}
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 hover:underline cursor-pointer"
                                    >
                                      <UserX className="w-3 h-3" />
                                      <span>GV nghỉ đột xuất</span>
                                    </button>
                                    {(workspace.user.role === 'SUPER_ADMIN' || workspace.user.role === 'ADMIN') && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        className="ml-auto text-slate-400 hover:text-red-700 cursor-pointer"
                                        title="Xóa tiết"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: PERSONALIZED STUDENT TIMETABLE + GOOGLE CALENDAR .ICS */}
      {viewMode === 'PERSONAL' && selectedStudent && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 block">
                Chọn học sinh để trích xuất Thời khóa biểu cá nhân hóa:
              </label>
              <select
                value={selectedStudent.id}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg text-slate-950"
              >
                {workspace.students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} — {st.centerClass} ({st.school})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportIcs}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Đồng bộ Google Calendar (.ics)</span>
              </button>
              <button
                type="button"
                onClick={handleCopyPersonalZalo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                {copiedZalo ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                <span>{copiedZalo ? 'Đã sao chép gửi Zalo' : 'Sao chép gửi Zalo Phụ huynh'}</span>
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 block">Trường &amp; Lớp chính khóa</span>
              <span className="font-semibold text-slate-900">
                {selectedStudent.schoolClass} · {selectedStudent.school}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">GV Quản nhiệm &amp; Phòng</span>
              <span className="font-semibold text-slate-900">
                {selectedStudent.homeroomTeacher} · {selectedStudent.room}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Bù lịch Thể dục (nếu trùng)</span>
              <span className="font-semibold text-amber-800">
                {selectedStudent.eveningMakeupSlot || 'Không trùng lịch Thể dục'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Thứ</th>
                  <th className="py-2.5 px-4 font-medium">Khung giờ</th>
                  <th className="py-2.5 px-4 font-medium">Môn học / Hoạt động</th>
                  <th className="py-2.5 px-4 font-medium">Giáo viên</th>
                  <th className="py-2.5 px-4 font-medium">Phòng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personalSlots.map((sl) => (
                  <tr key={sl.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{sl.day}</td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-600">{sl.timeRange}</td>
                    <td className="py-3 px-4 font-medium text-blue-950">
                      {sl.subject}
                      {sl.note && <span className="block text-xs text-amber-700 font-normal">{sl.note}</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{sl.teacherName}</td>
                    <td className="py-3 px-4 text-slate-600">{sl.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: PE CONFLICT & EVENING MAKEUP SCHEDULER */}
      {viewMode === 'PE_MAKEUP' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Theo dõi Lịch Thể dục trùng lịch chính &amp; Học bù Trả bài buổi tối
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Học sinh có tiết Thể dục ở trường trùng với ca học tại Trung Tâm Nhân Trí được tự động xếp vào Ca Tối 1 (17h30–19h00) để học bù, soạn bài và trả bài đầy đủ.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Học sinh</th>
                  <th className="py-2.5 px-4 font-medium">Lớp · Trường</th>
                  <th className="py-2.5 px-4 font-medium">Tiết Thể dục trùng</th>
                  <th className="py-2.5 px-4 font-medium">Ca học bù Trả bài / Soạn bài tự động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspace.students
                  .filter((s) => Boolean(s.peConflictDay))
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 px-4 font-semibold text-slate-950">{s.fullName}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {s.centerClass} · {s.school}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-red-700">
                        {s.peConflictDay} · {s.peConflictShift || 'Trùng lịch chính khóa'}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-blue-900">
                        {s.eveningMakeupSlot}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Emergency Teacher Absence & Auto-Substitute Modal */}
      {subModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-red-700">Xử lý biến động lịch đột xuất</p>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">
                  {subModal.slot.centerClass} · {subModal.slot.subject} ({subModal.slot.day}{' '}
                  {subModal.slot.timeRange})
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Giáo viên phụ trách hiện tại: <strong>{subModal.slot.teacherName}</strong> ({subModal.slot.room})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubModal(null)}
                className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">
                Gợi ý giáo viên đang trống ca này (không xung đột lịch):
              </p>
              {subModal.substituteTeachers.map((t) => (
                <div
                  key={t.teacherId}
                  className="p-3 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-950">{t.fullName}</p>
                    <p className="text-xs text-slate-600">
                      {t.subjects.join(' · ')} — <span className="text-emerald-700 font-medium">{t.matchScore}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={subLoading}
                    onClick={() => handleApplySubstitute({ newTeacherId: t.teacherId })}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Chọn dạy thay
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Hoặc chuyển sang Ca Tối Trả bài / Học bù</p>
                <p>{subModal.eveningMakeupSuggestion.reason}</p>
              </div>
              <button
                type="button"
                disabled={subLoading}
                onClick={() => handleApplySubstitute({ action: 'MOVE_TO_EVENING_MAKEUP' })}
                className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 rounded-lg hover:bg-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                Dời sang Tối 17h30
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
