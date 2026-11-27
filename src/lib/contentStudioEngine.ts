import type {
  BannerAudience,
  BannerCategory,
  BannerLayoutStyle,
  BannerPlacement,
  EditorialArticle,
  FrontendMode,
  PromoBanner,
  ReusableBlockCategory,
  ReusableContentBlock,
} from '../types';

/**
 * Normalizes a human name for strict exact-match delete confirmation:
 * trims edges and collapses internal runs of whitespace while preserving Vietnamese accents & case-insensitive matching.
 */
export function normalizeConfirmName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');
}

export function isExactConfirmNameMatch(typedName: string, expectedName: string): boolean {
  const a = normalizeConfirmName(typedName);
  const b = normalizeConfirmName(expectedName);
  return b.length > 0 && a === b;
}

/**
 * Strict server + client rich HTML sanitizer (blocks script/iframe/object/form/style, event handlers,
 * javascript:/vbscript:/data:text/html URIs, while preserving Google-Docs formatting tags & safe styles).
 */
const ALLOWED_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'figure',
  'figcaption',
  'section',
]);

const SAFE_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'background',
  'text-align',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-decoration',
  'line-height',
  'width',
  'max-width',
  'height',
  'border',
  'border-color',
  'border-radius',
  'border-collapse',
  'padding',
  'margin',
  'margin-top',
  'margin-bottom',
  'display',
]);

export function sanitizeSafeUrl(url: string, allowDataImage = false): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
    return trimmed;
  }
  if (
    allowDataImage &&
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return '';
}

function sanitizeInlineStyle(rawStyle: string): string {
  const parts = rawStyle.split(';');
  const clean: string[] = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (!SAFE_STYLE_PROPS.has(prop)) continue;
    const lowerVal = val.toLowerCase();
    if (
      lowerVal.includes('expression(') ||
      lowerVal.includes('javascript:') ||
      lowerVal.includes('url(') ||
      lowerVal.includes('@import')
    ) {
      continue;
    }
    clean.push(`${prop}: ${val.slice(0, 120)}`);
  }
  return clean.join('; ');
}

