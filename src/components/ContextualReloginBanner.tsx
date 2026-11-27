import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { AuthUser } from '../types';
import { isSessionExpiredError } from '../lib/api';

interface SessionExpiredBannerProps {
  reason: string | null;
  recovering?: boolean;
  onAttemptSilentRefresh: () => Promise<unknown> | void;
  onOpenReloginModal: () => void;
  onDismiss?: () => void;
}

export const SessionExpiredBanner: React.FC<SessionExpiredBannerProps> = ({
  reason,
  recovering,
  onAttemptSilentRefresh,
  onOpenReloginModal,
  onDismiss,
}) => {
  if (!reason) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-sm leading-snug">
          <p className="font-bold text-amber-950">Phiên làm việc đã hết hạn hoặc máy chủ vừa khởi động lại</p>
          <p className="text-xs text-amber-800 mt-0.5">
            {reason} — Toàn bộ dữ liệu bạn đang nhập trên màn hình vẫn được giữ nguyên. Bấm <strong>Đăng nhập lại ngay</strong> để tiếp tục lưu.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <button
          type="button"
          onClick={() => onAttemptSilentRefresh()}
          disabled={recovering}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-semibold hover:bg-amber-100/60 transition whitespace-nowrap disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
          Thử khôi phục ngầm
        </button>
        <button
          type="button"
          onClick={onOpenReloginModal}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172e6e] transition whitespace-nowrap"
        >
          <LogIn className="w-3.5 h-3.5" />
          Đăng nhập lại ngay
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Đóng cảnh báo tạm thời"
            className="p-2 rounded-lg text-amber-700 hover:bg-amber-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

interface ContextualReloginModalProps {
  open: boolean;
  user: AuthUser | null;
  reason?: string | null;
  allowDemoPreview?: boolean;
  onClose: () => void;
  onGoogleRelogin: () => Promise<boolean>;
  onDemoRoleRelogin?: () => Promise<boolean>;
  onSwitchToFullLogin: () => void;
}

export const ContextualReloginModal: React.FC<ContextualReloginModalProps> = ({
  open,
  user,
  reason,
  allowDemoPreview,
  onClose,
  onGoogleRelogin,
  onDemoRoleRelogin,
  onSwitchToFullLogin,
}) => {
  const [loadingMode, setLoadingMode] = useState<'GOOGLE' | 'DEMO' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingMode('GOOGLE');
    try {
      const ok = await onGoogleRelogin();
      if (ok) {
        setSuccessMsg('Đã gia hạn phiên làm việc thành công! Bạn có thể bấm Lưu lại ngay.');
        setTimeout(() => {
          setSuccessMsg(null);
          onClose();
        }, 700);
      } else {
        setErrorMsg('Chưa thể xác thực lại qua Gmail. Vui lòng thử lại hoặc mở cổng đăng nhập đầy đủ.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi xác thực lại bằng Gmail.');
    } finally {
      setLoadingMode(null);
    }
  };

  const handleDemo = async () => {
    if (!onDemoRoleRelogin) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingMode('DEMO');
    try {
      const ok = await onDemoRoleRelogin();
      if (ok) {
        setSuccessMsg('Đã khôi phục phiên làm việc tại chỗ! Dữ liệu đang nhập vẫn được giữ nguyên.');
        setTimeout(() => {
          setSuccessMsg(null);
          onClose();
        }, 650);
      } else {
        setErrorMsg('Không thể gia hạn tự động phiên trải nghiệm.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi gia hạn phiên làm việc.');
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="relogin-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 bg-[#1E3A8A] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <h3 id="relogin-modal-title" className="text-base font-bold leading-tight">
                Đăng nhập lại tại chỗ
              </h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Giữ nguyên tab &amp; biểu mẫu đang mở, không mất dữ liệu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-blue-100 hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700 space-y-1">
            {user ? (
              <>
                <p>
                  Tài khoản hiện tại: <strong className="text-slate-900">{user.name}</strong>
                </p>
                <p className="font-mono text-[11px] text-slate-600">{user.email || user.role}</p>
              </>
            ) : (
              <p>Phiên làm việc hiện tại cần xác thực lại để tiếp tục gửi yêu cầu lên máy chủ.</p>
            )}
            {reason && <p className="text-amber-800 font-medium pt-1">Chi tiết: {reason}</p>}
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loadingMode !== null}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#1E3A8A] text-white text-sm font-bold hover:bg-[#172e6e] transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loadingMode === 'GOOGLE' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              Xác thực lại bằng Gmail (1 chạm)
            </button>

            {allowDemoPreview && onDemoRoleRelogin && user && (
              <button
                type="button"
                onClick={handleDemo}
                disabled={loadingMode !== null}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingMode === 'DEMO' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-[#1E3A8A]" />
                )}
                Gia hạn nhanh phiên {user.role} hiện tại
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onSwitchToFullLogin();
              }}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            >
              Mở trang Đăng nhập đầy đủ (đổi tài khoản / đăng nhập SĐT &amp; PIN)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InlineErrorAlertProps {
  message: string | null;
  onRequestRelogin?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const InlineErrorAlert: React.FC<InlineErrorAlertProps> = ({
  message,
  onRequestRelogin,
  onDismiss,
  className = '',
}) => {
  if (!message) return null;
  const expired = isSessionExpiredError(message);

  return (
    <div
      role="alert"
      className={`rounded-xl border px-3.5 py-2.5 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
        expired
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : 'border-red-200 bg-red-50 text-red-800'
      } ${className}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${expired ? 'text-amber-700' : 'text-red-600'}`} />
        <span className="text-xs sm:text-sm font-medium leading-snug">{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {expired && onRequestRelogin && (
          <button
            type="button"
            onClick={onRequestRelogin}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-lg bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172e6e] transition whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" />
            Đăng nhập lại
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Đóng thông báo lỗi"
            className="p-1.5 rounded-lg hover:bg-black/5 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
