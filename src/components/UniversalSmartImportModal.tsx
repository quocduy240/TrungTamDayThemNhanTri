import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { SmartImportEntityType, TimetableSyncMode } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { compressImageFile } from '../lib/imageOptimizer';
import { generateSmartStudentCode } from '../lib/smartCodeAndQr';
import { normalizePhoneVN } from '../lib/identityPolicy';
import {
  applyColumnMapping,
  autoMapColumns,
  downloadOfficialExcelTemplate,
  ENTITY_FIELD_SCHEMAS,
  extractTextFromDocxFile,
  parseExcelOrCsvFile,
  parsePastedGrid,
  spreadsheetToCompactText,
  type ParsedSpreadsheet,
} from '../lib/smartFileParser';
import {
  matchCanonicalRoom,
  matchCanonicalTeacher,
  normalizeDayCode,
  normalizePeriodCode,
  normalizeShiftCode,
} from '../lib/smartBulkOperations';

interface UniversalSmartImportModalProps {
  open: boolean;
  entityType: SmartImportEntityType;
  workspace: WorkspacePayload;
  onClose: () => void;
  onSuccess: (summaryMessage: string) => Promise<void> | void;
}

type InputMode = 'SINGLE' | 'PASTE' | 'EXCEL' | 'AI_SCAN';

interface PreviewRow {
  _id: string;
  _selected: boolean;
  data: Record<string, string>;
}

const ENTITY_META: Record<
  SmartImportEntityType,
  { title: string; subtitle: string; pastePlaceholder: string }
> = {
  STUDENTS: {
    title: 'Nhập liệu Học sinh Đa chiều & Tự sinh Mã NT26 + QR Động',
    subtitle:
      'Hỗ trợ nhập lẻ, dán bảng Excel/Google Sheets, Import file Excel ánh xạ cột thông minh, hoặc chụp ảnh/Word/PDF để AI bóc tách & tự ghép Gia đình nhiều con.',
    pastePlaceholder:
      'Họ tên\tLớp Trung tâm\tTrường\tPhụ huynh\tSĐT PH\nNguyễn Minh Khôi\tLớp 7A1\tTHCS Lý Thường Kiệt\tChị Hà\t0912345678',
  },
  TEACHERS: {
    title: 'Nhập liệu Đội ngũ Giáo viên Đa chiều',
    subtitle:
      'Nhập lẻ, dán danh sách, Import Excel hoặc chụp ảnh / file Word / PDF bảng phân công giáo viên để tự chuẩn hóa chuyên môn & phòng mặc định.',
    pastePlaceholder:
      'Họ tên GV\tTên gọi tắt\tNhóm GV\tMôn dạy\tSĐT\tEmail\nThầy Phạm Quốc Bảo\tThầy Bảo\tSUBJECT\tToán, Vật Lý\t0947111222\tbao@gmail.com',
  },
  SCORES: {
    title: 'Nhập & Đồng bộ Điểm số Đa chiều Thông minh',
    subtitle:
      'Nhập lẻ, dán bảng điểm, Import Excel ánh xạ cột hoặc chụp ảnh bài kiểm tra / bảng điểm / Word / PDF để AI bóc tách & tự khớp Học sinh.',
    pastePlaceholder:
      'Mã HS\tHọ tên HS\tLớp\tMôn học\tLoại bài\tĐiểm\tNhận xét\nNT-6A1-01\tNguyễn Phúc Hòa\tLớp 6A1\tToán\t1_TIET\t9.5\tLàm bài rất tốt',
  },
  TIMETABLE: {
    title: 'Import & Đồng bộ Thời khóa biểu Đa chiều (Excel / Ảnh / Word / PDF)',
    subtitle:
      'Tự đọc mọi bố cục Thời khóa biểu, đối chiếu Giáo viên & Phòng học đã chốt cứng trong CSDL và cập nhật theo chế độ Upsert giữ nguyên các ca không trùng.',
    pastePlaceholder:
      'Thứ\tBuổi\tCa\tLớp\tMôn học\tGiáo viên\tPhòng\nT2\tSANG\tCA_1\tLớp 7A1\tToán\tCô Mẫn\tPhòng 1',
  },
};

