import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_DB, REAL_CENTER_GALLERY } from '../server/seedData.ts';
import { CLOUDFLARE_D1_SCHEMA_SQL } from '../server/schemaSql.ts';
import type {
  AttendanceRecord,
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
} from '../src/types.ts';

// Minimal Cloudflare Runtime binding interfaces (no extra @cloudflare/workers-types install needed)
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface AssetsFetcher {
  fetch(input: Request | string): Promise<Response>;
}

export interface WorkerEnv {
  ASSETS?: AssetsFetcher;
  DB?: D1Database;
  NHANTRI_KV?: KVNamespace;
  GEMINI_API_KEY?: string;
  SESSION_SECRET?: string;
  ADMIN_PASSCODE?: string;
}

const DEMO_ACCOUNTS: Record<UserRole, AuthUser> = {
  ADMIN: {
    id: 'usr-admin',
    name: 'Ban Giám Đốc Nhân Trí',
    email: 'admin@nhantri.edu.vn',
    role: 'ADMIN',
  },
  TEACHER: {
    id: 'usr-teacher',
    name: 'Cô Nguyễn Thị Mẫn (GV Toán)',
    email: 'co.man@nhantri.edu.vn',
    role: 'TEACHER',
    linkedTeacherId: 't-man',
  },
  PARENT: {
    id: 'usr-parent',
    name: 'Anh Nguyễn Văn Phúc (PH em Hòa)',
    email: 'ph.phuchoa@nhantri.edu.vn',
    role: 'PARENT',
    linkedStudentId: 'st-01',
  },
  STUDENT: {
    id: 'usr-student',
    name: 'Nguyễn Phúc Hòa (Lớp 6A1)',
    email: 'hoanp.6a1@nhantri.edu.vn',
    role: 'STUDENT',
    linkedStudentId: 'st-01',
  },
};

const ALLOWED_SAMPLE_FILES = new Set([
  'IMG_9542_4ffccfa4.JPG',
  'IMG_9538_cadb03a1.JPG',
  'IMG_9534_fd106b28.JPG',
]);

const SHIFT_TIMES: Record<`${SessionPeriod}_${ShiftCode}`, string> = {
  SANG_CA_1: '07:15–08:45',
  SANG_CA_2: '09:15–10:45',
  CHIEU_CA_1: '13:30–15:00',
  CHIEU_CA_2: '15:15–16:45',
  TOI_CA_1: '17:30–19:00',
  TOI_CA_2: '19:00–20:30',
};

// Runtime fallback secret if SESSION_SECRET is not set in Cloudflare Secrets
const FALLBACK_SECRET_BYTES = crypto.getRandomValues(new Uint8Array(32));
const FALLBACK_SECRET = Array.from(FALLBACK_SECRET_BYTES, (b) => b.toString(16).padStart(2, '0')).join('');

let isolateMemoryDb: DatabaseState | null = null;
let d1Initialized = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function nowFormatted(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// EDGE-NATIVE STORAGE (D1 -> KV -> IN-MEMORY FALLBACK)
// ============================================================

async function loadState(env: WorkerEnv): Promise<DatabaseState> {
  if (env.DB) {
    try {
      if (!d1Initialized) {
        await env.DB.exec(
          'CREATE TABLE IF NOT EXISTS nhantri_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        d1Initialized = true;
      }
      const row = await env.DB.prepare('SELECT value FROM nhantri_state WHERE key = ?')
        .bind('main')
        .first<{ value: string }>();
      if (row?.value) {
        return JSON.parse(row.value) as DatabaseState;
      }
      const fresh = structuredClone(INITIAL_DB);
      await saveState(env, fresh);
      return fresh;
    } catch {
      // Fallback safely to memory if D1 isn't ready
    }
  }

  if (env.NHANTRI_KV) {
    try {
      const raw = await env.NHANTRI_KV.get('nhantri:state');
      if (raw) return JSON.parse(raw) as DatabaseState;
      const fresh = structuredClone(INITIAL_DB);
      await saveState(env, fresh);
      return fresh;
    } catch {
      // Fallback to memory
    }
  }

  if (!isolateMemoryDb) {
    isolateMemoryDb = structuredClone(INITIAL_DB);
  }
  return isolateMemoryDb;
}

async function saveState(env: WorkerEnv, state: DatabaseState): Promise<void> {
  isolateMemoryDb = state;
  const serialized = JSON.stringify(state);
  if (env.DB) {
    try {
      await env.DB.prepare(
        'INSERT INTO nhantri_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
        .bind('main', serialized)
        .run();
    } catch {
      // ignore transient D1 write failure
    }
  }
  if (env.NHANTRI_KV) {
    try {
      await env.NHANTRI_KV.put('nhantri:state', serialized);
    } catch {
      // ignore transient KV write failure
    }
  }
}

// ============================================================
// WEB CRYPTO HMAC AUTH & PBKDF2 PASSCODE HASHING
// ============================================================

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

async function signToken(user: AuthUser, env: WorkerEnv): Promise<string> {
  const secret = env.SESSION_SECRET?.trim() || FALLBACK_SECRET;
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 12 })),
  );
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token: string, env: WorkerEnv): Promise<AuthUser | null> {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const secret = env.SESSION_SECRET?.trim() || FALLBACK_SECRET;
    const expected = await hmacSign(payload, secret);
    if (!timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expected))) {
      return null;
    }
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) return null;
    return {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
      linkedStudentId: decoded.linkedStudentId,
      linkedTeacherId: decoded.linkedTeacherId,
    };
  } catch {
    return null;
  }
}

