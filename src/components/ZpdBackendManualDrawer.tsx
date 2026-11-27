import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  GripVertical,
  Lightbulb,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BACKEND_MANUAL_ORDER, BACKEND_ZPD_MANUALS } from '../lib/zpdManualContent';

interface ZpdBackendManualDrawerProps {
  activeTab: string;
  onNavigateTab: (tabId: string) => void;
}

// 0 = Collapsed floating right-edge button (Confirmed default)
// 1 = Level 1 Compact side-by-side coaching drawer (~390px)
// 2 = Level 2 Expanded deep-dive drawer with chapter rail (~720px)
type DrawerLevel = 0 | 1 | 2;

const ZOOM_LEVELS = [85, 100, 115, 130, 140];

const MANUAL_POS_STORAGE_KEY = 'nhantri_backend_manual_btn_pos_v1';
const BTN_ESTIMATED_WIDTH = 176;
const BTN_ESTIMATED_HEIGHT = 56;

function clampManualButtonPos(pos: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(12, window.innerWidth - BTN_ESTIMATED_WIDTH - 12);
  const maxY = Math.max(12, window.innerHeight - BTN_ESTIMATED_HEIGHT - 12);
  return {
    x: Math.min(maxX, Math.max(12, Math.round(pos.x))),
    y: Math.min(maxY, Math.max(12, Math.round(pos.y))),
  };
}

function getDefaultTopRightPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 1000, y: 76 };
  return clampManualButtonPos({
    x: window.innerWidth - BTN_ESTIMATED_WIDTH - 16,
    y: 76,
  });
}

