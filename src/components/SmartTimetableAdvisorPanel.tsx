import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Layers,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  CampusCode,
  DayOfWeek,
  SessionPeriod,
  ShiftCode,
  Teacher,
  TimetableSlot,
} from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import {
  analyzeShiftStaffing,
  dayLabel,
  DAYS,
  formatTeachableGrades,
  MULTI_SUBJECT_SUPPORT_LABEL,
  planParallelTutorGroups,
  resolveCampusFromRoom,
  SHIFT_ROWS,
  shiftLabel,
  teacherSupportsMultiSubject,
  type ConstraintContext,
} from '../lib/timetableEngine';

interface SmartTimetableAdvisorPanelProps {
  workspace: WorkspacePayload;
  engineCtx: ConstraintContext;
  classOptions: string[];
  onRefresh: () => Promise<void>;
  onQuickAddSlot: (preset: {
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    teacherId?: string;
    roomId?: string;
    room?: string;
    slotType?: TimetableSlot['slotType'];
    subject?: string;
    centerClass?: string;
    groupLabel?: string;
  }) => void;
  onJumpToGrid: () => void;
}

export const SmartTimetableAdvisorPanel: React.FC<SmartTimetableAdvisorPanelProps> = ({
  workspace,
  engineCtx,
  classOptions,
  onRefresh,
  onQuickAddSlot,
  onJumpToGrid,
}) => {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('T2');
  const [selectedPeriod, setSelectedPeriod] = useState<SessionPeriod>('CHIEU');
  const [selectedShift, setSelectedShift] = useState<ShiftCode>('CA_1');

  // Parallel Small-Group Tutor Split Builder state
  const [splitClass, setSplitClass] = useState<string>(classOptions[0] || 'Lớp 7A1');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [splitSlotType, setSplitSlotType] = useState<'TRA_BAI' | 'PHU_DAO'>('TRA_BAI');
  const [splitCampus, setSplitCampus] = useState<CampusCode | 'ANY'>('ANY');
  const [splitSubject, setSplitSubject] = useState<string>('Trả bài & Kiểm tra soạn bài (Hỗ trợ nhiều môn)');
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState('');
  const [batchError, setBatchError] = useState('');

  // Precompute staffing for all 36 weekly shifts
  const weeklyMatrix = useMemo(() => {
    const map = new Map<string, ReturnType<typeof analyzeShiftStaffing>>();
    for (const row of SHIFT_ROWS) {
      for (const day of DAYS) {
        const key = `${day.code}_${row.period}_${row.shift}`;
        map.set(key, analyzeShiftStaffing(day.code, row.period, row.shift, engineCtx));
      }
    }
    return map;
  }, [engineCtx]);

  const activeStaffing = useMemo(
    () => analyzeShiftStaffing(selectedDay, selectedPeriod, selectedShift, engineCtx),
    [selectedDay, selectedPeriod, selectedShift, engineCtx],
  );

  const parallelPlan = useMemo(
    () =>
      planParallelTutorGroups(
        {
          day: selectedDay,
          period: selectedPeriod,
          shift: selectedShift,
          centerClass: splitClass,
          subject: splitSubject,
          slotType: splitSlotType,
          groupCount: splitCount,
          preferredCampus: splitCampus,
        },
        engineCtx,
      ),
    [selectedDay, selectedPeriod, selectedShift, splitClass, splitSubject, splitSlotType, splitCount, splitCampus, engineCtx],
  );

  const handleCommitParallelGroups = async () => {
    if (parallelPlan.planned.length === 0) {
      setBatchError('Chưa có đủ Giáo viên rảnh hoặc Phòng trống trong ca này để chia nhóm nhỏ.');
      return;
    }
    setSavingBatch(true);
    setBatchError('');
    setBatchFeedback('');
    try {
      const payloadSlots = parallelPlan.planned.map((item) => ({
        day: selectedDay,
        period: selectedPeriod,
        shift: selectedShift,
        centerClass: splitClass,
        groupLabel: item.groupLabel,
        subject: item.subject,
        teacherId: item.teacher.id,
        roomId: item.room.id,
        room: item.room.name,
        slotType: item.slotType,
      }));
      const res = await apiRequest<{ count: number; warnings?: string[] }>('/api/v1/timetable/batch-groups', {
        method: 'POST',
        body: JSON.stringify({ slots: payloadSlots }),
      });
      await onRefresh();
      setBatchFeedback(
        `Đã xếp thành công ${res.count} nhóm nhỏ trả bài song song cho ${splitClass} vào ${dayLabel(selectedDay)} · ${shiftLabel(selectedPeriod, selectedShift)}.`,
      );
    } catch (err: unknown) {
      setBatchError(err instanceof Error ? err.message : 'Không thể lưu lịch chia nhóm nhỏ.');
    } finally {
      setSavingBatch(false);
    }
  };

  const quickPickRoomForTeacher = (teacher: Teacher) => {
    const allFree = [...activeStaffing.freeRoomsCs1, ...activeStaffing.freeRoomsCs2];
    const allowedCampuses = teacher.campuses && teacher.campuses.length > 0 ? teacher.campuses : (['CS1', 'CS2'] as CampusCode[]);
    const preferred =
      allFree.find((r) => r.name === teacher.roomDefault) ||
      allFree.find((r) => allowedCampuses.includes(resolveCampusFromRoom(r))) ||
      allFree[0];
    return preferred;
  };

  return (
    <div className="space-y-5">
      {/* Architecture Rules Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Trợ lý Điều phối Xếp lịch Thông minh · Đa khối · Đa phòng (CS1 &amp; CS2) · Chia nhóm nhỏ</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 mt-1.5 leading-relaxed">
              Hiểu đồng thời lịch <strong>rảnh/bận</strong> từng giáo viên, GV Bộ môn dạy <strong>nhiều khối lớp &amp; nhiều phòng tại CS1/CS2</strong>, và GV Trả bài <strong>“{MULTI_SUBJECT_SUPPORT_LABEL}”</strong> kèm nhiều nhóm nhỏ song song từ cùng 1 lớp học.
            </p>
          </div>
          <button
            type="button"
            onClick={onJumpToGrid}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-white text-slate-950 text-xs font-bold hover:bg-slate-100 whitespace-nowrap self-start lg:self-center cursor-pointer"
          >
            Xem trên Lưới TKB
          </button>
        </div>
      </div>

      {/* 6x6 Weekly Shift Capacity Heatmap */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-950">
              Ma trận Năng lực Rảnh/Bận theo 36 ca tuần (Chạm 1 ca để điều phối &amp; chia nhóm)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              BM = GV Bộ môn rảnh · TB = GV Trả bài (Hỗ trợ nhiều môn) rảnh · CS1 / CS2 = Phòng trống tại từng cơ sở
            </p>
          </div>
          <div className="text-xs font-semibold text-blue-900 tabular-nums">
            Tổng GV: {workspace.teachers.length} · Phòng hoạt động: {workspace.rooms.filter((r) => r.active).length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 font-semibold w-40 border-r border-slate-200">Buổi / Ca</th>
                {DAYS.map((d) => (
                  <th key={d.code} className="py-2.5 px-2.5 font-semibold text-center border-r border-slate-200 last:border-r-0">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {SHIFT_ROWS.map((row) => (
                <tr key={`${row.period}_${row.shift}`}>
                  <td className="py-2.5 px-3 bg-slate-50/50 border-r border-slate-200">
                    <div className="font-bold text-slate-900">{row.label}</div>
                    <div className="text-[11px] font-mono-num text-slate-500">{row.time}</div>
                  </td>
                  {DAYS.map((d) => {
                    const key = `${d.code}_${row.period}_${row.shift}`;
                    const snap = weeklyMatrix.get(key)!;
                    const isSelected =
                      selectedDay === d.code && selectedPeriod === row.period && selectedShift === row.shift;
                    const totalFreeRooms = snap.freeRoomsCs1.length + snap.freeRoomsCs2.length;
                    const totalScheduled = snap.subjectSlots.length + snap.tutorGroupSlots.length;
                    const canSplit = snap.freeTutorTeachers.length >= 2 && totalFreeRooms >= 2;

                    return (
                      <td key={d.code} className="p-1.5 border-r border-slate-200 last:border-r-0 align-top">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDay(d.code);
                            setSelectedPeriod(row.period);
                            setSelectedShift(row.shift);
                            setBatchError('');
                            setBatchFeedback('');
                          }}
                          className={`w-full text-left p-2 rounded-lg border transition cursor-pointer space-y-1 ${
                            isSelected
                              ? 'bg-blue-900 text-white border-blue-900 ring-2 ring-blue-900/20'
                              : canSplit
                                ? 'bg-emerald-50/45 border-emerald-200 hover:border-blue-400'
                                : 'bg-white border-slate-200 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-bold tabular-nums">
                            <span className={isSelected ? 'text-amber-200' : 'text-blue-900'}>
                              BM: {snap.freeSubjectTeachers.length}
                            </span>
                            <span className={isSelected ? 'text-emerald-200' : 'text-emerald-700'}>
                              TB: {snap.freeTutorTeachers.length}
                            </span>
                          </div>
                          <div
                            className={`text-[10px] font-mono-num flex items-center justify-between ${
                              isSelected ? 'text-blue-100' : 'text-slate-600'
                            }`}
                          >
                            <span>CS1:{snap.freeRoomsCs1.length} · CS2:{snap.freeRoomsCs2.length}</span>
                            {totalScheduled > 0 && (
                              <span className={isSelected ? 'text-white font-bold' : 'text-slate-800 font-semibold'}>
                                {totalScheduled} ca
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Shift Workspace: Left = Live Staffing, Right = 1-Click Parallel Tutor Group Splitter */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left 7 cols: Current shift staffing & free teachers/rooms */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
                Đang chọn điều phối ca học
              </div>
              <h3 className="text-base font-extrabold text-slate-950 mt-0.5">
                {dayLabel(selectedDay)} · {shiftLabel(selectedPeriod, selectedShift)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() =>
                onQuickAddSlot({
                  day: selectedDay,
                  period: selectedPeriod,
                  shift: selectedShift,
                  slotType: 'MAIN',
                })
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-bold hover:bg-blue-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Xếp ca GV Bộ môn
            </button>
          </div>

          {/* Already scheduled in this shift */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800">
              Ca đã xếp song song trong khung giờ này ({activeStaffing.subjectSlots.length} Bộ môn · {activeStaffing.tutorGroupSlots.length} Nhóm Trả bài)
            </div>
            {activeStaffing.subjectSlots.length + activeStaffing.tutorGroupSlots.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                Ca này hiện chưa có lớp nào. Bạn có thể xếp đồng thời nhiều GV Bộ môn ở các phòng khác nhau và/hoặc chia nhiều nhóm nhỏ GV Trả bài.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {[...activeStaffing.subjectSlots, ...activeStaffing.tutorGroupSlots].map((sl) => (
                  <div
                    key={sl.id}
                    className={`p-2.5 rounded-lg border text-xs ${
                      sl.slotType === 'MAIN'
                        ? 'bg-blue-50/60 border-blue-200'
                        : 'bg-emerald-50/60 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold text-slate-900">
                      <span>
                        {sl.centerClass}
                        {sl.groupLabel ? ` · ${sl.groupLabel}` : ''}
                      </span>
                      <span className="font-mono-num text-[11px] text-slate-600">
                        {sl.room} ({sl.campus || 'CS1'})
                      </span>
                    </div>
                    <div className="text-slate-700 mt-0.5">{sl.subject}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {sl.teacherName} · {sl.slotType === 'MAIN' ? 'GV Bộ môn' : 'GV Trả bài / Nhóm nhỏ'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Free Subject Teachers */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-900" />
              GV Bộ môn đang rảnh ca này ({activeStaffing.freeSubjectTeachers.length})
            </div>
            {activeStaffing.freeSubjectTeachers.length === 0 ? (
              <p className="text-xs text-slate-500">Không còn GV Bộ môn rảnh trong ca này (hoặc chưa nhập danh sách GV).</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {activeStaffing.freeSubjectTeachers.map((t) => {
                  const recRoom = quickPickRoomForTeacher(t);
                  return (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{t.shortName}</div>
                        <div className="text-[11px] text-slate-600 truncate">{(t.subjects || []).join(', ')}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                          {formatTeachableGrades(t.teachableGrades)} · {(t.campuses && t.campuses.length > 0 ? t.campuses : ['CS1', 'CS2']).join('/')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onQuickAddSlot({
                            day: selectedDay,
                            period: selectedPeriod,
                            shift: selectedShift,
                            teacherId: t.id,
                            roomId: recRoom?.id,
                            room: recRoom?.name,
                            slotType: 'MAIN',
                            subject: t.subjects[0] || 'Toán',
                          })
                        }
                        className="px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-[11px] font-bold hover:bg-blue-100 whitespace-nowrap cursor-pointer shrink-0"
                      >
                        + Xếp lớp
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Free Review Tutors & Free Rooms by Campus */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-emerald-900">
                GV Trả bài / Hỗ trợ nhiều môn đang rảnh ({activeStaffing.freeTutorTeachers.length})
              </div>
              {activeStaffing.freeTutorTeachers.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có GV Trả bài rảnh ca này.</p>
              ) : (
                <div className="space-y-1.5">
                  {activeStaffing.freeTutorTeachers.map((t) => (
                    <div key={t.id} className="p-2 rounded-lg border border-emerald-200 bg-emerald-50/40 text-xs">
                      <div className="font-bold text-slate-900 flex items-center justify-between gap-1">
                        <span>{t.shortName}</span>
                        <span className="text-[10px] text-emerald-800 font-semibold">
                          {(t.campuses && t.campuses.length > 0 ? t.campuses : ['CS1', 'CS2']).join('/')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {teacherSupportsMultiSubject(t) ? MULTI_SUBJECT_SUPPORT_LABEL : (t.subjects || []).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-600" />
                Phòng trống theo Cơ sở
              </div>
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2">
                <div>
                  <span className="font-bold text-blue-900">Cơ sở 1 (CS1): </span>
                  <span className="text-slate-700">
                    {activeStaffing.freeRoomsCs1.length > 0
                      ? activeStaffing.freeRoomsCs1.map((r) => r.name).join(', ')
                      : 'Đã kín phòng'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-indigo-900">Cơ sở 2 (CS2): </span>
                  <span className="text-slate-700">
                    {activeStaffing.freeRoomsCs2.length > 0
                      ? activeStaffing.freeRoomsCs2.map((r) => r.name).join(', ')
                      : 'Đã kín phòng'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 cols: 1-Click Parallel Small-Group Tutor Split Builder */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Chia nhóm nhỏ GV Trả bài &amp; Kiểm tra song song</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Tách 1 lớp học thành <strong>2–4 nhóm nhỏ tự học song song</strong> cùng ca với các GV Trả bài rảnh ở nhiều phòng khác nhau (hỗ trợ nhiều môn, kiểm tra soạn bài, bổ túc).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Lớp cần chia nhóm</label>
              <select
                value={splitClass}
                onChange={(e) => setSplitClass(e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
              >
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Số nhóm nhỏ song song</label>
              <select
                value={splitCount}
                onChange={(e) => setSplitCount(Number(e.target.value))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white tabular-nums"
              >
                <option value={2}>2 nhóm song song</option>
                <option value={3}>3 nhóm song song</option>
                <option value={4}>4 nhóm song song</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Loại hình</label>
              <select
                value={splitSlotType}
                onChange={(e) => setSplitSlotType(e.target.value as 'TRA_BAI' | 'PHU_DAO')}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
              >
                <option value="TRA_BAI">Trả bài &amp; Kiểm tra soạn bài</option>
                <option value="PHU_DAO">Phụ đạo &amp; Bổ túc nhóm nhỏ</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ưu tiên cơ sở</label>
              <select
                value={splitCampus}
                onChange={(e) => setSplitCampus(e.target.value as CampusCode | 'ANY')}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
              >
                <option value="ANY">Linh hoạt cả CS1 &amp; CS2</option>
                <option value="CS1">Ưu tiên Cơ sở 1 (CS1)</option>
                <option value="CS2">Ưu tiên Cơ sở 2 (CS2)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Nội dung / Chuyên môn</label>
              <input
                type="text"
                value={splitSubject}
                onChange={(e) => setSplitSubject(e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Live Planned Groups Preview */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800">
              Phương án ghép tự động theo lịch rảnh ({parallelPlan.planned.length}/{splitCount} nhóm):
            </div>

            {parallelPlan.shortageNote && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{parallelPlan.shortageNote}</span>
              </div>
            )}

            {parallelPlan.planned.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Chưa tìm thấy cặp (GV rảnh + Phòng trống) cho ca này. Hãy chọn ca khác có màu xanh trên bảng trên hoặc thêm GV Trả bài.
              </div>
            ) : (
              <div className="space-y-2">
                {parallelPlan.planned.map((item) => (
                  <div
                    key={item.groupLabel}
                    className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold text-slate-900">
                      <span>
                        {splitClass} · {item.groupLabel}
                      </span>
                      <span className="font-mono-num text-[11px] text-blue-900">
                        {item.room.name} ({item.campus})
                      </span>
                    </div>
                    <div className="text-slate-800">
                      GV: <strong>{item.teacher.shortName}</strong>{' '}
                      <span className="text-slate-500">
                        ({item.reasons.slice(0, 2).join(' · ') || 'Rảnh ca này'})
                      </span>
                    </div>
                    {item.warnings.length > 0 && (
                      <div className="text-[11px] text-amber-800">{item.warnings[0]}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {batchError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {batchError}
            </div>
          )}
          {batchFeedback && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{batchFeedback}</span>
            </div>
          )}

          <button
            type="button"
            disabled={savingBatch || parallelPlan.planned.length === 0}
            onClick={() => void handleCommitParallelGroups()}
            className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            {savingBatch
              ? 'Đang xếp nhóm nhỏ vào TKB...'
              : `Xếp ${parallelPlan.planned.length} nhóm nhỏ song song vào TKB`}
          </button>
        </div>
      </div>
    </div>
  );
};
