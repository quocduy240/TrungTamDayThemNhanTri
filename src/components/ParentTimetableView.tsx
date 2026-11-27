import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Clock,
  LayoutGrid,
  List,
  MapPin,
  Printer,
  UserCheck,
} from 'lucide-react';
import type {
  DayOfWeek,
  SessionPeriod,
  ShiftCode,
  SiteConfig,
  Student,
  TimetableSlot,
  TimetableSpecialBlock,
} from '../types';
import { buildTimetableDocumentHtml } from '../lib/brandedDocumentExporter';
import { makeShiftKey } from '../lib/timetableEngine';
import {
  SPECIAL_BLOCK_TYPE_LABELS,
  getSpecialBlockVisualStyle,
  resolveHighestPrioritySpecialBlock,
  sanitizeHexColor,
  specialBlockMatchesClass,
} from '../lib/timetableSpecialBlocks';
import { BrandedPrintModal } from './BrandedPrintModal';

interface ParentTimetableViewProps {
  slots: TimetableSlot[];
  specialBlocks?: TimetableSpecialBlock[];
  classFilter?: string;
  student?: Student;
  title?: string;
  subtitle?: string;
  siteConfig?: Partial<SiteConfig>;
  emptyMessage?: string;
  defaultView?: 'MATRIX' | 'LIST';
}

const DAYS: Array<{ key: DayOfWeek; label: string; short: string }> = [
  { key: 'T2', label: 'Thứ 2', short: 'T2' },
  { key: 'T3', label: 'Thứ 3', short: 'T3' },
  { key: 'T4', label: 'Thứ 4', short: 'T4' },
  { key: 'T5', label: 'Thứ 5', short: 'T5' },
  { key: 'T6', label: 'Thứ 6', short: 'T6' },
  { key: 'T7', label: 'Thứ 7', short: 'T7' },
];

const SHIFT_ROWS: Array<{
  period: SessionPeriod;
  shift: ShiftCode;
  periodLabel: string;
  shiftLabel: string;
  timeRange: string;
}> = [
  { period: 'SANG', shift: 'CA_1', periodLabel: 'Sáng', shiftLabel: 'Ca 1', timeRange: '07:30 - 09:30' },
  { period: 'SANG', shift: 'CA_2', periodLabel: 'Sáng', shiftLabel: 'Ca 2', timeRange: '09:30 - 11:30' },
  { period: 'CHIEU', shift: 'CA_1', periodLabel: 'Chiều', shiftLabel: 'Ca 1', timeRange: '14:00 - 15:30' },
  { period: 'CHIEU', shift: 'CA_2', periodLabel: 'Chiều', shiftLabel: 'Ca 2', timeRange: '15:30 - 17:00' },
  { period: 'TOI', shift: 'CA_1', periodLabel: 'Tối', shiftLabel: 'Ca 1', timeRange: '17:30 - 19:00' },
  { period: 'TOI', shift: 'CA_2', periodLabel: 'Tối', shiftLabel: 'Ca 2', timeRange: '19:00 - 20:30' },
];

function getTodayVnDayOfWeek(): DayOfWeek | null {
  try {
    const vnStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    const dayNum = new Date(vnStr).getDay(); // 0=Sun, 1=Mon...6=Sat
    const map: Record<number, DayOfWeek> = {
      1: 'T2',
      2: 'T3',
      3: 'T4',
      4: 'T5',
      5: 'T6',
      6: 'T7',
    };
    return map[dayNum] || null;
  } catch {
    return null;
  }
}

interface SubjectColorTheme {
  label: string;
  cardBg: string;
  cardBorder: string;
  titleText: string;
  metaText: string;
  dotColor: string;
}

