import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  Download,
  FileText,
  Layers,
  Plus,
  Printer,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  PrintTemplate,
  PrintTemplateEntityType,
  PrintTemplateGroupBy,
  PrintTemplatePreset,
  SiteConfig,
  Student,
  Teacher,
} from '../types';
import { apiRequest } from '../lib/api';
import {
  buildCustomDirectoryPrintHtml,
  downloadBrandedHtmlFile,
} from '../lib/brandedDocumentExporter';
import {
  ensureSystemPrintTemplates,
  STUDENT_PRINT_COLUMNS,
  TEACHER_PRINT_COLUMNS,
  type WorkspaceIndexes,
} from '../lib/workspaceIntegrity';
import { InlineErrorAlert } from './ContextualReloginBanner';

interface CustomPrintTemplateStudioProps {
  open: boolean;
  entityType: PrintTemplateEntityType;
  students?: Student[];
  teachers?: Teacher[];
  indexes?: WorkspaceIndexes | null;
  templates: PrintTemplate[];
  canManageTemplates: boolean;
  filterSummary?: string;
  siteConfig?: Partial<SiteConfig>;
  onClose: () => void;
  onTemplatesChanged?: (templates: PrintTemplate[]) => void;
  onRequestRelogin?: () => void;
}

export const CustomPrintTemplateStudio: React.FC<CustomPrintTemplateStudioProps> = ({
  open,
  entityType,
  students = [],
  teachers = [],
  indexes,
  templates,
  canManageTemplates,
  filterSummary,
  siteConfig,
  onClose,
  onTemplatesChanged,
  onRequestRelogin,
}) => {
  const allTemplates = useMemo(() => ensureSystemPrintTemplates(templates), [templates]);
  const scopedTemplates = useMemo(
    () => allTemplates.filter((t) => t.entityType === entityType),
    [allTemplates, entityType],
  );

  const colCatalog = entityType === 'STUDENTS' ? STUDENT_PRINT_COLUMNS : TEACHER_PRINT_COLUMNS;
  const recordCount = entityType === 'STUDENTS' ? students.length : teachers.length;

  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [newBlankCol, setNewBlankCol] = useState('');
  const [sigInput, setSigInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAsBox, setShowSaveAsBox] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = scopedTemplates[0];
    if (first) {
      setSelectedId(first.id);
      setDraft(structuredClone(first));
      setSigInput((first.blocks.signatureLabels || []).join(', '));
      setSaveAsName(`${first.name} (Bản tùy biến)`);
      setErrorMsg(null);
      setFeedback(null);
      setShowSaveAsBox(false);
    }
  }, [open, entityType]);

  const handleSelectTemplate = (tpl: PrintTemplate) => {
    setSelectedId(tpl.id);
    setDraft(structuredClone(tpl));
    setSigInput((tpl.blocks.signatureLabels || []).join(', '));
    setSaveAsName(`${tpl.name} (Bản mới)`);
    setErrorMsg(null);
    setFeedback(null);
  };

  const previewHtml = useMemo(() => {
    if (!draft) return '';
    return buildCustomDirectoryPrintHtml({
      template: draft,
      students,
      teachers,
      indexes: indexes || undefined,
      filterSummary: filterSummary || `Đang hiển thị ${recordCount} bản ghi`,
      siteConfig,
    });
  }, [draft, students, teachers, indexes, filterSummary, recordCount, siteConfig]);

  if (!open || !draft) return null;

  const toggleColumn = (key: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const exists = prev.columns.includes(key);
      if (exists && prev.columns.length <= 1) return prev;
      const nextCols = exists
        ? prev.columns.filter((c) => c !== key)
        : [...prev.columns, key];
      return { ...prev, columns: nextCols };
    });
  };

  const moveColumn = (key: string, dir: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.columns.indexOf(key);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.columns.length) return prev;
      const copy = [...prev.columns];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return { ...prev, columns: copy };
    });
  };

  const addBlankColumn = () => {
    const label = newBlankCol.trim();
    if (!label) return;
    setDraft((prev) => {
      if (!prev || prev.extraBlankColumns.length >= 4) return prev;
      return { ...prev, extraBlankColumns: [...prev.extraBlankColumns, label.slice(0, 40)] };
    });
    setNewBlankCol('');
  };

  const removeBlankColumn = (index: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        extraBlankColumns: prev.extraBlankColumns.filter((_, i) => i !== index),
      };
    });
  };

  const handleSigInputChange = (val: string) => {
    setSigInput(val);
    const parsed = val
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            blocks: {
              ...prev.blocks,
              signatureLabels: parsed.length > 0 ? parsed : ['Giáo viên phụ trách', 'Quản lý học vụ'],
            },
          }
        : prev,
    );
  };

  const handleUpdateCurrent = async () => {
    if (!canManageTemplates) return;
    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ template: PrintTemplate; templates: PrintTemplate[] }>(
        `/api/v1/print-templates/${encodeURIComponent(draft.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            presetBase: draft.presetBase,
            customTitle: draft.customTitle,
            orientation: draft.orientation,
            fontSize: draft.fontSize,
            groupBy: draft.groupBy,
            columns: draft.columns,
            extraBlankColumns: draft.extraBlankColumns,
            blocks: draft.blocks,
          }),
        },
      );
      setDraft(structuredClone(res.template));
      setFeedback(`Đã lưu thay đổi cho mẫu "${res.template.name}" lên CSDL dùng chung.`);
      onTemplatesChanged?.(res.templates);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cập nhật mẫu in.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNew = async () => {
    if (!canManageTemplates) return;
    const cleanName = saveAsName.trim();
    if (cleanName.length < 2) {
      setErrorMsg('Vui lòng nhập tên Mẫu in mới (tối thiểu 2 ký tự).');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ template: PrintTemplate; templates: PrintTemplate[] }>(
        '/api/v1/print-templates',
        {
          method: 'POST',
          body: JSON.stringify({
            name: cleanName,
            description: draft.description || `Mẫu tùy biến từ ${draft.name}`,
            entityType,
            presetBase: 'CUSTOM' as PrintTemplatePreset,
            customTitle: draft.customTitle,
            orientation: draft.orientation,
            fontSize: draft.fontSize,
            groupBy: draft.groupBy,
            columns: draft.columns,
            extraBlankColumns: draft.extraBlankColumns,
            blocks: draft.blocks,
          }),
        },
      );
      setSelectedId(res.template.id);
      setDraft(structuredClone(res.template));
      setShowSaveAsBox(false);
      setFeedback(`Đã tạo & lưu mẫu in dùng chung "${res.template.name}" vào CSDL Trung tâm.`);
      onTemplatesChanged?.(res.templates);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo mẫu in mới.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (tpl: PrintTemplate) => {
    if (!canManageTemplates || tpl.isSystemDefault) return;
    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{ deleted: boolean; templates: PrintTemplate[] }>(
        `/api/v1/print-templates/${encodeURIComponent(tpl.id)}`,
        { method: 'DELETE' },
      );
      onTemplatesChanged?.(res.templates);
      const nextList = ensureSystemPrintTemplates(res.templates).filter(
        (t) => t.entityType === entityType,
      );
      if (nextList[0]) {
        handleSelectTemplate(nextList[0]);
      }
      setFeedback(`Đã xóa mẫu in tùy biến "${tpl.name}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa mẫu in.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintNow = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleDownloadHtml = () => {
    const slug = (draft.customTitle || draft.name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    downloadBrandedHtmlFile(
      previewHtml,
      `${entityType === 'STUDENTS' ? 'ds-hoc-sinh' : 'ds-giao-vien'}-${slug || 'nhan-tri'}.html`,
    );
  };

  const groupOptions: Array<{ value: PrintTemplateGroupBy; label: string }> =
    entityType === 'STUDENTS'
      ? [
          { value: 'NONE', label: 'Không gom nhóm (1 bảng liền mạch)' },
          { value: 'CLASS', label: 'Gom nhóm theo Lớp Trung tâm' },
          { value: 'GRADE', label: 'Gom nhóm theo Khối lớp' },
          { value: 'LEVEL', label: 'Gom nhóm theo Cấp học (Cấp 1/2/3)' },
          { value: 'STATUS', label: 'Gom nhóm theo Trạng thái học tập' },
        ]
      : [
          { value: 'NONE', label: 'Không gom nhóm (1 bảng liền mạch)' },
          { value: 'TEACHER_GROUP', label: 'Gom nhóm theo Phân nhóm GV (Bộ môn / Trả bài)' },
          { value: 'STATUS', label: 'Gom nhóm theo Trạng thái công tác' },
        ];

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Xưởng cấu hình và in danh sách chuẩn Trung tâm Nhân Trí"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[1340px] h-[94vh] flex flex-col overflow-hidden">
        {/* Top Studio Bar */}
        <div className="px-5 py-3.5 bg-[#1E3A8A] text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">
                Xưởng In chuẩn Trung tâm — {entityType === 'STUDENTS' ? 'Danh sách Học sinh / Lớp học' : 'Danh sách Giáo viên'}
              </h2>
              <p className="text-xs text-blue-100 truncate">
                Đang áp dụng cho <strong className="tabular-nums">{recordCount}</strong> bản ghi · {filterSummary || 'Toàn bộ danh sách đang lọc'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Tải bản in (.HTML)
            </button>
            <button
              type="button"
              onClick={handlePrintNow}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              In trực tiếp / Lưu PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ in"
              className="p-2 rounded-lg text-blue-100 hover:bg-white/15 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Column Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT: Config Panel */}
          <div className="lg:col-span-5 border-r border-slate-200 overflow-y-auto p-4 space-y-4 bg-slate-50/70">
            <InlineErrorAlert
              message={errorMsg}
              onRequestRelogin={onRequestRelogin}
              onDismiss={() => setErrorMsg(null)}
            />
            {feedback && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            {/* 1. Template Library (3 system presets + shared custom templates) */}
            <section className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  Thư viện Mẫu in dùng chung ({scopedTemplates.length})
                </h3>
                {canManageTemplates && (
                  <button
                    type="button"
                    onClick={() => setShowSaveAsBox((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                    Lưu thành mẫu mới
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                {scopedTemplates.map((tpl) => {
                  const active = tpl.id === selectedId;
                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 transition ${
                        active
                          ? 'border-[#1E3A8A] bg-blue-50/70'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(tpl)}
                        className="text-left flex-1 min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">{tpl.name}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 shrink-0">
                            {tpl.isSystemDefault ? 'Chuẩn TT' : 'Tùy biến'}
                          </span>
                        </div>
                        {tpl.description && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{tpl.description}</p>
                        )}
                      </button>
                      {canManageTemplates && !tpl.isSystemDefault && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tpl)}
                          disabled={saving}
                          title="Xóa mẫu tùy biến này"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {showSaveAsBox && canManageTemplates && (
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tên Mẫu in mới (lưu dùng chung toàn trung tâm)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveAsName}
                      onChange={(e) => setSaveAsName(e.target.value)}
                      placeholder="VD: Danh sách ký nhận tài liệu Khối 9"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-[#1E3A8A]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveAsNew}
                      disabled={saving}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172e6e] transition whitespace-nowrap disabled:opacity-60"
                    >
                      Lưu mới
                    </button>
                  </div>
                </div>
              )}

              {canManageTemplates && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 truncate">
                    Đang chỉnh: <strong>{draft.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleUpdateCurrent}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-[#1E3A8A] bg-white text-[#1E3A8A] text-xs font-bold hover:bg-blue-50 transition whitespace-nowrap disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Lưu cập nhật mẫu này
                  </button>
                </div>
              )}
            </section>

            {/* 2. Page Layout & Grouping */}
            <section className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#1E3A8A]" />
                Bố cục trang in &amp; Phân nhóm
              </h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiêu đề lớn trên bản in
                </label>
                <input
                  type="text"
                  value={draft.customTitle}
                  onChange={(e) => setDraft({ ...draft, customTitle: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Khổ giấy A4</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['portrait', 'landscape'] as const).map((ori) => (
                      <button
                        key={ori}
                        type="button"
                        onClick={() => setDraft({ ...draft, orientation: ori })}
                        className={`min-h-[36px] rounded-lg border text-xs font-semibold transition ${
                          draft.orientation === ori
                            ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {ori === 'portrait' ? 'Dọc' : 'Ngang'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cỡ chữ bảng</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ['sm', 'Nhỏ'],
                      ['md', 'Vừa'],
                      ['lg', 'Lớn'],
                    ] as const).map(([sz, lbl]) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setDraft({ ...draft, fontSize: sz })}
                        className={`min-h-[36px] rounded-lg border text-xs font-semibold transition ${
                          draft.fontSize === sz
                            ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gom nhóm danh sách</label>
                <select
                  value={draft.groupBy}
                  onChange={(e) =>
                    setDraft({ ...draft, groupBy: e.target.value as PrintTemplateGroupBy })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:outline-none focus:border-[#1E3A8A]"
                >
                  {groupOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* 3. Block Configuration */}
            <section className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#1E3A8A]" />
                Cấu hình các Khối chuẩn Trung tâm
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ['showLogoHeader', 'Khối Logo & Thông tin Trung tâm'],
                  ['showWatermark', 'Watermark chìm thương hiệu NT'],
                  ['showFilterSummary', 'Khối Phạm vi lọc & Ngày in'],
                  ['showRowNumbers', 'Cột Số thứ tự (STT)'],
                  ['showSummaryStats', 'Thanh Thống kê tổng hợp'],
                  ['showSignatures', 'Khối Chữ ký xác nhận cuối trang'],
                ] as const).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={draft.blocks[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          blocks: { ...draft.blocks, [key]: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                    />
                    <span className="leading-tight">{label}</span>
                  </label>
                ))}
              </div>

              {draft.blocks.showSignatures && (
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Chức danh ký tên (phân cách bằng dấu phẩy, tối đa 4 cột)
                  </label>
                  <input
                    type="text"
                    value={sigInput}
                    onChange={(e) => handleSigInputChange(e.target.value)}
                    placeholder="Giáo viên phụ trách, Quản lý học vụ, Giám đốc Trung tâm"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
              )}
            </section>

            {/* 4. Select & Reorder Columns */}
            <section className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chọn &amp; Sắp xếp cột dữ liệu ({draft.columns.length})
                </h3>
                <span className="text-[11px] text-slate-400">Dùng ↑↓ để đổi thứ tự</span>
              </div>

              {/* Selected columns in exact display order */}
              <div className="space-y-1">
                {draft.columns.map((colKey, index) => {
                  const def = colCatalog.find((c) => c.key === colKey);
                  if (!def) return null;
                  return (
                    <div
                      key={colKey}
                      className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/40 px-2.5 py-1.5"
                    >
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleColumn(colKey)}
                          className="rounded border-slate-300 text-[#1E3A8A]"
                        />
                        <span className="tabular-nums text-[10px] text-slate-400 w-4">{index + 1}.</span>
                        <span className="truncate">{def.label}</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveColumn(colKey, -1)}
                          disabled={index === 0}
                          aria-label="Di chuyển lên"
                          className="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(colKey, 1)}
                          disabled={index === draft.columns.length - 1}
                          aria-label="Di chuyển xuống"
                          className="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unselected columns */}
              {colCatalog.some((c) => !draft.columns.includes(c.key)) && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Cột có sẵn khác (bấm để thêm):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colCatalog
                      .filter((c) => !draft.columns.includes(c.key))
                      .map((col) => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition"
                        >
                          <Plus className="w-3 h-3" />
                          {col.shortLabel || col.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </section>

            {/* 5. Extra Blank Columns (0-4) */}
            <section className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cột trống bổ sung để ghi tay / điểm danh ({draft.extraBlankColumns.length}/4)
                </h3>
              </div>

              {draft.extraBlankColumns.length > 0 && (
                <div className="space-y-1.5">
                  {draft.extraBlankColumns.map((col, idx) => (
                    <div
                      key={`${col}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-slate-50"
                    >
                      <span className="font-medium text-slate-800 truncate">{col}</span>
                      <button
                        type="button"
                        onClick={() => removeBlankColumn(idx)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 transition"
                        aria-label="Bỏ cột trống"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {draft.extraBlankColumns.length < 4 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBlankCol}
                    onChange={(e) => setNewBlankCol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBlankColumn();
                      }
                    }}
                    placeholder="VD: Điểm danh, Ký nhận, Ghi chú..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-[#1E3A8A]"
                  />
                  <button
                    type="button"
                    onClick={addBlankColumn}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                  >
                    + Thêm cột
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT: Live A4 Print Preview */}
          <div className="lg:col-span-7 bg-slate-200/80 flex flex-col min-h-0">
            <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
              <span>
                Xem trước trực tiếp bản in A4 ({draft.orientation === 'landscape' ? 'Khổ ngang' : 'Khổ dọc'})
              </span>
              <span className="tabular-nums font-semibold text-[#1E3A8A]">
                {draft.columns.length + draft.extraBlankColumns.length + (draft.blocks.showRowNumbers ? 1 : 0)} cột · {recordCount} dòng
              </span>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <iframe
                ref={iframeRef}
                title="Xem trước bản in danh sách chuẩn Trung Tâm Nhân Trí"
                srcDoc={previewHtml}
                className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
