import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { loadDb, saveDb, CLOUDFLARE_D1_SCHEMA_SQL } from './server/db.ts';
import { FANPAGE_POSTS_FEED, OFFICIAL_FANPAGE_URL, REAL_CENTER_GALLERY } from './server/seedData.ts';
import {
  ADMIN_EMAIL,
  DEMO_ACCOUNTS,
  extractAuth,
  hashPassword,
  requireAuth,
  signSessionToken,
  SUPER_ADMIN_EMAIL,
  verifyFirebaseIdToken,
  verifyPassword,
  type AuthedRequest,
} from './server/auth.ts';
import {
  analyzeTestPaperImage,
  askNhanTriAdvisor,
  extractStudentsFromRosterImage,
} from './server/gemini.ts';
import type {
  AttendanceRecord,
  DayOfWeek,
  FeedbackTicket,
  ScoreRecord,
  SessionPeriod,
  ShiftCode,
  Student,
  TimetableSlot,
  TuitionRecord,
  UserRole,
} from './src/types.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(extractAuth);

const ALLOWED_SAMPLE_DIR = path.resolve(process.cwd(), 'public/assets/aistudio');
const ALLOWED_SAMPLE_FILES = new Set([
  'IMG_9542_4ffccfa4.JPG',
  'IMG_9538_cadb03a1.JPG',
  'IMG_9534_fd106b28.JPG',
]);

function readSafeSampleImage(filename: string): { base64: string; mimeType: string } | null {
  if (!ALLOWED_SAMPLE_FILES.has(filename)) return null;
  const resolved = path.resolve(ALLOWED_SAMPLE_DIR, filename);
  if (!resolved.startsWith(ALLOWED_SAMPLE_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const buf = fs.readFileSync(resolved);
  return { base64: buf.toString('base64'), mimeType: 'image/jpeg' };
}

function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// PUBLIC & BOOTSTRAP ROUTES
// ============================================================

app.get('/api/v1/bootstrap', (_req, res) => {
  const db = loadDb();
  const hasEnvAdminPasscode = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim());
  res.json({
    center: {
      name: 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ',
      shortName: 'Nhân Trí',
      slogan: 'Trao tri thức – Gửi yêu thương',
      philosophy: 'Soạn bài, trả bài, làm bài tập theo thời khóa biểu trong lớp · Tận tâm, tận lực, tận tình',
      campuses: [
        'Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, Tỉnh An Giang',
        'Cơ sở 2: Trung Tâm Nhân Trí 2 — TP. Long Xuyên, Tỉnh An Giang',
      ],
      hotlineZalo: '0947 376 444 (Cô Tâm)',
      email: 'trungtamnhantri.lxag@gmail.com',
      facebookUrl: OFFICIAL_FANPAGE_URL,
      domain: 'daythemnhantri.com',
    },
    courses: db.courses,
    teachers: db.teachers,
    timetable: db.timetable,
    exams: db.exams,
    gallery: REAL_CENTER_GALLERY,
    fanpagePosts: FANPAGE_POSTS_FEED,
    examsSummary: db.exams.map(({ id, title, level, grade, subject, durationMinutes, curriculumStandard, difficulty, attemptsCount, questions }) => ({
      id,
      title,
      level,
      grade,
      subject,
      durationMinutes,
      curriculumStandard,
      difficulty,
      attemptsCount,
      questionCount: questions.length,
    })),
    stats: {
      activeStudents: db.students.filter((s) => s.status === 'ACTIVE').length,
      teachersCount: db.teachers.length,
      examsCount: db.exams.length,
      campusesCount: 2,
    },
    security: {
      adminPasscodeConfigured: hasEnvAdminPasscode || Boolean(db.adminPasscodeHash),
      usingEnvPasscode: hasEnvAdminPasscode,
    },
  });
});

// ============================================================
// AUTHENTICATION & RBAC ROUTES
// ============================================================

app.post('/api/v1/auth/role-session', (req, res) => {
  const role = String(req.body?.role || '').toUpperCase() as UserRole;
  const account = DEMO_ACCOUNTS[role];
  if (!account) {
    res.status(400).json({ error: 'Vai trò không hợp lệ.' });
    return;
  }

  // If ADMIN and a passcode is configured via env or claimed hash, verify if provided (optional override check)
  if (role === 'ADMIN') {
    const db = loadDb();
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const submittedPasscode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (envPasscode) {
      if (submittedPasscode !== envPasscode) {
        res.status(401).json({
          error: 'Vui lòng nhập mật khẩu Quản trị viên (ADMIN_PASSCODE).',
          requiresPasscode: true,
        });
        return;
      }
    } else if (db.adminPasscodeHash) {
      if (!submittedPasscode || !verifyPassword(submittedPasscode, db.adminPasscodeHash)) {
        res.status(401).json({
          error: 'Mật khẩu Quản trị viên không chính xác.',
          requiresPasscode: true,
        });
        return;
      }
    }
  }

  const token = signSessionToken(account);
  res.json({ token, user: account });
});

app.post('/api/v1/auth/admin-claim', (req, res) => {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  if (envPasscode) {
    res.status(409).json({ error: 'Mật khẩu quản trị đã được cấu hình qua biến môi trường ADMIN_PASSCODE.' });
    return;
  }
  const db = loadDb();
  if (db.adminPasscodeHash) {
    res.status(409).json({ error: 'Mật khẩu quản trị đã được thiết lập trước đó.' });
    return;
  }
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (passcode.length < 6) {
    res.status(400).json({ error: 'Mật khẩu quản trị cần tối thiểu 6 ký tự.' });
    return;
  }
  db.adminPasscodeHash = hashPassword(passcode);
  saveDb(db);
  const token = signSessionToken(DEMO_ACCOUNTS.ADMIN);
  res.json({ token, user: DEMO_ACCOUNTS.ADMIN, claimed: true });
});

app.post('/api/v1/auth/firebase-bridge', async (req, res) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
  const verified = await verifyFirebaseIdToken(idToken);
  if (!verified || !verified.emailVerified) {
    res.status(401).json({ error: 'Token Gmail Firebase không hợp lệ hoặc chưa xác minh email.' });
    return;
  }

  let role: UserRole = 'STUDENT';
  if (verified.email === SUPER_ADMIN_EMAIL) {
    role = 'SUPER_ADMIN';
  } else if (verified.email === ADMIN_EMAIL) {
    role = 'ADMIN';
  } else if (req.body?.requestedRole === 'PARENT' || req.body?.requestedRole === 'STUDENT') {
    role = req.body.requestedRole;
  }

  const user = {
    id: verified.uid,
    name: verified.displayName,
    email: verified.email,
    photoURL: verified.photoURL,
    role,
    linkedStudentId: role === 'STUDENT' || role === 'PARENT' ? 'st-01' : undefined,
    authProvider: 'GOOGLE_FIREBASE' as const,
  };

  const token = signSessionToken(user);
  res.json({ token, user });
});

