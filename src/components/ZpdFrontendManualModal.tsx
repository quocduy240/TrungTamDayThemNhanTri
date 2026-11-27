import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Lightbulb,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { FrontendMode } from '../types';
import {
  FRONTEND_ZPD_MANUALS,
  type FrontendManualPersona,
  mapFrontendModeToManualPersona,
} from '../lib/zpdManualContent';

interface ZpdFrontendManualModalProps {
  open: boolean;
  frontendMode: FrontendMode;
  userRole?: string;
  onClose: () => void;
  onJumpToAnchor?: (anchor: string, suggestedMode?: FrontendMode) => void;
}

const PERSONA_TABS: { id: FrontendManualPersona; label: string; shortLabel: string }[] = [
  { id: 'NEW_CUSTOMER', label: 'Khách hàng mới', shortLabel: 'Khách mới' },
  { id: 'STUDENT', label: 'Học sinh', shortLabel: 'Học sinh' },
  { id: 'PARENT', label: 'Phụ huynh', shortLabel: 'Phụ huynh' },
  { id: 'TEACHER', label: 'Giáo viên & Trả bài', shortLabel: 'Giáo viên' },
];

const ZOOM_LEVELS = [85, 100, 115, 130, 140];

export const ZpdFrontendManualModal: React.FC<ZpdFrontendManualModalProps> = ({
  open,
  frontendMode,
  userRole,
  onClose,
  onJumpToAnchor,
}) => {
  const defaultPersona = useMemo(
    () => mapFrontendModeToManualPersona(frontendMode, userRole),
    [frontendMode, userRole],
  );

  const [persona, setPersona] = useState<FrontendManualPersona>(defaultPersona);
  const [zoom, setZoom] = useState<number>(100);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [activeNodeIdx, setActiveNodeIdx] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setPersona(defaultPersona);
      setActiveNodeIdx(0);
    }
  }, [open, defaultPersona]);

  const chapter = FRONTEND_ZPD_MANUALS[persona];

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (Object.entries(FRONTEND_ZPD_MANUALS) as [FrontendManualPersona, typeof chapter][]).filter(
      ([, ch]) =>
        ch.title.toLowerCase().includes(q) ||
        ch.subtitle.toLowerCase().includes(q) ||
        ch.keywords.some((k) => k.toLowerCase().includes(q)) ||
        ch.layer2Steps.some(
          (s) => s.title.toLowerCase().includes(q) || s.instruction.toLowerCase().includes(q),
        ),
    );
  }, [query]);

  if (!open) return null;

  const zoomIndex = ZOOM_LEVELS.indexOf(zoom);
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;

  function handleJump(anchor?: string) {
    if (!anchor) return;
    const targetMode: FrontendMode | undefined =
      persona === 'PARENT'
        ? 'PARENT'
        : persona === 'STUDENT' || persona === 'TEACHER'
          ? 'TEACHER_STUDENT'
          : 'NEW_CUSTOMER';
    onJumpToAnchor?.(anchor, targetMode);
    onClose();
  }

  function toggleStepDone(key: string) {
    setCompletedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const activeNode = chapter.layer1Flow[activeNodeIdx] || chapter.layer1Flow[0];
  const doneCount = chapter.layer2Steps.filter((_, idx) => completedSteps[`${persona}-${idx}`]).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cẩm nang hướng dẫn sử dụng Cổng Nhân Trí"
    >
      <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          expanded ? 'w-full h-[96vh] max-w-[1440px]' : 'w-full max-w-5xl h-[90vh]'
        }`}
      >
        {/* Top Control Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-blue-900">
                Cẩm nang tương tác theo Vùng Phát Triển Gần (ZPD)
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-950 truncate">
                Hướng dẫn sử dụng Cổng daythemnhantri.com
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom Controls */}
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
              <button
                type="button"
                disabled={!canZoomOut}
                onClick={() => canZoomOut && setZoom(ZOOM_LEVELS[zoomIndex - 1])}
                className="p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded-lg cursor-pointer"
                title="Thu nhỏ chữ"
                aria-label="Thu nhỏ chữ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="px-2 text-xs font-bold text-slate-800 tabular-nums cursor-pointer"
                title="Đặt lại 100%"
              >
                {zoom}%
              </button>
              <button
                type="button"
                disabled={!canZoomIn}
                onClick={() => canZoomIn && setZoom(ZOOM_LEVELS[zoomIndex + 1])}
                className="p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded-lg cursor-pointer"
                title="Phóng to chữ"
                aria-label="Phóng to chữ"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              title={expanded ? 'Thu gọn khung' : 'Phóng to toàn màn hình'}
              aria-label={expanded ? 'Thu gọn khung' : 'Phóng to toàn màn hình'}
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Đóng cẩm nang"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Persona Switcher + Search Bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {PERSONA_TABS.map((t) => {
              const active = persona === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPersona(t.id);
                    setActiveNodeIdx(0);
                    setQuery('');
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap min-h-[40px] ${
                    active
                      ? 'bg-blue-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm nhanh: học phí, QR, chuông báo, thi thử..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-900"
            />
          </div>
        </div>

        {/* Main Scalable Reading Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/70">
          <div style={{ fontSize: `${zoom}%` }} className="space-y-6 max-w-4xl mx-auto">
            {/* Search Results Quick Picker */}
            {query.trim().length > 0 && (
              <div className="bg-white border border-blue-200 rounded-2xl p-4 space-y-2">
                <div className="text-[0.8em] font-bold text-blue-950">
                  Kết quả tìm thấy cho “{query}” ({searchMatches.length} đối tượng)
                </div>
                {searchMatches.length === 0 ? (
                  <p className="text-[0.82em] text-slate-500">
                    Không tìm thấy từ khóa trùng khớp. Thử từ khóa khác như “học phí”, “QR”, “chuông báo” hoặc “xin nghỉ”.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {searchMatches.map(([pKey, ch]) => (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => {
                          setPersona(pKey);
                          setActiveNodeIdx(0);
                          setQuery('');
                        }}
                        className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-950 text-[0.8em] font-semibold cursor-pointer text-left"
                      >
                        {ch.badge} · {ch.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chapter Hero Banner */}
            <div className="bg-blue-950 text-white rounded-2xl p-5 sm:p-6 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[0.75em] text-blue-200 font-semibold">
                <span>{chapter.badge}</span>
                <span>·</span>
                <span>{chapter.readMinutes}</span>
                <span>·</span>
                <span className="tabular-nums">
                  Tiến độ thực hành: {doneCount}/{chapter.layer2Steps.length} bước
                </span>
              </div>
              <h3 className="text-[1.35em] font-bold leading-snug">{chapter.title}</h3>
              <p className="text-[0.88em] text-blue-100/90 leading-relaxed">{chapter.subtitle}</p>
              <div className="pt-2 text-[0.84em] text-amber-200 font-medium flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Mục tiêu sau khi đọc: {chapter.zpdPromise}</span>
              </div>
            </div>

            {/* ZPD LAYER 1: 30s Interactive Visual Flow */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[0.74em] font-bold uppercase tracking-wide text-blue-900 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Tầng 1 · Sơ đồ nắm luồng trong 30 giây</span>
                  </div>
                  <h4 className="text-[1.05em] font-bold text-slate-950 mt-0.5">
                    Chạm từng ô để xem mẹo thực hành nhanh
                  </h4>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {chapter.layer1Flow.map((node, idx) => {
                  const selected = idx === activeNodeIdx;
                  return (
                    <button
                      key={node.step}
                      type="button"
                      onClick={() => setActiveNodeIdx(idx)}
                      className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                        selected
                          ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                          : 'bg-slate-50 text-slate-900 border-slate-200 hover:bg-blue-50/70'
                      }`}
                    >
                      <div className={`text-[0.72em] font-bold tabular-nums ${selected ? 'text-amber-300' : 'text-blue-900'}`}>
                        Chặng {node.step}
                      </div>
                      <div className="text-[0.88em] font-bold mt-1 leading-snug">{node.title}</div>
                      <p className={`text-[0.78em] mt-1 leading-relaxed ${selected ? 'text-blue-100' : 'text-slate-600'}`}>
                        {node.summary}
                      </p>
                    </button>
                  );
                })}
              </div>

              {activeNode && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2 text-[0.84em] text-slate-900">
                    <Lightbulb className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-950">Gợi ý chặng {activeNode.step}:</strong> {activeNode.tip}
                    </div>
                  </div>
                  {activeNode.targetAnchor && (
                    <button
                      type="button"
                      onClick={() => handleJump(activeNode.targetAnchor)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-[0.78em] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Mở mục này ngay</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* ZPD LAYER 2: 3 Guided Action Steps with Real Examples & Deep Links */}
            <section className="space-y-3">
              <div>
                <div className="text-[0.74em] font-bold uppercase tracking-wide text-emerald-700">
                  Tầng 2 · Thực hành ngay 3 bước kèm ví dụ thật
                </div>
                <h4 className="text-[1.05em] font-bold text-slate-950 mt-0.5">
                  Đánh dấu từng bước đã hoàn thành để làm chủ ngay trong 1 lần dùng
                </h4>
              </div>

              <div className="space-y-3">
                {chapter.layer2Steps.map((step, idx) => {
                  const key = `${persona}-${idx}`;
                  const done = Boolean(completedSteps[key]);
                  return (
                    <div
                      key={step.number}
                      className={`bg-white border rounded-2xl p-4 sm:p-5 transition ${
                        done ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.75em] font-bold text-blue-900 uppercase">
                              {step.number}
                            </span>
                            <h5 className="text-[0.98em] font-bold text-slate-950">{step.title}</h5>
                          </div>
                          <p className="text-[0.86em] text-slate-700 leading-relaxed">{step.instruction}</p>
                          <p className="text-[0.8em] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            {step.example}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleStepDone(key)}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[0.76em] font-semibold cursor-pointer whitespace-nowrap min-h-[40px] ${
                            done
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{done ? 'Đã hiểu' : 'Đánh dấu'}</span>
                        </button>
                      </div>

                      {step.ctaLabel && step.targetAnchor && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleJump(step.targetAnchor)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-950 text-[0.8em] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <span>{step.ctaLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ZPD LAYER 3: Mastery Tips */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="text-[0.74em] font-bold uppercase tracking-wide text-amber-700">
                Tầng 3 · Mẹo nâng cao để dùng thật mượt
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {chapter.layer3Mastery.map((tip) => (
                  <div key={tip.title} className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
                    <div className="text-[0.88em] font-bold text-slate-950">{tip.title}</div>
                    <p className="text-[0.82em] text-slate-600 mt-1 leading-relaxed">{tip.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
