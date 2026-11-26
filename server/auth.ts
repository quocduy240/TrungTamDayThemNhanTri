import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser, UserRole } from '../src/types.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export const DEMO_ACCOUNTS: Record<UserRole, AuthUser> = {
  ADMIN: {
    id: 'usr-admin',
    name: 'Ban Giám Đốc Nhân Trí',
    email: 'admin@nhantri.edu.vn',
    role: 'ADMIN',
  },
  TEACHER: {
    id: 'usr-teacher',
    name: 'Cô Nguyễn Thị Mẫn (GV Toán)',
    email: 'co.man@nhantri.edu.vn',
    role: 'TEACHER',
    linkedTeacherId: 't-man',
  },
  PARENT: {
    id: 'usr-parent',
    name: 'Anh Nguyễn Văn Phúc (PH em Hòa)',
    email: 'ph.phuchoa@nhantri.edu.vn',
    role: 'PARENT',
    linkedStudentId: 'st-01',
  },
  STUDENT: {
    id: 'usr-student',
    name: 'Nguyễn Phúc Hòa (Lớp 6A1)',
    email: 'hoanp.6a1@nhantri.edu.vn',
    role: 'STUDENT',
    linkedStudentId: 'st-01',
  },
};

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
      role: parsed.role,
      linkedStudentId: parsed.linkedStudentId,
      linkedTeacherId: parsed.linkedTeacherId,
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
    if (roles && roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Tài khoản hiện tại không đủ quyền truy cập chức năng này.' });
      return;
    }
    next();
  };
}
