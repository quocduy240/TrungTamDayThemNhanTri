import type { ScoreRecord, Student } from '../types';

// ============================================================================
// HỆ THỐNG CƠ SỞ DỮ LIỆU & NHẬP ĐIỂM HỌC SINH LỚP 6 – 12 (GDPT 2018)
// Cơ sở pháp lý: Thông tư 32/2018/TT-BGDĐT, Thông tư 13/2022/TT-BGDĐT
// và Quy chế đánh giá học sinh theo Thông tư 22/2021/TT-BGDĐT
// ============================================================================

export type GdptEvaluationType = 'SCORE' | 'PASS_FAIL';
export type GdptRequirementType = 'MANDATORY' | 'ELECTIVE_GROUP' | 'OPTIONAL';
export type GdptPassStatus = 'DAT' | 'CHUA_DAT';
export type GdptScoreType = 'TX' | 'GK' | 'CK' | 'CHUYEN_DE';
export type GdptPeriod = 'HK1' | 'HK2' | 'FULL_YEAR';
export type GdptGradeLevel = 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface GdptSubject {
  id: number;
  code: string;
  name: string;
  evaluationType: GdptEvaluationType;
  businessNote: string;
  legacyAliases: string[];
}

export interface GdptGradeCurriculumItem {
  gradeLevel: GdptGradeLevel;
  subjectCode: string;
  subjectName: string;
  evaluationType: GdptEvaluationType;
  requirementType: GdptRequirementType;
  periodsPerYear: number;
  requiredTxCount: 2 | 3 | 4;
}

export interface GdptStudentEnrollmentConfig {
  studentId: string;
  academicYear: string;
  gradeLevel: GdptGradeLevel;
  electiveCodes: string[]; // THPT (10-12): Bắt buộc đúng 4 môn trong nhóm 9 môn ELECTIVE_GROUP
  studyTopicCodes: string[]; // THPT (10-12): Tối đa 3 môn có Cụm chuyên đề học tập (has_study_topic = TRUE)
  optionalCodes: string[]; // TDTTS, NN2
  exemptedCodes: string[]; // Miễn học/thực hành (GDTC, GDQPAN)
}

export interface GdptSemesterInputRow {
  studentId: string;
  subjectCode: string;
  semester: 1 | 2;
  evaluationType: GdptEvaluationType;
  requiredTxCount: 2 | 3 | 4;
  hasStudyTopic: boolean;
  isExempted: boolean;
  // Đối với môn tính điểm (SCORE)
  txScores: Array<number | null>; // Độ dài = 4 (hiển thị theo requiredTxCount: 2, 3 hoặc 4)
  chuyenDeScore: number | null; // Trọng số 1 (nếu hasStudyTopic = true ở THPT)
  gkScore: number | null; // Trọng số 2
  ckScore: number | null; // Trọng số 3
  // Đối với môn nhận xét (PASS_FAIL)
  txPass: Array<GdptPassStatus | null>;
  chuyenDePass: GdptPassStatus | null;
  gkPass: GdptPassStatus | null;
  ckPass: GdptPassStatus | null;
  teacherComment: string;
}

export interface GdptSubjectSummaryResult {
  subjectCode: string;
  subjectName: string;
  evaluationType: GdptEvaluationType;
  requirementType: GdptRequirementType;
  periodsPerYear: number;
  requiredTxCount: 2 | 3 | 4;
  hasStudyTopic: boolean;
  isExempted: boolean;
  hk1: {
    row: GdptSemesterInputRow;
    avgScore: number | null;
    passStatus: GdptPassStatus | null;
    isComplete: boolean;
    enteredTxCount: number;
  };
  hk2: {
    row: GdptSemesterInputRow;
    avgScore: number | null;
    passStatus: GdptPassStatus | null;
    isComplete: boolean;
    enteredTxCount: number;
  };
  fullYear: {
    avgScore: number | null;
    passStatus: GdptPassStatus | null;
    isComplete: boolean;
    teacherComment: string;
  };
}

export const CURRENT_ACADEMIC_YEAR = '2025-2026';

// ============================================================================
// 2. DANH MỤC 23 MÔN HỌC CHUẨN (MASTER DATA: subjects)
// ============================================================================