app.get('/api/v1/auth/me', requireAuth(), (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// ============================================================
// WORKSPACE SNAPSHOT (ROLE-SCOPED)
// ============================================================

app.get('/api/v1/workspace', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const isAdminUser = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const isStaff = isAdminUser || user.role === 'TEACHER';

  const students = isStaff
    ? db.students
    : db.students.filter((s) => s.id === user.linkedStudentId);

  const scores = isStaff
    ? db.scores
    : db.scores.filter((sc) => sc.studentId === user.linkedStudentId);

  const attendance = isStaff
    ? db.attendance
    : db.attendance.filter((a) => a.studentId === user.linkedStudentId);

  const tuition = isStaff
    ? db.tuition
    : db.tuition.filter((t) => t.studentId === user.linkedStudentId);

  const tickets = isStaff
    ? db.tickets
    : db.tickets.filter((t) => t.authorRole === user.role || t.authorName.includes('Hòa'));

  const notifications = db.notifications.filter(
    (n) => n.targetRole === 'ALL' || n.targetRole === user.role || isAdminUser,
  );

  res.json({
    user,
    teachers: db.teachers,
    students,
    timetable: db.timetable,
    scores,
    attendance,
    tuition,
    expenses: isAdminUser ? db.expenses : [],
    exams: db.exams,
    tickets,
    notifications,
  });
});

// ============================================================
// COURSE ENROLLMENT (PUBLIC -> CREATES STUDENT + TUITION)
// ============================================================

app.post('/api/v1/enrollments', (req, res) => {
  const {
    studentName,
    parentName,
    parentPhone,
    grade,
    school,
    courseId,
    selectedSubjects,
    hasBoarding,
    hasShuttle,
    annualPrepaid,
    peConflictDay,
  } = req.body || {};

  if (!studentName || typeof studentName !== 'string' || studentName.trim().length < 2) {
    res.status(400).json({ error: 'Vui lòng nhập họ tên học sinh.' });
    return;
  }
  if (!parentPhone || typeof parentPhone !== 'string' || parentPhone.trim().length < 8) {
    res.status(400).json({ error: 'Vui lòng nhập số điện thoại Zalo phụ huynh hợp lệ.' });
    return;
  }

  const db = loadDb();
  const course = db.courses.find((c) => c.id === courseId) || db.courses[1];
  const numericGrade = Math.min(12, Math.max(3, Number(grade) || 6));
  const subjectsArray: string[] = Array.isArray(selectedSubjects) && selectedSubjects.length > 0
    ? selectedSubjects.map(String)
    : course.subjects.slice(0, 3);

  const baseMonthly =
    course.billingModel === 'PER_SUBJECT'
      ? course.monthlyPrice * subjectsArray.length
      : course.monthlyPrice;
  const boardingAmt = hasBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
  const shuttleAmt = hasShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
  const subtotal = baseMonthly + boardingAmt + shuttleAmt;
  const discount = annualPrepaid ? Math.round(subtotal * (course.annualDiscountPercent / 100)) : 0;
  const totalAmount = subtotal - discount;

  const newStudentId = `st-${Date.now()}`;
  const centerClass =
    numericGrade <= 5
      ? 'Lớp 4,5'
      : numericGrade <= 9
        ? `Lớp ${numericGrade}A1`
        : `Lớp ${numericGrade}`;

  const validPeDays: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const peDay = validPeDays.includes(peConflictDay) ? (peConflictDay as DayOfWeek) : undefined;

  const newStudent: Student = {
    id: newStudentId,
    code: `NT-${numericGrade}-${String(db.students.length + 1).padStart(2, '0')}`,
    fullName: studentName.trim(),
    grade: numericGrade,
    level: course.level,
    centerClass,
    schoolClass: `${numericGrade}A`,
    school: typeof school === 'string' && school.trim() ? school.trim() : 'THCS Lý Thường Kiệt',
    homeroomTeacher: numericGrade <= 5 ? 'Cô Tâm' : numericGrade <= 9 ? 'Cô Nghi' : 'Cô Mẫn',
    room: numericGrade <= 5 ? 'Phòng 1' : 'Phòng 2',
    parentName: typeof parentName === 'string' && parentName.trim() ? parentName.trim() : 'Phụ huynh mới',
    parentPhone: parentPhone.trim(),
    parentZalo: parentPhone.trim(),
    packageType: course.billingModel,
    hasBoarding: Boolean(hasBoarding),
    hasShuttle: Boolean(hasShuttle),
    annualPrepaid: Boolean(annualPrepaid),
    peConflictDay: peDay,
    eveningMakeupSlot: peDay ? `Tối ${peDay} · Ca 1 (17h30–19h00) · Trả bài & Soạn bài` : undefined,
    enrolledSubjects: subjectsArray,
    status: 'ACTIVE',
  };

  const newTuition: TuitionRecord = {
    id: `tui-${Date.now()}`,
    studentId: newStudentId,
    studentName: newStudent.fullName,
    centerClass: newStudent.centerClass,
    parentPhone: newStudent.parentPhone,
    monthLabel: annualPrepaid ? 'Đăng ký mới (Ưu đãi nguyên năm -10%)' : 'Tháng 12/2026 (Đăng ký mới)',
    baseAmount: baseMonthly,
    boardingAmount: boardingAmt,
    shuttleAmount: shuttleAmt,
    discountAmount: discount,
    totalAmount,
    paidAmount: 0,
    dueDate: '2026-12-05',
    status: 'DUE_SOON',
    remindersSent: 0,
  };

  const newTicket: FeedbackTicket = {
    id: `tk-${Date.now()}`,
    createdAt: nowFormatted(),
    authorName: `${newStudent.parentName} (PH em ${newStudent.fullName})`,
    authorRole: 'GUEST',
    phone: newStudent.parentPhone,
    category: 'CONSULTATION',
    subject: `Đăng ký khóa ${course.title}`,
    message: `Đăng ký lớp ${centerClass}, môn: ${subjectsArray.join(', ')}. Bán trú: ${hasBoarding ? 'Có' : 'Không'}, Đưa rước: ${hasShuttle ? 'Có' : 'Không'}, Đóng nguyên năm: ${annualPrepaid ? 'Có (-10%)' : 'Không'}.`,
    status: 'OPEN',
  };

  db.students.unshift(newStudent);
  db.tuition.unshift(newTuition);
  db.tickets.unshift(newTicket);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: 'Đăng ký khóa học mới',
    body: `Em ${newStudent.fullName} (${centerClass}) vừa đăng ký ${course.title}. Tổng học phí dự kiến: ${totalAmount.toLocaleString('vi-VN')}đ/tháng.`,
    channel: 'APP',
    targetRole: 'ADMIN',
    read: false,
  });

  saveDb(db);
  res.status(201).json({ student: newStudent, tuition: newTuition });
});

