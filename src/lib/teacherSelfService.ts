import type {
  DatabaseState,
  DayOfWeek,
  SessionPeriod,
  ShiftCode,
  SiteConfig,
  Student,
  SubstituteSuggestion,
  Teacher,
  TeacherLeave,
  TimetableChangeEvent,
  TimetableChangeSnapshot,
  TimetableSlot,
} from '../types';
import { studentBelongsToClass } from './timetableEngine';
import { normalizeLookupKey } from './workspaceIntegrity';

const DAY_LABELS: Record<DayOfWeek, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
};

const PERIOD_LABELS: Record<SessionPeriod, string> = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
};

const SHIFT_LABELS: Record<ShiftCode, string> = {
  CA_1: 'Ca 1',
  CA_2: 'Ca 2',
};

const SLOT_TYPE_LABELS: Record<TimetableSlot['slotType'], string> = {
  MAIN: 'Dạy chính',
  TRA_BAI: 'Trả bài',
  PHU_DAO: 'Phụ đạo',
  BU_THE_DUC: 'Bù thể dục',
};

export function formatVnDateTime(iso?: string): string {
  if (!iso) return 'Chưa có mốc cập nhật';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export function slotToSnapshot(slot: TimetableSlot): TimetableChangeSnapshot {
  return {
    day: slot.day,
    period: slot.period,
    shift: slot.shift,
    timeRange: slot.timeRange,
    centerClass: slot.centerClass,
    subject: slot.subject,
    teacherId: slot.teacherId,
    teacherName: slot.teacherName,
    room: slot.room,
    status: slot.status,
    slotType: slot.slotType,
    note: slot.note,
  };
}

export function formatShiftLabel(day: DayOfWeek, period: SessionPeriod, shift: ShiftCode): string {
  return `${DAY_LABELS[day]} · ${PERIOD_LABELS[period]} ${SHIFT_LABELS[shift]}`;
}

export function makeShiftKey(day: DayOfWeek, period: SessionPeriod, shift: ShiftCode): string {
  return `${day}_${period}_${shift}`;
}

/**
 * Records a timetable change event onto DatabaseState, bumps timetableVersion & timetableUpdatedAt,
 * and pushes in-app notifications to all affected teachers.
 */
export function recordTimetableChange(
  db: DatabaseState,
  params: {
    action: TimetableChangeEvent['action'];
    updatedBy: string;
    slotId?: string;
    summary: string;
    before?: TimetableChangeSnapshot;
    after?: TimetableChangeSnapshot;
    affectedTeacherIds?: string[];
  },
): TimetableChangeEvent {
  const nowIso = new Date().toISOString();
  const nextVersion = (typeof db.timetableVersion === 'number' ? db.timetableVersion : 1) + 1;
  db.timetableUpdatedAt = nowIso;
  db.timetableVersion = nextVersion;

  const teacherSet = new Set<string>(params.affectedTeacherIds || []);
  if (params.before?.teacherId) teacherSet.add(params.before.teacherId);
  if (params.after?.teacherId) teacherSet.add(params.after.teacherId);
  const affectedTeacherIds = Array.from(teacherSet).filter(Boolean);

  const event: TimetableChangeEvent = {
    id: `ttc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    version: nextVersion,
    createdAt: nowIso,
    updatedBy: params.updatedBy || 'Hệ thống',
    action: params.action,
    slotId: params.slotId,
    summary: params.summary.slice(0, 320),
    before: params.before,
    after: params.after,
    affectedTeacherIds,
    acknowledgedByTeacherIds: [],
  };

  if (!Array.isArray(db.timetableChanges)) {
    db.timetableChanges = [];
  }
  db.timetableChanges.unshift(event);
  if (db.timetableChanges.length > 120) {
    db.timetableChanges = db.timetableChanges.slice(0, 120);
  }

  // Push notification so Teacher Bell catches it even outside timetable view
  if (affectedTeacherIds.length > 0 && Array.isArray(db.notifications)) {
    db.notifications.unshift({
      id: `ntf-ttc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      createdAt: formatVnDateTime(nowIso),
      title: `Cập nhật TKB (v${nextVersion})`,
      body: event.summary,
      channel: 'APP',
      targetRole: 'TEACHER',
      read: false,
    });
    if (db.notifications.length > 150) {
      db.notifications = db.notifications.slice(0, 150);
    }
  }

  return event;
}

