# Trung Tâm Dạy Thêm Học Thêm Nhân Trí — `daythemnhantri.com`

Hệ thống Webapp & Backend CMS Full-Stack cho **Trung Tâm Dạy Thêm Học Thêm Nhân Trí** (*"Trao tri thức – Gửi yêu thương"*), tích hợp **Firebase Auth (Gmail) + Cloud Firestore + Cloudflare Workers**.

## Hướng dẫn Deploy từ GitHub lên Cloudflare Workers (`trungtamdaythemnhantri`)

1. Đẩy toàn bộ mã nguồn này lên kho GitHub của bạn.
2. Vào **Cloudflare Dashboard → Workers & Pages → `trungtamdaythemnhantri` → Settings → Build → Build configuration**:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   *(Lưu ý: `wrangler.jsonc` đã cấu hình sẵn `"name": "trungtamdaythemnhantri"` và `"build": { "command": "npm run build" }` để đảm bảo thư mục `dist` luôn được tạo trước khi upload assets).*
3. Vào **Settings → Variables and Secrets**, thêm các biến bảo mật (Encrypted Secret):
   - `GEMINI_API_KEY`: API key Gemini để chạy AI phân tích ảnh bài kiểm tra, OCR danh sách học sinh và trợ lý tư vấn 24/7.
   - `SESSION_SECRET`: Chuỗi bí mật ngẫu nhiên (32+ ký tự) dùng ký phiên làm việc API.
4. Vào **Settings → Domains & Routes → Add Custom Domain** và gắn tên miền **`daythemnhantri.com`**.
5. Trong **Firebase Console → Authentication → Settings → Authorized domains**, thêm **`daythemnhantri.com`** để đăng nhập Gmail (`duyweb5@gmail.com` — SuperAdmin, `lethituman2021@gmail.com` — Admin) hoạt động trên tên miền chính thức.

## Chạy cục bộ (Local Development)
```bash
npm install
npm run dev
```
Ứng dụng chạy tại `http://localhost:3000`.