export const SUBJECTS_23: GdptSubject[] = [
  {
    id: 1,
    code: 'VAN',
    name: 'Ngữ văn',
    evaluationType: 'SCORE',
    businessNote: 'Bắt buộc (6–12)',
    legacyAliases: ['ngữ văn', 'văn', 'ngu van'],
  },
  {
    id: 2,
    code: 'TOAN',
    name: 'Toán',
    evaluationType: 'SCORE',
    businessNote: 'Bắt buộc (6–12)',
    legacyAliases: ['toán', 'toán học', 'toan'],
  },
  {
    id: 3,
    code: 'NN1',
    name: 'Ngoại ngữ 1',
    evaluationType: 'SCORE',
    businessNote: 'Bắt buộc (6–12), mặc định Tiếng Anh',
    legacyAliases: ['ngoại ngữ 1', 'tiếng anh', 'anh văn', 'anh', 'tieng anh'],
  },
  {
    id: 4,
    code: 'GDCD',
    name: 'Giáo dục công dân',
    evaluationType: 'SCORE',
    businessNote: 'Chỉ học ở THCS (6–9)',
    legacyAliases: ['giáo dục công dân', 'gdcd'],
  },
  {
    id: 5,
    code: 'LS_DL',
    name: 'Lịch sử và Địa lí',
    evaluationType: 'SCORE',
    businessNote: 'Môn tích hợp, chỉ học ở THCS (6–9)',
    legacyAliases: ['lịch sử và địa lí', 'lịch sử & địa lí', 'sử địa', 'ls&đl'],
  },
  {
    id: 6,
    code: 'KHTN',
    name: 'Khoa học tự nhiên',
    evaluationType: 'SCORE',
    businessNote: 'Môn tích hợp (Lý-Hóa-Sinh), chỉ học ở THCS (6–9)',
    legacyAliases: ['khoa học tự nhiên', 'khtn'],
  },
  {
    id: 7,
    code: 'LS',
    name: 'Lịch sử',
    evaluationType: 'SCORE',
    businessNote: 'Môn bắt buộc ở THPT (10–12)',
    legacyAliases: ['lịch sử', 'sử'],
  },
  {
    id: 8,
    code: 'DL',
    name: 'Địa lí',
    evaluationType: 'SCORE',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['địa lí', 'địa lý', 'địa'],
  },
  {
    id: 9,
    code: 'GDKTPL',
    name: 'Giáo dục kinh tế và pháp luật',
    evaluationType: 'SCORE',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['giáo dục kinh tế và pháp luật', 'gdktpl', 'kinh tế pháp luật'],
  },
  {
    id: 10,
    code: 'VL',
    name: 'Vật lí',
    evaluationType: 'SCORE',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['vật lí', 'vật lý', 'lí', 'lý'],
  },
  {
    id: 11,
    code: 'HH',
    name: 'Hóa học',
    evaluationType: 'SCORE',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['hóa học', 'hoá học', 'hóa'],
  },
  {
    id: 12,
    code: 'SH',
    name: 'Sinh học',
    evaluationType: 'SCORE',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['sinh học', 'sinh'],
  },
  {
    id: 13,
    code: 'CN',
    name: 'Công nghệ',
    evaluationType: 'SCORE',
    businessNote: 'Bắt buộc (6–9); Lựa chọn (10–12)',
    legacyAliases: ['công nghệ'],
  },
  {
    id: 14,
    code: 'TIN',
    name: 'Tin học',
    evaluationType: 'SCORE',
    businessNote: 'Bắt buộc (6–9); Lựa chọn (10–12)',
    legacyAliases: ['tin học', 'tin'],
  },
  {
    id: 15,
    code: 'GDQPAN',
    name: 'Giáo dục quốc phòng và an ninh',
    evaluationType: 'SCORE',
    businessNote: 'Chỉ học ở THPT (10–12)',
    legacyAliases: ['giáo dục quốc phòng và an ninh', 'gdqpan', 'quốc phòng'],
  },
  {
    id: 16,
    code: 'GDTC',
    name: 'Giáo dục thể chất',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Bắt buộc (6–12)',
    legacyAliases: ['giáo dục thể chất', 'thể dục', 'gdtc'],
  },
  {
    id: 17,
    code: 'NT',
    name: 'Nghệ thuật',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Gồm Âm nhạc & Mĩ thuật, chỉ học ở THCS (6–9)',
    legacyAliases: ['nghệ thuật'],
  },
  {
    id: 18,
    code: 'AN',
    name: 'Âm nhạc',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['âm nhạc'],
  },
  {
    id: 19,
    code: 'MT',
    name: 'Mĩ thuật',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Môn lựa chọn ở THPT (10–12)',
    legacyAliases: ['mĩ thuật', 'mỹ thuật'],
  },
  {
    id: 20,
    code: 'HDTN',
    name: 'Hoạt động trải nghiệm, hướng nghiệp',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Bắt buộc (6–12)',
    legacyAliases: ['hoạt động trải nghiệm, hướng nghiệp', 'hđtn', 'hdtn'],
  },
  {
    id: 21,
    code: 'GDDP',
    name: 'Nội dung giáo dục của địa phương',
    evaluationType: 'PASS_FAIL',
    businessNote: 'Bắt buộc (6–12)',
    legacyAliases: ['nội dung giáo dục của địa phương', 'giáo dục địa phương', 'gddp'],
  },
  {
    id: 22,
    code: 'TDTTS',
    name: 'Tiếng dân tộc thiểu số',
    evaluationType: 'SCORE',
    businessNote: 'Tự chọn không bắt buộc (6–12)',
    legacyAliases: ['tiếng dân tộc thiểu số', 'tdtts'],
  },
  {
    id: 23,
    code: 'NN2',
    name: 'Ngoại ngữ 2',
    evaluationType: 'SCORE',
    businessNote: 'Tự chọn không bắt buộc (6–12)',
    legacyAliases: ['ngoại ngữ 2', 'nn2'],
  },
];

export const SUBJECT_BY_CODE = new Map<string, GdptSubject>(
  SUBJECTS_23.map((s) => [s.code, s]),
);

// ============================================================================
// 3. MA TRẬN PHÂN BỔ MÔN HỌC THEO KHỐI LỚP 6 – 12 (grade_curriculum)
// ============================================================================