export interface TeacherProfileFieldDiff {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: 'Họ và tên đầy đủ',
  shortName: 'Tên hiển thị / Xưng hô',
  phone: 'Số điện thoại / Zalo',
  email: 'Email liên hệ',
  degree: 'Học vị / Bằng cấp',
  experienceYears: 'Số năm kinh nghiệm',
  subjects: 'Môn giảng dạy / Trả bài',
};

/**
 * Computes field-level Old -> New diff when a teacher self-standardizes their own profile.
 */
export function diffTeacherProfileFields(
  before: Pick<Teacher, 'name' | 'shortName' | 'phone' | 'email' | 'degree' | 'experienceYears' | 'subjects'>,
  after: Pick<Teacher, 'name' | 'shortName' | 'phone' | 'email' | 'degree' | 'experienceYears' | 'subjects'>,
): TeacherProfileFieldDiff[] {
  const diffs: TeacherProfileFieldDiff[] = [];

  const compareScalar = (field: keyof typeof PROFILE_FIELD_LABELS, oldVal: unknown, newVal: unknown) => {
    const a = String(oldVal ?? '').trim();
    const b = String(newVal ?? '').trim();
    if (a !== b) {
      diffs.push({
        field,
        label: PROFILE_FIELD_LABELS[field],
        oldValue: a || '(Trống)',
        newValue: b || '(Trống)',
      });
    }
  };

  compareScalar('name', before.name, after.name);
  compareScalar('shortName', before.shortName, after.shortName);
  compareScalar('phone', before.phone, after.phone);
  compareScalar('email', before.email, after.email);
  compareScalar('degree', before.degree, after.degree);
  compareScalar('experienceYears', `${before.experienceYears} năm`, `${after.experienceYears} năm`);

  const oldSubs = (before.subjects || []).map((s) => s.trim()).filter(Boolean).join(', ');
  const newSubs = (after.subjects || []).map((s) => s.trim()).filter(Boolean).join(', ');
  if (oldSubs !== newSubs) {
    diffs.push({
      field: 'subjects',
      label: PROFILE_FIELD_LABELS.subjects,
      oldValue: oldSubs || '(Trống)',
      newValue: newSubs || '(Trống)',
    });
  }

  return diffs;
}

/**
 * Finds all active timetable slots belonging to a teacher that are affected by a leave request.
 */
export function findAffectedSlotsForLeave(
  timetable: TimetableSlot[],
  leave: Pick<TeacherLeave, 'teacherId' | 'day' | 'period' | 'shift'>,
): TimetableSlot[] {
  return timetable.filter(
    (sl) =>
      sl.status !== 'OFF' &&
      sl.teacherId === leave.teacherId &&
      sl.day === leave.day &&
      (leave.period === 'ALL' ||
        (sl.period === leave.period && (!leave.shift || sl.shift === leave.shift))),
  );
}

/**
 * Ranks available substitute teachers for a leave request (same teacherGroup, matching subjects,
 * available on required shift keys, and zero conflicts on timetable or active leaves).
 */
