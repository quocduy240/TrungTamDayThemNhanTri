import type { AuthPolicy, Student } from '../types';

export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  allowParentPhoneLogin: true,
  requireParentPinOrCode: true,
  allowParentGmailLogin: true,
  allowStudentCodeLogin: true,
  requirePhoneLast4ForStudentCode: false,
  allowStudentParentPhoneLogin: true,
  allowStudentParentGmailLogin: true,
  allowStudentPersonalGmail: true,
  minGradeForPersonalGmail: 8,
  requireAuthForClassroom: true,
  allowDemoPreview: true,
};

/**
 * Normalize Vietnamese phone numbers to standard 10-digit leading-zero format (e.g. +84918204412 -> 0918204412).
 */
export function normalizePhoneVN(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

/**
 * Mask a phone number for non-staff / public display (0918204412 -> 0918 *** 412).
 */
export function maskPhoneVN(raw?: string | null): string {
  const digits = normalizePhoneVN(raw);
  if (digits.length < 7) return raw || '';
  return `${digits.slice(0, 4)} *** ${digits.slice(-3)}`;
}

/**
 * Check if a student is eligible to sign in with a personal Gmail address under current SuperAdmin policy.
 */
export function canStudentUsePersonalGmail(
  student: Pick<Student, 'grade' | 'allowPersonalGmailOverride'>,
  policy: AuthPolicy = DEFAULT_AUTH_POLICY,
): boolean {
  if (!policy.allowStudentPersonalGmail) return false;
  if (student.allowPersonalGmailOverride) return true;
  return Number(student.grade) >= Number(policy.minGradeForPersonalGmail || 8);
}

/**
 * Generate a 6-digit family access PIN (must only be called inside a request/click handler).
 */
export function generateAccessPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Build a ready-to-paste Zalo message for Admin / Cô Tâm to send login credentials to parents.
 */
export function buildZaloAccessCardText(student: Student, domain = 'daythemnhantri.com'): string {
  const phoneDisplay = normalizePhoneVN(student.parentPhone) || student.parentPhone;
  const lines = [
    `[THẺ ĐĂNG NHẬP — TRUNG TÂM DẠY THÊM NHÂN TRÍ]`,
    `Website: https://${domain}`,
    `Học sinh: ${student.fullName} (${student.centerClass} · ${student.school})`,
    `• Mã số học sinh: ${student.code}`,
    student.parentLinkCode ? `• Mã liên kết nhanh: ${student.parentLinkCode}` : '',
    `• SĐT Phụ huynh đã đăng ký: ${phoneDisplay}`,
    student.accessPin ? `• Mã PIN gia đình: ${student.accessPin}` : '',
    student.parentEmails && student.parentEmails.length > 0
      ? `• Gmail Phụ huynh: ${student.parentEmails.join(', ')}`
      : '',
    student.studentEmail ? `• Gmail học sinh: ${student.studentEmail}` : '',
    ``,
    `Hướng dẫn:`,
    `1) Phụ huynh vào mục "Phụ huynh" -> nhập SĐT + Mã PIN (hoặc đăng nhập Gmail đã đăng ký) để xem Học bạ, điểm danh & đóng học phí VietQR.`,
    `2) Học sinh vào mục "Vào lớp (GV & HS)" -> nhập Mã số học sinh (${student.code}) hoặc SĐT/Gmail phụ huynh để xem TKB & luyện đề GDPT 2018.`,
    `Cần hỗ trợ vui lòng nhắn Zalo Cô Tâm: 0947 376 444.`,
  ].filter(Boolean);
  return lines.join('\n');
}
