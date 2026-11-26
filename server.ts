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
import {
  ALL_SHIFT_KEYS,
  evaluateMoveOrSwap,
  evaluateSlotConstraints,
  getTimeRangeForShift,
  studentBelongsToClass,
  suggestAvailableSubstitutes,
} from './src/lib/timetableEngine.ts';
import {
  calculateTuitionBreakdown,
  findFamilyForStudent,
  getStudentsInFamily,
} from './src/lib/tuitionCalculator.ts';
import {
  computeQuickClassSnapshot,
  getVietnamClock,
} from './src/lib/quickClassEngine.ts';
import {
  DEFAULT_FALLBACK_THUMBNAIL,
  fetchSocialUrlMetadata,
  fetchYouTubeChannelRssPosts,
  validateSocialUrl,
} from './src/lib/socialFetcher.ts';
import {
  dispatchUpcomingReminders,
  getOrBuildUserNotificationPref,
  resolvePrefKey,
  validateWebhookUrl,
} from './src/lib/reminderDispatcher.ts';
import type {
  AccessAuditLog,
  AttendanceRecord,
  AuthPolicy,
  AuthUser,
  BillingCycle,
  ClassCheckInRecord,
  DatabaseState,
  DayOfWeek,
  FamilyProfile,
  FeedbackTicket,
  Room,
  ScoreRecord,
  SessionPeriod,
  ShiftCode,
  SocialActivityPost,
  SocialMediaType,
  SocialPlatform,
  Student,
  Teacher,
  TeacherGroup,
  TeacherLeave,
  TimetableSlot,
  TuitionRecord,
  UserNotificationPreference,
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
    teachers: db.teachers.map(({ phone: _omitPhone, email: _omitEmail, ...publicTeacher }) => ({
      ...publicTeacher,
      phone: '',
    })),
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
    socialChannels: (db.socialChannels || []).filter((c) => c.active),
    socialPosts: (db.socialPosts || []).filter((p) => p.visible),
    notificationLeadMinutes: db.notificationConfig?.leadMinutes || 10,
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

  // Auto-link Teacher by registered Gmail
  const teacherMatch = db.teachers.find((t) => t.email && t.email.toLowerCase() === email);
  if (teacherMatch && portalIntent !== 'PARENT' && portalIntent !== 'STUDENT') {
    const user: AuthUser = {
      id: verified.uid,
      name: teacherMatch.name,
      email,
      photoURL: verified.photoURL,
      role: 'TEACHER',
      linkedTeacherId: teacherMatch.id,
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
    requestedRole === 'MANAGER' ||
    requestedRole === 'TEACHER' ||
    requestedRole === 'PARENT' ||
    requestedRole === 'STUDENT'
      ? requestedRole
      : 'STUDENT';
  const user: AuthUser = {
    id: verified.uid,
    name: verified.displayName,
    email,
    photoURL: verified.photoURL,
    role: fallbackRole,
    linkedTeacherId: teacherMatch?.id,
    authProvider: 'GOOGLE_FIREBASE',
    loginChannel: fallbackRole === 'TEACHER' || fallbackRole === 'MANAGER' ? 'STAFF_GMAIL' : 'STUDENT_GMAIL',
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
  const isManagerUser = isAdminUser || user.role === 'MANAGER';
  const isTeacherUser = user.role === 'TEACHER';
  const isStaff = isManagerUser || isTeacherUser;

  const allowedStudentIds = new Set(getAllowedStudentIds(user));

  // For Parents: auto-group all children sharing the same registered parentPhone or parentEmails
  if (user.role === 'PARENT') {
    const seedStudents = db.students.filter((s) => allowedStudentIds.has(s.id));
    const phones = new Set(
      seedStudents.map((s) => normalizePhoneVN(s.parentPhone)).filter((p) => p.length >= 8),
    );
    const emails = new Set<string>();
    if (user.email && user.email.includes('@')) emails.add(user.email.toLowerCase());
    seedStudents.forEach((s) => (s.parentEmails || []).forEach((e) => emails.add(e.toLowerCase())));
    db.students.forEach((s) => {
      if (s.accessStatus === 'LOCKED') return;
      const pMatch = phones.has(normalizePhoneVN(s.parentPhone));
      const eMatch = (s.parentEmails || []).some((e) => emails.has(e.toLowerCase()));
      if (pMatch || eMatch) allowedStudentIds.add(s.id);
    });
  }

  const students = isStaff
    ? db.students
    : db.students.filter((s) => allowedStudentIds.has(s.id));

  // Strict Timetable Projection by role (zero exposure of unrelated schedules)
  const timetable = isManagerUser
    ? db.timetable
    : isTeacherUser
      ? db.timetable.filter((sl) => !user.linkedTeacherId || sl.teacherId === user.linkedTeacherId)
      : db.timetable.filter((sl) => students.some((st) => studentBelongsToClass(st, sl.centerClass)));

  const scores = isStaff
    ? db.scores
    : db.scores.filter((sc) => allowedStudentIds.has(sc.studentId));

  const attendance = isStaff
    ? db.attendance
    : db.attendance.filter((a) => allowedStudentIds.has(a.studentId));

  // Finance privacy: ADMIN/SUPER_ADMIN see all; PARENT/STUDENT see own; MANAGER/TEACHER do not access tuition
  const tuition = isAdminUser
    ? db.tuition
    : user.role === 'PARENT' || user.role === 'STUDENT'
      ? db.tuition.filter((t) => allowedStudentIds.has(t.studentId))
      : [];

  const families = isAdminUser
    ? db.families
    : user.role === 'PARENT'
      ? db.families.filter((f) => students.some((st) => findFamilyForStudent(st, [f]) !== undefined))
      : [];

  const teacherLeaves = isManagerUser
    ? db.teacherLeaves
    : isTeacherUser
      ? db.teacherLeaves.filter((l) => l.teacherId === user.linkedTeacherId)
      : [];

  const teachers = isManagerUser
    ? db.teachers
    : db.teachers.map((t) =>
        isTeacherUser && t.id === user.linkedTeacherId
          ? t
          : { ...t, phone: '', email: undefined },
      );

  const tickets = isStaff
    ? db.tickets
    : db.tickets.filter(
        (t) =>
          t.authorUid === user.id ||
          t.authorName === user.name ||
          (t.authorRole === user.role && students.some((st) => t.authorName.includes(st.fullName.split(' ').slice(-1)[0]))),
      );

  const notifications = db.notifications.filter(
    (n) =>
      n.targetRole === 'ALL' ||
      n.targetRole === user.role ||
      isAdminUser ||
      (user.role === 'MANAGER' && n.targetRole === 'MANAGER'),
  );

  const todayVn = getVietnamClock().isoDate;
  const scopedCheckins = (db.classCheckins || []).filter((c) => {
    if (c.date !== todayVn) return false;
    if (isStaff) return true;
    return c.actorId === user.id || (user.linkedStudentId && c.actorId === user.linkedStudentId);
  });

  res.json({
    user,
    rooms: db.rooms,
    teachers,
    teacherLeaves,
    families,
    students,
    timetable,
    scores,
    attendance,
    tuition,
    expenses: isAdminUser ? db.expenses : [],
    exams: db.exams,
    tickets,
    notifications,
    authPolicy: getPolicy(db),
    auditLogs: isAdminUser ? (db.auditLogs || []) : [],
    socialChannels: db.socialChannels || [],
    socialPosts: isManagerUser ? (db.socialPosts || []) : (db.socialPosts || []).filter((p) => p.visible),
    notificationConfig: isAdminUser ? db.notificationConfig : undefined,
    myNotificationPref: getOrBuildUserNotificationPref(db, user),
    classCheckins: scopedCheckins,
    reminderDispatchLogs: isAdminUser ? (db.reminderDispatchLogs || []) : [],
  });
});

// ============================================================
// COURSE ENROLLMENT (PUBLIC -> CREATES STUDENT + 12M/SIBLING TUITION)
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

  const normalizedPhone = normalizePhoneVN(parentPhone) || parentPhone.trim();
  let family = db.families.find((f) => normalizePhoneVN(f.parentPhone) === normalizedPhone);
  const existingSiblings = db.students.filter((s) => normalizePhoneVN(s.parentPhone) === normalizedPhone);
  if (!family && existingSiblings.length > 0) {
    family = {
      id: `fam-${Date.now()}`,
      parentName: typeof parentName === 'string' && parentName.trim() ? parentName.trim() : existingSiblings[0].parentName,
      parentPhone: normalizedPhone,
      parentEmails: existingSiblings[0].parentEmails || [],
      siblingDiscountPercent: 5,
      defaultBillingCycle: annualPrepaid ? 'ANNUAL_12M' : 'MONTHLY',
      note: 'Tự động gom nhóm gia đình có nhiều con theo SĐT phụ huynh.',
    };
    db.families.unshift(family);
    existingSiblings.forEach((s) => {
      s.familyId = family!.id;
    });
  }

  const baseMonthly =
    course.billingModel === 'PER_SUBJECT'
      ? course.monthlyPrice * subjectsArray.length
      : course.monthlyPrice;
  const boardingAmt = hasBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
  const shuttleAmt = hasShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
  const billingCycle: BillingCycle = annualPrepaid ? 'ANNUAL_12M' : 'MONTHLY';

  const calc = calculateTuitionBreakdown({
    baseMonthly,
    boardingMonthly: boardingAmt,
    shuttleMonthly: shuttleAmt,
    siblingDiscountPercent: family ? family.siblingDiscountPercent : 0,
    annualDiscountPercent: course.annualDiscountPercent || 10,
    billingCycle,
  });

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
    familyId: family?.id,
    code: `NT-${numericGrade}-${String(db.students.length + 1).padStart(2, '0')}`,
    parentLinkCode: generateParentLinkCode(numericGrade),
    fullName: studentName.trim(),
    grade: numericGrade,
    level: course.level,
    centerClass,
    enrolledClasses: [centerClass],
    schoolClass: `${numericGrade}A`,
    school: typeof school === 'string' && school.trim() ? school.trim() : 'THCS Lý Thường Kiệt',
    homeroomTeacher: numericGrade <= 5 ? 'Cô Tâm' : numericGrade <= 9 ? 'Cô Nghi' : 'Cô Mẫn',
    room: numericGrade <= 5 ? 'Phòng 1' : 'Phòng 2',
    parentName: typeof parentName === 'string' && parentName.trim() ? parentName.trim() : 'Phụ huynh mới',
    parentPhone: normalizedPhone,
    parentZalo: normalizedPhone,
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

  const discountNotes: string[] = [];
  if (calc.siblingDiscountPercent > 0) discountNotes.push(`-${calc.siblingDiscountPercent}% nhiều con`);
  if (calc.annualDiscountPercent > 0) discountNotes.push(`-${calc.annualDiscountPercent}% đóng 12 tháng`);

  const newTuition: TuitionRecord = {
    id: `tui-${Date.now()}`,
    familyId: family?.id,
    studentId: newStudentId,
    studentName: newStudent.fullName,
    centerClass: newStudent.centerClass,
    parentPhone: newStudent.parentPhone,
    monthLabel:
      billingCycle === 'ANNUAL_12M'
        ? `Gói nguyên năm 12 tháng (${discountNotes.join(' + ') || 'Chuẩn'})`
        : `Tháng 12/2026${discountNotes.length ? ` (${discountNotes.join(' + ')})` : ''}`,
    billingCycle,
    monthsCount: calc.monthsCount,
    baseAmount: calc.baseAmount,
    boardingAmount: calc.boardingAmount,
    shuttleAmount: calc.shuttleAmount,
    siblingDiscountPercent: calc.siblingDiscountPercent,
    annualDiscountPercent: calc.annualDiscountPercent,
    siblingDiscountAmount: calc.siblingDiscountAmount,
    annualDiscountAmount: calc.annualDiscountAmount,
    discountAmount: calc.discountAmount,
    totalAmount: calc.totalAmount,
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
    message: `Đăng ký lớp ${centerClass}, môn: ${subjectsArray.join(', ')}. Bán trú: ${hasBoarding ? 'Có' : 'Không'}, Đưa rước: ${hasShuttle ? 'Có' : 'Không'}, Chu kỳ: ${billingCycle === 'ANNUAL_12M' ? 'Nguyên năm 12 tháng (-10% HP chính)' : 'Theo tháng'}.`,
    status: 'OPEN',
  };

  db.students.unshift(newStudent);
  db.tuition.unshift(newTuition);
  db.tickets.unshift(newTicket);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: 'Đăng ký khóa học mới',
    body: `Em ${newStudent.fullName} (${centerClass}) vừa đăng ký ${course.title}. Tổng học phí dự kiến: ${calc.totalAmount.toLocaleString('vi-VN')}đ (${calc.monthsCount} tháng).`,
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

app.post('/api/v1/students', requireAuth(['MANAGER', 'TEACHER']), (req, res) => {
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

app.post('/api/v1/students/import', requireAuth(['MANAGER', 'TEACHER']), (req, res) => {
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
// DYNAMIC ROOMS, 2-GROUP TEACHERS, AVAILABILITY & LEAVES
// ============================================================

app.post('/api/v1/rooms', requireAuth(['MANAGER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase().slice(0, 24);
  const name = String(b.name || '').trim().slice(0, 80);
  if (code.length < 2 || name.length < 2) {
    res.status(400).json({ error: 'Vui lòng nhập Mã phòng (VD: P106) và Tên phòng hợp lệ.' });
    return;
  }
  if (db.rooms.some((r) => r.code.toUpperCase() === code || r.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: `Phòng ${name} (${code}) đã tồn tại.` });
    return;
  }
  const room: Room = {
    id: `room-${Date.now()}`,
    code,
    name,
    campus: String(b.campus || 'Cơ sở 1 (35 Lý Thường Kiệt)').trim().slice(0, 120),
    capacity: Math.max(1, Math.min(100, Number(b.capacity) || 18)),
    active: b.active !== false,
    note: b.note ? String(b.note).trim().slice(0, 240) : undefined,
  };
  db.rooms.push(room);
  appendAuditLog(db, {
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'ROOM_CREATE',
    targetLabel: `${room.name} (${room.code})`,
    detail: `Thêm phòng học mới tại ${room.campus}, sức chứa ${room.capacity} HS.`,
  });
  saveDb(db);
  res.status(201).json({ room });
});

app.patch('/api/v1/rooms/:id', requireAuth(['MANAGER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const room = db.rooms.find((r) => r.id === req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng học.' });
    return;
  }
  const b = req.body || {};
  const oldName = room.name;
  if (typeof b.code === 'string' && b.code.trim().length >= 2) room.code = b.code.trim().toUpperCase().slice(0, 24);
  if (typeof b.name === 'string' && b.name.trim().length >= 2) room.name = b.name.trim().slice(0, 80);
  if (typeof b.campus === 'string' && b.campus.trim()) room.campus = b.campus.trim().slice(0, 120);
  if (b.capacity !== undefined) room.capacity = Math.max(1, Math.min(100, Number(b.capacity) || room.capacity));
  if (typeof b.active === 'boolean') room.active = b.active;
  if (typeof b.note === 'string') room.note = b.note.trim().slice(0, 240) || undefined;

  if (oldName !== room.name) {
    db.timetable.forEach((slot) => {
      if (slot.roomId === room.id || slot.room === oldName) {
        slot.room = room.name;
        slot.roomId = room.id;
      }
    });
  }
  saveDb(db);
  res.json({ room });
});

app.delete('/api/v1/rooms/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const room = db.rooms.find((r) => r.id === req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Không tìm thấy phòng học.' });
    return;
  }
  const inUse = db.timetable.some((s) => s.status !== 'OFF' && (s.roomId === room.id || s.room === room.name));
  if (inUse) {
    res.status(409).json({
      error: `Phòng ${room.name} đang có tiết học trong Thời khóa biểu. Vui lòng đổi phòng cho các tiết đó hoặc chuyển trạng thái Tạm ngưng.`,
    });
    return;
  }
  db.rooms = db.rooms.filter((r) => r.id !== room.id);
  saveDb(db);
  res.json({ deleted: true });
});

