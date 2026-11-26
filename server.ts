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
import {
  canStudentUsePersonalGmail,
  DEFAULT_AUTH_POLICY,
  generateAccessPin,
  maskPhoneVN,
  normalizePhoneVN,
} from './src/lib/identityPolicy.ts';
import type {
  AccessAuditLog,
  AttendanceRecord,
  AuthPolicy,
  AuthUser,
  DatabaseState,
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
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '6mb' }));
app.use(extractAuth);

// Lightweight sliding-window rate limiter for public write/AI routes
const rateBuckets = new Map<string, number[]>();
function isRateLimited(ip: string, key: string, maxRequests: number, windowMs: number): boolean {
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const recent = (rateBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    rateBuckets.set(bucketKey, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(bucketKey, recent);
  return false;
}

function getAllowedStudentIds(user: AuthedRequest['user']): string[] {
  if (!user) return [];
  const ids = new Set<string>();
  if (user.linkedStudentId) ids.add(user.linkedStudentId);
  if (Array.isArray(user.linkedStudentIds)) {
    user.linkedStudentIds.forEach((id) => {
      if (id) ids.add(id);
    });
  }
  return Array.from(ids);
}

function generateParentLinkCode(grade: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `NT${grade}${suffix}`;
}

const ALLOWED_SAMPLE_DIR = path.resolve(process.cwd(), 'public/assets/aistudio');
const ALLOWED_SAMPLE_FILES = new Set([
  'IMG_9542_4ffccfa4.webp',
  'IMG_9538_cadb03a1.webp',
  'IMG_9534_fd106b28.webp',
]);

function readSafeSampleImage(filename: string): { base64: string; mimeType: string } | null {
  if (!ALLOWED_SAMPLE_FILES.has(filename)) return null;
  const resolved = path.resolve(ALLOWED_SAMPLE_DIR, filename);
  if (!resolved.startsWith(ALLOWED_SAMPLE_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const buf = fs.readFileSync(resolved);
  return { base64: buf.toString('base64'), mimeType: 'image/webp' };
}

function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPolicy(db: DatabaseState): AuthPolicy {
  return { ...DEFAULT_AUTH_POLICY, ...(db.authPolicy || {}) };
}

function sanitizePolicyPatch(current: AuthPolicy, patch: Record<string, unknown>): AuthPolicy {
  const pickBool = (k: keyof AuthPolicy): boolean =>
    typeof patch[k] === 'boolean' ? (patch[k] as boolean) : Boolean(current[k]);
  const rawMinGrade =
    typeof patch.minGradeForPersonalGmail === 'number' || typeof patch.minGradeForPersonalGmail === 'string'
      ? Number(patch.minGradeForPersonalGmail)
      : current.minGradeForPersonalGmail;
  return {
    allowParentPhoneLogin: pickBool('allowParentPhoneLogin'),
    requireParentPinOrCode: pickBool('requireParentPinOrCode'),
    allowParentGmailLogin: pickBool('allowParentGmailLogin'),
    allowStudentCodeLogin: pickBool('allowStudentCodeLogin'),
    requirePhoneLast4ForStudentCode: pickBool('requirePhoneLast4ForStudentCode'),
    allowStudentParentPhoneLogin: pickBool('allowStudentParentPhoneLogin'),
    allowStudentParentGmailLogin: pickBool('allowStudentParentGmailLogin'),
    allowStudentPersonalGmail: pickBool('allowStudentPersonalGmail'),
    minGradeForPersonalGmail: Math.min(12, Math.max(6, Math.round(rawMinGrade || 8))),
    requireAuthForClassroom: pickBool('requireAuthForClassroom'),
    allowDemoPreview: pickBool('allowDemoPreview'),
  };
}

function appendAuditLog(
  db: DatabaseState,
  entry: Omit<AccessAuditLog, 'id' | 'createdAt'>,
): void {
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  db.auditLogs.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: nowFormatted(),
    ...entry,
  });
  if (db.auditLogs.length > 100) {
    db.auditLogs = db.auditLogs.slice(0, 100);
  }
}

function studentMatchesPhone(student: Student, normalizedPhone: string): boolean {
  if (!normalizedPhone || normalizedPhone.length < 8) return false;
  return (
    normalizePhoneVN(student.parentPhone) === normalizedPhone ||
    normalizePhoneVN(student.parentZalo) === normalizedPhone ||
    normalizePhoneVN(student.parentSecondaryPhone) === normalizedPhone
  );
}

function studentMatchesSecret(student: Student, rawSecret: string): boolean {
  const sec = rawSecret.trim().toUpperCase();
  if (!sec || sec.length < 4) return false;
  return (
    Boolean(student.accessPin && student.accessPin.trim().toUpperCase() === sec) ||
    Boolean(student.parentLinkCode && student.parentLinkCode.trim().toUpperCase() === sec) ||
    student.code.trim().toUpperCase() === sec
  );
}

function sanitizeEmailList(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\n]/)
      : [];
  const cleaned = arr
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.length >= 5 && v.length <= 160 && v.includes('@'));
  return Array.from(new Set(cleaned)).slice(0, 5);
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
    teachers: db.teachers.map(({ phone: _omitPhone, ...publicTeacher }) => ({
      ...publicTeacher,
      phone: '',
    })),
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
    authPolicy: getPolicy(db),
  });
});

