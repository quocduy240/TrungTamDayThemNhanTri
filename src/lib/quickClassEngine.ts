import type {
  DayOfWeek,
  Student,
  TimetableSlot,
  UserRole,
} from '../types.ts';
import { dayLabel, studentBelongsToClass } from './timetableEngine.ts';

export interface VietnamClock {
  isoDate: string; // YYYY-MM-DD
  dateStr: string; // Alias of isoDate
  day: DayOfWeek | 'CN'; // Alias of dayCode
  dayCode: DayOfWeek | 'CN';
  dayLabel: string;
  hour: number;
  minute: number;
  second: number;
  minutesOfDay: number;
  totalMinutes: number;
  totalSeconds: number;
  timeLabel: string; // HH:MM
}

export function getVietnamClock(now: Date = new Date()): VietnamClock {
  // Shift UTC timestamp by +7 hours (Asia/Ho_Chi_Minh has no DST)
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const vn = new Date(vnMs);
  const year = vn.getUTCFullYear();
  const month = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vn.getUTCDate()).padStart(2, '0');
  const hour = vn.getUTCHours();
  const minute = vn.getUTCMinutes();
  const second = vn.getUTCSeconds();
  const jsDay = vn.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  const dayMap: Record<number, DayOfWeek | 'CN'> = {
    0: 'CN',
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
  };
  const dayCode = dayMap[jsDay] || 'T2';
  const isoDate = `${year}-${month}-${day}`;
  const minutesOfDay = hour * 60 + minute;
  return {
    isoDate,
    dateStr: isoDate,
    day: dayCode,
    dayCode,
    dayLabel: dayCode === 'CN' ? 'Chủ nhật' : dayLabel(dayCode),
    hour,
    minute,
    second,
    minutesOfDay,
    totalMinutes: minutesOfDay,
    totalSeconds: hour * 3600 + minute * 60 + second,
    timeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

export function parseTimeRangeMinutes(timeRange: string): { startMin: number; endMin: number } {
  const matches = (timeRange || '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})/g);
  if (matches && matches.length >= 2) {
    const parseOne = (tok: string) => {
      const m = tok.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
      if (!m) return 0;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const startMin = parseOne(matches[0]);
    const endMin = parseOne(matches[1]);
    if (endMin > startMin) return { startMin, endMin };
  }
  return { startMin: 7 * 60 + 15, endMin: 8 * 60 + 45 };
}

export function formatCountdownSeconds(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface QuickClassActor {
  role: UserRole;
  teacherId?: string;
  students?: Student[];
}

export interface QuickClassSnapshot {
  clock: VietnamClock;
  todayDateStr: string;
  currentSlot: TimetableSlot | null;
  nextSlot: TimetableSlot | null;
  secondsUntilNext: number | null;
  secondsRemainingInCurrent: number | null;
  minutesUntilNext: number | null;
  minutesRemaining: number | null;
  todaySlots: TimetableSlot[];
}

const DAY_INDEX: Record<DayOfWeek | 'CN', number> = {
  T2: 1,
  T3: 2,
  T4: 3,
  T5: 4,
  T6: 5,
  T7: 6,
  CN: 7,
};

export function filterSlotsForActor(
  slots: TimetableSlot[],
  actor: QuickClassActor,
): TimetableSlot[] {
  const active = slots.filter((s) => s.status !== 'OFF');
  if (actor.role === 'STUDENT' && actor.students && actor.students.length > 0) {
    return active.filter((s) =>
      actor.students!.some((st) => studentBelongsToClass(st, s.centerClass)),
    );
  }
  if (actor.role === 'TEACHER' && actor.teacherId) {
    return active.filter((s) => s.teacherId === actor.teacherId);
  }
  return active;
}

export function computeQuickClassSnapshot(
  timetable: TimetableSlot[],
  actor: QuickClassActor,
  now: Date = new Date(),
): QuickClassSnapshot {
  const clock = getVietnamClock(now);
  const actorSlots = filterSlotsForActor(timetable, actor);

  const todaySlots =
    clock.dayCode === 'CN'
      ? []
      : actorSlots
          .filter((s) => s.day === clock.dayCode)
          .sort(
            (a, b) =>
              parseTimeRangeMinutes(a.timeRange).startMin -
              parseTimeRangeMinutes(b.timeRange).startMin,
          );

  let currentSlot: TimetableSlot | null = null;
  let minutesRemaining: number | null = null;
  let secondsRemainingInCurrent: number | null = null;
  let nextSlot: TimetableSlot | null = null;
  let secondsUntilNext: number | null = null;

  for (const slot of todaySlots) {
    const { startMin, endMin } = parseTimeRangeMinutes(slot.timeRange);
    if (!currentSlot && clock.totalMinutes >= startMin && clock.totalMinutes < endMin) {
      currentSlot = slot;
      minutesRemaining = Math.max(1, endMin - clock.totalMinutes);
      secondsRemainingInCurrent = Math.max(0, endMin * 60 - clock.totalSeconds);
      continue;
    }
    const startSec = startMin * 60;
    if (!nextSlot && startSec > clock.totalSeconds) {
      nextSlot = slot;
      secondsUntilNext = startSec - clock.totalSeconds;
    }
  }

  // Fallback: earliest upcoming slot in next days of the week if no more slots today
  if (!currentSlot && !nextSlot && actorSlots.length > 0) {
    const curDayIdx = DAY_INDEX[clock.dayCode];
    const ranked = [...actorSlots].sort((a, b) => {
      const da = (DAY_INDEX[a.day] - curDayIdx + 7) % 7 || 7;
      const db = (DAY_INDEX[b.day] - curDayIdx + 7) % 7 || 7;
      if (da !== db) return da - db;
      return (
        parseTimeRangeMinutes(a.timeRange).startMin -
        parseTimeRangeMinutes(b.timeRange).startMin
      );
    });
    nextSlot = ranked[0] || null;
  }

  return {
    clock,
    todayDateStr: clock.isoDate,
    currentSlot,
    nextSlot,
    secondsUntilNext,
    secondsRemainingInCurrent,
    minutesUntilNext: secondsUntilNext !== null ? Math.ceil(secondsUntilNext / 60) : null,
    minutesRemaining,
    todaySlots,
  };
}

export function findSlotsStartingWithinWindow(
  slots: TimetableSlot[],
  leadMinutes: number,
  now: Date = new Date(),
): { slot: TimetableSlot; minutesUntil: number }[] {
  const clock = getVietnamClock(now);
  if (clock.dayCode === 'CN') return [];
  const results: { slot: TimetableSlot; minutesUntil: number }[] = [];
  for (const slot of slots) {
    if (slot.status === 'OFF' || slot.day !== clock.dayCode) continue;
    const { startMin } = parseTimeRangeMinutes(slot.timeRange);
    const diff = startMin - clock.totalMinutes;
    if (diff >= 0 && diff <= leadMinutes) {
      results.push({ slot, minutesUntil: diff });
    }
  }
  return results;
}