function getSubjectTheme(slot: TimetableSlot): SubjectColorTheme {
  const s = `${slot.subject} ${slot.slotType}`.toLowerCase();
  if (slot.slotType === 'BU_THE_DUC' || s.includes('thể dục') || s.includes('bù')) {
    return {
      label: 'Học bù Thể dục',
      cardBg: 'bg-amber-50/90',
      cardBorder: 'border-dashed border-amber-400',
      titleText: 'text-amber-950',
      metaText: 'text-amber-800',
      dotColor: 'bg-amber-500',
    };
  }
  if (slot.slotType === 'TRA_BAI' || s.includes('trả bài') || s.includes('soạn bài')) {
    return {
      label: 'Trả bài / Soạn bài',
      cardBg: 'bg-amber-50/80',
      cardBorder: 'border-amber-300',
      titleText: 'text-amber-950',
      metaText: 'text-amber-800',
      dotColor: 'bg-amber-500',
    };
  }
  if (s.includes('anh') || s.includes('english') || s.includes('ielts')) {
    return {
      label: 'Tiếng Anh',
      cardBg: 'bg-emerald-50/85',
      cardBorder: 'border-emerald-300',
      titleText: 'text-emerald-950',
      metaText: 'text-emerald-800',
      dotColor: 'bg-emerald-600',
    };
  }
  if (s.includes('lý') || s.includes('hóa') || s.includes('sinh') || s.includes('khtn')) {
    return {
      label: 'Lý / Hóa / KHTN',
      cardBg: 'bg-indigo-50/85',
      cardBorder: 'border-indigo-300',
      titleText: 'text-indigo-950',
      metaText: 'text-indigo-800',
      dotColor: 'bg-indigo-600',
    };
  }
  if (s.includes('văn') || s.includes('tiếng việt') || s.includes('tiểu học')) {
    return {
      label: 'Ngữ Văn / Tiểu học',
      cardBg: 'bg-rose-50/85',
      cardBorder: 'border-rose-300',
      titleText: 'text-rose-950',
      metaText: 'text-rose-800',
      dotColor: 'bg-rose-500',
    };
  }
  return {
    label: 'Toán / Môn chính',
    cardBg: 'bg-blue-50/90',
    cardBorder: 'border-blue-300',
    titleText: 'text-blue-950',
    metaText: 'text-blue-800',
    dotColor: 'bg-blue-700',
  };
}

