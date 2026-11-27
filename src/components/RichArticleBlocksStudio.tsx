import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Blocks,
  Check,
  Copy,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Redo2,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  REUSABLE_BLOCK_CATEGORY_LABELS,
  ensureDefaultReusableBlocks,
  sanitizeRichHtml,
  sanitizeSafeUrl,
} from '../lib/contentStudioEngine';
import type {
  AuthUser,
  EditorialArticle,
  ReusableBlockCategory,
  ReusableContentBlock,
} from '../types';
import { GoogleDrivePickerModal } from './GoogleDrivePickerModal';

export interface RichArticleBlocksStudioProps {
  user: AuthUser;
  articles: EditorialArticle[];
  reusableBlocks: ReusableContentBlock[];
  onRefresh: () => Promise<void>;
}

const ARTICLE_CATEGORIES = [
  'Thông báo Học vụ',
  'Tuyển sinh & Khai giảng',
  'Kinh nghiệm Học tập',
  'Hoạt động Trung tâm',
  'Lịch nghỉ lễ & Điều chỉnh',
];

const TEXT_COLORS = [
  '#0F172A',
  '#1E3A8A',
  '#065F46',
  '#B45309',
  '#BE123C',
  '#6D28D9',
  '#475569',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  '#FEF08A',
  '#DBEAFE',
  '#D1FAE5',
  '#FCE7F3',
  '#FFEDD5',
];

const FONT_FAMILIES = [
  { label: 'Plus Jakarta Sans (Mặc định)', value: 'Plus Jakarta Sans, sans-serif' },
  { label: 'Georgia (Báo chí)', value: 'Georgia, serif' },
  { label: 'Times New Roman (Văn bản)', value: 'Times New Roman, serif' },
  { label: 'Monospace (Mã / Bảng số)', value: 'ui-monospace, monospace' },
];