const THCS_TEMPLATE: Array<{
  code: string;
  requirementType: GdptRequirementType;
  periodsPerYear: number;
  requiredTxCount: 2 | 3 | 4;
}> = [
  { code: 'VAN', requirementType: 'MANDATORY', periodsPerYear: 140, requiredTxCount: 4 },
  { code: 'TOAN', requirementType: 'MANDATORY', periodsPerYear: 140, requiredTxCount: 4 },
  { code: 'KHTN', requirementType: 'MANDATORY', periodsPerYear: 140, requiredTxCount: 4 },
  { code: 'NN1', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'LS_DL', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'GDCD', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'CN', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'TIN', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'HDTN', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'GDTC', requirementType: 'MANDATORY', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'NT', requirementType: 'MANDATORY', periodsPerYear: 70, requiredTxCount: 2 },
  { code: 'GDDP', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'TDTTS', requirementType: 'OPTIONAL', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'NN2', requirementType: 'OPTIONAL', periodsPerYear: 105, requiredTxCount: 4 },
];

const THPT_TEMPLATE: Array<{
  code: string;
  requirementType: GdptRequirementType;
  periodsPerYear: number;
  requiredTxCount: 2 | 3 | 4;
}> = [
  { code: 'VAN', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'TOAN', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'NN1', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'LS', requirementType: 'MANDATORY', periodsPerYear: 52, requiredTxCount: 3 },
  { code: 'GDQPAN', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'HDTN', requirementType: 'MANDATORY', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'GDTC', requirementType: 'MANDATORY', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'GDDP', requirementType: 'MANDATORY', periodsPerYear: 35, requiredTxCount: 2 },
  { code: 'DL', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'GDKTPL', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'VL', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'HH', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'SH', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'CN', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'TIN', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'AN', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'MT', requirementType: 'ELECTIVE_GROUP', periodsPerYear: 70, requiredTxCount: 3 },
  { code: 'TDTTS', requirementType: 'OPTIONAL', periodsPerYear: 105, requiredTxCount: 4 },
  { code: 'NN2', requirementType: 'OPTIONAL', periodsPerYear: 105, requiredTxCount: 4 },
];

export const GRADE_CURRICULUM_ALL: GdptGradeCurriculumItem[] = (
  [6, 7, 8, 9, 10, 11, 12] as GdptGradeLevel[]
).flatMap((gradeLevel) => {
  const tpl = gradeLevel <= 9 ? THCS_TEMPLATE : THPT_TEMPLATE;
  return tpl.map((item) => {
    const subj = SUBJECT_BY_CODE.get(item.code)!;
    return {
      gradeLevel,
      subjectCode: subj.code,
      subjectName: subj.name,
      evaluationType: subj.evaluationType,
      requirementType: item.requirementType,
      periodsPerYear: item.periodsPerYear,
      requiredTxCount: item.requiredTxCount,
    };
  });
});

export function normalizeGdptGradeLevel(rawGrade?: number, centerClass?: string): GdptGradeLevel {
  if (rawGrade && rawGrade >= 6 && rawGrade <= 12) {
    return Math.round(rawGrade) as GdptGradeLevel;
  }
  const match = String(centerClass || '').match(/(10|11|12|[6-9])/);
  if (match) {
    return Number(match[1]) as GdptGradeLevel;
  }
  return 6;
}

export function getGradeCurriculum(gradeLevel: number): GdptGradeCurriculumItem[] {
  const g = normalizeGdptGradeLevel(gradeLevel);
  return GRADE_CURRICULUM_ALL.filter((c) => c.gradeLevel === g);
}

export function resolveSubjectCodeFromNameOrCode(raw: string): string | null {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (SUBJECT_BY_CODE.has(upper)) return upper;
  const lower = clean.toLowerCase();
  for (const subj of SUBJECTS_23) {
    if (subj.name.toLowerCase() === lower || subj.legacyAliases.includes(lower)) {
      return subj.code;
    }
  }
  return null;
}

// ============================================================================
// 4. QUY TẮC KHỞI TẠO MÔN HỌC CHO HỌC SINH (Enrollment Service)
// ============================================================================

export const DEFAULT_THPT_ELECTIVES = ['VL', 'HH', 'SH', 'TIN'];
export const DEFAULT_THPT_STUDY_TOPICS = ['TOAN', 'VL', 'HH'];

