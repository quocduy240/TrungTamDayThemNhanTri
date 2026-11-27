import type {
  FamilyProfile,
  NationalExam,
  ScoreRecord,
  SiteConfig,
  Student,
  Teacher,
  TimetableSlot,
  TuitionRecord,
} from '../types';
import { BRAND_LOGO_URL } from '../components/BrandLogo';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVndPlain(amount: number): string {
  return `${Math.round(amount || 0).toLocaleString('vi-VN')} đ`;
}

function resolveAbsoluteLogoUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${BRAND_LOGO_URL}`;
  }
  return BRAND_LOGO_URL;
}

function formatTodayVn(): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function wrapBrandedDocument(params: {
  docTitle: string;
  docCode: string;
  docCategory: string;
  siteConfig?: Partial<SiteConfig>;
  bodyHtml: string;
}): string {
  const logoUrl = escapeHtml(resolveAbsoluteLogoUrl());
  const centerName = escapeHtml(
    params.siteConfig?.centerName || 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ',
  );
  const domain = escapeHtml(params.siteConfig?.domain || 'daythemnhantri.com');
  const hotline = escapeHtml(params.siteConfig?.hotlineZalo || '0987 405 186');
  const campus1 = escapeHtml(
    params.siteConfig?.campus1 || 'CS1: 58/18 Lê Văn Việt, Phường Tăng Nhơn Phú A, TP. Thủ Đức',
  );
  const printedAt = escapeHtml(formatTodayVn());

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.docTitle)} — Trung Tâm Nhân Trí</title>
  <style>
    @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-size: 12.5px;
      line-height: 1.55;
    }
    .page-shell {
      position: relative;
      max-width: 820px;
      margin: 0 auto;
      padding: 20px 24px 28px;
      background: #fff;
      min-height: 100vh;
    }
    .watermark-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .watermark-logo {
      width: 340px;
      height: 340px;
      object-fit: contain;
      opacity: 0.065;
      transform: rotate(-18deg);
      filter: grayscale(10%);
    }
    .watermark-text {
      margin-top: 8px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0.22em;
      color: #1e3a8a;
      opacity: 0.055;
      transform: rotate(-18deg);
      text-transform: uppercase;
      white-space: nowrap;
    }
    .content-layer {
      position: relative;
      z-index: 1;
    }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 2.5px solid #1e3a8a;
      margin-bottom: 18px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-wrap {
      width: 58px;
      height: 58px;
      border-radius: 999px;
      border: 1.5px solid #bfdbfe;
      padding: 2px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand-logo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 999px;
    }
    .brand-org {
      font-size: 13.5px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.01em;
    }
    .brand-sub {
      font-size: 11px;
      color: #475569;
      margin-top: 2px;
    }
    .brand-meta {
      text-align: right;
      font-size: 11px;
      color: #475569;
      flex-shrink: 0;
    }
    .brand-meta strong {
      color: #1e3a8a;
      font-size: 11.5px;
      display: block;
    }
    .doc-title-box {
      text-align: center;
      margin: 12px 0 18px;
    }
    .doc-category {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #b45309;
    }
    .doc-title {
      font-size: 19px;
      font-weight: 800;
      color: #0f172a;
      margin: 4px 0 0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 18px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .info-row span { color: #64748b; }
    .info-row strong { color: #0f172a; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 11.5px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 8px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #eff6ff;
      color: #1e3a8a;
      font-weight: 700;
    }
    .num { font-variant-numeric: tabular-nums; text-align: right; }
    .question-card {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px dashed #e2e8f0;
      break-inside: avoid;
    }
    .question-prompt {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .options-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 14px;
      padding-left: 8px;
    }
    .answer-correct {
      color: #047857;
      font-weight: 700;
    }
    .explanation-box {
      margin-top: 5px;
      padding: 6px 10px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      font-size: 11.5px;
      color: #065f46;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .summary-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .summary-box .lbl { font-size: 10.5px; color: #64748b; }
    .summary-box .val { font-size: 15px; font-weight: 800; color: #1e3a8a; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .slot-cell {
      border-radius: 6px;
      padding: 5px 6px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      margin-bottom: 4px;
      font-size: 10.5px;
    }
    .slot-cell.trabai { background: #fffbeb; border-color: #fde68a; }
    .slot-cell.english { background: #ecfdf5; border-color: #a7f3d0; }
    .slot-cell.science { background: #eef2ff; border-color: #c7d2fe; }
    .slot-cell.lit { background: #fff1f2; border-color: #fecdd3; }
    .slot-cell strong { display: block; color: #0f172a; }
    .qr-section {
      display: flex;
      align-items: center;
      gap: 18px;
      border: 1px solid #bfdbfe;
      background: #f8fafc;
      border-radius: 10px;
      padding: 14px;
      margin-top: 12px;
      break-inside: avoid;
    }
    .qr-section img {
      width: 145px;
      height: 145px;
      object-fit: contain;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 4px;
    }
    .signature-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      margin-top: 26px;
      text-align: center;
      font-size: 11.5px;
      break-inside: avoid;
    }
    .brand-footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #64748b;
      gap: 10px;
    }
    @media print {
      .page-shell { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="watermark-layer" aria-hidden="true">
    <img class="watermark-logo" src="${logoUrl}" alt="" />
    <div class="watermark-text">NHÂN TRÍ · SINCE 2023</div>
  </div>
  <div class="page-shell">
    <div class="content-layer">
      <header class="brand-header">
        <div class="brand-left">
          <div class="brand-logo-wrap">
            <img src="${logoUrl}" alt="Logo Trung Tâm Nhân Trí" />
          </div>
          <div>
            <div class="brand-org">${centerName}</div>
            <div class="brand-sub">${campus1}</div>
            <div class="brand-sub">Website: <strong>${domain}</strong> · Hotline/Zalo: <strong>${hotline}</strong></div>
          </div>
        </div>
        <div class="brand-meta">
          <strong>SINCE 2023</strong>
          <div>Mã tài liệu: ${escapeHtml(params.docCode)}</div>
          <div>Xuất lúc: ${printedAt}</div>
        </div>
      </header>

      <div class="doc-title-box">
        <div class="doc-category">${escapeHtml(params.docCategory)}</div>
        <h1 class="doc-title">${escapeHtml(params.docTitle)}</h1>
      </div>

      ${params.bodyHtml}

      <footer class="brand-footer">
        <span>Tài liệu học vụ chính thức của Trung Tâm Nhân Trí (${domain}) — Kèm dấu bản quyền chìm.</span>
        <span>Học chắc từng ngày · Tiến bộ bền vững</span>
      </footer>
    </div>
  </div>
</body>
</html>`;
}

