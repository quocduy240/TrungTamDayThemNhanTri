import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  Circle,
  Columns2,
  Download,
  Eraser,
  Highlighter,
  ImagePlus,
  Maximize2,
  Minimize2,
  Minus,
  PenTool,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { BRAND_LOGO_URL } from './BrandLogo';
import {
  computeFunctionTable,
  evaluateExpression,
  solveLinearSystem2,
  solveQuadratic,
  type AngleMode,
} from '../lib/scientificCalcEngine';

type PanelSize = 'SM' | 'MD' | 'LG' | 'FULL';
type CalcModelId = 'FX580VNX' | 'FX880BTG' | 'VINACAL680' | 'FX570VN';
type CalcSubMode = 'COMP' | 'QUAD' | 'SYS2' | 'TABLE';
type BoardTool = 'PEN' | 'HIGHLIGHTER' | 'ERASER' | 'LINE' | 'ARROW' | 'RECT' | 'CIRCLE';
type PaperTemplate = 'BLANK' | 'GRID' | 'RULED' | 'OXY';

interface CalcModelTheme {
  id: CalcModelId;
  name: string;
  brand: string;
  subtitle: string;
  shellBg: string;
  shellBorder: string;
  bezelBg: string;
  lcdBg: string;
  lcdText: string;
  accentText: string;
  primaryKeyBg: string;
  fnKeyBg: string;
  opKeyBg: string;
}

const CALC_MODELS: Record<CalcModelId, CalcModelTheme> = {
  FX580VNX: {
    id: 'FX580VNX',
    name: 'Casio fx-580VN X',
    brand: 'CASIO',
    subtitle: 'CLASSWIZ · Bộ GD&ĐT',
    shellBg: 'bg-slate-900',
    shellBorder: 'border-slate-700',
    bezelBg: 'bg-slate-800',
    lcdBg: 'bg-[#e7efe6]',
    lcdText: 'text-slate-950',
    accentText: 'text-amber-400',
    primaryKeyBg: 'bg-slate-100 text-slate-950 hover:bg-white',
    fnKeyBg: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700',
    opKeyBg: 'bg-blue-700 text-white hover:bg-blue-600',
  },
  FX880BTG: {
    id: 'FX880BTG',
    name: 'Casio fx-880BTG',
    brand: 'CASIO',
    subtitle: 'CLASSWIZ Gen 2 · Bộ GD&ĐT',
    shellBg: 'bg-zinc-900',
    shellBorder: 'border-zinc-700',
    bezelBg: 'bg-zinc-800',
    lcdBg: 'bg-[#edf2ec]',
    lcdText: 'text-zinc-950',
    accentText: 'text-sky-400',
    primaryKeyBg: 'bg-white text-zinc-950 hover:bg-zinc-100',
    fnKeyBg: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
    opKeyBg: 'bg-sky-700 text-white hover:bg-sky-600',
  },
  VINACAL680: {
    id: 'VINACAL680',
    name: 'Vinacal 680EX Plus',
    brand: 'VINACAL',
    subtitle: '680EX PLUS · Bộ GD&ĐT',
    shellBg: 'bg-blue-950',
    shellBorder: 'border-blue-800',
    bezelBg: 'bg-blue-900',
    lcdBg: 'bg-[#e6f1ee]',
    lcdText: 'text-slate-950',
    accentText: 'text-amber-300',
    primaryKeyBg: 'bg-white text-blue-950 hover:bg-blue-50',
    fnKeyBg: 'bg-blue-900 text-blue-50 hover:bg-blue-800 border border-blue-800',
    opKeyBg: 'bg-amber-600 text-white hover:bg-amber-500',
  },
  FX570VN: {
    id: 'FX570VN',
    name: 'Casio fx-570VN PLUS',
    brand: 'CASIO',
    subtitle: 'NATURAL-V.P.A.M · Bộ GD&ĐT',
    shellBg: 'bg-slate-700',
    shellBorder: 'border-slate-500',
    bezelBg: 'bg-blue-950',
    lcdBg: 'bg-[#dde8d8]',
    lcdText: 'text-slate-950',
    accentText: 'text-amber-300',
    primaryKeyBg: 'bg-slate-200 text-slate-950 hover:bg-white',
    fnKeyBg: 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600',
    opKeyBg: 'bg-emerald-700 text-white hover:bg-emerald-600',
  },
};

const MATH_SYMBOLS = [
  '√',
  'π',
  '²',
  '³',
  '≤',
  '≥',
  '≠',
  '∠',
  '△',
  '⊥',
  '∥',
  '°',
  '→',
  '∑',
  '∫',
  '±',
  '∞',
];

const INK_COLORS = [
  { label: 'Xanh mực', hex: '#1e3a8a' },
  { label: 'Đen', hex: '#0f172a' },
  { label: 'Đỏ', hex: '#dc2626' },
  { label: 'Xanh lá', hex: '#047857' },
];

interface ExamSmartWorkbenchProps {
  examTitle?: string;
}

const BOARD_WIDTH_CLASS: Record<PanelSize, string> = {
  SM: 'w-[340px] sm:w-[400px] h-[340px]',
  MD: 'w-[92vw] sm:w-[560px] h-[440px]',
  LG: 'w-[94vw] sm:w-[760px] h-[540px]',
  FULL: 'w-[96vw] max-w-[1160px] h-[82vh]',
};

const CALC_WIDTH_CLASS: Record<PanelSize, string> = {
  SM: 'w-[290px]',
  MD: 'w-[340px]',
  LG: 'w-[410px]',
  FULL: 'w-[94vw] max-w-[560px]',
};