app.post('/api/v1/teachers', requireAuth(['MANAGER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const shortName = String(b.shortName || name.split(' ').slice(-2).join(' ')).trim();
  if (name.length < 2) {
    res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên giáo viên.' });
    return;
  }
  const group: TeacherGroup = b.teacherGroup === 'TUTOR_REVIEW' ? 'TUTOR_REVIEW' : 'SUBJECT';
  const subjectsRaw = Array.isArray(b.subjects)
    ? b.subjects
    : typeof b.subjects === 'string'
      ? b.subjects.split(/[,;]/)
      : [];
  const subjects = subjectsRaw.map((s: unknown) => String(s || '').trim()).filter(Boolean);
  const teacher: Teacher = {
    id: `t-${Date.now()}`,
    name: name.slice(0, 120),
    shortName: (shortName || name).slice(0, 60),
    teacherGroup: group,
    subjects: subjects.length > 0 ? subjects : group === 'TUTOR_REVIEW' ? ['Trả bài', 'Soạn bài'] : ['Toán'],
    degree: String(b.degree || 'Cử nhân Sư phạm').trim().slice(0, 140),
    experienceYears: Math.max(0, Math.min(60, Number(b.experienceYears) || 3)),
    phone: normalizePhoneVN(String(b.phone || '')) || String(b.phone || '').trim().slice(0, 40),
    email: typeof b.email === 'string' && b.email.includes('@') ? b.email.trim().toLowerCase().slice(0, 160) : undefined,
    roomDefault: String(b.roomDefault || db.rooms[0]?.name || 'Phòng 1').trim().slice(0, 60),
    status: b.status === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE',
    availability: Array.isArray(b.availability) && b.availability.length > 0 ? b.availability.map(String) : [...ALL_SHIFT_KEYS],
  };
  db.teachers.push(teacher);
  appendAuditLog(db, {
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'TEACHER_CREATE',
    targetLabel: `${teacher.name} (${group === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn'})`,
    detail: `Môn: ${teacher.subjects.join(', ')}${teacher.email ? ` · Gmail: ${teacher.email}` : ''}.`,
  });
  saveDb(db);
  res.status(201).json({ teacher });
});

app.patch('/api/v1/teachers/:id', requireAuth(['MANAGER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const teacher = db.teachers.find((t) => t.id === req.params.id);
  if (!teacher) {
    res.status(404).json({ error: 'Không tìm thấy giáo viên.' });
    return;
  }
  const b = req.body || {};
  const oldShort = teacher.shortName;
  if (typeof b.name === 'string' && b.name.trim().length >= 2) teacher.name = b.name.trim().slice(0, 120);
  if (typeof b.shortName === 'string' && b.shortName.trim().length >= 2) teacher.shortName = b.shortName.trim().slice(0, 60);
  if (b.teacherGroup === 'SUBJECT' || b.teacherGroup === 'TUTOR_REVIEW') teacher.teacherGroup = b.teacherGroup;
  if (b.subjects !== undefined) {
    const arr = Array.isArray(b.subjects) ? b.subjects : String(b.subjects).split(/[,;]/);
    const cleaned = arr.map((s: unknown) => String(s || '').trim()).filter(Boolean);
    if (cleaned.length > 0) teacher.subjects = cleaned;
  }
  if (typeof b.degree === 'string' && b.degree.trim()) teacher.degree = b.degree.trim().slice(0, 140);
  if (b.experienceYears !== undefined) teacher.experienceYears = Math.max(0, Math.min(60, Number(b.experienceYears) || 0));
  if (typeof b.phone === 'string') teacher.phone = normalizePhoneVN(b.phone) || b.phone.trim().slice(0, 40);
  if (typeof b.email === 'string') {
    const cleaned = b.email.trim().toLowerCase();
    teacher.email = cleaned && cleaned.includes('@') ? cleaned.slice(0, 160) : undefined;
  }
  if (typeof b.roomDefault === 'string' && b.roomDefault.trim()) teacher.roomDefault = b.roomDefault.trim().slice(0, 60);
  if (b.status === 'ACTIVE' || b.status === 'ON_LEAVE') teacher.status = b.status;
  if (Array.isArray(b.availability)) {
    teacher.availability = b.availability.map(String).filter((k: string) => ALL_SHIFT_KEYS.includes(k));
  }
  if (oldShort !== teacher.shortName) {
    db.timetable.forEach((slot) => {
      if (slot.teacherId === teacher.id) slot.teacherName = teacher.shortName;
    });
  }
  saveDb(db);
  res.json({ teacher });
});

app.patch('/api/v1/teachers/:id/availability', requireAuth(['MANAGER', 'TEACHER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  if (user.role === 'TEACHER' && user.linkedTeacherId !== req.params.id) {
    res.status(403).json({ error: 'Giáo viên chỉ có thể cập nhật khung giờ rảnh của chính mình.' });
    return;
  }
  const teacher = db.teachers.find((t) => t.id === req.params.id);
  if (!teacher) {
    res.status(404).json({ error: 'Không tìm thấy giáo viên.' });
    return;
  }
  const rawList = Array.isArray(req.body?.availability) ? req.body.availability : [];
  teacher.availability = rawList.map(String).filter((k: string) => ALL_SHIFT_KEYS.includes(k));
  saveDb(db);
  res.json({ teacher });
});

app.post('/api/v1/teacher-leaves', requireAuth(['MANAGER', 'TEACHER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const b = req.body || {};
  const isManager = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
  const teacherId = isManager ? String(b.teacherId || user.linkedTeacherId || '') : String(user.linkedTeacherId || '');
  const teacher = db.teachers.find((t) => t.id === teacherId);
  if (!teacher) {
    res.status(400).json({ error: 'Không tìm thấy hồ sơ giáo viên tương ứng.' });
    return;
  }
  const validDays: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const day = validDays.includes(b.day) ? (b.day as DayOfWeek) : null;
  const period = b.period === 'ALL' || b.period === 'SANG' || b.period === 'CHIEU' || b.period === 'TOI' ? b.period : 'ALL';
  const shift = b.shift === 'CA_1' || b.shift === 'CA_2' ? (b.shift as ShiftCode) : undefined;
  const reason = String(b.reason || '').trim();
  if (!day || reason.length < 3) {
    res.status(400).json({ error: 'Vui lòng chọn thứ/ca nghỉ và nhập lý do nghỉ (tối thiểu 3 ký tự).' });
    return;
  }

  const leave: TeacherLeave = {
    id: `lv-${Date.now()}`,
    teacherId: teacher.id,
    teacherName: teacher.shortName,
    day,
    dateLabel: String(b.dateLabel || todayIso()).trim().slice(0, 40),
    period,
    shift: period === 'ALL' ? undefined : shift,
    reason: reason.slice(0, 300),
    status: isManager && b.autoApprove ? 'APPROVED' : 'PENDING',
    createdBy: user.email,
    reviewedBy: isManager && b.autoApprove ? user.email : undefined,
    createdAt: nowFormatted(),
  };
  db.teacherLeaves.unshift(leave);

  // Count affected timetable blocks so Managers know immediately
  const affectedSlots = db.timetable.filter(
    (sl) =>
      sl.status !== 'OFF' &&
      sl.teacherId === teacher.id &&
      sl.day === leave.day &&
      (leave.period === 'ALL' || (sl.period === leave.period && (!leave.shift || sl.shift === leave.shift))),
  );
  if (leave.status === 'APPROVED') {
    affectedSlots.forEach((sl) => {
      sl.status = 'TEACHER_ABSENT';
      sl.note = `GV nghỉ phép (${leave.reason}) · Cần xếp GV dạy thay`;
    });
  }

  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Báo nghỉ đột xuất · ${teacher.shortName} (${leave.day})`,
    body: `${teacher.shortName} báo nghỉ ${leave.dateLabel} (${leave.period === 'ALL' ? 'Cả ngày' : `${leave.period}${leave.shift ? ' ' + leave.shift : ''}`}) — Lý do: ${leave.reason}. Ảnh hưởng ${affectedSlots.length} ca trên TKB.`,
    channel: 'APP',
    targetRole: 'MANAGER',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ leave, affectedCount: affectedSlots.length });
});

app.patch('/api/v1/teacher-leaves/:id', requireAuth(['MANAGER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const leave = db.teacherLeaves.find((l) => l.id === req.params.id);
  if (!leave) {
    res.status(404).json({ error: 'Không tìm thấy đơn xin nghỉ.' });
    return;
  }
  const nextStatus = req.body?.status;
  if (nextStatus !== 'APPROVED' && nextStatus !== 'REJECTED' && nextStatus !== 'PENDING') {
    res.status(400).json({ error: 'Trạng thái duyệt không hợp lệ.' });
    return;
  }
  leave.status = nextStatus;
  leave.reviewedBy = req.user!.email;

  if (nextStatus === 'APPROVED') {
    db.timetable.forEach((sl) => {
      if (
        sl.status !== 'OFF' &&
        sl.teacherId === leave.teacherId &&
        sl.day === leave.day &&
        (leave.period === 'ALL' || (sl.period === leave.period && (!leave.shift || sl.shift === leave.shift)))
      ) {
        sl.status = 'TEACHER_ABSENT';
        sl.note = `GV nghỉ đã duyệt (${leave.reason}) · Cần bố trí dạy thay`;
      }
    });
  }
  saveDb(db);
  res.json({ leave });
});

app.delete('/api/v1/teacher-leaves/:id', requireAuth(['MANAGER', 'TEACHER']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const leave = db.teacherLeaves.find((l) => l.id === req.params.id);
  if (!leave) {
    res.status(404).json({ error: 'Không tìm thấy đơn xin nghỉ.' });
    return;
  }
  if (user.role === 'TEACHER' && (leave.teacherId !== user.linkedTeacherId || leave.status !== 'PENDING')) {
    res.status(403).json({ error: 'Giáo viên chỉ có thể hủy đơn xin nghỉ đang chờ duyệt của chính mình.' });
    return;
  }
  db.teacherLeaves = db.teacherLeaves.filter((l) => l.id !== leave.id);
  saveDb(db);
  res.json({ deleted: true });
});

// ============================================================
// DYNAMIC TIMETABLE, 5-LAYER CONFLICT ENGINE, MOVE/SWAP & .ICS
// ============================================================

app.post('/api/v1/timetable/check-conflict', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const { id, day, period, shift, teacherId, room, roomId, centerClass, subject, slotType } = req.body || {};
  const result = evaluateSlotConstraints(
    {
      id,
      day,
      period,
      shift,
      teacherId,
      room: String(room || ''),
      roomId,
      centerClass: String(centerClass || ''),
      subject: String(subject || ''),
      slotType: slotType || 'MAIN',
    },
    {
      timetable: db.timetable,
      teachers: db.teachers,
      rooms: db.rooms,
      students: db.students,
      leaves: db.teacherLeaves,
      ignoreSlotIds: id ? [id] : [],
    },
  );
  res.json({
    hasConflict: !result.valid,
    conflicts: result.hardConflicts,
    suggestedFreeRooms: result.suggestedFreeRooms,
    roomOnlyConflict: result.roomOnlyConflict,
  });
});

app.post('/api/v1/timetable', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const { day, period, shift, centerClass, subject, teacherId, room, roomId, slotType, note, timeRange } = req.body || {};
  const teacher = db.teachers.find((t) => t.id === teacherId);
  const matchedRoom = db.rooms.find((r) => (roomId && r.id === roomId) || r.name === room);
  const roomName = matchedRoom?.name || String(room || '').trim();
  if (!teacher || !day || !period || !shift || !centerClass || !subject || !roomName) {
    res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin ca học.' });
    return;
  }

  const check = evaluateSlotConstraints(
    {
      day,
      period,
      shift,
      centerClass: String(centerClass),
      subject: String(subject),
      teacherId: teacher.id,
      room: roomName,
      roomId: matchedRoom?.id,
      slotType: slotType || 'MAIN',
    },
    {
      timetable: db.timetable,
      teachers: db.teachers,
      rooms: db.rooms,
      students: db.students,
      leaves: db.teacherLeaves,
    },
  );
  if (!check.valid) {
    res.status(409).json({
      error: check.hardConflicts[0],
      conflicts: check.hardConflicts,
      suggestedFreeRooms: check.suggestedFreeRooms,
    });
    return;
  }

  const newSlot: TimetableSlot = {
    id: `tt-${Date.now()}`,
    weekLabel: 'Tuần 13 (23/11 – 28/11)',
    period,
    shift,
    timeRange: typeof timeRange === 'string' && timeRange.trim() ? timeRange.trim() : getTimeRangeForShift(period, shift),
    day,
    centerClass: String(centerClass).trim(),
    subject: String(subject).trim(),
    teacherId: teacher.id,
    teacherName: teacher.shortName,
    roomId: matchedRoom?.id,
    room: roomName,
    slotType: slotType || 'MAIN',
    status: 'SCHEDULED',
    note: note ? String(note).trim() : undefined,
  };

  db.timetable.push(newSlot);
  db.notifications.unshift({
    id: `ntf-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Cập nhật Thời khóa biểu ${newSlot.centerClass}`,
    body: `Đã thêm ca ${newSlot.subject} (${newSlot.teacherName}) vào ${newSlot.day} · ${newSlot.timeRange} tại ${newSlot.room}.`,
    channel: 'APP',
    targetRole: 'ALL',
    read: false,
  });
  saveDb(db);
  res.status(201).json({ slot: newSlot });
});

app.patch('/api/v1/timetable/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const slot = db.timetable.find((s) => s.id === req.params.id);
  if (!slot) {
    res.status(404).json({ error: 'Không tìm thấy block ca học.' });
    return;
  }
  const b = req.body || {};
  const nextDay = (b.day || slot.day) as DayOfWeek;
  const nextPeriod = (b.period || slot.period) as SessionPeriod;
  const nextShift = (b.shift || slot.shift) as ShiftCode;
  const nextTeacherId = String(b.teacherId || slot.teacherId);
  const teacher = db.teachers.find((t) => t.id === nextTeacherId);
  if (!teacher) {
    res.status(400).json({ error: 'Giáo viên không hợp lệ.' });
    return;
  }
  const matchedRoom = db.rooms.find((r) => (b.roomId && r.id === b.roomId) || (b.room && r.name === b.room));
  const nextRoomName = matchedRoom?.name || String(b.room || slot.room);
  const nextRoomId = matchedRoom?.id || (b.room ? undefined : slot.roomId);
  const nextClass = String(b.centerClass || slot.centerClass).trim();
  const nextSubject = String(b.subject || slot.subject).trim();
  const nextSlotType = (b.slotType || slot.slotType) as TimetableSlot['slotType'];
  const nextStatus = (b.status || slot.status) as TimetableSlot['status'];

  if (nextStatus !== 'OFF') {
    const check = evaluateSlotConstraints(
      {
        id: slot.id,
        day: nextDay,
        period: nextPeriod,
        shift: nextShift,
        centerClass: nextClass,
        subject: nextSubject,
        teacherId: teacher.id,
        room: nextRoomName,
        roomId: nextRoomId,
        slotType: nextSlotType,
        status: nextStatus,
      },
      {
        timetable: db.timetable,
        teachers: db.teachers,
        rooms: db.rooms,
        students: db.students,
        leaves: db.teacherLeaves,
        ignoreSlotIds: [slot.id],
      },
    );
    if (!check.valid) {
      res.status(409).json({
        error: check.hardConflicts[0],
        conflicts: check.hardConflicts,
        suggestedFreeRooms: check.suggestedFreeRooms,
      });
      return;
    }
  }

  slot.day = nextDay;
  slot.period = nextPeriod;
  slot.shift = nextShift;
  slot.timeRange =
    typeof b.timeRange === 'string' && b.timeRange.trim()
      ? b.timeRange.trim()
      : getTimeRangeForShift(nextPeriod, nextShift);
  slot.centerClass = nextClass;
  slot.subject = nextSubject;
  slot.teacherId = teacher.id;
  slot.teacherName = teacher.shortName;
  slot.room = nextRoomName;
  slot.roomId = nextRoomId;
  slot.slotType = nextSlotType;
  slot.status = nextStatus;
  if (b.note !== undefined) slot.note = String(b.note || '').trim() || undefined;
  if (typeof b.weekLabel === 'string' && b.weekLabel.trim()) slot.weekLabel = b.weekLabel.trim();

  saveDb(db);
  res.json({ slot });
});

app.post('/api/v1/timetable/move-or-swap', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const b = req.body || {};

  // Support 1-click Undo restore of 1 or 2 previously modified blocks
  if (Array.isArray(b.restoreSlots) && b.restoreSlots.length > 0) {
    const restored: TimetableSlot[] = [];
    for (const snap of b.restoreSlots as TimetableSlot[]) {
      const idx = db.timetable.findIndex((s) => s.id === snap.id);
      if (idx >= 0) {
        db.timetable[idx] = { ...snap };
        restored.push(db.timetable[idx]);
      }
    }
    saveDb(db);
    res.json({ restored: true, slots: restored });
    return;
  }

  const sourceSlot = db.timetable.find((s) => s.id === b.slotId);
  if (!sourceSlot) {
    res.status(404).json({ error: 'Không tìm thấy block ca học nguồn.' });
    return;
  }
  const targetSlot = b.swapWithSlotId ? db.timetable.find((s) => s.id === b.swapWithSlotId) || null : null;
  const targetDay = (b.targetDay || targetSlot?.day || sourceSlot.day) as DayOfWeek;
  const targetPeriod = (b.targetPeriod || targetSlot?.period || sourceSlot.period) as SessionPeriod;
  const targetShift = (b.targetShift || targetSlot?.shift || sourceSlot.shift) as ShiftCode;

  const evalRes = evaluateMoveOrSwap(
    sourceSlot,
    { day: targetDay, period: targetPeriod, shift: targetShift },
    targetSlot,
    {
      timetable: db.timetable,
      teachers: db.teachers,
      rooms: db.rooms,
      students: db.students,
      leaves: db.teacherLeaves,
    },
  );

  if (!evalRes.valid) {
    res.status(409).json({
      error: evalRes.reasons[0] || 'Không thể di chuyển/hoán đổi do xung đột ràng buộc.',
      conflicts: evalRes.reasons,
    });
    return;
  }

  const previousSnapshots: TimetableSlot[] = targetSlot
    ? [{ ...sourceSlot }, { ...targetSlot }]
    : [{ ...sourceSlot }];

  if (evalRes.mode === 'SWAP' && targetSlot) {
    const srcCopy = { ...sourceSlot };
    const tgtCopy = { ...targetSlot };

    sourceSlot.day = tgtCopy.day;
    sourceSlot.period = tgtCopy.period;
    sourceSlot.shift = tgtCopy.shift;
    sourceSlot.timeRange = getTimeRangeForShift(tgtCopy.period, tgtCopy.shift);
    sourceSlot.room = tgtCopy.room;
    sourceSlot.roomId = tgtCopy.roomId;

    targetSlot.day = srcCopy.day;
    targetSlot.period = srcCopy.period;
    targetSlot.shift = srcCopy.shift;
    targetSlot.timeRange = getTimeRangeForShift(srcCopy.period, srcCopy.shift);
    targetSlot.room = srcCopy.room;
    targetSlot.roomId = srcCopy.roomId;

    saveDb(db);
    res.json({
      mode: 'SWAP',
      updatedSlots: [sourceSlot, targetSlot],
      previousSnapshots,
    });
    return;
  }

  // MOVE or MOVE_AUTO_ROOM
  sourceSlot.day = targetDay;
  sourceSlot.period = targetPeriod;
  sourceSlot.shift = targetShift;
  sourceSlot.timeRange = getTimeRangeForShift(targetPeriod, targetShift);
  if (b.overrideRoomId || b.overrideRoom) {
    const matched = db.rooms.find((r) => (b.overrideRoomId && r.id === b.overrideRoomId) || r.name === b.overrideRoom);
    if (matched) {
      sourceSlot.room = matched.name;
      sourceSlot.roomId = matched.id;
    }
  } else if (evalRes.mode === 'MOVE_AUTO_ROOM' && evalRes.autoRoom) {
    sourceSlot.room = evalRes.autoRoom.name;
    sourceSlot.roomId = evalRes.autoRoom.id;
  }

  saveDb(db);
  res.json({
    mode: evalRes.mode,
    updatedSlots: [sourceSlot],
    previousSnapshots,
    autoRoom: evalRes.autoRoom,
  });
});

app.post('/api/v1/timetable/:id/suggest-substitute', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const slot = db.timetable.find((s) => s.id === req.params.id);
  if (!slot) {
    res.status(404).json({ error: 'Không tìm thấy tiết học.' });
    return;
  }

  const candidates = suggestAvailableSubstitutes(slot, {
    timetable: db.timetable,
    teachers: db.teachers,
    rooms: db.rooms,
    students: db.students,
    leaves: db.teacherLeaves,
  });

  const substituteTeachers = candidates.slice(0, 8).map((c) => ({
    teacherId: c.teacher.id,
    teacherName: c.teacher.shortName,
    fullName: c.teacher.name,
    teacherGroup: c.teacher.teacherGroup,
    subjects: c.teacher.subjects,
    matchScore: c.reason,
    isExactSubject: c.matchScore >= 80,
  }));

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
    substituteTeachers,
    eveningMakeupSuggestion,
  });
});

app.patch('/api/v1/timetable/:id/substitute', requireAuth(['MANAGER']), (req, res) => {
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
    const check = evaluateSlotConstraints(
      { ...slot, teacherId: subTeacher.id },
      {
        timetable: db.timetable,
        teachers: db.teachers,
        rooms: db.rooms,
        students: db.students,
        leaves: db.teacherLeaves,
        ignoreSlotIds: [slot.id],
      },
    );
    if (!check.valid) {
      res.status(409).json({ error: check.hardConflicts[0], conflicts: check.hardConflicts });
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

app.delete('/api/v1/timetable/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  db.timetable = db.timetable.filter((s) => s.id !== req.params.id);
  saveDb(db);
  res.json({ deleted: true });
});

app.get('/api/v1/timetable/student/:studentId/ics', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const isStaff =
    user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'TEACHER';
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
  const slots = db.timetable.filter((s) => studentBelongsToClass(student, s.centerClass));
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
  const isStaff =
    user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'TEACHER';
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

app.post('/api/v1/attendance', requireAuth(['MANAGER', 'TEACHER']), (req, res) => {
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
// MULTI-CHILD FAMILY BILLING & 12-MONTH RECALCULATION (ADMIN+)
// ============================================================

app.post('/api/v1/families', requireAuth(['ADMIN']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const b = req.body || {};
  const parentName = String(b.parentName || '').trim();
  const parentPhone = normalizePhoneVN(String(b.parentPhone || ''));
  if (parentName.length < 2 || parentPhone.length < 8) {
    res.status(400).json({ error: 'Vui lòng nhập tên phụ huynh và SĐT hợp lệ.' });
    return;
  }
  const existing = db.families.find((f) => normalizePhoneVN(f.parentPhone) === parentPhone);
  if (existing) {
    res.status(409).json({ error: 'Hồ sơ gia đình cho SĐT này đã tồn tại.', family: existing });
    return;
  }
  const family: FamilyProfile = {
    id: `fam-${Date.now()}`,
    parentName: parentName.slice(0, 120),
    parentPhone,
    parentEmails: sanitizeEmailList(b.parentEmails),
    siblingDiscountPercent: Math.max(0, Math.min(30, Number(b.siblingDiscountPercent) || 5)),
    defaultBillingCycle: b.defaultBillingCycle === 'ANNUAL_12M' ? 'ANNUAL_12M' : 'MONTHLY',
    note: b.note ? String(b.note).trim().slice(0, 300) : undefined,
  };
  db.families.unshift(family);
  db.students.forEach((s) => {
    if (normalizePhoneVN(s.parentPhone) === parentPhone) {
      s.familyId = family.id;
    }
  });
  saveDb(db);
  res.status(201).json({ family });
});

app.patch('/api/v1/families/:id', requireAuth(['ADMIN']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const family = db.families.find((f) => f.id === req.params.id);
  if (!family) {
    res.status(404).json({ error: 'Không tìm thấy hồ sơ gia đình.' });
    return;
  }
  const b = req.body || {};
  if (typeof b.parentName === 'string' && b.parentName.trim().length >= 2) family.parentName = b.parentName.trim().slice(0, 120);
  if (b.parentEmails !== undefined) family.parentEmails = sanitizeEmailList(b.parentEmails);
  if (b.siblingDiscountPercent !== undefined) {
    family.siblingDiscountPercent = Math.max(0, Math.min(30, Number(b.siblingDiscountPercent) || 0));
  }
  if (b.defaultBillingCycle === 'MONTHLY' || b.defaultBillingCycle === 'ANNUAL_12M') {
    family.defaultBillingCycle = b.defaultBillingCycle;
  }
  if (typeof b.note === 'string') family.note = b.note.trim().slice(0, 300) || undefined;

  const updatedInvoices: TuitionRecord[] = [];
  if (b.recalculateInvoices) {
    const famStudents = getStudentsInFamily(family, db.students);
    const famStudentIds = new Set(famStudents.map((s) => s.id));
    const annualPct = Math.max(0, Math.min(30, Number(b.annualDiscountPercent) || 10));

    db.tuition.forEach((inv) => {
      if (!famStudentIds.has(inv.studentId) || inv.status === 'PAID') return;
      const oldMonths = inv.monthsCount && inv.monthsCount > 0 ? inv.monthsCount : 1;
      const baseMonthly = Math.round(inv.baseAmount / oldMonths);
      const boardingMonthly = Math.round(inv.boardingAmount / oldMonths);
      const shuttleMonthly = Math.round(inv.shuttleAmount / oldMonths);
      const cycle: BillingCycle = b.applyDefaultCycle ? family.defaultBillingCycle : inv.billingCycle || 'MONTHLY';

      const calc = calculateTuitionBreakdown({
        baseMonthly,
        boardingMonthly,
        shuttleMonthly,
        siblingDiscountPercent: family.siblingDiscountPercent,
        annualDiscountPercent: annualPct,
        billingCycle: cycle,
      });

      const notes: string[] = [];
      if (calc.siblingDiscountPercent > 0) notes.push(`-${calc.siblingDiscountPercent}% nhiều con`);
      if (calc.annualDiscountPercent > 0) notes.push(`-${calc.annualDiscountPercent}% đóng 12 tháng`);

      inv.familyId = family.id;
      inv.billingCycle = calc.billingCycle;
      inv.monthsCount = calc.monthsCount;
      inv.baseAmount = calc.baseAmount;
      inv.boardingAmount = calc.boardingAmount;
      inv.shuttleAmount = calc.shuttleAmount;
      inv.siblingDiscountPercent = calc.siblingDiscountPercent;
      inv.annualDiscountPercent = calc.annualDiscountPercent;
      inv.siblingDiscountAmount = calc.siblingDiscountAmount;
      inv.annualDiscountAmount = calc.annualDiscountAmount;
      inv.discountAmount = calc.discountAmount;
      inv.totalAmount = calc.totalAmount;
      inv.monthLabel =
        cycle === 'ANNUAL_12M'
          ? `Gói nguyên năm 12 tháng (${notes.join(' + ') || 'Chuẩn'})`
          : `Tháng 11/2026${notes.length ? ` (${notes.join(' + ')})` : ''}`;
      updatedInvoices.push(inv);
    });
  }

  appendAuditLog(db, {
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'FAMILY_DISCOUNT_UPDATE',
    targetLabel: `${family.parentName} (${maskPhoneVN(family.parentPhone)})`,
    detail: `Ưu đãi nhiều con: ${family.siblingDiscountPercent}% trên học phí chính · Chu kỳ: ${family.defaultBillingCycle} · Cập nhật ${updatedInvoices.length} phiếu chưa đóng.`,
  });
  saveDb(db);
  res.json({ family, updatedInvoices });
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

app.patch('/api/v1/tickets/:id/reply', requireAuth(['MANAGER', 'TEACHER']), (req, res) => {
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
// QUICK CLASS JUMP ("VÀO LỚP NHANH") — 3s LOOKUP & CHECK-IN
// ============================================================

app.get('/api/v1/quick-class/lookup', (req, res) => {
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, 'quick-lookup', 30, 60_000)) {
    res.status(429).json({ error: 'Bạn tra cứu quá nhanh. Vui lòng thử lại sau ít giây.' });
    return;
  }
  const rawCode = String(req.query.code || '').trim().toUpperCase();
  if (rawCode.length < 3) {
    res.status(400).json({ error: 'Vui lòng nhập Mã số học sinh (VD: NT-6A1-01 hoặc NT6A1H).' });
    return;
  }
  const db = loadDb();
  const student = db.students.find(
    (s) =>
      s.accessStatus !== 'LOCKED' &&
      (s.code.trim().toUpperCase() === rawCode ||
        (s.parentLinkCode && s.parentLinkCode.trim().toUpperCase() === rawCode)),
  );
  if (!student) {
    res.status(404).json({
      error: 'Không tìm thấy Mã học sinh phù hợp. Vui lòng kiểm tra lại thẻ học viên hoặc hỏi Giáo viên.',
    });
    return;
  }

  const snapshot = computeQuickClassSnapshot(db.timetable, {
    role: 'STUDENT',
    students: [student],
  });
  const nameParts = student.fullName.trim().split(/\s+/);
  const studentShortName = nameParts.length >= 2 ? nameParts.slice(-2).join(' ') : student.fullName;

  // Privacy-first: return ONLY schedule/room/subject/teacher — ZERO PII (no phone, email, scores, tuition)
  res.json({
    studentCode: student.code,
    studentShortName,
    centerClass: student.centerClass,
    grade: student.grade,
    snapshot,
  });
});

app.post('/api/v1/quick-class/checkin', requireAuth(), (req: AuthedRequest, res) => {
  const user = req.user!;
  const slotId = String(req.body?.slotId || '').trim();
  if (!slotId) {
    res.status(400).json({ error: 'Thiếu mã ca học để xác nhận vào lớp.' });
    return;
  }
  const db = loadDb();
  const slot = db.timetable.find((s) => s.id === slotId);
  if (!slot) {
    res.status(404).json({ error: 'Không tìm thấy ca học này trong Thời khóa biểu.' });
    return;
  }
  if (!Array.isArray(db.classCheckins)) db.classCheckins = [];

  const clock = getVietnamClock();
  const actorId =
    user.role === 'STUDENT' && user.linkedStudentId
      ? user.linkedStudentId
      : user.role === 'TEACHER' && user.linkedTeacherId
        ? user.linkedTeacherId
        : user.id;

  const existing = db.classCheckins.find(
    (c) => c.date === clock.isoDate && c.slotId === slot.id && c.actorId === actorId,
  );
  if (existing) {
    res.json({ checkin: existing, alreadyCheckedIn: true });
    return;
  }

  const record: ClassCheckInRecord = {
    id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    date: clock.isoDate,
    slotId: slot.id,
    actorRole: user.role === 'STUDENT' ? 'STUDENT' : 'TEACHER',
    actorId,
    actorName: user.name,
    centerClass: slot.centerClass,
    room: slot.room,
    checkedInAt: nowFormatted(),
  };
  db.classCheckins.unshift(record);
  if (db.classCheckins.length > 300) {
    db.classCheckins = db.classCheckins.slice(0, 300);
  }

  // Also log AttendanceRecord when a student self-checks in
  if (user.role === 'STUDENT' && user.linkedStudentId) {
    const st = db.students.find((s) => s.id === user.linkedStudentId);
    if (st) {
      const shiftLabel = `${slot.period === 'SANG' ? 'Sáng' : slot.period === 'CHIEU' ? 'Chiều' : 'Tối'} ${slot.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'} (${slot.timeRange})`;
      const alreadyAtt = db.attendance.find(
        (a) => a.date === clock.isoDate && a.studentId === st.id && a.shiftLabel === shiftLabel,
      );
      if (!alreadyAtt) {
        const att: AttendanceRecord = {
          id: `att-chk-${Date.now()}`,
          date: clock.isoDate,
          studentId: st.id,
          studentName: st.fullName,
          centerClass: st.centerClass,
          shiftLabel,
          status: 'PRESENT',
          note: `Học sinh tự check-in Vào lớp nhanh · ${slot.room} (${slot.subject})`,
          parentNotified: true,
        };
        db.attendance.unshift(att);
      }
    }
  }

  saveDb(db);
  res.status(201).json({ checkin: record, alreadyCheckedIn: false });
});

// ============================================================
// 10-MINUTE PRE-CLASS REMINDERS & USER NOTIFICATION SETTINGS
// ============================================================

app.get('/api/v1/me/notification-prefs', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  res.json({ preference: getOrBuildUserNotificationPref(db, req.user!) });
});

app.put('/api/v1/me/notification-prefs', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const current = getOrBuildUserNotificationPref(db, user);
  const b = (req.body || {}) as Record<string, unknown>;
  const rawChannels = (b.channels || {}) as Record<string, unknown>;

  const lead = Number(b.leadMinutes);
  const validLead = lead === 5 || lead === 10 || lead === 15 ? lead : current.leadMinutes || 10;

  const updated: UserNotificationPreference = {
    userId: resolvePrefKey(user),
    role: user.role,
    displayName: user.name,
    enabled: typeof b.enabled === 'boolean' ? b.enabled : current.enabled,
    leadMinutes: validLead,
    channels: {
      WEB: typeof rawChannels.WEB === 'boolean' ? rawChannels.WEB : current.channels.WEB,
      ZALO: typeof rawChannels.ZALO === 'boolean' ? rawChannels.ZALO : current.channels.ZALO,
      EMAIL: typeof rawChannels.EMAIL === 'boolean' ? rawChannels.EMAIL : current.channels.EMAIL,
      FACEBOOK:
        typeof rawChannels.FACEBOOK === 'boolean' ? rawChannels.FACEBOOK : current.channels.FACEBOOK,
    },
    zaloPhone:
      typeof b.zaloPhone === 'string' ? b.zaloPhone.trim().slice(0, 30) : current.zaloPhone,
    email: typeof b.email === 'string' ? b.email.trim().slice(0, 140) : current.email,
    facebookPsid:
      typeof b.facebookPsid === 'string'
        ? b.facebookPsid.trim().slice(0, 120)
        : current.facebookPsid,
    updatedAt: nowFormatted(),
  };

  if (!Array.isArray(db.notificationPrefs)) db.notificationPrefs = [];
  const idx = db.notificationPrefs.findIndex((p) => p.userId === updated.userId);
  if (idx >= 0) db.notificationPrefs[idx] = updated;
  else db.notificationPrefs.unshift(updated);

  saveDb(db);
  res.json({ preference: updated });
});