export function validateThptElectiveSelection(
  gradeLevel: number,
  electiveCodes: string[],
  studyTopicCodes: string[],
): { valid: boolean; errors: string[] } {
  const g = normalizeGdptGradeLevel(gradeLevel);
  const errors: string[] = [];
  if (g >= 10) {
    const validElectivePool = new Set(
      getGradeCurriculum(g)
        .filter((c) => c.requirementType === 'ELECTIVE_GROUP')
        .map((c) => c.subjectCode),
    );
    const uniqueElectives = Array.from(
      new Set(electiveCodes.filter((c) => validElectivePool.has(c))),
    );
    if (uniqueElectives.length !== 4) {
      errors.push(
        `Học sinh cấp THPT (Khối ${g}) bắt buộc phải chọn chính xác 4 môn trong nhóm 9 môn lựa chọn theo Thông tư 13/2022/TT-BGDĐT (hiện đang chọn ${uniqueElectives.length} môn).`,
      );
    }
    const uniqueTopics = Array.from(new Set(studyTopicCodes));
    if (uniqueTopics.length > 3) {
      errors.push(
        `Học sinh cấp THPT chỉ được đăng ký tối đa 3 cụm chuyên đề học tập (hiện đang chọn ${uniqueTopics.length} chuyên đề).`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

interface EmbeddedGdptMeta {
  _gdpt2018: true;
  kind: 'SCORE_ENTRY' | 'ENROLLMENT_CONFIG';
  academicYear: string;
  subjectCode?: string;
  semester?: 1 | 2;
  scoreType?: GdptScoreType;
  txIndex?: number; // 1..4
  weight?: 1 | 2 | 3;
  evaluationType?: GdptEvaluationType;
  scoreValue?: number | null;
  passStatus?: GdptPassStatus | null;
  teacherComment?: string;
  // For ENROLLMENT_CONFIG
  electiveCodes?: string[];
  studyTopicCodes?: string[];
  optionalCodes?: string[];
  exemptedCodes?: string[];
}

function parseEmbeddedMeta(record: ScoreRecord): EmbeddedGdptMeta | null {
  const raw = record.strengths?.[0];
  if (!raw || typeof raw !== 'string' || !raw.startsWith('{"_gdpt2018":true')) return null;
  try {
    return JSON.parse(raw) as EmbeddedGdptMeta;
  } catch {
    return null;
  }
}

export function getStudentEnrollmentConfig(
  student: Student,
  allScores: ScoreRecord[],
  academicYear = CURRENT_ACADEMIC_YEAR,
): GdptStudentEnrollmentConfig {
  const gradeLevel = normalizeGdptGradeLevel(student.grade, student.centerClass);
  const configId = `gdpt-cfg::${academicYear}::${student.id}`;
  const existingRecord = allScores.find(
    (s) =>
      s.id === configId ||
      (s.studentId === student.id && parseEmbeddedMeta(s)?.kind === 'ENROLLMENT_CONFIG'),
  );
  const meta = existingRecord ? parseEmbeddedMeta(existingRecord) : null;

  if (gradeLevel <= 9) {
    return {
      studentId: student.id,
      academicYear,
      gradeLevel,
      electiveCodes: [],
      studyTopicCodes: [],
      optionalCodes: meta?.optionalCodes || [],
      exemptedCodes: meta?.exemptedCodes || [],
    };
  }

  // THPT (10-12): Check if student has custom electiveCodes, else infer from student.enrolledSubjects or default 4
  const electivePool = getGradeCurriculum(gradeLevel)
    .filter((c) => c.requirementType === 'ELECTIVE_GROUP')
    .map((c) => c.subjectCode);

  let electiveCodes = (meta?.electiveCodes || []).filter((c) => electivePool.includes(c));
  if (electiveCodes.length !== 4) {
    const inferredFromProfile = (student.enrolledSubjects || [])
      .map((name) => resolveSubjectCodeFromNameOrCode(name))
      .filter((code): code is string => Boolean(code && electivePool.includes(code)));
    const merged = Array.from(new Set([...electiveCodes, ...inferredFromProfile, ...DEFAULT_THPT_ELECTIVES]));
    electiveCodes = merged.slice(0, 4);
  }

  const studyTopicCodes = (meta?.studyTopicCodes || DEFAULT_THPT_STUDY_TOPICS).slice(0, 3);

  return {
    studentId: student.id,
    academicYear,
    gradeLevel,
    electiveCodes,
    studyTopicCodes,
    optionalCodes: meta?.optionalCodes || [],
    exemptedCodes: meta?.exemptedCodes || [],
  };
}

export function getEnrolledCurriculumForStudent(
  student: Student,
  allScores: ScoreRecord[],
  academicYear = CURRENT_ACADEMIC_YEAR,
): Array<GdptGradeCurriculumItem & { hasStudyTopic: boolean; isExempted: boolean }> {
  const cfg = getStudentEnrollmentConfig(student, allScores, academicYear);
  const gradeItems = getGradeCurriculum(cfg.gradeLevel);
  const electiveSet = new Set(cfg.electiveCodes);
  const optionalSet = new Set(cfg.optionalCodes);
  const studyTopicSet = new Set(cfg.studyTopicCodes);
  const exemptedSet = new Set(cfg.exemptedCodes);

  return gradeItems
    .filter((item) => {
      if (item.requirementType === 'MANDATORY') return true;
      if (item.requirementType === 'ELECTIVE_GROUP') return electiveSet.has(item.subjectCode);
      if (item.requirementType === 'OPTIONAL') return optionalSet.has(item.subjectCode);
      return false;
    })
    .map((item) => ({
      ...item,
      hasStudyTopic: cfg.gradeLevel >= 10 && studyTopicSet.has(item.subjectCode),
      isExempted: exemptedSet.has(item.subjectCode),
    }));
}

// ============================================================================
// 5. CÔNG THỨC TÍNH ĐIỂM TRUNG BÌNH & TỔNG KẾT (Thông tư 22/2021/TT-BGDĐT)
// ============================================================================

export function roundHalfUp1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateSemesterSummary(row: GdptSemesterInputRow): {
  avgScore: number | null;
  passStatus: GdptPassStatus | null;
  isComplete: boolean;
  enteredTxCount: number;
} {
  if (row.isExempted) {
    return {
      avgScore: null,
      passStatus: 'DAT',
      isComplete: true,
      enteredTxCount: row.requiredTxCount,
    };
  }

  if (row.evaluationType === 'SCORE') {
    const activeTx = row.txScores
      .slice(0, row.requiredTxCount)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10);
    const hasCd =
      row.hasStudyTopic &&
      typeof row.chuyenDeScore === 'number' &&
      Number.isFinite(row.chuyenDeScore) &&
      row.chuyenDeScore >= 0 &&
      row.chuyenDeScore <= 10;
    const hasGk =
      typeof row.gkScore === 'number' &&
      Number.isFinite(row.gkScore) &&
      row.gkScore >= 0 &&
      row.gkScore <= 10;
    const hasCk =
      typeof row.ckScore === 'number' &&
      Number.isFinite(row.ckScore) &&
      row.ckScore >= 0 &&
      row.ckScore <= 10;

    const enteredTxCount = activeTx.length;
    const isComplete =
      enteredTxCount >= row.requiredTxCount &&
      hasGk &&
      hasCk &&
      (!row.hasStudyTopic || hasCd);

    // Tính ĐTBmhk theo đúng công thức Thông tư 22/2021:
    // ĐTBmhk = (Tổng ĐĐGtx + ĐĐGchuyen_de + 2 * ĐĐGgk + 3 * ĐĐGck) / (N_tx + N_cd + 5)
    if (enteredTxCount === 0 && !hasGk && !hasCk && !hasCd) {
      return { avgScore: null, passStatus: null, isComplete: false, enteredTxCount: 0 };
    }

    const sumTx = activeTx.reduce((a, b) => a + b, 0);
    const cdVal = hasCd ? (row.chuyenDeScore as number) : 0;
    const nCd = hasCd ? 1 : 0;

    if (hasGk && hasCk && enteredTxCount > 0) {
      const numerator = sumTx + cdVal + 2 * (row.gkScore as number) + 3 * (row.ckScore as number);
      const denominator = enteredTxCount + nCd + 5;
      return {
        avgScore: roundHalfUp1(numerator / denominator),
        passStatus: null,
        isComplete,
        enteredTxCount,
      };
    }

    // Điểm trung bình tạm tính khi mới nhập một phần đầu điểm trong học kì
    let partialNum = sumTx + cdVal;
    let partialDen = enteredTxCount + nCd;
    if (hasGk) {
      partialNum += 2 * (row.gkScore as number);
      partialDen += 2;
    }
    if (hasCk) {
      partialNum += 3 * (row.ckScore as number);
      partialDen += 3;
    }
    return {
      avgScore: partialDen > 0 ? roundHalfUp1(partialNum / partialDen) : null,
      passStatus: null,
      isComplete: false,
      enteredTxCount,
    };
  }

  // Đối với môn nhận xét (evaluation_type = 'PASS_FAIL'):
  // Đạt mức 'DAT' khi có đủ số lần đánh giá và TẤT CẢ đều 'DAT'; ngược lại 'CHUA_DAT'.
  const activeTxPass = row.txPass
    .slice(0, row.requiredTxCount)
    .filter((v): v is GdptPassStatus => v === 'DAT' || v === 'CHUA_DAT');
  const enteredTxCount = activeTxPass.length;
  const cdPassList: GdptPassStatus[] =
    row.hasStudyTopic && (row.chuyenDePass === 'DAT' || row.chuyenDePass === 'CHUA_DAT')
      ? [row.chuyenDePass]
      : [];
  const gkValid = row.gkPass === 'DAT' || row.gkPass === 'CHUA_DAT';
  const ckValid = row.ckPass === 'DAT' || row.ckPass === 'CHUA_DAT';

  const allEntered: GdptPassStatus[] = [
    ...activeTxPass,
    ...cdPassList,
    ...(gkValid ? [row.gkPass as GdptPassStatus] : []),
    ...(ckValid ? [row.ckPass as GdptPassStatus] : []),
  ];

  if (allEntered.length === 0) {
    return { avgScore: null, passStatus: null, isComplete: false, enteredTxCount: 0 };
  }

  const isComplete =
    enteredTxCount >= row.requiredTxCount &&
    gkValid &&
    ckValid &&
    (!row.hasStudyTopic || cdPassList.length === 1);

  if (allEntered.some((st) => st === 'CHUA_DAT')) {
    return { avgScore: null, passStatus: 'CHUA_DAT', isComplete, enteredTxCount };
  }

  return {
    avgScore: null,
    passStatus: 'DAT',
    isComplete,
    enteredTxCount,
  };
}

export function calculateFullYearSummary(
  evaluationType: GdptEvaluationType,
  hk1: { avgScore: number | null; passStatus: GdptPassStatus | null; isComplete: boolean },
  hk2: { avgScore: number | null; passStatus: GdptPassStatus | null; isComplete: boolean },
): {
  avgScore: number | null;
  passStatus: GdptPassStatus | null;
  isComplete: boolean;
} {
  if (evaluationType === 'SCORE') {
    if (typeof hk1.avgScore === 'number' && typeof hk2.avgScore === 'number') {
      // ĐTBmcn = (ĐTBmhk1 + 2 * ĐTBmhk2) / 3
      const avg = roundHalfUp1((hk1.avgScore + 2 * hk2.avgScore) / 3);
      return {
        avgScore: avg,
        passStatus: null,
        isComplete: hk1.isComplete && hk2.isComplete,
      };
    }
    return {
      avgScore: hk2.avgScore ?? hk1.avgScore ?? null,
      passStatus: null,
      isComplete: false,
    };
  }

  // Đối với môn nhận xét (PASS_FAIL): Kết quả cả năm lấy trực tiếp kết quả Học kì II (HK2)
  return {
    avgScore: null,
    passStatus: hk2.passStatus ?? hk1.passStatus ?? null,
    isComplete: Boolean(hk2.passStatus && hk2.isComplete),
  };
}

// ============================================================================
// 6. TRÍCH XUẤT & ĐỒNG BỘ DỮ LIỆU GIỮA BẢNG ĐIỂM GDPT 2018 VÀ ScoreRecord[]
// ============================================================================

export function extractStudentSubjectSemesterRow(
  student: Student,
  subjectCode: string,
  semester: 1 | 2,
  allScores: ScoreRecord[],
  academicYear = CURRENT_ACADEMIC_YEAR,
): GdptSemesterInputRow {
  const gradeLevel = normalizeGdptGradeLevel(student.grade, student.centerClass);
  const curriculumItem =
    getGradeCurriculum(gradeLevel).find((c) => c.subjectCode === subjectCode) ||
    GRADE_CURRICULUM_ALL.find((c) => c.subjectCode === subjectCode)!;
  const subj = SUBJECT_BY_CODE.get(subjectCode)!;
  const cfg = getStudentEnrollmentConfig(student, allScores, academicYear);
  const hasStudyTopic = gradeLevel >= 10 && cfg.studyTopicCodes.includes(subjectCode);
  const isExempted = cfg.exemptedCodes.includes(subjectCode);

  const txScores: Array<number | null> = [null, null, null, null];
  let chuyenDeScore: number | null = null;
  let gkScore: number | null = null;
  let ckScore: number | null = null;

  const txPass: Array<GdptPassStatus | null> = [null, null, null, null];
  let chuyenDePass: GdptPassStatus | null = null;
  let gkPass: GdptPassStatus | null = null;
  let ckPass: GdptPassStatus | null = null;
  let teacherComment = '';

  const studentScores = allScores.filter((s) => s.studentId === student.id);
  const legacyTxQueue: number[] = [];

  for (const rec of studentScores) {
    const meta = parseEmbeddedMeta(rec);
    if (meta && meta.kind === 'SCORE_ENTRY') {
      if (meta.subjectCode !== subjectCode || meta.semester !== semester) continue;
      if (meta.teacherComment && !teacherComment) teacherComment = meta.teacherComment;
      if (meta.scoreType === 'TX') {
        const idx = Math.min(4, Math.max(1, Number(meta.txIndex) || 1)) - 1;
        if (subj.evaluationType === 'SCORE' && typeof meta.scoreValue === 'number') {
          txScores[idx] = meta.scoreValue;
        } else if (subj.evaluationType === 'PASS_FAIL' && meta.passStatus) {
          txPass[idx] = meta.passStatus;
        }
      } else if (meta.scoreType === 'CHUYEN_DE') {
        if (subj.evaluationType === 'SCORE' && typeof meta.scoreValue === 'number') {
          chuyenDeScore = meta.scoreValue;
        } else if (subj.evaluationType === 'PASS_FAIL' && meta.passStatus) {
          chuyenDePass = meta.passStatus;
        }
      } else if (meta.scoreType === 'GK') {
        if (subj.evaluationType === 'SCORE' && typeof meta.scoreValue === 'number') {
          gkScore = meta.scoreValue;
        } else if (subj.evaluationType === 'PASS_FAIL' && meta.passStatus) {
          gkPass = meta.passStatus;
        }
      } else if (meta.scoreType === 'CK') {
        if (subj.evaluationType === 'SCORE' && typeof meta.scoreValue === 'number') {
          ckScore = meta.scoreValue;
        } else if (subj.evaluationType === 'PASS_FAIL' && meta.passStatus) {
          ckPass = meta.passStatus;
        }
      }
      continue;
    }

    // Tương thích ngược với các bản ghi điểm truyền thống trong HK1
    if (semester === 1 && !meta) {
      const code = resolveSubjectCodeFromNameOrCode(rec.subject);
      if (code !== subjectCode) continue;
      if (rec.aiSummary && !teacherComment) teacherComment = rec.aiSummary;
      if (subj.evaluationType === 'SCORE') {
        if (rec.examType === 'GIUA_KY' && gkScore === null) {
          gkScore = rec.score;
        } else if (rec.examType === 'CUOI_KY' && ckScore === null) {
          ckScore = rec.score;
        } else if (rec.examType === '15_PHUT' || rec.examType === '1_TIET') {
          legacyTxQueue.push(rec.score);
        }
      }
    }
  }

  for (let i = 0; i < Math.min(4, legacyTxQueue.length); i++) {
    if (txScores[i] === null) txScores[i] = legacyTxQueue[i];
  }

  return {
    studentId: student.id,
    subjectCode,
    semester,
    evaluationType: subj.evaluationType,
    requiredTxCount: curriculumItem?.requiredTxCount || 3,
    hasStudyTopic,
    isExempted,
    txScores,
    chuyenDeScore,
    gkScore,
    ckScore,
    txPass,
    chuyenDePass,
    gkPass,
    ckPass,
    teacherComment,
  };
}

export function buildStudentFullTranscript(
  student: Student,
  allScores: ScoreRecord[],
  academicYear = CURRENT_ACADEMIC_YEAR,
): {
  student: Student;
  gradeLevel: GdptGradeLevel;
  academicYear: string;
  enrollmentConfig: GdptStudentEnrollmentConfig;
  subjects: GdptSubjectSummaryResult[];
  overallStats: {
    hk1AvgAllScoreSubjects: number | null;
    hk2AvgAllScoreSubjects: number | null;
    fullYearAvgAllScoreSubjects: number | null;
    academicPerformanceHK1: 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đạt' | 'Chưa đủ điểm';
    academicPerformanceHK2: 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đạt' | 'Chưa đủ điểm';
    academicPerformanceFullYear: 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đạt' | 'Chưa đủ điểm';
  };
} {
  const gradeLevel = normalizeGdptGradeLevel(student.grade, student.centerClass);
  const enrollmentConfig = getStudentEnrollmentConfig(student, allScores, academicYear);
  const enrolledCurriculum = getEnrolledCurriculumForStudent(student, allScores, academicYear);

  const subjects: GdptSubjectSummaryResult[] = enrolledCurriculum.map((item) => {
    const rowHk1 = extractStudentSubjectSemesterRow(
      student,
      item.subjectCode,
      1,
      allScores,
      academicYear,
    );
    const rowHk2 = extractStudentSubjectSemesterRow(
      student,
      item.subjectCode,
      2,
      allScores,
      academicYear,
    );

    const calcHk1 = calculateSemesterSummary(rowHk1);
    const calcHk2 = calculateSemesterSummary(rowHk2);
    const calcFull = calculateFullYearSummary(item.evaluationType, calcHk1, calcHk2);

    return {
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      evaluationType: item.evaluationType,
      requirementType: item.requirementType,
      periodsPerYear: item.periodsPerYear,
      requiredTxCount: item.requiredTxCount,
      hasStudyTopic: item.hasStudyTopic,
      isExempted: item.isExempted,
      hk1: {
        row: rowHk1,
        ...calcHk1,
      },
      hk2: {
        row: rowHk2,
        ...calcHk2,
      },
      fullYear: {
        ...calcFull,
        teacherComment: rowHk2.teacherComment || rowHk1.teacherComment || '',
      },
    };
  });

  // Phân loại Kết quả học tập theo Điều 9, Thông tư 22/2021/TT-BGDĐT
  function classifyPeriod(period: 'hk1' | 'hk2' | 'fullYear'): {
    avgAll: number | null;
    rating: 'Tốt' | 'Khá' | 'Đạt' | 'Chưa đạt' | 'Chưa đủ điểm';
  } {
    const scoreVals = subjects
      .filter((s) => s.evaluationType === 'SCORE')
      .map((s) => s[period].avgScore)
      .filter((v): v is number => typeof v === 'number');
    const passVals = subjects
      .filter((s) => s.evaluationType === 'PASS_FAIL')
      .map((s) => s[period].passStatus)
      .filter((v): v is GdptPassStatus => v === 'DAT' || v === 'CHUA_DAT');

    if (scoreVals.length === 0 && passVals.length === 0) {
      return { avgAll: null, rating: 'Chưa đủ điểm' };
    }

    const avgAll =
      scoreVals.length > 0
        ? roundHalfUp1(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length)
        : null;

    if (passVals.some((p) => p === 'CHUA_DAT') || scoreVals.some((v) => v < 3.5)) {
      return { avgAll, rating: 'Chưa đạt' };
    }
    if (scoreVals.length >= 3) {
      const allAbove65 = scoreVals.every((v) => v >= 6.5);
      const countAbove80 = scoreVals.filter((v) => v >= 8.0).length;
      if (allAbove65 && countAbove80 >= Math.min(6, scoreVals.length)) {
        return { avgAll, rating: 'Tốt' };
      }
      const allAbove50 = scoreVals.every((v) => v >= 5.0);
      const countAbove65 = scoreVals.filter((v) => v >= 6.5).length;
      if (allAbove50 && countAbove65 >= Math.min(6, scoreVals.length)) {
        return { avgAll, rating: 'Khá' };
      }
      const countAbove50 = scoreVals.filter((v) => v >= 5.0).length;
      if (countAbove50 >= Math.min(6, scoreVals.length)) {
        return { avgAll, rating: 'Đạt' };
      }
      return { avgAll, rating: 'Chưa đạt' };
    }

    if (avgAll !== null) {
      if (avgAll >= 8.0) return { avgAll, rating: 'Tốt' };
      if (avgAll >= 6.5) return { avgAll, rating: 'Khá' };
      if (avgAll >= 5.0) return { avgAll, rating: 'Đạt' };
      return { avgAll, rating: 'Chưa đạt' };
    }
    return { avgAll, rating: 'Đạt' };
  }

  const pHk1 = classifyPeriod('hk1');
  const pHk2 = classifyPeriod('hk2');
  const pFull = classifyPeriod('fullYear');

  return {
    student,
    gradeLevel,
    academicYear,
    enrollmentConfig,
    subjects,
    overallStats: {
      hk1AvgAllScoreSubjects: pHk1.avgAll,
      hk2AvgAllScoreSubjects: pHk2.avgAll,
      fullYearAvgAllScoreSubjects: pFull.avgAll,
      academicPerformanceHK1: pHk1.rating,
      academicPerformanceHK2: pHk2.rating,
      academicPerformanceFullYear: pFull.rating,
    },
  };
}

// ============================================================================
// 7. ĐÓNG GÓI BẢN GHI UPSERT HÀNG LOẠT LÊN CLOUDFLARE WORKER + D1
// ============================================================================

export interface GdptBatchUpsertItem {
  id: string;
  studentId: string;
  subject: string;
  examType: '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY';
  score: number;
  date: string;
  aiSummary?: string;
  strengths: string[];
  delete?: boolean;
  gdptSqlRow?: {
    studentId: string;
    academicYear: string;
    gradeLevel: number;
    subjectCode: string;
    semester: 1 | 2;
    scoreType: GdptScoreType;
    txIndex: number;
    weight: 1 | 2 | 3;
    scoreValue: number | null;
    passStatus: GdptPassStatus | null;
    teacherComment?: string;
  };
}

export function buildBatchUpsertItemsForRow(
  student: Student,
  row: GdptSemesterInputRow,
  academicYear = CURRENT_ACADEMIC_YEAR,
): GdptBatchUpsertItem[] {
  const subj = SUBJECT_BY_CODE.get(row.subjectCode)!;
  const gradeLevel = normalizeGdptGradeLevel(student.grade, student.centerClass);
  const today = new Date().toISOString().slice(0, 10);
  const items: GdptBatchUpsertItem[] = [];

  const pushCell = (
    scoreType: GdptScoreType,
    txIndex: number,
    weight: 1 | 2 | 3,
    examType: '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY',
    scoreValue: number | null,
    passStatus: GdptPassStatus | null,
    label: string,
  ) => {
    const id = `gdpt::${academicYear}::${student.id}::${row.subjectCode}::HK${row.semester}::${scoreType}_${txIndex}`;
    const isEmpty =
      subj.evaluationType === 'SCORE'
        ? scoreValue === null || scoreValue === undefined || Number.isNaN(scoreValue)
        : passStatus !== 'DAT' && passStatus !== 'CHUA_DAT';

    if (isEmpty) {
      items.push({
        id,
        studentId: student.id,
        subject: subj.name,
        examType,
        score: 0,
        date: today,
        strengths: [],
        delete: true,
      });
      return;
    }

    const cleanScore =
      subj.evaluationType === 'SCORE'
        ? roundHalfUp1(Math.max(0, Math.min(10, Number(scoreValue))))
        : passStatus === 'DAT'
          ? 10
          : 0;

    const meta: EmbeddedGdptMeta = {
      _gdpt2018: true,
      kind: 'SCORE_ENTRY',
      academicYear,
      subjectCode: row.subjectCode,
      semester: row.semester,
      scoreType,
      txIndex,
      weight,
      evaluationType: subj.evaluationType,
      scoreValue: subj.evaluationType === 'SCORE' ? cleanScore : null,
      passStatus: subj.evaluationType === 'PASS_FAIL' ? passStatus : null,
      teacherComment: row.teacherComment?.trim() || undefined,
    };

    const summaryPrefix = `[HK${row.semester} · ${label} · HS${weight}]`;
    const displayResult =
      subj.evaluationType === 'SCORE'
        ? `${cleanScore.toFixed(1)}/10`
        : passStatus === 'DAT'
          ? 'Đạt (Đ)'
          : 'Chưa đạt (CĐ)';

    items.push({
      id,
      studentId: student.id,
      subject: subj.name,
      examType,
      score: cleanScore,
      date: today,
      aiSummary: row.teacherComment?.trim()
        ? `${summaryPrefix} ${displayResult} — ${row.teacherComment.trim()}`
        : `${summaryPrefix} ${displayResult}`,
      strengths: [JSON.stringify(meta)],
      gdptSqlRow: {
        studentId: student.id,
        academicYear,
        gradeLevel,
        subjectCode: row.subjectCode,
        semester: row.semester,
        scoreType,
        txIndex,
        weight,
        scoreValue: subj.evaluationType === 'SCORE' ? cleanScore : null,
        passStatus: subj.evaluationType === 'PASS_FAIL' ? passStatus : null,
        teacherComment: row.teacherComment?.trim() || undefined,
      },
    });
  };

  for (let i = 0; i < 4; i++) {
    const active = i < row.requiredTxCount;
    pushCell(
      'TX',
      i + 1,
      1,
      '15_PHUT',
      active ? row.txScores[i] : null,
      active ? row.txPass[i] : null,
      `ĐĐGtx ${i + 1}`,
    );
  }

  pushCell(
    'CHUYEN_DE',
    1,
    1,
    '1_TIET',
    row.hasStudyTopic ? row.chuyenDeScore : null,
    row.hasStudyTopic ? row.chuyenDePass : null,
    'Chuyên đề học tập',
  );

  pushCell('GK', 1, 2, 'GIUA_KY', row.gkScore, row.gkPass, 'Giữa kì');
  pushCell('CK', 1, 3, 'CUOI_KY', row.ckScore, row.ckPass, 'Cuối kì');

  return items;
}

export function buildEnrollmentConfigUpsertItem(
  student: Student,
  config: GdptStudentEnrollmentConfig,
): GdptBatchUpsertItem {
  const id = `gdpt-cfg::${config.academicYear}::${student.id}`;
  const meta: EmbeddedGdptMeta = {
    _gdpt2018: true,
    kind: 'ENROLLMENT_CONFIG',
    academicYear: config.academicYear,
    electiveCodes: config.electiveCodes,
    studyTopicCodes: config.studyTopicCodes,
    optionalCodes: config.optionalCodes,
    exemptedCodes: config.exemptedCodes,
  };
  return {
    id,
    studentId: student.id,
    subject: 'Cấu hình Tổ hợp Môn GDPT 2018',
    examType: '15_PHUT',
    score: 10,
    date: new Date().toISOString().slice(0, 10),
    aiSummary: `Khối ${config.gradeLevel} · Tự chọn THPT: ${config.electiveCodes.join(', ') || 'THCS'} · Chuyên đề: ${config.studyTopicCodes.join(', ') || 'Không'}`,
    strengths: [JSON.stringify(meta)],
  };
}
