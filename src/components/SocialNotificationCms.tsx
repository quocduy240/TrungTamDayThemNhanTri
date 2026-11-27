import React, { useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  Facebook,
  Globe,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Video,
  Webhook,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  AuthUser,
  EditorialArticle,
  NotificationSystemConfig,
  PromoBanner,
  ReminderDispatchLog,
  ReusableContentBlock,
  SocialActivityPost,
  SocialChannelConfig,
  SocialMediaType,
  SocialPlatform,
  TimetableSlot,
} from '../types';
import { RichArticleBlocksStudio } from './RichArticleBlocksStudio';
import { PromoBannerStudio } from './PromoBannerStudio';

interface SocialNotificationCmsProps {
  user: AuthUser;
  channels: SocialChannelConfig[];
  posts: SocialActivityPost[];
  editorialArticles?: EditorialArticle[];
  reusableBlocks?: ReusableContentBlock[];
  promoBanners?: PromoBanner[];
  notificationConfig?: NotificationSystemConfig;
  dispatchLogs: ReminderDispatchLog[];
  timetable: TimetableSlot[];
  onRefresh: () => Promise<void>;
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  FACEBOOK: 'Facebook',
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  ZALO: 'Zalo OA',
};

export const SocialNotificationCms: React.FC<SocialNotificationCmsProps> = ({
  user,
  channels,
  posts,
  editorialArticles = [],
  reusableBlocks = [],
  promoBanners = [],
  notificationConfig,
  dispatchLogs,
  timetable,
  onRefresh,
}) => {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const [subTab, setSubTab] = useState<'ARTICLES' | 'BANNERS' | 'SOCIAL' | 'REMINDERS'>('ARTICLES');

  // Channel editing state
  const [editingChannels, setEditingChannels] = useState<Record<string, SocialChannelConfig>>(() =>
    Object.fromEntries(channels.map((c) => [c.id, { ...c }])),
  );
  const [savingChanId, setSavingChanId] = useState<string | null>(null);
  const [syncingYt, setSyncingYt] = useState(false);

  // Smart Link Importer form state
  const [importUrl, setImportUrl] = useState('');
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftExcerpt, setDraftExcerpt] = useState('');
  const [draftThumb, setDraftThumb] = useState('');
  const [draftEmbed, setDraftEmbed] = useState('');
  const [draftPlatform, setDraftPlatform] = useState<SocialPlatform>('FACEBOOK');
  const [draftMediaType, setDraftMediaType] = useState<SocialMediaType>('PHOTO');
  const [draftCategory, setDraftCategory] = useState('Hoạt động lớp học');
  const [draftFeatured, setDraftFeatured] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);

  // Notification Config state
  const [cfg, setCfg] = useState<NotificationSystemConfig>(
    notificationConfig || {
      id: 'default',
      enabled: true,
      leadMinutes: 10,
      channelsEnabled: { WEB: true, ZALO: true, EMAIL: true, FACEBOOK: true },
      zaloOaId: '',
      zaloWebhookUrl: '',
      emailWebhookUrl: '',
      facebookWebhookUrl: '',
      unifiedWebhookUrl: '',
      messageTemplate:
        '[Nhân Trí] Còn {{minutes}} phút tới giờ {{subject}} ({{timeRange}}) tại {{room}} · {{className}} · GV: {{teacher}}.',
      updatedAt: '',
    },
  );
  const [savingCfg, setSavingCfg] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [selectedTestSlotId, setSelectedTestSlotId] = useState('');

  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 5000);
  };

  const handleSaveChannel = async (id: string) => {
    const ch = editingChannels[id];
    if (!ch) return;
    setSavingChanId(id);
    try {
      await apiRequest(`/api/v1/social/channels/${id}`, {
        method: 'PUT',
        body: JSON.stringify(ch),
      });
      await onRefresh();
      showMsg('ok', `Đã lưu cấu hình kênh ${ch.label}.`);
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Không thể lưu kênh MXH.');
    } finally {
      setSavingChanId(null);
    }
  };

  const handleSyncYouTube = async () => {
    const ytCh = Object.values(editingChannels).find((c) => c.platform === 'YOUTUBE');
    setSyncingYt(true);
    try {
      const res = await apiRequest<{ addedCount: number }>('/api/v1/social/sync-youtube', {
        method: 'POST',
        body: JSON.stringify({ youtubeChannelId: ytCh?.youtubeChannelId || '' }),
      });
      await onRefresh();
      showMsg(
        'ok',
        res.addedCount > 0
          ? `Đã đồng bộ thêm ${res.addedCount} video YouTube mới nhất vào Thư viện!`
          : 'Kênh YouTube đã đồng bộ xong (chưa có video mới hơn).',
      );
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Đồng bộ YouTube RSS thất bại.');
    } finally {
      setSyncingYt(false);
    }
  };

  const handleFetchMetadata = async () => {
    if (!importUrl.trim()) {
      showMsg('err', 'Vui lòng dán đường dẫn bài viết/video (Facebook, YouTube, TikTok hoặc Zalo).');
      return;
    }
    setFetchingMeta(true);
    try {
      const res = await apiRequest<{
        metadata: {
          platform: SocialPlatform;
          mediaType: SocialMediaType;
          title: string;
          excerpt: string;
          thumbnailUrl: string;
          sourceUrl: string;
          embedUrl?: string;
        };
      }>('/api/v1/social/fetch-metadata', {
        method: 'POST',
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const m = res.metadata;
      setDraftPlatform(m.platform);
      setDraftMediaType(m.mediaType);
      setDraftTitle(m.title);
      setDraftExcerpt(m.excerpt);
      setDraftThumb(m.thumbnailUrl);
      setDraftEmbed(m.embedUrl || '');
      showMsg('ok', `Đã tự động trích xuất thông tin từ ${PLATFORM_LABELS[m.platform]}!`);
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Không thể đọc metadata từ liên kết này.');
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingPost(true);
    try {
      await apiRequest('/api/v1/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          title: draftTitle,
          excerpt: draftExcerpt,
          thumbnailUrl: draftThumb,
          sourceUrl: importUrl,
          embedUrl: draftEmbed || undefined,
          platform: draftPlatform,
          mediaType: draftMediaType,
          category: draftCategory,
          featured: draftFeatured,
          visible: true,
        }),
      });
      setImportUrl('');
      setDraftTitle('');
      setDraftExcerpt('');
      setDraftThumb('');
      setDraftEmbed('');
      setDraftFeatured(false);
      await onRefresh();
      showMsg('ok', 'Đã đăng bài mới lên chuyên mục Hoạt động Trung Tâm Nhân Trí!');
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Không thể tạo bài viết.');
    } finally {
      setCreatingPost(false);
    }
  };

  const handleTogglePostField = async (post: SocialActivityPost, field: 'featured' | 'visible') => {
    try {
      await apiRequest(`/api/v1/social/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: !post[field] }),
      });
      await onRefresh();
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Cập nhật bài viết thất bại.');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await apiRequest(`/api/v1/social/posts/${postId}`, { method: 'DELETE' });
      await onRefresh();
      showMsg('ok', 'Đã xóa bài viết khỏi thư viện.');
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Không thể xóa bài viết.');
    }
  };

  const handleSaveNotifConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await apiRequest('/api/v1/system/notification-config', {
        method: 'PATCH',
        body: JSON.stringify(cfg),
      });
      await onRefresh();
      showMsg('ok', 'Đã lưu cấu hình Nhắc lịch 10 phút & Webhook đa kênh.');
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Không thể lưu cấu hình nhắc lịch.');
    } finally {
      setSavingCfg(false);
    }
  };

  const handleManualDispatch = async () => {
    setDispatching(true);
    try {
      const res = await apiRequest<{ matchedSlotsCount: number; dispatchedCount: number }>(
        '/api/v1/notifications/dispatch-upcoming',
        {
          method: 'POST',
          body: JSON.stringify({
            forceSlotId: selectedTestSlotId || undefined,
          }),
        },
      );
      await onRefresh();
      showMsg(
        'ok',
        `Đã quét ${res.matchedSlotsCount} ca học và phát ${res.dispatchedCount} lượt thông báo nhắc lịch!`,
      );
    } catch (err: unknown) {
      showMsg('err', err instanceof Error ? err.message : 'Quét gửi nhắc lịch thất bại.');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-tab Navigation */}
      <div className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 p-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Trung tâm Nội dung, Bài viết Google Docs, Banner Quảng cáo &amp; Truyền thông
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Soạn bài viết chuẩn Google Docs + chèn 5 Block tĩnh tại con trỏ, thiết kế Banner từ 10 mẫu trực quan, kết nối Google Drive cá nhân, đồng bộ 4 kênh MXH &amp; nhắc lịch 10 phút.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('ARTICLES')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'ARTICLES'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
            }`}
          >
            Bài viết &amp; Block tĩnh ({editorialArticles.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('BANNERS')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'BANNERS'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
            }`}
          >
            Banner Quảng cáo · 10 Mẫu ({promoBanners.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('SOCIAL')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'SOCIAL'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
            }`}
          >
            Mạng xã hội &amp; Thư viện ({posts.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('REMINDERS')}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'REMINDERS'
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
            }`}
          >
            Nhắc lịch 10 phút &amp; Webhook
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {banner.text}
        </div>
      )}

      {subTab === 'ARTICLES' ? (
        <RichArticleBlocksStudio
          user={user}
          articles={editorialArticles}
          reusableBlocks={reusableBlocks}
          onRefresh={onRefresh}
        />
      ) : subTab === 'BANNERS' ? (
        <PromoBannerStudio banners={promoBanners} onRefresh={onRefresh} />
      ) : subTab === 'SOCIAL' ? (
        <div className="space-y-6">
          {/* 1. 4 Official Channels Configuration */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  1. Kênh Mạng xã hội chính thức (Zalo · TikTok · YouTube · Facebook)
                </h3>
                <p className="text-xs text-slate-500">
                  Cấu hình đường dẫn và bật YouTube Channel ID (bắt đầu bằng UC...) để tự động lấy video mới nhất.
                </p>
              </div>
              <button
                type="button"
                disabled={syncingYt}
                onClick={handleSyncYouTube}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {syncingYt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Đồng bộ YouTube RSS mới nhất
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {channels.map((orig) => {
                const ch = editingChannels[orig.id] || orig;
                return (
                  <div
                    key={orig.id}
                    className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                        {ch.platform === 'FACEBOOK' && <Facebook className="w-4 h-4 text-[#1877F2]" />}
                        {ch.platform === 'YOUTUBE' && <Tv className="w-4 h-4 text-red-600" />}
                        {ch.platform === 'TIKTOK' && <Video className="w-4 h-4 text-slate-900" />}
                        {ch.platform === 'ZALO' && <MessageCircle className="w-4 h-4 text-[#0068FF]" />}
                        <span>{PLATFORM_LABELS[ch.platform]}</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ch.active}
                          onChange={(e) =>
                            setEditingChannels((prev) => ({
                              ...prev,
                              [orig.id]: { ...ch, active: e.target.checked },
                            }))
                          }
                        />
                        Hiển thị
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={ch.label}
                        onChange={(e) =>
                          setEditingChannels((prev) => ({
                            ...prev,
                            [orig.id]: { ...ch, label: e.target.value },
                          }))
                        }
                        placeholder="Tên kênh hiển thị"
                        className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs"
                      />
                      <input
                        type="text"
                        value={ch.handle}
                        onChange={(e) =>
                          setEditingChannels((prev) => ({
                            ...prev,
                            [orig.id]: { ...ch, handle: e.target.value },
                          }))
                        }
                        placeholder="@handle hoặc SĐT Zalo"
                        className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs"
                      />
                    </div>

                    <input
                      type="url"
                      value={ch.url}
                      onChange={(e) =>
                        setEditingChannels((prev) => ({
                          ...prev,
                          [orig.id]: { ...ch, url: e.target.value },
                        }))
                      }
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono"
                    />

                    {ch.platform === 'YOUTUBE' && (
                      <input
                        type="text"
                        value={ch.youtubeChannelId || ''}
                        onChange={(e) =>
                          setEditingChannels((prev) => ({
                            ...prev,
                            [orig.id]: { ...ch, youtubeChannelId: e.target.value },
                          }))
                        }
                        placeholder="YouTube Channel ID (VD: UCxxxxxxxxxxxxxxxxxxxxxx) để đồng bộ RSS"
                        className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono"
                      />
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400">
                        {ch.lastSyncedAt ? `Đồng bộ cuối: ${ch.lastSyncedAt}` : 'Sẵn sàng kết nối'}
                      </span>
                      <button
                        type="button"
                        disabled={savingChanId === orig.id}
                        onClick={() => handleSaveChannel(orig.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition-colors"
                      >
                        {savingChanId === orig.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Lưu kênh
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Smart Link Importer */}
          <form
            onSubmit={handleCreatePost}
            className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  2. Thêm bài thông minh vào "Hoạt động Trung Tâm Nhân Trí"
                </h3>
                <p className="text-xs text-slate-500">
                  Dán liên kết YouTube, TikTok, Facebook hoặc Zalo — hệ thống tự lấy tiêu đề, ảnh đại diện và khung phát video.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  required
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Dán link YouTube / TikTok / Facebook / Zalo (https://...)"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
              <button
                type="button"
                disabled={fetchingMeta}
                onClick={handleFetchMetadata}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {fetchingMeta ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Tự lấy ảnh & tiêu đề
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Tiêu đề bài viết / video *"
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={draftPlatform}
                  onChange={(e) => setDraftPlatform(e.target.value as SocialPlatform)}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="FACEBOOK">Facebook</option>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="TIKTOK">TikTok</option>
                  <option value="ZALO">Zalo OA</option>
                </select>
                <select
                  value={draftMediaType}
                  onChange={(e) => setDraftMediaType(e.target.value as SocialMediaType)}
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="PHOTO">Hình ảnh</option>
                  <option value="VIDEO">Video</option>
                  <option value="POST">Bài viết</option>
                </select>
                <input
                  type="text"
                  value={draftCategory}
                  onChange={(e) => setDraftCategory(e.target.value)}
                  placeholder="Chuyên mục"
                  className="px-2.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <textarea
              rows={2}
              value={draftExcerpt}
              onChange={(e) => setDraftExcerpt(e.target.value)}
              placeholder="Mô tả ngắn hiển thị trong Thư viện hoạt động..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <input
                type="text"
                value={draftThumb}
                onChange={(e) => setDraftThumb(e.target.value)}
                placeholder="URL ảnh đại diện (tự điền hoặc bỏ trống dùng ảnh trung tâm)"
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftFeatured}
                    onChange={(e) => setDraftFeatured(e.target.checked)}
                  />
                  Ghim Nổi bật (Spotlight đầu trang)
                </label>

                <button
                  type="submit"
                  disabled={creatingPost}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  {creatingPost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Đăng vào Thư viện
                </button>
              </div>
            </div>
          </form>

          {/* 3. Posts Management Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                3. Thư viện bài viết hiện có ({posts.length})
              </h3>
              <span className="text-xs text-slate-500">
                Bấm ngôi sao để ghim Nổi bật · Bấm con mắt để ẩn/hiện trên trang chủ
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {posts.map((p) => (
                <div
                  key={p.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={p.thumbnailUrl}
                      alt={p.title}
                      className="w-20 h-12 rounded-lg object-cover bg-slate-100 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-semibold">
                        <span className="text-[#1E3A8A]">{PLATFORM_LABELS[p.platform]}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-700">{p.category}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {p.viewCount.toLocaleString('vi-VN')} lượt xem
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{p.title}</p>
                      <p className="text-xs text-slate-400 tabular-nums">{p.publishedAt}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePostField(p, 'featured')}
                      title={p.featured ? 'Bỏ ghim Nổi bật' : 'Ghim Nổi bật'}
                      className={`p-2 rounded-lg border transition-colors ${
                        p.featured
                          ? 'bg-amber-50 border-amber-300 text-amber-600'
                          : 'bg-white border-slate-200 text-slate-400 hover:text-amber-600'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${p.featured ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePostField(p, 'visible')}
                      title={p.visible ? 'Đang hiển thị — bấm để ẩn' : 'Đang ẩn — bấm để hiện'}
                      className={`p-2 rounded-lg border transition-colors ${
                        p.visible
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}
                    >
                      {p.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePost(p.id)}
                      title="Xóa bài viết"
                      className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Admin 10-Minute Reminder & Webhook Config */}
          <form
            onSubmit={handleSaveNotifConfig}
            className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Webhook className="w-5 h-5 text-[#1E3A8A]" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cấu hình API / Webhook gửi nhắc lịch trước giờ vào lớp
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAdmin
                      ? 'Gắn Webhook HTTPS (Zalo OA / Brevo / Resend / Facebook Messenger / n8n / Make) để phát tin tự động trước ca học.'
                      : 'Chỉ Admin & SuperAdmin được chỉnh sửa URL Webhook. Quản lý có thể kích hoạt quét nhắc lịch bên dưới.'}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="submit"
                  disabled={savingCfg}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition-colors whitespace-nowrap"
                >
                  {savingCfg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu cấu hình nhắc lịch
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700">
                  Thời gian nhắc mặc định trước ca học (phút)
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  disabled={!isAdmin}
                  value={cfg.leadMinutes}
                  onChange={(e) => setCfg({ ...cfg, leadMinutes: Number(e.target.value) || 10 })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-mono tabular-nums disabled:opacity-60"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-700">Kênh phát tin toàn hệ thống</p>
                <div className="flex flex-wrap gap-3 pt-1">
                  {(
                    [
                      { key: 'WEB', label: 'Web/App', icon: Globe },
                      { key: 'ZALO', label: 'Zalo', icon: MessageCircle },
                      { key: 'EMAIL', label: 'Email', icon: Mail },
                      { key: 'FACEBOOK', label: 'Facebook', icon: Facebook },
                    ] as const
                  ).map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={cfg.channelsEnabled[key]}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            channelsEnabled: {
                              ...cfg.channelsEnabled,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      <Icon className="w-3.5 h-3.5 text-[#1E3A8A]" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Zalo OA / ZNS Webhook URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    value={cfg.zaloWebhookUrl || ''}
                    onChange={(e) => setCfg({ ...cfg, zaloWebhookUrl: e.target.value })}
                    placeholder="https://hook.your-gateway.com/zalo-zns"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Email Webhook URL (Brevo / Resend / n8n)
                  </label>
                  <input
                    type="url"
                    value={cfg.emailWebhookUrl || ''}
                    onChange={(e) => setCfg({ ...cfg, emailWebhookUrl: e.target.value })}
                    placeholder="https://hook.your-gateway.com/email"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Facebook Messenger Webhook URL
                  </label>
                  <input
                    type="url"
                    value={cfg.facebookWebhookUrl || ''}
                    onChange={(e) => setCfg({ ...cfg, facebookWebhookUrl: e.target.value })}
                    placeholder="https://hook.your-gateway.com/facebook-messenger"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Unified Webhook dự phòng (n8n / Make / Zapier)
                  </label>
                  <input
                    type="url"
                    value={cfg.unifiedWebhookUrl || ''}
                    onChange={(e) => setCfg({ ...cfg, unifiedWebhookUrl: e.target.value })}
                    placeholder="https://n8n.daythemnhantri.com/webhook/pre-class"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Mẫu nội dung tin nhắn nhắc lịch (biến hỗ trợ:{' '}
                <code className="text-[11px] text-[#1E3A8A]">
                  {'{{minutes}} {{subject}} {{timeRange}} {{room}} {{className}} {{teacher}}'}
                </code>
                )
              </label>
              <textarea
                rows={2}
                disabled={!isAdmin}
                value={cfg.messageTemplate}
                onChange={(e) => setCfg({ ...cfg, messageTemplate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs disabled:opacity-60"
              />
            </div>
          </form>

          {/* 2. Manual Dispatch Trigger */}
          <div className="bg-gradient-to-r from-amber-50/80 via-white to-blue-50/50 rounded-2xl border border-amber-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <BellRing className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Quét & Phát tin nhắc lịch thủ công (hoặc kiểm thử ca học)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Chọn 1 ca học cụ thể để gửi nhắc ngay cho giáo viên và học sinh lớp đó, hoặc để trống để tự quét ca sắp học trong {cfg.leadMinutes} phút tới.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={selectedTestSlotId}
                onChange={(e) => setSelectedTestSlotId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs max-w-[240px]"
              >
                <option value="">Tự quét ca trong {cfg.leadMinutes} phút tới</option>
                {timetable.slice(0, 12).map((sl) => (
                  <option key={sl.id} value={sl.id}>
                    {sl.day} · {sl.timeRange} · {sl.centerClass} ({sl.room})
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={dispatching}
                onClick={handleManualDispatch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {dispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Quét & Gửi nhắc ngay
              </button>
            </div>
          </div>

          {/* 3. Dispatch Audit Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Nhật ký phát tin nhắc lịch ({dispatchLogs.length})
              </h3>
            </div>

            {dispatchLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Chưa có lượt phát tin nào được ghi nhận.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Thời gian</th>
                      <th className="px-4 py-3 font-semibold">Ca học / Phòng</th>
                      <th className="px-4 py-3 font-semibold">Người nhận</th>
                      <th className="px-4 py-3 font-semibold">Kênh</th>
                      <th className="px-4 py-3 font-semibold">Trạng thái</th>
                      <th className="px-4 py-3 font-semibold">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatchLogs.slice(0, 30).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                          {log.sentAt}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{log.slotLabel}</td>
                        <td className="px-4 py-3 text-slate-700">{log.recipientName}</td>
                        <td className="px-4 py-3 font-bold text-[#1E3A8A]">{log.channel}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              log.status === 'SENT'
                                ? 'bg-emerald-50 text-emerald-700'
                                : log.status === 'SIMULATED'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