app.post('/api/v1/me/notification-prefs/test', requireAuth(), (req: AuthedRequest, res) => {
  const db = loadDb();
  const user = req.user!;
  const pref = getOrBuildUserNotificationPref(db, user);
  const activeChannels = Object.entries(pref.channels)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .join(', ');

  const notif = {
    id: `ntf-test-${Date.now()}`,
    createdAt: nowFormatted(),
    title: `Kiểm thử nhắc lịch trước ${pref.leadMinutes} phút`,
    body: `Xin chào ${user.name}! Kênh đang bật: ${activeChannels || 'WEB'}. Bạn sẽ nhận nhắc phòng học & giờ vào lớp tự động trước ${pref.leadMinutes} phút.`,
    channel: 'APP' as const,
    targetRole: user.role,
    read: false,
  };
  db.notifications.unshift(notif);
  saveDb(db);
  res.json({ ok: true, notification: notif, preference: pref });
});

app.get('/api/v1/system/notification-config', requireAuth(['ADMIN']), (_req, res) => {
  const db = loadDb();
  res.json({
    config: db.notificationConfig,
    logs: db.reminderDispatchLogs || [],
    subscriberCount: (db.notificationPrefs || []).filter((p) => p.enabled).length,
  });
});

app.patch('/api/v1/system/notification-config', requireAuth(['ADMIN']), (req: AuthedRequest, res) => {
  const db = loadDb();
  const b = (req.body || {}) as Record<string, unknown>;
  const curr = db.notificationConfig;

  const urlFields: Array<
    'zaloWebhookUrl' | 'emailWebhookUrl' | 'facebookWebhookUrl' | 'unifiedWebhookUrl'
  > = ['zaloWebhookUrl', 'emailWebhookUrl', 'facebookWebhookUrl', 'unifiedWebhookUrl'];
  const validatedUrls: Partial<Record<(typeof urlFields)[number], string>> = {};
  for (const field of urlFields) {
    if (typeof b[field] === 'string') {
      const check = validateWebhookUrl(b[field] as string);
      if (!check.ok) {
        res.status(400).json({ error: `${field}: ${check.error}` });
        return;
      }
      validatedUrls[field] = check.url || '';
    }
  }

  const rawCh = (b.channelsEnabled || {}) as Record<string, unknown>;
  const lead = Number(b.leadMinutes);
  const leadMinutes = Number.isFinite(lead) ? Math.min(60, Math.max(5, Math.round(lead))) : curr.leadMinutes;

  db.notificationConfig = {
    ...curr,
    leadMinutes,
    channelsEnabled: {
      WEB: typeof rawCh.WEB === 'boolean' ? rawCh.WEB : curr.channelsEnabled.WEB,
      ZALO: typeof rawCh.ZALO === 'boolean' ? rawCh.ZALO : curr.channelsEnabled.ZALO,
      EMAIL: typeof rawCh.EMAIL === 'boolean' ? rawCh.EMAIL : curr.channelsEnabled.EMAIL,
      FACEBOOK:
        typeof rawCh.FACEBOOK === 'boolean' ? rawCh.FACEBOOK : curr.channelsEnabled.FACEBOOK,
    },
    zaloOaId: typeof b.zaloOaId === 'string' ? b.zaloOaId.trim().slice(0, 100) : curr.zaloOaId,
    zaloWebhookUrl: validatedUrls.zaloWebhookUrl ?? curr.zaloWebhookUrl,
    emailWebhookUrl: validatedUrls.emailWebhookUrl ?? curr.emailWebhookUrl,
    facebookWebhookUrl: validatedUrls.facebookWebhookUrl ?? curr.facebookWebhookUrl,
    unifiedWebhookUrl: validatedUrls.unifiedWebhookUrl ?? curr.unifiedWebhookUrl,
    messageTemplate:
      typeof b.messageTemplate === 'string' && b.messageTemplate.trim().length >= 10
        ? b.messageTemplate.trim().slice(0, 400)
        : curr.messageTemplate,
    updatedAt: nowFormatted(),
  };

  appendAuditLog(db, {
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'POLICY_UPDATE',
    targetLabel: 'Cấu hình Nhắc lịch 10 phút (Zalo/Email/Facebook)',
    detail: `Nhắc trước ${db.notificationConfig.leadMinutes} phút · Kênh bật: ${Object.entries(
      db.notificationConfig.channelsEnabled,
    )
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ')}.`,
  });
  saveDb(db);
  res.json({ config: db.notificationConfig });
});

