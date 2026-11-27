import type {
  AttendanceRecord,
  DatabaseState,
  DataHealthIssue,
  DataHealthReport,
  FamilyProfile,
  PrintTemplate,
  Room,
  ScoreRecord,
  Student,
  Teacher,
  TeacherLeave,
  TimetableSlot,
  TuitionRecord,
} from '../types';
import { normalizePhoneVN } from './identityPolicy';
import { buildDeterministicQrToken, generateSmartStudentCode } from './smartCodeAndQr';

// ============================================================
// 1. PRINT DIRECTORY COLUMN CATALOG & 3 SYSTEM PRESETS EACH
// ============================================================

export interface PrintColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export const STUDENT_PRINT_COLUMNS: PrintColumnDef[] = [
  { key: 'code', label: 'Mã HS (NT26)', shortLabel: 'Mã HS', width: '105px' },
  { key: 'fullName', label: 'Họ và tên Học sinh', shortLabel: 'Họ và tên', width: '160px' },
  { key: 'centerClass', label: 'Lớp Trung tâm', shortLabel: 'Lớp TT', width: '88px' },
  { key: 'gradeLevel', label: 'Khối / Cấp học', shortLabel: 'Khối', width: '80px', align: 'center' },
  { key: 'schoolClass', label: 'Lớp trường', width: '74px', align: 'center' },
  { key: 'school', label: 'Trường học', width: '150px' },
  { key: 'homeroomTeacher', label: 'GV phụ trách', width: '100px' },
  { key: 'room', label: 'Phòng học', width: '80px', align: 'center' },
  { key: 'parentName', label: 'Phụ huynh', width: '125px' },
  { key: 'parentPhone', label: 'SĐT Zalo PH', width: '102px' },
  { key: 'services', label: 'Gói học & Dịch vụ', shortLabel: 'Dịch vụ', width: '145px' },
  { key: 'enrolledSubjects', label: 'Môn đăng ký', width: '120px' },
  { key: 'accessPin', label: 'Mã PIN / Liên kết', shortLabel: 'PIN', width: '88px', align: 'center' },
  { key: 'status', label: 'Trạng thái', width: '86px', align: 'center' },
];

export const TEACHER_PRINT_COLUMNS: PrintColumnDef[] = [
  { key: 'name', label: 'Họ và tên Giáo viên', shortLabel: 'Họ và tên', width: '165px' },
  { key: 'shortName', label: 'Tên hiển thị TKB', shortLabel: 'Tên TKB', width: '96px' },
  { key: 'teacherGroup', label: 'Phân nhóm GV', shortLabel: 'Nhóm GV', width: '115px' },
  { key: 'subjects', label: 'Môn giảng dạy', width: '130px' },
  { key: 'degree', label: 'Trình độ / Bằng cấp', shortLabel: 'Trình độ', width: '145px' },
  { key: 'experienceYears', label: 'Kinh nghiệm', shortLabel: 'KN', width: '74px', align: 'right' },
  { key: 'phone', label: 'Số điện thoại', shortLabel: 'SĐT', width: '105px' },
  { key: 'email', label: 'Gmail công vụ', shortLabel: 'Email', width: '155px' },
  { key: 'roomDefault', label: 'Phòng mặc định', shortLabel: 'Phòng', width: '92px', align: 'center' },
  { key: 'weeklySlots', label: 'Số ca/tuần', shortLabel: 'Ca/tuần', width: '76px', align: 'right' },
  { key: 'assignedClasses', label: 'Lớp đang dạy', width: '130px' },
  { key: 'status', label: 'Trạng thái', width: '90px', align: 'center' },
];

