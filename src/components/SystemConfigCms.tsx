import React, { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Globe,
  Lock,
  Pencil,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AuthUser,
  CoursePackage,
  FrontendMode,
  RoleInviteDoc,
  SiteConfig,
  UserProfileDoc,
  UserRole,
} from '../types';
import { ADMIN_EMAIL, SUPER_ADMIN_EMAIL } from '../lib/firebase';
import {
  deleteRoleInvite,
  saveCourseToFirestore,
  saveSiteConfigPatch,
  subscribeRoleInvites,
  subscribeUsersList,
  syncInitialSeedToFirestore,
  updateUserProfileRole,
  upsertRoleInvite,
} from '../lib/firestoreStore';
import { formatVnd, isSuperAdminRole, roleLabel, type BootstrapPayload } from '../lib/api';

interface SystemConfigCmsProps {
  currentUser: AuthUser;
  siteConfig: SiteConfig;
  courses: CoursePackage[];
  bootstrap: BootstrapPayload;
  onConfigSaved: (next: SiteConfig) => void;
  onJumpToInlineEdit: () => void;
}

export const SystemConfigCms: React.FC<SystemConfigCmsProps> = ({
  currentUser,
  siteConfig,
  courses,
  bootstrap,
  onConfigSaved,
  onJumpToInlineEdit,
}) => {
  const isSuperAdmin = isSuperAdminRole(currentUser.role);
  const [subTab, setSubTab] = useState<'content' | 'system' | 'rbac'>('content');

  // Local editable form state synced with Firestore SiteConfig
  const [form, setForm] = useState<SiteConfig>(siteConfig);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Editable courses state
  const [courseDrafts, setCourseDrafts] = useState<CoursePackage[]>(courses);
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);

  // RBAC live Firestore state
  const [usersList, setUsersList] = useState<UserProfileDoc[]>([]);
  const [invitesList, setInvitesList] = useState<RoleInviteDoc[]>([]);
  const [newInvite, setNewInvite] = useState({
    email: '',
    role: 'TEACHER' as Exclude<UserRole, 'SUPER_ADMIN'>,
    displayName: '',
    linkedStudentId: '',
  });
  const [syncingSeed, setSyncingSeed] = useState(false);

  useEffect(() => {
    setForm(siteConfig);
  }, [siteConfig]);

  useEffect(() => {
    setCourseDrafts(courses);
  }, [courses]);

  useEffect(() => {
    if (currentUser.authProvider !== 'GOOGLE_FIREBASE') return;
    const canReadUsers = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN';
    const unsubUsers = subscribeUsersList(canReadUsers, setUsersList);
    const unsubInvites = subscribeRoleInvites(isSuperAdmin, setInvitesList);
    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, [currentUser.authProvider, currentUser.role, isSuperAdmin]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      if (currentUser.authProvider === 'GOOGLE_FIREBASE') {
        const saved = await saveSiteConfigPatch(siteConfig, form, currentUser.email, isSuperAdmin);
        onConfigSaved(saved);
        setStatusMsg('Đã lưu cấu hình lên Cloud Firestore và đồng bộ trực tiếp tới daythemnhantri.com.');
      } else {
        onConfigSaved(form);
        setStatusMsg('Đã cập nhật bản xem trước. Đăng nhập bằng Gmail SuperAdmin/Admin để ghi cố định lên Firestore.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCourse(course: CoursePackage) {
    setSavingCourseId(course.id);
    setStatusMsg('');
    setErrorMsg('');
    try {
      if (currentUser.authProvider === 'GOOGLE_FIREBASE') {
        await saveCourseToFirestore(course);
        setStatusMsg(`Đã cập nhật khóa học "${course.title}" trên Firestore.`);
      } else {
        setStatusMsg('Đăng nhập bằng Gmail quản trị để lưu thay đổi khóa học lên Firestore.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu khóa học.');
    } finally {
      setSavingCourseId(null);
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin || !newInvite.email.trim()) return;
    setErrorMsg('');
    setStatusMsg('');
    try {
      await upsertRoleInvite({
        email: newInvite.email.trim().toLowerCase(),
        role: newInvite.role,
        displayName: newInvite.displayName.trim() || undefined,
        linkedStudentId: newInvite.linkedStudentId.trim() || undefined,
        createdBy: currentUser.email,
      });
      setStatusMsg(`Đã cấp quyền ${newInvite.role} cho Gmail ${newInvite.email.trim().toLowerCase()}.`);
      setNewInvite({ email: '', role: 'TEACHER', displayName: '', linkedStudentId: '' });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cấp quyền Gmail.');
    }
  }

  async function handleSyncSeed() {
    if (currentUser.authProvider !== 'GOOGLE_FIREBASE') {
      setErrorMsg('Vui lòng đăng nhập bằng Gmail (duyweb5@gmail.com hoặc lethituman2021@gmail.com) để đồng bộ Firestore.');
      return;
    }
    setSyncingSeed(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await syncInitialSeedToFirestore(bootstrap, form, currentUser.email);
      setStatusMsg(
        `Đã khởi tạo & đồng bộ dữ liệu chuẩn lên Firestore (${res.coursesSynced} khóa học, ${res.teachersSynced} giáo viên, cấu hình daythemnhantri.com).`,
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Đồng bộ Firestore thất bại.');
    } finally {
      setSyncingSeed(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-900">
            Hệ quản trị CMS Toàn diện · {siteConfig.domain}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 mt-0.5">
            Cấu hình Hệ thống, Frontend 1-Click &amp; Phân quyền Gmail
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onJumpToInlineEdit}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Mở chế độ Sửa trực tiếp 1-Click trên Frontend</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'content', label: 'Nội dung 3 giao diện & Khóa học', icon: <Sliders className="w-4 h-4" /> },
          { id: 'system', label: 'Tên miền, SEO & Thanh toán (SuperAdmin)', icon: <Globe className="w-4 h-4" /> },
          { id: 'rbac', label: 'Phân quyền Gmail RBAC (SuperAdmin)', icon: <ShieldCheck className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as 'content' | 'system' | 'rbac')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              subTab === t.id
                ? 'bg-blue-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: FRONTEND CONTENT & COURSES (SuperAdmin + Admin) */}
      {subTab === 'content' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveConfig} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-950">Thông tin thương hiệu &amp; 3 chế độ Frontend</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mọi thay đổi tại đây đồng bộ trực tiếp với nút Sửa nhanh 1-Click trên trang chủ.
                </p>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Đang lưu...' : 'Lưu toàn bộ nội dung'}</span>
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên đầy đủ Trung tâm</label>
                <input
                  type="text"
                  value={form.centerName}
                  onChange={(e) => setForm({ ...form, centerName: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Chế độ hiển thị mặc định khi vào web</label>
                <select
                  value={form.defaultFrontendMode}
                  onChange={(e) => setForm({ ...form, defaultFrontendMode: e.target.value as FrontendMode })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="TEACHER_STUDENT">Giáo viên &amp; Học sinh (Mặc định khuyến nghị)</option>
                  <option value="PARENT">Phụ huynh</option>
                  <option value="NEW_CUSTOMER">Khách hàng mới</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Khẩu hiệu (Slogan)</label>
                <input
                  type="text"
                  value={form.slogan}
                  onChange={(e) => setForm({ ...form, slogan: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hotline / Zalo tư vấn</label>
                <input
                  type="text"
                  value={form.hotlineZalo}
                  onChange={(e) => setForm({ ...form, hotlineZalo: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cơ sở 1</label>
                <input
                  type="text"
                  value={form.campus1}
                  onChange={(e) => setForm({ ...form, campus1: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cơ sở 2</label>
                <input
                  type="text"
                  value={form.campus2}
                  onChange={(e) => setForm({ ...form, campus2: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Đường dẫn Fanpage Facebook chính thức</label>
                <input
                  type="url"
                  value={form.facebookUrl || ''}
                  onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })}
                  placeholder="https://www.facebook.com/..."
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.showAnnouncement}
                  onChange={(e) => setForm({ ...form, showAnnouncement: e.target.checked })}
                />
                <span>Hiển thị thanh thông báo nổi bật trên cùng website</span>
              </label>
              <input
                type="text"
                value={form.announcementBanner}
                onChange={(e) => setForm({ ...form, announcementBanner: e.target.value })}
                placeholder="Nội dung thanh thông báo..."
                className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid lg:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-blue-950">1. Giao diện Giáo viên &amp; Học sinh</p>
                <input
                  type="text"
                  value={form.heroTitleTeacherStudent}
                  onChange={(e) => setForm({ ...form, heroTitleTeacherStudent: e.target.value })}
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <textarea
                  rows={3}
                  value={form.heroSubtitleTeacherStudent}
                  onChange={(e) => setForm({ ...form, heroSubtitleTeacherStudent: e.target.value })}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-blue-950">2. Giao diện Phụ huynh</p>
                <input
                  type="text"
                  value={form.heroTitleParent}
                  onChange={(e) => setForm({ ...form, heroTitleParent: e.target.value })}
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <textarea
                  rows={3}
                  value={form.heroSubtitleParent}
                  onChange={(e) => setForm({ ...form, heroSubtitleParent: e.target.value })}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-blue-950">3. Giao diện Khách hàng mới</p>
                <input
                  type="text"
                  value={form.heroTitleCustomer}
                  onChange={(e) => setForm({ ...form, heroTitleCustomer: e.target.value })}
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <textarea
                  rows={3}
                  value={form.heroSubtitleCustomer}
                  onChange={(e) => setForm({ ...form, heroSubtitleCustomer: e.target.value })}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Hero Image Picker from Real Uploaded Center Photos */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">Ảnh đại diện chính (chọn từ ảnh thật Trung tâm)</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {bootstrap.gallery.map((photo) => {
                  const selected = form.heroImageUrl === photo.url;
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setForm({ ...form, heroImageUrl: photo.url, heroCaption: photo.caption })}
                      className={`rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                        selected ? 'border-blue-900' : 'border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={photo.url} alt={photo.title} className="w-full h-14 object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          </form>

          {/* Course Packages Live Price Editor */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Quản lý Khóa học &amp; Biểu phí Cấp 1 – 2 – 3</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cập nhật tên gói, học phí hàng tháng, phụ thu bán trú &amp; đưa rước — tự động áp dụng lên Dự toán học phí.
              </p>
            </div>
            <div className="grid lg:grid-cols-3 gap-4">
              {courseDrafts.map((c, idx) => (
                <div key={c.id} className="p-4 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-blue-900">{c.grades}</p>
                  <input
                    type="text"
                    value={c.title}
                    onChange={(e) => {
                      const next = [...courseDrafts];
                      next[idx] = { ...c, title: e.target.value };
                      setCourseDrafts(next);
                    }}
                    className="w-full h-9 px-2.5 text-xs font-semibold border border-slate-300 rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Học phí/tháng (VNĐ)</label>
                      <input
                        type="number"
                        value={c.monthlyPrice}
                        onChange={(e) => {
                          const next = [...courseDrafts];
                          next[idx] = { ...c, monthlyPrice: Number(e.target.value) || 0 };
                          setCourseDrafts(next);
                        }}
                        className="w-full h-8 px-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Bán trú (VNĐ)</label>
                      <input
                        type="number"
                        value={c.boardingAddonPrice || 0}
                        onChange={(e) => {
                          const next = [...courseDrafts];
                          next[idx] = { ...c, boardingAddonPrice: Number(e.target.value) || 0 };
                          setCourseDrafts(next);
                        }}
                        className="w-full h-8 px-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="font-mono-num text-xs font-bold text-slate-700">
                      {formatVnd(c.monthlyPrice)}
                    </span>
                    <button
                      type="button"
                      disabled={savingCourseId === c.id}
                      onClick={() => handleSaveCourse(c)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      {savingCourseId === c.id ? 'Đang lưu...' : 'Lưu khóa học'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOMAIN, SEO, PAYMENT & SYSTEM (SuperAdmin ONLY) */}
      {subTab === 'system' && (
        <div className="space-y-6">
          {!isSuperAdmin && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Phân khu cấu hình tên miền, SEO, tài khoản nhận học phí và bật/tắt mô-đun chỉ dành riêng cho{' '}
                <strong>SuperAdmin ({SUPER_ADMIN_EMAIL})</strong>. Tài khoản Admin ({ADMIN_EMAIL}) có quyền xem thông số.
              </span>
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-950">Cấu hình Tên miền chính thức &amp; SEO</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tên miền triển khai chính thức: <strong className="font-mono-num text-blue-900">https://{form.domain}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={syncingSeed}
                  onClick={handleSyncSeed}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{syncingSeed ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu mẫu lên Firestore'}</span>
                </button>
                {isSuperAdmin && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu cấu hình hệ thống</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên miền chính thức</label>
                <input
                  disabled={!isSuperAdmin}
                  type="text"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ưu đãi đóng trọn năm (%)</label>
                <input
                  disabled={!isSuperAdmin}
                  type="number"
                  min={0}
                  max={50}
                  value={form.annualDiscountPercent}
                  onChange={(e) => setForm({ ...form, annualDiscountPercent: Number(e.target.value) || 0 })}
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu đề SEO (Title Tag)</label>
                <input
                  disabled={!isSuperAdmin}
                  type="text"
                  value={form.seoTitle}
                  onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả SEO (Meta Description)</label>
                <textarea
                  disabled={!isSuperAdmin}
                  rows={2}
                  value={form.seoDescription}
                  onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                  className="w-full p-2.5 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-sm font-bold text-slate-950">Tài khoản Ngân hàng VietQR &amp; Ví điện tử</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ngân hàng</label>
                  <input
                    disabled={!isSuperAdmin}
                    type="text"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số tài khoản</label>
                  <input
                    disabled={!isSuperAdmin}
                    type="text"
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên chủ tài khoản</label>
                  <input
                    disabled={!isSuperAdmin}
                    type="text"
                    value={form.bankOwner}
                    onChange={(e) => setForm({ ...form, bankOwner: e.target.value })}
                    className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Số ví MoMo / ZaloPay</label>
                  <input
                    disabled={!isSuperAdmin}
                    type="text"
                    value={form.momoPhone}
                    onChange={(e) => setForm({ ...form, momoPhone: e.target.value })}
                    className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <h3 className="text-sm font-bold text-slate-950">Công tắc bật / tắt tính năng Frontend</h3>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                  <input
                    disabled={!isSuperAdmin}
                    type="checkbox"
                    checked={form.enableAiAdvisor}
                    onChange={(e) => setForm({ ...form, enableAiAdvisor: e.target.checked })}
                  />
                  <span>Trợ lý AI Tư vấn 24/7</span>
                </label>
                <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                  <input
                    disabled={!isSuperAdmin}
                    type="checkbox"
                    checked={form.enableOnlineExams}
                    onChange={(e) => setForm({ ...form, enableOnlineExams: e.target.checked })}
                  />
                  <span>Kho đề thi GDPT 2018</span>
                </label>
                <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                  <input
                    disabled={!isSuperAdmin}
                    type="checkbox"
                    checked={form.enableOnlinePayment}
                    onChange={(e) => setForm({ ...form, enableOnlinePayment: e.target.checked })}
                  />
                  <span>Thanh toán học phí QR</span>
                </label>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: GMAIL RBAC MANAGEMENT (SuperAdmin ONLY) */}
      {subTab === 'rbac' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wider">SuperAdmin Hệ thống (Gốc)</p>
              <p className="font-mono-num text-sm font-bold text-slate-950">{SUPER_ADMIN_EMAIL}</p>
              <p className="text-xs text-slate-600">
                Toàn quyền tên miền daythemnhantri.com, SEO, tài khoản ngân hàng, cấp/thu hồi quyền và chỉnh sửa CMS 1-Click.
              </p>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Admin Vận hành (Gốc)</p>
              <p className="font-mono-num text-sm font-bold text-slate-950">{ADMIN_EMAIL}</p>
              <p className="text-xs text-slate-600">
                Quản lý vận hành học vụ, khóa học, thời khóa biểu, học sinh, điểm số, thu chi và sửa nội dung 1-Click.
              </p>
            </div>
          </div>

          {isSuperAdmin && currentUser.authProvider === 'GOOGLE_FIREBASE' ? (
            <>
              <form onSubmit={handleCreateInvite} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-900" />
                  <span>Cấp quyền trước theo địa chỉ Gmail (Role Invite)</span>
                </h2>
                <div className="grid sm:grid-cols-4 gap-3">
                  <input
                    required
                    type="email"
                    value={newInvite.email}
                    onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                    placeholder="giaovien@gmail.com *"
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg"
                  />
                  <select
                    value={newInvite.role}
                    onChange={(e) =>
                      setNewInvite({ ...newInvite, role: e.target.value as Exclude<UserRole, 'SUPER_ADMIN'> })
                    }
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="ADMIN">Admin Vận hành</option>
                    <option value="TEACHER">Giáo viên</option>
                    <option value="PARENT">Phụ huynh</option>
                    <option value="STUDENT">Học sinh</option>
                  </select>
                  <input
                    type="text"
                    value={newInvite.displayName}
                    onChange={(e) => setNewInvite({ ...newInvite, displayName: e.target.value })}
                    placeholder="Tên hiển thị (tùy chọn)"
                    className="h-9 px-3 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="h-9 px-4 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    Lưu phân quyền Gmail
                  </button>
                </div>

                {invitesList.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 divide-y divide-slate-100">
                    {invitesList.map((inv) => (
                      <div key={inv.email} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                        <div>
                          <span className="font-mono-num font-semibold text-slate-950">{inv.email}</span>
                          <span className="ml-2 text-blue-900 font-semibold">{roleLabel(inv.role, 'vi')}</span>
                          {inv.displayName && <span className="ml-2 text-slate-500">· {inv.displayName}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteRoleInvite(inv.email)}
                          className="text-red-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Thu hồi</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-900" />
                  <span>Tài khoản Gmail đã đăng nhập trên hệ thống ({usersList.length})</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Gmail</th>
                        <th className="py-2 pr-4 font-semibold">Họ tên</th>
                        <th className="py-2 pr-4 font-semibold">Vai trò hiện tại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usersList.map((u) => (
                        <tr key={u.uid}>
                          <td className="py-2.5 pr-4 font-mono-num text-slate-900">{u.email}</td>
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{u.displayName}</td>
                          <td className="py-2.5 pr-4">
                            <select
                              disabled={u.email === SUPER_ADMIN_EMAIL}
                              value={u.role}
                              onChange={(e) => updateUserProfileRole(u.uid, e.target.value as UserRole)}
                              className="h-8 px-2.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                            >
                              <option value="SUPER_ADMIN">SuperAdmin</option>
                              <option value="ADMIN">Admin Vận hành</option>
                              <option value="TEACHER">Giáo viên</option>
                              <option value="PARENT">Phụ huynh</option>
                              <option value="STUDENT">Học sinh</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
              Đăng nhập bằng tài khoản Gmail <strong>{SUPER_ADMIN_EMAIL}</strong> để quản lý danh sách người dùng và cấp quyền trực tiếp trên Cloud Firestore.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