// ============================================================
// STUDENTS & SMART BULK IMPORT (EXCEL / IMAGE OCR)
// ============================================================

app.post('/api/v1/students', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const b = req.body || {};
  if (!b.fullName || typeof b.fullName !== 'string') {
    res.status(400).json({ error: 'Thiếu họ tên học sinh.' });
    return;
  }
  const db = loadDb();
  const grade = Math.min(12, Math.max(3, Number(b.grade) || 7));
  const student: Student = {
    id: `st-${Date.now()}`,
    code: `NT-${grade}-${String(db.students.length + 1).padStart(2, '0')}`,
    fullName: b.fullName.trim(),
    grade,
    level: grade <= 5 ? 'CAP_1' : grade <= 9 ? 'CAP_2' : 'CAP_3',
    centerClass: String(b.centerClass || `Lớp ${grade}A1`),
    schoolClass: String(b.schoolClass || `${grade}A1`),
    school: String(b.school || 'THCS Lý Thường Kiệt'),
    homeroomTeacher: String(b.homeroomTeacher || 'Cô Nghi'),
    room: String(b.room || 'Phòng 2'),
    parentName: String(b.parentName || 'Phụ huynh'),
    parentPhone: String(b.parentPhone || '0918 *** 000'),
    parentZalo: String(b.parentPhone || '0918 *** 000'),
    packageType: grade <= 5 ? 'TUTORING' : grade <= 9 ? 'ALL_IN_ONE' : 'PER_SUBJECT',
    hasBoarding: Boolean(b.hasBoarding),
    hasShuttle: Boolean(b.hasShuttle),
    annualPrepaid: Boolean(b.annualPrepaid),
    peConflictDay: b.peConflictDay || undefined,
    eveningMakeupSlot: b.peConflictDay
      ? `Tối ${b.peConflictDay} · Ca 1 (17h30–19h00) · Trả bài & Soạn bài`
      : undefined,
    enrolledSubjects: Array.isArray(b.enrolledSubjects) && b.enrolledSubjects.length
      ? b.enrolledSubjects.map(String)
      : ['Toán', 'Ngữ Văn', 'Tiếng Anh'],
    status: 'ACTIVE',
  };
  db.students.unshift(student);
  saveDb(db);
  res.status(201).json({ student });
});

