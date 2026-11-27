import type {
  AccessAuditLog,
  AppNotification,
  ArchivedStudentRecord,
  ArchivedTeacherRecord,
  AttendanceRecord,
  AuthPolicy,
  AuthUser,
  ClassCheckInRecord,
  CoursePackage,
  EditorialArticle,
  ExpenseRecord,
  FamilyProfile,
  FanpagePost,
  FeedbackTicket,
  NationalExam,
  NotificationSystemConfig,
  PrintTemplate,
  PromoBanner,
  ReminderDispatchLog,
  ReusableContentBlock,
  Room,
  ScoreRecord,
  SocialActivityPost,
  SocialChannelConfig,
  Student,
  Teacher,
  TeacherLeave,
  TimetableChangeEvent,
  TimetableSlot,
  TimetableSpecialBlock,
  TuitionRecord,
  UserNotificationPreference,
  UserRole,
} from '../types';

// Session token held strictly in memory (never localStorage/sessionStorage)
let memoryAuthToken: string | null = null;

// Single-flight silent session refresher (registered by App.tsx for Firebase Gmail auto-recovery)
type SilentRefresher = () => Promise<string | null>;
let silentRefresher: SilentRefresher | null = null;
let inFlightRefreshPromise: Promise<string | null> | null = null;

// Global session-expired event subscribers (for contextual "Đăng nhập lại" banner/modal)
type SessionExpiredListener = (reason: string) => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export class SessionExpiredError extends Error {
  status = 401;
  isSessionExpired = true;
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function isSessionExpiredError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof SessionExpiredError) return true;
  if (typeof err === 'object' && 'isSessionExpired' in err && (err as { isSessionExpired?: boolean }).isSessionExpired) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Vui lòng đăng nhập phiên làm việc') ||
    msg.includes('Phiên làm việc hết hạn') ||
    msg.includes('(401)')
  );
}

export function registerSilentSessionRefresher(fn: SilentRefresher | null): void {
  silentRefresher = fn;
}

export function subscribeSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

export function notifySessionExpired(reason: string): void {
  for (const listener of sessionExpiredListeners) {
    try {
      listener(reason);
    } catch {
      // ignore listener errors
    }
  }
}

async function trySilentRefreshToken(): Promise<string | null> {
  if (!silentRefresher) return null;
  if (!inFlightRefreshPromise) {
    inFlightRefreshPromise = silentRefresher()
      .catch(() => null)
      .finally(() => {
        inFlightRefreshPromise = null;
      });
  }
  return inFlightRefreshPromise;
}

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (memoryAuthToken) {
    headers.Authorization = `Bearer ${memoryAuthToken}`;
  }

  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let errorMsg = `Lỗi máy chủ (${res.status})`;
    if (contentType.includes('application/json')) {
      try {
        const errData = await res.json();
        errorMsg = errData.error || errorMsg;
      } catch {
        // ignore JSON parse errors
      }
    }

    if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
      // Tier 1: Attempt single-flight silent Firebase token refresh and seamlessly retry once
      if (!_retried) {
        const freshToken = await trySilentRefreshToken();
        if (freshToken) {
          memoryAuthToken = freshToken;
          return apiRequest<T>(path, options, true);
        }
      }
      // Tier 2: Emit contextual session-expired signal (keeps open forms & drafts intact)
      notifySessionExpired(errorMsg);
      throw new SessionExpiredError(errorMsg);
    }

    throw new Error(errorMsg);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export interface BootstrapPayload {
  center: {
    name: string;
    shortName: string;
    slogan: string;
    philosophy: string;
    campuses: string[];
    hotlineZalo: string;
    email: string;
    facebookUrl?: string;
    domain?: string;
  };
  courses: CoursePackage[];
  teachers: Teacher[];
  timetable?: TimetableSlot[];
  timetableSpecialBlocks?: TimetableSpecialBlock[];
  exams?: NationalExam[];
  gallery: { id: string; url: string; title: string; caption: string }[];
  fanpagePosts?: FanpagePost[];
  socialChannels?: SocialChannelConfig[];
  socialPosts?: SocialActivityPost[];
  editorialArticles?: EditorialArticle[];
  promoBanners?: PromoBanner[];
  notificationLeadMinutes?: number;
  examsSummary: {
    id: string;
    title: string;
    level: string;
    grade: number;
    subject: string;
    durationMinutes: number;
    curriculumStandard: string;
    difficulty: string;
    attemptsCount: number;
    questionCount: number;
  }[];
  stats: {
    activeStudents: number;
    teachersCount: number;
    examsCount: number;
    campusesCount: number;
  };
  security: {
    adminPasscodeConfigured: boolean;
    usingEnvPasscode: boolean;
  };
  authPolicy?: AuthPolicy;
}