async function compressLocalImage(file: File, maxWidth = 1400): Promise<string> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Ảnh vượt quá 15MB. Vui lòng chọn ảnh nhẹ hơn.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được định dạng ảnh.'));
      el.src = objectUrl;
    });
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Không chuyển đổi được ảnh.'));
        reader.readAsDataURL(file);
      });
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outMime, 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const RichArticleBlocksStudio: React.FC<RichArticleBlocksStudioProps> = ({
  user,
  articles,
  reusableBlocks,
  onRefresh,
}) => {
  const normalizedBlocks = useMemo(
    () => ensureDefaultReusableBlocks(reusableBlocks),
    [reusableBlocks],
  );

  const [subView, setSubView] = useState<'EDITOR' | 'LIST' | 'BLOCKS'>('EDITOR');
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(ARTICLE_CATEGORIES[0]);
  const [excerpt, setExcerpt] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('PUBLISHED');
  const [featured, setFeatured] = useState(false);
  const [htmlValue, setHtmlValue] = useState(
    '<p>Nhập nội dung bài viết tại đây. Bạn có thể định dạng như Google Docs, chèn bảng, chèn ảnh từ máy tính hoặc Google Drive, và bấm <strong>Chèn tại con trỏ</strong> ở cột Block tĩnh bên phải.</p>',
  );
  const [previewMode, setPreviewMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Popovers for Link / Table / Image
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');

  const [showTableBox, setShowTableBox] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const [showImageBox, setShowImageBox] = useState(false);
  const [insertImgUrl, setInsertImgUrl] = useState('');
  const [insertImgCaption, setInsertImgCaption] = useState('');
  const [insertImgWidth, setInsertImgWidth] = useState<'50%' | '75%' | '100%'>('100%');

  // Google Drive picker state
  const [driveTarget, setDriveTarget] = useState<'COVER' | 'INLINE' | null>(null);

  // Reusable block filter & modal CRUD state
  const [blockFilter, setBlockFilter] = useState<ReusableBlockCategory | 'ALL'>('ALL');
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockName, setBlockName] = useState('');
  const [blockCategory, setBlockCategory] = useState<ReusableBlockCategory>('CUSTOM');
  const [blockDesc, setBlockDesc] = useState('');
  const [blockHtml, setBlockHtml] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);
  const [confirmDeleteArticleId, setConfirmDeleteArticleId] = useState<string | null>(null);
  const [confirmDeleteBlockId, setConfirmDeleteBlockId] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const blockEditorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const inlineFileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Sync HTML into contentEditable when switching article or exiting preview
  useEffect(() => {
    if (subView === 'EDITOR' && !previewMode && editorRef.current) {
      if (editorRef.current.innerHTML !== htmlValue) {
        editorRef.current.innerHTML = sanitizeRichHtml(htmlValue);
      }
    }
  }, [editingArticleId, subView, previewMode]);

  useEffect(() => {
    if (blockModalOpen && blockEditorRef.current) {
      blockEditorRef.current.innerHTML = sanitizeRichHtml(blockHtml);
    }
  }, [blockModalOpen, editingBlockId]);

  const captureCaretSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const syncFromEditor = () => {
    if (editorRef.current) {
      setHtmlValue(editorRef.current.innerHTML);
    }
  };

  const execEditorCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }
    document.execCommand(command, false, value);
    captureCaretSelection();
    syncFromEditor();
  };

  /**
   * Inserts sanitized HTML cleanly as an editable copy right at the saved cursor Range
   * (or at the bottom of the article if cursor wasn't inside the canvas).
   */
  const insertHtmlAtCursor = (rawHtml: string, successLabel?: string) => {
    const clean = sanitizeRichHtml(rawHtml);
    if (!clean) return;
    if (previewMode) setPreviewMode(false);

    window.setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const sel = window.getSelection();
      let range: Range | null = null;

      if (savedRangeRef.current && editor.contains(savedRangeRef.current.commonAncestorContainer)) {
        range = savedRangeRef.current.cloneRange();
      } else if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0).cloneRange();
      }

      const template = document.createElement('template');
      template.innerHTML = `${clean}<p><br></p>`;
      const fragment = template.content;
      const lastInsertedNode = fragment.lastChild;

      if (range && sel) {
        range.deleteContents();
        range.insertNode(fragment);
        if (lastInsertedNode) {
          const nextRange = document.createRange();
          nextRange.setStartAfter(lastInsertedNode);
          nextRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nextRange);
          savedRangeRef.current = nextRange.cloneRange();
        }
      } else {
        editor.appendChild(fragment);
        const endRange = document.createRange();
        endRange.selectNodeContents(editor);
        endRange.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(endRange);
        }
        savedRangeRef.current = endRange.cloneRange();
      }

      syncFromEditor();
      if (successLabel) {
        showToast('ok', successLabel);
      }
    }, 0);
  };

  const handleInsertLink = () => {
    const safeHref = sanitizeSafeUrl(linkUrl, false);
    if (!safeHref) {
      showToast('err', 'Liên kết phải bắt đầu bằng https://, http://, mailto:, tel: hoặc #');
      return;
    }
    const text = (linkLabel.trim() || safeHref).replace(/[<>]/g, '');
    insertHtmlAtCursor(
      `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color: #1D4ED8; text-decoration: underline; font-weight: 600;">${text}</a>`,
      'Đã chèn liên kết tại vị trí con trỏ.',
    );
    setShowLinkBox(false);
    setLinkUrl('https://');
    setLinkLabel('');
  };

  const handleInsertTable = () => {
    const r = Math.min(12, Math.max(2, tableRows));
    const c = Math.min(8, Math.max(2, tableCols));
    const headCells = Array.from({ length: c })
      .map(
        (_, i) =>
          `<th style="border: 1px solid #CBD5E1; padding: 8px; background-color: #EFF6FF; text-align: left;">Cột ${i + 1}</th>`,
      )
      .join('');
    const bodyRows = Array.from({ length: r - 1 })
      .map(
        () =>
          `<tr>${Array.from({ length: c })
            .map(() => `<td style="border: 1px solid #CBD5E1; padding: 8px;">Nội dung</td>`)
            .join('')}</tr>`,
      )
      .join('');

    insertHtmlAtCursor(
      `<table style="width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 12px;"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`,
      `Đã chèn bảng ${r}×${c} tại vị trí con trỏ.`,
    );
    setShowTableBox(false);
  };

  const handleInsertImageIntoArticle = (imgSrc: string, captionText?: string) => {
    const safeSrc = sanitizeSafeUrl(imgSrc, true);
    if (!safeSrc) {
      showToast('err', 'Địa chỉ ảnh không hợp lệ.');
      return;
    }
    const safeCaption = (captionText || '').trim().replace(/[<>]/g, '');
    const figureHtml = `<figure style="margin-top: 14px; margin-bottom: 14px; text-align: center;"><img src="${safeSrc}" alt="${safeCaption || 'Ảnh minh họa bài viết'}" style="width: ${insertImgWidth}; max-width: 100%; border-radius: 12px; border: 1px solid #E2E8F0; display: inline-block;" />${
      safeCaption
        ? `<figcaption style="font-size: 13px; color: #64748B; margin-top: 6px; font-style: italic;">${safeCaption}</figcaption>`
        : ''
    }</figure>`;
    insertHtmlAtCursor(figureHtml, 'Đã chèn hình ảnh vào bài viết tại vị trí con trỏ.');
    setShowImageBox(false);
    setInsertImgUrl('');
    setInsertImgCaption('');
  };

  const handleStartNewArticle = () => {
    setEditingArticleId(null);
    setTitle('');
    setCategory(ARTICLE_CATEGORIES[0]);
    setExcerpt('');
    setCoverImageUrl('');
    setStatus('PUBLISHED');
    setFeatured(false);
    setHtmlValue(
      '<p>Bắt đầu soạn thảo bài viết mới tại đây. Bạn có thể bấm các nút định dạng phía trên hoặc chèn nhanh 5 Block tĩnh ở cột bên phải.</p>',
    );
    setPreviewMode(false);
    setSubView('EDITOR');
  };

  const handleEditArticle = (article: EditorialArticle) => {
    setEditingArticleId(article.id);
    setTitle(article.title);
    setCategory(article.category || ARTICLE_CATEGORIES[0]);
    setExcerpt(article.excerpt || '');
    setCoverImageUrl(article.coverImageUrl || '');
    setStatus(article.status);
    setFeatured(Boolean(article.featured));
    setHtmlValue(article.contentHtml || '<p></p>');
    setPreviewMode(false);
    setSubView('EDITOR');
  };

  const handleSaveArticle = async (overrideStatus?: 'DRAFT' | 'PUBLISHED') => {
    const finalTitle = title.trim();
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : htmlValue;
    const sanitized = sanitizeRichHtml(currentHtml);

    if (!finalTitle) {
      showToast('err', 'Vui lòng nhập tiêu đề bài viết trước khi lưu.');
      return;
    }
    if (!sanitized || sanitized.replace(/<[^>]+>/g, '').trim().length < 5) {
      showToast('err', 'Nội dung bài viết còn quá ngắn. Vui lòng nhập thêm nội dung.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: finalTitle,
        category,
        excerpt: excerpt.trim(),
        coverImageUrl: coverImageUrl.trim(),
        contentHtml: sanitized,
        status: overrideStatus || status,
        featured,
      };
      if (editingArticleId) {
        await apiRequest(`/api/v1/articles/${encodeURIComponent(editingArticleId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('ok', 'Đã cập nhật bài viết và đồng bộ lên trang chủ.');
      } else {
        const res = await apiRequest<{ article: EditorialArticle }>('/api/v1/articles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setEditingArticleId(res.article.id);
        showToast(
          'ok',
          (overrideStatus || status) === 'PUBLISHED'
            ? 'Đã xuất bản bài viết mới ra Frontend.'
            : 'Đã lưu bản nháp bài viết.',
        );
      }
      setStatus(overrideStatus || status);
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không thể lưu bài viết.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (articleId: string) => {
    try {
      await apiRequest(`/api/v1/articles/${encodeURIComponent(articleId)}`, {
        method: 'DELETE',
      });
      if (editingArticleId === articleId) {
        handleStartNewArticle();
      }
      setConfirmDeleteArticleId(null);
      showToast('ok', 'Đã xóa bài viết.');
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không xóa được bài viết.');
    }
  };

  // Block CRUD
  const openCreateBlockModal = () => {
    setEditingBlockId(null);
    setBlockName('');
    setBlockCategory('CUSTOM');
    setBlockDesc('');
    setBlockHtml(
      '<div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 14px;"><p style="font-weight: 700; color: #1E3A8A;">TIÊU ĐỀ BLOCK TĨNH</p><p>Nhập nội dung mẫu thường dùng lặp lại để chèn nhanh vào mọi bài viết...</p></div>',
    );
    setBlockModalOpen(true);
  };

  const openEditBlockModal = (block: ReusableContentBlock) => {
    setEditingBlockId(block.id);
    setBlockName(block.name);
    setBlockCategory(block.category);
    setBlockDesc(block.description);
    setBlockHtml(block.htmlContent);
    setBlockModalOpen(true);
  };

  const handleDuplicateBlock = async (block: ReusableContentBlock) => {
    try {
      await apiRequest('/api/v1/content-blocks', {
        method: 'POST',
        body: JSON.stringify({
          name: `${block.name} (Bản sao)`,
          category: block.category,
          description: block.description,
          htmlContent: block.htmlContent,
        }),
      });
      showToast('ok', 'Đã nhân bản Block tĩnh thành công.');
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không nhân bản được Block tĩnh.');
    }
  };

  const handleSaveBlock = async () => {
    const cleanHtml = sanitizeRichHtml(
      blockEditorRef.current ? blockEditorRef.current.innerHTML : blockHtml,
    );
    if (!blockName.trim() || !cleanHtml) {
      showToast('err', 'Vui lòng nhập tên Block và nội dung hiển thị.');
      return;
    }
    setSavingBlock(true);
    try {
      const payload = {
        name: blockName.trim(),
        category: blockCategory,
        description: blockDesc.trim(),
        htmlContent: cleanHtml,
      };
      if (editingBlockId) {
        await apiRequest(`/api/v1/content-blocks/${encodeURIComponent(editingBlockId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('ok', 'Đã cập nhật Block tĩnh.');
      } else {
        await apiRequest('/api/v1/content-blocks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('ok', 'Đã tạo Block tĩnh mới trong thư viện.');
      }
      setBlockModalOpen(false);
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không lưu được Block tĩnh.');
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (id: string) => {
    try {
      await apiRequest(`/api/v1/content-blocks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      setConfirmDeleteBlockId(null);
      showToast('ok', 'Đã xóa Block tĩnh.');
      await onRefresh();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Không xóa được Block tĩnh.');
    }
  };

  const filteredBlocks =
    blockFilter === 'ALL'
      ? normalizedBlocks
      : normalizedBlocks.filter((b) => b.category === blockFilter);

  return (
    <div className="space-y-5">
      {/* Top Studio Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">
            Trình soạn thảo Bài viết chuẩn Google Docs &amp; Thư viện Block tĩnh
          </h3>
          <p className="text-xs text-slate-500">
            Soạn bài trực quan, lấy ảnh trực tiếp từ Google Drive cá nhân, chèn 5 Block tĩnh tại đúng
            vị trí con trỏ chuột (bản sao chỉnh sửa ngay tại chỗ).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['EDITOR', 'Soạn bài viết', FileText],
              ['LIST', `Kho bài viết (${articles.length})`, List],
              ['BLOCKS', `Quản lý Block tĩnh (${normalizedBlocks.length})`, Blocks],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubView(key)}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                subView === key
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleStartNewArticle}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
          >
            <FilePlus2 className="h-4 w-4" />
            Bài mới
          </button>
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

      {/* SUBVIEW 1: GOOGLE-DOCS-STYLE EDITOR + RIGHT REUSABLE BLOCKS SIDEBAR */}
      {subView === 'EDITOR' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Main Document Column */}
          <div className="space-y-4 xl:col-span-8">
            {/* Metadata panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Tiêu đề bài viết
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Thông báo Khai giảng lớp Luyện thi lớp 10 đợt mới tại Nhân Trí"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-bold text-slate-900 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Chuyên mục
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-700"
                  >
                    {ARTICLE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                      Trạng thái
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-700"
                    >
                      <option value="PUBLISHED">Xuất bản ra trang chủ</option>
                      <option value="DRAFT">Lưu bản nháp nội bộ</option>
                    </select>
                  </div>
                  <label className="flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={featured}
                      onChange={(e) => setFeatured(e.target.checked)}
                      className="h-4 w-4 rounded accent-blue-900"
                    />
                    Ghim nổi bật
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Mô tả ngắn (Sapo hiển thị ngoài thẻ tin)
                  </label>
                  <textarea
                    rows={2}
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="Tóm tắt 1–2 câu để phụ huynh và học sinh nắm nhanh thông tin chính..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-700"
                  />
                </div>

                {/* Cover image selector */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ảnh bìa bài viết (Tải từ máy, Google Drive cá nhân hoặc dán URL)
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={coverImageUrl}
                      onChange={(e) => setCoverImageUrl(e.target.value)}
                      placeholder="https://... hoặc chọn từ máy / Google Drive"
                      className="min-w-[200px] flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-700"
                    />
                    <input
                      ref={coverFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const dataUrl = await compressLocalImage(f);
                          setCoverImageUrl(dataUrl);
                          showToast('ok', 'Đã tải ảnh bìa từ máy tính.');
                        } catch (err) {
                          showToast('err', err instanceof Error ? err.message : 'Lỗi đọc ảnh.');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => coverFileInputRef.current?.click()}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="h-4 w-4" />
                      Từ máy tính
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriveTarget('COVER')}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Google Drive
                    </button>
                    {coverImageUrl && (
                      <button
                        type="button"
                        onClick={() => setCoverImageUrl('')}
                        className="inline-flex min-h-[42px] items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                  {coverImageUrl && sanitizeSafeUrl(coverImageUrl, true) && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img
                        src={sanitizeSafeUrl(coverImageUrl, true)}
                        alt="Xem trước ảnh bìa"
                        className="h-40 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Google Docs Ribbon + Canvas */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Sticky Toolbar */}
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                <button
                  type="button"
                  title="Hoàn tác"
                  onClick={() => execEditorCommand('undo')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white hover:shadow-sm"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Làm lại"
                  onClick={() => execEditorCommand('redo')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white hover:shadow-sm"
                >
                  <Redo2 className="h-4 w-4" />
                </button>

                <span className="mx-1 h-5 w-px bg-slate-300" />

                {/* Headings */}
                <button
                  type="button"
                  title="Tiêu đề lớn (H1)"
                  onClick={() => execEditorCommand('formatBlock', 'H1')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Heading1 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Tiêu đề mục (H2)"
                  onClick={() => execEditorCommand('formatBlock', 'H2')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Heading2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Tiêu đề phụ (H3)"
                  onClick={() => execEditorCommand('formatBlock', 'H3')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Heading3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Đoạn văn thường"
                  onClick={() => execEditorCommand('formatBlock', 'P')}
                  className="h-9 rounded-lg px-2 text-xs font-bold text-slate-700 hover:bg-white"
                >
                  P
                </button>

                <select
                  aria-label="Phông chữ"
                  onChange={(e) => {
                    if (e.target.value) execEditorCommand('fontName', e.target.value);
                  }}
                  defaultValue=""
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                >
                  <option value="" disabled>
                    Phông chữ
                  </option>
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Cỡ chữ"
                  onChange={(e) => {
                    if (e.target.value) execEditorCommand('fontSize', e.target.value);
                  }}
                  defaultValue=""
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                >
                  <option value="" disabled>
                    Cỡ chữ
                  </option>
                  <option value="2">Nhỏ (13px)</option>
                  <option value="3">Chuẩn (16px)</option>
                  <option value="4">Vừa (18px)</option>
                  <option value="5">Lớn (22px)</option>
                  <option value="6">Rất lớn (28px)</option>
                </select>

                <span className="mx-1 h-5 w-px bg-slate-300" />

                {/* Formatting */}
                <button
                  type="button"
                  title="In đậm"
                  onClick={() => execEditorCommand('bold')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="In nghiêng"
                  onClick={() => execEditorCommand('italic')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Gạch chân"
                  onClick={() => execEditorCommand('underline')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Underline className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Gạch ngang"
                  onClick={() => execEditorCommand('strikeThrough')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Strikethrough className="h-4 w-4" />
                </button>

                {/* Text Color swatches */}
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
                  <span className="text-[10px] font-bold text-slate-500">Chữ</span>
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={`Màu chữ ${color}`}
                      onClick={() => execEditorCommand('foreColor', color)}
                      className="h-4 w-4 rounded-full border border-slate-300"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Highlight Color swatches */}
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
                  <span className="text-[10px] font-bold text-slate-500">Nền</span>
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={`Đánh dấu nền ${color}`}
                      onClick={() => execEditorCommand('hiliteColor', color)}
                      className="h-4 w-4 rounded border border-slate-300"
                      style={{ backgroundColor: color === 'transparent' ? '#FFFFFF' : color }}
                    />
                  ))}
                </div>

                <span className="mx-1 h-5 w-px bg-slate-300" />

                {/* Alignment */}
                <button
                  type="button"
                  title="Căn trái"
                  onClick={() => execEditorCommand('justifyLeft')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Căn giữa"
                  onClick={() => execEditorCommand('justifyCenter')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Căn phải"
                  onClick={() => execEditorCommand('justifyRight')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <AlignRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Căn đều"
                  onClick={() => execEditorCommand('justifyFull')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <AlignJustify className="h-4 w-4" />
                </button>

                <span className="mx-1 h-5 w-px bg-slate-300" />

                {/* Lists, Quote, Divider, Table, Link, Image */}
                <button
                  type="button"
                  title="Danh sách chấm tròn"
                  onClick={() => execEditorCommand('insertUnorderedList')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Danh sách đánh số"
                  onClick={() => execEditorCommand('insertOrderedList')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Trích dẫn nổi bật"
                  onClick={() =>
                    insertHtmlAtCursor(
                      '<blockquote style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 10px; padding: 12px 16px; color: #334155; font-style: italic; margin-top: 10px; margin-bottom: 10px;">Nhập câu trích dẫn hoặc điểm nhấn quan trọng tại đây...</blockquote>',
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Quote className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Đường kẻ phân đoạn"
                  onClick={() => insertHtmlAtCursor('<hr style="border: 0; border-top: 1px solid #CBD5E1; margin-top: 16px; margin-bottom: 16px;" />')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Chèn bảng biểu"
                  onClick={() => {
                    captureCaretSelection();
                    setShowTableBox((v) => !v);
                    setShowLinkBox(false);
                    setShowImageBox(false);
                  }}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Table2 className="h-4 w-4" />
                  Bảng
                </button>
                <button
                  type="button"
                  title="Chèn liên kết"
                  onClick={() => {
                    captureCaretSelection();
                    setShowLinkBox((v) => !v);
                    setShowTableBox(false);
                    setShowImageBox(false);
                  }}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Link2 className="h-4 w-4" />
                  Link
                </button>
                <button
                  type="button"
                  title="Chèn ảnh từ máy tính hoặc Google Drive"
                  onClick={() => {
                    captureCaretSelection();
                    setShowImageBox((v) => !v);
                    setShowTableBox(false);
                    setShowLinkBox(false);
                  }}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-bold text-blue-900 hover:bg-blue-100"
                >
                  <ImageIcon className="h-4 w-4" />
                  Chèn Ảnh / Drive
                </button>

                <button
                  type="button"
                  onClick={() => {
                    syncFromEditor();
                    setPreviewMode((p) => !p);
                  }}
                  className={`ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
                    previewMode
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  {previewMode ? 'Đang xem trước' : 'Xem trước'}
                </button>
              </div>

              {/* Popover: Insert Table */}
              {showTableBox && (
                <div className="flex flex-wrap items-center gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3 text-xs">
                  <span className="font-bold text-blue-950">Chèn bảng tại vị trí con trỏ:</span>
                  <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                    Số dòng
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={tableRows}
                      onChange={(e) => setTableRows(Number(e.target.value) || 3)}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-bold tabular-nums"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                    Số cột
                    <input
                      type="number"
                      min={2}
                      max={8}
                      value={tableCols}
                      onChange={(e) => setTableCols(Number(e.target.value) || 3)}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-bold tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleInsertTable}
                    className="rounded-lg bg-blue-900 px-3 py-1.5 font-bold text-white hover:bg-blue-800"
                  >
                    Chèn bảng
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTableBox(false)}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    Đóng
                  </button>
                </div>
              )}

              {/* Popover: Insert Link */}
              {showLinkBox && (
                <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/70 px-4 py-3 text-xs">
                  <input
                    type="text"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Chữ hiển thị (VD: Đăng ký ngay)"
                    className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://daythemnhantri.com"
                    className="min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                  />
                  <button
                    type="button"
                    onClick={handleInsertLink}
                    className="rounded-lg bg-blue-900 px-3 py-1.5 font-bold text-white hover:bg-blue-800"
                  >
                    Chèn liên kết
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkBox(false)}
                    className="text-slate-500 hover:text-slate-800"
                  >
                    Đóng
                  </button>
                </div>
              )}

              {/* Popover: Insert Image (Computer / Google Drive / URL) */}
              {showImageBox && (
                <div className="space-y-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-blue-950">Chèn hình ảnh vào vị trí con trỏ:</span>
                    <input
                      ref={inlineFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const dataUrl = await compressLocalImage(f);
                          handleInsertImageIntoArticle(dataUrl, insertImgCaption || f.name.replace(/\.[^.]+$/, ''));
                        } catch (err) {
                          showToast('err', err instanceof Error ? err.message : 'Lỗi đọc ảnh.');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => inlineFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Tải từ máy tính
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriveTarget('INLINE')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 px-3 py-1.5 font-bold text-white hover:bg-blue-800"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Chọn từ Google Drive cá nhân
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="font-semibold text-slate-600">Kích thước:</span>
                      {(['50%', '75%', '100%'] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setInsertImgWidth(w)}
                          className={`rounded-md px-2 py-1 font-bold ${
                            insertImgWidth === w
                              ? 'bg-blue-900 text-white'
                              : 'border border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={insertImgUrl}
                      onChange={(e) => setInsertImgUrl(e.target.value)}
                      placeholder="Hoặc dán URL ảnh (https://...)"
                      className="min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                    />
                    <input
                      type="text"
                      value={insertImgCaption}
                      onChange={(e) => setInsertImgCaption(e.target.value)}
                      placeholder="Chú thích ảnh (không bắt buộc)"
                      className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                    />
                    <button
                      type="button"
                      disabled={!insertImgUrl.trim()}
                      onClick={() => handleInsertImageIntoArticle(insertImgUrl, insertImgCaption)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Chèn từ URL
                    </button>
                  </div>
                </div>
              )}

              {/* A4 Page Document Canvas */}
              <div className="bg-slate-100/80 p-4 sm:p-6">
                {previewMode ? (
                  <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-800">
                      {category}
                    </p>
                    <h1 className="mt-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
                      {title || 'Tiêu đề bài viết chưa nhập'}
                    </h1>
                    {excerpt && (
                      <p className="mt-3 text-base font-medium text-slate-600">{excerpt}</p>
                    )}
                    {coverImageUrl && sanitizeSafeUrl(coverImageUrl, true) && (
                      <img
                        src={sanitizeSafeUrl(coverImageUrl, true)}
                        alt={title}
                        className="mt-5 max-h-80 w-full rounded-xl object-cover"
                      />
                    )}
                    <div
                      className="prose prose-slate mt-6 max-w-none text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_ul]:list-disc [&_ul]:pl-6"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(htmlValue) }}
                    />
                  </article>
                ) : (
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onKeyUp={captureCaretSelection}
                    onMouseUp={captureCaretSelection}
                    onFocus={captureCaretSelection}
                    onBlur={() => {
                      captureCaretSelection();
                      syncFromEditor();
                    }}
                    onInput={syncFromEditor}
                    className="mx-auto min-h-[460px] max-w-3xl rounded-xl border border-slate-200 bg-white p-6 text-[15px] leading-relaxed text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:p-10 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-bold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                  />
                )}
              </div>

              {/* Save Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
                <p className="text-xs text-slate-500">
                  Tác giả: <strong className="text-slate-700">{user.name}</strong> · Nội dung tự động
                  lọc bảo mật HTML trước khi xuất bản.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveArticle('DRAFT')}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Lưu nháp
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveArticle('PUBLISHED')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-900 px-5 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving
                      ? 'Đang lưu...'
                      : editingArticleId
                      ? 'Cập nhật & Xuất bản'
                      : 'Xuất bản bài viết'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: 5 Reusable Static Content Blocks + Insert At Cursor */}
          <div className="space-y-4 xl:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Block tĩnh chèn nhanh tại con trỏ
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Đặt con trỏ trong bài viết rồi bấm Chèn — bản sao sửa được ngay tại chỗ.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateBlockModal}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-blue-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Block mới
                </button>
              </div>

              {/* Category filter */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setBlockFilter('ALL')}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    blockFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tất cả ({normalizedBlocks.length})
                </button>
                {(Object.keys(REUSABLE_BLOCK_CATEGORY_LABELS) as ReusableBlockCategory[]).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBlockFilter(cat)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                        blockFilter === cat
                          ? 'bg-blue-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {REUSABLE_BLOCK_CATEGORY_LABELS[cat]}
                    </button>
                  ),
                )}
              </div>

              {/* Block Cards */}
              <div className="mt-4 max-h-[680px] space-y-3 overflow-y-auto pr-1">
                {filteredBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition hover:border-blue-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                          {REUSABLE_BLOCK_CATEGORY_LABELS[block.category]}
                        </p>
                        <h5 className="mt-0.5 text-sm font-extrabold text-slate-900">
                          {block.name}
                        </h5>
                      </div>
                    </div>
                    {block.description && (
                      <p className="mt-1 text-xs text-slate-600">{block.description}</p>
                    )}

                    {/* Compact visual preview */}
                    <div
                      className="mt-2.5 max-h-28 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.htmlContent) }}
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          insertHtmlAtCursor(
                            block.htmlContent,
                            `Đã chèn "${block.name}" vào vị trí con trỏ (sửa trực tiếp ngay tại chỗ).`,
                          )
                        }
                        className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Chèn tại con trỏ
                      </button>
                      <button
                        type="button"
                        title="Sửa block tĩnh"
                        onClick={() => openEditBlockModal(block)}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Nhân bản block"
                        onClick={() => void handleDuplicateBlock(block)}
                        className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 2: ARTICLES LIST */}
      {subView === 'LIST' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-base font-extrabold text-slate-900">
              Danh sách Bài viết ({articles.length})
            </h4>
            <button
              type="button"
              onClick={handleStartNewArticle}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800"
            >
              <FilePlus2 className="h-4 w-4" />
              Soạn bài mới
            </button>
          </div>
          {articles.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">
              Chưa có bài viết nào. Bấm &ldquo;Soạn bài mới&rdquo; để bắt đầu.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-200">
              {articles.map((art) => (
                <div
                  key={art.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    {art.coverImageUrl && sanitizeSafeUrl(art.coverImageUrl, true) ? (
                      <img
                        src={sanitizeSafeUrl(art.coverImageUrl, true)}
                        alt={art.title}
                        className="h-16 w-24 shrink-0 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-blue-800">{art.category}</span>
                        <span className="text-slate-300">·</span>
                        <span
                          className={`font-bold ${
                            art.status === 'PUBLISHED' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {art.status === 'PUBLISHED' ? 'Đang xuất bản' : 'Bản nháp'}
                        </span>
                        {art.featured && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-bold text-amber-600">Nổi bật</span>
                          </>
                        )}
                      </div>
                      <h5 className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                        {art.title}
                      </h5>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {art.excerpt || 'Không có mô tả ngắn'} · Cập nhật{' '}
                        {new Date(art.updatedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditArticle(art)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Chỉnh sửa
                    </button>
                    {confirmDeleteArticleId === art.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleDeleteArticle(art.id)}
                          className="min-h-[40px] rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700"
                        >
                          Xác nhận xóa
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteArticleId(null)}
                          className="min-h-[40px] rounded-xl border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteArticleId(art.id)}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 3: FULL REUSABLE BLOCKS MANAGEMENT */}
      {subView === 'BLOCKS' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-extrabold text-slate-900">
                Thư viện Block tĩnh dùng lại ({normalizedBlocks.length} mẫu)
              </h4>
              <p className="text-xs text-slate-500">
                Quản lý 5 Block chuẩn của Nhân Trí và tạo thêm các khối thông tin lặp lại (chính sách,
                lịch khai giảng, bảng học phí, ghi chú phụ huynh...).
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateBlockModal}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              Tạo Block tĩnh mới
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {normalizedBlocks.map((block) => (
              <div
                key={block.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                        {REUSABLE_BLOCK_CATEGORY_LABELS[block.category]}
                        {block.isSystemDefault ? ' · Mẫu chuẩn Nhân Trí' : ''}
                      </p>
                      <h5 className="mt-0.5 text-sm font-extrabold text-slate-900">{block.name}</h5>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{block.description}</p>
                  <div
                    className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.htmlContent) }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSubView('EDITOR');
                      insertHtmlAtCursor(
                        block.htmlContent,
                        `Đã chèn "${block.name}" vào trình soạn thảo bài viết.`,
                      );
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Chèn vào bài viết
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditBlockModal(block)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicateBlock(block)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Nhân bản
                  </button>
                  {confirmDeleteBlockId === block.id ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDeleteBlock(block.id)}
                        className="min-h-[38px] rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                      >
                        Xác nhận xóa
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteBlockId(null)}
                        className="min-h-[38px] rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteBlockId(block.id)}
                      className="ml-auto inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Reusable Block */}
      {blockModalOpen && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h4 className="text-base font-extrabold text-slate-900">
                {editingBlockId ? 'Chỉnh sửa Block tĩnh' : 'Tạo Block tĩnh mới'}
              </h4>
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    Tên Block tĩnh
                  </label>
                  <input
                    type="text"
                    value={blockName}
                    onChange={(e) => setBlockName(e.target.value)}
                    placeholder="VD: Thông tin chuyển khoản VietQR chuẩn"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-blue-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    Nhóm mục đích
                  </label>
                  <select
                    value={blockCategory}
                    onChange={(e) => setBlockCategory(e.target.value as ReusableBlockCategory)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-blue-700"
                  >
                    {(Object.keys(REUSABLE_BLOCK_CATEGORY_LABELS) as ReusableBlockCategory[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {REUSABLE_BLOCK_CATEGORY_LABELS[k]}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Mô tả ngắn (giúp admin nhận diện nhanh)
                </label>
                <input
                  type="text"
                  value={blockDesc}
                  onChange={(e) => setBlockDesc(e.target.value)}
                  placeholder="Khi nào nên chèn block này?"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-blue-700"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Nội dung trực quan của Block (chỉnh sửa trực tiếp bên dưới)
                </label>
                <div className="mt-1.5 flex items-center gap-1 rounded-t-xl border border-b-0 border-slate-300 bg-slate-50 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => document.execCommand('bold')}
                    className="rounded px-2 py-1 text-xs font-bold hover:bg-white"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => document.execCommand('italic')}
                    className="rounded px-2 py-1 text-xs italic hover:bg-white"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => document.execCommand('underline')}
                    className="rounded px-2 py-1 text-xs underline hover:bg-white"
                  >
                    U
                  </button>
                  <button
                    type="button"
                    onClick={() => document.execCommand('insertUnorderedList')}
                    className="rounded px-2 py-1 text-xs font-semibold hover:bg-white"
                  >
                    • Danh sách
                  </button>
                </div>
                <div
                  ref={blockEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => {
                    if (blockEditorRef.current) setBlockHtml(blockEditorRef.current.innerHTML);
                  }}
                  className="min-h-[180px] rounded-b-xl border border-slate-300 bg-white p-4 text-sm leading-relaxed outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={savingBlock}
                onClick={() => void handleSaveBlock()}
                className="min-h-[42px] rounded-xl bg-blue-900 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {savingBlock ? 'Đang lưu...' : 'Lưu Block tĩnh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personal Google Drive Image Picker */}
      <GoogleDrivePickerModal
        open={driveTarget !== null}
        mode="IMAGES"
        title={
          driveTarget === 'COVER'
            ? 'Chọn ảnh bìa bài viết từ Google Drive cá nhân'
            : 'Chọn ảnh chèn vào bài viết từ Google Drive cá nhân'
        }
        onSelectImage={(dataUrl, fileName) => {
          if (driveTarget === 'COVER') {
            setCoverImageUrl(dataUrl);
            showToast('ok', `Đã chọn ảnh bìa "${fileName}" từ Google Drive.`);
          } else if (driveTarget === 'INLINE') {
            handleInsertImageIntoArticle(
              dataUrl,
              insertImgCaption || fileName.replace(/\.[^.]+$/, ''),
            );
          }
          setDriveTarget(null);
        }}
        onClose={() => setDriveTarget(null)}
      />
    </div>
  );
};
