import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Calendar,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Mail,
  RefreshCw,
  Save,
  Send,
  Share2,
  Trash2,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AuthUser,
  DayOfWeek,
  SessionPeriod,
  ShiftCode,
  SiteConfig,
  Teacher,
  TeacherLeave,
  TimetableChangeEvent,
  TimetableSlot,
  TimetableSpecialBlock,
} from '../types';
import { apiRequest } from '../lib/api';
import { buildTimetableDocumentHtml } from '../lib/brandedDocumentExporter';
import { ALL_SHIFT_KEYS, DAYS, SHIFT_ROWS, makeShiftKey } from '../lib/timetableEngine';
import {
  SPECIAL_BLOCK_TYPE_LABELS,
  getSpecialBlockVisualStyle,
  resolveHighestPrioritySpecialBlock,
  sanitizeHexColor,
} from '../lib/timetableSpecialBlocks';
import {
  buildTeacherScheduleShareText,
  diffTeacherProfileFields,
  findAffectedSlotsForLeave,
  formatShiftLabel,
  formatVnDateTime,
  playGentleScheduleChime,
  renderTeacherSchedulePngDataUrl,
} from '../lib/teacherSelfService';
import { BrandedPrintModal } from './BrandedPrintModal';

type SubTab = 'schedule' | 'profile' | 'availability' | 'leaves';

interface TeacherSelfServiceHubProps {
  currentUser: AuthUser;
  teachers: Teacher[];
  timetable: TimetableSlot[];
  teacherLeaves: TeacherLeave[];
  timetableUpdatedAt?: string;
  timetableVersion?: number;
  timetableChanges?: TimetableChangeEvent[];
  specialBlocks?: TimetableSpecialBlock[];
  siteConfig?: Partial<SiteConfig>;
  onRefresh: () => Promise<void>;
}

const SLOT_TYPE_LABELS: Record<TimetableSlot['slotType'], string> = {
  MAIN: 'Dạy chính',
  TRA_BAI: 'Trả bài',
  PHU_DAO: 'Phụ đạo',
  BU_THE_DUC: 'Bù thể dục',
};

function getTodayDayCode(): DayOfWeek | null {
  const jsDay = new Date().getDay();
  const map: Record<number, DayOfWeek> = {
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
  };
  return map[jsDay] || null;
}

