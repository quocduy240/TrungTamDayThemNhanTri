import type {
  CampusCode,
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

export const MULTI_SUBJECT_SUPPORT_LABEL = 'Hỗ trợ nhiều môn';

export const ALL_GRADES: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const CAMPUS_OPTIONS: { code: CampusCode; shortLabel: string; label: string }[] = [
  { code: 'CS1', shortLabel: 'CS1', label: 'Cơ sở 1 (35 Lý Thường Kiệt)' },
  { code: 'CS2', shortLabel: 'CS2', label: 'Cơ sở 2 (Nhân Trí 2)' },
];

export const SMALL_GROUP_PRESETS: string[] = [
  'Nhóm 1',
  'Nhóm 2',
  'Nhóm 3',
  'Nhóm 4',
  'Nhóm bổ túc',
  'Nhóm kèm riêng',
];

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

export function campusShortLabel(campus?: CampusCode): string {
  return campus === 'CS2' ? 'CS2' : 'CS1';
}

export function campusFullLabel(campus?: CampusCode): string {
  return campus === 'CS2' ? 'Cơ sở 2' : 'Cơ sở 1';
}

export function resolveCampusFromRoom(room?: Pick<Room, 'campus' | 'code' | 'name'> | null, fallbackName?: string): CampusCode {
  const probe = `${room?.campus || ''} ${room?.code || ''} ${room?.name || ''} ${fallbackName || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    probe.includes('cs2') ||
    probe.includes('co so 2') ||
    probe.includes('nhan tri 2') ||
    /\bp20\d\b/.test(probe)
  ) {
    return 'CS2';
  }
  return 'CS1';
}

export function sanitizeTeachableGrades(input: unknown): number[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,;\s-]+/)
      : [];
  const valid = new Set<number>();
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 12) {
      valid.add(n);
    }
  }
  return Array.from(valid).sort((a, b) => a - b);
}

export function sanitizeCampuses(input: unknown): CampusCode[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,;\s]+/)
      : [];
  const valid = new Set<CampusCode>();
  for (const item of raw) {
    const token = String(item || '').trim().toUpperCase();
    if (token === 'CS1' || token === '1' || token.includes('CƠ SỞ 1') || token.includes('CO SO 1')) {
      valid.add('CS1');
    } else if (token === 'CS2' || token === '2' || token.includes('CƠ SỞ 2') || token.includes('CO SO 2')) {
      valid.add('CS2');
    }
  }
  return valid.size > 0 ? (Array.from(valid).sort() as CampusCode[]) : ['CS1', 'CS2'];
}

export function formatTeachableGrades(grades?: number[]): string {
  if (!Array.isArray(grades) || grades.length === 0 || grades.length >= ALL_GRADES.length) {
    return 'Mọi khối (3–12)';
  }
  const sorted = [...grades].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `Khối ${ranges.join(', ')}`;
}

export function extractGradesFromClassName(className: string): number[] {
  const matches = String(className || '').match(/\b(1[0-2]|[1-9])\b|(?:lớp|lop|khối|khoi)\s*(1[0-2]|[1-9])|(1[0-2]|[3-9])(?=[a-zA-Z])/gi);
  if (!matches) return [];
  const found = new Set<number>();
  for (const m of matches) {
    const numMatch = m.match(/1[0-2]|[1-9]/);
    if (numMatch) {
      const n = Number(numMatch[0]);
      if (n >= 1 && n <= 12) found.add(n);
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

export function teacherSupportsMultiSubject(teacher?: Pick<Teacher, 'teacherGroup' | 'subjects' | 'multiSubjectSupport'> | null): boolean {
  if (!teacher) return false;
  if (teacher.multiSubjectSupport === true) return true;
  return (teacher.subjects || []).some((s) => {
    const norm = s.trim().toLowerCase();
    return norm === MULTI_SUBJECT_SUPPORT_LABEL.toLowerCase() || norm.includes('nhiều môn') || norm.includes('đa môn');
  });
}

export function teacherMatchesGrade(
  teacher: Pick<Teacher, 'teachableGrades' | 'teacherGroup'> | undefined,
  centerClass: string,
): boolean {
  if (!teacher) return false;
  if (!Array.isArray(teacher.teachableGrades) || teacher.teachableGrades.length === 0) {
    return true;
  }
  const classGrades = extractGradesFromClassName(centerClass);
  if (classGrades.length === 0) return true;
  return classGrades.some((g) => teacher.teachableGrades!.includes(g));
}

export function teacherMatchesCampus(
  teacher: Pick<Teacher, 'campuses'> | undefined,
  campus: CampusCode,
): boolean {
  if (!teacher) return false;
  if (!Array.isArray(teacher.campuses) || teacher.campuses.length === 0) {
    return true;
  }
  return teacher.campuses.includes(campus);
}

export function teacherMatchesSubject(
  teacher: Pick<Teacher, 'teacherGroup' | 'subjects' | 'multiSubjectSupport'> | undefined,
  subject: string,
  slotType: TimetableSlot['slotType'] = 'MAIN',
): { exact: boolean; multiSupport: boolean } {
  if (!teacher) return { exact: false, multiSupport: false };
  const multiSupport = teacherSupportsMultiSubject(teacher);
  const normSub = String(subject || '').trim().toLowerCase();
  if (!normSub) return { exact: false, multiSupport };

  const exact = (teacher.subjects || []).some((sub) => {
    const s = sub.trim().toLowerCase();
    if (!s || s === MULTI_SUBJECT_SUPPORT_LABEL.toLowerCase()) return false;
    return normSub.includes(s) || s.includes(normSub);
  });

  if (slotType !== 'MAIN' && (multiSupport || teacher.teacherGroup === 'TUTOR_REVIEW')) {
    return { exact: exact || multiSupport, multiSupport };
  }
  return { exact, multiSupport };
}

export function normalizeGroupLabel(label?: string): string {
  return String(label || '').trim().replace(/\s+/g, ' ');
}

export function isSmallGroupSlotType(slotType: TimetableSlot['slotType']): boolean {
  return slotType === 'TRA_BAI' || slotType === 'PHU_DAO' || slotType === 'BU_THE_DUC';
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

export function findCrossCampusAdjacentSlot(
  teacherId: string,
  day: DayOfWeek,
  period: SessionPeriod,
  shift: ShiftCode,
  targetCampus: CampusCode,
  context: Pick<ConstraintContext, 'timetable' | 'rooms' | 'ignoreSlotIds'>,
): TimetableSlot | null {
  const ignored = new Set(context.ignoreSlotIds || []);
  const siblingShift: ShiftCode = shift === 'CA_1' ? 'CA_2' : 'CA_1';
  const adjacent = context.timetable.find(
    (s) =>
      !ignored.has(s.id) &&
      s.status !== 'OFF' &&
      s.teacherId === teacherId &&
      s.day === day &&
      s.period === period &&
      s.shift === siblingShift,
  );
  if (!adjacent) return null;
  const adjRoom = context.rooms.find(
    (r) => (adjacent.roomId && r.id === adjacent.roomId) || r.name.trim().toLowerCase() === adjacent.room.trim().toLowerCase(),
  );
  const adjCampus = adjacent.campus || resolveCampusFromRoom(adjRoom, adjacent.room);
  return adjCampus !== targetCampus ? adjacent : null;
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
  groupLabel?: string;
  studentIds?: string[];
  subject: string;
  teacherId: string;
  room: string;
  roomId?: string;
  campus?: CampusCode;
  slotType: TimetableSlot['slotType'];
  status?: TimetableSlot['status'];
}

export interface SlotConstraintResult {
  valid: boolean;
  hardConflicts: string[];
  warnings: string[];
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
  const warnings: string[] = [];
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
  const candGroup = normalizeGroupLabel(candidate.groupLabel);
  const candGroupNorm = candGroup.toLowerCase();
  const candIsSmallGroup = isSmallGroupSlotType(candidate.slotType);

  // Layer 1: Teacher double-booking (strictly max 1 class/group per shift for BOTH SUBJECT & TUTOR_REVIEW)
  const teacherClash = sameShiftSlots.find((s) => s.teacherId === candidate.teacherId);
  let hasNonRoomConflict = false;
  if (teacherClash) {
    hasNonRoomConflict = true;
    conflictingSlots.push(teacherClash);
    const clashGroupText = teacherClash.groupLabel ? ` · ${teacherClash.groupLabel}` : '';
    hardConflicts.push(
      `Trùng giờ ${teacherGroupLabel}: ${teacher?.shortName || teacherClash.teacherName} đang phụ trách ${teacherClash.centerClass}${clashGroupText} (${teacherClash.subject}) cùng ca ${dayLabel(candidate.day)} ${shiftLabel(candidate.period, candidate.shift)}.`,
    );
  }

  // Layer 2: Class / Small-Group / Student double-booking
  // Supports splitting 1 class into multiple parallel small groups (Nhóm 1, Nhóm 2, ...) for TRA_BAI / PHU_DAO / BU_THE_DUC
  for (const s of sameShiftSlots) {
    const sameClass = s.centerClass.trim().toLowerCase() === candidate.centerClass.trim().toLowerCase();
    const sGroup = normalizeGroupLabel(s.groupLabel);
    const sGroupNorm = sGroup.toLowerCase();
    const sIsSmallGroup = isSmallGroupSlotType(s.slotType);

    if (sameClass) {
      // Check explicit studentIds overlap first if both define explicit rosters
      if (
        Array.isArray(candidate.studentIds) &&
        candidate.studentIds.length > 0 &&
        Array.isArray(s.studentIds) &&
        s.studentIds.length > 0
      ) {
        const sIdSet = new Set(s.studentIds);
        const sharedIds = candidate.studentIds.filter((id) => sIdSet.has(id));
        if (sharedIds.length > 0) {
          hasNonRoomConflict = true;
          if (!conflictingSlots.some((c) => c.id === s.id)) conflictingSlots.push(s);
          hardConflicts.push(
            `Trùng học sinh giữa hai nhóm của lớp ${candidate.centerClass}: có ${sharedIds.length} học sinh nằm ở cả "${candGroup || 'Nhóm mới'}" và "${sGroup || 'Nhóm hiện có'}".`,
          );
          continue;
        }
      }

      // Case A: Both are parallel small-group tutor/support sessions with distinct groupLabels -> ALLOWED!
      if (candIsSmallGroup && sIsSmallGroup && candGroupNorm && sGroupNorm && candGroupNorm !== sGroupNorm) {
        continue;
      }

      // Case B: One is MAIN whole-class subject lesson, the other is a labeled small-group pull-out -> ALLOWED with advisory warning
      if (
        (candidate.slotType === 'MAIN' && sIsSmallGroup && Boolean(sGroupNorm)) ||
        (s.slotType === 'MAIN' && candIsSmallGroup && Boolean(candGroupNorm))
      ) {
        const grpName = candIsSmallGroup ? candGroup : sGroup;
        warnings.push(
          `Lưu ý tách nhóm song song: Lớp ${candidate.centerClass} vừa có ca Chính khóa (${candidate.slotType === 'MAIN' ? candidate.subject : s.subject}) vừa có nhóm nhỏ "${grpName}" trong cùng ca.`,
        );
        continue;
      }

      // Otherwise: Hard conflict (2 MAIN whole-class slots, or same groupLabel, or unlabeled tutor slot overlapping)
      hasNonRoomConflict = true;
      if (!conflictingSlots.some((c) => c.id === s.id)) conflictingSlots.push(s);
      if (candIsSmallGroup && sIsSmallGroup && (!candGroupNorm || !sGroupNorm)) {
        hardConflicts.push(
          `Trùng lịch lớp ${candidate.centerClass}: Đã có ca ${s.subject} (${s.teacherName} · ${s.room}). Nếu muốn chia nhiều nhóm nhỏ trả bài song song, hãy đặt tên nhóm riêng (VD: Nhóm 1, Nhóm 2) cho từng ca.`,
        );
      } else if (candGroupNorm && candGroupNorm === sGroupNorm) {
        hardConflicts.push(
          `Trùng nhóm học: ${candidate.centerClass} · ${candGroup} đã có ca ${s.subject} (${s.teacherName} · ${s.room}) trong cùng ca này.`,
        );
      } else {
        hardConflicts.push(
          `Trùng lịch lớp học: ${candidate.centerClass} đã có ca ${s.subject} (${s.teacherName} · ${s.room}) trong cùng ca này.`,
        );
      }
    } else {
      // Different centerClass -> check if they share actual enrolled students
      const overlap = classesShareStudents(candidate.centerClass, s.centerClass, context.students);
      if (overlap.length > 0) {
        // If explicit studentIds are set on both and disjoint, allow
        if (
          Array.isArray(candidate.studentIds) &&
          candidate.studentIds.length > 0 &&
          Array.isArray(s.studentIds) &&
          s.studentIds.length > 0
        ) {
          const sIdSet = new Set(s.studentIds);
          if (!candidate.studentIds.some((id) => sIdSet.has(id))) {
            continue;
          }
        }
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

  // Layer 3: Room active check & room double-booking (teachers can teach in ANY active room at CS1 or CS2)
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

  const targetCampus: CampusCode = candidate.campus || resolveCampusFromRoom(matchedRoom, candidate.room);

  const roomClash = sameShiftSlots.find(
    (s) =>
      (candidate.roomId && s.roomId && s.roomId === candidate.roomId) ||
      s.room.trim().toLowerCase() === candidate.room.trim().toLowerCase(),
  );
  if (roomClash) {
    if (!conflictingSlots.some((c) => c.id === roomClash.id)) conflictingSlots.push(roomClash);
    const clashGroup = roomClash.groupLabel ? ` · ${roomClash.groupLabel}` : '';
    hardConflicts.push(
      `Trùng phòng học: ${candidate.room} đang được ${roomClash.centerClass}${clashGroup} (${roomClash.teacherName}) sử dụng.`,
    );
  }

  const busyRooms = new Set(sameShiftSlots.map((s) => s.room.trim().toLowerCase()));
  const suggestedFreeRooms = activeRooms
    .filter((r) => !busyRooms.has(r.name.trim().toLowerCase()))
    .sort((a, b) => {
      const aSameCampus = resolveCampusFromRoom(a) === targetCampus ? 0 : 1;
      const bSameCampus = resolveCampusFromRoom(b) === targetCampus ? 0 : 1;
      return aSameCampus - bSameCampus || a.name.localeCompare(b.name, 'vi');
    });

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

  // Soft Operational Advisories (do NOT hard-block, inform Admin to optimize CS1/CS2 & grades)
  if (teacher) {
    if (!teacherMatchesCampus(teacher, targetCampus)) {
      warnings.push(
        `Lưu ý cơ sở: ${teacher.shortName} đang cấu hình dạy tại ${(teacher.campuses || ['CS1', 'CS2']).join(', ')}, nhưng phòng ${candidate.room} thuộc ${campusFullLabel(targetCampus)} (${targetCampus}).`,
      );
    }

    const crossCampusAdj = findCrossCampusAdjacentSlot(
      teacher.id,
      candidate.day,
      candidate.period,
      candidate.shift,
      targetCampus,
      { timetable: context.timetable, rooms: context.rooms, ignoreSlotIds: Array.from(ignored) },
    );
    if (crossCampusAdj) {
      const adjCampus =
        crossCampusAdj.campus ||
        resolveCampusFromRoom(
          context.rooms.find((r) => r.id === crossCampusAdj.roomId || r.name === crossCampusAdj.room),
          crossCampusAdj.room,
        );
      const tightGapNote =
        candidate.period === 'TOI' ? ' (Ca Tối nối liền 19:00 không có giờ nghỉ chuyển cơ sở)' : ' (cần di chuyển giữa 2 cơ sở)';
      warnings.push(
        `Di chuyển liên cơ sở ${adjCampus} ↔ ${targetCampus}: ${teacher.shortName} có ca ${shiftLabel(crossCampusAdj.period, crossCampusAdj.shift)} tại ${crossCampusAdj.room} (${adjCampus})${tightGapNote}.`,
      );
    }

    if (candidate.slotType === 'MAIN' && !teacherMatchesGrade(teacher, candidate.centerClass)) {
      warnings.push(
        `Lưu ý khối lớp: ${teacher.shortName} đăng ký dạy ${formatTeachableGrades(teacher.teachableGrades)}, khác khối lớp ${candidate.centerClass}.`,
      );
    }
  }

  const roomOnlyConflict =
    Boolean(roomClash) && !hasNonRoomConflict && (!matchedRoom || matchedRoom.active);

  return {
    valid: hardConflicts.length === 0,
    hardConflicts,
    warnings,
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
  warnings?: string[];
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
      return { mode: 'MOVE', valid: true, reasons: [], warnings: ok.warnings, sourceResult: ok };
    }

    const ignoreIds = [sourceSlot.id, targetSlotToSwap.id];
    const nextSource: SlotCandidate = {
      ...sourceSlot,
      day: targetSlotToSwap.day,
      period: targetSlotToSwap.period,
      shift: targetSlotToSwap.shift,
      room: targetSlotToSwap.room,
      roomId: targetSlotToSwap.roomId,
      campus: targetSlotToSwap.campus,
    };
    const nextTarget: SlotCandidate = {
      ...targetSlotToSwap,
      day: sourceSlot.day,
      period: sourceSlot.period,
      shift: sourceSlot.shift,
      room: sourceSlot.room,
      roomId: sourceSlot.roomId,
      campus: sourceSlot.campus,
    };

    const sourceResult = evaluateSlotConstraints(nextSource, { ...context, ignoreSlotIds: ignoreIds });
    const targetResult = evaluateSlotConstraints(nextTarget, { ...context, ignoreSlotIds: ignoreIds });

    const combinedReasons = [
      ...sourceResult.hardConflicts.map((r) => `[${sourceSlot.centerClass}] ${r}`),
      ...targetResult.hardConflicts.map((r) => `[${targetSlotToSwap.centerClass}] ${r}`),
    ];
    const combinedWarnings = [...sourceResult.warnings, ...targetResult.warnings];

    return {
      mode: combinedReasons.length === 0 ? 'SWAP' : 'INVALID',
      valid: combinedReasons.length === 0,
      reasons: combinedReasons,
      warnings: combinedWarnings,
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
      warnings: sourceResult.warnings,
      sourceResult,
    };
  }

  if (sourceResult.roomOnlyConflict && sourceResult.suggestedFreeRooms.length > 0) {
    const teacher = context.teachers.find((t) => t.id === sourceSlot.teacherId);
    const preferredRoom =
      sourceResult.suggestedFreeRooms.find((r) => teacherMatchesCampus(teacher, resolveCampusFromRoom(r))) ||
      sourceResult.suggestedFreeRooms[0];
    return {
      mode: 'MOVE_AUTO_ROOM',
      valid: true,
      reasons: [
        `Phòng ${sourceSlot.room} đã có lớp ở ca mới. Hệ thống đề xuất tự chuyển sang ${preferredRoom.name} (${resolveCampusFromRoom(preferredRoom)}) còn trống.`,
      ],
      warnings: sourceResult.warnings,
      autoRoom: preferredRoom,
      sourceResult,
    };
  }

  return {
    mode: 'INVALID',
    valid: false,
    reasons: sourceResult.hardConflicts,
    warnings: sourceResult.warnings,
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
    isSmallGroupSlotType(slot.slotType) || slot.subject.toLowerCase().includes('trả bài');
  const slotRoom = context.rooms.find(
    (r) => (slot.roomId && r.id === slot.roomId) || r.name.trim().toLowerCase() === slot.room.trim().toLowerCase(),
  );
  const slotCampus = slot.campus || resolveCampusFromRoom(slotRoom, slot.room);

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

    const { exact, multiSupport } = teacherMatchesSubject(t, slot.subject, slot.slotType);
    const gradeOk = teacherMatchesGrade(t, slot.centerClass);
    const campusOk = teacherMatchesCampus(t, slotCampus);
    const crossAdj = findCrossCampusAdjacentSlot(t.id, slot.day, slot.period, slot.shift, slotCampus, {
      timetable: context.timetable,
      rooms: context.rooms,
      ignoreSlotIds: [slot.id],
    });

    let matchScore = 10;
    const reasonParts: string[] = [];

    if (isTutorSlot) {
      if (t.teacherGroup === 'TUTOR_REVIEW' && multiSupport) {
        matchScore = 105;
        reasonParts.push('GV Trả bài · Hỗ trợ nhiều môn');
      } else if (t.teacherGroup === 'TUTOR_REVIEW') {
        matchScore = 95;
        reasonParts.push('GV Trả bài chuyên trách');
      } else if (exact) {
        matchScore = 80;
        reasonParts.push(`GV Bộ môn (${t.subjects.join(', ')})`);
      } else if (multiSupport) {
        matchScore = 75;
        reasonParts.push('Hỗ trợ nhiều môn');
      } else {
        matchScore = 45;
        reasonParts.push('GV Bộ môn hỗ trợ kèm/trả bài');
      }
    } else {
      if (exact && t.teacherGroup === 'SUBJECT') {
        matchScore = 100;
        reasonParts.push(`Đúng môn ${slot.subject}`);
      } else if (exact) {
        matchScore = 82;
        reasonParts.push(`Có chuyên môn ${slot.subject}`);
      } else if (multiSupport || t.teacherGroup === 'TUTOR_REVIEW') {
        matchScore = multiSupport ? 60 : 50;
        reasonParts.push('GV Trả bài / Hỗ trợ nhiều môn (kèm & hướng dẫn bài tập)');
      } else {
        continue;
      }
    }

    if (gradeOk) {
      matchScore += 8;
      if (Array.isArray(t.teachableGrades) && t.teachableGrades.length > 0) {
        reasonParts.push(`Khớp ${formatTeachableGrades(t.teachableGrades)}`);
      }
    } else {
      matchScore -= 12;
    }

    if (campusOk) {
      matchScore += 6;
      reasonParts.push(`Dạy tại ${slotCampus}`);
    } else {
      matchScore -= 10;
      reasonParts.push(`Khác cơ sở (${slotCampus})`);
    }

    if (crossAdj) {
      matchScore -= 15;
      reasonParts.push('Cần di chuyển cơ sở ca liền kề');
    }

    candidates.push({
      teacher: t,
      matchScore,
      reason: reasonParts.join(' · '),
    });
  }

  return candidates.sort((a, b) => b.matchScore - a.matchScore || b.teacher.experienceYears - a.teacher.experienceYears);
}

// ============================================================
// SMART AVAILABILITY-AWARE SCHEDULER & PARALLEL GROUP PLANNER
// ============================================================

export interface RankedTeacherOption {
  teacher: Teacher;
  canAssign: boolean;
  score: number;
  weeklyLoad: number;
  reasons: string[];
  warnings: string[];
  blockReason?: string;
}

export function rankTeachersForSlot(
  params: {
    id?: string;
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    centerClass: string;
    subject: string;
    slotType: TimetableSlot['slotType'];
    room?: string;
    roomId?: string;
    campus?: CampusCode;
  },
  context: ConstraintContext,
): RankedTeacherOption[] {
  const ignored = new Set(context.ignoreSlotIds || []);
  if (params.id) ignored.add(params.id);

  const matchedRoom = context.rooms.find(
    (r) =>
      (params.roomId && r.id === params.roomId) ||
      (params.room && r.name.trim().toLowerCase() === params.room.trim().toLowerCase()),
  );
  const targetCampus: CampusCode = params.campus || resolveCampusFromRoom(matchedRoom, params.room);
  const isTutorSlot = isSmallGroupSlotType(params.slotType);

  const sameShiftByTeacher = new Map<string, TimetableSlot>();
  const weeklyLoadByTeacher = new Map<string, number>();

  for (const s of context.timetable) {
    if (ignored.has(s.id) || s.status === 'OFF') continue;
    weeklyLoadByTeacher.set(s.teacherId, (weeklyLoadByTeacher.get(s.teacherId) || 0) + 1);
    if (s.day === params.day && s.period === params.period && s.shift === params.shift) {
      sameShiftByTeacher.set(s.teacherId, s);
    }
  }

  const ranked: RankedTeacherOption[] = [];

  for (const t of context.teachers) {
    const weeklyLoad = weeklyLoadByTeacher.get(t.id) || 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
    let blockReason: string | undefined;

    if (t.status === 'ON_LEAVE') {
      blockReason = 'Đang nghỉ phép dài ngày';
    } else if (sameShiftByTeacher.has(t.id)) {
      const busy = sameShiftByTeacher.get(t.id)!;
      blockReason = `Bận ca này (${busy.centerClass}${busy.groupLabel ? ` · ${busy.groupLabel}` : ''} · ${busy.room})`;
    } else if (!isTeacherAvailable(t, params.day, params.period, params.shift)) {
      blockReason = 'Ngoài khung giờ rảnh';
    } else {
      const leave = findTeacherLeave(t.id, params.day, params.period, params.shift, context.leaves, true);
      if (leave) {
        blockReason = `Đang có đơn nghỉ (${leave.dateLabel})`;
      }
    }

    const { exact, multiSupport } = teacherMatchesSubject(t, params.subject, params.slotType);
    const gradeOk = teacherMatchesGrade(t, params.centerClass);
    const campusOk = teacherMatchesCampus(t, targetCampus);
    const crossAdj = findCrossCampusAdjacentSlot(t.id, params.day, params.period, params.shift, targetCampus, {
      timetable: context.timetable,
      rooms: context.rooms,
      ignoreSlotIds: Array.from(ignored),
    });

    let score = blockReason ? -200 : 100;

    if (isTutorSlot) {
      if (t.teacherGroup === 'TUTOR_REVIEW' && multiSupport) {
        score += 55;
        reasons.push('GV Trả bài · Hỗ trợ nhiều môn');
      } else if (t.teacherGroup === 'TUTOR_REVIEW') {
        score += 45;
        reasons.push('GV Trả bài chuyên trách');
      } else if (exact) {
        score += 30;
        reasons.push(`GV Bộ môn (${params.subject})`);
      } else if (multiSupport) {
        score += 25;
        reasons.push('Hỗ trợ nhiều môn');
      }
    } else {
      if (t.teacherGroup === 'SUBJECT' && exact) {
        score += 55;
        reasons.push(`Đúng môn ${params.subject}`);
      } else if (exact) {
        score += 35;
        reasons.push(`Có môn ${params.subject}`);
      } else if (multiSupport || t.teacherGroup === 'TUTOR_REVIEW') {
        score += 10;
        reasons.push('Hỗ trợ nhiều môn');
      } else {
        score -= 25;
      }
    }

    if (gradeOk) {
      score += 14;
      if (Array.isArray(t.teachableGrades) && t.teachableGrades.length > 0) {
        reasons.push(formatTeachableGrades(t.teachableGrades));
      }
    } else if (!isTutorSlot) {
      score -= 18;
      warnings.push(`Khác khối (${formatTeachableGrades(t.teachableGrades)})`);
    }

    if (campusOk) {
      score += 12;
      reasons.push(`Dạy tại ${targetCampus}`);
    } else {
      score -= 15;
      warnings.push(`Cấu hình dạy ${(t.campuses || ['CS1', 'CS2']).join(', ')}`);
    }

    if (crossAdj) {
      score -= 20;
      warnings.push(`Ca liền kề ở cơ sở khác (${crossAdj.room})`);
    }

    // Load-balancing preference (fewer assigned shifts/week ranks slightly higher among equal matches)
    score -= Math.min(20, weeklyLoad * 1.5);

    ranked.push({
      teacher: t,
      canAssign: !blockReason,
      score: Math.round(score),
      weeklyLoad,
      reasons,
      warnings,
      blockReason,
    });
  }

  return ranked.sort((a, b) => {
    if (a.canAssign !== b.canAssign) return a.canAssign ? -1 : 1;
    return b.score - a.score || a.weeklyLoad - b.weeklyLoad || a.teacher.shortName.localeCompare(b.teacher.shortName, 'vi');
  });
}

export interface ShiftStaffingSnapshot {
  day: DayOfWeek;
  period: SessionPeriod;
  shift: ShiftCode;
  subjectSlots: TimetableSlot[];
  tutorGroupSlots: TimetableSlot[];
  freeSubjectTeachers: Teacher[];
  freeTutorTeachers: Teacher[];
  freeRoomsCs1: Room[];
  freeRoomsCs2: Room[];
}

export function analyzeShiftStaffing(
  day: DayOfWeek,
  period: SessionPeriod,
  shift: ShiftCode,
  context: ConstraintContext,
): ShiftStaffingSnapshot {
  const activeSlots = context.timetable.filter(
    (s) => s.status !== 'OFF' && s.day === day && s.period === period && s.shift === shift,
  );
  const subjectSlots = activeSlots.filter((s) => s.slotType === 'MAIN');
  const tutorGroupSlots = activeSlots.filter((s) => isSmallGroupSlotType(s.slotType));

  const busyTeacherIds = new Set(activeSlots.map((s) => s.teacherId));
  const busyRooms = new Set(activeSlots.map((s) => s.room.trim().toLowerCase()));

  const freeTeachers = context.teachers.filter((t) => {
    if (t.status !== 'ACTIVE') return false;
    if (busyTeacherIds.has(t.id)) return false;
    if (!isTeacherAvailable(t, day, period, shift)) return false;
    if (findTeacherLeave(t.id, day, period, shift, context.leaves, true)) return false;
    return true;
  });

  const freeSubjectTeachers = freeTeachers.filter((t) => t.teacherGroup === 'SUBJECT');
  const freeTutorTeachers = freeTeachers.filter(
    (t) => t.teacherGroup === 'TUTOR_REVIEW' || teacherSupportsMultiSubject(t),
  );

  const freeActiveRooms = context.rooms.filter(
    (r) => r.active && !busyRooms.has(r.name.trim().toLowerCase()),
  );
  const freeRoomsCs1 = freeActiveRooms.filter((r) => resolveCampusFromRoom(r) === 'CS1');
  const freeRoomsCs2 = freeActiveRooms.filter((r) => resolveCampusFromRoom(r) === 'CS2');

  return {
    day,
    period,
    shift,
    subjectSlots,
    tutorGroupSlots,
    freeSubjectTeachers,
    freeTutorTeachers,
    freeRoomsCs1,
    freeRoomsCs2,
  };
}

export interface PlannedTutorGroupSlot {
  groupLabel: string;
  teacher: Teacher;
  room: Room;
  campus: CampusCode;
  subject: string;
  slotType: 'TRA_BAI' | 'PHU_DAO';
  reasons: string[];
  warnings: string[];
}

export interface ParallelTutorGroupPlan {
  planned: PlannedTutorGroupSlot[];
  shortageNote?: string;
}

export function planParallelTutorGroups(
  params: {
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    centerClass: string;
    subject?: string;
    slotType?: 'TRA_BAI' | 'PHU_DAO';
    groupCount: number;
    preferredCampus?: CampusCode | 'ANY';
    groupPrefix?: string;
  },
  context: ConstraintContext,
): ParallelTutorGroupPlan {
  const count = Math.max(1, Math.min(6, Math.floor(params.groupCount || 2)));
  const slotType = params.slotType === 'PHU_DAO' ? 'PHU_DAO' : 'TRA_BAI';
  const subject = (params.subject || 'Trả bài & Kiểm tra soạn bài (Hỗ trợ nhiều môn)').trim();
  const prefix = (params.groupPrefix || 'Nhóm').trim();
  const preferredCampus = params.preferredCampus || 'ANY';

  const sameShiftSlots = context.timetable.filter(
    (s) => s.status !== 'OFF' && s.day === params.day && s.period === params.period && s.shift === params.shift,
  );
  const existingGroupsForClass = new Set(
    sameShiftSlots
      .filter((s) => s.centerClass.trim().toLowerCase() === params.centerClass.trim().toLowerCase())
      .map((s) => normalizeGroupLabel(s.groupLabel).toLowerCase())
      .filter(Boolean),
  );

  const busyRooms = new Set(sameShiftSlots.map((s) => s.room.trim().toLowerCase()));
  const freeRoomsPool = context.rooms
    .filter((r) => r.active && !busyRooms.has(r.name.trim().toLowerCase()))
    .sort((a, b) => {
      if (preferredCampus !== 'ANY') {
        const aPref = resolveCampusFromRoom(a) === preferredCampus ? 0 : 1;
        const bPref = resolveCampusFromRoom(b) === preferredCampus ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
      }
      return a.name.localeCompare(b.name, 'vi');
    });

  const rankedTeachers = rankTeachersForSlot(
    {
      day: params.day,
      period: params.period,
      shift: params.shift,
      centerClass: params.centerClass,
      subject,
      slotType,
      campus: preferredCampus === 'ANY' ? undefined : preferredCampus,
    },
    context,
  ).filter((opt) => opt.canAssign);

  // Prefer TUTOR_REVIEW or multiSubjectSupport teachers first, then any available teacher
  const prioritizedTeachers = [...rankedTeachers].sort((a, b) => {
    const aTutor = a.teacher.teacherGroup === 'TUTOR_REVIEW' || teacherSupportsMultiSubject(a.teacher) ? 0 : 1;
    const bTutor = b.teacher.teacherGroup === 'TUTOR_REVIEW' || teacherSupportsMultiSubject(b.teacher) ? 0 : 1;
    if (aTutor !== bTutor) return aTutor - bTutor;
    return b.score - a.score;
  });

  const planned: PlannedTutorGroupSlot[] = [];
  const usedTeacherIds = new Set<string>();
  const usedRoomIds = new Set<string>();

  let nextGroupIndex = 1;
  for (let i = 0; i < count; i++) {
    while (existingGroupsForClass.has(`${prefix} ${nextGroupIndex}`.toLowerCase())) {
      nextGroupIndex++;
    }
    const groupLabel = `${prefix} ${nextGroupIndex}`;
    nextGroupIndex++;

    const nextRoom = freeRoomsPool.find((r) => !usedRoomIds.has(r.id));
    if (!nextRoom) break;
    const roomCampus = resolveCampusFromRoom(nextRoom);

    // Pick best remaining teacher (preferring one matching roomCampus)
    const nextTeacherOpt =
      prioritizedTeachers.find(
        (opt) => !usedTeacherIds.has(opt.teacher.id) && teacherMatchesCampus(opt.teacher, roomCampus),
      ) || prioritizedTeachers.find((opt) => !usedTeacherIds.has(opt.teacher.id));

    if (!nextTeacherOpt) break;

    usedTeacherIds.add(nextTeacherOpt.teacher.id);
    usedRoomIds.add(nextRoom.id);

    const warnings = [...nextTeacherOpt.warnings];
    if (preferredCampus !== 'ANY' && roomCampus !== preferredCampus) {
      warnings.push(`Hết phòng trống tại ${preferredCampus}, tự chọn ${nextRoom.name} (${roomCampus}).`);
    }

    planned.push({
      groupLabel,
      teacher: nextTeacherOpt.teacher,
      room: nextRoom,
      campus: roomCampus,
      subject,
      slotType,
      reasons: nextTeacherOpt.reasons,
      warnings,
    });
  }

  let shortageNote: string | undefined;
  if (planned.length < count) {
    const availRooms = freeRoomsPool.length;
    const availTeachers = prioritizedTeachers.length;
    shortageNote = `Yêu cầu ${count} nhóm nhỏ nhưng ca này chỉ còn ${availTeachers} GV rảnh và ${availRooms} phòng trống — hệ thống đã ghép tối đa ${planned.length} nhóm khả dụng.`;
  }

  return { planned, shortageNote };
}
