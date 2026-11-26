import type {
  DayOfWeek,
  Room,
  SessionPeriod,
  ShiftCode,
  Student,
  Teacher,
  TeacherGroup,
  TeacherLeave,
  TimetableSlot,
} from '../types.ts';

export const DAYS: { code: DayOfWeek; label: string; short: string }[] = [
  { code: 'T2', label: 'Thứ 2', short: 'T2' },
  { code: 'T3', label: 'Thứ 3', short: 'T3' },
  { code: 'T4', label: 'Thứ 4', short: 'T4' },
  { code: 'T5', label: 'Thứ 5', short: 'T5' },
  { code: 'T6', label: 'Thứ 6', short: 'T6' },
  { code: 'T7', label: 'Thứ 7', short: 'T7' },
];

export interface ShiftRowMeta {
  period: SessionPeriod;
  shift: ShiftCode;
  label: string;
  shortLabel: string;
  time: string;
}

export const SHIFT_ROWS: ShiftRowMeta[] = [
  { period: 'SANG', shift: 'CA_1', label: 'Sáng · Ca 1', shortLabel: 'Sáng C1', time: '07:15–08:45' },
  { period: 'SANG', shift: 'CA_2', label: 'Sáng · Ca 2', shortLabel: 'Sáng C2', time: '09:15–10:45' },
  { period: 'CHIEU', shift: 'CA_1', label: 'Chiều · Ca 1', shortLabel: 'Chiều C1', time: '13:30–15:00' },
  { period: 'CHIEU', shift: 'CA_2', label: 'Chiều · Ca 2', shortLabel: 'Chiều C2', time: '15:15–16:45' },
  { period: 'TOI', shift: 'CA_1', label: 'Tối · Ca 1', shortLabel: 'Tối C1', time: '17:30–19:00' },
  { period: 'TOI', shift: 'CA_2', label: 'Tối · Ca 2', shortLabel: 'Tối C2', time: '19:00–20:30' },
];

export const ALL_SHIFT_KEYS: string[] = DAYS.flatMap((d) =>
  SHIFT_ROWS.map((r) => `${d.code}_${r.period}_${r.shift}`),
);

export function makeShiftKey(day: DayOfWeek, period: SessionPeriod, shift: ShiftCode): string {
  return `${day}_${period}_${shift}`;
}

export function getTimeRangeForShift(period: SessionPeriod, shift: ShiftCode): string {
  return SHIFT_ROWS.find((r) => r.period === period && r.shift === shift)?.time || '07:15–08:45';
}

export function dayLabel(day: DayOfWeek): string {
  return DAYS.find((d) => d.code === day)?.label || day;
}

export function shiftLabel(period: SessionPeriod, shift: ShiftCode): string {
  return SHIFT_ROWS.find((r) => r.period === period && r.shift === shift)?.label || `${period} ${shift}`;
}

export function defaultTeacherAvailability(group: TeacherGroup): string[] {
  if (group === 'TUTOR_REVIEW') {
    return [...ALL_SHIFT_KEYS];
  }
  return [...ALL_SHIFT_KEYS];
}

export function isTeacherAvailable(
  teacher: Teacher | undefined,
  day: DayOfWeek,
  period: SessionPeriod,
  shift: ShiftCode,
): boolean {
  if (!teacher) return false;
  if (teacher.status === 'ON_LEAVE') return false;
  if (!Array.isArray(teacher.availability) || teacher.availability.length === 0) {
    return true;
  }
  return teacher.availability.includes(makeShiftKey(day, period, shift));
}

export function findTeacherLeave(
  teacherId: string,
  day: DayOfWeek,
  period: SessionPeriod,
  shift: ShiftCode,
  leaves: TeacherLeave[],
  includePending = true,
): TeacherLeave | null {
  for (const leave of leaves) {
    if (leave.teacherId !== teacherId) continue;
    if (leave.status === 'REJECTED') continue;
    if (!includePending && leave.status !== 'APPROVED') continue;
    if (leave.day !== day) continue;
    if (leave.period === 'ALL') return leave;
    if (leave.period === period && (!leave.shift || leave.shift === shift)) {
      return leave;
    }
  }
  return null;
}

export function studentBelongsToClass(student: Student, centerClass: string): boolean {
  const target = centerClass.trim().toLowerCase();
  if (!target) return false;
  if (student.centerClass.trim().toLowerCase() === target) return true;
  return (student.enrolledClasses || []).some((c) => c.trim().toLowerCase() === target);
}

