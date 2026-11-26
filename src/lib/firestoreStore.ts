import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OFFICIAL_DOMAIN,
  OperationType,
  SUPER_ADMIN_EMAIL,
} from './firebase';
import type { BootstrapPayload } from './api';
import { DEFAULT_AUTH_POLICY } from './identityPolicy';
import type {
  AuthPolicy,
  AuthUser,
  CoursePackage,
  NationalExam,
  RoleInviteDoc,
  SiteConfig,
  TimetableSlot,
  UserProfileDoc,
  UserRole,
} from '../types';

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  domain: OFFICIAL_DOMAIN,
  centerName: 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ',
  shortName: 'Nhân Trí',
  slogan: 'Trao tri thức – Gửi yêu thương',
  philosophy: 'Soạn bài, trả bài, làm bài tập theo thời khóa biểu trong lớp · Tận tâm, tận lực, tận tình',
  seoTitle: 'Trung Tâm Dạy Thêm Học Thêm Nhân Trí — daythemnhantri.com',
  seoDescription:
    'Hệ quản trị học vụ CMS, khóa học Cấp 1-2-3, thời khóa biểu động, học bạ online AI, thư viện đề GDPT 2018 và thanh toán học phí trực tuyến tại Long Xuyên.',
  hotlineZalo: '0947 376 444 (Cô Tâm)',
  zaloUrl: 'https://zalo.me/0947376444',
  contactEmail: 'trungtamnhantri.lxag@gmail.com',
  facebookUrl:
    'https://www.facebook.com/people/Trung-t%C3%A2m-d%E1%BA%A1y-th%C3%AAm-Nh%C3%A2n-Tr%C3%AD/61586568261774/',
  campus1: 'Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, Tỉnh An Giang',
  campus2: 'Cơ sở 2: Trung Tâm Nhân Trí 2 — TP. Long Xuyên, Tỉnh An Giang',
  announcementBanner:
    '🎉 Chiêu sinh thường xuyên năm học 2026–2027 (Tiểu học Lớp 3–5 · THCS Trọn gói Lớp 6–9 · Luyện thi vào Lớp 10 & THPT Toán - Văn - Anh - Lý - Hóa - Sinh) · Phụ đạo bù bài MIỄN PHÍ · Liên hệ Cô Tâm: 0947 376 444.',
  showAnnouncement: true,
  defaultFrontendMode: 'NEW_CUSTOMER',
  heroTitleTeacherStudent: 'Cổng Học Tập & Giảng Dạy Nhân Trí',
  heroSubtitleTeacherStudent:
    'Tra cứu thời khóa biểu Sáng · Chiều · Tối theo thời gian thực, luyện ngân hàng đề chuẩn GDPT 2018 và tải ảnh bài kiểm tra để AI phân tích điểm số ngay lập tức.',
  heroTitleParent: 'Cổng Theo Dõi Học Tập Phụ Huynh',
  heroSubtitleParent:
    'Tra cứu Học bạ Online của con, xem chuyên cần & lịch học bù Thể dục, đồng bộ Google Calendar, xuất báo cáo Zalo và thanh toán học phí qua mã VietQR/MoMo.',
  heroTitleCustomer: 'Trung Tâm Dạy Thêm Nhân Trí — Trao tri thức, Gửi yêu thương',
  heroSubtitleCustomer:
    'Hệ thống giáo dục chuẩn mực từ Lớp 3 đến Lớp 12 tại 35 Lý Thường Kiệt, TP. Long Xuyên: Dạy kèm Cấp 1 (phụ đạo bù bài miễn phí), Trọn gói Cấp 2 luyện thi Lớp 10 và Chuyên sâu 6 môn THPT & ĐGNL.',
  heroImageUrl: '/assets/aistudio/IMG_9559_62d21d91.webp',
  heroCaption: 'Thầy cô và học sinh Trung Tâm Dạy Thêm Học Thêm Nhân Trí tại TP. Long Xuyên, An Giang.',
  annualDiscountPercent: 10,
  bankName: 'Vietcombank CN An Giang',
  bankAccount: '0151000889999',
  bankOwner: 'TRUNG TAM DAY THEM NHAN TRI',
  momoPhone: '0947 376 444',
  enableAiAdvisor: true,
  enableOnlineExams: true,
  enableOnlinePayment: true,
  authPolicy: { ...DEFAULT_AUTH_POLICY },
};

