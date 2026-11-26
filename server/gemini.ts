import { GoogleGenAI, Type } from '@google/genai';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trong Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface AnalyzedTestResult {
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

export async function analyzeTestPaperImage(
  base64Data: string,
  mimeType: string,
): Promise<AnalyzedTestResult> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text:
            'Bạn là trợ lý học vụ tại Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Long Xuyên). ' +
            'Hãy đọc ảnh bài kiểm tra của học sinh Việt Nam và trích xuất chính xác thông tin: ' +
            'họ tên học sinh, lớp, trường, môn học, loại kiểm tra (15_PHUT, 1_TIET, GIUA_KY hoặc CUOI_KY), ' +
            'điểm số đạt được (thang 10), nhận xét tổng quan ngắn gọn, 2-3 điểm mạnh và 2-3 lỗi sai/gợi ý cải thiện cụ thể dựa trên chữ viết và lời phê chấm điểm trong bài.',
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          studentName: { type: Type.STRING, description: 'Họ và tên học sinh ghi trên bài' },
          schoolClass: { type: Type.STRING, description: 'Lớp ở trường, ví dụ 6A5' },
          school: { type: Type.STRING, description: 'Tên trường học nếu có' },
          subject: { type: Type.STRING, description: 'Tên môn học, ví dụ Toán (Số học)' },
          examType: {
            type: Type.STRING,
            description: 'Một trong: 15_PHUT, 1_TIET, GIUA_KY, CUOI_KY',
          },
          score: { type: Type.NUMBER, description: 'Điểm số học sinh đạt được' },
          maxScore: { type: Type.NUMBER, description: 'Thang điểm tối đa, mặc định 10' },
          summary: { type: Type.STRING, description: 'Tóm tắt kết quả bài làm bằng tiếng Việt' },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Danh sách điểm làm tốt',
          },
          improvements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Danh sách lỗi sai cần khắc phục',
          },
        },
        required: [
          'studentName',
          'subject',
          'examType',
          'score',
          'maxScore',
          'summary',
          'strengths',
          'improvements',
        ],
      },
    },
  });

  const raw = (response.text ?? '{}').trim();
  const parsed = JSON.parse(raw) as AnalyzedTestResult;
  const validTypes = ['15_PHUT', '1_TIET', 'GIUA_KY', 'CUOI_KY'] as const;
  const examType = validTypes.includes(parsed.examType) ? parsed.examType : '15_PHUT';

  return {
    studentName: parsed.studentName || 'Chưa rõ tên học sinh',
    schoolClass: parsed.schoolClass || '',
    school: parsed.school || '',
    subject: parsed.subject || 'Toán',
    examType,
    score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : 0,
    maxScore: Number.isFinite(Number(parsed.maxScore)) && Number(parsed.maxScore) > 0 ? Number(parsed.maxScore) : 10,
    summary: parsed.summary || 'Đã hoàn tất phân tích bài kiểm tra.',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
  };
}

export interface ExtractedStudentRow {
  fullName: string;
  schoolClass: string;
  school: string;
  centerClass: string;
  parentPhone: string;
  homeroomTeacher: string;
}

export async function extractStudentsFromRosterImage(
  base64Data: string,
  mimeType: string,
): Promise<ExtractedStudentRow[]> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text:
            'Hãy trích xuất danh sách học sinh từ ảnh bảng danh sách của Trung Tâm Dạy Thêm Nhân Trí. ' +
            'Với mỗi học sinh, lấy họ tên đầy đủ, lớp ở trường, tên trường, lớp tại trung tâm (từ tiêu đề bảng, ví dụ Lớp 7A1), số điện thoại phụ huynh (ẩn 3 chữ số giữa bằng *** để bảo mật), và tên giáo viên phụ trách nhóm/phòng nếu có.',
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING },
            schoolClass: { type: Type.STRING },
            school: { type: Type.STRING },
            centerClass: { type: Type.STRING },
            parentPhone: { type: Type.STRING },
            homeroomTeacher: { type: Type.STRING },
          },
          required: ['fullName', 'centerClass'],
        },
      },
    },
  });

  const raw = (response.text ?? '[]').trim();
  const rows = JSON.parse(raw) as ExtractedStudentRow[];
  return Array.isArray(rows) ? rows.slice(0, 50) : [];
}

