import type { SocialMediaType, SocialPlatform } from '../types.ts';

const ALLOWED_SOCIAL_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.watch',
  'zalo.me',
  'oa.zalo.me',
  'zaloapp.com',
]);

export const DEFAULT_FALLBACK_THUMBNAIL = '/assets/aistudio/IMG_9559_62d21d91.webp';

export type ValidateSocialUrlResult =
  | { ok: true; parsed: URL; url: URL; platform: SocialPlatform }
  | { ok: false; error: string };

export function validateSocialUrl(rawUrl: string): ValidateSocialUrlResult {
  try {
    const trimmed = String(rawUrl || '').trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Chỉ chấp nhận đường dẫn HTTPS hợp lệ từ mạng xã hội.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_SOCIAL_HOSTS.has(host)) {
      return {
        ok: false,
        error: 'Tên miền chưa được hỗ trợ. Chỉ chấp nhận YouTube, TikTok, Facebook và Zalo.',
      };
    }
    const platform = detectSocialPlatformFromHost(host);
    if (!platform) {
      return { ok: false, error: 'Không nhận diện được nền tảng mạng xã hội.' };
    }
    return { ok: true, parsed, url: parsed, platform };
  } catch {
    return { ok: false, error: 'Đường dẫn URL không hợp lệ.' };
  }
}

export function detectSocialPlatformFromHost(hostname: string): SocialPlatform | null {
  const h = hostname.toLowerCase();
  if (h.includes('youtube.com') || h === 'youtu.be') return 'YOUTUBE';
  if (h.includes('tiktok.com')) return 'TIKTOK';
  if (h.includes('facebook.com') || h === 'fb.watch') return 'FACEBOOK';
  if (h.includes('zalo.me') || h.includes('zaloapp.com')) return 'ZALO';
  return null;
}

export function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const seg = url.pathname.replace(/^\/+/, '').split('/')[0];
    return /^[a-zA-Z0-9_-]{11}$/.test(seg) ? seg : null;
  }
  const v = url.searchParams.get('v');
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const shortsMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
  return shortsMatch ? shortsMatch[1] : null;
}

