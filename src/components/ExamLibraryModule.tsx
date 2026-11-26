import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import type { NationalExam } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';

interface ExamLibraryModuleProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}

interface SubmissionResult {
  correctCount: number;
  totalQuestions: number;
  score: number;
  breakdown: {
    questionId: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
}

export const ExamLibraryModule: React.FC<ExamLibraryModuleProps> = ({ workspace, onRefresh }) => {
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'CAP_1' | 'CAP_2' | 'CAP_3'>('ALL');
  const [activeExam, setActiveExam] = useState<NationalExam | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!activeExam || result) return;
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeExam, result, secondsLeft]);

  function startExam(exam: NationalExam) {
    setActiveExam(exam);
    setAnswers(new Array(exam.questions.length).fill(-1));
    setSecondsLeft(exam.durationMinutes * 60);
    setResult(null);
    setErrorMsg('');
  }

  async function handleSubmit() {
    if (!activeExam) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiRequest<SubmissionResult>(`/api/v1/exams/${activeExam.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers,
          studentId: workspace.user.linkedStudentId || workspace.students[0]?.id,
        }),
      });
      setResult(res);
      await onRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể nộp bài.');
    } finally {
      setSubmitting(false);
    }
  }

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (activeExam) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-900">
              Khối {activeExam.grade} · {activeExam.subject} · {activeExam.curriculumStandard}
            </p>
            <h1 className="text-lg font-bold text-slate-950 mt-0.5">{activeExam.title}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 font-mono-num text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-blue-900" />
              {formatTimer(secondsLeft)}
            </span>
            <button
              type="button"
              onClick={() => setActiveExam(null)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Thoát đề
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">{errorMsg}</div>
        )}

        {result && (
          <div className="bg-blue-950 text-white rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-blue-200">Kết quả đã tự động đồng bộ vào Học bạ Online Nhân Trí</p>
              <p className="text-2xl font-extrabold font-mono-num mt-1">
                {result.score.toFixed(2)} / 10 điểm
              </p>
              <p className="text-sm text-blue-100 mt-0.5">
                Đúng {result.correctCount} / {result.totalQuestions} câu hỏi trắc nghiệm chuẩn quốc gia.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startExam(activeExam)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-950 bg-white rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm lại</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveExam(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-800 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Về thư viện đề
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {activeExam.questions.map((q, qIdx) => {
            const breakdownItem = result?.breakdown[qIdx];
            return (
              <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <p className="text-sm font-bold text-slate-950">
                  <span className="font-mono-num text-blue-900 mr-2">Câu {qIdx + 1}.</span>
                  {q.prompt}
                </p>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {q.options.map((opt, oIdx) => {
                    const chosen = answers[qIdx] === oIdx;
                    let cls = 'border-slate-200 bg-white text-slate-800 hover:border-blue-400';
                    if (result) {
                      if (oIdx === q.correctIndex) {
                        cls = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold';
                      } else if (chosen && oIdx !== q.correctIndex) {
                        cls = 'border-red-400 bg-red-50 text-red-900';
                      }
                    } else if (chosen) {
                      cls = 'border-blue-900 bg-blue-50 text-blue-950 font-semibold';
                    }

                    return (
                      <button
                        key={oIdx}
                        type="button"
                        disabled={Boolean(result)}
                        onClick={() => {
                          const next = [...answers];
                          next[qIdx] = oIdx;
                          setAnswers(next);
                        }}
                        className={`text-left px-3.5 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-2.5 cursor-pointer disabled:cursor-default ${cls}`}
                      >
                        <span className="font-mono-num text-xs font-bold shrink-0">
                          {String.fromCharCode(65 + oIdx)}.
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {breakdownItem && (
                  <div className="pt-2 border-t border-slate-100 text-xs flex items-start gap-2">
                    {breakdownItem.isCorrect ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <p className="text-slate-700">
                      <span className="font-semibold">Lời giải chuẩn: </span>
                      {breakdownItem.explanation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!result && (
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-600 font-mono-num">
              Đã trả lời {answers.filter((a) => a >= 0).length} / {activeExam.questions.length} câu
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Đang chấm điểm...' : 'Nộp bài & Cập nhật Học bạ'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const visibleExams = workspace.exams.filter(
    (ex) => levelFilter === 'ALL' || ex.level === levelFilter,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Thư viện Đề chuẩn Quốc gia &amp; Thi Trắc nghiệm Online
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Luyện đề bám sát GDPT 2018 trên máy tính và smartphone. Chấm điểm tự động và lưu thẳng vào Học bạ Online.
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'CAP_1', label: 'Cấp 1 (3–5)' },
            { id: 'CAP_2', label: 'Cấp 2 (6–9)' },
            { id: 'CAP_3', label: 'Cấp 3 (10–12)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLevelFilter(tab.id as 'ALL' | 'CAP_1' | 'CAP_2' | 'CAP_3')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                levelFilter === tab.id ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {visibleExams.map((ex) => (
          <div
            key={ex.id}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span className="font-semibold text-blue-900">Khối {ex.grade}</span>
                <span aria-hidden="true">·</span>
                <span>{ex.subject}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{ex.durationMinutes} phút</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{ex.questions.length} câu</span>
              </div>
              <h2 className="text-base font-bold text-slate-950">{ex.title}</h2>
              <p className="text-xs text-slate-600">{ex.curriculumStandard}</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-mono-num">
                {ex.attemptsCount} lượt luyện tập
              </span>
              <button
                type="button"
                onClick={() => startExam(ex)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Bắt đầu làm bài</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