app.post('/api/v1/students/import', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const rows = Array.isArray(req.body?.students) ? req.body.students : [];
  if (rows.length === 0) {
    res.status(400).json({ error: 'Không có dữ liệu học sinh để nhập.' });
    return;
  }
  const db = loadDb();
  const imported: Student[] = [];
  for (const row of rows.slice(0, 100)) {
    const fullName = String(row.fullName || '').trim();
    if (!fullName) continue;
    const centerClass = String(row.centerClass || 'Lớp 7A1').trim();
    const gradeMatch = centerClass.match(/\d+/);
    const grade = gradeMatch ? Math.min(12, Math.max(3, Number(gradeMatch[0]))) : 7;
    const st: Student = {
      id: `st-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: `NT-${grade}-${String(db.students.length + imported.length + 1).padStart(2, '0')}`,
      fullName,
      grade,
      level: grade <= 5 ? 'CAP_1' : grade <= 9 ? 'CAP_2' : 'CAP_3',
      centerClass,
      schoolClass: String(row.schoolClass || `${grade}A`).trim(),
      school: String(row.school || 'THCS Lý Thường Kiệt').trim(),
      homeroomTeacher: String(row.homeroomTeacher || 'Cô Nghi').trim(),
      room: String(row.room || 'Phòng 2').trim(),
      parentName: String(row.parentName || `PH em ${fullName.split(' ').slice(-1)[0]}`).trim(),
      parentPhone: String(row.parentPhone || '0918 *** 000').trim(),
      parentZalo: String(row.parentPhone || '0918 *** 000').trim(),
      packageType: grade <= 5 ? 'TUTORING' : grade <= 9 ? 'ALL_IN_ONE' : 'PER_SUBJECT',
      hasBoarding: false,
      hasShuttle: false,
      annualPrepaid: false,
      enrolledSubjects: ['Toán', 'Ngữ Văn', 'Tiếng Anh', 'Trả bài'],
      status: 'ACTIVE',
    };
    imported.push(st);
  }
  db.students = [...imported, ...db.students];
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: 'Nhập danh sách học sinh tự động',
    body: `Đã cập nhật thành công ${imported.length} học sinh mới vào cơ sở dữ liệu trung tâm.`,
    channel: 'APP',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ importedCount: imported.length, students: imported });
});

// ============================================================
// DYNAMIC TIMETABLE, CONFLICT ENGINE, SUBSTITUTE & .ICS EXPORT
// ============================================================

const SHIFT_TIMES: Record<`${SessionPeriod}_${ShiftCode}`, string> = {
  SANG_CA_1: '07:15–08:45',
  SANG_CA_2: '09:15–10:45',
  CHIEU_CA_1: '13:30–15:00',
  CHIEU_CA_2: '15:15–16:45',
  TOI_CA_1: '17:30–19:00',
  TOI_CA_2: '19:00–20:30',
};

function findConflicts(
  slots: TimetableSlot[],
  candidate: {
    id?: string;
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    teacherId: string;
    room: string;
    centerClass: string;
  },
): string[] {
  const conflicts: string[] = [];
  for (const s of slots) {
    if (candidate.id && s.id === candidate.id) continue;
    if (s.day === candidate.day && s.period === candidate.period && s.shift === candidate.shift && s.status !== 'OFF') {
      if (s.teacherId === candidate.teacherId) {
        conflicts.push(`Trùng lịch giáo viên: ${s.teacherName} đang dạy ${s.subject} cho ${s.centerClass} tại ${s.room}.`);
      }
      if (s.room === candidate.room) {
        conflicts.push(`Trùng phòng học: ${s.room} đang sử dụng bởi ${s.centerClass} (${s.subject} – ${s.teacherName}).`);
      }
      if (s.centerClass === candidate.centerClass) {
        conflicts.push(`Trùng lịch lớp: ${s.centerClass} đã có tiết ${s.subject} trong ca này.`);
      }
    }
  }
  return conflicts;
}

app.post('/api/v1/timetable/check-conflict', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const { day, period, shift, teacherId, room, centerClass, id } = req.body || {};
  const conflicts = findConflicts(db.timetable, { id, day, period, shift, teacherId, room, centerClass });
  res.json({ hasConflict: conflicts.length > 0, conflicts });
});

app.post('/api/v1/timetable', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const { day, period, shift, centerClass, subject, teacherId, room, slotType, note } = req.body || {};
  const teacher = db.teachers.find((t) => t.id === teacherId);
  if (!teacher || !day || !period || !shift || !centerClass || !subject || !room) {
    res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin tiết học.' });
    return;
  }
  const conflicts = findConflicts(db.timetable, { day, period, shift, teacherId, room, centerClass });
  if (conflicts.length > 0) {
    res.status(409).json({ error: conflicts[0], conflicts });
    return;
  }

  const key = `${period}_${shift}` as keyof typeof SHIFT_TIMES;
  const newSlot: TimetableSlot = {
    id: `tt-${Date.now()}`,
    weekLabel: 'Tuần 13 (23/11 – 28/11)',
    period,
    shift,
    timeRange: SHIFT_TIMES[key] || '17:30–19:00',
    day,
    centerClass: String(centerClass),
    subject: String(subject),
    teacherId: teacher.id,
    teacherName: teacher.shortName,
    room: String(room),
    slotType: slotType || 'MAIN',
    status: 'SCHEDULED',
    note: note ? String(note) : undefined,
  };

  db.timetable.push(newSlot);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Cập nhật Thời khóa biểu ${newSlot.centerClass}`,
    body: `Đã thêm tiết ${newSlot.subject} (${newSlot.teacherName}) vào ${newSlot.day} · ${newSlot.timeRange} tại ${newSlot.room}.`,
    channel: 'APP',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ slot: newSlot });
});

