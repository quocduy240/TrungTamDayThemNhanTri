-- Cloudflare D1 (SQLite) Schema — TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ
-- Cơ sở pháp lý: Chương trình GDPT 2018 (Thông tư 32/2018/TT-BGDĐT, Thông tư 13/2022/TT-BGDĐT)
-- Quy chế đánh giá học sinh THCS & THPT theo Thông tư 22/2021/TT-BGDĐT
-- Khởi tạo: wrangler d1 execute nhantri-db --remote --file=./schema.sql

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
  student_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT,
  current_class_id INTEGER,
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

-- =====================================================================
-- HỆ THỐNG CSDL MÔN HỌC & ĐIỂM SỐ HỌC SINH LỚP 6-12 (GDPT 2018 - TT 22)
-- =====================================================================

-- 1. Năm học
CREATE TABLE IF NOT EXISTS academic_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(20) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT 0
);

-- 2. Lớp học
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 6 AND 12),
  name VARCHAR(20) NOT NULL,
  UNIQUE (academic_year_id, name)
);

-- 4. Danh mục 23 môn học chuẩn GDPT 2018
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  evaluation_type VARCHAR(15) NOT NULL CHECK (evaluation_type IN ('SCORE', 'PASS_FAIL'))
);

-- 5. Khung chương trình theo khối lớp (Master Mapping Lớp 6-12)
CREATE TABLE IF NOT EXISTS grade_curriculum (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 6 AND 12),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  requirement_type VARCHAR(20) NOT NULL CHECK (requirement_type IN ('MANDATORY', 'ELECTIVE_GROUP', 'OPTIONAL')),
  periods_per_year SMALLINT NOT NULL,
  required_tx_count SMALLINT NOT NULL CHECK (required_tx_count BETWEEN 2 AND 4),
  UNIQUE (grade_level, subject_id)
);

-- 6. Môn học thực tế của từng học sinh trong năm học
CREATE TABLE IF NOT EXISTS student_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  has_study_topic BOOLEAN DEFAULT 0,
  is_exempted BOOLEAN DEFAULT 0,
  UNIQUE (student_id, academic_year_id, subject_id)
);

-- 7. Chi tiết từng đầu điểm nhập vào (Bảng nhập điểm chính)
CREATE TABLE IF NOT EXISTS score_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_subject_id INTEGER NOT NULL REFERENCES student_subjects(id) ON DELETE CASCADE,
  semester SMALLINT NOT NULL CHECK (semester IN (1, 2)),
  score_type VARCHAR(15) NOT NULL CHECK (score_type IN ('TX', 'GK', 'CK', 'CHUYEN_DE')),
  tx_index SMALLINT DEFAULT 1,
  weight SMALLINT NOT NULL CHECK (weight IN (1, 2, 3)),
  score_value NUMERIC(3, 1) CHECK (score_value >= 0.0 AND score_value <= 10.0),
  pass_status VARCHAR(10) CHECK (pass_status IN ('DAT', 'CHUA_DAT')),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (score_value IS NOT NULL AND pass_status IS NULL) OR
    (score_value IS NULL AND pass_status IS NOT NULL)
  )
);

-- 8. Bảng tổng hợp điểm trung bình (Cache kết quả để xuất học bạ / báo cáo)
CREATE TABLE IF NOT EXISTS subject_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_subject_id INTEGER NOT NULL REFERENCES student_subjects(id) ON DELETE CASCADE,
  period VARCHAR(10) NOT NULL CHECK (period IN ('HK1', 'HK2', 'FULL_YEAR')),
  avg_score NUMERIC(3, 1) CHECK (avg_score >= 0.0 AND avg_score <= 10.0),
  pass_status VARCHAR(10) CHECK (pass_status IN ('DAT', 'CHUA_DAT')),
  teacher_comment TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_subject_id, period)
);

-- SEED NĂM HỌC MẶC ĐỊNH
INSERT OR IGNORE INTO academic_years (id, name, is_active) VALUES (1, '2025-2026', 1);
INSERT OR IGNORE INTO academic_years (id, name, is_active) VALUES (2, '2026-2027', 1);

