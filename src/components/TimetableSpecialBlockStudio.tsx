import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Palette,
  Plus,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ALL_SHIFT_KEYS, DAYS, SHIFT_ROWS, makeShiftKey } from '../lib/timetableEngine';
import {
  SPECIAL_BLOCK_COLOR_PRESETS,
  SPECIAL_BLOCK_FONT_OPTIONS,
  SPECIAL_BLOCK_TEMPLATES,
  SPECIAL_BLOCK_TYPE_LABELS,
  getSpecialBlockVisualStyle,
} from '../lib/timetableSpecialBlocks';
import type {
  SessionPeriod,
  TimetableSpecialBlock,
  TimetableSpecialBlockFontFamily,
  TimetableSpecialBlockType,
} from '../types';

export interface TimetableSpecialBlockStudioProps {
  blocks: TimetableSpecialBlock[];
  availableClasses: string[];
  initialEditBlockId?: string | null;
  onRefresh: () => Promise<void>;
  onJumpToGrid?: () => void;
}

type DraftBlock = Omit<TimetableSpecialBlock, 'id' | 'updatedAt' | 'updatedBy'>;

export const TimetableSpecialBlockStudio: React.FC<TimetableSpecialBlockStudioProps> = ({
  blocks,
  availableClasses,
  initialEditBlockId,
  onRefresh,
  onJumpToGrid,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftBlock>(() => ({
    ...SPECIAL_BLOCK_TEMPLATES[0].defaults,
    shiftKeys: [],
    targetClasses: [],
  }));
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    if (!initialEditBlockId) return;
    const found = blocks.find((b) => b.id === initialEditBlockId);
    if (found) {
      loadBlockIntoEditor(found);
    }
  }, [initialEditBlockId, blocks]);

  function loadBlockIntoEditor(b: TimetableSpecialBlock) {
    setEditingId(b.id);
    setDraft({
      templateKey: b.templateKey,
      blockType: b.blockType,
      title: b.title,
      subtitle: b.subtitle || '',
      shiftKeys: [...(b.shiftKeys || [])],
      targetClasses: [...(b.targetClasses || [])],
      bgColor: b.bgColor,
      borderColor: b.borderColor,
      textColor: b.textColor,
      accentColor: b.accentColor,
      borderWidth: b.borderWidth,
      borderStyle: b.borderStyle,
      fontFamily: b.fontFamily,
      fontSize: b.fontSize,
      fontWeight: b.fontWeight,
      priority: b.priority,
      active: b.active,
    });
  }

  function applyTemplate(templateKey: string) {
    const found = SPECIAL_BLOCK_TEMPLATES.find((t) => t.templateKey === templateKey);
    if (!found) return;
    setEditingId(null);
    setDraft((prev) => ({
      ...found.defaults,
      // Keep currently checked shifts if admin is switching templates while picking shifts
      shiftKeys: prev.shiftKeys.length > 0 ? prev.shiftKeys : [],
      targetClasses: [],
    }));
    showToast('ok', `Đã nạp mẫu "${found.label}". Tích chọn các ca học trên lưới tuần rồi bấm Lưu.`);
  }

  function toggleShiftKey(key: string) {
    setDraft((prev) => {
      const exists = prev.shiftKeys.includes(key);
      return {
        ...prev,
        shiftKeys: exists ? prev.shiftKeys.filter((k) => k !== key) : [...prev.shiftKeys, key],
      };
    });
  }

  function toggleColumnDay(dayCode: string) {
    const colKeys = SHIFT_ROWS.map((r) => makeShiftKey(dayCode as 'T2', r.period, r.shift));
    const allChecked = colKeys.every((k) => draft.shiftKeys.includes(k));
    setDraft((prev) => ({
      ...prev,
      shiftKeys: allChecked
        ? prev.shiftKeys.filter((k) => !colKeys.includes(k))
        : Array.from(new Set([...prev.shiftKeys, ...colKeys])),
    }));
  }

  function toggleRowShift(period: SessionPeriod, shift: 'CA_1' | 'CA_2') {
    const rowKeys = DAYS.map((d) => makeShiftKey(d.code, period, shift));
    const allChecked = rowKeys.every((k) => draft.shiftKeys.includes(k));
    setDraft((prev) => ({
      ...prev,
      shiftKeys: allChecked
        ? prev.shiftKeys.filter((k) => !rowKeys.includes(k))
        : Array.from(new Set([...prev.shiftKeys, ...rowKeys])),
    }));
  }

  function selectPeriodPreset(period: SessionPeriod | 'ALL' | 'CLEAR') {
    if (period === 'CLEAR') {
      setDraft((prev) => ({ ...prev, shiftKeys: [] }));
      return;
    }
    if (period === 'ALL') {
      setDraft((prev) => ({ ...prev, shiftKeys: [...ALL_SHIFT_KEYS] }));
      return;
    }
    const keys = ALL_SHIFT_KEYS.filter((k) => k.includes(`_${period}_`));
    const allChecked = keys.every((k) => draft.shiftKeys.includes(k));
    setDraft((prev) => ({
      ...prev,
      shiftKeys: allChecked
        ? prev.shiftKeys.filter((k) => !keys.includes(k))
        : Array.from(new Set([...prev.shiftKeys, ...keys])),
    }));
  }

  function toggleTargetClass(cls: string) {
    setDraft((prev) => {
      const exists = prev.targetClasses.includes(cls);
      return {
        ...prev,
        targetClasses: exists
          ? prev.targetClasses.filter((c) => c !== cls)
          : [...prev.targetClasses, cls],
      };
    });
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      showToast('err', 'Vui lòng nhập tiêu đề Block (ví dụ: NGHỈ HỌC, PHỤ ĐẠO...).');
      return;
    }
    if (draft.shiftKeys.length === 0) {
      showToast('err', 'Vui lòng tick chọn ít nhất 1 ca học trên lưới Thời khóa biểu tuần.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/v1/timetable/special-blocks/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: JSON.stringify(draft),
        });
        showToast('ok', `Đã cập nhật Block "${draft.title}" trên ${draft.shiftKeys.length} ca học.`);
      } else {
        const res = await apiRequest<{ block: TimetableSpecialBlock }>(
          '/api/v1/timetable/special-blocks',
          {
            method: 'POST',
            body: JSON.stringify(draft),
          },
        );
        setEditingId(res.block.id);
        showToast(
          'ok',
          `Đã áp dụng Block "${draft.title}" (ưu tiên thay thế cao nhất) vào ${draft.shiftKeys.length} ca học.`,
        );
      }
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không thể lưu Block đặc biệt.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(block: TimetableSpecialBlock) {
    try {
      await apiRequest(`/api/v1/timetable/special-blocks/${encodeURIComponent(block.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !block.active }),
      });
      await onRefresh();
      showToast(
        'ok',
        !block.active
          ? `Đã bật Block "${block.title}" — đang thay thế ưu tiên cao nhất trên TKB.`
          : `Đã tạm tắt Block "${block.title}" — các ca học thường tự động hiển thị trở lại.`,
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không đổi được trạng thái Block.');
    }
  }

  async function handleDuplicate(block: TimetableSpecialBlock) {
    try {
      const { id: _id, updatedAt: _u, updatedBy: _ub, ...rest } = block;
      await apiRequest('/api/v1/timetable/special-blocks', {
        method: 'POST',
        body: JSON.stringify({
          ...rest,
          title: `${block.title} (Bản sao)`,
          active: false,
        }),
      });
      await onRefresh();
      showToast('ok', 'Đã nhân bản Block đặc biệt.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không nhân bản được Block.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiRequest(`/api/v1/timetable/special-blocks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (editingId === id) {
        setEditingId(null);
      }
      setConfirmDeleteId(null);
      await onRefresh();
      showToast('ok', 'Đã xóa Block đặc biệt — lịch học gốc tại các ca đó đã khôi phục.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không xóa được Block đặc biệt.');
    }
  }

  const previewBlock: TimetableSpecialBlock = {
    ...draft,
    id: editingId || 'preview',
    updatedAt: new Date().toISOString(),
  };
  const previewVisual = getSpecialBlockVisualStyle(previewBlock);

  return (
    <div className="space-y-5">
      {/* Header & 4 Pre-Built Special Block Templates */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-950">
              Block Đặc Biệt trên Thời khóa biểu (Ưu tiên thay thế cao nhất)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Chèn nhanh khối <strong>NGHỈ</strong>, <strong>PHỤ ĐẠO</strong>, <strong>KIỂM TRA</strong>{' '}
              hoặc <strong>HỌP PHỤ HUYNH</strong> bằng cách tick trực tiếp lên lưới ca học trong tuần.
              Khi bật, Block đặc biệt sẽ tự động thay thế hiển thị ở các ca được chọn mà vẫn bảo toàn
              lịch gốc bên dưới.
            </p>
          </div>
          {onJumpToGrid && (
            <button
              type="button"
              onClick={onJumpToGrid}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-950 hover:bg-blue-100 whitespace-nowrap cursor-pointer"
            >
              Xem kết quả trên Lưới TKB
            </button>
          )}
        </div>

        {/* 4 Pre-built Templates */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SPECIAL_BLOCK_TEMPLATES.map((tpl) => {
            const visual = getSpecialBlockVisualStyle({
              ...tpl.defaults,
              id: tpl.templateKey,
              updatedAt: '',
            });
            const isSelected = draft.templateKey === tpl.templateKey && !editingId;
            return (
              <button
                key={tpl.templateKey}
                type="button"
                onClick={() => applyTemplate(tpl.templateKey)}
                className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition cursor-pointer ${
                  isSelected
                    ? 'border-blue-800 bg-blue-50/40 ring-2 ring-blue-200'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                }`}
              >
                <div>
                  <div
                    className="rounded-lg px-3 py-2.5"
                    style={visual.containerStyle}
                  >
                    <p className={`${visual.titleSizeClass} ${visual.weightClass} leading-snug`}>
                      {tpl.defaults.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] opacity-85">
                      {tpl.defaults.subtitle}
                    </p>
                  </div>
                  <p className="mt-2.5 text-xs font-bold text-slate-900">{tpl.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {tpl.description}
                  </p>
                </div>
                <p className="mt-2 text-[11px] font-bold text-blue-900">
                  Mức ưu tiên mặc định: {tpl.defaults.priority} · Chọn mẫu này
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {toast && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
            toast.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="p-1 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main 12-Col Builder: Left Weekly Checkbox Matrix (7 cols) | Right Visual Customizer (5 cols) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Weekly Timetable Checkbox Selector */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                <CheckSquare className="h-4 w-4 text-blue-900" />
                <span>
                  Bước 1: Check trực tiếp lên các ca học trong tuần ({draft.shiftKeys.length}/36 ca)
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Nhấn từng ô ca học để bật/tắt, hoặc nhấn tiêu đề Thứ / Buổi để chọn nhanh cả cột hoặc
                cả hàng.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['SANG', 'Cả Sáng'],
                  ['CHIEU', 'Cả Chiều'],
                  ['TOI', 'Cả Tối'],
                  ['ALL', 'Cả tuần'],
                  ['CLEAR', 'Bỏ chọn'],
                ] as const
              ).map(([preset, lbl]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPeriodPreset(preset)}
                  className="min-h-[32px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-900 cursor-pointer whitespace-nowrap"
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs">
                  <th className="w-32 border-r border-slate-200 px-3 py-2.5 font-bold text-slate-700">
                    Buổi · Ca
                  </th>
                  {DAYS.map((day) => {
                    const colKeys = SHIFT_ROWS.map((r) => makeShiftKey(day.code, r.period, r.shift));
                    const checkedCount = colKeys.filter((k) => draft.shiftKeys.includes(k)).length;
                    return (
                      <th
                        key={day.code}
                        className="border-r border-slate-200 px-2 py-2 text-center last:border-r-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggleColumnDay(day.code)}
                          title={`Chọn / bỏ chọn toàn bộ ${day.label}`}
                          className="w-full rounded-md py-1 text-xs font-extrabold text-slate-900 hover:bg-blue-100/70 cursor-pointer"
                        >
                          <div>{day.label}</div>
                          <div className="text-[10px] font-mono font-semibold text-blue-800 tabular-nums">
                            {checkedCount}/6 ca
                          </div>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {SHIFT_ROWS.map((row) => (
                  <tr key={`${row.period}_${row.shift}`}>
                    <td className="border-r border-slate-200 bg-slate-50/70 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleRowShift(row.period, row.shift)}
                        title={`Chọn / bỏ chọn cả hàng ${row.label}`}
                        className="w-full text-left hover:text-blue-900 cursor-pointer"
                      >
                        <p className="font-bold text-slate-900">{row.label}</p>
                        <p className="font-mono text-[10px] text-slate-500 tabular-nums">
                          {row.time}
                        </p>
                      </button>
                    </td>
                    {DAYS.map((day) => {
                      const key = makeShiftKey(day.code, row.period, row.shift);
                      const checked = draft.shiftKeys.includes(key);
                      return (
                        <td
                          key={key}
                          className="border-r border-slate-200 p-1.5 text-center last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => toggleShiftKey(key)}
                            aria-pressed={checked}
                            className={`flex min-h-[62px] w-full flex-col items-center justify-center rounded-lg p-1.5 text-center transition cursor-pointer ${
                              checked
                                ? 'shadow-xs'
                                : 'border border-dashed border-slate-200 bg-white text-slate-400 hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-800'
                            }`}
                            style={checked ? previewVisual.containerStyle : undefined}
                          >
                            {checked ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <Check className="h-3.5 w-3.5 shrink-0" />
                                  <span
                                    className={`line-clamp-1 ${previewVisual.titleSizeClass} ${previewVisual.weightClass}`}
                                  >
                                    {draft.title || 'BLOCK'}
                                  </span>
                                </div>
                                <span className="mt-0.5 text-[10px] opacity-85">
                                  {draft.targetClasses.length === 0
                                    ? 'Toàn trung tâm'
                                    : `${draft.targetClasses.length} lớp`}
                                </span>
                              </>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <Square className="h-3.5 w-3.5 opacity-60" />
                                <span className="text-[10px] font-medium">Chưa chọn</span>
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scope: Toàn trung tâm vs Specific Classes */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-slate-900">
                Phạm vi áp dụng trên Thời khóa biểu
              </p>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, targetClasses: [] }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  draft.targetClasses.length === 0
                    ? 'bg-blue-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                Toàn trung tâm (Tất cả lớp)
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableClasses.map((cls) => {
                const picked = draft.targetClasses.includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => toggleTargetClass(cls)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      picked
                        ? 'bg-blue-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-400'
                    }`}
                  >
                    {cls}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              {draft.targetClasses.length === 0
                ? 'Đang áp dụng cho TOÀN TRUNG TÂM — thay thế tất cả các lớp ở những ca đã tick.'
                : `Chỉ thay thế cho các lớp đã chọn: ${draft.targetClasses.join(', ')}.`}
            </p>
          </div>
        </div>

        {/* Right: Visual Styling & Content Controls */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 xl:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
              <Palette className="h-4 w-4 text-blue-900" />
              <span>Bước 2: Tùy chỉnh Màu sắc, Viền &amp; Font chữ</span>
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ ...SPECIAL_BLOCK_TEMPLATES[0].defaults, shiftKeys: [], targetClasses: [] });
                }}
                className="text-xs font-bold text-blue-800 hover:underline cursor-pointer"
              >
                + Tạo Block mới
              </button>
            )}
          </div>

          {/* Live Preview Card */}
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5">
            <p className="mb-2 text-[11px] font-bold text-slate-500">
              Xem trước trực tiếp trên ô Thời khóa biểu:
            </p>
            <div className="rounded-xl p-3.5 shadow-xs" style={previewVisual.containerStyle}>
              <div className="flex items-center justify-between gap-2">
                <span className={`${previewVisual.titleSizeClass} ${previewVisual.weightClass}`}>
                  {draft.title || 'TIÊU ĐỀ BLOCK'}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: draft.accentColor }}
                >
                  Ưu tiên #{draft.priority}
                </span>
              </div>
              {draft.subtitle && (
                <p className={`mt-1 leading-snug opacity-90 ${previewVisual.subtitleSizeClass}`}>
                  {draft.subtitle}
                </p>
              )}
              <p className="mt-1.5 text-[10px] opacity-75">
                {draft.targetClasses.length === 0
                  ? 'Áp dụng: Toàn trung tâm'
                  : `Lớp: ${draft.targetClasses.join(', ')}`}
                {' · '}
                {draft.shiftKeys.length} ca/tuần
              </p>
            </div>
          </div>

          {/* Content Inputs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">Loại Block</label>
              <select
                value={draft.blockType}
                onChange={(e) =>
                  setDraft({ ...draft, blockType: e.target.value as TimetableSpecialBlockType })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                {(Object.keys(SPECIAL_BLOCK_TYPE_LABELS) as TimetableSpecialBlockType[]).map((k) => (
                  <option key={k} value={k}>
                    {SPECIAL_BLOCK_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Mức ưu tiên (cao hơn sẽ đè lên)
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={draft.priority}
                onChange={(e) =>
                  setDraft({ ...draft, priority: Math.max(1, Math.min(200, Number(e.target.value) || 100)) })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700">
                Tiêu đề hiển thị trên TKB *
              </label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="VD: NGHỈ HỌC, PHỤ ĐẠO TOÁN - ANH, THI THỬ LỚP 10..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700">Ghi chú / Mô tả ngắn</label>
              <input
                type="text"
                value={draft.subtitle || ''}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                placeholder="Thông tin bổ sung cho học sinh, phụ huynh và giáo viên..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Quick Color Palettes + 4 Custom Pickers */}
          <div className="space-y-2.5 border-t border-slate-200 pt-3">
            <p className="text-xs font-extrabold text-slate-800">Màu nền, màu chữ &amp; màu viền</p>
            <div className="flex flex-wrap gap-1.5">
              {SPECIAL_BLOCK_COLOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      bgColor: p.bgColor,
                      borderColor: p.borderColor,
                      textColor: p.textColor,
                      accentColor: p.accentColor,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white cursor-pointer"
                >
                  <span
                    className="h-3.5 w-3.5 rounded-sm border"
                    style={{ backgroundColor: p.bgColor, borderColor: p.borderColor }}
                  />
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['bgColor', 'Màu nền'],
                  ['textColor', 'Màu chữ'],
                  ['borderColor', 'Màu viền'],
                  ['accentColor', 'Màu nhấn'],
                ] as const
              ).map(([field, lbl]) => (
                <label
                  key={field}
                  className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] font-bold text-slate-600"
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
          </div>

          {/* Font & Border Controls */}
          <div className="space-y-2.5 border-t border-slate-200 pt-3">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
              <Type className="h-3.5 w-3.5 text-blue-900" />
              <span>Font chữ, Cỡ chữ &amp; Kiểu viền Block</span>
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Phông chữ</label>
                <select
                  value={draft.fontFamily}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      fontFamily: e.target.value as TimetableSpecialBlockFontFamily,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  {SPECIAL_BLOCK_FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Cỡ &amp; Độ đậm</label>
                <div className="mt-1 flex gap-1.5">
                  <select
                    value={draft.fontSize}
                    onChange={(e) =>
                      setDraft({ ...draft, fontSize: e.target.value as 'SM' | 'MD' | 'LG' })
                    }
                    className="w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold"
                  >
                    <option value="SM">Nhỏ</option>
                    <option value="MD">Vừa</option>
                    <option value="LG">Lớn</option>
                  </select>
                  <select
                    value={draft.fontWeight}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        fontWeight: e.target.value as 'SEMIBOLD' | 'BOLD' | 'EXTRABOLD',
                      })
                    }
                    className="w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold"
                  >
                    <option value="SEMIBOLD">Vừa</option>
                    <option value="BOLD">Đậm</option>
                    <option value="EXTRABOLD">Rất đậm</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Kiểu nét viền</label>
                <select
                  value={draft.borderStyle}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      borderStyle: e.target.value as 'solid' | 'dashed' | 'double',
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="solid">Viền nét liền</option>
                  <option value="dashed">Viền nét đứt</option>
                  <option value="double">Viền đôi nổi bật</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500">Độ dày viền</label>
                <select
                  value={draft.borderWidth}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      borderWidth: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  <option value={1}>Mảnh (1px)</option>
                  <option value={2}>Tiêu chuẩn (2px)</option>
                  <option value={3}>Dày nổi bật (3px)</option>
                </select>
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-bold text-emerald-900">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              className="h-4 w-4 accent-emerald-700"
            />
            Kích hoạt ưu tiên thay thế ngay trên Thời khóa biểu
          </label>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving
              ? 'Đang đồng bộ lên Thời khóa biểu...'
              : editingId
                ? 'Lưu cập nhật Block đặc biệt'
                : 'Lưu & Áp dụng Block lên Thời khóa biểu'}
          </button>
        </div>
      </div>

      {/* Saved Special Blocks List */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <Layers className="h-4 w-4 text-blue-900" />
            <span>Danh sách Block đặc biệt đang cấu hình ({blocks.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setDraft({ ...SPECIAL_BLOCK_TEMPLATES[0].defaults, shiftKeys: [], targetClasses: [] });
            }}
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-900 hover:underline cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Tạo thêm Block
          </button>
        </div>

        {blocks.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            Chưa có Block đặc biệt nào đang gắn trên Thời khóa biểu. Chọn 1 trong 4 mẫu phía trên,
            tick vào các ca cần áp dụng và bấm Lưu.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-200">
            {blocks.map((b) => {
              const vis = getSpecialBlockVisualStyle(b);
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="flex h-12 w-24 shrink-0 items-center justify-center rounded-lg px-2 text-center"
                      style={vis.containerStyle}
                    >
                      <span className="line-clamp-2 text-[10px] font-extrabold leading-tight">
                        {b.title}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-bold text-blue-900">
                          {SPECIAL_BLOCK_TYPE_LABELS[b.blockType]}
                        </span>
                        <span>·</span>
                        <span className="font-mono font-bold tabular-nums text-slate-700">
                          {b.shiftKeys.length} ca/tuần
                        </span>
                        <span>·</span>
                        <span>Ưu tiên #{b.priority}</span>
                        <span>·</span>
                        <span className={b.active ? 'font-bold text-emerald-700' : 'text-slate-400'}>
                          {b.active ? 'Đang thay thế trên TKB' : 'Đang tạm tắt'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                        {b.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {b.targetClasses.length === 0
                          ? 'Phạm vi: Toàn trung tâm (Tất cả lớp)'
                          : `Phạm vi: ${b.targetClasses.join(', ')}`}
                        {b.subtitle ? ` · ${b.subtitle}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(b)}
                      className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                        b.active
                          ? 'border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      {b.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {b.active ? 'Tạm tắt' : 'Bật đè TKB'}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadBlockIntoEditor(b)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Sửa
                    </button>
                    <button
                      type="button"
                      title="Nhân bản"
                      onClick={() => void handleDuplicate(b)}
                      className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {confirmDeleteId === b.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete(b.id)}
                          className="min-h-[36px] rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white cursor-pointer"
                        >
                          Xác nhận xóa
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[36px] rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600 cursor-pointer"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        title="Xóa Block"
                        onClick={() => setConfirmDeleteId(b.id)}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