export function buildExamDocumentHtml(params: {
  exam: NationalExam;
  includeAnswerKey: boolean;
  studentName?: string;
  studentAnswers?: Record<string, number>;
  scoreOutOf10?: number;
  siteConfig?: Partial<SiteConfig>;
}): string {
  const { exam, includeAnswerKey, studentName, studentAnswers, scoreOutOf10, siteConfig } = params;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const metaRows = `
    <div class="info-grid">
      <div class="info-row"><span>Môn học:</span> <strong>${escapeHtml(exam.subject)} — Lớp ${escapeHtml(exam.grade)}</strong></div>
      <div class="info-row"><span>Thời gian làm bài:</span> <strong>${escapeHtml(exam.durationMinutes)} phút</strong></div>
      <div class="info-row"><span>Chuẩn chương trình:</span> <strong>${escapeHtml(exam.curriculumStandard)}</strong></div>
      <div class="info-row"><span>Học sinh:</span> <strong>${escapeHtml(studentName || '..............................................')}</strong></div>
      ${
        scoreOutOf10 !== undefined
          ? `<div class="info-row"><span>Kết quả chấm tự động:</span> <strong style="color:#047857">${scoreOutOf10.toFixed(1)} / 10 điểm</strong></div>`
          : `<div class="info-row"><span>Số lượng câu hỏi:</span> <strong>${exam.questions.length} câu trắc nghiệm</strong></div>`
      }
      <div class="info-row"><span>Phiên bản in:</span> <strong>${includeAnswerKey ? 'Đề thi kèm Đáp án & Lời giải' : 'Đề thi học sinh (Chưa hiện đáp án)'}</strong></div>
    </div>
  `;

  const questionsHtml = exam.questions
    .map((q, idx) => {
      const picked = studentAnswers?.[q.id];
      const opts = q.options
        .map((opt, oi) => {
          const isCorrect = includeAnswerKey && oi === q.correctIndex;
          const isPicked = picked === oi;
          const marker = isPicked ? ' [HS chọn]' : '';
          return `<div class="${isCorrect ? 'answer-correct' : ''}">${letters[oi] || oi + 1}. ${escapeHtml(opt)}${marker}</div>`;
        })
        .join('');

      const explanationHtml = includeAnswerKey
        ? `<div class="explanation-box"><strong>Đáp án đúng: ${letters[q.correctIndex] || q.correctIndex + 1}.</strong> ${escapeHtml(q.explanation)}</div>`
        : '';

      return `
        <div class="question-card">
          <div class="question-prompt">Câu ${idx + 1}: ${escapeHtml(q.prompt)}</div>
          <div class="options-grid">${opts}</div>
          ${explanationHtml}
        </div>
      `;
    })
    .join('');

  return wrapBrandedDocument({
    docTitle: exam.title,
    docCode: `DE-${exam.grade}-${exam.id.slice(0, 6).toUpperCase()}`,
    docCategory: 'Thư viện Đề thi chuẩn GDPT 2018 · Trung Tâm Nhân Trí',
    siteConfig,
    bodyHtml: `${metaRows}${questionsHtml}`,
  });
}

