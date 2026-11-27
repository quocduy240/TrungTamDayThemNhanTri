import type { FrontendMode } from '../types';

export type FrontendManualPersona = 'NEW_CUSTOMER' | 'STUDENT' | 'PARENT' | 'TEACHER';

export interface ZpdFlowNode {
  step: string;
  title: string;
  summary: string;
  tip: string;
  targetAnchor?: string;
  targetTab?: string;
}

export interface ZpdActionStep {
  number: string;
  title: string;
  instruction: string;
  example: string;
  ctaLabel?: string;
  targetAnchor?: string;
  targetTab?: string;
}

export interface ZpdMasteryTip {
  title: string;
  detail: string;
}

export interface ZpdManualChapter {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  readMinutes: string;
  zpdPromise: string;
  layer1Flow: ZpdFlowNode[];
  layer2Steps: ZpdActionStep[];
  layer3Mastery: ZpdMasteryTip[];
  keywords: string[];
}

// ============================================================
// 1. FRONTEND ZPD USER MANUALS (4 PERSONALIZED AUDIENCES)
// ============================================================

export const FRONTEND_ZPD_MANUALS: Record<FrontendManualPersona, ZpdManualChapter> = {
  NEW_CUSTOMER: {
    id: 'fe-new-customer',
    badge: 'Khách hàng mới & Phụ huynh tìm hiểu',
    title: 'Tìm hiểu chương trình, dự toán học phí & đăng ký học thử trong 2 phút',
    subtitle:
      'Lộ trình trực quan dành cho gia đình lần đầu ghé thăm daythemnhantri.com — xem khóa học Cấp 1–2–3, tính học phí ưu đãi anh em ruột và đặt lịch tư vấn.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Từ lần ghé đầu tiên → Biết ngay gói học phù hợp, tổng học phí chính xác và lịch học thử.',
    layer1Flow: [
      {
        step: '01',
        title: 'Chọn khối lớp & chương trình',
        summary: 'Xem chi tiết gói Tiểu học (Kèm/Bán trú), THCS và THPT bám sát GDPT 2018.',
        tip: 'Mỗi gói đều ghi rõ số môn, hình thức học và quyền lợi Trả bài 1-1.',
        targetAnchor: '#courses',
      },
      {
        step: '02',
        title: 'Dự toán học phí minh bạch',
        summary: 'Tự tính học phí theo tháng hoặc gói 12 tháng (ưu đãi chiết khấu) + Bán trú/Đưa rước.',
        tip: 'Gia đình có từ 2 anh chị em ruột được cộng thêm ưu đãi học phí tự động.',
        targetAnchor: '#courses',
      },
      {
        step: '03',
        title: 'Xem hoạt động & cơ sở thực tế',
        summary: 'Theo dõi hình ảnh lớp học, video bài giảng từ Facebook, YouTube, TikTok, Zalo.',
        tip: 'Giúp phụ huynh yên tâm về không gian học và phong cách kèm cặp của thầy cô.',
        targetAnchor: '#activities',
      },
      {
        step: '04',
        title: 'Đặt lịch tư vấn / Học thử',
        summary: 'Gửi thông tin SĐT hoặc bấm Zalo Hotline 0987 405 186 để được xếp lớp kiểm tra đầu vào.',
        tip: 'Nhân viên học vụ phản hồi nhanh và cấp tài khoản Phụ huynh ngay sau khi nhập học.',
        targetAnchor: '#contact',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Chọn đúng chế độ hiển thị ngay đầu trang',
        instruction:
          'Mặc định trang mở ở chế độ "Khách hàng mới". Nếu đã có tài khoản Phụ huynh hoặc Học sinh, bấm chuyển ngay ở thanh chế độ phía trên.',
        example: 'Ví dụ: Phụ huynh tìm lớp cho bé lớp 7 → xem nhóm THCS (Toán–Lý–Hóa–Anh–Văn).',
        ctaLabel: 'Xem Khóa học & Bảng giá',
        targetAnchor: '#courses',
      },
      {
        number: 'Bước 2',
        title: 'So sánh gói Học theo tháng và Gói 12 tháng',
        instruction:
          'Bật nút so sánh chu kỳ đóng phí trong mục Khóa học để thấy ngay số tiền tiết kiệm khi đăng ký dài hạn hoặc có thêm dịch vụ Bán trú/Đưa rước.',
        example: 'Ví dụ: Đăng ký gói 12 tháng giảm ngay theo mức ưu đãi công khai của trung tâm.',
        ctaLabel: 'Mở Bảng Khóa học',
        targetAnchor: '#courses',
      },
      {
        number: 'Bước 3',
        title: 'Gửi yêu cầu tư vấn hoặc hỏi Trợ lý tư vấn 24/7',
        instruction:
          'Điền họ tên phụ huynh, SĐT Zalo và lớp của con ở mục Liên hệ để trung tâm gọi tư vấn lịch học phù hợp nhất.',
        example: 'Ví dụ: Ghi chú "Bé học sáng ở trường Lý Thường Kiệt, cần học chiều + bán trú".',
        ctaLabel: 'Đi tới Đăng ký Tư vấn',
        targetAnchor: '#contact',
      },
    ],
    layer3Mastery: [
      {
        title: 'Tra cứu phòng học nhanh không cần nhớ đường dẫn',
        detail: 'Sử dụng thanh "Hôm nay học phòng nào?" để nắm khung giờ các ca Sáng – Chiều – Tối của trung tâm.',
      },
      {
        title: 'Chuyển sang giao diện Phụ huynh ngay khi có mã liên kết',
        detail: 'Sau khi đăng ký nhập học, chỉ cần SĐT phụ huynh hoặc Gmail để xem toàn bộ Học bạ, Điểm danh và Thời khóa biểu đồ họa của con.',
      },
    ],
    keywords: ['khách mới', 'học phí', 'khóa học', 'tư vấn', 'đăng ký', 'bán trú', 'đưa rước'],
  },

  STUDENT: {
    id: 'fe-student',
    badge: 'Cổng Học sinh',
    title: 'Xem lịch học, làm đề chuẩn GDPT 2018 với Bảng thông minh & Casio/Vinacal',
    subtitle:
      'Hướng dẫn nhanh cho học sinh vào lớp an toàn bằng Mã HS (NT26-...), luyện đề trắc nghiệm kèm bảng viết nháp và máy tính chuẩn Bộ GD&ĐT.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Vào lớp trong 10 giây → Làm bài có sẵn bảng nháp & máy tính khoa học → Lưu điểm tự động vào Học bạ.',
    layer1Flow: [
      {
        step: '01',
        title: 'Đăng nhập vào lớp',
        summary: 'Dùng Mã Học sinh (VD: NT26-7A1-001) + 4 số cuối SĐT phụ huynh hoặc quét Thẻ QR.',
        tip: 'Không cần nhớ mật khẩu phức tạp; có thể nhờ ba mẹ quét mã QR trên thẻ học sinh.',
        targetAnchor: '#classroom',
      },
      {
        step: '02',
        title: 'Kiểm tra lịch & phòng học hôm nay',
        summary: 'Xem ca học Sáng/Chiều/Tối, số phòng, tên thầy cô và lịch bù Thể dục (nếu có).',
        tip: 'Ca học trong ngày được làm nổi bật để tránh vào nhầm phòng.',
        targetAnchor: '#classroom',
      },
      {
        step: '03',
        title: 'Luyện đề kèm Bảng thông minh + Casio',
        summary: 'Mở Thư viện Đề chuẩn Bộ GDPT 2018; bấm thanh công cụ nổi để bật Bảng vẽ nháp & Máy tính 580VNX / 880BTG / 570VN+ / Vinacal 680EX+.',
        tip: 'Cả bảng vẽ và máy tính đều đi theo khi cuộn trang, phóng to/thu nhỏ độc lập.',
        targetAnchor: '#exams',
      },
      {
        step: '04',
        title: 'Xem Học bạ & Tự nhập điểm kiểm tra',
        summary: 'Nộp bài được chấm điểm ngay, xem giải thích từng câu và tải đề PDF có Logo Nhân Trí.',
        tip: 'Có thể chụp ảnh bài kiểm tra trên trường để AI chấm nhận xét điểm mạnh/yếu.',
        targetAnchor: '#exams',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Chọn chế độ "Giáo viên & Học sinh" và đăng nhập',
        instruction:
          'Nhập Mã Học sinh (ví dụ NT26-7A1-001) cùng 4 số cuối SĐT phụ huynh để mở khóa Thời khóa biểu cá nhân và Thư viện Đề.',
        example: 'Mẹo: Quét mã QR trên thẻ học sinh cũng mở thẳng hồ sơ học tập của em.',
        ctaLabel: 'Mở Cổng Vào lớp',
        targetAnchor: '#classroom',
      },
      {
        number: 'Bước 2',
        title: 'Mở thanh công cụ Bảng thông minh & Máy tính khi làm đề',
        instruction:
          'Khi đang làm bài thi, bấm nút "Bảng nháp" hoặc "Máy tính" trên thanh nổi góc màn hình. Chọn đúng dòng máy tính quen dùng (Casio 580VNX, 880BTG, 570VN+ hoặc Vinacal 680EX+).',
        example: 'Em có thể dùng chế độ Giải PT bậc 2, Hệ phương trình 2 ẩn, Phân số và Bảng giá trị f(x).',
        ctaLabel: 'Đi tới Thư viện Đề thi',
        targetAnchor: '#exams',
      },
      {
        number: 'Bước 3',
        title: 'Tải đề thi PDF về ôn tập & kiểm tra lịch nhắc 10 phút',
        instruction:
          'Bấm "Tải / In đề PDF" để lưu đề có sẵn dấu bản quyền Nhân Trí về ôn tập trên giấy; bật chuông nhắc trước giờ học 10 phút để luôn đúng giờ.',
        example: 'Kết quả luyện đề được tự động ghi nhận vào Học bạ Online cho ba mẹ và thầy cô cùng xem.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Phóng to/thu nhỏ linh hoạt không che đề bài',
        detail: 'Dùng nút thu gọn, kéo giãn hoặc mở rộng độc lập Bảng vẽ và Máy tính để tận dụng tối đa màn hình máy tính bảng hoặc laptop.',
      },
      {
        title: 'Trùng lịch Thể dục trên trường thì học bù lúc nào?',
        detail: 'Lịch bù buổi tối đã được hiển thị riêng ngay trong Thời khóa biểu cá nhân — em chỉ cần kiểm tra ca tối tương ứng.',
      },
    ],
    keywords: ['học sinh', 'mã học sinh', 'đề thi', 'casio', 'vinacal', 'bảng thông minh', 'qr'],
  },

  PARENT: {
    id: 'fe-parent',
    badge: 'Cổng Phụ huynh',
    title: 'Theo dõi TKB đồ họa theo môn, Học bạ Online, Điểm danh & Học phí VietQR',
    subtitle:
      'Dành cho Quý Phụ huynh nắm trọn tình hình học tập của một hoặc nhiều con (anh em ruột) trên cùng một màn hình trực quan.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Đăng nhập 1 lần → Xem lịch học màu trực quan của các con, điểm số mới nhất và đóng học phí nhanh qua VietQR.',
    layer1Flow: [
      {
        step: '01',
        title: 'Xác thực bằng SĐT hoặc Gmail',
        summary: 'Đăng nhập bằng SĐT đã đăng ký (kèm mã PIN/mã học sinh) hoặc tài khoản Gmail.',
        tip: 'Gia đình có nhiều con sẽ tự động gộp chung vào cùng một tài khoản Phụ huynh.',
        targetAnchor: '#parent-portal',
      },
      {
        step: '02',
        title: 'Xem TKB Đồ họa & Danh sách',
        summary: 'Mặc định hiển thị dạng bảng đồ họa phân màu theo môn học và làm nổi bật ca hôm nay.',
        tip: 'Có thể chuyển sang chế độ danh sách hoặc tải/in file PDF lịch tuần của con.',
        targetAnchor: '#parent-portal',
      },
      {
        step: '03',
        title: 'Kiểm tra Điểm danh & Học bạ AI',
        summary: 'Xem con đã đến lớp đúng giờ chưa, điểm kiểm tra 15p/1 tiết/thi thử và nhận xét từ thầy cô.',
        tip: 'Bấm "Gửi báo cáo Zalo" để chia sẻ nhanh kết quả học tập trong nhóm gia đình.',
        targetAnchor: '#parent-portal',
      },
      {
        step: '04',
        title: 'Tra cứu Học phí & Quét VietQR',
        summary: 'Xem rõ học phí gốc, bán trú, đưa rước, chiết khấu anh em ruột/12 tháng và in phiếu thu PDF.',
        tip: 'Mã VietQR điền sẵn số tiền và nội dung chuyển khoản chuẩn giúp đối soát tự động.',
        targetAnchor: '#parent-portal',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Chuyển sang chế độ "Phụ huynh" và đăng nhập',
        instruction:
          'Bấm nút "Phụ huynh" trên thanh chế độ, nhập SĐT Zalo phụ huynh cùng mã xác thực (hoặc đăng nhập Gmail). Nếu có từ 2 con trở lên, chọn tên từng con ở thanh chuyển nhanh.',
        example: 'Ví dụ: Phụ huynh có 2 bé (lớp 7A1 và lớp 4) chỉ cần 1 tài khoản để xem lịch cả 2 bé.',
        ctaLabel: 'Mở Cổng Phụ huynh',
        targetAnchor: '#parent-portal',
      },
      {
        number: 'Bước 2',
        title: 'Sử dụng 2 chế độ xem Thời khóa biểu & đồng bộ Lịch điện thoại',
        instruction:
          'Mặc định TKB hiển thị dạng bảng màu trực quan theo ca Sáng/Chiều/Tối (nổi bật cột hôm nay). Bấm nút chuyển đổi nếu muốn xem dạng danh sách, hoặc bấm "Tải PDF / Lịch .ICS" để lưu vào điện thoại.',
        example: 'Mỗi môn học (Toán, Anh, Văn, Lý, Hóa, Trả bài) có màu riêng giúp nhìn lướt là biết ngay lịch trong tuần.',
      },
      {
        number: 'Bước 3',
        title: 'Quét mã QR học sinh khi cần tra cứu nhanh trên điện thoại',
        instruction:
          'Quét mã QR trên thẻ học sinh của con và nhập mã PIN 4 số để xem nhanh lịch học, học phí và thông báo nghỉ buổi đột xuất (nếu có).',
        example: 'Tài liệu Học bạ, TKB và Phiếu học phí tải về đều gắn Logo & Watermark chính thức của Trung Tâm Nhân Trí.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Bật nhắc lịch trước giờ học 10 phút',
        detail: 'Bấm biểu tượng chuông nhắc lịch để chọn kênh nhận thông báo (Trình duyệt / Zalo / Email) trước mỗi ca học 10 phút.',
      },
      {
        title: 'Nhận thông báo sớm khi giáo viên báo nghỉ đột xuất',
        detail: 'Khi giáo viên xin nghỉ và trung tâm không bố trí kịp người thay, thông báo tạm nghỉ buổi sẽ hiển thị ngay trên chuông ứng dụng và gửi qua Zalo/Email để phụ huynh khỏi đưa con đi mất công.',
      },
    ],
    keywords: ['phụ huynh', 'thời khóa biểu', 'đồ họa', 'học bạ', 'học phí', 'vietqr', 'anh em ruột', 'điểm danh'],
  },

  TEACHER: {
    id: 'fe-teacher',
    badge: 'Giáo viên Bộ môn & Giáo viên Trả bài',
    title: 'Chủ động lịch lên lớp, bật chuông báo đổi TKB, tự chuẩn hóa hồ sơ & xin nghỉ ca',
    subtitle:
      'Cẩm nang dành riêng cho cả Giáo viên Bộ môn và Giáo viên Trả bài: nhận lịch mới nhất, tải ảnh PNG/PDF về điện thoại, cập nhật lịch rảnh/bận và báo nghỉ kịp thời.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Đăng nhập là thấy ngay lịch mới nhất & mốc giờ cập nhật → Không lo trễ giờ hay lỡ thay đổi TKB.',
    layer1Flow: [
      {
        step: '01',
        title: 'Xem TKB cá nhân & Mốc cập nhật',
        summary: 'Mở mục "Không gian Giáo viên" để thấy rõ giờ cập nhật mới nhất và toàn bộ ca dạy / ca trả bài trong tuần.',
        tip: 'Bấm "Tải ảnh PNG" để lưu lịch sắc nét vào thư viện ảnh điện thoại xem ngoại tuyến.',
      },
      {
        step: '02',
        title: 'Bật Chuông báo thay đổi TKB',
        summary: 'Khi Admin đổi phòng, đổi ca hoặc gán dạy thay, chuông báo sẽ kêu nhẹ và hiện bảng so sánh Cũ → Mới.',
        tip: 'Sau khi nắm rõ thay đổi, bấm "Đã xem & xác nhận lịch mới" để xóa cảnh báo.',
      },
      {
        step: '03',
        title: 'Tự chuẩn hóa hồ sơ cá nhân',
        summary: 'Phát hiện Admin nhập sai tên, SĐT, Email, học vị hoặc môn dạy? Tự sửa ngay và hệ thống tự ghi log Cũ → Mới báo Admin.',
        tip: 'Tên hiển thị mới tự đồng bộ sang Thời khóa biểu mà không gây lệch dữ liệu.',
      },
      {
        step: '04',
        title: 'Cập nhật Ca rảnh/bận & Xin nghỉ ca',
        summary: 'Đánh dấu ca rảnh/bận theo tuần hoặc gửi đơn xin nghỉ ca có lý do để Admin kịp xếp người thay hoặc báo sớm cho phụ huynh.',
        tip: 'Áp dụng đồng nhất cho cả Giáo viên Bộ môn và Giáo viên Trả bài.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Lưu lịch tuần về điện thoại hoặc chia sẻ Zalo/Email',
        instruction:
          'Sau khi đăng nhập tài khoản Giáo viên, mở mục "Lịch lên lớp của tôi". Bấm "Tải ảnh PNG cho điện thoại", "In / Lưu PDF" hoặc "Chia sẻ Zalo / Email" ngay phía trên bảng lịch.',
        example: 'Ảnh PNG 2x hiển thị rõ từng ca Sáng–Chiều–Tối, lớp, phòng và giờ cập nhật mới nhất.',
      },
      {
        number: 'Bước 2',
        title: 'Bật Chuông báo và kiểm tra bảng đối chiếu Cũ → Mới',
        instruction:
          'Bật công tắc "Chuông báo thay đổi TKB" (và cho phép thông báo trình duyệt). Mỗi khi lịch có thay đổi liên quan đến thầy/cô, khung cảnh báo sẽ liệt kê chi tiết trước và sau khi đổi.',
        example: 'Ví dụ: "T4 Chiều Ca 1 · Lớp 7A1: Phòng 2 → Phòng 4" → Bấm "Đã xem" sau khi ghi nhận.',
      },
      {
        number: 'Bước 3',
        title: 'Gửi đơn xin nghỉ ca trực tiếp ngay trên ô lịch',
        instruction:
          'Nếu đã nhận lịch nhưng có việc đột xuất cần nghỉ một ca, bấm nút "Xin nghỉ ca này" ngay trên ô lịch đó (hoặc sang tab "Đơn xin nghỉ"), nhập lý do ngắn gọn và gửi.',
        example: 'Admin nhận cảnh báo tức thì kèm danh sách GV dạy thay đang rảnh hoặc nút báo sớm cho phụ huynh nghỉ buổi.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Quản lý ma trận Ca rảnh / Ca bận trước khi Admin xếp lịch tuần mới',
        detail: 'Trong tab "Lịch rảnh / Bận", bấm 1 chạm từng ô Sáng/Chiều/Tối để khóa các ca bận cố định. Nếu đánh dấu Bận vào ca đang có lớp, hệ thống sẽ cảnh báo và nhắc gửi đơn xin nghỉ.',
      },
      {
        title: 'Giáo viên Trả bài (Tutor Review) dùng chung quy trình chuẩn',
        detail: 'Giáo viên Trả bài vẫn có đầy đủ lịch ca trả bài riêng, tự sửa thông tin cá nhân, bật chuông báo, tải ảnh lịch và xin nghỉ ca để Admin điều phối người trả bài thay.',
      },
    ],
    keywords: ['giáo viên', 'trả bài', 'chuông báo', 'tải ảnh', 'png', 'pdf', 'zalo', 'email', 'xin nghỉ', 'ca rảnh', 'hồ sơ'],
  },
};

