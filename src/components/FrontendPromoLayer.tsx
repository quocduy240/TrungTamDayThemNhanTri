import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Calendar, Megaphone, X } from 'lucide-react';
import {
  isBannerVisibleNow,
  sanitizeRichHtml,
  sanitizeSafeUrl,
} from '../lib/contentStudioEngine';
import type {
  BannerPlacement,
  EditorialArticle,
  FrontendMode,
  PromoBanner,
} from '../types';
import { Gdpt2018FrontendTranscriptLookup } from './Gdpt2018ScorebookPanel';

export interface FrontendBannerSlotProps {
  banners: PromoBanner[];
  placement: BannerPlacement;
  mode: FrontendMode;
  onNavigateAnchor?: (href: string) => void;
}

const POPUP_DISMISS_PREFIX = 'nhantri_popup_dismissed_v1_';

export const FrontendBannerSlot: React.FC<FrontendBannerSlotProps> = ({
  banners,
  placement,
  mode,
  onNavigateAnchor,
}) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const matchingBanners = useMemo(() => {
    return (banners || [])
      .filter((b) => b.placement === placement && isBannerVisibleNow(b, mode))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [banners, placement, mode]);

  useEffect(() => {
    if (placement !== 'POPUP') return;
    try {
      const hidden: string[] = [];
      for (const b of matchingBanners) {
        if (window.sessionStorage.getItem(`${POPUP_DISMISS_PREFIX}${b.id}`) === '1') {
          hidden.push(b.id);
        }
      }
      setDismissedIds(hidden);
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }, [matchingBanners, placement]);

  const visibleBanners = matchingBanners.filter((b) => !dismissedIds.includes(b.id));
  if (visibleBanners.length === 0) return null;

  const dismissBanner = (id: string) => {
    setDismissedIds((prev) => [...prev, id]);
    if (placement === 'POPUP') {
      try {
        window.sessionStorage.setItem(`${POPUP_DISMISS_PREFIX}${id}`, '1');
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleCtaClick = (banner: PromoBanner) => {
    const safeHref = sanitizeSafeUrl(banner.ctaHref, false);
    if (!safeHref) return;
    if (placement === 'POPUP') dismissBanner(banner.id);
    if (safeHref.startsWith('#')) {
      if (onNavigateAnchor) {
        onNavigateAnchor(safeHref);
      } else {
        const target = document.getElementById(safeHref.slice(1));
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (safeHref.startsWith('/')) {
      if (onNavigateAnchor) {
        onNavigateAnchor(safeHref);
        return;
      }
      window.history.pushState({}, '', safeHref);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = safeHref;
    if (/^https?:\/\//i.test(safeHref)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  // 1. TOP_BAR placement
  if (placement === 'TOP_BAR') {
    const top = visibleBanners[0];
    return (
      <div
        className="relative w-full px-4 py-2.5 text-xs shadow-sm sm:px-6"
        style={{
          background: `linear-gradient(90deg, ${top.bgStart}, ${top.bgEnd})`,
          color: top.textColor,
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="h-4 w-4 shrink-0" style={{ color: top.accentColor }} />
            <span
              className="font-extrabold uppercase tracking-wider"
              style={{ color: top.accentColor }}
            >
              {top.kicker}
            </span>
            <span className="hidden opacity-40 sm:inline">|</span>
            <span className="font-semibold">{top.headline}</span>
          </div>
          <div className="flex items-center gap-2">
            {top.ctaLabel && (
              <button
                type="button"
                onClick={() => handleCtaClick(top)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-950 transition hover:opacity-95"
                style={{ backgroundColor: top.accentColor }}
              >
                {top.ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissBanner(top.id)}
              aria-label="Ẩn thông báo"
              className="flex h-7 w-7 items-center justify-center rounded-md opacity-75 hover:bg-white/15 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. POPUP placement
  if (placement === 'POPUP') {
    const pop = visibleBanners[0];
    const safeImg = sanitizeSafeUrl(pop.imageUrl || '', true);
    return (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={pop.headline}
      >
        <div
          className={`relative w-full max-w-2xl overflow-hidden rounded-2xl p-6 shadow-2xl sm:p-8 ${
            pop.borderStyle === 'FESTIVE' ? 'ring-2 ring-amber-300' : 'border border-white/20'
          }`}
          style={{
            background: `linear-gradient(135deg, ${pop.bgStart}, ${pop.bgEnd})`,
            color: pop.textColor,
          }}
        >
          {safeImg && pop.layoutStyle === 'FULL_BG' && (
            <>
              <img src={safeImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div
                className="absolute inset-0 bg-slate-950"
                style={{ opacity: pop.overlayOpacity }}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => dismissBanner(pop.id)}
            aria-label="Đóng thông báo nổi"
            className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-black/25 text-white transition hover:bg-black/45"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative z-10 grid grid-cols-1 items-center gap-6 md:grid-cols-12">
            <div className={safeImg && pop.layoutStyle === 'SPLIT_IMAGE' ? 'md:col-span-7' : 'md:col-span-12 text-center'}>
              <p
                className="text-xs font-extrabold uppercase tracking-widest"
                style={{ color: pop.accentColor }}
              >
                {pop.kicker}
              </p>
              <h3 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">
                {pop.headline}
              </h3>
              <p className="mt-3 text-sm leading-relaxed opacity-90">{pop.subheadline}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                {pop.ctaLabel && (
                  <button
                    type="button"
                    onClick={() => handleCtaClick(pop)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-md transition hover:opacity-95"
                    style={{ backgroundColor: pop.accentColor }}
                  >
                    {pop.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissBanner(pop.id)}
                  className="min-h-[44px] rounded-xl border border-white/30 px-4 py-2.5 text-xs font-bold text-white/90 hover:bg-white/10"
                >
                  Để sau
                </button>
              </div>
            </div>
            {safeImg && pop.layoutStyle === 'SPLIT_IMAGE' && (
              <div className="md:col-span-5">
                <img
                  src={safeImg}
                  alt={pop.headline}
                  className="h-52 w-full rounded-xl border border-white/25 object-cover shadow-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. HERO_SPOTLIGHT & MID_PAGE cards
  return (
    <div className="space-y-4">
      {visibleBanners.slice(0, 2).map((b) => {
        const safeImg = sanitizeSafeUrl(b.imageUrl || '', true);
        const isSplit = Boolean(safeImg && b.layoutStyle === 'SPLIT_IMAGE');
        const isCentered = b.textAlign === 'center' && !isSplit;
        return (
          <section
            key={b.id}
            className={`relative overflow-hidden rounded-2xl p-6 shadow-lg sm:p-8 ${
              b.borderStyle === 'FESTIVE'
                ? 'ring-2 ring-amber-300/80'
                : b.borderStyle === 'CLEAN'
                ? 'border border-white/20'
                : ''
            }`}
            style={{
              background: `linear-gradient(135deg, ${b.bgStart}, ${b.bgEnd})`,
              color: b.textColor,
            }}
          >
            {safeImg && b.layoutStyle === 'FULL_BG' && (
              <>
                <img src={safeImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div
                  className="absolute inset-0 bg-slate-950"
                  style={{ opacity: b.overlayOpacity }}
                />
              </>
            )}

            <div
              className={`relative z-10 grid grid-cols-1 items-center gap-6 ${
                isSplit ? 'md:grid-cols-12' : ''
              }`}
            >
              <div
                className={`${isSplit ? 'md:col-span-7' : ''} ${
                  isCentered ? 'mx-auto max-w-3xl text-center' : 'text-left'
                }`}
              >
                <p
                  className="text-xs font-extrabold uppercase tracking-widest"
                  style={{ color: b.accentColor }}
                >
                  {b.kicker}
                </p>
                <h3
                  className="mt-2 font-extrabold leading-tight"
                  style={{ fontSize: `${Math.round(24 * (b.fontSizeScale || 1))}px` }}
                >
                  {b.headline}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed opacity-90 sm:text-base">
                  {b.subheadline}
                </p>
                {b.ctaLabel && (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => handleCtaClick(b)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm transition hover:opacity-95"
                      style={{ backgroundColor: b.accentColor }}
                    >
                      {b.ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {isSplit && safeImg && (
                <div className="md:col-span-5">
                  <img
                    src={safeImg}
                    alt={b.headline}
                    className="h-52 w-full rounded-xl border border-white/25 object-cover shadow-md sm:h-60"
                  />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export interface FrontendEditorialFeedProps {
  articles: EditorialArticle[];
}

export const FrontendEditorialFeed: React.FC<FrontendEditorialFeedProps> = ({ articles }) => {
  const [activeArticle, setActiveArticle] = useState<EditorialArticle | null>(null);

  const published = useMemo(
    () =>
      (articles || [])
        .filter((a) => a.status === 'PUBLISHED')
        .sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt);
        }),
    [articles],
  );

  return (
    <div className="space-y-8">
      {/* Cổng Tra cứu Điểm số & Học bạ Chuẩn GDPT 2018 (Lớp 6–12) */}
      <Gdpt2018FrontendTranscriptLookup />

      {published.length > 0 && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-blue-800">
                Bản tin &amp; Thông báo chính thức
              </p>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
                Bài viết mới từ Trung tâm Nhân Trí
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {published.slice(0, 6).map((art) => {
              const safeCover = sanitizeSafeUrl(art.coverImageUrl || '', true);
              return (
                <article
                  key={art.id}
                  onClick={() => setActiveArticle(art)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  {safeCover ? (
                    <div className="h-44 w-full overflow-hidden bg-slate-100">
                      <img
                        src={safeCover}
                        alt={art.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-blue-900 to-slate-900 text-amber-300">
                      <BookOpen className="h-10 w-10" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-bold text-blue-800">{art.category}</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(art.publishedAt || art.updatedAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <h4 className="mt-2 line-clamp-2 text-base font-extrabold text-slate-900 group-hover:text-blue-900">
                        {art.title}
                      </h4>
                      {art.excerpt && (
                        <p className="mt-2 line-clamp-3 text-sm text-slate-600">{art.excerpt}</p>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-1 text-xs font-extrabold text-blue-800">
                      <span>Đọc bài viết đầy đủ</span>
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Article Reader Modal */}
          {activeArticle && (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-article-title"
            >
              <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                      {activeArticle.category}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Đăng bởi {activeArticle.authorName} ·{' '}
                      {new Date(
                        activeArticle.publishedAt || activeArticle.updatedAt,
                      ).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveArticle(null)}
                    aria-label="Đóng bài viết"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10">
                  <h2
                    id="reader-article-title"
                    className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl"
                  >
                    {activeArticle.title}
                  </h2>
                  {activeArticle.excerpt && (
                    <p className="mt-3 text-base font-medium text-slate-600">
                      {activeArticle.excerpt}
                    </p>
                  )}
                  {activeArticle.coverImageUrl &&
                    sanitizeSafeUrl(activeArticle.coverImageUrl, true) && (
                      <img
                        src={sanitizeSafeUrl(activeArticle.coverImageUrl, true)}
                        alt={activeArticle.title}
                        className="mt-5 max-h-80 w-full rounded-xl object-cover"
                      />
                    )}
                  <div
                    className="mt-6 text-[15px] leading-relaxed text-slate-800 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeRichHtml(activeArticle.contentHtml),
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