export async function askNhanTriAdvisor(
  question: string,
  contextSummary: string,
  language: 'vi' | 'en' = 'vi',
): Promise<string> {
  const ai = getClient();

  const systemInstruction =
    language === 'en'
      ? 'You are the 24/7 Academic Advisor of Trung Tâm Dạy Thêm Học Thêm Nhân Trí (35 Lý Thường Kiệt, Long Xuyên, An Giang · Hotline/Zalo Cô Tâm: 0947 376 444). ' +
        'Answer clearly, concisely, and warmly in English based strictly on the center facts provided: ' +
        'Primary (Grades 3-5) small-group integrated Math/English/Vietnamese 1.1M VND/month with FREE makeup tutoring; ' +
        'Middle School (Grades 6-9) all-in-one 1.85M VND/month with daily review, Grade 10 entrance exam prep, optional boarding meals (+950k) & shuttle (+450k); ' +
        'High School (Grades 10-12) per-subject 650k VND/subject/month for Math, Literature, English, Physics, Chemistry, Biology + University Aptitude Prep (V-ACT, V-SAT, BCA, HCMUE); ' +
        '10% discount for annual prepayment; automatic evening makeup (17:30-19:00) when school PE conflicts with center classes.'
      : 'Bạn là Trợ lý Học vụ & Tư vấn 24/7 của Trung Tâm Dạy Thêm Học Thêm Nhân Trí (Cơ sở 1: 35 Lý Thường Kiệt, TP. Long Xuyên, An Giang · Hotline/Zalo Cô Tâm: 0947 376 444 · Email: trungtamnhantri.lxag@gmail.com). ' +
        'Trả lời lịch sự, rõ ràng, ngắn gọn, đúng trọng tâm bằng tiếng Việt dựa trên thông tin trung tâm: ' +
        '• Cấp 1 (Lớp 3, 4, 5): Nhóm nhỏ tích hợp 3 môn cốt lõi Toán – Tiếng Anh – Tiếng Việt & Khoa học (Cô Tâm) 1.100.000đ/tháng; hỗ trợ phụ đạo bù bài MIỄN PHÍ khi chưa theo kịp bài hoặc lỡ buổi học cùng gia đình (tùy chọn bán trú +750k, đưa rước +400k). ' +
        '• Cấp 2 (Lớp 6, 7, 8, 9): Trọn gói 1.850.000đ/tháng gồm học chính khóa + Trả bài & Soạn bài hằng ngày + lộ trình Thời điểm vàng lớp 8–9 luyện thi vào Lớp 10 công lập; tùy chọn bán trú cơm nước (+950.000đ/tháng) và đưa rước (+450.000đ/tháng). ' +
        '• Cấp 3 (Lớp 10, 11, 12): Học từng môn chuyên sâu 650.000đ/môn/tháng đủ 6 môn Toán, Ngữ Văn, Tiếng Anh, Vật Lý, Hóa Học, Sinh Học & luyện thi ĐGNL (V-ACT, V-SAT, ĐGNL Bộ Công an, ĐGNL HCMUE). ' +
        '• Ưu đãi đóng trước nguyên năm học: Giảm ngay 10% tổng học phí. ' +
        '• Quy định trùng lịch Thể dục ở trường: Học sinh tự động được xếp sang Ca tối 17h30–19h00 để học bù trả bài và soạn bài. ' +
        'Ngoài tư vấn khóa học, bạn cũng giải đáp thắc mắc học tập, hướng dẫn phương pháp giải bài tập GDPT 2018 cho học sinh.';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Thông tin bối cảnh hiện tại:\n${contextSummary}\n\nCâu hỏi của người dùng:\n${question}`,
    config: {
      systemInstruction,
    },
  });

  return (response.text ?? '').trim() || 'Trung Tâm Nhân Trí đã tiếp nhận câu hỏi. Vui lòng thử lại sau giây lát.';
}