async function hashPasscode(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `pbkdf2:${toBase64Url(salt)}:${toBase64Url(new Uint8Array(bits))}`;
}

async function verifyPasscode(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const salt = fromBase64Url(parts[1]);
  const expected = fromBase64Url(parts[2]);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

async function getRequestUser(req: Request, env: WorkerEnv): Promise<AuthUser | null> {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7).trim(), env);
}

// ============================================================
// GEMINI AI HELPERS (CLOUDFLARE EDGE COMPATIBLE)
// ============================================================

function getGeminiClient(env: WorkerEnv): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trong Cloudflare Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadSafeSampleBase64(
  req: Request,
  env: WorkerEnv,
  filename: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!ALLOWED_SAMPLE_FILES.has(filename)) return null;
  const assetUrl = new URL(`/assets/aistudio/${filename}`, req.url).toString();
  const res = env.ASSETS ? await env.ASSETS.fetch(assetUrl) : await fetch(assetUrl);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return { base64: arrayBufferToBase64(buf), mimeType: 'image/jpeg' };
}

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
    if (
      s.day === candidate.day &&
      s.period === candidate.period &&
      s.shift === candidate.shift &&
      s.status !== 'OFF'
    ) {
      if (s.teacherId === candidate.teacherId) {
        conflicts.push(
          `Trùng lịch giáo viên: ${s.teacherName} đang dạy ${s.subject} cho ${s.centerClass} tại ${s.room}.`,
        );
      }
      if (s.room === candidate.room) {
        conflicts.push(
          `Trùng phòng học: ${s.room} đang sử dụng bởi ${s.centerClass} (${s.subject} – ${s.teacherName}).`,
        );
      }
      if (s.centerClass === candidate.centerClass) {
        conflicts.push(`Trùng lịch lớp: ${s.centerClass} đã có tiết ${s.subject} trong ca này.`);
      }
    }
  }
  return conflicts;
}

