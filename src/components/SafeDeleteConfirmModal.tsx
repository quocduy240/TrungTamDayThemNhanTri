import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { isExactConfirmNameMatch } from '../lib/contentStudioEngine';

export interface SafeDeleteConfirmModalProps {
  open: boolean;
  entityType: 'STUDENT' | 'TEACHER';
  targetName: string;
  targetSubLabel?: string;
  requesterLabel?: string;
  impactSummary: string[];
  onConfirmDelete: (payload: { confirmName: string; reason: string }) => Promise<void>;
  onClose: () => void;
}

export const SafeDeleteConfirmModal: React.FC<SafeDeleteConfirmModalProps> = ({
  open,
  entityType,
  targetName,
  targetSubLabel,
  requesterLabel,
  impactSummary,
  onConfirmDelete,
  onClose,
}) => {
  const [step, setStep] = useState<'VERIFY' | 'REQUEST'>('VERIFY');
  const [typedName, setTypedName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('VERIFY');
      setTypedName('');
      setReason('');
      setSubmitting(false);
      setErrorMsg(null);
    }
  }, [open, targetName]);

  if (!open) return null;

  const matched = isExactConfirmNameMatch(typedName, targetName);
  const entityLabel = entityType === 'STUDENT' ? 'Học sinh' : 'Giáo viên';

  const handleProceedToRequest = () => {
    if (!matched) {
      setErrorMsg(`Vui lòng nhập chính xác họ tên "${targetName}" để mở khóa nút xóa.`);
      return;
    }
    setErrorMsg(null);
    setStep('REQUEST');
  };

  const handleExecuteDelete = async () => {
    if (!matched || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirmDelete({
        confirmName: typedName.trim(),
        reason: reason.trim(),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể hoàn tất yêu cầu xóa hồ sơ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safe-delete-modal-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div
          className={`flex items-start justify-between gap-3 border-b px-6 py-4 ${
            step === 'REQUEST'
              ? 'border-rose-200 bg-rose-50'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                step === 'REQUEST'
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {step === 'REQUEST' ? (
                <FileWarning className="h-5 w-5" />
              ) : (
                <ShieldAlert className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                {step === 'VERIFY'
                  ? `Bước 1/2 · Xác minh xóa hồ sơ ${entityLabel}`
                  : `Bước 2/2 · Bản yêu cầu xác nhận xóa ${entityLabel}`}
              </p>
              <h3
                id="safe-delete-modal-title"
                className="mt-0.5 text-lg font-extrabold text-slate-900"
              >
                {step === 'VERIFY'
                  ? `Nhập chính xác họ tên để mở khóa nút xóa`
                  : `Bản Yêu Cầu Xóa Hồ Sơ ${entityLabel}`}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-50"
            aria-label="Đóng hộp thoại"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Target card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hồ sơ được chọn xóa
                </p>
                <p className="mt-0.5 text-base font-extrabold text-slate-900">{targetName}</p>
                {targetSubLabel && (
                  <p className="mt-0.5 text-xs text-slate-600">{targetSubLabel}</p>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <Archive className="h-3.5 w-3.5" />
                Bảo lưu lịch sử tài chính &amp; điểm
              </span>
            </div>
          </div>

          {step === 'VERIFY' ? (
            <>
              {/* Impact summary */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Tác động khi thực hiện thao tác xóa
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-amber-950">
                  {impactSummary.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Exact name input */}
              <div>
                <label
                  htmlFor="safe-delete-confirm-name"
                  className="block text-sm font-bold text-slate-800"
                >
                  Nhập chính xác họ tên {entityLabel.toLowerCase()} để kích hoạt nút Xóa:
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Họ tên chuẩn cần nhập:{' '}
                  <strong className="select-all font-bold text-slate-900">{targetName}</strong>
                </p>
                <input
                  id="safe-delete-confirm-name"
                  type="text"
                  autoFocus
                  value={typedName}
                  onChange={(e) => {
                    setTypedName(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matched) {
                      e.preventDefault();
                      handleProceedToRequest();
                    }
                  }}
                  placeholder={`Gõ đúng: ${targetName}`}
                  className={`mt-2 w-full rounded-xl border-2 px-4 py-3 text-sm font-semibold outline-none transition ${
                    matched
                      ? 'border-emerald-500 bg-emerald-50/40 text-slate-900 focus:ring-2 focus:ring-emerald-200'
                      : 'border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                  }`}
                />
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {matched ? (
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Họ tên khớp chính xác — Nút Xóa hồ sơ đã được mở khóa.
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Nút Xóa sẽ nổi sáng màu đỏ ngay khi bạn nhập khớp đúng họ tên ở trên.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Formal Deletion Request Sheet */
            <div className="space-y-4">
              <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Người lập yêu cầu</p>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {requesterLabel || 'Quản trị viên Trung tâm Nhân Trí'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Loại hồ sơ</p>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {entityLabel} · Đã xác minh tên khớp 100%
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">
                      Cam kết toàn vẹn dữ liệu
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                      {impactSummary.map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="safe-delete-reason"
                  className="block text-sm font-bold text-slate-800"
                >
                  Lý do xóa hồ sơ (lưu vào nhật ký kiểm toán — không bắt buộc)
                </label>
                <textarea
                  id="safe-delete-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: Học sinh chuyển trường / kết thúc khóa học, hoặc giáo viên tạm dừng cộng tác..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {step === 'VERIFY' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={!matched}
                onClick={handleProceedToRequest}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                  matched
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 hover:bg-rose-700 focus:ring-4 focus:ring-rose-200'
                    : 'cursor-not-allowed border border-slate-200 bg-slate-200 text-slate-400'
                }`}
              >
                <Trash2 className="h-4 w-4" />
                Xóa hồ sơ
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStep('VERIFY')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleExecuteDelete}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {submitting ? 'Đang xử lý lưu trữ & xóa...' : 'Xác nhận gửi yêu cầu xóa'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
