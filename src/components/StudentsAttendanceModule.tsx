import React, { useMemo, useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { compressImageFile } from '../lib/imageOptimizer';

interface StudentsAttendanceModuleProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
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
  onRefresh,
}) => {
  const isStaff =
    workspace.user.role === 'SUPER_ADMIN' ||
    workspace.user.role === 'ADMIN' ||
    workspace.user.role === 'TEACHER';

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 'CAP_1' | 'CAP_2' | 'CAP_3'>('ALL');
  const [shiftLabel, setShiftLabel] = useState('Chiều Ca 2 (15:15–16:45)');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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
                setShowImport((v) => !v);
                setShowAdd(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Nhập thông minh (Excel / Ảnh AI)</span>
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
              <span>Thêm học sinh</span>
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
          <h2 className="text-sm font-bold text-slate-950">Thêm hồ sơ học sinh mới</h2>
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
                </td>
                {isStaff && (
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
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
    </div>
  );
};