app.post('/api/v1/timetable/:id/suggest-substitute', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const slot = db.timetable.find((s) => s.id === req.params.id);
  if (!slot) {
    res.status(404).json({ error: 'Không tìm thấy tiết học.' });
    return;
  }

  // Find teachers busy at the exact same day/period/shift
  const busyTeacherIds = new Set(
    db.timetable
      .filter((s) => s.day === slot.day && s.period === slot.period && s.shift === slot.shift && s.id !== slot.id)
      .map((s) => s.teacherId),
  );

  const normalizedSubj = slot.subject.toLowerCase();
  const availableTeachers = db.teachers
    .filter((t) => t.id !== slot.teacherId && !busyTeacherIds.has(t.id) && t.status === 'ACTIVE')
    .map((t) => {
      const exactMatch = t.subjects.some((sub) =>
        normalizedSubj.includes(sub.toLowerCase()) || sub.toLowerCase().includes(normalizedSubj.split(' ')[0]),
      );
      return {
        teacherId: t.id,
        teacherName: t.shortName,
        fullName: t.name,
        subjects: t.subjects,
        matchScore: exactMatch ? 'Đúng chuyên môn · Đang trống ca' : 'Có thể hỗ trợ Trả bài / Kèm',
        isExactSubject: exactMatch,
      };
    })
    .sort((a, b) => Number(b.isExactSubject) - Number(a.isExactSubject));

  // Suggest alternative evening slots if no teacher wants to sub
  const eveningMakeupSuggestion = {
    day: slot.day,
    period: 'TOI' as SessionPeriod,
    shift: 'CA_1' as ShiftCode,
    timeRange: '17:30–19:00',
    room: 'Phòng 2',
    reason: 'Chuyển sang ca Tối 17h30–19h00 ghép Trả bài / Học bù không xung đột lịch chính khóa.',
  };

  res.json({
    slot,
    substituteTeachers: availableTeachers.slice(0, 5),
    eveningMakeupSuggestion,
  });
});

