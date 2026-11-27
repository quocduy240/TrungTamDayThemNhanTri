import type {
  AttendanceRecord,
  DatabaseState,
  DayOfWeek,
  EducationLevel,
  FamilyProfile,
  ScoreRecord,
  SessionPeriod,
  ShiftCode,
  Student,
  Teacher,
  TeacherGroup,
  TimetableSlot,
  TimetableSyncMode,
} from '../types.ts';
import { generateAccessPin, normalizePhoneVN } from './identityPolicy.ts';
import {
  ALL_SHIFT_KEYS,
  evaluateSlotConstraints,
  getTimeRangeForShift,
  studentBelongsToClass,
} from './timetableEngine.ts';
import {
  generateQrToken,
  generateSmartStudentCode,
} from './smartCodeAndQr.ts';

function normalizeVn(input: unknown): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBoolVn(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  const n = normalizeVn(val);
  return ['co', 'yes', 'true', '1', 'x', 'dang ky', 'ok'].includes(n);
}

function nowFormattedLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayIsoLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseGradeFromClass(centerClass: string, explicitGrade?: unknown): number {
  const gNum = Number(explicitGrade);
  if (Number.isFinite(gNum) && gNum >= 3 && gNum <= 12) return Math.round(gNum);
  const m = String(centerClass || '').match(/(\d{1,2})/);
  if (m) {
    const parsed = Number(m[1]);
    if (parsed >= 3 && parsed <= 12) return parsed;
  }
  return 6;
}

function inferLevel(grade: number): EducationLevel {
  if (grade <= 5) return 'CAP_1';
  if (grade <= 9) return 'CAP_2';
  return 'CAP_3';
}

function generateParentLink(grade: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `NT${grade}${suffix}`;
}

export function normalizeDayCode(raw: unknown): DayOfWeek | null {
  const n = normalizeVn(raw).replace(/\s+/g, '');
  if (!n) return null;
  if (n === 't2' || n === 'thu2' || n === '2' || n === 'mon' || n === 'monday') return 'T2';
  if (n === 't3' || n === 'thu3' || n === '3' || n === 'tue' || n === 'tuesday') return 'T3';
  if (n === 't4' || n === 'thu4' || n === '4' || n === 'wed' || n === 'wednesday') return 'T4';
  if (n === 't5' || n === 'thu5' || n === '5' || n === 'thu' || n === 'thursday') return 'T5';
  if (n === 't6' || n === 'thu6' || n === '6' || n === 'fri' || n === 'friday') return 'T6';
  if (n === 't7' || n === 'thu7' || n === '7' || n === 'sat' || n === 'saturday') return 'T7';
  return null;
}

export function normalizePeriodCode(raw: unknown): SessionPeriod {
  const n = normalizeVn(raw);
  if (n.includes('sang') || n.includes('morning') || n === 's') return 'SANG';
  if (n.includes('toi') || n.includes('evening') || n === 't' || n.includes('17') || n.includes('19')) {
    return 'TOI';
  }
  return 'CHIEU';
}

export function normalizeShiftCode(raw: unknown): ShiftCode {
  const n = normalizeVn(raw);
  if (n.includes('2') || n.includes('ca2') || n.includes('ca 2') || n.includes('09') || n.includes('15:30') || n.includes('19:00')) {
    return 'CA_2';
  }
  return 'CA_1';
}

export function normalizeSlotType(raw: unknown, subject?: string): TimetableSlot['slotType'] {
  const n = normalizeVn(`${raw ?? ''} ${subject ?? ''}`);
  if (n.includes('the duc') || n.includes('bu')) return 'BU_THE_DUC';
  if (n.includes('tra bai') || n.includes('soan bai')) return 'TRA_BAI';
  if (n.includes('phu dao') || n.includes('kem')) return 'PHU_DAO';
  return 'MAIN';
}

export function normalizeExamType(raw: unknown): ScoreRecord['examType'] {
  const n = normalizeVn(raw);
  if (n.includes('cuoi') || n.includes('hk') || n.includes('hoc ky')) return 'CUOI_KY';
  if (n.includes('giua') || n.includes('gk')) return 'GIUA_KY';
  if (n.includes('1 tiet') || n.includes('45') || n.includes('1_tiet') || n.includes('mot tiet')) return '1_TIET';
  return '15_PHUT';
}

// ============================================================
// 1. BULK UPSERT TEACHERS
// ============================================================

