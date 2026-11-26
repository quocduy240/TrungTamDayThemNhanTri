import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Eye,
  Facebook,
  Flame,
  MessageCircle,
  Play,
  Sparkles,
  Tv,
  Video,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { SocialActivityPost, SocialChannelConfig, SocialPlatform } from '../types';
import { ShareMenu } from './ShareMenu';

interface SocialActivityLibraryProps {
  channels: SocialChannelConfig[];
  posts: SocialActivityPost[];
  onPostViewed?: (postId: string, newCount: number) => void;
}

type SortFilter = 'ALL' | 'FEATURED' | 'LATEST' | 'MOST_VIEWED';

const PLATFORM_META: Record<
  SocialPlatform,
  { label: string; color: string; bg: string; border: string }
> = {
  FACEBOOK: {
    label: 'Facebook',
    color: 'text-[#1877F2]',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  YOUTUBE: {
    label: 'YouTube',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  TIKTOK: {
    label: 'TikTok',
    color: 'text-slate-900',
    bg: 'bg-slate-100',
    border: 'border-slate-300',
  },
  ZALO: {
    label: 'Zalo OA',
    color: 'text-[#0068FF]',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
  },
};

function renderPlatformIcon(platform: SocialPlatform, className = 'w-4 h-4') {
  if (platform === 'FACEBOOK') return <Facebook className={className} />;
  if (platform === 'YOUTUBE') return <Tv className={className} />;
  if (platform === 'TIKTOK') return <Video className={className} />;
  return <MessageCircle className={className} />;
}

function buildDeepLink(postId: string): string {
  if (typeof window === 'undefined') return `https://daythemnhantri.com/?activity=${postId}`;
  const u = new URL(window.location.href);
  u.searchParams.set('activity', postId);
  return u.toString();
}

export const SocialActivityLibrary: React.FC<SocialActivityLibraryProps> = ({
  channels,
  posts,
  onPostViewed,
}) => {
  const [sortFilter, setSortFilter] = useState<SortFilter>('ALL');
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | 'ALL'>('ALL');
  const [activePost, setActivePost] = useState<SocialActivityPost | null>(null);
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const viewedSetRef = useRef<Set<string>>(new Set());

  const visiblePosts = useMemo(
    () =>
      posts
        .filter((p) => p.visible !== false)
        .map((p) => ({
          ...p,
          viewCount: localViews[p.id] ?? p.viewCount ?? 0,
        })),
    [posts, localViews],
  );

  // Auto-open lightbox when URL contains ?activity=<id>
  useEffect(() => {
    if (typeof window === 'undefined' || visiblePosts.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get('activity');
    if (activityId) {
      const matched = visiblePosts.find((p) => p.id === activityId);
      if (matched) setActivePost(matched);
    }
  }, [visiblePosts]);

  // Increment real view counter when opening a post
  const openPost = (post: SocialActivityPost) => {
    setActivePost(post);
    if (!viewedSetRef.current.has(post.id)) {
      viewedSetRef.current.add(post.id);
      apiRequest<{ id: string; viewCount: number }>(`/api/v1/social/posts/${post.id}/view`, {
        method: 'POST',
      })
        .then((res) => {
          setLocalViews((prev) => ({ ...prev, [post.id]: res.viewCount }));
          onPostViewed?.(post.id, res.viewCount);
        })
        .catch(() => {
          // Non-blocking
        });
    }
  };

  useEffect(() => {
    if (!activePost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePost(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePost]);

  const filteredPosts = useMemo(() => {
    let list = visiblePosts;
    if (platformFilter !== 'ALL') {
      list = list.filter((p) => p.platform === platformFilter);
    }
    if (sortFilter === 'FEATURED') {
      list = list.filter((p) => p.featured);
    } else if (sortFilter === 'LATEST') {
      list = [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    } else if (sortFilter === 'MOST_VIEWED') {
      list = [...list].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else {
      // ALL: Spotlight featured first, then newest
      list = [...list].sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return b.publishedAt.localeCompare(a.publishedAt);
      });
    }
    return list;
  }, [visiblePosts, sortFilter, platformFilter]);

  const spotlightPost = filteredPosts[0] || null;
  const secondaryPosts = filteredPosts.slice(1);

  return (
    <section
      id="hoat-dong-nhan-tri"
      className="rounded-3xl bg-gradient-to-b from-amber-50/40 via-white to-white border border-slate-200/90 p-6 sm:p-8 space-y-6"
    >
      {/* Editorial Section Header + Official 4-Channel Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-5 border-b border-slate-200/80">
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Thư viện truyền thông đa kênh
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Hoạt động Trung Tâm Nhân Trí
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            Cập nhật liên tục hình ảnh lớp học thực tế, video chữa đề, tuyên dương học sinh giỏi và thông báo mới nhất từ các kênh chính thức.
          </p>
        </div>

        {/* Official Social Channels Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {channels
            .filter((c) => c.active)
            .map((ch) => {
              const meta = PLATFORM_META[ch.platform];
              return (
                <a
                  key={ch.id}
                  href={ch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#1E3A8A]/40 hover:shadow-xs text-xs font-semibold text-slate-700 transition-all whitespace-nowrap"
                >
                  <span className={meta.color}>{renderPlatformIcon(ch.platform, 'w-4 h-4')}</span>
                  <span>{meta.label}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              );
            })}
        </div>
      </div>

      {/* Interactive Filter & Sort Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Tất cả' },
              { id: 'FEATURED', label: 'Nổi bật' },
              { id: 'LATEST', label: 'Mới nhất' },
              { id: 'MOST_VIEWED', label: 'Xem nhiều nhất' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSortFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                sortFilter === tab.id
                  ? 'bg-[#1E3A8A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-[#1E3A8A]'
              }`}
            >
              {tab.id === 'MOST_VIEWED' && <Flame className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-amber-400" />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'ZALO'] as const).map((pf) => (
            <button
              key={pf}
              type="button"
              onClick={() => setPlatformFilter(pf)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                platformFilter === pf
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pf === 'ALL' ? 'Mọi kênh' : PLATFORM_META[pf].label}
            </button>
          ))}
        </div>
      </div>

      {/* Editorial Bento Layout */}
      {filteredPosts.length === 0 ? (
        <div className="py-12 text-center rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-500">
          Chưa có bài viết nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Spotlight Hero Card */}
          {spotlightPost && (
            <article
              onClick={() => openPost(spotlightPost)}
              className="group cursor-pointer rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all overflow-hidden grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="lg:col-span-7 relative aspect-video lg:aspect-auto lg:min-h-[300px] bg-slate-100 overflow-hidden">
                <img
                  src={spotlightPost.thumbnailUrl}
                  alt={spotlightPost.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  loading="lazy"
                />
                {spotlightPost.mediaType === 'VIDEO' && (
                  <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/95 text-[#1E3A8A] shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${PLATFORM_META[spotlightPost.platform].color}`}>
                      {renderPlatformIcon(spotlightPost.platform, 'w-3.5 h-3.5')}
                      {PLATFORM_META[spotlightPost.platform].label}
                      <span className="text-slate-300">·</span>
                      <span className="text-amber-700">{spotlightPost.category}</span>
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {spotlightPost.viewCount.toLocaleString('vi-VN')}
                    </span>
                  </div>

                  <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#1E3A8A] transition-colors leading-snug">
                    {spotlightPost.title}
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">
                    {spotlightPost.excerpt}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5" />
                    {spotlightPost.publishedAt}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <ShareMenu
                      title={spotlightPost.title}
                      text={spotlightPost.excerpt}
                      url={buildDeepLink(spotlightPost.id)}
                      label="Chia sẻ"
                      size="sm"
                    />
                    <span className="text-xs font-bold text-[#1E3A8A] px-2.5 py-1.5 rounded-lg bg-blue-50 group-hover:bg-[#1E3A8A] group-hover:text-white transition-colors whitespace-nowrap">
                      {spotlightPost.mediaType === 'VIDEO' ? 'Xem video' : 'Đọc chi tiết'}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* 3-Column Editorial Gallery Grid */}
          {secondaryPosts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {secondaryPosts.map((post) => {
                const meta = PLATFORM_META[post.platform];
                return (
                  <article
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="group cursor-pointer rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all overflow-hidden flex flex-col"
                  >
                    <div className="relative aspect-video bg-slate-100 overflow-hidden">
                      <img
                        src={post.thumbnailUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                        loading="lazy"
                      />
                      {post.mediaType === 'VIDEO' && (
                        <div className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-slate-900/80 text-white flex items-center justify-center">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={`inline-flex items-center gap-1 font-bold ${meta.color}`}>
                            {renderPlatformIcon(post.platform, 'w-3.5 h-3.5')}
                            {meta.label}
                          </span>
                          <span className="text-slate-400 font-mono tabular-nums flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {post.viewCount.toLocaleString('vi-VN')}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#1E3A8A] transition-colors line-clamp-2 leading-snug">
                          {post.title}
                        </h4>

                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {post.excerpt}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {post.publishedAt}
                        </span>
                        <ShareMenu
                          title={post.title}
                          text={post.excerpt}
                          url={buildDeepLink(post.id)}
                          label=""
                          size="sm"
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* In-Page Media Lightbox */}
      {activePost && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActivePost(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className={PLATFORM_META[activePost.platform].color}>
                  {renderPlatformIcon(activePost.platform, 'w-4 h-4')}
                </span>
                <span className="text-slate-800">{PLATFORM_META[activePost.platform].label}</span>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">{activePost.category}</span>
              </div>
              <button
                type="button"
                onClick={() => setActivePost(null)}
                aria-label="Đóng"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto">
              <div className="bg-slate-950 aspect-video w-full flex items-center justify-center">
                {activePost.embedUrl ? (
                  <iframe
                    src={activePost.embedUrl}
                    title={activePost.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <img
                    src={activePost.thumbnailUrl}
                    alt={activePost.title}
                    className="w-full h-full object-contain max-h-[460px]"
                  />
                )}
              </div>

              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5" />
                    Đăng ngày {activePost.publishedAt}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono tabular-nums">
                    <Eye className="w-3.5 h-3.5" />
                    {(localViews[activePost.id] ?? activePost.viewCount ?? 0).toLocaleString('vi-VN')} lượt xem
                  </span>
                </div>

                <h3 className="text-xl font-extrabold text-slate-900 leading-snug">
                  {activePost.title}
                </h3>

                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {activePost.excerpt}
                </p>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <ShareMenu
                    title={activePost.title}
                    text={activePost.excerpt}
                    url={buildDeepLink(activePost.id)}
                    label="Chia sẻ bài viết này"
                    size="md"
                    align="left"
                    variant="outline"
                  />

                  <a
                    href={activePost.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    Xem bài gốc trên {PLATFORM_META[activePost.platform].label}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
