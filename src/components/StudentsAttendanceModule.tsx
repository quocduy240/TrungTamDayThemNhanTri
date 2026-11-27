import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  KeyRound,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { SiteConfig, StudentAccessStatus, StudentRecord } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import {
  buildZaloAccessCardText,
  DEFAULT_AUTH_POLICY,
  generateAccessPin,
} from '../lib/identityPolicy';
import { compressImageFile } from '../lib/imageOptimizer';
import {
  buildDeterministicQrToken,
  buildStudentQrUrl,
  generateSmartStudentCode,
  renderQrDataUrl,
} from '../lib/smartCodeAndQr';
import { buildStudentQrCardsHtml } from '../lib/brandedDocumentExporter';
import { BrandedPrintModal } from './BrandedPrintModal';
import { UniversalSmartImportModal } from './UniversalSmartImportModal';
import { QrAttendanceScannerModal, StudentQrCardModal } from './StudentQrHub';

interface StudentsAttendanceModuleProps {
  workspace: WorkspacePayload;
  siteConfig?: SiteConfig;
  onRefresh: () => Promise<void>;
  initialClassFilter?: string;
  initialShiftLabel?: string;
}

interface PreviewRow {
  fullName: string;
  schoolClass: string;
  school: string;
  centerClass: string;
  parentPhone: string;
  homeroomTeacher: string;
}

function parseDelimitedText(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? '';
    });
    return obj;
  });
}