function getDefaultNextDateLabel(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export const TeacherSelfServiceHub: React.FC<TeacherSelfServiceHubProps> = ({
  currentUser,
  teachers,
  timetable,
  teacherLeaves,
  timetableUpdatedAt,
  timetableVersion,
  timetableChanges = [],
  specialBlocks = [],
  siteConfig,
  onRefresh,
}) => {
  const isManager =
    currentUser.role === 'SUPER_ADMIN' ||
    currentUser.role === 'ADMIN' ||
    currentUser.role === 'MANAGER';

  // Resolve active teacher: matched teacherId for TEACHER role, or selectable preview teacher for Admin/Manager
  const defaultTeacherId = useMemo(() => {
    if (currentUser.linkedTeacherId && teachers.some((t) => t.id === currentUser.linkedTeacherId)) {
      return currentUser.linkedTeacherId;
    }
    const byEmail = teachers.find(
      (t) => t.email && t.email.toLowerCase() === (currentUser.email || '').toLowerCase(),
    );
    if (byEmail) return byEmail.id;
    return teachers[0]?.id || '';
  }, [currentUser.linkedTeacherId, currentUser.email, teachers]);

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(defaultTeacherId);
  useEffect(() => {
    if (!selectedTeacherId && defaultTeacherId) {
      setSelectedTeacherId(defaultTeacherId);
    } else if (currentUser.role === 'TEACHER' && defaultTeacherId && selectedTeacherId !== defaultTeacherId) {
      setSelectedTeacherId(defaultTeacherId);
    }
  }, [defaultTeacherId, selectedTeacherId, currentUser.role]);

  const activeTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) || teachers[0] || null,
    [teachers, selectedTeacherId],
  );

  const isOwnAccount = Boolean(
    activeTeacher &&
      (currentUser.linkedTeacherId === activeTeacher.id ||
        (currentUser.email &&
          activeTeacher.email &&
          currentUser.email.toLowerCase() === activeTeacher.email.toLowerCase())),
  );

  const [subTab, setSubTab] = useState<SubTab>('schedule');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Print modal state
  const [printPreview, setPrintPreview] = useState<{
    open: boolean;
    title: string;
    subtitle: string;
    fileName: string;
    htmlContent: string;
  } | null>(null);

  // Zalo share helper modal/panel state
  const [sharePreviewText, setSharePreviewText] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  // Browser notification permission state
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  // Track which change event IDs have already triggered browser/audio alert in this session
  const alertedEventIdsRef = useRef<Set<string>>(new Set());

  // Teacher's own timetable slots & leaves
  const mySlots = useMemo(() => {
    if (!activeTeacher) return [];
    return timetable.filter((sl) => sl.teacherId === activeTeacher.id);
  }, [timetable, activeTeacher]);

  const activeSlots = useMemo(() => mySlots.filter((sl) => sl.status !== 'OFF'), [mySlots]);

  const myLeaves = useMemo(() => {
    if (!activeTeacher) return [];
    return teacherLeaves.filter((lv) => lv.teacherId === activeTeacher.id);
  }, [teacherLeaves, activeTeacher]);

  const unacknowledgedChanges = useMemo(() => {
    if (!activeTeacher) return [];
    return timetableChanges.filter(
      (ev) =>
        ev.affectedTeacherIds.includes(activeTeacher.id) &&
        !(ev.acknowledgedByTeacherIds || []).includes(activeTeacher.id),
    );
  }, [timetableChanges, activeTeacher]);

  const recentAcknowledgedChanges = useMemo(() => {
    if (!activeTeacher) return [];
    return timetableChanges
      .filter(
        (ev) =>
          ev.affectedTeacherIds.includes(activeTeacher.id) &&
          (ev.acknowledgedByTeacherIds || []).includes(activeTeacher.id),
      )
      .slice(0, 5);
  }, [timetableChanges, activeTeacher]);

  const todayCode = getTodayDayCode();
  const todaySlots = useMemo(
    () => (todayCode ? activeSlots.filter((sl) => sl.day === todayCode) : []),
    [activeSlots, todayCode],
  );

  // Trigger audio chime + browser notification once per unseen timetable change when bell is enabled
  useEffect(() => {
    if (!activeTeacher || activeTeacher.scheduleAlertEnabled === false) return;
    if (unacknowledgedChanges.length === 0) return;

    const unseen = unacknowledgedChanges.filter((ev) => !alertedEventIdsRef.current.has(ev.id));
    if (unseen.length === 0) return;

    unseen.forEach((ev) => alertedEventIdsRef.current.add(ev.id));

    if (activeTeacher.scheduleAlertSound !== false) {
      playGentleScheduleChime();
    }

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const latest = unseen[0];
        new Notification(`Trung tâm Nhân Trí · Cập nhật TKB (v${latest.version})`, {
          body: latest.summary,
          icon: '/logo-nhantri.png',
        });
      } catch {
        // Ignore notification errors in restricted iframes
      }
    }
  }, [activeTeacher, unacknowledgedChanges]);

  // --- Profile form state ---
  const [profileForm, setProfileForm] = useState({
    name: '',
    shortName: '',
    phone: '',
    email: '',
    degree: '',
    experienceYears: 1,
    subjectsText: '',
  });

  useEffect(() => {
    if (!activeTeacher) return;
    setProfileForm({
      name: activeTeacher.name || '',
      shortName: activeTeacher.shortName || '',
      phone: activeTeacher.phone || '',
      email: activeTeacher.email || '',
      degree: activeTeacher.degree || '',
      experienceYears: Number(activeTeacher.experienceYears || 0),
      subjectsText: (activeTeacher.subjects || []).join(', '),
    });
  }, [activeTeacher]);

  const profileDiffs = useMemo(() => {
    if (!activeTeacher) return [];
    const parsedSubjects = profileForm.subjectsText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return diffTeacherProfileFields(activeTeacher, {
      name: profileForm.name.trim(),
      shortName: profileForm.shortName.trim(),
      phone: profileForm.phone.trim(),
      email: profileForm.email.trim(),
      degree: profileForm.degree.trim(),
      experienceYears: Number(profileForm.experienceYears) || 0,
      subjects: parsedSubjects,
    });
  }, [activeTeacher, profileForm]);

  // --- Availability matrix state ---
  const [availDraft, setAvailDraft] = useState<string[]>([]);
  const [availDirty, setAvailDirty] = useState(false);

  useEffect(() => {
    if (!activeTeacher) return;
    const base =
      Array.isArray(activeTeacher.availability) && activeTeacher.availability.length > 0
        ? activeTeacher.availability
        : [...ALL_SHIFT_KEYS];
    setAvailDraft(base);
    setAvailDirty(false);
  }, [activeTeacher]);

  const assignedShiftMap = useMemo(() => {
    const map = new Map<string, TimetableSlot[]>();
    activeSlots.forEach((sl) => {
      const key = makeShiftKey(sl.day, sl.period, sl.shift);
      const list = map.get(key) || [];
      list.push(sl);
      map.set(key, list);
    });
    return map;
  }, [activeSlots]);

  const busyConflictSlots = useMemo(() => {
    const availSet = new Set(availDraft);
    return activeSlots.filter((sl) => !availSet.has(makeShiftKey(sl.day, sl.period, sl.shift)));
  }, [activeSlots, availDraft]);

  // --- Leave request form state ---
  const [leaveForm, setLeaveForm] = useState<{
    day: DayOfWeek;
    dateLabel: string;
    period: SessionPeriod | 'ALL';
    shift: ShiftCode | '';
    reason: string;
  }>({
    day: todayCode || 'T2',
    dateLabel: getDefaultNextDateLabel(),
    period: 'CHIEU',
    shift: 'CA_1',
    reason: '',
  });

  const leavePreviewAffected = useMemo(() => {
    if (!activeTeacher) return [];
    return findAffectedSlotsForLeave(timetable, {
      teacherId: activeTeacher.id,
      day: leaveForm.day,
      period: leaveForm.period,
      shift: leaveForm.period === 'ALL' ? undefined : leaveForm.shift || undefined,
    });
  }, [timetable, activeTeacher, leaveForm]);

  // === Actions ===

  async function handleToggleBell(nextEnabled: boolean, nextSound?: boolean) {
    if (!activeTeacher) return;
    if (nextEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      } catch {
        // Ignore if blocked by iframe policy
      }
    }

    if (!isOwnAccount && !isManager) {
      setBanner({ type: 'error', text: 'Bạn chỉ có thể thay đổi chuông báo cho tài khoản của chính mình.' });
      return;
    }

    if (!isOwnAccount && isManager) {
      setBanner({
        type: 'info',
        text: 'Đang ở chế độ xem trước Admin. Giáo viên đăng nhập trực tiếp tài khoản của mình để bật/tắt chuông báo cá nhân.',
      });
      return;
    }

    setBusyAction('bell');
    try {
      await apiRequest('/api/v1/teachers/me/alert-prefs', {
        method: 'PATCH',
        body: JSON.stringify({
          scheduleAlertEnabled: nextEnabled,
          scheduleAlertSound: nextSound ?? activeTeacher.scheduleAlertSound ?? true,
        }),
      });
      if (nextEnabled && (nextSound ?? activeTeacher.scheduleAlertSound ?? true)) {
        playGentleScheduleChime();
      }
      await onRefresh();
      setBanner({
        type: 'success',
        text: nextEnabled
          ? 'Đã bật chuông báo thay đổi Thời khóa biểu. Khi lịch dạy/trả bài của thầy cô thay đổi, hệ thống sẽ báo ngay kèm bảng đối chiếu Cũ → Mới.'
          : 'Đã tạm tắt chuông báo thay đổi Thời khóa biểu.',
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không cập nhật được chuông báo.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAckChanges(eventIds?: string[]) {
    if (!activeTeacher) return;
    if (!isOwnAccount) {
      setBanner({
        type: 'info',
        text: 'Đang xem trước bằng quyền Admin. Nút "Đã xem" dành cho chính giáo viên xác nhận lịch mới.',
      });
      return;
    }
    setBusyAction('ack');
    try {
      await apiRequest('/api/v1/teachers/me/ack-timetable', {
        method: 'POST',
        body: JSON.stringify(eventIds ? { eventIds } : {}),
      });
      await onRefresh();
      setBanner({
        type: 'success',
        text: 'Đã xác nhận đã xem toàn bộ thay đổi Thời khóa biểu mới nhất.',
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không xác nhận được lịch mới.' });
    } finally {
      setBusyAction(null);
    }
  }

  function handleOpenPdfPrint() {
    if (!activeTeacher) return;
    const roleLabel =
      activeTeacher.teacherGroup === 'TUTOR_REVIEW' ? 'Giáo viên Trả bài' : 'Giáo viên Bộ môn';
    const htmlContent = buildTimetableDocumentHtml({
      title: `THỜI KHÓA BIỂU ${roleLabel.toUpperCase()} — ${activeTeacher.name.toUpperCase()}`,
      slots: activeSlots,
      siteConfig,
    });
    setPrintPreview({
      open: true,
      title: `Thời khóa biểu cá nhân — ${activeTeacher.shortName}`,
      subtitle: `${roleLabel} · Cập nhật ${formatVnDateTime(timetableUpdatedAt)} · ${activeSlots.length} ca/tuần`,
      fileName: `TKB-${activeTeacher.shortName.replace(/\s+/g, '-')}-NhanTri`,
      htmlContent,
    });
  }

  async function handleDownloadPng() {
    if (!activeTeacher) return;
    setBusyAction('png');
    try {
      const dataUrl = await renderTeacherSchedulePngDataUrl({
        teacher: activeTeacher,
        slots: mySlots,
        timetableUpdatedAt,
        siteConfig,
        logoUrl: '/logo-nhantri.png',
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `TKB-${activeTeacher.shortName.replace(/\s+/g, '-')}-NhanTri.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setBanner({
        type: 'success',
        text: 'Đã tải ảnh Thời khóa biểu sắc nét (.png) về máy — thầy cô có thể lưu vào thư viện ảnh điện thoại hoặc gửi thẳng vào Zalo.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Không xuất được ảnh Thời khóa biểu.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShareZalo() {
    if (!activeTeacher) return;
    const shareText = buildTeacherScheduleShareText({
      teacher: activeTeacher,
      slots: mySlots,
      timetableUpdatedAt,
      siteConfig,
    });

    // Try native mobile Web Share API first
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Lịch lên lớp — ${activeTeacher.shortName} (Trung tâm Nhân Trí)`,
          text: shareText,
        });
        setBanner({ type: 'success', text: 'Đã mở hộp chia sẻ hệ thống (Zalo / Tin nhắn / Ứng dụng khác).' });
        return;
      } catch {
        // User cancelled or blocked in iframe — fallback to copy + preview box
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    } catch {
      // Clipboard may be restricted; preview box allows manual select
    }
    setSharePreviewText(shareText);
    setBanner({
      type: 'info',
      text: 'Đã sao chép nội dung Thời khóa biểu chuẩn Zalo. Thầy cô dán trực tiếp vào tin nhắn Zalo cá nhân hoặc nhóm chuyên môn.',
    });
  }

  function handleSendEmail() {
    if (!activeTeacher) return;
    const shareText = buildTeacherScheduleShareText({
      teacher: activeTeacher,
      slots: mySlots,
      timetableUpdatedAt,
      siteConfig,
    });
    const subject = `[Nhân Trí] Thời khóa biểu cá nhân — ${activeTeacher.name} (cập nhật ${formatVnDateTime(timetableUpdatedAt)})`;
    const recipient = activeTeacher.email || '';
    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareText)}`;
    const link = document.createElement('a');
    link.href = mailtoUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeacher) return;
    if (profileDiffs.length === 0) {
      setBanner({ type: 'info', text: 'Hồ sơ hiện tại chưa có thay đổi nào cần lưu.' });
      return;
    }

    const parsedSubjects = profileForm.subjectsText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setBusyAction('profile');
    try {
      const endpoint = isOwnAccount
        ? '/api/v1/teachers/me/profile'
        : `/api/v1/teachers/${activeTeacher.id}`;
      const res = await apiRequest<{ message?: string; diffs?: unknown[] }>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileForm.name.trim(),
          shortName: profileForm.shortName.trim(),
          phone: profileForm.phone.trim(),
          email: profileForm.email.trim(),
          degree: profileForm.degree.trim(),
          experienceYears: Number(profileForm.experienceYears) || 0,
          subjects: parsedSubjects,
        }),
      });
      await onRefresh();
      setBanner({
        type: 'success',
        text:
          res.message ||
          `Đã cập nhật hồ sơ cá nhân (${profileDiffs.length} mục) và gửi nhật ký đối chiếu Cũ → Mới cho Admin.`,
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không lưu được hồ sơ cá nhân.' });
    } finally {
      setBusyAction(null);
    }
  }

  function toggleShiftAvailability(shiftKey: string) {
    setAvailDraft((prev) => {
      const exists = prev.includes(shiftKey);
      const next = exists ? prev.filter((k) => k !== shiftKey) : [...prev, shiftKey];
      return next;
    });
    setAvailDirty(true);
  }

  function applyAvailabilityPreset(preset: 'ALL' | 'SANG' | 'CHIEU' | 'TOI' | 'CLEAR') {
    if (preset === 'ALL') {
      setAvailDraft([...ALL_SHIFT_KEYS]);
    } else if (preset === 'CLEAR') {
      setAvailDraft([]);
    } else {
      const periodKeys = ALL_SHIFT_KEYS.filter((k) => k.includes(`_${preset}_`));
      setAvailDraft((prev) => {
        const allIncluded = periodKeys.every((k) => prev.includes(k));
        if (allIncluded) {
          return prev.filter((k) => !periodKeys.includes(k));
        }
        return Array.from(new Set([...prev, ...periodKeys]));
      });
    }
    setAvailDirty(true);
  }

  async function handleSaveAvailability() {
    if (!activeTeacher) return;
    setBusyAction('availability');
    try {
      const res = await apiRequest<{
        message?: string;
        conflictingSlots?: TimetableSlot[];
      }>(`/api/v1/teachers/${activeTeacher.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ availability: availDraft }),
      });
      await onRefresh();
      setAvailDirty(false);
      const conflictCount = res.conflictingSlots?.length || 0;
      setBanner({
        type: conflictCount > 0 ? 'info' : 'success',
        text:
          conflictCount > 0
            ? `Đã lưu lịch Ca rảnh/Ca bận và thông báo Admin. Lưu ý: có ${conflictCount} ca đang xếp lịch rơi vào khung giờ Bận — thầy cô nên gửi "Đơn xin nghỉ ca" để Admin sắp xếp dạy thay sớm.`
            : 'Đã cập nhật lịch Ca rảnh / Ca bận trong tuần và đồng bộ lên bảng xếp lịch của Admin.',
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không lưu được lịch rảnh/bận.' });
    } finally {
      setBusyAction(null);
    }
  }

  function quickRequestLeaveForSlot(slot: TimetableSlot) {
    setLeaveForm({
      day: slot.day,
      dateLabel: getDefaultNextDateLabel(),
      period: slot.period,
      shift: slot.shift,
      reason: '',
    });
    setSubTab('leaves');
    setBanner({
      type: 'info',
      text: `Đã điền sẵn khung giờ ${formatShiftLabel(slot.day, slot.period, slot.shift)} (${slot.centerClass} · ${slot.subject}). Thầy cô chỉ cần nhập lý do ngắn và bấm Gửi đơn.`,
    });
  }

  async function handleSubmitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeacher) return;
    if (!leaveForm.reason.trim()) {
      setBanner({ type: 'error', text: 'Vui lòng nhập ngắn gọn lý do xin nghỉ ca.' });
      return;
    }
    setBusyAction('leave');
    try {
      const res = await apiRequest<{
        message?: string;
        affectedSlots?: TimetableSlot[];
        topSuggestions?: Array<{ shortName: string; score: number }>;
      }>('/api/v1/teacher-leaves', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: activeTeacher.id,
          day: leaveForm.day,
          dateLabel: leaveForm.dateLabel.trim() || getDefaultNextDateLabel(),
          period: leaveForm.period,
          shift: leaveForm.period === 'ALL' ? undefined : leaveForm.shift || undefined,
          reason: leaveForm.reason.trim(),
        }),
      });
      await onRefresh();
      setLeaveForm((prev) => ({ ...prev, reason: '' }));
      const topSub = res.topSuggestions?.[0];
      setBanner({
        type: 'success',
        text:
          res.message ||
          `Đã gửi đơn xin nghỉ đến Admin${topSub ? ` (Hệ thống đã tự đề xuất ${topSub.shortName} dạy thay)` : ' để kịp thời điều phối hoặc báo sớm Phụ huynh'}.`,
      });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không gửi được đơn xin nghỉ.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWithdrawLeave(leaveId: string) {
    setBusyAction(`withdraw-${leaveId}`);
    try {
      await apiRequest(`/api/v1/teacher-leaves/${leaveId}`, { method: 'DELETE' });
      await onRefresh();
      setBanner({ type: 'success', text: 'Đã rút đơn xin nghỉ vừa tạo.' });
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Không rút được đơn xin nghỉ.' });
    } finally {
      setBusyAction(null);
    }
  }

  if (!activeTeacher) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="text-sm font-semibold text-slate-900">
          Tài khoản hiện tại chưa được liên kết với hồ sơ Giáo viên nào.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Vui lòng liên hệ Quản trị viên để gán hồ sơ Giáo viên Bộ môn hoặc Giáo viên Trả bài tương ứng.
        </p>
      </div>
    );
  }

  const isTutorReview = activeTeacher.teacherGroup === 'TUTOR_REVIEW';
  const bellEnabled = activeTeacher.scheduleAlertEnabled !== false;
  const soundEnabled = activeTeacher.scheduleAlertSound !== false;

  return (
    <div className="space-y-5">
      {/* Top Identity & Freshness Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-blue-900">
                {isTutorReview ? 'Không gian Giáo viên Trả bài' : 'Không gian Giáo viên Bộ môn'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">
                Cập nhật TKB mới nhất: <strong className="text-slate-900">{formatVnDateTime(timetableUpdatedAt)}</strong>
                {timetableVersion ? ` (v${timetableVersion})` : ''}
              </span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">
                Tổng <strong className="text-slate-900">{activeSlots.length}</strong> ca/tuần
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-950 mt-1 truncate">
              {activeTeacher.name}{' '}
              <span className="text-sm font-medium text-slate-500">({activeTeacher.shortName})</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Phụ trách: <strong className="text-slate-800">{(activeTeacher.subjects || []).join(', ') || 'Chưa khai báo'}</strong>
              <span className="mx-2 text-slate-300">·</span>
              Phòng mặc định: <strong className="text-slate-800">{activeTeacher.roomDefault}</strong>
              {todayCode && (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  <span>
                    Hôm nay ({DAYS.find((d) => d.code === todayCode)?.label}):{' '}
                    <strong className={todaySlots.length > 0 ? 'text-blue-900' : 'text-slate-700'}>
                      {todaySlots.length > 0 ? `${todaySlots.length} ca lên lớp` : 'Không có ca'}
                    </strong>
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isManager && (
              <label className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="font-medium whitespace-nowrap">Xem theo GV:</span>
                <select
                  value={activeTeacher.id}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <optgroup label="Giáo viên Bộ môn">
                    {teachers
                      .filter((t) => t.teacherGroup !== 'TUTOR_REVIEW')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.shortName} ({t.name})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Giáo viên Trả bài">
                    {teachers
                      .filter((t) => t.teacherGroup === 'TUTOR_REVIEW')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.shortName} ({t.name})
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>
            )}

            {/* Schedule Change Alert Bell Toggle */}
            <button
              type="button"
              disabled={busyAction === 'bell'}
              onClick={() => handleToggleBell(!bellEnabled)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer whitespace-nowrap min-h-[44px] ${
                bellEnabled
                  ? 'bg-blue-900 text-white border-blue-900 hover:bg-blue-800'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {bellEnabled ? (
                unacknowledgedChanges.length > 0 ? (
                  <BellRing className="w-4 h-4 text-amber-300" />
                ) : (
                  <Bell className="w-4 h-4" />
                )
              ) : (
                <BellOff className="w-4 h-4 text-slate-400" />
              )}
              <span>{bellEnabled ? 'Chuông báo TKB: Đang bật' : 'Bật chuông báo TKB'}</span>
              {unacknowledgedChanges.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-bold text-[11px] tabular-nums">
                  {unacknowledgedChanges.length}
                </span>
              )}
            </button>

            {bellEnabled && (
              <button
                type="button"
                disabled={busyAction === 'bell'}
                onClick={() => handleToggleBell(true, !soundEnabled)}
                title={soundEnabled ? 'Tắt âm chuông' : 'Bật âm chuông'}
                className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                aria-label={soundEnabled ? 'Tắt âm chuông báo' : 'Bật âm chuông báo'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-900" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => onRefresh()}
              className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Làm mới Thời khóa biểu"
              aria-label="Làm mới Thời khóa biểu"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {bellEnabled && notifPermission === 'denied' && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Trình duyệt đang chặn thông báo đẩy (Notification). Thầy cô vẫn nhận đầy đủ âm chuông và Bảng đối chiếu Cũ → Mới ngay trên màn hình này.
          </p>
        )}
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex items-start justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : banner.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-blue-50 border-blue-200 text-blue-950'
          }`}
        >
          <p className="leading-relaxed font-medium">{banner.text}</p>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer whitespace-nowrap"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Unacknowledged Timetable Changes Diff Banner (Old -> New + "Đã xem" Button) */}
      {unacknowledgedChanges.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <BellRing className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Có {unacknowledgedChanges.length} thay đổi Thời khóa biểu mới ảnh hưởng đến lịch của thầy/cô
                </h3>
                <p className="text-xs text-slate-700 mt-0.5">
                  Vui lòng đối chiếu nhanh cột <strong>Lịch cũ</strong> và <strong>Lịch mới</strong> bên dưới rồi bấm xác nhận để tránh nhầm giờ lên lớp.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busyAction === 'ack'}
              onClick={() => handleAckChanges()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã xem &amp; xác nhận lịch mới</span>
            </button>
          </div>

          <div className="overflow-x-auto bg-white border border-amber-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold">Thời điểm</th>
                  <th className="py-2.5 px-3 font-semibold">Nội dung thay đổi</th>
                  <th className="py-2.5 px-3 font-semibold">Trước khi đổi (Cũ)</th>
                  <th className="py-2.5 px-3 font-semibold">Sau khi đổi (Mới)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unacknowledgedChanges.map((ev) => (
                  <tr key={ev.id} className="align-top">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">
                      <div className="font-semibold text-slate-900">v{ev.version}</div>
                      <div>{formatVnDateTime(ev.createdAt)}</div>
                      <div className="text-[11px] text-slate-500">Bởi {ev.updatedBy}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 min-w-[220px]">
                      {ev.summary}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 min-w-[180px]">
                      {ev.before ? (
                        <div>
                          <div className="font-semibold text-slate-800">
                            {formatShiftLabel(ev.before.day, ev.before.period, ev.before.shift)} ({ev.before.timeRange})
                          </div>
                          <div>
                            {ev.before.centerClass} · {ev.before.subject} · {ev.before.room}
                          </div>
                          <div className="text-[11px] text-slate-500">GV: {ev.before.teacherName}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Ca mới xếp thêm</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 min-w-[180px]">
                      {ev.after ? (
                        <div>
                          <div className="font-semibold text-blue-900">
                            {formatShiftLabel(ev.after.day, ev.after.period, ev.after.shift)} ({ev.after.timeRange})
                          </div>
                          <div>
                            {ev.after.centerClass} · {ev.after.subject} · {ev.after.room}
                          </div>
                          <div className="text-[11px] text-emerald-700 font-medium">
                            GV: {ev.after.teacherName}
                            {ev.after.status === 'OFF' ? ' · TẠM NGHỈ' : ev.after.status === 'SUBSTITUTED' ? ' · DẠY THAY' : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-red-700 font-medium">Đã gỡ khỏi lịch tuần</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: 'schedule' as const, label: 'Lịch lên lớp của tôi', icon: Calendar, count: activeSlots.length },
          { id: 'profile' as const, label: 'Hồ sơ cá nhân', icon: UserCheck, count: profileDiffs.length > 0 ? profileDiffs.length : undefined },
          { id: 'availability' as const, label: 'Ca rảnh / Ca bận tuần', icon: Clock, count: busyConflictSlots.length > 0 ? busyConflictSlots.length : undefined },
          { id: 'leaves' as const, label: 'Đơn xin nghỉ ca', icon: CalendarOff, count: myLeaves.filter((l) => l.status === 'PENDING').length || undefined },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap min-h-[44px] border-b-2 ${
                active
                  ? 'border-blue-900 text-blue-950 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PERSONAL SCHEDULE + EXPORT/SHARE */}
      {subTab === 'schedule' && (
        <div className="space-y-4">
          {/* Action bar: Download PNG, Print PDF, Share Zalo, Send Email */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                Xuất &amp; chia sẻ lịch cá nhân về điện thoại
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Tải ảnh sắc nét lưu trong thư viện ảnh, in PDF khổ A4 có Logo Nhân Trí hoặc gửi nhanh sang Zalo, Email riêng.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction === 'png'}
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <ImageIcon className="w-4 h-4" />
                <span>{busyAction === 'png' ? 'Đang tạo ảnh...' : 'Tải ảnh PNG'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenPdfPrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <FileText className="w-4 h-4 text-blue-900" />
                <span>In / Lưu PDF</span>
              </button>
              <button
                type="button"
                onClick={handleShareZalo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <Share2 className="w-4 h-4" />
                <span>Chia sẻ Zalo</span>
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <Mail className="w-4 h-4 text-amber-700" />
                <span>Gửi Email riêng</span>
              </button>
            </div>
          </div>

          {/* Share Preview Box (for Desktop Zalo Copy) */}
          {sharePreviewText && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900">
                  Nội dung Thời khóa biểu chuẩn dán Zalo / Email
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(sharePreviewText);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2500);
                      } catch {
                        // ignore
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {copiedShare ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedShare ? 'Đã sao chép' : 'Sao chép lại'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharePreviewText(null)}
                    className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
              <pre className="text-xs text-slate-800 bg-white border border-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-sans leading-relaxed">
                {sharePreviewText}
              </pre>
            </div>
          )}

          {/* Weekly Schedule Grid */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                Lịch giảng dạy &amp; trả bài trong tuần (Thứ 2 – Thứ 7)
              </span>
              <span className="text-[11px]">
                Bấm <strong>“Xin nghỉ ca này”</strong> trực tiếp trên ô lớp để báo Admin tìm GV dạy thay hoặc báo sớm Phụ huynh.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-3 px-3 text-left font-bold text-slate-700 w-36">Ca / Khung giờ</th>
                    {DAYS.map((d) => {
                      const isToday = d.code === todayCode;
                      return (
                        <th
                          key={d.code}
                          className={`py-3 px-2.5 text-center font-bold border-l border-slate-200 ${
                            isToday ? 'bg-blue-50 text-blue-950' : 'text-slate-800'
                          }`}
                        >
                          {d.label}
                          {isToday && (
                            <span className="block text-[10px] font-semibold text-blue-700 mt-0.5">Hôm nay</span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {SHIFT_ROWS.map((row) => (
                    <tr key={`${row.period}_${row.shift}`} className="align-top">
                      <td className="py-3 px-3 bg-slate-50/70">
                        <div className="font-bold text-slate-900">{row.label}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">{row.time}</div>
                      </td>
                      {DAYS.map((d) => {
                        const cellKey = makeShiftKey(d.code, row.period, row.shift);
                        const cellSlots = mySlots.filter(
                          (sl) => sl.day === d.code && sl.period === row.period && sl.shift === row.shift,
                        );
                        const globalSpecial = resolveHighestPrioritySpecialBlock(
                          specialBlocks.filter((b) => !b.targetClasses || b.targetClasses.length === 0),
                          cellKey,
                        );
                        const slotSpecialMap = new Map<string, TimetableSpecialBlock>();
                        const uncoveredSlots: TimetableSlot[] = [];
                        for (const sl of cellSlots) {
                          const matchedSpecial = resolveHighestPrioritySpecialBlock(
                            specialBlocks,
                            cellKey,
                            sl.centerClass,
                          );
                          if (matchedSpecial) {
                            slotSpecialMap.set(matchedSpecial.id, matchedSpecial);
                          } else {
                            uncoveredSlots.push(sl);
                          }
                        }
                        if (globalSpecial && !slotSpecialMap.has(globalSpecial.id)) {
                          slotSpecialMap.set(globalSpecial.id, globalSpecial);
                        }
                        const cellSpecials = Array.from(slotSpecialMap.values()).sort(
                          (a, b) => b.priority - a.priority,
                        );
                        const isToday = d.code === todayCode;
                        return (
                          <td
                            key={`${d.code}_${row.period}_${row.shift}`}
                            className={`p-2 border-l border-slate-200 min-w-[130px] ${
                              isToday ? 'bg-blue-50/25' : 'bg-white'
                            }`}
                          >
                            {cellSpecials.length === 0 && uncoveredSlots.length === 0 ? (
                              <div className="h-20 flex items-center justify-center text-slate-300 select-none">
                                —
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {cellSpecials.map((sb) => {
                                  const vis = getSpecialBlockVisualStyle(sb);
                                  const accent = sanitizeHexColor(
                                    sb.accentColor,
                                    vis.containerStyle.borderColor,
                                  );
                                  return (
                                    <div
                                      key={sb.id}
                                      style={vis.containerStyle}
                                      className="rounded-xl p-2.5 space-y-1"
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span
                                          style={{ color: accent }}
                                          className="text-[10px] font-bold uppercase tracking-wider"
                                        >
                                          {SPECIAL_BLOCK_TYPE_LABELS[sb.blockType]}
                                        </span>
                                        <span
                                          style={{ color: accent }}
                                          className="text-[9px] font-bold opacity-85"
                                        >
                                          Ưu tiên
                                        </span>
                                      </div>
                                      <div className={`${vis.titleSizeClass} ${vis.weightClass} leading-snug`}>
                                        {sb.title}
                                      </div>
                                      {sb.subtitle && (
                                        <div className={`${vis.subtitleSizeClass} opacity-85 leading-snug`}>
                                          {sb.subtitle}
                                        </div>
                                      )}
                                      {sb.targetClasses.length > 0 && (
                                        <div className="text-[10px] opacity-80">
                                          Áp dụng: {sb.targetClasses.join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {uncoveredSlots.map((sl) => {
                                  const isOff = sl.status === 'OFF';
                                  const isAbsent = sl.status === 'TEACHER_ABSENT';
                                  const isSub = sl.status === 'SUBSTITUTED';
                                  const isTraBai = sl.slotType === 'TRA_BAI';
                                  const cardTone = isOff
                                    ? 'bg-slate-100 border-slate-300 text-slate-600'
                                    : isAbsent
                                      ? 'bg-red-50 border-red-200 text-red-950'
                                      : isSub
                                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                                        : isTraBai
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                          : 'bg-blue-50/80 border-blue-200 text-slate-950';

                                  return (
                                    <div key={sl.id} className={`rounded-xl border p-2.5 ${cardTone}`}>
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-bold text-xs truncate">{sl.centerClass}</span>
                                        <span className="text-[10px] font-semibold opacity-80 whitespace-nowrap">
                                          {sl.room}
                                        </span>
                                      </div>
                                      <div className="font-semibold text-[12px] mt-0.5 truncate">{sl.subject}</div>
                                      <div className="text-[11px] opacity-80 mt-0.5 tabular-nums">
                                        {SLOT_TYPE_LABELS[sl.slotType]} · {sl.timeRange}
                                      </div>
                                      {(isOff || isAbsent || isSub) && (
                                        <div className="text-[10px] font-bold uppercase mt-1">
                                          {isOff
                                            ? 'Đã báo nghỉ buổi'
                                            : isAbsent
                                              ? 'Đã gửi xin nghỉ'
                                              : 'Phân công dạy thay'}
                                        </div>
                                      )}
                                      {sl.note && (
                                        <div className="text-[10px] opacity-80 mt-1 line-clamp-2">{sl.note}</div>
                                      )}
                                      {!isOff && (
                                        <button
                                          type="button"
                                          onClick={() => quickRequestLeaveForSlot(sl)}
                                          className="mt-2 w-full py-1.5 px-2 rounded-lg bg-white/90 hover:bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:text-red-700 transition cursor-pointer whitespace-nowrap"
                                        >
                                          Xin nghỉ ca này
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Acknowledged Change Log */}
          {recentAcknowledgedChanges.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-slate-900 mb-2.5">
                Lịch sử cập nhật TKB đã xác nhận gần đây
              </h4>
              <div className="divide-y divide-slate-100">
                {recentAcknowledgedChanges.map((ev) => (
                  <div key={ev.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <span className="text-slate-800">{ev.summary}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      v{ev.version} · {formatVnDateTime(ev.createdAt)} · Đã xem
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SELF-STANDARDIZE PERSONAL PROFILE */}
      {subTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                Tự chuẩn hóa thông tin cá nhân giáo viên
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Nếu phát hiện Quản trị viên nhập sai họ tên, số điện thoại Zalo, email hay học vị, thầy cô có thể chỉnh trực tiếp tại đây. Hệ thống áp dụng ngay và gửi bảng đối chiếu <strong>Cũ → Mới</strong> vào nhật ký kiểm soát cho Admin.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên đầy đủ</span>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Tên hiển thị trên TKB (Xưng hô)</span>
                <input
                  type="text"
                  required
                  value={profileForm.shortName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, shortName: e.target.value }))}
                  placeholder="VD: Thầy Nhân, Cô Lan..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại / Zalo</span>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="09xx xxx xxx"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900 tabular-nums"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Email nhận lịch &amp; thông báo</span>
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="giaovien@gmail.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Học vị / Bằng cấp chuyên môn</span>
                <input
                  type="text"
                  value={profileForm.degree}
                  onChange={(e) => setProfileForm((p) => ({ ...p, degree: e.target.value }))}
                  placeholder="Cử nhân Sư phạm / Thạc sĩ..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Số năm kinh nghiệm</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={profileForm.experienceYears}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, experienceYears: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900 tabular-nums"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                Môn phụ trách (phân tách bằng dấu phẩy)
              </span>
              <input
                type="text"
                value={profileForm.subjectsText}
                onChange={(e) => setProfileForm((p) => ({ ...p, subjectsText: e.target.value }))}
                placeholder="Toán, Lý, Trả bài..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
              />
            </label>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                {activeTeacher.profileUpdatedAt
                  ? `Cập nhật gần nhất: ${formatVnDateTime(activeTeacher.profileUpdatedAt)} bởi ${activeTeacher.profileUpdatedBy || 'Hệ thống'}`
                  : 'Mọi chỉnh sửa được đồng bộ tự động lên Thời khóa biểu và hồ sơ lớp.'}
              </span>
              <button
                type="submit"
                disabled={busyAction === 'profile' || profileDiffs.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <Save className="w-4 h-4" />
                <span>
                  {busyAction === 'profile'
                    ? 'Đang lưu...'
                    : profileDiffs.length > 0
                      ? `Lưu ${profileDiffs.length} thay đổi & báo log Admin`
                      : 'Chưa có thay đổi'}
                </span>
              </button>
            </div>
          </div>

          {/* Right column: Locked admin fields + Live Old->New preview */}
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">Thông tin phân công do Trung tâm khóa</h4>
              <p className="text-[11px] text-slate-600">
                Các thông số vận hành sau do Ban Quản trị điều phối để bảo toàn toàn vẹn lịch học:
              </p>
              <dl className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Nhóm công tác:</dt>
                  <dd className="font-semibold text-slate-900">
                    {isTutorReview ? 'Giáo viên Trả bài' : 'Giáo viên Bộ môn'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Phòng mặc định:</dt>
                  <dd className="font-semibold text-slate-900">{activeTeacher.roomDefault}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Trạng thái:</dt>
                  <dd className="font-semibold text-emerald-700">
                    {activeTeacher.status === 'ACTIVE' ? 'Đang công tác' : 'Đang nghỉ phép'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900">
                Xem trước nhật ký gửi Admin ({profileDiffs.length})
              </h4>
              {profileDiffs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Khi thầy cô sửa bất kỳ trường nào ở bên trái, hệ thống sẽ hiển thị chính xác nội dung <strong>Cũ → Mới</strong> sẽ gửi báo cáo cho Admin tại đây.
                </p>
              ) : (
                <div className="space-y-2">
                  {profileDiffs.map((d) => (
                    <div key={d.field} className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs">
                      <div className="font-bold text-slate-900">{d.label}</div>
                      <div className="text-slate-600 line-through mt-0.5">{d.oldValue}</div>
                      <div className="text-blue-950 font-semibold">→ {d.newValue}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: WEEKLY AVAILABILITY MATRIX */}
      {subTab === 'availability' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Đăng ký khung giờ Rảnh / Bận trong tuần
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Chạm trực tiếp vào từng ô để chuyển giữa <strong className="text-emerald-700">Rảnh (nhận lịch)</strong> và{' '}
                  <strong className="text-slate-600">Bận (không xếp lịch)</strong>. Admin sẽ thấy ngay khi xếp TKB hoặc tìm người dạy thay.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyAvailabilityPreset('ALL')}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Rảnh cả tuần
                </button>
                <button
                  type="button"
                  onClick={() => applyAvailabilityPreset('SANG')}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Bật/Tắt Sáng
                </button>
                <button
                  type="button"
                  onClick={() => applyAvailabilityPreset('CHIEU')}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Bật/Tắt Chiều
                </button>
                <button
                  type="button"
                  onClick={() => applyAvailabilityPreset('TOI')}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Bật/Tắt Tối
                </button>
              </div>
            </div>

            {busyConflictSlots.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-amber-950">
                    Có <strong>{busyConflictSlots.length} ca đã được xếp lớp</strong> đang nằm trong ô thầy cô đánh dấu <strong>Bận</strong>. Sau khi lưu, thầy cô nên gửi đơn xin nghỉ ca đó để Admin bố trí người thay.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quickRequestLeaveForSlot(busyConflictSlots[0])}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer whitespace-nowrap"
                >
                  Tạo đơn nghỉ ca đầu tiên
                </button>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full min-w-[680px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-2.5 px-3 text-left font-bold text-slate-700 w-36">Ca học</th>
                    {DAYS.map((d) => (
                      <th key={d.code} className="py-2.5 px-2 text-center font-bold text-slate-800 border-l border-slate-200">
                        {d.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {SHIFT_ROWS.map((row) => (
                    <tr key={`${row.period}_${row.shift}`}>
                      <td className="py-2.5 px-3 bg-slate-50/70">
                        <div className="font-semibold text-slate-900">{row.label}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">{row.time}</div>
                      </td>
                      {DAYS.map((d) => {
                        const key = makeShiftKey(d.code, row.period, row.shift);
                        const isFree = availDraft.includes(key);
                        const assigned = assignedShiftMap.get(key) || [];
                        const hasConflict = !isFree && assigned.length > 0;
                        return (
                          <td key={key} className="p-1.5 border-l border-slate-200">
                            <button
                              type="button"
                              onClick={() => toggleShiftAvailability(key)}
                              className={`w-full min-h-[54px] rounded-lg border px-2 py-1.5 text-center transition cursor-pointer flex flex-col items-center justify-center ${
                                hasConflict
                                  ? 'bg-amber-50 border-amber-400 text-amber-950'
                                  : isFree
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                                    : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200/60'
                              }`}
                            >
                              <span className="font-bold text-[11px]">
                                {hasConflict ? 'Bận · Đang có lớp' : isFree ? 'Rảnh' : 'Bận'}
                              </span>
                              {assigned.length > 0 && (
                                <span className="text-[10px] opacity-80 truncate max-w-[110px]">
                                  {assigned[0].centerClass} · {assigned[0].subject}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-600 tabular-nums">
                Đang đăng ký Rảnh: <strong>{availDraft.length}/{ALL_SHIFT_KEYS.length}</strong> ca trong tuần
              </span>
              <button
                type="button"
                disabled={busyAction === 'availability' || !availDirty}
                onClick={handleSaveAvailability}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <Save className="w-4 h-4" />
                <span>{busyAction === 'availability' ? 'Đang lưu...' : 'Lưu lịch Ca rảnh / Ca bận'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVE REQUESTS */}
      {subTab === 'leaves' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Submit Leave Form */}
          <form onSubmit={handleSubmitLeave} className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Gửi đơn xin nghỉ ca</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Khi gửi đơn, Admin nhận thông báo ngay cùng danh sách GV rảnh có thể dạy thay, hoặc kích hoạt thông báo sớm cho Phụ huynh &amp; Học sinh khỏi đến lớp.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Thứ trong tuần</span>
                <select
                  value={leaveForm.day}
                  onChange={(e) => setLeaveForm((p) => ({ ...p, day: e.target.value as DayOfWeek }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 bg-white focus:outline-none focus:border-blue-900"
                >
                  {DAYS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Ngày cụ thể</span>
                <input
                  type="text"
                  required
                  value={leaveForm.dateLabel}
                  onChange={(e) => setLeaveForm((p) => ({ ...p, dateLabel: e.target.value }))}
                  placeholder="VD: 28/11/2026"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900 tabular-nums"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Buổi</span>
                <select
                  value={leaveForm.period}
                  onChange={(e) =>
                    setLeaveForm((p) => ({
                      ...p,
                      period: e.target.value as SessionPeriod | 'ALL',
                      shift: e.target.value === 'ALL' ? '' : p.shift || 'CA_1',
                    }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 bg-white focus:outline-none focus:border-blue-900"
                >
                  <option value="SANG">Buổi Sáng</option>
                  <option value="CHIEU">Buổi Chiều</option>
                  <option value="TOI">Buổi Tối</option>
                  <option value="ALL">Cả ngày</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Ca cụ thể</span>
                <select
                  disabled={leaveForm.period === 'ALL'}
                  value={leaveForm.period === 'ALL' ? '' : leaveForm.shift}
                  onChange={(e) => setLeaveForm((p) => ({ ...p, shift: e.target.value as ShiftCode | '' }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 bg-white disabled:bg-slate-100 focus:outline-none focus:border-blue-900"
                >
                  <option value="CA_1">Ca 1</option>
                  <option value="CA_2">Ca 2</option>
                  <option value="">Cả buổi (Ca 1 &amp; Ca 2)</option>
                </select>
              </label>
            </div>

            {/* Live Affected Slots Preview */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
              <div className="font-semibold text-slate-900 mb-1">
                Các lớp chịu ảnh hưởng ({leavePreviewAffected.length}):
              </div>
              {leavePreviewAffected.length === 0 ? (
                <p className="text-slate-500">
                  Hiện chưa có lớp nào được xếp vào khung giờ này — đơn vẫn được ghi nhận để Admin không xếp mới vào giờ bận.
                </p>
              ) : (
                <ul className="space-y-1 text-slate-700">
                  {leavePreviewAffected.map((sl) => (
                    <li key={sl.id}>
                      • <strong>{sl.centerClass}</strong> · {sl.subject} ({sl.room} · {sl.timeRange})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Lý do xin nghỉ (ngắn gọn)</span>
              <textarea
                rows={3}
                required
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="VD: Bận họp chuyên môn ở trường / Có việc gia đình đột xuất..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-950 focus:outline-none focus:border-blue-900"
              />
            </label>

            <button
              type="submit"
              disabled={busyAction === 'leave'}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer min-h-[44px]"
            >
              <Send className="w-4 h-4" />
              <span>{busyAction === 'leave' ? 'Đang gửi đơn...' : 'Gửi đơn xin nghỉ đến Admin'}</span>
            </button>
          </form>

          {/* Leave History List */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-950">
                Đơn xin nghỉ của {activeTeacher.shortName} ({myLeaves.length})
              </h3>
              <span className="text-[11px] text-slate-500">Tự động cập nhật khi Admin xử lý</span>
            </div>

            {myLeaves.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center text-xs text-slate-500">
                Chưa có đơn xin nghỉ nào. Thầy cô có thể bấm “Xin nghỉ ca này” trên bảng Thời khóa biểu hoặc điền biểu mẫu bên trái.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {myLeaves.map((lv) => {
                  const statusText =
                    lv.status === 'PENDING'
                      ? 'Đang chờ Admin điều phối'
                      : lv.status === 'REJECTED'
                        ? 'Đã từ chối'
                        : lv.resolutionType === 'SUBSTITUTE_ASSIGNED' && lv.substituteTeacherName
                          ? `Đã xếp GV thay: ${lv.substituteTeacherName}`
                          : lv.resolutionType === 'CLASS_CANCELLED_NOTIFIED'
                            ? 'Đã duyệt nghỉ & gửi báo sớm PH/HS'
                            : 'Đã duyệt nghỉ';

                  const statusColor =
                    lv.status === 'PENDING'
                      ? 'text-amber-700'
                      : lv.status === 'REJECTED'
                        ? 'text-red-700'
                        : 'text-emerald-700';

                  return (
                    <div key={lv.id} className="py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <strong className="text-slate-950">
                            {DAYS.find((d) => d.code === lv.day)?.label || lv.day} ({lv.dateLabel})
                          </strong>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-700">
                            {lv.period === 'ALL'
                              ? 'Cả ngày'
                              : `${lv.period === 'SANG' ? 'Sáng' : lv.period === 'CHIEU' ? 'Chiều' : 'Tối'}${lv.shift ? ` ${lv.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'}` : ' (cả buổi)'}`}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className={`font-semibold ${statusColor}`}>{statusText}</span>
                        </div>
                        <p className="text-xs text-slate-700">Lý do: {lv.reason}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          Gửi lúc {lv.createdAt}
                          {lv.parentNoticeSentAt ? ` · Đã thông báo PH lúc ${formatVnDateTime(lv.parentNoticeSentAt)}` : ''}
                        </p>
                      </div>
                      {lv.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={busyAction === `withdraw-${lv.id}`}
                          onClick={() => handleWithdrawLeave(lv.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap self-start"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Rút đơn</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Branded A4 PDF Modal */}
      {printPreview && (
        <BrandedPrintModal
          open={printPreview.open}
          title={printPreview.title}
          subtitle={printPreview.subtitle}
          fileName={printPreview.fileName}
          htmlContent={printPreview.htmlContent}
          onClose={() => setPrintPreview(null)}
        />
      )}
    </div>
  );
};