export function sanitizeRichHtml(rawHtml: string): string {
  let html = String(rawHtml || '');
  if (!html.trim()) return '';

  // Remove dangerous container elements completely with their inner contents
  html = html.replace(/<\s*(script|style|iframe|object|embed|applet|form|svg|math|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|applet|form|svg|math|meta|link|base|input|button|textarea|select)[^>]*\/?>/gi, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Sanitize remaining tags & attributes
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_match, slash: string, tagName: string, rawAttrs: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash === '/') return `</${tag}>`;

    const safeAttrs: string[] = [];
    const attrRegex = /([a-zA-Z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let m: RegExpExecArray | null;
    while ((m = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = m[1].toLowerCase();
      const attrVal = (m[2] ?? m[3] ?? m[4] ?? '').trim();
      if (attrName.startsWith('on')) continue;

      if (attrName === 'href' && tag === 'a') {
        const safeHref = sanitizeSafeUrl(attrVal, false);
        if (safeHref) {
          safeAttrs.push(`href="${safeHref.replace(/"/g, '&quot;')}"`);
          if (safeHref.startsWith('http')) {
            safeAttrs.push('target="_blank" rel="noopener noreferrer"');
          }
        }
      } else if (attrName === 'src' && tag === 'img') {
        const safeSrc = sanitizeSafeUrl(attrVal, true);
        if (safeSrc) {
          safeAttrs.push(`src="${safeSrc.replace(/"/g, '&quot;')}"`);
        }
      } else if (attrName === 'alt' && tag === 'img') {
        safeAttrs.push(`alt="${attrVal.slice(0, 200).replace(/"/g, '&quot;')}"`);
      } else if (attrName === 'style') {
        const cleanedStyle = sanitizeInlineStyle(attrVal);
        if (cleanedStyle) {
          safeAttrs.push(`style="${cleanedStyle.replace(/"/g, '&quot;')}"`);
        }
      } else if (attrName === 'colspan' || attrName === 'rowspan') {
        const num = Math.max(1, Math.min(12, parseInt(attrVal, 10) || 1));
        safeAttrs.push(`${attrName}="${num}"`);
      }
    }

    const attrStr = safeAttrs.length > 0 ? ` ${safeAttrs.join(' ')}` : '';
    return tag === 'br' || tag === 'hr' || tag === 'img' ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
  });

  return html.slice(0, 120_000);
}

export function slugifyVietnamese(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `bai-viet-${Date.now()}`;
}

// ============================================================
// 5 PRE-BUILT REUSABLE STATIC CONTENT BLOCKS
// ============================================================

export const REUSABLE_BLOCK_CATEGORY_LABELS: Record<ReusableBlockCategory, string> = {
  CONTACT: 'Thông tin liên hệ',
  SCHEDULE: 'Khung lịch học',
  TUITION_OFFER: 'Ưu đãi học phí',
  CTA: 'Kêu gọi đăng ký',
  PARENT_NOTE: 'Lưu ý phụ huynh',
  CUSTOM: 'Khối tùy chỉnh',
};

export const DEFAULT_REUSABLE_BLOCKS: ReusableContentBlock[] = [
  {
    id: 'blk-contact',
    name: 'Thông tin Liên hệ & Hotline Zalo Trung tâm',
    category: 'CONTACT',
    description: 'Chân bài viết chuẩn gồm địa chỉ 2 cơ sở, Zalo Hotline 0987 405 186 và cổng tra cứu daythemnhantri.com.',
    isSystemDefault: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    htmlContent:
      '<div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 16px; margin-top: 16px; margin-bottom: 16px;"><p style="font-weight: 700; color: #1E3A8A; margin-bottom: 6px;">TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ</p><p style="color: #334155; margin-bottom: 4px;"><strong>Cơ sở 1:</strong> Khu phố Trung tâm · <strong>Cơ sở 2:</strong> Gần THCS Lý Thường Kiệt</p><p style="color: #334155; margin-bottom: 4px;"><strong>Hotline / Zalo học vụ:</strong> 0987 405 186 · <strong>Cổng trực tuyến:</strong> daythemnhantri.com</p><p style="color: #475569;"><em>Trao tri thức — Gửi yêu thương · Đồng hành sát sao cùng từng học sinh.</em></p></div>',
  },
  {
    id: 'blk-schedule',
    name: 'Khung giờ học 3 buổi & Cam kết Trả bài 1-1',
    category: 'SCHEDULE',
    description: 'Bảng tóm tắt khung giờ Sáng – Chiều – Tối linh hoạt ghép theo lịch trường và hỗ trợ Giáo viên Trả bài kèm sát.',
    isSystemDefault: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    htmlContent:
      '<div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 16px; margin-top: 16px; margin-bottom: 16px;"><p style="font-weight: 700; color: #0F172A; margin-bottom: 8px;">KHUNG CA HỌC LINH HOẠT (THỨ 2 – THỨ 7)</p><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="border: 1px solid #CBD5E1; padding: 8px; text-align: left; background-color: #EFF6FF;">Buổi học</th><th style="border: 1px solid #CBD5E1; padding: 8px; text-align: left; background-color: #EFF6FF;">Ca 1</th><th style="border: 1px solid #CBD5E1; padding: 8px; text-align: left; background-color: #EFF6FF;">Ca 2</th></tr></thead><tbody><tr><td style="border: 1px solid #CBD5E1; padding: 8px;"><strong>Buổi Sáng</strong></td><td style="border: 1px solid #CBD5E1; padding: 8px;">07:15 – 08:45</td><td style="border: 1px solid #CBD5E1; padding: 8px;">09:15 – 10:45</td></tr><tr><td style="border: 1px solid #CBD5E1; padding: 8px;"><strong>Buổi Chiều</strong></td><td style="border: 1px solid #CBD5E1; padding: 8px;">13:30 – 15:00</td><td style="border: 1px solid #CBD5E1; padding: 8px;">15:15 – 16:45</td></tr><tr><td style="border: 1px solid #CBD5E1; padding: 8px;"><strong>Buổi Tối (Học bù &amp; Trả bài)</strong></td><td style="border: 1px solid #CBD5E1; padding: 8px;">17:30 – 19:00</td><td style="border: 1px solid #CBD5E1; padding: 8px;">19:00 – 20:30</td></tr></tbody></table></div>',
  },
  {
    id: 'blk-offers',
    name: 'Chính sách Ưu đãi Học phí & Anh Em Ruột',
    category: 'TUITION_OFFER',
    description: 'Khối nêu rõ quyền lợi miễn phí khảo sát đầu vào, ưu đãi đăng ký gói 12 tháng và giảm học phí gia đình có 2 con trở lên.',
    isSystemDefault: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    htmlContent:
      '<div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 16px; margin-top: 16px; margin-bottom: 16px;"><p style="font-weight: 700; color: #065F46; margin-bottom: 8px;">CHÍNH SÁCH ƯU ĐÃI HỌC PHÍ TẠI NHÂN TRÍ</p><ul><li><strong>Học thử &amp; Kiểm tra đầu vào:</strong> Miễn phí xếp lớp đúng năng lực, bám sát chương trình GDPT 2018.</li><li><strong>Ưu đãi gói đóng 12 tháng:</strong> Áp dụng mức chiết khấu tiết kiệm trực tiếp và giữ ổn định sĩ số lớp.</li><li><strong>Ưu đãi Anh Chị Em ruột:</strong> Tự động cộng dồn giảm học phí cho gia đình có từ 2 con theo học cùng trung tâm.</li><li><strong>Hỗ trợ Bán trú &amp; Đưa rước:</strong> Đăng ký linh hoạt theo nhu cầu thực tế từng tháng.</li></ul></div>',
  },
  {
    id: 'blk-trial-cta',
    name: 'Hộp Kêu Gọi Đăng Ký Học Thử & Giữ Chỗ',
    category: 'CTA',
    description: 'Khối nhấn nổi bật khuyến khích phụ huynh nhắn Zalo hoặc đăng ký giữ suất lớp sĩ số nhỏ.',
    isSystemDefault: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    htmlContent:
      '<div style="background-color: #FFFBEB; border: 1px solid #FCD34D; border-radius: 12px; padding: 16px; margin-top: 16px; margin-bottom: 16px;"><p style="font-weight: 700; color: #92400E; margin-bottom: 6px;">ĐĂNG KÝ HỌC THỬ &amp; TƯ VẤN XẾP LỚP NGAY HÔM NAY</p><p style="color: #78350F; margin-bottom: 8px;">Mỗi lớp chỉ nhận tối đa 15–18 học sinh để thầy cô theo sát từng em. Quý Phụ huynh vui lòng để lại SĐT hoặc nhắn trực tiếp <strong>Zalo 0987 405 186</strong> (ghi rõ: Họ tên bé + Lớp + Buổi học ở trường) để được xếp lịch học thử trong tuần.</p></div>',
  },
  {
    id: 'blk-parent-note',
    name: 'Lưu ý Phụ huynh về Đưa đón, Điểm danh & Học phí VietQR',
    category: 'PARENT_NOTE',
    description: 'Khối nhắc nhở quy định đưa đón đúng giờ, xem báo cáo điểm danh trên Cổng Phụ huynh và thanh toán VietQR tự động.',
    isSystemDefault: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    htmlContent:
      '<div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-top: 16px; margin-bottom: 16px;"><p style="font-weight: 700; color: #1E293B; margin-bottom: 6px;">LƯU Ý DÀNH CHO QUÝ PHỤ HUYNH</p><ol><li>Quý Phụ huynh vui lòng đưa đón học sinh đúng giờ ca học; nếu bé cần xin nghỉ hoặc đổi ca bù Thể dục, báo sớm qua Zalo <strong>0987 405 186</strong>.</li><li>Lịch học cá nhân, kết quả điểm danh và bảng điểm từng môn luôn cập nhật trực tiếp tại <strong>Cổng Phụ huynh (daythemnhantri.com)</strong>.</li><li>Học phí hỗ trợ quét mã <strong>VietQR</strong> đúng nội dung chuyển khoản để hệ thống tự đối soát và xuất phiếu thu chuẩn trung tâm.</li></ol></div>',
  },
];

export function ensureDefaultReusableBlocks(existing?: ReusableContentBlock[]): ReusableContentBlock[] {
  const list = Array.isArray(existing) ? existing.filter((b) => b && b.id && b.name) : [];
  if (list.length === 0) {
    return DEFAULT_REUSABLE_BLOCKS.map((b) => ({ ...b }));
  }
  return list;
}

// ============================================================
// 10 PROMOTIONAL BANNER TEMPLATES (ADMISSIONS / HOLIDAY / URGENT)
// ============================================================

export interface PromoBannerTemplate {
  templateKey: string;
  label: string;
  category: BannerCategory;
  description: string;
  defaults: Omit<PromoBanner, 'id' | 'updatedAt' | 'updatedBy'>;
}

export const BANNER_CATEGORY_LABELS: Record<BannerCategory, string> = {
  ADMISSIONS: 'Chiêu sinh & Tuyển sinh',
  HOLIDAY: 'Nghỉ lễ & Tết',
  URGENT: 'Thông báo đột xuất & Học vụ',
};

export const BANNER_PLACEMENT_LABELS: Record<BannerPlacement, string> = {
  TOP_BAR: 'Thanh thông báo đầu trang',
  HERO_SPOTLIGHT: 'Banner nổi bật đầu trang (Hero)',
  MID_PAGE: 'Thẻ quảng bá giữa trang',
  POPUP: 'Hộp bật nổi khi vào trang (Popup)',
};

export const BANNER_AUDIENCE_LABELS: Record<BannerAudience, string> = {
  ALL: 'Tất cả đối tượng',
  NEW_CUSTOMER: 'Khách hàng mới',
  PARENT: 'Phụ huynh',
  TEACHER_STUDENT: 'Học sinh & Giáo viên',
};

export const BANNER_LAYOUT_LABELS: Record<BannerLayoutStyle, string> = {
  SPLIT_IMAGE: 'Chia 2 cột (Chữ + Ảnh minh họa)',
  FULL_BG: 'Ảnh phủ toàn nền (Phủ tối dễ đọc)',
  CENTER_CARD: 'Khối chữ trọng tâm căn giữa',
  SLIM_STRIP: 'Thanh thông báo gọn 1 dòng',
};

export const BANNER_TEMPLATES: PromoBannerTemplate[] = [
  {
    templateKey: 'tpl-admissions-newyear',
    label: '01. Chiêu sinh Năm học mới Cấp 1–2–3',
    category: 'ADMISSIONS',
    description: 'Banner chủ lực khai giảng năm học mới với màu Xanh Navy Nhân Trí sang trọng và nút đăng ký học thử.',
    defaults: {
      templateKey: 'tpl-admissions-newyear',
      category: 'ADMISSIONS',
      kicker: 'CHIÊU SINH NĂM HỌC MỚI 2026 – 2027',
      headline: 'Bứt phá học lực Cấp 1 · Cấp 2 · Cấp 3 cùng đội ngũ giáo viên tận tâm',
      subheadline: 'Bám sát GDPT 2018 · Sĩ số nhỏ kèm từng em · Có Giáo viên Trả bài 1-1 mỗi ngày và học bạ theo dõi trực tuyến.',
      ctaLabel: 'Đăng ký học thử miễn phí',
      ctaHref: '#courses',
      bgStart: '#1E3A8A',
      bgEnd: '#0F172A',
      accentColor: '#F59E0B',
      textColor: '#FFFFFF',
      layoutStyle: 'SPLIT_IMAGE',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.45,
      borderStyle: 'CLEAN',
      placement: 'HERO_SPOTLIGHT',
      audience: 'NEW_CUSTOMER',
      active: true,
      priority: 10,
    },
  },
  {
    templateKey: 'tpl-admissions-exam10',
    label: '02. Khai giảng Luyện thi Lớp 10 & THPT Quốc gia',
    category: 'ADMISSIONS',
    description: 'Nhấn mạnh lộ trình luyện đề chuẩn cấu trúc mới, chấm bài chi tiết và mục tiêu đỗ nguyện vọng 1.',
    defaults: {
      templateKey: 'tpl-admissions-exam10',
      category: 'ADMISSIONS',
      kicker: 'LỚP LUYỆN THI CHUYÊN SÂU · KHỐI 9 & 12',
      headline: 'Chinh phục kỳ thi tuyển sinh Lớp 10 & Tốt nghiệp THPT với lộ trình cá nhân hóa',
      subheadline: 'Hệ thống hóa kiến thức trọng tâm Toán – Văn – Anh – Lý – Hóa · Thi thử định kỳ hàng tháng, phân tích lỗ hổng từng chuyên đề.',
      ctaLabel: 'Xem lịch khai giảng',
      ctaHref: '#courses',
      bgStart: '#1E1B4B',
      bgEnd: '#312E81',
      accentColor: '#FBBF24',
      textColor: '#FFFFFF',
      layoutStyle: 'CENTER_CARD',
      textAlign: 'center',
      fontSizeScale: 1,
      overlayOpacity: 0.5,
      borderStyle: 'CLEAN',
      placement: 'MID_PAGE',
      audience: 'ALL',
      active: false,
      priority: 9,
    },
  },
  {
    templateKey: 'tpl-admissions-boarding',
    label: '03. Mở lớp Bán trú & Đưa rước Tiểu học',
    category: 'ADMISSIONS',
    description: 'Dành cho phụ huynh bận rộn cần giải pháp kèm bài Tiểu học trọn gói, ăn nghỉ trưa và đưa rước an toàn.',
    defaults: {
      templateKey: 'tpl-admissions-boarding',
      category: 'ADMISSIONS',
      kicker: 'CHƯƠNG TRÌNH TIỂU HỌC TRỌN GÓI',
      headline: 'Lớp Kèm bài Tiểu học + Bán trú & Đưa rước tận trường — Phụ huynh an tâm công tác',
      subheadline: 'Rèn chữ đẹp, hoàn thành 100% bài tập trên lớp, củng cố Toán – Tiếng Việt – Tiếng Anh ngay tại trung tâm.',
      ctaLabel: 'Tư vấn gói Bán trú',
      ctaHref: '#contact',
      bgStart: '#065F46',
      bgEnd: '#047857',
      accentColor: '#FDE68A',
      textColor: '#FFFFFF',
      layoutStyle: 'SPLIT_IMAGE',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.4,
      borderStyle: 'CLEAN',
      placement: 'MID_PAGE',
      audience: 'NEW_CUSTOMER',
      active: false,
      priority: 8,
    },
  },
  {
    templateKey: 'tpl-admissions-trial',
    label: '04. Tuần lễ Học thử Miễn phí & Ưu đãi Anh em ruột',
    category: 'ADMISSIONS',
    description: 'Khuyến mãi nổi bật dạng Popup hoặc Thanh đầu trang kích thích đăng ký tư vấn ngay.',
    defaults: {
      templateKey: 'tpl-admissions-trial',
      category: 'ADMISSIONS',
      kicker: 'ƯU ĐÃI ĐẶC BIỆT THÁNG NÀY',
      headline: 'Tặng 1 tuần học thử miễn phí + Giảm thêm học phí cho Anh Chị Em ruột',
      subheadline: 'Áp dụng cho học sinh đăng ký mới gói học 3 môn trở lên hoặc gói ưu đãi 12 tháng tại daythemnhantri.com.',
      ctaLabel: 'Nhận suất ưu đãi ngay',
      ctaHref: '#contact',
      bgStart: '#1D4ED8',
      bgEnd: '#1E3A8A',
      accentColor: '#FACC15',
      textColor: '#FFFFFF',
      layoutStyle: 'CENTER_CARD',
      textAlign: 'center',
      fontSizeScale: 1,
      overlayOpacity: 0.45,
      borderStyle: 'FESTIVE',
      placement: 'POPUP',
      audience: 'NEW_CUSTOMER',
      active: false,
      priority: 7,
    },
  },
  {
    templateKey: 'tpl-holiday-tet',
    label: '05. Thông báo Lịch nghỉ Tết Nguyên Đán & Khai xuân',
    category: 'HOLIDAY',
    description: 'Tông Đỏ son – Vàng mai trang trọng báo rõ ngày bắt đầu nghỉ Tết, ngày học lại và lời chúc xuân.',
    defaults: {
      templateKey: 'tpl-holiday-tet',
      category: 'HOLIDAY',
      kicker: 'THÔNG BÁO NGHỈ TẾT NGUYÊN ĐÁN',
      headline: 'Chúc Mừng Năm Mới An Khang · Lịch nghỉ Tết & Khai xuân Trung tâm Nhân Trí',
      subheadline: 'Trung tâm nghỉ Tết từ ngày 26 tháng Chạp đến hết Mùng 6 Tết. Các lớp khai xuân học lại bình thường từ Thứ Hai Mùng 7 Tết.',
      ctaLabel: 'Xem lịch học khai xuân',
      ctaHref: '#classroom',
      bgStart: '#991B1B',
      bgEnd: '#7F1D1D',
      accentColor: '#FCD34D',
      textColor: '#FFFFFF',
      layoutStyle: 'CENTER_CARD',
      textAlign: 'center',
      fontSizeScale: 1,
      overlayOpacity: 0.4,
      borderStyle: 'FESTIVE',
      placement: 'HERO_SPOTLIGHT',
      audience: 'ALL',
      active: false,
      priority: 10,
    },
  },
  {
    templateKey: 'tpl-holiday-304',
    label: '06. Thông báo Nghỉ lễ 30/4 – 1/5 & Quốc khánh 2/9',
    category: 'HOLIDAY',
    description: 'Thông báo nghỉ lễ Quốc gia rõ ngày nghỉ, ngày trở lại lớp và thông tin hỗ trợ trực Zalo.',
    defaults: {
      templateKey: 'tpl-holiday-304',
      category: 'HOLIDAY',
      kicker: 'THÔNG BÁO NGHỈ LỄ TOÀN TRUNG TÂM',
      headline: 'Lịch nghỉ lễ 30/4 – 01/5 dành cho toàn thể Học sinh & Giáo viên',
      subheadline: 'Các lớp tạm nghỉ trong 02 ngày lễ theo quy định Nhà nước và đi học lại đúng Thời khóa biểu vào ngày kế tiếp. Kính chúc Quý gia đình kỳ nghỉ vui vẻ!',
      ctaLabel: 'Tra cứu Thời khóa biểu',
      ctaHref: '#parent-portal',
      bgStart: '#B91C1C',
      bgEnd: '#1E3A8A',
      accentColor: '#FDE047',
      textColor: '#FFFFFF',
      layoutStyle: 'SPLIT_IMAGE',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.45,
      borderStyle: 'CLEAN',
      placement: 'HERO_SPOTLIGHT',
      audience: 'ALL',
      active: false,
      priority: 9,
    },
  },
  {
    templateKey: 'tpl-holiday-makeup',
    label: '07. Thông báo Nghỉ Giỗ Tổ / Tết Dương lịch & Lịch học bù',
    category: 'HOLIDAY',
    description: 'Dạng thanh thông báo gọn hoặc banner nhắc rõ lịch nghỉ ngắn ngày kèm kế hoạch học bù.',
    defaults: {
      templateKey: 'tpl-holiday-makeup',
      category: 'HOLIDAY',
      kicker: 'LỊCH NGHỈ LỄ & KẾ HOẠCH HỌC BÙ',
      headline: 'Thông báo nghỉ lễ 01 ngày — Các ca trùng lịch được sắp xếp học bù chu đáo',
      subheadline: 'Quý Phụ huynh và Học sinh xem chi tiết ca học bù cá nhân tại Cổng Phụ huynh hoặc liên hệ Zalo 0987 405 186.',
      ctaLabel: 'Xem lịch bù ngay',
      ctaHref: '#parent-portal',
      bgStart: '#0369A1',
      bgEnd: '#0C4A6E',
      accentColor: '#FDE68A',
      textColor: '#FFFFFF',
      layoutStyle: 'SLIM_STRIP',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.35,
      borderStyle: 'CLEAN',
      placement: 'TOP_BAR',
      audience: 'ALL',
      active: false,
      priority: 8,
    },
  },
  {
    templateKey: 'tpl-urgent-weather',
    label: '08. Thông báo KHẨN — Tạm nghỉ học do Mưa bão / Thời tiết xấu',
    category: 'URGENT',
    description: 'Độ tương phản cao nhất để Phụ huynh đọc ngay lập tức, không đưa con đến lớp khi thời tiết nguy hiểm.',
    defaults: {
      templateKey: 'tpl-urgent-weather',
      category: 'URGENT',
      kicker: 'THÔNG BÁO KHẨN TỪ BAN QUẢN LÝ',
      headline: 'TẠM NGHỈ CÁC CA HỌC CHIỀU & TỐI HÔM NAY DO MƯA BÃO LỚN',
      subheadline: 'Nhằm bảo đảm an toàn tuyệt đối cho học sinh, Trung tâm Nhân Trí xin tạm nghỉ toàn bộ ca học hôm nay. Lịch học bù sẽ được cập nhật trên daythemnhantri.com.',
      ctaLabel: 'Liên hệ Zalo khẩn',
      ctaHref: '#contact',
      bgStart: '#991B1B',
      bgEnd: '#450A0A',
      accentColor: '#FACC15',
      textColor: '#FFFFFF',
      layoutStyle: 'SLIM_STRIP',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.4,
      borderStyle: 'FESTIVE',
      placement: 'TOP_BAR',
      audience: 'ALL',
      active: false,
      priority: 20,
    },
  },
  {
    templateKey: 'tpl-urgent-room',
    label: '09. Thông báo Đột xuất — Điều chỉnh Phòng học / Giờ ca học',
    category: 'URGENT',
    description: 'Dùng khi bảo trì điện nước, thay đổi phòng học hoặc gộp ca đột xuất cần thông báo nhanh tới Phụ huynh & Học sinh.',
    defaults: {
      templateKey: 'tpl-urgent-room',
      category: 'URGENT',
      kicker: 'CẬP NHẬT HỌC VỤ ĐỘT XUẤT',
      headline: 'Thông báo điều chỉnh tạm thời Phòng học & Khung giờ một số lớp tuần này',
      subheadline: 'Kính mời Quý Phụ huynh và Học sinh kiểm tra mục "Hôm nay học phòng nào?" trước khi đến lớp để vào đúng phòng mới.',
      ctaLabel: 'Kiểm tra phòng học ngay',
      ctaHref: '#classroom',
      bgStart: '#B45309',
      bgEnd: '#78350F',
      accentColor: '#FEF08A',
      textColor: '#FFFFFF',
      layoutStyle: 'SLIM_STRIP',
      textAlign: 'left',
      fontSizeScale: 1,
      overlayOpacity: 0.4,
      borderStyle: 'CLEAN',
      placement: 'TOP_BAR',
      audience: 'ALL',
      active: false,
      priority: 15,
    },
  },
  {
    templateKey: 'tpl-urgent-exam-parent',
    label: '10. Thông báo Lịch Kiểm tra Định kỳ & Họp Phụ huynh',
    category: 'URGENT',
    description: 'Nhắc lịch khảo sát chất lượng giữa kỳ/cuối kỳ và mời Phụ huynh xem học bạ trực tuyến.',
    defaults: {
      templateKey: 'tpl-urgent-exam-parent',
      category: 'URGENT',
      kicker: 'LỊCH KHẢO SÁT CHẤT LƯỢNG & HỌP PHỤ HUYNH',
      headline: 'Tuần lễ Kiểm tra đánh giá định kỳ — Tổng kết học bạ Online gửi từng gia đình',
      subheadline: 'Học sinh ôn tập theo bộ đề chuẩn trên Thư viện Đề thi. Kết quả và nhận xét giáo viên được cập nhật trực tiếp tại Cổng Phụ huynh.',
      ctaLabel: 'Vào Thư viện Đề ôn tập',
      ctaHref: '#exams',
      bgStart: '#0F766E',
      bgEnd: '#134E4A',
      accentColor: '#FDE68A',
      textColor: '#FFFFFF',
      layoutStyle: 'CENTER_CARD',
      textAlign: 'center',
      fontSizeScale: 1,
      overlayOpacity: 0.4,
      borderStyle: 'CLEAN',
      placement: 'MID_PAGE',
      audience: 'ALL',
      active: false,
      priority: 6,
    },
  },
];

export const DEFAULT_PROMO_BANNERS: PromoBanner[] = [
  {
    ...BANNER_TEMPLATES[0].defaults,
    id: 'bnr-admissions-main',
    active: true,
    updatedAt: '2026-11-27T00:00:00.000Z',
    updatedBy: 'duyweb5@gmail.com',
  },
  {
    ...BANNER_TEMPLATES[6].defaults,
    id: 'bnr-topbar-info',
    kicker: 'CHIÊU SINH LIÊN TỤC · SĨ SỐ NHỎ',
    headline: 'Nhận học sinh Tiểu học – THCS – THPT học thử miễn phí tuần này · Zalo tư vấn 0987 405 186',
    subheadline: 'Đăng ký nhóm anh em ruột nhận ngay ưu đãi học phí đặc biệt.',
    ctaLabel: 'Xem khóa học',
    ctaHref: '#courses',
    bgStart: '#1E3A8A',
    bgEnd: '#1D4ED8',
    placement: 'TOP_BAR',
    audience: 'NEW_CUSTOMER',
    active: true,
    priority: 12,
    updatedAt: '2026-11-27T00:00:00.000Z',
    updatedBy: 'duyweb5@gmail.com',
  },
];

export const DEFAULT_EDITORIAL_ARTICLES: EditorialArticle[] = [
  {
    id: 'art-chieu-sinh-2026',
    title: 'Thông báo Chiêu sinh Năm học mới 2026 – 2027: Kèm sát từng học sinh theo chuẩn GDPT 2018',
    slug: 'thong-bao-chieu-sinh-nam-hoc-moi-2026-2027',
    category: 'Chiêu sinh & Khai giảng',
    excerpt:
      'Trung tâm Nhân Trí mở các lớp Tiểu học (Kèm & Bán trú), THCS và THPT với sĩ số nhỏ, đội ngũ Giáo viên Bộ môn kết hợp Giáo viên Trả bài 1-1 mỗi ngày.',
    coverImageUrl: '',
    contentHtml:
      '<h2>Lộ trình học vững kiến thức nền tảng — Tự tin bứt phá điểm số</h2><p>Nhằm đồng hành cùng Quý Phụ huynh và các em học sinh trong năm học mới, <strong>Trung tâm Dạy thêm Học thêm Nhân Trí</strong> chính thức mở đợt ghi danh các khối lớp từ Tiểu học đến THPT với phương pháp học chủ động, kiểm tra sát năng lực thực tế từng em.</p><h3>Điểm khác biệt trong mô hình kèm cặp tại Nhân Trí</h3><ul><li><strong>Phân lớp theo năng lực:</strong> Học sinh được kiểm tra đầu vào miễn phí để xếp đúng lớp Cơ bản hoặc Nâng cao.</li><li><strong>Kết hợp 2 lớp giáo viên:</strong> Giáo viên Bộ môn giảng chuyên sâu kết hợp Giáo viên Trả bài kiểm tra thuộc bài &amp; hoàn thành bài tập ngay tại lớp.</li><li><strong>Học bạ Online minh bạch:</strong> Phụ huynh theo dõi lịch học, chuyên cần và bảng điểm từng tuần ngay trên điện thoại.</li></ul>' +
      DEFAULT_REUSABLE_BLOCKS[2].htmlContent +
      DEFAULT_REUSABLE_BLOCKS[0].htmlContent,
    authorName: 'Ban Quản Trị Nhân Trí',
    authorEmail: 'duyweb5@gmail.com',
    status: 'PUBLISHED',
    featured: true,
    createdAt: '2026-11-20T08:00:00.000Z',
    updatedAt: '2026-11-27T08:00:00.000Z',
    publishedAt: '2026-11-20T08:00:00.000Z',
  },
];

/**
 * Checks whether a promotional banner should display right now for a given Frontend display mode.
 */
export function isBannerVisibleNow(banner: PromoBanner, mode: FrontendMode, now = new Date()): boolean {
  if (!banner.active) return false;
  if (banner.audience !== 'ALL' && banner.audience !== mode) return false;
  const todayStr = now.toISOString().slice(0, 10);
  if (banner.startDate && banner.startDate.length >= 10 && todayStr < banner.startDate.slice(0, 10)) {
    return false;
  }
  if (banner.endDate && banner.endDate.length >= 10 && todayStr > banner.endDate.slice(0, 10)) {
    return false;
  }
  return true;
}

/**
 * Renders any PromoBanner into a crisp 2x Retina PNG image (1200x630 Facebook/Zalo ratio)
 * via native HTML5 Canvas 2D so Admins can download and post immediately on social media.
 */
export async function renderPromoBannerPngDataUrl(
  banner: PromoBanner,
  logoUrl = '/logo-nhantri.png',
): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas chỉ khả dụng trên trình duyệt.');
  }

  const width = 1200;
  const height = banner.placement === 'TOP_BAR' ? 320 : 630;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không khởi tạo được bộ dựng ảnh Canvas 2D.');
  ctx.scale(scale, scale);

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, banner.bgStart || '#1E3A8A');
  grad.addColorStop(1, banner.bgEnd || '#0F172A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Helper to load external/data image safely
  const loadImg = (url?: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const [bgImg, logoImg] = await Promise.all([loadImg(banner.imageUrl), loadImg(logoUrl)]);

  // Full background image mode
  if (bgImg && banner.layoutStyle === 'FULL_BG') {
    const ratio = Math.max(width / bgImg.width, height / bgImg.height);
    const dw = bgImg.width * ratio;
    const dh = bgImg.height * ratio;
    ctx.drawImage(bgImg, (width - dw) / 2, (height - dh) / 2, dw, dh);
    ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.88, Math.max(0.25, banner.overlayOpacity || 0.55))})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Subtle decorative border if enabled
  if (banner.borderStyle === 'FESTIVE') {
    ctx.strokeStyle = banner.accentColor || '#FCD34D';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, width - 40, height - 40);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 30, width - 60, height - 60);
  } else if (banner.borderStyle === 'CLEAN') {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, width - 36, height - 36);
  }

  // Split image right panel
  const hasRightImage = Boolean(bgImg && banner.layoutStyle === 'SPLIT_IMAGE' && height >= 480);
  if (hasRightImage && bgImg) {
    const imgX = 720;
    const imgY = 64;
    const imgW = 420;
    const imgH = height - 128;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 24);
    ctx.clip();
    const ratio = Math.max(imgW / bgImg.width, imgH / bgImg.height);
    const dw = bgImg.width * ratio;
    const dh = bgImg.height * ratio;
    ctx.drawImage(bgImg, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 24);
    ctx.stroke();
  }

  // Brand lockup top-left
  const padX = 64;
  const isCentered = banner.textAlign === 'center' && !hasRightImage;
  const contentMaxW = hasRightImage ? 620 : width - padX * 2;
  const anchorX = isCentered ? width / 2 : padX;

  if (logoImg) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(padX + 26, 66, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(padX + 26, 66, 24, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, padX + 2, 42, 48, 48);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TRUNG TÂM NHÂN TRÍ · DAYTHEMNHANTRI.COM', padX + 66, 72);

  // Word-wrap helper
  const wrapLines = (text: string, maxW: number, maxLines: number): string[] => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxW && current) {
        lines.push(current);
        current = w;
        if (lines.length >= maxLines) break;
      } else {
        current = test;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines;
  };

  ctx.textAlign = isCentered ? 'center' : 'left';
  const fontScale = Math.max(0.85, Math.min(1.25, banner.fontSizeScale || 1));

  // Kicker
  let cursorY = height < 400 ? 128 : 168;
  ctx.fillStyle = banner.accentColor || '#FCD34D';
  ctx.font = `800 ${Math.round(18 * fontScale)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText((banner.kicker || '').toUpperCase(), anchorX, cursorY);

  // Headline
  cursorY += Math.round(52 * fontScale);
  ctx.fillStyle = banner.textColor || '#FFFFFF';
  const headlineSize = Math.round((height < 400 ? 30 : 44) * fontScale);
  ctx.font = `800 ${headlineSize}px "Plus Jakarta Sans", sans-serif`;
  const headLines = wrapLines(banner.headline, contentMaxW, 3);
  for (const line of headLines) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += Math.round(headlineSize * 1.24);
  }

  // Subheadline
  cursorY += 6;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const subSize = Math.round((height < 400 ? 18 : 22) * fontScale);
  ctx.font = `500 ${subSize}px "Plus Jakarta Sans", sans-serif`;
  const subLines = wrapLines(banner.subheadline, contentMaxW, height < 400 ? 2 : 3);
  for (const line of subLines) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += Math.round(subSize * 1.4);
  }

  // CTA Button pill-rectangle + Hotline footer
  if (banner.ctaLabel && height >= 400) {
    const btnY = Math.min(height - 115, cursorY + 22);
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    const textW = ctx.measureText(banner.ctaLabel).width;
    const btnW = Math.max(220, textW + 56);
    const btnH = 54;
    const btnX = isCentered ? (width - btnW) / 2 : padX;
    ctx.fillStyle = banner.accentColor || '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 14);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText(banner.ctaLabel, btnX + btnW / 2, btnY + 34);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Hotline / Zalo học vụ: 0987 405 186  ·  daythemnhantri.com', padX, height - 34);

  return canvas.toDataURL('image/png', 1.0);
}