function makeEmptyRow(entityType: SmartImportEntityType, workspace: WorkspacePayload): Record<string, string> {
  const obj: Record<string, string> = {};
  ENTITY_FIELD_SCHEMAS[entityType].forEach((f) => {
    obj[f.key] = '';
  });
  if (entityType === 'STUDENTS') {
    obj.centerClass = 'Lớp 7A1';
    obj.grade = '7';
    obj.room = workspace.rooms[0]?.name || 'Phòng 1';
    obj.homeroomTeacher = workspace.teachers[0]?.shortName || 'Cô Tâm';
  } else if (entityType === 'TEACHERS') {
    obj.teacherGroup = 'SUBJECT';
    obj.degree = 'Cử nhân Sư phạm';
    obj.experienceYears = '5';
    obj.roomDefault = workspace.rooms[0]?.name || 'Phòng 1';
  } else if (entityType === 'SCORES') {
    obj.examType = '1_TIET';
    obj.subject = 'Toán';
    obj.date = new Date().toISOString().slice(0, 10);
    if (workspace.students[0]) {
      obj.studentCode = workspace.students[0].code;
      obj.studentName = workspace.students[0].fullName;
      obj.centerClass = workspace.students[0].centerClass;
    }
  } else if (entityType === 'TIMETABLE') {
    obj.day = 'T2';
    obj.period = 'SANG';
    obj.shift = 'CA_1';
    obj.centerClass = 'Lớp 7A1';
    obj.subject = 'Toán';
    obj.teacherName = workspace.teachers[0]?.shortName || 'Cô Mẫn';
    obj.room = workspace.rooms[0]?.name || 'Phòng 1';
    obj.slotType = 'MAIN';
  }
  return obj;
}