// ============================================================
// AUTHENTICATION & RBAC ROUTES
// ============================================================

app.post('/api/v1/auth/role-session', (req, res) => {
  const db = loadDb();
  const policy = getPolicy(db);
  if (process.env.ALLOW_DEMO_LOGIN === 'false' || !policy.allowDemoPreview) {
    res.status(403).json({
      error: 'Chế độ xem thử nhanh hiện đang tắt theo Chính sách Định danh. Vui lòng đăng nhập bằng SĐT / Mã HS hoặc Gmail.',
    });
    return;
  }
  const role = String(req.body?.role || '').toUpperCase() as UserRole;
  if (role === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Tài khoản SuperAdmin bắt buộc xác thực bằng Gmail chính thức.' });
    return;
  }
  const account = DEMO_ACCOUNTS[role];
  if (!account) {
    res.status(400).json({ error: 'Vai trò không hợp lệ.' });
    return;
  }

  // If ADMIN and a passcode is configured via env or claimed hash, verify
  if (role === 'ADMIN') {
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

  const token = signSessionToken({ ...account, loginChannel: 'DEMO' });
  res.json({ token, user: { ...account, loginChannel: 'DEMO' } });
});

app.post('/api/v1/auth/parent-login', (req, res) => {
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'parent-login', 8, 5 * 60_000)) {
    res.status(429).json({ error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 5 phút.' });
    return;
  }
  const db = loadDb();
  const policy = getPolicy(db);
  if (!policy.allowParentPhoneLogin) {
    res.status(403).json({
      error: 'Đăng nhập Phụ huynh bằng Số điện thoại hiện đang tạm tắt. Vui lòng đăng nhập bằng Gmail đã đăng ký.',
    });
    return;
  }

  const normPhone = normalizePhoneVN(typeof req.body?.phone === 'string' ? req.body.phone : '');
  const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
  if (normPhone.length < 8) {
    res.status(400).json({ error: 'Vui lòng nhập số điện thoại Phụ huynh hợp lệ (10 chữ số).' });
    return;
  }
  if (policy.requireParentPinOrCode && secret.length < 4) {
    res.status(400).json({ error: 'Vui lòng nhập Mã PIN gia đình hoặc Mã số học sinh của con.' });
    return;
  }

  const matched = db.students.filter(
    (s) => s.accessStatus !== 'LOCKED' && studentMatchesPhone(s, normPhone),
  );
  const secretOk =
    matched.length > 0 &&
    (!policy.requireParentPinOrCode || matched.some((s) => studentMatchesSecret(s, secret)));

  if (!secretOk) {
    appendAuditLog(db, {
      actorEmail: maskPhoneVN(normPhone),
      actorRole: 'GUEST',
      action: 'LOGIN_DENIED',
      targetLabel: `Cổng Phụ huynh (${maskPhoneVN(normPhone)})`,
      detail: 'Sai SĐT / Mã PIN hoặc hồ sơ học sinh đang tạm khóa.',
    });
    saveDb(db);
    res.status(401).json({
      error: 'Số điện thoại hoặc Mã PIN / Mã học sinh chưa chính xác, hoặc hồ sơ đang tạm khóa. Liên hệ Cô Tâm: 0947 376 444.',
    });
    return;
  }

  const primary = matched[0];
  const nowStr = nowFormatted();
  matched.forEach((s) => {
    s.lastLoginAt = nowStr;
  });

  const parentUser: AuthUser = {
    id: `par-${normPhone}`,
    name: primary.parentName || `Phụ huynh (${maskPhoneVN(normPhone)})`,
    email: primary.parentEmails?.[0] || `${maskPhoneVN(normPhone)} · Zalo`,
    role: 'PARENT',
    linkedStudentId: primary.id,
    linkedStudentIds: matched.map((s) => s.id),
    loginChannel: 'PARENT_PHONE',
  };

  appendAuditLog(db, {
    actorEmail: maskPhoneVN(normPhone),
    actorRole: 'PARENT',
    action: 'LOGIN_SUCCESS',
    targetLabel: `${parentUser.name} (${matched.length} học sinh)`,
    detail: `Đăng nhập Cổng Phụ huynh bằng SĐT + ${policy.requireParentPinOrCode ? 'PIN/Mã HS' : 'SĐT'}.`,
  });
  saveDb(db);

  const token = signSessionToken(parentUser);
  res.json({ token, user: parentUser, matchedCount: matched.length });
});

app.post('/api/v1/auth/student-login', (req, res) => {
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'student-login', 10, 5 * 60_000)) {
    res.status(429).json({ error: 'Bạn đã thử vào lớp quá nhiều lần. Vui lòng thử lại sau 5 phút.' });
    return;
  }
  const db = loadDb();
  const policy = getPolicy(db);
  const method = String(req.body?.method || 'STUDENT_CODE').toUpperCase();

  if (method === 'STUDENT_CODE') {
    if (!policy.allowStudentCodeLogin) {
      res.status(403).json({
        error: 'Đăng nhập bằng Mã số học sinh hiện đang tạm tắt. Vui lòng chọn phương thức khác.',
      });
      return;
    }
    const code = String(req.body?.studentCode || '').trim().toUpperCase();
    const phoneLast4 = String(req.body?.phoneLast4 || '').replace(/\D/g, '');
    if (code.length < 4) {
      res.status(400).json({ error: 'Vui lòng nhập Mã số học sinh hợp lệ (VD: NT-6A1-01 hoặc NT6A1H).' });
      return;
    }
    const student = db.students.find(
      (s) =>
        s.code.trim().toUpperCase() === code ||
        (s.parentLinkCode && s.parentLinkCode.trim().toUpperCase() === code),
    );
    if (!student || student.accessStatus === 'LOCKED') {
      appendAuditLog(db, {
        actorEmail: code,
        actorRole: 'GUEST',
        action: 'LOGIN_DENIED',
        targetLabel: `Vào lớp bằng Mã HS (${code})`,
        detail: 'Không tìm thấy Mã HS hoặc tài khoản học sinh đang bị khóa.',
      });
      saveDb(db);
      res.status(401).json({
        error: 'Mã số học sinh chưa chính xác hoặc hồ sơ đang tạm khóa. Vui lòng hỏi Giáo viên hoặc Cô Tâm (0947 376 444).',
      });
      return;
    }
    if (policy.requirePhoneLast4ForStudentCode) {
      const p1 = normalizePhoneVN(student.parentPhone);
      const p2 = normalizePhoneVN(student.parentSecondaryPhone);
      const last4Match =
        phoneLast4.length === 4 && (p1.endsWith(phoneLast4) || (p2.length >= 4 && p2.endsWith(phoneLast4)));
      if (!last4Match) {
        res.status(401).json({
          error: 'Vui lòng nhập đúng 4 số cuối điện thoại Phụ huynh để xác nhận vào lớp.',
          requiresPhoneLast4: true,
        });
        return;
      }
    }

    student.lastLoginAt = nowFormatted();
    const studentUser: AuthUser = {
      id: `stu-${student.id}`,
      name: `${student.fullName} (${student.centerClass})`,
      email: student.studentEmail || `${student.code.toLowerCase()}@student.daythemnhantri.com`,
      role: 'STUDENT',
      linkedStudentId: student.id,
      linkedStudentIds: [student.id],
      loginChannel: 'STUDENT_CODE',
    };
    appendAuditLog(db, {
      actorEmail: student.code,
      actorRole: 'STUDENT',
      action: 'LOGIN_SUCCESS',
      targetLabel: `${student.fullName} (${student.centerClass})`,
      detail: 'Học sinh vào lớp bằng Mã số học sinh.',
    });
    saveDb(db);
    const token = signSessionToken(studentUser);
    res.json({ token, user: studentUser, student });
    return;
  }

  if (method === 'PARENT_PHONE') {
    if (!policy.allowStudentParentPhoneLogin) {
      res.status(403).json({
        error: 'Vào lớp bằng SĐT Phụ huynh hiện đang tạm tắt. Em hãy dùng Mã số học sinh hoặc Gmail.',
      });
      return;
    }
    const normPhone = normalizePhoneVN(typeof req.body?.phone === 'string' ? req.body.phone : '');
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
    const requestedStudentId = typeof req.body?.studentId === 'string' ? req.body.studentId.trim() : '';

    if (normPhone.length < 8) {
      res.status(400).json({ error: 'Vui lòng nhập số điện thoại Phụ huynh hợp lệ (10 chữ số).' });
      return;
    }
    if (policy.requireParentPinOrCode && secret.length < 4) {
      res.status(400).json({ error: 'Vui lòng nhập Mã PIN gia đình hoặc Mã số học sinh.' });
      return;
    }

    const matched = db.students.filter(
      (s) => s.accessStatus !== 'LOCKED' && studentMatchesPhone(s, normPhone),
    );
    const secretOk =
      matched.length > 0 &&
      (!policy.requireParentPinOrCode || matched.some((s) => studentMatchesSecret(s, secret)));

    if (!secretOk) {
      res.status(401).json({
        error: 'SĐT Phụ huynh hoặc Mã PIN chưa chính xác, hoặc tài khoản học sinh đang tạm khóa.',
      });
      return;
    }

    if (matched.length > 1 && !requestedStudentId) {
      res.json({
        requiresChildSelection: true,
        candidates: matched.map((s) => ({
          id: s.id,
          code: s.code,
          fullName: s.fullName,
          centerClass: s.centerClass,
          grade: s.grade,
          school: s.school,
        })),
      });
      return;
    }

    const chosen = requestedStudentId
      ? matched.find((s) => s.id === requestedStudentId)
      : matched[0];
    if (!chosen) {
      res.status(400).json({ error: 'Học sinh được chọn không khớp với SĐT phụ huynh này.' });
      return;
    }

    chosen.lastLoginAt = nowFormatted();
    const studentUser: AuthUser = {
      id: `stu-${chosen.id}`,
      name: `${chosen.fullName} (${chosen.centerClass})`,
      email: chosen.studentEmail || `${chosen.code.toLowerCase()}@student.daythemnhantri.com`,
      role: 'STUDENT',
      linkedStudentId: chosen.id,
      linkedStudentIds: [chosen.id],
      loginChannel: 'PARENT_PHONE',
    };
    appendAuditLog(db, {
      actorEmail: maskPhoneVN(normPhone),
      actorRole: 'STUDENT',
      action: 'LOGIN_SUCCESS',
      targetLabel: `${chosen.fullName} (${chosen.centerClass})`,
      detail: 'Học sinh vào lớp bằng SĐT Phụ huynh đã xác thực.',
    });
    saveDb(db);
    const token = signSessionToken(studentUser);
    res.json({ token, user: studentUser, student: chosen });
    return;
  }

  res.status(400).json({ error: 'Phương thức vào lớp không hợp lệ.' });
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

  const db = loadDb();
  const policy = getPolicy(db);
  const email = verified.email.toLowerCase();
  const portalIntent = String(req.body?.portalIntent || 'AUTO').toUpperCase();
  const requestedStudentId = typeof req.body?.studentId === 'string' ? req.body.studentId.trim() : '';

  if (email === SUPER_ADMIN_EMAIL || email === ADMIN_EMAIL) {
    const role: UserRole = email === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'ADMIN';
    const user: AuthUser = {
      id: verified.uid,
      name: verified.displayName,
      email,
      photoURL: verified.photoURL,
      role,
      authProvider: 'GOOGLE_FIREBASE',
      loginChannel: 'STAFF_GMAIL',
    };
    const token = signSessionToken(user);
    res.json({ token, user });
    return;
  }

  const parentMatches = db.students.filter(
    (s) =>
      s.accessStatus !== 'LOCKED' &&
      Array.isArray(s.parentEmails) &&
      s.parentEmails.some((e) => e.toLowerCase() === email),
  );
  const studentMatch = db.students.find(
    (s) => s.studentEmail && s.studentEmail.toLowerCase() === email,
  );

  // Explicit Parent Portal intent
  if (portalIntent === 'PARENT') {
    if (!policy.allowParentGmailLogin) {
      res.status(403).json({
        error: 'Đăng nhập Phụ huynh bằng Gmail đang tạm tắt bởi SuperAdmin. Vui lòng dùng SĐT + Mã PIN.',
      });
      return;
    }
    if (parentMatches.length === 0) {
      res.status(403).json({
        error: `Gmail ${email} chưa được đăng ký trong hồ sơ Phụ huynh tại Nhân Trí. Vui lòng nhắn Zalo Cô Tâm (0947 376 444) để gắn Gmail vào hồ sơ con.`,
      });
      return;
    }
    const nowStr = nowFormatted();
    parentMatches.forEach((s) => {
      s.lastLoginAt = nowStr;
    });
    const user: AuthUser = {
      id: verified.uid,
      name: parentMatches[0].parentName || verified.displayName,
      email,
      photoURL: verified.photoURL,
      role: 'PARENT',
      linkedStudentId: parentMatches[0].id,
      linkedStudentIds: parentMatches.map((s) => s.id),
      authProvider: 'GOOGLE_FIREBASE',
      loginChannel: 'PARENT_GMAIL',
    };
    appendAuditLog(db, {
      actorEmail: email,
      actorRole: 'PARENT',
      action: 'LOGIN_SUCCESS',
      targetLabel: `${user.name} (${parentMatches.length} học sinh)`,
      detail: 'Phụ huynh đăng nhập bằng Gmail đã đăng ký.',
    });
    saveDb(db);
    const token = signSessionToken(user);
    res.json({ token, user });
    return;
  }

  // Explicit Student Classroom intent
  if (portalIntent === 'STUDENT') {
    if (studentMatch) {
      if (studentMatch.accessStatus === 'LOCKED') {
        res.status(403).json({ error: 'Tài khoản học sinh này đang bị tạm khóa. Vui lòng liên hệ Cô Tâm (0947 376 444).' });
        return;
      }
      if (!canStudentUsePersonalGmail(studentMatch, policy)) {
        res.status(403).json({
          error: `Học sinh Lớp ${studentMatch.grade} chưa đủ ngưỡng dùng Gmail cá nhân (áp dụng từ Lớp ${policy.minGradeForPersonalGmail} trở lên). Em hãy vào lớp bằng Mã số học sinh, SĐT/Gmail Phụ huynh, hoặc nhờ Quản trị viên bật ngoại lệ.`,
        });
        return;
      }
      studentMatch.lastLoginAt = nowFormatted();
      const user: AuthUser = {
        id: verified.uid,
        name: `${studentMatch.fullName} (${studentMatch.centerClass})`,
        email,
        photoURL: verified.photoURL,
        role: 'STUDENT',
        linkedStudentId: studentMatch.id,
        linkedStudentIds: [studentMatch.id],
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'STUDENT_GMAIL',
      };
      appendAuditLog(db, {
        actorEmail: email,
        actorRole: 'STUDENT',
        action: 'LOGIN_SUCCESS',
        targetLabel: `${studentMatch.fullName} (${studentMatch.centerClass})`,
        detail: `Học sinh vào lớp bằng Gmail cá nhân (Lớp ${studentMatch.grade}).`,
      });
      saveDb(db);
      const token = signSessionToken(user);
      res.json({ token, user });
      return;
    }

    if (parentMatches.length > 0) {
      if (!policy.allowStudentParentGmailLogin) {
        res.status(403).json({
          error: 'Vào lớp bằng Gmail Phụ huynh đang tạm tắt. Em hãy dùng Mã số học sinh.',
        });
        return;
      }
      if (parentMatches.length > 1 && !requestedStudentId) {
        res.json({
          requiresChildSelection: true,
          candidates: parentMatches.map((s) => ({
            id: s.id,
            code: s.code,
            fullName: s.fullName,
            centerClass: s.centerClass,
            grade: s.grade,
            school: s.school,
          })),
        });
        return;
      }
      const chosen = requestedStudentId
        ? parentMatches.find((s) => s.id === requestedStudentId) || parentMatches[0]
        : parentMatches[0];
      chosen.lastLoginAt = nowFormatted();
      const user: AuthUser = {
        id: verified.uid,
        name: `${chosen.fullName} (${chosen.centerClass})`,
        email,
        photoURL: verified.photoURL,
        role: 'STUDENT',
        linkedStudentId: chosen.id,
        linkedStudentIds: [chosen.id],
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'PARENT_GMAIL',
      };
      appendAuditLog(db, {
        actorEmail: email,
        actorRole: 'STUDENT',
        action: 'LOGIN_SUCCESS',
        targetLabel: `${chosen.fullName} (${chosen.centerClass})`,
        detail: 'Học sinh vào lớp thông qua Gmail Phụ huynh đã đăng ký.',
      });
      saveDb(db);
      const token = signSessionToken(user);
      res.json({ token, user });
      return;
    }

    res.status(403).json({
      error: `Gmail ${email} chưa được liên kết với hồ sơ Học sinh hoặc Phụ huynh tại Nhân Trí. Vui lòng liên hệ Cô Tâm (0947 376 444).`,
    });
    return;
  }

  // AUTO / Teacher / Firestore-invited role fallback
  if (parentMatches.length > 0) {
    const user: AuthUser = {
      id: verified.uid,
      name: parentMatches[0].parentName || verified.displayName,
      email,
      photoURL: verified.photoURL,
      role: 'PARENT',
      linkedStudentId: parentMatches[0].id,
      linkedStudentIds: parentMatches.map((s) => s.id),
      authProvider: 'GOOGLE_FIREBASE',
      loginChannel: 'PARENT_GMAIL',
    };
    const token = signSessionToken(user);
    res.json({ token, user });
    return;
  }

  if (studentMatch && studentMatch.accessStatus !== 'LOCKED' && canStudentUsePersonalGmail(studentMatch, policy)) {
    const user: AuthUser = {
      id: verified.uid,
      name: `${studentMatch.fullName} (${studentMatch.centerClass})`,
      email,
      photoURL: verified.photoURL,
      role: 'STUDENT',
      linkedStudentId: studentMatch.id,
      linkedStudentIds: [studentMatch.id],
      authProvider: 'GOOGLE_FIREBASE',
      loginChannel: 'STUDENT_GMAIL',
    };
    const token = signSessionToken(user);
    res.json({ token, user });
    return;
  }

  const requestedRole = req.body?.requestedRole;
  const fallbackRole: UserRole =
    requestedRole === 'TEACHER' || requestedRole === 'PARENT' || requestedRole === 'STUDENT'
      ? requestedRole
      : 'STUDENT';
  const user: AuthUser = {
    id: verified.uid,
    name: verified.displayName,
    email,
    photoURL: verified.photoURL,
    role: fallbackRole,
    authProvider: 'GOOGLE_FIREBASE',
    loginChannel: fallbackRole === 'TEACHER' ? 'STAFF_GMAIL' : 'STUDENT_GMAIL',
  };
  const token = signSessionToken(user);
  res.json({ token, user });
});

