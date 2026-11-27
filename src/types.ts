export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEACHER' | 'PARENT' | 'STUDENT';

export type TeacherGroup = 'SUBJECT' | 'TUTOR_REVIEW';

export type BillingCycle = 'MONTHLY' | 'ANNUAL_12M';

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
  loginChannel?:
    | 'GMAIL'
    | 'STAFF_GMAIL'
    | 'PARENT_GMAIL'
    | 'STUDENT_GMAIL'
    | 'PARENT_PHONE'
    | 'STUDENT_CODE'
    | 'DEMO';
}

export interface AuthPolicy {
  allowParentPhoneLogin: boolean;
  requireParentPinOrCode: boolean;
  allowParentGmailLogin: boolean;
  allowStudentCodeLogin: boolean;
  requirePhoneLast4ForStudentCode: boolean;
  allowStudentParentPhoneLogin: boolean;
  allowStudentParentGmailLogin: boolean;
  allowStudentPersonalGmail: boolean;
  minGradeForPersonalGmail: number;
  requireAuthForClassroom: boolean;
  allowDemoPreview: boolean;
}

export interface AccessAuditLog {
  id: string;
  createdAt: string;
  actorEmail: string;
  actorRole: UserRole | 'GUEST';
  action: string;
  target?: string;
  targetLabel?: string;
  detail: string;
  status?: 'SUCCESS' | 'DENIED' | 'UPDATED';
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
  authPolicy?: AuthPolicy;
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

export type CampusCode = 'CS1' | 'CS2';

export interface Room {
  id: string;
  code: string;
  name: string;
  campus: string;
  capacity: number;
  active: boolean;
  note?: string;
}

export interface Teacher {
  id: string;
  name: string;
  shortName: string;
  teacherGroup: TeacherGroup;
  subjects: string[];
  /** Các khối lớp GV có thể giảng dạy (3..12). Rỗng/undefined = dạy linh hoạt mọi khối. */
  teachableGrades?: number[];
  /** Các cơ sở GV có thể nhận lớp (CS1, CS2). Mặc định hỗ trợ cả CS1 & CS2, dạy linh hoạt mọi phòng. */
  campuses?: CampusCode[];
  /** Tùy chọn chuyên môn "Hỗ trợ nhiều môn" cho GV Trả bài, kiểm tra soạn bài, bổ túc. */
  multiSubjectSupport?: boolean;
  degree: string;
  experienceYears: number;
  phone: string;
  email?: string;
  roomDefault: string;
  status: 'ACTIVE' | 'ON_LEAVE';
  availability?: string[];
  scheduleAlertEnabled?: boolean;
  scheduleAlertSound?: boolean;
  lastTimetableAckAt?: string;
  profileUpdatedAt?: string;
  profileUpdatedBy?: string;
}

export interface TeacherLeave {
  id: string;
  teacherId: string;
  teacherName: string;
  day: DayOfWeek;
  dateLabel: string;
  period: 'ALL' | SessionPeriod;
  shift?: ShiftCode;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: string;
  reviewedBy?: string;
  createdAt: string;
  affectedSlotIds?: string[];
  resolutionType?: 'SUBSTITUTE_ASSIGNED' | 'CLASS_CANCELLED_NOTIFIED';
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  parentNoticeSentAt?: string;
}

export interface TimetableChangeSnapshot {
  day: DayOfWeek;
  period: SessionPeriod;
  shift: ShiftCode;
  timeRange: string;
  centerClass: string;
  groupLabel?: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  room: string;
  campus?: CampusCode;
  status: TimetableSlot['status'];
  slotType: TimetableSlot['slotType'];
  note?: string;
}

export interface TimetableChangeEvent {
  id: string;
  version: number;
  createdAt: string;
  updatedBy: string;
  action: 'ADDED' | 'UPDATED' | 'REMOVED' | 'SUBSTITUTED' | 'CANCELLED' | 'BULK_IMPORT';
  slotId?: string;
  summary: string;
  before?: TimetableChangeSnapshot;
  after?: TimetableChangeSnapshot;
  affectedTeacherIds: string[];
  acknowledgedByTeacherIds: string[];
}

export interface SubstituteSuggestion {
  teacherId: string;
  teacherName: string;
  shortName: string;
  teacherGroup: TeacherGroup;
  subjects: string[];
  phone: string;
  email?: string;
  score: number;
  subjectMatch: boolean;
  availableForAllShifts: boolean;
  conflictCount: number;
  reasons: string[];
}

export interface FamilyProfile {
  id: string;
  parentName: string;
  parentPhone: string;
  parentEmails?: string[];
  siblingDiscountPercent: number;
  defaultBillingCycle: BillingCycle;
  note?: string;
}

export type StudentAccessStatus = 'ACTIVE' | 'PENDING_VERIFY' | 'LOCKED';

export interface Student {
  id: string;
  ownerUid?: string;
  familyId?: string;
  code: string;
  qrToken?: string;
  parentLinkCode?: string;
  fullName: string;
  grade: number;
  level: EducationLevel;
  centerClass: string;
  enrolledClasses?: string[];
  schoolClass: string;
  school: string;
  homeroomTeacherId?: string;
  homeroomTeacher: string;
  roomId?: string;
  room: string;
  parentName: string;
  parentPhone: string;
  parentSecondaryPhone?: string;
  parentZalo: string;
  parentEmails?: string[];
  studentEmail?: string;
  allowPersonalGmailOverride?: boolean;
  accessPin?: string;
  accessStatus?: StudentAccessStatus;
  accessNote?: string;
  lastLoginAt?: string;
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

export type SmartImportEntityType = 'STUDENTS' | 'TEACHERS' | 'SCORES' | 'TIMETABLE';

export type TimetableSyncMode = 'UPSERT' | 'APPEND' | 'REPLACE_ALL';

export type PrintTemplateEntityType = 'STUDENTS' | 'TEACHERS';

export type PrintTemplatePreset = 'SIMPLE' | 'FULL' | 'CUSTOM';

export type PrintTemplateGroupBy =
  | 'NONE'
  | 'CLASS'
  | 'GRADE'
  | 'LEVEL'
  | 'TEACHER_GROUP'
  | 'STATUS';

export interface PrintTemplateBlocks {
  showLogoHeader: boolean;
  showWatermark: boolean;
  showFilterSummary: boolean;
  showRowNumbers: boolean;
  showSummaryStats: boolean;
  showSignatures: boolean;
  signatureLabels: string[];
}

export interface PrintTemplate {
  id: string;
  name: string;
  description?: string;
  entityType: PrintTemplateEntityType;
  presetBase: PrintTemplatePreset;
  customTitle: string;
  orientation: 'portrait' | 'landscape';
  fontSize: 'sm' | 'md' | 'lg';
  groupBy: PrintTemplateGroupBy;
  columns: string[];
  extraBlankColumns: string[];
  blocks: PrintTemplateBlocks;
  isSystemDefault?: boolean;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface DataHealthIssue {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category:
    | 'ORPHAN_TIMETABLE_TEACHER'
    | 'ORPHAN_TIMETABLE_ROOM'
    | 'MISSING_STUDENT_FK'
    | 'UNLINKED_FAMILY_SIBLING'
    | 'MISSING_QR_TOKEN'
    | 'DUPLICATE_STUDENT_CODE'
    | 'ORPHAN_SCORE_OR_TUITION';
  entityLabel: string;
  detail: string;
  autoFixable: boolean;
}

export interface DataHealthReport {
  checkedAt: string;
  totalChecks: number;
  healthyScore: number;
  issues: DataHealthIssue[];
  stats: {
    teachers: number;
    students: number;
    families: number;
    rooms: number;
    timetableSlots: number;
    scores: number;
    tuition: number;
    printTemplates: number;
  };
}

export type StudentRecord = Student;

export interface TimetableSlot {
  id: string;
  weekLabel: string;
  period: SessionPeriod;
  shift: ShiftCode;
  timeRange: string;
  day: DayOfWeek;
  centerClass: string;
  /** Nhãn nhóm nhỏ khi tách 1 lớp ra nhiều nhóm tự học / trả bài song song (VD: "Nhóm 1", "Nhóm 2"). */
  groupLabel?: string;
  /** Danh sách ID học sinh cụ thể nếu chia nhóm cố định (tùy chọn). */
  studentIds?: string[];
  subject: string;
  teacherId: string;
  teacherName: string;
  roomId?: string;
  room: string;
  /** Cơ sở diễn ra ca học (CS1 / CS2), tự suy luận theo phòng học. */
  campus?: CampusCode;
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
  familyId?: string;
  studentId: string;
  studentName: string;
  centerClass: string;
  parentPhone: string;
  monthLabel: string;
  billingCycle?: BillingCycle;
  monthsCount?: number;
  baseAmount: number;
  boardingAmount: number;
  shuttleAmount: number;
  siblingDiscountPercent?: number;
  annualDiscountPercent?: number;
  siblingDiscountAmount?: number;
  annualDiscountAmount?: number;
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

export type NotificationChannel = 'APP' | 'WEB' | 'ZALO' | 'EMAIL' | 'FACEBOOK';

export interface AppNotification {
  id: string;
  targetUid?: string;
  createdAt: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  targetRole: UserRole | 'ALL';
  read: boolean;
}

export type SocialPlatform = 'FACEBOOK' | 'YOUTUBE' | 'TIKTOK' | 'ZALO';
export type SocialMediaType = 'VIDEO' | 'REEL' | 'ARTICLE' | 'PHOTO' | 'POST';

export interface SocialChannelConfig {
  id: string;
  platform: SocialPlatform;
  label: string;
  handle: string;
  url: string;
  youtubeChannelId?: string;
  autoSyncEnabled: boolean;
  active: boolean;
  lastSyncedAt?: string;
}

export interface SocialActivityPost {
  id: string;
  platform: SocialPlatform;
  mediaType: SocialMediaType;
  title: string;
  excerpt: string;
  summary?: string;
  category: string;
  tagLabel?: string;
  sourceUrl: string;
  url?: string;
  embedUrl?: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  featured: boolean;
  visible: boolean;
  source?: 'AUTO_YOUTUBE' | 'AUTO_LINK' | 'MANUAL';
  createdBy?: string;
}

export interface NotificationSystemConfig {
  id?: string;
  enabled: boolean;
  leadMinutes: number;
  channelsEnabled: {
    WEB: boolean;
    ZALO: boolean;
    EMAIL: boolean;
    FACEBOOK: boolean;
  };
  zaloOaId?: string;
  zaloWebhookUrl?: string;
  emailWebhookUrl?: string;
  facebookWebhookUrl?: string;
  unifiedWebhookUrl?: string;
  messageTemplate: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface UserNotificationPreference {
  userId: string;
  role: UserRole;
  displayName: string;
  enabled: boolean;
  leadMinutes: number;
  channels: {
    WEB: boolean;
    ZALO: boolean;
    EMAIL: boolean;
    FACEBOOK: boolean;
  };
  zaloPhone?: string;
  email?: string;
  facebookPsid?: string;
  updatedAt: string;
}

export interface ClassCheckInRecord {
  id: string;
  date: string;
  slotId: string;
  centerClass: string;
  subject?: string;
  room: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  checkedInAt: string;
}

export interface ReminderDispatchLog {
  id: string;
  sentAt: string;
  slotId: string;
  slotLabel: string;
  recipientName: string;
  recipientRole: UserRole;
  channel: NotificationChannel;
  status: 'SENT' | 'QUEUED_WEBHOOK' | 'SIMULATED' | 'FAILED';
  detail: string;
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

export interface ArchivedStudentRecord {
  id: string;
  originalId: string;
  code: string;
  fullName: string;
  centerClass: string;
  parentName: string;
  parentPhone: string;
  archivedAt: string;
  archivedBy: string;
  reason?: string;
  preservedScoresCount: number;
  preservedTuitionCount: number;
  snapshot: Student;
}

export interface ArchivedTeacherRecord {
  id: string;
  originalId: string;
  name: string;
  shortName: string;
  teacherGroup: TeacherGroup;
  subjects: string[];
  archivedAt: string;
  archivedBy: string;
  reason?: string;
  removedTimetableSlotsCount: number;
  snapshot: Teacher;
}

export interface EditorialArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  coverImageUrl?: string;
  contentHtml: string;
  authorName: string;
  authorEmail: string;
  status: 'DRAFT' | 'PUBLISHED';
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export type ReusableBlockCategory =
  | 'CONTACT'
  | 'SCHEDULE'
  | 'TUITION_OFFER'
  | 'CTA'
  | 'PARENT_NOTE'
  | 'CUSTOM';

export interface ReusableContentBlock {
  id: string;
  name: string;
  category: ReusableBlockCategory;
  description: string;
  htmlContent: string;
  isSystemDefault?: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export type BannerCategory = 'ADMISSIONS' | 'HOLIDAY' | 'URGENT';
export type BannerPlacement = 'TOP_BAR' | 'HERO_SPOTLIGHT' | 'MID_PAGE' | 'POPUP';
export type BannerAudience = 'ALL' | 'NEW_CUSTOMER' | 'PARENT' | 'TEACHER_STUDENT';
export type BannerLayoutStyle = 'SPLIT_IMAGE' | 'FULL_BG' | 'CENTER_CARD' | 'SLIM_STRIP';

export interface PromoBanner {
  id: string;
  templateKey: string;
  category: BannerCategory;
  kicker: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl?: string;
  bgStart: string;
  bgEnd: string;
  accentColor: string;
  textColor: string;
  layoutStyle: BannerLayoutStyle;
  textAlign: 'left' | 'center';
  fontSizeScale: number;
  overlayOpacity: number;
  borderStyle: 'NONE' | 'CLEAN' | 'FESTIVE';
  placement: BannerPlacement;
  audience: BannerAudience;
  startDate?: string;
  endDate?: string;
  active: boolean;
  priority: number;
  updatedAt: string;
  updatedBy?: string;
}

export type TimetableSpecialBlockType = 'NGHI' | 'PHU_DAO' | 'KIEM_TRA' | 'SU_KIEN' | 'CUSTOM';
export type TimetableSpecialBlockFontFamily = 'SANS' | 'DISPLAY' | 'SERIF' | 'MONO';

export interface TimetableSpecialBlock {
  id: string;
  templateKey?: string;
  blockType: TimetableSpecialBlockType;
  title: string;
  subtitle?: string;
  shiftKeys: string[];
  targetClasses: string[];
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  borderWidth: 1 | 2 | 3;
  borderStyle: 'solid' | 'dashed' | 'double';
  fontFamily: TimetableSpecialBlockFontFamily;
  fontSize: 'SM' | 'MD' | 'LG';
  fontWeight: 'SEMIBOLD' | 'BOLD' | 'EXTRABOLD';
  priority: number;
  active: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface DatabaseState {
  courses: CoursePackage[];
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
  notificationConfig: NotificationSystemConfig;
  notificationPrefs: UserNotificationPreference[];
  classCheckins: ClassCheckInRecord[];
  reminderDispatchLogs: ReminderDispatchLog[];
  printTemplates?: PrintTemplate[];
  timetableUpdatedAt?: string;
  timetableVersion?: number;
  timetableChanges?: TimetableChangeEvent[];
  authPolicy?: AuthPolicy;
  auditLogs?: AccessAuditLog[];
  adminPasscodeHash?: string;
}
