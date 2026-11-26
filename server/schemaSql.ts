export const CLOUDFLARE_D1_SCHEMA_SQL = `-- Cloudflare D1 (SQLite) Schema — TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ
-- Ready for deployment with Wrangler (wrangler d1 execute nhantri-db --remote --file=./schema.sql)

CREATE TABLE IF NOT EXISTS nhantri_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  subjects_json TEXT NOT NULL,
  degree TEXT NOT NULL,
  experience_years INTEGER DEFAULT 5,
  phone TEXT,
  room_default TEXT,
  status TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('CAP_1', 'CAP_2', 'CAP_3')),
  center_class TEXT NOT NULL,
  school_class TEXT,
  school TEXT,
  homeroom_teacher TEXT,
  room TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_zalo TEXT,
  package_type TEXT NOT NULL CHECK (package_type IN ('TUTORING', 'ALL_IN_ONE', 'PER_SUBJECT')),
  has_boarding INTEGER DEFAULT 0,
  has_shuttle INTEGER DEFAULT 0,
  annual_prepaid INTEGER DEFAULT 0,
  pe_conflict_day TEXT,
  pe_conflict_shift TEXT,
  evening_makeup_slot TEXT,
  enrolled_subjects_json TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id TEXT PRIMARY KEY,
  week_label TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('SANG', 'CHIEU', 'TOI')),
  shift TEXT NOT NULL CHECK (shift IN ('CA_1', 'CA_2')),
  time_range TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day IN ('T2', 'T3', 'T4', 'T5', 'T6', 'T7')),
  center_class TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher_id TEXT REFERENCES teachers(id),
  teacher_name TEXT NOT NULL,
  room TEXT NOT NULL,
  slot_type TEXT NOT NULL CHECK (slot_type IN ('MAIN', 'TRA_BAI', 'PHU_DAO', 'BU_THE_DUC')),
  status TEXT DEFAULT 'SCHEDULED',
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_tt_lookup ON timetable_slots(day, period, shift, teacher_id, room);

CREATE TABLE IF NOT EXISTS score_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL DEFAULT 10.0,
  exam_date TEXT NOT NULL,
  school TEXT,
  source TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  ai_summary TEXT,
  strengths_json TEXT,
  improvements_json TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  attendance_date TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id),
  center_class TEXT NOT NULL,
  shift_label TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  parent_notified INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tuition_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  month_label TEXT NOT NULL,
  base_amount INTEGER NOT NULL,
  boarding_amount INTEGER DEFAULT 0,
  shuttle_amount INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  paid_amount INTEGER DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PAID', 'DUE_SOON', 'OVERDUE')),
  payment_method TEXT,
  paid_at TEXT,
  reminders_sent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback_tickets (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  phone TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  reply TEXT
);
`;
