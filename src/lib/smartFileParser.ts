import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import type { SmartImportEntityType } from '../types';

export interface FieldSchemaDef {
  key: string;
  label: string;
  required?: boolean;
  example: string;
  synonyms: string[];
}

export const ENTITY_FIELD_SCHEMAS: Record<SmartImportEntityType, FieldSchemaDef[]> = {
  STUDENTS: [
    {
      key: 'fullName',
      label: 'Họ và tên HS',
      required: true,
      example: 'Nguyễn Minh Khôi',
      synonyms: ['ho ten', 'ho va ten', 'ten hoc sinh', 'ten hs', 'hoc sinh', 'fullname', 'full name', 'name', 'student name'],
    },
    {
      key: 'centerClass',
      label: 'Lớp Trung tâm',
      required: true,
      example: 'Lớp 7A1',
      synonyms: ['lop trung tam', 'lop tt', 'centerclass', 'center class', 'lop hoc', 'nhom lop', 'lop'],
    },
    {
      key: 'grade',
      label: 'Khối (3-12)',
      example: '7',
      synonyms: ['khoi', 'grade', 'khoi lop'],
    },
    {
      key: 'code',
      label: 'Mã HS (tự sinh nếu trống)',
      example: 'NT26-7A1-001',
      synonyms: ['ma hs', 'ma hoc sinh', 'student code', 'code', 'mshs', 'id hs'],
    },
    {
      key: 'schoolClass',
      label: 'Lớp ở trường',
      example: '7A3',
      synonyms: ['lop truong', 'lop o truong', 'schoolclass', 'school class', 'lop chinh khoa'],
    },
    {
      key: 'school',
      label: 'Trường học',
      example: 'THCS Lý Thường Kiệt',
      synonyms: ['truong', 'truong hoc', 'school', 'ten truong'],
    },
    {
      key: 'parentName',
      label: 'Tên Phụ huynh',
      example: 'Chị Trần Thu Hà',
      synonyms: ['phu huynh', 'ten phu huynh', 'ten ph', 'ho ten ph', 'bo me', 'parentname', 'parent name'],
    },
    {
      key: 'parentPhone',
      label: 'SĐT / Zalo PH',
      required: true,
      example: '0912345678',
      synonyms: ['sdt', 'so dien thoai', 'dien thoai', 'zalo', 'sdt ph', 'sdt phu huynh', 'phone', 'parentphone', 'parent phone', 'mobile'],
    },
    {
      key: 'parentEmail',
      label: 'Email Phụ huynh',
      example: 'phuhuynh@gmail.com',
      synonyms: ['email ph', 'gmail ph', 'email phu huynh', 'parent email', 'email'],
    },
    {
      key: 'homeroomTeacher',
      label: 'GV phụ trách',
      example: 'Cô Nghi',
      synonyms: ['gv', 'giao vien', 'gv phu trach', 'gvcn', 'homeroom', 'teacher'],
    },
    {
      key: 'room',
      label: 'Phòng mặc định',
      example: 'Phòng 2',
      synonyms: ['phong', 'phong hoc', 'room'],
    },
    {
      key: 'hasBoarding',
      label: 'Bán trú (Có/Không)',
      example: 'Có',
      synonyms: ['ban tru', 'com trua', 'boarding', 'hasboarding'],
    },
    {
      key: 'hasShuttle',
      label: 'Đưa rước (Có/Không)',
      example: 'Không',
      synonyms: ['dua ruoc', 'xe dua don', 'shuttle', 'hasshuttle'],
    },
    {
      key: 'enrolledSubjects',
      label: 'Môn đăng ký',
      example: 'Toán, Tiếng Anh, Ngữ Văn',
      synonyms: ['mon hoc', 'mon dang ky', 'mon', 'subjects', 'enrolledsubjects'],
    },
  ],
  TEACHERS: [
    {
      key: 'name',
      label: 'Họ và tên GV',
      required: true,
      example: 'Thầy Phạm Quốc Bảo',
      synonyms: ['ho ten', 'ho va ten', 'ten gv', 'ten giao vien', 'giao vien', 'name', 'fullname', 'teacher'],
    },
    {
      key: 'shortName',
      label: 'Tên gọi tắt',
      example: 'Thầy Bảo',
      synonyms: ['ten tat', 'ten goi', 'biet danh', 'shortname', 'short name'],
    },
    {
      key: 'teacherGroup',
      label: 'Nhóm GV (SUBJECT / TUTOR_REVIEW)',
      example: 'SUBJECT',
      synonyms: ['nhom gv', 'nhom', 'loai gv', 'vai tro', 'group', 'teachergroup', 'chuc danh'],
    },
    {
      key: 'subjects',
      label: 'Môn giảng dạy',
      required: true,
      example: 'Toán, Vật Lý',
      synonyms: ['mon', 'mon day', 'mon giang day', 'chuyen mon', 'bo mon', 'subjects', 'subject'],
    },
    {
      key: 'degree',
      label: 'Trình độ / Bằng cấp',
      example: 'Thạc sĩ Sư phạm Toán',
      synonyms: ['trinh do', 'bang cap', 'hoc vi', 'degree', 'chuyen nganh'],
    },
    {
      key: 'experienceYears',
      label: 'Số năm kinh nghiệm',
      example: '8',
      synonyms: ['kinh nghiem', 'so nam', 'nam kn', 'experience', 'experienceyears'],
    },
    {
      key: 'phone',
      label: 'Số điện thoại',
      example: '0947111222',
      synonyms: ['sdt', 'dien thoai', 'so dien thoai', 'zalo', 'phone', 'mobile'],
    },
    {
      key: 'email',
      label: 'Gmail đăng nhập',
      example: 'thaybao@gmail.com',
      synonyms: ['email', 'gmail', 'mail'],
    },
    {
      key: 'roomDefault',
      label: 'Phòng phụ trách',
      example: 'Phòng 1',
      synonyms: ['phong', 'phong mac dinh', 'phong phu trach', 'room', 'roomdefault'],
    },
  ],
  SCORES: [
    {
      key: 'studentCode',
      label: 'Mã HS (nếu có)',
      example: 'NT26-7A1-001',
      synonyms: ['ma hs', 'ma hoc sinh', 'code', 'studentcode', 'student code', 'mshs'],
    },
    {
      key: 'studentName',
      label: 'Họ tên Học sinh',
      required: true,
      example: 'Nguyễn Phúc Hòa',
      synonyms: ['ho ten', 'ho va ten', 'hoc sinh', 'ten hs', 'ten hoc sinh', 'studentname', 'student name', 'name'],
    },
    {
      key: 'centerClass',
      label: 'Lớp',
      example: 'Lớp 6A1',
      synonyms: ['lop', 'lop trung tam', 'class', 'centerclass'],
    },
    {
      key: 'subject',
      label: 'Môn học',
      required: true,
      example: 'Toán',
      synonyms: ['mon', 'mon hoc', 'bo mon', 'subject'],
    },
    {
      key: 'examType',
      label: 'Loại bài KT (15_PHUT / 1_TIET / GIUA_KY / CUOI_KY)',
      example: '1_TIET',
      synonyms: ['loai diem', 'loai bai', 'hinh thuc', 'ky thi', 'examtype', 'exam type', 'he so'],
    },
    {
      key: 'score',
      label: 'Điểm số (0-10)',
      required: true,
      example: '9.2',
      synonyms: ['diem', 'diem so', 'ket qua', 'score', 'grade', 'point', 'diem dat duoc'],
    },
    {
      key: 'date',
      label: 'Ngày kiểm tra (YYYY-MM-DD)',
      example: '2026-11-26',
      synonyms: ['ngay', 'ngay kt', 'ngay thi', 'ngay kiem tra', 'date'],
    },
    {
      key: 'aiSummary',
      label: 'Nhận xét / Ghi chú',
      example: 'Làm bài cẩn thận, trình bày sạch đẹp',
      synonyms: ['nhan xet', 'ghi chu', 'phe', 'danh gia', 'note', 'summary', 'aisummary', 'comment'],
    },
  ],
  TIMETABLE: [
    {
      key: 'day',
      label: 'Thứ (T2..T7)',
      required: true,
      example: 'T2',
      synonyms: ['thu', 'ngay trong tuan', 'day', 'weekday'],
    },
    {
      key: 'period',
      label: 'Buổi (SANG / CHIEU / TOI)',
      required: true,
      example: 'SANG',
      synonyms: ['buoi', 'buoi hoc', 'period', 'session'],
    },
    {
      key: 'shift',
      label: 'Ca (CA_1 / CA_2)',
      required: true,
      example: 'CA_1',
      synonyms: ['ca', 'ca hoc', 'tiet', 'shift'],
    },
    {
      key: 'timeRange',
      label: 'Khung giờ',
      example: '07:15–08:45',
      synonyms: ['gio', 'khung gio', 'thoi gian', 'time', 'timerange'],
    },
    {
      key: 'centerClass',
      label: 'Lớp Trung tâm',
      required: true,
      example: 'Lớp 7A1',
      synonyms: ['lop', 'lop trung tam', 'nhom lop', 'class', 'centerclass'],
    },
    {
      key: 'subject',
      label: 'Môn học',
      required: true,
      example: 'Toán',
      synonyms: ['mon', 'mon hoc', 'noi dung', 'subject'],
    },
    {
      key: 'teacherName',
      label: 'Giáo viên',
      required: true,
      example: 'Cô Mẫn',
      synonyms: ['gv', 'giao vien', 'giang vien', 'phu trach', 'teacher', 'teachername'],
    },
    {
      key: 'room',
      label: 'Phòng học',
      required: true,
      example: 'Phòng 1',
      synonyms: ['phong', 'phong hoc', 'dia diem', 'room'],
    },
    {
      key: 'slotType',
      label: 'Loại ca (MAIN / TRA_BAI / PHU_DAO / BU_THE_DUC)',
      example: 'MAIN',
      synonyms: ['loai ca', 'loai tiet', 'hinh thuc', 'slottype', 'type'],
    },
    {
      key: 'note',
      label: 'Ghi chú',
      example: 'Ôn thi giữa kỳ',
      synonyms: ['ghi chu', 'note', 'luu y'],
    },
  ],
};

