import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Bell,
  BookOpen,
  Calendar,
  Check,
  FileBarChart2,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Pencil,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  CoursePackage,
  FrontendMode,
  Language,
  NationalExam,
  SiteConfig,
  TimetableSlot,
  UserRole,
} from './types';
import {
  ADMIN_EMAIL,
  auth,
  signInWithGmailPopup,
  signOutGmail,
  SUPER_ADMIN_EMAIL,
} from './lib/firebase';
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
import {
  apiRequest,
  isAdminOrSuper,
  isSuperAdminRole,
  roleLabel,
  setAuthToken,
  type BootstrapPayload,
  type WorkspacePayload,
} from './lib/api';
import { FrontendPortal } from './components/FrontendPortal';

const CmsOverview = lazy(() =>
  import('./components/CmsOverview').then((m) => ({ default: m.CmsOverview })),
);
const TimetableModule = lazy(() =>
  import('./components/TimetableModule').then((m) => ({ default: m.TimetableModule })),
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

type CmsTab =
  | 'overview'
  | 'system'
  | 'timetable'
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

  // Default Frontend Display Mode: Teacher & Student (user confirmed)
  const [frontendMode, setFrontendMode] = useState<FrontendMode>('TEACHER_STUDENT');
  const [modeInitializedFromConfig, setModeInitializedFromConfig] = useState(false);

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

  // Notifications & Mobile Drawer
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3200);
  }, []);

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

  // Subscribe to live Firestore SiteConfig
  useEffect(() => {
    const unsub = subscribeSiteConfig((cfg) => {
      setSiteConfig(cfg);
      if (cfg.seoTitle) {
        document.title = cfg.seoTitle;
      }
      if (!modeInitializedFromConfig && cfg.defaultFrontendMode) {
        setFrontendMode(cfg.defaultFrontendMode);
        setModeInitializedFromConfig(true);
      }
    });
    return () => unsub();
  }, [modeInitializedFromConfig]);

  // Subscribe to live Firestore Courses, Timetable & Exams (offline-cached with graceful fallback)
  useEffect(() => {
    if (!bootstrap) return;
    const unsubCourses = subscribeCourses(bootstrap.courses, setLiveCourses);
    const unsubTimetable = subscribePublicTimetable(bootstrap.timetable || [], setLiveTimetable);
    const unsubExams = subscribePublicExams(bootstrap.exams || [], setLiveExams);
    return () => {
      unsubCourses();
      unsubTimetable();
      unsubExams();
    };
  }, [bootstrap]);

  const mergedBootstrap = useMemo<BootstrapPayload | null>(() => {
    if (!bootstrap) return null;
    return {
      ...bootstrap,
      courses: liveCourses.length > 0 ? liveCourses : bootstrap.courses,
      timetable: liveTimetable.length > 0 ? liveTimetable : bootstrap.timetable,
      exams: liveExams.length > 0 ? liveExams : bootstrap.exams,
    };
  }, [bootstrap, liveCourses, liveTimetable, liveExams]);

  // Subscribe to Firebase Auth state (Gmail login)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        return;
      }
      setAuthBusy(true);
      try {
        const profile = await ensureUserProfileFromGmail(fbUser);
        setCurrentUser(profile);
        const idToken = await fbUser.getIdToken();
        const bridged = await apiRequest<{ token: string; user: AuthUser }>(
          '/api/v1/auth/firebase-bridge',
          {
            method: 'POST',
            body: JSON.stringify({ idToken, requestedRole: profile.role }),
          },
        );
        setAuthToken(bridged.token);
        const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
        setWorkspace({ ...ws, user: profile });
      } catch (err) {
        console.error('Firebase auth sync error:', err);
      } finally {
        setAuthBusy(false);
      }
    });
    return () => unsub();
  }, []);

  async function handleSignInGmail() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const cred = await signInWithGmailPopup();
      const profile = await ensureUserProfileFromGmail(cred.user);
      setCurrentUser(profile);
      const idToken = await cred.user.getIdToken();
      const bridged = await apiRequest<{ token: string; user: AuthUser }>(
        '/api/v1/auth/firebase-bridge',
        {
          method: 'POST',
          body: JSON.stringify({ idToken, requestedRole: profile.role }),
        },
      );
      setAuthToken(bridged.token);
      const ws = await apiRequest<WorkspacePayload>('/api/v1/workspace');
      setWorkspace({ ...ws, user: profile });
      setShowRoleModal(false);
      showToast(`Chào mừng ${profile.name} (${roleLabel(profile.role, 'vi')})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Gmail chưa thành công.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setAuthBusy(false);
    }
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
        <div className="text-center space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white font-bold">
            NT
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

  const navItems: { id: CmsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: lang === 'vi' ? 'Tổng quan & Phân tích' : 'Analytics Overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    ...(showSystemCmsNav
      ? [
          {
            id: 'system' as CmsTab,
            label: lang === 'vi' ? 'Cấu hình CMS & Phân quyền' : 'Site CMS & RBAC',
            icon: <Settings className="w-4 h-4" />,
          },
        ]
      : []),
    {
      id: 'timetable',
      label: lang === 'vi' ? 'Thời khóa biểu động' : 'Dynamic Timetable',
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: 'students',
      label: lang === 'vi' ? 'Học sinh & Điểm danh' : 'Students & Attendance',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'scores',
      label: lang === 'vi' ? 'Học bạ Online & AI' : 'Report Card & AI Scan',
      icon: <FileBarChart2 className="w-4 h-4" />,
    },
    {
      id: 'exams',
      label: lang === 'vi' ? 'Thư viện Đề chuẩn' : 'National Exam Bank',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'tuition',
      label: lang === 'vi' ? 'Học phí & Công nợ' : 'Tuition & Billing',
      icon: <Wallet className="w-4 h-4" />,
    },
    {
      id: 'support',
      label: lang === 'vi' ? 'Hỗ trợ 24/7 & Hạ tầng' : '24/7 AI & System',
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Tổng quan';

  return (
    <>
      {viewShell === 'FRONTEND' || !workspace || !currentUser ? (
        <FrontendPortal
          bootstrap={mergedBootstrap || bootstrap}
          workspace={workspace}
          siteConfig={siteConfig}
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
          onSignInGmail={handleSignInGmail}
          onOpenRoleModal={() => setShowRoleModal(true)}
          onOpenCms={(tab) => {
            if (tab) setActiveTab(tab as CmsTab);
            setViewShell('CMS');
          }}
          authBusy={authBusy}
        />
      ) : (
        <div className="min-h-screen bg-slate-50 flex">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
            <div>
              <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900 text-white font-bold text-sm">
                  NT
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-blue-950 truncate">Nhân Trí CMS</p>
                  <p className="text-[11px] font-mono-num text-slate-500 truncate">
                    {siteConfig.domain}
                  </p>
                </div>
              </div>

              <nav className="p-3 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      activeTab === item.id
                        ? 'bg-blue-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
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
                  <nav className="mt-4 space-y-1">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                          activeTab === item.id ? 'bg-blue-900 text-white' : 'text-slate-700'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
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

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  {lang === 'vi' ? 'EN' : 'VI'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(true)}
                  className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
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
                  />
                )}
                {activeTab === 'system' && showSystemCmsNav && (
                  <SystemConfigCms
                    currentUser={currentUser}
                    siteConfig={siteConfig}
                    courses={liveCourses.length > 0 ? liveCourses : bootstrap.courses}
                    bootstrap={mergedBootstrap || bootstrap}
                    onConfigSaved={(next) => {
                      setSiteConfig(next);
                      showToast('Đã đồng bộ cấu hình hệ thống.');
                    }}
                    onJumpToInlineEdit={() => {
                      setEditMode(true);
                      setViewShell('FRONTEND');
                    }}
                  />
                )}
                {activeTab === 'timetable' && (
                  <TimetableModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
                {activeTab === 'students' && (
                  <StudentsAttendanceModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
                {activeTab === 'scores' && (
                  <ScoresAiModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
                {activeTab === 'exams' && (
                  <ExamLibraryModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
                {activeTab === 'tuition' && (
                  <TuitionModule
                    workspace={workspace}
                    siteConfig={siteConfig}
                    onRefresh={refreshWorkspace}
                  />
                )}
                {activeTab === 'support' && (
                  <SupportSystemModule workspace={workspace} onRefresh={refreshWorkspace} />
                )}
              </Suspense>
            </main>
          </div>
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
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-bold text-blue-950">Đăng nhập chính thức bằng Gmail (Firebase Auth)</p>
                <p>
                  SuperAdmin: <span className="font-mono-num font-semibold">{SUPER_ADMIN_EMAIL}</span>
                </p>
                <p>
                  Admin Vận hành: <span className="font-mono-num font-semibold">{ADMIN_EMAIL}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignInGmail}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{authBusy ? 'Đang mở xác thực Google...' : 'Tiếp tục với tài khoản Gmail'}</span>
              </button>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500">
                Hoặc trải nghiệm nhanh giao diện theo vai trò (chế độ xem thử):
              </p>
              <div className="grid sm:grid-cols-3 gap-2.5">
                {[
                  { role: 'TEACHER' as UserRole, label: 'Giáo viên', desc: 'Điểm danh & TKB' },
                  { role: 'PARENT' as UserRole, label: 'Phụ huynh', desc: 'Học bạ & Học phí' },
                  { role: 'STUDENT' as UserRole, label: 'Học sinh', desc: 'Đề thi & AI chấm' },
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
