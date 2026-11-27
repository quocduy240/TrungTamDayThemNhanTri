import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const SUPER_ADMIN_EMAIL = 'duyweb5@gmail.com';
export const ADMIN_EMAIL = 'lethituman2021@gmail.com';
export const ADMIN_EMAIL_SECONDARY = 'trungtamnhantri2026@gmail.com';
export const ADMIN_EMAILS: readonly string[] = [ADMIN_EMAIL, ADMIN_EMAIL_SECONDARY];
export const OFFICIAL_DOMAIN = 'daythemnhantri.com';

// Configured Google Workspace scopes (least-privilege read-only Drive access for personal images & list files)
export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const;

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

const app = initializeApp(firebaseConfig);

const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firestoreDatabaseId,
    );
  } catch {
    return firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Dedicated Drive-scoped GoogleAuthProvider reusing existing Firebase app & auth instance
const googleDriveProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleDriveProvider.addScope(scope));
googleDriveProvider.setCustomParameters({ prompt: 'select_account' });

// Keep Google Drive OAuth access token strictly in memory (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let cachedDriveAccountEmail: string | null = null;

onAuthStateChanged(auth, (fbUser) => {
  if (!fbUser) {
    cachedDriveAccessToken = null;
    cachedDriveAccountEmail = null;
  }
});

export async function signInWithGmailPopup() {
  return signInWithPopup(auth, googleProvider);
}

export async function connectGoogleDriveWithPopup(): Promise<{
  accessToken: string;
  email: string;
}> {
  const result = await signInWithPopup(auth, googleDriveProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Chưa nhận được quyền truy cập Google Drive. Vui lòng thử kết nối lại.');
  }
  cachedDriveAccessToken = credential.accessToken;
  cachedDriveAccountEmail = result.user.email || '';
  return {
    accessToken: cachedDriveAccessToken,
    email: cachedDriveAccountEmail,
  };
}

export function getGoogleDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function getGoogleDriveAccountEmail(): string | null {
  return cachedDriveAccountEmail;
}

export function clearGoogleDriveToken(): void {
  cachedDriveAccessToken = null;
  cachedDriveAccountEmail = null;
}

export async function signOutGmail() {
  cachedDriveAccessToken = null;
  cachedDriveAccountEmail = null;
  return signOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
