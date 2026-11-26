import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Facebook,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { UserNotificationPreference } from '../types';

interface NotificationPrefsModalProps {
  open: boolean;
  onClose: () => void;
  initialPref?: UserNotificationPreference;
  onSaved?: (pref: UserNotificationPreference) => void;
}

export const NotificationPrefsModal: React.FC<NotificationPrefsModalProps> = ({
  open,
  onClose,
  initialPref,
  onSaved,
}) => {
  const [pref, setPref] = useState<UserNotificationPreference | null>(initialPref || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [browserPerm, setBrowserPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    if (initialPref) {
      setPref(initialPref);
    }
    setLoading(true);
    apiRequest<{ preference: UserNotificationPreference }>('/api/v1/me/notification-prefs')
      .then((res) => setPref(res.preference))
      .catch(() => {
        // Keep initialPref fallback if already present
      })
      .finally(() => setLoading(false));
  }, [open, initialPref]);

  if (!open) return null;

  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setBrowserPerm(perm);
      if (perm === 'granted') {
        setFeedback({ type: 'ok', text: 'Đã bật quyền thông báo trực tiếp trên trình duyệt!' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Trình duyệt hiện chưa hỗ trợ cấp quyền thông báo.' });
    }
  };

  const handleSave = async () => {
    if (!pref) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ preference: UserNotificationPreference }>(
        '/api/v1/me/notification-prefs',
        {
          method: 'PUT',
          body: JSON.stringify(pref),
        },
      );
      setPref(res.preference);
      onSaved?.(res.preference);
      setFeedback({
        type: 'ok',
        text: `Đã lưu cài đặt nhắc lịch trước ${res.preference.leadMinutes} phút!`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể lưu cài đặt thông báo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      await apiRequest('/api/v1/me/notification-prefs/test', { method: 'POST' });
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification('Nhân Trí · Kiểm thử nhắc lịch vào lớp', {
          body: `Hệ thống sẽ tự động báo số phòng & giờ học trước ${pref?.leadMinutes || 10} phút.`,
        });
      }
      setFeedback({
        type: 'ok',
        text: 'Đã gửi tin kiểm thử thành công! Kiểm tra chuông thông báo trên thanh công cụ.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gửi tin kiểm thử thất bại.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 bg-gradient-to-r from-[#1E3A8A] to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Cài đặt nhận nhắc lịch trước giờ vào lớp</h3>
              <p className="text-xs text-blue-100">
                Tự động báo Phòng học · Ca học · Giáo viên qua Web, Zalo, Email và Facebook
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 rounded-lg text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {loading && !pref ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" />
              Đang tải cấu hình nhận tin...
            </div>
          ) : pref ? (
            <>
              {/* Master Switch & Lead Minutes */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pref.enabled}
                    onChange={(e) => setPref({ ...pref, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Bật nhắc lịch tự động</p>
                    <p className="text-xs text-slate-500">
                      Nhắc trước khi ca học / ca dạy bắt đầu
                    </p>
                  </div>
                </label>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 mr-1">Nhắc trước:</span>
                  {([5, 10, 15] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPref({ ...pref, leadMinutes: m })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors tabular-nums ${
                        pref.leadMinutes === m
                          ? 'bg-[#1E3A8A] text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                      }`}
                    >
                      {m} phút
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel Preferences */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Chọn kênh nhận thông báo
                </p>

                {/* WEB */}
                <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pref.channels.WEB}
                      onChange={(e) =>
                        setPref({
                          ...pref,
                          channels: { ...pref.channels, WEB: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded text-[#1E3A8A]"
                    />
                    <Globe className="w-4 h-4 text-[#1E3A8A]" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Thông báo Web & Trình duyệt</p>
                      <p className="text-xs text-slate-500">
                        Hiển thị biểu ngữ đếm ngược & bật nút Vào lớp nhanh tức thì
                      </p>
                    </div>
                  </label>
                  {browserPerm !== 'granted' && browserPerm !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={requestBrowserPermission}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold whitespace-nowrap"
                    >
                      Cấp quyền trình duyệt
                    </button>
                  )}
                  {browserPerm === 'granted' && (
                    <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      Đã bật
                    </span>
                  )}
                </div>

                {/* ZALO */}
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pref.channels.ZALO}
                      onChange={(e) =>
                        setPref({
                          ...pref,
                          channels: { ...pref.channels, ZALO: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded text-[#1E3A8A]"
                    />
                    <MessageCircle className="w-4 h-4 text-[#0068FF]" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Tin nhắn Zalo (Zalo OA / ZNS)</p>
                      <p className="text-xs text-slate-500">
                        Nhận số phòng & tên giáo viên qua Zalo trước giờ lên lớp
                      </p>
                    </div>
                  </label>
                  {pref.channels.ZALO && (
                    <input
                      type="tel"
                      value={pref.zaloPhone || ''}
                      onChange={(e) => setPref({ ...pref, zaloPhone: e.target.value })}
                      placeholder="Nhập SĐT Zalo nhận tin (VD: 0947376444)"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                    />
                  )}
                </div>

                {/* EMAIL */}
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pref.channels.EMAIL}
                      onChange={(e) =>
                        setPref({
                          ...pref,
                          channels: { ...pref.channels, EMAIL: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded text-[#1E3A8A]"
                    />
                    <Mail className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Email / Gmail cá nhân</p>
                      <p className="text-xs text-slate-500">
                        Nhận thông báo lịch học kèm liên kết vào lớp nhanh
                      </p>
                    </div>
                  </label>
                  {pref.channels.EMAIL && (
                    <input
                      type="email"
                      value={pref.email || ''}
                      onChange={(e) => setPref({ ...pref, email: e.target.value })}
                      placeholder="Nhập Gmail nhận nhắc lịch"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                    />
                  )}
                </div>

                {/* FACEBOOK */}
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pref.channels.FACEBOOK}
                      onChange={(e) =>
                        setPref({
                          ...pref,
                          channels: { ...pref.channels, FACEBOOK: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded text-[#1E3A8A]"
                    />
                    <Facebook className="w-4 h-4 text-[#1877F2]" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Facebook Messenger</p>
                      <p className="text-xs text-slate-500">
                        Kết nối Messenger Fanpage Trung Tâm Nhân Trí
                      </p>
                    </div>
                  </label>
                  {pref.channels.FACEBOOK && (
                    <input
                      type="text"
                      value={pref.facebookPsid || ''}
                      onChange={(e) => setPref({ ...pref, facebookPsid: e.target.value })}
                      placeholder="Tên Facebook hoặc Messenger PSID"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                    />
                  )}
                </div>
              </div>

              {feedback && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 ${
                    feedback.type === 'ok'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700'
                  }`}
                >
                  {feedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <Bell className="w-4 h-4 shrink-0" />
                  )}
                  {feedback.text}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={testing || !pref}
            onClick={handleTest}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Gửi tin kiểm thử
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={saving || !pref}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Lưu cài đặt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