export function bulkUpsertTeachers(
  db: DatabaseState,
  rows: Record<string, unknown>[],
): {
  added: number;
  updated: number;
  skipped: number;
  teachers: Teacher[];
} {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const defaultRoom = db.rooms[0]?.name || 'Phòng 1';

  for (const row of rows.slice(0, 100)) {
    const name = String(row.name || '').trim();
    if (name.length < 2) {
      skipped += 1;
      continue;
    }

    const shortNameRaw = String(row.shortName || '').trim();
    const parts = name.split(/\s+/);
    const shortName = shortNameRaw || (parts.length >= 2 ? parts.slice(-2).join(' ') : name);

    const subjectsRaw = Array.isArray(row.subjects)
      ? row.subjects.map(String)
      : String(row.subjects || 'Toán')
          .split(/[,;/\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
    const subjects = subjectsRaw.length > 0 ? subjectsRaw : ['Toán'];

    const groupNorm = normalizeVn(row.teacherGroup);
    const teacherGroup: TeacherGroup =
      groupNorm.includes('tutor') ||
      groupNorm.includes('tra bai') ||
      groupNorm.includes('kem') ||
      subjects.some((s) => normalizeVn(s).includes('tra bai'))
        ? 'TUTOR_REVIEW'
        : 'SUBJECT';

    const phone = normalizePhoneVN(String(row.phone || '')) || String(row.phone || '').trim();
    const email = String(row.email || '').trim().toLowerCase() || undefined;
    const degree = String(row.degree || '').trim() || 'Cử nhân Sư phạm';
    const experienceYears = Math.max(0, Math.min(50, Number(row.experienceYears) || 3));
    const roomDefault = String(row.roomDefault || '').trim() || defaultRoom;

    const existing = db.teachers.find(
      (t) =>
        (email && t.email && t.email.toLowerCase() === email) ||
        (phone.length >= 8 && normalizePhoneVN(t.phone) === phone) ||
        normalizeVn(t.name) === normalizeVn(name),
    );

    if (existing) {
      existing.name = name;
      existing.shortName = shortName;
      existing.teacherGroup = teacherGroup;
      existing.subjects = subjects;
      existing.degree = degree;
      existing.experienceYears = experienceYears;
      if (phone) existing.phone = phone;
      if (email) existing.email = email;
      existing.roomDefault = roomDefault;
      updated += 1;
    } else {
      const idSlug = normalizeVn(shortName).replace(/\s+/g, '-').slice(0, 16) || 'gv';
      const newTeacher: Teacher = {
        id: `t-${idSlug}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`,
        name,
        shortName,
        teacherGroup,
        subjects,
        degree,
        experienceYears,
        phone,
        email,
        roomDefault,
        status: 'ACTIVE',
        availability: [...ALL_SHIFT_KEYS],
      };
      db.teachers.push(newTeacher);
      added += 1;
    }
  }

  return { added, updated, skipped, teachers: db.teachers };
}

// ============================================================
// 2. BULK UPSERT STUDENTS + SMART CODE + DYNAMIC QR + AUTO-FAMILY LINK
// ============================================================

export function bulkUpsertStudents(
  db: DatabaseState,
  rows: Record<string, unknown>[],
): {
  added: number;
  updated: number;
  skipped: number;
  familiesLinked: number;
  students: Student[];
} {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let familiesLinked = 0;

  const existingCodes = new Set(db.students.map((s) => s.code.toUpperCase()));
  const defaultRoom = db.rooms[0]?.name || 'Phòng 1';

  for (const row of rows.slice(0, 150)) {
    const fullName = String(row.fullName || '').trim();
    if (fullName.length < 2) {
      skipped += 1;
      continue;
    }

    const rawCenterClass = String(row.centerClass || '').trim() || 'Lớp 6A1';
    const grade = parseGradeFromClass(rawCenterClass, row.grade);
    const level = inferLevel(grade);
    const centerClass = rawCenterClass.toLowerCase().startsWith('lớp')
      ? rawCenterClass
      : `Lớp ${rawCenterClass}`;

    const rawPhone = String(row.parentPhone || '').trim();
    const normPhone = normalizePhoneVN(rawPhone) || rawPhone || '0947376444';
    const parentEmail = String(row.parentEmail || '').trim().toLowerCase();
    const parentEmails = parentEmail && parentEmail.includes('@') ? [parentEmail] : [];
    const requestedCode = String(row.code || '').trim().toUpperCase();

    const subjectsArr = Array.isArray(row.enrolledSubjects)
      ? row.enrolledSubjects.map(String).filter(Boolean)
      : String(row.enrolledSubjects || '')
          .split(/[,;/]/)
          .map((s) => s.trim())
          .filter(Boolean);
    const enrolledSubjects =
      subjectsArr.length > 0
        ? subjectsArr
        : level === 'CAP_1'
          ? ['Toán', 'Tiếng Anh', 'Tiếng Việt']
          : ['Toán', 'Tiếng Anh', 'Ngữ Văn'];

    const existing = db.students.find(
      (s) =>
        (requestedCode && s.code.toUpperCase() === requestedCode) ||
        (normalizeVn(s.fullName) === normalizeVn(fullName) &&
          normPhone.length >= 8 &&
          normalizePhoneVN(s.parentPhone) === normPhone),
    );

    if (existing) {
      existing.fullName = fullName;
      existing.grade = grade;
      existing.level = level;
      existing.centerClass = centerClass;
      if (!existing.enrolledClasses?.includes(centerClass)) {
        existing.enrolledClasses = Array.from(new Set([...(existing.enrolledClasses || []), centerClass]));
      }
      if (row.schoolClass) existing.schoolClass = String(row.schoolClass).trim();
      if (row.school) existing.school = String(row.school).trim();
      if (row.parentName) existing.parentName = String(row.parentName).trim();
      if (rawPhone) {
        existing.parentPhone = normPhone;
        existing.parentZalo = normPhone;
      }
      if (parentEmails.length > 0) {
        existing.parentEmails = Array.from(new Set([...(existing.parentEmails || []), ...parentEmails]));
      }
      if (row.homeroomTeacher) existing.homeroomTeacher = String(row.homeroomTeacher).trim();
      if (row.room) existing.room = String(row.room).trim();
      if (row.hasBoarding !== undefined && String(row.hasBoarding).trim() !== '') {
        existing.hasBoarding = parseBoolVn(row.hasBoarding);
      }
      if (row.hasShuttle !== undefined && String(row.hasShuttle).trim() !== '') {
        existing.hasShuttle = parseBoolVn(row.hasShuttle);
      }
      if (!existing.qrToken) existing.qrToken = generateQrToken();
      if (!existing.accessPin) existing.accessPin = generateAccessPin();
      updated += 1;
    } else {
      const smartCode =
        requestedCode && !existingCodes.has(requestedCode)
          ? requestedCode
          : generateSmartStudentCode(centerClass, existingCodes, { fallbackGrade: grade });
      existingCodes.add(smartCode);

      const newStudent: Student = {
        id: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        code: smartCode,
        qrToken: generateQrToken(),
        parentLinkCode: generateParentLink(grade),
        fullName,
        grade,
        level,
        centerClass,
        enrolledClasses: [centerClass],
        schoolClass: String(row.schoolClass || '').trim() || `${grade}A`,
        school: String(row.school || '').trim() || 'THCS Lý Thường Kiệt',
        homeroomTeacher:
          String(row.homeroomTeacher || '').trim() ||
          (level === 'CAP_1' ? 'Cô Tâm' : level === 'CAP_2' ? 'Cô Nghi' : 'Cô Mẫn'),
        room: String(row.room || '').trim() || defaultRoom,
        parentName: String(row.parentName || '').trim() || `PH em ${fullName.split(' ').slice(-1)[0]}`,
        parentPhone: normPhone,
        parentZalo: normPhone,
        parentEmails,
        accessPin: generateAccessPin(),
        accessStatus: 'ACTIVE',
        packageType: level === 'CAP_1' ? 'TUTORING' : level === 'CAP_2' ? 'ALL_IN_ONE' : 'PER_SUBJECT',
        hasBoarding: parseBoolVn(row.hasBoarding),
        hasShuttle: parseBoolVn(row.hasShuttle),
        annualPrepaid: false,
        enrolledSubjects,
        status: 'ACTIVE',
      };
      db.students.unshift(newStudent);
      added += 1;
    }
  }

  // Auto-detect and link multi-child families sharing parentPhone
  const byPhone = new Map<string, Student[]>();
  for (const st of db.students) {
    const p = normalizePhoneVN(st.parentPhone);
    if (p.length < 8) continue;
    const list = byPhone.get(p) || [];
    list.push(st);
    byPhone.set(p, list);
  }

  for (const [phone, siblings] of byPhone.entries()) {
    if (siblings.length < 2) continue;
    let fam = db.families.find((f) => normalizePhoneVN(f.parentPhone) === phone);
    if (!fam) {
      fam = {
        id: `fam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        parentName: siblings[0].parentName,
        parentPhone: phone,
        parentEmails: Array.from(new Set(siblings.flatMap((s) => s.parentEmails || []))),
        siblingDiscountPercent: 5,
        defaultBillingCycle: 'MONTHLY',
        note: `Tự động ghép ${siblings.length} anh chị em theo SĐT Phụ huynh khi Import.`,
      };
      db.families.unshift(fam);
      familiesLinked += 1;
    }
    siblings.forEach((s) => {
      if (s.familyId !== fam!.id) {
        s.familyId = fam!.id;
      }
    });
  }

  return { added, updated, skipped, familiesLinked, students: db.students };
}

// ============================================================
// 3. BULK IMPORT SCORES
// ============================================================

export function bulkImportScores(
  db: DatabaseState,
  rows: Record<string, unknown>[],
  actorRole: string,
): {
  added: number;
  unmatched: number;
  unmatchedNames: string[];
  scoresAdded: ScoreRecord[];
} {
  const scoresAdded: ScoreRecord[] = [];
  const unmatchedNames: string[] = [];
  const today = todayIsoLocal();

  for (const row of rows.slice(0, 150)) {
    const code = String(row.studentCode || '').trim().toUpperCase();
    const studentName = String(row.studentName || '').trim();
    const centerClass = String(row.centerClass || '').trim();
    const subject = String(row.subject || '').trim() || 'Toán';
    const numericScore = Number(String(row.score ?? '').replace(',', '.'));

    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 10) {
      if (studentName) unmatchedNames.push(`${studentName} (điểm không hợp lệ)`);
      continue;
    }

    let student: Student | undefined;
    if (code) {
      student = db.students.find((s) => s.code.toUpperCase() === code);
    }
    if (!student && studentName) {
      const targetName = normalizeVn(studentName);
      const candidates = db.students.filter(
        (s) =>
          normalizeVn(s.fullName) === targetName ||
          normalizeVn(s.fullName).endsWith(targetName) ||
          targetName.includes(normalizeVn(s.fullName)),
      );
      if (candidates.length === 1) {
        student = candidates[0];
      } else if (candidates.length > 1 && centerClass) {
        const clsNorm = normalizeVn(centerClass);
        student =
          candidates.find((c) => normalizeVn(c.centerClass) === clsNorm) || candidates[0];
      } else if (candidates.length > 0) {
        student = candidates[0];
      }
    }

    if (!student) {
      unmatchedNames.push(studentName || code || 'Không rõ tên HS');
      continue;
    }

    const record: ScoreRecord = {
      id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      studentId: student.id,
      studentName: student.fullName,
      centerClass: student.centerClass,
      subject,
      examType: normalizeExamType(row.examType),
      score: Math.round(numericScore * 10) / 10,
      maxScore: 10,
      date: String(row.date || '').trim() || today,
      school: student.school,
      source: actorRole === 'STUDENT' || actorRole === 'PARENT' ? 'SELF_ENTRY' : 'TEACHER',
      verified: actorRole !== 'STUDENT' && actorRole !== 'PARENT',
      aiSummary: String(row.aiSummary || '').trim() || 'Nhập đồng loạt từ bảng điểm.',
    };

    db.scores.unshift(record);
    scoresAdded.push(record);
  }

  if (scoresAdded.length > 0) {
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      createdAt: nowFormattedLocal(),
      title: `Cập nhật ${scoresAdded.length} đầu điểm kiểm tra mới`,
      body: `Trung Tâm Nhân Trí vừa đồng bộ ${scoresAdded.length} kết quả kiểm tra lên Học bạ Online. Phụ huynh có thể xem chi tiết ngay trên ứng dụng hoặc quét QR học sinh.`,
      channel: 'APP',
      targetRole: 'PARENT',
      read: false,
    });
  }

  return {
    added: scoresAdded.length,
    unmatched: unmatchedNames.length,
    unmatchedNames: unmatchedNames.slice(0, 20),
    scoresAdded,
  };
}

// ============================================================
// 4. SMART TIMETABLE SYNC (UPSERT / APPEND / REPLACE + CANONICAL RECONCILIATION)
// ============================================================

export function matchCanonicalTeacher(
  rawTeacherName: string,
  teachers: Teacher[],
  explicitTeacherId?: string,
): Teacher | undefined {
  if (explicitTeacherId) {
    const byId = teachers.find((t) => t.id === explicitTeacherId);
    if (byId) return byId;
  }
  const norm = normalizeVn(rawTeacherName);
  if (!norm) return undefined;
  return (
    teachers.find((t) => normalizeVn(t.shortName) === norm || normalizeVn(t.name) === norm) ||
    teachers.find(
      (t) =>
        normalizeVn(t.name).includes(norm) ||
        norm.includes(normalizeVn(t.shortName)) ||
        normalizeVn(t.shortName).includes(norm),
    )
  );
}

export function matchCanonicalRoom(
  rawRoom: string,
  rooms: DatabaseState['rooms'],
  explicitRoomId?: string,
): DatabaseState['rooms'][number] | undefined {
  if (explicitRoomId) {
    const byId = rooms.find((r) => r.id === explicitRoomId);
    if (byId) return byId;
  }
  const norm = normalizeVn(rawRoom);
  if (!norm) return undefined;
  const digits = norm.replace(/\D/g, '');
  return (
    rooms.find((r) => normalizeVn(r.name) === norm || normalizeVn(r.code) === norm) ||
    (digits
      ? rooms.find(
          (r) =>
            normalizeVn(r.name).replace(/\D/g, '') === digits ||
            normalizeVn(r.code).replace(/\D/g, '') === digits,
        )
      : undefined)
  );
}

export function smartSyncTimetable(
  db: DatabaseState,
  rows: Record<string, unknown>[],
  mode: TimetableSyncMode = 'UPSERT',
): {
  added: number;
  updated: number;
  skipped: number;
  warnings: string[];
  timetable: TimetableSlot[];
} {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  const working: TimetableSlot[] = mode === 'REPLACE_ALL' ? [] : [...db.timetable];
  const weekLabel = db.timetable[0]?.weekLabel || 'Tuần hiện tại (Chính thức)';

  for (let i = 0; i < Math.min(rows.length, 150); i++) {
    const row = rows[i];
    const day = normalizeDayCode(row.day);
    const subject = String(row.subject || '').trim();
    const rawClass = String(row.centerClass || '').trim();
    if (!day || !subject || !rawClass) {
      skipped += 1;
      warnings.push(`Dòng ${i + 1}: Thiếu Thứ / Lớp / Môn học nên đã bỏ qua.`);
      continue;
    }

    const period = normalizePeriodCode(row.period);
    const shift = normalizeShiftCode(row.shift);
    const timeRange =
      String(row.timeRange || '').trim() || getTimeRangeForShift(period, shift);
    const centerClass = rawClass.toLowerCase().startsWith('lớp') ? rawClass : `Lớp ${rawClass}`;
    const slotType = normalizeSlotType(row.slotType, subject);

    const matchedTeacher =
      matchCanonicalTeacher(
        String(row.teacherName || ''),
        db.teachers,
        typeof row.teacherId === 'string' ? row.teacherId : undefined,
      ) || db.teachers[0];

    const matchedRoom =
      matchCanonicalRoom(
        String(row.room || ''),
        db.rooms,
        typeof row.roomId === 'string' ? row.roomId : undefined,
      ) || db.rooms[0];

    const existingIdx = working.findIndex(
      (sl) =>
        sl.day === day &&
        sl.period === period &&
        sl.shift === shift &&
        normalizeVn(sl.centerClass) === normalizeVn(centerClass),
    );

    if (existingIdx >= 0 && mode === 'APPEND') {
      skipped += 1;
      continue;
    }

    const candidate: TimetableSlot = {
      id:
        existingIdx >= 0
          ? working[existingIdx].id
          : `tt-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      weekLabel,
      period,
      shift,
      timeRange,
      day,
      centerClass,
      subject,
      teacherId: matchedTeacher ? matchedTeacher.id : 't-man',
      teacherName: matchedTeacher ? matchedTeacher.shortName : String(row.teacherName || 'Chưa phân công'),
      roomId: matchedRoom?.id,
      room: matchedRoom ? matchedRoom.name : String(row.room || 'Phòng 1'),
      slotType,
      status: 'SCHEDULED',
      note: String(row.note || '').trim() || undefined,
    };

    const check = evaluateSlotConstraints(candidate, {
      timetable: working,
      teachers: db.teachers,
      rooms: db.rooms,
      students: db.students,
      leaves: db.teacherLeaves,
    });
    if (check.hardConflicts.length > 0) {
      warnings.push(
        `Dòng ${i + 1} (${centerClass} · ${day} ${period} ${shift}): ${check.hardConflicts.join(' | ')}`,
      );
    }

    if (existingIdx >= 0) {
      working[existingIdx] = candidate;
      updated += 1;
    } else {
      working.push(candidate);
      added += 1;
    }
  }

  db.timetable = working;
  return { added, updated, skipped, warnings: warnings.slice(0, 25), timetable: db.timetable };
}

// ============================================================
// 5. DYNAMIC QR LOOKUP, PIN UNLOCK & 1-TAP ATTENDANCE
// ============================================================

export function findStudentByQrTokenOrCode(db: DatabaseState, tokenOrCode: string): Student | undefined {
  const key = String(tokenOrCode || '').trim();
  if (!key) return undefined;
  const upper = key.toUpperCase();
  return db.students.find(
    (s) =>
      (s.qrToken && s.qrToken === key) ||
      s.code.trim().toUpperCase() === upper ||
      (s.parentLinkCode && s.parentLinkCode.trim().toUpperCase() === upper),
  );
}

export function buildUnlockedQrStudentData(db: DatabaseState, student: Student) {
  const slots = db.timetable.filter((sl) => studentBelongsToClass(student, sl.centerClass));
  const scores = db.scores.filter((sc) => sc.studentId === student.id).slice(0, 12);
  const tuition = db.tuition.filter((t) => t.studentId === student.id).slice(0, 6);
  const attendance = db.attendance.filter((a) => a.studentId === student.id).slice(0, 12);
  const notifications = db.notifications
    .filter((n) => n.targetRole === 'ALL' || n.targetRole === 'PARENT' || n.targetRole === 'STUDENT')
    .slice(0, 8);
  const family = student.familyId
    ? db.families.find((f) => f.id === student.familyId)
    : undefined;

  return {
    student,
    family,
    timetable: slots,
    scores,
    tuition,
    attendance,
    notifications,
  };
}

export function recordQrAttendanceCheckIn(
  db: DatabaseState,
  student: Student,
  params: {
    shiftLabel?: string;
    status?: AttendanceRecord['status'];
    note?: string;
    actorName?: string;
  },
): { record: AttendanceRecord; alreadyCheckedInToday: boolean } {
  const today = todayIsoLocal();
  const shiftLabel = String(params.shiftLabel || 'Điểm danh QR nhanh').trim();
  const status: AttendanceRecord['status'] =
    params.status && ['PRESENT', 'LATE', 'EXCUSED', 'MAKEUP_EVENING'].includes(params.status)
      ? params.status
      : 'PRESENT';

  const existing = db.attendance.find(
    (a) =>
      a.studentId === student.id &&
      a.date === today &&
      a.shiftLabel.toLowerCase() === shiftLabel.toLowerCase(),
  );
  if (existing) {
    existing.status = status;
    if (params.note) existing.note = params.note;
    return { record: existing, alreadyCheckedInToday: true };
  }

  const record: AttendanceRecord = {
    id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    date: today,
    studentId: student.id,
    studentName: student.fullName,
    centerClass: student.centerClass,
    shiftLabel,
    status,
    note: params.note || `Quét QR điểm danh bởi ${params.actorName || 'Giáo viên Nhân Trí'}`,
    parentNotified: true,
  };

  db.attendance.unshift(record);
  const statusVn: Record<AttendanceRecord['status'], string> = {
    PRESENT: 'Đã có mặt vào lớp',
    LATE: 'Đến lớp muộn',
    EXCUSED: 'Nghỉ có phép',
    MAKEUP_EVENING: 'Học bù ca tối',
  };
  db.notifications.unshift({
    id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    createdAt: nowFormattedLocal(),
    title: `Điểm danh QR: ${student.fullName} — ${statusVn[status]}`,
    body: `Em ${student.fullName} (${student.code} · ${student.centerClass}) vừa được ghi nhận "${statusVn[status]}" cho ${shiftLabel} lúc ${nowFormattedLocal().slice(11)}.`,
    channel: 'APP',
    targetRole: 'PARENT',
    read: false,
  });

  return { record, alreadyCheckedInToday: false };
}
