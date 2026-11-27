import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  Check,
  DoorOpen,
  ExternalLink,
  FileBarChart2,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Pencil,
  Settings,
  ShieldCheck,
  Tv,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AuthPolicy,
  AuthUser,
  CoursePackage,
  FrontendMode,
  Language,
  NationalExam,
  SiteConfig,
  Student,
  TimetableSlot,
  UserRole,
} from './types';
import {
  ADMIN_EMAIL,
  ADMIN_EMAIL_SECONDARY,
  auth,
  signInWithGmailPopup,
  signOutGmail,
  SUPER_ADMIN_EMAIL,
} from './lib/firebase';
import { BrandLogo } from './components/BrandLogo';
import {
  DEFAULT_SITE_CONFIG,
  ensureUserProfileFromGmail,
  saveCourseToFirestore,
  saveSiteConfigPatch,
  subscribeCourses,
  subscribePublicExams,
  subscribePublicTimetable,
  subscribeSiteConfig,
} from './lib/firestoreStore';
import { DEFAULT_AUTH_POLICY } from './lib/identityPolicy';
import {
  apiRequest,
  canManageFinance,
  isAdminOrSuper,
  isSuperAdminRole,
  registerSilentSessionRefresher,
  roleLabel,
  setAuthToken,
  subscribeSessionExpired,
  type BootstrapPayload,
  type WorkspacePayload,
} from './lib/api';
import { buildWorkspaceIndexes } from './lib/workspaceIntegrity';
import { FrontendPortal } from './components/FrontendPortal';
import type { StudentLoginResult } from './components/PortalAuthGates';
import { NotificationPrefsModal } from './components/NotificationPrefsModal';
import {
  ContextualReloginModal,
  SessionExpiredBanner,
} from './components/ContextualReloginBanner';
import {
  EntityQuickDrawer,
  type CrossNavIntent,
  type QuickDrawerTarget,
} from './components/EntityQuickDrawer';
import { DynamicQrLandingView, StudentQrCardModal } from './components/StudentQrHub';
import { ZpdBackendManualDrawer } from './components/ZpdBackendManualDrawer';
import { computeQuickClassSnapshot, formatCountdownSeconds } from './lib/quickClassEngine';

const CmsOverview = lazy(() =>
  import('./components/CmsOverview').then((m) => ({ default: m.CmsOverview })),
);
const TimetableModule = lazy(() =>
  import('./components/TimetableModule').then((m) => ({ default: m.TimetableModule })),
);
const TeachersDirectoryModule = lazy(() =>
  import('./components/TeachersDirectoryModule').then((m) => ({
    default: m.TeachersDirectoryModule,
  })),
);
const StudentsAttendanceModule = lazy(() =>
  import('./components/StudentsAttendanceModule').then((m) => ({
    default: m.StudentsAttendanceModule,
  })),
);
const ScoresAiModule = lazy(() =>
  import('./components/ScoresAiModule').then((m) => ({ default: m.ScoresAiModule })),
);
const ExamLibraryModule = lazy(() =>
  import('./components/ExamLibraryModule').then((m) => ({ default: m.ExamLibraryModule })),
);
const TuitionModule = lazy(() =>
  import('./components/TuitionSupportModule').then((m) => ({ default: m.TuitionModule })),
);
const SupportSystemModule = lazy(() =>
  import('./components/TuitionSupportModule').then((m) => ({ default: m.SupportSystemModule })),
);
const SystemConfigCms = lazy(() =>
  import('./components/SystemConfigCms').then((m) => ({ default: m.SystemConfigCms })),
);
const SocialNotificationCms = lazy(() =>
  import('./components/SocialNotificationCms').then((m) => ({
    default: m.SocialNotificationCms,
  })),
);
const TeacherSelfServiceHub = lazy(() =>
  import('./components/TeacherSelfServiceHub').then((m) => ({
    default: m.TeacherSelfServiceHub,
  })),
);

