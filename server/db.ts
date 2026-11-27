import fs from 'fs';
import path from 'path';
import type { DatabaseState } from '../src/types.ts';
import { ALL_SHIFT_KEYS } from '../src/lib/timetableEngine.ts';
import { buildDeterministicQrToken } from '../src/lib/smartCodeAndQr.ts';
import { ensureSystemPrintTemplates, normalizeLookupKey } from '../src/lib/workspaceIntegrity.ts';
import { INITIAL_DB } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nhantri-db.json');

let memoryDb: DatabaseState | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeDbState(parsed: DatabaseState): DatabaseState {
  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    parsed.rooms = structuredClone(INITIAL_DB.rooms);
  }
  if (!Array.isArray(parsed.teacherLeaves)) {
    parsed.teacherLeaves = structuredClone(INITIAL_DB.teacherLeaves);
  }
  if (!Array.isArray(parsed.families)) {
    parsed.families = structuredClone(INITIAL_DB.families);
  }
  if (!Array.isArray(parsed.socialChannels) || parsed.socialChannels.length === 0) {
    parsed.socialChannels = structuredClone(INITIAL_DB.socialChannels);
  }
  if (!Array.isArray(parsed.socialPosts) || parsed.socialPosts.length === 0) {
    parsed.socialPosts = structuredClone(INITIAL_DB.socialPosts);
  }
  if (!parsed.notificationConfig) {
    parsed.notificationConfig = structuredClone(INITIAL_DB.notificationConfig);
  }
  if (!Array.isArray(parsed.notificationPrefs)) {
    parsed.notificationPrefs = structuredClone(INITIAL_DB.notificationPrefs);
  }
  if (!Array.isArray(parsed.classCheckins)) {
    parsed.classCheckins = [];
  }
  if (!Array.isArray(parsed.reminderDispatchLogs)) {
    parsed.reminderDispatchLogs = structuredClone(INITIAL_DB.reminderDispatchLogs);
  }
  parsed.printTemplates = ensureSystemPrintTemplates(parsed.printTemplates);
  if (!parsed.timetableUpdatedAt) {
    parsed.timetableUpdatedAt = new Date().toISOString();
  }
  if (typeof parsed.timetableVersion !== 'number' || !Number.isFinite(parsed.timetableVersion)) {
    parsed.timetableVersion = 1;
  }
  if (!Array.isArray(parsed.timetableChanges)) {
    parsed.timetableChanges = [];
  }
  parsed.teachers = (parsed.teachers || []).map((t) => ({
    ...t,
    teacherGroup: t.teacherGroup || (t.subjects.some((s) => s.toLowerCase().includes('trả bài')) ? 'TUTOR_REVIEW' : 'SUBJECT'),
    availability: Array.isArray(t.availability) && t.availability.length > 0 ? t.availability : [...ALL_SHIFT_KEYS],
    scheduleAlertEnabled: typeof t.scheduleAlertEnabled === 'boolean' ? t.scheduleAlertEnabled : true,
    scheduleAlertSound: typeof t.scheduleAlertSound === 'boolean' ? t.scheduleAlertSound : true,
  }));
  const teacherByKey = new Map<string, string>();
  parsed.teachers.forEach((t) => {
    teacherByKey.set(normalizeLookupKey(t.name), t.id);
    teacherByKey.set(normalizeLookupKey(t.shortName), t.id);
  });
  const roomByKey = new Map<string, string>();
  parsed.rooms.forEach((r) => {
    roomByKey.set(normalizeLookupKey(r.name), r.id);
    roomByKey.set(normalizeLookupKey(r.code), r.id);
  });
  parsed.students = (parsed.students || []).map((st) => ({
    ...st,
    qrToken: st.qrToken || buildDeterministicQrToken(st.id, st.code),
    homeroomTeacherId: st.homeroomTeacherId || teacherByKey.get(normalizeLookupKey(st.homeroomTeacher)),
    roomId: st.roomId || roomByKey.get(normalizeLookupKey(st.room)),
  }));
  return parsed;
}

export function loadDb(): DatabaseState {
  if (memoryDb) return memoryDb;
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.timetable)) {
        memoryDb = normalizeDbState(parsed);
        return memoryDb;
      }
    } catch {
      // Fallback to fresh seed if file is corrupted
    }
  }
  memoryDb = normalizeDbState(structuredClone(INITIAL_DB));
  saveDb(memoryDb);
  return memoryDb;
}

export function saveDb(state: DatabaseState): void {
  memoryDb = state;
  ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export { CLOUDFLARE_D1_SCHEMA_SQL } from './schemaSql.ts';