export function mapFrontendModeToManualPersona(
  mode: FrontendMode,
  userRole?: string,
): FrontendManualPersona {
  if (userRole === 'TEACHER') return 'TEACHER';
  if (userRole === 'PARENT' || mode === 'PARENT') return 'PARENT';
  if (userRole === 'STUDENT') return 'STUDENT';
  if (mode === 'TEACHER_STUDENT') return 'STUDENT';
  return 'NEW_CUSTOMER';
}

// ============================================================
// 2. BACKEND ADMIN ZPD MANUALS (ALL 10 TABS + CROSS-CUTTING FLOWS)
// ============================================================

export const BACKEND_ZPD_MANUALS: Record<string, ZpdManualChapter> = {
  overview: {
    id: 'overview',
    badge: 'Nhóm 1 · Điều hành & Học vụ',
    title: 'Tổng quan & Phân tích Điều hành',
    subtitle: 'Bức tranh toàn cảnh sĩ số, doanh thu, đơn nghỉ phép giáo viên và điểm nóng cần xử lý ngay trong ngày.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Mở trang mỗi sáng → Trong 30 giây biết ngay ca nào sắp vào lớp, GV nào xin nghỉ và khoản công nợ nào đến hạn.',
    layer1Flow: [
      {
        step: '01',
        title: 'Đọc 4 chỉ số vận hành cốt lõi',
        summary: 'Theo dõi tổng học sinh đang học, tổng ca tuần, tỷ lệ chuyên cần và doanh thu đã thu/công nợ.',
        tip: 'Mọi số liệu tự động tổng hợp từ dữ liệu thật theo thời gian thực.',
      },
      {
        step: '02',
        title: 'Kiểm tra lịch sắp vào ca & cảnh báo',
        summary: 'Xem nhanh danh sách ca học sắp diễn ra và các đơn xin nghỉ chờ duyệt.',
        tip: 'Bấm trực tiếp vào lớp để nhảy sang Điểm danh hoặc Thời khóa biểu.',
        targetTab: 'timetable',
      },
      {
        step: '03',
        title: 'Điều phối bằng 1 bấm sang đúng phân hệ',
        summary: 'Từ các thẻ cảnh báo, nhảy thẳng sang Xử lý đơn nghỉ, Nhập điểm AI hoặc Nhắc học phí.',
        tip: 'Không cần nhớ đường dẫn thủ công.',
        targetTab: 'students',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Rà soát thanh "Hôm nay học phòng nào" và thông báo chuông',
        instruction: 'Kiểm tra biểu tượng Chuông góc trên phải để phát hiện ngay đơn xin nghỉ của GV hoặc log GV vừa tự chỉnh sửa thông tin cá nhân.',
        example: 'Ví dụ: Thấy thông báo "Cô Thảo báo nghỉ T4 Chiều Ca 1" → bấm sang phân hệ Thời khóa biểu để xử lý trong 10 giây.',
        ctaLabel: 'Mở Thời khóa biểu',
        targetTab: 'timetable',
      },
      {
        number: 'Bước 2',
        title: 'Bấm điểm danh nhanh từ ca sắp học',
        instruction: 'Chọn nút "Điểm danh lớp này" để hệ thống tự lọc đúng danh sách học sinh của ca đó.',
        example: 'Tiết kiệm thời gian lọc lớp thủ công cho giáo vụ đầu giờ.',
        ctaLabel: 'Mở Quản lý Học sinh',
        targetTab: 'students',
      },
      {
        number: 'Bước 3',
        title: 'Kiểm tra phiên làm việc an toàn',
        instruction: 'Nếu phiên đăng nhập hết hạn do máy chủ khởi động lại, hệ thống tự gia hạn ngầm hoặc hiện nút "Đăng nhập lại ngay" tại chỗ mà không làm mất dữ liệu đang gõ.',
        example: 'Bạn hoàn toàn yên tâm khi đang nhập danh sách dài hoặc biên soạn mẫu in.',
      },
    ],
    layer3Mastery: [
      {
        title: '4 nhóm menu trái đi theo đúng trình tự nghiệp vụ',
        detail: 'Điều hành (Tổng quan, TKB) → Hồ sơ (Giáo viên, Học sinh) → Đào tạo (Học bạ AI, Đề chuẩn) → Tài chính & Hệ thống (Học phí, Truyền thông, Cấu hình CMS, Hỗ trợ).',
      },
      {
        title: 'Sử dụng Ngăn kéo Xem/Sửa nhanh bên phải trên mọi bảng',
        detail: 'Bấm vào tên bất kỳ Giáo viên hoặc Học sinh nào để sửa nhanh, xem lịch liên quan và chuyển tab tự lọc chỉ với 1 chạm.',
      },
    ],
    keywords: ['tổng quan', 'dashboard', 'menu', 'điều hành', 'bắt đầu', 'phiên đăng nhập'],
  },

  'teacher-portal': {
    id: 'teacher-portal',
    badge: 'Không gian Giáo viên (Bộ môn & Trả bài)',
    title: 'Tự phục vụ Lịch lên lớp, Chuông báo TKB, Hồ sơ & Xin nghỉ ca',
    subtitle: 'Trung tâm tác nghiệp dành riêng cho Giáo viên Bộ môn và Giáo viên Trả bài ngay sau khi đăng nhập.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Nắm ngay lịch mới nhất + mốc cập nhật → Xuất ảnh/PDF/Zalo → Chủ động báo rảnh/bận & xin nghỉ ca.',
    layer1Flow: [
      {
        step: '01',
        title: 'Xem TKB cá nhân & Chuông báo',
        summary: 'Theo dõi mốc giờ cập nhật mới nhất và đối chiếu bảng Cũ → Mới mỗi khi Admin đổi lịch.',
        tip: 'Bấm "Đã xem" sau khi xác nhận thay đổi để giữ bảng gọn gàng.',
      },
      {
        step: '02',
        title: 'Xuất Ảnh PNG / PDF / Chia sẻ Zalo & Email',
        summary: 'Tải ảnh PNG sắc nét lưu trực tiếp vào điện thoại hoặc gửi lịch vào Zalo cá nhân.',
        tip: 'Tài liệu PDF luôn gắn Logo & Watermark chính thức của Trung Tâm Nhân Trí.',
      },
      {
        step: '03',
        title: 'Tự chuẩn hóa Hồ sơ cá nhân',
        summary: 'Sửa ngay SĐT, Email, Họ tên, Học vị, Môn dạy nếu Admin nhập nhầm — hệ thống tự ghi log Cũ → Mới báo Admin.',
        tip: 'Không phải chờ Admin mở khóa cho các lỗi chính tả cơ bản.',
      },
      {
        step: '04',
        title: 'Lịch rảnh/bận & Đơn xin nghỉ ca',
        summary: 'Cập nhật ma trận ca rảnh/bận trong tuần hoặc gửi đơn xin nghỉ ca có lý do để Admin bố trí người thay.',
        tip: 'Admin sẽ nhận gợi ý GV dạy thay ngay lập tức hoặc báo sớm cho phụ huynh.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Bật Chuông báo thay đổi TKB ở góc trên',
        instruction: 'Bật công tắc Chuông báo và chấp nhận quyền Thông báo trình duyệt để nghe tiếng chuông nhẹ mỗi khi TKB thay đổi ảnh hưởng tới ca của mình.',
        example: 'Nếu Admin đổi phòng từ P2 sang P4, bảng đối chiếu Cũ → Mới sẽ nổi lên ngay đầu trang.',
      },
      {
        number: 'Bước 2',
        title: 'Tải ảnh PNG về điện thoại để xem mọi lúc',
        instruction: 'Bấm nút "Tải ảnh PNG" để tải ảnh lịch tuần 2x Retina về máy, hoặc bấm "Chia sẻ Zalo / Email" để gửi nhanh cho bản thân.',
        example: 'Rất tiện cho giáo viên xem nhanh phòng dạy ngay cả khi không có mạng.',
      },
      {
        number: 'Bước 3',
        title: 'Xin nghỉ đột xuất 1 ca ngay từ ô lịch',
        instruction: 'Bấm nút "Xin nghỉ ca này" trên ô lịch tương ứng, ghi lý do ngắn gọn (VD: "Bận coi thi trên trường") và bấm Gửi đơn.',
        example: 'Hệ thống tự tính số lớp ảnh hưởng và gửi thông báo khẩn cho Ban Quản lý xử lý ngay.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Giữ đồng bộ giữa Lịch rảnh/bận và Đơn xin nghỉ',
        detail: 'Ma trận Rảnh/Bận dùng để báo khung giờ cố định hàng tuần cho Admin khi xếp lịch; còn khi đã có ca xếp sẵn nhưng bận đột xuất, hãy dùng "Đơn xin nghỉ ca" để trung tâm xử lý dạy thay.',
      },
    ],
    keywords: ['giáo viên', 'trả bài', 'chuông báo', 'xin nghỉ', 'tải ảnh', 'png', 'hồ sơ', 'ca rảnh'],
  },

  timetable: {
    id: 'timetable',
    badge: 'Nhóm 1 · Điều hành & Học vụ',
    title: 'Quản trị Thời khóa biểu, Động cơ 5 lớp chống trùng & Xử lý Đơn nghỉ phép',
    subtitle: 'Trái tim điều phối phòng học, giáo viên bộ môn/trả bài, nhập TKB bằng Excel/Ảnh AI, xuất PDF cá nhân hóa và xử lý dạy thay.',
    readMinutes: '3 phút đọc',
    zpdPromise: 'Xếp lịch không bao giờ trùng phòng/trùng GV → Xử lý đơn xin nghỉ GV bằng 1 chạm (Gán người thay hoặc Báo PH nghỉ buổi).',
    layer1Flow: [
      {
        step: '01',
        title: 'Nhập / Xếp ca qua Động cơ 5 lớp',
        summary: 'Tự kiểm tra trùng GV (tối đa 1 lớp/ca), trùng Phòng, lịch bận GV, đơn nghỉ phép và sức chứa phòng.',
        tip: 'Chặn đứng lỗi xếp trùng trước khi lưu và tự gợi ý phòng còn trống.',
      },
      {
        step: '02',
        title: 'Nhập thông minh Excel / Ảnh / PDF',
        summary: 'Tải lên file Excel hoặc chụp ảnh TKB giấy — AI tự ánh xạ về đúng trường CSDL và mặc định chế độ Cập nhật/Ghi đè ca trùng.',
        tip: 'Giữ nguyên các ca khác không bị ảnh hưởng.',
      },
      {
        step: '03',
        title: 'Xử lý Đơn xin nghỉ GV (2 phương án)',
        summary: 'Xem ngay danh sách GV dạy thay gợi ý theo môn & lịch rảnh, HOẶC bấm duyệt nghỉ kèm tạo tin Zalo/Email báo sớm cho Phụ huynh.',
        tip: 'Mọi thay đổi TKB tự bật Chuông báo và tạo bảng Cũ → Mới cho giáo viên liên quan.',
      },
      {
        step: '04',
        title: 'Xuất PDF cá nhân hóa hàng loạt',
        summary: 'Tách TKB gốc thành PDF riêng cho từng GV, từng Học sinh, hoặc gộp chung anh em ruột vào 1 file PDF.',
        tip: 'Tự động chèn Logo & Watermark Trung Tâm Nhân Trí.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Xử lý nhanh Đơn xin nghỉ của Giáo viên',
        instruction:
          'Mở tab "Lịch rảnh & Báo nghỉ" trong Thời khóa biểu. Tại đơn đang chờ duyệt, bấm "Phương án xử lý" để xem Top GV gợi ý dạy thay (có điểm phù hợp và 0 xung đột).',
        example: 'Bấm "Gán dạy thay" nếu có GV rảnh, hoặc bấm "Báo PH nghỉ buổi" để tạo ngay tin nhắn Zalo/Email gửi phụ huynh lớp đó.',
      },
      {
        number: 'Bước 2',
        title: 'Nhập TKB từ file Excel hoặc chụp ảnh bảng lịch',
        instruction:
          'Bấm "Nhập TKB Thông minh", chọn file Excel/Ảnh/PDF, kiểm tra bảng ánh xạ cột tự động và giữ chế độ mặc định "Cập nhật/Ghi đè ca trùng".',
        example: 'Mọi ca mới thêm hoặc sửa sẽ tự động cập nhật dấu mốc thời gian cho giáo viên.',
      },
      {
        number: 'Bước 3',
        title: 'Bấm vào tên GV hoặc Lớp ngay trên ô lịch để liên kết chéo',
        instruction:
          'Bấm trực tiếp vào tên Giáo viên để mở Ngăn kéo xem/sửa nhanh bên phải, hoặc nhảy sang danh sách Học sinh lớp đó.',
        example: 'Đổi tên phòng học ở danh mục Phòng sẽ tự đồng bộ lan truyền toàn bộ TKB.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Nguyên tắc 5 lớp ràng buộc cứng',
        detail: '(1) 1 GV tối đa 1 lớp/ca cho cả GV Bộ môn & GV Trả bài; (2) 1 Phòng tối đa 1 lớp/ca; (3) Cảnh báo nếu GV đăng ký bận; (4) Cảnh báo nếu GV có đơn nghỉ phép; (5) Kiểm tra sĩ số lớp vượt sức chứa phòng.',
      },
      {
        title: 'Mỗi thao tác sửa TKB tự ghi phiên bản lịch',
        detail: 'Mỗi lần thêm, sửa, đổi ca hoặc gán dạy thay, hệ thống tự tăng phiên bản TKB và gửi thông báo kèm bảng đối chiếu Cũ → Mới tới giáo viên bị ảnh hưởng.',
      },
    ],
    keywords: ['thời khóa biểu', 'tkb', 'phòng học', 'trùng lịch', 'dạy thay', 'xin nghỉ', 'xuất pdf', 'nhập excel'],
  },

  teachers: {
    id: 'teachers',
    badge: 'Nhóm 2 · Hồ sơ Nhân sự & Học viên',
    title: 'Quản lý Giáo viên (Bộ môn & Trả bài) & Xưởng Mẫu in Nhân sự',
    subtitle: 'Danh bạ tập trung phân tách rõ Giáo viên Bộ môn và Giáo viên Trả bài, lọc đa chiều, nhập hàng loạt, in mẫu chuẩn trung tâm và theo dõi log GV tự sửa hồ sơ.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Quản lý toàn bộ đội ngũ chỉ trên 1 màn hình → Sửa 1 nơi đồng bộ toàn TKB → In danh sách tùy biến trong 15 giây.',
    layer1Flow: [
      {
        step: '01',
        title: 'Phân tách 2 nhóm công tác rõ ràng',
        summary: 'Tách biệt Giáo viên Bộ môn (SUBJECT) và Giáo viên Trả bài (TUTOR_REVIEW) cùng số ca đang dạy thực tế.',
        tip: 'Lọc nhanh theo nhóm, môn phụ trách, trạng thái hoặc từ khóa tên/SĐT.',
      },
      {
        step: '02',
        title: 'Nhập đơn lẻ hoặc Nhập thông minh (Excel/Ảnh/PDF)',
        summary: 'Thêm từng giáo viên hoặc tải file danh sách để AI bóc tách tự động và chuẩn hóa SĐT/Email.',
        tip: 'Ngăn kéo sửa nhanh bên phải đồng bộ tên mới sang toàn bộ TKB & lớp chủ nhiệm.',
      },
      {
        step: '03',
        title: 'In Danh sách chuẩn Trung tâm',
        summary: 'Mở Xưởng Mẫu in với 3 mẫu chuẩn (Đơn giản, Đầy đủ, Tùy biến), chọn cột, gom nhóm, thêm cột ký tên và lưu mẫu dùng chung.',
        tip: 'Có sẵn Logo & Watermark Nhân Trí và chọn khổ A4 Dọc/Ngang.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Lọc và bấm nhanh vào hồ sơ giáo viên để sửa',
        instruction: 'Dùng thanh lọc trên cùng để lọc riêng "GV Bộ môn" hoặc "GV Trả bài". Bấm "Sửa nhanh" để mở Ngăn kéo bên phải mà không rời khỏi danh sách.',
        example: 'Khi đổi tên hiển thị của thầy/cô, hệ thống tự cập nhật đồng bộ toàn bộ ô TKB liên quan.',
      },
      {
        number: 'Bước 2',
        title: 'Tùy biến & Lưu Mẫu in Danh sách Giáo viên',
        instruction: 'Bấm nút "In danh sách tùy biến", chọn mẫu "Đơn giản" hoặc "Đầy đủ", tick bật/tắt các khối (Header Logo, Watermark, Cột trống ký nhận) rồi bấm "Lưu mẫu mới" để dùng chung toàn trung tâm.',
        example: 'Ví dụ: Tạo mẫu "Bảng chấm công & ký nhận lịch tuần" có thêm 2 cột trống ký tên.',
      },
      {
        number: 'Bước 3',
        title: 'Liên kết chéo sang Lịch dạy và Danh sách lớp chủ nhiệm',
        instruction: 'Bấm biểu tượng Lịch hoặc Học sinh ngay trên dòng giáo viên để chuyển tab tự lọc đúng giáo viên đó.',
        example: 'Kiểm tra ngay tải giảng dạy tuần của từng thầy cô trước khi phân thêm lớp mới.',
        targetTab: 'timetable',
      },
    ],
    layer3Mastery: [
      {
        title: 'Theo dõi nhật ký khi giáo viên tự chỉnh sửa thông tin',
        detail: 'Khi giáo viên tự sửa SĐT, Email hoặc bằng cấp từ Cổng Giáo viên, hệ thống cập nhật ngay và gửi log chi tiết Cũ → Mới vào Chuông thông báo & Nhật ký hệ thống để Admin kiểm soát.',
      },
    ],
    keywords: ['giáo viên', 'trả bài', 'nhân sự', 'mẫu in', 'in danh sách', 'nhập excel', 'sửa nhanh'],
  },

  students: {
    id: 'students',
    badge: 'Nhóm 2 · Hồ sơ Nhân sự & Học viên',
    title: 'Quản lý Học sinh, Mã NT26, Thẻ QR Động, Điểm danh & Mẫu in Lớp',
    subtitle: 'Quản lý trọn vòng đời học sinh: sinh mã thông minh NT26-Lớp-STT, nhập đa chiều Excel/Ảnh/PDF, quét QR điểm danh 1 chạm và in danh sách lớp tùy biến.',
    readMinutes: '3 phút đọc',
    zpdPromise: 'Nhập 50 học sinh trong 1 phút → Tự sinh mã chuẩn + Thẻ QR động → Điểm danh & in danh sách lớp siêu tốc.',
    layer1Flow: [
      {
        step: '01',
        title: 'Nhập học sinh đa chiều & Tự sinh mã NT26',
        summary: 'Thêm lẻ hoặc dùng Nhập thông minh (Excel/Chụp ảnh/PDF); tự động cấp mã NT26-7A1-001 không bao giờ trùng.',
        tip: 'Tự động gom anh chị em cùng SĐT phụ huynh vào cùng Hồ sơ Gia đình.',
      },
      {
        step: '02',
        title: 'Thẻ QR Động & Quét điểm danh camera',
        summary: 'Mỗi học sinh có QR riêng (mở xem nhanh có mã PIN cho phụ huynh, hoặc GV quét điểm danh 1 chạm).',
        tip: 'Hỗ trợ in hàng loạt bộ Thẻ QR cả lớp trên khổ A4.',
      },
      {
        step: '03',
        title: 'In danh sách lớp chuẩn Trung tâm',
        summary: 'Lọc theo Khối/Lớp/GV/Bán trú rồi mở Xưởng Mẫu in chọn cột (Đơn giản, Đầy đủ, Điểm danh có cột trống).',
        tip: 'Mẫu lưu xuống CSDL để mọi nhân viên học vụ dùng chung.',
      },
      {
        step: '04',
        title: 'Liên kết chéo 1 chạm sang Học bạ, TKB & Học phí',
        summary: 'Bấm vào tên học sinh mở Ngăn kéo xem/sửa nhanh hoặc nhảy thẳng sang Điểm số / Hóa đơn của em đó.',
        tip: 'Mọi dữ liệu đều liên kết qua mã khóa ngoại chuẩn.',
        targetTab: 'scores',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Nhập danh sách lớp mới bằng Excel hoặc chụp ảnh giấy',
        instruction: 'Bấm "Nhập thông minh (Excel/Ảnh/PDF)", tải file danh sách lớp lên để hệ thống tự khớp cột Họ tên, Lớp, Trường, SĐT phụ huynh và xem trước mã NT26 sẽ cấp.',
        example: 'Có sẵn nút tải File Excel mẫu chuẩn của Trung tâm để điền nhanh.',
      },
      {
        number: 'Bước 2',
        title: 'Điểm danh đầu giờ bằng Quét QR hoặc bấm nhanh',
        instruction: 'Chọn ca điểm danh, bấm "Quét QR Điểm danh" để đưa thẻ học sinh trước camera điện thoại/laptop, hoặc bấm trực tiếp trạng thái Có mặt / Trễ / Nghỉ phép / Bù tối.',
        example: 'Trạng thái chuyên cần cập nhật tức thì lên Cổng Phụ huynh.',
      },
      {
        number: 'Bước 3',
        title: 'In danh sách lớp có cột ký tên / điểm danh',
        instruction: 'Lọc đúng lớp cần in (VD: Lớp 7A1) → bấm "In danh sách tùy biến" → chọn mẫu "Đơn giản" và thêm 2–4 cột trống (VD: Buổi 1, Buổi 2, Ghi chú) rồi in A4.',
        example: 'Bạn có thể lưu cấu hình này thành mẫu riêng "Bảng điểm danh giấy A4" để tái sử dụng.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Bảo mật Thẻ QR Động khi làm mất thẻ',
        detail: 'Trong hộp thoại Thẻ QR của học sinh, Admin có nút "Cấp lại mã QR mới" để vô hiệu hóa ngay mã QR cũ bị thất lạc.',
      },
      {
        title: 'Đổi lớp hoặc đổi GV chủ nhiệm đồng bộ chuẩn',
        detail: 'Sửa lớp/phòng/GV trong Ngăn kéo bên phải sẽ tự động cập nhật cả mã khóa ngoại và hồ sơ gia đình liên quan.',
      },
    ],
    keywords: ['học sinh', 'điểm danh', 'mã học sinh', 'nt26', 'qr', 'mẫu in', 'nhập excel', 'lớp'],
  },

  scores: {
    id: 'scores',
    badge: 'Nhóm 3 · Đào tạo & Chuyên môn',
    title: 'Học bạ Online, Nhập điểm Đa chiều & Chấm bài Quét ảnh AI',
    subtitle: 'Quản lý bảng điểm toàn trung tâm, nhập hàng loạt từ bảng điểm Excel/Ảnh chụp và xuất Học bạ PDF có bản quyền.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Nhập điểm cả lớp trong vài giây → AI tự phân tích điểm mạnh/cần cải thiện → Xuất Học bạ A4 gửi Phụ huynh.',
    layer1Flow: [
      {
        step: '01',
        title: 'Nhập điểm 3 kênh thông minh',
        summary: 'Nhập tay từng bài, nhập hàng loạt từ file Excel/Ảnh chụp bảng điểm, hoặc chụp trực tiếp tờ bài kiểm tra cho AI đọc điểm.',
        tip: 'Hệ thống tự ghép tên/mã học sinh với hồ sơ đang học.',
      },
      {
        step: '02',
        title: 'Xác thực & Nhận xét học thuật',
        summary: 'Giáo viên duyệt xác thực điểm học sinh tự nhập và bổ sung nhận xét cá nhân hóa.',
        tip: 'Học sinh & Phụ huynh nhìn thấy biểu đồ tiến bộ ngay lập tức.',
      },
      {
        step: '03',
        title: 'Xuất Học bạ PDF chuẩn Nhân Trí',
        summary: 'In hoặc lưu PDF Học bạ tổng hợp gắn Logo & Watermark để họp phụ huynh hoặc gửi Zalo.',
        tip: 'Bấm vào tên học sinh để mở Ngăn kéo kiểm tra nhanh lịch học & học phí liên quan.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Lọc theo học sinh hoặc dùng "Nhập điểm Thông minh"',
        instruction: 'Chọn học sinh cần xem học bạ, hoặc bấm "Nhập điểm Thông minh" để tải lên ảnh chụp sổ điểm / file Excel điểm kiểm tra 15p, 1 tiết, giữa kỳ.',
        example: 'AI tự nhận diện cột Họ tên, Môn, Loại điểm và Điểm số để nhập hàng loạt.',
      },
      {
        number: 'Bước 2',
        title: 'Quét ảnh bài kiểm tra bằng AI',
        instruction: 'Tải lên ảnh bài làm của học sinh để AI tự trích xuất điểm số, điểm mạnh và gợi ý phần kiến thức cần ôn tập.',
        example: 'Giúp giáo viên tiết kiệm thời gian viết nhận xét cá nhân cho từng em.',
      },
      {
        number: 'Bước 3',
        title: 'Xuất Học bạ A4 & gửi phụ huynh',
        instruction: 'Bấm "In / Tải Học bạ PDF" trên hồ sơ học sinh để tải bản in đẹp mắt có sẵn dấu bản quyền trung tâm.',
        example: 'Có thể chuyển nhanh sang Cổng Học phí hoặc Hồ sơ học sinh từ Ngăn kéo phải.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Phân biệt rõ nguồn điểm',
        detail: 'Mỗi con điểm đều ghi rõ nguồn (GV nhập, AI quét, Thi online hay HS tự nhập) và trạng thái Đã xác thực để phụ huynh hoàn toàn tin cậy.',
      },
    ],
    keywords: ['điểm', 'học bạ', 'ai', 'quét bài', 'nhập điểm', 'excel', 'nhận xét'],
  },

  exams: {
    id: 'exams',
    badge: 'Nhóm 3 · Đào tạo & Chuyên môn',
    title: 'Thư viện Đề chuẩn GDPT 2018 & Bảng thông minh + Máy tính',
    subtitle: 'Kho đề luyện tập theo khối 3–12 kèm không gian làm bài đa phương tiện tích hợp bảng viết và 4 dòng máy tính chuẩn Bộ GD&ĐT.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Quản lý kho đề rõ ràng theo Khối/Môn/Độ khó → Học sinh thi thử tự chấm → In đề PDF gắn bản quyền Nhân Trí.',
    layer1Flow: [
      {
        step: '01',
        title: 'Lọc kho đề theo Cấp / Khối / Môn',
        summary: 'Tổ chức đề theo chuẩn GDPT 2018 với mức độ Cơ bản, Khá, Nâng cao và thời lượng làm bài.',
        tip: 'Mọi đề đều có lời giải chi tiết từng câu.',
      },
      {
        step: '02',
        title: 'Môi trường làm bài đa phương tiện',
        summary: 'Tích hợp sẵn Bảng nháp thông minh + 4 dòng máy tính (Casio 580VNX, 880BTG, 570VN+, Vinacal 680EX+).',
        tip: 'Thanh công cụ nổi đi theo khi cuộn và phóng to/thu nhỏ linh hoạt.',
      },
      {
        step: '03',
        title: 'In / Tải đề PDF bản quyền',
        summary: 'Xuất bản in đề thi A4 có Logo và Watermark chìm Trung Tâm Nhân Trí để phát trực tiếp trên lớp.',
        tip: 'Tăng nhận diện thương hiệu trên mọi tài liệu học sinh mang về nhà.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Chọn đề theo khối lớp để xem trước hoặc thi thử',
        instruction: 'Dùng bộ lọc Cấp học / Môn học để chọn bộ đề phù hợp, sau đó bấm "Vào làm bài" để trải nghiệm đúng giao diện học sinh thấy.',
        example: 'Ví dụ: Lọc Toán Lớp 9 — Ôn thi vào lớp 10.',
      },
      {
        number: 'Bước 2',
        title: 'Xuất bản in A4 phát giấy tại lớp',
        instruction: 'Bấm "Tải / In Đề PDF" để mở bản xem trước khổ A4 đã căn lề chuẩn, gắn đầu trang Logo và Watermark chìm.',
        example: 'Bấm "In / Lưu PDF" để lưu file gửi nhóm Zalo lớp hoặc in trực tiếp.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Tự động lưu kết quả thi online vào Học bạ',
        detail: 'Khi học sinh nộp bài, điểm thi trắc nghiệm tự động cộng vào Học bạ Online với nhãn "Thi Online" để giáo viên theo dõi sát tiến độ.',
      },
    ],
    keywords: ['đề thi', 'thư viện đề', 'gdpt 2018', 'casio', 'bảng thông minh', 'in đề'],
  },

  tuition: {
    id: 'tuition',
    badge: 'Nhóm 4 · Tài chính & Hệ thống',
    title: 'Học phí, Ưu đãi Anh em ruột, Gói 12 tháng & Đối soát VietQR',
    subtitle: 'Tự động tính học phí minh bạch, quản lý Hồ sơ Gia đình nhiều con, nhắc công nợ và in Phiếu thu chuẩn Trung tâm.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Không còn tính tay dễ sai chiết khấu → Tự tạo mã VietQR chuẩn → In phiếu thu PDF & theo dõi lãi/lỗ chi phí vận hành.',
    layer1Flow: [
      {
        step: '01',
        title: 'Hồ sơ Gia đình & Công thức tính tự động',
        summary: 'Tự cộng Học phí gốc + Bán trú + Đưa rước rồi trừ chiết khấu Anh em ruột và gói đóng 12 tháng.',
        tip: 'Mọi khoản giảm trừ đều hiển thị rõ từng dòng cho phụ huynh kiểm tra.',
      },
      {
        step: '02',
        title: 'Thanh toán VietQR & Xác nhận thu',
        summary: 'Tạo mã VietQR đúng số tiền + nội dung chuyển khoản; Admin xác nhận đã thu chỉ bằng 1 bấm.',
        tip: 'Hỗ trợ ghi nhận Tiền mặt, VietQR, MoMo, ZaloPay.',
      },
      {
        step: '03',
        title: 'In Phiếu học phí PDF & Chi phí vận hành',
        summary: 'Xuất phiếu báo/phiếu thu A4 có Logo + Watermark Nhân Trí và theo dõi chi phí lương/bán trú/điện nước.',
        tip: 'Chỉ Admin/SuperAdmin mới thấy bảng chi phí vận hành nội bộ.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Lọc công nợ "Sắp đến hạn" hoặc "Quá hạn"',
        instruction: 'Dùng bộ lọc trạng thái học phí để lọc nhanh các khoản cần nhắc trong tháng và bấm "Gửi nhắc học phí" qua Zalo/Ứng dụng.',
        example: 'Hệ thống tự đếm số lần đã nhắc để tránh làm phiền phụ huynh.',
      },
      {
        number: 'Bước 2',
        title: 'Xác nhận thanh toán & In Phiếu thu PDF',
        instruction: 'Khi phụ huynh chuyển khoản xong, bấm "Xác nhận đã thu" rồi bấm "In Phiếu học phí" để gửi bản PDF xác nhận có dấu thương hiệu Nhân Trí.',
        example: 'Bấm vào tên học sinh bất kỳ để mở Ngăn kéo xem gói học & dịch vụ bán trú/đưa rước.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Liên kết tự động anh chị em cùng SĐT phụ huynh',
        detail: 'Nếu nhập thêm em ruột sau này, chạy nút "Tự sửa toàn vẹn dữ liệu" trong Cấu hình CMS để hệ thống tự gom vào cùng Hồ sơ Gia đình hưởng ưu đãi.',
      },
    ],
    keywords: ['học phí', 'công nợ', 'vietqr', 'phiếu thu', 'chiết khấu', 'anh em ruột', '12 tháng'],
  },

  social: {
    id: 'social',
    badge: 'Nhóm 4 · Tài chính & Hệ thống',
    title: 'Truyền thông Đa kênh & Hệ thống Nhắc lịch trước giờ học 10 phút',
    subtitle: 'Đồng bộ bài viết/video từ Facebook, YouTube, TikTok, Zalo lên trang chủ và cấu hình nhắc lịch tự động trước mỗi ca học.',
    readMinutes: '2 phút đọc',
    zpdPromise: 'Cập nhật hoạt động trung tâm sinh động để hút khách mới + Tự động nhắc lịch 10 phút giúp giảm tối đa tình trạng đi trễ.',
    layer1Flow: [
      {
        step: '01',
        title: 'Quản lý 4 kênh mạng xã hội chính thức',
        summary: 'Khai báo link Facebook, YouTube, TikTok, Zalo OA và đồng bộ video mới lên Thư viện hoạt động.',
        tip: 'Bật nút "Nổi bật" để đưa bài quan trọng lên đầu trang khách hàng mới.',
      },
      {
        step: '02',
        title: 'Cấu hình Nhắc lịch trước 10 phút',
        summary: 'Thiết lập thời gian nhắc trước (mặc định 10 phút), mẫu tin nhắn và các kênh Web / Zalo / Email / Facebook.',
        tip: 'Theo dõi lịch sử gửi nhắc ca theo từng khung giờ.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Thêm nhanh bài viết / video hoạt động mới',
        instruction: 'Dán đường dẫn bài viết/video YouTube, TikTok hoặc Facebook và chọn chuyên mục để hiển thị ngay trên trang chủ.',
        example: 'Giúp phụ huynh mới thấy hình ảnh lớp học thực tế ngay khi vào website.',
      },
      {
        number: 'Bước 2',
        title: 'Kiểm tra và gửi thử thông báo nhắc ca học',
        instruction: 'Vào mục Cấu hình Nhắc lịch, tùy chỉnh mẫu nội dung nhắc và bấm chạy thử để kiểm tra luồng gửi thông báo.',
        example: 'Mỗi giáo viên, phụ huynh và học sinh đều có thể tự bật/tắt kênh nhận nhắc phù hợp.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Giữ hình ảnh thương hiệu đồng nhất',
        detail: 'Nên đăng đều 2–3 hoạt động mỗi tuần (hình lớp học, vinh danh điểm cao, mẹo giải đề) để tăng uy tín với khách hàng mới.',
      },
    ],
    keywords: ['truyền thông', 'facebook', 'youtube', 'tiktok', 'zalo', 'nhắc lịch', '10 phút'],
  },

  system: {
    id: 'system',
    badge: 'Nhóm 4 · Tài chính & Hệ thống',
    title: 'Cấu hình CMS, Phân quyền RBAC, Nhật ký Audit & Toàn vẹn Dữ liệu',
    subtitle: 'Trung tâm kiểm soát toàn bộ giao diện trang chủ, danh sách Admin/Vai trò, chính sách đăng nhập và công cụ tự động kiểm tra – sửa lỗi dữ liệu.',
    readMinutes: '3 phút đọc',
    zpdPromise: 'Kiểm soát hoàn toàn nội dung website + Theo dõi log GV sửa hồ sơ + Kiểm tra & sửa lỗi toàn vẹn CSDL chỉ bằng 1 bấm.',
    layer1Flow: [
      {
        step: '01',
        title: 'Sức khỏe & Toàn vẹn Dữ liệu (1-Click Repair)',
        summary: 'Quét tự động khóa ngoại TKB, mã học sinh trùng, thiếu QR động và anh em ruột chưa gộp gia đình.',
        tip: 'Bấm "Tự động chuẩn hóa" để sửa sạch lỗi liên kết trong 1 giây.',
      },
      {
        step: '02',
        title: 'Cấu hình CMS & Sửa trực tiếp trên Trang chủ',
        summary: 'Chỉnh tên trung tâm, hotline, thông báo, chế độ mặc định (Khách hàng mới) và bật sửa trực tiếp 1 chạm.',
        tip: 'Mọi thay đổi đồng bộ ngay lập tức lên cả bản in PDF & Watermark.',
      },
      {
        step: '03',
        title: 'Phân quyền RBAC & Nhật ký Audit',
        summary: 'Quản lý danh sách SuperAdmin, Admin, Manager, Giáo viên và xem chi tiết log mỗi lần giáo viên tự sửa hồ sơ cá nhân.',
        tip: 'Đảm bảo minh bạch 100% ai đã sửa trường dữ liệu nào, lúc mấy giờ.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Chạy Kiểm tra Toàn vẹn Dữ liệu định kỳ mỗi tuần',
        instruction: 'Mở thẻ "Kiểm tra Sức khỏe & Toàn vẹn Dữ liệu" ở đầu trang Cấu hình CMS, bấm "Quét lại". Nếu có cảnh báo, bấm "Tự động sửa ngay".',
        example: 'Tự cấp lại QR động cho học sinh mới nhập, đồng bộ khóa ngoại phòng học/giáo viên và gộp anh em ruột.',
      },
      {
        number: 'Bước 2',
        title: 'Theo dõi Nhật ký Truy cập & Log Giáo viên tự sửa hồ sơ',
        instruction: 'Kéo xuống mục "Nhật ký Truy cập & Chỉnh sửa (Audit Log)" để xem chi tiết từng thay đổi Cũ → Mới do giáo viên hoặc nhân sự thực hiện.',
        example: 'Ví dụ: "GV Nguyễn Văn Minh tự chuẩn hóa: SĐT 0901... → 0909..., Học vị Cử nhân → Thạc sĩ".',
      },
      {
        number: 'Bước 3',
        title: 'Bật Chế độ Sửa trực tiếp Trang chủ (Inline CMS)',
        instruction: 'Bấm "Mở chế độ sửa trực tiếp trên Frontend" để sửa tiêu đề, mô tả khóa học ngay trên giao diện thật của khách hàng.',
        example: 'Phù hợp khi cần cập nhật nhanh thông báo tuyển sinh hoặc ưu đãi đầu năm học.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Phân cấp quản trị an toàn',
        detail: 'SuperAdmin quản trị cao nhất; các Admin (lethituman2021@gmail.com, trungtamnhantri2026@gmail.com) đồng cấp điều hành toàn bộ học vụ, tài chính và CMS; Manager điều phối TKB và danh sách lớp.',
      },
    ],
    keywords: ['cms', 'cấu hình', 'toàn vẹn', 'sửa lỗi', 'audit', 'log', 'phân quyền', 'admin'],
  },

  support: {
    id: 'support',
    badge: 'Nhóm 4 · Tài chính & Hệ thống',
    title: 'Hỗ trợ 24/7, Tiếp nhận Tư vấn & Trạng thái Hạ tầng',
    subtitle: 'Quản lý toàn bộ yêu cầu tư vấn từ khách hàng mới, phản hồi từ phụ huynh/giáo viên và công cụ sao lưu hệ thống.',
    readMinutes: '1 phút đọc',
    zpdPromise: 'Không bỏ sót bất kỳ tin nhắn tư vấn hay yêu cầu đổi lịch nào từ phụ huynh và học sinh.',
    layer1Flow: [
      {
        step: '01',
        title: 'Tiếp nhận Phiếu Tư vấn & Phản hồi',
        summary: 'Gom toàn bộ yêu cầu từ form trang chủ, phản hồi phụ huynh và yêu cầu đổi lịch vào 1 danh sách.',
        tip: 'Phân loại rõ: Tư vấn mới, Đổi lịch, Học phí, Góp ý.',
      },
      {
        step: '02',
        title: 'Phản hồi & Đóng phiếu',
        summary: 'Ghi nội dung phản hồi và chuyển trạng thái Đang xử lý → Đã hoàn tất để theo dõi KPI chăm sóc phụ huynh.',
        tip: 'Phụ huynh nhận lại phản hồi trực tiếp ngay trong ứng dụng.',
      },
    ],
    layer2Steps: [
      {
        number: 'Bước 1',
        title: 'Ưu tiên xử lý phiếu "Đang mở" (OPEN)',
        instruction:
          'Kiểm tra các phiếu tư vấn mới kèm số điện thoại Zalo của phụ huynh để gọi tư vấn kịp thời trong khung giờ vàng.',
        example: 'Ví dụ: Phụ huynh đăng ký học thử lớp 7A1 → gọi xác nhận lịch và ghi chú kết quả vào phiếu.',
      },
      {
        number: 'Bước 2',
        title: 'Phân luồng yêu cầu Đổi lịch / Học phí sang đúng phân hệ',
        instruction:
          'Với phiếu liên quan đổi ca hoặc kiểm tra học phí, chuyển nhanh sang mục Thời khóa biểu hoặc Học phí để đối chiếu dữ liệu trước khi phản hồi.',
        example: 'Ví dụ: Phụ huynh báo con trùng lịch Thể dục → mở TKB xếp ca bù rồi trả lời xác nhận trên phiếu.',
        ctaLabel: 'Mở Thời khóa biểu',
        targetTab: 'timetable',
      },
      {
        number: 'Bước 3',
        title: 'Chuyển trạng thái Đã xử lý để lưu dấu chăm sóc',
        instruction:
          'Sau khi hoàn tất trao đổi với gia đình, bấm cập nhật trạng thái Hoàn tất để danh sách luôn gọn sạch, không trùng lặp công việc giữa các ca trực.',
        example: 'Mỗi cuối ngày kiểm tra mục Đang mở = 0 phiếu tồn đọng.',
      },
    ],
    layer3Mastery: [
      {
        title: 'Quy chuẩn thời gian phản hồi',
        detail:
          'Phản hồi yêu cầu tư vấn khách mới trong vòng 15 phút giờ hành chính giúp tăng tỷ lệ đăng ký học thử lên rõ rệt.',
      },
      {
        title: 'Lưu lại lịch sử giải quyết làm hồ sơ đối chiếu',
        detail:
          'Ghi ngắn gọn ngày giờ đã liên hệ và phương án thống nhất với phụ huynh ngay trong ô phản hồi để bất kỳ quản lý nào mở lại cũng nắm ngay ngữ cảnh.',
      },
    ],
    keywords: ['hỗ trợ', 'tư vấn', 'phiếu', 'phản hồi', 'ticket', 'hạ tầng'],
  },
};

export const BACKEND_MANUAL_ORDER = [
  'overview',
  'teacher-portal',
  'timetable',
  'teachers',
  'students',
  'scores',
  'exams',
  'tuition',
  'social',
  'system',
  'support',
] as const;
