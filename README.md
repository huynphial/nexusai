# Local AI - Nền tảng Quản trị & Chat LLM Nội Bộ

**Local AI** là nền tảng quản trị và khai thác Chat LLM đa mô hình (tương thích OpenAI REST API, DeepSeek, Qwen, Gemini). Hệ thống cung cấp khả năng quản lý người dùng, phân chia 2 nhóm rõ ràng (Admin và Người Dùng), phân quyền mô hình AI và kiểm soát hạn ngạch Token / Rate Limit đa tầng.

Hệ thống được thiết kế tối ưu để **vận hành 100% trong môi trường Offline / Mạng Nội Bộ (Intranet) không có kết nối Internet** (Embedded system fonts, WebAssembly SQLite Database) và có thể đóng gói trọn gói chỉ trong thư mục `dist/` khi triển khai Production.

---

## 🌟 Tính năng Nổi bật

### 1. Cơ chế Stream Chat & Thinking/Reasoning
- **Realtime SSE Streaming**: Phản hồi từng từ (Server-Sent Events) theo thời gian thực giúp giảm độ trễ phản hồi cảm nhận.
- **Thinking / Suy Luận Tự Động**: Bóc tách khối `<think>...</think>` hoặc `reasoning_content` (như trên DeepSeek-R1, Qwen Reasoning) vào một hộp collapsible riêng biệt với hiệu ứng nhịp thở sống động.
- **Thời gian xử lý & Tốc độ Token**: Hiển thị chi tiết thời gian xử lý (latency ms/s), tốc độ tạo từ (`tokens/giây`), và tổng số token đã dùng cho mỗi phản hồi của mô hình.
- **Cấu hình Timeout Max Time**: Mỗi mô hình có thể cấu hình thời gian chờ tối đa (`timeout_seconds`, ví dụ: 60s, 120s, 300s) kèm `AbortController` để tránh lỗi treo API khi xử lý prompt dài.

### 2. Giao diện Lựa chọn Model Tinh giản (Clean Dropdown)
- Bộ chọn Model dành cho người dùng được tối giản thành **menu thả xuống đơn giản**, chỉ hiển thị tên mô hình (không kèm nhãn ChatGPT hay Gemini phức tạp), giúp giao diện thanh lịch và thân thiện với mọi đối tượng.

### 3. Phân quyền 2 Nhóm Tinh gọn: Admin & Người Dùng
- **Nhóm Quản Trị (Admin)**: Toàn quyền truy cập Dashboard Quản Trị, cấu hình Model, hạn ngạch Token, tạo tài khoản và Chat.
- **Nhóm Người Dùng (User)**: Chỉ được phép truy cập giao diện Chat nội bộ và sử dụng các mô hình AI được phân quyền cho nhóm người dùng. Không thể truy cập vào Dashboard.

### 4. Quản lý Khai báo AI Token & System Prompt
- **Khai báo Mô hình AI linh hoạt**: Admin dễ dàng khai báo các Endpoint OpenAI-compatible nội bộ (Ollama, vLLM, LocalAI, TGI, LM Studio, DeepSeek) hoặc Gemini.
- **Tùy chỉnh Endpoint & API Key**: Lưu trữ an toàn các AI Token, Endpoint Base URL, System Prompt mặc định, Stream toggle, Thinking toggle và Timeout.

### 5. Kiểm soát Hạn ngạch & Rate Limit Đa tầng
- **Phân quyền Mô hình AI theo Nhóm**: Người dùng chỉ nhìn thấy và gọi được các mô hình được cấp phép cho nhóm của mình.
- **Kiểm soát Hạn ngạch**:
  - Chu kỳ giới hạn: **Theo Giờ (Hour)**, **Theo Ngày (Day)**, **Theo Tuần (Week)**, **Theo Tháng (Month)**.
  - **Giới hạn số lượt gọi (Requests limit)**.
  - **Hạn ngạch Token cả nhóm (Group Max Tokens)**.
  - **Hạn ngạch Token cá nhân (User Max Tokens)**.