export function classesShareStudents(classA: string, classB: string, students: Student[]): Student[] {
  const normA = classA.trim().toLowerCase();
  const normB = classB.trim().toLowerCase();
  if (!normA || !normB) return [];
  if (normA === normB) {
    return students.filter((s) => s.status !== 'PAUSED' && studentBelongsToClass(s, classA));
  }
  return students.filter(
    (s) => s.status !== 'PAUSED' && studentBelongsToClass(s, classA) && studentBelongsToClass(s, classB),
  );
}

export interface ConstraintContext {
  timetable: TimetableSlot[];
  teachers: Teacher[];
  rooms: Room[];
  students: Student[];
  leaves: TeacherLeave[];
  ignoreSlotIds?: string[];
}

export interface SlotCandidate {
  id?: string;
  day: DayOfWeek;
  period: SessionPeriod;
  shift: ShiftCode;
  centerClass: string;
  subject: string;
  teacherId: string;
  room: string;
  roomId?: string;
  slotType: TimetableSlot['slotType'];
  status?: TimetableSlot['status'];
}

export interface SlotConstraintResult {
  valid: boolean;
  hardConflicts: string[];
  leaveWarning: TeacherLeave | null;
  conflictingSlots: TimetableSlot[];
  suggestedFreeRooms: Room[];
  roomOnlyConflict: boolean;
}

export function evaluateSlotConstraints(
  candidate: SlotCandidate,
  context: ConstraintContext,
): SlotConstraintResult {
  const ignored = new Set(context.ignoreSlotIds || []);
  if (candidate.id) ignored.add(candidate.id);

  const hardConflicts: string[] = [];
  const conflictingSlots: TimetableSlot[] = [];

  const sameShiftSlots = context.timetable.filter(
    (s) =>
      !ignored.has(s.id) &&
      s.status !== 'OFF' &&
      s.day === candidate.day &&
      s.period === candidate.period &&
      s.shift === candidate.shift,
  );

  const teacher = context.teachers.find((t) => t.id === candidate.teacherId);
  const teacherGroupLabel = teacher?.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn';

  // Layer 1: Teacher double-booking (strictly max 1 class/shift for BOTH SUBJECT & TUTOR_REVIEW)
  const teacherClash = sameShiftSlots.find((s) => s.teacherId === candidate.teacherId);
  let hasNonRoomConflict = false;
  if (teacherClash) {
    hasNonRoomConflict = true;
    conflictingSlots.push(teacherClash);
    hardConflicts.push(
      `Trùng giờ ${teacherGroupLabel}: ${teacher?.shortName || teacherClash.teacherName} đang phụ trách ${teacherClash.centerClass} (${teacherClash.subject}) cùng ca ${dayLabel(candidate.day)} ${shiftLabel(candidate.period, candidate.shift)}.`,
    );
  }

  // Layer 2: Class / Student double-booking (same centerClass OR overlapping enrolledClasses)
  for (const s of sameShiftSlots) {
    if (s.centerClass.trim().toLowerCase() === candidate.centerClass.trim().toLowerCase()) {
      hasNonRoomConflict = true;
      if (!conflictingSlots.some((c) => c.id === s.id)) conflictingSlots.push(s);
      hardConflicts.push(
        `Trùng lịch lớp học: ${candidate.centerClass} đã có ca ${s.subject} (${s.teacherName} · ${s.room}) trong cùng ca này.`,
      );
    } else {
      const overlap = classesShareStudents(candidate.centerClass, s.centerClass, context.students);
      if (overlap.length > 0) {
        hasNonRoomConflict = true;
        if (!conflictingSlots.some((c) => c.id === s.id)) conflictingSlots.push(s);
        const names = overlap
          .slice(0, 2)
          .map((st) => st.fullName)
          .join(', ');
        hardConflicts.push(
          `Trùng lịch học sinh: ${names}${overlap.length > 2 ? ` (+${overlap.length - 2})` : ''} học cả ${candidate.centerClass} và ${s.centerClass} trong cùng ca.`,
        );
      }
    }
  }

  // Layer 3: Room active check & room double-booking
  const activeRooms = context.rooms.filter((r) => r.active);
  const matchedRoom = context.rooms.find(
    (r) =>
      (candidate.roomId && r.id === candidate.roomId) ||
      r.name.trim().toLowerCase() === candidate.room.trim().toLowerCase() ||
      r.code.trim().toLowerCase() === candidate.room.trim().toLowerCase(),
  );
  if (matchedRoom && !matchedRoom.active) {
    hardConflicts.push(`Phòng ${matchedRoom.name} (${matchedRoom.code}) hiện đang tạm ngưng sử dụng.`);
  }

  const roomClash = sameShiftSlots.find(
    (s) =>
      (candidate.roomId && s.roomId && s.roomId === candidate.roomId) ||
      s.room.trim().toLowerCase() === candidate.room.trim().toLowerCase(),
  );
  if (roomClash) {
    if (!conflictingSlots.some((c) => c.id === roomClash.id)) conflictingSlots.push(roomClash);
    hardConflicts.push(
      `Trùng phòng học: ${candidate.room} đang được lớp ${roomClash.centerClass} (${roomClash.teacherName}) sử dụng.`,
    );
  }

  const busyRooms = new Set(sameShiftSlots.map((s) => s.room.trim().toLowerCase()));
  const suggestedFreeRooms = activeRooms.filter((r) => !busyRooms.has(r.name.trim().toLowerCase()));

  // Layer 4: Teacher availability grid (avoids school teaching hours / unregistered tutor shifts)
  if (!teacher) {
    hasNonRoomConflict = true;
    hardConflicts.push('Không tìm thấy thông tin giáo viên trong hệ thống.');
  } else if (teacher.status === 'ON_LEAVE') {
    hasNonRoomConflict = true;
    hardConflicts.push(`Giáo viên ${teacher.shortName} hiện đang ở trạng thái Tạm nghỉ phép dài ngày.`);
  } else if (!isTeacherAvailable(teacher, candidate.day, candidate.period, candidate.shift)) {
    hasNonRoomConflict = true;
    hardConflicts.push(
      `Ngoài khung giờ rảnh: ${teacher.shortName} chưa đăng ký dạy/trả bài vào ${dayLabel(candidate.day)} · ${shiftLabel(candidate.period, candidate.shift)} (bận lịch trường hoặc ngoài ca đăng ký).`,
    );
  }

  // Layer 5: Teacher emergency leave (APPROVED blocks strictly; PENDING blocks new assignment & warns)
  const leaveWarning = findTeacherLeave(
    candidate.teacherId,
    candidate.day,
    candidate.period,
    candidate.shift,
    context.leaves,
    true,
  );
  if (leaveWarning) {
    hasNonRoomConflict = true;
    const statusText = leaveWarning.status === 'APPROVED' ? 'đã duyệt nghỉ' : 'đang xin nghỉ (chờ duyệt)';
    hardConflicts.push(
      `Giáo viên nghỉ đột xuất: ${teacher?.shortName || leaveWarning.teacherName} ${statusText} ngày ${leaveWarning.dateLabel} (${leaveWarning.reason}).`,
    );
  }

  const roomOnlyConflict =
    Boolean(roomClash) && !hasNonRoomConflict && (!matchedRoom || matchedRoom.active);

  return {
    valid: hardConflicts.length === 0,
    hardConflicts,
    leaveWarning,
    conflictingSlots,
    suggestedFreeRooms,
    roomOnlyConflict,
  };
}