export function extractTikTokVideoId(url: URL): string | null {
  const match = url.pathname.match(/\/video\/(\d{8,25})/);
  return match ? match[1] : null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NhanTriEducationBot/1.0 (+https://daythemnhantri.com)',
        Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchedSocialMetadata {
  platform: SocialPlatform;
  mediaType: SocialMediaType;
  title: string;
  excerpt: string;
  sourceUrl: string;
  embedUrl?: string;
  thumbnailUrl: string;
  category: string;
  fetchedLive: boolean;
}

export type FetchSocialMetadataResult =
  | { ok: true; data: FetchedSocialMetadata }
  | { ok: false; error: string };

export async function fetchSocialUrlMetadata(rawUrl: string): Promise<FetchSocialMetadataResult> {
  const checked = validateSocialUrl(rawUrl);
  if (!checked.ok) {
    return { ok: false, error: checked.error };
  }
  const url = checked.parsed;
  const platform = checked.platform;
  const cleanUrl = url.toString();

  // 1. YouTube oEmbed + ID extraction
  if (platform === 'YOUTUBE') {
    const videoId = extractYouTubeVideoId(url);
    const isShort = url.pathname.includes('/shorts/');
    const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : undefined;
    const defaultThumb = videoId
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : DEFAULT_FALLBACK_THUMBNAIL;

    try {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        return {
          ok: true,
          data: {
            platform: 'YOUTUBE',
            mediaType: 'VIDEO',
            title: (data.title || 'Video học tập Trung Tâm Nhân Trí').slice(0, 180),
            excerpt: data.author_name
              ? `Video từ kênh ${data.author_name} — cập nhật hoạt động giảng dạy & học tập tại Trung Tâm Nhân Trí.`
              : 'Video bài giảng & hoạt động thực tế tại Trung Tâm Dạy Thêm Nhân Trí.',
            sourceUrl: cleanUrl,
            embedUrl,
            thumbnailUrl: data.thumbnail_url || defaultThumb,
            category: isShort ? 'YouTube Shorts' : 'Video YouTube',
            fetchedLive: true,
          },
        };
      }
    } catch {
      // graceful fallback below
    }

    return {
      ok: true,
      data: {
        platform: 'YOUTUBE',
        mediaType: 'VIDEO',
        title: videoId ? `Video YouTube Nhân Trí (${videoId})` : 'Kênh YouTube Trung Tâm Nhân Trí',
        excerpt: 'Video hoạt động và chuyên đề ôn tập tại Trung Tâm Dạy Thêm Học Thêm Nhân Trí.',
        sourceUrl: cleanUrl,
        embedUrl,
        thumbnailUrl: defaultThumb,
        category: isShort ? 'YouTube Shorts' : 'Video YouTube',
        fetchedLive: false,
      },
    };
  }

  // 2. TikTok oEmbed
  if (platform === 'TIKTOK') {
    const tiktokId = extractTikTokVideoId(url);
    const embedUrl = tiktokId ? `https://www.tiktok.com/embed/v2/${tiktokId}` : undefined;
    try {
      const res = await fetchWithTimeout(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        return {
          ok: true,
          data: {
            platform: 'TIKTOK',
            mediaType: 'VIDEO',
            title: (data.title || 'Khoảnh khắc lớp học Nhân Trí trên TikTok').slice(0, 180),
            excerpt: data.author_name
              ? `Clip ngắn từ ${data.author_name} trên TikTok — sinh hoạt lớp học và mẹo học nhanh cùng thầy cô Nhân Trí.`
              : 'Video ngắn thực tế từ TikTok Trung Tâm Nhân Trí.',
            sourceUrl: cleanUrl,
            embedUrl,
            thumbnailUrl: data.thumbnail_url || DEFAULT_FALLBACK_THUMBNAIL,
            category: 'TikTok Clip',
            fetchedLive: true,
          },
        };
      }
    } catch {
      // graceful fallback
    }

    return {
      ok: true,
      data: {
        platform: 'TIKTOK',
        mediaType: 'VIDEO',
        title: 'Video ngắn hoạt động lớp học trên TikTok Nhân Trí',
        excerpt: 'Khoảnh khắc học tập sinh động và bí quyết làm bài nhanh tại Trung Tâm Nhân Trí.',
        sourceUrl: cleanUrl,
        embedUrl,
        thumbnailUrl: DEFAULT_FALLBACK_THUMBNAIL,
        category: 'TikTok Clip',
        fetchedLive: false,
      },
    };
  }

  // 3. Facebook & Zalo OpenGraph parser with graceful fallback
  const isReel = url.pathname.includes('/reel/') || url.hostname.toLowerCase() === 'fb.watch';
  let ogTitle = '';
  let ogDesc = '';
  let ogImage = '';
  let fetchedLive = false;

  try {
    const res = await fetchWithTimeout(cleanUrl, 3800);
    if (res.ok) {
      const html = (await res.text()).slice(0, 120000);
      const getMeta = (prop: string) => {
        const r1 = new RegExp(
          `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
          'i',
        );
        const r2 = new RegExp(
          `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
          'i',
        );
        const m = html.match(r1) || html.match(r2);
        return m ? decodeHtmlEntities(m[1]) : '';
      };
      ogTitle = getMeta('og:title') || getMeta('twitter:title');
      ogDesc = getMeta('og:description') || getMeta('description');
      ogImage = getMeta('og:image');
      if (ogTitle && !ogTitle.toLowerCase().includes('log in') && !ogTitle.toLowerCase().includes('đăng nhập')) {
        fetchedLive = true;
      } else {
        ogTitle = '';
      }
    }
  } catch {
    // Facebook/Zalo often restrict automated fetch; fallback smoothly
  }

  const safeImage =
    ogImage && ogImage.startsWith('https://') ? ogImage : DEFAULT_FALLBACK_THUMBNAIL;

  return {
    ok: true,
    data: {
      platform,
      mediaType: isReel ? 'VIDEO' : 'PHOTO',
      title:
        ogTitle.slice(0, 180) ||
        (platform === 'FACEBOOK'
          ? isReel
            ? 'Video Reel hoạt động từ Fanpage Trung Tâm Nhân Trí'
            : 'Bản tin mới từ Fanpage Trung Tâm Nhân Trí'
          : 'Thông báo & Hoạt động từ Zalo OA Trung Tâm Nhân Trí'),
      excerpt:
        ogDesc.slice(0, 340) ||
        (platform === 'FACEBOOK'
          ? 'Cập nhật hoạt động giảng dạy, lớp học bán trú và kết quả thi đua từ Fanpage chính thức Trung Tâm Nhân Trí.'
          : 'Tin tức tuyển sinh, lịch học và thông báo nhanh gửi tới Quý Phụ huynh qua Zalo Trung Tâm Nhân Trí.'),
      sourceUrl: cleanUrl,
      thumbnailUrl: safeImage,
      category:
        platform === 'FACEBOOK'
          ? isReel
            ? 'Facebook Reel'
            : 'Fanpage Facebook'
          : 'Zalo OA',
      fetchedLive,
    },
  };
}

export interface YouTubeRssItem {
  title: string;
  excerpt: string;
  sourceUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export type FetchYouTubeRssResult =
  | { ok: true; posts: YouTubeRssItem[] }
  | { ok: false; error: string };

export async function fetchYouTubeChannelRssPosts(
  channelIdInput: string,
  limit = 6,
): Promise<FetchYouTubeRssResult> {
  const cleanId = channelIdInput.trim();
  if (!/^[a-zA-Z0-9_-]{12,40}$/.test(cleanId)) {
    return {
      ok: false,
      error: 'YouTube Channel ID không hợp lệ (ví dụ: UCxxxxxxxxxxxxxxxxxxxxxx).',
    };
  }
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cleanId)}`;
  try {
    const res = await fetchWithTimeout(rssUrl, 5000);
    if (!res.ok) {
      return {
        ok: false,
        error: `Không thể đọc nguồn RSS YouTube (HTTP ${res.status}). Hãy kiểm tra lại Channel ID.`,
      };
    }
    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const posts: YouTubeRssItem[] = [];

    for (const entry of entries.slice(0, limit)) {
      const vidMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
      if (!vidMatch) continue;
      const vid = vidMatch[1].trim();
      const title = decodeHtmlEntities(titleMatch?.[1] || 'Video YouTube Nhân Trí').slice(0, 180);
      const rawDesc = decodeHtmlEntities(descMatch?.[1] || '');
      const excerpt = (
        rawDesc ||
        'Video bài giảng và hoạt động học tập cập nhật tự động từ kênh YouTube Trung Tâm Nhân Trí.'
      ).slice(0, 280);
      const publishedAt = (publishedMatch?.[1] || new Date().toISOString()).slice(0, 10);

      posts.push({
        title,
        excerpt,
        sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
        embedUrl: `https://www.youtube.com/embed/${vid}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        publishedAt,
      });
    }
    return { ok: true, posts };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Không thể kết nối tới nguồn RSS YouTube lúc này.',
    };
  }
}