// ============================================================
// MAIN API ROUTER
// ============================================================

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const user = await getRequestUser(request, env);

  const requireRole = (roles?: UserRole[]): Response | null => {
    if (!user) {
      return json({ error: 'Vui lòng đăng nhập phiên làm việc để thực hiện thao tác này.' }, 401);
    }
    if (roles && roles.length > 0 && !roles.includes(user.role)) {
      return json({ error: 'Tài khoản hiện tại không đủ quyền truy cập chức năng này.' }, 403);
    }
    return null;
  };

  const readJson = async <T = Record<string, unknown>>(): Promise<T> => {
    try {
      return (await request.json()) as T;
    } catch {
      return {} as T;
    }
  };

  // 1. BOOTSTRAP
  if (method === 'GET' && pathname === '/api/v1/bootstrap') {
    const db = await loadState(env);
    const hasEnvPass = Boolean(env.ADMIN_PASSCODE && env.ADMIN_PASSCODE.trim());
    return json({
      center: {
        name: 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ',
        shortName: 'Nhân Trí',
        slogan: 'Trao tri thức – Gửi yêu thương',
        philosophy:
          'Soạn bài, trả bài, làm bài tập theo thời khóa biểu trong lớp · Tận tâm, tận lực, tận tình',
        campuses: [
          'Cơ sở 1: TP. Long Xuyên, Tỉnh An Giang',
          'Cơ sở 2: Trung Tâm Nhân Trí 2 — TP. Long Xuyên, Tỉnh An Giang',
        ],
        hotlineZalo: '0918 990 999',
        email: 'lienhe@nhantri.edu.vn',
      },
      courses: db.courses,
      teachers: db.teachers,
      gallery: REAL_CENTER_GALLERY,
      examsSummary: db.exams.map(
        ({
          id,
          title,
          level,
          grade,
          subject,
          durationMinutes,
          curriculumStandard,
          difficulty,
          attemptsCount,
          questions,
        }) => ({
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
        }),
      ),
      stats: {
        activeStudents: db.students.filter((s) => s.status === 'ACTIVE').length,
        teachersCount: db.teachers.length,
        examsCount: db.exams.length,
        campusesCount: 2,
      },
      security: {
        adminPasscodeConfigured: hasEnvPass || Boolean(db.adminPasscodeHash),
        usingEnvPasscode: hasEnvPass,
      },
    });
  }

  // 2. AUTH ROUTES
  if (method === 'POST' && pathname === '/api/v1/auth/role-session') {
    const body = await readJson<{ role?: string; passcode?: string }>();
    const role = String(body.role || '').toUpperCase() as UserRole;
    const account = DEMO_ACCOUNTS[role];
    if (!account) return json({ error: 'Vai trò không hợp lệ.' }, 400);

    if (role === 'ADMIN') {
      const db = await loadState(env);
      const envPass = env.ADMIN_PASSCODE?.trim();
      const submitted = typeof body.passcode === 'string' ? body.passcode : '';
      if (envPass) {
        if (submitted !== envPass) {
          return json({ error: 'Vui lòng nhập mật khẩu Quản trị viên (ADMIN_PASSCODE).', requiresPasscode: true }, 401);
        }
      } else if (db.adminPasscodeHash) {
        const ok = submitted ? await verifyPasscode(submitted, db.adminPasscodeHash) : false;
        if (!ok) {
          return json({ error: 'Mật khẩu Quản trị viên không chính xác.', requiresPasscode: true }, 401);
        }
      }
    }

    const token = await signToken(account, env);
    return json({ token, user: account });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/admin-claim') {
    if (env.ADMIN_PASSCODE?.trim()) {
      return json({ error: 'Mật khẩu quản trị đã được cấu hình qua biến môi trường ADMIN_PASSCODE.' }, 409);
    }
    const db = await loadState(env);
    if (db.adminPasscodeHash) {
      return json({ error: 'Mật khẩu quản trị đã được thiết lập trước đó.' }, 409);
    }
    const body = await readJson<{ passcode?: string }>();
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (passcode.length < 6) {
      return json({ error: 'Mật khẩu quản trị cần tối thiểu 6 ký tự.' }, 400);
    }
    db.adminPasscodeHash = await hashPasscode(passcode);
    await saveState(env, db);
    const token = await signToken(DEMO_ACCOUNTS.ADMIN, env);
    return json({ token, user: DEMO_ACCOUNTS.ADMIN, claimed: true });
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    const denied = requireRole();
    if (denied) return denied;
    return json({ user });
  }

  // 3. WORKSPACE
  if (method === 'GET' && pathname === '/api/v1/workspace') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const isStaff = user!.role === 'ADMIN' || user!.role === 'TEACHER';

    return json({
      user,
      teachers: db.teachers,
      students: isStaff ? db.students : db.students.filter((s) => s.id === user!.linkedStudentId),
      timetable: db.timetable,
      scores: isStaff ? db.scores : db.scores.filter((sc) => sc.studentId === user!.linkedStudentId),
      attendance: isStaff ? db.attendance : db.attendance.filter((a) => a.studentId === user!.linkedStudentId),
      tuition: isStaff ? db.tuition : db.tuition.filter((t) => t.studentId === user!.linkedStudentId),
      expenses: user!.role === 'ADMIN' ? db.expenses : [],
      exams: db.exams,
      tickets: isStaff
        ? db.tickets
        : db.tickets.filter((t) => t.authorRole === user!.role || t.authorName.includes('Hòa')),
      notifications: db.notifications.filter(
        (n) => n.targetRole === 'ALL' || n.targetRole === user!.role || user!.role === 'ADMIN',
      ),
    });
  }

  // 4. PUBLIC ENROLLMENT
  if (method === 'POST' && pathname === '/api/v1/enrollments') {
    const b = await readJson<Record<string, unknown>>();
    const studentName = String(b.studentName || '').trim();
    const parentPhone = String(b.parentPhone || '').trim();
    if (studentName.length < 2) return json({ error: 'Vui lòng nhập họ tên học sinh.' }, 400);
    if (parentPhone.length < 8) return json({ error: 'Vui lòng nhập số điện thoại Zalo phụ huynh hợp lệ.' }, 400);

    const db = await loadState(env);
    const course = db.courses.find((c) => c.id === b.courseId) || db.courses[1];
    const numericGrade = Math.min(12, Math.max(3, Number(b.grade) || 6));
    const subjectsArray =
      Array.isArray(b.selectedSubjects) && b.selectedSubjects.length > 0
        ? b.selectedSubjects.map(String)
        : course.subjects.slice(0, 3);

    const baseMonthly =
      course.billingModel === 'PER_SUBJECT'
        ? course.monthlyPrice * subjectsArray.length
        : course.monthlyPrice;
    const boardingAmt = b.hasBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
    const shuttleAmt = b.hasShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
    const subtotal = baseMonthly + boardingAmt + shuttleAmt;
    const discount = b.annualPrepaid ? Math.round(subtotal * (course.annualDiscountPercent / 100)) : 0;
    const totalAmount = subtotal - discount;

    const newStudentId = `st-${Date.now()}`;
    const centerClass =
      numericGrade <= 5 ? 'Lớp 4,5' : numericGrade <= 9 ? `Lớp ${numericGrade}A1` : `Lớp ${numericGrade}`;
    const validPeDays: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const peDay = validPeDays.includes(b.peConflictDay as DayOfWeek) ? (b.peConflictDay as DayOfWeek) : undefined;

    const newStudent: Student = {
      id: newStudentId,
      code: `NT-${numericGrade}-${String(db.students.length + 1).padStart(2, '0')}`,
      fullName: studentName,
      grade: numericGrade,
      level: course.level,
      centerClass,
      schoolClass: `${numericGrade}A`,
      school: typeof b.school === 'string' && b.school.trim() ? b.school.trim() : 'THCS Lý Thường Kiệt',
      homeroomTeacher: numericGrade <= 5 ? 'Cô Tâm' : numericGrade <= 9 ? 'Cô Nghi' : 'Cô Mẫn',
      room: numericGrade <= 5 ? 'Phòng 1' : 'Phòng 2',
      parentName: typeof b.parentName === 'string' && b.parentName.trim() ? b.parentName.trim() : 'Phụ huynh mới',
      parentPhone,
      parentZalo: parentPhone,
      packageType: course.billingModel,
      hasBoarding: Boolean(b.hasBoarding),
      hasShuttle: Boolean(b.hasShuttle),
      annualPrepaid: Boolean(b.annualPrepaid),
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
      monthLabel: b.annualPrepaid ? 'Đăng ký mới (Ưu đãi nguyên năm -10%)' : 'Tháng 12/2026 (Đăng ký mới)',
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

    db.students.unshift(newStudent);
    db.tuition.unshift(newTuition);
    db.tickets.unshift({
      id: `tk-${Date.now()}`,
      createdAt: nowFormatted(),
      authorName: `${newStudent.parentName} (PH em ${newStudent.fullName})`,
      authorRole: 'GUEST',
      phone: newStudent.parentPhone,
      category: 'CONSULTATION',
      subject: `Đăng ký khóa ${course.title}`,
      message: `Đăng ký lớp ${centerClass}, môn: ${subjectsArray.join(', ')}.`,
      status: 'OPEN',
    });
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      createdAt: nowFormatted(),
      title: 'Đăng ký khóa học mới',
      body: `Em ${newStudent.fullName} (${centerClass}) vừa đăng ký ${course.title}.`,
      channel: 'APP',
      targetRole: 'ADMIN',
      read: false,
    });
    await saveState(env, db);
    return json({ student: newStudent, tuition: newTuition }, 201);
  }

  // 5. STUDENTS & BULK IMPORT
  if (method === 'POST' && pathname === '/api/v1/students') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const b = await readJson<Record<string, unknown>>();
    const fullName = String(b.fullName || '').trim();
    if (!fullName) return json({ error: 'Thiếu họ tên học sinh.' }, 400);
    const db = await loadState(env);
    const grade = Math.min(12, Math.max(3, Number(b.grade) || 7));
    const student: Student = {
      id: `st-${Date.now()}`,
      code: `NT-${grade}-${String(db.students.length + 1).padStart(2, '0')}`,
      fullName,
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
      enrolledSubjects: ['Toán', 'Ngữ Văn', 'Tiếng Anh'],
      status: 'ACTIVE',
    };
    db.students.unshift(student);
    await saveState(env, db);
    return json({ student }, 201);
  }

  if (method === 'POST' && pathname === '/api/v1/students/import') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const b = await readJson<{ students?: Record<string, unknown>[] }>();
    const rows = Array.isArray(b.students) ? b.students : [];
    if (rows.length === 0) return json({ error: 'Không có dữ liệu học sinh để nhập.' }, 400);
    const db = await loadState(env);
    const imported: Student[] = [];
    for (const row of rows.slice(0, 100)) {
      const fullName = String(row.fullName || '').trim();
      if (!fullName) continue;
      const centerClass = String(row.centerClass || 'Lớp 7A1').trim();
      const gradeMatch = centerClass.match(/\d+/);
      const grade = gradeMatch ? Math.min(12, Math.max(3, Number(gradeMatch[0]))) : 7;
      imported.push({
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
      });
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
    await saveState(env, db);
    return json({ importedCount: imported.length, students: imported }, 201);
  }

  // 6. TIMETABLE ROUTES
  if (method === 'POST' && pathname === '/api/v1/timetable/check-conflict') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<{
      id?: string;
      day: DayOfWeek;
      period: SessionPeriod;
      shift: ShiftCode;
      teacherId: string;
      room: string;
      centerClass: string;
    }>();
    const conflicts = findConflicts(db.timetable, b);
    return json({ hasConflict: conflicts.length > 0, conflicts });
  }

  if (method === 'POST' && pathname === '/api/v1/timetable') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<{
      day: DayOfWeek;
      period: SessionPeriod;
      shift: ShiftCode;
      centerClass: string;
      subject: string;
      teacherId: string;
      room: string;
      slotType?: TimetableSlot['slotType'];
      note?: string;
    }>();
    const teacher = db.teachers.find((t) => t.id === b.teacherId);
    if (!teacher || !b.day || !b.period || !b.shift || !b.centerClass || !b.subject || !b.room) {
      return json({ error: 'Vui lòng điền đầy đủ thông tin tiết học.' }, 400);
    }
    const conflicts = findConflicts(db.timetable, b);
    if (conflicts.length > 0) return json({ error: conflicts[0], conflicts }, 409);

    const key = `${b.period}_${b.shift}` as keyof typeof SHIFT_TIMES;
    const newSlot: TimetableSlot = {
      id: `tt-${Date.now()}`,
      weekLabel: 'Tuần 13 (23/11 – 28/11)',
      period: b.period,
      shift: b.shift,
      timeRange: SHIFT_TIMES[key] || '17:30–19:00',
      day: b.day,
      centerClass: String(b.centerClass),
      subject: String(b.subject),
      teacherId: teacher.id,
      teacherName: teacher.shortName,
      room: String(b.room),
      slotType: b.slotType || 'MAIN',
      status: 'SCHEDULED',
      note: b.note ? String(b.note) : undefined,
    };
    db.timetable.push(newSlot);
    await saveState(env, db);
    return json({ slot: newSlot }, 201);
  }

  const subSuggestMatch = pathname.match(/^\/api\/v1\/timetable\/([^/]+)\/suggest-substitute$/);
  if (method === 'POST' && subSuggestMatch) {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === subSuggestMatch[1]);
    if (!slot) return json({ error: 'Không tìm thấy tiết học.' }, 404);
    const busyIds = new Set(
      db.timetable
        .filter((s) => s.day === slot.day && s.period === slot.period && s.shift === slot.shift && s.id !== slot.id)
        .map((s) => s.teacherId),
    );
    const norm = slot.subject.toLowerCase();
    const substituteTeachers = db.teachers
      .filter((t) => t.id !== slot.teacherId && !busyIds.has(t.id) && t.status === 'ACTIVE')
      .map((t) => {
        const exact = t.subjects.some(
          (sub) => norm.includes(sub.toLowerCase()) || sub.toLowerCase().includes(norm.split(' ')[0]),
        );
        return {
          teacherId: t.id,
          teacherName: t.shortName,
          fullName: t.name,
          subjects: t.subjects,
          matchScore: exact ? 'Đúng chuyên môn · Đang trống ca' : 'Có thể hỗ trợ Trả bài / Kèm',
          isExactSubject: exact,
        };
      })
      .sort((a, b) => Number(b.isExactSubject) - Number(a.isExactSubject))
      .slice(0, 5);

    return json({
      slot,
      substituteTeachers,
      eveningMakeupSuggestion: {
        day: slot.day,
        period: 'TOI',
        shift: 'CA_1',
        timeRange: '17:30–19:00',
        room: 'Phòng 2',
        reason: 'Chuyển sang ca Tối 17h30–19h00 ghép Trả bài / Học bù không xung đột lịch chính khóa.',
      },
    });
  }

  const subApplyMatch = pathname.match(/^\/api\/v1\/timetable\/([^/]+)\/substitute$/);
  if (method === 'PATCH' && subApplyMatch) {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === subApplyMatch[1]);
    if (!slot) return json({ error: 'Không tìm thấy tiết học.' }, 404);
    const b = await readJson<{ newTeacherId?: string; action?: string }>();
    if (b.action === 'MOVE_TO_EVENING_MAKEUP') {
      slot.period = 'TOI';
      slot.shift = 'CA_1';
      slot.timeRange = '17:30–19:00';
      slot.slotType = 'BU_THE_DUC';
      slot.status = 'SUBSTITUTED';
      slot.note = 'Đã chuyển lịch học bù ca Tối (17h30–19h00) và thông báo phụ huynh.';
    } else {
      const subTeacher = db.teachers.find((t) => t.id === b.newTeacherId);
      if (!subTeacher) return json({ error: 'Giáo viên dạy thay không hợp lệ.' }, 400);
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
      body: `Tiết ${slot.subject} (${slot.timeRange}) đã cập nhật: ${slot.teacherName} — ${slot.note}.`,
      channel: 'ZALO',
      targetRole: 'ALL',
      read: false,
    });
    await saveState(env, db);
    return json({ slot });
  }

  const delSlotMatch = pathname.match(/^\/api\/v1\/timetable\/([^/]+)$/);
  if (method === 'DELETE' && delSlotMatch) {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    db.timetable = db.timetable.filter((s) => s.id !== delSlotMatch[1]);
    await saveState(env, db);
    return json({ deleted: true });
  }

  const icsMatch = pathname.match(/^\/api\/v1\/timetable\/student\/([^/]+)\/ics$/);
  if (method === 'GET' && icsMatch) {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === icsMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy học sinh.' }, 404);
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
        `DESCRIPTION:Lớp ${slot.centerClass} · Học sinh ${student.fullName}`,
        'RRULE:FREQ=WEEKLY;COUNT=12',
        'END:VEVENT',
      ].join('\r\n');
    });
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Trung Tam Nhan Tri//TKB Ca Nhan Hoa//VI',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');
    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="TKB-NhanTri-${student.code}.ics"`,
      },
    });
  }

  // 7. SCORES & ATTENDANCE
  if (method === 'POST' && pathname === '/api/v1/scores') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const student = db.students.find((s) => s.id === b.studentId);
    if (!student) return json({ error: 'Vui lòng chọn học sinh hợp lệ.' }, 400);
    const numericScore = Number(b.score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 10) {
      return json({ error: 'Điểm số phải nằm trong thang điểm 0 – 10.' }, 400);
    }
    const record: ScoreRecord = {
      id: `sc-${Date.now()}`,
      studentId: student.id,
      studentName: student.fullName,
      centerClass: student.centerClass,
      subject: String(b.subject || 'Toán').trim(),
      examType: (b.examType as ScoreRecord['examType']) || '15_PHUT',
      score: Math.round(numericScore * 100) / 100,
      maxScore: 10,
      date: String(b.date || todayIso()),
      school: String(b.school || student.school),
      source: (b.source as ScoreRecord['source']) || (user!.role === 'STUDENT' ? 'SELF_ENTRY' : 'TEACHER'),
      verified: user!.role === 'ADMIN' || user!.role === 'TEACHER',
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
      body: `Điểm ${record.score}/10. Đã cập nhật Học bạ Online Nhân Trí.`,
      channel: 'ZALO',
      targetRole: 'PARENT',
      read: false,
    });
    await saveState(env, db);
    return json({ score: record }, 201);
  }

  if (method === 'POST' && pathname === '/api/v1/attendance') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<{
      studentId?: string;
      shiftLabel?: string;
      status?: AttendanceRecord['status'];
      note?: string;
    }>();
    const student = db.students.find((s) => s.id === b.studentId);
    if (!student) return json({ error: 'Không tìm thấy học sinh.' }, 400);
    const rec: AttendanceRecord = {
      id: `att-${Date.now()}`,
      date: todayIso(),
      studentId: student.id,
      studentName: student.fullName,
      centerClass: student.centerClass,
      shiftLabel: String(b.shiftLabel || 'Chiều Ca 2 (15:15–16:45)'),
      status: b.status || 'PRESENT',
      note: b.note ? String(b.note) : undefined,
      parentNotified: true,
    };
    db.attendance.unshift(rec);
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      createdAt: nowFormatted(),
      title: `Điểm danh tự động · ${student.fullName}`,
      body: `Trạng thái: ${rec.status} (${rec.shiftLabel}). Đã gửi thông báo Zalo tới phụ huynh.`,
      channel: 'ZALO',
      targetRole: 'PARENT',
      read: false,
    });
    await saveState(env, db);
    return json({ attendance: rec }, 201);
  }

  // 8. TUITION & REMINDERS
  const payMatch = pathname.match(/^\/api\/v1\/tuition\/([^/]+)\/pay$/);
  if (method === 'PATCH' && payMatch) {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const rec = db.tuition.find((t) => t.id === payMatch[1]);
    if (!rec) return json({ error: 'Không tìm thấy phiếu học phí.' }, 404);
    const b = await readJson<{ paymentMethod?: TuitionRecord['paymentMethod'] }>();
    rec.paidAmount = rec.totalAmount;
    rec.status = 'PAID';
    rec.paymentMethod = b.paymentMethod || 'VIETQR';
    rec.paidAt = todayIso();
    await saveState(env, db);
    return json({ tuition: rec });
  }

  const remindMatch = pathname.match(/^\/api\/v1\/tuition\/([^/]+)\/remind$/);
  if (method === 'POST' && remindMatch) {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const rec = db.tuition.find((t) => t.id === remindMatch[1]);
    if (!rec) return json({ error: 'Không tìm thấy phiếu công nợ.' }, 404);
    rec.remindersSent += 1;
    const remaining = rec.totalAmount - rec.paidAmount;
    await saveState(env, db);
    return json({
      tuition: rec,
      reminderMessage: `Trung Tâm Nhân Trí kính báo học phí ${rec.monthLabel} của em ${rec.studentName} (${rec.centerClass}) còn ${remaining.toLocaleString('vi-VN')}đ.`,
    });
  }

  // 9. EXAM SUBMISSION
  const examSubmitMatch = pathname.match(/^\/api\/v1\/exams\/([^/]+)\/submit$/);
  if (method === 'POST' && examSubmitMatch) {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const exam = db.exams.find((e) => e.id === examSubmitMatch[1]);
    if (!exam) return json({ error: 'Không tìm thấy đề thi.' }, 404);
    const b = await readJson<{ answers?: number[]; studentId?: string }>();
    const answers = Array.isArray(b.answers) ? b.answers : [];
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
    const score = Math.round((correctCount / exam.questions.length) * 10 * 100) / 100;
    exam.attemptsCount += 1;
    const targetStudentId = b.studentId || user!.linkedStudentId || db.students[0]?.id;
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
    await saveState(env, db);
    return json({ correctCount, totalQuestions: exam.questions.length, score, breakdown, savedScore });
  }

  // 10. TICKETS, NOTIFICATIONS & CLOUDFLARE SCHEMA
  if (method === 'POST' && pathname === '/api/v1/tickets') {
    const b = await readJson<Record<string, unknown>>();
    const authorName = String(b.authorName || '').trim();
    const message = String(b.message || '').trim();
    if (!authorName || !message) return json({ error: 'Vui lòng nhập họ tên và nội dung.' }, 400);
    const db = await loadState(env);
    const ticket: FeedbackTicket = {
      id: `tk-${Date.now()}`,
      createdAt: nowFormatted(),
      authorName,
      authorRole: user?.role || 'GUEST',
      phone: b.phone ? String(b.phone).trim() : undefined,
      category: (b.category as FeedbackTicket['category']) || 'FEEDBACK',
      subject: String(b.subject || 'Yêu cầu hỗ trợ').trim(),
      message,
      status: 'OPEN',
    };
    db.tickets.unshift(ticket);
    await saveState(env, db);
    return json({ ticket }, 201);
  }

  const ticketReplyMatch = pathname.match(/^\/api\/v1\/tickets\/([^/]+)\/reply$/);
  if (method === 'PATCH' && ticketReplyMatch) {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const ticket = db.tickets.find((t) => t.id === ticketReplyMatch[1]);
    if (!ticket) return json({ error: 'Không tìm thấy yêu cầu.' }, 404);
    const b = await readJson<{ reply?: string }>();
    ticket.reply = String(b.reply || '').trim();
    ticket.status = 'RESOLVED';
    await saveState(env, db);
    return json({ ticket });
  }

  if (method === 'POST' && pathname === '/api/v1/notifications/read-all') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    db.notifications.forEach((n) => {
      n.read = true;
    });
    await saveState(env, db);
    return json({ ok: true });
  }

  if (method === 'GET' && pathname === '/api/v1/system/cloudflare-schema') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    return json({
      sql: CLOUDFLARE_D1_SCHEMA_SQL,
      workerNotes:
        'Cloudflare Worker (worker/index.ts) và Pages Functions (functions/api/[[path]].ts) đã sẵn sàng. Hỗ trợ tự động lưu Cloudflare D1 (binding DB), KV (NHANTRI_KV) hoặc chạy tức thì không cần cấu hình thêm.',
    });
  }

  // 11. GEMINI AI ROUTES (EDGE WORKER)
  if (method === 'POST' && pathname === '/api/v1/ai/analyze-test') {
    const denied = requireRole();
    if (denied) return denied;
    try {
      const b = await readJson<{ imageBase64?: string; mimeType?: string; sampleFilename?: string }>();
      let base64Data = typeof b.imageBase64 === 'string' ? b.imageBase64 : '';
      let mimeType = typeof b.mimeType === 'string' ? b.mimeType : 'image/jpeg';
      if (!base64Data && typeof b.sampleFilename === 'string') {
        const sample = await loadSafeSampleBase64(request, env, b.sampleFilename);
        if (!sample) return json({ error: 'Ảnh mẫu không hợp lệ.' }, 400);
        base64Data = sample.base64;
        mimeType = sample.mimeType;
      }
      if (!base64Data) return json({ error: 'Vui lòng tải ảnh bài kiểm tra hoặc chọn ảnh mẫu.' }, 400);
      const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const ai = getGeminiClient(env);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleaned } },
            {
              text:
                'Bạn là trợ lý học vụ tại Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Long Xuyên). ' +
                'Đọc ảnh bài kiểm tra và trích xuất họ tên học sinh, lớp, trường, môn học, loại bài (15_PHUT, 1_TIET, GIUA_KY, CUOI_KY), điểm (thang 10), tóm tắt, điểm mạnh và lỗi sai cần khắc phục.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studentName: { type: Type.STRING },
              schoolClass: { type: Type.STRING },
              school: { type: Type.STRING },
              subject: { type: Type.STRING },
              examType: { type: Type.STRING },
              score: { type: Type.NUMBER },
              maxScore: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['studentName', 'subject', 'examType', 'score', 'maxScore', 'summary', 'strengths', 'improvements'],
          },
        },
      });
      const analysis = JSON.parse((response.text ?? '{}').trim());
      return json({ analysis });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : 'Lỗi phân tích ảnh bài kiểm tra.' }, 500);
    }
  }

  if (method === 'POST' && pathname === '/api/v1/ai/import-students-image') {
    const denied = requireRole(['ADMIN', 'TEACHER']);
    if (denied) return denied;
    try {
      const b = await readJson<{ imageBase64?: string; mimeType?: string; sampleFilename?: string }>();
      let base64Data = typeof b.imageBase64 === 'string' ? b.imageBase64 : '';
      let mimeType = typeof b.mimeType === 'string' ? b.mimeType : 'image/jpeg';
      if (!base64Data && typeof b.sampleFilename === 'string') {
        const sample = await loadSafeSampleBase64(request, env, b.sampleFilename);
        if (!sample) return json({ error: 'Ảnh danh sách mẫu không hợp lệ.' }, 400);
        base64Data = sample.base64;
        mimeType = sample.mimeType;
      }
      if (!base64Data) return json({ error: 'Vui lòng tải ảnh danh sách học sinh.' }, 400);
      const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const ai = getGeminiClient(env);
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleaned } },
            {
              text:
                'Trích xuất danh sách học sinh từ ảnh bảng danh sách của Trung Tâm Dạy Thêm Nhân Trí gồm fullName, schoolClass, school, centerClass, parentPhone (ẩn 3 số giữa bằng ***), homeroomTeacher.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                schoolClass: { type: Type.STRING },
                school: { type: Type.STRING },
                centerClass: { type: Type.STRING },
                parentPhone: { type: Type.STRING },
                homeroomTeacher: { type: Type.STRING },
              },
              required: ['fullName', 'centerClass'],
            },
          },
        },
      });
      const rows = JSON.parse((response.text ?? '[]').trim());
      return json({ rows: Array.isArray(rows) ? rows.slice(0, 50) : [] });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : 'Lỗi nhận dạng danh sách học sinh.' }, 500);
    }
  }

  if (method === 'POST' && pathname === '/api/v1/ai/consult') {
    try {
      const b = await readJson<{ question?: string; language?: string }>();
      const question = typeof b.question === 'string' ? b.question.trim() : '';
      if (!question) return json({ error: 'Vui lòng nhập câu hỏi cần tư vấn.' }, 400);
      const db = await loadState(env);
      const ai = getGeminiClient(env);
      const lang = b.language === 'en' ? 'en' : 'vi';
      const systemInstruction =
        lang === 'en'
          ? 'You are the 24/7 Academic Advisor of Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Long Xuyên). Answer concisely in English based on center tuition: Primary 1.1M VND/month, Middle School all-in-one 1.85M VND/month (+950k boarding, +450k shuttle), High School 650k/subject/month, 10% annual prepayment discount, automatic evening makeup (17:30-19:00) for PE conflicts.'
          : 'Bạn là Trợ lý Học vụ & Tư vấn 24/7 của Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Long Xuyên — Trao tri thức, Gửi yêu thương). Trả lời rõ ràng, ngắn gọn: Cấp 1 dạy kèm 1.100.000đ/tháng; Cấp 2 trọn gói 1.850.000đ/tháng (có trả bài, tùy chọn bán trú +950k, đưa rước +450k); Cấp 3 theo môn 650.000đ/môn/tháng; đóng nguyên năm giảm 10%; trùng Thể dục tự xếp bù tối 17h30–19h00.';
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Hiện có ${db.students.length} học sinh, ${db.teachers.length} giáo viên, ${db.exams.length} đề thi mẫu.\nCâu hỏi: ${question}`,
        config: { systemInstruction },
      });
      return json({ answer: (response.text ?? '').trim() });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : 'Không thể kết nối trợ lý AI.' }, 500);
    }
  }

  return json({ error: 'Không tìm thấy endpoint API.' }, 404);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Static assets binding (ASSETS) not configured.', { status: 404 });
  },
};