export function computeSubstituteSuggestions(
  db: Pick<DatabaseState, 'teachers' | 'timetable' | 'teacherLeaves'>,
  leave: TeacherLeave,
): { affectedSlots: TimetableSlot[]; suggestions: SubstituteSuggestion[] } {
  const requestingTeacher = db.teachers.find((t) => t.id === leave.teacherId);
  const targetGroup = requestingTeacher?.teacherGroup || 'SUBJECT';
  const affectedSlots = findAffectedSlotsForLeave(db.timetable, leave);

  const requiredShiftKeys = new Set<string>();
  const requiredSubjects = new Set<string>();

  if (affectedSlots.length > 0) {
    affectedSlots.forEach((sl) => {
      requiredShiftKeys.add(makeShiftKey(sl.day, sl.period, sl.shift));
      requiredSubjects.add(normalizeLookupKey(sl.subject));
    });
  } else if (leave.period !== 'ALL') {
    if (leave.shift) {
      requiredShiftKeys.add(makeShiftKey(leave.day, leave.period, leave.shift));
    } else {
      requiredShiftKeys.add(makeShiftKey(leave.day, leave.period, 'CA_1'));
      requiredShiftKeys.add(makeShiftKey(leave.day, leave.period, 'CA_2'));
    }
  } else {
    (['SANG', 'CHIEU', 'TOI'] as SessionPeriod[]).forEach((p) => {
      requiredShiftKeys.add(makeShiftKey(leave.day, p, 'CA_1'));
      requiredShiftKeys.add(makeShiftKey(leave.day, p, 'CA_2'));
    });
  }

  const suggestions: SubstituteSuggestion[] = [];

  for (const candidate of db.teachers) {
    if (candidate.id === leave.teacherId) continue;
    if (candidate.status !== 'ACTIVE') continue;

    // Check timetable conflicts on required shifts
    let conflictCount = 0;
    for (const shiftKey of requiredShiftKeys) {
      const [d, p, s] = shiftKey.split('_') as [DayOfWeek, SessionPeriod, ShiftCode];
      const hasSlot = db.timetable.some(
        (sl) =>
          sl.status !== 'OFF' &&
          sl.teacherId === candidate.id &&
          sl.day === d &&
          sl.period === p &&
          sl.shift === s,
      );
      if (hasSlot) conflictCount++;

      const hasLeave = db.teacherLeaves.some(
        (lv) =>
          lv.id !== leave.id &&
          lv.status !== 'REJECTED' &&
          lv.teacherId === candidate.id &&
          lv.day === d &&
          (lv.period === 'ALL' || (lv.period === p && (!lv.shift || lv.shift === s))),
      );
      if (hasLeave) conflictCount++;
    }

    const availSet = new Set(candidate.availability || []);
    const availableForAllShifts =
      availSet.size === 0 || Array.from(requiredShiftKeys).every((k) => availSet.has(k));

    const candSubjectKeys = (candidate.subjects || []).map((sub) => normalizeLookupKey(sub));
    const subjectMatch =
      requiredSubjects.size === 0 ||
      Array.from(requiredSubjects).some((reqSub) =>
        candSubjectKeys.some((cs) => cs.includes(reqSub) || reqSub.includes(cs)),
      );

    const sameGroup = candidate.teacherGroup === targetGroup;

    let score = 0;
    const reasons: string[] = [];

    if (sameGroup) {
      score += 40;
      reasons.push(targetGroup === 'TUTOR_REVIEW' ? 'Cùng nhóm GV Trả bài' : 'Cùng nhóm GV Bộ môn');
    } else {
      reasons.push('Khác nhóm chuyên môn (dự phòng)');
    }

    if (subjectMatch) {
      score += 35;
      reasons.push('Đúng môn phụ trách');
    }

    if (conflictCount === 0) {
      score += 20;
      reasons.push('0 xung đột lịch dạy');
    } else {
      score -= conflictCount * 30;
      reasons.push(`Đang trùng ${conflictCount} ca`);
    }

    if (availableForAllShifts) {
      score += 15;
      reasons.push('Đang đăng ký Rảnh ca này');
    } else {
      score -= 10;
      reasons.push('Đánh dấu Bận trên lịch tuần');
    }

    suggestions.push({
      teacherId: candidate.id,
      teacherName: candidate.name,
      shortName: candidate.shortName,
      teacherGroup: candidate.teacherGroup,
      subjects: candidate.subjects || [],
      phone: candidate.phone,
      email: candidate.email,
      score: Math.max(0, Math.min(100, score)),
      subjectMatch,
      availableForAllShifts,
      conflictCount,
      reasons,
    });
  }

  suggestions.sort((a, b) => {
    if (a.conflictCount !== b.conflictCount) return a.conflictCount - b.conflictCount;
    if (b.score !== a.score) return b.score - a.score;
    return a.shortName.localeCompare(b.shortName, 'vi');
  });

  return { affectedSlots, suggestions };
}

/**
 * Builds ready-to-send Zalo & Email cancellation notice for affected parents/students
 * when no substitute teacher is available.
 */
