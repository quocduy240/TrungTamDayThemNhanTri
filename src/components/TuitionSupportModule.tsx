import React, { useMemo, useState } from 'react';
import {
  BellRing,
  Check,
  Cloud,
  Copy,
  CreditCard,
  Database,
  MessageSquare,
  Percent,
  Plus,
  Printer,
  QrCode,
  Save,
  Send,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { BillingCycle, FamilyProfile, SiteConfig, TuitionRecord } from '../types';
import { apiRequest, formatVnd, type WorkspacePayload } from '../lib/api';
import { DEFAULT_SITE_CONFIG } from '../lib/firestoreStore';
import { getStudentsInFamily } from '../lib/tuitionCalculator';
import { buildTuitionTransferMemo, buildVietQrUrl } from '../lib/vietqr';
import { buildTuitionReceiptDocumentHtml } from '../lib/brandedDocumentExporter';
import { BrandedPrintModal } from './BrandedPrintModal';

interface TuitionViewProps {
  workspace: WorkspacePayload;
  siteConfig?: SiteConfig;
  onRefresh: () => Promise<void>;
}

export const TuitionModule: React.FC<TuitionViewProps> = ({
  workspace,
  siteConfig = DEFAULT_SITE_CONFIG,
  onRefresh,
}) => {
  const isAdmin = workspace.user.role === 'SUPER_ADMIN' || workspace.user.role === 'ADMIN';
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'DUE_SOON' | 'OVERDUE'>('ALL');
  const [payModal, setPayModal] = useState<TuitionRecord | null>(null);
  const [printTuitionRecord, setPrintTuitionRecord] = useState<TuitionRecord | null>(null);
  const [payMethod, setPayMethod] = useState<'VIETQR' | 'MOMO' | 'ZALOPAY'>('VIETQR');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string>('');
  const [notice, setNotice] = useState('');

  // Family multi-child discount drafts (Admin/SuperAdmin only)
  const [familyDrafts, setFamilyDrafts] = useState<
    Record<string, { siblingDiscountPercent: number; defaultBillingCycle: BillingCycle }>
  >({});
  const [savingFamilyId, setSavingFamilyId] = useState<string | null>(null);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    siblingDiscountPercent: 5,
    defaultBillingCycle: 'MONTHLY' as BillingCycle,
    note: '',
  });

  function getFamilyDraft(fam: FamilyProfile) {
    return (
      familyDrafts[fam.id] || {
        siblingDiscountPercent: fam.siblingDiscountPercent,
        defaultBillingCycle: fam.defaultBillingCycle,
      }
    );
  }

  async function handleSaveFamilyDiscount(fam: FamilyProfile, recalculateInvoices: boolean) {
    const draft = getFamilyDraft(fam);
    setSavingFamilyId(fam.id);
    setNotice('');
    try {
      const res = await apiRequest<{ updatedInvoices: TuitionRecord[] }>(`/api/v1/families/${fam.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          siblingDiscountPercent: draft.siblingDiscountPercent,
          defaultBillingCycle: draft.defaultBillingCycle,
          recalculateInvoices,
          applyDefaultCycle: recalculateInvoices,
        }),
      });
      await onRefresh();
      const updatedCount = Array.isArray(res.updatedInvoices) ? res.updatedInvoices.length : 0;
      setNotice(
        `Đã lưu ưu đãi gia đình ${fam.parentName} (-${draft.siblingDiscountPercent}% nhiều con, kỳ ${
          draft.defaultBillingCycle === 'ANNUAL_12M' ? 'Nguyên năm 12 tháng' : 'Theo tháng'
        })${recalculateInvoices ? ` và tính lại ${updatedCount} phiếu chưa đóng.` : '.'}`,
      );
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Không thể cập nhật chính sách gia đình.');
    } finally {
      setSavingFamilyId(null);
    }
  }

  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    setSavingFamilyId('NEW');
    setNotice('');
    try {
      await apiRequest('/api/v1/families', {
        method: 'POST',
        body: JSON.stringify({
          parentName: newFamily.parentName,
          parentPhone: newFamily.parentPhone,
          parentEmails: newFamily.parentEmail ? [newFamily.parentEmail] : [],
          siblingDiscountPercent: newFamily.siblingDiscountPercent,
          defaultBillingCycle: newFamily.defaultBillingCycle,
          note: newFamily.note,
        }),
      });
      setNewFamily({
        parentName: '',
        parentPhone: '',
        parentEmail: '',
        siblingDiscountPercent: 5,
        defaultBillingCycle: 'MONTHLY',
        note: '',
      });
      setShowAddFamily(false);
      await onRefresh();
      setNotice('Đã tạo hồ sơ gia đình nhiều con mới.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Không thể tạo hồ sơ gia đình.');
    } finally {
      setSavingFamilyId(null);
    }
  }

  const summary = useMemo(() => {
    const totalExpected = workspace.tuition.reduce((a, b) => a + b.totalAmount, 0);
    const totalPaid = workspace.tuition.reduce((a, b) => a + b.paidAmount, 0);
    const totalDebt = totalExpected - totalPaid;
    const totalExpense = workspace.expenses.reduce((a, b) => a + b.amount, 0);
    return { totalExpected, totalPaid, totalDebt, totalExpense, netBalance: totalPaid - totalExpense };
  }, [workspace]);

  const filteredTuition = useMemo(
    () =>
      workspace.tuition.filter((t) => statusFilter === 'ALL' || t.status === statusFilter),
    [workspace.tuition, statusFilter],
  );

  function copyText(label: string, text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(''), 2000);
  }

  async function handleConfirmPayment() {
    if (!payModal) return;
    setBusyId(payModal.id);
    try {
      if (isAdmin) {
        await apiRequest(`/api/v1/tuition/${payModal.id}/pay`, {
          method: 'PATCH',
          body: JSON.stringify({ paymentMethod: payMethod }),
        });
        await onRefresh();
        setNotice(
          `Admin đã xác nhận thu ${formatVnd(payModal.totalAmount)} cho em ${payModal.studentName} qua ${payMethod}.`,
        );
      } else {
        const res = await apiRequest<{ message: string }>(
          `/api/v1/tuition/${payModal.id}/confirm-transfer`,
          {
            method: 'POST',
            body: JSON.stringify({ paymentMethod: payMethod }),
          },
        );
        await onRefresh();
        setNotice(res.message);
      }
      setPayModal(null);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Lỗi thanh toán.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendReminder(rec: TuitionRecord) {
    setBusyId(rec.id);
    try {
      const res = await apiRequest<{ reminderMessage: string }>(`/api/v1/tuition/${rec.id}/remind`, {
        method: 'POST',
      });
      await onRefresh();
      setNotice(`Đã gửi nhắc học phí qua Zalo & App cho ${rec.studentName}: "${res.reminderMessage}"`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Không thể gửi tin nhắn nhắc nợ.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Quản lý Học phí, Công nợ &amp; Đối soát Thu Chi
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Theo dõi đóng học phí, ưu đãi nhiều con &amp; đóng nguyên năm 12 tháng (-{siteConfig.annualDiscountPercent ?? 10}% cộng dồn trên học phí chính), thanh toán VietQR và nhắc nợ tự động.
        </p>
      </div>

      {notice && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Financial Reconciliation Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Tổng phải thu</p>
          <p className="font-mono-num text-xl font-bold text-slate-950 mt-1">
            {formatVnd(summary.totalExpected)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Đã thu thực tế</p>
          <p className="font-mono-num text-xl font-bold text-emerald-700 mt-1">
            {formatVnd(summary.totalPaid)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Công nợ còn thiếu</p>
          <p className="font-mono-num text-xl font-bold text-red-700 mt-1">
            {formatVnd(summary.totalDebt)}
          </p>
        </div>
        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Chi vận hành tháng 11</p>
            <p className="font-mono-num text-xl font-bold text-slate-900 mt-1">
              {formatVnd(summary.totalExpense)}
            </p>
          </div>
        )}
      </div>

      {/* Family Multi-Child & 12-Month Discount Management (Admin / SuperAdmin only) */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-900" />
                <span>Hồ sơ Gia đình nhiều con &amp; Ưu đãi học phí ({workspace.families?.length || 0})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy tắc chuẩn: Cộng dồn % nhiều con + % đóng nguyên năm 12 tháng (tối đa 40%),{' '}
                <strong className="text-slate-700">chỉ giảm trên học phí chính</strong> — không giảm tiền bán trú hoặc đưa rước.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddFamily((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddFamily ? 'Đóng biểu mẫu' : 'Thêm hồ sơ gia đình'}</span>
            </button>
          </div>

          {showAddFamily && (
            <form
              onSubmit={handleCreateFamily}
              className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end"
            >
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Tên phụ huynh *</label>
                <input
                  required
                  value={newFamily.parentName}
                  onChange={(e) => setNewFamily({ ...newFamily, parentName: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">SĐT chung *</label>
                <input
                  required
                  value={newFamily.parentPhone}
                  onChange={(e) => setNewFamily({ ...newFamily, parentPhone: e.target.value })}
                  placeholder="0918..."
                  className="w-full h-9 px-2.5 text-xs font-mono-num bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Gmail phụ huynh</label>
                <input
                  type="email"
                  value={newFamily.parentEmail}
                  onChange={(e) => setNewFamily({ ...newFamily, parentEmail: e.target.value })}
                  placeholder="phuhuynh@gmail.com"
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Giảm nhiều con (%)</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={newFamily.siblingDiscountPercent}
                  onChange={(e) =>
                    setNewFamily({ ...newFamily, siblingDiscountPercent: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 text-xs font-mono-num bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Kỳ đóng mặc định</label>
                <select
                  value={newFamily.defaultBillingCycle}
                  onChange={(e) =>
                    setNewFamily({ ...newFamily, defaultBillingCycle: e.target.value as BillingCycle })
                  }
                  className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="MONTHLY">Theo tháng (1T)</option>
                  <option value="ANNUAL_12M">Nguyên năm (12T · -10%)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={savingFamilyId === 'NEW'}
                className="h-9 px-3 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {savingFamilyId === 'NEW' ? 'Đang lưu...' : 'Tạo hồ sơ'}
              </button>
            </form>
          )}

          {(workspace.families || []).length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {(workspace.families || []).map((fam) => {
                const children = getStudentsInFamily(fam, workspace.students);
                const draft = getFamilyDraft(fam);
                const famInvoices = workspace.tuition.filter((t) =>
                  children.some((c) => c.id === t.studentId),
                );
                const famDebt = famInvoices.reduce(
                  (acc, t) => acc + Math.max(0, t.totalAmount - t.paidAmount),
                  0,
                );
                const annualPct = draft.defaultBillingCycle === 'ANNUAL_12M'
                  ? siteConfig.annualDiscountPercent ?? 10
                  : 0;
                const combinedPct = Math.min(40, draft.siblingDiscountPercent + annualPct);
                return (
                  <div
                    key={fam.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-950">{fam.parentName}</span>
                        <span className="font-mono-num text-slate-600">{fam.parentPhone}</span>
                        {fam.parentEmails?.[0] && (
                          <span className="font-mono-num text-slate-500">· {fam.parentEmails[0]}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">
                        Học sinh liên kết ({children.length}):{' '}
                        <span className="font-semibold text-slate-900">
                          {children.length > 0
                            ? children.map((c) => `${c.fullName} (${c.centerClass})`).join(', ')
                            : 'Chưa có học sinh khớp SĐT/Email'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Công nợ cả gia đình:{' '}
                        <span className={`font-mono-num font-bold ${famDebt > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {formatVnd(famDebt)}
                        </span>
                        {' · '}
                        Tổng % giảm dự kiến trên học phí chính:{' '}
                        <span className="font-mono-num font-bold text-blue-900">-{combinedPct}%</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <Percent className="w-3.5 h-3.5 text-blue-900" />
                        <span>Nhiều con:</span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={draft.siblingDiscountPercent}
                          onChange={(e) =>
                            setFamilyDrafts((prev) => ({
                              ...prev,
                              [fam.id]: {
                                ...draft,
                                siblingDiscountPercent: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                              },
                            }))
                          }
                          className="w-16 h-8 px-2 text-xs font-mono-num font-semibold border border-slate-300 rounded-lg bg-white text-right"
                        />
                        <span>%</span>
                      </label>

                      <select
                        value={draft.defaultBillingCycle}
                        onChange={(e) =>
                          setFamilyDrafts((prev) => ({
                            ...prev,
                            [fam.id]: {
                              ...draft,
                              defaultBillingCycle: e.target.value as BillingCycle,
                            },
                          }))
                        }
                        className="h-8 px-2.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="MONTHLY">Đóng tháng (1T)</option>
                        <option value="ANNUAL_12M">Nguyên năm (12T · -10%)</option>
                      </select>

                      <button
                        type="button"
                        disabled={savingFamilyId === fam.id}
                        onClick={() => handleSaveFamilyDiscount(fam, true)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {savingFamilyId === fam.id ? 'Đang tính...' : 'Lưu & Tính lại phiếu chưa đóng'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
        {[
          { id: 'ALL', label: `Tất cả (${workspace.tuition.length})` },
          { id: 'OVERDUE', label: 'Quá hạn / Nợ' },
          { id: 'DUE_SOON', label: 'Sắp đến hạn' },
          { id: 'PAID', label: 'Đã hoàn tất' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id as 'ALL' | 'PAID' | 'DUE_SOON' | 'OVERDUE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              statusFilter === tab.id ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tuition Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-medium">Học sinh &amp; Kỳ học phí</th>
              <th className="py-3 px-4 font-medium text-right">Học phí + Dịch vụ</th>
              <th className="py-3 px-4 font-medium text-right">Đã đóng</th>
              <th className="py-3 px-4 font-medium text-right">Còn thiếu</th>
              <th className="py-3 px-4 font-medium">Trạng thái</th>
              <th className="py-3 px-4 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTuition.map((t) => {
              const remaining = Math.max(0, t.totalAmount - t.paidAmount);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-950">
                      {t.studentName} <span className="font-normal text-slate-500">· {t.centerClass}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.monthLabel} · Hạn {t.dueDate}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-xs space-y-0.5">
                    <p className="font-semibold text-slate-900">{formatVnd(t.totalAmount)}</p>
                    <p className="text-[11px] text-slate-500">
                      HP chính ({t.monthsCount || 1}T): {formatVnd(t.baseAmount)}
                      {t.boardingAmount + t.shuttleAmount > 0
                        ? ` + DV ${formatVnd(t.boardingAmount + t.shuttleAmount)}`
                        : ''}
                    </p>
                    {t.discountAmount > 0 && (
                      <p className="text-[11px] text-emerald-700">
                        Giảm{' '}
                        {[
                          t.siblingDiscountPercent ? `${t.siblingDiscountPercent}% nhiều con` : null,
                          t.annualDiscountPercent
                            ? `${t.annualDiscountPercent}% năm 12T`
                            : t.billingCycle === 'ANNUAL_12M'
                              ? '10% năm 12T'
                              : null,
                        ]
                          .filter(Boolean)
                          .join(' + ')}
                        : -{formatVnd(t.discountAmount)}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-xs text-emerald-700 font-semibold">
                    {formatVnd(t.paidAmount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-xs font-bold text-red-700">
                    {formatVnd(remaining)}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    {t.status === 'PAID' && (
                      <span className="text-emerald-700">Đã đóng ({t.paymentMethod})</span>
                    )}
                    {t.status === 'DUE_SOON' && <span className="text-amber-700">Sắp đến hạn</span>}
                    {t.status === 'OVERDUE' && (
                      <span className="text-red-700">Quá hạn · Đã nhắc {t.remindersSent} lần</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPrintTuitionRecord(t)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
                        title="In / Tải Phiếu học phí có Logo & Watermark Nhân Trí"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{t.status === 'PAID' ? 'Biên nhận' : 'In phiếu'}</span>
                      </button>
                      {t.status !== 'PAID' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPayModal(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Thanh toán QR</span>
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={busyId === t.id}
                              onClick={() => handleSendReminder(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                            >
                              <BellRing className="w-3.5 h-3.5" />
                              <span>Nhắc Zalo</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 pl-1">Xong {t.paidAt}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expense Ledger (Admin Only) */}
      {isAdmin && workspace.expenses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-950">Sổ Chi vận hành &amp; Đối soát bếp ăn bán trú</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-5 font-medium">Ngày</th>
                <th className="py-2.5 px-4 font-medium">Hạng mục</th>
                <th className="py-2.5 px-4 font-medium">Nội dung chi</th>
                <th className="py-2.5 px-5 font-medium text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspace.expenses.map((ex) => (
                <tr key={ex.id}>
                  <td className="py-2.5 px-5 font-mono-num text-slate-500">{ex.date}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-700">{ex.category}</td>
                  <td className="py-2.5 px-4 text-slate-900">{ex.description}</td>
                  <td className="py-2.5 px-5 text-right font-mono-num font-semibold text-slate-900">
                    {formatVnd(ex.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Online Payment Modal (Dynamic NAPAS VietQR / MoMo / ZaloPay) */}
      {payModal && (() => {
        const dueAmount = Math.max(0, payModal.totalAmount - payModal.paidAmount);
        const transferMemo = buildTuitionTransferMemo(payModal.centerClass, payModal.studentName);
        const qrUrl = buildVietQrUrl({
          bankName: siteConfig.bankName,
          accountNo: siteConfig.bankAccount,
          accountName: siteConfig.bankOwner,
          amount: dueAmount,
          memo: transferMemo,
        });
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-900">
                    Cổng thanh toán học phí trực tuyến · {siteConfig.domain}
                  </p>
                  <h3 className="text-lg font-bold text-slate-950 mt-0.5">{payModal.studentName}</h3>
                  <p className="text-xs text-slate-500">
                    {payModal.centerClass} · {payModal.monthLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPayModal(null)}
                  className="cursor-pointer text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['VIETQR', 'MOMO', 'ZALOPAY'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMethod(m)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                      payMethod === m
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2.5">
                {payMethod === 'VIETQR' ? (
                  <div className="mx-auto w-56 bg-white p-2 rounded-lg border border-slate-200">
                    <img
                      src={qrUrl}
                      alt={`Mã VietQR đóng học phí cho ${payModal.studentName}`}
                      loading="lazy"
                      className="w-full h-auto rounded"
                    />
                  </div>
                ) : (
                  <div className="py-4 space-y-1.5">
                    <div className="w-20 h-20 mx-auto bg-white border border-slate-300 rounded-lg flex items-center justify-center">
                      <QrCode className="w-12 h-12 text-blue-950" />
                    </div>
                    <p className="text-xs text-slate-700">
                      Chuyển qua ví <strong>{payMethod}</strong> tới số:{' '}
                      <strong className="font-mono-num text-blue-950">{siteConfig.momoPhone}</strong>
                    </p>
                  </div>
                )}

                <p className="font-mono-num text-xl font-extrabold text-blue-950">
                  {formatVnd(dueAmount)}
                </p>

                <div className="text-left bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">STK ({siteConfig.bankName}):</span>
                    <button
                      type="button"
                      onClick={() => copyText('acct', siteConfig.bankAccount)}
                      className="inline-flex items-center gap-1 font-mono-num font-bold text-slate-900 hover:text-blue-900 cursor-pointer"
                    >
                      <span>{siteConfig.bankAccount}</span>
                      {copiedField === 'acct' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Nội dung CK:</span>
                    <button
                      type="button"
                      onClick={() => copyText('memo', transferMemo)}
                      className="inline-flex items-center gap-1 font-mono-num font-bold text-blue-950 hover:underline cursor-pointer"
                    >
                      <span className="truncate max-w-[190px]">{transferMemo}</span>
                      {copiedField === 'memo' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={busyId === payModal.id}
                onClick={handleConfirmPayment}
                className={`w-full py-2.5 text-sm font-semibold text-white rounded-lg cursor-pointer disabled:opacity-60 ${
                  isAdmin ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-blue-900 hover:bg-blue-800'
                }`}
              >
                {busyId === payModal.id
                  ? 'Đang xử lý...'
                  : isAdmin
                    ? 'Xác nhận đã thu tiền (Admin)'
                    : 'Tôi đã chuyển khoản — Báo Ban Học vụ đối soát'}
              </button>
            </div>
          </div>
        );
      })()}

      {printTuitionRecord && (
        <BrandedPrintModal
          open={Boolean(printTuitionRecord)}
          title={
            printTuitionRecord.status === 'PAID'
              ? `Biên nhận Học phí — ${printTuitionRecord.studentName}`
              : `Phiếu Học phí — ${printTuitionRecord.studentName}`
          }
          fileName={`HocPhi_NhanTri_${printTuitionRecord.id.slice(0, 8)}.html`}
          htmlContent={buildTuitionReceiptDocumentHtml({
            record: printTuitionRecord,
            siteConfig,
          })}
          onClose={() => setPrintTuitionRecord(null)}
        />
      )}
    </div>
  );
};

interface SupportSystemModuleProps {
  workspace: WorkspacePayload;
  onRefresh: () => Promise<void>;
}

export const SupportSystemModule: React.FC<SupportSystemModuleProps> = ({
  workspace,
  onRefresh,
}) => {
  const isAdmin = workspace.user.role === 'SUPER_ADMIN' || workspace.user.role === 'ADMIN';
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'FEEDBACK' as 'CONSULTATION' | 'FEEDBACK' | 'SCHEDULE_CHANGE' | 'TUITION',
    message: '',
  });
  const [ticketSaving, setTicketSaving] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const [cfSql, setCfSql] = useState('');
  const [cfNotes, setCfNotes] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  async function handleAskAi(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await apiRequest<{ answer: string }>('/api/v1/ai/consult', {
        method: 'POST',
        body: JSON.stringify({ question: aiPrompt }),
      });
      setAiReply(res.answer);
    } catch (err: unknown) {
      setAiReply(err instanceof Error ? err.message : 'Lỗi kết nối trợ lý AI.');
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setTicketSaving(true);
    try {
      await apiRequest('/api/v1/tickets', {
        method: 'POST',
        body: JSON.stringify({
          authorName: workspace.user.name,
          category: ticketForm.category,
          subject: ticketForm.subject,
          message: ticketForm.message,
        }),
      });
      setTicketForm({ subject: '', category: 'FEEDBACK', message: '' });
      await onRefresh();
    } finally {
      setTicketSaving(false);
    }
  }

  async function handleReplyTicket(id: string) {
    const reply = replyDrafts[id]?.trim();
    if (!reply) return;
    await apiRequest(`/api/v1/tickets/${id}/reply`, {
      method: 'PATCH',
      body: JSON.stringify({ reply }),
    });
    setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
    await onRefresh();
  }

  async function handleLoadCloudflareSql() {
    const res = await apiRequest<{ sql: string; workerNotes: string }>(
      '/api/v1/system/cloudflare-schema',
    );
    setCfSql(res.sql);
    setCfNotes(res.workerNotes);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Chăm sóc 24/7, Trợ lý AI &amp; Phân quyền Hệ thống
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Giải đáp thắc mắc học tập, quản lý góp ý phụ huynh và cấu trúc cơ sở dữ liệu sẵn sàng triển khai Cloudflare Workers + D1.
        </p>
      </div>

      {/* Row 1: AI Q&A + Feedback Submission */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-blue-900 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>Trợ lý AI Giáo dục 24/7 (Hỗ trợ học sinh, phụ huynh &amp; giáo viên)</span>
          </div>
          <form onSubmit={handleAskAi} className="space-y-3">
            <textarea
              rows={3}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Hỏi cách giải bài Toán/Lý/Anh, gợi ý soạn giáo án, hoặc tra cứu quy định lịch học bù..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{aiBusy ? 'Đang trả lời...' : 'Hỏi Trợ lý AI'}</span>
            </button>
          </form>
          {aiReply && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-line max-h-60 overflow-y-auto">
              {aiReply}
            </div>
          )}
        </div>

        <form
          onSubmit={handleCreateTicket}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
        >
          <div className="flex items-center gap-2 text-slate-900 text-sm font-bold">
            <MessageSquare className="w-4 h-4 text-blue-900" />
            <span>Gửi Góp ý / Yêu cầu đổi lịch / Tư vấn</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <select
              value={ticketForm.category}
              onChange={(e) =>
                setTicketForm({
                  ...ticketForm,
                  category: e.target.value as 'CONSULTATION' | 'FEEDBACK' | 'SCHEDULE_CHANGE' | 'TUITION',
                })
              }
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="FEEDBACK">Góp ý chất lượng giảng dạy</option>
              <option value="SCHEDULE_CHANGE">Xin đổi ca / Báo trùng Thể dục</option>
              <option value="TUITION">Thắc mắc học phí / Bán trú</option>
              <option value="CONSULTATION">Đăng ký thêm môn</option>
            </select>
            <input
              required
              placeholder="Tiêu đề ngắn gọn..."
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <textarea
            required
            rows={3}
            placeholder="Nội dung chi tiết gửi Ban quản trị Trung Tâm Nhân Trí..."
            value={ticketForm.message}
            onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            disabled={ticketSaving}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            {ticketSaving ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </button>
        </form>
      </div>

      {/* Tickets List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-950">Hộp thư Phản hồi &amp; Tư vấn ({workspace.tickets.length})</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {workspace.tickets.map((tk) => (
            <div key={tk.id} className="p-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="font-bold text-slate-950">
                  {tk.subject} <span className="font-normal text-slate-500">· {tk.authorName}</span>
                </p>
                <span className="font-mono-num text-slate-500">
                  {tk.createdAt} ·{' '}
                  <strong className={tk.status === 'RESOLVED' ? 'text-emerald-700' : 'text-amber-700'}>
                    {tk.status === 'RESOLVED' ? 'Đã xử lý' : 'Đang chờ'}
                  </strong>
                </span>
              </div>
              <p className="text-sm text-slate-700">{tk.message}</p>
              {tk.reply && (
                <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800">
                  <strong>Phản hồi Nhân Trí:</strong> {tk.reply}
                </p>
              )}
              {(workspace.user.role === 'SUPER_ADMIN' ||
                workspace.user.role === 'ADMIN' ||
                workspace.user.role === 'MANAGER' ||
                workspace.user.role === 'TEACHER') &&
                !tk.reply && (
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Nhập câu trả lời tới phụ huynh/học sinh..."
                    value={replyDrafts[tk.id] || ''}
                    onChange={(e) => setReplyDrafts({ ...replyDrafts, [tk.id]: e.target.value })}
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleReplyTicket(tk.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg cursor-pointer"
                  >
                    Phản hồi
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RBAC Matrix & Cloudflare Workers D1 Blueprint */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Shield className="w-4 h-4 text-blue-900" />
            <span>Ma trận Phân quyền RBAC (6 vai trò chuẩn)</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
              <tr>
                <th className="py-2 px-3">Vai trò</th>
                <th className="py-2 px-3">Phạm vi quyền hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-2.5 px-3 font-bold text-blue-950">SuperAdmin</td>
                <td className="py-2.5 px-3">Toàn quyền CMS, chính sách định danh, TKB động, phòng học, học phí, thu chi &amp; phân quyền tất cả cấp.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-blue-900">Admin Vận hành</td>
                <td className="py-2.5 px-3">Điều phối TKB động, phòng học, giáo viên, đối soát học phí, ưu đãi nhiều con &amp; cấp/khóa tài khoản vận hành.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-slate-950">Người quản lý</td>
                <td className="py-2.5 px-3">Sửa TKB động (kéo-thả/hoán đổi), cấu hình phòng học, quản lý giáo viên, duyệt nghỉ đột xuất, điểm danh &amp; học sinh. Không xem tài chính.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-slate-900">Giáo viên (Bộ môn / Trả bài)</td>
                <td className="py-2.5 px-3">Xem TKB cá nhân, đăng ký lịch rảnh theo ca, gửi đơn xin nghỉ đột xuất (chờ duyệt), điểm danh &amp; chấm điểm.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-slate-900">Phụ huynh</td>
                <td className="py-2.5 px-3">Xem Học bạ, TKB cá nhân và tổng hợp học phí VietQR của tất cả các con trong gia đình (cô lập tuyệt đối dữ liệu HS khác).</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-slate-900">Học sinh</td>
                <td className="py-2.5 px-3">Xem TKB lớp mình, tự nhập điểm, chụp bài kiểm tra AI, luyện đề GDPT 2018 &amp; hỏi Trợ lý AI 24/7.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Cloud className="w-4 h-4 text-blue-900" />
              <span>Kiến trúc REST API v1 &amp; Cloudflare D1 SQL</span>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleLoadCloudflareSql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Xem Schema D1 SQL</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Toàn bộ nghiệp vụ sử dụng chuẩn RESTful JSON (`/api/v1/*`) kèm xác thực Bearer HMAC phi trạng thái, tương thích trực tiếp với Cloudflare Workers và cơ sở dữ liệu Cloudflare D1 SQLite.
          </p>
          {cfSql && (
            <div className="space-y-2">
              <p className="text-xs text-blue-900 font-medium">{cfNotes}</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(cfSql);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="absolute top-2 right-2 px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSql ? 'Đã chép' : 'Chép SQL'}</span>
                </button>
                <pre className="bg-slate-950 text-slate-100 p-3.5 rounded-lg text-[11px] font-mono overflow-x-auto max-h-52">
                  {cfSql}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
