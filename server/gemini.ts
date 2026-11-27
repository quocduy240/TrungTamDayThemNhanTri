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

export interface SmartExtractPayload {
  entityType: 'STUDENTS' | 'TEACHERS' | 'SCORES' | 'TIMETABLE';
  fileBase64?: string;
  mimeType?: string;
  rawText?: string;
  canonicalContext?: {
    teachers?: string[];
    rooms?: string[];
    classes?: string[];
  };
}

/**
 * Universal Multimodal AI Document Extractor (Image / Camera / PDF / Word Text / Non-standard Excel Text)
 * Powered by gemini-4-hydrogen with strict JSON responseSchema for each entity type.
 */
export async function smartExtractWithGemini(
  payload: SmartExtractPayload,
  aiOverride?: GoogleGenAI,
): Promise<Record<string, unknown>[]> {
  const ai = aiOverride || getClient();

  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  if (payload.fileBase64) {
    const cleaned = payload.fileBase64.includes(',')
      ? payload.fileBase64.split(',')[1]
      : payload.fileBase64;
    parts.push({
      inlineData: {
        mimeType: payload.mimeType || 'image/jpeg',
        data: cleaned,
      },
    });
  }

  let prompt = '';
  let schema: Record<string, unknown>;

  if (payload.entityType === 'STUDENTS') {
    prompt =
      'Bạn là trợ lý học vụ Trung Tâm Nhân Trí. Hãy trích xuất toàn bộ danh sách HỌC SINH từ tài liệu/ảnh/bảng này. ' +
      'Trả về mảng JSON chuẩn gồm: fullName (họ tên đầy đủ), centerClass (VD: Lớp 7A1, Lớp 4,5), grade (số nguyên 3-12), ' +
      'schoolClass (lớp ở trường), school (tên trường), parentName (tên phụ huynh), parentPhone (giữ nguyên đầy đủ số điện thoại 10 số nếu có), ' +
      'parentEmail (nếu có), homeroomTeacher (GV phụ trách), room (Phòng 1..6), hasBoarding ("Có" hoặc "Không"), hasShuttle ("Có" hoặc "Không"), enrolledSubjects (chuỗi môn cách nhau dấu phẩy).';
    schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          centerClass: { type: Type.STRING },
          grade: { type: Type.STRING },
          schoolClass: { type: Type.STRING },
          school: { type: Type.STRING },
          parentName: { type: Type.STRING },
          parentPhone: { type: Type.STRING },
          parentEmail: { type: Type.STRING },
          homeroomTeacher: { type: Type.STRING },
          room: { type: Type.STRING },
          hasBoarding: { type: Type.STRING },
          hasShuttle: { type: Type.STRING },
          enrolledSubjects: { type: Type.STRING },
        },
        required: ['fullName'],
      },
    };
  } else if (payload.entityType === 'TEACHERS') {
    prompt =
      'Bạn là trợ lý nhân sự học vụ Trung Tâm Nhân Trí. Hãy trích xuất toàn bộ danh sách GIÁO VIÊN từ ảnh/tài liệu/bảng này. ' +
      'Trả về mảng JSON gồm: name (họ tên đầy đủ), shortName (tên gọi tắt VD Cô Mẫn, Thầy Bảo), ' +
      'teacherGroup ("SUBJECT" nếu dạy bộ môn chính hoặc "TUTOR_REVIEW" nếu là GV trả bài/kèm bài), ' +
      'subjects (chuỗi các môn cách nhau dấu phẩy), degree (trình độ/bằng cấp), experienceYears (số năm kinh nghiệm), phone, email, roomDefault (Phòng mặc định).';
    schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          shortName: { type: Type.STRING },
          teacherGroup: { type: Type.STRING },
          subjects: { type: Type.STRING },
          degree: { type: Type.STRING },
          experienceYears: { type: Type.STRING },
          phone: { type: Type.STRING },
          email: { type: Type.STRING },
          roomDefault: { type: Type.STRING },
        },
        required: ['name'],
      },
    };
  } else if (payload.entityType === 'SCORES') {
    prompt =
      'Bạn là trợ lý học vụ Trung Tâm Nhân Trí. Hãy trích xuất toàn bộ ĐIỂM SỐ KIỂM TRA từ ảnh bài làm / bảng điểm / file PDF / Word này (có thể là 1 bài kiểm tra hoặc bảng điểm nhiều học sinh). ' +
      'Trả về mảng JSON gồm: studentCode (mã HS nếu có), studentName (họ tên HS), centerClass (lớp), subject (môn học), ' +
      'examType (một trong: 15_PHUT, 1_TIET, GIUA_KY, CUOI_KY), score (số điểm thang 10), date (YYYY-MM-DD nếu có), aiSummary (nhận xét ngắn gọn).';
    schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          studentCode: { type: Type.STRING },
          studentName: { type: Type.STRING },
          centerClass: { type: Type.STRING },
          subject: { type: Type.STRING },
          examType: { type: Type.STRING },
          score: { type: Type.STRING },
          date: { type: Type.STRING },
          aiSummary: { type: Type.STRING },
        },
        required: ['studentName', 'subject', 'score'],
      },
    };
  } else {
    const tList = (payload.canonicalContext?.teachers || []).join(', ');
    const rList = (payload.canonicalContext?.rooms || []).join(', ');
    const cList = (payload.canonicalContext?.classes || []).join(', ');
    prompt =
      'Bạn là chuyên gia chuẩn hóa Thời khóa biểu Trung Tâm Nhân Trí. Tài liệu/ảnh đầu vào có thể ở bất kỳ bố cục bảng biểu nào (lịch ngang, lịch dọc, chia buổi, ô gộp). ' +
      'Hãy bóc tách từng ca học thành danh sách phẳng chuẩn hóa theo CSDL gồm: ' +
      'day (bắt buộc một trong: T2, T3, T4, T5, T6, T7), ' +
      'period (bắt buộc một trong: SANG, CHIEU, TOI), ' +
      'shift (bắt buộc một trong: CA_1, CA_2), ' +
      'timeRange (VD: 07:15–08:45, 14:00–15:30, 17:30–19:00), ' +
      'centerClass (tên lớp VD: Lớp 6A1, Lớp 7A1, Lớp 4,5), ' +
      'subject (tên môn học), teacherName (ưu tiên khớp tên giáo viên có sẵn), room (ưu tiên khớp phòng học có sẵn), ' +
      'slotType (một trong: MAIN, TRA_BAI, PHU_DAO, BU_THE_DUC), note (ghi chú nếu có).\n' +
      (tList ? `Danh sách Giáo viên chốt cứng hiện tại: ${tList}\n` : '') +
      (rList ? `Danh sách Phòng học chốt cứng hiện tại: ${rList}\n` : '') +
      (cList ? `Danh sách Lớp học hiện có: ${cList}\n` : '');
    schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING },
          period: { type: Type.STRING },
          shift: { type: Type.STRING },
          timeRange: { type: Type.STRING },
          centerClass: { type: Type.STRING },
          subject: { type: Type.STRING },
          teacherName: { type: Type.STRING },
          room: { type: Type.STRING },
          slotType: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['day', 'period', 'shift', 'centerClass', 'subject'],
      },
    };
  }

  if (payload.rawText && payload.rawText.trim()) {
    prompt += `\n\n--- NỘI DUNG VĂN BẢN / BẢNG ĐÃ TRÍCH XUẤT ---\n${payload.rawText.slice(0, 18000)}`;
  }

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });

  const raw = (response.text ?? '[]').trim();
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]).slice(0, 150) : [];
}