const ADMIN_ALLOWED_CONFIG_KEYS = new Set<keyof SiteConfig>([
  'centerName',
  'shortName',
  'slogan',
  'philosophy',
  'hotlineZalo',
  'zaloUrl',
  'contactEmail',
  'facebookUrl',
  'campus1',
  'campus2',
  'announcementBanner',
  'showAnnouncement',
  'defaultFrontendMode',
  'heroTitleTeacherStudent',
  'heroSubtitleTeacherStudent',
  'heroTitleParent',
  'heroSubtitleParent',
  'heroTitleCustomer',
  'heroSubtitleCustomer',
  'heroImageUrl',
  'heroCaption',
  'annualDiscountPercent',
  'updatedBy',
  'updatedAt',
]);

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  return s.slice(0, maxLen);
}

function sanitizeAuthPolicy(policy?: Partial<AuthPolicy>): AuthPolicy {
  const src = { ...DEFAULT_AUTH_POLICY, ...(policy || {}) };
  return {
    allowParentPhoneLogin: Boolean(src.allowParentPhoneLogin),
    requireParentPinOrCode: Boolean(src.requireParentPinOrCode),
    allowParentGmailLogin: Boolean(src.allowParentGmailLogin),
    allowStudentCodeLogin: Boolean(src.allowStudentCodeLogin),
    requirePhoneLast4ForStudentCode: Boolean(src.requirePhoneLast4ForStudentCode),
    allowStudentParentPhoneLogin: Boolean(src.allowStudentParentPhoneLogin),
    allowStudentParentGmailLogin: Boolean(src.allowStudentParentGmailLogin),
    allowStudentPersonalGmail: Boolean(src.allowStudentPersonalGmail),
    minGradeForPersonalGmail: Math.min(12, Math.max(6, Math.round(Number(src.minGradeForPersonalGmail) || 8))),
    requireAuthForClassroom: Boolean(src.requireAuthForClassroom),
    allowDemoPreview: Boolean(src.allowDemoPreview),
  };
}

