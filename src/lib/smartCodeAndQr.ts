import QRCode from 'qrcode';

/**
 * Normalizes a Vietnamese center class string into a clean alphanumeric code segment.
 * Examples:
 *  - "Lớp 7A1" -> "7A1"
 *  - "Lớp 4,5" -> "45"
 *  - "Lớp 12"  -> "12"
 *  - "7 NC"    -> "7NC"
 */
export function normalizeClassCodeSegment(centerClass: string, fallbackGrade?: number): string {
  const raw = String(centerClass || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\blop\b/gi, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6);

  if (raw.length > 0) return raw;
  if (fallbackGrade && fallbackGrade >= 1 && fallbackGrade <= 12) {
    return String(fallbackGrade);
  }
  return 'NT';
}

/**
 * Generates a collision-free Smart Student Code following the confirmed Nhân Trí format:
 *   NT + Năm (2 chữ số) + Lớp + STT (3 chữ số)
 * Example: NT26-7A1-001
 */
export function generateSmartStudentCode(
  centerClass: string,
  existingCodes: Iterable<string>,
  options?: { yearSuffix?: string; fallbackGrade?: number },
): string {
  const year =
    options?.yearSuffix && /^\d{2}$/.test(options.yearSuffix)
      ? options.yearSuffix
      : String(new Date().getFullYear()).slice(-2);
  const classSeg = normalizeClassCodeSegment(centerClass, options?.fallbackGrade);
  const prefix = `NT${year}-${classSeg}-`;

  const existingSet = new Set<string>();
  let maxSeq = 0;

  for (const code of existingCodes) {
    const upper = String(code || '').trim().toUpperCase();
    if (!upper) continue;
    existingSet.add(upper);
    if (upper.startsWith(prefix)) {
      const tail = upper.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  let seq = maxSeq + 1;
  let candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  while (existingSet.has(candidate)) {
    seq += 1;
    candidate = `${prefix}${String(seq).padStart(3, '0')}`;
  }
  return candidate;
}

/**
 * Generates an unguessable URL-safe dynamic QR token for a student record.
 * Compatible with Browser, Node 20+, and Cloudflare Workers Web Crypto API.
 */
export function generateQrToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(14);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let token = 'ntq_';
  for (let i = 0; i < bytes.length; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}

/**
 * Deterministic fallback QR token for seeded/legacy student records so QR codes stay valid across restarts.
 */
export function buildDeterministicQrToken(studentId: string, studentCode: string): string {
  const seed = `${studentId}|${studentCode}|nhantri2026`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i * 31;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const partA = h1.toString(36).padStart(7, '0');
  const partB = h2.toString(36).padStart(7, '0');
  return `ntq_${partA}${partB}`.slice(0, 18);
}

/**
 * Builds the live Dynamic QR URL pointing to the current deployment origin.
 */
export function buildStudentQrUrl(qrToken: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://daythemnhantri.com');
  return `${base.replace(/\/+$/, '')}/?qr=${encodeURIComponent(qrToken)}`;
}

/**
 * Parses either a full Dynamic QR URL (`https://.../?qr=ntq_xxx`), a raw token (`ntq_xxx`),
 * or a Student Code (`NT26-7A1-001`) scanned by a camera.
 */
export function parseScannedQrPayload(rawText: string): {
  kind: 'QR_TOKEN' | 'STUDENT_CODE' | 'UNKNOWN';
  value: string;
} {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return { kind: 'UNKNOWN', value: '' };

  if (trimmed.includes('?qr=') || trimmed.includes('&qr=')) {
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get('qr')?.trim();
      if (q) return { kind: 'QR_TOKEN', value: q };
    } catch {
      const m = trimmed.match(/[?&]qr=([^&#]+)/i);
      if (m?.[1]) return { kind: 'QR_TOKEN', value: decodeURIComponent(m[1]).trim() };
    }
  }

  if (/^ntq_[a-zA-Z0-9_-]{6,40}$/.test(trimmed)) {
    return { kind: 'QR_TOKEN', value: trimmed };
  }

  if (/^NT[0-9A-Z\-]{3,28}$/i.test(trimmed)) {
    return { kind: 'STUDENT_CODE', value: trimmed.toUpperCase() };
  }

  return { kind: 'UNKNOWN', value: trimmed };
}

/**
 * Renders a crisp high-contrast PNG Data URL for offline / print / card embedding.
 */
export async function renderQrDataUrl(text: string, width = 280): Promise<string> {
  return QRCode.toDataURL(text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