app.patch('/api/v1/timetable/:id/substitute', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const slot = db.timetable.find((s) => s.id === req.params.id);
  if (!slot) {
    res.status(404).json({ error: 'Không tìm thấy tiết học.' });
    return;
  }
  const { newTeacherId, action } = req.body || {};

  if (action === 'MOVE_TO_EVENING_MAKEUP') {
    slot.period = 'TOI';
    slot.shift = 'CA_1';
    slot.timeRange = '17:30–19:00';
    slot.slotType = 'BU_THE_DUC';
    slot.status = 'SUBSTITUTED';
    slot.note = 'Đã chuyển lịch học bù ca Tối (17h30–19h00) và thông báo phụ huynh.';
  } else {
    const subTeacher = db.teachers.find((t) => t.id === newTeacherId);
    if (!subTeacher) {
      res.status(400).json({ error: 'Giáo viên dạy thay không hợp lệ.' });
      return;
    }
    const oldName = slot.teacherName;
    slot.teacherId = subTeacher.id;
    slot.teacherName = subTeacher.shortName;
    slot.status = 'SUBSTITUTED';
    slot.note = `Dạy thay ${oldName} nghỉ đột xuất`;
  }

  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Thay đổi lịch học ${slot.centerClass} (${slot.day})`,
    body: `Tiết ${slot.subject} (${slot.timeRange}) đã cập nhật: ${slot.teacherName} — ${slot.note}. Đã đồng bộ thông báo Zalo & Email.`,
    channel: 'ZALO',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.json({ slot });
});

app.delete('/api/v1/timetable/:id', requireAuth(['ADMIN']), (req, res) => {
  const db = loadDb();
  db.timetable = db.timetable.filter((s) => s.id !== req.params.id);
  saveDb(db);
  res.json({ deleted: true });
});

app.get('/api/v1/timetable/student/:studentId/ics', requireAuth(), (req, res) => {
  const db = loadDb();
  const student = db.students.find((s) => s.id === req.params.studentId);
  if (!student) {
    res.status(404).json({ error: 'Không tìm thấy học sinh.' });
    return;
  }
  const slots = db.timetable.filter((s) => s.centerClass === student.centerClass);
  const dayToOffset: Record<DayOfWeek, number> = { T2: 23, T3: 24, T4: 25, T5: 26, T6: 27, T7: 28 };

  const events = slots.map((slot) => {
    const [startRaw, endRaw] = slot.timeRange.split('–');
    const startHm = (startRaw || '07:15').replace(':', '') + '00';
    const endHm = (endRaw || '08:45').replace(':', '') + '00';
    const dayNum = String(dayToOffset[slot.day] || 23).padStart(2, '0');
    return [
      'BEGIN:VEVENT',
      `UID:${slot.id}-${student.id}@nhantri.edu.vn`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:202611${dayNum}T${startHm}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:202611${dayNum}T${endHm}`,
      `SUMMARY:[Nhân Trí] ${slot.subject} (${slot.teacherName})`,
      `LOCATION:Trung Tâm Nhân Trí - ${slot.room}`,
      `DESCRIPTION:Lớp ${slot.centerClass} · Học sinh ${student.fullName}${slot.note ? ' · ' + slot.note : ''}`,
      'RRULE:FREQ=WEEKLY;COUNT=12',
      'END:VEVENT',
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trung Tam Nhan Tri//TKB Ca Nhan Hoa//VI',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:TKB Nhân Trí - ' + student.fullName,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="TKB-NhanTri-${student.code}.ics"`);
  res.send(ics);
});

// ============================================================
// SCORES (HỌC BẠ ONLINE) & ATTENDANCE
// ============================================================

app.post('/api/v1/scores', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const b = req.body || {};
  const student = db.students.find((s) => s.id === b.studentId);
  if (!student) {
    res.status(400).json({ error: 'Vui lòng chọn học sinh hợp lệ.' });
    return;
  }
  const numericScore = Number(b.score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 10) {
    res.status(400).json({ error: 'Điểm số phải nằm trong thang điểm 0 – 10.' });
    return;
  }

  const record: ScoreRecord = {
    id: `sc-${Date.now()}`,
    studentId: student.id,
    studentName: student.fullName,
    centerClass: student.centerClass,
    subject: String(b.subject || 'Toán').trim(),
    examType: b.examType || '15_PHUT',
    score: Math.round(numericScore * 100) / 100,
    maxScore: 10,
    date: String(b.date || todayIso()),
    school: String(b.school || student.school),
    source: b.source || (req.user?.role === 'STUDENT' ? 'SELF_ENTRY' : 'TEACHER'),
    verified: req.user?.role === 'ADMIN' || req.user?.role === 'TEACHER',
    aiSummary: b.aiSummary ? String(b.aiSummary) : undefined,
    strengths: Array.isArray(b.strengths) ? b.strengths.map(String) : undefined,
    improvements: Array.isArray(b.improvements) ? b.improvements.map(String) : undefined,
    imageUrl: b.imageUrl ? String(b.imageUrl) : undefined,
  };

  db.scores.unshift(record);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Học bạ mới: ${student.fullName} — ${record.subject}`,
    body: `Điểm ${record.score}/10 (${record.examType}). Đã cập nhật Học bạ Online Nhân Trí và sẵn sàng gửi báo cáo Zalo phụ huynh.`,
    channel: 'ZALO',
    targetRole: 'PARENT',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ score: record });
});

app.post('/api/v1/attendance', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const { studentId, shiftLabel, status, note } = req.body || {};
  const student = db.students.find((s) => s.id === studentId);
  if (!student) {
    res.status(400).json({ error: 'Không tìm thấy học sinh.' });
    return;
  }

  const rec: AttendanceRecord = {
    id: `att-${Date.now()}`,
    date: todayIso(),
    studentId: student.id,
    studentName: student.fullName,
    centerClass: student.centerClass,
    shiftLabel: String(shiftLabel || 'Chiều Ca 2 (15:15–16:45)'),
    status: status || 'PRESENT',
    note: note ? String(note) : undefined,
    parentNotified: true,
  };

  db.attendance.unshift(rec);
  const statusLabel: Record<string, string> = {
    PRESENT: 'Có mặt đúng giờ',
    LATE: 'Đến trễ',
    EXCUSED: 'Nghỉ có phép',
    MAKEUP_EVENING: 'Học bù ca Tối (Trả bài)',
  };
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Điểm danh tự động · ${student.fullName}`,
    body: `Trạng thái: ${statusLabel[rec.status] || rec.status} (${rec.shiftLabel}). Đã gửi thông báo tức thì tới Zalo phụ huynh ${student.parentPhone}.`,
    channel: 'ZALO',
    targetRole: 'PARENT',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ attendance: rec });
});