app.post('/api/v1/notifications/dispatch-upcoming', requireAuth(['MANAGER']), async (req: AuthedRequest, res) => {
  const db = loadDb();
  const forceSlotId = typeof req.body?.forceSlotId === 'string' ? req.body.forceSlotId.trim() : undefined;
  const dryRun = Boolean(req.body?.dryRun);
  const result = await dispatchUpcomingReminders(db, {
    forceSlotId: forceSlotId || undefined,
    dryRun,
    triggeredBy: 'MANUAL_TEST',
  });
  saveDb(db);
  res.json({
    ...result,
    reminderDispatchLogs: db.reminderDispatchLogs || [],
  });
});

// ============================================================
// SOCIAL MEDIA HUB & "HOẠT ĐỘNG TRUNG TÂM NHÂN TRÍ" LIBRARY
// ============================================================

app.get('/api/v1/social/channels', requireAuth(['MANAGER']), (_req, res) => {
  const db = loadDb();
  res.json({ channels: db.socialChannels || [] });
});

app.put('/api/v1/social/channels/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const channel = (db.socialChannels || []).find((c) => c.id === req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Không tìm thấy kênh mạng xã hội.' });
    return;
  }
  const b = (req.body || {}) as Record<string, unknown>;
  if (typeof b.url === 'string' && b.url.trim()) {
    const check = validateSocialUrl(b.url);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    channel.url = check.parsed.toString();
  }
  if (typeof b.label === 'string' && b.label.trim()) channel.label = b.label.trim().slice(0, 120);
  if (typeof b.handle === 'string') channel.handle = b.handle.trim().slice(0, 120);
  if (typeof b.youtubeChannelId === 'string') {
    channel.youtubeChannelId = b.youtubeChannelId.trim().slice(0, 100);
  }
  if (typeof b.active === 'boolean') channel.active = b.active;
  if (typeof b.autoSyncEnabled === 'boolean') channel.autoSyncEnabled = b.autoSyncEnabled;

  saveDb(db);
  res.json({ channel, channels: db.socialChannels });
});

