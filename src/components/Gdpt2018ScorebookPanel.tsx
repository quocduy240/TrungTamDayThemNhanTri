import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  GraduationCap,
  Save,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { ScoreRecord, Student } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import {
  buildBatchUpsertItemsForRow,
  buildEnrollmentConfigUpsertItem,
  buildStudentFullTranscript,
  calculateSemesterSummary,
  CURRENT_ACADEMIC_YEAR,
  extractStudentSubjectSemesterRow,
  getEnrolledCurriculumForStudent,
  getGradeCurriculum,
  getStudentEnrollmentConfig,
  normalizeGdptGradeLevel,
  SUBJECTS_23,
  validateThptElectiveSelection,
  type GdptBatchUpsertItem,
  type GdptGradeLevel,
  type GdptPassStatus,
  type GdptSemesterInputRow,
} from '../lib/gdpt2018ScoreEngine';

interface Gdpt2018BackendScorebookPanelProps {
  workspace: WorkspacePayload;
  selectedStudentId: string;
  onSelectStudentId: (studentId: string) => void;
  onRefresh: () => Promise<void>;
}

export const Gdpt2018BackendScorebookPanel: React.FC<Gdpt2018BackendScorebookPanelProps> = ({
  workspace,
  selectedStudentId,
  onSelectStudentId,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<'BULK_CLASS' | 'SINGLE_STUDENT' | 'TRANSCRIPT_CURRICULUM'>(
    'BULK_CLASS',
  );
  const [academicYear, setAcademicYear] = useState<string>(CURRENT_ACADEMIC_YEAR);
  const [semester, setSemester] = useState<1 | 2>(1);

  const allGrades: GdptGradeLevel[] = [6, 7, 8, 9, 10, 11, 12];
  const selectedStudent = useMemo(
    () => workspace.students.find((s) => s.id === selectedStudentId) || workspace.students[0] || null,
    [workspace.students, selectedStudentId],
  );

  const [selectedGrade, setSelectedGrade] = useState<GdptGradeLevel>(() =>
    selectedStudent ? normalizeGdptGradeLevel(selectedStudent.grade, selectedStudent.centerClass) : 6,
  );
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');

  const gradeCurriculum = useMemo(() => getGradeCurriculum(selectedGrade), [selectedGrade]);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string>('TOAN');

  useEffect(() => {
    if (!gradeCurriculum.some((c) => c.subjectCode === selectedSubjectCode)) {
      setSelectedSubjectCode(gradeCurriculum[0]?.subjectCode || 'TOAN');
    }
  }, [gradeCurriculum, selectedSubjectCode]);

  const activeCurriculumItem = useMemo(
    () =>
      gradeCurriculum.find((c) => c.subjectCode === selectedSubjectCode) ||
      gradeCurriculum[0],
    [gradeCurriculum, selectedSubjectCode],
  );

  const classOptionsForGrade = useMemo(() => {
    const classes = new Set<string>();
    for (const st of workspace.students) {
      const g = normalizeGdptGradeLevel(st.grade, st.centerClass);
      if (g === selectedGrade && st.centerClass) {
        classes.add(st.centerClass);
      }
    }
    return Array.from(classes).sort();
  }, [workspace.students, selectedGrade]);

  const studentsInBulkScope = useMemo(() => {
    return workspace.students.filter((st) => {
      const g = normalizeGdptGradeLevel(st.grade, st.centerClass);
      if (g !== selectedGrade) return false;
      if (selectedClassFilter !== 'ALL' && st.centerClass !== selectedClassFilter) return false;
      return true;
    });
  }, [workspace.students, selectedGrade, selectedClassFilter]);

  const [bulkDrafts, setBulkDrafts] = useState<Record<string, GdptSemesterInputRow>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!activeCurriculumItem) return;
    const nextDrafts: Record<string, GdptSemesterInputRow> = {};
    for (const st of studentsInBulkScope) {
      nextDrafts[st.id] = extractStudentSubjectSemesterRow(
        st,
        activeCurriculumItem.subjectCode,
        semester,
        workspace.scores,
        academicYear,
      );
    }
    setBulkDrafts(nextDrafts);
  }, [studentsInBulkScope, activeCurriculumItem, semester, workspace.scores, academicYear]);

  const [singleDrafts, setSingleDrafts] = useState<Record<string, GdptSemesterInputRow>>({});
  const [electiveDraft, setElectiveDraft] = useState<string[]>([]);
  const [studyTopicDraft, setStudyTopicDraft] = useState<string[]>([]);
  const [optionalDraft, setOptionalDraft] = useState<string[]>([]);
  const [exemptedDraft, setExemptedDraft] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedStudent) return;
    const cfg = getStudentEnrollmentConfig(selectedStudent, workspace.scores, academicYear);
    setElectiveDraft(cfg.electiveCodes);
    setStudyTopicDraft(cfg.studyTopicCodes);
    setOptionalDraft(cfg.optionalCodes);
    setExemptedDraft(cfg.exemptedCodes);

    const enrolled = getEnrolledCurriculumForStudent(selectedStudent, workspace.scores, academicYear);
    const next: Record<string, GdptSemesterInputRow> = {};
    for (const item of enrolled) {
      next[item.subjectCode] = extractStudentSubjectSemesterRow(
        selectedStudent,
        item.subjectCode,
        semester,
        workspace.scores,
        academicYear,
      );
    }
    setSingleDrafts(next);
  }, [selectedStudent, semester, workspace.scores, academicYear]);

  async function submitBatchItems(items: GdptBatchUpsertItem[], successText: string) {
    setSavingBulk(true);
    setNotice(null);
    try {
      await apiRequest('/api/v1/scores/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ rows: items }),
      });
      await onRefresh();
      setNotice({ ok: true, text: successText });
    } catch (err: unknown) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : 'Không thể lưu bảng điểm GDPT 2018.',
      });
    } finally {
      setSavingBulk(false);
    }
  }

  async function handleSaveBulkClassSubject() {
    if (!activeCurriculumItem || studentsInBulkScope.length === 0) return;
    const allItems: GdptBatchUpsertItem[] = [];
    for (const st of studentsInBulkScope) {
      const row = bulkDrafts[st.id];
      if (!row) continue;
      allItems.push(...buildBatchUpsertItemsForRow(st, row, academicYear));
    }
    await submitBatchItems(
      allItems,
      `Đã lưu bảng điểm hàng loạt môn ${activeCurriculumItem.subjectName} (HK${semester} · Khối ${selectedGrade}) cho ${studentsInBulkScope.length} học sinh lên Cloudflare D1.`,
    );
  }

  async function handleSaveSingleStudentEnrollmentAndScores() {
    if (!selectedStudent) return;
    const gradeLevel = normalizeGdptGradeLevel(selectedStudent.grade, selectedStudent.centerClass);
    if (gradeLevel >= 10) {
      const check = validateThptElectiveSelection(gradeLevel, electiveDraft, studyTopicDraft);
      if (!check.valid) {
        setNotice({ ok: false, text: check.errors.join(' ') });
        return;
      }
    }

    const cfgItem = buildEnrollmentConfigUpsertItem(selectedStudent, {
      studentId: selectedStudent.id,
      academicYear,
      gradeLevel,
      electiveCodes: electiveDraft,
      studyTopicCodes: studyTopicDraft,
      optionalCodes: optionalDraft,
      exemptedCodes: exemptedDraft,
    });

    const allItems: GdptBatchUpsertItem[] = [cfgItem];
    for (const code of Object.keys(singleDrafts)) {
      const row = singleDrafts[code];
      if (!row) continue;
      allItems.push(
        ...buildBatchUpsertItemsForRow(
          selectedStudent,
          {
            ...row,
            hasStudyTopic: gradeLevel >= 10 && studyTopicDraft.includes(code),
            isExempted: exemptedDraft.includes(code),
          },
          academicYear,
        ),
      );
    }

    await submitBatchItems(
      allItems,
      `Đã lưu Tổ hợp môn học & Bảng điểm HK${semester} của học sinh ${selectedStudent.fullName} (${selectedStudent.centerClass}) lên Cloudflare D1.`,
    );
  }

  function updateBulkScoreCell(
    studentId: string,
    field: 'TX' | 'CD' | 'GK' | 'CK' | 'COMMENT',
    value: string,
    txIdx = 0,
  ) {
    setBulkDrafts((prev) => {
      const current = prev[studentId];
      if (!current) return prev;
      const copy: GdptSemesterInputRow = {
        ...current,
        txScores: [...current.txScores],
        txPass: [...current.txPass],
      };
      if (field === 'COMMENT') {
        copy.teacherComment = value;
      } else if (copy.evaluationType === 'SCORE') {
        const parsed =
          value.trim() === ''
            ? null
            : Math.max(0, Math.min(10, Math.round(Number(value) * 10) / 10));
        const safeNum = parsed !== null && Number.isFinite(parsed) ? parsed : null;
        if (field === 'TX') copy.txScores[txIdx] = safeNum;
        if (field === 'CD') copy.chuyenDeScore = safeNum;
        if (field === 'GK') copy.gkScore = safeNum;
        if (field === 'CK') copy.ckScore = safeNum;
      } else {
        const passVal: GdptPassStatus | null =
          value === 'DAT' ? 'DAT' : value === 'CHUA_DAT' ? 'CHUA_DAT' : null;
        if (field === 'TX') copy.txPass[txIdx] = passVal;
        if (field === 'CD') copy.chuyenDePass = passVal;
        if (field === 'GK') copy.gkPass = passVal;
        if (field === 'CK') copy.ckPass = passVal;
      }
      return { ...prev, [studentId]: copy };
    });
  }

  function updateSingleStudentCell(
    subjectCode: string,
    field: 'TX' | 'CD' | 'GK' | 'CK' | 'COMMENT',
    value: string,
    txIdx = 0,
  ) {
    setSingleDrafts((prev) => {
      const current = prev[subjectCode];
      if (!current) return prev;
      const copy: GdptSemesterInputRow = {
        ...current,
        txScores: [...current.txScores],
        txPass: [...current.txPass],
      };
      if (field === 'COMMENT') {
        copy.teacherComment = value;
      } else if (copy.evaluationType === 'SCORE') {
        const parsed =
          value.trim() === ''
            ? null
            : Math.max(0, Math.min(10, Math.round(Number(value) * 10) / 10));
        const safeNum = parsed !== null && Number.isFinite(parsed) ? parsed : null;
        if (field === 'TX') copy.txScores[txIdx] = safeNum;
        if (field === 'CD') copy.chuyenDeScore = safeNum;
        if (field === 'GK') copy.gkScore = safeNum;
        if (field === 'CK') copy.ckScore = safeNum;
      } else {
        const passVal: GdptPassStatus | null =
          value === 'DAT' ? 'DAT' : value === 'CHUA_DAT' ? 'CHUA_DAT' : null;
        if (field === 'TX') copy.txPass[txIdx] = passVal;
        if (field === 'CD') copy.chuyenDePass = passVal;
        if (field === 'GK') copy.gkPass = passVal;
        if (field === 'CK') copy.ckPass = passVal;
      }
      return { ...prev, [subjectCode]: copy };
    });
  }

  function handleSetAllPassForBulkSubject() {
    if (!activeCurriculumItem || activeCurriculumItem.evaluationType !== 'PASS_FAIL') return;
    setBulkDrafts((prev) => {
      const next = { ...prev };
      for (const st of studentsInBulkScope) {
        const row = next[st.id];
        if (!row) continue;
        next[st.id] = {
          ...row,
          txPass: [
            'DAT',
            'DAT',
            row.requiredTxCount >= 3 ? 'DAT' : null,
            row.requiredTxCount >= 4 ? 'DAT' : null,
          ],
          chuyenDePass: row.hasStudyTopic ? 'DAT' : null,
          gkPass: 'DAT',
          ckPass: 'DAT',
          teacherComment: row.teacherComment || 'Hoàn thành tốt nội dung môn học.',
        };
      }
      return next;
    });
  }

  const selectedStudentTranscript = useMemo(() => {
    if (!selectedStudent) return null;
    return buildStudentFullTranscript(selectedStudent, workspace.scores, academicYear);
  }, [selectedStudent, workspace.scores, academicYear]);

  const selectedStudentGrade = selectedStudent
    ? normalizeGdptGradeLevel(selectedStudent.grade, selectedStudent.centerClass)
    : 6;

  return (
    <div className="bg-white border-2 border-blue-900/15 rounded-2xl p-5 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-950 mb-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-blue-900" />
            <span>CHUẨN GDPT 2018 · THÔNG TƯ 32/2018, 13/2022 &amp; THÔNG TƯ 22/2021/TT-BGDĐT</span>
          </div>
          <h2 className="text-lg font-extrabold text-slate-950">
            Hệ thống Quản lý 23 Môn học &amp; Sổ điểm Điện tử Khối 6 – 12 (THCS &amp; THPT)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Tự động phân bổ số cột ĐĐGtx (2 / 3 / 4 cột theo số tiết 35–140 tiết/năm), tách biệt môn Tính điểm (0.0–10.0) &amp; môn Nhận xét (Đạt/Chưa đạt), hỗ trợ 4 môn lựa chọn + 3 chuyên đề THPT.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('BULK_CLASS')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'BULK_CLASS'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Nhập điểm Hàng loạt (Theo Lớp &amp; Môn)</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('SINGLE_STUDENT')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'SINGLE_STUDENT'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>2. Nhập theo Học sinh &amp; Tổ hợp THPT</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('TRANSCRIPT_CURRICULUM')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'TRANSCRIPT_CURRICULUM'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>3. Học bạ Tổng hợp &amp; Khung 23 Môn</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            notice.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice.text}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {subTab === 'BULK_CLASS' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Năm học
              </label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-950"
              >
                <option value="2025-2026">Năm học 2025-2026</option>
                <option value="2026-2027">Năm học 2026-2027</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Khối lớp (THCS 6–9 / THPT 10–12)
              </label>
              <select
                value={selectedGrade}
                onChange={(e) => {
                  setSelectedGrade(Number(e.target.value) as GdptGradeLevel);
                  setSelectedClassFilter('ALL');
                }}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-950"
              >
                {allGrades.map((g) => (
                  <option key={g} value={g}>
                    Khối {g} ({g <= 9 ? 'Cấp THCS - 12 môn bắt buộc' : 'Cấp THPT - 8 bắt buộc + 4 tự chọn'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Lớp học tại Trung tâm
              </label>
              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-950"
              >
                <option value="ALL">
                  Tất cả lớp Khối {selectedGrade} ({studentsInBulkScope.length} HS)
                </option>
                {classOptionsForGrade.map((cls) => (
                  <option key={cls} value={cls}>
                    Lớp {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Môn học theo Khối {selectedGrade} ({gradeCurriculum.length} môn)
              </label>
              <select
                value={selectedSubjectCode}
                onChange={(e) => setSelectedSubjectCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-blue-900/40 rounded-lg bg-white text-blue-950"
              >
                {gradeCurriculum.map((item) => (
                  <option key={item.subjectCode} value={item.subjectCode}>
                    [{item.subjectCode}] {item.subjectName} (
                    {item.evaluationType === 'SCORE' ? 'Tính điểm' : 'Đạt/Chưa đạt'} ·{' '}
                    {item.requiredTxCount} ĐĐGtx)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Học kì nhập điểm
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSemester(1)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                    semester === 1
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Học kì I (HK1)
                </button>
                <button
                  type="button"
                  onClick={() => setSemester(2)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                    semester === 2
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Học kì II (HK2)
                </button>
              </div>
            </div>
          </div>

          {activeCurriculumItem && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-blue-950 text-sm">
                  Môn: {activeCurriculumItem.subjectName} ({activeCurriculumItem.subjectCode})
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                    activeCurriculumItem.requirementType === 'MANDATORY'
                      ? 'bg-blue-900 text-white'
                      : activeCurriculumItem.requirementType === 'ELECTIVE_GROUP'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {activeCurriculumItem.requirementType === 'MANDATORY'
                    ? 'Môn Bắt buộc (MANDATORY)'
                    : activeCurriculumItem.requirementType === 'ELECTIVE_GROUP'
                      ? 'Nhóm Lựa chọn THPT 4/9 môn (ELECTIVE_GROUP)'
                      : 'Môn Tự chọn (OPTIONAL)'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white border border-blue-200 font-semibold text-slate-800">
                  Thời lượng: <strong>{activeCurriculumItem.periodsPerYear} tiết/năm</strong> →{' '}
                  <strong>{activeCurriculumItem.requiredTxCount} cột ĐĐGtx / học kì</strong>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold ${
                    activeCurriculumItem.evaluationType === 'SCORE'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-purple-100 text-purple-900 border border-purple-300'
                  }`}
                >
                  {activeCurriculumItem.evaluationType === 'SCORE'
                    ? 'Đánh giá bằng Điểm số (0.0 – 10.0) + Nhận xét'
                    : 'Đánh giá bằng Nhận xét (Đạt / Chưa đạt — Không nhập số)'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeCurriculumItem.evaluationType === 'PASS_FAIL' && (
                  <button
                    type="button"
                    onClick={handleSetAllPassForBulkSubject}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-900 text-white hover:bg-purple-800 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Đặt nhanh Tất cả Đạt (Đ)</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingBulk || studentsInBulkScope.length === 0}
                  onClick={handleSaveBulkClassSubject}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingBulk
                      ? 'Đang lưu lên Cloudflare D1...'
                      : `Lưu Bảng điểm Lớp (${studentsInBulkScope.length} HS)`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {studentsInBulkScope.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-600">
              Hiện chưa có học sinh nào thuộc <strong>Khối {selectedGrade}</strong> trong danh sách. Hãy chọn Khối lớp khác hoặc thêm học sinh ở tab Học sinh &amp; Điểm danh.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">#</th>
                    <th className="py-2.5 px-3 font-bold">Mã HS</th>
                    <th className="py-2.5 px-3 font-bold min-w-[160px]">Họ và tên Học sinh</th>
                    <th className="py-2.5 px-2 font-bold text-center">Lớp</th>
                    {Array.from({ length: activeCurriculumItem?.requiredTxCount || 3 }).map(
                      (_, idx) => (
                        <th
                          key={idx}
                          className="py-2.5 px-2 font-bold text-center bg-blue-50/60 text-blue-950"
                        >
                          ĐĐGtx {idx + 1}
                          <div className="text-[10px] font-normal text-slate-500">Hệ số 1</div>
                        </th>
                      ),
                    )}
                    {selectedGrade >= 10 && (
                      <th className="py-2.5 px-2 font-bold text-center bg-amber-50/70 text-amber-950">
                        Chuyên đề
                        <div className="text-[10px] font-normal text-amber-800">CĐ · HS 1</div>
                      </th>
                    )}
                    <th className="py-2.5 px-2 font-bold text-center bg-indigo-50/60 text-indigo-950">
                      Giữa kì (GK)
                      <div className="text-[10px] font-normal text-indigo-700">Hệ số 2</div>
                    </th>
                    <th className="py-2.5 px-2 font-bold text-center bg-emerald-50/60 text-emerald-950">
                      Cuối kì (CK)
                      <div className="text-[10px] font-normal text-emerald-700">Hệ số 3</div>
                    </th>
                    <th className="py-2.5 px-3 font-extrabold text-center bg-slate-200/70 text-slate-950">
                      ĐTB HK{semester}
                      <div className="text-[10px] font-normal text-slate-600">TT 22/2021</div>
                    </th>
                    <th className="py-2.5 px-3 font-bold min-w-[180px]">
                      Nhận xét của Giáo viên
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {studentsInBulkScope.map((st, rowIdx) => {
                    const row = bulkDrafts[st.id];
                    if (!row || !activeCurriculumItem) return null;
                    const summary = calculateSemesterSummary(row);

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-mono-num text-slate-500">{rowIdx + 1}</td>
                        <td className="py-2 px-3 font-mono-num font-semibold text-slate-700 whitespace-nowrap">
                          {st.code}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-950">{st.fullName}</td>
                        <td className="py-2 px-2 text-center font-semibold text-blue-900">
                          {st.centerClass}
                        </td>

                        {Array.from({ length: activeCurriculumItem.requiredTxCount }).map(
                          (_, txIdx) => (
                            <td key={txIdx} className="py-1.5 px-1.5 text-center">
                              {activeCurriculumItem.evaluationType === 'SCORE' ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  max={10}
                                  placeholder="—"
                                  value={row.txScores[txIdx] ?? ''}
                                  onChange={(e) =>
                                    updateBulkScoreCell(st.id, 'TX', e.target.value, txIdx)
                                  }
                                  className="w-16 px-2 py-1.5 text-center font-mono-num font-bold text-slate-950 border border-slate-300 rounded-lg focus:border-blue-900 focus:outline-none"
                                />
                              ) : (
                                <select
                                  value={row.txPass[txIdx] ?? ''}
                                  onChange={(e) =>
                                    updateBulkScoreCell(st.id, 'TX', e.target.value, txIdx)
                                  }
                                  className="w-24 px-1.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                                >
                                  <option value="">--</option>
                                  <option value="DAT">Đạt (Đ)</option>
                                  <option value="CHUA_DAT">Chưa đạt</option>
                                </select>
                              )}
                            </td>
                          ),
                        )}

                        {selectedGrade >= 10 && (
                          <td className="py-1.5 px-1.5 text-center bg-amber-50/20">
                            {!row.hasStudyTopic ? (
                              <span className="text-[11px] text-slate-400">Không ĐK</span>
                            ) : activeCurriculumItem.evaluationType === 'SCORE' ? (
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={10}
                                placeholder="CĐ"
                                value={row.chuyenDeScore ?? ''}
                                onChange={(e) => updateBulkScoreCell(st.id, 'CD', e.target.value)}
                                className="w-16 px-2 py-1.5 text-center font-mono-num font-bold text-amber-950 border border-amber-300 rounded-lg bg-amber-50/40"
                              />
                            ) : (
                              <select
                                value={row.chuyenDePass ?? ''}
                                onChange={(e) => updateBulkScoreCell(st.id, 'CD', e.target.value)}
                                className="w-24 px-1.5 py-1.5 text-xs font-bold border border-amber-300 rounded-lg bg-white"
                              >
                                <option value="">--</option>
                                <option value="DAT">Đạt (Đ)</option>
                                <option value="CHUA_DAT">Chưa đạt</option>
                              </select>
                            )}
                          </td>
                        )}

                        <td className="py-1.5 px-1.5 text-center">
                          {activeCurriculumItem.evaluationType === 'SCORE' ? (
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={10}
                              placeholder="GK"
                              value={row.gkScore ?? ''}
                              onChange={(e) => updateBulkScoreCell(st.id, 'GK', e.target.value)}
                              className="w-16 px-2 py-1.5 text-center font-mono-num font-bold text-indigo-950 border border-indigo-300 rounded-lg bg-indigo-50/30"
                            />
                          ) : (
                            <select
                              value={row.gkPass ?? ''}
                              onChange={(e) => updateBulkScoreCell(st.id, 'GK', e.target.value)}
                              className="w-24 px-1.5 py-1.5 text-xs font-bold border border-indigo-300 rounded-lg bg-white"
                            >
                              <option value="">--</option>
                              <option value="DAT">Đạt (Đ)</option>
                              <option value="CHUA_DAT">Chưa đạt</option>
                            </select>
                          )}
                        </td>

                        <td className="py-1.5 px-1.5 text-center">
                          {activeCurriculumItem.evaluationType === 'SCORE' ? (
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={10}
                              placeholder="CK"
                              value={row.ckScore ?? ''}
                              onChange={(e) => updateBulkScoreCell(st.id, 'CK', e.target.value)}
                              className="w-16 px-2 py-1.5 text-center font-mono-num font-bold text-emerald-950 border border-emerald-300 rounded-lg bg-emerald-50/30"
                            />
                          ) : (
                            <select
                              value={row.ckPass ?? ''}
                              onChange={(e) => updateBulkScoreCell(st.id, 'CK', e.target.value)}
                              className="w-24 px-1.5 py-1.5 text-xs font-bold border border-emerald-300 rounded-lg bg-white"
                            >
                              <option value="">--</option>
                              <option value="DAT">Đạt (Đ)</option>
                              <option value="CHUA_DAT">Chưa đạt</option>
                            </select>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center font-mono-num bg-slate-50">
                          {activeCurriculumItem.evaluationType === 'SCORE' ? (
                            summary.avgScore !== null ? (
                              <div className="inline-flex flex-col items-center">
                                <span
                                  className={`text-sm font-extrabold ${
                                    summary.avgScore >= 8
                                      ? 'text-emerald-700'
                                      : summary.avgScore >= 5
                                        ? 'text-blue-900'
                                        : 'text-red-700'
                                  }`}
                                >
                                  {summary.avgScore.toFixed(1)}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {summary.isComplete ? 'Đủ cột' : 'Tạm tính'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )
                          ) : summary.passStatus ? (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                summary.passStatus === 'DAT'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {summary.passStatus === 'DAT' ? 'Đạt (Đ)' : 'Chưa đạt'}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="Nhận xét năng lực, phẩm chất..."
                            value={row.teacherComment}
                            onChange={(e) =>
                              updateBulkScoreCell(st.id, 'COMMENT', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'SINGLE_STUDENT' && selectedStudent && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Chọn Học sinh
                </label>
                <select
                  value={selectedStudent.id}
                  onChange={(e) => onSelectStudentId(e.target.value)}
                  className="px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-950"
                >
                  {workspace.students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.code} · Lớp {st.centerClass} · Khối{' '}
                      {normalizeGdptGradeLevel(st.grade, st.centerClass)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Học kì
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSemester(1)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                      semester === 1
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Học kì I (HK1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemester(2)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                      semester === 2
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Học kì II (HK2)
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={savingBulk}
              onClick={handleSaveSingleStudentEnrollmentAndScores}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>
                {savingBulk
                  ? 'Đang lưu...'
                  : `Lưu Tổ hợp Môn & Bảng điểm HK${semester} của ${selectedStudent.fullName}`}
              </span>
            </button>
          </div>

          {selectedStudentGrade >= 10 && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-amber-950 uppercase">
                    Cấu hình Tổ hợp Môn học THPT (Khối {selectedStudentGrade} · Thông tư 13/2022/TT-BGDĐT)
                  </h3>
                  <p className="text-[11px] text-amber-900">
                    Ngoài 8 môn bắt buộc (Toán, Ngữ văn, Ngoại ngữ 1, Lịch sử, GDQPAN, HĐTN, GDTC, GDĐP), học sinh THPT bắt buộc chọn đúng <strong>4 môn lựa chọn</strong> và tối đa <strong>3 cụm chuyên đề học tập</strong>.
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                    electiveDraft.length === 4
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  Đã chọn {electiveDraft.length}/4 môn lựa chọn · {studyTopicDraft.length}/3 chuyên đề
                </span>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {getGradeCurriculum(selectedStudentGrade)
                  .filter((c) => c.requirementType === 'ELECTIVE_GROUP')
                  .map((item) => {
                    const checked = electiveDraft.includes(item.subjectCode);
                    return (
                      <label
                        key={item.subjectCode}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer ${
                          checked
                            ? 'bg-white border-blue-900 font-bold text-blue-950 shadow-xs'
                            : 'bg-white/60 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...electiveDraft, item.subjectCode]
                                : electiveDraft.filter((c) => c !== item.subjectCode);
                              setElectiveDraft(next);
                              if (e.target.checked && !singleDrafts[item.subjectCode]) {
                                setSingleDrafts((prev) => ({
                                  ...prev,
                                  [item.subjectCode]: extractStudentSubjectSemesterRow(
                                    selectedStudent,
                                    item.subjectCode,
                                    semester,
                                    workspace.scores,
                                    academicYear,
                                  ),
                                }));
                              }
                            }}
                          />
                          <span>
                            {item.subjectName} ({item.subjectCode})
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.evaluationType === 'SCORE' ? 'Tính điểm' : 'Nhận xét'}
                        </span>
                      </label>
                    );
                  })}
              </div>

              <div className="pt-2 border-t border-amber-200/80">
                <p className="text-[11px] font-bold text-amber-950 mb-1.5">
                  Đánh dấu các môn có học Cụm chuyên đề học tập (Tối đa 3 môn · thêm 1 cột ĐĐGchuyên_đề hệ số 1):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getGradeCurriculum(selectedStudentGrade)
                    .filter(
                      (c) =>
                        c.requirementType === 'MANDATORY' ||
                        electiveDraft.includes(c.subjectCode),
                    )
                    .map((item) => {
                      const active = studyTopicDraft.includes(item.subjectCode);
                      return (
                        <button
                          key={item.subjectCode}
                          type="button"
                          onClick={() => {
                            setStudyTopicDraft((prev) =>
                              prev.includes(item.subjectCode)
                                ? prev.filter((c) => c !== item.subjectCode)
                                : prev.length < 3
                                  ? [...prev, item.subjectCode]
                                  : prev,
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                            active
                              ? 'bg-amber-900 text-white border-amber-900'
                              : 'bg-white text-slate-700 border-amber-300'
                          }`}
                        >
                          {active ? '✓ ' : '+ '}Chuyên đề {item.subjectName}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Mã môn</th>
                  <th className="py-2.5 px-3 font-bold min-w-[170px]">Môn học (Khối {selectedStudentGrade})</th>
                  <th className="py-2.5 px-2 font-bold text-center">Số tiết / ĐĐGtx</th>
                  <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">TX 1</th>
                  <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">TX 2</th>
                  <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">TX 3</th>
                  <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">TX 4</th>
                  {selectedStudentGrade >= 10 && (
                    <th className="py-2.5 px-2 font-bold text-center bg-amber-50/70">CĐ (HS1)</th>
                  )}
                  <th className="py-2.5 px-2 font-bold text-center bg-indigo-50/60">GK (HS2)</th>
                  <th className="py-2.5 px-2 font-bold text-center bg-emerald-50/60">CK (HS3)</th>
                  <th className="py-2.5 px-3 font-extrabold text-center bg-slate-200/70">
                    ĐTB HK{semester}
                  </th>
                  <th className="py-2.5 px-3 font-bold min-w-[160px]">Nhận xét bộ môn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {getGradeCurriculum(selectedStudentGrade)
                  .filter(
                    (c) =>
                      c.requirementType === 'MANDATORY' ||
                      (selectedStudentGrade >= 10 && electiveDraft.includes(c.subjectCode)) ||
                      optionalDraft.includes(c.subjectCode),
                  )
                  .map((item) => {
                    const row =
                      singleDrafts[item.subjectCode] ||
                      extractStudentSubjectSemesterRow(
                        selectedStudent,
                        item.subjectCode,
                        semester,
                        workspace.scores,
                        academicYear,
                      );
                    const hasTopic =
                      selectedStudentGrade >= 10 && studyTopicDraft.includes(item.subjectCode);
                    const summary = calculateSemesterSummary({ ...row, hasStudyTopic: hasTopic });

                    return (
                      <tr key={item.subjectCode} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono-num font-bold text-slate-600">
                          {item.subjectCode}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-950">{item.subjectName}</div>
                          <div className="text-[10px] text-slate-500">
                            {item.requirementType === 'MANDATORY' ? 'Bắt buộc' : 'Lựa chọn THPT'} ·{' '}
                            {item.evaluationType === 'SCORE' ? 'Tính điểm' : 'Đạt/Chưa đạt'}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono-num text-[11px] text-slate-600">
                          {item.periodsPerYear}t · <strong>{item.requiredTxCount} TX</strong>
                        </td>

                        {[0, 1, 2, 3].map((txIdx) => {
                          const enabled = txIdx < item.requiredTxCount;
                          if (!enabled) {
                            return (
                              <td
                                key={txIdx}
                                className="py-1.5 px-1.5 text-center bg-slate-50 text-slate-300"
                              >
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={txIdx} className="py-1.5 px-1.5 text-center">
                              {item.evaluationType === 'SCORE' ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  max={10}
                                  placeholder="—"
                                  value={row.txScores[txIdx] ?? ''}
                                  onChange={(e) =>
                                    updateSingleStudentCell(
                                      item.subjectCode,
                                      'TX',
                                      e.target.value,
                                      txIdx,
                                    )
                                  }
                                  className="w-14 px-1.5 py-1 text-center font-mono-num font-bold border border-slate-300 rounded-lg"
                                />
                              ) : (
                                <select
                                  value={row.txPass[txIdx] ?? ''}
                                  onChange={(e) =>
                                    updateSingleStudentCell(
                                      item.subjectCode,
                                      'TX',
                                      e.target.value,
                                      txIdx,
                                    )
                                  }
                                  className="w-20 px-1 py-1 text-[11px] font-bold border border-slate-300 rounded-lg bg-white"
                                >
                                  <option value="">--</option>
                                  <option value="DAT">Đạt</option>
                                  <option value="CHUA_DAT">CĐ</option>
                                </select>
                              )}
                            </td>
                          );
                        })}

                        {selectedStudentGrade >= 10 && (
                          <td className="py-1.5 px-1.5 text-center bg-amber-50/20">
                            {!hasTopic ? (
                              <span className="text-slate-300">—</span>
                            ) : item.evaluationType === 'SCORE' ? (
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={10}
                                placeholder="CĐ"
                                value={row.chuyenDeScore ?? ''}
                                onChange={(e) =>
                                  updateSingleStudentCell(item.subjectCode, 'CD', e.target.value)
                                }
                                className="w-14 px-1.5 py-1 text-center font-mono-num font-bold border border-amber-300 rounded-lg"
                              />
                            ) : (
                              <select
                                value={row.chuyenDePass ?? ''}
                                onChange={(e) =>
                                  updateSingleStudentCell(item.subjectCode, 'CD', e.target.value)
                                }
                                className="w-20 px-1 py-1 text-[11px] font-bold border border-amber-300 rounded-lg bg-white"
                              >
                                <option value="">--</option>
                                <option value="DAT">Đạt</option>
                                <option value="CHUA_DAT">CĐ</option>
                              </select>
                            )}
                          </td>
                        )}

                        <td className="py-1.5 px-1.5 text-center">
                          {item.evaluationType === 'SCORE' ? (
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={10}
                              placeholder="GK"
                              value={row.gkScore ?? ''}
                              onChange={(e) =>
                                updateSingleStudentCell(item.subjectCode, 'GK', e.target.value)
                              }
                              className="w-14 px-1.5 py-1 text-center font-mono-num font-bold border border-indigo-300 rounded-lg"
                            />
                          ) : (
                            <select
                              value={row.gkPass ?? ''}
                              onChange={(e) =>
                                updateSingleStudentCell(item.subjectCode, 'GK', e.target.value)
                              }
                              className="w-20 px-1 py-1 text-[11px] font-bold border border-indigo-300 rounded-lg bg-white"
                            >
                              <option value="">--</option>
                              <option value="DAT">Đạt</option>
                              <option value="CHUA_DAT">CĐ</option>
                            </select>
                          )}
                        </td>

                        <td className="py-1.5 px-1.5 text-center">
                          {item.evaluationType === 'SCORE' ? (
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={10}
                              placeholder="CK"
                              value={row.ckScore ?? ''}
                              onChange={(e) =>
                                updateSingleStudentCell(item.subjectCode, 'CK', e.target.value)
                              }
                              className="w-14 px-1.5 py-1 text-center font-mono-num font-bold border border-emerald-300 rounded-lg"
                            />
                          ) : (
                            <select
                              value={row.ckPass ?? ''}
                              onChange={(e) =>
                                updateSingleStudentCell(item.subjectCode, 'CK', e.target.value)
                              }
                              className="w-20 px-1 py-1 text-[11px] font-bold border border-emerald-300 rounded-lg bg-white"
                            >
                              <option value="">--</option>
                              <option value="DAT">Đạt</option>
                              <option value="CHUA_DAT">CĐ</option>
                            </select>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center font-mono-num font-extrabold bg-slate-50">
                          {item.evaluationType === 'SCORE' ? (
                            summary.avgScore !== null ? (
                              <span className="text-blue-950">{summary.avgScore.toFixed(1)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )
                          ) : summary.passStatus ? (
                            <span
                              className={
                                summary.passStatus === 'DAT'
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              }
                            >
                              {summary.passStatus === 'DAT' ? 'Đạt' : 'Chưa đạt'}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="Nhận xét..."
                            value={row.teacherComment}
                            onChange={(e) =>
                              updateSingleStudentCell(item.subjectCode, 'COMMENT', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg"
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'TRANSCRIPT_CURRICULUM' && (
        <div className="space-y-6">
          {selectedStudent && selectedStudentTranscript && (
            <GdptStudentTranscriptCard
              transcript={selectedStudentTranscript}
              students={workspace.students}
              onSelectStudentId={onSelectStudentId}
            />
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-950">
                  Danh mục 23 Môn học Chuẩn GDPT 2018 &amp; Ma trận Số cột ĐĐGtx (Khối 6 – 12)
                </h3>
                <p className="text-xs text-slate-600">
                  35 tiết/năm → 2 ĐĐGtx/HK · Trên 35 đến 70 tiết/năm → 3 ĐĐGtx/HK · Trên 70 tiết/năm → 4 ĐĐGtx/HK (Điều 6, Thông tư 22/2021/TT-BGDĐT)
                </p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 font-bold">#</th>
                    <th className="py-2 px-3 font-bold">Mã môn (`code`)</th>
                    <th className="py-2 px-3 font-bold">Tên môn học chuẩn</th>
                    <th className="py-2 px-3 font-bold">Cơ chế đánh giá (`evaluation_type`)</th>
                    <th className="py-2 px-3 font-bold">Ghi chú nghiệp vụ (Khối 6–12)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SUBJECTS_23.map((s) => (
                    <tr key={s.code} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono-num text-slate-500">{s.id}</td>
                      <td className="py-2 px-3 font-mono-num font-bold text-blue-950">{s.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-950">{s.name}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            s.evaluationType === 'SCORE'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-purple-100 text-purple-900'
                          }`}
                        >
                          {s.evaluationType} (
                          {s.evaluationType === 'SCORE'
                            ? 'Điểm số 0.0–10.0'
                            : 'Nhận xét Đạt/Chưa đạt'}
                          )
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{s.businessNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const GdptStudentTranscriptCard: React.FC<{
  transcript: ReturnType<typeof buildStudentFullTranscript>;
  students?: Student[];
  onSelectStudentId?: (id: string) => void;
}> = ({ transcript, students, onSelectStudentId }) => {
  const { student, gradeLevel, academicYear, subjects, overallStats } = transcript;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-950">
              Bảng điểm Học bạ Chuẩn GDPT 2018 · {student.fullName} ({student.code})
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-900 text-white">
              Khối {gradeLevel} · Lớp {student.centerClass} · Năm học {academicYear}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Trường: {student.school || 'THCS/THPT Long Xuyên'} · Công thức Thông tư 22/2021/TT-BGDĐT: ĐTBmhk = (∑TX + CĐ + 2×GK + 3×CK) / (N_tx + N_cđ + 5) · ĐTBmcn = (ĐTB_HK1 + 2×ĐTB_HK2) / 3
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {students && students.length > 1 && onSelectStudentId && (
            <select
              value={student.id}
              onChange={(e) => onSelectStudentId(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white text-slate-950"
            >
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.fullName} ({st.code} · {st.centerClass})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 font-bold text-blue-950">
              HK1: {overallStats.hk1AvgAllScoreSubjects?.toFixed(1) ?? '—'} (
              {overallStats.academicPerformanceHK1})
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 font-bold text-indigo-950">
              HK2: {overallStats.hk2AvgAllScoreSubjects?.toFixed(1) ?? '—'} (
              {overallStats.academicPerformanceHK2})
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-extrabold text-emerald-950">
              Cả năm: {overallStats.fullYearAvgAllScoreSubjects?.toFixed(1) ?? '—'} (
              {overallStats.academicPerformanceFullYear})
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3 font-bold">Môn học</th>
              <th className="py-2.5 px-2 font-bold text-center">Phân loại</th>
              <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">
                ĐĐGtx HK1
              </th>
              <th className="py-2.5 px-2 font-bold text-center bg-blue-50/60">GK / CK HK1</th>
              <th className="py-2.5 px-2 font-extrabold text-center bg-blue-100/70 text-blue-950">
                ĐTB HK1
              </th>
              <th className="py-2.5 px-2 font-bold text-center bg-indigo-50/60">
                ĐĐGtx HK2
              </th>
              <th className="py-2.5 px-2 font-bold text-center bg-indigo-50/60">GK / CK HK2</th>
              <th className="py-2.5 px-2 font-extrabold text-center bg-indigo-100/70 text-indigo-950">
                ĐTB HK2
              </th>
              <th className="py-2.5 px-3 font-extrabold text-center bg-emerald-100/80 text-emerald-950">
                CẢ NĂM
              </th>
              <th className="py-2.5 px-3 font-bold">Nhận xét chuyên môn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {subjects.map((sub) => {
              const formatTxList = (row: GdptSemesterInputRow) => {
                if (sub.evaluationType === 'SCORE') {
                  const vals = row.txScores
                    .slice(0, sub.requiredTxCount)
                    .map((v) => (typeof v === 'number' ? v.toFixed(1) : '–'));
                  if (sub.hasStudyTopic && typeof row.chuyenDeScore === 'number') {
                    vals.push(`CĐ:${row.chuyenDeScore.toFixed(1)}`);
                  }
                  return vals.join(' · ');
                }
                const vals = row.txPass
                  .slice(0, sub.requiredTxCount)
                  .map((v) => (v === 'DAT' ? 'Đ' : v === 'CHUA_DAT' ? 'CĐ' : '–'));
                return vals.join(' · ');
              };

              const formatGkCk = (row: GdptSemesterInputRow) => {
                if (sub.evaluationType === 'SCORE') {
                  const gk = typeof row.gkScore === 'number' ? row.gkScore.toFixed(1) : '–';
                  const ck = typeof row.ckScore === 'number' ? row.ckScore.toFixed(1) : '–';
                  return `${gk} / ${ck}`;
                }
                const gk = row.gkPass === 'DAT' ? 'Đ' : row.gkPass === 'CHUA_DAT' ? 'CĐ' : '–';
                const ck = row.ckPass === 'DAT' ? 'Đ' : row.ckPass === 'CHUA_DAT' ? 'CĐ' : '–';
                return `${gk} / ${ck}`;
              };

              return (
                <tr key={sub.subjectCode} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-950">
                      {sub.subjectName}{' '}
                      <span className="font-mono-num text-[11px] text-slate-500">
                        ({sub.subjectCode})
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {sub.periodsPerYear} tiết/năm · {sub.requiredTxCount} cột ĐĐGtx
                      {sub.hasStudyTopic ? ' · Có Chuyên đề' : ''}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sub.requirementType === 'MANDATORY'
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {sub.requirementType === 'MANDATORY' ? 'Bắt buộc' : 'Lựa chọn'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num text-slate-700 bg-blue-50/20">
                    {formatTxList(sub.hk1.row)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num text-slate-700 bg-blue-50/20">
                    {formatGkCk(sub.hk1.row)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num font-extrabold bg-blue-50/60 text-blue-950">
                    {sub.evaluationType === 'SCORE'
                      ? sub.hk1.avgScore?.toFixed(1) ?? '—'
                      : sub.hk1.passStatus === 'DAT'
                        ? 'Đạt'
                        : sub.hk1.passStatus === 'CHUA_DAT'
                          ? 'Chưa đạt'
                          : '—'}
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num text-slate-700 bg-indigo-50/20">
                    {formatTxList(sub.hk2.row)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num text-slate-700 bg-indigo-50/20">
                    {formatGkCk(sub.hk2.row)}
                  </td>
                  <td className="py-2 px-2 text-center font-mono-num font-extrabold bg-indigo-50/60 text-indigo-950">
                    {sub.evaluationType === 'SCORE'
                      ? sub.hk2.avgScore?.toFixed(1) ?? '—'
                      : sub.hk2.passStatus === 'DAT'
                        ? 'Đạt'
                        : sub.hk2.passStatus === 'CHUA_DAT'
                          ? 'Chưa đạt'
                          : '—'}
                  </td>
                  <td className="py-2 px-3 text-center font-mono-num font-extrabold bg-emerald-50/70 text-emerald-950">
                    {sub.evaluationType === 'SCORE'
                      ? sub.fullYear.avgScore?.toFixed(1) ?? '—'
                      : sub.fullYear.passStatus === 'DAT'
                        ? 'Đạt (Đ)'
                        : sub.fullYear.passStatus === 'CHUA_DAT'
                          ? 'Chưa đạt'
                          : '—'}
                  </td>
                  <td className="py-2 px-3 text-slate-600">
                    {sub.fullYear.teacherComment || 'Chăm chỉ, thực hiện đầy đủ nhiệm vụ học tập.'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const Gdpt2018FrontendTranscriptLookup: React.FC<{
  workspaceStudents?: Student[];
  workspaceScores?: ScoreRecord[];
}> = ({ workspaceStudents = [], workspaceScores = [] }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [fetchedStudents, setFetchedStudents] = useState<Student[]>([]);
  const [fetchedScores, setFetchedScores] = useState<ScoreRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const availableStudents =
    fetchedStudents.length > 0 ? fetchedStudents : workspaceStudents;
  const availableScores =
    fetchedStudents.length > 0 ? fetchedScores : workspaceScores;

  useEffect(() => {
    if (availableStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(availableStudents[0].id);
    }
  }, [availableStudents, selectedStudentId]);

  const activeStudent = useMemo(
    () =>
      availableStudents.find((s) => s.id === selectedStudentId) ||
      availableStudents[0] ||
      null,
    [availableStudents, selectedStudentId],
  );

  const transcript = useMemo(() => {
    if (!activeStudent) return null;
    return buildStudentFullTranscript(activeStudent, availableScores, CURRENT_ACADEMIC_YEAR);
  }, [activeStudent, availableScores]);

  async function handlePublicSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setLookupError('');
    try {
      // 1. Check in already-loaded workspaceStudents first
      const qLower = q.toLowerCase();
      const localMatches = workspaceStudents.filter(
        (s) =>
          s.code.toLowerCase().includes(qLower) ||
          s.fullName.toLowerCase().includes(qLower) ||
          s.parentPhone.includes(q),
      );
      if (localMatches.length > 0 && workspaceScores.length >= 0) {
        setFetchedStudents(localMatches);
        setFetchedScores(workspaceScores);
        setSelectedStudentId(localMatches[0].id);
        return;
      }

      // 2. Lookup via /api/v1/qr/:token (supports code, phone, fullName via findStudentByQrTokenOrCode)
      const qrRes = await apiRequest<{
        publicPreview?: { code: string };
        staffBundle?: { student: Student; scores: ScoreRecord[] };
      }>(`/api/v1/qr/${encodeURIComponent(q)}`);

      if (qrRes.staffBundle?.student) {
        setFetchedStudents([qrRes.staffBundle.student]);
        setFetchedScores(qrRes.staffBundle.scores || []);
        setSelectedStudentId(qrRes.staffBundle.student.id);
        return;
      }

      const resolvedCode = qrRes.publicPreview?.code || q.toUpperCase();
      const loginRes = await fetch('/api/v1/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'STUDENT_CODE', studentCode: resolvedCode }),
      });
      if (!loginRes.ok) {
        throw new Error('Không tìm thấy học sinh khớp với Mã HS / Họ tên / SĐT Phụ huynh đã nhập.');
      }
      const loginData = (await loginRes.json()) as { token?: string; student?: Student };
      if (!loginData.token) {
        throw new Error('Hồ sơ học sinh yêu cầu xác thực 4 số cuối SĐT Phụ huynh ở cổng Vào lớp.');
      }
      const wsRes = await fetch('/api/v1/workspace', {
        headers: { Authorization: `Bearer ${loginData.token}` },
      });
      if (!wsRes.ok) {
        throw new Error('Không thể tải bảng điểm học bạ.');
      }
      const wsData = (await wsRes.json()) as WorkspacePayload;
      setFetchedStudents(wsData.students || (loginData.student ? [loginData.student] : []));
      setFetchedScores(wsData.scores || []);
      if (wsData.students?.length > 0) {
        setSelectedStudentId(wsData.students[0].id);
      }
    } catch (err: unknown) {
      setLookupError(
        err instanceof Error
          ? err.message
          : 'Không tìm thấy hồ sơ học sinh khớp với Mã HS / Họ tên / SĐT Phụ huynh đã nhập.',
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <section
      id="gdpt2018-transcript-lookup"
      className="bg-white border-2 border-blue-900/15 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-950 mb-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-blue-900" />
            <span>TRA CỨU BẢNG ĐIỂM &amp; HỌC BẠ ONLINE CHUẨN GDPT 2018 (KHỐI 6 – 12)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-950">
            Cổng Tra cứu Điểm số Học sinh &amp; Phụ huynh (Thông tư 22/2021/TT-BGDĐT)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Nhập Mã học sinh (VD: NT26-...), Họ tên học sinh hoặc Số điện thoại Zalo Phụ huynh để xem chi tiết điểm ĐĐGtx, Chuyên đề, Giữa kì, Cuối kì và ĐTB môn HK1, HK2, Cả năm.
          </p>
        </div>

        <form onSubmit={handlePublicSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập Mã HS, Họ tên hoặc SĐT PH..."
              className="pl-9 pr-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl w-64 sm:w-72 text-slate-950 focus:border-blue-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {searching ? 'Đang tìm...' : 'Tra cứu Điểm'}
          </button>
        </form>
      </div>

      {lookupError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
          {lookupError}
        </div>
      )}

      {transcript ? (
        <GdptStudentTranscriptCard
          transcript={transcript}
          students={availableStudents}
          onSelectStudentId={setSelectedStudentId}
        />
      ) : (
        <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-600">
          Nhập <strong>Mã học sinh (NT26-...)</strong>, <strong>Họ và tên</strong> hoặc <strong>Số điện thoại Phụ huynh</strong> vào ô tìm kiếm phía trên để xem Bảng điểm Học bạ chuẩn GDPT 2018 (Khối 6–12).
        </div>
      )}
    </section>
  );
};
