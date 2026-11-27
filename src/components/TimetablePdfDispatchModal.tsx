import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  FileDown,
  Printer,
  Send,
  Users,
  UserSquare2,
  X,
} from 'lucide-react';
import type { SiteConfig, Student, Teacher, UserRole } from '../types';
import { apiRequest, type WorkspacePayload } from '../lib/api';
import { normalizePhoneVN } from '../lib/identityPolicy';
import { studentBelongsToClass } from '../lib/timetableEngine';
import {
  buildDeterministicQrToken,
  buildStudentQrUrl,
  renderQrDataUrl,
} from '../lib/smartCodeAndQr';
import {
  buildBatchTimetablePdfHtml,
  type FamilyPdfGroup,
} from '../lib/brandedDocumentExporter';
import { BrandedPrintModal } from './BrandedPrintModal';

interface TimetablePdfDispatchModalProps {
  open: boolean;
  workspace: WorkspacePayload;
  siteConfig?: SiteConfig;
  onClose: () => void;
  onDispatched?: () => Promise<void>;
}

type DispatchTab = 'FAMILY' | 'STUDENT_BATCH' | 'TEACHER';

export const TimetablePdfDispatchModal: React.FC<TimetablePdfDispatchModalProps> = ({
  open,
  workspace,
  siteConfig,
  onClose,
  onDispatched,
}) => {
  // Confirmed default: Family-grouped PDF (combining siblings) + Batch Print by Class
  const [tab, setTab] = useState<DispatchTab>('FAMILY');
  const [classFilter, setClassFilter] = useState('ALL');
  const [selectedFamilyKeys, setSelectedFamilyKeys] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set());

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState('');

  // Group students into Family units by familyId or normalized parentPhone
  const familyGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        parentName: string;
        parentPhone: string;
        parentEmail?: string;
        familyProfile?: WorkspacePayload['families'][number];
        students: Student[];
      }
    >();

    workspace.students.forEach((st) => {
      const normPhone = normalizePhoneVN(st.parentPhone);
      const key = st.familyId || (normPhone.length >= 8 ? `phone-${normPhone}` : `stu-${st.id}`);
      const existing = map.get(key);
      if (existing) {
        existing.students.push(st);
      } else {
        const famProfile = workspace.families.find(
          (f) => f.id === st.familyId || (normPhone.length >= 8 && normalizePhoneVN(f.parentPhone) === normPhone),
        );
        map.set(key, {
          key,
          parentName: famProfile?.parentName || st.parentName,
          parentPhone: famProfile?.parentPhone || st.parentPhone,
          parentEmail: famProfile?.parentEmails?.[0] || st.parentEmails?.[0],
          familyProfile: famProfile,
          students: [st],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.students.length - a.students.length);
  }, [workspace.students, workspace.families]);

  const classOptions = useMemo(() => {
    const set = new Set(workspace.students.map((s) => s.centerClass));
    return ['ALL', ...Array.from(set).sort()];
  }, [workspace.students]);

  const filteredStudents = useMemo(() => {
    if (classFilter === 'ALL') return workspace.students;
    return workspace.students.filter((s) => s.centerClass === classFilter);
  }, [workspace.students, classFilter]);

  if (!open) return null;

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCurrentTab() {
    if (tab === 'FAMILY') {
      setSelectedFamilyKeys(new Set(familyGroups.map((g) => g.key)));
    } else if (tab === 'STUDENT_BATCH') {
      setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
    } else {
      setSelectedTeacherIds(new Set(workspace.teachers.map((t) => t.id)));
    }
  }

  function clearSelectionCurrentTab() {
    if (tab === 'FAMILY') setSelectedFamilyKeys(new Set());
    else if (tab === 'STUDENT_BATCH') setSelectedStudentIds(new Set());
    else setSelectedTeacherIds(new Set());
  }

  async function buildStudentQrData(student: Student): Promise<string> {
    const token = student.qrToken || buildDeterministicQrToken(student.id, student.code);
    return renderQrDataUrl(buildStudentQrUrl(token), 200);
  }

  async function handleGenerateBatchPdf(overrideSingleKey?: string) {
    setBuildingPdf(true);
    setErrorMsg('');
    try {
      if (tab === 'FAMILY') {
        const picked = overrideSingleKey
          ? familyGroups.filter((g) => g.key === overrideSingleKey)
          : selectedFamilyKeys.size > 0
            ? familyGroups.filter((g) => selectedFamilyKeys.has(g.key))
            : familyGroups;

        if (picked.length === 0) {
          setErrorMsg('Chưa có gia đình nào được chọn.');
          return;
        }

        const pdfGroups: FamilyPdfGroup[] = await Promise.all(
          picked.map(async (g) => ({
            familyLabel: g.students.length > 1 ? `Gia đình ${g.parentName} (${g.students.length} con)` : `Hồ sơ Phụ huynh ${g.parentName}`,
            parentName: g.parentName,
            parentPhone: g.parentPhone,
            familyProfile: g.familyProfile,
            children: await Promise.all(
              g.students.map(async (st) => ({
                student: st,
                slots: workspace.timetable.filter((sl) => studentBelongsToClass(st, sl.centerClass)),
                qrDataUrl: await buildStudentQrData(st),
              })),
            ),
          })),
        );

        const title =
          picked.length === 1
            ? `TKB Gia đình PH ${picked[0].parentName}`
            : `Bộ PDF TKB Cá nhân hóa theo Gia đình (${picked.length} gia đình)`;
        const html = buildBatchTimetablePdfHtml({
          mode: 'FAMILY',
          docTitle: title,
          familyGroups: pdfGroups,
          siteConfig,
        });
        setPrintTitle(title);
        setPrintHtml(html);
      } else if (tab === 'STUDENT_BATCH') {
        const picked = overrideSingleKey
          ? workspace.students.filter((s) => s.id === overrideSingleKey)
          : selectedStudentIds.size > 0
            ? filteredStudents.filter((s) => selectedStudentIds.has(s.id))
            : filteredStudents;

        if (picked.length === 0) {
          setErrorMsg('Chưa có học sinh nào được chọn.');
          return;
        }

        const studentItems = await Promise.all(
          picked.map(async (st) => ({
            student: st,
            slots: workspace.timetable.filter((sl) => studentBelongsToClass(st, sl.centerClass)),
            qrDataUrl: await buildStudentQrData(st),
          })),
        );

        const title =
          picked.length === 1
            ? `TKB Cá nhân — ${picked[0].fullName}`
            : `In hàng loạt TKB ${classFilter === 'ALL' ? 'Toàn trung tâm' : classFilter} (${picked.length} HS)`;
        const html = buildBatchTimetablePdfHtml({
          mode: 'STUDENT_BATCH',
          docTitle: title,
          studentItems,
          siteConfig,
        });
        setPrintTitle(title);
        setPrintHtml(html);
      } else {
        const picked = overrideSingleKey
          ? workspace.teachers.filter((t) => t.id === overrideSingleKey)
          : selectedTeacherIds.size > 0
            ? workspace.teachers.filter((t) => selectedTeacherIds.has(t.id))
            : workspace.teachers;

        if (picked.length === 0) {
          setErrorMsg('Chưa có giáo viên nào được chọn.');
          return;
        }

        const teacherItems = picked.map((teacher) => ({
          teacher,
          slots: workspace.timetable.filter((sl) => sl.teacherId === teacher.id),
        }));
        const title =
          picked.length === 1
            ? `Lịch Giảng Dạy — ${picked[0].name}`
            : `Bộ PDF Lịch Giảng Dạy Đội ngũ Giáo viên (${picked.length} GV)`;
        const html = buildBatchTimetablePdfHtml({
          mode: 'TEACHER',
          docTitle: title,
          teacherItems,
          siteConfig,
        });
        setPrintTitle(title);
        setPrintHtml(html);
      }
    } finally {
      setBuildingPdf(false);
    }
  }

  function buildZaloMessageForFamily(group: (typeof familyGroups)[number]): string {
    const childLines = group.students
      .map((st) => {
        const slots = workspace.timetable.filter((sl) => studentBelongsToClass(st, sl.centerClass));
        const tk = st.qrToken || buildDeterministicQrToken(st.id, st.code);
        const qrLink = buildStudentQrUrl(tk);
        return `• ${st.fullName} (${st.code} · ${st.centerClass}): ${slots.length} ca/tuần\n  Link QR trực tiếp: ${qrLink} (PIN: ${st.accessPin || 'Liên hệ Cô Tâm'})`;
      })
      .join('\n');
    return `TRUNG TÂM NHÂN TRÍ gửi Quý Phụ huynh ${group.parentName} Thời khóa biểu cá nhân hóa tuần mới:\n${childLines}\nTrân trọng! (Hotline/Zalo: ${siteConfig?.hotlineZalo || '0947 376 444'})`;
  }

  function buildZaloMessageForTeacher(teacher: Teacher): string {
    const slots = workspace.timetable.filter((sl) => sl.teacherId === teacher.id);
    const lines = slots
      .slice(0, 8)
      .map((sl) => `• ${sl.day} (${sl.timeRange}): ${sl.centerClass} · ${sl.subject} · ${sl.room}`)
      .join('\n');
    return `TRUNG TÂM NHÂN TRÍ gửi ${teacher.name} lịch giảng dạy cá nhân tuần này (${slots.length} ca):\n${lines || '• Chưa có ca phân công.'}\nVui lòng kiểm tra trên hệ thống daythemnhantri.com.`;
  }

  async function handleCopyZalo(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2200);
    } catch {
      setErrorMsg('Không thể sao chép tự động vào bộ nhớ tạm.');
    }
  }

  async function handleSmartBatchDispatch() {
    setDispatching(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const items: Array<{
        recipientName: string;
        recipientRole: UserRole;
        channel: 'ZALO' | 'EMAIL' | 'APP';
        targetPhone?: string;
        targetEmail?: string;
        summary: string;
        trackId: string;
      }> = [];

      if (tab === 'FAMILY') {
        const picked =
          selectedFamilyKeys.size > 0
            ? familyGroups.filter((g) => selectedFamilyKeys.has(g.key))
            : familyGroups;
        picked.forEach((g) => {
          items.push({
            recipientName: `${g.parentName} (${g.students.map((s) => s.fullName).join(', ')})`,
            recipientRole: 'PARENT',
            channel: 'ZALO',
            targetPhone: g.parentPhone,
            targetEmail: g.parentEmail,
            summary: buildZaloMessageForFamily(g),
            trackId: g.key,
          });
        });
      } else if (tab === 'STUDENT_BATCH') {
        const picked =
          selectedStudentIds.size > 0
            ? filteredStudents.filter((s) => selectedStudentIds.has(s.id))
            : filteredStudents;
        picked.forEach((st) => {
          const slots = workspace.timetable.filter((sl) => studentBelongsToClass(st, sl.centerClass));
          items.push({
            recipientName: `${st.fullName} (${st.centerClass})`,
            recipientRole: 'STUDENT',
            channel: 'ZALO',
            targetPhone: st.parentPhone,
            summary: `TKB cá nhân em ${st.fullName} (${st.code} · ${st.centerClass}): ${slots.length} ca/tuần.`,
            trackId: st.id,
          });
        });
      } else {
        const picked =
          selectedTeacherIds.size > 0
            ? workspace.teachers.filter((t) => selectedTeacherIds.has(t.id))
            : workspace.teachers;
        picked.forEach((t) => {
          items.push({
            recipientName: t.name,
            recipientRole: 'TEACHER',
            channel: 'ZALO',
            targetPhone: t.phone,
            targetEmail: t.email,
            summary: buildZaloMessageForTeacher(t),
            trackId: t.id,
          });
        });
      }

      if (items.length === 0) {
        setErrorMsg('Chưa có đối tượng nào để gửi.');
        return;
      }

      const res = await apiRequest<{ dispatched: number; webhookDelivered: number }>(
        '/api/v1/timetable/dispatch-personal',
        {
          method: 'POST',
          body: JSON.stringify({ items }),
        },
      );

      setSentIds((prev) => {
        const next = new Set(prev);
        items.forEach((i) => next.add(i.trackId));
        return next;
      });
      setStatusMsg(
        `Đã ghi nhận gửi Thời khóa biểu cá nhân hóa cho ${res.dispatched} đối tượng${
          res.webhookDelivered > 0 ? ` (${res.webhookDelivered} đẩy thành công qua Webhook Zalo/Email)` : ' (sẵn sàng gửi PDF/Zalo)'
        }.`,
      );
      if (onDispatched) await onDispatched();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi gửi Thời khóa biểu cá nhân hóa.');
    } finally {
      setDispatching(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
                Xuất PDF &amp; Gửi Thời khóa biểu Cá nhân hóa · Thương hiệu Nhân Trí
              </div>
              <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                Tự động tách TKB tổng thành PDF cá nhân hóa cho từng Gia đình, Học sinh &amp; Giáo viên
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Gắn sẵn Logo &amp; Watermark chìm Nhân Trí, phân màu theo môn học, kèm mã QR tra cứu PIN riêng của từng em và ngắt trang A4 chuẩn in hàng loạt.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Target Tabs */}
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  {
                    id: 'FAMILY',
                    label: `Theo Gia đình · Gộp anh chị em (${familyGroups.length})`,
                    icon: Users,
                  },
                  {
                    id: 'STUDENT_BATCH',
                    label: `In hàng loạt theo Lớp / HS (${workspace.students.length})`,
                    icon: FileDown,
                  },
                  {
                    id: 'TEACHER',
                    label: `Theo Giáo viên (${workspace.teachers.length})`,
                    icon: UserSquare2,
                  },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllCurrentTab}
                className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={clearSelectionCurrentTab}
                className="px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-600 cursor-pointer"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {statusMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {statusMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {errorMsg}
              </div>
            )}

            {tab === 'STUDENT_BATCH' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">Lọc theo lớp cần in hàng loạt:</span>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
                >
                  {classOptions.map((c) => (
                    <option key={c} value={c}>
                      {c === 'ALL' ? 'Tất cả các lớp' : c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tab === 'FAMILY' && (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {familyGroups.map((g) => {
                  const checked = selectedFamilyKeys.has(g.key);
                  const sent = sentIds.has(g.key);
                  return (
                    <div
                      key={g.key}
                      className="p-3.5 bg-white hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSet(setSelectedFamilyKeys, g.key)}
                          className="mt-1"
                        />
                        <div className="text-xs space-y-1">
                          <div className="font-bold text-slate-950 flex flex-wrap items-center gap-2">
                            <span>Phụ huynh: {g.parentName}</span>
                            <span className="text-slate-500 font-normal tabular-nums">{g.parentPhone}</span>
                            {g.students.length > 1 && (
                              <span className="text-emerald-800 font-bold">
                                · Gộp {g.students.length} anh chị em vào 1 file PDF
                              </span>
                            )}
                            {sent && <span className="text-emerald-700 font-bold">· Đã gửi</span>}
                          </div>
                          <div className="text-slate-600">
                            {g.students
                              .map((s) => `${s.fullName} (${s.code} · ${s.centerClass})`)
                              .join('  |  ')}
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopyZalo(g.key, buildZaloMessageForFamily(g))}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === g.key ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedId === g.key ? 'Đã chép' : 'Chép Zalo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleGenerateBatchPdf(g.key)}
                          className="px-3 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          PDF Gia đình
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'STUDENT_BATCH' && (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {filteredStudents.map((st) => {
                  const checked = selectedStudentIds.has(st.id);
                  const sent = sentIds.has(st.id);
                  const slotCount = workspace.timetable.filter((sl) =>
                    studentBelongsToClass(st, sl.centerClass),
                  ).length;
                  return (
                    <div
                      key={st.id}
                      className="p-3 bg-white hover:bg-slate-50 flex flex-wrap items-center justify-between gap-3"
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSet(setSelectedStudentIds, st.id)}
                        />
                        <div>
                          <div className="font-bold text-slate-950">
                            {st.fullName}{' '}
                            <span className="font-semibold text-blue-900 tabular-nums">({st.code})</span>
                            {sent && <span className="text-emerald-700 ml-2">· Đã gửi</span>}
                          </div>
                          <div className="text-slate-600">
                            {st.centerClass} · {st.room} · {slotCount} ca/tuần · PH: {st.parentName} ({st.parentPhone})
                          </div>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleGenerateBatchPdf(st.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        PDF Cá nhân
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'TEACHER' && (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {workspace.teachers.map((t) => {
                  const checked = selectedTeacherIds.has(t.id);
                  const sent = sentIds.has(t.id);
                  const slotCount = workspace.timetable.filter((sl) => sl.teacherId === t.id).length;
                  return (
                    <div
                      key={t.id}
                      className="p-3 bg-white hover:bg-slate-50 flex flex-wrap items-center justify-between gap-3"
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSet(setSelectedTeacherIds, t.id)}
                        />
                        <div>
                          <div className="font-bold text-slate-950">
                            {t.name} ({t.shortName})
                            {sent && <span className="text-emerald-700 ml-2">· Đã gửi</span>}
                          </div>
                          <div className="text-slate-600">
                            {t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn'} · {t.subjects.join(', ')} ·{' '}
                            <strong className="tabular-nums">{slotCount} ca/tuần</strong>
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyZalo(t.id, buildZaloMessageForTeacher(t))}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === t.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiedId === t.id ? 'Đã chép' : 'Chép Zalo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleGenerateBatchPdf(t.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          PDF Lịch dạy
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Action Bar */}
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Không tick chọn cụ thể sẽ mặc định xuất / gửi toàn bộ danh sách đang hiển thị.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={dispatching}
                onClick={() => void handleSmartBatchDispatch()}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {dispatching ? 'Đang gửi...' : 'Gửi thông minh (Zalo/Email/Webhook)'}
              </button>
              <button
                type="button"
                disabled={buildingPdf}
                onClick={() => void handleGenerateBatchPdf()}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-blue-900 text-white text-xs font-bold hover:bg-blue-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                {buildingPdf ? 'Đang tạo bộ PDF A4...' : 'Xem trước & In / Lưu PDF Gộp (Logo Nhân Trí)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {printHtml && (
        <BrandedPrintModal
          open={Boolean(printHtml)}
          title={printTitle}
          subtitle="Bộ Thời khóa biểu Cá nhân hóa chuẩn A4 · Ngắt trang tự động · Logo & Watermark Nhân Trí"
          htmlContent={printHtml}
          fileName={`${printTitle.replace(/\s+/g, '_')}.html`}
          onClose={() => setPrintHtml(null)}
        />
      )}
    </>
  );
};