export function buildParentClassCancelNotice(params: {
  leave: TeacherLeave;
  affectedSlots: TimetableSlot[];
  students: Student[];
  siteConfig?: Partial<SiteConfig>;
}): {
  affectedStudents: Student[];
  affectedClasses: string[];
  zaloMessage: string;
  emailSubject: string;
  emailBody: string;
  parentPhones: string[];
  parentEmails: string[];
} {
  const centerName = params.siteConfig?.centerName || 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ';
  const hotline = params.siteConfig?.hotlineZalo || '0987 405 186';
  const classSet = new Set<string>(params.affectedSlots.map((s) => s.centerClass));
  const affectedClasses = Array.from(classSet);

  const affectedStudents = params.students.filter(
    (st) =>
      st.status === 'ACTIVE' &&
      affectedClasses.some((cls) => studentBelongsToClass(st, cls)),
  );

  const slotLines = params.affectedSlots
    .map(
      (s) =>
        `• ${formatShiftLabel(s.day, s.period, s.shift)} (${s.timeRange}) — Lớp ${s.centerClass} · Môn ${s.subject} (${s.room})`,
    )
    .join('\n');

  const shiftDesc =
    params.leave.period === 'ALL'
      ? `Cả ngày ${DAY_LABELS[params.leave.day]} (${params.leave.dateLabel})`
      : `${DAY_LABELS[params.leave.day]} (${params.leave.dateLabel}) · ${PERIOD_LABELS[params.leave.period]}${params.leave.shift ? ` ${SHIFT_LABELS[params.leave.shift]}` : ''}`;

  const zaloMessage = [
    `[THÔNG BÁO NGHỈ BUỔI HỌC — ${centerName}]`,
    `Kính gửi Quý Phụ huynh và các em Học sinh${affectedClasses.length > 0 ? ` (${affectedClasses.join(', ')})` : ''},`,
    `Do ${params.leave.teacherName} có việc đột xuất (${params.leave.reason}) và chưa bố trí kịp giáo viên thay thế, Trung tâm xin trân trọng thông báo TẠM NGHỈ buổi học sau để Quý Phụ huynh chủ động không đưa các em đến lớp:`,
    slotLines || `• ${shiftDesc}`,
    `Trung tâm sẽ sắp xếp lịch học bù phù hợp và thông báo lại trên Cổng Phụ huynh daythemnhantri.com.`,
    `Trân trọng cảm ơn! Hotline/Zalo hỗ trợ: ${hotline}.`,
  ].join('\n\n');

  const emailSubject = `[Nhân Trí] Thông báo tạm nghỉ buổi học ${shiftDesc}${affectedClasses.length > 0 ? ` — ${affectedClasses.join(', ')}` : ''}`;

  const parentPhones = Array.from(
    new Set(affectedStudents.map((s) => s.parentPhone).filter((p) => p && p.length >= 8)),
  );
  const parentEmails = Array.from(
    new Set(
      affectedStudents.flatMap((s) => s.parentEmails || []).filter((e) => e && e.includes('@')),
    ),
  );

  return {
    affectedStudents,
    affectedClasses,
    zaloMessage,
    emailSubject,
    emailBody: zaloMessage,
    parentPhones,
    parentEmails,
  };
}

/**
 * Formats a concise, phone-friendly text summary of a teacher's latest schedule for Zalo & Email sharing.
 */
export function buildTeacherScheduleShareText(params: {
  teacher: Teacher;
  slots: TimetableSlot[];
  timetableUpdatedAt?: string;
  siteConfig?: Partial<SiteConfig>;
}): string {
  const centerName = params.siteConfig?.centerName || 'TRUNG TÂM NHÂN TRÍ';
  const domain = params.siteConfig?.domain || 'daythemnhantri.com';
  const groupLabel = params.teacher.teacherGroup === 'TUTOR_REVIEW' ? 'Giáo viên Trả bài' : 'Giáo viên Bộ môn';
  const dayOrder: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const periodOrder: SessionPeriod[] = ['SANG', 'CHIEU', 'TOI'];

  const activeSlots = params.slots
    .filter((s) => s.status !== 'OFF')
    .sort((a, b) => {
      const d = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      if (d !== 0) return d;
      const p = periodOrder.indexOf(a.period) - periodOrder.indexOf(b.period);
      if (p !== 0) return p;
      return a.shift.localeCompare(b.shift);
    });

  const lines: string[] = [
    `LỊCH LÊN LỚP CÁ NHÂN — ${centerName}`,
    `${groupLabel}: ${params.teacher.name} (${params.teacher.shortName})`,
    `Cập nhật mới nhất: ${formatVnDateTime(params.timetableUpdatedAt)} · Tổng: ${activeSlots.length} ca/tuần`,
    '----------------------------------',
  ];

  if (activeSlots.length === 0) {
    lines.push('Hiện chưa có ca phân công trong tuần này.');
  } else {
    dayOrder.forEach((d) => {
      const daySlots = activeSlots.filter((s) => s.day === d);
      if (daySlots.length === 0) return;
      lines.push(`${DAY_LABELS[d].toUpperCase()}:`);
      daySlots.forEach((s) => {
        const statusTag =
          s.status === 'TEACHER_ABSENT'
            ? ' [BÁO NGHỈ]'
            : s.status === 'SUBSTITUTED'
              ? ' [DẠY THAY]'
              : '';
        lines.push(
          `  • ${PERIOD_LABELS[s.period]} ${SHIFT_LABELS[s.shift]} (${s.timeRange}) | ${s.centerClass} · ${s.subject} · ${s.room} (${SLOT_TYPE_LABELS[s.slotType]})${statusTag}`,
        );
      });
    });
  }

  lines.push('----------------------------------');
  lines.push(`Xem & đồng bộ trực tuyến: https://${domain}`);
  return lines.join('\n');
}

