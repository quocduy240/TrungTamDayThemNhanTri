import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  FileBarChart2,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { AuthUser, Language, UserRole } from './types';
import {
  apiRequest,
  roleLabel,
  setAuthToken,
  type BootstrapPayload,
  type WorkspacePayload,
} from './lib/api';
import { PublicPortal } from './components/PublicPortal';
import { CmsOverview } from './components/CmsOverview';
import { TimetableModule } from './components/TimetableModule';
import { StudentsAttendanceModule } from './components/StudentsAttendanceModule';
import { ScoresAiModule } from './components/ScoresAiModule';
import { ExamLibraryModule } from './components/ExamLibraryModule';
import { SupportSystemModule, TuitionModule } from './components/TuitionSupportModule';

type CmsTab = 'overview' | 'timetable' | 'students' | 'scores' | 'exams' | 'tuition' | 'support';

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [mode, setMode] = useState<'PUBLIC' | 'CMS'>('PUBLIC');
  const [activeTab, setActiveTab] = useState<CmsTab>('overview');
  const [lang, setLang] = useState<Language>('vi');

  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [needsAdminPasscode, setNeedsAdminPasscode] = useState(false);
  const [claimPasscode, setClaimPasscode] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);

  // Notifications & Mobile Sidebar
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const data = await apiRequest<BootstrapPayload>('/api/v1/bootstrap');
    setBootstrap(data);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const data = await apiRequest<WorkspacePayload>('/api/v1/workspace');
    setWorkspace(data);
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  async function signInAsRole(role: UserRole, passcode?: string) {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/v1/auth/role-session', {
        method: 'POST',
        body: JSON.stringify({ role, passcode }),
      });
      setAuthToken(res.token);
      await refreshWorkspace();
      setMode('CMS');
      setShowAuthModal(false);
      setNeedsAdminPasscode(false);
      setAdminPasscode('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập không thành công.';
      setAuthError(msg);
      if (role === 'ADMIN' && msg.toLowerCase().includes('mật khẩu')) {
        setNeedsAdminPasscode(true);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleClaimAdminPasscode(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/v1/auth/admin-claim', {
        method: 'POST',
        body: JSON.stringify({ passcode: claimPasscode }),
      });
      setAuthToken(res.token);
      await loadBootstrap();
      await refreshWorkspace();
      setShowClaimForm(false);
      setClaimPasscode('');
      setShowAuthModal(false);
      setMode('CMS');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Không thể thiết lập mật khẩu quản trị.');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setWorkspace(null);
    setMode('PUBLIC');
  }

  async function handleReadAllNotifications() {
    await apiRequest('/api/v1/notifications/read-all', { method: 'POST' });
    await refreshWorkspace();
  }

  if (!bootstrap) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white font-bold">
            NT
          </div>
          <p className="text-sm font-semibold text-slate-900">Đang khởi tạo Trung Tâm Nhân Trí...</p>
        </div>
      </div>
    );
  }

  const unreadCount = workspace?.notifications.filter((n) => !n.read).length ?? 0;

  const navItems: { id: CmsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: lang === 'vi' ? 'Tổng quan & Phân tích' : 'Analytics Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'timetable', label: lang === 'vi' ? 'Thời khóa biểu động' : 'Dynamic Timetable', icon: <Calendar className="w-4 h-4" /> },
    { id: 'students', label: lang === 'vi' ? 'Học sinh & Điểm danh' : 'Students & Attendance', icon: <Users className="w-4 h-4" /> },
    { id: 'scores', label: lang === 'vi' ? 'Học bạ Online & AI' : 'Report Card & AI Scan', icon: <FileBarChart2 className="w-4 h-4" /> },
    { id: 'exams', label: lang === 'vi' ? 'Thư viện Đề chuẩn' : 'National Exam Bank', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'tuition', label: lang === 'vi' ? 'Học phí & Công nợ' : 'Tuition & Billing', icon: <Wallet className="w-4 h-4" /> },
    { id: 'support', label: lang === 'vi' ? 'Hỗ trợ 24/7 & RBAC' : '24/7 AI & System', icon: <MessageSquare className="w-4 h-4" /> },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Tổng quan';

  return (
    <>
      {mode === 'PUBLIC' || !workspace ? (
        <PublicPortal
          bootstrap={bootstrap}
          lang={lang}
          onToggleLang={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
          onOpenAuthModal={() => setShowAuthModal(true)}
        />
      ) : (
        <div className="min-h-screen bg-slate-50 flex">
          {/* Desktop Sidebar (256px) */}
          <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
            <div>
              <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900 text-white font-bold text-sm">
                  NT
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-blue-950 truncate">Nhân Trí CMS</p>
                  <p className="text-[11px] text-slate-500 truncate">Trao tri thức – Gửi yêu thương</p>
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
                <p className="font-bold text-slate-950 truncate">{workspace.user.name}</p>
                <p className="text-slate-500 mt-0.5">{roleLabel(workspace.user.role, lang)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Đổi vai trò
                </button>
                <button
                  type="button"
                  onClick={() => setMode('PUBLIC')}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Trang chủ</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất phiên</span>
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
                      setShowAuthModal(true);
                    }}
                    className="w-full py-2 text-xs font-semibold text-blue-950 bg-blue-50 rounded-lg"
                  >
                    Đổi vai trò ({roleLabel(workspace.user.role, lang)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMode('PUBLIC');
                    }}
                    className="w-full py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
                  >
                    Về Trang chủ khóa học
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Workspace Area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Contextual Breadcrumb Top Header */}
            <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                  aria-label="Mở menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-slate-400 hidden sm:inline">Trung Tâm Nhân Trí</span>
                  <span className="text-slate-300 hidden sm:inline">/</span>
                  <span className="font-semibold text-slate-950 truncate">{activeNavLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {lang === 'vi' ? 'EN' : 'VI'}
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
              {activeTab === 'overview' && (
                <CmsOverview
                  workspace={workspace}
                  onNavigate={(t) => setActiveTab(t as CmsTab)}
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
                <TuitionModule workspace={workspace} onRefresh={refreshWorkspace} />
              )}
              {activeTab === 'support' && (
                <SupportSystemModule workspace={workspace} onRefresh={refreshWorkspace} />
              )}
            </main>
          </div>
        </div>
      )}

      {/* Role Sign-in & First-Run Admin Security Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Cổng đăng nhập phân quyền RBAC · Trung Tâm Nhân Trí</span>
                </p>
                <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                  Chọn vai trò truy cập hệ thống CMS
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
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

            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  role: 'ADMIN' as UserRole,
                  title: 'Quản trị viên (Ban Giám Đốc)',
                  desc: 'Toàn quyền TKB, đối soát thu chi, nhắc nợ & xuất SQL.',
                },
                {
                  role: 'TEACHER' as UserRole,
                  title: 'Giáo viên (Cô Mẫn)',
                  desc: 'Điểm danh ca học, nhập Excel/OCR danh sách & dạy thay.',
                },
                {
                  role: 'PARENT' as UserRole,
                  title: 'Phụ huynh (PH em Phúc Hòa)',
                  desc: 'Xem Học bạ Online, tải TKB Google Calendar & đóng học phí QR.',
                },
                {
                  role: 'STUDENT' as UserRole,
                  title: 'Học sinh (Nguyễn Phúc Hòa 6A1)',
                  desc: 'Chụp bài kiểm tra quét AI, luyện đề trắc nghiệm & hỏi AI 24/7.',
                },
              ].map((item) => (
                <button
                  key={item.role}
                  type="button"
                  disabled={authLoading}
                  onClick={() => signInAsRole(item.role, item.role === 'ADMIN' ? adminPasscode : undefined)}
                  className="text-left p-4 border border-slate-200 hover:border-blue-900 hover:bg-blue-50/40 rounded-xl transition-colors cursor-pointer space-y-1"
                >
                  <p className="text-sm font-bold text-slate-950">{item.title}</p>
                  <p className="text-xs text-slate-600">{item.desc}</p>
                </button>
              ))}
            </div>

            {needsAdminPasscode && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  signInAsRole('ADMIN', adminPasscode);
                }}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
              >
                <label className="block text-xs font-semibold text-slate-800">
                  Nhập mật khẩu Quản trị viên để xác thực:
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    required
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Nhập mật khẩu quản trị..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg cursor-pointer"
                  >
                    Xác thực
                  </button>
                </div>
              </form>
            )}

            {!bootstrap.security.adminPasscodeConfigured && (
              <div className="pt-3 border-t border-slate-200 text-xs">
                {!showClaimForm ? (
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(true)}
                    className="text-blue-900 font-semibold hover:underline cursor-pointer"
                  >
                    Thiết lập mật khẩu bảo vệ riêng cho tài khoản Quản trị viên (tùy chọn trước khi chia sẻ)
                  </button>
                ) : (
                  <form onSubmit={handleClaimAdminPasscode} className="space-y-2">
                    <p className="text-slate-600">
                      Mật khẩu sẽ được băm bảo mật (scrypt) trên máy chủ và yêu cầu khi đăng nhập vai trò Quản trị viên.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={claimPasscode}
                        onChange={(e) => setClaimPasscode(e.target.value)}
                        placeholder="Đặt mật khẩu quản trị (≥ 6 ký tự)..."
                        className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                      />
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg cursor-pointer"
                      >
                        Lưu bảo mật
                      </button>
                    </div>
                  </form>
                )}
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
    </>
  );
}
