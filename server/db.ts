import fs from 'fs';
import path from 'path';
import type { DatabaseState } from '../src/types.ts';
import { ALL_SHIFT_KEYS } from '../src/lib/timetableEngine.ts';
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
  parsed.teachers = (parsed.teachers || []).map((t) => ({
    ...t,
    teacherGroup: t.teacherGroup || (t.subjects.some((s) => s.toLowerCase().includes('trả bài')) ? 'TUTOR_REVIEW' : 'SUBJECT'),
    availability: Array.isArray(t.availability) && t.availability.length > 0 ? t.availability : [...ALL_SHIFT_KEYS],
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
  memoryDb = structuredClone(INITIAL_DB);
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