app.post('/api/v1/auth/link-student', requireAuth(), (req: AuthedRequest, res) => {
  const code = String(req.body?.linkCode || '').trim().toUpperCase();
  if (!code || code.length < 4) {
    res.status(400).json({ error: 'Vui lòng nhập Mã liên kết Phụ huynh hợp lệ (VD: NT7A1T).' });
    return;
  }
  const db = loadDb();
  const student = db.students.find(
    (s) =>
      (s.parentLinkCode && s.parentLinkCode.toUpperCase() === code) ||
      s.code.toUpperCase() === code,
  );
  if (!student) {
    res.status(404).json({ error: 'Không tìm thấy học sinh khớp với mã liên kết này.' });
    return;
  }
  const currentUser = req.user!;
  const mergedIds = Array.from(new Set([...getAllowedStudentIds(currentUser), student.id]));
  const updatedUser = {
    ...currentUser,
    linkedStudentId: currentUser.linkedStudentId || student.id,
    linkedStudentIds: mergedIds,
  };
  const token = signSessionToken(updatedUser);
  res.json({ token, user: updatedUser, student });
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
  const allowedStudentIds = new Set(getAllowedStudentIds(user));

  const students = isStaff
    ? db.students
    : db.students.filter((s) => allowedStudentIds.has(s.id));

  const scores = isStaff
    ? db.scores
    : db.scores.filter((sc) => allowedStudentIds.has(sc.studentId));

  const attendance = isStaff
    ? db.attendance
    : db.attendance.filter((a) => allowedStudentIds.has(a.studentId));

  const tuition = isStaff
    ? db.tuition
    : db.tuition.filter((t) => allowedStudentIds.has(t.studentId));

  const tickets = isStaff
    ? db.tickets
    : db.tickets.filter(
        (t) =>
          t.authorUid === user.id ||
          t.authorName === user.name ||
          (t.authorRole === user.role && students.some((st) => t.authorName.includes(st.fullName.split(' ').slice(-1)[0]))),
      );

  const notifications = db.notifications.filter(
    (n) => n.targetRole === 'ALL' || n.targetRole === user.role || isAdminUser,
  );

  res.json({
    user,
    teachers: isStaff
      ? db.teachers
      : db.teachers.map(({ phone: _omit, ...pub }) => ({ ...pub, phone: '' })),
    students,
    timetable: db.timetable,
    scores,
    attendance,
    tuition,
    expenses: isAdminUser ? db.expenses : [],
    exams: db.exams,
    tickets,
    notifications,
    authPolicy: getPolicy(db),
    auditLogs: isAdminUser ? (db.auditLogs || []) : [],
  });
});