export const ParentTimetableView: React.FC<ParentTimetableViewProps> = ({
  slots,
  specialBlocks = [],
  classFilter,
  student,
  title = 'Thời khóa biểu học tập cá nhân',
  subtitle,
  siteConfig,
  emptyMessage = 'Chưa có lịch học được phân công cho hồ sơ này.',
  defaultView = 'MATRIX',
}) => {
  const [viewMode, setViewMode] = useState<'MATRIX' | 'LIST'>(defaultView);
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const effectiveClass = student?.centerClass || classFilter;

  const activeSpecialBlocks = useMemo(
    () =>
      specialBlocks.filter(
        (b) =>
          b.active &&
          Array.isArray(b.shiftKeys) &&
          b.shiftKeys.length > 0 &&
          specialBlockMatchesClass(b, effectiveClass),
      ),
    [specialBlocks, effectiveClass],
  );

  const todayKey = useMemo(() => getTodayVnDayOfWeek(), []);

  const printHtml = useMemo(() => {
    if (!printOpen) return '';
    return buildTimetableDocumentHtml({
      title: student ? `Thời khóa biểu — ${student.fullName} (${student.centerClass})` : title,
      student,
      slots,
      siteConfig,
    });
  }, [printOpen, student, title, slots, siteConfig]);

  // Only show shift rows that either have at least 1 slot OR are standard core rows if total slots > 0
  const visibleRows = useMemo(() => {
    const activePeriodShifts = new Set(slots.map((s) => `${s.period}:${s.shift}`));
    if (activePeriodShifts.size === 0) return SHIFT_ROWS;
    // Always display all 6 rows for a complete visual school timetable matrix
    return SHIFT_ROWS;
  }, [slots]);

  const sortedListSlots = useMemo(() => {
    const dayOrder: Record<DayOfWeek, number> = { T2: 1, T3: 2, T4: 3, T5: 4, T6: 5, T7: 6 };
    const periodOrder: Record<SessionPeriod, number> = { SANG: 1, CHIEU: 2, TOI: 3 };
    return [...slots].sort((a, b) => {
      if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
      if (periodOrder[a.period] !== periodOrder[b.period])
        return periodOrder[a.period] - periodOrder[b.period];
      return a.shift.localeCompare(b.shift);
    });
  }, [slots]);

  const todayCount = useMemo(
    () => (todayKey ? slots.filter((s) => s.day === todayKey).length : 0),
    [slots, todayKey],
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header + 2-Mode Toggle + Branded Print */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">{title}</h3>
            {todayKey && todayCount > 0 && (
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-mono-num">
                Hôm nay ({todayKey}): {todayCount} ca
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200"
            role="tablist"
            aria-label="Chế độ xem thời khóa biểu"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'MATRIX'}
              onClick={() => setViewMode('MATRIX')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'MATRIX'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Bảng đồ họa</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'LIST'}
              onClick={() => setViewMode('LIST')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'LIST'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            disabled={slots.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>In / Tải TKB có Logo</span>
          </button>
        </div>
      </div>

      {/* PE Makeup Notice if student has one */}
      {student?.eveningMakeupSlot && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Lịch bù trùng Thể dục:</strong> {student.eveningMakeupSlot}
          </span>
          {student.peConflictDay && (
            <span className="font-mono-num text-amber-800">
              Trùng gốc: {student.peConflictDay} ({student.peConflictShift || 'Chiều'})
            </span>
          )}
        </div>
      )}

      {slots.length === 0 && activeSpecialBlocks.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
          {emptyMessage}
        </div>
      ) : viewMode === 'MATRIX' ? (
        <div className="space-y-3">
          {/* Subject Color Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-800">Chú giải môn học:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-700" /> Toán / Môn chính
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Tiếng Anh
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600" /> Lý · Hóa · KHTN
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Ngữ Văn · Tiểu học
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Trả bài / Học bù
            </span>
          </div>

          {/* Visual Timetable Matrix Grid */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-xs font-bold text-slate-700 w-32 border-r border-slate-200">
                    Buổi · Ca học
                  </th>
                  {DAYS.map((day) => {
                    const isToday = day.key === todayKey;
                    return (
                      <th
                        key={day.key}
                        className={`py-2.5 px-2.5 text-xs font-bold text-center border-r last:border-r-0 border-slate-200 ${
                          isToday
                            ? 'bg-amber-50 text-amber-950 border-b-2 border-b-amber-500'
                            : 'text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{day.label}</span>
                          {isToday && (
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                              Hôm nay
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleRows.map((row) => {
                  const periodAccent =
                    row.period === 'SANG'
                      ? 'text-blue-900'
                      : row.period === 'CHIEU'
                        ? 'text-amber-800'
                        : 'text-indigo-900';

                  return (
                    <tr key={`${row.period}-${row.shift}`} className="align-top">
                      <td className="p-2.5 bg-slate-50/80 border-r border-slate-200">
                        <p className={`text-xs font-extrabold ${periodAccent}`}>
                          {row.periodLabel} · {row.shiftLabel}
                        </p>
                        <p className="text-[11px] font-mono-num text-slate-500 mt-0.5">
                          {row.timeRange}
                        </p>
                      </td>
                      {DAYS.map((day) => {
                        const isToday = day.key === todayKey;
                        const cellKey = makeShiftKey(day.key, row.period, row.shift);
                        const overrideBlock = resolveHighestPrioritySpecialBlock(
                          activeSpecialBlocks,
                          cellKey,
                          effectiveClass,
                        );
                        const cellSlots = slots.filter(
                          (sl) =>
                            sl.day === day.key &&
                            sl.period === row.period &&
                            sl.shift === row.shift,
                        );
                        return (
                          <td
                            key={day.key}
                            className={`p-1.5 border-r last:border-r-0 border-slate-200 min-h-[78px] ${
                              isToday ? 'bg-amber-50/30' : 'bg-white'
                            }`}
                          >
                            {overrideBlock ? (
                              (() => {
                                const vis = getSpecialBlockVisualStyle(overrideBlock);
                                const accent = sanitizeHexColor(
                                  overrideBlock.accentColor,
                                  vis.containerStyle.borderColor,
                                );
                                return (
                                  <div
                                    style={vis.containerStyle}
                                    className="w-full p-2.5 rounded-lg min-h-[68px] flex flex-col justify-center gap-1"
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        style={{ color: accent }}
                                        className="text-[10px] font-bold uppercase tracking-wider"
                                      >
                                        {SPECIAL_BLOCK_TYPE_LABELS[overrideBlock.blockType]}
                                      </span>
                                      <span
                                        style={{ color: accent }}
                                        className="text-[9px] font-bold opacity-80"
                                      >
                                        Ưu tiên
                                      </span>
                                    </div>
                                    <p className={`${vis.titleSizeClass} ${vis.weightClass} leading-snug`}>
                                      {overrideBlock.title}
                                    </p>
                                    {overrideBlock.subtitle && (
                                      <p className={`${vis.subtitleSizeClass} opacity-85 leading-snug`}>
                                        {overrideBlock.subtitle}
                                      </p>
                                    )}
                                  </div>
                                );
                              })()
                            ) : cellSlots.length === 0 ? (
                              <div className="h-14 flex items-center justify-center text-slate-200 text-xs select-none">
                                —
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {cellSlots.map((sl) => {
                                  const theme = getSubjectTheme(sl);
                                  const isSelected = selectedSlot?.id === sl.id;
                                  const isAbsent = sl.status === 'TEACHER_ABSENT';
                                  return (
                                    <button
                                      key={sl.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedSlot(isSelected ? null : sl)
                                      }
                                      className={`w-full text-left p-2 rounded-lg border transition-all cursor-pointer ${
                                        isAbsent
                                          ? 'bg-red-50 border-red-300'
                                          : `${theme.cardBg} ${theme.cardBorder}`
                                      } ${isSelected ? 'ring-2 ring-blue-900 shadow-sm' : 'hover:shadow-xs'}`}
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <p
                                          className={`text-xs font-extrabold leading-snug ${
                                            isAbsent ? 'text-red-900' : theme.titleText
                                          }`}
                                        >
                                          {sl.subject}
                                          {sl.groupLabel ? ` (${sl.groupLabel})` : ''}
                                        </p>
                                        <span className="font-mono-num text-[10px] font-bold text-slate-700 bg-white/85 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                          {sl.room}
                                          {sl.campus ? ` · ${sl.campus}` : ''}
                                        </span>
                                      </div>
                                      <p
                                        className={`text-[11px] mt-1 truncate ${
                                          isAbsent ? 'text-red-800' : theme.metaText
                                        }`}
                                      >
                                        {sl.teacherName}
                                      </p>
                                      <div className="flex items-center justify-between gap-1 mt-1 text-[10px] text-slate-500">
                                        <span className="truncate font-medium">
                                          {sl.centerClass}
                                        </span>
                                        {isAbsent && (
                                          <span className="inline-flex items-center gap-0.5 text-red-700 font-bold shrink-0">
                                            <AlertTriangle className="w-3 h-3" />
                                            GV nghỉ
                                          </span>
                                        )}
                                        {sl.status === 'SUBSTITUTED' && (
                                          <span className="text-amber-800 font-bold shrink-0">
                                            Dạy thay
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick Selected Slot Inspector */}
          {selectedSlot && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <p className="font-bold text-blue-950 text-sm">
                  {selectedSlot.subject} · {selectedSlot.centerClass}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-800" />
                    <strong>{selectedSlot.day}</strong> ({selectedSlot.period})
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono-num">
                    <Clock className="w-3.5 h-3.5 text-blue-800" />
                    {selectedSlot.timeRange}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-800" />
                    Phòng <strong className="font-mono-num">{selectedSlot.room}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-800" />
                    {selectedSlot.teacherName}
                  </span>
                </div>
                {selectedSlot.note && (
                  <p className="text-slate-600">Ghi chú: {selectedSlot.note}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="px-2.5 py-1 text-xs font-semibold text-blue-900 bg-white border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
              >
                Đóng chi tiết
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Classic Chronological List View (Preserved as 2nd mode) */
        <div className="space-y-3">
          {activeSpecialBlocks.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeSpecialBlocks.map((b) => {
                const vis = getSpecialBlockVisualStyle(b);
                const accent = sanitizeHexColor(b.accentColor, vis.containerStyle.borderColor);
                return (
                  <div key={b.id} style={vis.containerStyle} className="p-3.5 rounded-xl space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span style={{ color: accent }} className="font-bold uppercase tracking-wider">
                        {SPECIAL_BLOCK_TYPE_LABELS[b.blockType]} · Ưu tiên cao nhất
                      </span>
                      <span className="font-mono-num text-[11px] opacity-85">
                        {b.shiftKeys.length} ca áp dụng
                      </span>
                    </div>
                    <p className={`${vis.titleSizeClass} ${vis.weightClass}`}>{b.title}</p>
                    {b.subtitle && <p className={`${vis.subtitleSizeClass} opacity-90`}>{b.subtitle}</p>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedListSlots
              .filter(
                (sl) =>
                  !resolveHighestPrioritySpecialBlock(
                    activeSpecialBlocks,
                    makeShiftKey(sl.day, sl.period, sl.shift),
                    sl.centerClass || effectiveClass,
                  ),
              )
              .map((sl) => {
                const theme = getSubjectTheme(sl);
                const isToday = sl.day === todayKey;
                return (
                  <div
                    key={sl.id}
                    className={`p-3.5 rounded-xl border space-y-1.5 ${
                      sl.status === 'TEACHER_ABSENT'
                        ? 'bg-red-50 border-red-300'
                        : isToday
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-extrabold text-blue-950 font-mono-num">
                        {sl.day} · {sl.timeRange}
                      </span>
                      <span className="font-mono-num font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                        P.{sl.room}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dotColor}`} />
                      <p className="text-sm font-bold text-slate-950">{sl.subject}</p>
                    </div>
                    <p className="text-xs text-slate-600">
                      {sl.centerClass} · {sl.teacherName}
                    </p>
                    {sl.status === 'TEACHER_ABSENT' && (
                      <p className="text-[11px] font-semibold text-red-700">
                        Giáo viên đang báo nghỉ — Trung tâm đang bố trí dạy thay
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <BrandedPrintModal
        open={printOpen}
        title={student ? `Thời khóa biểu — ${student.fullName}` : title}
        fileName={`TKB_NhanTri_${student?.code || 'ca_nhan'}.html`}
        htmlContent={printHtml}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
};
