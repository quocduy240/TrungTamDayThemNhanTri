export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT';

export type FrontendMode = 'TEACHER_STUDENT' | 'PARENT' | 'NEW_CUSTOMER';

export type Language = 'vi' | 'en';

export type EducationLevel = 'CAP_1' | 'CAP_2' | 'CAP_3';

export type SessionPeriod = 'SANG' | 'CHIEU' | 'TOI';

export type ShiftCode = 'CA_1' | 'CA_2';

export type DayOfWeek = 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  linkedStudentId?: string;
  linkedStudentIds?: string[];
  linkedTeacherId?: string;
  authProvider?: 'GOOGLE_FIREBASE' | 'LOCAL_SESSION';
}

export interface SiteConfig {
  domain: string;
  centerName: string;
  shortName: string;
  slogan: string;
  philosophy: string;
  seoTitle: string;
  seoDescription: string;
  hotlineZalo: string;
  zaloUrl: string;
  facebookUrl?: string;
  contactEmail: string;
  campus1: string;
  campus2: string;
  announcementBanner: string;
  showAnnouncement: boolean;
  defaultFrontendMode: FrontendMode;
  heroTitleTeacherStudent: string;
  heroSubtitleTeacherStudent: string;
  heroTitleParent: string;
  heroSubtitleParent: string;
  heroTitleCustomer: string;
  heroSubtitleCustomer: string;
  heroImageUrl: string;
  heroCaption: string;
  annualDiscountPercent: number;
  bankName: string;
  bankAccount: string;
  bankOwner: string;
  momoPhone: string;
  enableAiAdvisor: boolean;
  enableOnlineExams: boolean;
  enableOnlinePayment: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

export interface UserProfileDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  preferredView?: FrontendMode;
  linkedStudentId?: string;
  linkedStudentIds?: string[];
  linkedTeacherId?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RoleInviteDoc {
  email: string;
  role: Exclude<UserRole, 'SUPER_ADMIN'>;
  displayName?: string;
  linkedStudentId?: string;
  linkedTeacherId?: string;
  createdBy: string;
  createdAt?: string;
}

export interface CoursePackage {
  id: string;
  level: EducationLevel;
  title: string;
  titleEn: string;
  grades: string;
  billingModel: 'TUTORING' | 'ALL_IN_ONE' | 'PER_SUBJECT';
  monthlyPrice: number;
  annualDiscountPercent: number;
  boardingAddonPrice?: number;
  shuttleAddonPrice?: number;
  subjects: string[];
  highlights: string[];
  highlightsEn: string[];
  imageUrl: string;
}

export interface Teacher {
  id: string;
  name: string;
  shortName: string;
  subjects: string[];
  degree: string;
  experienceYears: number;
  phone: string;
  roomDefault: string;
  status: 'ACTIVE' | 'ON_LEAVE';
}

export interface Student {
  id: string;
  ownerUid?: string;
  code: string;
  parentLinkCode?: string;
  fullName: string;
  grade: number;
  level: EducationLevel;
  centerClass: string;
  schoolClass: string;
  school: string;
  homeroomTeacher: string;
  room: string;
  parentName: string;
  parentPhone: string;
  parentZalo: string;
  packageType: 'TUTORING' | 'ALL_IN_ONE' | 'PER_SUBJECT';
  hasBoarding: boolean;
  hasShuttle: boolean;
  annualPrepaid: boolean;
  peConflictDay?: DayOfWeek;
  peConflictShift?: string;
  eveningMakeupSlot?: string;
  enrolledSubjects: string[];
  status: 'ACTIVE' | 'PAUSED';
}

export interface TimetableSlot {
  id: string;
  weekLabel: string;
  period: SessionPeriod;
  shift: ShiftCode;
  timeRange: string;
  day: DayOfWeek;
  centerClass: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  room: string;
  slotType: 'MAIN' | 'TRA_BAI' | 'PHU_DAO' | 'BU_THE_DUC';
  status: 'SCHEDULED' | 'TEACHER_ABSENT' | 'SUBSTITUTED' | 'OFF';
  note?: string;
}

export interface ScoreRecord {
  id: string;
  ownerUid?: string;
  studentId: string;
  studentName: string;
  centerClass: string;
  subject: string;
  examType: '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY' | 'TRAC_NGHIEM_ONLINE';
  score: number;
  maxScore: number;
  date: string;
  school?: string;
  source: 'SELF_ENTRY' | 'AI_SCAN' | 'TEACHER' | 'ONLINE_QUIZ';
  verified: boolean;
  aiSummary?: string;
  strengths?: string[];
  improvements?: string[];
  imageUrl?: string;
}

export interface AttendanceRecord {
  id: string;
  ownerUid?: string;
  date: string;
  studentId: string;
  studentName: string;
  centerClass: string;
  shiftLabel: string;
  status: 'PRESENT' | 'LATE' | 'EXCUSED' | 'MAKEUP_EVENING';
  note?: string;
  parentNotified: boolean;
}

export interface TuitionRecord {
  id: string;
  ownerUid?: string;
  studentId: string;
  studentName: string;
  centerClass: string;
  parentPhone: string;
  monthLabel: string;
  baseAmount: number;
  boardingAmount: number;
  shuttleAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  status: 'PAID' | 'DUE_SOON' | 'OVERDUE';
  paymentMethod?: 'VIETQR' | 'MOMO' | 'ZALOPAY' | 'CASH';
  paidAt?: string;
  remindersSent: number;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: 'SALARY' | 'MEALS' | 'UTILITIES' | 'MATERIALS';
  description: string;
  amount: number;
}

export interface ExamQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface NationalExam {
  id: string;
  title: string;
  level: EducationLevel;
  grade: number;
  subject: string;
  durationMinutes: number;
  curriculumStandard: string;
  difficulty: 'CO_BAN' | 'KHA' | 'NANG_CAO';
  attemptsCount: number;
  questions: ExamQuestion[];
}

export interface FeedbackTicket {
  id: string;
  authorUid?: string;
  createdAt: string;
  authorName: string;
  authorRole: UserRole | 'GUEST';
  phone?: string;
  category: 'CONSULTATION' | 'FEEDBACK' | 'SCHEDULE_CHANGE' | 'TUITION';
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  reply?: string;
}

export interface AppNotification {
  id: string;
  targetUid?: string;
  createdAt: string;
  title: string;
  body: string;
  channel: 'APP' | 'ZALO' | 'EMAIL';
  targetRole: UserRole | 'ALL';
  read: boolean;
}

export interface FanpagePost {
  id: string;
  date: string;
  type: 'REEL' | 'ADMISSIONS' | 'STRATEGY';
  tagLabel: string;
  title: string;
  summary: string;
  viewsLabel?: string;
  url: string;
  thumbnailUrl: string;
}

export interface DatabaseState {
  courses: CoursePackage[];
  teachers: Teacher[];
  students: Student[];
  timetable: TimetableSlot[];
  scores: ScoreRecord[];
  attendance: AttendanceRecord[];
  tuition: TuitionRecord[];
  expenses: ExpenseRecord[];
  exams: NationalExam[];
  tickets: FeedbackTicket[];
  notifications: AppNotification[];
  adminPasscodeHash?: string;
}