type CmsTab =
  | 'overview'
  | 'teacher-portal'
  | 'system'
  | 'social'
  | 'timetable'
  | 'teachers'
  | 'students'
  | 'scores'
  | 'exams'
  | 'tuition'
  | 'support';

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [liveCourses, setLiveCourses] = useState<CoursePackage[]>([]);
  const [liveTimetable, setLiveTimetable] = useState<TimetableSlot[]>([]);
  const [liveExams, setLiveExams] = useState<NationalExam[]>([]);

  // Default Frontend Display Mode: Always New Customer (Khách hàng mới) on initial visit
  const [frontendMode, setFrontendMode] = useState<FrontendMode>('NEW_CUSTOMER');

  const [viewShell, setViewShell] = useState<'FRONTEND' | 'CMS'>('FRONTEND');
  const [activeTab, setActiveTab] = useState<CmsTab>('overview');
  const [lang, setLang] = useState<Language>('vi');

  // Authenticated Gmail / Session user
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);

  // 1-Click Visual Inline Editing State (SuperAdmin & Admin only)
  const [editMode, setEditMode] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Dynamic QR landing token from URL (?qr=...)
  const [activeQrToken, setActiveQrToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('qr');
    return raw ? raw.trim() : null;
  });

  // Zero-Data-Loss Session Recovery State
  const [sessionExpiredReason, setSessionExpiredReason] = useState<string | null>(null);
  const [showReloginModal, setShowReloginModal] = useState(false);
  const [recoveringSession, setRecoveringSession] = useState(false);

  // Cross-Entity Quick Drawer & Auto-Filtered Navigation Presets
  const [drawerTarget, setDrawerTarget] = useState<QuickDrawerTarget | null>(null);
  const [drawerQrStudent, setDrawerQrStudent] = useState<Student | null>(null);
  const [crossNavPreset, setCrossNavPreset] = useState<{
    nonce: number;
    classFilter?: string;
    teacherId?: string;
    studentId?: string;
    timetableSubTab?: 'SCHEDULE' | 'AVAILABILITY' | 'LEAVES' | 'ROOMS';
    shiftLabel?: string;
  } | null>(null);

  // Notifications, Preferences, Attendance Preset & Mobile Drawer
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [showNotifPrefsModal, setShowNotifPrefsModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [attendancePreset, setAttendancePreset] = useState<{
    centerClass?: string;
    shiftLabel?: string;
  } | null>(null);
  const [upcomingAlert, setUpcomingAlert] = useState<{
    slotId: string;
    subject: string;
    centerClass: string;
    room: string;
    teacherName: string;
    timeRange: string;
    secondsLeft: number;
  } | null>(null);
  const dismissedAlertSlotsRef = useRef<Set<string>>(new Set());
  const browserNotifiedSlotsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3200);
  }, []);

  const handleJumpToAttendance = useCallback((centerClass: string, shiftLabel: string) => {
    setAttendancePreset({ centerClass, shiftLabel });
    setCrossNavPreset({ nonce: Date.now(), classFilter: centerClass, shiftLabel });
    setActiveTab('students');
    setViewShell('CMS');
  }, []);

  const handleCrossNavigate = useCallback((intent: CrossNavIntent) => {
    setCrossNavPreset({
      nonce: Date.now(),
      classFilter: intent.classFilter,
      teacherId: intent.teacherId,
      studentId: intent.studentId,
      timetableSubTab: intent.timetableSubTab,
      shiftLabel: intent.shiftLabel,
    });
    if (intent.tab === 'students' && (intent.classFilter || intent.shiftLabel)) {
      setAttendancePreset({ centerClass: intent.classFilter, shiftLabel: intent.shiftLabel });
    }
    setActiveTab(intent.tab);
    setViewShell('CMS');
  }, []);

  const handleExitQrView = useCallback(() => {
    setActiveQrToken(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('qr');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  // Client-side Live T-10m Pre-Class Reminder Engine (Vietnam Time UTC+7)
  useEffect(() => {
    if (!currentUser || !workspace) {
      setUpcomingAlert(null);
      return;
    }
    const pref = workspace.myNotificationPref;
    if (pref && (!pref.enabled || !pref.channels.WEB)) {
      setUpcomingAlert(null);
      return;
    }
    if (currentUser.role !== 'STUDENT' && currentUser.role !== 'TEACHER') {
      setUpcomingAlert(null);
      return;
    }

    const leadMinutes =
      pref?.leadMinutes ?? workspace.notificationConfig?.leadMinutes ?? 10;

    const evaluateUpcoming = () => {
      const snapshot = computeQuickClassSnapshot(
        workspace.timetable,
        {
          role: currentUser.role,
          teacherId: currentUser.linkedTeacherId,
          students: workspace.students,
        },
        new Date(),
      );
      if (
        snapshot.nextSlot &&
        snapshot.secondsUntilNext !== null &&
        snapshot.secondsUntilNext > 0 &&
        snapshot.secondsUntilNext <= leadMinutes * 60
      ) {
        const slotKey = `${snapshot.todayDateStr}:${snapshot.nextSlot.id}`;
        if (dismissedAlertSlotsRef.current.has(slotKey)) {
          setUpcomingAlert(null);
          return;
        }
        setUpcomingAlert({
          slotId: slotKey,
          subject: snapshot.nextSlot.subject,
          centerClass: snapshot.nextSlot.centerClass,
          room: snapshot.nextSlot.room,
          teacherName: snapshot.nextSlot.teacherName,
          timeRange: snapshot.nextSlot.timeRange,
          secondsLeft: snapshot.secondsUntilNext,
        });

        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted' &&
          !browserNotifiedSlotsRef.current.has(slotKey)
        ) {
          browserNotifiedSlotsRef.current.add(slotKey);
          try {
            new Notification(
              `Sắp vào lớp trong ${Math.ceil(snapshot.secondsUntilNext / 60)} phút — ${snapshot.nextSlot.subject}`,
              {
                body: `Phòng ${snapshot.nextSlot.room} · Lớp ${snapshot.nextSlot.centerClass} · ${snapshot.nextSlot.teacherName} (${snapshot.nextSlot.timeRange})`,
              },
            );
          } catch {
            // Browser blocked notification
          }
        }
      } else {
        setUpcomingAlert(null);
      }
    };

    evaluateUpcoming();
    const timer = window.setInterval(evaluateUpcoming, 15000);
    return () => window.clearInterval(timer);
  }, [currentUser, workspace]);

  const loadBootstrap = useCallback(async () => {
    const data = await apiRequest<BootstrapPayload>('/api/v1/bootstrap');
    setBootstrap(data);
    setLiveCourses((prev) => (prev.length > 0 ? prev : data.courses));
  }, []);

  const refreshWorkspace = useCallback(async () => {
    try {
      const data = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace(data);
    } catch {
      // ignore if session expired
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Subscribe to live Firestore SiteConfig (keep guest landing strictly on NEW_CUSTOMER)
  useEffect(() => {
    const unsub = subscribeSiteConfig((cfg) => {
      setSiteConfig(cfg);
      if (cfg.seoTitle) {
        document.title = cfg.seoTitle;
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to live Firestore Courses & Exams (public catalog)
  useEffect(() => {
    if (!bootstrap) return;
    const unsubCourses = subscribeCourses(bootstrap.courses, setLiveCourses);
    const unsubExams = subscribePublicExams(bootstrap.exams || [], setLiveExams);
    return () => {
      unsubCourses();
      unsubExams();
    };
  }, [bootstrap]);

  // Subscribe to Firestore timetable ONLY when authenticated (strict privacy for guests)
  useEffect(() => {
    if (!bootstrap || !currentUser) {
      setLiveTimetable([]);
      return;
    }
    const unsubTimetable = subscribePublicTimetable(
      bootstrap.timetable || [],
      setLiveTimetable,
      true,
    );
    return () => unsubTimetable();
  }, [bootstrap, currentUser]);

  const mergedBootstrap = useMemo<BootstrapPayload | null>(() => {
    if (!bootstrap) return null;
    return {
      ...bootstrap,
      courses: liveCourses.length > 0 ? liveCourses : bootstrap.courses,
      timetable: liveTimetable.length > 0 ? liveTimetable : bootstrap.timetable,
      exams: liveExams.length > 0 ? liveExams : bootstrap.exams,
    };
  }, [bootstrap, liveCourses, liveTimetable, liveExams]);

  const activeAuthPolicy = useMemo<AuthPolicy>(
    () =>
      siteConfig.authPolicy ||
      workspace?.authPolicy ||
      bootstrap?.authPolicy ||
      DEFAULT_AUTH_POLICY,
    [siteConfig.authPolicy, workspace?.authPolicy, bootstrap?.authPolicy],
  );

  // Memoized O(1) relational indexes across Teachers, Students, Timetable, Scores, Tuition
  const workspaceIndexes = useMemo(
    () => (workspace ? buildWorkspaceIndexes(workspace) : null),
    [workspace],
  );

  // Silent single-flight Firebase session recovery (prevents 401 interruption on server restart)
  const attemptSilentSessionRecovery = useCallback(async (): Promise<string | null> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    setRecoveringSession(true);
    try {
      const profile = await ensureUserProfileFromGmail(fbUser);
      const idToken = await fbUser.getIdToken(true);
      const res = await fetch('/api/v1/auth/firebase-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          requestedRole: profile.role,
          portalIntent: 'AUTO',
        }),
      });
      if (!res.ok) return null;
      const bridged = (await res.json()) as { token?: string; user?: AuthUser };
      if (!bridged.token || !bridged.user) return null;
      setAuthToken(bridged.token);
      setCurrentUser({
        ...bridged.user,
        photoURL: fbUser.photoURL || profile.photoURL,
        authProvider: 'GOOGLE_FIREBASE',
      });
      setSessionExpiredReason(null);
      return bridged.token;
    } catch {
      return null;
    } finally {
      setRecoveringSession(false);
    }
  }, []);

  useEffect(() => {
    registerSilentSessionRefresher(attemptSilentSessionRecovery);
    const unsub = subscribeSessionExpired((reason) => {
      setSessionExpiredReason(reason);
    });
    return () => {
      registerSilentSessionRefresher(null);
      unsub();
    };
  }, [attemptSilentSessionRecovery]);

  // Subscribe to Firebase Auth state (Gmail login auto-restore)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        return;
      }
      setAuthBusy(true);
      try {
        const profile = await ensureUserProfileFromGmail(fbUser);
        const idToken = await fbUser.getIdToken();
        const bridged = await apiRequest<{
          token?: string;
          user?: AuthUser;
          requiresChildSelection?: boolean;
        }>('/api/v1/auth/firebase-bridge', {
          method: 'POST',
          body: JSON.stringify({
            idToken,
            requestedRole: profile.role,
            portalIntent: 'AUTO',
          }),
        });
        if (bridged.token && bridged.user) {
          const resolvedUser: AuthUser = {
            ...bridged.user,
            photoURL: fbUser.photoURL || profile.photoURL,
            authProvider: 'GOOGLE_FIREBASE',
          };
          setAuthToken(bridged.token);
          setCurrentUser(resolvedUser);
          setSessionExpiredReason(null);
          const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
          setWorkspace({ ...ws, user: resolvedUser });
        }
      } catch (err) {
        console.error('Firebase auth sync error:', err);
      } finally {
        setAuthBusy(false);
      }
    });
    return () => unsub();
  }, []);

  async function handleSignInGmail(
    portalIntent: 'PARENT' | 'STUDENT' | 'TEACHER' | 'AUTO' = 'AUTO',
    studentId?: string,
  ): Promise<StudentLoginResult | void> {
    setAuthBusy(true);
    setAuthError('');
    try {
      const fbUser =
        studentId && auth.currentUser ? auth.currentUser : (await signInWithGmailPopup()).user;
      const profile = await ensureUserProfileFromGmail(fbUser);
      const idToken = await fbUser.getIdToken();
      const bridged = await apiRequest<{
        token?: string;
        user?: AuthUser;
        requiresChildSelection?: boolean;
        candidates?: StudentLoginResult['candidates'];
      }>('/api/v1/auth/firebase-bridge', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          requestedRole: profile.role,
          portalIntent,
          studentId,
        }),
      });

      if (bridged.requiresChildSelection && bridged.candidates) {
        return {
          requiresChildSelection: true,
          candidates: bridged.candidates,
        };
      }

      if (!bridged.token || !bridged.user) {
        throw new Error('Không thể khởi tạo phiên đăng nhập Gmail.');
      }

      const resolvedUser: AuthUser = {
        ...bridged.user,
        photoURL: fbUser.photoURL || profile.photoURL,
        authProvider: 'GOOGLE_FIREBASE',
      };
      setAuthToken(bridged.token);
      setCurrentUser(resolvedUser);
      const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace({ ...ws, user: resolvedUser });
      setShowRoleModal(false);

      if (portalIntent === 'PARENT') {
        setFrontendMode('PARENT');
        setViewShell('FRONTEND');
      } else if (resolvedUser.role === 'TEACHER') {
        setActiveTab('teacher-portal');
        setFrontendMode('TEACHER_STUDENT');
        setViewShell('CMS');
      } else if (portalIntent === 'STUDENT' || portalIntent === 'TEACHER') {
        setFrontendMode('TEACHER_STUDENT');
        setViewShell('FRONTEND');
      }
      showToast(`Chào mừng ${resolvedUser.name} (${roleLabel(resolvedUser.role, 'vi')})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Gmail chưa thành công.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
      throw err;
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleParentPhoneLogin(phone: string, secret: string): Promise<void> {
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await apiRequest<{
        token: string;
        user: AuthUser;
        matchedCount: number;
      }>('/api/v1/auth/parent-login', {
        method: 'POST',
        body: JSON.stringify({ phone, secret }),
      });
      setAuthToken(res.token);
      const localUser: AuthUser = { ...res.user, authProvider: 'LOCAL_SESSION' };
      setCurrentUser(localUser);
      const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace({ ...ws, user: localUser });
      setFrontendMode('PARENT');
      setViewShell('FRONTEND');
      showToast(`Xác thực Phụ huynh thành công (${res.matchedCount} hồ sơ con).`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleStudentLogin(payload: {
    method: 'STUDENT_CODE' | 'PARENT_PHONE';
    studentCode?: string;
    phoneLast4?: string;
    phone?: string;
    secret?: string;
    studentId?: string;
  }): Promise<StudentLoginResult> {
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await apiRequest<{
        token?: string;
        user?: AuthUser;
        requiresChildSelection?: boolean;
        candidates?: StudentLoginResult['candidates'];
      }>('/api/v1/auth/student-login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.requiresChildSelection && res.candidates) {
        return {
          requiresChildSelection: true,
          candidates: res.candidates,
        };
      }

      if (!res.token || !res.user) {
        throw new Error('Không thể khởi tạo phiên vào lớp.');
      }

      setAuthToken(res.token);
      const localUser: AuthUser = { ...res.user, authProvider: 'LOCAL_SESSION' };
      setCurrentUser(localUser);
      const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace({ ...ws, user: localUser });
      setFrontendMode('TEACHER_STUDENT');
      setViewShell('FRONTEND');
      showToast(`Chào mừng em ${localUser.name} đã vào lớp!`);
      return {};
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleUpdateAuthPolicy(nextPolicy: AuthPolicy): Promise<void> {
    const res = await apiRequest<{ authPolicy: AuthPolicy }>('/api/v1/system/auth-policy', {
      method: 'PATCH',
      body: JSON.stringify(nextPolicy),
    });
    if (currentUser?.authProvider === 'GOOGLE_FIREBASE' && isSuperAdminRole(currentUser.role)) {
      try {
        const saved = await saveSiteConfigPatch(
          siteConfig,
          { authPolicy: res.authPolicy },
          currentUser.email,
          true,
        );
        setSiteConfig(saved);
      } catch {
        setSiteConfig((prev) => ({ ...prev, authPolicy: res.authPolicy }));
      }
    } else {
      setSiteConfig((prev) => ({ ...prev, authPolicy: res.authPolicy }));
    }
    setBootstrap((prev) => (prev ? { ...prev, authPolicy: res.authPolicy } : prev));
    await refreshWorkspace();
    showToast('Đã lưu Chính sách Định danh & Xác thực toàn hệ thống.');
  }

  async function signInPreviewRole(role: UserRole) {
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/v1/auth/role-session', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      setAuthToken(res.token);
      const localUser: AuthUser = { ...res.user, authProvider: 'LOCAL_SESSION' };
      setCurrentUser(localUser);
      const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace({ ...ws, user: localUser });
      setShowRoleModal(false);
      if (role === 'PARENT') {
        setFrontendMode('PARENT');
        setViewShell('FRONTEND');
      } else if (role === 'STUDENT') {
        setFrontendMode('TEACHER_STUDENT');
        setViewShell('FRONTEND');
      } else if (role === 'TEACHER') {
        setActiveTab('teacher-portal');
        setViewShell('CMS');
      } else {
        setViewShell('CMS');
      }
      showToast(`Đã chuyển phiên xem thử: ${roleLabel(role, 'vi')}`);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Không thể chuyển vai trò.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await signOutGmail();
    } catch {
      // ignore if local session only
    }
    setAuthToken(null);
    setCurrentUser(null);
    setWorkspace(null);
    setEditMode(false);
    setViewShell('FRONTEND');
    showToast('Đã đăng xuất an toàn.');
  }

  async function handleQuickSaveConfig(patch: Partial<SiteConfig>) {
    if (!currentUser || !isAdminOrSuper(currentUser.role)) return;
    if (currentUser.authProvider === 'GOOGLE_FIREBASE') {
      const saved = await saveSiteConfigPatch(
        siteConfig,
        patch,
        currentUser.email,
        isSuperAdminRole(currentUser.role),
      );
      setSiteConfig(saved);
      showToast('Đã lưu 1-Click lên Cloud Firestore.');
    } else {
      setSiteConfig((prev) => ({ ...prev, ...patch }));
      showToast('Đã sửa bản xem trước (Đăng nhập Gmail quản trị để ghi Firestore).');
    }
  }

  async function handleQuickSaveCourse(updatedCourse: CoursePackage) {
    if (!currentUser || !isAdminOrSuper(currentUser.role)) return;
    setLiveCourses((prev) => prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c)));
    if (currentUser.authProvider === 'GOOGLE_FIREBASE') {
      await saveCourseToFirestore(updatedCourse);
      showToast(`Đã lưu khóa học "${updatedCourse.title}" lên Firestore.`);
    } else {
      showToast('Đã sửa khóa học trên bản xem trước.');
    }
  }

  async function handleReadAllNotifications() {
    await apiRequest('/api/v1/notifications/read-all', { method: 'POST' });
    await refreshWorkspace();
  }

  async function handleLinkStudent(linkCode: string): Promise<{ studentName: string }> {
    const res = await apiRequest<{
      token: string;
      user: AuthUser;
      student: { id: string; fullName: string; centerClass: string };
    }>('/api/v1/auth/link-student', {
      method: 'POST',
      body: JSON.stringify({ linkCode }),
    });
    setAuthToken(res.token);
    setCurrentUser((prev) =>
      prev
        ? {
            ...prev,
            linkedStudentId: res.user.linkedStudentId,
            linkedStudentIds: res.user.linkedStudentIds,
          }
        : res.user,
    );
    await refreshWorkspace();
    showToast(`Đã liên kết học sinh ${res.student.fullName} (${res.student.centerClass}).`);
    return { studentName: res.student.fullName };
  }

  if (!bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <p className="text-sm font-semibold text-slate-900">
            Đang khởi tạo daythemnhantri.com...
          </p>
        </div>
      </div>
    );
  }

  const unreadCount = workspace?.notifications.filter((n) => !n.read).length ?? 0;
  const activeRole = currentUser?.role || workspace?.user.role;
  const showSystemCmsNav = isAdminOrSuper(activeRole);
  const showSocialCmsNav = isAdminOrSuper(activeRole) || activeRole === 'MANAGER';
  const showTeachersNav =
    isAdminOrSuper(activeRole) || activeRole === 'MANAGER' || activeRole === 'TEACHER';
  const showTuitionNav =
    canManageFinance(activeRole) || activeRole === 'PARENT' || activeRole === 'STUDENT';

  const showTeacherPortalNav =
    activeRole === 'TEACHER' || activeRole === 'MANAGER' || isAdminOrSuper(activeRole);

  const rawNavGroups: {
    id: string;
    title: string;
    items: { id: CmsTab; label: string; icon: React.ReactNode }[];
  }[] = [
    {
      id: 'operations',
      title: lang === 'vi' ? 'Điều hành & Học vụ' : 'Operations',
      items: [
        {
          id: 'overview',
          label: lang === 'vi' ? 'Tổng quan & Phân tích' : 'Analytics Overview',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
        },
        ...(showTeacherPortalNav
          ? [
              {
                id: 'teacher-portal' as CmsTab,
                label:
                  activeRole === 'TEACHER'
                    ? lang === 'vi'
                      ? 'Lịch & Hồ sơ của tôi'
                      : 'My Schedule & Profile'
                    : lang === 'vi'
                      ? 'Không gian Giáo viên'
                      : 'Teacher Self-Service',
                icon: <UserCheck className="w-4 h-4 shrink-0" />,
              },
            ]
          : []),
        {
          id: 'timetable',
          label: lang === 'vi' ? 'Thời khóa biểu & Phòng học' : 'Timetable & Rooms',
          icon: <Calendar className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'directory',
      title: lang === 'vi' ? 'Hồ sơ Nhân sự & Học viên' : 'Directory',
      items: [
        ...(showTeachersNav
          ? [
              {
                id: 'teachers' as CmsTab,
                label: lang === 'vi' ? 'Quản lý Giáo viên' : 'Teachers Directory',
                icon: <Users className="w-4 h-4 shrink-0" />,
              },
            ]
          : []),
        {
          id: 'students',
          label: lang === 'vi' ? 'Quản lý Học sinh & Điểm danh' : 'Students & Attendance',
          icon: <GraduationCap className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'academics',
      title: lang === 'vi' ? 'Đào tạo & Chuyên môn' : 'Academics',
      items: [
        {
          id: 'scores',
          label: lang === 'vi' ? 'Học bạ Online & Điểm AI' : 'Report Card & AI Scan',
          icon: <FileBarChart2 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'exams',
          label: lang === 'vi' ? 'Thư viện Đề chuẩn' : 'National Exam Bank',
          icon: <BookOpen className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'finance-system',
      title: lang === 'vi' ? 'Tài chính & Hệ thống' : 'Finance & System',
      items: [
        ...(showTuitionNav
          ? [
              {
                id: 'tuition' as CmsTab,
                label: lang === 'vi' ? 'Học phí & Công nợ' : 'Tuition & Billing',
                icon: <Wallet className="w-4 h-4 shrink-0" />,
              },
            ]
          : []),
        ...(showSocialCmsNav
          ? [
              {
                id: 'social' as CmsTab,
                label: lang === 'vi' ? 'Bài viết, Banner & Truyền thông' : 'Articles, Banners & Social',
                icon: <Tv className="w-4 h-4 shrink-0" />,
              },
            ]
          : []),
        ...(showSystemCmsNav
          ? [
              {
                id: 'system' as CmsTab,
                label: lang === 'vi' ? 'Cấu hình CMS & Toàn vẹn' : 'Site CMS & Integrity',
                icon: <Settings className="w-4 h-4 shrink-0" />,
              },
            ]
          : []),
        {
          id: 'support',
          label: lang === 'vi' ? 'Hỗ trợ 24/7 & Hạ tầng' : '24/7 AI & System',
          icon: <MessageSquare className="w-4 h-4 shrink-0" />,
        },
      ],
    },
  ];
  const navGroups = rawNavGroups.filter((g) => g.items.length > 0);

  const navItems = navGroups.flatMap((g) => g.items);
  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Tổng quan';

  // Dynamic QR Student Card Landing View (?qr=<token>)
  if (activeQrToken) {
    return (
      <DynamicQrLandingView
        qrToken={activeQrToken}
        currentUser={currentUser}
        siteConfig={siteConfig}
        onExitQr={handleExitQrView}
      />
    );
  }

  return (
    <>
      {viewShell === 'FRONTEND' || !workspace || !currentUser ? (
        <FrontendPortal
          bootstrap={mergedBootstrap || bootstrap}
          workspace={workspace}
          siteConfig={siteConfig}
          authPolicy={activeAuthPolicy}
          courses={liveCourses.length > 0 ? liveCourses : bootstrap.courses}
          currentUser={currentUser}
          frontendMode={frontendMode}
          onChangeFrontendMode={setFrontendMode}
          lang={lang}
          onToggleLang={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
          editMode={editMode}
          onToggleEditMode={() => setEditMode((e) => !e)}
          onQuickSaveConfig={handleQuickSaveConfig}
          onQuickSaveCourse={handleQuickSaveCourse}
          onLinkStudent={handleLinkStudent}
          onRefreshWorkspace={refreshWorkspace}
          onParentPhoneLogin={handleParentPhoneLogin}
          onStudentLogin={handleStudentLogin}
          onSignInGmail={handleSignInGmail}
          onQuickPreviewRole={activeAuthPolicy.allowDemoPreview ? signInPreviewRole : undefined}
          onLogout={handleLogout}
          onOpenRoleModal={() => setShowRoleModal(true)}
          onOpenCms={(tab) => {
            if (tab) setActiveTab(tab as CmsTab);
            setViewShell('CMS');
          }}
          onOpenNotificationPrefs={currentUser ? () => setShowNotifPrefsModal(true) : undefined}
          onJumpToAttendance={handleJumpToAttendance}
          authBusy={authBusy}
        />
      ) : (
        <div className="min-h-screen bg-slate-50 flex">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
            <div>
              <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-2.5">
                <BrandLogo size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-blue-950 truncate">Nhân Trí CMS</p>
                  <p className="text-[11px] font-mono-num text-slate-500 truncate">
                    {siteConfig.domain}
                  </p>
                </div>
              </div>

              <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
                {navGroups.map((group) => (
                  <div key={group.id} className="space-y-1">
                    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.title}
                    </p>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          activeTab === item.id
                            ? 'bg-blue-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        {item.icon}
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </div>

            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="text-xs">
                <p className="font-bold text-slate-950 truncate">{currentUser.name}</p>
                <p className="text-blue-900 font-semibold mt-0.5">{roleLabel(currentUser.role, lang)}</p>
                <p className="text-[11px] font-mono-num text-slate-500 truncate mt-0.5">
                  {currentUser.email}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {isAdminOrSuper(currentUser.role) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(true);
                      setViewShell('FRONTEND');
                    }}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Sửa 1-Click</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewShell('FRONTEND')}
                  className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap ${
                    isAdminOrSuper(currentUser.role) ? '' : 'col-span-2'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Frontend</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </aside>

          {/* Mobile Drawer Sidebar */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} />
              <div className="relative w-64 bg-white h-full flex flex-col justify-between p-4 z-10">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <span className="font-extrabold text-blue-950">Nhân Trí CMS</span>
                    <button type="button" onClick={() => setMobileMenuOpen(false)} className="cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <nav className="mt-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
                    {navGroups.map((group) => (
                      <div key={group.id} className="space-y-1">
                        <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {group.title}
                        </p>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveTab(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer ${
                              activeTab === item.id ? 'bg-blue-900 text-white' : 'text-slate-700'
                            }`}
                          >
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </nav>
                </div>
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setViewShell('FRONTEND');
                    }}
                    className="w-full py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
                  >
                    Về Frontend ({siteConfig.domain})
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-2 text-xs font-semibold text-red-700 bg-red-50 rounded-lg"
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main CMS Workspace */}
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-slate-400 hidden sm:inline font-mono-num">
                    {siteConfig.domain}
                  </span>
                  <span className="text-slate-300 hidden sm:inline">/</span>
                  <span className="font-semibold text-slate-950 truncate">{activeNavLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={typeof window !== 'undefined' ? `${window.location.origin}/?view=frontend` : '/?view=frontend'}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở giao diện Frontend trong tab trình duyệt mới"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-950 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-900" />
                  <span className="hidden sm:inline">Mở Frontend</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {lang === 'vi' ? 'EN' : 'VI'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotifPrefsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <BellRing className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden sm:inline">Nhắc trước 10p</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(true)}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Bell className="w-4 h-4 text-blue-900" />
                  <span>Thông báo</span>
                  {unreadCount > 0 && (
                    <span className="font-mono-num text-red-700 font-bold">({unreadCount})</span>
                  )}
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 lg:p-8 max-w-[1360px] w-full mx-auto">
              <SessionExpiredBanner
                reason={sessionExpiredReason}
                recovering={recoveringSession}
                onAttemptSilentRefresh={async () => {
                  const ok = await attemptSilentSessionRecovery();
                  if (ok) {
                    showToast('Đã khôi phục phiên làm việc thành công.');
                    await refreshWorkspace();
                  } else {
                    setShowReloginModal(true);
                  }
                }}
                onOpenReloginModal={() => setShowReloginModal(true)}
                onDismiss={() => setSessionExpiredReason(null)}
              />
              <Suspense
                fallback={
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
                    Đang tải phân hệ quản trị...
                  </div>
                }
              >
                {activeTab === 'overview' && (
                  <CmsOverview
                    workspace={workspace}
                    onNavigate={(t) => setActiveTab(t as CmsTab)}
                    onJumpToAttendance={handleJumpToAttendance}
                    onOpenNotificationPrefs={() => setShowNotifPrefsModal(true)}
                    onRefresh={refreshWorkspace}
                  />
                )}
                {activeTab === 'teacher-portal' && showTeacherPortalNav && (
                  <TeacherSelfServiceHub
                    currentUser={currentUser}
                    teachers={workspace.teachers}
                    timetable={workspace.timetable}
                    teacherLeaves={workspace.teacherLeaves}
                    timetableUpdatedAt={workspace.timetableUpdatedAt}
                    timetableVersion={workspace.timetableVersion}
                    timetableChanges={workspace.timetableChanges}
                    specialBlocks={
                      workspace.timetableSpecialBlocks || bootstrap.timetableSpecialBlocks || []
                    }
                    siteConfig={siteConfig}
                    onRefresh={refreshWorkspace}
                  />
                )}
                {activeTab === 'system' && showSystemCmsNav && (
                  <SystemConfigCms
                    currentUser={currentUser}
                    siteConfig={siteConfig}
                    authPolicy={activeAuthPolicy}
                    auditLogs={workspace.auditLogs || []}
                    courses={liveCourses.length > 0 ? liveCourses : bootstrap.courses}
                    bootstrap={mergedBootstrap || bootstrap}
                    onConfigSaved={(next) => {
                      setSiteConfig(next);
                      showToast('Đã đồng bộ cấu hình hệ thống.');
                    }}
                    onUpdateAuthPolicy={handleUpdateAuthPolicy}
                    onJumpToInlineEdit={() => {
                      setEditMode(true);
                      setViewShell('FRONTEND');
                    }}
                    onRefreshWorkspace={refreshWorkspace}
                  />
                )}
                {activeTab === 'social' && showSocialCmsNav && (
                  <SocialNotificationCms
                    user={currentUser}
                    channels={workspace.socialChannels || bootstrap.socialChannels || []}
                    posts={workspace.socialPosts || bootstrap.socialPosts || []}
                    editorialArticles={workspace.editorialArticles || bootstrap.editorialArticles || []}
                    reusableBlocks={workspace.reusableBlocks || []}
                    promoBanners={workspace.promoBanners || bootstrap.promoBanners || []}
                    notificationConfig={workspace.notificationConfig}
                    dispatchLogs={workspace.reminderDispatchLogs || []}
                    timetable={workspace.timetable}
                    onRefresh={async () => {
                      await Promise.all([refreshWorkspace(), loadBootstrap()]);
                    }}
                  />
                )}
                {activeTab === 'timetable' && (
                  <TimetableModule
                    workspace={workspace}
                    siteConfig={siteConfig}
                    initialClassFilter={crossNavPreset?.classFilter}
                    initialTeacherFilter={crossNavPreset?.teacherId}
                    initialSubTab={crossNavPreset?.timetableSubTab}
                    onRefresh={refreshWorkspace}
                    onOpenDrawer={setDrawerTarget}
                    onCrossNavigate={handleCrossNavigate}
                    onRequestRelogin={() => setShowReloginModal(true)}
                  />
                )}
                {activeTab === 'teachers' && showTeachersNav && (
                  <TeachersDirectoryModule
                    workspace={workspace}
                    indexes={workspaceIndexes}
                    siteConfig={siteConfig}
                    onRefresh={refreshWorkspace}
                    onOpenDrawer={setDrawerTarget}
                    onCrossNavigate={handleCrossNavigate}
                    onRequestRelogin={() => setShowReloginModal(true)}
                  />
                )}
                {activeTab === 'students' && (
                  <StudentsAttendanceModule
                    workspace={workspace}
                    indexes={workspaceIndexes}
                    siteConfig={siteConfig}
                    onRefresh={refreshWorkspace}
                    initialClassFilter={crossNavPreset?.classFilter || attendancePreset?.centerClass}
                    initialShiftLabel={crossNavPreset?.shiftLabel || attendancePreset?.shiftLabel}
                    initialTeacherId={crossNavPreset?.teacherId}
                    onOpenDrawer={setDrawerTarget}
                    onCrossNavigate={handleCrossNavigate}
                    onRequestRelogin={() => setShowReloginModal(true)}
                  />
                )}
                {activeTab === 'scores' && (
                  <ScoresAiModule
                    workspace={workspace}
                    siteConfig={siteConfig}
                    initialStudentId={crossNavPreset?.studentId}
                    onRefresh={refreshWorkspace}
                    onOpenDrawer={setDrawerTarget}
                  />
                )}
                {activeTab === 'exams' && (
                  <ExamLibraryModule
                    workspace={workspace}
                    siteConfig={siteConfig}
                    onRefresh={refreshWorkspace}
                  />
                )}
                {activeTab === 'tuition' && showTuitionNav && (
                  <TuitionModule
                    workspace={workspace}
                    siteConfig={siteConfig}
                    initialStudentId={crossNavPreset?.studentId}
                    onRefresh={refreshWorkspace}
                    onOpenDrawer={setDrawerTarget}
                  />
                )}
                {activeTab === 'support' && (
                  <SupportSystemModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
              </Suspense>
            </main>
          </div>

          {/* Right-Edge Docked 2-Level ZPD Backend Admin Manual (Collapsed by default) */}
          <ZpdBackendManualDrawer
            activeTab={activeTab}
            onNavigateTab={(tabId) => setActiveTab(tabId as CmsTab)}
          />
        </div>
      )}

      {/* Gmail Sign-In & Role Preview Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Đăng nhập Gmail &amp; Phân quyền RBAC · {siteConfig.domain}</span>
                </p>
                <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                  Đăng nhập tài khoản Trung Tâm Nhân Trí
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {authError}
              </div>
            )}

            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <BrandLogo size="sm" />
                <div className="text-xs text-slate-700 space-y-1 min-w-0">
                  <p className="font-bold text-blue-950">Đăng nhập chính thức bằng Gmail (Firebase Auth)</p>
                  <p className="truncate">
                    SuperAdmin: <span className="font-mono-num font-semibold">{SUPER_ADMIN_EMAIL}</span>
                  </p>
                  <p className="truncate">
                    Admin Vận hành: <span className="font-mono-num font-semibold">{ADMIN_EMAIL}</span>
                  </p>
                  <p className="truncate">
                    Admin Vận hành 2: <span className="font-mono-num font-semibold">{ADMIN_EMAIL_SECONDARY}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={authBusy}
                onClick={() => {
                  handleSignInGmail('AUTO').catch(() => {});
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{authBusy ? 'Đang mở xác thực Google...' : 'Tiếp tục với tài khoản Gmail'}</span>
              </button>
            </div>

            {activeAuthPolicy.allowDemoPreview && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-500">
                  Hoặc trải nghiệm nhanh giao diện theo vai trò (chế độ xem thử):
                </p>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {[
                    { role: 'MANAGER' as UserRole, label: 'Người quản lý', desc: 'Sửa TKB, Phòng, GV & HS' },
                    { role: 'TEACHER' as UserRole, label: 'Giáo viên', desc: 'Lịch rảnh, Xin nghỉ & Điểm danh' },
                    { role: 'PARENT' as UserRole, label: 'Phụ huynh', desc: 'TKB, Học bạ & Học phí các con' },
                    { role: 'STUDENT' as UserRole, label: 'Học sinh', desc: 'TKB lớp, Đề thi & AI chấm' },
                  ].map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      disabled={authBusy}
                      onClick={() => signInPreviewRole(item.role)}
                      className="text-left p-3 border border-slate-200 hover:border-blue-900 hover:bg-blue-50/40 rounded-lg cursor-pointer"
                    >
                      <p className="text-xs font-bold text-slate-950">{item.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real-Time Notifications Slide-Over */}
      {showNotifDrawer && workspace && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-950/40" onClick={() => setShowNotifDrawer(false)} />
          <div className="relative w-full max-w-md bg-white h-full border-l border-slate-200 z-10 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-950">Trung tâm Thông báo đẩy</h2>
                <p className="text-xs text-slate-500">Đồng bộ App · Zalo Phụ huynh · Email</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReadAllNotifications}
                  className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                >
                  Đánh dấu đã đọc
                </button>
                <button type="button" onClick={() => setShowNotifDrawer(false)} className="cursor-pointer">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {workspace.notifications.map((n) => (
                <div key={n.id} className={`p-4 space-y-1 ${n.read ? 'bg-white' : 'bg-blue-50/40'}`}>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold text-blue-900">Kênh: {n.channel}</span>
                    <span className="font-mono-num">{n.createdAt}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-950">{n.title}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Account Notification Preferences Modal (Zalo / Email / Facebook / Web) */}
      {currentUser && (
        <NotificationPrefsModal
          open={showNotifPrefsModal}
          onClose={() => setShowNotifPrefsModal(false)}
          initialPref={workspace?.myNotificationPref}
          onSaved={() => {
            refreshWorkspace();
            showToast('Đã lưu cài đặt nhận nhắc lịch trước ca học.');
          }}
        />
      )}

      {/* Live T-10m Pre-Class Reminder Floating Alert */}
      {upcomingAlert && currentUser && (
        <div className="fixed bottom-4 left-4 z-50 max-w-md w-[calc(100vw-2rem)] bg-white border-2 border-amber-400 rounded-xl p-4 shadow-xl space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-800 font-mono-num">
                  Sắp vào lớp sau {formatCountdownSeconds(upcomingAlert.secondsLeft)}
                </p>
                <p className="text-sm font-bold text-slate-950 truncate">
                  {upcomingAlert.subject} · {upcomingAlert.centerClass}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Phòng <strong className="font-mono-num text-blue-950">{upcomingAlert.room}</strong> ·{' '}
                  {upcomingAlert.teacherName} ({upcomingAlert.timeRange})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                dismissedAlertSlotsRef.current.add(upcomingAlert.slotId);
                setUpcomingAlert(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              aria-label="Đóng nhắc lịch"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowNotifPrefsModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cài đặt kênh nhắc
            </button>
            <button
              type="button"
              onClick={() => {
                setFrontendMode('TEACHER_STUDENT');
                setViewShell('FRONTEND');
                dismissedAlertSlotsRef.current.add(upcomingAlert.slotId);
                setUpcomingAlert(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              <span>Vào lớp nhanh</span>
            </button>
          </div>
        </div>
      )}

      {/* Contextual In-Place Re-Login Modal (Preserves Active CMS Forms & Tabs) */}
      <ContextualReloginModal
        open={showReloginModal}
        user={currentUser}
        reason={sessionExpiredReason}
        allowDemoPreview={activeAuthPolicy.allowDemoPreview}
        onClose={() => setShowReloginModal(false)}
        onGoogleRelogin={async () => {
          const silentOk = await attemptSilentSessionRecovery();
          if (silentOk) {
            await refreshWorkspace();
            return true;
          }
          await handleSignInGmail('AUTO');
          setSessionExpiredReason(null);
          return true;
        }}
        onDemoRoleRelogin={
          activeAuthPolicy.allowDemoPreview && currentUser
            ? async () => {
                await signInPreviewRole(currentUser.role);
                setSessionExpiredReason(null);
                return true;
              }
            : undefined
        }
        onSwitchToFullLogin={() => setShowRoleModal(true)}
      />

      {/* Cross-Entity Quick-Inspect & Inline-Edit Slide-Over Drawer */}
      {workspace && (
        <EntityQuickDrawer
          target={drawerTarget}
          workspace={workspace}
          indexes={workspaceIndexes}
          canEdit={
            isAdminOrSuper(activeRole) || activeRole === 'MANAGER'
          }
          canSeeFinance={canManageFinance(activeRole)}
          onClose={() => setDrawerTarget(null)}
          onSaved={refreshWorkspace}
          onCrossNavigate={handleCrossNavigate}
          onOpenQrCard={(st) => setDrawerQrStudent(st)}
          onRequestRelogin={() => setShowReloginModal(true)}
        />
      )}

      {/* Quick QR Modal triggered from EntityQuickDrawer */}
      {workspace && (
        <StudentQrCardModal
          student={drawerQrStudent}
          allStudents={workspace.students}
          canManage={isAdminOrSuper(activeRole)}
          siteConfig={siteConfig}
          onClose={() => setDrawerQrStudent(null)}
          onRotated={async () => {
            await refreshWorkspace();
            showToast('Đã cấp lại Mã QR động mới cho học sinh.');
          }}
        />
      )}

      {/* Subtle Toast Confirmation */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-950 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 border border-slate-800">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
