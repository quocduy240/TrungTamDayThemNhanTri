import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  BANNER_AUDIENCE_LABELS,
  BANNER_CATEGORY_LABELS,
  BANNER_LAYOUT_LABELS,
  BANNER_PLACEMENT_LABELS,
  BANNER_TEMPLATES,
  renderPromoBannerPngDataUrl,
  sanitizeSafeUrl,
} from '../lib/contentStudioEngine';
import type {
  BannerAudience,
  BannerCategory,
  BannerLayoutStyle,
  BannerPlacement,
  PromoBanner,
} from '../types';
import { GoogleDrivePickerModal } from './GoogleDrivePickerModal';

export interface PromoBannerStudioProps {
  banners: PromoBanner[];
  onRefresh: () => Promise<void>;
}

const COLOR_PRESETS: Array<{
  label: string;
  bgStart: string;
  bgEnd: string;
  accentColor: string;
  textColor: string;
}> = [
  { label: 'Navy Nhân Trí', bgStart: '#1E3A8A', bgEnd: '#0F172A', accentColor: '#F59E0B', textColor: '#FFFFFF' },
  { label: 'Tết Đỏ Vàng', bgStart: '#991B1B', bgEnd: '#7F1D1D', accentColor: '#FCD34D', textColor: '#FFFFFF' },
  { label: 'Ngọc Lục Bảo', bgStart: '#065F46', bgEnd: '#047857', accentColor: '#FDE68A', textColor: '#FFFFFF' },
  { label: 'Tím Học Thuật', bgStart: '#312E81', bgEnd: '#1E1B4B', accentColor: '#FBBF24', textColor: '#FFFFFF' },
  { label: 'Cảnh báo Đỏ Cam', bgStart: '#B91C1C', bgEnd: '#9A3412', accentColor: '#FEF08A', textColor: '#FFFFFF' },
  { label: 'Xanh Dương Sáng', bgStart: '#0369A1', bgEnd: '#0F172A', accentColor: '#38BDF8', textColor: '#FFFFFF' },
];

type DraftBanner = Omit<PromoBanner, 'id' | 'updatedAt' | 'updatedBy'>;