// ============================================================
// TUITION, ONLINE PAYMENT & DEBT REMINDERS
// ============================================================

app.patch('/api/v1/tuition/:id/pay', requireAuth(), (req, res) => {
  const db = loadDb();
  const rec = db.tuition.find((t) => t.id === req.params.id);
  if (!rec) {
    res.status(404).json({ error: 'Không tìm thấy phiếu học phí.' });
    return;
  }
  const method = req.body?.paymentMethod || 'VIETQR';
  rec.paidAmount = rec.totalAmount;
  rec.status = 'PAID';
  rec.paymentMethod = method;
  rec.paidAt = todayIso();

  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Thanh toán học phí thành công`,
    body: `Đã ghi nhận ${rec.totalAmount.toLocaleString('vi-VN')}đ cho em ${rec.studentName} (${rec.centerClass}) qua ${method}.`,
    channel: 'EMAIL',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.json({ tuition: rec });
});

app.post('/api/v1/tuition/:id/remind', requireAuth(['ADMIN']), (req, res) => {
  const db = loadDb();
  const rec = db.tuition.find((t) => t.id === req.params.id);
  if (!rec) {
    res.status(404).json({ error: 'Không tìm thấy phiếu công nợ.' });
    return;
  }
  rec.remindersSent += 1;
  const remaining = rec.totalAmount - rec.paidAmount;
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Đã gửi nhắc học phí qua Zalo & App`,
    body: `Gửi tới phụ huynh em ${rec.studentName} (${rec.parentPhone}): Còn lại ${remaining.toLocaleString('vi-VN')}đ (${rec.monthLabel}).`,
    channel: 'ZALO',
    targetRole: 'PARENT',
    read: false,
  });
  saveDb(db);
  res.json({ tuition: rec, reminderMessage: `Trung Tâm Nhân Trí kính báo học phí ${rec.monthLabel} của em ${rec.studentName} (${rec.centerClass}) còn ${remaining.toLocaleString('vi-VN')}đ. Phụ huynh có thể quét mã VietQR/MoMo trên ứng dụng để hoàn tất nhanh chóng.` });
});

// ============================================================
// NATIONAL EXAM LIBRARY SUBMISSION
// ============================================================

