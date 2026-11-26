import {
  findSlotsStartingWithinWindow,
  getVietnamClock,
  type VietnamClock,
} from './quickClassEngine.ts';
import { studentBelongsToClass } from './timetableEngine.ts';
import type {
  AuthUser,
  DatabaseState,
  NotificationChannel,
  NotificationSystemConfig,
  ReminderDispatchLog,
  TimetableSlot,
  UserNotificationPreference,
} from '../types.ts';

export function validateWebhookUrl(raw?: string): { ok: true; url?: string } | { ok: false; error: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { ok: true, url: '' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Webhook URL bắt buộc sử dụng giao thức HTTPS.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return { ok: false, error: 'Webhook URL không được trỏ tới địa chỉ nội bộ (SSRF protection).' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: 'Định dạng Webhook URL không hợp lệ.' };
  }
}

export function resolvePrefKey(user: AuthUser): string {
  if (user.role === 'STUDENT' && user.linkedStudentId) return `student:${user.linkedStudentId}`;
  if (user.role === 'TEACHER' && user.linkedTeacherId) return `teacher:${user.linkedTeacherId}`;
  return `user:${user.id}`;
}

export function getOrBuildUserNotificationPref(
  db: DatabaseState,
  user: AuthUser,
): UserNotificationPreference {
  const key = resolvePrefKey(user);
  const existing = (db.notificationPrefs || []).find(
    (p) => p.userId === key || p.userId === user.id,
  );
  if (existing) return existing;

  let zaloPhone = '';
  let email = user.email && user.email.includes('@') ? user.email : '';
  if (user.linkedStudentId) {
    const st = db.students.find((s) => s.id === user.linkedStudentId);
    if (st) {
      zaloPhone = st.parentZalo || st.parentPhone || '';
      email = st.studentEmail || st.parentEmails?.[0] || email;
    }
  } else if (user.linkedTeacherId) {
    const tc = db.teachers.find((t) => t.id === user.linkedTeacherId);
    if (tc) {
      zaloPhone = tc.phone || '';
      email = tc.email || email;
    }
  }

  return {
    userId: key,
    role: user.role,
    displayName: user.name,
    enabled: true,
    leadMinutes: db.notificationConfig?.leadMinutes || 10,
    channels: {
      WEB: true,
      ZALO: Boolean(zaloPhone),
      EMAIL: Boolean(email),
      FACEBOOK: false,
    },
    zaloPhone,
    email,
    facebookPsid: '',
    updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

export function renderReminderMessage(
  template: string,
  slot: TimetableSlot,
  recipientName: string,
  minutesUntil: number,
): string {
  const base =
    template && template.trim()
      ? template
      : '[Nhân Trí] Còn {{minutes}} phút tới giờ {{subject}} ({{timeRange}}) tại {{room}} · {{className}} · GV: {{teacher}}.';
  return base
    .replace(/\{\{minutes\}\}/g, String(Math.max(1, minutesUntil)))
    .replace(/\{\{subject\}\}/g, slot.subject)
    .replace(/\{\{timeRange\}\}/g, slot.timeRange)
    .replace(/\{\{room\}\}/g, slot.room)
    .replace(/\{\{className\}\}/g, slot.centerClass)
    .replace(/\{\{teacher\}\}/g, slot.teacherName)
    .replace(/\{\{recipient\}\}/g, recipientName);
}

async function postWebhookSafely(
  url: string,
  payload: Record<string, unknown>,
  apiKeyHint?: string,
): Promise<{ ok: boolean; statusText: string }> {
  const checked = validateWebhookUrl(url);
  if (!checked.ok || !checked.url) {
    return { ok: false, statusText: 'Webhook chưa cấu hình hoặc URL không hợp lệ' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'NhanTri-Reminder-Dispatcher/1.0',
    };
    if (apiKeyHint && apiKeyHint.trim()) {
      headers['X-NhanTri-Key'] = apiKeyHint.trim();
    }
    const res = await fetch(checked.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      statusText: res.ok ? `Webhook HTTP ${res.status}` : `Webhook lỗi HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Timeout kết nối webhook';
    return { ok: false, statusText: msg };
  } finally {
    clearTimeout(timer);
  }
}

export interface DispatchUpcomingOptions {
  now?: Date;
  forceSlotId?: string;
  dryRun?: boolean;
  triggeredBy?: string;
}

export interface DispatchUpcomingResult {
  clock: VietnamClock;
  matchedSlotsCount: number;
  dispatchedCount: number;
  logs: ReminderDispatchLog[];
}

export async function dispatchUpcomingReminders(
  db: DatabaseState,
  opts: DispatchUpcomingOptions = {},
): Promise<DispatchUpcomingResult> {
  const config: NotificationSystemConfig = db.notificationConfig;
  const clock = getVietnamClock(opts.now);
  const nowStr = `${clock.isoDate} ${String(Math.floor(clock.minutesOfDay / 60)).padStart(2, '0')}:${String(clock.minutesOfDay % 60).padStart(2, '0')}`;

  let targets: Array<{ slot: TimetableSlot; minutesUntil: number }> = [];

  if (opts.forceSlotId) {
    const found = db.timetable.find((s) => s.id === opts.forceSlotId);
    if (found) {
      targets = [{ slot: found, minutesUntil: config.leadMinutes || 10 }];
    }
  } else {
    targets = findSlotsStartingWithinWindow(db.timetable, config.leadMinutes || 10, opts.now);
  }

  // Fallback for manual CMS trigger when no slot starts in exact T-10m window: pick next scheduled slot today or first active slot so Admin can preview real dispatch
  if (targets.length === 0 && opts.triggeredBy === 'MANUAL_TEST') {
    const firstActive = db.timetable.find((s) => s.status !== 'OFF');
    if (firstActive) {
      targets = [{ slot: firstActive, minutesUntil: config.leadMinutes || 10 }];
    }
  }

  const newLogs: ReminderDispatchLog[] = [];
  if (!Array.isArray(db.reminderDispatchLogs)) db.reminderDispatchLogs = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];

  for (const { slot, minutesUntil } of targets) {
    const recipients: Array<{
      key: string;
      role: 'TEACHER' | 'STUDENT';
      name: string;
      pref?: UserNotificationPreference;
      defaultPhone?: string;
      defaultEmail?: string;
    }> = [];

    const teacher = db.teachers.find((t) => t.id === slot.teacherId);
    if (teacher) {
      const key = `teacher:${teacher.id}`;
      const pref = (db.notificationPrefs || []).find((p) => p.userId === key);
      recipients.push({
        key,
        role: 'TEACHER',
        name: teacher.name,
        pref,
        defaultPhone: teacher.phone,
        defaultEmail: teacher.email,
      });
    }

    const classStudents = db.students.filter(
      (st) => st.status === 'ACTIVE' && studentBelongsToClass(st, slot.centerClass),
    );
    for (const st of classStudents) {
      const key = `student:${st.id}`;
      const pref = (db.notificationPrefs || []).find((p) => p.userId === key);
      recipients.push({
        key,
        role: 'STUDENT',
        name: st.fullName,
        pref,
        defaultPhone: st.parentZalo || st.parentPhone,
        defaultEmail: st.studentEmail || st.parentEmails?.[0],
      });
    }

    for (const r of recipients) {
      if (r.pref && !r.pref.enabled) continue;

      const enabledChannels: NotificationChannel[] = [];
      const userChannels = r.pref?.channels || {
        WEB: true,
        ZALO: Boolean(r.defaultPhone),
        EMAIL: Boolean(r.defaultEmail),
        FACEBOOK: false,
      };
      if (config.channelsEnabled.WEB && userChannels.WEB) enabledChannels.push('WEB');
      if (config.channelsEnabled.ZALO && userChannels.ZALO) enabledChannels.push('ZALO');
      if (config.channelsEnabled.EMAIL && userChannels.EMAIL) enabledChannels.push('EMAIL');
      if (config.channelsEnabled.FACEBOOK && userChannels.FACEBOOK) enabledChannels.push('FACEBOOK');

      const message = renderReminderMessage(config.messageTemplate, slot, r.name, minutesUntil);
      const slotLabel = `${slot.centerClass} · ${slot.subject} · ${slot.room} (${slot.timeRange})`;

      for (const ch of enabledChannels) {
        let status: ReminderDispatchLog['status'] = 'SENT';
        let detail = 'Đã phát thông báo nhắc lịch trên Web/App.';

        if (ch === 'WEB') {
          db.notifications.unshift({
            id: `ntf-rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: nowStr,
            title: `Sắp vào lớp sau ${minutesUntil} phút · ${slot.room}`,
            body: message,
            channel: 'APP',
            targetRole: r.role,
            read: false,
          });
        } else {
          const webhookUrl =
            (ch === 'ZALO' && config.zaloWebhookUrl) ||
            (ch === 'EMAIL' && config.emailWebhookUrl) ||
            (ch === 'FACEBOOK' && config.facebookWebhookUrl) ||
            config.unifiedWebhookUrl ||
            '';

          if (!webhookUrl) {
            status = 'SIMULATED';
            detail = `Chưa gắn Webhook ${ch} — đã ghi nhận hàng đợi & hiển thị Web.`;
          } else if (opts.dryRun) {
            status = 'SIMULATED';
            detail = `Chế độ kiểm thử khô (Dry-run) tới ${ch}.`;
          } else {
            const res = await postWebhookSafely(
              webhookUrl,
              {
                event: 'PRE_CLASS_REMINDER',
                channel: ch,
                leadMinutes: minutesUntil,
                recipientName: r.name,
                recipientRole: r.role,
                phone: r.pref?.zaloPhone || r.defaultPhone || '',
                email: r.pref?.email || r.defaultEmail || '',
                facebookPsid: r.pref?.facebookPsid || '',
                slot: {
                  id: slot.id,
                  day: slot.day,
                  period: slot.period,
                  shift: slot.shift,
                  timeRange: slot.timeRange,
                  centerClass: slot.centerClass,
                  subject: slot.subject,
                  room: slot.room,
                  teacherName: slot.teacherName,
                },
                message,
                sentAt: new Date().toISOString(),
              },
              ch === 'ZALO' ? config.zaloOaId : undefined,
            );
            status = res.ok ? 'SENT' : 'FAILED';
            detail = res.statusText;
          }
        }

        const logEntry: ReminderDispatchLog = {
          id: `rdl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sentAt: nowStr,
          slotId: slot.id,
          slotLabel,
          recipientName: r.name,
          recipientRole: r.role,
          channel: ch,
          status,
          detail,
        };
        newLogs.push(logEntry);
        db.reminderDispatchLogs.unshift(logEntry);
      }
    }
  }

  if (db.reminderDispatchLogs.length > 150) {
    db.reminderDispatchLogs = db.reminderDispatchLogs.slice(0, 150);
  }
  if (db.notifications.length > 100) {
    db.notifications = db.notifications.slice(0, 100);
  }

  return {
    clock,
    matchedSlotsCount: targets.length,
    dispatchedCount: newLogs.length,
    logs: newLogs,
  };
}
