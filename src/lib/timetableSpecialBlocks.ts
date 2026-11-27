import type {
  TimetableSpecialBlock,
  TimetableSpecialBlockFontFamily,
  TimetableSpecialBlockType,
} from '../types';
import { ALL_SHIFT_KEYS } from './timetableEngine';

export interface SpecialBlockTemplate {
  templateKey: string;
  label: string;
  description: string;
  defaults: Omit<TimetableSpecialBlock, 'id' | 'updatedAt' | 'updatedBy'>;
}

export const SPECIAL_BLOCK_TYPE_LABELS: Record<TimetableSpecialBlockType, string> = {
  NGHI: 'Nghỉ học / Nghỉ lễ',
  PHU_DAO: 'Phụ đạo / Bồi dưỡng',
  KIEM_TRA: 'Kiểm tra / Thi thử',
  SU_KIEN: 'Ngoại khóa / Họp PH',
  CUSTOM: 'Block tùy biến',
};

export const SPECIAL_BLOCK_FONT_OPTIONS: Array<{
  value: TimetableSpecialBlockFontFamily;
  label: string;
  cssFamily: string;
}> = [
  { value: 'SANS', label: 'Plus Jakarta Sans (Hiện đại)', cssFamily: '"Plus Jakarta Sans", sans-serif' },
  { value: 'DISPLAY', label: 'Outfit (Nổi bật tiêu đề)', cssFamily: '"Outfit", "Plus Jakarta Sans", sans-serif' },
  { value: 'SERIF', label: 'Georgia Serif (Trang trọng)', cssFamily: 'Georgia, "Times New Roman", serif' },
  { value: 'MONO', label: 'Monospace (Kỹ thuật / Rõ nét)', cssFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
];

export const SPECIAL_BLOCK_COLOR_PRESETS: Array<{
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
}> = [
  { label: 'Đỏ Nghỉ lễ', bgColor: '#FEF2F2', borderColor: '#DC2626', textColor: '#991B1B', accentColor: '#DC2626' },
  { label: 'Hổ phách Phụ đạo', bgColor: '#FFFBEB', borderColor: '#D97706', textColor: '#92400E', accentColor: '#D97706' },
  { label: 'Chàm Thi thử', bgColor: '#EEF2FF', borderColor: '#4338CA', textColor: '#312E81', accentColor: '#4338CA' },
  { label: 'Ngọc Lục Bảo', bgColor: '#ECFDF5', borderColor: '#059669', textColor: '#065F46', accentColor: '#059669' },
  { label: 'Xanh Navy Đậm', bgColor: '#1E3A8A', borderColor: '#F59E0B', textColor: '#FFFFFF', accentColor: '#FCD34D' },
  { label: 'Tím Chuyên đề', bgColor: '#F5F3FF', borderColor: '#7C3AED', textColor: '#4C1D95', accentColor: '#7C3AED' },
];

/**
 * 4 Ready-to-Use Special Override Timetable Block Templates (highest priority over normal shifts).
 */
export const SPECIAL_BLOCK_TEMPLATES: SpecialBlockTemplate[] = [
  {
    templateKey: 'tpl-nghi',
    label: '01. NGHỈ HỌC / TẠM NGHỈ',
    description: 'Ưu tiên cao nhất thay thế toàn bộ ca học thường tại các ô được tick (nghỉ lễ, nghỉ đột xuất, bảo trì).',
    defaults: {
      templateKey: 'tpl-nghi',
      blockType: 'NGHI',
      title: 'NGHỈ HỌC',
      subtitle: 'Tạm nghỉ theo thông báo trung tâm — Học sinh không đến lớp ca này',
      shiftKeys: [],
      targetClasses: [],
      bgColor: '#FEF2F2',
      borderColor: '#DC2626',
      textColor: '#991B1B',
      accentColor: '#DC2626',
      borderWidth: 2,
      borderStyle: 'dashed',
      fontFamily: 'DISPLAY',
      fontSize: 'MD',
      fontWeight: 'EXTRABOLD',
      priority: 100,
      active: true,
    },
  },
  {
    templateKey: 'tpl-phu-dao',
    label: '02. PHỤ ĐẠO / KÈM SÁT 1-1',
    description: 'Chèn khối Phụ đạo tăng cường vào các ca trống hoặc thay thế ca thường để ôn luyện trọng tâm.',
    defaults: {
      templateKey: 'tpl-phu-dao',
      blockType: 'PHU_DAO',
      title: 'PHỤ ĐẠO CHUYÊN SÂU',
      subtitle: 'Ôn tập trọng tâm & kèm sát lỗ hổng kiến thức cùng đội ngũ GV Trả bài',
      shiftKeys: [],
      targetClasses: [],
      bgColor: '#FFFBEB',
      borderColor: '#D97706',
      textColor: '#92400E',
      accentColor: '#D97706',
      borderWidth: 2,
      borderStyle: 'solid',
      fontFamily: 'SANS',
      fontSize: 'MD',
      fontWeight: 'BOLD',
      priority: 85,
      active: true,
    },
  },
  {
    templateKey: 'tpl-kiem-tra',
    label: '03. KIỂM TRA ĐỊNH KỲ / THI THỬ',
    description: 'Đặt lịch thi thử Lớp 10, THPT hoặc kiểm tra định kỳ toàn khối thay thế ca học thông thường.',
    defaults: {
      templateKey: 'tpl-kiem-tra',
      blockType: 'KIEM_TRA',
      title: 'KIỂM TRA ĐỊNH KỲ',
      subtitle: 'Thi thử chuẩn cấu trúc GDPT 2018 · Chấm bài & báo điểm Phụ huynh',
      shiftKeys: [],
      targetClasses: [],
      bgColor: '#EEF2FF',
      borderColor: '#4338CA',
      textColor: '#312E81',
      accentColor: '#4338CA',
      borderWidth: 2,
      borderStyle: 'double',
      fontFamily: 'SERIF',
      fontSize: 'MD',
      fontWeight: 'EXTRABOLD',
      priority: 90,
      active: true,
    },
  },
  {
    templateKey: 'tpl-su-kien',
    label: '04. SINH HOẠT / HỌP PHỤ HUYNH',
    description: 'Thông báo lịch họp phụ huynh, ngoại khóa hoặc hướng nghiệp ngay trên lưới Thời khóa biểu.',
    defaults: {
      templateKey: 'tpl-su-kien',
      blockType: 'SU_KIEN',
      title: 'HỌP PHỤ HUYNH · CHUYÊN ĐỀ',
      subtitle: 'Trao đổi trực tiếp tiến bộ học tập & định hướng ôn thi cùng Ban Học vụ',
      shiftKeys: [],
      targetClasses: [],
      bgColor: '#ECFDF5',
      borderColor: '#059669',
      textColor: '#065F46',
      accentColor: '#059669',
      borderWidth: 2,
      borderStyle: 'solid',
      fontFamily: 'SANS',
      fontSize: 'MD',
      fontWeight: 'BOLD',
      priority: 80,
      active: true,
    },
  },
];

const VALID_SHIFT_SET = new Set<string>(ALL_SHIFT_KEYS);

export function sanitizeHexColor(raw: unknown, fallback: string): string {
  const s = String(raw || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

export function sanitizeShiftKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  const unique = new Set<string>();
  for (const item of keys) {
    const k = String(item || '').trim().toUpperCase();
    if (VALID_SHIFT_SET.has(k)) {
      unique.add(k);
    }
  }
  return Array.from(unique);
}

export function resolveSpecialBlockFontCss(fontFamily?: TimetableSpecialBlockFontFamily): string {
  const found = SPECIAL_BLOCK_FONT_OPTIONS.find((f) => f.value === fontFamily);
  return found ? found.cssFamily : SPECIAL_BLOCK_FONT_OPTIONS[0].cssFamily;
}

export function getSpecialBlockVisualStyle(block: TimetableSpecialBlock): {
  containerStyle: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: string;
    borderStyle: string;
    color: string;
    fontFamily: string;
  };
  titleSizeClass: string;
  subtitleSizeClass: string;
  weightClass: string;
} {
  const titleSizeClass =
    block.fontSize === 'LG' ? 'text-sm' : block.fontSize === 'SM' ? 'text-[11px]' : 'text-xs';
  const subtitleSizeClass =
    block.fontSize === 'LG' ? 'text-xs' : block.fontSize === 'SM' ? 'text-[10px]' : 'text-[11px]';
  const weightClass =
    block.fontWeight === 'EXTRABOLD'
      ? 'font-extrabold'
      : block.fontWeight === 'SEMIBOLD'
        ? 'font-semibold'
        : 'font-bold';

  return {
    containerStyle: {
      backgroundColor: sanitizeHexColor(block.bgColor, '#FEF2F2'),
      borderColor: sanitizeHexColor(block.borderColor, '#DC2626'),
      borderWidth: `${Math.min(3, Math.max(1, Number(block.borderWidth) || 2))}px`,
      borderStyle:
        block.borderStyle === 'dashed' || block.borderStyle === 'double'
          ? block.borderStyle
          : 'solid',
      color: sanitizeHexColor(block.textColor, '#991B1B'),
      fontFamily: resolveSpecialBlockFontCss(block.fontFamily),
    },
    titleSizeClass,
    subtitleSizeClass,
    weightClass,
  };
}

/**
 * Checks whether a special block applies to a specific class (or entire center when targetClasses is empty).
 */
export function specialBlockMatchesClass(
  block: TimetableSpecialBlock,
  centerClass?: string | null,
): boolean {
  if (!Array.isArray(block.targetClasses) || block.targetClasses.length === 0) {
    return true; // Toàn trung tâm
  }
  if (!centerClass || centerClass === 'Tất cả lớp') {
    return true;
  }
  const normalizedTarget = centerClass.trim().toLowerCase();
  return block.targetClasses.some((c) => c.trim().toLowerCase() === normalizedTarget);
}

/**
 * Returns the highest-priority active TimetableSpecialBlock overriding a given weekly shift cell.
 * Because Special Blocks hold highest replacement priority, when non-null it replaces normal slots in that cell.
 */
export function resolveHighestPrioritySpecialBlock(
  blocks: TimetableSpecialBlock[] | undefined,
  shiftKey: string,
  centerClass?: string | null,
): TimetableSpecialBlock | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const matched = blocks
    .filter(
      (b) =>
        b &&
        b.active &&
        Array.isArray(b.shiftKeys) &&
        b.shiftKeys.includes(shiftKey) &&
        specialBlockMatchesClass(b, centerClass),
    )
    .sort((a, b) => {
      const pDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
      if (pDiff !== 0) return pDiff;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

  return matched[0] || null;
}

/**
 * Returns ALL active special blocks matching a cell (sorted by highest priority first),
 * useful when viewing "Tất cả lớp" in Backend where one block might be class-specific and another global.
 */
export function resolveActiveSpecialBlocksForCell(
  blocks: TimetableSpecialBlock[] | undefined,
  shiftKey: string,
  centerClass?: string | null,
): TimetableSpecialBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const list = blocks
    .filter(
      (b) =>
        b &&
        b.active &&
        Array.isArray(b.shiftKeys) &&
        b.shiftKeys.includes(shiftKey) &&
        specialBlockMatchesClass(b, centerClass),
    )
    .sort((a, b) => {
      const pDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
      if (pDiff !== 0) return pDiff;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

  // If a global (Toàn trung tâm) block has highest priority, it supersedes everything in this cell
  if (list.length > 0 && (!list[0].targetClasses || list[0].targetClasses.length === 0)) {
    return [list[0]];
  }
  return list;
}