// ============================================================
// COURSE ENROLLMENT (PUBLIC -> CREATES STUDENT + TUITION)
// ============================================================

app.post('/api/v1/enrollments', (req, res) => {
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'enroll', 10, 60_000)) {
    res.status(429).json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.' });
    return;
  }
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
    parentLinkCode: generateParentLinkCode(numericGrade),
    fullName: studentName.trim(),
    grade: numericGrade,
    level: course.level,
    centerClass,
    schoolClass: `${numericGrade}A`,
    school: typeof school === 'string' && school.trim() ? school.trim() : 'THCS Lý Thường Kiệt',
    homeroomTeacher: numericGrade <= 5 ? 'Cô Tâm' : numericGrade <= 9 ? 'Cô Nghi' : 'Cô Mẫn',
    room: numericGrade <= 5 ? 'Phòng 1' : 'Phòng 2',
    parentName: typeof parentName === 'string' && parentName.trim() ? parentName.trim() : 'Phụ huynh mới',
    parentPhone: normalizePhoneVN(parentPhone) || parentPhone.trim(),
    parentZalo: normalizePhoneVN(parentPhone) || parentPhone.trim(),
    accessPin: generateAccessPin(),
    accessStatus: 'ACTIVE',
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
    parentLinkCode: generateParentLinkCode(grade),
    fullName: b.fullName.trim(),
    grade,
    level: grade <= 5 ? 'CAP_1' : grade <= 9 ? 'CAP_2' : 'CAP_3',
    centerClass: String(b.centerClass || `Lớp ${grade}A1`),
    schoolClass: String(b.schoolClass || `${grade}A1`),
    school: String(b.school || 'THCS Lý Thường Kiệt'),
    homeroomTeacher: String(b.homeroomTeacher || 'Cô Nghi'),
    room: String(b.room || 'Phòng 2'),
    parentName: String(b.parentName || 'Phụ huynh'),
    parentPhone: normalizePhoneVN(String(b.parentPhone || '')) || String(b.parentPhone || '0918000000'),
    parentZalo: normalizePhoneVN(String(b.parentPhone || '')) || String(b.parentPhone || '0918000000'),
    accessPin: generateAccessPin(),
    accessStatus: 'ACTIVE',
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

