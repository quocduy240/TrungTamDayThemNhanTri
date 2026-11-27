import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  FilePlus2,
  Printer,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { SiteConfig } from '../types';
import {
  apiRequest,
  buildZaloReportText,
  type WorkspacePayload,
} from '../lib/api';
import { compressImageFile } from '../lib/imageOptimizer';
import { buildReportCardDocumentHtml } from '../lib/brandedDocumentExporter';
import { BrandedPrintModal } from './BrandedPrintModal';

interface ScoresAiModuleProps {
  workspace: WorkspacePayload;
  siteConfig?: SiteConfig;
  onRefresh: () => Promise<void>;
}

interface AnalyzedResult {
  studentName: string;
  schoolClass: string;
  school: string;
  subject: string;
  examType: '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY';
  score: number;
  maxScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}

export const ScoresAiModule: React.FC<ScoresAiModuleProps> = ({
  workspace,
  siteConfig,
  onRefresh,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(workspace.students[0]?.id || '');
  const [printReportOpen, setPrintReportOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<AnalyzedResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [compressionStat, setCompressionStat] = useState<string>('');
  const [savingAiScore, setSavingAiScore] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Manual Score Entry
  const [manualForm, setManualForm] = useState({
    studentId: workspace.students[0]?.id || '',
    subject: 'Toán',
    examType: '15_PHUT' as '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY',
    score: '9.0',
    date: new Date().toISOString().slice(0, 10),
    aiSummary: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [copiedZalo, setCopiedZalo] = useState(false);

  const selectedStudent = useMemo(
    () => workspace.students.find((s) => s.id === selectedStudentId) || workspace.students[0],
    [workspace.students, selectedStudentId],
  );

  const studentScores = useMemo(() => {
    if (!selectedStudent) return workspace.scores;
    return workspace.scores.filter((s) => s.studentId === selectedStudent.id);
  }, [workspace.scores, selectedStudent]);

  const zaloReport = useMemo(() => {
    if (!selectedStudent) return '';
    return buildZaloReportText(
      selectedStudent,
      workspace.scores,
      workspace.timetable,
      workspace.attendance,
    );
  }, [selectedStudent, workspace]);

  async function handleAnalyzePhoto(file?: File, sampleFilename?: string) {
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    setCompressionStat('');
    try {
      let body: Record<string, string> = {};
      if (sampleFilename) {
        setPreviewImage(`/assets/aistudio/${sampleFilename}`);
        body = { sampleFilename };
      } else if (file) {
        const compressed = await compressImageFile(file, { maxDim: 1400, quality: 0.82 });
        setPreviewImage(compressed.dataUrl);
        setCompressionStat(
          `Đã tối ưu ảnh tự động: ${compressed.originalKB.toLocaleString('vi-VN')} KB → ${compressed.compressedKB.toLocaleString('vi-VN')} KB (${compressed.width}×${compressed.height})`,
        );
        body = { imageBase64: compressed.dataUrl, mimeType: compressed.mimeType };
      }

      const res = await apiRequest<{ analysis: AnalyzedResult }>('/api/v1/ai/analyze-test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAiResult(res.analysis);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Không thể phân tích bài kiểm tra bằng AI.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveAiResult() {
    if (!aiResult || !selectedStudent) return;
    setSavingAiScore(true);
    setAiError('');
    try {
      await apiRequest('/api/v1/scores', {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent.id,
          subject: aiResult.subject,
          examType: aiResult.examType,
          score: aiResult.score,
          school: aiResult.school || selectedStudent.school,
          source: 'AI_SCAN',
          aiSummary: aiResult.summary,
          strengths: aiResult.strengths,
          improvements: aiResult.improvements,
          imageUrl: previewImage.startsWith('/assets/') ? previewImage : undefined,
        }),
      });
      await onRefresh();
      setSuccessMsg(`Đã lưu điểm ${aiResult.score}/10 môn ${aiResult.subject} vào Học bạ Online của ${selectedStudent.fullName}.`);
      setAiResult(null);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Không thể lưu điểm.');
    } finally {
      setSavingAiScore(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualSaving(true);
    setAiError('');
    try {
      await apiRequest('/api/v1/scores', {
        method: 'POST',
        body: JSON.stringify({
          studentId: manualForm.studentId || selectedStudent?.id,
          subject: manualForm.subject,
          examType: manualForm.examType,
          score: Number(manualForm.score),
          date: manualForm.date,
          aiSummary: manualForm.aiSummary,
        }),
      });
      await onRefresh();
      setManualForm({ ...manualForm, aiSummary: '' });
      setSuccessMsg('Đã cập nhật điểm mới vào Học bạ Online và gửi thông báo tới phụ huynh.');
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Không thể cập nhật điểm.');
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Học bạ Online Nhân Trí &amp; AI Phân tích bài kiểm tra
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Học sinh tự nhập điểm hoặc chụp bài kiểm tra tải lên để AI đọc điểm, phân tích lỗi sai và xuất báo cáo Zalo phụ huynh.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-600 font-medium">Học sinh:</span>
          <select
            value={selectedStudentId}
            onChange={(e) => {
              setSelectedStudentId(e.target.value);
              setManualForm((prev) => ({ ...prev, studentId: e.target.value }));
            }}
            className="px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg bg-white text-slate-950"
          >
            {workspace.students.map((st) => (
              <option key={st.id} value={st.id}>
                {st.fullName} ({st.centerClass})
              </option>
            ))}
          </select>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-900 flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {aiError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 flex items-center justify-between">
          <span>{aiError}</span>
          <button type="button" onClick={() => setAiError('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Row: AI Test Paper Scanner + Manual Score Entry */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* AI Test Paper Vision Scanner */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Chụp ảnh bài kiểm tra · Tự phân tích &amp; cập nhật CSDL</span>
              </p>
              <h2 className="text-base font-bold text-slate-950 mt-0.5">
                Quét bài kiểm tra bằng Gemini Vision
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Tải ảnh bài kiểm tra</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAnalyzePhoto(file);
                }}
              />
            </label>

            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleAnalyzePhoto(undefined, 'IMG_9542_4ffccfa4.webp')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>
                {aiLoading ? 'AI đang đọc & phân tích...' : 'Thử với bài KT 15p THCS Lý Thường Kiệt (mẫu thực)'}
              </span>
            </button>
          </div>

          {compressionStat && (
            <p className="text-[11px] font-mono-num text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              {compressionStat}
            </p>
          )}

          {previewImage && (
            <div className="grid sm:grid-cols-12 gap-4 pt-2">
              <div className="sm:col-span-5">
                <div className="aspect-[3/4] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={previewImage}
                    alt="Bài kiểm tra tải lên"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <div className="sm:col-span-7 space-y-3">
                {aiLoading ? (
                  <p className="text-sm text-slate-600">
                    Đang đọc nét chữ học sinh, điểm số đỏ và lời phê trên bài kiểm tra...
                  </p>
                ) : aiResult ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
                      <div>
                        <p className="font-bold text-slate-950 text-sm">{aiResult.studentName}</p>
                        <p className="text-slate-500">
                          {aiResult.subject} · {aiResult.schoolClass} · {aiResult.school}
                        </p>
                      </div>
                      <span className="font-mono-num text-xl font-extrabold text-red-700">
                        {aiResult.score}/{aiResult.maxScore}
                      </span>
                    </div>

                    <p className="text-slate-700 leading-relaxed">{aiResult.summary}</p>

                    {aiResult.strengths.length > 0 && (
                      <div>
                        <p className="font-semibold text-emerald-800">Điểm làm tốt:</p>
                        <ul className="list-disc pl-4 text-slate-700 space-y-0.5 mt-0.5">
                          {aiResult.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiResult.improvements.length > 0 && (
                      <div>
                        <p className="font-semibold text-amber-800">Lỗi cần khắc phục:</p>
                        <ul className="list-disc pl-4 text-slate-700 space-y-0.5 mt-0.5">
                          {aiResult.improvements.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={savingAiScore}
                      onClick={handleSaveAiResult}
                      className="w-full py-2 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer"
                    >
                      {savingAiScore
                        ? 'Đang lưu...'
                        : `Lưu vào Học bạ của ${selectedStudent?.fullName || 'học sinh'}`}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Manual Score Entry */}
        <form
          onSubmit={handleManualSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <FilePlus2 className="w-4 h-4 text-blue-900" />
            <h2 className="text-base font-bold text-slate-950">Tự nhập điểm kiểm tra mới</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Môn học</label>
              <select
                value={manualForm.subject}
                onChange={(e) => setManualForm({ ...manualForm, subject: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {['Toán', 'Ngữ Văn', 'Tiếng Anh', 'Vật Lý', 'Hóa học', 'KHTN', 'Tin học'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hệ số / Loại bài</label>
              <select
                value={manualForm.examType}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    examType: e.target.value as '15_PHUT' | '1_TIET' | 'GIUA_KY' | 'CUOI_KY',
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="15_PHUT">Kiểm tra 15 phút</option>
                <option value="1_TIET">Kiểm tra 1 tiết</option>
                <option value="GIUA_KY">Thi Giữa kỳ</option>
                <option value="CUOI_KY">Thi Cuối kỳ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Điểm (0 – 10)</label>
              <input
                type="number"
                step="0.25"
                min={0}
                max={10}
                required
                value={manualForm.score}
                onChange={(e) => setManualForm({ ...manualForm, score: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ngày kiểm tra</label>
              <input
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nhận xét / Ghi chú bài làm</label>
            <textarea
              rows={2}
              value={manualForm.aiSummary}
              onChange={(e) => setManualForm({ ...manualForm, aiSummary: e.target.value })}
              placeholder="VD: Hoàn thành tốt phần trắc nghiệm, cần chú ý trình bày hình học..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={manualSaving}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            {manualSaving ? 'Đang cập nhật...' : 'Cập nhật vào Học bạ Online'}
          </button>
        </form>
      </div>

      {/* Bottom Row: Online Report Card Table + Zalo Parent Report Box */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-950">
                Bảng điểm Học bạ Online · {selectedStudent?.fullName}
              </h2>
              <span className="text-xs text-slate-500 font-mono-num">
                {studentScores.length} cột điểm
              </span>
            </div>
            {selectedStudent && (
              <button
                type="button"
                onClick={() => setPrintReportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In / Tải Học bạ có Logo</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Ngày</th>
                  <th className="py-2.5 px-4 font-medium">Môn học</th>
                  <th className="py-2.5 px-4 font-medium">Loại</th>
                  <th className="py-2.5 px-4 font-medium text-right">Điểm</th>
                  <th className="py-2.5 px-4 font-medium">Phân tích / Nhận xét</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentScores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Chưa có cột điểm nào cho học sinh này. Hãy quét bài kiểm tra hoặc nhập điểm mới ở trên.
                    </td>
                  </tr>
                ) : (
                  studentScores.map((sc) => (
                    <tr key={sc.id} className="align-top hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-500 whitespace-nowrap">
                        {sc.date}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-950">{sc.subject}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{sc.examType}</td>
                      <td className="py-3 px-4 font-mono-num font-bold text-right text-blue-950">
                        {sc.score.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <p>{sc.aiSummary || 'Đã xác nhận vào học bạ.'}</p>
                        {sc.improvements && sc.improvements.length > 0 && (
                          <p className="text-amber-800 mt-1">Lưu ý: {sc.improvements[0]}</p>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Zalo Parent Report Builder */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-950">Báo cáo gửi Zalo Phụ huynh</h2>
              <p className="text-xs text-slate-500">
                Tự tổng hợp điểm số, chuyên cần và TKB tuần cho {selectedStudent?.parentName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(zaloReport);
                setCopiedZalo(true);
                setTimeout(() => setCopiedZalo(false), 2500);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedZalo ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedZalo ? 'Đã sao chép' : 'Sao chép Zalo'}</span>
            </button>
          </div>

          <pre className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs font-mono text-slate-800 whitespace-pre-wrap overflow-y-auto max-h-72 leading-relaxed">
            {zaloReport}
          </pre>
        </div>
      </div>
      {selectedStudent && (
        <BrandedPrintModal
          open={printReportOpen}
          title={`Học bạ Online — ${selectedStudent.fullName}`}
          fileName={`HocBa_NhanTri_${selectedStudent.code}.html`}
          htmlContent={
            printReportOpen
              ? buildReportCardDocumentHtml({
                  student: selectedStudent,
                  scores: studentScores,
                  siteConfig,
                })
              : ''
          }
          onClose={() => setPrintReportOpen(false)}
        />
      )}
    </div>
  );
};