export function normalizeHeaderToken(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  sheetNames: string[];
  activeSheet: string;
}

export async function parseExcelOrCsvFile(
  file: File,
  preferredSheet?: string,
): Promise<ParsedSpreadsheet> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('File bảng tính không có sheet dữ liệu nào.');
  }
  const activeSheet = preferredSheet && sheetNames.includes(preferredSheet)
    ? preferredSheet
    : sheetNames[0];
  const sheet = workbook.Sheets[activeSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  // Find the first non-empty row that looks like a header (at least 2 non-empty cells)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i];
    if (Array.isArray(row)) {
      const filled = row.filter((c) => String(c ?? '').trim().length > 0).length;
      if (filled >= 2) {
        headerRowIdx = i;
        break;
      }
    }
  }

  const rawHeaders = (matrix[headerRowIdx] || []) as unknown[];
  const headers = rawHeaders.map((h, idx) => {
    const label = String(h ?? '').trim();
    return label || `Cột ${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    if (!Array.isArray(rawRow)) continue;
    const obj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, idx) => {
      const val = String(rawRow[idx] ?? '').trim();
      obj[h] = val;
      if (val) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }

  return { headers, rows, sheetNames, activeSheet };
}

/**
 * Extracts clean text from a .docx Word document in the browser using mammoth.
 */
export async function extractTextFromDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = (result.value || '').trim();
  if (!text) {
    throw new Error('Không đọc được nội dung văn bản từ file Word (.docx).');
  }
  return text;
}

/**
 * Converts a spreadsheet into compact CSV/TSV text so Gemini AI can also interpret non-standard Timetable matrices.
 */
export function spreadsheetToCompactText(parsed: ParsedSpreadsheet, maxRows = 120): string {
  const lines = [parsed.headers.join('\t')];
  parsed.rows.slice(0, maxRows).forEach((row) => {
    lines.push(parsed.headers.map((h) => (row[h] || '').replace(/\s+/g, ' ')).join('\t'));
  });
  return lines.join('\n');
}

/**
 * Parses tab-separated or comma-separated bulk text pasted directly from Excel / Google Sheets.
 */
export function parsePastedGrid(text: string, entityType: SmartImportEntityType): ParsedSpreadsheet {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], sheetNames: ['Paste'], activeSheet: 'Paste' };
  }

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const splitLine = (line: string) => line.split(delimiter).map((c) => c.trim());

  const firstCells = splitLine(lines[0]);
  const schema = ENTITY_FIELD_SCHEMAS[entityType];
  // Check if first row looks like a header row
  const headerScore = firstCells.reduce((acc, cell) => {
    const norm = normalizeHeaderToken(cell);
    const matched = schema.some((f) => f.synonyms.some((syn) => norm === syn || norm.includes(syn)));
    return acc + (matched ? 1 : 0);
  }, 0);

  let headers: string[];
  let dataLines: string[][];
  if (headerScore >= 1 && lines.length >= 2) {
    headers = firstCells.map((c, idx) => c || `Cột ${idx + 1}`);
    dataLines = lines.slice(1).map(splitLine);
  } else {
    headers = firstCells.map((_, idx) => schema[idx]?.label || `Cột ${idx + 1}`);
    dataLines = lines.map(splitLine);
  }

  const rows = dataLines.map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] || '';
    });
    return obj;
  });

  return { headers, rows, sheetNames: ['Paste'], activeSheet: 'Paste' };
}

/**
 * Smart Column Auto-Mapper: matches arbitrary Vietnamese/English headers to canonical DB field keys.
 * Returns Record<canonicalFieldKey, sourceHeaderName>.
 */
export function autoMapColumns(
  headers: string[],
  entityType: SmartImportEntityType,
): Record<string, string> {
  const schema = ENTITY_FIELD_SCHEMAS[entityType];
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    norm: normalizeHeaderToken(h),
  }));

  // Pass 1: exact synonym or exact key match
  for (const field of schema) {
    const exact = normalizedHeaders.find(
      (h) =>
        !usedHeaders.has(h.raw) &&
        (h.norm === field.key.toLowerCase() ||
          h.norm === normalizeHeaderToken(field.label) ||
          field.synonyms.includes(h.norm)),
    );
    if (exact) {
      mapping[field.key] = exact.raw;
      usedHeaders.add(exact.raw);
    }
  }

  // Pass 2: partial substring match for remaining fields
  for (const field of schema) {
    if (mapping[field.key]) continue;
    const partial = normalizedHeaders.find(
      (h) =>
        !usedHeaders.has(h.raw) &&
        h.norm.length >= 2 &&
        field.synonyms.some((syn) => h.norm.includes(syn) || syn.includes(h.norm)),
    );
    if (partial) {
      mapping[field.key] = partial.raw;
      usedHeaders.add(partial.raw);
    }
  }

  return mapping;
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  entityType: SmartImportEntityType,
): Record<string, string>[] {
  const schema = ENTITY_FIELD_SCHEMAS[entityType];
  return rows.map((row) => {
    const out: Record<string, string> = {};
    schema.forEach((f) => {
      const srcHeader = mapping[f.key];
      out[f.key] = srcHeader ? String(row[srcHeader] ?? '').trim() : '';
    });
    return out;
  });
}

/**
 * Generates and downloads an official Nhân Trí .xlsx template for any of the 4 modules.
 */
export function downloadOfficialExcelTemplate(entityType: SmartImportEntityType): void {
  const schema = ENTITY_FIELD_SCHEMAS[entityType];
  const sampleRow: Record<string, string> = {};
  schema.forEach((f) => {
    sampleRow[f.label] = f.example;
  });

  const ws = XLSX.utils.json_to_sheet([sampleRow]);
  ws['!cols'] = schema.map((f) => ({ wch: Math.max(f.label.length + 4, f.example.length + 4, 16) }));
  const wb = XLSX.utils.book_new();
  const sheetNames: Record<SmartImportEntityType, string> = {
    STUDENTS: 'DS_Hoc_Sinh',
    TEACHERS: 'DS_Giao_Vien',
    SCORES: 'Bang_Diem',
    TIMETABLE: 'Thoi_Khoa_Bieu',
  };
  const fileNames: Record<SmartImportEntityType, string> = {
    STUDENTS: 'Mau_Import_Hoc_Sinh_NhanTri.xlsx',
    TEACHERS: 'Mau_Import_Giao_Vien_NhanTri.xlsx',
    SCORES: 'Mau_Import_Diem_So_NhanTri.xlsx',
    TIMETABLE: 'Mau_Import_Thoi_Khoa_Bieu_NhanTri.xlsx',
  };
  XLSX.utils.book_append_sheet(wb, ws, sheetNames[entityType]);
  XLSX.writeFile(wb, fileNames[entityType]);
}