export interface MoveOrSwapEvaluation {
  mode: 'MOVE' | 'MOVE_AUTO_ROOM' | 'SWAP' | 'INVALID';
  valid: boolean;
  reasons: string[];
  autoRoom?: Room;
  sourceResult: SlotConstraintResult;
  targetResult?: SlotConstraintResult;
}

export function evaluateMoveOrSwap(
  sourceSlot: TimetableSlot,
  targetCell: { day: DayOfWeek; period: SessionPeriod; shift: ShiftCode },
  targetSlotToSwap: TimetableSlot | null,
  context: ConstraintContext,
): MoveOrSwapEvaluation {
  if (targetSlotToSwap) {
    if (sourceSlot.id === targetSlotToSwap.id) {
      const ok = evaluateSlotConstraints(sourceSlot, { ...context, ignoreSlotIds: [sourceSlot.id] });
      return { mode: 'MOVE', valid: true, reasons: [], sourceResult: ok };
    }

    const ignoreIds = [sourceSlot.id, targetSlotToSwap.id];
    const nextSource: SlotCandidate = {
      ...sourceSlot,
      day: targetSlotToSwap.day,
      period: targetSlotToSwap.period,
      shift: targetSlotToSwap.shift,
      room: targetSlotToSwap.room,
      roomId: targetSlotToSwap.roomId,
    };
    const nextTarget: SlotCandidate = {
      ...targetSlotToSwap,
      day: sourceSlot.day,
      period: sourceSlot.period,
      shift: sourceSlot.shift,
      room: sourceSlot.room,
      roomId: sourceSlot.roomId,
    };

    const sourceResult = evaluateSlotConstraints(nextSource, { ...context, ignoreSlotIds: ignoreIds });
    const targetResult = evaluateSlotConstraints(nextTarget, { ...context, ignoreSlotIds: ignoreIds });

    const combinedReasons = [
      ...sourceResult.hardConflicts.map((r) => `[${sourceSlot.centerClass}] ${r}`),
      ...targetResult.hardConflicts.map((r) => `[${targetSlotToSwap.centerClass}] ${r}`),
    ];

    return {
      mode: combinedReasons.length === 0 ? 'SWAP' : 'INVALID',
      valid: combinedReasons.length === 0,
      reasons: combinedReasons,
      sourceResult,
      targetResult,
    };
  }

  // Move single block to targetCell
  const nextSource: SlotCandidate = {
    ...sourceSlot,
    day: targetCell.day,
    period: targetCell.period,
    shift: targetCell.shift,
  };
  const sourceResult = evaluateSlotConstraints(nextSource, {
    ...context,
    ignoreSlotIds: [sourceSlot.id],
  });

  if (sourceResult.valid) {
    return {
      mode: 'MOVE',
      valid: true,
      reasons: [],
      sourceResult,
    };
  }

  if (sourceResult.roomOnlyConflict && sourceResult.suggestedFreeRooms.length > 0) {
    const autoRoom = sourceResult.suggestedFreeRooms[0];
    return {
      mode: 'MOVE_AUTO_ROOM',
      valid: true,
      reasons: [
        `Phòng ${sourceSlot.room} đã có lớp ở ca mới. Hệ thống đề xuất tự chuyển sang ${autoRoom.name} (${autoRoom.code}) còn trống.`,
      ],
      autoRoom,
      sourceResult,
    };
  }

  return {
    mode: 'INVALID',
    valid: false,
    reasons: sourceResult.hardConflicts,
    sourceResult,
  };
}

