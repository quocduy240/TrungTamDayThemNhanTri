import React, { useRef } from 'react';
import { Download, FileCheck2, Printer, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface BrandedPrintModalProps {
  open: boolean;
  title: string;
  fileName: string;
  htmlContent: string;
  onClose: () => void;
}

/**
 * In-app A4 Branded Print & Download modal (never calls window.open so it works reliably in iframes).
 */
export const BrandedPrintModal: React.FC<BrandedPrintModalProps> = ({
  open,
  title,
  fileName,
  htmlContent,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  if (!open) return null;

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  function handleDownloadHtml() {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo size="sm" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-blue-900 flex items-center gap-1">
                <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                <span>Tài liệu gắn Logo &amp; Watermark bản quyền Trung Tâm Nhân Trí</span>
              </p>
              <h3 className="text-sm font-bold text-slate-950 truncate">{title}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In / Lưu PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-950 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file (.html)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-950 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              aria-label="Đóng bản xem trước"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-200/80 p-3 sm:p-5 overflow-hidden">
          <iframe
            ref={iframeRef}
            title={title}
            srcDoc={htmlContent}
            className="w-full h-full bg-white rounded-lg border border-slate-300 shadow-inner"
          />
        </div>
      </div>
    </div>
  );
};