/**
 * Generates a crisp 2x Retina PNG image of the teacher's weekly timetable via native HTML5 Canvas 2D
 * (works 100% offline on iOS/Android mobile browsers without html2canvas dependency issues).
 */
export async function renderTeacherSchedulePngDataUrl(params: {
  teacher: Teacher;
  slots: TimetableSlot[];
  timetableUpdatedAt?: string;
  siteConfig?: Partial<SiteConfig>;
  logoUrl?: string;
}): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas chỉ khả dụng trên trình duyệt.');
  }

  const width = 1240;
  const days: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const rows: { period: SessionPeriod; shift: ShiftCode; label: string; time: string }[] = [
    { period: 'SANG', shift: 'CA_1', label: 'Sáng · Ca 1', time: '07:30–09:00' },
    { period: 'SANG', shift: 'CA_2', label: 'Sáng · Ca 2', time: '09:15–10:45' },
    { period: 'CHIEU', shift: 'CA_1', label: 'Chiều · Ca 1', time: '14:00–15:30' },
    { period: 'CHIEU', shift: 'CA_2', label: 'Chiều · Ca 2', time: '15:45–17:15' },
    { period: 'TOI', shift: 'CA_1', label: 'Tối · Ca 1', time: '18:00–19:30' },
    { period: 'TOI', shift: 'CA_2', label: 'Tối · Ca 2', time: '19:45–21:15' },
  ];

  const headerH = 156;
  const colHeadH = 44;
  const rowH = 112;
  const footerH = 64;
  const height = headerH + colHeadH + rows.length * rowH + footerH + 36;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không khởi tạo được bộ vẽ ảnh Canvas 2D.');
  ctx.scale(scale, scale);

  // Canvas backdrop
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  // Header band
  ctx.fillStyle = '#1E3A8A';
  ctx.fillRect(0, 0, width, headerH);

  // Draw Brand Logo if available
  const drawLogoSafe = async () => {
    if (!params.logoUrl) return false;
    return new Promise<boolean>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(72, 78, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(72, 78, 38, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 34, 40, 76, 76);
        ctx.restore();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = params.logoUrl!;
    });
  };
  const drewLogo = await drawLogoSafe();
  if (!drewLogo) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(72, 78, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NT', 72, 88);
    ctx.textAlign = 'left';
  }

  const centerName = params.siteConfig?.centerName || 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ';
  const groupLabel = params.teacher.teacherGroup === 'TUTOR_REVIEW' ? 'GIÁO VIÊN TRẢ BÀI' : 'GIÁO VIÊN BỘ MÔN';
  const activeCount = params.slots.filter((s) => s.status !== 'OFF').length;

  ctx.fillStyle = '#BFDBFE';
  ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${centerName}  ·  ${groupLabel}`, 132, 46);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`THỜI KHÓA BIỂU: ${params.teacher.name.toUpperCase()}`, 132, 84);

  ctx.fillStyle = '#E0E7FF';
  ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Cập nhật mới nhất: ${formatVnDateTime(params.timetableUpdatedAt)}   |   Tổng: ${activeCount} ca/tuần   |   Phòng mặc định: ${params.teacher.roomDefault}`,
    132,
    116,
  );

  // Subtle watermark diagonally in grid area
  ctx.save();
  ctx.translate(width / 2, headerH + (rows.length * rowH) / 2);
  ctx.rotate(-0.24);
  ctx.fillStyle = 'rgba(30, 58, 138, 0.045)';
  ctx.font = 'bold 64px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NHÂN TRÍ · DAYTHEMNHANTRI.COM', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // Grid geometry
  const padX = 28;
  const gridTop = headerH + 18;
  const leftColW = 148;
  const dayColW = (width - padX * 2 - leftColW) / days.length;

  // Table outer card
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(padX, gridTop, width - padX * 2, colHeadH + rows.length * rowH);
  ctx.strokeRect(padX, gridTop, width - padX * 2, colHeadH + rows.length * rowH);

  // Column header row
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(padX, gridTop, width - padX * 2, colHeadH);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CA / KHUNG GIỜ', padX + 14, gridTop + 27);

  days.forEach((d, idx) => {
    const x = padX + leftColW + idx * dayColW;
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridTop + colHeadH + rows.length * rowH);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(DAY_LABELS[d], x + dayColW / 2, gridTop + 28);
  });
  ctx.textAlign = 'left';

  // Helper to clip/wrap text neatly
  const drawClipped = (text: string, x: number, y: number, maxW: number) => {
    let out = text;
    while (ctx.measureText(out).width > maxW && out.length > 3) {
      out = out.slice(0, -1);
    }
    if (out !== text) out = `${out.slice(0, -1)}…`;
    ctx.fillText(out, x, y);
  };

  // Draw rows & cells
  rows.forEach((r, rIdx) => {
    const y = gridTop + colHeadH + rIdx * rowH;

    // Horizontal divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();

    // Left shift column
    ctx.fillStyle = r.period === 'SANG' ? '#EFF6FF' : r.period === 'CHIEU' ? '#FFFBEB' : '#F5F3FF';
    ctx.fillRect(padX + 1, y + 1, leftColW - 2, rowH - 2);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(r.label, padX + 14, y + 46);

    ctx.fillStyle = '#475569';
    ctx.font = '600 13px monospace';
    ctx.fillText(r.time, padX + 14, y + 70);

    // Day cells
    days.forEach((d, dIdx) => {
      const cellX = padX + leftColW + dIdx * dayColW;
      const matching = params.slots.filter(
        (sl) => sl.day === d && sl.period === r.period && sl.shift === r.shift,
      );
      if (matching.length === 0) return;

      const sl = matching[0];
      const boxX = cellX + 7;
      const boxY = y + 8;
      const boxW = dayColW - 14;
      const boxH = rowH - 16;

      let bg = '#EFF6FF';
      let border = '#93C5FD';
      let accent = '#1E3A8A';

      if (sl.status === 'OFF') {
        bg = '#F1F5F9';
        border = '#CBD5E1';
        accent = '#64748B';
      } else if (sl.status === 'TEACHER_ABSENT') {
        bg = '#FEF2F2';
        border = '#FCA5A5';
        accent = '#B91C1C';
      } else if (sl.status === 'SUBSTITUTED') {
        bg = '#FFFBEB';
        border = '#FCD34D';
        accent = '#B45309';
      } else if (sl.slotType === 'TRA_BAI') {
        bg = '#ECFDF5';
        border = '#6EE7B7';
        accent = '#047857';
      }

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = accent;
      ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
      drawClipped(sl.centerClass, boxX + 10, boxY + 24, boxW - 20);

      ctx.fillStyle = '#0F172A';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      drawClipped(sl.subject, boxX + 10, boxY + 46, boxW - 20);

      ctx.fillStyle = '#334155';
      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      drawClipped(`${sl.room} · ${SLOT_TYPE_LABELS[sl.slotType]}`, boxX + 10, boxY + 66, boxW - 20);

      ctx.fillStyle = accent;
      ctx.font = '600 11px monospace';
      const statusTxt =
        sl.status === 'OFF'
          ? 'TẠM NGHỈ'
          : sl.status === 'TEACHER_ABSENT'
            ? 'ĐÃ BÁO NGHỈ'
            : sl.status === 'SUBSTITUTED'
              ? 'DẠY THAY'
              : sl.timeRange;
      drawClipped(statusTxt, boxX + 10, boxY + 86, boxW - 20);
    });
  });

  // Footer
  const footY = gridTop + colHeadH + rows.length * rowH + 34;
  ctx.fillStyle = '#475569';
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `${params.siteConfig?.domain || 'daythemnhantri.com'}  ·  Hotline/Zalo: ${params.siteConfig?.hotlineZalo || '0987 405 186'}  ·  Trao tri thức — Gửi yêu thương`,
    padX,
    footY,
  );

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Plays a gentle two-tone chime using Web Audio API when timetable changes are detected.
 */
export function playGentleScheduleChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    playTone(659.25, now, 0.22); // E5
    playTone(880.0, now + 0.16, 0.34); // A5
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);
  } catch {
    // Ignore autoplay restriction errors silently
  }
}