export interface WorkspacePayload {
  user: AuthUser;
  rooms: Room[];
  teachers: Teacher[];
  teacherLeaves: TeacherLeave[];
  families: FamilyProfile[];
  students: Student[];
  archivedStudents?: ArchivedStudentRecord[];
  archivedTeachers?: ArchivedTeacherRecord[];
  timetable: TimetableSlot[];
  timetableSpecialBlocks?: TimetableSpecialBlock[];
  scores: ScoreRecord[];
  attendance: AttendanceRecord[];
  tuition: TuitionRecord[];
  expenses: ExpenseRecord[];
  exams: NationalExam[];
  tickets: FeedbackTicket[];
  notifications: AppNotification[];
  socialChannels: SocialChannelConfig[];
  socialPosts: SocialActivityPost[];
  editorialArticles?: EditorialArticle[];
  reusableBlocks?: ReusableContentBlock[];
  promoBanners?: PromoBanner[];
  notificationConfig?: NotificationSystemConfig;
  myNotificationPref?: UserNotificationPreference;
  classCheckins: ClassCheckInRecord[];
  reminderDispatchLogs: ReminderDispatchLog[];
  printTemplates?: PrintTemplate[];
  timetableUpdatedAt?: string;
  timetableVersion?: number;
  timetableChanges?: TimetableChangeEvent[];
  authPolicy?: AuthPolicy;
  auditLogs?: AccessAuditLog[];
}

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

export function roleLabel(role: UserRole, lang: 'vi' | 'en' = 'vi'): string {
  const map: Record<UserRole, { vi: string; en: string }> = {
    SUPER_ADMIN: { vi: 'SuperAdmin (Toàn quyền)', en: 'SuperAdmin' },
    ADMIN: { vi: 'Admin (Quản trị vận hành)', en: 'Operations Admin' },
    MANAGER: { vi: 'Người quản lý (Học vụ & TKB)', en: 'Academic Manager' },
    TEACHER: { vi: 'Giáo viên', en: 'Teacher' },
    PARENT: { vi: 'Phụ huynh', en: 'Parent' },
    STUDENT: { vi: 'Học sinh', en: 'Student' },
  };
  return map[role][lang];
}

export function isAdminOrSuper(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function isTimetableManager(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
}

export function canManageFinance(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function isSuperAdminRole(role?: UserRole | null): boolean {
  return role === 'SUPER_ADMIN';
}

export function buildZaloReportText(
  student: Student,
  scores: ScoreRecord[],
  slots: TimetableSlot[],
  attendance: AttendanceRecord[],
): string {
  const studentScores = scores.filter((s) => s.studentId === student.id).slice(0, 5);
  const avg =
    studentScores.length > 0
      ? (studentScores.reduce((acc, s) => acc + s.score, 0) / studentScores.length).toFixed(2)
      : 'Chưa có';
  const studentAtt = attendance.filter((a) => a.studentId === student.id).slice(0, 3);
  const studentSlots = slots.filter((s) => s.centerClass === student.centerClass).slice(0, 6);

  const scoreLines =
    studentScores.length > 0
      ? studentScores
          .map((s) => `- ${s.subject} (${s.date}): ${s.score}/${s.maxScore}${s.aiSummary ? ` · ${s.aiSummary}` : ''}`)
          .join('\n')
      : '- Chưa ghi nhận cột điểm mới trong tuần.';

  const scheduleLines =
    studentSlots.length > 0
      ? studentSlots
          .map((sl) => `- ${sl.day} (${sl.timeRange}): ${sl.subject} · ${sl.teacherName} (${sl.room})`)
          .join('\n')
      : '- Theo thời khóa biểu chung của lớp.';

  const makeupLine = student.eveningMakeupSlot
    ? `\n[Lịch học bù Thể dục]: ${student.eveningMakeupSlot}`
    : '';

  const attSummary =
    studentAtt.length > 0
      ? studentAtt.map((a) => `${a.date}: ${a.status}`).join(', ')
      : 'Đi học chuyên cần đầy đủ';

  return [
    `TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ (daythemnhantri.com)`,
    `BÁO CÁO HỌC BẠ & LỊCH HỌC TUẦN`,
    `--------------------------------`,
    `Học sinh: ${student.fullName} (${student.centerClass} · ${student.school})`,
    `Giáo viên phụ trách: ${student.homeroomTeacher} (${student.room})`,
    `Điểm trung bình gần nhất: ${avg}/10`,
    ``,
    `1. KẾT QUẢ ĐIỂM SỐ GẦN ĐÂY:`,
    scoreLines,
    ``,
    `2. CHUYÊN CẦN: ${attSummary}`,
    ``,
    `3. THỜI KHÓA BIỂU CÁ NHÂN TUẦN NÀY:`,
    scheduleLines + makeupLine,
    ``,
    `Trân trọng kính gửi Quý Phụ huynh! (Trao tri thức – Gửi yêu thương)`,
  ].join('\n');
}

export async function downloadStudentIcs(studentId: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (memoryAuthToken) {
    headers.Authorization = `Bearer ${memoryAuthToken}`;
  }
  const res = await fetch(`/api/v1/timetable/student/${studentId}/ics`, { headers });
  if (!res.ok) throw new Error('Không thể xuất lịch Google Calendar (.ics).');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
