import { GoogleGenAI, Type } from '@google/genai';
import firebaseConfig from '../firebase-applet-config.json';
import {
  FANPAGE_POSTS_FEED,
  INITIAL_DB,
  OFFICIAL_FANPAGE_URL,
  REAL_CENTER_GALLERY,
} from '../server/seedData.ts';
import { CLOUDFLARE_D1_SCHEMA_SQL } from '../server/schemaSql.ts';
import {
  canStudentUsePersonalGmail,
  DEFAULT_AUTH_POLICY,
  generateAccessPin,
  maskPhoneVN,
  normalizePhoneVN,
} from '../src/lib/identityPolicy.ts';
import {
  ALL_SHIFT_KEYS,
  evaluateMoveOrSwap,
  evaluateSlotConstraints,
  getTimeRangeForShift,
  studentBelongsToClass,
  suggestAvailableSubstitutes,
} from '../src/lib/timetableEngine.ts';
import {
  calculateTuitionBreakdown,
  findFamilyForStudent,
  getStudentsInFamily,
} from '../src/lib/tuitionCalculator.ts';
import {
  computeQuickClassSnapshot,
  getVietnamClock,
} from '../src/lib/quickClassEngine.ts';
import {
  DEFAULT_FALLBACK_THUMBNAIL,
  fetchSocialUrlMetadata,
  fetchYouTubeChannelRssPosts,
  validateSocialUrl,
} from '../src/lib/socialFetcher.ts';
import {
  dispatchUpcomingReminders,
  getOrBuildUserNotificationPref,
  resolvePrefKey,
  validateWebhookUrl,
} from '../src/lib/reminderDispatcher.ts';
import { smartExtractWithGemini } from '../server/gemini.ts';
import {
  buildDeterministicQrToken,
  generateQrToken,
  generateSmartStudentCode,
} from '../src/lib/smartCodeAndQr.ts';
import {
  buildUnlockedQrStudentData,
  bulkImportScores,
  bulkUpsertStudents,
  bulkUpsertTeachers,
  findStudentByQrTokenOrCode,
  recordQrAttendanceCheckIn,
  smartSyncTimetable,
} from '../src/lib/smartBulkOperations.ts';
import {
  buildParentClassCancelNotice,
  computeSubstituteSuggestions,
  diffTeacherProfileFields,
  findAffectedSlotsForLeave,
  formatShiftLabel,
  makeShiftKey,
  recordTimetableChange,
  slotToSnapshot,
} from '../src/lib/teacherSelfService.ts';
import {
  auditDatabaseHealth,
  cascadeSyncRoomUpdate,
  cascadeSyncStudentUpdate,
  cascadeSyncTeacherUpdate,
  ensureSystemPrintTemplates,
  normalizeLookupKey,
  repairDatabaseHealth,
} from '../src/lib/workspaceIntegrity.ts';
import {
  DEFAULT_EDITORIAL_ARTICLES,
  DEFAULT_PROMO_BANNERS,
  ensureDefaultReusableBlocks,
  isExactConfirmNameMatch,
  sanitizeRichHtml,
  sanitizeSafeUrl,
  slugifyVietnamese,
} from '../src/lib/contentStudioEngine.ts';
import type {
  AccessAuditLog,
  AttendanceRecord,
  AuthPolicy,
  AuthUser,
  BillingCycle,
  ClassCheckInRecord,
  DatabaseState,
  DayOfWeek,
  EducationLevel,
  FamilyProfile,
  FeedbackTicket,
  PrintTemplate,
  PrintTemplateBlocks,
  PrintTemplateEntityType,
  PrintTemplateGroupBy,
  PrintTemplatePreset,
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
  ALLOW_DEMO_LOGIN?: string;
}

const SUPER_ADMIN_EMAIL = 'duyweb5@gmail.com';
const ADMIN_EMAIL = 'lethituman2021@gmail.com';
const ADMIN_EMAIL_SECONDARY = 'trungtamnhantri2026@gmail.com';
const ADMIN_EMAILS: readonly string[] = [ADMIN_EMAIL, ADMIN_EMAIL_SECONDARY];

function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

const DEMO_ACCOUNTS: Record<UserRole, AuthUser> = {
  SUPER_ADMIN: {
    id: 'usr-super-admin',
    name: 'SuperAdmin Hệ thống Nhân Trí',
    email: SUPER_ADMIN_EMAIL,
    role: 'SUPER_ADMIN',
  },
  ADMIN: {
    id: 'usr-admin',
    name: 'Admin Quản trị Vận hành (Cô Mẫn)',
    email: ADMIN_EMAIL,
    role: 'ADMIN',
  },
  MANAGER: {
    id: 'usr-manager',
    name: 'Cô Tâm — Người quản lý Học vụ & TKB',
    email: 'quanly@daythemnhantri.com',
    role: 'MANAGER',
  },
  TEACHER: {
    id: 'usr-teacher',
    name: 'Cô Nguyễn Thị Mẫn (GV Toán)',
    email: 'co.man@daythemnhantri.com',
    role: 'TEACHER',
    linkedTeacherId: 't-man',
  },
  PARENT: {
    id: 'usr-parent',
    name: 'Anh Nguyễn Văn Phúc (PH em Hòa & Quế Anh)',
    email: 'ph.phuchoa@gmail.com',
    role: 'PARENT',
    linkedStudentId: 'st-01',
    linkedStudentIds: ['st-01', 'st-11'],
  },
  STUDENT: {
    id: 'usr-student',
    name: 'Nguyễn Phúc Hòa (Lớp 6A1)',
    email: 'hoanp.6a1@daythemnhantri.com',
    role: 'STUDENT',
    linkedStudentId: 'st-01',
    linkedStudentIds: ['st-01'],
  },
};

const ALLOWED_SAMPLE_FILES = new Set([
  'IMG_9542_4ffccfa4.webp',
  'IMG_9538_cadb03a1.webp',
  'IMG_9534_fd106b28.webp',
]);

// Lazily initialized inside request handlers (Cloudflare Workers disallows crypto.getRandomValues in global scope)
let runtimeFallbackSecret: string | null = null;

