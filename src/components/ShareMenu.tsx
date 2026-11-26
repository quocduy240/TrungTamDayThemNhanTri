import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Facebook, MessageCircle, Share2 } from 'lucide-react';

interface ShareMenuProps {
  title: string;
  text?: string;
  url?: string;
  label?: string;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  variant?: 'subtle' | 'outline' | 'dark';
}

export const ShareMenu: React.FC<ShareMenuProps> = ({
  title,
  text,
  url,
  label = 'Chia sẻ',
  size = 'sm',
  align = 'right',
  variant = 'subtle',
}) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zaloCopied, setZaloCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const shareUrl =
    url || (typeof window !== 'undefined' ? window.location.href : 'https://daythemnhantri.com');
  const shareText = text || `${title} — Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Long Xuyên)`;

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const copyToClipboard = async (value: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // fallback below
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleZaloShare = async () => {
    await copyToClipboard(`${shareText}\n${shareUrl}`);
    setZaloCopied(true);
    setTimeout(() => setZaloCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
        setOpen(false);
        return;
      } catch {
        // User cancelled or browser blocked inside iframe; keep popover open
      }
    }
    setOpen((prev) => !prev);
  };

  const fbShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
  const zaloShareHref = `https://zalo.me/0947376444`;

  const triggerClass =
    variant === 'dark'
      ? 'text-slate-200 hover:text-white hover:bg-white/10 border border-white/15'
      : variant === 'outline'
        ? 'bg-white text-slate-700 hover:text-[#1E3A8A] hover:border-blue-300 border border-slate-200'
        : 'text-slate-600 hover:text-[#1E3A8A] hover:bg-blue-50/70 border border-transparent hover:border-blue-200/70';

  const padClass = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-label={label}
        className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${padClass} ${triggerClass}`}
      >
        <Share2 className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-40 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-lg p-2 text-left ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="px-2.5 py-1.5 border-b border-slate-100 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Chia sẻ liên kết
            </p>
            <p className="text-xs font-semibold text-slate-800 line-clamp-1 mt-0.5">{title}</p>
          </div>

          <div className="space-y-1">
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-[#1E3A8A] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-[#1E3A8A]" />
                  Chia sẻ nhanh trên thiết bị
                </span>
              </button>
            )}

            <a
              href={fbShareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-[#1877F2] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Facebook className="w-4 h-4 text-[#1877F2]" />
                Chia sẻ lên Facebook
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            <a
              href={zaloShareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleZaloShare}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-sky-50 hover:text-[#0068FF] transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#0068FF]" />
                {zaloCopied ? 'Đã chép nội dung — Mở Zalo' : 'Gửi qua Zalo (Chép & Mở)'}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                {copied ? 'Đã sao chép liên kết!' : 'Sao chép liên kết'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