export const DEFAULT_SYSTEM_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: 'tpl-stu-simple',
    name: 'Mẫu Đơn giản (Điểm danh & Ký tên)',
    description: 'Gọn nhẹ 1 trang A4 dọc, có sẵn cột điểm danh và ký tên đầu giờ.',
    entityType: 'STUDENTS',
    presetBase: 'SIMPLE',
    customTitle: 'DANH SÁCH HỌC SINH LỚP HỌC',
    orientation: 'portrait',
    fontSize: 'md',
    groupBy: 'CLASS',
    columns: ['code', 'fullName', 'centerClass', 'schoolClass', 'parentPhone'],
    extraBlankColumns: ['Điểm danh', 'Ghi chú / Ký tên'],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: true,
      showSignatures: true,
      signatureLabels: ['Giáo viên phụ trách', 'Quản lý học vụ'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  {
    id: 'tpl-stu-full',
    name: 'Mẫu Đầy đủ (Hồ sơ Hành chính Lớp)',
    description: 'Bản A4 ngang tổng hợp toàn diện trường lớp, phụ huynh, gói học, bán trú & đưa rước.',
    entityType: 'STUDENTS',
    presetBase: 'FULL',
    customTitle: 'BẢNG TỔNG HỢP HỒ SƠ HỌC SINH TRUNG TÂM NHÂN TRÍ',
    orientation: 'landscape',
    fontSize: 'sm',
    groupBy: 'CLASS',
    columns: [
      'code',
      'fullName',
      'centerClass',
      'schoolClass',
      'school',
      'homeroomTeacher',
      'room',
      'parentName',
      'parentPhone',
      'services',
      'status',
    ],
    extraBlankColumns: [],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: true,
      showSignatures: true,
      signatureLabels: ['Người lập biểu', 'Quản lý học vụ', 'Giám đốc Trung tâm'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  {
    id: 'tpl-stu-custom-checkin',
    name: 'Mẫu Tùy biến (Bảng theo dõi 4 buổi)',
    description: 'Mẫu linh hoạt kèm 4 cột trống theo dõi chuyên cần, bài tập hoặc thu học phí.',
    entityType: 'STUDENTS',
    presetBase: 'CUSTOM',
    customTitle: 'BẢNG THEO DÕI CHUYÊN CẦN & BÀI TẬP TUẦN',
    orientation: 'landscape',
    fontSize: 'md',
    groupBy: 'CLASS',
    columns: ['code', 'fullName', 'centerClass', 'homeroomTeacher', 'parentPhone'],
    extraBlankColumns: ['Buổi 1', 'Buổi 2', 'Buổi 3', 'Buổi 4'],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: false,
      showSignatures: true,
      signatureLabels: ['Giáo viên chủ nhiệm', 'Xác nhận Trung tâm'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  {
    id: 'tpl-tea-simple',
    name: 'Mẫu Đơn giản (Danh bạ & Phân công GV)',
    description: 'Bản A4 dọc gọn gàng gồm họ tên, nhóm GV, môn dạy, SĐT và phòng mặc định.',
    entityType: 'TEACHERS',
    presetBase: 'SIMPLE',
    customTitle: 'DANH SÁCH ĐỘI NGŨ GIÁO VIÊN TRUNG TÂM NHÂN TRÍ',
    orientation: 'portrait',
    fontSize: 'md',
    groupBy: 'TEACHER_GROUP',
    columns: ['name', 'teacherGroup', 'subjects', 'phone', 'roomDefault'],
    extraBlankColumns: ['Ký xác nhận'],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: true,
      showSignatures: true,
      signatureLabels: ['Quản lý học vụ', 'Giám đốc Trung tâm'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  {
    id: 'tpl-tea-full',
    name: 'Mẫu Đầy đủ (Hồ sơ Chuyên môn & Khối lượng dạy)',
    description: 'Bản A4 ngang hiển thị đầy đủ trình độ, kinh nghiệm, Gmail, số ca/tuần và lớp phụ trách.',
    entityType: 'TEACHERS',
    presetBase: 'FULL',
    customTitle: 'BẢNG TỔNG HỢP NHÂN SỰ & PHÂN CÔNG GIẢNG DẠY',
    orientation: 'landscape',
    fontSize: 'sm',
    groupBy: 'TEACHER_GROUP',
    columns: [
      'name',
      'shortName',
      'teacherGroup',
      'subjects',
      'degree',
      'experienceYears',
      'phone',
      'email',
      'roomDefault',
      'weeklySlots',
      'assignedClasses',
      'status',
    ],
    extraBlankColumns: [],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: true,
      showSignatures: true,
      signatureLabels: ['Người lập bảng', 'Quản lý chuyên môn', 'Giám đốc Trung tâm'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  {
    id: 'tpl-tea-custom-payroll',
    name: 'Mẫu Tùy biến (Chấm công & Nhận xét ca dạy)',
    description: 'Bản tùy biến có thêm cột tổng giờ thực dạy và ký nhận bảng công.',
    entityType: 'TEACHERS',
    presetBase: 'CUSTOM',
    customTitle: 'BẢNG CHẤM CÔNG & XÁC NHẬN CA GIẢNG DẠY',
    orientation: 'landscape',
    fontSize: 'md',
    groupBy: 'NONE',
    columns: ['name', 'teacherGroup', 'subjects', 'weeklySlots', 'assignedClasses'],
    extraBlankColumns: ['Số ca thực dạy', 'Ghi chú', 'Ký nhận'],
    blocks: {
      showLogoHeader: true,
      showWatermark: true,
      showFilterSummary: true,
      showRowNumbers: true,
      showSummaryStats: true,
      showSignatures: true,
      signatureLabels: ['Kế toán / Học vụ', 'Giám đốc Trung tâm'],
    },
    isSystemDefault: true,
    createdBy: 'SYSTEM',
    updatedBy: 'SYSTEM',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
];

export function ensureSystemPrintTemplates(existing?: PrintTemplate[]): PrintTemplate[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const existingIds = new Set(list.map((t) => t.id));
  for (const sys of DEFAULT_SYSTEM_PRINT_TEMPLATES) {
    if (!existingIds.has(sys.id)) {
      list.push(structuredClone(sys));
    }
  }
  return list;
}

// ============================================================
// 2. O(1) WORKSPACE INDEX LAYER (ZERO O(N*M) CROSS-LOOKUPS)
// ============================================================

export interface WorkspaceIndexes {
  teacherById: Map<string, Teacher>;
  teacherByNameKey: Map<string, Teacher>;
  studentById: Map<string, Student>;
  roomById: Map<string, Room>;
  roomByNameKey: Map<string, Room>;
  familyById: Map<string, FamilyProfile>;
  slotsByTeacherId: Map<string, TimetableSlot[]>;
  slotsByClassKey: Map<string, TimetableSlot[]>;
  studentsByClassKey: Map<string, Student[]>;
  studentsByTeacherId: Map<string, Student[]>;
  scoresByStudentId: Map<string, ScoreRecord[]>;
  tuitionByStudentId: Map<string, TuitionRecord[]>;
  attendanceByStudentId: Map<string, AttendanceRecord[]>;
  pendingLeavesByTeacherId: Map<string, TeacherLeave[]>;
}

export function normalizeLookupKey(raw?: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

export function buildWorkspaceIndexes(data: {
  teachers: Teacher[];
  students: Student[];
  rooms: Room[];
  families: FamilyProfile[];
  timetable: TimetableSlot[];
  scores: ScoreRecord[];
  tuition: TuitionRecord[];
  attendance: AttendanceRecord[];
  teacherLeaves?: TeacherLeave[];
}): WorkspaceIndexes {
  const teacherById = new Map<string, Teacher>();
  const teacherByNameKey = new Map<string, Teacher>();
  for (const t of data.teachers) {
    teacherById.set(t.id, t);
    if (t.name) teacherByNameKey.set(normalizeLookupKey(t.name), t);
    if (t.shortName) teacherByNameKey.set(normalizeLookupKey(t.shortName), t);
  }

  const roomById = new Map<string, Room>();
  const roomByNameKey = new Map<string, Room>();
  for (const r of data.rooms) {
    roomById.set(r.id, r);
    if (r.name) roomByNameKey.set(normalizeLookupKey(r.name), r);
    if (r.code) roomByNameKey.set(normalizeLookupKey(r.code), r);
  }

  const familyById = new Map<string, FamilyProfile>();
  for (const f of data.families) {
    familyById.set(f.id, f);
  }

  const slotsByTeacherId = new Map<string, TimetableSlot[]>();
  const slotsByClassKey = new Map<string, TimetableSlot[]>();
  for (const slot of data.timetable) {
    if (slot.status === 'OFF') continue;
    const tList = slotsByTeacherId.get(slot.teacherId) || [];
    tList.push(slot);
    slotsByTeacherId.set(slot.teacherId, tList);

    const cKey = normalizeLookupKey(slot.centerClass);
    const cList = slotsByClassKey.get(cKey) || [];
    cList.push(slot);
    slotsByClassKey.set(cKey, cList);
  }

  const studentById = new Map<string, Student>();
  const studentsByClassKey = new Map<string, Student[]>();
  const studentsByTeacherId = new Map<string, Student[]>();

  for (const st of data.students) {
    studentById.set(st.id, st);

    const classKeys = new Set<string>([
      normalizeLookupKey(st.centerClass),
      ...(st.enrolledClasses || []).map((c) => normalizeLookupKey(c)),
    ]);
    for (const ck of classKeys) {
      if (!ck) continue;
      const list = studentsByClassKey.get(ck) || [];
      list.push(st);
      studentsByClassKey.set(ck, list);
    }

    const matchedTeacherIds = new Set<string>();
    if (st.homeroomTeacherId && teacherById.has(st.homeroomTeacherId)) {
      matchedTeacherIds.add(st.homeroomTeacherId);
    } else if (st.homeroomTeacher) {
      const byName = teacherByNameKey.get(normalizeLookupKey(st.homeroomTeacher));
      if (byName) matchedTeacherIds.add(byName.id);
    }
    for (const ck of classKeys) {
      const classSlots = slotsByClassKey.get(ck) || [];
      for (const sl of classSlots) {
        if (sl.teacherId) matchedTeacherIds.add(sl.teacherId);
      }
    }
    for (const tid of matchedTeacherIds) {
      const list = studentsByTeacherId.get(tid) || [];
      list.push(st);
      studentsByTeacherId.set(tid, list);
    }
  }

  const scoresByStudentId = new Map<string, ScoreRecord[]>();
  for (const sc of data.scores) {
    const list = scoresByStudentId.get(sc.studentId) || [];
    list.push(sc);
    scoresByStudentId.set(sc.studentId, list);
  }

  const tuitionByStudentId = new Map<string, TuitionRecord[]>();
  for (const tu of data.tuition) {
    const list = tuitionByStudentId.get(tu.studentId) || [];
    list.push(tu);
    tuitionByStudentId.set(tu.studentId, list);
  }

  const attendanceByStudentId = new Map<string, AttendanceRecord[]>();
  for (const att of data.attendance) {
    const list = attendanceByStudentId.get(att.studentId) || [];
    list.push(att);
    attendanceByStudentId.set(att.studentId, list);
  }

  const pendingLeavesByTeacherId = new Map<string, TeacherLeave[]>();
  for (const lv of data.teacherLeaves || []) {
    if (lv.status !== 'PENDING') continue;
    const list = pendingLeavesByTeacherId.get(lv.teacherId) || [];
    list.push(lv);
    pendingLeavesByTeacherId.set(lv.teacherId, list);
  }

  return {
    teacherById,
    teacherByNameKey,
    studentById,
    roomById,
    roomByNameKey,
    familyById,
    slotsByTeacherId,
    slotsByClassKey,
    studentsByClassKey,
    studentsByTeacherId,
    scoresByStudentId,
    tuitionByStudentId,
    attendanceByStudentId,
    pendingLeavesByTeacherId,
  };
}

// ============================================================
// 3. CASCADE INTEGRITY ENGINE (ZERO STALE DISPLAY NAMES)
// ============================================================

export function cascadeSyncTeacherUpdate(
  db: DatabaseState,
  teacher: Teacher,
  prevName?: string,
  prevShortName?: string,
): { updatedSlots: number; updatedStudents: number; updatedLeaves: number } {
  const prevKeys = new Set(
    [prevName, prevShortName, teacher.name, teacher.shortName]
      .filter(Boolean)
      .map((s) => normalizeLookupKey(s)),
  );
  const displayName = teacher.shortName || teacher.name;

  let updatedSlots = 0;
  for (const slot of db.timetable) {
    if (slot.teacherId === teacher.id && slot.teacherName !== displayName) {
      slot.teacherName = displayName;
      updatedSlots++;
    }
  }

  let updatedStudents = 0;
  for (const st of db.students) {
    const matchesById = st.homeroomTeacherId === teacher.id;
    const matchesByOldName =
      !st.homeroomTeacherId && prevKeys.has(normalizeLookupKey(st.homeroomTeacher));
    if (matchesById || matchesByOldName) {
      if (st.homeroomTeacherId !== teacher.id || st.homeroomTeacher !== displayName) {
        st.homeroomTeacherId = teacher.id;
        st.homeroomTeacher = displayName;
        updatedStudents++;
      }
    }
  }

  let updatedLeaves = 0;
  for (const lv of db.teacherLeaves || []) {
    if (lv.teacherId === teacher.id && lv.teacherName !== displayName) {
      lv.teacherName = displayName;
      updatedLeaves++;
    }
  }

  return { updatedSlots, updatedStudents, updatedLeaves };
}

export function cascadeSyncRoomUpdate(
  db: DatabaseState,
  room: Room,
  prevName?: string,
): { updatedSlots: number; updatedStudents: number; updatedTeachers: number } {
  const prevKey = normalizeLookupKey(prevName);

  let updatedSlots = 0;
  for (const slot of db.timetable) {
    const matchId = slot.roomId === room.id;
    const matchName = !slot.roomId && prevKey && normalizeLookupKey(slot.room) === prevKey;
    if (matchId || matchName) {
      if (slot.roomId !== room.id || slot.room !== room.name) {
        slot.roomId = room.id;
        slot.room = room.name;
        updatedSlots++;
      }
    }
  }

  let updatedStudents = 0;
  for (const st of db.students) {
    const matchId = st.roomId === room.id;
    const matchName = !st.roomId && prevKey && normalizeLookupKey(st.room) === prevKey;
    if (matchId || matchName) {
      if (st.roomId !== room.id || st.room !== room.name) {
        st.roomId = room.id;
        st.room = room.name;
        updatedStudents++;
      }
    }
  }

  let updatedTeachers = 0;
  for (const t of db.teachers) {
    if (prevKey && normalizeLookupKey(t.roomDefault) === prevKey && t.roomDefault !== room.name) {
      t.roomDefault = room.name;
      updatedTeachers++;
    }
  }

  return { updatedSlots, updatedStudents, updatedTeachers };
}

export function cascadeSyncStudentUpdate(
  db: DatabaseState,
  student: Student,
): { updatedScores: number; updatedAttendance: number; updatedTuition: number } {
  // Resolve canonical homeroomTeacherId and roomId if missing
  if (!student.homeroomTeacherId && student.homeroomTeacher) {
    const key = normalizeLookupKey(student.homeroomTeacher);
    const t = db.teachers.find(
      (item) => normalizeLookupKey(item.shortName) === key || normalizeLookupKey(item.name) === key,
    );
    if (t) {
      student.homeroomTeacherId = t.id;
      student.homeroomTeacher = t.shortName || t.name;
    }
  } else if (student.homeroomTeacherId) {
    const t = db.teachers.find((item) => item.id === student.homeroomTeacherId);
    if (t) student.homeroomTeacher = t.shortName || t.name;
  }

  if (!student.roomId && student.room) {
    const key = normalizeLookupKey(student.room);
    const r = db.rooms.find(
      (item) => normalizeLookupKey(item.name) === key || normalizeLookupKey(item.code) === key,
    );
    if (r) {
      student.roomId = r.id;
      student.room = r.name;
    }
  } else if (student.roomId) {
    const r = db.rooms.find((item) => item.id === student.roomId);
    if (r) student.room = r.name;
  }

  // Ensure enrolledClasses includes centerClass
  if (!Array.isArray(student.enrolledClasses) || student.enrolledClasses.length === 0) {
    student.enrolledClasses = [student.centerClass];
  } else if (!student.enrolledClasses.includes(student.centerClass)) {
    student.enrolledClasses = [student.centerClass, ...student.enrolledClasses];
  }

  // Cascade studentName & centerClass to dependent tables
  let updatedScores = 0;
  for (const sc of db.scores) {
    if (sc.studentId === student.id) {
      if (sc.studentName !== student.fullName || sc.centerClass !== student.centerClass) {
        sc.studentName = student.fullName;
        sc.centerClass = student.centerClass;
        updatedScores++;
      }
    }
  }

  let updatedAttendance = 0;
  for (const att of db.attendance) {
    if (att.studentId === student.id) {
      if (att.studentName !== student.fullName || att.centerClass !== student.centerClass) {
        att.studentName = student.fullName;
        att.centerClass = student.centerClass;
        updatedAttendance++;
      }
    }
  }

  let updatedTuition = 0;
  for (const tu of db.tuition) {
    if (tu.studentId === student.id) {
      if (
        tu.studentName !== student.fullName ||
        tu.centerClass !== student.centerClass ||
        tu.parentPhone !== student.parentPhone
      ) {
        tu.studentName = student.fullName;
        tu.centerClass = student.centerClass;
        tu.parentPhone = student.parentPhone;
        if (student.familyId) tu.familyId = student.familyId;
        updatedTuition++;
      }
    }
  }

  return { updatedScores, updatedAttendance, updatedTuition };
}

// ============================================================
// 4. DATA HEALTH AUDIT & 1-CLICK AUTO-REPAIR ENGINE
// ============================================================

export function auditDatabaseHealth(db: DatabaseState): DataHealthReport {
  const issues: DataHealthIssue[] = [];
  const teacherIds = new Set(db.teachers.map((t) => t.id));
  const roomIds = new Set(db.rooms.map((r) => r.id));
  const studentIds = new Set(db.students.map((s) => s.id));

  // 1. Check Timetable slots for missing/orphan teacherId or roomId
  for (const slot of db.timetable) {
    if (!teacherIds.has(slot.teacherId)) {
      issues.push({
        id: `issue-tt-teacher-${slot.id}`,
        severity: 'HIGH',
        category: 'ORPHAN_TIMETABLE_TEACHER',
        entityLabel: `TKB ${slot.centerClass} (${slot.day} · ${slot.subject})`,
        detail: `Ca học đang trỏ tới mã GV "${slot.teacherId}" (${slot.teacherName}) chưa khớp trong danh sách Giáo viên.`,
        autoFixable: true,
      });
    }
    if (!slot.roomId || !roomIds.has(slot.roomId)) {
      issues.push({
        id: `issue-tt-room-${slot.id}`,
        severity: 'MEDIUM',
        category: 'ORPHAN_TIMETABLE_ROOM',
        entityLabel: `TKB ${slot.centerClass} (${slot.day} · ${slot.room})`,
        detail: `Ca học chưa liên kết mã Phòng học chuẩn (roomId) cho "${slot.room}".`,
        autoFixable: true,
      });
    }
  }

  // 2. Check Students for missing foreign keys, missing QR token, duplicate codes, unlinked families
  const codeCounts = new Map<string, number>();
  const studentsByPhone = new Map<string, Student[]>();
  for (const st of db.students) {
    const codeKey = st.code.trim().toUpperCase();
    codeCounts.set(codeKey, (codeCounts.get(codeKey) || 0) + 1);

    if (!st.qrToken) {
      issues.push({
        id: `issue-qr-${st.id}`,
        severity: 'MEDIUM',
        category: 'MISSING_QR_TOKEN',
        entityLabel: `${st.fullName} (${st.code})`,
        detail: 'Học sinh chưa có Mã QR động (qrToken).',
        autoFixable: true,
      });
    }

    if (!st.homeroomTeacherId || !st.roomId) {
      issues.push({
        id: `issue-stu-fk-${st.id}`,
        severity: 'LOW',
        category: 'MISSING_STUDENT_FK',
        entityLabel: `${st.fullName} (${st.code})`,
        detail: 'Chưa gắn mã khóa ngoại GV chủ nhiệm (homeroomTeacherId) hoặc Phòng học (roomId).',
        autoFixable: true,
      });
    }

    const normPhone = normalizePhoneVN(st.parentPhone);
    if (normPhone.length >= 8) {
      const list = studentsByPhone.get(normPhone) || [];
      list.push(st);
      studentsByPhone.set(normPhone, list);
    }
  }

  for (const [code, count] of codeCounts.entries()) {
    if (count > 1) {
      issues.push({
        id: `issue-dup-code-${code}`,
        severity: 'HIGH',
        category: 'DUPLICATE_STUDENT_CODE',
        entityLabel: `Mã HS ${code}`,
        detail: `Phát hiện ${count} học sinh dùng trùng mã "${code}". Cần cấp lại mã chuẩn NT26.`,
        autoFixable: true,
      });
    }
  }

  for (const [phone, siblings] of studentsByPhone.entries()) {
    if (siblings.length >= 2) {
      const familyIds = new Set(siblings.map((s) => s.familyId).filter(Boolean));
      if (familyIds.size !== 1 || siblings.some((s) => !s.familyId)) {
        issues.push({
          id: `issue-fam-${phone}`,
          severity: 'MEDIUM',
          category: 'UNLINKED_FAMILY_SIBLING',
          entityLabel: `Gia đình SĐT ${siblings[0].parentPhone}`,
          detail: `${siblings.length} anh chị em (${siblings.map((s) => s.fullName).join(', ')}) dùng chung SĐT nhưng chưa gom về cùng 1 mã Gia đình (familyId).`,
          autoFixable: true,
        });
      }
    }
  }

  // 3. Check Scores & Tuition for orphan studentId
  for (const sc of db.scores) {
    if (!studentIds.has(sc.studentId)) {
      issues.push({
        id: `issue-score-orphan-${sc.id}`,
        severity: 'MEDIUM',
        category: 'ORPHAN_SCORE_OR_TUITION',
        entityLabel: `Điểm ${sc.subject} (${sc.studentName})`,
        detail: `Cột điểm trỏ tới học sinh không tồn tại (${sc.studentId}).`,
        autoFixable: false,
      });
    }
  }

  for (const tu of db.tuition) {
    if (!studentIds.has(tu.studentId)) {
      issues.push({
        id: `issue-tuition-orphan-${tu.id}`,
        severity: 'HIGH',
        category: 'ORPHAN_SCORE_OR_TUITION',
        entityLabel: `Học phí ${tu.monthLabel} (${tu.studentName})`,
        detail: `Phiếu học phí trỏ tới học sinh không tồn tại (${tu.studentId}).`,
        autoFixable: false,
      });
    }
  }

  const totalChecks =
    db.teachers.length + db.students.length * 2 + db.timetable.length * 2 + db.scores.length + db.tuition.length;
  const penalty = issues.reduce(
    (sum, item) => sum + (item.severity === 'HIGH' ? 8 : item.severity === 'MEDIUM' ? 4 : 1),
    0,
  );
  const healthyScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    checkedAt: new Date().toISOString(),
    totalChecks,
    healthyScore,
    issues,
    stats: {
      teachers: db.teachers.length,
      students: db.students.length,
      families: db.families.length,
      rooms: db.rooms.length,
      timetableSlots: db.timetable.length,
      scores: db.scores.length,
      tuition: db.tuition.length,
      printTemplates: (db.printTemplates || []).length,
    },
  };
}

export function repairDatabaseHealth(db: DatabaseState): {
  fixedCount: number;
  summary: string[];
  reportAfter: DataHealthReport;
} {
  let fixedCount = 0;
  const summary: string[] = [];

  // 1. Backfill Print Templates
  const beforeTpl = (db.printTemplates || []).length;
  db.printTemplates = ensureSystemPrintTemplates(db.printTemplates);
  if (db.printTemplates.length > beforeTpl) {
    fixedCount += db.printTemplates.length - beforeTpl;
    summary.push(`Bổ sung ${db.printTemplates.length - beforeTpl} mẫu in chuẩn trung tâm.`);
  }

  // 2. Fix Timetable roomId and teacherId links
  let fixedTt = 0;
  for (const slot of db.timetable) {
    if (!db.teachers.some((t) => t.id === slot.teacherId)) {
      const key = normalizeLookupKey(slot.teacherName);
      const matched = db.teachers.find(
        (t) => normalizeLookupKey(t.shortName) === key || normalizeLookupKey(t.name) === key,
      );
      if (matched) {
        slot.teacherId = matched.id;
        slot.teacherName = matched.shortName || matched.name;
        fixedTt++;
      }
    }
    if (!slot.roomId || !db.rooms.some((r) => r.id === slot.roomId)) {
      const key = normalizeLookupKey(slot.room);
      const matched = db.rooms.find(
        (r) => normalizeLookupKey(r.name) === key || normalizeLookupKey(r.code) === key,
      );
      if (matched) {
        slot.roomId = matched.id;
        slot.room = matched.name;
        fixedTt++;
      }
    }
  }
  if (fixedTt > 0) {
    fixedCount += fixedTt;
    summary.push(`Đã chuẩn hóa ${fixedTt} liên kết Giáo viên/Phòng học trên Thời khóa biểu.`);
  }

  // 3. Fix Student QR tokens, foreign keys, and duplicate codes
  const seenCodes = new Set<string>();
  let fixedStudents = 0;
  for (const st of db.students) {
    if (!st.qrToken) {
      st.qrToken = buildDeterministicQrToken(st.id, st.code);
      fixedStudents++;
    }
    const upperCode = st.code.trim().toUpperCase();
    if (seenCodes.has(upperCode)) {
      st.code = generateSmartStudentCode(
        st.centerClass,
        db.students.map((s) => s.code),
      );
      fixedStudents++;
    }
    seenCodes.add(st.code.trim().toUpperCase());

    const prevTid = st.homeroomTeacherId;
    const prevRid = st.roomId;
    cascadeSyncStudentUpdate(db, st);
    if (st.homeroomTeacherId !== prevTid || st.roomId !== prevRid) {
      fixedStudents++;
    }
  }
  if (fixedStudents > 0) {
    fixedCount += fixedStudents;
    summary.push(`Đã đồng bộ mã khóa ngoại, mã NT26 và QR động cho ${fixedStudents} trường hồ sơ học sinh.`);
  }

  // 4. Auto-link siblings sharing normalized parentPhone into unified FamilyProfile
  const phoneMap = new Map<string, Student[]>();
  for (const st of db.students) {
    const norm = normalizePhoneVN(st.parentPhone);
    if (norm.length >= 8) {
      const list = phoneMap.get(norm) || [];
      list.push(st);
      phoneMap.set(norm, list);
    }
  }
  let linkedFamilies = 0;
  for (const [normPhone, siblings] of phoneMap.entries()) {
    if (siblings.length < 2) continue;
    let family = db.families.find(
      (f) =>
        normalizePhoneVN(f.parentPhone) === normPhone ||
        siblings.some((s) => s.familyId && s.familyId === f.id),
    );
    if (!family) {
      family = {
        id: `fam-${normPhone.slice(-6)}-${Date.now().toString(36).slice(-3)}`,
        parentName: siblings[0].parentName,
        parentPhone: siblings[0].parentPhone,
        parentEmails: Array.from(new Set(siblings.flatMap((s) => s.parentEmails || []))),
        siblingDiscountPercent: 5,
        defaultBillingCycle: 'MONTHLY',
        note: 'Tự động gom nhóm Gia đình nhiều con bởi Data Health Audit',
      };
      db.families.push(family);
      linkedFamilies++;
    }
    for (const sib of siblings) {
      if (sib.familyId !== family.id) {
        sib.familyId = family.id;
        linkedFamilies++;
      }
    }
  }
  if (linkedFamilies > 0) {
    fixedCount += linkedFamilies;
    summary.push(`Đã gom nhóm ${linkedFamilies} liên kết Gia đình nhiều anh chị em.`);
  }

  return {
    fixedCount,
    summary,
    reportAfter: auditDatabaseHealth(db),
  };
}
