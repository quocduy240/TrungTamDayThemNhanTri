import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  DoorOpen,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  computeQuickClassSnapshot,
  formatCountdownSeconds,
  type QuickClassSnapshot,
} from '../lib/quickClassEngine';
import type { AuthUser, ClassCheckInRecord, Student, TimetableSlot } from '../types';

const DAY_VI: Record<string, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
  CN: 'Chủ nhật',
};

const PERIOD_VI: Record<string, string> = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
};

function formatShiftLabel(slot: TimetableSlot): string {
  return `${PERIOD_VI[slot.period] || slot.period} ${slot.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'} (${slot.timeRange})`;
}

interface QuickClassBannerProps {
  user: AuthUser;
  timetable: TimetableSlot[];
  students: Student[];
  checkins: ClassCheckInRecord[];
  leadMinutes?: number;
  onCheckedIn?: (record: ClassCheckInRecord) => void;
  onOpenExamForSubject?: (subject: string) => void;
  onJumpToAttendance?: (centerClass: string, shiftLabel: string) => void;
  onOpenNotificationPrefs?: () => void;
  compact?: boolean;
}

export const QuickClassBanner: React.FC<QuickClassBannerProps> = ({
  user,
  timetable,
  students,
  checkins,
  leadMinutes = 10,
  onCheckedIn,
  onOpenExamForSubject,
  onJumpToAttendance,
  onOpenNotificationPrefs,
  compact = false,
}) => {
  const [tick, setTick] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const snapshot = useMemo<QuickClassSnapshot>(
    () =>
      computeQuickClassSnapshot(
        timetable,
        {
          role: user.role,
          teacherId: user.linkedTeacherId,
          students,
        },
        tick,
      ),
    [timetable, user.role, user.linkedTeacherId, students, tick],
  );

  const activeSlot = snapshot.currentSlot || snapshot.nextSlot;
  const isOngoing = Boolean(snapshot.currentSlot);
  const isImminent =
    !isOngoing &&
    snapshot.secondsUntilNext !== null &&
    snapshot.secondsUntilNext <= leadMinutes * 60 &&
    snapshot.secondsUntilNext > 0;

  const isAlreadyCheckedIn = useMemo(() => {
    if (!activeSlot) return false;
    const actorId =
      user.role === 'STUDENT' && user.linkedStudentId
        ? user.linkedStudentId
        : user.role === 'TEACHER' && user.linkedTeacherId
          ? user.linkedTeacherId
          : user.id;
    return checkins.some(
      (c) => c.slotId === activeSlot.id && c.actorId === actorId && c.date === snapshot.clock.isoDate,
    );
  }, [activeSlot, checkins, user, snapshot.clock.isoDate]);

  const handleCheckIn = async () => {
    if (!activeSlot) return;
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ checkin: ClassCheckInRecord; alreadyCheckedIn: boolean }>(
        '/api/v1/quick-class/checkin',
        {
          method: 'POST',
          body: JSON.stringify({ slotId: activeSlot.id }),
        },
      );
      onCheckedIn?.(res.checkin);
      setStatusMsg(
        user.role === 'TEACHER'
          ? `Đã mở ca dạy tại ${activeSlot.room}. Đang chuyển tới bảng điểm danh...`
          : `Đã ghi nhận có mặt tại ${activeSlot.room} lúc ${res.checkin.checkedInAt.slice(11)}.`,
      );
      if (user.role === 'TEACHER' && onJumpToAttendance) {
        onJumpToAttendance(activeSlot.centerClass, formatShiftLabel(activeSlot));
      }
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Không thể xác nhận vào lớp lúc này.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeSlot) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1E3A8A] flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Vào lớp nhanh · {DAY_VI[snapshot.clock.day] || snapshot.clock.day}, {snapshot.clock.isoDate}
            </p>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Hôm nay chưa có ca học/ca dạy nào được xếp cho tài khoản này
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Bật nhắc lịch trước {leadMinutes} phút để tự động báo phòng học trước mỗi buổi lên lớp.
            </p>
          </div>
        </div>
        {onOpenNotificationPrefs && (
          <button
            type="button"
            onClick={onOpenNotificationPrefs}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            <Bell className="w-4 h-4 text-amber-600" />
            Cài đặt nhắc 10 phút
          </button>
        )}
      </div>
    );
  }

  const isTeacherAbsent = activeSlot.status === 'TEACHER_ABSENT';
  const isSubstituted = activeSlot.status === 'SUBSTITUTED';
  const isTeacher = user.role === 'TEACHER' || user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        isImminent
          ? 'bg-gradient-to-br from-amber-50/90 via-white to-blue-50/60 border-amber-300 shadow-md'
          : 'bg-gradient-to-br from-white via-white to-blue-50/40 border-blue-200/80 shadow-sm'
      }`}
    >
      <div className={compact ? 'p-4' : 'p-5 sm:p-6'}>
        {/* Top Metadata Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1E3A8A]">
              <DoorOpen className="w-4 h-4 text-amber-600" />
              Vào lớp nhanh
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs font-medium text-slate-500">
              {DAY_VI[activeSlot.day] || activeSlot.day} · {PERIOD_VI[activeSlot.period]} {activeSlot.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'}
            </span>
            {isOngoing && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                Đang diễn ra
              </span>
            )}
            {isImminent && (
              <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                Sắp vào lớp
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
              {isOngoing
                ? `Còn ${formatCountdownSeconds(snapshot.secondsRemainingInCurrent || 0)}`
                : snapshot.secondsUntilNext !== null
                  ? `Bắt đầu sau ${formatCountdownSeconds(snapshot.secondsUntilNext)}`
                  : `Lịch kế: ${DAY_VI[activeSlot.day]}`}
            </span>
            {onOpenNotificationPrefs && (
              <button
                type="button"
                onClick={onOpenNotificationPrefs}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:text-amber-700 transition-colors whitespace-nowrap"
              >
                <Bell className="w-3.5 h-3.5" />
                Nhắc {leadMinutes}p
              </button>
            )}
          </div>
        </div>

        {/* Main Room + Class + Action Grid */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Room Spotlight Box */}
          <div className="lg:col-span-3 rounded-xl bg-[#1E3A8A] text-white p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-200 text-[11px] font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                Phòng học
              </span>
              <span className="font-mono tabular-nums">{activeSlot.timeRange}</span>
            </div>
            <p className="text-2xl font-extrabold tracking-tight mt-2 tabular-nums">
              {activeSlot.room}
            </p>
            <p className="text-xs text-blue-100 mt-1 font-medium">{activeSlot.centerClass}</p>
          </div>

          {/* Subject & Teacher Details */}
          <div className="lg:col-span-5 space-y-2">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                {activeSlot.slotType === 'TRA_BAI'
                  ? 'Ca Trả bài & Soạn bài'
                  : activeSlot.slotType === 'BU_THE_DUC'
                    ? 'Ca Học bù Thể dục'
                    : 'Ca học chính khóa'}
              </p>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5 leading-snug">
                {activeSlot.subject}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>
                Giáo viên: <strong className="text-slate-900">{activeSlot.teacherName}</strong>
              </span>
              <span>
                Lớp: <strong className="text-slate-900">{activeSlot.centerClass}</strong>
              </span>
            </div>

            {(isTeacherAbsent || isSubstituted) && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  {isTeacherAbsent
                    ? 'Giáo viên chính báo bận đột xuất — Trung tâm đang bố trí giáo viên thay thế, vui lòng theo dõi thông báo.'
                    : `Ca học có điều chỉnh giáo viên dạy thay: ${activeSlot.teacherName}.`}
                </span>
              </div>
            )}

            {statusMsg && (
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {statusMsg}
              </p>
            )}
          </div>

          {/* One-Click Primary Actions */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-2.5">
            {isTeacher ? (
              <button
                type="button"
                disabled={submitting}
                onClick={handleCheckIn}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4 text-amber-300" />
                )}
                Vào lớp & Điểm danh ngay
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting || isAlreadyCheckedIn}
                  onClick={handleCheckIn}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap ${
                    isAlreadyCheckedIn
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {isAlreadyCheckedIn ? 'Đã xác nhận có mặt tại lớp' : 'Tôi đã vào lớp'}
                </button>
                {onOpenExamForSubject && (
                  <button
                    type="button"
                    onClick={() => onOpenExamForSubject(activeSlot.subject)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    Mở kho đề luyện môn này
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Today's Remaining Shifts Strip */}
        {snapshot.todaySlots.length > 1 && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
              Các ca hôm nay:
            </span>
            {snapshot.todaySlots.map((sl) => {
              const isCurrent = sl.id === activeSlot.id;
              return (
                <div
                  key={sl.id}
                  className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                    isCurrent
                      ? 'bg-blue-50 border-blue-200 text-[#1E3A8A] font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span className="font-mono tabular-nums">{sl.timeRange}</span>
                  <span>·</span>
                  <span>{sl.room}</span>
                  <span>·</span>
                  <span className="truncate max-w-[140px]">{sl.subject}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface LookupResponse {
  studentCode: string;
  studentShortName: string;
  centerClass: string;
  grade: number;
  snapshot: QuickClassSnapshot;
}

interface QuickClassLookupModalProps {
  open: boolean;
  onClose: () => void;
  onProceedToLogin?: (studentCode: string) => void;
}

export const QuickClassLookupModal: React.FC<QuickClassLookupModalProps> = ({
  open,
  onClose,
  onProceedToLogin,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runLookup = async (targetCode: string) => {
    const cleaned = targetCode.trim().toUpperCase();
    if (cleaned.length < 3) {
      setError('Vui lòng nhập Mã số học sinh (VD: NT-6A1-01).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<LookupResponse>(
        `/api/v1/quick-class/lookup?code=${encodeURIComponent(cleaned)}`,
      );
      setResult(data);
    } catch (err: unknown) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Không tìm thấy Mã học sinh này.');
    } finally {
      setLoading(false);
    }
  };

  const activeSlot = result?.snapshot.currentSlot || result?.snapshot.nextSlot;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#1E3A8A] to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
              <DoorOpen className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-bold">Vào lớp nhanh (Tra phòng trong 3 giây)</h3>
              <p className="text-xs text-blue-100">
                Nhập Mã số học sinh — biết ngay ca học, số phòng và giáo viên phụ trách
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

        <div className="p-6 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runLookup(code);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Nhập Mã HS (VD: NT-6A1-01 hoặc NT6A1H)"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#1E3A8A]"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-sm font-bold transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tra phòng'}
            </button>
          </form>

          {/* Quick Test Codes */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>Thử nhanh:</span>
            {['NT-6A1-01', 'NT-8A1-01', 'NT-12-01'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setCode(sample);
                  runLookup(sample);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-amber-50 hover:text-amber-800 border border-slate-200 font-mono text-[11px] font-semibold transition-colors"
              >
                {sample}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          {result && activeSlot && (
            <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-amber-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">
                    Học sinh: <strong className="text-slate-900">{result.studentShortName}</strong> ({result.studentCode})
                  </p>
                  <p className="text-xs font-semibold text-[#1E3A8A]">{result.centerClass}</p>
                </div>
                <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg tabular-nums">
                  {result.snapshot.currentSlot
                    ? 'ĐANG HỌC'
                    : result.snapshot.secondsUntilNext !== null
                      ? `Sau ${formatCountdownSeconds(result.snapshot.secondsUntilNext)}`
                      : DAY_VI[activeSlot.day]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="rounded-lg bg-[#1E3A8A] text-white p-3">
                  <p className="text-[11px] uppercase tracking-wider text-blue-200">Phòng vào lớp</p>
                  <p className="text-xl font-extrabold mt-0.5 tabular-nums">{activeSlot.room}</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-200 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Ca & Giờ học</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {DAY_VI[activeSlot.day]} · {activeSlot.timeRange}
                  </p>
                  <p className="text-xs text-slate-500">
                    {PERIOD_VI[activeSlot.period]} {activeSlot.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm pt-1">
                <div>
                  <span className="text-slate-500">Môn: </span>
                  <strong className="text-slate-900">{activeSlot.subject}</strong>
                </div>
                <div>
                  <span className="text-slate-500">GV: </span>
                  <strong className="text-[#1E3A8A]">{activeSlot.teacherName}</strong>
                </div>
              </div>

              {onProceedToLogin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onProceedToLogin(result.studentCode);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Đăng nhập vào lớp để Điểm danh & Làm bài tập
                </button>
              )}
            </div>
          )}

          {result && !activeSlot && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
              Em <strong>{result.studentShortName}</strong> ({result.centerClass}) hiện chưa có ca học nào được xếp trong tuần này.
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Chế độ tra nhanh chỉ hiển thị phòng học, khung giờ và giáo viên phụ trách — tuyệt đối ẩn số điện thoại, điểm số và học phí để bảo mật thông tin học sinh.
          </p>
        </div>
      </div>
    </div>
  );
};
