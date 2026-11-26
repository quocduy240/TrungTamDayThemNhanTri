import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Calendar, FileCheck2, GraduationCap, Wallet } from 'lucide-react';
import { formatVnd, type WorkspacePayload } from '../lib/api';

interface CmsOverviewProps {
  workspace: WorkspacePayload;
  onNavigate: (tab: string) => void;
}

export const CmsOverview: React.FC<CmsOverviewProps> = ({ workspace, onNavigate }) => {
  const stats = useMemo(() => {
    const activeStudents = workspace.students.filter((s) => s.status === 'ACTIVE').length;
    const avgScore =
      workspace.scores.length > 0
        ? workspace.scores.reduce((a, b) => a + b.score, 0) / workspace.scores.length
        : 0;
    const totalCollected = workspace.tuition.reduce((a, b) => a + b.paidAmount, 0);
    const totalDebt = workspace.tuition.reduce((a, b) => a + Math.max(0, b.totalAmount - b.paidAmount), 0);
    const overdueCount = workspace.tuition.filter((t) => t.status === 'OVERDUE').length;
    const peMakeupCount = workspace.students.filter((s) => Boolean(s.peConflictDay)).length;
    return { activeStudents, avgScore, totalCollected, totalDebt, overdueCount, peMakeupCount };
  }, [workspace]);

  const subjectChartData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const sc of workspace.scores) {
      const key = sc.subject.split(' ')[0];
      const cur = map.get(key) || { sum: 0, count: 0 };
      cur.sum += sc.score;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([subject, val]) => ({
      subject,
      avg: Number((val.sum / val.count).toFixed(2)),
      count: val.count,
    }));
  }, [workspace.scores]);

  const financeChartData = useMemo(() => {
    const paid = workspace.tuition.reduce((a, b) => a + b.paidAmount, 0) / 1_000_000;
    const unpaid =
      workspace.tuition.reduce((a, b) => a + Math.max(0, b.totalAmount - b.paidAmount), 0) /
      1_000_000;
    const expense = workspace.expenses.reduce((a, b) => a + b.amount, 0) / 1_000_000;
    return [
      { name: 'Đã thu', amount: Number(paid.toFixed(2)) },
      { name: 'Công nợ', amount: Number(unpaid.toFixed(2)) },
      ...(workspace.user.role === 'ADMIN'
        ? [{ name: 'Chi vận hành', amount: Number(expense.toFixed(2)) }]
        : []),
    ];
  }, [workspace]);

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Tổng quan vận hành &amp; Phân tích học tập
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Xin chào {workspace.user.name} · Dữ liệu đồng bộ thời gian thực tại Cơ sở 1 &amp; Nhân Trí 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('timetable')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            Mở Thời khóa biểu động
          </button>
          <button
            type="button"
            onClick={() => onNavigate('scores')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            Quét bài kiểm tra AI
          </button>
        </div>
      </div>

      {/* KPI Strip — Flat 1px hairline containers, tabular numerals */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Học sinh theo dõi</span>
            <GraduationCap className="w-4 h-4 text-blue-900" />
          </div>
          <p className="font-mono-num text-2xl font-bold text-slate-950 mt-2">{stats.activeStudents}</p>
          <p className="text-xs text-slate-600 mt-1">
            {stats.peMakeupCount} học sinh có lịch bù Thể dục tối
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Điểm trung bình Học bạ</span>
            <FileCheck2 className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="font-mono-num text-2xl font-bold text-slate-950 mt-2">
            {stats.avgScore.toFixed(2)} / 10
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Từ {workspace.scores.length} cột điểm đã đồng bộ
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Học phí đã thu tháng 11</span>
            <Wallet className="w-4 h-4 text-blue-900" />
          </div>
          <p className="font-mono-num text-2xl font-bold text-slate-950 mt-2">
            {formatVnd(stats.totalCollected)}
          </p>
          <p className="text-xs text-slate-600 mt-1">VietQR · MoMo · ZaloPay</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Công nợ cần đối soát</span>
            <Calendar className="w-4 h-4 text-red-700" />
          </div>
          <p className="font-mono-num text-2xl font-bold text-red-700 mt-2">
            {formatVnd(stats.totalDebt)}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {stats.overdueCount} phiếu quá hạn cần nhắc Zalo
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Biểu đồ điểm trung bình theo môn học</h2>
              <p className="text-xs text-slate-500">Tổng hợp từ Học bạ Online &amp; Trắc nghiệm chuẩn quốc gia</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('scores')}
              className="text-xs font-semibold text-blue-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Xem Học bạ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectChartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="avg" name="Điểm TB" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Đối soát học phí (Triệu VNĐ)</h2>
              <p className="text-xs text-slate-500">Tình hình thu học phí &amp; công nợ tháng hiện tại</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tuition')}
              className="text-xs font-semibold text-blue-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Chi tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeChartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="amount" name="Triệu VNĐ" fill="#B91C1C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-950">Điểm danh &amp; Thông báo phụ huynh gần đây</h2>
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
          >
            Điểm danh ca mới
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-5 font-medium">Ngày</th>
                <th className="py-3 px-4 font-medium">Học sinh</th>
                <th className="py-3 px-4 font-medium">Lớp</th>
                <th className="py-3 px-4 font-medium">Ca học</th>
                <th className="py-3 px-4 font-medium">Trạng thái</th>
                <th className="py-3 px-5 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspace.attendance.slice(0, 6).map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="py-3 px-5 font-mono-num text-xs text-slate-600">{a.date}</td>
                  <td className="py-3 px-4 font-medium text-slate-950">{a.studentName}</td>
                  <td className="py-3 px-4 text-slate-600">{a.centerClass}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">{a.shiftLabel}</td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    {a.status === 'PRESENT' && <span className="text-emerald-700">Có mặt</span>}
                    {a.status === 'LATE' && <span className="text-amber-700">Đi trễ</span>}
                    {a.status === 'EXCUSED' && <span className="text-slate-600">Nghỉ có phép</span>}
                    {a.status === 'MAKEUP_EVENING' && <span className="text-blue-900">Học bù tối</span>}
                  </td>
                  <td className="py-3 px-5 text-xs text-slate-600">{a.note || 'Đã báo Zalo phụ huynh'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
