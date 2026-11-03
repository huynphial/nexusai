# NexusAI - Nền tảng Quản lý Chat LLM & Enterprise Portal

**NexusAI** là nền tảng quản lý và khai thác Chat LLM đa mô hình (tương thích ChatGPT Open Chat, DeepSeek, Gemini). Hệ thống cung cấp khả năng quản lý người dùng, nhóm người dùng, phân quyền mô hình AI và kiểm soát hạn ngạch Token / Rate Limit đa tầng.

Ứng dụng được thiết kế tối ưu để **vận hành tốt trong môi trường Offline / Nội bộ không có kết nối Internet** (Embedded system fonts, WebAssembly SQLite Database) và có thể đóng gói trọn gói chỉ trong thư mục `dist/` khi triển khai Production.

---

## 🌟 Tính năng Nổi bật

### 1. Quản lý Khai báo AI Token & System Prompt (Admin)
- **Khai báo Mô hình AI linh hoạt**: Admin dễ dàng khai báo các Mô hình ChatGPT OpenAI-compatible (OpenAI, DeepSeek, OpenRouter, Custom REST Proxies) hoặc sử dụng Gemini Server-Side SDK.
- **Tùy chỉnh Endpoint & API Key**: Lưu trữ an toàn các AI Token, Endpoint Base URL và cấu hình System Prompt mặc định cho từng Mô hình.

### 2. Quản lý Nhóm người dùng & Ma trận Rate Limit / Token Quota
- **Phân quyền Mô hình AI theo Nhóm**: Người dùng thuộc nhóm nào sẽ chỉ nhìn thấy và được tương tác với các Mô hình AI được gán cho nhóm đó.
- **Kiểm soát Hạn ngạch Đa tầng**:
  - Tùy chỉnh Chu kỳ giới hạn: **Theo Giờ (Hour)**, **Theo Ngày (Day)**, **Theo Tuần (Week)**, **Theo Tháng (Month)**.
  - Cấu hình **Giới hạn số lượt gọi (Requests limit)**.
  - Cấu hình **Hạn ngạch Token tối đa cho cả nhóm (Group Max Tokens)**.
  - Cấu hình **Hạn ngạch Token tối đa cho từng cá nhân (User Max Tokens)**.
- **Server-side Enforcement**: Tự động kiểm tra và ngăn chặn các truy vấn vượt quá giới hạn ngay tại Backend kèm thông báo giải thích Tiếng Việt rõ ràng.

### 3. Giao diện Chat LLM Thân thiện & Hỗ trợ Markdown
- **Markdown chuẩn hóa**: Hiển thị mượt mà văn bản in đậm, danh sách, trích dẫn, bảng biểu và khối mã lệnh (Code blocks) có cú pháp màu chuẩn.
- **Nút Sao chép 1-Click**: Cho phép sao chép mã lệnh nhanh chóng kèm phản hồi trực quan.
- **Theo dõi Quota Thời gian thực**: Thanh hiển thị dung lượng Token cá nhân và Token cả nhóm ngay trên sidebar chat.
- **Lịch sử cuộc trò chuyện**: Lưu trữ, tìm kiếm, tạo mới và xóa lịch sử trò chuyện.

### 4. Dashboard Thống kê & Giám sát Trực quan
- **Thống kê Tổng quan**: Hiển thị tổng số Người dùng, Nhóm, Mô hình AI Active, Lượt tin nhắn và Tổng Token tiêu thụ hôm nay / trong tháng.
- **Biểu đồ Tiêu thụ (Recharts)**: Biểu đồ cột phân bổ Token theo Mô hình AI và Biểu đồ tròn phân bổ Token theo Nhóm người dùng.
- **Nhật ký Truy vấn (Audit Logs)**: Bảng nhật ký chi tiết các lượt gọi API, người thực hiện, mô hình sử dụng và số Token tiêu thụ.
- **Giám sát Môi trường (.env & DB Status)**: Trang kiểm tra trạng thái cấu hình file `.env` và kết nối Cơ sở dữ liệu.

### 5. Khả năng Chạy Offline 100%
- Không sử dụng bất kỳ CDN hay API font bên ngoài (`fonts.googleapis.com`).
- Sử dụng **Embedded System Font Stack** tích hợp sẵn trên hệ điều hành client.
- Engine Cơ sở dữ liệu **WebAssembly SQLite (`sql.js`)** độc lập, không phụ thuộc thư viện native GLIBC của hệ thống.

---

## ⚙️ Cấu hình File `.env`

File `.env` quản lý toàn bộ cấu hình hệ thống:

```env
# Mode môi trường (development hoặc production)
NODE_ENV="development"

# Bật log debug chi tiết kết nối API & audit thao tác (true hoặc false)
DEBUG_LOG="true"

# Tài khoản Admin khởi tạo ban đầu
DEFAULT_ADMIN_EMAIL="admin@nexusai.io"
DEFAULT_ADMIN_PASSWORD="admin123"

# Cấu hình Cơ sở dữ liệu (sqlite hoặc postgres)
DB_TYPE="sqlite"
DB_FILE="./data/database.sqlite"

# Cấu hình Cổng Server & Chuỗi bảo mật JWT
PORT=3000
JWT_SECRET="nexus_llm_secret_key_2026_super_secure"

# Khóa Gemini API tùy chọn
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

### Giải thích chi tiết các biến:
- `NODE_ENV`: Định rõ chế độ chạy (`development` cho chế độ phát triển Vite HMR / middleware hoặc `production` cho chế độ tối ưu sản phẩm).
- `DEBUG_LOG`: Khi đặt `DEBUG_LOG="true"`, hệ thống tự động xuất log debug chi tiết từng request/response kết nối tới các LLM API bên dưới (Endpoint, HTTP Status, Payload, Masked Authorization Headers, Latency) và in log thao tác của người dùng lên terminal & lưu bảng `audit_logs` trong Database.
- `DEFAULT_ADMIN_EMAIL` & `DEFAULT_ADMIN_PASSWORD`: Thông tin tài khoản Admin duy nhất được khởi tạo tự động lần đầu khi tạo Database.
- `DB_TYPE` & `DB_FILE`: Loại Database (`sqlite`) và đường dẫn file dữ liệu lưu trữ SQLite (`./data/database.sqlite`).
- `PORT`: Cổng HTTP Server lắng nghe (Mặc định: `3000`).
- `JWT_SECRET`: Chuỗi mã hóa bí mật dùng tạo JWT Token xác thực đăng nhập.
- `GEMINI_API_KEY`: API Key mặc định cho các mô hình Gemini tích hợp sẵn.

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

Sau khi khởi chạy ứng dụng lần đầu, bạn có thể đăng nhập ngay với tài khoản Admin mặc định được cấu hình trong `.env`:

- **Email**: `admin@nexusai.io` (hoặc email trong `DEFAULT_ADMIN_EMAIL`)
- **Mật khẩu**: `admin123` (hoặc mật khẩu trong `DEFAULT_ADMIN_PASSWORD`)
- **Quyền**: Administrator (Quyền quản trị tối cao)

> 💡 **Mẹo**: Sau khi đăng nhập, bạn có thể vào **Dashboard Quản Trị -> Quản lý Người dùng** để tạo thêm người dùng, hoặc vào **Quản lý Nhóm & Rate Limit** để cấu hình hạn ngạch Token cho từng phòng ban.

---

## 📂 Cấu trúc Thư mục Dự án

```
├── .env                  # File cấu hình môi trường
├── .env.example          # Mẫu cấu hình môi trường
├── index.html            # File HTML entrypoint (Offline mode)
├── package.json          # Dependencies & build scripts
├── server.ts             # Entrypoint Server Express + Vite Integration
├── vite.config.ts        # Cấu hình Vite bundler
├── src/
│   ├── main.tsx          # Client React Entrypoint
│   ├── App.tsx           # Layout & State điều phối chính
│   ├── index.css         # Tailwind CSS v4 & Embedded System Font Stack
│   ├── types.ts          # Định nghĩa TypeScript Interfaces
│   ├── api.ts            # Service gọi REST API Backend
│   ├── context/
│   │   └── AuthContext.tsx # Context quản lý Đăng nhập & JWT Session
│   ├── components/
│   │   ├── Navbar.tsx      # Thanh Header chuẩn Top Bar Contract
│   │   ├── Sidebar.tsx     # Drawer lịch sử chat & Live Quota Bar
│   │   ├── ChatWindow.tsx  # Khung chat tương tác LLM
│   │   ├── MarkdownViewer.tsx # Render Markdown & Highlight Code Block
│   │   ├── LoginModal.tsx  # Dialog Đăng nhập & Đăng ký
│   │   └── Dashboard/     # Các tab giao diện Quản trị
│   │       ├── DashboardMain.tsx    # Shell điều phối các tab Admin
│   │       ├── OverviewTab.tsx      # Biểu đồ Recharts & Thống kê
│   │       ├── UserManagementTab.tsx# Quản lý CRUD Người dùng
│   │       ├── GroupManagementTab.tsx# Quản lý Nhóm & Ma trận Rate Limit
│   │       ├── ModelManagementTab.tsx# Khai báo AI Token & Model Chat
│   │       └── SystemEnvTab.tsx     # Giám sát cấu hình .env & DB
│   └── server/           # Backend Express Server Modules
│       ├── db.ts         # WebAssembly SQLite Database Helper (`sql.js`)
│       ├── auth.ts       # JWT Middleware & Password Hashing
│       ├── rateLimiter.ts# Module kiểm tra Rate Limit & Token Quota
│       ├── aiProvider.ts # Bridge gọi ChatGPT OpenAI API / Gemini API
│       └── routes/       # API Route Controllers
│           ├── authRoutes.ts
│           ├── userRoutes.ts
│           ├── groupRoutes.ts
│           ├── modelRoutes.ts
│           ├── chatRoutes.ts
│           └── dashboardRoutes.ts
└── dist/                 # Thư mục chứa gói sản phẩm Production tự vận hành
```

---

## 🛡 License & Security Note

- **Mã hóa Token**: API Token của các mô hình AI khai báo trong trang Admin được lưu trữ mã hóa trong Database và không bao giờ lộ ra phía Client browser.
- **Offline Security**: Ứng dụng không thực hiện bất kỳ truy vấn lấy tài nguyên ngoài nào, đảm bảo an toàn tuyệt đối khi triển khai trong mạng nội bộ intranet / air-gapped environment.