- **Server-side Enforcement**: Tự động kiểm tra và ngăn chặn các truy vấn vượt quá giới hạn ngay tại Backend kèm thông báo giải thích Tiếng Việt rõ ràng.

### 6. Khả năng Chạy Offline 100%
- Không phụ thuộc bất kỳ CDN hoặc external font nào.
- Sử dụng **Embedded System Font Stack** tích hợp sẵn trên hệ điều hành.
- Engine Cơ sở dữ liệu **WebAssembly SQLite (`sql.js`)** độc lập, không phụ thuộc thư viện native GLIBC của hệ thống.

---

## ⚙️ Cấu hình File `.env`

File `.env` quản lý toàn bộ cấu hình hệ thống:

```env
# Mode môi trường (development hoặc production)
NODE_ENV="development"

# Bật log debug chi tiết kết nối API & audit thao tác (true hoặc false)
DEBUG_LOG="true"

# Tài khoản Admin khởi tạo ban đầu duy nhất
DEFAULT_ADMIN_EMAIL="admin@localai.internal"
DEFAULT_ADMIN_PASSWORD="admin123"

# Cấu hình Cơ sở dữ liệu (sqlite)
DB_TYPE="sqlite"
DB_FILE="./data/database.sqlite"

# Cấu hình Cổng Server & Chuỗi bảo mật JWT
PORT=3000
JWT_SECRET="local_ai_secret_key_2026_super_secure"

# Khóa Gemini API tùy chọn (nếu có sử dụng mô hình Gemini)
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

### Giải thích chi tiết các biến:
- `NODE_ENV`: Định rõ chế độ chạy (`development` cho chế độ phát triển Vite HMR / middleware hoặc `production` cho chế độ sản phẩm).
- `DEBUG_LOG`: Khi đặt `DEBUG_LOG="true"`, hệ thống tự động xuất log debug chi tiết từng request/response kết nối tới các LLM API bên dưới (Endpoint, HTTP Status, Payload, Masked Authorization Headers, Latency, Token speed) và in log audit thao tác của người dùng.
- `DEFAULT_ADMIN_EMAIL` & `DEFAULT_ADMIN_PASSWORD`: Thông tin tài khoản Admin ban đầu được tạo tự động khi khởi tạo Database.
- `DB_TYPE` & `DB_FILE`: Loại Database (`sqlite`) và đường dẫn file dữ liệu lưu trữ SQLite (`./data/database.sqlite`).
- `PORT`: Cổng HTTP Server lắng nghe (Mặc định: `3000`).
- `JWT_SECRET`: Chuỗi mã hóa bí mật dùng tạo JWT Token xác thực đăng nhập.

---

## 🚀 Hướng dẫn Cài đặt & Vận hành

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Chạy Môi trường Phát triển (Development)
```bash
npm run dev
```
Truy cập tại: `http://localhost:3000`

### 3. Đóng gói Sản phẩm (Production Build)
```bash
npm run build
```
Lệnh này sẽ thực hiện:
1. `vite build`: Biên dịch và tối ưu toàn bộ giao diện Frontend vào `dist/`.
2. `esbuild`: Đóng gói server Node.js `server.ts` thành `dist/server.js`.
3. Tự động sao chép file `sql-wasm.wasm` vào `dist/`.

### 4. Khởi chạy Production
Chỉ cần thư mục `dist/` và file `.env`, thực thi lệnh:
```bash
npm run start
# Hoặc chạy trực tiếp:
NODE_ENV=production node dist/server.js
```

---

## 🔑 Tài khoản Đăng nhập Mặc định Ban đầu

Sau khi khởi chạy ứng dụng lần đầu, bạn có thể đăng nhập ngay với tài khoản Admin mặc định:

- **Email**: `admin@localai.internal` (hoặc email trong `DEFAULT_ADMIN_EMAIL`)
- **Mật khẩu**: `admin123` (hoặc mật khẩu trong `DEFAULT_ADMIN_PASSWORD`)
- **Vai trò**: Admin (Truy cập Dashboard Quản Trị và Chat)

Người dùng mới đăng ký hoặc được Admin thêm với vai trò User sẽ chỉ truy cập được giao diện Chat.