-- SEED 23 MÔN HỌC CHUẨN GDPT 2018
INSERT OR IGNORE INTO subjects (id, code, name, evaluation_type) VALUES
  (1,  'VAN',    'Ngữ văn',                              'SCORE'),
  (2,  'TOAN',   'Toán',                                 'SCORE'),
  (3,  'NN1',    'Ngoại ngữ 1',                          'SCORE'),
  (4,  'GDCD',   'Giáo dục công dân',                    'SCORE'),
  (5,  'LS_DL',  'Lịch sử và Địa lí',                    'SCORE'),
  (6,  'KHTN',   'Khoa học tự nhiên',                    'SCORE'),
  (7,  'LS',     'Lịch sử',                              'SCORE'),
  (8,  'DL',     'Địa lí',                               'SCORE'),
  (9,  'GDKTPL', 'Giáo dục kinh tế và pháp luật',        'SCORE'),
  (10, 'VL',     'Vật lí',                               'SCORE'),
  (11, 'HH',     'Hóa học',                              'SCORE'),
  (12, 'SH',     'Sinh học',                             'SCORE'),
  (13, 'CN',     'Công nghệ',                            'SCORE'),
  (14, 'TIN',    'Tin học',                              'SCORE'),
  (15, 'GDQPAN', 'Giáo dục quốc phòng và an ninh',       'SCORE'),
  (16, 'GDTC',   'Giáo dục thể chất',                    'PASS_FAIL'),
  (17, 'NT',     'Nghệ thuật',                           'PASS_FAIL'),
  (18, 'AN',     'Âm nhạc',                              'PASS_FAIL'),
  (19, 'MT',     'Mĩ thuật',                             'PASS_FAIL'),
  (20, 'HDTN',   'Hoạt động trải nghiệm, hướng nghiệp',  'PASS_FAIL'),
  (21, 'GDDP',   'Nội dung giáo dục của địa phương',     'PASS_FAIL'),
  (22, 'TDTTS',  'Tiếng dân tộc thiểu số',               'SCORE'),
  (23, 'NN2',    'Ngoại ngữ 2',                          'SCORE');

-- SEED KHUNG CHƯƠNG TRÌNH CẤP THCS (KHỐI 6, 7, 8, 9)
WITH thcs_grades(g) AS (VALUES (6), (7), (8), (9)),
thcs_map(code, req, periods, tx) AS (
  VALUES
    ('VAN',   'MANDATORY', 140, 4),
    ('TOAN',  'MANDATORY', 140, 4),
    ('KHTN',  'MANDATORY', 140, 4),
    ('NN1',   'MANDATORY', 105, 4),
    ('LS_DL', 'MANDATORY', 105, 4),
    ('GDCD',  'MANDATORY', 35,  2),
    ('CN',    'MANDATORY', 35,  2),
    ('TIN',   'MANDATORY', 35,  2),
    ('HDTN',  'MANDATORY', 105, 4),
    ('GDTC',  'MANDATORY', 70,  3),
    ('NT',    'MANDATORY', 70,  2),
    ('GDDP',  'MANDATORY', 35,  2),
    ('TDTTS', 'OPTIONAL',  105, 4),
    ('NN2',   'OPTIONAL',  105, 4)
)
INSERT OR IGNORE INTO grade_curriculum (grade_level, subject_id, requirement_type, periods_per_year, required_tx_count)
SELECT thcs_grades.g, subjects.id, thcs_map.req, thcs_map.periods, thcs_map.tx
FROM thcs_grades CROSS JOIN thcs_map JOIN subjects ON subjects.code = thcs_map.code;

-- SEED KHUNG CHƯƠNG TRÌNH CẤP THPT (KHỐI 10, 11, 12)
WITH thpt_grades(g) AS (VALUES (10), (11), (12)),
thpt_map(code, req, periods, tx) AS (
  VALUES
    ('VAN',    'MANDATORY',      105, 4),
    ('TOAN',   'MANDATORY',      105, 4),
    ('NN1',    'MANDATORY',      105, 4),
    ('LS',     'MANDATORY',      52,  3),
    ('GDQPAN', 'MANDATORY',      35,  2),
    ('HDTN',   'MANDATORY',      105, 4),
    ('GDTC',   'MANDATORY',      70,  3),
    ('GDDP',   'MANDATORY',      35,  2),
    ('DL',     'ELECTIVE_GROUP', 70,  3),
    ('GDKTPL', 'ELECTIVE_GROUP', 70,  3),
    ('VL',     'ELECTIVE_GROUP', 70,  3),
    ('HH',     'ELECTIVE_GROUP', 70,  3),
    ('SH',     'ELECTIVE_GROUP', 70,  3),
    ('CN',     'ELECTIVE_GROUP', 70,  3),
    ('TIN',    'ELECTIVE_GROUP', 70,  3),
    ('AN',     'ELECTIVE_GROUP', 70,  3),
    ('MT',     'ELECTIVE_GROUP', 70,  3),
    ('TDTTS',  'OPTIONAL',       105, 4),
    ('NN2',    'OPTIONAL',       105, 4)
)
INSERT OR IGNORE INTO grade_curriculum (grade_level, subject_id, requirement_type, periods_per_year, required_tx_count)
SELECT thpt_grades.g, subjects.id, thpt_map.req, thpt_map.periods, thpt_map.tx
FROM thpt_grades CROSS JOIN thpt_map JOIN subjects ON subjects.code = thpt_map.code;

-- CÁC BẢNG VẬN HÀNH TRUNG TÂM HIỆN HỮU
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