export const PromoBannerStudio: React.FC<PromoBannerStudioProps> = ({ banners, onRefresh }) => {
  const [templateTab, setTemplateTab] = useState<BannerCategory>('ADMISSIONS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftBanner>(() => ({ ...BANNER_TEMPLATES[0].defaults }));
  const [saving, setSaving] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const templatesInCategory = useMemo(
    () => BANNER_TEMPLATES.filter((t) => t.category === templateTab),
    [templateTab],
  );

  const applyTemplate = (templateKey: string) => {
    const found = BANNER_TEMPLATES.find((t) => t.templateKey === templateKey);
    if (!found) return;
    setEditingId(null);
    setDraft({ ...found.defaults, active: true });
    showToast('ok', `Đã nạp mẫu "${found.label}". Tùy chỉnh màu sắc, chữ hoặc ảnh rồi bấm Lưu.`);
  };

  const loadExistingIntoEditor = (banner: PromoBanner) => {
    setEditingId(banner.id);
    setTemplateTab(banner.category);
    setDraft({
      templateKey: banner.templateKey,
      category: banner.category,
      kicker: banner.kicker,
      headline: banner.headline,
      subheadline: banner.subheadline,
      ctaLabel: banner.ctaLabel,
      ctaHref: banner.ctaHref,
      imageUrl: banner.imageUrl || '',
      bgStart: banner.bgStart,
      bgEnd: banner.bgEnd,
      accentColor: banner.accentColor,
      textColor: banner.textColor,
      layoutStyle: banner.layoutStyle,
      textAlign: banner.textAlign,
      fontSizeScale: banner.fontSizeScale,
      overlayOpacity: banner.overlayOpacity,
      borderStyle: banner.borderStyle,
      placement: banner.placement,
      audience: banner.audience,
      startDate: banner.startDate || '',
      endDate: banner.endDate || '',
      active: banner.active,
      priority: banner.priority,
    });
  };

  const handleLocalImageUpload = async (file: File) => {
    if (file.size > 12 * 1024 * 1024) {
      showToast('err', 'Ảnh banner vượt quá 12MB. Vui lòng chọn ảnh nhẹ hơn.');
      return;
    }
    const objUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Không đọc được định dạng ảnh.'));
        el.src = objUrl;
      });
      const scale = img.width > 1400 ? 1400 / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
        setDraft((prev) => ({
          ...prev,
          imageUrl: dataUrl,
          layoutStyle: prev.layoutStyle === 'CENTER_CARD' ? 'SPLIT_IMAGE' : prev.layoutStyle,
        }));
        showToast('ok', 'Đã tải ảnh minh họa vào Banner.');
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Lỗi đọc ảnh.');
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  };

  const handleSaveBanner = async () => {
    if (!draft.headline.trim()) {
      showToast('err', 'Vui lòng nhập tiêu đề chính của Banner.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/v1/promo-banners/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: JSON.stringify(draft),
        });
        showToast('ok', 'Đã cập nhật Banner quảng cáo & đồng bộ ra Frontend.');
      } else {
        const res = await apiRequest<{ banner: PromoBanner }>('/api/v1/promo-banners', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        setEditingId(res.banner.id);
        showToast('ok', 'Đã lưu Banner quảng cáo mới.');
      }
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không thể lưu Banner.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBannerActive = async (banner: PromoBanner) => {
    try {
      await apiRequest(`/api/v1/promo-banners/${encodeURIComponent(banner.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !banner.active }),
      });
      await onRefresh();
      showToast(
        'ok',
        !banner.active
          ? `Đã bật hiển thị "${banner.headline}" ngoài Frontend.`
          : `Đã tạm ẩn "${banner.headline}".`,
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không đổi được trạng thái Banner.');
    }
  };

  const handleDuplicateBanner = async (banner: PromoBanner) => {
    try {
      const { id: _id, updatedAt: _u, updatedBy: _ub, ...rest } = banner;
      await apiRequest('/api/v1/promo-banners', {
        method: 'POST',
        body: JSON.stringify({
          ...rest,
          headline: `${banner.headline} (Bản sao)`,
          active: false,
        }),
      });
      await onRefresh();
      showToast('ok', 'Đã nhân bản Banner thành công.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không nhân bản được Banner.');
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await apiRequest(`/api/v1/promo-banners/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (editingId === id) {
        setEditingId(null);
      }
      setConfirmDeleteId(null);
      await onRefresh();
      showToast('ok', 'Đã xóa Banner quảng cáo.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không xóa được Banner.');
    }
  };

  const handleDownloadPng = async () => {
    setExportingPng(true);
    try {
      const previewBanner: PromoBanner = {
        ...draft,
        id: editingId || 'preview',
        updatedAt: new Date().toISOString(),
      };
      const dataUrl = await renderPromoBannerPngDataUrl(previewBanner);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `banner-nhantri-${draft.placement.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('ok', 'Đã xuất ảnh PNG độ nét cao 2x sẵn sàng đăng Facebook / Zalo!');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không thể xuất ảnh PNG.');
    } finally {
      setExportingPng(false);
    }
  };

  const safePreviewImage = sanitizeSafeUrl(draft.imageUrl || '', true);

  return (
    <div className="space-y-5">
      {/* Header + 10 Template Gallery */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Studio Thiết kế Banner Quảng Cáo &amp; Thông Báo (10 Mẫu chuẩn Nhân Trí)
            </h3>
            <p className="text-xs text-slate-500">
              Chọn nhanh 1 trong 10 mẫu Chiêu sinh, Nghỉ lễ/Tết hoặc Thông báo đột xuất — tùy chỉnh
              trực quan màu sắc, ảnh Google Drive, đặt đa vị trí ngoài Frontend &amp; xuất ảnh PNG đăng
              Zalo/Facebook.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['ADMISSIONS', 'HOLIDAY', 'URGENT'] as BannerCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setTemplateTab(cat)}
                className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  templateTab === cat
                    ? 'bg-blue-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {BANNER_CATEGORY_LABELS[cat]} (
                {BANNER_TEMPLATES.filter((t) => t.category === cat).length})
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templatesInCategory.map((tpl) => {
            const selected = draft.templateKey === tpl.templateKey;
            return (
              <button
                key={tpl.templateKey}
                type="button"
                onClick={() => applyTemplate(tpl.templateKey)}
                className={`group flex flex-col overflow-hidden rounded-xl border-2 text-left transition ${
                  selected
                    ? 'border-blue-700 shadow-md'
                    : 'border-slate-200 hover:border-blue-400 hover:shadow-sm'
                }`}
              >
                <div
                  className="p-3.5"
                  style={{
                    background: `linear-gradient(135deg, ${tpl.defaults.bgStart}, ${tpl.defaults.bgEnd})`,
                    color: tpl.defaults.textColor,
                  }}
                >
                  <p
                    className="truncate text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: tpl.defaults.accentColor }}
                  >
                    {tpl.defaults.kicker}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs font-extrabold leading-snug">
                    {tpl.defaults.headline}
                  </p>
                </div>
                <div className="flex flex-1 flex-col justify-between bg-white p-3">
                  <div>
                    <p className="text-xs font-extrabold text-slate-900">{tpl.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                      {tpl.description}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] font-bold text-blue-800">
                    Vị trí gợi ý: {BANNER_PLACEMENT_LABELS[tpl.defaults.placement]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {toast && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${
            toast.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Split Studio: Left Visual Controls | Right Live Preview + Saved List */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Visual Graphic Customizer */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Palette className="h-4 w-4 text-blue-800" />
              {editingId ? 'Đang chỉnh sửa Banner đã lưu' : 'Tùy biến đồ họa & nội dung Banner'}
            </h4>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ ...BANNER_TEMPLATES[0].defaults });
                }}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                + Tạo mới
              </button>
            )}
          </div>

          {/* Content Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600">Dòng nhấn nhỏ (Kicker)</label>
              <input
                type="text"
                value={draft.kicker}
                onChange={(e) => setDraft({ ...draft, kicker: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600">Tiêu đề chính (Headline)</label>
              <input
                type="text"
                value={draft.headline}
                onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-extrabold outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600">Mô tả chi tiết</label>
              <textarea
                rows={2}
                value={draft.subheadline}
                onChange={(e) => setDraft({ ...draft, subheadline: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600">Chữ nút hành động (CTA)</label>
                <input
                  type="text"
                  value={draft.ctaLabel}
                  onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600">Liên kết đích</label>
                <input
                  type="text"
                  value={draft.ctaHref}
                  onChange={(e) => setDraft({ ...draft, ctaHref: e.target.value })}
                  placeholder="#courses hoặc https://..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-700"
                />
              </div>
            </div>
          </div>

          {/* Placement & Targeting */}
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-700">
              <Layers className="h-3.5 w-3.5 text-blue-800" />
              Vị trí chèn ngoài Frontend &amp; Lịch hiển thị
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Vị trí hiển thị</label>
                <select
                  value={draft.placement}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      placement: e.target.value as BannerPlacement,
                      layoutStyle:
                        e.target.value === 'TOP_BAR'
                          ? 'SLIM_STRIP'
                          : draft.layoutStyle === 'SLIM_STRIP'
                          ? 'SPLIT_IMAGE'
                          : draft.layoutStyle,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  {(Object.keys(BANNER_PLACEMENT_LABELS) as BannerPlacement[]).map((p) => (
                    <option key={p} value={p}>
                      {BANNER_PLACEMENT_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Đối tượng thấy</label>
                <select
                  value={draft.audience}
                  onChange={(e) =>
                    setDraft({ ...draft, audience: e.target.value as BannerAudience })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  {(Object.keys(BANNER_AUDIENCE_LABELS) as BannerAudience[]).map((a) => (
                    <option key={a} value={a}>
                      {BANNER_AUDIENCE_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Từ ngày (tùy chọn)</label>
                <input
                  type="date"
                  value={draft.startDate || ''}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Đến ngày (tùy chọn)</label>
                <input
                  type="date"
                  value={draft.endDate || ''}
                  onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs tabular-nums"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-900">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-4 w-4 accent-emerald-700"
              />
              Kích hoạt hiển thị ngay ngoài Frontend sau khi lưu
            </label>
          </div>

          {/* Visual Graphics Controls */}
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Đồ họa, Màu sắc &amp; Hình ảnh
            </p>

            {/* Quick color palettes */}
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      bgStart: p.bgStart,
                      bgEnd: p.bgEnd,
                      accentColor: p.accentColor,
                      textColor: p.textColor,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-white"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${p.bgStart}, ${p.bgEnd})` }}
                  />
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['bgStart', 'Nền 1'],
                  ['bgEnd', 'Nền 2'],
                  ['accentColor', 'Điểm nhấn'],
                  ['textColor', 'Màu chữ'],
                ] as const
              ).map(([field, lbl]) => (
                <label
                  key={field}
                  className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] font-bold text-slate-600"
                >
                  <span>{lbl}</span>
                  <input
                    type="color"
                    value={draft[field]}
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                    className="mt-1 h-7 w-full cursor-pointer rounded border-0 bg-transparent"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Bố cục đồ họa</label>
                <select
                  value={draft.layoutStyle}
                  onChange={(e) =>
                    setDraft({ ...draft, layoutStyle: e.target.value as BannerLayoutStyle })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold"
                >
                  {(Object.keys(BANNER_LAYOUT_LABELS) as BannerLayoutStyle[]).map((l) => (
                    <option key={l} value={l}>
                      {BANNER_LAYOUT_LABELS[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Khung viền &amp; Căn lề</label>
                <div className="mt-1 flex gap-1.5">
                  <select
                    value={draft.borderStyle}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        borderStyle: e.target.value as 'NONE' | 'CLEAN' | 'FESTIVE',
                      })
                    }
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-bold"
                  >
                    <option value="CLEAN">Viền tinh tế</option>
                    <option value="FESTIVE">Viền lễ hội</option>
                    <option value="NONE">Không viền</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        textAlign: draft.textAlign === 'left' ? 'center' : 'left',
                      })
                    }
                    className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700"
                  >
                    {draft.textAlign === 'left' ? 'Trái' : 'Giữa'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px] font-bold text-slate-600">
                Cỡ chữ: {Math.round(draft.fontSizeScale * 100)}%
                <input
                  type="range"
                  min={0.85}
                  max={1.2}
                  step={0.05}
                  value={draft.fontSizeScale}
                  onChange={(e) => setDraft({ ...draft, fontSizeScale: Number(e.target.value) })}
                  className="mt-1 w-full accent-blue-900"
                />
              </label>
              <label className="block text-[11px] font-bold text-slate-600">
                Lớp phủ ảnh nền: {Math.round(draft.overlayOpacity * 100)}%
                <input
                  type="range"
                  min={0.2}
                  max={0.85}
                  step={0.05}
                  value={draft.overlayOpacity}
                  onChange={(e) => setDraft({ ...draft, overlayOpacity: Number(e.target.value) })}
                  className="mt-1 w-full accent-blue-900"
                />
              </label>
            </div>

            {/* Banner image uploader */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500">
                Ảnh minh họa / Ảnh nền Banner (Từ máy hoặc Google Drive cá nhân)
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLocalImageUpload(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Tải từ máy
                </button>
                <button
                  type="button"
                  onClick={() => setDriveOpen(true)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Google Drive
                </button>
                {draft.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, imageUrl: '' })}
                    className="min-h-[40px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                  >
                    Bỏ ảnh
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Primary Save & Export buttons */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveBanner()}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Đang lưu...' : editingId ? 'Lưu cập nhật Banner' : 'Lưu & Xuất bản Banner'}
            </button>
            <button
              type="button"
              disabled={exportingPng}
              onClick={() => void handleDownloadPng()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exportingPng ? 'Đang xuất...' : 'Tải ảnh PNG'}
            </button>
          </div>
        </div>

        {/* Right: Live Multi-Placement Preview + Saved Banners Management */}
        <div className="space-y-5 xl:col-span-7">
          {/* Live Preview Stage */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-blue-800">
                  Xem trước trực tiếp · {BANNER_PLACEMENT_LABELS[draft.placement]}
                </p>
                <p className="text-xs text-slate-500">
                  Đối tượng: {BANNER_AUDIENCE_LABELS[draft.audience]} · Bố cục:{' '}
                  {BANNER_LAYOUT_LABELS[draft.layoutStyle]}
                </p>
              </div>
              <span
                className={`text-xs font-bold ${
                  draft.active ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {draft.active ? 'Sẵn sàng hiển thị' : 'Đang tắt'}
              </span>
            </div>

            {/* Simulated Banner Preview */}
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-100 p-4">
              {draft.placement === 'TOP_BAR' ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-sm"
                  style={{
                    background: `linear-gradient(90deg, ${draft.bgStart}, ${draft.bgEnd})`,
                    color: draft.textColor,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    <span
                      className="font-extrabold uppercase tracking-wider"
                      style={{ color: draft.accentColor }}
                    >
                      {draft.kicker}
                    </span>
                    <span className="opacity-50">|</span>
                    <span className="font-bold">{draft.headline}</span>
                  </div>
                  {draft.ctaLabel && (
                    <span
                      className="rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-950"
                      style={{ backgroundColor: draft.accentColor }}
                    >
                      {draft.ctaLabel}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={`relative overflow-hidden rounded-2xl p-6 shadow-lg sm:p-8 ${
                    draft.borderStyle === 'FESTIVE'
                      ? 'ring-2 ring-amber-300/80 ring-offset-2 ring-offset-slate-100'
                      : draft.borderStyle === 'CLEAN'
                      ? 'border border-white/25'
                      : ''
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${draft.bgStart}, ${draft.bgEnd})`,
                    color: draft.textColor,
                  }}
                >
                  {safePreviewImage && draft.layoutStyle === 'FULL_BG' && (
                    <>
                      <img
                        src={safePreviewImage}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div
                        className="absolute inset-0 bg-slate-950"
                        style={{ opacity: draft.overlayOpacity }}
                      />
                    </>
                  )}

                  <div
                    className={`relative z-10 grid grid-cols-1 items-center gap-6 ${
                      safePreviewImage && draft.layoutStyle === 'SPLIT_IMAGE'
                        ? 'md:grid-cols-12'
                        : ''
                    }`}
                  >
                    <div
                      className={`${
                        safePreviewImage && draft.layoutStyle === 'SPLIT_IMAGE'
                          ? 'md:col-span-7'
                          : ''
                      } ${
                        draft.textAlign === 'center' &&
                        !(safePreviewImage && draft.layoutStyle === 'SPLIT_IMAGE')
                          ? 'mx-auto max-w-2xl text-center'
                          : 'text-left'
                      }`}
                    >
                      <p
                        className="text-xs font-extrabold uppercase tracking-widest"
                        style={{ color: draft.accentColor }}
                      >
                        {draft.kicker}
                      </p>
                      <h4
                        className="mt-2 font-extrabold leading-tight"
                        style={{ fontSize: `${Math.round(24 * draft.fontSizeScale)}px` }}
                      >
                        {draft.headline}
                      </h4>
                      <p
                        className="mt-2.5 opacity-90"
                        style={{ fontSize: `${Math.round(14 * draft.fontSizeScale)}px` }}
                      >
                        {draft.subheadline}
                      </p>
                      {draft.ctaLabel && (
                        <div className="mt-5">
                          <span
                            className="inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm"
                            style={{ backgroundColor: draft.accentColor }}
                          >
                            {draft.ctaLabel}
                          </span>
                        </div>
                      )}
                    </div>

                    {safePreviewImage && draft.layoutStyle === 'SPLIT_IMAGE' && (
                      <div className="md:col-span-5">
                        <img
                          src={safePreviewImage}
                          alt={draft.headline}
                          className="h-48 w-full rounded-xl border border-white/25 object-cover shadow-md"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Saved Banners List */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-slate-900">
                Danh sách Banner đã lưu ({banners.length})
              </h4>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ ...BANNER_TEMPLATES[0].defaults });
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Tạo Banner mới
              </button>
            </div>

            {banners.length === 0 ? (
              <p className="mt-4 text-center text-xs text-slate-500">
                Chưa có Banner nào được lưu. Chọn 1 trong 10 mẫu phía trên để tạo ngay.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200">
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold text-white shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${b.bgStart}, ${b.bgEnd})` }}
                      >
                        {b.placement === 'TOP_BAR'
                          ? 'TOP'
                          : b.placement === 'POPUP'
                          ? 'POPUP'
                          : b.placement === 'HERO_SPOTLIGHT'
                          ? 'HERO'
                          : 'GIỮA'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-bold text-blue-800">
                            {BANNER_PLACEMENT_LABELS[b.placement]}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500">
                            {BANNER_AUDIENCE_LABELS[b.audience]}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span
                            className={`inline-flex items-center gap-1 font-bold ${
                              b.active ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {b.active && <CheckCircle2 className="h-3 w-3" />}
                            {b.active ? 'Đang bật' : 'Đang tắt'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                          {b.headline}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleBannerActive(b)}
                        className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                          b.active
                            ? 'border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        {b.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {b.active ? 'Tạm ẩn' : 'Bật'}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadExistingIntoEditor(b)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Sửa
                      </button>
                      <button
                        type="button"
                        title="Nhân bản"
                        onClick={() => void handleDuplicateBanner(b)}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {confirmDeleteId === b.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDeleteBanner(b.id)}
                            className="min-h-[38px] rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[38px] rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title="Xóa banner"
                          onClick={() => setConfirmDeleteId(b.id)}
                          className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personal Google Drive Image Picker for Banner */}
      <GoogleDrivePickerModal
        open={driveOpen}
        mode="IMAGES"
        title="Chọn ảnh minh họa Banner từ Google Drive cá nhân"
        onSelectImage={(dataUrl, fileName) => {
          setDraft((prev) => ({
            ...prev,
            imageUrl: dataUrl,
            layoutStyle: prev.layoutStyle === 'CENTER_CARD' ? 'SPLIT_IMAGE' : prev.layoutStyle,
          }));
          showToast('ok', `Đã chèn ảnh "${fileName}" từ Google Drive vào Banner.`);
          setDriveOpen(false);
        }}
        onClose={() => setDriveOpen(false)}
      />
    </div>
  );
};