export const StudentsAttendanceModule: React.FC<StudentsAttendanceModuleProps> = ({
  workspace,
  siteConfig,
  onRefresh,
  initialClassFilter,
  initialShiftLabel,
}) => {
  const isStaff =
    workspace.user.role === 'SUPER_ADMIN' ||
    workspace.user.role === 'ADMIN' ||
    workspace.user.role === 'MANAGER' ||
    workspace.user.role === 'TEACHER';
  const isAdmin =
    workspace.user.role === 'SUPER_ADMIN' || workspace.user.role === 'ADMIN';
  const minGradeForGmail =
    workspace.authPolicy?.minGradeForPersonalGmail ??
    DEFAULT_AUTH_POLICY.minGradeForPersonalGmail;

  const [search, setSearch] = useState(initialClassFilter || '');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 'CAP_1' | 'CAP_2' | 'CAP_3'>('ALL');
  const [shiftLabel, setShiftLabel] = useState(initialShiftLabel || 'Chiều Ca 2 (15:15–16:45)');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialClassFilter) {
      setSearch(initialClassFilter);
      setGradeFilter('ALL');
    }
    if (initialShiftLabel) {
      setShiftLabel(initialShiftLabel);
    }
  }, [initialClassFilter, initialShiftLabel]);

  // Per-Student Identity & Access Binding Modal (Admin / SuperAdmin)
  const [editingAccessStudent, setEditingAccessStudent] = useState<StudentRecord | null>(null);
  const [accessForm, setAccessForm] = useState({
    parentPhone: '',
    parentSecondaryPhone: '',
    parentEmailsText: '',
    studentEmail: '',
    allowPersonalGmailOverride: false,
    accessPin: '',
    parentLinkCode: '',
    accessStatus: 'ACTIVE' as StudentAccessStatus,
    accessNote: '',
  });
  const [savingAccess, setSavingAccess] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);

  // Smart Import State (CSV/Excel + Image OCR)
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<PreviewRow[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Add Single Student State
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({
    fullName: '',
    grade: 7,
    centerClass: 'Lớp 7A1',
    schoolClass: '7A2',
    school: 'THCS Lý Thường Kiệt',
    parentName: '',
    parentPhone: '',
    hasBoarding: true,
    hasShuttle: false,
  });

  // Multi-Dimensional Smart Import, Dynamic QR Card & Camera Attendance Scanner
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [qrCardStudent, setQrCardStudent] = useState<StudentRecord | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [classQrPrintHtml, setClassQrPrintHtml] = useState<string | null>(null);
  const [buildingClassQr, setBuildingClassQr] = useState(false);

  const previewSmartCode = useMemo(
    () => generateSmartStudentCode(newStudent.centerClass, workspace.students),
    [newStudent.centerClass, workspace.students],
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.students.filter((st) => {
      if (gradeFilter !== 'ALL' && st.level !== gradeFilter) return false;
      if (!q) return true;
      return (
        st.fullName.toLowerCase().includes(q) ||
        st.centerClass.toLowerCase().includes(q) ||
        st.school.toLowerCase().includes(q) ||
        st.code.toLowerCase().includes(q)
      );
    });
  }, [workspace.students, search, gradeFilter]);

  async function handlePrintFilteredQrCards() {
    if (filteredStudents.length === 0) return;
    setBuildingClassQr(true);
    setErrorMsg('');
    try {
      const qrMap: Record<string, string> = {};
      for (const st of filteredStudents) {
        const token = st.qrToken || buildDeterministicQrToken(st.id, st.code);
        qrMap[st.id] = await renderQrDataUrl(buildStudentQrUrl(token), 240);
      }
      const html = buildStudentQrCardsHtml({
        students: filteredStudents,
        qrDataUrlByStudentId: qrMap,
        siteConfig,
        title: `Bộ Thẻ QR Học sinh (${filteredStudents.length} em)`,
      });
      setClassQrPrintHtml(html);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo bộ thẻ QR in A4.');
    } finally {
      setBuildingClassQr(false);
    }
  }

  async function handleQuickAttendance(
    studentId: string,
    status: 'PRESENT' | 'LATE' | 'EXCUSED' | 'MAKEUP_EVENING',
  ) {
    setErrorMsg('');
    try {
      await apiRequest('/api/v1/attendance', {
        method: 'POST',
        body: JSON.stringify({ studentId, shiftLabel, status }),
      });
      await onRefresh();
      setFeedbackMsg('Đã ghi nhận điểm danh và gửi thông báo đẩy tới phụ huynh.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi ghi nhận điểm danh.');
    }
  }

  function handleDownloadCsvTemplate() {
    const csv =
      '\uFEFFHọ và tên,Lớp,Trường,Lớp TT,SĐT,Giáo viên\n' +
      'Nguyễn Minh Khôi,7A3,THCS Lý Thường Kiệt,Lớp 7A1,0918 *** 221,Cô Nghi\n' +
      'Lê Hoàng Bảo Ngọc,6A4,THCS Nguyễn Trãi,Lớp 6A2,0939 *** 884,Cô Tâm\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mau-Danh-Sach-Hoc-Sinh-NhanTri.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target?.result || '');
        const jsonRows = parseDelimitedText(text);
        const mapped: PreviewRow[] = jsonRows
          .map((r) => ({
            fullName: String(r['Họ và tên'] || r['HO VA TEN'] || r['fullName'] || r['Name'] || '').trim(),
            schoolClass: String(r['Lớp'] || r['LOP'] || r['schoolClass'] || '7A').trim(),
            school: String(r['Trường'] || r['TRUONG'] || r['school'] || 'THCS Lý Thường Kiệt').trim(),
            centerClass: String(r['Lớp TT'] || r['centerClass'] || 'Lớp 7A1').trim(),
            parentPhone: String(r['SĐT'] || r['Ghi chú'] || r['parentPhone'] || '0918 *** 000').trim(),
            homeroomTeacher: String(r['Giáo viên'] || r['homeroomTeacher'] || 'Cô Nghi').trim(),
          }))
          .filter((r) => r.fullName.length > 1);
        if (mapped.length === 0) {
          setErrorMsg('File CSV từ Excel cần có dòng tiêu đề gồm cột "Họ và tên". Bạn có thể tải file mẫu bên cạnh.');
        } else {
          setImportPreview(mapped);
          setFeedbackMsg(`Đã đọc ${mapped.length} học sinh từ bảng tính. Kiểm tra và bấm Xác nhận nhập.`);
        }
      } catch {
        setErrorMsg('Không thể đọc file bảng tính. Vui lòng xuất CSV UTF-8 từ Excel hoặc dùng tính năng Quét ảnh AI.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleImageRosterOcr(file?: File, sampleFilename?: string) {
    setOcrLoading(true);
    setErrorMsg('');
    try {
      let body: Record<string, string> = {};
      let compressionNote = '';
      if (sampleFilename) {
        body = { sampleFilename };
      } else if (file) {
        const compressed = await compressImageFile(file, { maxDim: 1600, quality: 0.84 });
        body = { imageBase64: compressed.dataUrl, mimeType: compressed.mimeType };
        compressionNote = ` (đã nén ảnh ${compressed.originalKB} KB → ${compressed.compressedKB} KB)`;
      }
      const res = await apiRequest<{ rows: PreviewRow[] }>('/api/v1/ai/import-students-image', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setImportPreview(res.rows);
      setFeedbackMsg(
        `AI đã nhận dạng ${res.rows.length} học sinh từ ảnh danh sách${compressionNote}. Vui lòng kiểm tra trước khi lưu.`,
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi phân tích ảnh danh sách học sinh.');
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleCommitImport() {
    if (importPreview.length === 0) return;
    setImporting(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<{ importedCount: number }>('/api/v1/students/import', {
        method: 'POST',
        body: JSON.stringify({ students: importPreview }),
      });
      await onRefresh();
      setImportPreview([]);
      setShowImport(false);
      setFeedbackMsg(`Đã nhập thành công ${res.importedCount} học sinh vào cơ sở dữ liệu Trung Tâm Nhân Trí.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu danh sách nhập.');
    } finally {
      setImporting(false);
    }
  }

  function openAccessModal(st: StudentRecord) {
    setEditingAccessStudent(st);
    setCopiedCard(false);
    setAccessForm({
      parentPhone: st.parentPhone || '',
      parentSecondaryPhone: st.parentSecondaryPhone || '',
      parentEmailsText: (st.parentEmails || []).join(', '),
      studentEmail: st.studentEmail || '',
      allowPersonalGmailOverride: Boolean(st.allowPersonalGmailOverride),
      accessPin: st.accessPin || generateAccessPin(),
      parentLinkCode: st.parentLinkCode || '',
      accessStatus: st.accessStatus || 'ACTIVE',
      accessNote: st.accessNote || '',
    });
  }

  async function handleSaveStudentAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccessStudent) return;
    setSavingAccess(true);
    setErrorMsg('');
    try {
      const parentEmails = accessForm.parentEmailsText
        .split(/[\s,;]+/)
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.includes('@'));
      const res = await apiRequest<{ student: StudentRecord }>(
        `/api/v1/students/${editingAccessStudent.id}/access`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            parentPhone: accessForm.parentPhone.trim(),
            parentSecondaryPhone: accessForm.parentSecondaryPhone.trim(),
            parentEmails,
            studentEmail: accessForm.studentEmail.trim().toLowerCase(),
            allowPersonalGmailOverride: accessForm.allowPersonalGmailOverride,
            accessPin: accessForm.accessPin.trim(),
            parentLinkCode: accessForm.parentLinkCode.trim().toUpperCase(),
            accessStatus: accessForm.accessStatus,
            accessNote: accessForm.accessNote.trim(),
          }),
        },
      );
      setEditingAccessStudent(res.student);
      await onRefresh();
      setFeedbackMsg(
        `Đã cập nhật quyền định danh & Mã PIN cho học sinh ${res.student.fullName} (${res.student.code}).`,
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu quyền định danh.');
    } finally {
      setSavingAccess(false);
    }
  }

  function handleCopyZaloAccessCard() {
    if (!editingAccessStudent) return;
    const previewStudent: StudentRecord = {
      ...editingAccessStudent,
      parentPhone: accessForm.parentPhone.trim(),
      parentEmails: accessForm.parentEmailsText
        .split(/[\s,;]+/)
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.includes('@')),
      studentEmail: accessForm.studentEmail.trim().toLowerCase() || undefined,
      accessPin: accessForm.accessPin.trim(),
      parentLinkCode: accessForm.parentLinkCode.trim().toUpperCase(),
    };
    const cardText = buildZaloAccessCardText(previewStudent);
    navigator.clipboard?.writeText(cardText);
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 3000);
  }

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    try {
      await apiRequest('/api/v1/students', {
        method: 'POST',
        body: JSON.stringify(newStudent),
      });
      await onRefresh();
      setShowAdd(false);
      setFeedbackMsg(`Đã thêm học sinh ${newStudent.fullName} vào lớp ${newStudent.centerClass}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể thêm học sinh.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Danh sách Học sinh, Lớp học &amp; Điểm danh tự động
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Quản lý hồ sơ Cấp 1–2–3, nhập hàng loạt thông minh từ Excel hoặc ảnh chụp bảng danh sách bằng AI.
          </p>
        </div>

        {isStaff && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSmartImportOpen(true);
                setShowAdd(false);
                setShowImport(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Nhập đa chiều (Excel / Camera / PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => setQrScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-600 whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Quét QR Điểm danh</span>
            </button>
            <button
              type="button"
              disabled={buildingClassQr || filteredStudents.length === 0}
              onClick={() => void handlePrintFilteredQrCards()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4 text-amber-700" />
              <span>{buildingClassQr ? 'Đang tạo thẻ...' : `In Bộ Thẻ QR (${filteredStudents.length})`}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd((v) => !v);
                setShowImport(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm nhanh 1 HS</span>
            </button>
          </div>
        )}
      </div>

      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-900 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button type="button" onClick={() => setFeedbackMsg('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Smart Import Panel (Excel + Gemini Vision Roster OCR) */}
      {showImport && isStaff && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-950">
              Cập nhật danh sách học sinh tự động từ Excel hoặc Ảnh chụp
            </h2>
            <button type="button" onClick={() => setShowImport(false)} className="cursor-pointer text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  Cách 1: Tải file bảng tính Excel (.csv UTF-8)
                </p>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải file mẫu</span>
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Hỗ trợ các cột: Họ và tên, Lớp, Trường, Lớp TT, SĐT, Giáo viên (lưu CSV UTF-8 từ Excel).
              </p>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleExcelUpload}
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-900 hover:file:bg-slate-200"
              />
            </div>

            <div className="p-4 border border-slate-200 rounded-lg space-y-2.5">
              <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-900" />
                Cách 2: Quét ảnh danh sách học sinh bằng Gemini Vision
              </p>
              <p className="text-xs text-slate-600">
                Chụp bảng danh sách giấy tại trung tâm để AI tự động tách thành dòng dữ liệu.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Chọn ảnh tải lên</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageRosterOcr(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={ocrLoading}
                  onClick={() => handleImageRosterOcr(undefined, 'IMG_9538_cadb03a1.webp')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {ocrLoading ? 'AI đang đọc ảnh...' : 'Thử ngay ảnh Danh sách Lớp 7A1 thực'}
                </button>
              </div>
            </div>
          </div>

          {importPreview.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900">
                  Xem trước dữ liệu chuẩn hóa ({importPreview.length} học sinh)
                </p>
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleCommitImport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{importing ? 'Đang lưu...' : 'Xác nhận lưu vào Database'}</span>
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Họ tên</th>
                      <th className="py-2 px-3">Lớp TT</th>
                      <th className="py-2 px-3">Lớp trường</th>
                      <th className="py-2 px-3">Trường</th>
                      <th className="py-2 px-3">GV phụ trách</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-semibold text-slate-900">{r.fullName}</td>
                        <td className="py-2 px-3">{r.centerClass}</td>
                        <td className="py-2 px-3">{r.schoolClass}</td>
                        <td className="py-2 px-3">{r.school}</td>
                        <td className="py-2 px-3">{r.homeroomTeacher || 'Cô Nghi'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Student Form */}
      {showAdd && isStaff && (
        <form
          onSubmit={handleCreateStudent}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-950">Thêm hồ sơ học sinh mới</h2>
            <span className="text-xs text-slate-600">
              Mã HS thông minh tự cấp:{' '}
              <strong className="font-mono-num text-blue-900">{previewSmartCode}</strong> + QR động
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              required
              placeholder="Họ và tên học sinh *"
              value={newStudent.fullName}
              onChange={(e) => setNewStudent({ ...newStudent, fullName: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              placeholder="Lớp trung tâm (VD: Lớp 7A1)"
              value={newStudent.centerClass}
              onChange={(e) => setNewStudent({ ...newStudent, centerClass: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              placeholder="Trường (VD: THCS Lý Thường Kiệt)"
              value={newStudent.school}
              onChange={(e) => setNewStudent({ ...newStudent, school: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              placeholder="SĐT Zalo phụ huynh"
              value={newStudent.parentPhone}
              onChange={(e) => setNewStudent({ ...newStudent, parentPhone: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              Lưu học sinh
            </button>
          </div>
        </form>
      )}

      {/* Search, Filter & Attendance Shift Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, lớp, trường..."
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg w-60 focus:outline-none focus:border-blue-900"
            />
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'CAP_1', label: 'Cấp 1' },
              { id: 'CAP_2', label: 'Cấp 2' },
              { id: 'CAP_3', label: 'Cấp 3' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setGradeFilter(f.id as 'ALL' | 'CAP_1' | 'CAP_2' | 'CAP_3')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  gradeFilter === f.id ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isStaff && (
          <div className="flex items-center gap-2 text-xs">
            <UserCheck className="w-4 h-4 text-blue-900" />
            <span className="text-slate-600">Ca điểm danh:</span>
            <select
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-900 font-medium"
            >
              <option>Sáng Ca 1 (07:15–08:45)</option>
              <option>Sáng Ca 2 (09:15–10:45)</option>
              <option>Chiều Ca 1 (13:30–15:00)</option>
              <option>Chiều Ca 2 (15:15–16:45)</option>
              <option>Tối Ca 1 (17:30–19:00)</option>
              <option>Tối Ca 2 (19:00–20:30)</option>
            </select>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-medium">Mã HS</th>
              <th className="py-3 px-4 font-medium">Họ tên &amp; Lớp trường</th>
              <th className="py-3 px-4 font-medium">Lớp TT &amp; GV</th>
              <th className="py-3 px-4 font-medium">Dịch vụ đăng ký</th>
              <th className="py-3 px-4 font-medium">Zalo Phụ huynh</th>
              {isStaff && <th className="py-3 px-4 font-medium text-right">Điểm danh nhanh</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((st) => (
              <tr key={st.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-mono-num text-xs text-slate-500">
                  <p>{st.code}</p>
                  {st.parentLinkCode && (
                    <p className="text-[11px] font-semibold text-blue-900 mt-0.5">
                      Mã PH: {st.parentLinkCode}
                    </p>
                  )}
                </td>
                <td className="py-3 px-4">
                  <p className="font-semibold text-slate-950">{st.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {st.schoolClass} · {st.school}
                  </p>
                </td>
                <td className="py-3 px-4">
                  <p className="font-semibold text-blue-950">{st.centerClass}</p>
                  <p className="text-xs text-slate-500">
                    {st.homeroomTeacher} · {st.room}
                  </p>
                </td>
                <td className="py-3 px-4 text-xs text-slate-700">
                  <p>
                    {st.packageType === 'ALL_IN_ONE'
                      ? 'Trọn gói'
                      : st.packageType === 'TUTORING'
                        ? 'Dạy kèm'
                        : 'Theo môn'}
                    {st.hasBoarding ? ' · Bán trú' : ''}
                    {st.hasShuttle ? ' · Đưa rước' : ''}
                    {st.annualPrepaid ? ' · Đóng năm -10%' : ''}
                  </p>
                  {st.peConflictDay && (
                    <p className="text-amber-700 mt-0.5">Bù TD: Tối {st.peConflictDay} (17h30)</p>
                  )}
                </td>
                <td className="py-3 px-4 text-xs">
                  <p className="font-medium text-slate-800">{st.parentName}</p>
                  <p className="font-mono-num text-slate-500">{st.parentPhone}</p>
                  <p
                    className={`text-[11px] font-semibold mt-0.5 ${
                      st.accessStatus === 'LOCKED'
                        ? 'text-red-700'
                        : st.accessStatus === 'PENDING_VERIFY'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    {st.accessStatus === 'LOCKED'
                      ? 'Định danh: Tạm khóa'
                      : st.accessStatus === 'PENDING_VERIFY'
                        ? 'Định danh: Chờ xác minh'
                        : 'Định danh: Đang mở'}
                    {isAdmin && st.accessPin ? ` · PIN ${st.accessPin}` : ''}
                  </p>
                </td>
                {isStaff && (
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQrCardStudent(st)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md cursor-pointer"
                      >
                        <QrCode className="w-3 h-3 text-blue-900" />
                        <span>Thẻ QR</span>
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openAccessModal(st)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3 text-blue-900" />
                          <span>Quyền &amp; PIN</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleQuickAttendance(st.id, 'PRESENT')}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md cursor-pointer"
                      >
                        Có mặt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAttendance(st.id, 'LATE')}
                        className="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md cursor-pointer"
                      >
                        Trễ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAttendance(st.id, 'MAKEUP_EVENING')}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer"
                      >
                        Bù tối
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-Student Identity Binding & PIN Governance Modal (Admin & SuperAdmin) */}
      {editingAccessStudent && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStudentAccess}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Cấp quyền Định danh &amp; Mã PIN · {editingAccessStudent.code} ({editingAccessStudent.centerClass})
                  </span>
                </p>
                <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                  {editingAccessStudent.fullName} — Khối {editingAccessStudent.grade}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccessStudent(null)}
                className="text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SĐT Phụ huynh chính (Zalo) *
                </label>
                <input
                  type="tel"
                  required
                  value={accessForm.parentPhone}
                  onChange={(e) => setAccessForm({ ...accessForm, parentPhone: e.target.value })}
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SĐT Phụ huynh phụ (Bố/Mẹ thứ 2)
                </label>
                <input
                  type="tel"
                  value={accessForm.parentSecondaryPhone}
                  onChange={(e) =>
                    setAccessForm({ ...accessForm, parentSecondaryPhone: e.target.value })
                  }
                  placeholder="Tùy chọn"
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gmail Phụ huynh (cách nhau bằng dấu phẩy nếu cả Bố và Mẹ)
                </label>
                <input
                  type="text"
                  value={accessForm.parentEmailsText}
                  onChange={(e) =>
                    setAccessForm({ ...accessForm, parentEmailsText: e.target.value })
                  }
                  placeholder="phuhuynh1@gmail.com, phuhuynh2@gmail.com"
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã PIN gia đình (6 số)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={accessForm.accessPin}
                    onChange={(e) => setAccessForm({ ...accessForm, accessPin: e.target.value })}
                    className="flex-1 h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAccessForm({ ...accessForm, accessPin: generateAccessPin() })
                    }
                    className="inline-flex items-center gap-1 h-9 px-3 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tạo PIN</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã liên kết nhanh (Parent Link Code)
                </label>
                <input
                  type="text"
                  value={accessForm.parentLinkCode}
                  onChange={(e) =>
                    setAccessForm({
                      ...accessForm,
                      parentLinkCode: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full h-9 px-3 text-sm font-mono-num uppercase border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gmail cá nhân Học sinh (Áp dụng từ Lớp {minGradeForGmail}+)
                </label>
                <input
                  type="email"
                  value={accessForm.studentEmail}
                  onChange={(e) => setAccessForm({ ...accessForm, studentEmail: e.target.value })}
                  placeholder="hocsinh@gmail.com"
                  className="w-full h-9 px-3 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trạng thái quyền truy cập
                </label>
                <select
                  value={accessForm.accessStatus}
                  onChange={(e) =>
                    setAccessForm({
                      ...accessForm,
                      accessStatus: e.target.value as StudentAccessStatus,
                    })
                  }
                  className="w-full h-9 px-3 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ACTIVE">Đang mở (ACTIVE)</option>
                  <option value="PENDING_VERIFY">Chờ xác minh (PENDING_VERIFY)</option>
                  <option value="LOCKED">Tạm khóa (LOCKED — chặn đăng nhập)</option>
                </select>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={accessForm.allowPersonalGmailOverride}
                onChange={(e) =>
                  setAccessForm({
                    ...accessForm,
                    allowPersonalGmailOverride: e.target.checked,
                  })
                }
                className="mt-0.5"
              />
              <span className="text-slate-700 leading-relaxed">
                <strong className="text-slate-950">
                  Cấp ngoại lệ Gmail cá nhân (vượt ngưỡng Lớp {minGradeForGmail})
                </strong>{' '}
                — Cho phép học sinh Khối {editingAccessStudent.grade} dùng Gmail cá nhân vào lớp khi có xác nhận từ Phụ huynh.
              </span>
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ghi chú học vụ / xác minh (nội bộ)
              </label>
              <input
                type="text"
                value={accessForm.accessNote}
                onChange={(e) => setAccessForm({ ...accessForm, accessNote: e.target.value })}
                placeholder="VD: Phụ huynh đã xác nhận qua Zalo ngày 26/11"
                className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCopyZaloAccessCard}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {copiedCard ? 'Đã chép Thẻ Đăng nhập!' : 'Chép Thẻ Đăng nhập gửi Zalo'}
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAccessStudent(null)}
                  className="px-4 h-9 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingAccess}
                  className="inline-flex items-center gap-1.5 px-4 h-9 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingAccess ? 'Đang lưu...' : 'Lưu quyền định danh'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Multi-Dimensional Smart Ingestion Studio (Students) */}
      <UniversalSmartImportModal
        open={smartImportOpen}
        entityType="STUDENTS"
        workspace={workspace}
        onClose={() => setSmartImportOpen(false)}
        onSuccess={async (msg) => {
          await onRefresh();
          setFeedbackMsg(msg);
        }}
      />

      {/* Dynamic Student QR ID Card Modal */}
      <StudentQrCardModal
        student={qrCardStudent}
        allStudents={workspace.students}
        canManage={isAdmin}
        siteConfig={siteConfig}
        onClose={() => setQrCardStudent(null)}
        onRotated={async () => {
          await onRefresh();
          setFeedbackMsg('Đã cấp lại Mã QR động & bảo mật mới cho học sinh.');
        }}
      />

      {/* Live Camera QR Attendance Scanner Modal */}
      <QrAttendanceScannerModal
        open={qrScannerOpen}
        defaultShiftLabel={shiftLabel}
        onClose={() => setQrScannerOpen(false)}
        onAttendanceLogged={onRefresh}
      />

      {/* Batch A4 Branded QR Cards Print Modal */}
      {classQrPrintHtml && (
        <BrandedPrintModal
          open={Boolean(classQrPrintHtml)}
          title={`Bộ Thẻ QR Học sinh (${filteredStudents.length} em)`}
          subtitle="Logo & Watermark chính thức Trung Tâm Nhân Trí · 6 thẻ/trang A4"
          htmlContent={classQrPrintHtml}
          fileName={`Bo_The_QR_NhanTri_${filteredStudents.length}HS.html`}
          onClose={() => setClassQrPrintHtml(null)}
        />
      )}
    </div>
  );
};