export interface SubstituteCandidate {
  teacher: Teacher;
  matchScore: number;
  reason: string;
}

export function suggestAvailableSubstitutes(
  slot: TimetableSlot,
  context: ConstraintContext,
): SubstituteCandidate[] {
  const isTutorSlot =
    slot.slotType === 'TRA_BAI' || slot.slotType === 'BU_THE_DUC' || slot.subject.toLowerCase().includes('trả bài');
  const normSubject = slot.subject.toLowerCase();

  const busyTeacherIds = new Set(
    context.timetable
      .filter(
        (s) =>
          s.id !== slot.id &&
          s.status !== 'OFF' &&
          s.day === slot.day &&
          s.period === slot.period &&
          s.shift === slot.shift,
      )
      .map((s) => s.teacherId),
  );

  const candidates: SubstituteCandidate[] = [];

  for (const t of context.teachers) {
    if (t.id === slot.teacherId) continue;
    if (t.status !== 'ACTIVE') continue;
    if (busyTeacherIds.has(t.id)) continue;
    if (!isTeacherAvailable(t, slot.day, slot.period, slot.shift)) continue;
    const leave = findTeacherLeave(t.id, slot.day, slot.period, slot.shift, context.leaves, true);
    if (leave) continue;

    let matchScore = 10;
    let reason = 'Rảnh khung giờ này';

    if (isTutorSlot) {
      if (t.teacherGroup === 'TUTOR_REVIEW') {
        matchScore = 100;
        reason = 'GV Trả bài chuyên trách · Rảnh ca này (hỗ trợ mọi khối lớp)';
      } else {
        matchScore = 45;
        reason = 'GV Bộ môn có thể hỗ trợ kèm/trả bài';
      }
    } else {
      const exactSubject = t.subjects.some(
        (sub) => normSubject.includes(sub.toLowerCase()) || sub.toLowerCase().includes(normSubject),
      );
      if (exactSubject && t.teacherGroup === 'SUBJECT') {
        matchScore = 100;
        reason = `Đúng chuyên môn (${t.subjects.join(', ')}) · Trống lịch ca này`;
      } else if (exactSubject) {
        matchScore = 80;
        reason = `Có chuyên môn ${t.subjects.join(', ')} · Trống lịch`;
      } else if (t.teacherGroup === 'TUTOR_REVIEW') {
        matchScore = 50;
        reason = 'GV Trả bài có thể đứng lớp kèm & hướng dẫn làm bài tập';
      } else {
        continue; // Don't suggest unrelated subject teacher for a specialized subject slot
      }
    }

    candidates.push({ teacher: t, matchScore, reason });
  }

  return candidates.sort((a, b) => b.matchScore - a.matchScore || b.teacher.experienceYears - a.teacher.experienceYears);
}
