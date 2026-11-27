import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import type { AuthUser, UserRole } from '../src/types.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export const SUPER_ADMIN_EMAIL = 'duyweb5@gmail.com';
export const ADMIN_EMAIL = 'lethituman2021@gmail.com';
export const ADMIN_EMAIL_SECONDARY = 'trungtamnhantri2026@gmail.com';
export const ADMIN_EMAILS: readonly string[] = [ADMIN_EMAIL, ADMIN_EMAIL_SECONDARY];

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export const DEMO_ACCOUNTS: Record<UserRole, AuthUser> = {
  SUPER_ADMIN: {
    id: 'usr-super-admin',
    name: 'SuperAdmin Hệ thống Nhân Trí',
    email: SUPER_ADMIN_EMAIL,
    role: 'SUPER_ADMIN',
  },
  ADMIN: {
    id: 'usr-admin',
    name: 'Admin Quản trị Vận hành (Cô Mẫn)',
    email: ADMIN_EMAIL,
    role: 'ADMIN',
  },
  MANAGER: {
    id: 'usr-manager',
    name: 'Người quản lý Học vụ (Cô Tâm)',
    email: 'quanly@daythemnhantri.com',
    role: 'MANAGER',
  },
  TEACHER: {
    id: 'usr-teacher',
    name: 'Cô Nguyễn Thị Mẫn (GV Toán)',
    email: 'co.man@daythemnhantri.com',
    role: 'TEACHER',
    linkedTeacherId: 't-man',
  },
  PARENT: {
    id: 'usr-parent',
    name: 'Anh Nguyễn Văn Phúc (PH em Hòa & Quế Anh)',
    email: 'ph.phuchoa@gmail.com',
    role: 'PARENT',
    linkedStudentId: 'st-01',
    linkedStudentIds: ['st-01', 'st-11'],
  },
  STUDENT: {
    id: 'usr-student',
    name: 'Nguyễn Phúc Hòa (Lớp 6A1)',
    email: 'hoanp.6a1@daythemnhantri.com',
    role: 'STUDENT',
    linkedStudentId: 'st-01',
    linkedStudentIds: ['st-01'],
  },
};

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ uid: string; email: string; emailVerified: boolean; displayName: string; photoURL?: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: {
        localId: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        photoUrl?: string;
      }[];
    };
    const u = data.users?.[0];
    if (!u || !u.email) return null;
    return {
      uid: u.localId,
      email: u.email.toLowerCase(),
      emailVerified: Boolean(u.emailVerified),
      displayName: u.displayName || u.email.split('@')[0],
      photoURL: u.photoUrl,
    };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (hashBuffer.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, keyBuffer);
}

export function signSessionToken(user: AuthUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 12,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): AuthUser | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      photoURL: parsed.photoURL,
      role: parsed.role,
      linkedStudentId: parsed.linkedStudentId,
      linkedStudentIds: Array.isArray(parsed.linkedStudentIds) ? parsed.linkedStudentIds : undefined,
      linkedTeacherId: parsed.linkedTeacherId,
      authProvider: parsed.authProvider,
      loginChannel: parsed.loginChannel,
    };
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function extractAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const user = verifySessionToken(token);
    if (user) {
      req.user = user;
    }
  }
  next();
}

export function requireAuth(roles?: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Vui lòng đăng nhập phiên làm việc để thực hiện thao tác này.' });
      return;
    }
    if (roles && roles.length > 0) {
      const role = req.user.role;
      const allowed =
        roles.includes(role) ||
        (role === 'SUPER_ADMIN' && (roles.includes('ADMIN') || roles.includes('MANAGER'))) ||
        (role === 'ADMIN' && roles.includes('MANAGER'));
      if (!allowed) {
        res.status(403).json({ error: 'Tài khoản hiện tại không đủ quyền truy cập chức năng này.' });
        return;
      }
    }
    next();
  };
}