app.post('/api/v1/exams/:id/submit', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const exam = db.exams.find((e) => e.id === req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'Không tìm thấy đề thi.' });
    return;
  }
  const answers: number[] = Array.isArray(req.body?.answers) ? req.body.answers : [];
  let correctCount = 0;
  const breakdown = exam.questions.map((q, idx) => {
    const selected = typeof answers[idx] === 'number' ? answers[idx] : -1;
    const isCorrect = selected === q.correctIndex;
    if (isCorrect) correctCount += 1;
    return {
      questionId: q.id,
      selectedIndex: selected,
      correctIndex: q.correctIndex,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const score = Math.round(((correctCount / exam.questions.length) * 10) * 100) / 100;
  exam.attemptsCount += 1;

  const targetStudentId = req.body?.studentId || req.user?.linkedStudentId || db.students[0]?.id;
  const student = db.students.find((s) => s.id === targetStudentId);

  let savedScore: ScoreRecord | null = null;
  if (student) {
    savedScore = {
      id: `sc-quiz-${Date.now()}`,
      studentId: student.id,
      studentName: student.fullName,
      centerClass: student.centerClass,
      subject: exam.subject,
      examType: 'TRAC_NGHIEM_ONLINE',
      score,
      maxScore: 10,
      date: todayIso(),
      school: student.school,
      source: 'ONLINE_QUIZ',
      verified: true,
      aiSummary: `Hoàn thành ${exam.title}: đúng ${correctCount}/${exam.questions.length} câu.`,
    };
    db.scores.unshift(savedScore);
  }

  saveDb(db);
  res.json({
    correctCount,
    totalQuestions: exam.questions.length,
    score,
    breakdown,
    savedScore,
  });
});

// ============================================================
// FEEDBACK & 24/7 CUSTOMER CARE + NOTIFICATIONS + CLOUDFLARE SQL
// ============================================================

app.post('/api/v1/tickets', (req: AuthedRequest, res) => {
  const { authorName, phone, category, subject, message } = req.body || {};
  if (!authorName || !message) {
    res.status(400).json({ error: 'Vui lòng nhập họ tên và nội dung góp ý/tư vấn.' });
    return;
  }
  const db = loadDb();
  const ticket: FeedbackTicket = {
    id: `tk-${Date.now()}`,
    createdAt: nowFormatted(),
    authorName: String(authorName).trim(),
    authorRole: req.user?.role || 'GUEST',
    phone: phone ? String(phone).trim() : undefined,
    category: category || 'FEEDBACK',
    subject: String(subject || 'Yêu cầu hỗ trợ từ phụ huynh / học sinh').trim(),
    message: String(message).trim(),
    status: 'OPEN',
  };
  db.tickets.unshift(ticket);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Phản hồi mới: ${ticket.subject}`,
    body: `${ticket.authorName}: ${ticket.message.slice(0, 90)}`,
    channel: 'APP',
    targetRole: 'ADMIN',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ ticket });
});

app.patch('/api/v1/tickets/:id/reply', requireAuth(['ADMIN', 'TEACHER']), (req, res) => {
  const db = loadDb();
  const ticket = db.tickets.find((t) => t.id === req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
    return;
  }
  ticket.reply = String(req.body?.reply || '').trim();
  ticket.status = 'RESOLVED';
  saveDb(db);
  res.json({ ticket });
});

app.post('/api/v1/notifications/read-all', requireAuth(), (_req, res) => {
  const db = loadDb();
  db.notifications.forEach((n) => {
    n.read = true;
  });
  saveDb(db);
  res.json({ ok: true });
});

app.get('/api/v1/system/cloudflare-schema', requireAuth(['ADMIN']), (_req, res) => {
  res.json({
    sql: CLOUDFLARE_D1_SCHEMA_SQL,
    workerNotes:
      'REST API v1 được thiết kế phi trạng thái (stateless HMAC Bearer Auth + chuẩn JSON REST), sẵn sàng chuyển đổi sang Cloudflare Workers + D1 SQLite chỉ bằng cách gắn env.DB.prepare(...) vào các handler /api/v1/*.',
  });
});

// ============================================================
// SERVER-SIDE GEMINI AI ROUTES (VISION OCR + 24/7 ADVISOR)
// ============================================================

app.post('/api/v1/ai/analyze-test', requireAuth(), async (req, res) => {
  try {
    let base64Data = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
    let mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/jpeg';

    if (!base64Data && typeof req.body?.sampleFilename === 'string') {
      const sample = readSafeSampleImage(req.body.sampleFilename);
      if (!sample) {
        res.status(400).json({ error: 'Ảnh mẫu không hợp lệ.' });
        return;
      }
      base64Data = sample.base64;
      mimeType = sample.mimeType;
    }

    if (!base64Data) {
      res.status(400).json({ error: 'Vui lòng tải lên ảnh bài kiểm tra hoặc chọn ảnh mẫu.' });
      return;
    }

    // Strip data URL prefix if present
    const cleanedBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const analysis = await analyzeTestPaperImage(cleanedBase64, mimeType);
    res.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi phân tích ảnh bài kiểm tra bằng AI.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/v1/ai/import-students-image', requireAuth(['ADMIN', 'TEACHER']), async (req, res) => {
  try {
    let base64Data = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
    let mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/jpeg';

    if (!base64Data && typeof req.body?.sampleFilename === 'string') {
      const sample = readSafeSampleImage(req.body.sampleFilename);
      if (!sample) {
        res.status(400).json({ error: 'Ảnh danh sách mẫu không hợp lệ.' });
        return;
      }
      base64Data = sample.base64;
      mimeType = sample.mimeType;
    }

    if (!base64Data) {
      res.status(400).json({ error: 'Vui lòng tải ảnh danh sách học sinh.' });
      return;
    }

    const cleanedBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const rows = await extractStudentsFromRosterImage(cleanedBase64, mimeType);
    res.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi nhận dạng danh sách học sinh từ ảnh.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/v1/ai/consult', async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const language = req.body?.language === 'en' ? 'en' : 'vi';
    if (!question) {
      res.status(400).json({ error: 'Vui lòng nhập câu hỏi cần tư vấn.' });
      return;
    }
    const db = loadDb();
    const contextSummary = `Hiện có ${db.students.length} học sinh đang theo học, ${db.teachers.length} giáo viên bộ môn, ${db.timetable.length} ca học/tuần (Sáng/Chiều/Tối), ${db.exams.length} bộ đề trắc nghiệm chuẩn quốc gia.`;
    const answer = await askNhanTriAdvisor(question, contextSummary, language);
    res.json({ answer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể kết nối trợ lý AI ngay lúc này.';
    res.status(500).json({ error: message });
  }
});

// ============================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVER
// ============================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Trung Tâm Nhân Trí server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