export const UniversalSmartImportModal: React.FC<UniversalSmartImportModalProps> = ({
  open,
  entityType,
  workspace,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<InputMode>('EXCEL');
  const [singleForm, setSingleForm] = useState<Record<string, string>>(() =>
    makeEmptyRow(entityType, workspace),
  );
  const [pasteText, setPasteText] = useState('');
  const [spreadsheet, setSpreadsheet] = useState<ParsedSpreadsheet | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [timetableSyncMode, setTimetableSyncMode] = useState<TimetableSyncMode>('UPSERT');

  const [loadingAi, setLoadingAi] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Live camera capture for desktop/mobile webcam
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const schema = ENTITY_FIELD_SCHEMAS[entityType];
  const meta = ENTITY_META[entityType];

  const existingCodesSet = useMemo(
    () => new Set(workspace.students.map((s) => s.code.toUpperCase())),
    [workspace.students],
  );

  const existingPhoneMap = useMemo(() => {
    const map = new Map<string, string[]>();
    workspace.students.forEach((s) => {
      const p = normalizePhoneVN(s.parentPhone);
      if (p.length >= 8) {
        const list = map.get(p) || [];
        list.push(s.fullName);
        map.set(p, list);
      }
    });
    return map;
  }, [workspace.students]);

  const singleSmartCodePreview = useMemo(() => {
    if (entityType !== 'STUDENTS') return '';
    return generateSmartStudentCode(singleForm.centerClass || 'Lớp 7A1', existingCodesSet, {
      fallbackGrade: Number(singleForm.grade) || 7,
    });
  }, [entityType, singleForm.centerClass, singleForm.grade, existingCodesSet]);

  if (!open) return null;

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  async function startLiveCamera() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setErrorMsg('Không thể mở Camera trực tiếp trên thiết bị này. Vui lòng dùng nút "Chụp từ điện thoại / Chọn ảnh" bên cạnh.');
    }
  }

  async function captureCameraFrameAndAnalyze() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    stopCamera();
    await runAiSmartExtract({ fileBase64: dataUrl, mimeType: 'image/jpeg' }, 'Ảnh chụp từ Camera trực tiếp');
  }

  function loadRowsIntoPreview(rawRecords: Record<string, unknown>[], sourceLabel: string) {
    const normalized: PreviewRow[] = rawRecords.map((rec, idx) => {
      const data: Record<string, string> = {};
      schema.forEach((f) => {
        const val = rec[f.key];
        data[f.key] = val === undefined || val === null ? '' : String(val).trim();
      });
      // For timetable, reconcile canonical teacher & room names right in preview
      if (entityType === 'TIMETABLE') {
        const d = normalizeDayCode(data.day);
        if (d) data.day = d;
        data.period = normalizePeriodCode(data.period);
        data.shift = normalizeShiftCode(data.shift);
        const mt = matchCanonicalTeacher(data.teacherName, workspace.teachers);
        if (mt) data.teacherName = mt.shortName;
        const mr = matchCanonicalRoom(data.room, workspace.rooms);
        if (mr) data.room = mr.name;
      }
      return {
        _id: `row-${Date.now()}-${idx}`,
        _selected: true,
        data,
      };
    });
    setPreviewRows(normalized);
    setInfoMsg(`Đã nạp ${normalized.length} dòng từ ${sourceLabel}. Bạn có thể chỉnh trực tiếp từng ô trước khi xác nhận lưu.`);
  }

  async function handleExcelFileChange(file: File | undefined, preferredSheet?: string) {
    if (!file) return;
    setErrorMsg('');
    setInfoMsg('');
    try {
      const parsed = await parseExcelOrCsvFile(file, preferredSheet);
      setUploadedExcelFile(file);
      setSpreadsheet(parsed);
      const autoMap = autoMapColumns(parsed.headers, entityType);
      setColumnMapping(autoMap);
      const mapped = applyColumnMapping(parsed.rows, autoMap, entityType);
      loadRowsIntoPreview(mapped, `file "${file.name}" (Sheet: ${parsed.activeSheet})`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đọc file Excel/CSV này.');
    }
  }

  function handleUpdateMapping(fieldKey: string, sourceHeader: string) {
    const next = { ...columnMapping, [fieldKey]: sourceHeader };
    setColumnMapping(next);
    if (spreadsheet) {
      const mapped = applyColumnMapping(spreadsheet.rows, next, entityType);
      loadRowsIntoPreview(mapped, `ánh xạ cột mới (${spreadsheet.activeSheet})`);
    }
  }

  async function handleExcelAiFallback() {
    if (!spreadsheet) return;
    const compact = spreadsheetToCompactText(spreadsheet);
    await runAiSmartExtract({ rawText: compact }, `AI đọc cấu trúc bảng Excel (${spreadsheet.activeSheet})`);
  }

  function handleParsePastedText() {
    setErrorMsg('');
    if (!pasteText.trim()) {
      setErrorMsg('Vui lòng dán ít nhất 1 dòng dữ liệu từ Excel / Google Sheets.');
      return;
    }
    const parsed = parsePastedGrid(pasteText, entityType);
    const autoMap = autoMapColumns(parsed.headers, entityType);
    const mapped = applyColumnMapping(parsed.rows, autoMap, entityType);
    loadRowsIntoPreview(mapped, 'bảng dán hàng loạt');
  }

  function handleAddSingleToPreview(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    const missing = schema.filter((f) => f.required && !singleForm[f.key]?.trim());
    if (missing.length > 0) {
      setErrorMsg(`Vui lòng điền đầy đủ: ${missing.map((m) => m.label).join(', ')}.`);
      return;
    }
    const entry = { ...singleForm };
    if (entityType === 'STUDENTS' && !entry.code) {
      entry.code = singleSmartCodePreview;
    }
    setPreviewRows((prev) => [
      { _id: `row-${Date.now()}`, _selected: true, data: entry },
      ...prev,
    ]);
    setSingleForm(makeEmptyRow(entityType, workspace));
    setInfoMsg('Đã thêm 1 dòng vào danh sách duyệt bên dưới. Bạn có thể thêm tiếp hoặc bấm "Xác nhận đồng bộ".');
  }

  async function runAiSmartExtract(
    payload: { fileBase64?: string; mimeType?: string; rawText?: string },
    sourceLabel: string,
  ) {
    setLoadingAi(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await apiRequest<{ rows: Record<string, unknown>[]; count: number }>(
        '/api/v1/ai/smart-extract',
        {
          method: 'POST',
          body: JSON.stringify({
            entityType,
            ...payload,
          }),
        },
      );
      if (!Array.isArray(res.rows) || res.rows.length === 0) {
        setErrorMsg('AI chưa nhận diện được dòng dữ liệu nào rõ ràng từ tài liệu này. Hãy thử chụp rõ nét hơn hoặc dùng file Excel/Word.');
        return;
      }
      loadRowsIntoPreview(res.rows, `Gemini AI (${sourceLabel})`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối Gemini AI trích xuất tài liệu.');
    } finally {
      setLoadingAi(false);
    }
  }

  async function handleMultimodalFileUpload(file: File | undefined) {
    if (!file) return;
    setErrorMsg('');
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      setLoadingAi(true);
      try {
        const text = await extractTextFromDocxFile(file);
        await runAiSmartExtract({ rawText: text }, `Word ${file.name}`);
      } catch (err: unknown) {
        setLoadingAi(false);
        setErrorMsg(err instanceof Error ? err.message : 'Không đọc được file Word (.docx).');
      }
      return;
    }

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
      await handleExcelFileChange(file);
      return;
    }

    if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      if (file.size > 7 * 1024 * 1024) {
        setErrorMsg('File PDF vượt quá 7MB. Vui lòng nén hoặc tách nhỏ trang cần nhập.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        void runAiSmartExtract({ fileBase64: dataUrl, mimeType: 'application/pdf' }, `PDF ${file.name}`);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Image file
    try {
      const compressed = await compressImageFile(file, { maxDim: 1600, quality: 0.85 });
      await runAiSmartExtract(
        { fileBase64: compressed.dataUrl, mimeType: compressed.mimeType },
        `Ảnh ${file.name} (${compressed.compressedKB} KB)`,
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xử lý ảnh tải lên.');
    }
  }

  function updateCell(rowId: string, key: string, value: string) {
    setPreviewRows((prev) =>
      prev.map((r) => (r._id === rowId ? { ...r, data: { ...r.data, [key]: value } } : r)),
    );
  }

  function toggleRow(rowId: string) {
    setPreviewRows((prev) =>
      prev.map((r) => (r._id === rowId ? { ...r, _selected: !r._selected } : r)),
    );
  }

  function removeRow(rowId: string) {
    setPreviewRows((prev) => prev.filter((r) => r._id !== rowId));
  }

  function addBlankPreviewRow() {
    setPreviewRows((prev) => [
      ...prev,
      { _id: `row-${Date.now()}`, _selected: true, data: makeEmptyRow(entityType, workspace) },
    ]);
  }

  // Compute smart preview codes & sibling notices for STUDENTS
  const studentCodePreviews = useMemo(() => {
    if (entityType !== 'STUDENTS') return new Map<string, { code: string; siblingOf?: string }>();
    const map = new Map<string, { code: string; siblingOf?: string }>();
    const workingCodes = new Set(existingCodesSet);
    const batchPhoneNames = new Map<string, string>();

    previewRows.forEach((r) => {
      if (!r._selected) return;
      const requested = r.data.code?.trim().toUpperCase();
      const code =
        requested && !workingCodes.has(requested)
          ? requested
          : generateSmartStudentCode(r.data.centerClass || 'Lớp 7A1', workingCodes, {
              fallbackGrade: Number(r.data.grade) || 7,
            });
      workingCodes.add(code);

      const normPhone = normalizePhoneVN(r.data.parentPhone || '');
      let siblingOf: string | undefined;
      if (normPhone.length >= 8) {
        const existingSib = existingPhoneMap.get(normPhone);
        if (existingSib && existingSib.length > 0) {
          siblingOf = existingSib[0];
        } else if (batchPhoneNames.has(normPhone)) {
          siblingOf = batchPhoneNames.get(normPhone);
        } else {
          batchPhoneNames.set(normPhone, r.data.fullName || 'Anh/chị trong danh sách');
        }
      }
      map.set(r._id, { code, siblingOf });
    });
    return map;
  }, [entityType, previewRows, existingCodesSet, existingPhoneMap]);

  const selectedRows = previewRows.filter((r) => r._selected);

  async function handleCommit() {
    if (selectedRows.length === 0) {
      setErrorMsg('Chưa có dòng dữ liệu nào được tick chọn để lưu.');
      return;
    }
    setCommitting(true);
    setErrorMsg('');
    try {
      const payloadRows = selectedRows.map((r) => r.data);
      let summary = '';

      if (entityType === 'STUDENTS') {
        const res = await apiRequest<{
          added: number;
          updated: number;
          skipped: number;
          familiesLinked: number;
        }>('/api/v1/students/bulk-import', {
          method: 'POST',
          body: JSON.stringify({ rows: payloadRows }),
        });
        summary = `Đã đồng bộ Học sinh: +${res.added} mới (tự sinh mã NT26 + QR động), cập nhật ${res.updated}, tự ghép ${res.familiesLinked} hồ sơ Gia đình nhiều con.`;
      } else if (entityType === 'TEACHERS') {
        const res = await apiRequest<{ added: number; updated: number; skipped: number }>(
          '/api/v1/teachers/bulk-import',
          {
            method: 'POST',
            body: JSON.stringify({ rows: payloadRows }),
          },
        );
        summary = `Đã đồng bộ Giáo viên: +${res.added} mới, cập nhật ${res.updated} hồ sơ (bỏ qua ${res.skipped}).`;
      } else if (entityType === 'SCORES') {
        const res = await apiRequest<{
          added: number;
          unmatched: number;
          unmatchedNames: string[];
        }>('/api/v1/scores/bulk-import', {
          method: 'POST',
          body: JSON.stringify({ rows: payloadRows }),
        });
        summary = `Đã lưu ${res.added} cột điểm vào Học bạ Online${
          res.unmatched > 0 ? ` (${res.unmatched} dòng chưa khớp tên HS: ${res.unmatchedNames.slice(0, 3).join(', ')})` : ''
        }.`;
      } else {
        const res = await apiRequest<{
          added: number;
          updated: number;
          skipped: number;
          warnings: string[];
        }>('/api/v1/timetable/smart-sync', {
          method: 'POST',
          body: JSON.stringify({ rows: payloadRows, mode: timetableSyncMode }),
        });
        summary = `Đã đồng bộ Thời khóa biểu (${timetableSyncMode}): +${res.added} ca mới, cập nhật ${res.updated} ca trùng${
          res.warnings.length > 0 ? ` · ${res.warnings.length} lưu ý cần rà soát` : ''
        }.`;
      }

      stopCamera();
      await onSuccess(summary);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi đồng bộ dữ liệu vào CSDL.');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
              Trung tâm Nhập liệu Đa chiều Thông minh · Nhân Trí
            </div>
            <h2 className="text-lg font-bold text-slate-950 mt-0.5">{meta.title}</h2>
            <p className="text-xs text-slate-600 mt-1">{meta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer shrink-0"
            aria-label="Đóng cửa sổ nhập liệu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'SINGLE', label: '1. Nhập lẻ', icon: UserPlus },
                { id: 'PASTE', label: '2. Dán bảng hàng loạt', icon: ClipboardPaste },
                { id: 'EXCEL', label: '3. Import Excel / CSV thông minh', icon: FileSpreadsheet },
                { id: 'AI_SCAN', label: '4. AI Camera / Ảnh / Word / PDF', icon: Sparkles },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMode(tab.id);
                    setErrorMsg('');
                  }}
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-blue-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => downloadOfficialExcelTemplate(entityType)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-xs font-semibold hover:bg-blue-100 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Tải File mẫu Excel (.xlsx)
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg('')} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {infoMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{infoMsg}</span>
            </div>
          )}

          {/* MODE 1: SINGLE ENTRY */}
          {mode === 'SINGLE' && (
            <form
              onSubmit={handleAddSingleToPreview}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-900">
                  Nhập nhanh từng mục (Chuẩn hóa tự động theo CSDL)
                </div>
                {entityType === 'STUDENTS' && (
                  <div className="text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md tabular-nums">
                    Mã HS thông minh dự kiến: {singleForm.code || singleSmartCodePreview}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {schema.map((field) => {
                  const val = singleForm[field.key] || '';
                  if (entityType === 'TIMETABLE' && field.key === 'teacherName') {
                    return (
                      <label key={field.key} className="block text-xs">
                        <span className="font-semibold text-slate-700">
                          {field.label} {field.required && <span className="text-red-600">*</span>}
                        </span>
                        <select
                          value={val}
                          onChange={(e) => setSingleForm({ ...singleForm, [field.key]: e.target.value })}
                          className="mt-1 w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          {workspace.teachers.map((t) => (
                            <option key={t.id} value={t.shortName}>
                              {t.shortName} — {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  if (entityType === 'TIMETABLE' && field.key === 'room') {
                    return (
                      <label key={field.key} className="block text-xs">
                        <span className="font-semibold text-slate-700">
                          {field.label} {field.required && <span className="text-red-600">*</span>}
                        </span>
                        <select
                          value={val}
                          onChange={(e) => setSingleForm({ ...singleForm, [field.key]: e.target.value })}
                          className="mt-1 w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          {workspace.rooms.map((rm) => (
                            <option key={rm.id} value={rm.name}>
                              {rm.name} ({rm.code})
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  return (
                    <label key={field.key} className="block text-xs">
                      <span className="font-semibold text-slate-700">
                        {field.label} {field.required && <span className="text-red-600">*</span>}
                      </span>
                      <input
                        type="text"
                        value={val}
                        placeholder={field.example}
                        onChange={(e) => setSingleForm({ ...singleForm, [field.key]: e.target.value })}
                        className="mt-1 w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Đưa vào Bảng duyệt bên dưới
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: BULK PASTE */}
          {mode === 'PASTE' && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Dán trực tiếp nhiều dòng từ Excel / Google Sheets (Tab hoặc dấu phẩy)
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Hệ thống tự động nhận diện dòng tiêu đề cột tiếng Việt và chuẩn hóa thành bảng xem trước.
                  </p>
                </div>
              </div>
              <textarea
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={meta.pastePlaceholder}
                className="w-full p-3 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Phân tích &amp; Nạp vào Bảng duyệt
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: SMART EXCEL / CSV */}
          {mode === 'EXCEL' && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Tải lên file Excel (.xlsx, .xls) hoặc CSV — Tự động ánh xạ cột thông minh
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Chấp nhận tên cột tự do (tiếng Việt có dấu, không dấu, viết tắt). Nếu file TKB có cấu trúc ô bảng đặc biệt, dùng nút "Nhờ Gemini AI chuẩn hóa".
                  </p>
                </div>

                <label className="min-h-[44px] px-4 py-2.5 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap">
                  <Upload className="w-4 h-4" />
                  {uploadedExcelFile ? 'Chọn file Excel khác' : 'Chọn file .xlsx / .xls / .csv'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => void handleExcelFileChange(e.target.files?.[0])}
                  />
                </label>
              </div>

              {spreadsheet && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900">
                        File: {uploadedExcelFile?.name}
                      </span>
                      <span className="text-slate-500">
                        ({spreadsheet.rows.length} dòng dữ liệu · {spreadsheet.headers.length} cột)
                      </span>
                      {spreadsheet.sheetNames.length > 1 && (
                        <select
                          value={spreadsheet.activeSheet}
                          onChange={(e) => void handleExcelFileChange(uploadedExcelFile || undefined, e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded text-xs"
                        >
                          {spreadsheet.sheetNames.map((sn) => (
                            <option key={sn} value={sn}>
                              Sheet: {sn}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={loadingAi}
                      onClick={() => void handleExcelAiFallback()}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {loadingAi ? 'AI đang chuẩn hóa...' : 'File cấu trúc lạ? Nhờ AI tự đọc toàn bảng'}
                    </button>
                  </div>

                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Bảng Ánh xạ Cột vào CSDL Nhân Trí (Smart Column Mapping)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {schema.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                      >
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {field.label}
                          {field.required && <span className="text-red-600"> *</span>}
                        </span>
                        <select
                          value={columnMapping[field.key] || ''}
                          onChange={(e) => handleUpdateMapping(field.key, e.target.value)}
                          className="max-w-[160px] px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        >
                          <option value="">— Bỏ qua —</option>
                          {spreadsheet.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 4: MULTIMODAL AI (CAMERA / PHOTO / WORD / PDF) */}
          {mode === 'AI_SCAN' && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Nhận dạng thông minh bằng Gemini AI — Camera điện thoại, Ảnh chụp, Word (.docx), PDF
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Chụp trực tiếp bảng danh sách / bài kiểm tra / lịch học dán ở trường hoặc tải lên file Word/PDF. AI tự động đọc, tách dòng và chuẩn hóa khớp với Giáo viên &amp; Phòng học Nhân Trí.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="min-h-[52px] px-4 py-3 rounded-xl bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center justify-center gap-2 cursor-pointer text-center">
                  <Camera className="w-4 h-4 shrink-0" />
                  Chụp trực tiếp (Camera điện thoại)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={loadingAi}
                    onChange={(e) => void handleMultimodalFileUpload(e.target.files?.[0])}
                  />
                </label>

                <button
                  type="button"
                  disabled={loadingAi}
                  onClick={() => void startLiveCamera()}
                  className="min-h-[52px] px-4 py-3 rounded-xl border border-blue-200 bg-white text-blue-900 text-xs font-semibold hover:bg-blue-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  Mở Webcam chụp ngay
                </button>

                <label className="min-h-[52px] px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold hover:bg-amber-100 flex items-center justify-center gap-2 cursor-pointer text-center">
                  <FileText className="w-4 h-4 shrink-0" />
                  Tải Ảnh / Word (.docx) / PDF
                  <input
                    type="file"
                    accept="image/*,.pdf,.docx,.xlsx,.xls,.csv"
                    className="hidden"
                    disabled={loadingAi}
                    onChange={(e) => void handleMultimodalFileUpload(e.target.files?.[0])}
                  />
                </label>
              </div>

              {cameraOpen && (
                <div className="bg-slate-950 rounded-xl p-3 space-y-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[300px] object-contain rounded-lg bg-black"
                  />
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void captureCameraFrameAndAnalyze()}
                      className="min-h-[44px] px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                    >
                      Chụp ảnh &amp; Cho AI phân tích ngay
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-600 cursor-pointer"
                    >
                      Hủy Camera
                    </button>
                  </div>
                </div>
              )}

              {loadingAi && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-900 flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 animate-spin shrink-0" />
                  Gemini AI đang phân tích tài liệu và chuẩn hóa dữ liệu theo CSDL Nhân Trí...
                </div>
              )}
            </div>
          )}

          {/* STEP 2: VALIDATION, RECONCILIATION & EDITABLE PREVIEW GATE */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-950 tabular-nums">
                  Bảng Đối chiếu &amp; Duyệt trước khi ghi CSDL ({selectedRows.length} / {previewRows.length} dòng được chọn)
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Chạm trực tiếp vào bất kỳ ô nào để sửa trước khi lưu.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {entityType === 'TIMETABLE' && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-slate-700">Chế độ đồng bộ:</span>
                    <select
                      value={timetableSyncMode}
                      onChange={(e) => setTimetableSyncMode(e.target.value as TimetableSyncMode)}
                      className="px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-blue-900"
                    >
                      <option value="UPSERT">Cập nhật bổ sung &amp; ghi đè ca trùng (Mặc định)</option>
                      <option value="APPEND">Chỉ thêm ca mới, bỏ qua ca trùng</option>
                      <option value="REPLACE_ALL">Thay thế toàn bộ Thời khóa biểu</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={addBlankPreviewRow}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm dòng
                </button>
              </div>
            </div>

            {previewRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Chưa có dòng dữ liệu nào trong bảng duyệt. Hãy chọn 1 trong 4 phương thức phía trên (Nhập lẻ, Dán bảng, Import Excel, hoặc AI Quét Camera/Word/PDF).
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="p-2 border-b border-slate-200 text-center w-9">
                        <input
                          type="checkbox"
                          checked={selectedRows.length === previewRows.length && previewRows.length > 0}
                          onChange={(e) =>
                            setPreviewRows((prev) =>
                              prev.map((r) => ({ ...r, _selected: e.target.checked })),
                            )
                          }
                        />
                      </th>
                      {entityType === 'STUDENTS' && (
                        <th className="p-2 border-b border-slate-200 text-left font-bold text-blue-900 whitespace-nowrap">
                          Mã HS NT26 / Ghép GĐ
                        </th>
                      )}
                      {schema.slice(0, 8).map((f) => (
                        <th
                          key={f.key}
                          className="p-2 border-b border-slate-200 text-left font-bold text-slate-700 whitespace-nowrap"
                        >
                          {f.label}
                        </th>
                      ))}
                      <th className="p-2 border-b border-slate-200 w-9" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => {
                      const stuMeta = studentCodePreviews.get(row._id);
                      return (
                        <tr key={row._id} className={row._selected ? 'bg-white' : 'bg-slate-50 opacity-55'}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={row._selected}
                              onChange={() => toggleRow(row._id)}
                            />
                          </td>
                          {entityType === 'STUDENTS' && (
                            <td className="p-2 whitespace-nowrap">
                              <div className="font-bold text-blue-900 tabular-nums">
                                {stuMeta?.code || 'Tự sinh'}
                              </div>
                              {stuMeta?.siblingOf && (
                                <div className="text-[10px] font-semibold text-emerald-700">
                                  Ghép GĐ cùng {stuMeta.siblingOf}
                                </div>
                              )}
                            </td>
                          )}
                          {schema.slice(0, 8).map((f) => {
                            if (entityType === 'TIMETABLE' && f.key === 'teacherName') {
                              return (
                                <td key={f.key} className="p-1.5">
                                  <select
                                    value={row.data[f.key] || ''}
                                    onChange={(e) => updateCell(row._id, f.key, e.target.value)}
                                    className="w-full min-w-[115px] px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                                  >
                                    <option value={row.data[f.key] || ''}>
                                      {row.data[f.key] || '— Chọn GV —'}
                                    </option>
                                    {workspace.teachers.map((t) => (
                                      <option key={t.id} value={t.shortName}>
                                        {t.shortName}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }
                            if (entityType === 'TIMETABLE' && f.key === 'room') {
                              return (
                                <td key={f.key} className="p-1.5">
                                  <select
                                    value={row.data[f.key] || ''}
                                    onChange={(e) => updateCell(row._id, f.key, e.target.value)}
                                    className="w-full min-w-[100px] px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                                  >
                                    <option value={row.data[f.key] || ''}>
                                      {row.data[f.key] || '— Chọn phòng —'}
                                    </option>
                                    {workspace.rooms.map((rm) => (
                                      <option key={rm.id} value={rm.name}>
                                        {rm.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }
                            return (
                              <td key={f.key} className="p-1.5">
                                <input
                                  type="text"
                                  value={row.data[f.key] || ''}
                                  onChange={(e) => updateCell(row._id, f.key, e.target.value)}
                                  className="w-full min-w-[95px] px-2 py-1 text-xs border border-slate-200 rounded focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                            );
                          })}
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeRow(row._id)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              aria-label="Xóa dòng"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Dữ liệu được chuẩn hóa và lưu trực tiếp vào hệ thống đồng bộ Nhân Trí.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={committing || selectedRows.length === 0}
              onClick={() => void handleCommit()}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {committing
                ? 'Đang đồng bộ CSDL...'
                : `Xác nhận Đồng bộ ${selectedRows.length} dòng vào CSDL`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