function sanitizeSiteConfig(cfg: SiteConfig): SiteConfig {
  return {
    domain: clampStr(cfg.domain, 120, OFFICIAL_DOMAIN) || OFFICIAL_DOMAIN,
    centerName: clampStr(cfg.centerName, 160, DEFAULT_SITE_CONFIG.centerName) || DEFAULT_SITE_CONFIG.centerName,
    shortName: clampStr(cfg.shortName, 60, DEFAULT_SITE_CONFIG.shortName) || DEFAULT_SITE_CONFIG.shortName,
    slogan: clampStr(cfg.slogan, 200, DEFAULT_SITE_CONFIG.slogan) || DEFAULT_SITE_CONFIG.slogan,
    philosophy: clampStr(cfg.philosophy, 300, DEFAULT_SITE_CONFIG.philosophy),
    seoTitle: clampStr(cfg.seoTitle, 160, DEFAULT_SITE_CONFIG.seoTitle),
    seoDescription: clampStr(cfg.seoDescription, 320, DEFAULT_SITE_CONFIG.seoDescription),
    hotlineZalo: clampStr(cfg.hotlineZalo, 40, DEFAULT_SITE_CONFIG.hotlineZalo) || DEFAULT_SITE_CONFIG.hotlineZalo,
    zaloUrl: clampStr(cfg.zaloUrl, 200, DEFAULT_SITE_CONFIG.zaloUrl),
    contactEmail: clampStr(cfg.contactEmail, 120, DEFAULT_SITE_CONFIG.contactEmail),
    facebookUrl: clampStr(cfg.facebookUrl, 240, DEFAULT_SITE_CONFIG.facebookUrl || ''),
    campus1: clampStr(cfg.campus1, 200, DEFAULT_SITE_CONFIG.campus1),
    campus2: clampStr(cfg.campus2, 200, DEFAULT_SITE_CONFIG.campus2),
    announcementBanner: clampStr(cfg.announcementBanner, 260, ''),
    showAnnouncement: Boolean(cfg.showAnnouncement),
    defaultFrontendMode: ['TEACHER_STUDENT', 'PARENT', 'NEW_CUSTOMER'].includes(cfg.defaultFrontendMode)
      ? cfg.defaultFrontendMode
      : 'NEW_CUSTOMER',
    heroTitleTeacherStudent:
      clampStr(cfg.heroTitleTeacherStudent, 180, DEFAULT_SITE_CONFIG.heroTitleTeacherStudent) ||
      DEFAULT_SITE_CONFIG.heroTitleTeacherStudent,
    heroSubtitleTeacherStudent: clampStr(
      cfg.heroSubtitleTeacherStudent,
      400,
      DEFAULT_SITE_CONFIG.heroSubtitleTeacherStudent,
    ),
    heroTitleParent:
      clampStr(cfg.heroTitleParent, 180, DEFAULT_SITE_CONFIG.heroTitleParent) ||
      DEFAULT_SITE_CONFIG.heroTitleParent,
    heroSubtitleParent: clampStr(cfg.heroSubtitleParent, 400, DEFAULT_SITE_CONFIG.heroSubtitleParent),
    heroTitleCustomer:
      clampStr(cfg.heroTitleCustomer, 180, DEFAULT_SITE_CONFIG.heroTitleCustomer) ||
      DEFAULT_SITE_CONFIG.heroTitleCustomer,
    heroSubtitleCustomer: clampStr(cfg.heroSubtitleCustomer, 400, DEFAULT_SITE_CONFIG.heroSubtitleCustomer),
    heroImageUrl: clampStr(cfg.heroImageUrl, 300, DEFAULT_SITE_CONFIG.heroImageUrl),
    heroCaption: clampStr(cfg.heroCaption, 260, DEFAULT_SITE_CONFIG.heroCaption),
    annualDiscountPercent: Math.min(50, Math.max(0, Number(cfg.annualDiscountPercent) || 0)),
    bankName: clampStr(cfg.bankName, 100, DEFAULT_SITE_CONFIG.bankName),
    bankAccount: clampStr(cfg.bankAccount, 60, DEFAULT_SITE_CONFIG.bankAccount),
    bankOwner: clampStr(cfg.bankOwner, 120, DEFAULT_SITE_CONFIG.bankOwner),
    momoPhone: clampStr(cfg.momoPhone, 40, DEFAULT_SITE_CONFIG.momoPhone),
    enableAiAdvisor: Boolean(cfg.enableAiAdvisor),
    enableOnlineExams: Boolean(cfg.enableOnlineExams),
    enableOnlinePayment: Boolean(cfg.enableOnlinePayment),
    authPolicy: sanitizeAuthPolicy(cfg.authPolicy),
    updatedBy: clampStr(cfg.updatedBy, 128, 'system'),
    updatedAt: clampStr(cfg.updatedAt, 60, new Date().toISOString()),
  };
}