export const ZpdBackendManualDrawer: React.FC<ZpdBackendManualDrawerProps> = ({
  activeTab,
  onNavigateTab,
}) => {
  const [level, setLevel] = useState<DrawerLevel>(0);
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    BACKEND_ZPD_MANUALS[activeTab] ? activeTab : 'overview',
  );
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(100);
  const [query, setQuery] = useState<string>('');
  const [activeNodeIdx, setActiveNodeIdx] = useState<number>(0);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  // Draggable collapsed button position — defaults to Top-Right corner
  const [btnPos, setBtnPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = window.sessionStorage.getItem(MANUAL_POS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { x?: number; y?: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return clampManualButtonPos({ x: parsed.x, y: parsed.y });
        }
      }
    } catch {
      // ignore sessionStorage restrictions
    }
    return getDefaultTopRightPos();
  });
  const [hasCustomPos, setHasCustomPos] = useState<boolean>(() => {
    try {
      return Boolean(window.sessionStorage.getItem(MANUAL_POS_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setBtnPos((prev) => (hasCustomPos ? clampManualButtonPos(prev) : getDefaultTopRightPos()));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hasCustomPos]);

  const resetToTopRight = () => {
    const next = getDefaultTopRightPos();
    setBtnPos(next);
    setHasCustomPos(false);
    try {
      window.sessionStorage.removeItem(MANUAL_POS_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // Sync manual chapter automatically when Admin switches left-nav tabs
  useEffect(() => {
    if (autoSync && BACKEND_ZPD_MANUALS[activeTab]) {
      setSelectedChapterId(activeTab);
      setActiveNodeIdx(0);
    }
  }, [activeTab, autoSync]);

  const chapter = BACKEND_ZPD_MANUALS[selectedChapterId] || BACKEND_ZPD_MANUALS.overview;

  const filteredChapterIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...BACKEND_MANUAL_ORDER];
    return BACKEND_MANUAL_ORDER.filter((id) => {
      const ch = BACKEND_ZPD_MANUALS[id];
      if (!ch) return false;
      return (
        ch.title.toLowerCase().includes(q) ||
        ch.badge.toLowerCase().includes(q) ||
        ch.subtitle.toLowerCase().includes(q) ||
        ch.keywords.some((k) => k.toLowerCase().includes(q)) ||
        ch.layer2Steps.some(
          (s) => s.title.toLowerCase().includes(q) || s.instruction.toLowerCase().includes(q),
        )
      );
    });
  }, [query]);

  const zoomIndex = ZOOM_LEVELS.indexOf(zoom);
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;

  // Collapsed State (Level 0): Top-right default draggable floating button
  if (level === 0) {
    const currentTabTitle = BACKEND_ZPD_MANUALS[activeTab]?.title || 'Cẩm nang Quản trị';
    return (
      <div
        style={{ left: `${btnPos.x}px`, top: `${btnPos.y}px` }}
        className="fixed z-40 flex items-center gap-1 select-none touch-none"
      >
        <div
          role="button"
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragStateRef.current = {
              pointerId: e.pointerId,
              startClientX: e.clientX,
              startClientY: e.clientY,
              originX: btnPos.x,
              originY: btnPos.y,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const st = dragStateRef.current;
            if (!st || st.pointerId !== e.pointerId) return;
            const dx = e.clientX - st.startClientX;
            const dy = e.clientY - st.startClientY;
            if (!st.moved && Math.hypot(dx, dy) > 5) {
              st.moved = true;
              setIsDragging(true);
            }
            if (st.moved) {
              const clamped = clampManualButtonPos({
                x: st.originX + dx,
                y: st.originY + dy,
              });
              setBtnPos(clamped);
            }
          }}
          onPointerUp={(e) => {
            const st = dragStateRef.current;
            if (!st || st.pointerId !== e.pointerId) return;
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
            const wasDragged = st.moved;
            dragStateRef.current = null;
            setIsDragging(false);
            if (wasDragged) {
              setHasCustomPos(true);
              try {
                window.sessionStorage.setItem(
                  MANUAL_POS_STORAGE_KEY,
                  JSON.stringify(
                    clampManualButtonPos({
                      x: st.originX + (e.clientX - st.startClientX),
                      y: st.originY + (e.clientY - st.startClientY),
                    }),
                  ),
                );
              } catch {
                // ignore
              }
            } else {
              setLevel(1);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setLevel(1);
            }
          }}
          title={`Kéo thả để di chuyển vị trí · Nhấn để mở Cẩm nang: ${currentTabTitle}`}
          className={`group flex items-center gap-2 rounded-2xl border border-blue-700 bg-blue-900 px-3 py-2.5 text-white shadow-xl transition ${
            isDragging
              ? 'scale-[1.03] cursor-grabbing bg-blue-800 shadow-2xl ring-2 ring-amber-300'
              : 'cursor-grab hover:bg-blue-800'
          }`}
        >
          <GripVertical className="h-4 w-4 shrink-0 text-blue-300" />
          <div className="text-left">
            <div className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
              <BookOpen className="h-3.5 w-3.5 text-amber-300" />
              <span>Cẩm nang</span>
            </div>
            <div className="max-w-[105px] truncate text-[10px] text-blue-200">
              {currentTabTitle}
            </div>
          </div>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        </div>

        {hasCustomPos && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resetToTopRight();
            }}
            title="Đưa nút Cẩm nang về góc trên bên phải"
            aria-label="Đưa nút Cẩm nang về góc trên bên phải"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-blue-50 hover:text-blue-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  const activeNode = chapter.layer1Flow[activeNodeIdx] || chapter.layer1Flow[0];
  const isExpanded = level === 2;

  return (
    <aside
      aria-label="Cẩm nang hướng dẫn quản trị Backend"
      className={`fixed top-0 right-0 bottom-0 z-40 bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-all duration-200 ${
        isExpanded ? 'w-full sm:w-[700px] lg:w-[760px]' : 'w-full sm:w-[390px]'
      }`}
    >
      {/* Header Bar with 2-Level Expand Toggle & Zoom Controls */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-blue-900">
              Cẩm nang Quản trị · {isExpanded ? 'Cấp 2 (Mở rộng)' : 'Cấp 1 (Gọn)'}
            </div>
            <div className="text-xs font-bold text-slate-950 truncate">{chapter.title}</div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Zoom Controls */}
          <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
            <button
              type="button"
              disabled={!canZoomOut}
              onClick={() => canZoomOut && setZoom(ZOOM_LEVELS[zoomIndex - 1])}
              className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer"
              title="Thu nhỏ"
              aria-label="Thu nhỏ nội dung cẩm nang"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="px-1.5 text-[11px] font-bold text-slate-800 tabular-nums cursor-pointer"
              title="Đặt lại 100%"
            >
              {zoom}%
            </button>
            <button
              type="button"
              disabled={!canZoomIn}
              onClick={() => canZoomIn && setZoom(ZOOM_LEVELS[zoomIndex + 1])}
              className="p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer"
              title="Phóng to"
              aria-label="Phóng to nội dung cẩm nang"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2-Level Toggle Button */}
          <button
            type="button"
            onClick={() => setLevel(isExpanded ? 1 : 2)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 text-blue-950 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
            title={isExpanded ? 'Thu về Cấp 1 (Đọc song song)' : 'Mở rộng Cấp 2 (Đọc chuyên sâu + Mục lục)'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isExpanded ? 'Cấp 1' : 'Cấp 2'}</span>
          </button>

          {/* Collapse back to floating edge tab */}
          <button
            type="button"
            onClick={() => setLevel(0)}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
            title="Thu gọn thành nút nổi bên phải"
            aria-label="Thu gọn cẩm nang"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search + Sync Indicator Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-white space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm menu, quy trình TKB, nhập Excel, mẫu in..."
              className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-900"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Xóa từ khóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !autoSync;
              setAutoSync(next);
              if (next && BACKEND_ZPD_MANUALS[activeTab]) {
                setSelectedChapterId(activeTab);
              }
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer whitespace-nowrap ${
              autoSync
                ? 'bg-blue-50 text-blue-900 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
            title="Tự đổi bài hướng dẫn theo menu bạn đang mở"
          >
            {autoSync ? 'Đồng bộ menu: Bật' : 'Đồng bộ menu: Tắt'}
          </button>
        </div>

        {/* Compact Chapter Selector in Level 1 */}
        {!isExpanded && (
          <select
            value={selectedChapterId}
            onChange={(e) => {
              setSelectedChapterId(e.target.value);
              setActiveNodeIdx(0);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-900"
          >
            {filteredChapterIds.map((id) => {
              const ch = BACKEND_ZPD_MANUALS[id];
              return (
                <option key={id} value={id}>
                  {ch.title} {id === activeTab ? '(Đang mở)' : ''}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {/* Main Split Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Level 2 Left Chapter Directory Rail */}
        {isExpanded && (
          <nav className="hidden sm:flex w-56 border-r border-slate-200 bg-slate-50/80 flex-col overflow-y-auto p-2.5 space-y-1 shrink-0">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Mục lục 11 màn hình ({filteredChapterIds.length})
            </div>
            {filteredChapterIds.map((id) => {
              const ch = BACKEND_ZPD_MANUALS[id];
              const isSelected = id === selectedChapterId;
              const isCurrentScreen = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSelectedChapterId(id);
                    setActiveNodeIdx(0);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-900 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  <div className="truncate">{ch.title}</div>
                  <div
                    className={`text-[10px] mt-0.5 truncate ${
                      isSelected ? 'text-blue-200' : 'text-slate-500'
                    }`}
                  >
                    {isCurrentScreen ? 'Đang mở trên màn hình' : ch.badge}
                  </div>
                </button>
              );
            })}
          </nav>
        )}

        {/* Right Reading Canvas (Zoomable) */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40">
          <div style={{ fontSize: `${zoom}%` }} className="space-y-4">
            {/* Chapter Header Card */}
            <div className="bg-blue-950 text-white rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72em] text-blue-200 font-semibold">
                <span>{chapter.badge}</span>
                <span>{chapter.readMinutes}</span>
              </div>
              <h3 className="text-[1.15em] font-bold leading-snug">{chapter.title}</h3>
              <p className="text-[0.82em] text-blue-100/90 leading-relaxed">{chapter.subtitle}</p>
              <div className="pt-1 text-[0.8em] text-amber-200 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{chapter.zpdPromise}</span>
              </div>
              {selectedChapterId !== activeTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab(selectedChapterId)}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-950 hover:bg-blue-50 text-[0.78em] font-bold cursor-pointer"
                >
                  <span>Chuyển sang màn hình này</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ZPD LAYER 1: Quick Operational Flow */}
            <section className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
              <div className="text-[0.72em] font-bold uppercase tracking-wide text-blue-900 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Tầng 1 · Luồng vận hành 30 giây</span>
              </div>

              <div className={`grid gap-2 ${isExpanded ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {chapter.layer1Flow.map((node, idx) => {
                  const selected = idx === activeNodeIdx;
                  return (
                    <button
                      key={node.step}
                      type="button"
                      onClick={() => setActiveNodeIdx(idx)}
                      className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                        selected
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-slate-50 text-slate-900 border-slate-200 hover:bg-blue-50/70'
                      }`}
                    >
                      <div className={`text-[0.7em] font-bold tabular-nums ${selected ? 'text-amber-300' : 'text-blue-900'}`}>
                        Bước {node.step}
                      </div>
                      <div className="text-[0.86em] font-bold mt-0.5">{node.title}</div>
                      <p className={`text-[0.76em] mt-0.5 leading-relaxed ${selected ? 'text-blue-100' : 'text-slate-600'}`}>
                        {node.summary}
                      </p>
                    </button>
                  );
                })}
              </div>

              {activeNode && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[0.8em] text-slate-900 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-950">Lưu ý thực tế:</strong> {activeNode.tip}
                  </div>
                </div>
              )}
            </section>

            {/* ZPD LAYER 2: Step-by-Step Operational Checklist */}
            <section className="space-y-2.5">
              <div className="text-[0.72em] font-bold uppercase tracking-wide text-emerald-700">
                Tầng 2 · Thao tác chuẩn từng bước
              </div>
              {chapter.layer2Steps.map((step, idx) => {
                const key = `${selectedChapterId}-${idx}`;
                const done = Boolean(checkedSteps[key]);
                return (
                  <div
                    key={step.number}
                    className={`bg-white border rounded-2xl p-3.5 space-y-1.5 transition ${
                      done ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[0.72em] font-bold text-blue-900 uppercase">
                          {step.number}
                        </span>
                        <h4 className="text-[0.9em] font-bold text-slate-950">{step.title}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCheckedSteps((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`shrink-0 p-1.5 rounded-lg border cursor-pointer ${
                          done
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:text-emerald-700'
                        }`}
                        title={done ? 'Bỏ đánh dấu' : 'Đánh dấu đã thực hành'}
                        aria-label="Đánh dấu hoàn thành bước"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[0.82em] text-slate-700 leading-relaxed">{step.instruction}</p>
                    <p className="text-[0.76em] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                      {step.example}
                    </p>
                    {step.targetTab && step.targetTab !== activeTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateTab(step.targetTab!)}
                        className="inline-flex items-center gap-1 text-[0.76em] font-semibold text-blue-900 hover:underline pt-1 cursor-pointer"
                      >
                        <span>{step.ctaLabel || 'Mở mục liên quan'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </section>

            {/* ZPD LAYER 3: Operational Governance & Mastery Rules */}
            <section className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
              <div className="text-[0.72em] font-bold uppercase tracking-wide text-amber-700">
                Tầng 3 · Quy tắc vận hành &amp; chống sai sót
              </div>
              <div className="space-y-2">
                {chapter.layer3Mastery.map((tip) => (
                  <div key={tip.title} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <div className="text-[0.84em] font-bold text-slate-950">{tip.title}</div>
                    <p className="text-[0.78em] text-slate-600 mt-0.5 leading-relaxed">{tip.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
};
