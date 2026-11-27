import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Home,
  KeyRound,
  Lock,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AppNotification,
  AttendanceRecord,
  AuthUser,
  FamilyProfile,
  ScoreRecord,
  SiteConfig,
  Student,
  TimetableSlot,
  TuitionRecord,
} from '../types';
import { apiRequest, formatVnd } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { BrandedPrintModal } from './BrandedPrintModal';
import { buildStudentQrCardsHtml } from '../lib/brandedDocumentExporter';
import {
  buildDeterministicQrToken,
  buildStudentQrUrl,
  parseScannedQrPayload,
  renderQrDataUrl,
} from '../lib/smartCodeAndQr';

// ============================================================
// 1. STUDENT QR ID CARD MODAL (INDIVIDUAL & CLASS SHEET PRINT)
// ============================================================

interface StudentQrCardModalProps {
  student: Student | null;
  allStudents?: Student[];
  canManage?: boolean;
  siteConfig?: SiteConfig;
  onClose: () => void;
  onRotated?: () => Promise<void>;
}

export const StudentQrCardModal: React.FC<StudentQrCardModalProps> = ({
  student,
  allStudents = [],
  canManage = false,
  siteConfig,
  onClose,
  onRotated,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const token = student
    ? student.qrToken || buildDeterministicQrToken(student.id, student.code)
    : '';
  const qrUrl = token ? buildStudentQrUrl(token) : '';

  useEffect(() => {
    if (!qrUrl) return;
    let active = true;
    void renderQrDataUrl(qrUrl, 320).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [qrUrl]);

  if (!student) return null;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(
        `Thẻ QR tra cứu học tập Nhân Trí — Em ${student!.fullName} (${student!.code}):\n${qrUrl}\nMã PIN Phụ huynh: ${student!.accessPin || 'Liên hệ Cô Tâm'}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorMsg('Không thể sao chép tự động. Vui lòng chọn và sao chép đường dẫn bên dưới.');
    }
  }

  function handleDownloadPng() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_${student!.code}_${student!.fullName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handlePrintSingle() {
    const html = buildStudentQrCardsHtml({
      cards: [{ student: student!, qrDataUrl, qrUrl }],
      title: `Thẻ QR Học sinh — ${student!.fullName} (${student!.code})`,
      siteConfig,
    });
    setPrintTitle(`Thẻ QR — ${student!.fullName}`);
    setPrintHtml(html);
  }

  async function handlePrintClassSheet() {
    const sameClass = allStudents.filter((s) => s.centerClass === student!.centerClass);
    const list = sameClass.length > 0 ? sameClass : [student!];
    const cards = await Promise.all(
      list.map(async (st) => {
        const tk = st.qrToken || buildDeterministicQrToken(st.id, st.code);
        const url = buildStudentQrUrl(tk);
        const dataUrl = await renderQrDataUrl(url, 260);
        return { student: st, qrDataUrl: dataUrl, qrUrl: url };
      }),
    );
    const html = buildStudentQrCardsHtml({
      cards,
      title: `Bộ Thẻ QR Học sinh ${student!.centerClass} (${cards.length} em)`,
      siteConfig,
    });
    setPrintTitle(`Thẻ QR ${student!.centerClass}`);
    setPrintHtml(html);
  }

  async function handleRotateQr(regeneratePin: boolean) {
    setRotating(true);
    setErrorMsg('');
    try {
      await apiRequest(`/api/v1/students/${student!.id}/regenerate-qr`, {
        method: 'POST',
        body: JSON.stringify({ regeneratePin }),
      });
      if (onRotated) await onRotated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể cấp lại Token QR.');
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <QrCode className="w-5 h-5 text-blue-900" />
              <div>
                <h3 className="text-base font-bold text-slate-950">Thẻ Học sinh QR Động Nhân Trí</h3>
                <p className="text-xs text-slate-600">
                  Tự cập nhật lịch học, học phí &amp; thông báo mới — Không cần in lại thẻ
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {errorMsg}
              </div>
            )}

            {/* Branded Preview Card */}
            <div className="border-2 border-blue-900 rounded-2xl p-4 bg-white">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                <BrandLogo size="sm" />
                <div>
                  <div className="text-xs font-extrabold text-blue-950 tracking-tight">
                    TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Thẻ Học sinh Thông minh · SINCE 2023
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 space-y-1.5 text-xs w-full">
                  <div className="text-base font-extrabold text-slate-950">{student.fullName}</div>
                  <div className="inline-block font-extrabold text-blue-900 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 tabular-nums">
                    {student.code}
                  </div>
                  <div className="text-slate-700">
                    Lớp Trung tâm: <strong>{student.centerClass}</strong> · {student.room}
                  </div>
                  <div className="text-slate-700">
                    Trường: <strong>{student.school}</strong> ({student.schoolClass})
                  </div>
                  <div className="text-slate-700">
                    Phụ huynh: <strong>{student.parentName}</strong>
                  </div>
                  <div className="text-emerald-800 font-semibold pt-1 tabular-nums">
                    Mã PIN xác thực QR: <span className="font-mono text-sm">{student.accessPin || 'Chưa cấp'}</span>
                  </div>
                </div>

                <div className="shrink-0 text-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`QR ${student.code}`}
                      className="w-36 h-36 border border-slate-200 rounded-xl p-1.5 bg-white"
                    />
                  ) : (
                    <div className="w-36 h-36 border border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
                      Đang tạo QR...
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-1">
                    PH quét xem TKB/HP · GV quét điểm danh
                  </div>
                </div>
              </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Tải ảnh QR (PNG)
              </button>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-xs font-semibold hover:bg-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Đã chép Link + PIN' : 'Chép Link gửi Zalo'}
              </button>
              <button
                type="button"
                onClick={() => void handlePrintSingle()}
                className="min-h-[42px] px-3 py-2 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                In Thẻ Học sinh (A4)
              </button>
              <button
                type="button"
                onClick={() => void handlePrintClassSheet()}
                className="min-h-[42px] px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                In Bộ Thẻ {student.centerClass}
              </button>
            </div>

            {canManage && (
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">Mất thẻ học sinh? Thu hồi QR cũ ngay:</span>
                <button
                  type="button"
                  disabled={rotating}
                  onClick={() => void handleRotateQr(true)}
                  className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-semibold hover:bg-red-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
                  Đổi Token QR &amp; PIN mới
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {printHtml && (
        <BrandedPrintModal
          open={Boolean(printHtml)}
          title={printTitle}
          subtitle="Logo & Watermark chính thức Trung Tâm Nhân Trí · Chuẩn in A4"
          htmlContent={printHtml}
          fileName={`The_QR_${student.code}.html`}
          onClose={() => setPrintHtml(null)}
        />
      )}
    </>
  );
};

// ============================================================
// 2. LIVE CAMERA QR ATTENDANCE SCANNER MODAL (TEACHER / MANAGER)
// ============================================================

interface QrAttendanceScannerModalProps {
  open: boolean;
  defaultShiftLabel?: string;
  onClose: () => void;
  onAttendanceLogged: () => Promise<void>;
}

export const QrAttendanceScannerModal: React.FC<QrAttendanceScannerModalProps> = ({
  open,
  defaultShiftLabel = 'Chiều · Ca 1 (14:00–15:30)',
  onClose,
  onAttendanceLogged,
}) => {
  const [shiftLabel, setShiftLabel] = useState(defaultShiftLabel);
  const [status, setStatus] = useState<AttendanceRecord['status']>('PRESENT');
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    message: string;
    time: string;
  } | null>(null);
  const [recentScans, setRecentScans] = useState<
    Array<{ studentName: string; code: string; status: string; time: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open]);

  async function processScannedToken(rawPayload: string) {
    const parsed = parseScannedQrPayload(rawPayload);
    const tokenOrCode = parsed.value;
    if (!tokenOrCode) {
      setScanResult({
        ok: false,
        message: 'Không nhận diện được Mã QR hoặc Mã Học sinh hợp lệ.',
        time: new Date().toLocaleTimeString('vi-VN'),
      });
      return;
    }

    const now = Date.now();
    if (
      lastScannedRef.current.value === tokenOrCode &&
      now - lastScannedRef.current.at < 3000
    ) {
      return; // 3-second dedupe cooldown
    }
    lastScannedRef.current = { value: tokenOrCode, at: now };

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        student: Student;
        attendance: AttendanceRecord;
        alreadyCheckedInToday: boolean;
      }>(`/api/v1/qr/${encodeURIComponent(tokenOrCode)}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ shiftLabel, status }),
      });
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      setScanResult({
        ok: true,
        message: `${res.student.fullName} (${res.student.code} · ${res.student.centerClass}) — ${
          res.alreadyCheckedInToday ? 'Đã cập nhật điểm danh' : 'Điểm danh thành công & đã báo Phụ huynh!'
        }`,
        time: timeStr,
      });
      setRecentScans((prev) => [
        {
          studentName: res.student.fullName,
          code: res.student.code,
          status,
          time: timeStr,
        },
        ...prev.slice(0, 14),
      ]);
      setManualInput('');
      await onAttendanceLogged();
    } catch (err: unknown) {
      setScanResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Lỗi ghi nhận điểm danh QR.',
        time: new Date().toLocaleTimeString('vi-VN'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function startCameraScanner() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 960 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        const tick = () => {
          if (!videoRef.current || !canvasRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            const canvas = canvasRef.current;
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (code?.data) {
                void processScannedToken(code.data);
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }, 80);
    } catch {
      setCameraError(
        'Trình duyệt chưa cấp quyền Camera hoặc thiết bị không có Camera. Bạn có thể tải ảnh chụp QR hoặc nhập Mã HS bên dưới.',
      );
    }
  }

  function handleDecodeQrImageFile(file: File | undefined) {
    if (!file) return;
    setCameraError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imgData.data, imgData.width, imgData.height);
        if (decoded?.data) {
          void processScannedToken(decoded.data);
        } else {
          setCameraError('Không tìm thấy mã QR rõ nét trong ảnh vừa chọn.');
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-[2px] flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-blue-900" />
            <div>
              <h3 className="text-base font-bold text-slate-950">Quét QR Thẻ Học sinh — Điểm danh 1 chạm</h3>
              <p className="text-xs text-slate-600">
                Đưa thẻ QR học sinh vào khung Camera để tự động điểm danh &amp; nhắn phụ huynh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="font-semibold text-slate-700">Ca học đang điểm danh</span>
              <select
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 text-xs bg-white border border-slate-300 rounded-lg font-medium"
              >
                <option value="Sáng · Ca 1 (07:15–08:45)">Sáng · Ca 1 (07:15–08:45)</option>
                <option value="Sáng · Ca 2 (09:00–10:30)">Sáng · Ca 2 (09:00–10:30)</option>
                <option value="Chiều · Ca 1 (14:00–15:30)">Chiều · Ca 1 (14:00–15:30)</option>
                <option value="Chiều · Ca 2 (15:30–17:00)">Chiều · Ca 2 (15:30–17:00)</option>
                <option value="Tối · Ca 1 (17:30–19:00)">Tối · Ca 1 (17:30–19:00)</option>
                <option value="Tối · Ca 2 (19:00–20:30)">Tối · Ca 2 (19:00–20:30)</option>
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-semibold text-slate-700">Trạng thái ghi nhận</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceRecord['status'])}
                className="mt-1 w-full px-3 py-2.5 text-xs bg-white border border-slate-300 rounded-lg font-medium"
              >
                <option value="PRESENT">Có mặt (Đúng giờ)</option>
                <option value="LATE">Đi trễ</option>
                <option value="MAKEUP_EVENING">Học bù ca tối</option>
                <option value="EXCUSED">Nghỉ có phép</option>
              </select>
            </label>
          </div>

          {cameraError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              {cameraError}
            </div>
          )}

          {scanResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                scanResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {scanResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                )}
                <span>{scanResult.message}</span>
              </div>
              <span className="text-[11px] opacity-75 tabular-nums">{scanResult.time}</span>
            </div>
          )}

          {/* Camera Viewport */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950">
            {cameraActive ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[280px] object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-amber-400 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-slate-900/90 text-white text-xs font-semibold cursor-pointer"
                >
                  Tắt Camera
                </button>
              </div>
            ) : (
              <div className="p-6 text-center space-y-3 bg-slate-900 text-white">
                <QrCode className="w-10 h-10 mx-auto text-amber-400" />
                <div className="text-xs text-slate-300">
                  Mở Camera sau điện thoại hoặc Webcam để quét thẻ QR liên tiếp cho cả lớp
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startCameraScanner()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Bật Camera Quét QR
                  </button>
                  <label className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Quét từ ảnh chụp QR
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleDecodeQrImageFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Manual Fallback / Barcode Gun Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void processScannedToken(manualInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Hoặc nhập / bắn máy đọc Mã HS (VD: NT26-7A1-001) hoặc dán Link QR..."
              className="flex-1 min-h-[44px] px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={submitting || !manualInput.trim()}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Điểm danh ngay
            </button>
          </form>

          {recentScans.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                Vừa điểm danh phiên này ({recentScans.length})
              </div>
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 text-xs">
                {recentScans.map((item, idx) => (
                  <div key={`${item.code}-${idx}`} className="py-1.5 flex items-center justify-between">
                    <div>
                      <strong className="text-slate-900">{item.studentName}</strong>{' '}
                      <span className="text-slate-500 tabular-nums">({item.code})</span>
                    </div>
                    <span className="text-emerald-700 font-semibold tabular-nums">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 3. DYNAMIC QR LANDING VIEW (`/?qr=<token>`)
// ============================================================

interface UnlockedQrBundle {
  student: Student;
  family?: FamilyProfile;
  timetable: TimetableSlot[];
  scores: ScoreRecord[];
  tuition: TuitionRecord[];
  attendance: AttendanceRecord[];
  notifications: AppNotification[];
}

interface DynamicQrLandingViewProps {
  qrToken: string;
  currentUser: AuthUser | null;
  siteConfig: SiteConfig;
  onExitQr: () => void;
}

export const DynamicQrLandingView: React.FC<DynamicQrLandingViewProps> = ({
  qrToken,
  currentUser,
  siteConfig,
  onExitQr,
}) => {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [publicPreview, setPublicPreview] = useState<{
    code: string;
    centerClass: string;
    school: string;
    grade: number;
    accessStatus: string;
    hasPin: boolean;
  } | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [bundle, setBundle] = useState<UnlockedQrBundle | null>(null);

  const [pinInput, setPinInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [pinError, setPinError] = useState('');

  // Teacher 1-tap attendance state
  const [attBusy, setAttBusy] = useState(false);
  const [attMsg, setAttMsg] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg('');
    void apiRequest<{
      publicPreview: {
        code: string;
        centerClass: string;
        school: string;
        grade: number;
        accessStatus: string;
        hasPin: boolean;
      };
      isStaff: boolean;
      staffBundle?: UnlockedQrBundle;
    }>(`/api/v1/qr/${encodeURIComponent(qrToken)}`)
      .then((res) => {
        if (!active) return;
        setPublicPreview(res.publicPreview);
        setIsStaff(res.isStaff);
        if (res.staffBundle) {
          setBundle(res.staffBundle);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Không tìm thấy mã QR học sinh.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [qrToken, currentUser?.id]);

  async function handleUnlockWithPin(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setPinError('');
    try {
      const res = await apiRequest<{ unlocked: boolean; bundle: UnlockedQrBundle }>(
        `/api/v1/qr/${encodeURIComponent(qrToken)}/unlock`,
        {
          method: 'POST',
          body: JSON.stringify({ pin: pinInput.trim() }),
        },
      );
      setBundle(res.bundle);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'Mã PIN chưa chính xác.');
    } finally {
      setUnlocking(false);
    }
  }

  async function handleStaffQuickAttendance(status: AttendanceRecord['status']) {
    setAttBusy(true);
    setAttMsg('');
    try {
      const res = await apiRequest<{ student: Student; alreadyCheckedInToday: boolean }>(
        `/api/v1/qr/${encodeURIComponent(qrToken)}/attendance`,
        {
          method: 'POST',
          body: JSON.stringify({ status, shiftLabel: 'Điểm danh QR nhanh' }),
        },
      );
      setAttMsg(
        `Đã ghi nhận điểm danh cho em ${res.student.fullName} (${res.student.code}) & gửi thông báo tới Phụ huynh.`,
      );
    } catch (err: unknown) {
      setAttMsg(err instanceof Error ? err.message : 'Không thể ghi nhận điểm danh.');
    } finally {
      setAttBusy(false);
    }
  }

  const latestTuition = bundle?.tuition[0];
  const remainingTuition = latestTuition
    ? Math.max(0, latestTuition.totalAmount - latestTuition.paidAmount)
    : 0;
  const vietQrImg = useMemo(() => {
    if (!latestTuition || remainingTuition <= 0) return '';
    const acct = siteConfig.bankAccount || '0947376444';
    const owner = siteConfig.bankOwner || 'TRUNG TAM DAY THEM NHAN TRI';
    const info = `HOCPHI ${latestTuition.studentName} ${latestTuition.monthLabel}`;
    return `https://img.vietqr.io/image/MB-${encodeURIComponent(acct)}-compact2.png?amount=${remainingTuition}&addInfo=${encodeURIComponent(info)}&accountName=${encodeURIComponent(owner)}`;
  }, [latestTuition, remainingTuition, siteConfig.bankAccount, siteConfig.bankOwner]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="sm" />
            <div>
              <div className="text-sm font-extrabold text-blue-950 leading-tight">
                Trung Tâm Nhân Trí · Hồ sơ QR Động
              </div>
              <div className="text-[11px] text-slate-500">
                daythemnhantri.com · Hotline/Zalo: {siteConfig.hotlineZalo}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitQr}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Về Trang chủ
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {loading && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
            Đang tải dữ liệu học sinh trực tiếp từ hệ thống Nhân Trí...
          </div>
        )}

        {!loading && errorMsg && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
            <div className="text-base font-bold text-slate-950">Không thể mở Hồ sơ QR</div>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{errorMsg}</p>
          </div>
        )}

        {/* PIN VERIFICATION GATE FOR PARENTS / STUDENTS / GUESTS */}
        {!loading && !errorMsg && publicPreview && !bundle && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Xác thực bảo mật Hồ sơ Học sinh
              </div>
              <h1 className="text-xl font-extrabold text-slate-950 tabular-nums">
                Mã HS: {publicPreview.code}
              </h1>
              <p className="text-xs text-slate-600">
                {publicPreview.centerClass} · {publicPreview.school}
              </p>
            </div>

            <form onSubmit={handleUnlockWithPin} className="space-y-3">
              <label className="block text-xs">
                <span className="font-semibold text-slate-700">
                  Nhập Mã PIN Phụ huynh (in trên Thẻ QR hoặc do Cô Tâm cấp)
                </span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Nhập mã PIN 4–6 ký tự..."
                  className="mt-1.5 w-full min-h-[46px] px-3.5 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20"
                />
              </label>

              {pinError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={unlocking || pinInput.trim().length < 4}
                className="w-full min-h-[46px] rounded-xl bg-blue-900 text-white text-sm font-bold hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {unlocking ? 'Đang kiểm tra PIN...' : 'Mở khóa Hồ sơ, TKB & Học phí'}
              </button>
            </form>

            <div className="text-[11px] text-slate-500 text-center">
              Quên mã PIN? Nhắn Zalo Cô Tâm ({siteConfig.hotlineZalo}) để được hỗ trợ ngay.
            </div>
          </div>
        )}

        {/* UNLOCKED LIVE STUDENT PORTAL (OR STAFF QUICK ACTION VIEW) */}
        {!loading && bundle && (
          <div className="space-y-5">
            {/* Staff 1-Tap Attendance Panel */}
            {isStaff && (
              <div className="bg-blue-950 text-white rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                    <span className="text-sm font-bold">
                      Chế độ Giáo viên / Quản lý — Điểm danh 1 chạm qua QR
                    </span>
                  </div>
                  <span className="text-xs text-blue-200">
                    Đang đăng nhập: {currentUser?.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { status: 'PRESENT', label: 'Có mặt', cls: 'bg-emerald-600 hover:bg-emerald-500' },
                      { status: 'LATE', label: 'Đi trễ', cls: 'bg-amber-600 hover:bg-amber-500' },
                      { status: 'MAKEUP_EVENING', label: 'Bù ca tối', cls: 'bg-blue-600 hover:bg-blue-500' },
                      { status: 'EXCUSED', label: 'Nghỉ có phép', cls: 'bg-slate-700 hover:bg-slate-600' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.status}
                      type="button"
                      disabled={attBusy}
                      onClick={() => void handleStaffQuickAttendance(btn.status)}
                      className={`min-h-[44px] rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 ${btn.cls}`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                {attMsg && (
                  <div className="p-2.5 rounded-lg bg-white/10 text-xs font-medium text-emerald-200">
                    {attMsg}
                  </div>
                )}
              </div>
            )}

            {/* Live Student Identity Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-900 tabular-nums">
                    Mã Học sinh: {bundle.student.code}
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-950 mt-0.5">
                    {bundle.student.fullName}
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    {bundle.student.centerClass} · {bundle.student.room} · GV phụ trách:{' '}
                    <strong>{bundle.student.homeroomTeacher}</strong>
                  </p>
                  <p className="text-xs text-slate-600">
                    Trường: {bundle.student.school} ({bundle.student.schoolClass}) · Phụ huynh:{' '}
                    <strong>{bundle.student.parentName}</strong>
                  </p>
                </div>
                {bundle.student.eveningMakeupSlot && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-950">
                    <div className="font-bold">Lịch bù Thể dục</div>
                    <div>{bundle.student.eveningMakeupSlot}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Live Weekly Timetable */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <Calendar className="w-4 h-4 text-blue-900" />
                Thời khóa biểu tuần hiện tại ({bundle.timetable.length} ca)
              </div>
              {bundle.timetable.length === 0 ? (
                <div className="text-xs text-slate-500">Chưa có lịch học được phân công cho lớp này.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {bundle.timetable.map((sl) => (
                    <div
                      key={sl.id}
                      className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-bold text-blue-950">
                        <span>{sl.day} · {sl.period === 'SANG' ? 'Sáng' : sl.period === 'CHIEU' ? 'Chiều' : 'Tối'}</span>
                        <span className="tabular-nums text-amber-800">{sl.timeRange}</span>
                      </div>
                      <div className="font-bold text-slate-900">{sl.subject}</div>
                      <div className="text-slate-600">
                        {sl.room} · {sl.teacherName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Tuition + VietQR & Recent Scores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Wallet className="w-4 h-4 text-blue-900" />
                  Tình trạng Học phí &amp; Thanh toán VietQR
                </div>
                {latestTuition ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="font-bold text-slate-900">{latestTuition.monthLabel}</div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Tổng phải đóng:</span>
                        <strong className="tabular-nums">{formatVnd(latestTuition.totalAmount)}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Đã thanh toán:</span>
                        <strong className="text-emerald-700 tabular-nums">{formatVnd(latestTuition.paidAmount)}</strong>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1">
                        <span className="font-bold text-slate-900">Còn lại:</span>
                        <strong className={`tabular-nums ${remainingTuition > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {remainingTuition > 0 ? formatVnd(remainingTuition) : 'Đã hoàn tất'}
                        </strong>
                      </div>
                    </div>
                    {vietQrImg && (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50/50">
                        <img
                          src={vietQrImg}
                          alt="VietQR học phí Nhân Trí"
                          className="w-28 h-28 object-contain bg-white rounded-lg border border-slate-200 p-1"
                        />
                        <div className="space-y-1">
                          <div className="font-bold text-blue-950">Quét chuyển khoản VietQR 24/7</div>
                          <div>STK: <strong className="tabular-nums">{siteConfig.bankAccount}</strong></div>
                          <div>Ngân hàng: {siteConfig.bankName}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Chưa có phiếu học phí kỳ này.</div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                  <Bell className="w-4 h-4 text-amber-600" />
                  Điểm số &amp; Thông báo mới nhất
                </div>
                <div className="space-y-2 text-xs">
                  {bundle.scores.slice(0, 4).map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <div>
                        <strong className="text-slate-900">{sc.subject}</strong>
                        <span className="text-slate-500 ml-1.5">({sc.date})</span>
                      </div>
                      <strong className="text-blue-900 tabular-nums text-sm">
                        {sc.score.toFixed(1)}/{sc.maxScore}
                      </strong>
                    </div>
                  ))}
                  {bundle.notifications.slice(0, 3).map((ntf) => (
                    <div
                      key={ntf.id}
                      className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/60"
                    >
                      <div className="font-bold text-slate-900">{ntf.title}</div>
                      <div className="text-slate-600 mt-0.5">{ntf.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
