# Trung Tâm Dạy Thêm Học Thêm Nhân Trí — CMS & Cổng Học Tập

Hệ thống Webapp Full-Stack cho **Trung Tâm Dạy Thêm Học Thêm Nhân Trí** (*"Trao tri thức – Gửi yêu thương"*), hỗ trợ triển khai trực tiếp từ **GitHub → Cloudflare Workers** (hoặc **Cloudflare Pages**).

## Hướng dẫn Deploy từ GitHub lên Cloudflare

### Cách 1: Cloudflare Workers (Khuyên dùng — đã cấu hình sẵn `wrangler.jsonc`)
1. Đẩy toàn bộ mã nguồn này lên kho GitHub của bạn.
2. Vào **Cloudflare Dashboard → Workers & Pages → Create → Import a repository** và chọn repo GitHub.
3. Cấu hình build:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Vào **Settings → Variables and Secrets** của Worker vừa tạo, thêm các biến bảo mật (Encrypted Secret):
   - `GEMINI_API_KEY`: API key Gemini để kích hoạt AI quét bài kiểm tra, OCR danh sách học sinh và trợ lý tư vấn 24/7.
   - `SESSION_SECRET`: Chuỗi bí mật ngẫu nhiên (32+ ký tự) dùng ký phiên đăng nhập.
   - `ADMIN_PASSCODE`: Mật khẩu đăng nhập vai trò Quản trị viên.
5. *(Tùy chọn lưu trữ lâu dài)* Tạo cơ sở dữ liệu **Cloudflare D1** (`nhantri-db`), gắn Binding tên `DB` trong **Settings → Bindings** và chạy file `schema.sql`. Nếu chưa gắn D1, ứng dụng vẫn chạy mượt ngay lập tức với dữ liệu khởi tạo sẵn.

### Cách 2: Cloudflare Pages (GitHub Integration)
1. Chọn **Workers & Pages → Create → Pages → Connect to Git**.
2. Cấu hình:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Thêm các biến môi trường `GEMINI_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSCODE` trong **Settings → Environment variables** (Production).
4. Thư mục `functions/api/[[path]].ts` sẽ tự động chạy toàn bộ API `/api/v1/*` trên Cloudflare Edge.

## Chạy thử cục bộ (Local Development)
```bash
npm install
npm run dev
```
Ứng dụng chạy tại `http://localhost:3000`.