export function buildReportCardDocumentHtml(params: {
  student: Student;
  scores: ScoreRecord[];
  siteConfig?: Partial<SiteConfig>;
}): string {
  const { student, scores, siteConfig } = params;
  const avg =
    scores.length > 0
      ? (scores.reduce((acc, s) => acc + s.score, 0) / scores.length).toFixed(2)
      : '—';
  const highCount = scores.filter((s) => s.score >= 8).length;

  const rowsHtml =
    scores.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#64748b;">Chưa có đầu điểm nào được ghi nhận cho học sinh này.</td></tr>`
      : scores
          .map(
            (sc, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <td>${escapeHtml(sc.date)}</td>
            <td><strong>${escapeHtml(sc.subject)}</strong></td>
            <td>${escapeHtml(sc.examType.replace(/_/g, ' '))}</td>
            <td class="num"><strong>${sc.score.toFixed(1)} / ${sc.maxScore}</strong></td>
            <td>${escapeHtml(sc.aiSummary || (sc.verified ? 'Đã xác nhận bởi giáo viên' : 'Học sinh tự cập nhật'))}</td>
          </tr>`,
          )
          .join('');

  const bodyHtml = `
    <div class="info-grid">
      <div class="info-row"><span>Họ và tên học sinh:</span> <strong>${escapeHtml(student.fullName)}</strong></div>
      <div class="info-row"><span>Mã học sinh:</span> <strong>${escapeHtml(student.code)}</strong></div>
      <div class="info-row"><span>Lớp Trung tâm:</span> <strong>${escapeHtml(student.centerClass)} (Khối ${escapeHtml(student.grade)})</strong></div>
      <div class="info-row"><span>Trường / Lớp chính khóa:</span> <strong>${escapeHtml(student.school)} · ${escapeHtml(student.schoolClass)}</strong></div>
      <div class="info-row"><span>Phụ huynh:</span> <strong>${escapeHtml(student.parentName)}</strong></div>
      <div class="info-row"><span>Điện thoại / Zalo:</span> <strong>${escapeHtml(student.parentPhone)}</strong></div>
    </div>

    <div class="summary-strip">
      <div class="summary-box">
        <div class="lbl">Điểm trung bình tích lũy</div>
        <div class="val">${avg} / 10</div>
      </div>
      <div class="summary-box">
        <div class="lbl">Tổng số bài kiểm tra</div>
        <div class="val">${scores.length} bài</div>
      </div>
      <div class="summary-box">
        <div class="lbl">Số bài đạt Khá Giỏi (≥ 8.0)</div>
        <div class="val" style="color:#047857">${highCount} bài</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th style="width:86px">Ngày</th>
          <th style="width:110px">Môn học</th>
          <th style="width:115px">Hình thức</th>
          <th style="width:76px;text-align:right">Điểm</th>
          <th>Nhận xét học vụ / AI phân tích</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="signature-row">
      <div>
        <strong>XÁC NHẬN PHỤ HUYNH</strong>
        <div style="margin-top:46px;color:#64748b">(Ký và ghi rõ họ tên)</div>
      </div>
      <div>
        <strong>BAN HỌC VỤ TRUNG TÂM NHÂN TRÍ</strong>
        <div style="margin-top:46px;color:#1e3a8a;font-weight:700">Đã xác thực trên hệ thống daythemnhantri.com</div>
      </div>
    </div>
  `;

  return wrapBrandedDocument({
    docTitle: `Học bạ Online & Phiếu báo điểm — ${student.fullName}`,
    docCode: `HB-${student.code}`,
    docCategory: 'Phiếu Báo Kết Quả Học Tập · Trung Tâm Nhân Trí',
    siteConfig,
    bodyHtml,
  });
}

function classifySlotStyle(slot: TimetableSlot): string {
  const s = `${slot.subject} ${slot.slotType}`.toLowerCase();
  if (slot.slotType === 'TRA_BAI' || s.includes('trả bài')) return 'trabai';
  if (s.includes('anh') || s.includes('english')) return 'english';
  if (s.includes('lý') || s.includes('hóa') || s.includes('khtn') || s.includes('sinh')) return 'science';
  if (s.includes('văn') || s.includes('tiếng việt')) return 'lit';
  return '';
}

export function buildTimetableDocumentHtml(params: {
  title: string;
  student?: Student;
  slots: TimetableSlot[];
  siteConfig?: Partial<SiteConfig>;
}): string {
  const { title, student, slots, siteConfig } = params;
  const days: Array<{ key: TimetableSlot['day']; label: string }> = [
    { key: 'T2', label: 'Thứ 2' },
    { key: 'T3', label: 'Thứ 3' },
    { key: 'T4', label: 'Thứ 4' },
    { key: 'T5', label: 'Thứ 5' },
    { key: 'T6', label: 'Thứ 6' },
    { key: 'T7', label: 'Thứ 7' },
  ];
  const rows: Array<{
    period: TimetableSlot['period'];
    shift: TimetableSlot['shift'];
    label: string;
    time: string;
  }> = [
    { period: 'SANG', shift: 'CA_1', label: 'Sáng · Ca 1', time: '07:30 - 09:30' },
    { period: 'SANG', shift: 'CA_2', label: 'Sáng · Ca 2', time: '09:30 - 11:30' },
    { period: 'CHIEU', shift: 'CA_1', label: 'Chiều · Ca 1', time: '14:00 - 15:30' },
    { period: 'CHIEU', shift: 'CA_2', label: 'Chiều · Ca 2', time: '15:30 - 17:00' },
    { period: 'TOI', shift: 'CA_1', label: 'Tối · Ca 1', time: '17:30 - 19:00' },
    { period: 'TOI', shift: 'CA_2', label: 'Tối · Ca 2', time: '19:00 - 20:30' },
  ];

  const studentBox = student
    ? `<div class="info-grid">
        <div class="info-row"><span>Học sinh:</span> <strong>${escapeHtml(student.fullName)} (${escapeHtml(student.code)})</strong></div>
        <div class="info-row"><span>Lớp Trung tâm:</span> <strong>${escapeHtml(student.centerClass)} · Phòng mặc định ${escapeHtml(student.room)}</strong></div>
        <div class="info-row"><span>Phụ huynh:</span> <strong>${escapeHtml(student.parentName)} (${escapeHtml(student.parentPhone)})</strong></div>
        <div class="info-row"><span>Lịch bù Thể dục (nếu có):</span> <strong>${escapeHtml(student.eveningMakeupSlot || 'Không trùng lịch')}</strong></div>
      </div>`
    : '';

  const tbody = rows
    .map((r) => {
      const cells = days
        .map((d) => {
          const matched = slots.filter(
            (sl) => sl.period === r.period && sl.shift === r.shift && sl.day === d.key,
          );
          if (matched.length === 0) {
            return `<td style="color:#cbd5e1;text-align:center">—</td>`;
          }
          const html = matched
            .map(
              (sl) => `
              <div class="slot-cell ${classifySlotStyle(sl)}">
                <strong>${escapeHtml(sl.subject)}</strong>
                <div>${escapeHtml(sl.centerClass)} · P.${escapeHtml(sl.room)}</div>
                <div style="color:#475569">${escapeHtml(sl.teacherName)}</div>
              </div>`,
            )
            .join('');
          return `<td>${html}</td>`;
        })
        .join('');
      return `
        <tr>
          <td style="background:#f8fafc;width:96px">
            <strong>${r.label}</strong>
            <div style="font-size:10px;color:#64748b">${r.time}</div>
          </td>
          ${cells}
        </tr>`;
    })
    .join('');

  const bodyHtml = `
    ${studentBox}
    <table>
      <thead>
        <tr>
          <th>Ca học</th>
          ${days.map((d) => `<th>${d.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>
    <div style="font-size:11px;color:#475569">
      Ghi chú màu sắc: <strong>Xanh dương</strong> = Toán / Môn chính · <strong>Xanh ngọc</strong> = Tiếng Anh · <strong>Chàm</strong> = Lý/Hóa/KHTN · <strong>Hồng</strong> = Ngữ Văn · <strong>Vàng</strong> = Giờ Trả bài / Soạn bài.
    </div>
  `;

  return wrapBrandedDocument({
    docTitle: title,
    docCode: student ? `TKB-${student.code}` : 'TKB-NHANTRI',
    docCategory: 'Thời Khóa Biểu Học Tập Chính Thức · Trung Tâm Nhân Trí',
    siteConfig,
    bodyHtml,
  });
}

export function buildTuitionReceiptDocumentHtml(params: {
  record: TuitionRecord;
  siteConfig?: Partial<SiteConfig>;
}): string {
  const { record, siteConfig } = params;
  const remaining = Math.max(0, record.totalAmount - record.paidAmount);
  const bankName = siteConfig?.bankName || 'MBBank (Quân Đội)';
  const bankAccount = siteConfig?.bankAccount || '0987405186';
  const bankOwner = siteConfig?.bankOwner || 'TRUNG TAM DAY THEM NHAN TRI';
  const transferContent = `HOCPHI ${record.studentName.toUpperCase()} ${record.monthLabel}`.replace(
    /\s+/g,
    ' ',
  );
  const qrUrl = `https://img.vietqr.io/image/MB-${encodeURIComponent(bankAccount)}-compact2.png?amount=${Math.max(0, remaining || record.totalAmount)}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(bankOwner)}`;

  const statusText =
    record.status === 'PAID'
      ? 'ĐÃ THANH TOÁN ĐỦ'
      : record.status === 'OVERDUE'
        ? 'QUÁ HẠN THANH TOÁN'
        : 'ĐẾN HẠN THANH TOÁN';

  const bodyHtml = `
    <div class="info-grid">
      <div class="info-row"><span>Học sinh:</span> <strong>${escapeHtml(record.studentName)}</strong></div>
      <div class="info-row"><span>Lớp Trung tâm:</span> <strong>${escapeHtml(record.centerClass)}</strong></div>
      <div class="info-row"><span>Kỳ học phí:</span> <strong>${escapeHtml(record.monthLabel)} ${record.billingCycle === 'ANNUAL_12M' ? '(Đóng trọn năm 12 tháng)' : '(Đóng theo tháng)'}</strong></div>
      <div class="info-row"><span>Hạn thanh toán:</span> <strong>${escapeHtml(record.dueDate)}</strong></div>
      <div class="info-row"><span>SĐT Phụ huynh:</span> <strong>${escapeHtml(record.parentPhone)}</strong></div>
      <div class="info-row"><span>Trạng thái:</span> <strong style="color:${record.status === 'PAID' ? '#047857' : '#b45309'}">${statusText}</strong></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Khoản mục học phí &amp; dịch vụ</th>
          <th style="width:160px;text-align:right">Số tiền (VNĐ)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Học phí chính khóa (${record.monthsCount || 1} tháng)</td>
          <td class="num">${formatVndPlain(record.baseAmount)}</td>
        </tr>
        ${
          record.boardingAmount > 0
            ? `<tr><td>Dịch vụ Bán trú (cơm trưa + ngủ trưa có cô trông)</td><td class="num">${formatVndPlain(record.boardingAmount)}</td></tr>`
            : ''
        }
        ${
          record.shuttleAmount > 0
            ? `<tr><td>Dịch vụ Đưa rước học sinh tại trường</td><td class="num">${formatVndPlain(record.shuttleAmount)}</td></tr>`
            : ''
        }
        ${
          record.discountAmount > 0
            ? `<tr><td style="color:#047857">Ưu đãi cộng dồn (${record.siblingDiscountPercent ? `Nhiều con ${record.siblingDiscountPercent}%` : ''}${record.siblingDiscountPercent && record.annualDiscountPercent ? ' + ' : ''}${record.annualDiscountPercent ? `Đóng 12 tháng ${record.annualDiscountPercent}%` : ''} trên học phí chính)</td><td class="num" style="color:#047857">-${formatVndPlain(record.discountAmount)}</td></tr>`
            : ''
        }
        <tr style="background:#eff6ff;font-weight:800">
          <td>TỔNG CỘNG PHẢI THANH TOÁN</td>
          <td class="num" style="color:#1e3a8a;font-size:14px">${formatVndPlain(record.totalAmount)}</td>
        </tr>
        <tr>
          <td>Đã thanh toán</td>
          <td class="num" style="color:#047857">${formatVndPlain(record.paidAmount)}</td>
        </tr>
        <tr>
          <td><strong>Số tiền còn lại</strong></td>
          <td class="num" style="color:${remaining > 0 ? '#dc2626' : '#047857'}"><strong>${formatVndPlain(remaining)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="qr-section">
      <img src="${qrUrl}" alt="Mã QR thanh toán học phí Trung Tâm Nhân Trí" />
      <div style="font-size:12px;line-height:1.65">
        <div style="font-weight:800;color:#1e3a8a;font-size:13px;margin-bottom:4px">CHUYỂN KHOẢN NHANH VIETQR 24/7</div>
        <div>Ngân hàng: <strong>${escapeHtml(bankName)}</strong></div>
        <div>Số tài khoản: <strong>${escapeHtml(bankAccount)}</strong></div>
        <div>Chủ tài khoản: <strong>${escapeHtml(bankOwner)}</strong></div>
        <div>Nội dung chuyển khoản: <strong>${escapeHtml(transferContent)}</strong></div>
      </div>
    </div>

    <div class="signature-row">
      <div>
        <strong>PHỤ HUYNH / NGƯỜI NỘP TIỀN</strong>
        <div style="margin-top:44px;color:#64748b">(Ký và ghi rõ họ tên)</div>
      </div>
      <div>
        <strong>KẾ TOÁN TRUNG TÂM NHÂN TRÍ</strong>
        <div style="margin-top:44px;color:#1e3a8a;font-weight:700">${record.paidAt ? `Đã thu ngày ${escapeHtml(record.paidAt)}` : 'Xác nhận tự động qua VietQR'}</div>
      </div>
    </div>
  `;

  return wrapBrandedDocument({
    docTitle:
      record.status === 'PAID'
        ? `Biên nhận Học phí — ${record.studentName}`
        : `Phiếu Thông báo Học phí — ${record.studentName}`,
    docCode: `HP-${record.id.slice(0, 8).toUpperCase()}`,
    docCategory: 'Chứng Từ Học Phí Chính Thức · Trung Tâm Nhân Trí',
    siteConfig,
    bodyHtml,
  });
}

// ============================================================
// MULTI-PAGE PERSONALIZED TIMETABLE PDF (FAMILY / CLASS / TEACHER)
// ============================================================

const PDF_DAYS: Array<{ key: TimetableSlot['day']; label: string }> = [
  { key: 'T2', label: 'Thứ 2' },
  { key: 'T3', label: 'Thứ 3' },
  { key: 'T4', label: 'Thứ 4' },
  { key: 'T5', label: 'Thứ 5' },
  { key: 'T6', label: 'Thứ 6' },
  { key: 'T7', label: 'Thứ 7' },
];

const PDF_ROWS: Array<{
  period: TimetableSlot['period'];
  shift: TimetableSlot['shift'];
  label: string;
  time: string;
}> = [
  { period: 'SANG', shift: 'CA_1', label: 'Sáng · Ca 1', time: '07:15–08:45' },
  { period: 'SANG', shift: 'CA_2', label: 'Sáng · Ca 2', time: '09:00–10:30' },
  { period: 'CHIEU', shift: 'CA_1', label: 'Chiều · Ca 1', time: '14:00–15:30' },
  { period: 'CHIEU', shift: 'CA_2', label: 'Chiều · Ca 2', time: '15:30–17:00' },
  { period: 'TOI', shift: 'CA_1', label: 'Tối · Ca 1', time: '17:30–19:00' },
  { period: 'TOI', shift: 'CA_2', label: 'Tối · Ca 2', time: '19:00–20:30' },
];

function renderScheduleMatrixTableHtml(
  slots: TimetableSlot[],
  perspective: 'STUDENT' | 'TEACHER',
): string {
  const tbody = PDF_ROWS.map((r) => {
    const cells = PDF_DAYS.map((d) => {
      const matched = slots.filter(
        (sl) => sl.period === r.period && sl.shift === r.shift && sl.day === d.key,
      );
      if (matched.length === 0) {
        return `<td style="color:#cbd5e1;text-align:center">—</td>`;
      }
      const html = matched
        .map(
          (sl) => `
          <div class="slot-cell ${classifySlotStyle(sl)}">
            <strong>${escapeHtml(sl.subject)}</strong>
            <div>${escapeHtml(sl.centerClass)} · ${escapeHtml(sl.room)}</div>
            <div style="color:#475569">${
              perspective === 'TEACHER'
                ? escapeHtml(sl.slotType === 'TRA_BAI' ? 'Giờ Trả bài' : sl.slotType === 'BU_THE_DUC' ? 'Bù Thể dục' : 'Dạy chính')
                : escapeHtml(sl.teacherName)
            }</div>
          </div>`,
        )
        .join('');
      return `<td>${html}</td>`;
    }).join('');
    return `
      <tr>
        <td style="background:#f8fafc;width:96px">
          <strong>${r.label}</strong>
          <div style="font-size:10px;color:#64748b;font-variant-numeric:tabular-nums">${r.time}</div>
        </td>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Ca học</th>
          ${PDF_DAYS.map((d) => `<th>${d.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

function buildMultiPageBrandedShell(params: {
  docTitle: string;
  pagesHtml: string[];
  siteConfig?: Partial<SiteConfig>;
  extraCss?: string;
}): string {
  const logoUrl = escapeHtml(resolveAbsoluteLogoUrl());
  const centerName = escapeHtml(
    params.siteConfig?.centerName || 'TRUNG TÂM DẠY THÊM HỌC THÊM NHÂN TRÍ',
  );
  const domain = escapeHtml(params.siteConfig?.domain || 'daythemnhantri.com');
  const hotline = escapeHtml(params.siteConfig?.hotlineZalo || '0947 376 444 (Cô Tâm)');
  const campus1 = escapeHtml(
    params.siteConfig?.campus1 || 'Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, Tỉnh An Giang',
  );
  const printedAt = escapeHtml(formatTodayVn());

  const wrappedPages = params.pagesHtml
    .map(
      (inner, idx) => `
      <section class="print-page ${idx < params.pagesHtml.length - 1 ? 'page-break' : ''}">
        <header class="brand-header">
          <div class="brand-left">
            <div class="brand-logo-wrap">
              <img src="${logoUrl}" alt="Logo Trung Tâm Nhân Trí" />
            </div>
            <div>
              <div class="brand-org">${centerName}</div>
              <div class="brand-sub">${campus1}</div>
              <div class="brand-sub">Website: <strong>${domain}</strong> · Hotline/Zalo: <strong>${hotline}</strong></div>
            </div>
          </div>
          <div class="brand-meta">
            <strong>SINCE 2023</strong>
            <div>Trang ${idx + 1} / ${params.pagesHtml.length}</div>
            <div>Xuất lúc: ${printedAt}</div>
          </div>
        </header>
        ${inner}
        <footer class="brand-footer">
          <span>Tài liệu cá nhân hóa chính thức của Trung Tâm Nhân Trí (${domain})</span>
          <span>Trao tri thức · Gửi yêu thương</span>
        </footer>
      </section>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.docTitle)} — Trung Tâm Nhân Trí</title>
  <style>
    @page { size: A4; margin: 12mm 12mm 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #f1f5f9;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-size: 12px;
      line-height: 1.48;
    }
    .watermark-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .watermark-logo {
      width: 330px;
      height: 330px;
      object-fit: contain;
      opacity: 0.06;
      transform: rotate(-18deg);
    }
    .watermark-text {
      margin-top: 8px;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.22em;
      color: #1e3a8a;
      opacity: 0.05;
      transform: rotate(-18deg);
      text-transform: uppercase;
      white-space: nowrap;
    }
    .print-page {
      position: relative;
      z-index: 1;
      max-width: 820px;
      margin: 14px auto;
      padding: 20px 24px 24px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 10px;
      border-bottom: 2.5px solid #1e3a8a;
      margin-bottom: 14px;
    }
    .brand-left { display: flex; align-items: center; gap: 11px; }
    .brand-logo-wrap {
      width: 52px; height: 52px; border-radius: 999px; border: 1.5px solid #bfdbfe;
      padding: 2px; background: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .brand-logo-wrap img { width: 100%; height: 100%; object-fit: contain; border-radius: 999px; }
    .brand-org { font-size: 13px; font-weight: 800; color: #1e3a8a; }
    .brand-sub { font-size: 10.5px; color: #475569; margin-top: 2px; }
    .brand-meta { text-align: right; font-size: 10.5px; color: #475569; flex-shrink: 0; }
    .brand-meta strong { color: #1e3a8a; font-size: 11px; display: block; }
    .doc-title-box { text-align: center; margin: 8px 0 12px; }
    .doc-category { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #b45309; }
    .doc-title { font-size: 17px; font-weight: 800; color: #0f172a; margin: 3px 0 0; }
    .info-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px;
      background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;
      padding: 10px 12px; margin-bottom: 12px; font-size: 11.5px;
    }
    .info-row span { color: #64748b; }
    .info-row strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; text-align: left; }
    th { background: #eff6ff; color: #1e3a8a; font-weight: 700; }
    .slot-cell {
      border-radius: 5px; padding: 4px 6px; border: 1px solid #bfdbfe;
      background: #eff6ff; margin-bottom: 3px; font-size: 10px;
    }
    .slot-cell.trabai { background: #fffbeb; border-color: #fde68a; }
    .slot-cell.english { background: #ecfdf5; border-color: #a7f3d0; }
    .slot-cell.science { background: #eef2ff; border-color: #c7d2fe; }
    .slot-cell.lit { background: #fff1f2; border-color: #fecdd3; }
    .slot-cell strong { display: block; color: #0f172a; }
    .brand-footer {
      margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #64748b; gap: 10px;
    }
    ${params.extraCss || ''}
    @media print {
      body { background: #fff; }
      .print-page { margin: 0; padding: 0; max-width: none; box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="watermark-layer" aria-hidden="true">
    <img class="watermark-logo" src="${logoUrl}" alt="" />
    <div class="watermark-text">NHÂN TRÍ · SINCE 2023</div>
  </div>
  ${wrappedPages}
</body>
</html>`;
}

export interface FamilyPdfGroup {
  familyLabel: string;
  parentName: string;
  parentPhone: string;
  familyProfile?: FamilyProfile;
  children: Array<{
    student: Student;
    slots: TimetableSlot[];
    qrDataUrl?: string;
  }>;
}

export function buildBatchTimetablePdfHtml(params: {
  mode: 'FAMILY' | 'STUDENT_BATCH' | 'TEACHER';
  docTitle: string;
  familyGroups?: FamilyPdfGroup[];
  studentItems?: Array<{ student: Student; slots: TimetableSlot[]; qrDataUrl?: string }>;
  teacherItems?: Array<{ teacher: Teacher; slots: TimetableSlot[] }>;
  siteConfig?: Partial<SiteConfig>;
}): string {
  const pagesHtml: string[] = [];

  if (params.mode === 'FAMILY' && params.familyGroups) {
    params.familyGroups.forEach((group) => {
      if (group.children.length > 1) {
        const childrenSummaryRows = group.children
          .map(
            (c, idx) => `
            <tr>
              <td style="text-align:center;font-variant-numeric:tabular-nums">${idx + 1}</td>
              <td><strong>${escapeHtml(c.student.fullName)}</strong></td>
              <td style="font-variant-numeric:tabular-nums">${escapeHtml(c.student.code)}</td>
              <td>${escapeHtml(c.student.centerClass)} · ${escapeHtml(c.student.room)}</td>
              <td style="text-align:center;font-variant-numeric:tabular-nums">${c.slots.length} ca/tuần</td>
              <td>${escapeHtml(c.student.eveningMakeupSlot || 'Theo lịch chuẩn')}</td>
            </tr>`,
          )
          .join('');
        pagesHtml.push(`
          <div class="doc-title-box">
            <div class="doc-category">Hồ sơ Thời khóa biểu Gia đình · Gộp ${group.children.length} anh chị em</div>
            <h1 class="doc-title">LỊCH HỌC TUẦN GIA ĐÌNH PHỤ HUYNH ${escapeHtml(group.parentName.toUpperCase())}</h1>
          </div>
          <div class="info-grid">
            <div class="info-row"><span>Phụ huynh đại diện:</span> <strong>${escapeHtml(group.parentName)}</strong></div>
            <div class="info-row"><span>SĐT / Zalo liên hệ:</span> <strong>${escapeHtml(group.parentPhone)}</strong></div>
            <div class="info-row"><span>Số học sinh trong gia đình:</span> <strong>${group.children.length} em</strong></div>
            <div class="info-row"><span>Chính sách ưu đãi gia đình:</span> <strong>${
              group.familyProfile?.siblingDiscountPercent
                ? `Giảm ${group.familyProfile.siblingDiscountPercent}% học phí nhiều con`
                : 'Hồ sơ ghép gia đình Nhân Trí'
            }</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th>Học sinh</th>
                <th>Mã HS</th>
                <th>Lớp · Phòng</th>
                <th style="text-align:center">Số ca/tuần</th>
                <th>Ghi chú / Bù Thể dục</th>
              </tr>
            </thead>
            <tbody>${childrenSummaryRows}</tbody>
          </table>
          <div style="font-size:11.5px;color:#334155;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px">
            <strong>Hướng dẫn cho Quý Phụ huynh:</strong> Các trang tiếp theo là Thời khóa biểu chi tiết riêng của từng con trong gia đình, phân màu trực quan theo môn học và kèm mã QR tra cứu trực tiếp học phí / điểm số mới nhất bằng Mã PIN.
          </div>
        `);
      }

      group.children.forEach(({ student, slots, qrDataUrl }) => {
        pagesHtml.push(`
          <div class="doc-title-box">
            <div class="doc-category">Thời khóa biểu Cá nhân hóa · ${escapeHtml(group.familyLabel)}</div>
            <h1 class="doc-title">${escapeHtml(student.fullName)} — ${escapeHtml(student.centerClass)}</h1>
          </div>
          <div style="display:flex;gap:12px;align-items:stretch;margin-bottom:12px">
            <div class="info-grid" style="flex:1;margin-bottom:0">
              <div class="info-row"><span>Mã Học sinh:</span> <strong style="font-variant-numeric:tabular-nums">${escapeHtml(student.code)}</strong></div>
              <div class="info-row"><span>Lớp / Trường:</span> <strong>${escapeHtml(student.centerClass)} · ${escapeHtml(student.school)}</strong></div>
              <div class="info-row"><span>GV Phụ trách:</span> <strong>${escapeHtml(student.homeroomTeacher)} (${escapeHtml(student.room)})</strong></div>
              <div class="info-row"><span>Tổng lịch tuần:</span> <strong>${slots.length} ca học</strong></div>
              <div class="info-row"><span>Bù Thể dục:</span> <strong>${escapeHtml(student.eveningMakeupSlot || 'Không trùng lịch')}</strong></div>
              <div class="info-row"><span>Mã PIN tra cứu QR:</span> <strong style="font-variant-numeric:tabular-nums">${escapeHtml(student.accessPin || 'Liên hệ Cô Tâm')}</strong></div>
            </div>
            ${
              qrDataUrl
                ? `<div style="width:94px;border:1px solid #cbd5e1;border-radius:8px;padding:5px;text-align:center;background:#fff;flex-shrink:0">
                    <img src="${qrDataUrl}" alt="QR ${escapeHtml(student.code)}" style="width:74px;height:74px;object-fit:contain" />
                    <div style="font-size:8.5px;color:#1e3a8a;font-weight:700">Quét QR · Nhập PIN</div>
                  </div>`
                : ''
            }
          </div>
          ${renderScheduleMatrixTableHtml(slots, 'STUDENT')}
          <div style="font-size:10.5px;color:#475569">
            Màu sắc: <strong>Xanh dương</strong> = Toán / Môn chính · <strong>Xanh ngọc</strong> = Tiếng Anh · <strong>Chàm</strong> = Lý/Hóa/KHTN · <strong>Hồng</strong> = Ngữ Văn · <strong>Vàng</strong> = Giờ Trả bài / Soạn bài.
          </div>
        `);
      });
    });
  } else if (params.mode === 'STUDENT_BATCH' && params.studentItems) {
    params.studentItems.forEach(({ student, slots, qrDataUrl }) => {
      pagesHtml.push(`
        <div class="doc-title-box">
          <div class="doc-category">Thời khóa biểu Cá nhân Học sinh · In hàng loạt theo lớp</div>
          <h1 class="doc-title">${escapeHtml(student.fullName)} — ${escapeHtml(student.centerClass)}</h1>
        </div>
        <div style="display:flex;gap:12px;align-items:stretch;margin-bottom:12px">
          <div class="info-grid" style="flex:1;margin-bottom:0">
            <div class="info-row"><span>Mã Học sinh:</span> <strong style="font-variant-numeric:tabular-nums">${escapeHtml(student.code)}</strong></div>
            <div class="info-row"><span>Phụ huynh:</span> <strong>${escapeHtml(student.parentName)} (${escapeHtml(student.parentPhone)})</strong></div>
            <div class="info-row"><span>Trường / Lớp chính khóa:</span> <strong>${escapeHtml(student.school)} · ${escapeHtml(student.schoolClass)}</strong></div>
            <div class="info-row"><span>GV Phụ trách / Phòng:</span> <strong>${escapeHtml(student.homeroomTeacher)} · ${escapeHtml(student.room)}</strong></div>
            <div class="info-row"><span>Lịch bù Thể dục:</span> <strong>${escapeHtml(student.eveningMakeupSlot || 'Không trùng lịch')}</strong></div>
            <div class="info-row"><span>Mã PIN tra cứu QR:</span> <strong style="font-variant-numeric:tabular-nums">${escapeHtml(student.accessPin || 'Liên hệ Cô Tâm')}</strong></div>
          </div>
          ${
            qrDataUrl
              ? `<div style="width:94px;border:1px solid #cbd5e1;border-radius:8px;padding:5px;text-align:center;background:#fff;flex-shrink:0">
                  <img src="${qrDataUrl}" alt="QR ${escapeHtml(student.code)}" style="width:74px;height:74px;object-fit:contain" />
                  <div style="font-size:8.5px;color:#1e3a8a;font-weight:700">Quét QR · Nhập PIN</div>
                </div>`
              : ''
          }
        </div>
        ${renderScheduleMatrixTableHtml(slots, 'STUDENT')}
      `);
    });
  } else if (params.mode === 'TEACHER' && params.teacherItems) {
    params.teacherItems.forEach(({ teacher, slots }) => {
      const classes = Array.from(new Set(slots.map((s) => s.centerClass))).join(', ') || 'Chưa phân ca';
      pagesHtml.push(`
        <div class="doc-title-box">
          <div class="doc-category">Lịch Giảng Dạy &amp; Phân Công Cá Nhân · Giáo viên Nhân Trí</div>
          <h1 class="doc-title">${escapeHtml(teacher.name)} (${escapeHtml(teacher.shortName)})</h1>
        </div>
        <div class="info-grid">
          <div class="info-row"><span>Nhóm chuyên môn:</span> <strong>${teacher.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài & Kèm bài' : 'GV Bộ môn chính khóa'}</strong></div>
          <div class="info-row"><span>Môn phụ trách:</span> <strong>${escapeHtml(teacher.subjects.join(', '))}</strong></div>
          <div class="info-row"><span>Tổng số ca tuần này:</span> <strong style="font-variant-numeric:tabular-nums">${slots.length} ca dạy</strong></div>
          <div class="info-row"><span>Phòng mặc định:</span> <strong>${escapeHtml(teacher.roomDefault)}</strong></div>
          <div class="info-row"><span>Các lớp phụ trách:</span> <strong>${escapeHtml(classes)}</strong></div>
          <div class="info-row"><span>Trình độ:</span> <strong>${escapeHtml(teacher.degree)}</strong></div>
        </div>
        ${renderScheduleMatrixTableHtml(slots, 'TEACHER')}
      `);
    });
  }

  if (pagesHtml.length === 0) {
    pagesHtml.push(`<p style="text-align:center;color:#64748b;padding:40px 0">Chưa có dữ liệu lịch học nào được chọn để xuất PDF.</p>`);
  }

  return buildMultiPageBrandedShell({
    docTitle: params.docTitle,
    pagesHtml,
    siteConfig: params.siteConfig,
  });
}

// ============================================================
// BRANDED STUDENT QR ID CARDS (SINGLE OR 6-UP A4 CLASS SHEET)
// ============================================================

export function buildStudentQrCardsHtml(params: {
  cards: Array<{
    student: Student;
    qrDataUrl: string;
    qrUrl: string;
  }>;
  title?: string;
  siteConfig?: Partial<SiteConfig>;
}): string {
  const logoUrl = escapeHtml(resolveAbsoluteLogoUrl());
  const chunks: Array<typeof params.cards> = [];
  for (let i = 0; i < params.cards.length; i += 6) {
    chunks.push(params.cards.slice(i, i + 6));
  }

  const pagesHtml = chunks.map((chunk) => {
    const cardsHtml = chunk
      .map(
        ({ student, qrDataUrl }) => `
        <div class="qr-id-card">
          <div class="qr-card-top">
            <div class="qr-card-logo">
              <img src="${logoUrl}" alt="NT" />
            </div>
            <div>
              <div class="qr-card-brand">TRUNG TÂM NHÂN TRÍ</div>
              <div class="qr-card-sub">THẺ HỌC SINH THÔNG MINH · SINCE 2023</div>
            </div>
          </div>
          <div class="qr-card-body">
            <div class="qr-card-info">
              <div class="qr-card-name">${escapeHtml(student.fullName)}</div>
              <div class="qr-card-code">${escapeHtml(student.code)}</div>
              <div class="qr-card-meta">Lớp: <strong>${escapeHtml(student.centerClass)}</strong> · ${escapeHtml(student.room)}</div>
              <div class="qr-card-meta">Trường: ${escapeHtml(student.school)}</div>
              <div class="qr-card-meta">PH: ${escapeHtml(student.parentName)}</div>
              <div class="qr-card-pin">Mã PIN phụ huynh: <strong>${escapeHtml(student.accessPin || 'Hỏi Cô Tâm')}</strong></div>
            </div>
            <div class="qr-card-qrbox">
              <img src="${qrDataUrl}" alt="QR ${escapeHtml(student.code)}" />
              <span>Quét điểm danh &amp; tra cứu</span>
            </div>
          </div>
        </div>`,
      )
      .join('');

    return `
      <div class="doc-title-box" style="margin-bottom:10px">
        <div class="doc-category">Thẻ Học sinh Tích hợp QR Động · Cắt theo đường viền</div>
        <h1 class="doc-title">${escapeHtml(params.title || 'Bộ Thẻ Học Sinh QR Code — Trung Tâm Nhân Trí')}</h1>
      </div>
      <div class="qr-card-grid">${cardsHtml}</div>
    `;
  });

  const extraCss = `
    .qr-card-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .qr-id-card {
      border: 1.5px solid #1e3a8a;
      border-radius: 10px;
      padding: 11px 12px;
      background: #ffffff;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .qr-card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 6px;
      border-bottom: 1.5px solid #e2e8f0;
    }
    .qr-card-logo {
      width: 32px; height: 32px; border-radius: 999px; border: 1px solid #bfdbfe;
      padding: 1px; background: #fff; flex-shrink: 0;
    }
    .qr-card-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 999px; }
    .qr-card-brand { font-size: 11px; font-weight: 800; color: #1e3a8a; line-height: 1.15; }
    .qr-card-sub { font-size: 8.5px; color: #b45309; font-weight: 700; letter-spacing: 0.06em; }
    .qr-card-body { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .qr-card-info { flex: 1; min-width: 0; }
    .qr-card-name { font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
    .qr-card-code {
      display: inline-block; font-size: 11px; font-weight: 800; color: #1e3a8a;
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px;
      padding: 1px 6px; margin-bottom: 5px; font-variant-numeric: tabular-nums;
    }
    .qr-card-meta { font-size: 10px; color: #334155; line-height: 1.4; }
    .qr-card-pin {
      margin-top: 4px; font-size: 9.5px; color: #047857; font-variant-numeric: tabular-nums;
    }
    .qr-card-qrbox {
      width: 92px; text-align: center; flex-shrink: 0;
    }
    .qr-card-qrbox img {
      width: 86px; height: 86px; object-fit: contain;
      border: 1px solid #cbd5e1; border-radius: 6px; padding: 2px; background: #fff;
    }
    .qr-card-qrbox span { display: block; font-size: 8px; color: #475569; margin-top: 2px; }
  `;

  return buildMultiPageBrandedShell({
    docTitle: params.title || 'Thẻ QR Học sinh Nhân Trí',
    pagesHtml,
    siteConfig: params.siteConfig,
    extraCss,
  });
}