app.patch('/api/v1/students/:id/access', requireAuth(['ADMIN']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) {
    res.status(404).json({ error: 'Không tìm thấy học sinh.' });
    return;
  }
  const b = req.body || {};
  const prevStatus = student.accessStatus || 'ACTIVE';

  if (typeof b.parentPhone === 'string' && b.parentPhone.trim().length >= 8) {
    student.parentPhone = normalizePhoneVN(b.parentPhone) || b.parentPhone.trim();
  }
  if (typeof b.parentZalo === 'string') {
    student.parentZalo = normalizePhoneVN(b.parentZalo) || b.parentZalo.trim();
  }
  if (typeof b.parentSecondaryPhone === 'string') {
    const normSec = normalizePhoneVN(b.parentSecondaryPhone);
    student.parentSecondaryPhone = normSec || undefined;
  }
  if (b.parentEmails !== undefined) {
    student.parentEmails = sanitizeEmailList(b.parentEmails);
  }
  if (typeof b.studentEmail === 'string') {
    const cleaned = b.studentEmail.trim().toLowerCase();
    student.studentEmail = cleaned && cleaned.includes('@') ? cleaned.slice(0, 160) : undefined;
  }
  if (typeof b.allowPersonalGmailOverride === 'boolean') {
    student.allowPersonalGmailOverride = b.allowPersonalGmailOverride;
  }
  if (typeof b.accessPin === 'string' && b.accessPin.trim()) {
    const cleanPin = b.accessPin.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    if (cleanPin.length < 4) {
      res.status(400).json({ error: 'Mã PIN cần tối thiểu 4 ký tự.' });
      return;
    }
    student.accessPin = cleanPin;
  }
  if (typeof b.parentLinkCode === 'string' && b.parentLinkCode.trim().length >= 4) {
    student.parentLinkCode = b.parentLinkCode.trim().toUpperCase().slice(0, 16);
  }
  if (b.accessStatus === 'ACTIVE' || b.accessStatus === 'PENDING_VERIFY' || b.accessStatus === 'LOCKED') {
    student.accessStatus = b.accessStatus;
  }
  if (typeof b.accessNote === 'string') {
    student.accessNote = b.accessNote.trim().slice(0, 260) || undefined;
  }

  const actor = req.user!;
  appendAuditLog(db, {
    actorEmail: actor.email,
    actorRole: actor.role,
    action: student.accessStatus === 'LOCKED' && prevStatus !== 'LOCKED' ? 'ACCESS_LOCK' : 'ACCESS_UPDATE',
    targetLabel: `${student.fullName} (${student.code})`,
    detail: `Cập nhật định danh: SĐT ${maskPhoneVN(student.parentPhone)}, trạng thái ${student.accessStatus || 'ACTIVE'}${student.allowPersonalGmailOverride ? ', bật ngoại lệ Gmail cá nhân' : ''}.`,
  });
  saveDb(db);
  res.json({ student });
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
    const rawPhone = String(row.parentPhone || '0918000000').trim();
    const st: Student = {
      id: `st-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: `NT-${grade}-${String(db.students.length + imported.length + 1).padStart(2, '0')}`,
      parentLinkCode: generateParentLinkCode(grade),
      fullName,
      grade,
      level: grade <= 5 ? 'CAP_1' : grade <= 9 ? 'CAP_2' : 'CAP_3',
      centerClass,
      schoolClass: String(row.schoolClass || `${grade}A`).trim(),
      school: String(row.school || 'THCS Lý Thường Kiệt').trim(),
      homeroomTeacher: String(row.homeroomTeacher || 'Cô Nghi').trim(),
      room: String(row.room || 'Phòng 2').trim(),
      parentName: String(row.parentName || `PH em ${fullName.split(' ').slice(-1)[0]}`).trim(),
      parentPhone: normalizePhoneVN(rawPhone) || rawPhone,
      parentZalo: normalizePhoneVN(rawPhone) || rawPhone,
      accessPin: generateAccessPin(),
      accessStatus: 'ACTIVE',
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

app.get('/api/v1/timetable/student/:studentId/ics', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';
  const allowedIds = new Set(getAllowedStudentIds(user));
  if (!isStaff && !allowedIds.has(req.params.studentId)) {
    res.status(403).json({ error: 'Bạn chỉ có thể tải lịch học của học sinh đã liên kết với tài khoản.' });
    return;
  }
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
  const user = req.user!;
  const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';
  const b = req.body || {};
  const student = db.students.find((s) => s.id === b.studentId);
  if (!student) {
    res.status(400).json({ error: 'Vui lòng chọn học sinh hợp lệ.' });
    return;
  }
  if (!isStaff && !getAllowedStudentIds(user).includes(student.id)) {
    res.status(403).json({ error: 'Bạn chỉ có thể cập nhật điểm cho học sinh thuộc tài khoản của mình.' });
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
    source: isStaff ? (b.source || 'TEACHER') : (b.source === 'AI_SCAN' ? 'AI_SCAN' : 'SELF_ENTRY'),
    verified: isStaff,
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

app.patch('/api/v1/tuition/:id/pay', requireAuth(['ADMIN']), (req, res) => {
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
    title: `Xác nhận thu học phí thành công`,
    body: `Ban Học vụ đã đối soát ${rec.totalAmount.toLocaleString('vi-VN')}đ cho em ${rec.studentName} (${rec.centerClass}) qua ${method}.`,
    channel: 'EMAIL',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.json({ tuition: rec });
});

app.post('/api/v1/tuition/:id/confirm-transfer', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const rec = db.tuition.find((t) => t.id === req.params.id);
  if (!rec) {
    res.status(404).json({ error: 'Không tìm thấy phiếu học phí.' });
    return;
  }
  const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';
  if (!isStaff && !getAllowedStudentIds(user).includes(rec.studentId)) {
    res.status(403).json({ error: 'Không có quyền gửi xác nhận cho phiếu học phí này.' });
    return;
  }
  const method = String(req.body?.paymentMethod || 'VIETQR');
  const note = String(req.body?.note || '').trim();
  const remaining = Math.max(0, rec.totalAmount - rec.paidAmount);

  db.tickets.unshift({
    id: `tk-pay-${Date.now()}`,
    authorUid: user.id,
    createdAt: nowFormatted(),
    authorName: user.name,
    authorRole: user.role,
    category: 'TUITION',
    subject: `Báo đã chuyển khoản học phí (${method}) — ${rec.studentName}`,
    message: `Phụ huynh báo đã chuyển ${remaining.toLocaleString('vi-VN')}đ cho kỳ ${rec.monthLabel} (${rec.centerClass}) qua ${method}.${note ? ` Ghi chú: ${note}` : ''} Vui lòng kiểm tra sao kê và xác nhận.`,
    status: 'OPEN',
  });
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Chờ đối soát học phí · ${rec.studentName}`,
    body: `${user.name} vừa báo đã chuyển ${remaining.toLocaleString('vi-VN')}đ qua ${method}.`,
    channel: 'APP',
    targetRole: 'ADMIN',
    read: false,
  });
  saveDb(db);
  res.json({ submitted: true, message: 'Đã gửi thông báo đã chuyển khoản tới Ban Học vụ để đối soát.' });
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
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'tickets', 15, 60_000)) {
    res.status(429).json({ error: 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.' });
    return;
  }
  const { authorName, phone, category, subject, message } = req.body || {};
  if (!authorName || !message) {
    res.status(400).json({ error: 'Vui lòng nhập họ tên và nội dung góp ý/tư vấn.' });
    return;
  }
  const db = loadDb();
  const ticket: FeedbackTicket = {
    id: `tk-${Date.now()}`,
    authorUid: req.user?.id,
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

app.get('/api/v1/system/auth-policy', requireAuth(['ADMIN']), (_req, res) => {
  const db = loadDb();
  res.json({
    authPolicy: getPolicy(db),
    auditLogs: db.auditLogs || [],
  });
});

app.patch('/api/v1/system/auth-policy', requireAuth(['SUPER_ADMIN']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const nextPolicy = sanitizePolicyPatch(getPolicy(db), (req.body || {}) as Record<string, unknown>);
  db.authPolicy = nextPolicy;
  appendAuditLog(db, {
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'POLICY_UPDATE',
    targetLabel: 'Chính sách Định danh & Phân quyền',
    detail: `Ngưỡng Gmail cá nhân HS: Lớp ${nextPolicy.minGradeForPersonalGmail}+ · Yêu cầu xác thực vào lớp: ${nextPolicy.requireAuthForClassroom ? 'Bật' : 'Tắt'} · PIN Phụ huynh: ${nextPolicy.requireParentPinOrCode ? 'Bắt buộc' : 'Tùy chọn'}.`,
  });
  saveDb(db);
  res.json({
    authPolicy: nextPolicy,
    auditLogs: db.auditLogs || [],
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
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'ai-consult', 20, 60_000)) {
    res.status(429).json({ error: 'Trợ lý AI đang nhận nhiều yêu cầu, vui lòng thử lại sau ít giây.' });
    return;
  }
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const language = req.body?.language === 'en' ? 'en' : 'vi';
    if (!question || question.length > 800) {
      res.status(400).json({ error: 'Vui lòng nhập câu hỏi cần tư vấn (tối đa 800 ký tự).' });
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
    app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '365d', immutable: true }));
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