function getSessionSecret(env: WorkerEnv): string {
  const configured = env.SESSION_SECRET?.trim();
  if (configured) return configured;
  if (!runtimeFallbackSecret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    runtimeFallbackSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return runtimeFallbackSecret;
}

let isolateMemoryDb: DatabaseState | null = null;
let d1Initialized = false;
const workerRateBuckets = new Map<string, number[]>();

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function isWorkerRateLimited(req: Request, key: string, maxRequests: number, windowMs: number): boolean {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'edge';
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const recent = (workerRateBuckets.get(bucketKey) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    workerRateBuckets.set(bucketKey, recent);
    return true;
  }
  recent.push(now);
  workerRateBuckets.set(bucketKey, recent);
  return false;
}

function getAllowedStudentIds(user: AuthUser | null): string[] {
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
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `NT${grade}${suffix}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
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
// EDGE-NATIVE STORAGE (D1 -> KV -> IN-MEMORY FALLBACK)
// ============================================================

function normalizeWorkerState(parsed: DatabaseState): DatabaseState {
  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    parsed.rooms = structuredClone(INITIAL_DB.rooms);
  }
  if (!Array.isArray(parsed.teacherLeaves)) {
    parsed.teacherLeaves = structuredClone(INITIAL_DB.teacherLeaves);
  }
  if (!Array.isArray(parsed.families)) {
    parsed.families = structuredClone(INITIAL_DB.families);
  }
  parsed.teachers = (parsed.teachers || []).map((t) => ({
    ...t,
    teacherGroup:
      t.teacherGroup ||
      (t.subjects.some((s) => s.toLowerCase().includes('trả bài')) ? 'TUTOR_REVIEW' : 'SUBJECT'),
    availability:
      Array.isArray(t.availability) && t.availability.length > 0 ? t.availability : [...ALL_SHIFT_KEYS],
  }));
  if (!Array.isArray(parsed.socialChannels) || parsed.socialChannels.length === 0) {
    parsed.socialChannels = structuredClone(INITIAL_DB.socialChannels);
  }
  if (!Array.isArray(parsed.socialPosts)) {
    parsed.socialPosts = structuredClone(INITIAL_DB.socialPosts);
  }
  if (!parsed.notificationConfig) {
    parsed.notificationConfig = structuredClone(INITIAL_DB.notificationConfig);
  }
  if (!Array.isArray(parsed.notificationPrefs)) {
    parsed.notificationPrefs = structuredClone(INITIAL_DB.notificationPrefs);
  }
  if (!Array.isArray(parsed.classCheckins)) {
    parsed.classCheckins = structuredClone(INITIAL_DB.classCheckins);
  }
  if (!Array.isArray(parsed.reminderDispatchLogs)) {
    parsed.reminderDispatchLogs = structuredClone(INITIAL_DB.reminderDispatchLogs);
  }
  parsed.printTemplates = ensureSystemPrintTemplates(parsed.printTemplates);
  if (!Array.isArray(parsed.archivedStudents)) parsed.archivedStudents = [];
  if (!Array.isArray(parsed.archivedTeachers)) parsed.archivedTeachers = [];
  if (!Array.isArray(parsed.editorialArticles) || parsed.editorialArticles.length === 0) {
    parsed.editorialArticles = structuredClone(DEFAULT_EDITORIAL_ARTICLES);
  }
  parsed.reusableBlocks = ensureDefaultReusableBlocks(parsed.reusableBlocks);
  if (!Array.isArray(parsed.promoBanners) || parsed.promoBanners.length === 0) {
    parsed.promoBanners = structuredClone(DEFAULT_PROMO_BANNERS);
  }
  parsed.students = (parsed.students || []).map((st) => {
    let homeroomTeacherId = st.homeroomTeacherId;
    if (!homeroomTeacherId && st.homeroomTeacher) {
      const key = normalizeLookupKey(st.homeroomTeacher);
      const matchedT = (parsed.teachers || []).find(
        (t) => normalizeLookupKey(t.shortName) === key || normalizeLookupKey(t.name) === key,
      );
      if (matchedT) homeroomTeacherId = matchedT.id;
    }
    let roomId = st.roomId;
    if (!roomId && st.room) {
      const key = normalizeLookupKey(st.room);
      const matchedR = (parsed.rooms || []).find(
        (r) => normalizeLookupKey(r.name) === key || normalizeLookupKey(r.code) === key,
      );
      if (matchedR) roomId = matchedR.id;
    }
    return {
      ...st,
      qrToken: st.qrToken || buildDeterministicQrToken(st.id, st.code),
      homeroomTeacherId,
      roomId,
    };
  });
  return parsed;
}

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
        return normalizeWorkerState(JSON.parse(row.value) as DatabaseState);
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
      if (raw) return normalizeWorkerState(JSON.parse(raw) as DatabaseState);
      const fresh = structuredClone(INITIAL_DB);
      await saveState(env, fresh);
      return fresh;
    } catch {
      // Fallback to memory
    }
  }

  if (!isolateMemoryDb) {
    isolateMemoryDb = normalizeWorkerState(structuredClone(INITIAL_DB));
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
  const secret = getSessionSecret(env);
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
    const secret = getSessionSecret(env);
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
      photoURL: decoded.photoURL,
      role: decoded.role,
      linkedStudentId: decoded.linkedStudentId,
      linkedStudentIds: Array.isArray(decoded.linkedStudentIds) ? decoded.linkedStudentIds : undefined,
      linkedTeacherId: decoded.linkedTeacherId,
      authProvider: decoded.authProvider,
      loginChannel: decoded.loginChannel,
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
  return { base64: arrayBufferToBase64(buf), mimeType: 'image/webp' };
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
    if (roles && roles.length > 0) {
      const allowed =
        roles.includes(user.role) ||
        (user.role === 'SUPER_ADMIN' && (roles.includes('ADMIN') || roles.includes('MANAGER'))) ||
        (user.role === 'ADMIN' && roles.includes('MANAGER'));
      if (!allowed) {
        return json({ error: 'Tài khoản hiện tại không đủ quyền truy cập chức năng này.' }, 403);
      }
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

  // 1. BOOTSTRAP (STRICTLY PUBLIC — NO TIMETABLE OR TEACHER PII)
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
          'Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, Tỉnh An Giang',
          'Cơ sở 2: Trung Tâm Nhân Trí 2 — TP. Long Xuyên, Tỉnh An Giang',
        ],
        hotlineZalo: '0947 376 444 (Cô Tâm)',
        email: 'trungtamnhantri.lxag@gmail.com',
        facebookUrl: OFFICIAL_FANPAGE_URL,
        domain: 'daythemnhantri.com',
      },
      courses: db.courses,
      teachers: db.teachers.map(({ phone: _omitPhone, email: _omitEmail, ...pub }) => ({
        ...pub,
        phone: '',
      })),
      exams: db.exams,
      gallery: REAL_CENTER_GALLERY,
      fanpagePosts: FANPAGE_POSTS_FEED,
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
      authPolicy: getPolicy(db),
      socialChannels: (db.socialChannels || []).filter((c) => c.active),
      socialPosts: (db.socialPosts || []).filter((p) => p.visible),
      editorialArticles: (db.editorialArticles || []).filter((a) => a.status === 'PUBLISHED'),
      promoBanners: (db.promoBanners || []).filter((b) => b.active),
      notificationLeadMinutes: db.notificationConfig?.leadMinutes || 10,
    });
  }

  // 2. AUTH ROUTES
  if (method === 'POST' && pathname === '/api/v1/auth/role-session') {
    const db = await loadState(env);
    const policy = getPolicy(db);
    if (env.ALLOW_DEMO_LOGIN === 'false' || !policy.allowDemoPreview) {
      return json(
        { error: 'Chế độ xem thử nhanh hiện đang tắt theo Chính sách Định danh. Vui lòng đăng nhập bằng SĐT / Mã HS hoặc Gmail.' },
        403,
      );
    }
    const body = await readJson<{ role?: string; passcode?: string }>();
    const role = String(body.role || '').toUpperCase() as UserRole;
    if (role === 'SUPER_ADMIN') {
      return json({ error: 'Tài khoản SuperAdmin bắt buộc xác thực bằng Gmail chính thức.' }, 403);
    }
    const account = DEMO_ACCOUNTS[role];
    if (!account) return json({ error: 'Vai trò không hợp lệ.' }, 400);

    if (role === 'ADMIN') {
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

    const demoUser: AuthUser = { ...account, loginChannel: 'DEMO' };
    const token = await signToken(demoUser, env);
    return json({ token, user: demoUser });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/parent-login') {
    if (isWorkerRateLimited(request, 'parent-login', 8, 5 * 60_000)) {
      return json({ error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 5 phút.' }, 429);
    }
    const db = await loadState(env);
    const policy = getPolicy(db);
    if (!policy.allowParentPhoneLogin) {
      return json(
        { error: 'Đăng nhập Phụ huynh bằng Số điện thoại hiện đang tạm tắt. Vui lòng đăng nhập bằng Gmail đã đăng ký.' },
        403,
      );
    }
    const b = await readJson<{ phone?: string; secret?: string }>();
    const normPhone = normalizePhoneVN(typeof b.phone === 'string' ? b.phone : '');
    const secret = typeof b.secret === 'string' ? b.secret.trim() : '';
    if (normPhone.length < 8) {
      return json({ error: 'Vui lòng nhập số điện thoại Phụ huynh hợp lệ (10 chữ số).' }, 400);
    }
    if (policy.requireParentPinOrCode && secret.length < 4) {
      return json({ error: 'Vui lòng nhập Mã PIN gia đình hoặc Mã số học sinh của con.' }, 400);
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
      await saveState(env, db);
      return json(
        { error: 'Số điện thoại hoặc Mã PIN / Mã học sinh chưa chính xác, hoặc hồ sơ đang tạm khóa. Liên hệ Cô Tâm: 0947 376 444.' },
        401,
      );
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
    await saveState(env, db);
    const token = await signToken(parentUser, env);
    return json({ token, user: parentUser, matchedCount: matched.length });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/student-login') {
    if (isWorkerRateLimited(request, 'student-login', 10, 5 * 60_000)) {
      return json({ error: 'Bạn đã thử vào lớp quá nhiều lần. Vui lòng thử lại sau 5 phút.' }, 429);
    }
    const db = await loadState(env);
    const policy = getPolicy(db);
    const b = await readJson<{
      method?: string;
      studentCode?: string;
      phoneLast4?: string;
      phone?: string;
      secret?: string;
      studentId?: string;
    }>();
    const loginMethod = String(b.method || 'STUDENT_CODE').toUpperCase();

    if (loginMethod === 'STUDENT_CODE') {
      if (!policy.allowStudentCodeLogin) {
        return json({ error: 'Đăng nhập bằng Mã số học sinh hiện đang tạm tắt. Vui lòng chọn phương thức khác.' }, 403);
      }
      const code = String(b.studentCode || '').trim().toUpperCase();
      const phoneLast4 = String(b.phoneLast4 || '').replace(/\D/g, '');
      if (code.length < 4) {
        return json({ error: 'Vui lòng nhập Mã số học sinh hợp lệ (VD: NT-6A1-01 hoặc NT6A1H).' }, 400);
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
        await saveState(env, db);
        return json(
          { error: 'Mã số học sinh chưa chính xác hoặc hồ sơ đang tạm khóa. Vui lòng hỏi Giáo viên hoặc Cô Tâm (0947 376 444).' },
          401,
        );
      }
      if (policy.requirePhoneLast4ForStudentCode) {
        const p1 = normalizePhoneVN(student.parentPhone);
        const p2 = normalizePhoneVN(student.parentSecondaryPhone);
        const okLast4 = phoneLast4.length === 4 && (p1.endsWith(phoneLast4) || (p2.length >= 4 && p2.endsWith(phoneLast4)));
        if (!okLast4) {
          return json(
            { error: 'Vui lòng nhập đúng 4 số cuối điện thoại Phụ huynh để xác nhận vào lớp.', requiresPhoneLast4: true },
            401,
          );
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
      await saveState(env, db);
      const token = await signToken(studentUser, env);
      return json({ token, user: studentUser, student });
    }

    if (loginMethod === 'PARENT_PHONE') {
      if (!policy.allowStudentParentPhoneLogin) {
        return json({ error: 'Vào lớp bằng SĐT Phụ huynh hiện đang tạm tắt. Em hãy dùng Mã số học sinh hoặc Gmail.' }, 403);
      }
      const normPhone = normalizePhoneVN(typeof b.phone === 'string' ? b.phone : '');
      const secret = typeof b.secret === 'string' ? b.secret.trim() : '';
      const requestedStudentId = typeof b.studentId === 'string' ? b.studentId.trim() : '';
      if (normPhone.length < 8) {
        return json({ error: 'Vui lòng nhập số điện thoại Phụ huynh hợp lệ (10 chữ số).' }, 400);
      }
      if (policy.requireParentPinOrCode && secret.length < 4) {
        return json({ error: 'Vui lòng nhập Mã PIN gia đình hoặc Mã số học sinh.' }, 400);
      }
      const matched = db.students.filter(
        (s) => s.accessStatus !== 'LOCKED' && studentMatchesPhone(s, normPhone),
      );
      const secretOk =
        matched.length > 0 &&
        (!policy.requireParentPinOrCode || matched.some((s) => studentMatchesSecret(s, secret)));
      if (!secretOk) {
        return json({ error: 'SĐT Phụ huynh hoặc Mã PIN chưa chính xác, hoặc tài khoản học sinh đang tạm khóa.' }, 401);
      }
      if (matched.length > 1 && !requestedStudentId) {
        return json({
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
      }
      const chosen = requestedStudentId ? matched.find((s) => s.id === requestedStudentId) : matched[0];
      if (!chosen) return json({ error: 'Học sinh được chọn không khớp với SĐT phụ huynh này.' }, 400);
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
      await saveState(env, db);
      const token = await signToken(studentUser, env);
      return json({ token, user: studentUser, student: chosen });
    }

    return json({ error: 'Phương thức vào lớp không hợp lệ.' }, 400);
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

  if (method === 'POST' && pathname === '/api/v1/auth/firebase-bridge') {
    const body = await readJson<{
      idToken?: string;
      requestedRole?: string;
      portalIntent?: string;
      studentId?: string;
    }>();
    const idToken = typeof body.idToken === 'string' ? body.idToken : '';
    if (!idToken) return json({ error: 'Thiếu Firebase ID token.' }, 401);

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!lookupRes.ok) {
      return json({ error: 'Token Gmail Firebase không hợp lệ.' }, 401);
    }
    const lookupData = (await lookupRes.json()) as {
      users?: { localId: string; email?: string; emailVerified?: boolean; displayName?: string; photoUrl?: string }[];
    };
    const fb = lookupData.users?.[0];
    if (!fb || !fb.email || !fb.emailVerified) {
      return json({ error: 'Tài khoản Gmail chưa được xác minh.' }, 401);
    }

    const db = await loadState(env);
    const policy = getPolicy(db);
    const email = fb.email.toLowerCase();
    const portalIntent = String(body.portalIntent || 'AUTO').toUpperCase();
    const requestedStudentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';

    if (email === SUPER_ADMIN_EMAIL || isBootstrappedAdminEmail(email)) {
      const role: UserRole = email === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'ADMIN';
      const staffUser: AuthUser = {
        id: fb.localId,
        name: fb.displayName || email.split('@')[0],
        email,
        photoURL: fb.photoUrl,
        role,
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'STAFF_GMAIL',
      };
      const token = await signToken(staffUser, env);
      return json({ token, user: staffUser });
    }

    const teacherMatch = db.teachers.find((t) => t.email && t.email.toLowerCase() === email);
    if (teacherMatch && portalIntent !== 'PARENT' && portalIntent !== 'STUDENT') {
      const teacherUser: AuthUser = {
        id: fb.localId,
        name: teacherMatch.name,
        email,
        photoURL: fb.photoUrl,
        role: 'TEACHER',
        linkedTeacherId: teacherMatch.id,
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'STAFF_GMAIL',
      };
      const token = await signToken(teacherUser, env);
      return json({ token, user: teacherUser });
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

    if (portalIntent === 'PARENT') {
      if (!policy.allowParentGmailLogin) {
        return json({ error: 'Đăng nhập Phụ huynh bằng Gmail đang tạm tắt bởi SuperAdmin. Vui lòng dùng SĐT + Mã PIN.' }, 403);
      }
      if (parentMatches.length === 0) {
        return json(
          { error: `Gmail ${email} chưa được đăng ký trong hồ sơ Phụ huynh tại Nhân Trí. Vui lòng nhắn Zalo Cô Tâm (0947 376 444).` },
          403,
        );
      }
      const nowStr = nowFormatted();
      parentMatches.forEach((s) => {
        s.lastLoginAt = nowStr;
      });
      const parentUser: AuthUser = {
        id: fb.localId,
        name: parentMatches[0].parentName || fb.displayName || email.split('@')[0],
        email,
        photoURL: fb.photoUrl,
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
        targetLabel: `${parentUser.name} (${parentMatches.length} học sinh)`,
        detail: 'Phụ huynh đăng nhập bằng Gmail đã đăng ký.',
      });
      await saveState(env, db);
      const token = await signToken(parentUser, env);
      return json({ token, user: parentUser });
    }

    if (portalIntent === 'STUDENT') {
      if (studentMatch) {
        if (studentMatch.accessStatus === 'LOCKED') {
          return json({ error: 'Tài khoản học sinh này đang bị tạm khóa. Vui lòng liên hệ Cô Tâm (0947 376 444).' }, 403);
        }
        if (!canStudentUsePersonalGmail(studentMatch, policy)) {
          return json(
            {
              error: `Học sinh Lớp ${studentMatch.grade} chưa đủ ngưỡng dùng Gmail cá nhân (áp dụng từ Lớp ${policy.minGradeForPersonalGmail} trở lên). Em hãy vào lớp bằng Mã số học sinh, SĐT/Gmail Phụ huynh, hoặc nhờ Quản trị viên bật ngoại lệ.`,
            },
            403,
          );
        }
        studentMatch.lastLoginAt = nowFormatted();
        const studentUser: AuthUser = {
          id: fb.localId,
          name: `${studentMatch.fullName} (${studentMatch.centerClass})`,
          email,
          photoURL: fb.photoUrl,
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
        await saveState(env, db);
        const token = await signToken(studentUser, env);
        return json({ token, user: studentUser });
      }
      if (parentMatches.length > 0) {
        if (!policy.allowStudentParentGmailLogin) {
          return json({ error: 'Vào lớp bằng Gmail Phụ huynh đang tạm tắt. Em hãy dùng Mã số học sinh.' }, 403);
        }
        if (parentMatches.length > 1 && !requestedStudentId) {
          return json({
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
        }
        const chosen = requestedStudentId
          ? parentMatches.find((s) => s.id === requestedStudentId) || parentMatches[0]
          : parentMatches[0];
        chosen.lastLoginAt = nowFormatted();
        const studentUser: AuthUser = {
          id: fb.localId,
          name: `${chosen.fullName} (${chosen.centerClass})`,
          email,
          photoURL: fb.photoUrl,
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
        await saveState(env, db);
        const token = await signToken(studentUser, env);
        return json({ token, user: studentUser });
      }
      return json(
        { error: `Gmail ${email} chưa được liên kết với hồ sơ Học sinh hoặc Phụ huynh tại Nhân Trí. Liên hệ Cô Tâm: 0947 376 444.` },
        403,
      );
    }

    if (parentMatches.length > 0) {
      const parentUser: AuthUser = {
        id: fb.localId,
        name: parentMatches[0].parentName || fb.displayName || email.split('@')[0],
        email,
        photoURL: fb.photoUrl,
        role: 'PARENT',
        linkedStudentId: parentMatches[0].id,
        linkedStudentIds: parentMatches.map((s) => s.id),
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'PARENT_GMAIL',
      };
      const token = await signToken(parentUser, env);
      return json({ token, user: parentUser });
    }

    if (studentMatch && studentMatch.accessStatus !== 'LOCKED' && canStudentUsePersonalGmail(studentMatch, policy)) {
      const studentUser: AuthUser = {
        id: fb.localId,
        name: `${studentMatch.fullName} (${studentMatch.centerClass})`,
        email,
        photoURL: fb.photoUrl,
        role: 'STUDENT',
        linkedStudentId: studentMatch.id,
        linkedStudentIds: [studentMatch.id],
        authProvider: 'GOOGLE_FIREBASE',
        loginChannel: 'STUDENT_GMAIL',
      };
      const token = await signToken(studentUser, env);
      return json({ token, user: studentUser });
    }

    const fallbackRole: UserRole =
      body.requestedRole === 'MANAGER' ||
      body.requestedRole === 'TEACHER' ||
      body.requestedRole === 'PARENT' ||
      body.requestedRole === 'STUDENT'
        ? body.requestedRole
        : 'STUDENT';
    const bridgedUser: AuthUser = {
      id: fb.localId,
      name: fb.displayName || email.split('@')[0],
      email,
      photoURL: fb.photoUrl,
      role: fallbackRole,
      linkedTeacherId: teacherMatch?.id,
      authProvider: 'GOOGLE_FIREBASE',
      loginChannel: fallbackRole === 'TEACHER' || fallbackRole === 'MANAGER' ? 'STAFF_GMAIL' : 'STUDENT_GMAIL',
    };
    const token = await signToken(bridgedUser, env);
    return json({ token, user: bridgedUser });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/link-student') {
    const denied = requireRole();
    if (denied) return denied;
    const b = await readJson<{ linkCode?: string }>();
    const code = String(b.linkCode || '').trim().toUpperCase();
    if (!code || code.length < 4) {
      return json({ error: 'Vui lòng nhập Mã liên kết Phụ huynh hợp lệ (VD: NT7A1T).' }, 400);
    }
    const db = await loadState(env);
    const student = db.students.find(
      (s) =>
        (s.parentLinkCode && s.parentLinkCode.toUpperCase() === code) ||
        s.code.toUpperCase() === code,
    );
    if (!student) {
      return json({ error: 'Không tìm thấy học sinh khớp với mã liên kết này.' }, 404);
    }
    const mergedIds = Array.from(new Set([...getAllowedStudentIds(user), student.id]));
    const updatedUser: AuthUser = {
      ...user!,
      linkedStudentId: user!.linkedStudentId || student.id,
      linkedStudentIds: mergedIds,
    };
    const token = await signToken(updatedUser, env);
    return json({ token, user: updatedUser, student });
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    const denied = requireRole();
    if (denied) return denied;
    return json({ user });
  }

  // 3. WORKSPACE (STRICT ROLE-SCOPED PROJECTION & FINANCE ISOLATION)
  if (method === 'GET' && pathname === '/api/v1/workspace') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const isAdminUser = user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN';
    const isManagerUser = isAdminUser || user!.role === 'MANAGER';
    const isTeacherUser = user!.role === 'TEACHER';
    const isStaff = isManagerUser || isTeacherUser;
    const allowedIds = new Set(getAllowedStudentIds(user));

    if (user!.role === 'PARENT') {
      const seedStudents = db.students.filter((s) => allowedIds.has(s.id));
      const phones = new Set(
        seedStudents.map((s) => normalizePhoneVN(s.parentPhone)).filter((p) => p.length >= 8),
      );
      const emails = new Set<string>();
      if (user!.email && user!.email.includes('@')) emails.add(user!.email.toLowerCase());
      seedStudents.forEach((s) => (s.parentEmails || []).forEach((e) => emails.add(e.toLowerCase())));
      db.students.forEach((s) => {
        if (s.accessStatus === 'LOCKED') return;
        const pMatch = phones.has(normalizePhoneVN(s.parentPhone));
        const eMatch = (s.parentEmails || []).some((e) => emails.has(e.toLowerCase()));
        if (pMatch || eMatch) allowedIds.add(s.id);
      });
    }

    const scopedStudents = isStaff ? db.students : db.students.filter((s) => allowedIds.has(s.id));
    const timetable = isManagerUser
      ? db.timetable
      : isTeacherUser
        ? db.timetable.filter((sl) => !user!.linkedTeacherId || sl.teacherId === user!.linkedTeacherId)
        : db.timetable.filter((sl) => scopedStudents.some((st) => studentBelongsToClass(st, sl.centerClass)));

    const tuition = isAdminUser
      ? db.tuition
      : user!.role === 'PARENT' || user!.role === 'STUDENT'
        ? db.tuition.filter((t) => allowedIds.has(t.studentId))
        : [];

    const families = isAdminUser
      ? db.families
      : user!.role === 'PARENT'
        ? db.families.filter((f) => scopedStudents.some((st) => findFamilyForStudent(st, [f]) !== undefined))
        : [];

    const teacherLeaves = isManagerUser
      ? db.teacherLeaves
      : isTeacherUser
        ? db.teacherLeaves.filter((l) => l.teacherId === user!.linkedTeacherId)
        : [];

    const teachers = isManagerUser
      ? db.teachers
      : db.teachers.map((t) =>
          isTeacherUser && t.id === user!.linkedTeacherId ? t : { ...t, phone: '', email: undefined },
        );

    const todayVn = getVietnamClock().isoDate;
    const scopedCheckins = (db.classCheckins || []).filter((c) => {
      if (c.date !== todayVn) return false;
      if (isStaff) return true;
      return c.actorId === user!.id || (user!.linkedStudentId && c.actorId === user!.linkedStudentId);
    });

    return json({
      user,
      rooms: db.rooms,
      teachers,
      teacherLeaves,
      families,
      students: scopedStudents,
      archivedStudents: isManagerUser ? (db.archivedStudents || []) : [],
      archivedTeachers: isManagerUser ? (db.archivedTeachers || []) : [],
      timetable,
      scores: isStaff ? db.scores : db.scores.filter((sc) => allowedIds.has(sc.studentId)),
      attendance: isStaff ? db.attendance : db.attendance.filter((a) => allowedIds.has(a.studentId)),
      tuition,
      expenses: isAdminUser ? db.expenses : [],
      exams: db.exams,
      tickets: isStaff
        ? db.tickets
        : db.tickets.filter(
            (t) =>
              t.authorUid === user!.id ||
              t.authorName === user!.name ||
              (t.authorRole === user!.role &&
                scopedStudents.some((st) => t.authorName.includes(st.fullName.split(' ').slice(-1)[0]))),
          ),
      notifications: db.notifications.filter(
        (n) =>
          n.targetRole === 'ALL' ||
          n.targetRole === user!.role ||
          isAdminUser ||
          (user!.role === 'MANAGER' && n.targetRole === 'MANAGER'),
      ),
      authPolicy: getPolicy(db),
      auditLogs: isAdminUser ? (db.auditLogs || []) : [],
      socialChannels: db.socialChannels || [],
      socialPosts: isManagerUser ? (db.socialPosts || []) : (db.socialPosts || []).filter((p) => p.visible),
      editorialArticles: isManagerUser
        ? (db.editorialArticles || [])
        : (db.editorialArticles || []).filter((a) => a.status === 'PUBLISHED'),
      reusableBlocks: isManagerUser ? ensureDefaultReusableBlocks(db.reusableBlocks) : [],
      promoBanners: isManagerUser
        ? (db.promoBanners || [])
        : (db.promoBanners || []).filter((b) => b.active),
      notificationConfig: isAdminUser ? db.notificationConfig : undefined,
      myNotificationPref: getOrBuildUserNotificationPref(db, user!),
      classCheckins: scopedCheckins,
      reminderDispatchLogs: isAdminUser ? (db.reminderDispatchLogs || []) : [],
      printTemplates: isStaff ? ensureSystemPrintTemplates(db.printTemplates) : [],
      timetableUpdatedAt: db.timetableUpdatedAt || new Date().toISOString(),
      timetableVersion: db.timetableVersion || 1,
      timetableChanges: isManagerUser
        ? (db.timetableChanges || []).slice(0, 60)
        : isTeacherUser && user!.linkedTeacherId
          ? (db.timetableChanges || [])
              .filter((ev) => ev.affectedTeacherIds.includes(user!.linkedTeacherId!))
              .slice(0, 40)
          : [],
    });
  }

  // 4. PUBLIC ENROLLMENT (12-MONTH + MULTI-CHILD STACKED DISCOUNT ON BASE TUITION)
  if (method === 'POST' && pathname === '/api/v1/enrollments') {
    if (isWorkerRateLimited(request, 'enroll', 10, 60_000)) {
      return json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.' }, 429);
    }
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

    const normalizedPhone = normalizePhoneVN(parentPhone) || parentPhone;
    let family = db.families.find((f) => normalizePhoneVN(f.parentPhone) === normalizedPhone);
    const existingSiblings = db.students.filter((s) => normalizePhoneVN(s.parentPhone) === normalizedPhone);
    if (!family && existingSiblings.length > 0) {
      family = {
        id: `fam-${Date.now()}`,
        parentName: typeof b.parentName === 'string' && b.parentName.trim() ? b.parentName.trim() : existingSiblings[0].parentName,
        parentPhone: normalizedPhone,
        parentEmails: existingSiblings[0].parentEmails || [],
        siblingDiscountPercent: 5,
        defaultBillingCycle: b.annualPrepaid ? 'ANNUAL_12M' : 'MONTHLY',
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
    const boardingAmt = b.hasBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
    const shuttleAmt = b.hasShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
    const billingCycle: BillingCycle = b.annualPrepaid ? 'ANNUAL_12M' : 'MONTHLY';

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
      numericGrade <= 5 ? 'Lớp 4,5' : numericGrade <= 9 ? `Lớp ${numericGrade}A1` : `Lớp ${numericGrade}`;
    const validPeDays: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const peDay = validPeDays.includes(b.peConflictDay as DayOfWeek) ? (b.peConflictDay as DayOfWeek) : undefined;

    const newStudent: Student = {
      id: newStudentId,
      familyId: family?.id,
      code: generateSmartStudentCode(centerClass, db.students.map((s) => s.code), {
        fallbackGrade: numericGrade,
      }),
      qrToken: generateQrToken(),
      parentLinkCode: generateParentLinkCode(numericGrade),
      fullName: studentName,
      grade: numericGrade,
      level: course.level,
      centerClass,
      enrolledClasses: [centerClass],
      schoolClass: `${numericGrade}A`,
      school: typeof b.school === 'string' && b.school.trim() ? b.school.trim() : 'THCS Lý Thường Kiệt',
      homeroomTeacher: numericGrade <= 5 ? 'Cô Tâm' : numericGrade <= 9 ? 'Cô Nghi' : 'Cô Mẫn',
      room: numericGrade <= 5 ? 'Phòng 1' : 'Phòng 2',
      parentName: typeof b.parentName === 'string' && b.parentName.trim() ? b.parentName.trim() : 'Phụ huynh mới',
      parentPhone: normalizedPhone,
      parentZalo: normalizedPhone,
      accessPin: generateAccessPin(),
      accessStatus: 'ACTIVE',
      packageType: course.billingModel,
      hasBoarding: Boolean(b.hasBoarding),
      hasShuttle: Boolean(b.hasShuttle),
      annualPrepaid: Boolean(b.annualPrepaid),
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
      message: `Đăng ký lớp ${centerClass}, môn: ${subjectsArray.join(', ')}. Chu kỳ: ${billingCycle === 'ANNUAL_12M' ? 'Nguyên năm 12 tháng' : 'Theo tháng'}.`,
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
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const b = await readJson<Record<string, unknown>>();
    const fullName = String(b.fullName || '').trim();
    if (!fullName) return json({ error: 'Thiếu họ tên học sinh.' }, 400);
    const db = await loadState(env);
    const grade = Math.min(12, Math.max(3, Number(b.grade) || 7));
    const centerClass = String(b.centerClass || `Lớp ${grade}A1`);
    const requestedCode = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    const existingCodes = db.students.map((s) => s.code);
    const smartCode =
      requestedCode && !existingCodes.some((c) => c.toUpperCase() === requestedCode)
        ? requestedCode
        : generateSmartStudentCode(centerClass, existingCodes, { fallbackGrade: grade });
    const student: Student = {
      id: `st-${Date.now()}`,
      code: smartCode,
      qrToken: generateQrToken(),
      parentLinkCode: generateParentLinkCode(grade),
      fullName,
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
      enrolledSubjects: ['Toán', 'Ngữ Văn', 'Tiếng Anh'],
      status: 'ACTIVE',
    };
    db.students.unshift(student);
    await saveState(env, db);
    return json({ student }, 201);
  }

  const studentAccessMatch = pathname.match(/^\/api\/v1\/students\/([^/]+)\/access$/);
  if (method === 'PATCH' && studentAccessMatch) {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === studentAccessMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy học sinh.' }, 404);
    const b = await readJson<Record<string, unknown>>();
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
      if (cleanPin.length < 4) return json({ error: 'Mã PIN cần tối thiểu 4 ký tự.' }, 400);
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

    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: student.accessStatus === 'LOCKED' && prevStatus !== 'LOCKED' ? 'ACCESS_LOCK' : 'ACCESS_UPDATE',
      targetLabel: `${student.fullName} (${student.code})`,
      detail: `Cập nhật định danh: SĐT ${maskPhoneVN(student.parentPhone)}, trạng thái ${student.accessStatus || 'ACTIVE'}${student.allowPersonalGmailOverride ? ', bật ngoại lệ Gmail cá nhân' : ''}.`,
    });
    await saveState(env, db);
    return json({ student });
  }

  if (method === 'GET' && pathname === '/api/v1/system/auth-policy') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    return json({ authPolicy: getPolicy(db), auditLogs: db.auditLogs || [] });
  }

  if (method === 'PATCH' && pathname === '/api/v1/system/auth-policy') {
    const denied = requireRole(['SUPER_ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const nextPolicy = sanitizePolicyPatch(getPolicy(db), b);
    db.authPolicy = nextPolicy;
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'POLICY_UPDATE',
      targetLabel: 'Chính sách Định danh & Phân quyền',
      detail: `Ngưỡng Gmail cá nhân HS: Lớp ${nextPolicy.minGradeForPersonalGmail}+ · Yêu cầu xác thực vào lớp: ${nextPolicy.requireAuthForClassroom ? 'Bật' : 'Tắt'} · PIN Phụ huynh: ${nextPolicy.requireParentPinOrCode ? 'Bắt buộc' : 'Tùy chọn'}.`,
    });
    await saveState(env, db);
    return json({ authPolicy: nextPolicy, auditLogs: db.auditLogs || [] });
  }

  if (method === 'POST' && pathname === '/api/v1/students/import') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
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
      const rawPhone = String(row.parentPhone || '0918000000').trim();
      imported.push({
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

  // 5B. ROOMS, 2-GROUP TEACHERS, AVAILABILITY & LEAVES
  if (method === 'POST' && pathname === '/api/v1/rooms') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const code = String(b.code || '').trim().toUpperCase().slice(0, 24);
    const name = String(b.name || '').trim().slice(0, 80);
    if (code.length < 2 || name.length < 2) {
      return json({ error: 'Vui lòng nhập Mã phòng (VD: P106) và Tên phòng hợp lệ.' }, 400);
    }
    if (db.rooms.some((r) => r.code.toUpperCase() === code || r.name.toLowerCase() === name.toLowerCase())) {
      return json({ error: `Phòng ${name} (${code}) đã tồn tại.` }, 409);
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
    await saveState(env, db);
    return json({ room }, 201);
  }

  const roomIdMatch = pathname.match(/^\/api\/v1\/rooms\/([^/]+)$/);
  if (method === 'PATCH' && roomIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const room = db.rooms.find((r) => r.id === roomIdMatch[1]);
    if (!room) return json({ error: 'Không tìm thấy phòng học.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    const oldName = room.name;
    if (typeof b.code === 'string' && b.code.trim().length >= 2) room.code = b.code.trim().toUpperCase().slice(0, 24);
    if (typeof b.name === 'string' && b.name.trim().length >= 2) room.name = b.name.trim().slice(0, 80);
    if (typeof b.campus === 'string' && b.campus.trim()) room.campus = b.campus.trim().slice(0, 120);
    if (b.capacity !== undefined) room.capacity = Math.max(1, Math.min(100, Number(b.capacity) || room.capacity));
    if (typeof b.active === 'boolean') room.active = b.active;
    if (typeof b.note === 'string') room.note = b.note.trim().slice(0, 240) || undefined;
    const synced = cascadeSyncRoomUpdate(db, room, oldName);
    await saveState(env, db);
    return json({ room, synced });
  }

  if (method === 'DELETE' && roomIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const room = db.rooms.find((r) => r.id === roomIdMatch[1]);
    if (!room) return json({ error: 'Không tìm thấy phòng học.' }, 404);
    if (db.timetable.some((s) => s.status !== 'OFF' && (s.roomId === room.id || s.room === room.name))) {
      return json({ error: `Phòng ${room.name} đang có tiết học trong Thời khóa biểu.` }, 409);
    }
    db.rooms = db.rooms.filter((r) => r.id !== room.id);
    await saveState(env, db);
    return json({ deleted: true });
  }

  if (method === 'POST' && pathname === '/api/v1/teachers') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const name = String(b.name || '').trim();
    const shortName = String(b.shortName || name.split(' ').slice(-2).join(' ')).trim();
    if (name.length < 2) return json({ error: 'Vui lòng nhập đầy đủ họ tên giáo viên.' }, 400);
    const group: TeacherGroup = b.teacherGroup === 'TUTOR_REVIEW' ? 'TUTOR_REVIEW' : 'SUBJECT';
    const subjectsRaw = Array.isArray(b.subjects)
      ? b.subjects
      : typeof b.subjects === 'string'
        ? b.subjects.split(/[,;]/)
        : [];
    const subjects = subjectsRaw.map((s) => String(s || '').trim()).filter(Boolean);
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
    await saveState(env, db);
    return json({ teacher }, 201);
  }

  const teacherAvailMatch = pathname.match(/^\/api\/v1\/teachers\/([^/]+)\/availability$/);
  if (method === 'PATCH' && teacherAvailMatch) {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    if (user!.role === 'TEACHER' && user!.linkedTeacherId !== teacherAvailMatch[1]) {
      return json({ error: 'Giáo viên chỉ có thể cập nhật khung giờ rảnh của chính mình.' }, 403);
    }
    const db = await loadState(env);
    const teacher = db.teachers.find((t) => t.id === teacherAvailMatch[1]);
    if (!teacher) return json({ error: 'Không tìm thấy giáo viên.' }, 404);
    const b = await readJson<{ availability?: unknown[] }>();
    const prevCount = (teacher.availability || []).length;
    const rawList = Array.isArray(b.availability) ? b.availability : [];
    const nextAvail = Array.from(new Set(rawList.map(String).filter((k) => ALL_SHIFT_KEYS.includes(k))));
    teacher.availability = nextAvail;
    const availSet = new Set(nextAvail);
    const conflictingSlots = db.timetable.filter(
      (sl) =>
        sl.status !== 'OFF' &&
        sl.teacherId === teacher.id &&
        !availSet.has(makeShiftKey(sl.day, sl.period, sl.shift)),
    );
    if (user!.role === 'TEACHER') {
      const busyCount = ALL_SHIFT_KEYS.length - nextAvail.length;
      appendAuditLog(db, {
        actorEmail: user!.email,
        actorRole: user!.role,
        action: 'TEACHER_AVAILABILITY_UPDATED',
        target: teacher.id,
        targetLabel: teacher.shortName,
        detail: `Cập nhật lịch rảnh/bận (${prevCount} → ${nextAvail.length} ca rảnh, ${busyCount} ca bận).`,
        status: 'UPDATED',
      });
      db.notifications.unshift({
        id: `ntf-avail-${Date.now().toString(36)}`,
        createdAt: nowFormatted(),
        title: `Cập nhật ca rảnh/bận · ${teacher.shortName}`,
        body: `${teacher.shortName} vừa cập nhật lịch tuần (${nextAvail.length} ca rảnh, ${busyCount} ca bận).`,
        channel: 'APP',
        targetRole: 'MANAGER',
        read: false,
      });
    }
    await saveState(env, db);
    return json({ teacher, conflictingSlots });
  }

  if (method === 'PATCH' && pathname === '/api/v1/teachers/me/profile') {
    const denied = requireRole(['TEACHER', 'MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const isManager = user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN' || user!.role === 'MANAGER';
    const targetTeacherId =
      user!.role === 'TEACHER'
        ? String(user!.linkedTeacherId || '')
        : String(b.teacherId || user!.linkedTeacherId || '');
    if (!targetTeacherId) return json({ error: 'Tài khoản chưa được liên kết với hồ sơ giáo viên.' }, 400);
    if (user!.role === 'TEACHER' && targetTeacherId !== user!.linkedTeacherId) {
      return json({ error: 'Giáo viên chỉ có thể chỉnh sửa hồ sơ cá nhân của chính mình.' }, 403);
    }
    const teacher = db.teachers.find((t) => t.id === targetTeacherId);
    if (!teacher) return json({ error: 'Không tìm thấy hồ sơ giáo viên.' }, 404);

    const before = {
      name: teacher.name,
      shortName: teacher.shortName,
      phone: teacher.phone,
      email: teacher.email,
      degree: teacher.degree,
      experienceYears: teacher.experienceYears,
      subjects: [...(teacher.subjects || [])],
    };

    if (typeof b.name === 'string' && b.name.trim().length >= 2) teacher.name = b.name.trim().slice(0, 120);
    if (typeof b.shortName === 'string' && b.shortName.trim().length >= 2) teacher.shortName = b.shortName.trim().slice(0, 60);
    if (typeof b.phone === 'string') {
      const cleanPhone = normalizePhoneVN(b.phone) || b.phone.trim().slice(0, 40);
      if (cleanPhone.length >= 8) teacher.phone = cleanPhone;
    }
    if (typeof b.email === 'string') {
      const cleaned = b.email.trim().toLowerCase();
      teacher.email = cleaned && cleaned.includes('@') ? cleaned.slice(0, 160) : undefined;
    }
    if (typeof b.degree === 'string' && b.degree.trim().length >= 2) teacher.degree = b.degree.trim().slice(0, 140);
    if (b.experienceYears !== undefined) {
      const yrs = Number(b.experienceYears);
      if (Number.isFinite(yrs)) teacher.experienceYears = Math.max(0, Math.min(60, Math.round(yrs)));
    }
    if (b.subjects !== undefined) {
      const arr = Array.isArray(b.subjects) ? b.subjects : String(b.subjects).split(/[,;]/);
      const cleaned = arr.map((s) => String(s || '').trim().slice(0, 80)).filter(Boolean).slice(0, 10);
      if (cleaned.length > 0) teacher.subjects = cleaned;
    }

    const diffs = diffTeacherProfileFields(before, teacher);
    teacher.profileUpdatedAt = new Date().toISOString();
    teacher.profileUpdatedBy = user!.email;
    const synced = cascadeSyncTeacherUpdate(db, teacher, before.name, before.shortName);

    if (diffs.length > 0) {
      const diffSummary = diffs.map((d) => `${d.label}: "${d.oldValue}" → "${d.newValue}"`).join(' | ');
      const groupLabel = teacher.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn';
      appendAuditLog(db, {
        actorEmail: user!.email,
        actorRole: user!.role,
        action: 'TEACHER_SELF_PROFILE_UPDATE',
        target: teacher.id,
        targetLabel: `${groupLabel} · ${teacher.name}`,
        detail: `Tự chuẩn hóa ${diffs.length} trường: ${diffSummary}`,
        status: 'UPDATED',
      });
      if (!isManager || user!.linkedTeacherId === teacher.id) {
        db.notifications.unshift({
          id: `ntf-tprof-${Date.now().toString(36)}`,
          createdAt: nowFormatted(),
          title: `GV tự chuẩn hóa hồ sơ · ${teacher.shortName}`,
          body: `${teacher.name} (${groupLabel} · ${user!.email}) vừa cập nhật thông tin cá nhân: ${diffSummary}`,
          channel: 'APP',
          targetRole: 'ADMIN',
          read: false,
        });
      }
    }
    await saveState(env, db);
    return json({ teacher, diffs, synced });
  }

  if (method === 'PATCH' && pathname === '/api/v1/teachers/me/alert-prefs') {
    const denied = requireRole(['TEACHER', 'MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const targetTeacherId =
      user!.role === 'TEACHER'
        ? String(user!.linkedTeacherId || '')
        : String(b.teacherId || user!.linkedTeacherId || '');
    const teacher = db.teachers.find((t) => t.id === targetTeacherId);
    if (!teacher) return json({ error: 'Không tìm thấy hồ sơ giáo viên.' }, 404);
    if (typeof b.scheduleAlertEnabled === 'boolean') teacher.scheduleAlertEnabled = b.scheduleAlertEnabled;
    if (typeof b.scheduleAlertSound === 'boolean') teacher.scheduleAlertSound = b.scheduleAlertSound;
    await saveState(env, db);
    return json({ teacher });
  }

  if (method === 'POST' && pathname === '/api/v1/teachers/me/ack-timetable') {
    const denied = requireRole(['TEACHER', 'MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<{ teacherId?: string; eventIds?: string[] }>();
    const targetTeacherId =
      user!.role === 'TEACHER'
        ? String(user!.linkedTeacherId || '')
        : String(b.teacherId || user!.linkedTeacherId || '');
    const teacher = db.teachers.find((t) => t.id === targetTeacherId);
    if (!teacher) return json({ error: 'Không tìm thấy hồ sơ giáo viên.' }, 404);
    const eventIds = Array.isArray(b.eventIds) ? new Set(b.eventIds.map(String)) : null;
    let ackCount = 0;
    for (const ev of db.timetableChanges || []) {
      if (!ev.affectedTeacherIds.includes(teacher.id)) continue;
      if (eventIds && !eventIds.has(ev.id)) continue;
      if (!ev.acknowledgedByTeacherIds.includes(teacher.id)) {
        ev.acknowledgedByTeacherIds.push(teacher.id);
        ackCount++;
      }
    }
    teacher.lastTimetableAckAt = new Date().toISOString();
    await saveState(env, db);
    return json({ acknowledged: ackCount, lastTimetableAckAt: teacher.lastTimetableAckAt });
  }

  const teacherIdMatch = pathname.match(/^\/api\/v1\/teachers\/([^/]+)$/);
  if (method === 'PATCH' && teacherIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const teacher = db.teachers.find((t) => t.id === teacherIdMatch[1]);
    if (!teacher) return json({ error: 'Không tìm thấy giáo viên.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    const oldName = teacher.name;
    const oldShort = teacher.shortName;
    if (typeof b.name === 'string' && b.name.trim().length >= 2) teacher.name = b.name.trim().slice(0, 120);
    if (typeof b.shortName === 'string' && b.shortName.trim().length >= 2) teacher.shortName = b.shortName.trim().slice(0, 60);
    if (b.teacherGroup === 'SUBJECT' || b.teacherGroup === 'TUTOR_REVIEW') teacher.teacherGroup = b.teacherGroup;
    if (b.subjects !== undefined) {
      const arr = Array.isArray(b.subjects) ? b.subjects : String(b.subjects).split(/[,;]/);
      const cleaned = arr.map((s) => String(s || '').trim()).filter(Boolean);
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
      teacher.availability = b.availability.map(String).filter((k) => ALL_SHIFT_KEYS.includes(k));
    }
    const synced = cascadeSyncTeacherUpdate(db, teacher, oldName, oldShort);
    await saveState(env, db);
    return json({ teacher, synced });
  }

  if (method === 'POST' && pathname === '/api/v1/teacher-leaves') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const isManager = user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN' || user!.role === 'MANAGER';
    const teacherId = isManager ? String(b.teacherId || user!.linkedTeacherId || '') : String(user!.linkedTeacherId || '');
    const teacher = db.teachers.find((t) => t.id === teacherId);
    if (!teacher) return json({ error: 'Không tìm thấy hồ sơ giáo viên tương ứng.' }, 400);
    const validDays: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const day = validDays.includes(b.day as DayOfWeek) ? (b.day as DayOfWeek) : null;
    const period =
      b.period === 'ALL' || b.period === 'SANG' || b.period === 'CHIEU' || b.period === 'TOI'
        ? (b.period as TeacherLeave['period'])
        : 'ALL';
    const shift = b.shift === 'CA_1' || b.shift === 'CA_2' ? (b.shift as ShiftCode) : undefined;
    const reason = String(b.reason || '').trim();
    if (!day || reason.length < 3) {
      return json({ error: 'Vui lòng chọn thứ/ca nghỉ và nhập lý do nghỉ (tối thiểu 3 ký tự).' }, 400);
    }
    const affectedSlots = findAffectedSlotsForLeave(db.timetable, {
      teacherId: teacher.id,
      day,
      period,
      shift: period === 'ALL' ? undefined : shift,
    });
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
      createdBy: user!.email,
      reviewedBy: isManager && b.autoApprove ? user!.email : undefined,
      createdAt: nowFormatted(),
      affectedSlotIds: affectedSlots.map((sl) => sl.id),
    };
    db.teacherLeaves.unshift(leave);
    if (leave.status === 'APPROVED') {
      affectedSlots.forEach((sl) => {
        const before = slotToSnapshot(sl);
        sl.status = 'TEACHER_ABSENT';
        sl.note = `GV nghỉ phép (${leave.reason}) · Cần xếp GV dạy thay`;
        recordTimetableChange(db, {
          action: 'UPDATED',
          updatedBy: user!.email,
          slotId: sl.id,
          summary: `${teacher.shortName} nghỉ phép ca ${formatShiftLabel(sl.day, sl.period, sl.shift)} (${sl.centerClass})`,
          before,
          after: slotToSnapshot(sl),
          affectedTeacherIds: [teacher.id],
        });
      });
    }
    const { suggestions } = computeSubstituteSuggestions(db, leave);
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      createdAt: nowFormatted(),
      title: `Đơn xin nghỉ · ${teacher.shortName} (${leave.day})`,
      body: `${teacher.shortName} xin nghỉ ${leave.dateLabel} — Lý do: ${leave.reason}. Ảnh hưởng ${affectedSlots.length} ca trên TKB.`,
      channel: 'APP',
      targetRole: 'MANAGER',
      read: false,
    });
    await saveState(env, db);
    return json({ leave, affectedCount: affectedSlots.length, affectedSlots, topSuggestions: suggestions.slice(0, 5) }, 201);
  }

  const leaveSubMatch = pathname.match(/^\/api\/v1\/teacher-leaves\/([^/]+)\/substitutes$/);
  if (method === 'GET' && leaveSubMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const leave = db.teacherLeaves.find((l) => l.id === leaveSubMatch[1]);
    if (!leave) return json({ error: 'Không tìm thấy đơn xin nghỉ.' }, 404);
    const { affectedSlots, suggestions } = computeSubstituteSuggestions(db, leave);
    const cancelNotice = buildParentClassCancelNotice({ leave, affectedSlots, students: db.students });
    return json({ leave, affectedSlots, suggestions: suggestions.slice(0, 10), cancelNotice });
  }

  const leaveResolveMatch = pathname.match(/^\/api\/v1\/teacher-leaves\/([^/]+)\/resolve$/);
  if (method === 'POST' && leaveResolveMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const leave = db.teacherLeaves.find((l) => l.id === leaveResolveMatch[1]);
    if (!leave) return json({ error: 'Không tìm thấy đơn xin nghỉ.' }, 404);
    const b = await readJson<{ action?: string; substituteTeacherId?: string }>();
    const action = String(b.action || '').toUpperCase();
    const affectedSlots = findAffectedSlotsForLeave(db.timetable, leave);

    if (action === 'ASSIGN_SUBSTITUTE') {
      const subTeacher = db.teachers.find((t) => t.id === String(b.substituteTeacherId || '').trim());
      if (!subTeacher) return json({ error: 'Vui lòng chọn giáo viên dạy thay hợp lệ.' }, 400);
      if (subTeacher.id === leave.teacherId) {
        return json({ error: 'Không thể chọn chính giáo viên đang xin nghỉ làm người dạy thay.' }, 400);
      }
      const updatedSlots: TimetableSlot[] = [];
      for (const sl of affectedSlots) {
        const before = slotToSnapshot(sl);
        sl.teacherId = subTeacher.id;
        sl.teacherName = subTeacher.shortName;
        sl.status = 'SUBSTITUTED';
        sl.note = `Dạy thay ${leave.teacherName} (${leave.reason})`;
        updatedSlots.push(sl);
        recordTimetableChange(db, {
          action: 'SUBSTITUTED',
          updatedBy: user!.email,
          slotId: sl.id,
          summary: `Phân công ${subTeacher.shortName} dạy thay ${leave.teacherName} · ${sl.centerClass} (${sl.subject}) vào ${formatShiftLabel(sl.day, sl.period, sl.shift)}`,
          before,
          after: slotToSnapshot(sl),
          affectedTeacherIds: [leave.teacherId, subTeacher.id],
        });
      }
      leave.status = 'APPROVED';
      leave.reviewedBy = user!.email;
      leave.resolutionType = 'SUBSTITUTE_ASSIGNED';
      leave.substituteTeacherId = subTeacher.id;
      leave.substituteTeacherName = subTeacher.shortName;
      leave.affectedSlotIds = updatedSlots.map((s) => s.id);
      await saveState(env, db);
      return json({ leave, updatedSlots });
    }

    if (action === 'CANCEL_AND_NOTIFY_PARENTS') {
      const cancelNotice = buildParentClassCancelNotice({ leave, affectedSlots, students: db.students });
      const updatedSlots: TimetableSlot[] = [];
      for (const sl of affectedSlots) {
        const before = slotToSnapshot(sl);
        sl.status = 'OFF';
        sl.note = `Tạm nghỉ buổi (${leave.teacherName}: ${leave.reason}) · Đã báo sớm PH/HS`;
        updatedSlots.push(sl);
        recordTimetableChange(db, {
          action: 'CANCELLED',
          updatedBy: user!.email,
          slotId: sl.id,
          summary: `Tạm nghỉ buổi ${sl.centerClass} (${sl.subject}) vào ${formatShiftLabel(sl.day, sl.period, sl.shift)} — Đã gửi thông báo sớm tới Phụ huynh & Học sinh`,
          before,
          after: slotToSnapshot(sl),
          affectedTeacherIds: [leave.teacherId],
        });
      }
      leave.status = 'APPROVED';
      leave.reviewedBy = user!.email;
      leave.resolutionType = 'CLASS_CANCELLED_NOTIFIED';
      leave.parentNoticeSentAt = new Date().toISOString();
      leave.affectedSlotIds = updatedSlots.map((s) => s.id);
      const classLabel = cancelNotice.affectedClasses.join(', ') || leave.day;
      db.notifications.unshift({
        id: `ntf-cancel-p-${Date.now().toString(36)}`,
        createdAt: nowFormatted(),
        title: `Thông báo tạm nghỉ buổi học · ${classLabel} (${leave.dateLabel})`,
        body: cancelNotice.zaloMessage.slice(0, 560),
        channel: 'ZALO',
        targetRole: 'PARENT',
        read: false,
      });
      await saveState(env, db);
      return json({ leave, updatedSlots, cancelNotice });
    }

    return json({ error: 'Hành động xử lý đơn nghỉ không hợp lệ.' }, 400);
  }

  const leaveIdMatch = pathname.match(/^\/api\/v1\/teacher-leaves\/([^/]+)$/);
  if (method === 'PATCH' && leaveIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const leave = db.teacherLeaves.find((l) => l.id === leaveIdMatch[1]);
    if (!leave) return json({ error: 'Không tìm thấy đơn xin nghỉ.' }, 404);
    const b = await readJson<{ status?: string }>();
    if (b.status !== 'APPROVED' && b.status !== 'REJECTED' && b.status !== 'PENDING') {
      return json({ error: 'Trạng thái duyệt không hợp lệ.' }, 400);
    }
    leave.status = b.status;
    leave.reviewedBy = user!.email;
    if (b.status === 'APPROVED') {
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
    await saveState(env, db);
    return json({ leave });
  }

  if (method === 'DELETE' && leaveIdMatch) {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const leave = db.teacherLeaves.find((l) => l.id === leaveIdMatch[1]);
    if (!leave) return json({ error: 'Không tìm thấy đơn xin nghỉ.' }, 404);
    if (user!.role === 'TEACHER' && (leave.teacherId !== user!.linkedTeacherId || leave.status !== 'PENDING')) {
      return json({ error: 'Giáo viên chỉ có thể hủy đơn xin nghỉ đang chờ duyệt của chính mình.' }, 403);
    }
    db.teacherLeaves = db.teacherLeaves.filter((l) => l.id !== leave.id);
    await saveState(env, db);
    return json({ deleted: true });
  }

  // 6. TIMETABLE ROUTES (STRICTLY MANAGER+ ONLY, 5-LAYER ENGINE)
  if (method === 'POST' && pathname === '/api/v1/timetable/check-conflict') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const result = evaluateSlotConstraints(
      {
        id: typeof b.id === 'string' ? b.id : undefined,
        day: b.day as DayOfWeek,
        period: b.period as SessionPeriod,
        shift: b.shift as ShiftCode,
        teacherId: String(b.teacherId || ''),
        room: String(b.room || ''),
        roomId: typeof b.roomId === 'string' ? b.roomId : undefined,
        centerClass: String(b.centerClass || ''),
        subject: String(b.subject || ''),
        slotType: (b.slotType as TimetableSlot['slotType']) || 'MAIN',
      },
      {
        timetable: db.timetable,
        teachers: db.teachers,
        rooms: db.rooms,
        students: db.students,
        leaves: db.teacherLeaves,
        ignoreSlotIds: typeof b.id === 'string' ? [b.id] : [],
      },
    );
    return json({
      hasConflict: !result.valid,
      conflicts: result.hardConflicts,
      suggestedFreeRooms: result.suggestedFreeRooms,
      roomOnlyConflict: result.roomOnlyConflict,
    });
  }

  if (method === 'POST' && pathname === '/api/v1/timetable/move-or-swap') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();

    if (Array.isArray(b.restoreSlots) && b.restoreSlots.length > 0) {
      const restored: TimetableSlot[] = [];
      for (const snap of b.restoreSlots as TimetableSlot[]) {
        const idx = db.timetable.findIndex((s) => s.id === snap.id);
        if (idx >= 0) {
          db.timetable[idx] = { ...snap };
          restored.push(db.timetable[idx]);
        }
      }
      await saveState(env, db);
      return json({ restored: true, slots: restored });
    }

    const sourceSlot = db.timetable.find((s) => s.id === b.slotId);
    if (!sourceSlot) return json({ error: 'Không tìm thấy block ca học nguồn.' }, 404);
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
      return json({ error: evalRes.reasons[0] || 'Xung đột lịch học.', conflicts: evalRes.reasons }, 409);
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

      recordTimetableChange(db, {
        action: 'UPDATED',
        updatedBy: user!.email,
        slotId: sourceSlot.id,
        summary: `Hoán đổi 2 chiều: ${sourceSlot.centerClass} (${sourceSlot.subject}) ↔ ${targetSlot.centerClass} (${targetSlot.subject})`,
        before: slotToSnapshot(srcCopy),
        after: slotToSnapshot(sourceSlot),
        affectedTeacherIds: [sourceSlot.teacherId, targetSlot.teacherId],
      });

      await saveState(env, db);
      return json({ mode: 'SWAP', updatedSlots: [sourceSlot, targetSlot], previousSnapshots });
    }

    const beforeMove = slotToSnapshot(sourceSlot);
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
    recordTimetableChange(db, {
      action: 'UPDATED',
      updatedBy: user!.email,
      slotId: sourceSlot.id,
      summary: `Chuyển ca ${sourceSlot.centerClass} (${sourceSlot.subject}) từ ${formatShiftLabel(beforeMove.day, beforeMove.period, beforeMove.shift)} sang ${formatShiftLabel(sourceSlot.day, sourceSlot.period, sourceSlot.shift)} (${sourceSlot.room})`,
      before: beforeMove,
      after: slotToSnapshot(sourceSlot),
      affectedTeacherIds: [sourceSlot.teacherId],
    });
    await saveState(env, db);
    return json({ mode: evalRes.mode, updatedSlots: [sourceSlot], previousSnapshots, autoRoom: evalRes.autoRoom });
  }

  if (method === 'POST' && pathname === '/api/v1/timetable') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const teacher = db.teachers.find((t) => t.id === b.teacherId);
    const matchedRoom = db.rooms.find((r) => (b.roomId && r.id === b.roomId) || r.name === b.room);
    const roomName = matchedRoom?.name || String(b.room || '').trim();
    if (!teacher || !b.day || !b.period || !b.shift || !b.centerClass || !b.subject || !roomName) {
      return json({ error: 'Vui lòng điền đầy đủ thông tin ca học.' }, 400);
    }
    const check = evaluateSlotConstraints(
      {
        day: b.day as DayOfWeek,
        period: b.period as SessionPeriod,
        shift: b.shift as ShiftCode,
        centerClass: String(b.centerClass),
        subject: String(b.subject),
        teacherId: teacher.id,
        room: roomName,
        roomId: matchedRoom?.id,
        slotType: (b.slotType as TimetableSlot['slotType']) || 'MAIN',
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
      return json({ error: check.hardConflicts[0], conflicts: check.hardConflicts, suggestedFreeRooms: check.suggestedFreeRooms }, 409);
    }
    const newSlot: TimetableSlot = {
      id: `tt-${Date.now()}`,
      weekLabel: 'Tuần 13 (23/11 – 28/11)',
      period: b.period as SessionPeriod,
      shift: b.shift as ShiftCode,
      timeRange:
        typeof b.timeRange === 'string' && b.timeRange.trim()
          ? b.timeRange.trim()
          : getTimeRangeForShift(b.period as SessionPeriod, b.shift as ShiftCode),
      day: b.day as DayOfWeek,
      centerClass: String(b.centerClass).trim(),
      subject: String(b.subject).trim(),
      teacherId: teacher.id,
      teacherName: teacher.shortName,
      roomId: matchedRoom?.id,
      room: roomName,
      slotType: (b.slotType as TimetableSlot['slotType']) || 'MAIN',
      status: 'SCHEDULED',
      note: b.note ? String(b.note).trim() : undefined,
    };
    db.timetable.push(newSlot);
    recordTimetableChange(db, {
      action: 'ADDED',
      updatedBy: user!.email,
      slotId: newSlot.id,
      summary: `Thêm ca mới ${newSlot.centerClass} (${newSlot.subject}) · ${formatShiftLabel(newSlot.day, newSlot.period, newSlot.shift)} tại ${newSlot.room}`,
      after: slotToSnapshot(newSlot),
      affectedTeacherIds: [newSlot.teacherId],
    });
    await saveState(env, db);
    return json({ slot: newSlot }, 201);
  }

  const subSuggestMatch = pathname.match(/^\/api\/v1\/timetable\/([^/]+)\/suggest-substitute$/);
  if (method === 'POST' && subSuggestMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === subSuggestMatch[1]);
    if (!slot) return json({ error: 'Không tìm thấy tiết học.' }, 404);
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
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === subApplyMatch[1]);
    if (!slot) return json({ error: 'Không tìm thấy tiết học.' }, 404);
    const b = await readJson<{ newTeacherId?: string; action?: string }>();
    const beforeSub = slotToSnapshot(slot);
    const affectedTeacherIds = [slot.teacherId];
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
      if (!check.valid) return json({ error: check.hardConflicts[0], conflicts: check.hardConflicts }, 409);
      const oldName = slot.teacherName;
      slot.teacherId = subTeacher.id;
      slot.teacherName = subTeacher.shortName;
      slot.status = 'SUBSTITUTED';
      slot.note = `Dạy thay ${oldName} nghỉ đột xuất`;
      affectedTeacherIds.push(subTeacher.id);
    }
    recordTimetableChange(db, {
      action: 'SUBSTITUTED',
      updatedBy: user!.email,
      slotId: slot.id,
      summary: `Điều phối thay thế ${slot.centerClass} (${slot.subject}) · ${formatShiftLabel(slot.day, slot.period, slot.shift)}: ${slot.teacherName}`,
      before: beforeSub,
      after: slotToSnapshot(slot),
      affectedTeacherIds,
    });
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

  const slotIdMatch = pathname.match(/^\/api\/v1\/timetable\/([^/]+)$/);
  if (method === 'PATCH' && slotIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === slotIdMatch[1]);
    if (!slot) return json({ error: 'Không tìm thấy block ca học.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    const nextDay = (b.day || slot.day) as DayOfWeek;
    const nextPeriod = (b.period || slot.period) as SessionPeriod;
    const nextShift = (b.shift || slot.shift) as ShiftCode;
    const nextTeacherId = String(b.teacherId || slot.teacherId);
    const teacher = db.teachers.find((t) => t.id === nextTeacherId);
    if (!teacher) return json({ error: 'Giáo viên không hợp lệ.' }, 400);
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
        return json({ error: check.hardConflicts[0], conflicts: check.hardConflicts, suggestedFreeRooms: check.suggestedFreeRooms }, 409);
      }
    }
    const beforeSlot = slotToSnapshot(slot);
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
    recordTimetableChange(db, {
      action: nextStatus === 'OFF' ? 'CANCELLED' : 'UPDATED',
      updatedBy: user!.email,
      slotId: slot.id,
      summary: `Cập nhật ca ${slot.centerClass} (${slot.subject}) · ${formatShiftLabel(slot.day, slot.period, slot.shift)} tại ${slot.room}`,
      before: beforeSlot,
      after: slotToSnapshot(slot),
      affectedTeacherIds: [beforeSlot.teacherId, slot.teacherId],
    });
    await saveState(env, db);
    return json({ slot });
  }

  if (method === 'DELETE' && slotIdMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const target = db.timetable.find((s) => s.id === slotIdMatch[1]);
    db.timetable = db.timetable.filter((s) => s.id !== slotIdMatch[1]);
    if (target) {
      recordTimetableChange(db, {
        action: 'REMOVED',
        updatedBy: user!.email,
        slotId: target.id,
        summary: `Xóa ca ${target.centerClass} (${target.subject}) · ${formatShiftLabel(target.day, target.period, target.shift)}`,
        before: slotToSnapshot(target),
        affectedTeacherIds: [target.teacherId],
      });
    }
    await saveState(env, db);
    return json({ deleted: true });
  }

  const icsMatch = pathname.match(/^\/api\/v1\/timetable\/student\/([^/]+)\/ics$/);
  if (method === 'GET' && icsMatch) {
    const denied = requireRole();
    if (denied) return denied;
    const isStaff =
      user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN' || user!.role === 'MANAGER' || user!.role === 'TEACHER';
    if (!isStaff && !getAllowedStudentIds(user).includes(icsMatch[1])) {
      return json({ error: 'Bạn chỉ có thể tải lịch học của học sinh đã liên kết với tài khoản.' }, 403);
    }
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === icsMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy học sinh.' }, 404);
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
    const isStaff =
      user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN' || user!.role === 'MANAGER' || user!.role === 'TEACHER';
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const student = db.students.find((s) => s.id === b.studentId);
    if (!student) return json({ error: 'Vui lòng chọn học sinh hợp lệ.' }, 400);
    if (!isStaff && !getAllowedStudentIds(user).includes(student.id)) {
      return json({ error: 'Bạn chỉ có thể cập nhật điểm cho học sinh thuộc tài khoản của mình.' }, 403);
    }
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
      source: isStaff
        ? ((b.source as ScoreRecord['source']) || 'TEACHER')
        : (b.source === 'AI_SCAN' ? 'AI_SCAN' : 'SELF_ENTRY'),
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
      body: `Điểm ${record.score}/10. Đã cập nhật Học bạ Online Nhân Trí.`,
      channel: 'ZALO',
      targetRole: 'PARENT',
      read: false,
    });
    await saveState(env, db);
    return json({ score: record }, 201);
  }

  if (method === 'POST' && pathname === '/api/v1/attendance') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
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

  // 8. TUITION & REMINDERS (Admin-verified PAID only + Parent Transfer Confirmation)
  const payMatch = pathname.match(/^\/api\/v1\/tuition\/([^/]+)\/pay$/);
  if (method === 'PATCH' && payMatch) {
    const denied = requireRole(['ADMIN']);
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

  const transferConfirmMatch = pathname.match(/^\/api\/v1\/tuition\/([^/]+)\/confirm-transfer$/);
  if (method === 'POST' && transferConfirmMatch) {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const rec = db.tuition.find((t) => t.id === transferConfirmMatch[1]);
    if (!rec) return json({ error: 'Không tìm thấy phiếu học phí.' }, 404);
    const isStaff = user!.role === 'SUPER_ADMIN' || user!.role === 'ADMIN' || user!.role === 'TEACHER';
    if (!isStaff && !getAllowedStudentIds(user).includes(rec.studentId)) {
      return json({ error: 'Không có quyền gửi xác nhận cho phiếu học phí này.' }, 403);
    }
    const b = await readJson<{ paymentMethod?: string; note?: string }>();
    const methodLabel = String(b.paymentMethod || 'VIETQR');
    const note = String(b.note || '').trim();
    const remaining = Math.max(0, rec.totalAmount - rec.paidAmount);
    db.tickets.unshift({
      id: `tk-pay-${Date.now()}`,
      authorUid: user!.id,
      createdAt: nowFormatted(),
      authorName: user!.name,
      authorRole: user!.role,
      category: 'TUITION',
      subject: `Báo đã chuyển khoản học phí (${methodLabel}) — ${rec.studentName}`,
      message: `Phụ huynh báo đã chuyển ${remaining.toLocaleString('vi-VN')}đ cho kỳ ${rec.monthLabel} (${rec.centerClass}) qua ${methodLabel}.${note ? ` Ghi chú: ${note}` : ''} Vui lòng đối soát.`,
      status: 'OPEN',
    });
    db.notifications.unshift({
      id: `ntf-${Date.now()}`,
      createdAt: nowFormatted(),
      title: `Chờ đối soát học phí · ${rec.studentName}`,
      body: `${user!.name} vừa báo đã chuyển ${remaining.toLocaleString('vi-VN')}đ qua ${methodLabel}.`,
      channel: 'APP',
      targetRole: 'ADMIN',
      read: false,
    });
    await saveState(env, db);
    return json({ submitted: true, message: 'Đã gửi thông báo đã chuyển khoản tới Ban Học vụ để đối soát.' });
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

  // 8B. MULTI-CHILD FAMILY BILLING & 12-MONTH RECALCULATION (ADMIN+)
  if (method === 'POST' && pathname === '/api/v1/families') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const parentName = String(b.parentName || '').trim();
    const parentPhone = normalizePhoneVN(String(b.parentPhone || ''));
    if (parentName.length < 2 || parentPhone.length < 8) {
      return json({ error: 'Vui lòng nhập tên phụ huynh và SĐT hợp lệ.' }, 400);
    }
    const existing = db.families.find((f) => normalizePhoneVN(f.parentPhone) === parentPhone);
    if (existing) return json({ error: 'Hồ sơ gia đình cho SĐT này đã tồn tại.', family: existing }, 409);
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
      if (normalizePhoneVN(s.parentPhone) === parentPhone) s.familyId = family.id;
    });
    await saveState(env, db);
    return json({ family }, 201);
  }

  const familyIdMatch = pathname.match(/^\/api\/v1\/families\/([^/]+)$/);
  if (method === 'PATCH' && familyIdMatch) {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const family = db.families.find((f) => f.id === familyIdMatch[1]);
    if (!family) return json({ error: 'Không tìm thấy hồ sơ gia đình.' }, 404);
    const b = await readJson<Record<string, unknown>>();
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
    await saveState(env, db);
    return json({ family, updatedInvoices });
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
    if (isWorkerRateLimited(request, 'tickets', 15, 60_000)) {
      return json({ error: 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.' }, 429);
    }
    const b = await readJson<Record<string, unknown>>();
    const authorName = String(b.authorName || '').trim();
    const message = String(b.message || '').trim();
    if (!authorName || !message) return json({ error: 'Vui lòng nhập họ tên và nội dung.' }, 400);
    const db = await loadState(env);
    const ticket: FeedbackTicket = {
      id: `tk-${Date.now()}`,
      authorUid: user?.id,
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
    const denied = requireRole(['MANAGER', 'TEACHER']);
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
        'Cloudflare Worker (worker/index.ts) và Pages Functions (functions/api/[[path]].ts) đã sẵn sàng. Hỗ trợ tự động lưu Cloudflare D1 (binding DB), KV (NHANTRI_KV) và Cron Trigger nhắc lịch 10 phút.',
    });
  }

  // 10b. QUICK CLASS JUMP ("VÀO LỚP NHANH")
  if (method === 'GET' && pathname === '/api/v1/quick-class/lookup') {
    if (isWorkerRateLimited(request, 'quick-lookup', 30, 60_000)) {
      return json({ error: 'Bạn tra cứu quá nhanh. Vui lòng thử lại sau ít giây.' }, 429);
    }
    const rawCode = String(url.searchParams.get('code') || '').trim().toUpperCase();
    if (rawCode.length < 3) {
      return json({ error: 'Vui lòng nhập Mã số học sinh (VD: NT-6A1-01 hoặc NT6A1H).' }, 400);
    }
    const db = await loadState(env);
    const student = db.students.find(
      (s) =>
        s.accessStatus !== 'LOCKED' &&
        (s.code.trim().toUpperCase() === rawCode ||
          (s.parentLinkCode && s.parentLinkCode.trim().toUpperCase() === rawCode)),
    );
    if (!student) {
      return json({ error: 'Không tìm thấy Mã học sinh phù hợp. Vui lòng kiểm tra lại thẻ học viên hoặc hỏi Giáo viên.' }, 404);
    }
    const snapshot = computeQuickClassSnapshot(db.timetable, { role: 'STUDENT', students: [student] });
    const nameParts = student.fullName.trim().split(/\s+/);
    const studentShortName = nameParts.length >= 2 ? nameParts.slice(-2).join(' ') : student.fullName;
    return json({
      studentCode: student.code,
      studentShortName,
      centerClass: student.centerClass,
      grade: student.grade,
      snapshot,
    });
  }

  if (method === 'POST' && pathname === '/api/v1/quick-class/checkin') {
    const denied = requireRole();
    if (denied) return denied;
    const b = await readJson<{ slotId?: string }>();
    const slotId = String(b.slotId || '').trim();
    if (!slotId) return json({ error: 'Thiếu mã ca học để xác nhận vào lớp.' }, 400);
    const db = await loadState(env);
    const slot = db.timetable.find((s) => s.id === slotId);
    if (!slot) return json({ error: 'Không tìm thấy ca học này trong Thời khóa biểu.' }, 404);
    if (!Array.isArray(db.classCheckins)) db.classCheckins = [];
    const clock = getVietnamClock();
    const actorId =
      user!.role === 'STUDENT' && user!.linkedStudentId
        ? user!.linkedStudentId
        : user!.role === 'TEACHER' && user!.linkedTeacherId
          ? user!.linkedTeacherId
          : user!.id;
    const existing = db.classCheckins.find(
      (c) => c.date === clock.isoDate && c.slotId === slot.id && c.actorId === actorId,
    );
    if (existing) return json({ checkin: existing, alreadyCheckedIn: true });

    const record: ClassCheckInRecord = {
      id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: clock.isoDate,
      slotId: slot.id,
      actorRole: user!.role === 'STUDENT' ? 'STUDENT' : 'TEACHER',
      actorId,
      actorName: user!.name,
      centerClass: slot.centerClass,
      room: slot.room,
      checkedInAt: nowFormatted(),
    };
    db.classCheckins.unshift(record);
    if (db.classCheckins.length > 300) db.classCheckins = db.classCheckins.slice(0, 300);

    if (user!.role === 'STUDENT' && user!.linkedStudentId) {
      const st = db.students.find((s) => s.id === user!.linkedStudentId);
      if (st) {
        const shiftLabel = `${slot.period === 'SANG' ? 'Sáng' : slot.period === 'CHIEU' ? 'Chiều' : 'Tối'} ${slot.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'} (${slot.timeRange})`;
        const alreadyAtt = db.attendance.find(
          (a) => a.date === clock.isoDate && a.studentId === st.id && a.shiftLabel === shiftLabel,
        );
        if (!alreadyAtt) {
          db.attendance.unshift({
            id: `att-chk-${Date.now()}`,
            date: clock.isoDate,
            studentId: st.id,
            studentName: st.fullName,
            centerClass: st.centerClass,
            shiftLabel,
            status: 'PRESENT',
            note: `Học sinh tự check-in Vào lớp nhanh · ${slot.room} (${slot.subject})`,
            parentNotified: true,
          });
        }
      }
    }
    await saveState(env, db);
    return json({ checkin: record, alreadyCheckedIn: false }, 201);
  }

  // 10c. NOTIFICATION PREFERENCES & 10-MINUTE DISPATCHER
  if (method === 'GET' && pathname === '/api/v1/me/notification-prefs') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    return json({ preference: getOrBuildUserNotificationPref(db, user!) });
  }

  if (method === 'PUT' && pathname === '/api/v1/me/notification-prefs') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const current = getOrBuildUserNotificationPref(db, user!);
    const b = await readJson<Record<string, unknown>>();
    const rawChannels = (b.channels || {}) as Record<string, unknown>;
    const lead = Number(b.leadMinutes);
    const validLead = lead === 5 || lead === 10 || lead === 15 ? lead : current.leadMinutes || 10;

    const updated: UserNotificationPreference = {
      userId: resolvePrefKey(user!),
      role: user!.role,
      displayName: user!.name,
      enabled: typeof b.enabled === 'boolean' ? b.enabled : current.enabled,
      leadMinutes: validLead,
      channels: {
        WEB: typeof rawChannels.WEB === 'boolean' ? rawChannels.WEB : current.channels.WEB,
        ZALO: typeof rawChannels.ZALO === 'boolean' ? rawChannels.ZALO : current.channels.ZALO,
        EMAIL: typeof rawChannels.EMAIL === 'boolean' ? rawChannels.EMAIL : current.channels.EMAIL,
        FACEBOOK:
          typeof rawChannels.FACEBOOK === 'boolean' ? rawChannels.FACEBOOK : current.channels.FACEBOOK,
      },
      zaloPhone: typeof b.zaloPhone === 'string' ? b.zaloPhone.trim().slice(0, 30) : current.zaloPhone,
      email: typeof b.email === 'string' ? b.email.trim().slice(0, 140) : current.email,
      facebookPsid:
        typeof b.facebookPsid === 'string' ? b.facebookPsid.trim().slice(0, 120) : current.facebookPsid,
      updatedAt: nowFormatted(),
    };
    if (!Array.isArray(db.notificationPrefs)) db.notificationPrefs = [];
    const idx = db.notificationPrefs.findIndex((p) => p.userId === updated.userId);
    if (idx >= 0) db.notificationPrefs[idx] = updated;
    else db.notificationPrefs.unshift(updated);
    await saveState(env, db);
    return json({ preference: updated });
  }

  if (method === 'POST' && pathname === '/api/v1/me/notification-prefs/test') {
    const denied = requireRole();
    if (denied) return denied;
    const db = await loadState(env);
    const pref = getOrBuildUserNotificationPref(db, user!);
    const activeChannels = Object.entries(pref.channels)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k)
      .join(', ');
    const notif = {
      id: `ntf-test-${Date.now()}`,
      createdAt: nowFormatted(),
      title: `Kiểm thử nhắc lịch trước ${pref.leadMinutes} phút`,
      body: `Xin chào ${user!.name}! Kênh đang bật: ${activeChannels || 'WEB'}. Bạn sẽ nhận nhắc phòng học & giờ vào lớp tự động trước ${pref.leadMinutes} phút.`,
      channel: 'APP' as const,
      targetRole: user!.role,
      read: false,
    };
    db.notifications.unshift(notif);
    await saveState(env, db);
    return json({ ok: true, notification: notif, preference: pref });
  }

  if (method === 'GET' && pathname === '/api/v1/system/notification-config') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    return json({
      config: db.notificationConfig,
      logs: db.reminderDispatchLogs || [],
      subscriberCount: (db.notificationPrefs || []).filter((p) => p.enabled).length,
    });
  }

  if (method === 'PATCH' && pathname === '/api/v1/system/notification-config') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const curr = db.notificationConfig;
    const urlFields: Array<
      'zaloWebhookUrl' | 'emailWebhookUrl' | 'facebookWebhookUrl' | 'unifiedWebhookUrl'
    > = ['zaloWebhookUrl', 'emailWebhookUrl', 'facebookWebhookUrl', 'unifiedWebhookUrl'];
    const validatedUrls: Partial<Record<(typeof urlFields)[number], string>> = {};
    for (const field of urlFields) {
      if (typeof b[field] === 'string') {
        const check = validateWebhookUrl(b[field] as string);
        if (!check.ok) return json({ error: `${field}: ${check.error}` }, 400);
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
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'POLICY_UPDATE',
      targetLabel: 'Cấu hình Nhắc lịch 10 phút (Zalo/Email/Facebook)',
      detail: `Nhắc trước ${db.notificationConfig.leadMinutes} phút.`,
    });
    await saveState(env, db);
    return json({ config: db.notificationConfig });
  }

  if (method === 'POST' && pathname === '/api/v1/notifications/dispatch-upcoming') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{ forceSlotId?: string; dryRun?: boolean }>();
    const db = await loadState(env);
    const result = await dispatchUpcomingReminders(db, {
      forceSlotId: typeof b.forceSlotId === 'string' ? b.forceSlotId.trim() || undefined : undefined,
      dryRun: Boolean(b.dryRun),
      triggeredBy: 'MANUAL_TEST',
    });
    await saveState(env, db);
    return json({ ...result, reminderDispatchLogs: db.reminderDispatchLogs || [] });
  }

  // 10d. SOCIAL MEDIA HUB & ACTIVITY LIBRARY
  if (method === 'GET' && pathname === '/api/v1/social/channels') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    return json({ channels: db.socialChannels || [] });
  }

  const socialChanMatch = pathname.match(/^\/api\/v1\/social\/channels\/([^/]+)$/);
  if (method === 'PUT' && socialChanMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const channel = (db.socialChannels || []).find((c) => c.id === socialChanMatch[1]);
    if (!channel) return json({ error: 'Không tìm thấy kênh mạng xã hội.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.url === 'string' && b.url.trim()) {
      const check = validateSocialUrl(b.url);
      if (!check.ok) return json({ error: check.error }, 400);
      channel.url = check.parsed.toString();
    }
    if (typeof b.label === 'string' && b.label.trim()) channel.label = b.label.trim().slice(0, 120);
    if (typeof b.handle === 'string') channel.handle = b.handle.trim().slice(0, 120);
    if (typeof b.youtubeChannelId === 'string') channel.youtubeChannelId = b.youtubeChannelId.trim().slice(0, 100);
    if (typeof b.active === 'boolean') channel.active = b.active;
    if (typeof b.autoSyncEnabled === 'boolean') channel.autoSyncEnabled = b.autoSyncEnabled;
    await saveState(env, db);
    return json({ channel, channels: db.socialChannels });
  }

  if (method === 'POST' && pathname === '/api/v1/social/fetch-metadata') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{ url?: string }>();
    const result = await fetchSocialUrlMetadata(typeof b.url === 'string' ? b.url.trim() : '');
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ metadata: result.data });
  }

  if (method === 'POST' && pathname === '/api/v1/social/sync-youtube') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<{ youtubeChannelId?: string }>();
    const ytChannel = (db.socialChannels || []).find((c) => c.platform === 'YOUTUBE');
    const channelId =
      (typeof b.youtubeChannelId === 'string' && b.youtubeChannelId.trim()) ||
      ytChannel?.youtubeChannelId ||
      '';
    if (!channelId) {
      return json({ error: 'Vui lòng nhập YouTube Channel ID (bắt đầu bằng UC...) trước khi đồng bộ.' }, 400);
    }
    const fetched = await fetchYouTubeChannelRssPosts(channelId, 6);
    if (!fetched.ok) return json({ error: fetched.error }, 400);
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
    await saveState(env, db);
    return json({ addedCount, posts: db.socialPosts, channels: db.socialChannels });
  }

  if (method === 'POST' && pathname === '/api/v1/social/posts') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<Record<string, unknown>>();
    const title = String(b.title || '').trim();
    const sourceUrl = String(b.sourceUrl || '').trim();
    if (title.length < 3) return json({ error: 'Vui lòng nhập tiêu đề bài viết/video (tối thiểu 3 ký tự).' }, 400);
    const urlCheck = validateSocialUrl(sourceUrl);
    if (!urlCheck.ok) return json({ error: urlCheck.error }, 400);
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
    const db = await loadState(env);
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
    await saveState(env, db);
    return json({ post, posts: db.socialPosts }, 201);
  }

  const socialPostViewMatch = pathname.match(/^\/api\/v1\/social\/posts\/([^/]+)\/view$/);
  if (method === 'POST' && socialPostViewMatch) {
    if (isWorkerRateLimited(request, `view:${socialPostViewMatch[1]}`, 10, 60_000)) {
      return json({ error: 'Thao tác quá nhanh.' }, 429);
    }
    const db = await loadState(env);
    const post = (db.socialPosts || []).find((p) => p.id === socialPostViewMatch[1] && p.visible);
    if (!post) return json({ error: 'Không tìm thấy bài viết.' }, 404);
    post.viewCount = (post.viewCount || 0) + 1;
    await saveState(env, db);
    return json({ id: post.id, viewCount: post.viewCount });
  }

  const socialPostMatch = pathname.match(/^\/api\/v1\/social\/posts\/([^/]+)$/);
  if (method === 'PATCH' && socialPostMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const post = (db.socialPosts || []).find((p) => p.id === socialPostMatch[1]);
    if (!post) return json({ error: 'Không tìm thấy bài viết hoạt động.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.title === 'string' && b.title.trim()) post.title = b.title.trim().slice(0, 200);
    if (typeof b.excerpt === 'string') post.excerpt = b.excerpt.trim().slice(0, 600);
    if (typeof b.category === 'string' && b.category.trim()) post.category = b.category.trim().slice(0, 80);
    if (typeof b.thumbnailUrl === 'string' && b.thumbnailUrl.trim()) {
      post.thumbnailUrl = b.thumbnailUrl.trim().slice(0, 500);
    }
    if (typeof b.sourceUrl === 'string' && b.sourceUrl.trim()) {
      const check = validateSocialUrl(b.sourceUrl);
      if (!check.ok) return json({ error: check.error }, 400);
      post.sourceUrl = check.parsed.toString();
    }
    if (typeof b.featured === 'boolean') post.featured = b.featured;
    if (typeof b.visible === 'boolean') post.visible = b.visible;
    await saveState(env, db);
    return json({ post, posts: db.socialPosts });
  }

  if (method === 'DELETE' && socialPostMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const before = (db.socialPosts || []).length;
    db.socialPosts = (db.socialPosts || []).filter((p) => p.id !== socialPostMatch[1]);
    if (db.socialPosts.length === before) return json({ error: 'Không tìm thấy bài viết cần xóa.' }, 404);
    await saveState(env, db);
    return json({ ok: true, posts: db.socialPosts });
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
    const denied = requireRole(['MANAGER', 'TEACHER']);
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
    if (isWorkerRateLimited(request, 'ai-consult', 20, 60_000)) {
      return json({ error: 'Trợ lý AI đang nhận nhiều yêu cầu, vui lòng thử lại sau ít giây.' }, 429);
    }
    try {
      const b = await readJson<{ question?: string; language?: string }>();
      const question = typeof b.question === 'string' ? b.question.trim() : '';
      if (!question || question.length > 800) {
        return json({ error: 'Vui lòng nhập câu hỏi cần tư vấn (tối đa 800 ký tự).' }, 400);
      }
      const db = await loadState(env);
      const ai = getGeminiClient(env);
      const lang = b.language === 'en' ? 'en' : 'vi';
      const systemInstruction =
        lang === 'en'
          ? 'You are the 24/7 Academic Advisor of Trung Tâm Dạy Thêm Học Thêm Nhân Trí (35 Lý Thường Kiệt, Long Xuyên, An Giang · Hotline/Zalo Cô Tâm: 0947 376 444). Answer concisely in English: Primary (Grades 3-5) small-group Math/English/Vietnamese 1.1M VND/month with FREE makeup tutoring; Middle School (Grades 6-9) all-in-one 1.85M VND/month (+950k boarding, +450k shuttle) with Grade 10 entrance prep; High School (Grades 10-12) 650k/subject/month for all 6 subjects (Math, Literature, English, Physics, Chemistry, Biology) + V-ACT/V-SAT/BCA/HCMUE aptitude prep; 10% annual prepayment discount; automatic 17:30-19:00 makeup for PE conflicts.'
          : 'Bạn là Trợ lý Học vụ & Tư vấn 24/7 của Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, An Giang · Hotline/Zalo Cô Tâm: 0947 376 444 · Email: trungtamnhantri.lxag@gmail.com). Trả lời rõ ràng, ngắn gọn: Cấp 1 (Lớp 3-5) nhóm nhỏ tích hợp Toán - Anh - Việt 1.100.000đ/tháng, phụ đạo bù bài MIỄN PHÍ khi lỡ buổi; Cấp 2 (Lớp 6-9) trọn gói 1.850.000đ/tháng (có trả bài, lộ trình Thời điểm vàng lớp 8-9 luyện thi vào Lớp 10, tùy chọn bán trú +950k, đưa rước +450k); Cấp 3 (Lớp 10-12) theo môn 650.000đ/môn/tháng đủ 6 môn Toán, Văn, Anh, Lý, Hóa, Sinh + luyện thi ĐGNL (V-ACT, V-SAT, Bộ Công an, HCMUE); đóng nguyên năm giảm 10%; trùng Thể dục tự xếp bù tối 17h30–19h00.';
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

  // 12. UNIVERSAL MULTIMODAL AI EXTRACTION + BULK UPSERT + DYNAMIC QR + TIMETABLE DISPATCH
  if (method === 'POST' && pathname === '/api/v1/ai/smart-extract') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    try {
      const b = await readJson<Record<string, unknown>>();
      const entityType = String(b.entityType || '').toUpperCase();
      if (!['STUDENTS', 'TEACHERS', 'SCORES', 'TIMETABLE'].includes(entityType)) {
        return json({ error: 'Loại dữ liệu trích xuất không hợp lệ.' }, 400);
      }
      const fileBase64 = typeof b.fileBase64 === 'string' ? b.fileBase64 : undefined;
      const mimeType = typeof b.mimeType === 'string' ? b.mimeType : undefined;
      const rawText = typeof b.rawText === 'string' ? b.rawText : undefined;
      if (!fileBase64 && (!rawText || !rawText.trim())) {
        return json({ error: 'Vui lòng cung cấp ảnh, PDF, file Word hoặc bảng dữ liệu để AI phân tích.' }, 400);
      }
      const db = await loadState(env);
      const ai = getGeminiClient(env);
      const rows = await smartExtractWithGemini(
        {
          entityType: entityType as 'STUDENTS' | 'TEACHERS' | 'SCORES' | 'TIMETABLE',
          fileBase64,
          mimeType,
          rawText,
          canonicalContext: {
            teachers: db.teachers.map((t) => `${t.shortName} (${t.name})`),
            rooms: db.rooms.map((r) => `${r.name} (${r.code})`),
            classes: Array.from(new Set(db.timetable.map((s) => s.centerClass))),
          },
        },
        ai,
      );
      return json({ rows, count: rows.length });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : 'Lỗi AI trích xuất tài liệu đa phương thức.' }, 500);
    }
  }

  if (method === 'POST' && pathname === '/api/v1/teachers/bulk-import') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{ rows?: Record<string, unknown>[] }>();
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (rows.length === 0) return json({ error: 'Chưa có dòng dữ liệu giáo viên nào để nhập.' }, 400);
    const db = await loadState(env);
    const result = bulkUpsertTeachers(db, rows);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'TEACHERS_BULK_IMPORT',
      targetLabel: `${result.added} mới · ${result.updated} cập nhật`,
      detail: `Nhập hàng loạt giáo viên (Bỏ qua: ${result.skipped}).`,
    });
    await saveState(env, db);
    return json(result);
  }

  if (method === 'POST' && pathname === '/api/v1/students/bulk-import') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{ rows?: Record<string, unknown>[] }>();
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (rows.length === 0) return json({ error: 'Chưa có dòng dữ liệu học sinh nào để nhập.' }, 400);
    const db = await loadState(env);
    const result = bulkUpsertStudents(db, rows);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'STUDENTS_BULK_IMPORT',
      targetLabel: `${result.added} mới · ${result.updated} cập nhật · ${result.familiesLinked} GĐ ghép`,
      detail: `Nhập hàng loạt học sinh kèm mã NT26 + QR động (Bỏ qua: ${result.skipped}).`,
    });
    await saveState(env, db);
    return json(result);
  }

  if (method === 'POST' && pathname === '/api/v1/scores/bulk-import') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const b = await readJson<{ rows?: Record<string, unknown>[] }>();
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (rows.length === 0) return json({ error: 'Chưa có dòng dữ liệu điểm số nào để nhập.' }, 400);
    const db = await loadState(env);
    const result = bulkImportScores(db, rows, user!.role);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'SCORES_BULK_IMPORT',
      targetLabel: `${result.added} cột điểm đã lưu`,
      detail: `Nhập điểm hàng loạt (Chưa khớp: ${result.unmatched}).`,
    });
    await saveState(env, db);
    return json(result);
  }

  if (method === 'POST' && pathname === '/api/v1/timetable/smart-sync') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{ rows?: Record<string, unknown>[]; mode?: string }>();
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const rawMode = String(b.mode || 'UPSERT').toUpperCase();
    const mode = (['UPSERT', 'APPEND', 'REPLACE_ALL'].includes(rawMode) ? rawMode : 'UPSERT') as
      | 'UPSERT'
      | 'APPEND'
      | 'REPLACE_ALL';
    if (rows.length === 0) return json({ error: 'Chưa có ca học nào để đồng bộ Thời khóa biểu.' }, 400);
    const db = await loadState(env);
    const result = smartSyncTimetable(db, rows, mode);
    if (result.added > 0 || result.updated > 0) {
      const allTeacherIds = Array.from(new Set(db.timetable.map((sl) => sl.teacherId).filter(Boolean)));
      recordTimetableChange(db, {
        action: 'BULK_IMPORT',
        updatedBy: user!.email,
        summary: `Đồng bộ TKB đa chiều (${mode}): +${result.added} ca mới, cập nhật ${result.updated} ca`,
        affectedTeacherIds: allTeacherIds,
      });
    }
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'TIMETABLE_SMART_SYNC',
      targetLabel: `Chế độ ${mode}: +${result.added} / cập nhật ${result.updated}`,
      detail: `Đồng bộ TKB đa chiều (Bỏ qua: ${result.skipped}, Cảnh báo: ${result.warnings.length}).`,
    });
    await saveState(env, db);
    return json(result);
  }

  const regenQrMatch = pathname.match(/^\/api\/v1\/students\/([^/]+)\/regenerate-qr$/);
  if (method === 'POST' && regenQrMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === regenQrMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy hồ sơ học sinh.' }, 404);
    const b = await readJson<{ regeneratePin?: boolean }>();
    student.qrToken = generateQrToken();
    if (b.regeneratePin) student.accessPin = generateAccessPin();
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'STUDENT_QR_ROTATED',
      targetLabel: `${student.fullName} (${student.code})`,
      detail: 'Cấp lại Token QR động (vô hiệu hóa thẻ QR cũ).',
    });
    await saveState(env, db);
    return json({ student });
  }

  const qrUnlockMatch = pathname.match(/^\/api\/v1\/qr\/([^/]+)\/unlock$/);
  if (method === 'POST' && qrUnlockMatch) {
    if (isWorkerRateLimited(request, 'qr-unlock', 12, 5 * 60_000)) {
      return json({ error: 'Bạn đã nhập sai mã PIN quá nhiều lần. Vui lòng thử lại sau 5 phút.' }, 429);
    }
    const db = await loadState(env);
    const student = findStudentByQrTokenOrCode(db, decodeURIComponent(qrUnlockMatch[1]));
    if (!student || student.accessStatus === 'LOCKED') {
      return json({ error: 'Mã QR không hợp lệ hoặc hồ sơ đang tạm khóa.' }, 404);
    }
    const b = await readJson<{ pin?: string }>();
    const pin = String(b.pin || '').trim();
    if (!pin || !studentMatchesSecret(student, pin)) {
      return json({ error: 'Mã PIN xác thực chưa chính xác. Vui lòng kiểm tra trên thẻ hoặc nhắn Zalo Cô Tâm (0947 376 444).' }, 401);
    }
    return json({ unlocked: true, bundle: buildUnlockedQrStudentData(db, student) });
  }

  const qrAttMatch = pathname.match(/^\/api\/v1\/qr\/([^/]+)\/attendance$/);
  if (method === 'POST' && qrAttMatch) {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    const student = findStudentByQrTokenOrCode(db, decodeURIComponent(qrAttMatch[1]));
    if (!student) return json({ error: 'Không tìm thấy học sinh khớp với mã QR / Mã HS này.' }, 404);
    const b = await readJson<{ shiftLabel?: string; status?: AttendanceRecord['status']; note?: string }>();
    const result = recordQrAttendanceCheckIn(db, student, {
      shiftLabel: b.shiftLabel,
      status: b.status,
      note: b.note,
      actorName: user!.name,
    });
    await saveState(env, db);
    return json({
      student,
      attendance: result.record,
      alreadyCheckedInToday: result.alreadyCheckedInToday,
    });
  }

  const qrLookupMatch = pathname.match(/^\/api\/v1\/qr\/([^/]+)$/);
  if (method === 'GET' && qrLookupMatch) {
    const db = await loadState(env);
    const student = findStudentByQrTokenOrCode(db, decodeURIComponent(qrLookupMatch[1]));
    if (!student) {
      return json({ error: 'Mã QR học sinh không tồn tại hoặc đã bị thu hồi.' }, 404);
    }
    const isStaff = Boolean(
      user && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEACHER'].includes(user.role),
    );
    return json({
      publicPreview: {
        code: student.code,
        centerClass: student.centerClass,
        school: student.school,
        grade: student.grade,
        accessStatus: student.accessStatus || 'ACTIVE',
        hasPin: Boolean(student.accessPin),
      },
      isStaff,
      staffBundle: isStaff ? buildUnlockedQrStudentData(db, student) : undefined,
    });
  }

  if (method === 'POST' && pathname === '/api/v1/timetable/dispatch-personal') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const b = await readJson<{
      items?: Array<{
        recipientName: string;
        recipientRole: UserRole;
        channel?: 'ZALO' | 'EMAIL' | 'APP';
        targetPhone?: string;
        targetEmail?: string;
        summary: string;
      }>;
    }>();
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) {
      return json({ error: 'Chưa chọn người nhận nào để gửi Thời khóa biểu cá nhân hóa.' }, 400);
    }
    const db = await loadState(env);
    if (!Array.isArray(db.reminderDispatchLogs)) db.reminderDispatchLogs = [];
    const webhookUrl = db.notificationConfig?.unifiedWebhookUrl || db.notificationConfig?.zaloWebhookUrl;
    const webhookSafe = webhookUrl ? validateWebhookUrl(webhookUrl).ok : false;
    let webhookDelivered = 0;
    const nowStr = nowFormatted();
    const createdLogs = [];

    for (const item of items.slice(0, 80)) {
      let status: 'SENT' | 'QUEUED_WEBHOOK' | 'SIMULATED' | 'FAILED' = 'SENT';
      if (webhookSafe && webhookUrl) {
        try {
          const hookRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'PERSONAL_TIMETABLE_DISPATCH',
              recipientName: item.recipientName,
              recipientRole: item.recipientRole,
              phone: item.targetPhone,
              email: item.targetEmail,
              message: item.summary,
              sentBy: user!.name,
              sentAt: nowStr,
            }),
          });
          status = hookRes.ok ? 'QUEUED_WEBHOOK' : 'FAILED';
          if (hookRes.ok) webhookDelivered += 1;
        } catch {
          status = 'FAILED';
        }
      }
      const log = {
        id: `dsp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        sentAt: nowStr,
        slotId: 'personal-pdf',
        slotLabel: 'Gửi TKB Cá nhân hóa',
        recipientName: String(item.recipientName || 'Phụ huynh').slice(0, 120),
        recipientRole: item.recipientRole || 'PARENT',
        channel: (item.channel || 'ZALO') as 'ZALO' | 'EMAIL' | 'APP',
        status,
        detail: String(item.summary || '').slice(0, 260),
      };
      db.reminderDispatchLogs.unshift(log);
      createdLogs.push(log);
    }
    if (db.reminderDispatchLogs.length > 200) {
      db.reminderDispatchLogs = db.reminderDispatchLogs.slice(0, 200);
    }
    await saveState(env, db);
    return json({ dispatched: createdLogs.length, webhookDelivered, logs: createdLogs });
  }

  // STUDENT QUICK-EDIT (WITH CASCADE INTEGRITY SYNC)
  const studentPatchMatch = pathname.match(/^\/api\/v1\/students\/([^/]+)$/);
  if (method === 'PATCH' && studentPatchMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === studentPatchMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy hồ sơ học sinh.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.fullName === 'string' && b.fullName.trim().length >= 2) {
      student.fullName = b.fullName.trim().slice(0, 120);
    }
    if (b.grade !== undefined) {
      const g = Math.min(12, Math.max(1, Number(b.grade) || student.grade));
      student.grade = g;
      student.level = (g <= 5 ? 'CAP_1' : g <= 9 ? 'CAP_2' : 'CAP_3') as EducationLevel;
    }
    if (b.level === 'CAP_1' || b.level === 'CAP_2' || b.level === 'CAP_3') student.level = b.level;
    if (typeof b.centerClass === 'string' && b.centerClass.trim().length >= 2) {
      student.centerClass = b.centerClass.trim().slice(0, 60);
    }
    if (typeof b.schoolClass === 'string') {
      student.schoolClass = b.schoolClass.trim().slice(0, 40) || student.schoolClass;
    }
    if (typeof b.school === 'string' && b.school.trim()) student.school = b.school.trim().slice(0, 140);
    if (typeof b.homeroomTeacherId === 'string') {
      student.homeroomTeacherId = b.homeroomTeacherId.trim() || undefined;
    }
    if (typeof b.homeroomTeacher === 'string' && b.homeroomTeacher.trim()) {
      student.homeroomTeacher = b.homeroomTeacher.trim().slice(0, 80);
    }
    if (typeof b.roomId === 'string') student.roomId = b.roomId.trim() || undefined;
    if (typeof b.room === 'string' && b.room.trim()) student.room = b.room.trim().slice(0, 60);
    if (typeof b.parentName === 'string' && b.parentName.trim()) student.parentName = b.parentName.trim().slice(0, 120);
    if (typeof b.parentPhone === 'string' && b.parentPhone.trim().length >= 8) {
      student.parentPhone = normalizePhoneVN(b.parentPhone) || b.parentPhone.trim().slice(0, 30);
    }
    if (
      b.packageType === 'ALL_IN_ONE' ||
      b.packageType === 'PER_SUBJECT' ||
      b.packageType === 'TUTORING'
    ) {
      student.packageType = b.packageType;
    }
    if (typeof b.hasBoarding === 'boolean') student.hasBoarding = b.hasBoarding;
    if (typeof b.hasShuttle === 'boolean') student.hasShuttle = b.hasShuttle;
    if (typeof b.annualPrepaid === 'boolean') student.annualPrepaid = b.annualPrepaid;
    if (b.enrolledSubjects !== undefined) {
      const arr = Array.isArray(b.enrolledSubjects)
        ? b.enrolledSubjects
        : String(b.enrolledSubjects).split(/[,;]/);
      const cleaned = arr.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12);
      if (cleaned.length > 0) student.enrolledSubjects = cleaned;
    }
    if (b.status === 'ACTIVE' || b.status === 'PAUSED') student.status = b.status;

    const synced = cascadeSyncStudentUpdate(db, student);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'STUDENT_QUICK_UPDATE',
      targetLabel: `${student.fullName} (${student.code})`,
      detail: `Cập nhật hồ sơ học sinh lớp ${student.centerClass}. Đồng bộ: ${synced.updatedScores} điểm, ${synced.updatedAttendance} điểm danh, ${synced.updatedTuition} phiếu học phí.`,
    });
    await saveState(env, db);
    return json({ student, synced });
  }

  // CENTER-STANDARD CUSTOM PRINT TEMPLATES CRUD
  const sanitizeWorkerPrintBlocks = (raw: unknown, fallback?: PrintTemplateBlocks): PrintTemplateBlocks => {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const sigs = Array.isArray(b.signatureLabels)
      ? b.signatureLabels.map((s) => String(s || '').trim().slice(0, 60)).filter(Boolean).slice(0, 4)
      : fallback?.signatureLabels || ['Giáo viên phụ trách', 'Quản lý học vụ'];
    return {
      showLogoHeader: typeof b.showLogoHeader === 'boolean' ? b.showLogoHeader : fallback?.showLogoHeader ?? true,
      showWatermark: typeof b.showWatermark === 'boolean' ? b.showWatermark : fallback?.showWatermark ?? true,
      showFilterSummary: typeof b.showFilterSummary === 'boolean' ? b.showFilterSummary : fallback?.showFilterSummary ?? true,
      showRowNumbers: typeof b.showRowNumbers === 'boolean' ? b.showRowNumbers : fallback?.showRowNumbers ?? true,
      showSummaryStats: typeof b.showSummaryStats === 'boolean' ? b.showSummaryStats : fallback?.showSummaryStats ?? true,
      showSignatures: typeof b.showSignatures === 'boolean' ? b.showSignatures : fallback?.showSignatures ?? true,
      signatureLabels: sigs.length > 0 ? sigs : ['Giáo viên phụ trách', 'Quản lý học vụ'],
    };
  };

  if (method === 'GET' && pathname === '/api/v1/print-templates') {
    const denied = requireRole(['MANAGER', 'TEACHER']);
    if (denied) return denied;
    const db = await loadState(env);
    return json({ templates: ensureSystemPrintTemplates(db.printTemplates) });
  }

  if (method === 'POST' && pathname === '/api/v1/print-templates') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    db.printTemplates = ensureSystemPrintTemplates(db.printTemplates);
    const b = await readJson<Record<string, unknown>>();
    const name = String(b.name || '').trim().slice(0, 120);
    if (name.length < 2) return json({ error: 'Vui lòng nhập tên Mẫu in (tối thiểu 2 ký tự).' }, 400);
    const entityType: PrintTemplateEntityType = b.entityType === 'TEACHERS' ? 'TEACHERS' : 'STUDENTS';
    const presetBase: PrintTemplatePreset =
      b.presetBase === 'SIMPLE' || b.presetBase === 'FULL' ? b.presetBase : 'CUSTOM';
    const validGroupBys: PrintTemplateGroupBy[] = ['NONE', 'CLASS', 'GRADE', 'LEVEL', 'TEACHER_GROUP', 'STATUS'];
    const groupBy: PrintTemplateGroupBy = validGroupBys.includes(b.groupBy as PrintTemplateGroupBy)
      ? (b.groupBy as PrintTemplateGroupBy)
      : 'NONE';
    const columns = Array.isArray(b.columns)
      ? b.columns.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 16)
      : [];
    if (columns.length === 0) return json({ error: 'Vui lòng chọn ít nhất 1 cột hiển thị cho Mẫu in.' }, 400);
    const extraBlankColumns = Array.isArray(b.extraBlankColumns)
      ? b.extraBlankColumns.map((c) => String(c || '').trim().slice(0, 40)).filter(Boolean).slice(0, 4)
      : [];
    const template: PrintTemplate = {
      id: `tpl-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      description: String(b.description || '').trim().slice(0, 240) || undefined,
      entityType,
      presetBase,
      customTitle:
        String(b.customTitle || '').trim().slice(0, 140) ||
        (entityType === 'TEACHERS' ? 'DANH SÁCH GIÁO VIÊN TRUNG TÂM' : 'DANH SÁCH HỌC SINH TRUNG TÂM'),
      orientation: b.orientation === 'landscape' ? 'landscape' : 'portrait',
      fontSize: b.fontSize === 'sm' || b.fontSize === 'lg' ? b.fontSize : 'md',
      groupBy,
      columns,
      extraBlankColumns,
      blocks: sanitizeWorkerPrintBlocks(b.blocks),
      isSystemDefault: false,
      createdBy: user!.email || user!.name,
      updatedBy: user!.email || user!.name,
      updatedAt: new Date().toISOString(),
    };
    db.printTemplates.push(template);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'PRINT_TEMPLATE_CREATE',
      targetLabel: `${template.name} (${template.entityType})`,
      detail: `Tạo mẫu in tùy biến gồm ${template.columns.length} cột, khổ ${template.orientation}.`,
    });
    await saveState(env, db);
    return json({ template, templates: db.printTemplates }, 201);
  }

  const printTplMatch = pathname.match(/^\/api\/v1\/print-templates\/([^/]+)$/);
  if (method === 'PATCH' && printTplMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    db.printTemplates = ensureSystemPrintTemplates(db.printTemplates);
    const template = db.printTemplates.find((t) => t.id === printTplMatch[1]);
    if (!template) return json({ error: 'Không tìm thấy mẫu in này.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.name === 'string' && b.name.trim().length >= 2) template.name = b.name.trim().slice(0, 120);
    if (typeof b.description === 'string') template.description = b.description.trim().slice(0, 240) || undefined;
    if (typeof b.customTitle === 'string' && b.customTitle.trim()) template.customTitle = b.customTitle.trim().slice(0, 140);
    if (b.presetBase === 'SIMPLE' || b.presetBase === 'FULL' || b.presetBase === 'CUSTOM') template.presetBase = b.presetBase;
    if (b.orientation === 'portrait' || b.orientation === 'landscape') template.orientation = b.orientation;
    if (b.fontSize === 'sm' || b.fontSize === 'md' || b.fontSize === 'lg') template.fontSize = b.fontSize;
    const validGroupBys: PrintTemplateGroupBy[] = ['NONE', 'CLASS', 'GRADE', 'LEVEL', 'TEACHER_GROUP', 'STATUS'];
    if (validGroupBys.includes(b.groupBy as PrintTemplateGroupBy)) {
      template.groupBy = b.groupBy as PrintTemplateGroupBy;
    }
    if (Array.isArray(b.columns)) {
      const cleaned = b.columns.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 16);
      if (cleaned.length > 0) template.columns = cleaned;
    }
    if (Array.isArray(b.extraBlankColumns)) {
      template.extraBlankColumns = b.extraBlankColumns
        .map((c) => String(c || '').trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 4);
    }
    if (b.blocks) template.blocks = sanitizeWorkerPrintBlocks(b.blocks, template.blocks);
    template.updatedBy = user!.email || user!.name;
    template.updatedAt = new Date().toISOString();
    await saveState(env, db);
    return json({ template, templates: db.printTemplates });
  }

  if (method === 'DELETE' && printTplMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    db.printTemplates = ensureSystemPrintTemplates(db.printTemplates);
    const template = db.printTemplates.find((t) => t.id === printTplMatch[1]);
    if (!template) return json({ error: 'Không tìm thấy mẫu in này.' }, 404);
    if (template.isSystemDefault) {
      return json({ error: 'Không thể xóa Mẫu in chuẩn mặc định của Trung tâm.' }, 400);
    }
    db.printTemplates = db.printTemplates.filter((t) => t.id !== template.id);
    await saveState(env, db);
    return json({ deleted: true, templates: db.printTemplates });
  }

  // DATA HEALTH AUDIT & 1-CLICK AUTO-REPAIR
  if (method === 'GET' && pathname === '/api/v1/system/data-health') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    return json({ report: auditDatabaseHealth(db) });
  }

  if (method === 'POST' && pathname === '/api/v1/system/data-health/repair') {
    const denied = requireRole(['ADMIN']);
    if (denied) return denied;
    const db = await loadState(env);
    const result = repairDatabaseHealth(db);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'DATA_HEALTH_REPAIR',
      targetLabel: `Điểm sức khỏe: ${result.reportAfter.healthyScore}/100`,
      detail:
        result.summary.length > 0
          ? result.summary.join(' ')
          : 'Kiểm tra toàn vẹn dữ liệu: CSDL đã đạt chuẩn, không cần sửa lỗi.',
    });
    await saveState(env, db);
    return json(result);
  }

  // SAFE 2-STEP DELETE & ARCHIVE (STUDENTS & TEACHERS)
  const delStudentMatch = pathname.match(/^\/api\/v1\/students\/([^/]+)$/);
  if (method === 'DELETE' && delStudentMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const student = db.students.find((s) => s.id === delStudentMatch[1]);
    if (!student) return json({ error: 'Không tìm thấy hồ sơ học sinh.' }, 404);
    const b = await readJson<{ confirmName?: string; reason?: string }>();
    if (!isExactConfirmNameMatch(String(b.confirmName || ''), student.fullName)) {
      return json(
        { error: `Tên xác nhận chưa khớp. Vui lòng nhập chính xác "${student.fullName}" để xóa hồ sơ.` },
        400,
      );
    }
    const preservedScoresCount = db.scores.filter((sc) => sc.studentId === student.id).length;
    const preservedTuitionCount = db.tuition.filter((t) => t.studentId === student.id).length;
    const archived = {
      id: `arch-st-${Date.now()}`,
      originalId: student.id,
      code: student.code,
      fullName: student.fullName,
      centerClass: student.centerClass,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      archivedAt: new Date().toISOString(),
      archivedBy: user!.email,
      reason: String(b.reason || '').trim().slice(0, 300) || 'Xóa theo yêu cầu quản trị (đã bảo lưu lịch sử tài chính & điểm số)',
      preservedScoresCount,
      preservedTuitionCount,
      snapshot: structuredClone(student),
    };
    if (!Array.isArray(db.archivedStudents)) db.archivedStudents = [];
    db.archivedStudents.unshift(archived);
    db.students = db.students.filter((s) => s.id !== student.id);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'STUDENT_ARCHIVED_DELETED',
      target: student.id,
      targetLabel: `${student.fullName} (${student.code})`,
      detail: `Đã xóa hồ sơ học sinh & bảo lưu ${preservedScoresCount} điểm, ${preservedTuitionCount} phiếu học phí.`,
    });
    await saveState(env, db);
    return json({ deleted: true, archived, preservedScoresCount, preservedTuitionCount });
  }

  const delTeacherMatch = pathname.match(/^\/api\/v1\/teachers\/([^/]+)$/);
  if (method === 'DELETE' && delTeacherMatch) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const teacher = db.teachers.find((t) => t.id === delTeacherMatch[1]);
    if (!teacher) return json({ error: 'Không tìm thấy hồ sơ giáo viên.' }, 404);
    const b = await readJson<{ confirmName?: string; reason?: string }>();
    if (!isExactConfirmNameMatch(String(b.confirmName || ''), teacher.name)) {
      return json(
        { error: `Tên xác nhận chưa khớp. Vui lòng nhập chính xác "${teacher.name}" để xóa hồ sơ giáo viên.` },
        400,
      );
    }
    const affectedSlots = db.timetable.filter((sl) => sl.teacherId === teacher.id);
    db.timetable = db.timetable.filter((sl) => sl.teacherId !== teacher.id);
    db.teacherLeaves = db.teacherLeaves.filter((lv) => lv.teacherId !== teacher.id);
    if (affectedSlots.length > 0) {
      recordTimetableChange(db, {
        action: 'REMOVED',
        updatedBy: user!.email,
        summary: `Gỡ ${affectedSlots.length} ca TKB của ${teacher.shortName} sau khi xóa & lưu trữ hồ sơ giáo viên`,
        affectedTeacherIds: [teacher.id],
      });
    }
    const archived = {
      id: `arch-tc-${Date.now()}`,
      originalId: teacher.id,
      name: teacher.name,
      shortName: teacher.shortName,
      teacherGroup: teacher.teacherGroup,
      subjects: [...(teacher.subjects || [])],
      archivedAt: new Date().toISOString(),
      archivedBy: user!.email,
      reason: String(b.reason || '').trim().slice(0, 300) || 'Xóa theo yêu cầu quản trị',
      removedTimetableSlotsCount: affectedSlots.length,
      snapshot: structuredClone(teacher),
    };
    if (!Array.isArray(db.archivedTeachers)) db.archivedTeachers = [];
    db.archivedTeachers.unshift(archived);
    db.teachers = db.teachers.filter((t) => t.id !== teacher.id);
    appendAuditLog(db, {
      actorEmail: user!.email,
      actorRole: user!.role,
      action: 'TEACHER_ARCHIVED_DELETED',
      target: teacher.id,
      targetLabel: `${teacher.name} (${teacher.shortName})`,
      detail: `Đã xóa hồ sơ giáo viên & gỡ ${affectedSlots.length} ca trên TKB.`,
    });
    await saveState(env, db);
    return json({ deleted: true, archived, removedTimetableSlotsCount: affectedSlots.length });
  }

  // EDITORIAL ARTICLES CRUD
  if (method === 'POST' && pathname === '/api/v1/articles') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    const b = await readJson<Record<string, unknown>>();
    const title = String(b.title || '').trim();
    if (title.length < 3) return json({ error: 'Vui lòng nhập tiêu đề bài viết.' }, 400);
    const nowIso = new Date().toISOString();
    const status = b.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const article = {
      id: `art-${Date.now().toString(36)}`,
      title: title.slice(0, 220),
      slug: slugifyVietnamese(title),
      category: String(b.category || 'Tin tức & Thông báo').trim().slice(0, 80),
      excerpt: String(b.excerpt || '').trim().slice(0, 420),
      coverImageUrl: sanitizeSafeUrl(String(b.coverImageUrl || ''), true),
      contentHtml: sanitizeRichHtml(String(b.contentHtml || '')),
      authorName: user!.name || 'Ban Quản Trị',
      authorEmail: user!.email,
      status: status as 'DRAFT' | 'PUBLISHED',
      featured: Boolean(b.featured),
      createdAt: nowIso,
      updatedAt: nowIso,
      publishedAt: status === 'PUBLISHED' ? nowIso : undefined,
    };
    if (!Array.isArray(db.editorialArticles)) db.editorialArticles = structuredClone(DEFAULT_EDITORIAL_ARTICLES);
    db.editorialArticles.unshift(article);
    await saveState(env, db);
    return json({ article }, 201);
  }

  const artMatch = pathname.match(/^\/api\/v1\/articles\/([^/]+)$/);
  if (artMatch && (method === 'PATCH' || method === 'DELETE')) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    if (!Array.isArray(db.editorialArticles)) db.editorialArticles = [];
    if (method === 'DELETE') {
      db.editorialArticles = db.editorialArticles.filter((a) => a.id !== artMatch[1]);
      await saveState(env, db);
      return json({ deleted: true });
    }
    const article = db.editorialArticles.find((a) => a.id === artMatch[1]);
    if (!article) return json({ error: 'Không tìm thấy bài viết.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.title === 'string' && b.title.trim().length >= 3) {
      article.title = b.title.trim().slice(0, 220);
      article.slug = slugifyVietnamese(article.title);
    }
    if (typeof b.category === 'string') article.category = b.category.trim().slice(0, 80);
    if (typeof b.excerpt === 'string') article.excerpt = b.excerpt.trim().slice(0, 420);
    if (typeof b.coverImageUrl === 'string') article.coverImageUrl = sanitizeSafeUrl(b.coverImageUrl, true);
    if (typeof b.contentHtml === 'string') article.contentHtml = sanitizeRichHtml(b.contentHtml);
    if (b.status === 'DRAFT' || b.status === 'PUBLISHED') {
      article.status = b.status;
      if (article.status === 'PUBLISHED' && !article.publishedAt) article.publishedAt = new Date().toISOString();
    }
    if (typeof b.featured === 'boolean') article.featured = b.featured;
    article.updatedAt = new Date().toISOString();
    await saveState(env, db);
    return json({ article });
  }

  // REUSABLE CONTENT BLOCKS CRUD
  if (method === 'POST' && pathname === '/api/v1/content-blocks') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    db.reusableBlocks = ensureDefaultReusableBlocks(db.reusableBlocks);
    const b = await readJson<Record<string, unknown>>();
    const name = String(b.name || '').trim();
    if (name.length < 2) return json({ error: 'Vui lòng nhập tên Block tĩnh.' }, 400);
    const validCats = ['CONTACT', 'SCHEDULE', 'TUITION_OFFER', 'CTA', 'PARENT_NOTE', 'CUSTOM'];
    const block = {
      id: `blk-${Date.now().toString(36)}`,
      name: name.slice(0, 120),
      category: (validCats.includes(String(b.category)) ? b.category : 'CUSTOM') as 'CONTACT' | 'SCHEDULE' | 'TUITION_OFFER' | 'CTA' | 'PARENT_NOTE' | 'CUSTOM',
      description: String(b.description || '').trim().slice(0, 260),
      htmlContent: sanitizeRichHtml(String(b.htmlContent || '')),
      isSystemDefault: false,
      updatedAt: new Date().toISOString(),
      updatedBy: user!.email,
    };
    db.reusableBlocks.unshift(block);
    await saveState(env, db);
    return json({ block, blocks: db.reusableBlocks }, 201);
  }

  const blkMatch = pathname.match(/^\/api\/v1\/content-blocks\/([^/]+)$/);
  if (blkMatch && (method === 'PATCH' || method === 'DELETE')) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    db.reusableBlocks = ensureDefaultReusableBlocks(db.reusableBlocks);
    if (method === 'DELETE') {
      db.reusableBlocks = db.reusableBlocks.filter((item) => item.id !== blkMatch[1]);
      await saveState(env, db);
      return json({ deleted: true, blocks: db.reusableBlocks });
    }
    const block = db.reusableBlocks.find((item) => item.id === blkMatch[1]);
    if (!block) return json({ error: 'Không tìm thấy Block tĩnh.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.name === 'string' && b.name.trim().length >= 2) block.name = b.name.trim().slice(0, 120);
    const validCats = ['CONTACT', 'SCHEDULE', 'TUITION_OFFER', 'CTA', 'PARENT_NOTE', 'CUSTOM'];
    if (validCats.includes(String(b.category))) block.category = b.category as typeof block.category;
    if (typeof b.description === 'string') block.description = b.description.trim().slice(0, 260);
    if (typeof b.htmlContent === 'string') block.htmlContent = sanitizeRichHtml(b.htmlContent);
    block.updatedAt = new Date().toISOString();
    block.updatedBy = user!.email;
    await saveState(env, db);
    return json({ block, blocks: db.reusableBlocks });
  }

  // PROMOTIONAL BANNERS CRUD
  const cleanHex = (v: unknown, fb: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || '').trim()) ? String(v).trim() : fb);
  if (method === 'POST' && pathname === '/api/v1/promo-banners') {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    if (!Array.isArray(db.promoBanners)) db.promoBanners = structuredClone(DEFAULT_PROMO_BANNERS);
    const b = await readJson<Record<string, unknown>>();
    const headline = String(b.headline || '').trim();
    if (headline.length < 3) return json({ error: 'Vui lòng nhập tiêu đề Banner.' }, 400);
    const banner = {
      id: `bnr-${Date.now().toString(36)}`,
      templateKey: String(b.templateKey || 'tpl-admissions-newyear').slice(0, 80),
      category: (['ADMISSIONS', 'HOLIDAY', 'URGENT'].includes(String(b.category)) ? b.category : 'ADMISSIONS') as 'ADMISSIONS' | 'HOLIDAY' | 'URGENT',
      kicker: String(b.kicker || '').trim().slice(0, 120),
      headline: headline.slice(0, 220),
      subheadline: String(b.subheadline || '').trim().slice(0, 420),
      ctaLabel: String(b.ctaLabel || 'Tìm hiểu thêm').trim().slice(0, 60),
      ctaHref: sanitizeSafeUrl(String(b.ctaHref || '#courses'), false) || '#courses',
      imageUrl: sanitizeSafeUrl(String(b.imageUrl || ''), true),
      bgStart: cleanHex(b.bgStart, '#1E3A8A'),
      bgEnd: cleanHex(b.bgEnd, '#0F172A'),
      accentColor: cleanHex(b.accentColor, '#F59E0B'),
      textColor: cleanHex(b.textColor, '#FFFFFF'),
      layoutStyle: (['SPLIT_IMAGE', 'FULL_BG', 'CENTER_CARD', 'SLIM_STRIP'].includes(String(b.layoutStyle))
        ? b.layoutStyle
        : 'SPLIT_IMAGE') as 'SPLIT_IMAGE' | 'FULL_BG' | 'CENTER_CARD' | 'SLIM_STRIP',
      textAlign: (b.textAlign === 'center' ? 'center' : 'left') as 'left' | 'center',
      fontSizeScale: Math.max(0.85, Math.min(1.25, Number(b.fontSizeScale) || 1)),
      overlayOpacity: Math.max(0.15, Math.min(0.88, Number(b.overlayOpacity) || 0.45)),
      borderStyle: (['NONE', 'CLEAN', 'FESTIVE'].includes(String(b.borderStyle)) ? b.borderStyle : 'CLEAN') as 'NONE' | 'CLEAN' | 'FESTIVE',
      placement: (['TOP_BAR', 'HERO_SPOTLIGHT', 'MID_PAGE', 'POPUP'].includes(String(b.placement))
        ? b.placement
        : 'HERO_SPOTLIGHT') as 'TOP_BAR' | 'HERO_SPOTLIGHT' | 'MID_PAGE' | 'POPUP',
      audience: (['ALL', 'NEW_CUSTOMER', 'PARENT', 'TEACHER_STUDENT'].includes(String(b.audience))
        ? b.audience
        : 'ALL') as 'ALL' | 'NEW_CUSTOMER' | 'PARENT' | 'TEACHER_STUDENT',
      startDate: b.startDate ? String(b.startDate).slice(0, 10) : undefined,
      endDate: b.endDate ? String(b.endDate).slice(0, 10) : undefined,
      active: b.active !== false,
      priority: Math.max(0, Math.min(100, Number(b.priority) || 10)),
      updatedAt: new Date().toISOString(),
      updatedBy: user!.email,
    };
    db.promoBanners.unshift(banner);
    await saveState(env, db);
    return json({ banner, banners: db.promoBanners }, 201);
  }

  const bnrMatch = pathname.match(/^\/api\/v1\/promo-banners\/([^/]+)$/);
  if (bnrMatch && (method === 'PATCH' || method === 'DELETE')) {
    const denied = requireRole(['MANAGER']);
    if (denied) return denied;
    const db = await loadState(env);
    if (!Array.isArray(db.promoBanners)) db.promoBanners = [];
    if (method === 'DELETE') {
      db.promoBanners = db.promoBanners.filter((item) => item.id !== bnrMatch[1]);
      await saveState(env, db);
      return json({ deleted: true, banners: db.promoBanners });
    }
    const banner = db.promoBanners.find((item) => item.id === bnrMatch[1]);
    if (!banner) return json({ error: 'Không tìm thấy Banner.' }, 404);
    const b = await readJson<Record<string, unknown>>();
    if (typeof b.templateKey === 'string') banner.templateKey = b.templateKey.slice(0, 80);
    if (['ADMISSIONS', 'HOLIDAY', 'URGENT'].includes(String(b.category))) banner.category = b.category as typeof banner.category;
    if (typeof b.kicker === 'string') banner.kicker = b.kicker.trim().slice(0, 120);
    if (typeof b.headline === 'string' && b.headline.trim().length >= 3) banner.headline = b.headline.trim().slice(0, 220);
    if (typeof b.subheadline === 'string') banner.subheadline = b.subheadline.trim().slice(0, 420);
    if (typeof b.ctaLabel === 'string') banner.ctaLabel = b.ctaLabel.trim().slice(0, 60);
    if (typeof b.ctaHref === 'string') banner.ctaHref = sanitizeSafeUrl(b.ctaHref, false) || '#courses';
    if (typeof b.imageUrl === 'string') banner.imageUrl = sanitizeSafeUrl(b.imageUrl, true);
    if (b.bgStart) banner.bgStart = cleanHex(b.bgStart, banner.bgStart);
    if (b.bgEnd) banner.bgEnd = cleanHex(b.bgEnd, banner.bgEnd);
    if (b.accentColor) banner.accentColor = cleanHex(b.accentColor, banner.accentColor);
    if (b.textColor) banner.textColor = cleanHex(b.textColor, banner.textColor);
    if (['SPLIT_IMAGE', 'FULL_BG', 'CENTER_CARD', 'SLIM_STRIP'].includes(String(b.layoutStyle))) banner.layoutStyle = b.layoutStyle as typeof banner.layoutStyle;
    if (b.textAlign === 'left' || b.textAlign === 'center') banner.textAlign = b.textAlign;
    if (b.fontSizeScale !== undefined) banner.fontSizeScale = Math.max(0.85, Math.min(1.25, Number(b.fontSizeScale) || 1));
    if (b.overlayOpacity !== undefined) banner.overlayOpacity = Math.max(0.15, Math.min(0.88, Number(b.overlayOpacity) || 0.45));
    if (['NONE', 'CLEAN', 'FESTIVE'].includes(String(b.borderStyle))) banner.borderStyle = b.borderStyle as typeof banner.borderStyle;
    if (['TOP_BAR', 'HERO_SPOTLIGHT', 'MID_PAGE', 'POPUP'].includes(String(b.placement))) banner.placement = b.placement as typeof banner.placement;
    if (['ALL', 'NEW_CUSTOMER', 'PARENT', 'TEACHER_STUDENT'].includes(String(b.audience))) banner.audience = b.audience as typeof banner.audience;
    if (b.startDate !== undefined) banner.startDate = b.startDate ? String(b.startDate).slice(0, 10) : undefined;
    if (b.endDate !== undefined) banner.endDate = b.endDate ? String(b.endDate).slice(0, 10) : undefined;
    if (typeof b.active === 'boolean') banner.active = b.active;
    if (b.priority !== undefined) banner.priority = Math.max(0, Math.min(100, Number(b.priority) || 10));
    banner.updatedAt = new Date().toISOString();
    banner.updatedBy = user!.email;
    await saveState(env, db);
    return json({ banner, banners: db.promoBanners });
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
      const assetRes = await env.ASSETS.fetch(request);
      const headers = new Headers(assetRes.headers);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        headers.set(k, v);
      }
      if (url.pathname.startsWith('/assets/')) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers,
      });
    }
    return new Response('Static assets binding (ASSETS) not configured.', { status: 404 });
  },
  async scheduled(_controller: unknown, env: WorkerEnv): Promise<void> {
    const db = await loadState(env);
    await dispatchUpcomingReminders(db, { triggeredBy: 'CRON' });
    await saveState(env, db);
  },
};