app.post('/api/v1/social/fetch-metadata', requireAuth(['MANAGER']), async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const result = await fetchSocialUrlMetadata(url);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ metadata: result.data });
});

app.post('/api/v1/social/sync-youtube', requireAuth(['MANAGER']), async (req, res) => {
  const db = loadDb();
  const ytChannel = (db.socialChannels || []).find((c) => c.platform === 'YOUTUBE');
  const channelId =
    (typeof req.body?.youtubeChannelId === 'string' && req.body.youtubeChannelId.trim()) ||
    ytChannel?.youtubeChannelId ||
    '';
  if (!channelId) {
    res.status(400).json({
      error: 'Vui lòng nhập YouTube Channel ID (bắt đầu bằng UC...) trong cấu hình kênh YouTube trước khi đồng bộ.',
    });
    return;
  }

  const fetched = await fetchYouTubeChannelRssPosts(channelId, 6);
  if (!fetched.ok) {
    res.status(400).json({ error: fetched.error });
    return;
  }

  if (!Array.isArray(db.socialPosts)) db.socialPosts = [];
  const existingUrls = new Set(db.socialPosts.map((p) => p.sourceUrl));
  let addedCount = 0;

  for (const item of fetched.posts) {
    if (existingUrls.has(item.sourceUrl)) continue;
    db.socialPosts.unshift({
      id: `sp-yt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      platform: 'YOUTUBE',
      mediaType: 'VIDEO',
      title: item.title,
      excerpt: item.excerpt,
      thumbnailUrl: item.thumbnailUrl || DEFAULT_FALLBACK_THUMBNAIL,
      sourceUrl: item.sourceUrl,
      embedUrl: item.embedUrl,
      publishedAt: item.publishedAt,
      category: 'Video YouTube mới nhất',
      viewCount: 0,
      featured: false,
      visible: true,
    });
    existingUrls.add(item.sourceUrl);
    addedCount++;
  }

  if (ytChannel) {
    ytChannel.youtubeChannelId = channelId;
    ytChannel.lastSyncedAt = nowFormatted();
  }
  saveDb(db);
  res.json({ addedCount, posts: db.socialPosts, channels: db.socialChannels });
});

app.post('/api/v1/social/posts', requireAuth(['MANAGER']), (req, res) => {
  const b = (req.body || {}) as Record<string, unknown>;
  const title = String(b.title || '').trim();
  const sourceUrl = String(b.sourceUrl || '').trim();
  if (title.length < 3) {
    res.status(400).json({ error: 'Vui lòng nhập tiêu đề bài viết/video (tối thiểu 3 ký tự).' });
    return;
  }
  const urlCheck = validateSocialUrl(sourceUrl);
  if (!urlCheck.ok) {
    res.status(400).json({ error: urlCheck.error });
    return;
  }

  const validPlatforms: SocialPlatform[] = ['FACEBOOK', 'YOUTUBE', 'TIKTOK', 'ZALO'];
  const validTypes: SocialMediaType[] = ['VIDEO', 'PHOTO', 'POST'];
  const platform: SocialPlatform = validPlatforms.includes(b.platform as SocialPlatform)
    ? (b.platform as SocialPlatform)
    : urlCheck.platform;
  const mediaType: SocialMediaType = validTypes.includes(b.mediaType as SocialMediaType)
    ? (b.mediaType as SocialMediaType)
    : platform === 'YOUTUBE' || platform === 'TIKTOK'
      ? 'VIDEO'
      : 'PHOTO';

  const db = loadDb();
  if (!Array.isArray(db.socialPosts)) db.socialPosts = [];
  const post: SocialActivityPost = {
    id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    platform,
    mediaType,
    title: title.slice(0, 200),
    excerpt: String(b.excerpt || '').trim().slice(0, 600),
    thumbnailUrl:
      typeof b.thumbnailUrl === 'string' && b.thumbnailUrl.trim()
        ? b.thumbnailUrl.trim().slice(0, 500)
        : DEFAULT_FALLBACK_THUMBNAIL,
    sourceUrl: urlCheck.parsed.toString(),
    embedUrl:
      typeof b.embedUrl === 'string' && b.embedUrl.trim()
        ? b.embedUrl.trim().slice(0, 500)
        : undefined,
    publishedAt:
      typeof b.publishedAt === 'string' && b.publishedAt.trim()
        ? b.publishedAt.trim().slice(0, 20)
        : todayIso(),
    category: String(b.category || 'Hoạt động Nhân Trí').trim().slice(0, 80),
    viewCount: Math.max(0, Number(b.viewCount) || 0),
    featured: Boolean(b.featured),
    visible: b.visible !== false,
  };
  db.socialPosts.unshift(post);
  saveDb(db);
  res.status(201).json({ post, posts: db.socialPosts });
});

app.patch('/api/v1/social/posts/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const post = (db.socialPosts || []).find((p) => p.id === req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Không tìm thấy bài viết hoạt động.' });
    return;
  }
  const b = (req.body || {}) as Record<string, unknown>;
  if (typeof b.title === 'string' && b.title.trim()) post.title = b.title.trim().slice(0, 200);
  if (typeof b.excerpt === 'string') post.excerpt = b.excerpt.trim().slice(0, 600);
  if (typeof b.category === 'string' && b.category.trim()) post.category = b.category.trim().slice(0, 80);
  if (typeof b.thumbnailUrl === 'string' && b.thumbnailUrl.trim()) {
    post.thumbnailUrl = b.thumbnailUrl.trim().slice(0, 500);
  }
  if (typeof b.sourceUrl === 'string' && b.sourceUrl.trim()) {
    const check = validateSocialUrl(b.sourceUrl);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    post.sourceUrl = check.parsed.toString();
  }
  if (typeof b.featured === 'boolean') post.featured = b.featured;
  if (typeof b.visible === 'boolean') post.visible = b.visible;

  saveDb(db);
  res.json({ post, posts: db.socialPosts });
});

app.delete('/api/v1/social/posts/:id', requireAuth(['MANAGER']), (req, res) => {
  const db = loadDb();
  const before = (db.socialPosts || []).length;
  db.socialPosts = (db.socialPosts || []).filter((p) => p.id !== req.params.id);
  if (db.socialPosts.length === before) {
    res.status(404).json({ error: 'Không tìm thấy bài viết cần xóa.' });
    return;
  }
  saveDb(db);
  res.json({ ok: true, posts: db.socialPosts });
});

app.post('/api/v1/social/posts/:id/view', (req, res) => {
  const clientIp = req.ip || 'local';
  if (isRateLimited(clientIp, `view:${req.params.id}`, 10, 60_000)) {
    res.status(429).json({ error: 'Thao tác quá nhanh.' });
    return;
  }
  const db = loadDb();
  const post = (db.socialPosts || []).find((p) => p.id === req.params.id && p.visible);
  if (!post) {
    res.status(404).json({ error: 'Không tìm thấy bài viết.' });
    return;
  }
  post.viewCount = (post.viewCount || 0) + 1;
  saveDb(db);
  res.json({ id: post.id, viewCount: post.viewCount });
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

app.post('/api/v1/ai/import-students-image', requireAuth(['MANAGER', 'TEACHER']), async (req, res) => {
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