export async function ensureUserProfileFromGmail(fbUser: FirebaseUser): Promise<AuthUser> {
  const email = (fbUser.email || '').toLowerCase();
  const userRef = doc(db, 'users', fbUser.uid);

  let resolvedRole: UserRole = 'STUDENT';
  let linkedStudentId: string | undefined;
  let linkedTeacherId: string | undefined;

  if (email === SUPER_ADMIN_EMAIL) {
    resolvedRole = 'SUPER_ADMIN';
    linkedStudentId = undefined;
  } else if (email === ADMIN_EMAIL) {
    resolvedRole = 'ADMIN';
    linkedStudentId = undefined;
  } else if (email) {
    // Check if SuperAdmin pre-assigned a role invite for this Gmail address
    try {
      const inviteSnap = await getDoc(doc(db, 'role_invites', email));
      if (inviteSnap.exists()) {
        const invite = inviteSnap.data() as RoleInviteDoc;
        resolvedRole = invite.role;
        linkedStudentId = invite.linkedStudentId;
        linkedTeacherId = invite.linkedTeacherId;
      }
    } catch {
      // No invite or permission denied -> default cleanly to STUDENT
    }
  }

  try {
    const existingSnap = await getDoc(userRef);
    const nowIso = new Date().toISOString();

    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as UserProfileDoc;
      // Enforce bootstrapped privileges if email matches
      const effectiveRole: UserRole =
        email === SUPER_ADMIN_EMAIL
          ? 'SUPER_ADMIN'
          : email === ADMIN_EMAIL
            ? 'ADMIN'
            : existingData.role;

      return {
        id: fbUser.uid,
        name: existingData.displayName || fbUser.displayName || email.split('@')[0],
        email,
        photoURL: fbUser.photoURL || existingData.photoURL,
        role: effectiveRole,
        linkedStudentId: existingData.linkedStudentId || linkedStudentId,
        linkedStudentIds:
          existingData.linkedStudentIds && existingData.linkedStudentIds.length > 0
            ? existingData.linkedStudentIds
            : existingData.linkedStudentId || linkedStudentId
              ? [existingData.linkedStudentId || linkedStudentId!]
              : undefined,
        linkedTeacherId: existingData.linkedTeacherId || linkedTeacherId,
        authProvider: 'GOOGLE_FIREBASE',
      };
    }

    const profilePayload: UserProfileDoc = {
      uid: fbUser.uid,
      email,
      displayName: clampStr(fbUser.displayName || email.split('@')[0], 120, 'Người dùng Nhân Trí'),
      role: resolvedRole,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(fbUser.photoURL ? { photoURL: clampStr(fbUser.photoURL, 500) } : {}),
      ...(linkedStudentId ? { linkedStudentId } : {}),
      ...(linkedTeacherId ? { linkedTeacherId } : {}),
    };

    await setDoc(userRef, profilePayload);

    return {
      id: fbUser.uid,
      name: profilePayload.displayName,
      email,
      photoURL: profilePayload.photoURL,
      role: resolvedRole,
      linkedStudentId,
      linkedTeacherId,
      authProvider: 'GOOGLE_FIREBASE',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${fbUser.uid}`);
  }
}

export function subscribeSiteConfig(onChange: (config: SiteConfig) => void): () => void {
  const ref = doc(db, 'site_config', 'main');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<SiteConfig>;
        onChange({
          ...DEFAULT_SITE_CONFIG,
          ...data,
          authPolicy: sanitizeAuthPolicy(data.authPolicy),
        });
      } else {
        onChange(DEFAULT_SITE_CONFIG);
      }
    },
    (error) => {
      console.warn('SiteConfig listener fallback to defaults:', error.message);
      onChange(DEFAULT_SITE_CONFIG);
    },
  );
}

export function subscribeCourses(
  fallbackCourses: CoursePackage[],
  onChange: (courses: CoursePackage[]) => void,
): () => void {
  const colRef = collection(db, 'courses');
  return onSnapshot(
    colRef,
    (snap) => {
      if (snap.empty) {
        onChange(fallbackCourses);
        return;
      }
      const list = snap.docs
        .map((d) => d.data() as CoursePackage)
        .sort((a, b) => a.level.localeCompare(b.level));
      onChange(list);
    },
    (error) => {
      console.warn('Courses listener fallback to defaults:', error.message);
      onChange(fallbackCourses);
    },
  );
}

export function subscribePublicTimetable(
  fallbackSlots: TimetableSlot[],
  onChange: (slots: TimetableSlot[]) => void,
  enabled = false,
): () => void {
  if (!enabled) {
    return () => {};
  }
  const colRef = collection(db, 'public_timetable');
  return onSnapshot(
    colRef,
    (snap) => {
      if (snap.empty) {
        onChange(fallbackSlots);
        return;
      }
      onChange(snap.docs.map((d) => d.data() as TimetableSlot));
    },
    (error) => {
      console.warn('Timetable listener fallback to defaults:', error.message);
      onChange(fallbackSlots);
    },
  );
}

export function subscribePublicExams(
  fallbackExams: NationalExam[],
  onChange: (exams: NationalExam[]) => void,
): () => void {
  const colRef = collection(db, 'exams');
  return onSnapshot(
    colRef,
    (snap) => {
      if (snap.empty) {
        onChange(fallbackExams);
        return;
      }
      onChange(snap.docs.map((d) => d.data() as NationalExam));
    },
    (error) => {
      console.warn('Exams listener fallback to defaults:', error.message);
      onChange(fallbackExams);
    },
  );
}

export function subscribeUsersList(
  enabled: boolean,
  onChange: (users: UserProfileDoc[]) => void,
): () => void {
  if (!enabled) return () => {};
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as UserProfileDoc));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    },
  );
}

export function subscribeRoleInvites(
  enabled: boolean,
  onChange: (invites: RoleInviteDoc[]) => void,
): () => void {
  if (!enabled) return () => {};
  return onSnapshot(
    collection(db, 'role_invites'),
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as RoleInviteDoc));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'role_invites');
    },
  );
}

export async function saveSiteConfigPatch(
  currentConfig: SiteConfig,
  patch: Partial<SiteConfig>,
  userEmail: string,
  isSuperAdmin: boolean,
): Promise<SiteConfig> {
  const ref = doc(db, 'site_config', 'main');
  const filteredPatch: Partial<SiteConfig> = {};

  for (const [k, v] of Object.entries(patch) as [keyof SiteConfig, unknown][]) {
    if (isSuperAdmin || ADMIN_ALLOWED_CONFIG_KEYS.has(k)) {
      (filteredPatch as Record<string, unknown>)[k] = v;
    }
  }

  const nextConfig = sanitizeSiteConfig({
    ...currentConfig,
    ...filteredPatch,
    updatedBy: userEmail,
    updatedAt: new Date().toISOString(),
  });

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, nextConfig);
    } else if (isSuperAdmin) {
      await setDoc(ref, nextConfig);
    } else {
      // Partial update strictly within Admin's allowed keys
      const updatePayload: Record<string, unknown> = {
        updatedBy: nextConfig.updatedBy,
        updatedAt: nextConfig.updatedAt,
      };
      for (const k of Object.keys(filteredPatch) as (keyof SiteConfig)[]) {
        updatePayload[k] = nextConfig[k];
      }
      await updateDoc(ref, updatePayload);
    }
    return nextConfig;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'site_config/main');
  }
}

export async function saveCourseToFirestore(course: CoursePackage): Promise<void> {
  const safeCourse: CoursePackage = {
    id: clampStr(course.id, 128),
    level: course.level,
    title: clampStr(course.title, 180),
    titleEn: clampStr(course.titleEn || course.title, 180),
    grades: clampStr(course.grades, 80),
    billingModel: course.billingModel,
    monthlyPrice: Math.max(0, Math.min(50000000, Number(course.monthlyPrice) || 0)),
    annualDiscountPercent: Math.max(0, Math.min(50, Number(course.annualDiscountPercent) || 0)),
    ...(typeof course.boardingAddonPrice === 'number'
      ? { boardingAddonPrice: Math.max(0, course.boardingAddonPrice) }
      : {}),
    ...(typeof course.shuttleAddonPrice === 'number'
      ? { shuttleAddonPrice: Math.max(0, course.shuttleAddonPrice) }
      : {}),
    subjects: (course.subjects || []).slice(0, 15).map((s) => clampStr(s, 200)),
    highlights: (course.highlights || []).slice(0, 10).map((s) => clampStr(s, 200)),
    highlightsEn: (course.highlightsEn || []).slice(0, 10).map((s) => clampStr(s, 200)),
    imageUrl: clampStr(course.imageUrl, 300),
  };

  try {
    await setDoc(doc(db, 'courses', safeCourse.id), safeCourse);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `courses/${safeCourse.id}`);
  }
}

export async function upsertRoleInvite(invite: RoleInviteDoc): Promise<void> {
  const email = invite.email.trim().toLowerCase();
  const payload: RoleInviteDoc = {
    email,
    role: invite.role,
    createdBy: clampStr(invite.createdBy, 128),
    createdAt: new Date().toISOString(),
    ...(invite.displayName ? { displayName: clampStr(invite.displayName, 120) } : {}),
    ...(invite.linkedStudentId ? { linkedStudentId: clampStr(invite.linkedStudentId, 128) } : {}),
    ...(invite.linkedTeacherId ? { linkedTeacherId: clampStr(invite.linkedTeacherId, 128) } : {}),
  };

  try {
    await setDoc(doc(db, 'role_invites', email), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `role_invites/${email}`);
  }
}

export async function deleteRoleInvite(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  try {
    await deleteDoc(doc(db, 'role_invites', normalized));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `role_invites/${normalized}`);
  }
}

export async function updateUserProfileRole(
  uid: string,
  role: UserRole,
  linkedStudentId?: string,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      role,
      updatedAt: new Date().toISOString(),
    };
    if (linkedStudentId !== undefined) {
      payload.linkedStudentId = clampStr(linkedStudentId, 128);
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserActiveStatus(uid: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      active: Boolean(active),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function syncInitialSeedToFirestore(
  bootstrap: BootstrapPayload,
  currentConfig: SiteConfig,
  userEmail: string,
): Promise<{
  coursesSynced: number;
  teachersSynced: number;
  timetableSynced: number;
  examsSynced: number;
}> {
  // 1. Seed site_config/main
  const safeCfg = sanitizeSiteConfig({
    ...currentConfig,
    updatedBy: userEmail,
    updatedAt: new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, 'site_config', 'main'), safeCfg);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'site_config/main');
  }

  // 2. Seed courses
  for (const course of bootstrap.courses) {
    await saveCourseToFirestore(course);
  }

  // 3. Seed public non-PII teachers
  for (const teacher of bootstrap.teachers) {
    try {
      await setDoc(doc(db, 'public_teachers', teacher.id), {
        id: teacher.id,
        name: clampStr(teacher.name, 120),
        shortName: clampStr(teacher.shortName, 60),
        subjects: teacher.subjects.slice(0, 10).map((s) => clampStr(s, 200)),
        degree: clampStr(teacher.degree, 140),
        experienceYears: Number(teacher.experienceYears) || 1,
        roomDefault: clampStr(teacher.roomDefault, 60),
        status: teacher.status,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `public_teachers/${teacher.id}`);
    }
  }

  // 4. Seed public_timetable
  const slots = bootstrap.timetable || [];
  for (const slot of slots) {
    try {
      await setDoc(doc(db, 'public_timetable', slot.id), {
        id: slot.id,
        weekLabel: clampStr(slot.weekLabel, 80),
        period: slot.period,
        shift: slot.shift,
        timeRange: clampStr(slot.timeRange, 40),
        day: slot.day,
        centerClass: clampStr(slot.centerClass, 60),
        subject: clampStr(slot.subject, 100),
        teacherId: clampStr(slot.teacherId, 128),
        teacherName: clampStr(slot.teacherName, 80),
        room: clampStr(slot.room, 60),
        slotType: slot.slotType,
        status: slot.status,
        ...(slot.note ? { note: clampStr(slot.note, 300) } : {}),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `public_timetable/${slot.id}`);
    }
  }

  // 5. Seed national GDPT 2018 exams
  const exams = bootstrap.exams || [];
  for (const exam of exams) {
    try {
      await setDoc(doc(db, 'exams', exam.id), {
        id: exam.id,
        title: clampStr(exam.title, 200),
        level: exam.level,
        grade: exam.grade,
        subject: clampStr(exam.subject, 80),
        durationMinutes: exam.durationMinutes,
        curriculumStandard: clampStr(exam.curriculumStandard, 160),
        difficulty: exam.difficulty,
        attemptsCount: exam.attemptsCount,
        questions: exam.questions.slice(0, 50),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `exams/${exam.id}`);
    }
  }

  // 6. Ensure bootstrapped lethituman2021@gmail.com invite exists if SuperAdmin triggered sync
  if (userEmail.toLowerCase() === SUPER_ADMIN_EMAIL) {
    try {
      await upsertRoleInvite({
        email: ADMIN_EMAIL,
        role: 'ADMIN',
        displayName: 'Admin Quản trị Vận hành (Lê Thị Tú Mẫn)',
        createdBy: userEmail,
      });
    } catch {
      // Ignore if not SuperAdmin
    }
  }

  return {
    coursesSynced: bootstrap.courses.length,
    teachersSynced: bootstrap.teachers.length,
    timetableSynced: slots.length,
    examsSynced: exams.length,
  };
}