export const ExamSmartWorkbench: React.FC<ExamSmartWorkbenchProps> = ({ examTitle }) => {
  // Default: compact sticky floating toolbar, user opens Whiteboard / Calculator / Both independently
  const [boardOpen, setBoardOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [boardSize, setBoardSize] = useState<PanelSize>('MD');
  const [calcSize, setCalcSize] = useState<PanelSize>('MD');
  const [dockMode, setDockMode] = useState<'BOTTOM_RIGHT' | 'BOTTOM_DOCK'>('BOTTOM_RIGHT');

  // --- Whiteboard State ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDrawingRef = useRef(false);
  const startPtRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotBeforeShapeRef = useRef<ImageData | null>(null);

  const [tool, setTool] = useState<BoardTool>('PEN');
  const [inkColor, setInkColor] = useState('#1e3a8a');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [paper, setPaper] = useState<PaperTemplate>('GRID');
  const [textInsert, setTextInsert] = useState('');
  const [pages, setPages] = useState<string[]>(['']);
  const [pageIdx, setPageIdx] = useState(0);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [boardNotice, setBoardNotice] = useState('');

  // --- Calculator State ---
  const [calcModel, setCalcModel] = useState<CalcModelId>('FX580VNX');
  const [calcSubMode, setCalcSubMode] = useState<CalcSubMode>('COMP');
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [shiftOn, setShiftOn] = useState(false);
  const [expr, setExpr] = useState('');
  const [displayResult, setDisplayResult] = useState('0');
  const [fractionResult, setFractionResult] = useState<string | undefined>(undefined);
  const [showFraction, setShowFraction] = useState(false);
  const [ansValue, setAnsValue] = useState(0);
  const [history, setHistory] = useState<Array<{ expr: string; result: string }>>([]);

  // Quadratic solver inputs
  const [qA, setQA] = useState('1');
  const [qB, setQB] = useState('-5');
  const [qC, setQC] = useState('6');

  // 2x2 Linear system inputs
  const [sA1, setSA1] = useState('2');
  const [sB1, setSB1] = useState('1');
  const [sC1, setSC1] = useState('5');
  const [sA2, setSA2] = useState('1');
  const [sB2, setSB2] = useState('-1');
  const [sC2, setSC2] = useState('1');

  // Table f(x) inputs
  const [fxExpr, setFxExpr] = useState('x^2 - 2x - 3');
  const [gxExpr, setGxExpr] = useState('');
  const [tStart, setTStart] = useState('-2');
  const [tEnd, setTEnd] = useState('4');
  const [tStep, setTStep] = useState('1');

  const theme = CALC_MODELS[calcModel];

  const notifyBoard = useCallback((msg: string) => {
    setBoardNotice(msg);
    setTimeout(() => setBoardNotice(''), 2200);
  }, []);

  const drawPaperBackground = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, tpl: PaperTemplate) => {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      if (tpl === 'GRID') {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        const step = 24;
        ctx.beginPath();
        for (let x = step; x < w; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = step; y < h; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      } else if (tpl === 'RULED') {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        const step = 28;
        ctx.beginPath();
        for (let y = step; y < h; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#fecaca';
        ctx.beginPath();
        ctx.moveTo(44, 0);
        ctx.lineTo(44, h);
        ctx.stroke();
      } else if (tpl === 'OXY') {
        const step = 24;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        const cx = Math.round(w / 2 / step) * step;
        const cy = Math.round(h / 2 / step) * step;
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(12, cy);
        ctx.lineTo(w - 12, cy);
        ctx.moveTo(cx, h - 12);
        ctx.lineTo(cx, 12);
        ctx.stroke();

        // Arrowheads + Labels
        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.moveTo(w - 12, cy);
        ctx.lineTo(w - 20, cy - 4);
        ctx.lineTo(w - 20, cy + 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, 12);
        ctx.lineTo(cx - 4, 20);
        ctx.lineTo(cx + 4, 20);
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('x', w - 22, cy - 8);
        ctx.fillText('y', cx + 8, 22);
        ctx.fillText('O', cx - 14, cy + 14);
      }
      ctx.restore();
    },
    [],
  );

  // Initialize / restore canvas when opened, resized, or switching pages
  useEffect(() => {
    if (!boardOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPaperBackground(ctx, w, h, paper);

    const savedDataUrl = pages[pageIdx];
    if (savedDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = savedDataUrl;
    }
  }, [boardOpen, boardSize, dockMode, paper, pageIdx, drawPaperBackground]);

  const commitCanvasSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setPages((prev) => {
      const next = [...prev];
      const old = next[pageIdx] || '';
      if (old && old !== dataUrl) {
        setUndoStack((u) => [...u.slice(-19), old]);
      }
      next[pageIdx] = dataUrl;
      return next;
    });
    setRedoStack([]);
  }, [pageIdx]);

  function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.setPointerCapture(e.pointerId);
    const pt = getCanvasCoords(e);
    isDrawingRef.current = true;
    startPtRef.current = pt;

    if (tool === 'PEN' || tool === 'HIGHLIGHTER' || tool === 'ERASER') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'ERASER') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(14, strokeWidth * 4);
      } else if (tool === 'HIGHLIGHTER') {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.36)';
        ctx.lineWidth = Math.max(14, strokeWidth * 4);
      } else {
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = strokeWidth;
      }
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
      ctx.stroke();
      ctx.restore();
    } else {
      snapshotBeforeShapeRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !startPtRef.current) return;

    const pt = getCanvasCoords(e);
    if (tool === 'PEN' || tool === 'HIGHLIGHTER' || tool === 'ERASER') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'ERASER') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(14, strokeWidth * 4);
      } else if (tool === 'HIGHLIGHTER') {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.36)';
        ctx.lineWidth = Math.max(14, strokeWidth * 4);
      } else {
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = strokeWidth;
      }
      ctx.beginPath();
      ctx.moveTo(startPtRef.current.x, startPtRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.restore();
      startPtRef.current = pt;
      return;
    }

    if (snapshotBeforeShapeRef.current) {
      ctx.putImageData(snapshotBeforeShapeRef.current, 0, 0);
    }
    const sx = startPtRef.current.x;
    const sy = startPtRef.current.y;
    ctx.save();
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'LINE' || tool === 'ARROW') {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      if (tool === 'ARROW') {
        const angle = Math.atan2(pt.y - sy, pt.x - sx);
        const head = 11;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - head * Math.cos(angle - Math.PI / 6), pt.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - head * Math.cos(angle + Math.PI / 6), pt.y - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    } else if (tool === 'RECT') {
      ctx.strokeRect(sx, sy, pt.x - sx, pt.y - sy);
    } else if (tool === 'CIRCLE') {
      const r = Math.hypot(pt.x - sx, pt.y - sy);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handlePointerUp() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    startPtRef.current = null;
    snapshotBeforeShapeRef.current = null;
    commitCanvasSnapshot();
  }

  function stampTextOnCanvas(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = parseFloat(canvas.style.width) || 400;
    const h = parseFloat(canvas.style.height) || 300;
    ctx.save();
    ctx.fillStyle = inkColor;
    ctx.font = '600 17px "Be Vietnam Pro", sans-serif';
    const xPos = 24 + ((undoStack.length * 18) % Math.max(80, w - 160));
    const yPos = 42 + ((undoStack.length * 28) % Math.max(80, h - 60));
    ctx.fillText(text, xPos, yPos);
    ctx.restore();
    commitCanvasSnapshot();
    notifyBoard(`Đã chèn "${text}" lên bảng nháp`);
  }

  function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || typeof reader.result !== 'string') return;
      const img = new Image();
      img.onload = () => {
        const w = parseFloat(canvas.style.width) || 400;
        const h = parseFloat(canvas.style.height) || 300;
        const scale = Math.min((w * 0.65) / img.width, (h * 0.65) / img.height, 1);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        commitCanvasSnapshot();
        notifyBoard('Đã chèn hình ảnh vào bảng thông minh');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prevUrl = undoStack[undoStack.length - 1];
    const currentUrl = pages[pageIdx] || '';
    setUndoStack((u) => u.slice(0, -1));
    if (currentUrl) setRedoStack((r) => [...r, currentUrl]);
    setPages((p) => {
      const next = [...p];
      next[pageIdx] = prevUrl;
      return next;
    });
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const w = parseFloat(canvas.style.width) || 400;
      const h = parseFloat(canvas.style.height) || 300;
      drawPaperBackground(ctx, w, h, paper);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = prevUrl;
    }
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const nextUrl = redoStack[redoStack.length - 1];
    const currentUrl = pages[pageIdx] || '';
    setRedoStack((r) => r.slice(0, -1));
    if (currentUrl) setUndoStack((u) => [...u, currentUrl]);
    setPages((p) => {
      const next = [...p];
      next[pageIdx] = nextUrl;
      return next;
    });
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const w = parseFloat(canvas.style.width) || 400;
      const h = parseFloat(canvas.style.height) || 300;
      drawPaperBackground(ctx, w, h, paper);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = nextUrl;
    }
  }

  function handleClearBoard() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = parseFloat(canvas.style.width) || 400;
    const h = parseFloat(canvas.style.height) || 300;
    drawPaperBackground(ctx, w, h, paper);
    commitCanvasSnapshot();
  }

  function handleExportBoardPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = canvas.width;
    outCanvas.height = canvas.height;
    const octx = outCanvas.getContext('2d');
    if (!octx) return;
    octx.drawImage(canvas, 0, 0);

    const finalizeDownload = () => {
      const link = document.createElement('a');
      link.download = `BangNhap_NhanTri_Trang${pageIdx + 1}.png`;
      link.href = outCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      notifyBoard('Đã xuất ảnh bài nháp có gắn Logo Nhân Trí');
    };

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.onload = () => {
      const badgeSize = Math.max(44, Math.min(72, Math.round(outCanvas.width * 0.08)));
      const pad = 16;
      octx.save();
      octx.globalAlpha = 0.85;
      octx.fillStyle = '#ffffff';
      octx.beginPath();
      octx.arc(outCanvas.width - pad - badgeSize / 2, outCanvas.height - pad - badgeSize / 2, badgeSize / 2 + 4, 0, Math.PI * 2);
      octx.fill();
      octx.drawImage(logoImg, outCanvas.width - pad - badgeSize, outCanvas.height - pad - badgeSize, badgeSize, badgeSize);
      octx.font = 'bold 14px sans-serif';
      octx.fillStyle = '#1e3a8a';
      octx.fillText('Trung Tâm Nhân Trí · daythemnhantri.com', pad, outCanvas.height - pad);
      octx.restore();
      finalizeDownload();
    };
    logoImg.onerror = finalizeDownload;
    logoImg.src = BRAND_LOGO_URL;
  }

  // --- Calculator Actions ---
  function appendToken(token: string) {
    setShiftOn(false);
    setExpr((prev) => prev + token);
  }

  function handleBackspace() {
    setExpr((prev) => prev.slice(0, -1));
  }

  function handleAllClear() {
    setExpr('');
    setDisplayResult('0');
    setFractionResult(undefined);
    setShowFraction(false);
    setShiftOn(false);
  }

  function handleEvaluate() {
    const res = evaluateExpression(expr, { angleMode, ans: ansValue });
    if (res.ok && res.value !== undefined) {
      setAnsValue(res.value);
      setDisplayResult(res.display);
      setFractionResult(res.fraction);
      setShowFraction(false);
      setHistory((prev) => [{ expr: expr || '0', result: res.display }, ...prev.slice(0, 14)]);
    } else {
      setDisplayResult(res.display);
      setFractionResult(undefined);
    }
  }

  const quadSolution = useMemo(
    () => solveQuadratic(Number(qA), Number(qB), Number(qC)),
    [qA, qB, qC],
  );

  const sys2Solution = useMemo(
    () =>
      solveLinearSystem2(
        Number(sA1),
        Number(sB1),
        Number(sC1),
        Number(sA2),
        Number(sB2),
        Number(sC2),
      ),
    [sA1, sB1, sC1, sA2, sB2, sC2],
  );

  const tableRows = useMemo(
    () =>
      computeFunctionTable(
        fxExpr,
        Number(tStart),
        Number(tEnd),
        Number(tStep),
        angleMode,
        gxExpr,
      ),
    [fxExpr, gxExpr, tStart, tEnd, tStep, angleMode],
  );

  function cycleSize(current: PanelSize): PanelSize {
    const order: PanelSize[] = ['SM', 'MD', 'LG', 'FULL'];
    return order[(order.indexOf(current) + 1) % order.length];
  }

  function sendCalcToBoard(text: string) {
    if (!boardOpen) {
      setBoardOpen(true);
      setTimeout(() => stampTextOnCanvas(text), 120);
    } else {
      stampTextOnCanvas(text);
    }
  }

  const shownLcdValue =
    showFraction && fractionResult ? fractionResult : displayResult;

  return (
    <>
      {/* Open Panels Layer — Follows Scroll Independently */}
      {(boardOpen || calcOpen) && (
        <div
          className={`fixed z-40 pointer-events-none ${
            dockMode === 'BOTTOM_DOCK'
              ? 'inset-x-0 bottom-16 px-3 flex flex-wrap items-end justify-center gap-3'
              : 'right-4 bottom-16 flex flex-col lg:flex-row items-end justify-end gap-3 max-w-[calc(100vw-2rem)]'
          }`}
        >
          {/* PANEL 1: SMART MULTIMEDIA WHITEBOARD */}
          {boardOpen && (
            <section
              className={`pointer-events-auto bg-white border-2 border-blue-900/20 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all ${BOARD_WIDTH_CLASS[boardSize]}`}
              aria-label="Bảng thông minh đa phương tiện"
            >
              {/* Whiteboard Top Bar */}
              <div className="px-3 py-2 bg-blue-950 text-white flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <PenTool className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">
                      Bảng thông minh · Trang {pageIdx + 1}/{pages.length}
                    </p>
                    {examTitle && (
                      <p className="text-[10px] text-blue-200 truncate">{examTitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    value={boardSize}
                    onChange={(e) => setBoardSize(e.target.value as PanelSize)}
                    aria-label="Kích thước bảng thông minh"
                    className="h-6 px-1.5 text-[11px] font-semibold bg-blue-900 text-white border border-blue-700 rounded cursor-pointer"
                  >
                    <option value="SM">Thu nhỏ</option>
                    <option value="MD">Vừa</option>
                    <option value="LG">Lớn</option>
                    <option value="FULL">Toàn màn hình</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setBoardSize(cycleSize(boardSize))}
                    className="p-1 text-blue-200 hover:text-white hover:bg-blue-800 rounded cursor-pointer"
                    title="Phóng to / Thu nhỏ nhanh"
                  >
                    {boardSize === 'FULL' ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardOpen(false)}
                    className="p-1 text-blue-200 hover:text-white hover:bg-blue-800 rounded cursor-pointer"
                    title="Thu gọn bảng thông minh"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Drawing Tools Row */}
              <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1.5 text-xs shrink-0">
                {(
                  [
                    { id: 'PEN', icon: <PenTool className="w-3.5 h-3.5" />, label: 'Bút' },
                    { id: 'HIGHLIGHTER', icon: <Highlighter className="w-3.5 h-3.5" />, label: 'Nhấn' },
                    { id: 'ERASER', icon: <Eraser className="w-3.5 h-3.5" />, label: 'Tẩy' },
                    { id: 'LINE', icon: <Minus className="w-3.5 h-3.5" />, label: 'Đoạn' },
                    { id: 'ARROW', icon: <ArrowRight className="w-3.5 h-3.5" />, label: 'Mũi tên' },
                    { id: 'RECT', icon: <Square className="w-3.5 h-3.5" />, label: 'HCN' },
                    { id: 'CIRCLE', icon: <Circle className="w-3.5 h-3.5" />, label: 'Tròn' },
                  ] as Array<{ id: BoardTool; icon: React.ReactNode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTool(item.id)}
                    title={item.label}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold cursor-pointer ${
                      tool === item.id
                        ? 'bg-blue-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span className="hidden sm:inline text-[11px]">{item.label}</span>
                  </button>
                ))}

                <span className="h-4 w-px bg-slate-300 mx-0.5" />

                {/* Ink Colors */}
                <div className="flex items-center gap-1">
                  {INK_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => {
                        setInkColor(c.hex);
                        if (tool === 'ERASER') setTool('PEN');
                      }}
                      title={c.label}
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                        inkColor === c.hex ? 'border-amber-500 scale-110' : 'border-white shadow-xs'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                {/* Stroke width */}
                <select
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  aria-label="Độ dày nét bút"
                  className="h-6 px-1 text-[11px] bg-white border border-slate-300 rounded"
                >
                  <option value={2}>Mảnh</option>
                  <option value={3}>Vừa</option>
                  <option value={6}>Đậm</option>
                </select>

                {/* Paper Template */}
                <select
                  value={paper}
                  onChange={(e) => setPaper(e.target.value as PaperTemplate)}
                  aria-label="Nền giấy bảng"
                  className="h-6 px-1.5 text-[11px] font-semibold bg-white border border-slate-300 rounded"
                >
                  <option value="BLANK">Giấy trắng</option>
                  <option value="GRID">Ô ly toán</option>
                  <option value="RULED">Kẻ ngang</option>
                  <option value="OXY">Hệ trục Oxy</option>
                </select>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    title="Hoàn tác"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    title="Làm lại"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                    title="Chèn hình ảnh từ máy"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-blue-900" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInsertImage}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleExportBoardPng}
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-emerald-50 text-emerald-800 cursor-pointer"
                    title="Tải ảnh bài nháp (gắn Logo Nhân Trí)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearBoard}
                    className="p-1 bg-white border border-slate-200 rounded hover:bg-red-50 text-red-700 cursor-pointer"
                    title="Xóa sạch trang hiện tại"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Text & Math Symbols Bar */}
              <div className="px-2.5 py-1 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
                <div className="flex items-center gap-1 shrink-0">
                  <Type className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={textInsert}
                    onChange={(e) => setTextInsert(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        stampTextOnCanvas(textInsert);
                        setTextInsert('');
                      }
                    }}
                    placeholder="Nhập công thức/chữ..."
                    className="h-6 w-32 px-2 text-[11px] border border-slate-300 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      stampTextOnCanvas(textInsert);
                      setTextInsert('');
                    }}
                    className="h-6 px-2 text-[11px] font-semibold bg-blue-50 text-blue-900 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                  >
                    Chèn
                  </button>
                </div>
                <span className="h-4 w-px bg-slate-200 shrink-0" />
                <div className="flex items-center gap-1">
                  {MATH_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => stampTextOnCanvas(sym)}
                      className="h-6 min-w-6 px-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-blue-100 hover:text-blue-950 rounded cursor-pointer"
                      title={`Chèn ký hiệu ${sym}`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive HiDPI Canvas */}
              <div className="flex-1 relative bg-white overflow-hidden touch-none">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="block w-full h-full cursor-crosshair"
                />
                {boardNotice && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/90 text-white text-[11px] font-medium px-3 py-1 rounded-md shadow">
                    {boardNotice}
                  </div>
                )}
              </div>

              {/* Multi-Page Scratchpad Footer */}
              <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px] shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {pages.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPageIdx(idx)}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer whitespace-nowrap ${
                        idx === pageIdx
                          ? 'bg-blue-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Trang {idx + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPages((prev) => [...prev, '']);
                      setPageIdx(pages.length);
                    }}
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3 h-3" /> Trang mới
                  </button>
                </div>
                <span className="text-slate-500 hidden sm:inline">
                  Hỗ trợ chuột, cảm ứng &amp; bút vẽ
                </span>
              </div>
            </section>
          )}

          {/* PANEL 2: MOET VIETNAMESE SCIENTIFIC CALCULATOR SUITE */}
          {calcOpen && (
            <section
              className={`pointer-events-auto rounded-xl border-2 shadow-2xl overflow-hidden flex flex-col transition-all ${theme.shellBg} ${theme.shellBorder} ${CALC_WIDTH_CLASS[calcSize]} max-h-[82vh]`}
              aria-label="Máy tính bỏ túi chuẩn Bộ GD&ĐT"
            >
              {/* Calculator Model Header */}
              <div className={`px-3 py-2 ${theme.bezelBg} border-b border-white/10 space-y-1.5 shrink-0`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black tracking-wider text-white">
                        {theme.brand}
                      </span>
                      <span className={`text-[10px] font-bold ${theme.accentText} truncate`}>
                        {theme.subtitle}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={calcSize}
                      onChange={(e) => setCalcSize(e.target.value as PanelSize)}
                      aria-label="Kích thước máy tính"
                      className="h-6 px-1 text-[10px] font-semibold bg-black/30 text-white border border-white/20 rounded cursor-pointer"
                    >
                      <option value="SM">Nhỏ</option>
                      <option value="MD">Vừa</option>
                      <option value="LG">Lớn</option>
                      <option value="FULL">Rộng</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setCalcSize(cycleSize(calcSize))}
                      className="p-1 text-white/75 hover:text-white rounded cursor-pointer"
                      title="Đổi kích thước máy tính"
                    >
                      {calcSize === 'FULL' ? (
                        <Minimize2 className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalcOpen(false)}
                      className="p-1 text-white/75 hover:text-white rounded cursor-pointer"
                      title="Đóng máy tính"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Model Selector + Sub-Mode Selector */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={calcModel}
                    onChange={(e) => setCalcModel(e.target.value as CalcModelId)}
                    aria-label="Chọn dòng máy tính Bộ GD&ĐT"
                    className="flex-1 h-7 px-2 text-[11px] font-bold bg-black/35 text-white border border-white/20 rounded-md cursor-pointer"
                  >
                    <option value="FX580VNX">Casio fx-580VN X (ClassWiz)</option>
                    <option value="FX880BTG">Casio fx-880BTG (Gen 2)</option>
                    <option value="VINACAL680">Vinacal 680EX Plus</option>
                    <option value="FX570VN">Casio fx-570VN PLUS</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))}
                    className="h-7 px-2 text-[10px] font-mono-num font-bold bg-amber-400 text-slate-950 rounded-md cursor-pointer whitespace-nowrap"
                    title="Đổi đơn vị góc Độ / Radian"
                  >
                    {angleMode}
                  </button>
                </div>

                {/* 4 Full-Suite Mode Tabs */}
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {(
                    [
                      { id: 'COMP', label: 'Khoa học' },
                      { id: 'QUAD', label: 'PT bậc 2' },
                      { id: 'SYS2', label: 'Hệ 2 ẩn' },
                      { id: 'TABLE', label: 'Bảng f(x)' },
                    ] as Array<{ id: CalcSubMode; label: string }>
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCalcSubMode(m.id)}
                      className={`py-1 text-[10px] font-bold rounded cursor-pointer whitespace-nowrap ${
                        calcSubMode === m.id
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculator Body */}
              <div className="p-3 space-y-2.5 overflow-y-auto">
                {calcSubMode === 'COMP' && (
                  <>
                    {/* High-Contrast Dot-Matrix LCD */}
                    <div className={`${theme.lcdBg} ${theme.lcdText} rounded-lg p-2.5 border-2 border-black/30 shadow-inner space-y-1`}>
                      <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold px-1 bg-slate-900/10 rounded">{angleMode}</span>
                          {shiftOn && (
                            <span className="font-bold px-1 bg-amber-500 text-white rounded">S</span>
                          )}
                          {showFraction && fractionResult && (
                            <span className="font-bold px-1 bg-blue-900 text-white rounded">
                              PHÂN SỐ
                            </span>
                          )}
                        </div>
                        <span className="truncate">Ans = {ansValue.toPrecision(5).replace(/\.?0+$/, '')}</span>
                      </div>
                      <input
                        type="text"
                        value={expr}
                        onChange={(e) => setExpr(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEvaluate();
                        }}
                        placeholder="Nhập biểu thức (vd: sin(30)+√(16)/2)"
                        className="w-full bg-transparent text-xs font-mono-num text-slate-700 focus:outline-none"
                      />
                      <div className="flex items-end justify-between gap-2 pt-1 border-t border-slate-900/10">
                        <button
                          type="button"
                          onClick={() => sendCalcToBoard(`${expr || shownLcdValue} = ${shownLcdValue}`)}
                          className="text-[10px] font-semibold text-blue-900 hover:underline cursor-pointer whitespace-nowrap"
                          title="Chép kết quả lên Bảng thông minh"
                        >
                          → Bảng nháp
                        </button>
                        <p className="text-xl font-extrabold font-mono-num tracking-tight truncate">
                          {shownLcdValue}
                        </p>
                      </div>
                    </div>

                    {/* Scientific Function Keys */}
                    <div className="grid grid-cols-5 gap-1 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setShiftOn((s) => !s)}
                        className={`h-7 rounded font-bold cursor-pointer ${
                          shiftOn
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-amber-600/90 text-white hover:bg-amber-500'
                        }`}
                      >
                        SHIFT
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFraction((f) => !f)}
                        disabled={!fractionResult}
                        className="h-7 rounded bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-45 font-bold cursor-pointer"
                        title="Đổi Phân số ⇔ Số thập phân"
                      >
                        S⇔D
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'cbrt(' : 'sqrt(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? '∛(' : '√('}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? '^3' : '^2')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'x³' : 'x²'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken('^')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        xʸ
                      </button>

                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'asin(' : 'sin(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'sin⁻¹' : 'sin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'acos(' : 'cos(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'cos⁻¹' : 'cos'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'atan(' : 'tan(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'tan⁻¹' : 'tan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'exp(' : 'ln(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'eˣ' : 'ln'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? '10^' : 'log(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? '10ˣ' : 'log'}
                      </button>

                      <button
                        type="button"
                        onClick={() => appendToken('(')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        (
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(')')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        )
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'P' : 'C')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                        title="Tổ hợp nCr / Chỉnh hợp nPr"
                      >
                        {shiftOn ? 'nPr' : 'nCr'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? 'e' : 'π')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? 'e' : 'π'}
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken(shiftOn ? '%' : '!')}
                        className={`h-7 rounded cursor-pointer ${theme.fnKeyBg}`}
                      >
                        {shiftOn ? '%' : 'n!'}
                      </button>
                    </div>

                    {/* Numeric & Primary Operation Keypad */}
                    <div className="grid grid-cols-5 gap-1.5 text-sm font-bold">
                      {['7', '8', '9'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => appendToken(d)}
                          className={`h-9 rounded-md font-mono-num cursor-pointer ${theme.primaryKeyBg}`}
                        >
                          {d}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleBackspace}
                        className="h-9 rounded-md bg-amber-600 text-white hover:bg-amber-500 text-xs font-extrabold cursor-pointer"
                      >
                        DEL
                      </button>
                      <button
                        type="button"
                        onClick={handleAllClear}
                        className="h-9 rounded-md bg-red-600 text-white hover:bg-red-500 text-xs font-extrabold cursor-pointer"
                      >
                        AC
                      </button>

                      {['4', '5', '6'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => appendToken(d)}
                          className={`h-9 rounded-md font-mono-num cursor-pointer ${theme.primaryKeyBg}`}
                        >
                          {d}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => appendToken('×')}
                        className={`h-9 rounded-md cursor-pointer ${theme.opKeyBg}`}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken('÷')}
                        className={`h-9 rounded-md cursor-pointer ${theme.opKeyBg}`}
                      >
                        ÷
                      </button>

                      {['1', '2', '3'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => appendToken(d)}
                          className={`h-9 rounded-md font-mono-num cursor-pointer ${theme.primaryKeyBg}`}
                        >
                          {d}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => appendToken('+')}
                        className={`h-9 rounded-md cursor-pointer ${theme.opKeyBg}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken('-')}
                        className={`h-9 rounded-md cursor-pointer ${theme.opKeyBg}`}
                      >
                        −
                      </button>

                      <button
                        type="button"
                        onClick={() => appendToken('0')}
                        className={`h-9 rounded-md font-mono-num cursor-pointer ${theme.primaryKeyBg}`}
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken('.')}
                        className={`h-9 rounded-md font-mono-num cursor-pointer ${theme.primaryKeyBg}`}
                      >
                        .
                      </button>
                      <button
                        type="button"
                        onClick={() => appendToken('Ans')}
                        className={`h-9 rounded-md text-xs cursor-pointer ${theme.fnKeyBg}`}
                      >
                        Ans
                      </button>
                      <button
                        type="button"
                        onClick={handleEvaluate}
                        className="col-span-2 h-9 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer"
                      >
                        = (EXE)
                      </button>
                    </div>

                    {/* Recent Calculation History */}
                    {history.length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-1 max-h-24 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-white/60">
                          Lịch sử tính (bấm để dán lên Bảng nháp):
                        </p>
                        {history.slice(0, 4).map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => sendCalcToBoard(`${h.expr} = ${h.result}`)}
                            className="w-full flex items-center justify-between gap-2 text-[11px] font-mono-num text-white/90 bg-white/5 hover:bg-white/15 px-2 py-1 rounded cursor-pointer"
                          >
                            <span className="truncate">{h.expr}</span>
                            <span className="font-bold text-amber-300 shrink-0">= {h.result}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {calcSubMode === 'QUAD' && (
                  <div className="space-y-2.5 text-white">
                    <div className={`${theme.lcdBg} ${theme.lcdText} rounded-lg p-2.5 space-y-1.5`}>
                      <p className="text-[11px] font-bold text-blue-950">
                        Giải PT bậc 2: ax² + bx + c = 0
                      </p>
                      <p className="text-xs font-semibold text-slate-700">{quadSolution.summary}</p>
                      {quadSolution.x1 && (
                        <div className="font-mono-num text-xs space-y-0.5 pt-1 border-t border-slate-900/10">
                          <p>
                            <strong>x₁ =</strong> {quadSolution.x1}
                          </p>
                          {quadSolution.x2 && (
                            <p>
                              <strong>x₂ =</strong> {quadSolution.x2}
                            </p>
                          )}
                          {quadSolution.vertex && (
                            <p className="text-[11px] text-slate-600">
                              Đỉnh Parabol: I({quadSolution.vertex.x}; {quadSolution.vertex.y})
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { label: 'Hệ số a', val: qA, set: setQA },
                        { label: 'Hệ số b', val: qB, set: setQB },
                        { label: 'Hệ số c', val: qC, set: setQC },
                      ].map((f) => (
                        <label key={f.label} className="space-y-1">
                          <span className="text-[11px] text-white/80 block">{f.label}</span>
                          <input
                            type="number"
                            step="any"
                            value={f.val}
                            onChange={(e) => f.set(e.target.value)}
                            className="w-full h-8 px-2 font-mono-num text-slate-950 bg-white rounded-md"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendCalcToBoard(
                          `${qA}x² + (${qB})x + (${qC}) = 0 => x1=${quadSolution.x1 || 'VN'}, x2=${quadSolution.x2 || ''}`,
                        )
                      }
                      className="w-full py-1.5 text-xs font-semibold bg-amber-400 text-slate-950 rounded-md hover:bg-amber-300 cursor-pointer"
                    >
                      Chép nghiệm lên Bảng thông minh
                    </button>
                  </div>
                )}

                {calcSubMode === 'SYS2' && (
                  <div className="space-y-2.5 text-white">
                    <div className={`${theme.lcdBg} ${theme.lcdText} rounded-lg p-2.5 space-y-1`}>
                      <p className="text-[11px] font-bold text-blue-950">
                        Giải hệ 2 ẩn: a₁x + b₁y = c₁ &amp; a₂x + b₂y = c₂
                      </p>
                      <p className="text-xs font-semibold text-slate-700">{sys2Solution.summary}</p>
                      {sys2Solution.kind === 'UNIQUE' && (
                        <div className="font-mono-num text-xs pt-1 border-t border-slate-900/10">
                          <p>
                            <strong>x =</strong> {sys2Solution.x}
                          </p>
                          <p>
                            <strong>y =</strong> {sys2Solution.y}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      {[
                        { l: 'a₁', v: sA1, s: setSA1 },
                        { l: 'b₁', v: sB1, s: setSB1 },
                        { l: 'c₁', v: sC1, s: setSC1 },
                        { l: 'a₂', v: sA2, s: setSA2 },
                        { l: 'b₂', v: sB2, s: setSB2 },
                        { l: 'c₂', v: sC2, s: setSC2 },
                      ].map((f) => (
                        <label key={f.l} className="space-y-0.5">
                          <span className="text-[10px] text-white/80 block">{f.l}</span>
                          <input
                            type="number"
                            step="any"
                            value={f.v}
                            onChange={(e) => f.s(e.target.value)}
                            className="w-full h-7 px-2 font-mono-num text-slate-950 bg-white rounded"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendCalcToBoard(
                          sys2Solution.kind === 'UNIQUE'
                            ? `Hệ PT => x = ${sys2Solution.x}, y = ${sys2Solution.y}`
                            : sys2Solution.summary,
                        )
                      }
                      className="w-full py-1.5 text-xs font-semibold bg-amber-400 text-slate-950 rounded-md hover:bg-amber-300 cursor-pointer"
                    >
                      Chép nghiệm lên Bảng thông minh
                    </button>
                  </div>
                )}

                {calcSubMode === 'TABLE' && (
                  <div className="space-y-2 text-white">
                    <div className="space-y-1.5 text-xs">
                      <label className="block">
                        <span className="text-[10px] text-white/80">f(x) =</span>
                        <input
                          type="text"
                          value={fxExpr}
                          onChange={(e) => setFxExpr(e.target.value)}
                          placeholder="vd: x^2 - 2x - 3"
                          className="w-full h-7 px-2 font-mono-num text-slate-950 bg-white rounded mt-0.5"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-white/80">g(x) = (tùy chọn)</span>
                        <input
                          type="text"
                          value={gxExpr}
                          onChange={(e) => setGxExpr(e.target.value)}
                          placeholder="vd: 2x + 1"
                          className="w-full h-7 px-2 font-mono-num text-slate-950 bg-white rounded mt-0.5"
                        />
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <label>
                          <span className="text-[10px] text-white/80">Start</span>
                          <input
                            type="number"
                            step="any"
                            value={tStart}
                            onChange={(e) => setTStart(e.target.value)}
                            className="w-full h-7 px-1.5 font-mono-num text-slate-950 bg-white rounded"
                          />
                        </label>
                        <label>
                          <span className="text-[10px] text-white/80">End</span>
                          <input
                            type="number"
                            step="any"
                            value={tEnd}
                            onChange={(e) => setTEnd(e.target.value)}
                            className="w-full h-7 px-1.5 font-mono-num text-slate-950 bg-white rounded"
                          />
                        </label>
                        <label>
                          <span className="text-[10px] text-white/80">Step</span>
                          <input
                            type="number"
                            step="any"
                            value={tStep}
                            onChange={(e) => setTStep(e.target.value)}
                            className="w-full h-7 px-1.5 font-mono-num text-slate-950 bg-white rounded"
                          />
                        </label>
                      </div>
                    </div>

                    <div className={`${theme.lcdBg} ${theme.lcdText} rounded-lg max-h-44 overflow-y-auto`}>
                      <table className="w-full text-xs font-mono-num">
                        <thead>
                          <tr className="border-b border-slate-900/15 bg-black/5">
                            <th className="py-1 px-2 text-left">x</th>
                            <th className="py-1 px-2 text-right">f(x)</th>
                            {gxExpr.trim() && <th className="py-1 px-2 text-right">g(x)</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/10">
                          {tableRows.map((r, i) => (
                            <tr key={i}>
                              <td className="py-1 px-2 font-bold">{r.x}</td>
                              <td className="py-1 px-2 text-right">{r.fx}</td>
                              {gxExpr.trim() && (
                                <td className="py-1 px-2 text-right">{r.gx}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Compact Sticky Floating Toolbar (Always Follows Scroll During Exam) */}
      <div className="fixed bottom-3 right-3 sm:right-4 z-40 bg-white/95 backdrop-blur border border-blue-200 shadow-xl rounded-xl p-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setBoardOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            boardOpen
              ? 'bg-blue-900 text-white'
              : 'bg-blue-50 text-blue-950 hover:bg-blue-100'
          }`}
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Bảng thông minh</span>
        </button>

        <button
          type="button"
          onClick={() => setCalcOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            calcOpen
              ? 'bg-amber-600 text-white'
              : 'bg-amber-50 text-amber-950 hover:bg-amber-100'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Máy tính GD&amp;ĐT</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (boardOpen && calcOpen) {
              setBoardOpen(false);
              setCalcOpen(false);
            } else {
              setBoardOpen(true);
              setCalcOpen(true);
            }
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
            boardOpen && calcOpen
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
          title="Mở đồng thời Bảng nháp & Máy tính song song"
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {boardOpen && calcOpen ? 'Thu gọn cả 2' : 'Mở cả 2'}
          </span>
        </button>

        {(boardOpen || calcOpen) && (
          <button
            type="button"
            onClick={() =>
              setDockMode((m) => (m === 'BOTTOM_RIGHT' ? 'BOTTOM_DOCK' : 'BOTTOM_RIGHT'))
            }
            className="px-2 py-2 text-[11px] font-semibold text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
            title="Chuyển bố cục Neo góc phải / Dàn ngang đáy màn hình"
          >
            {dockMode === 'BOTTOM_RIGHT' ? 'Dàn đáy' : 'Góc phải'}
          </button>
        )}
      </div>
    </>
  );
};
