# Tích hợp Chat UI: hiển thị tiến độ từng bước + biểu đồ thời gian

Gateway ghi lại từng công đoạn xử lý của mỗi request và đẩy về Chat UI **ngay khi từng bước xảy ra**
(không đợi đến cuối):

```
Phân tích yêu cầu → Tra cứu VectorDB            → Chờ mô hình → Suy luận (thinking) → Viết câu trả lời
                  → Chuyển yêu cầu thành SQL → Kiểm tra an toàn SQL → Truy vấn CSDL ┘
```

Mỗi bước có: tên, trạng thái (`running` / `done` / `error`), thời điểm bắt đầu/kết thúc, thời lượng và chi tiết
(câu SQL, số dòng, tên tài liệu tìm được...). Từ đó UI vẽ được danh sách bước hoặc biểu đồ thời gian (Gantt).

## 1. Chọn mức tích hợp

| Mức | UI cần sửa? | Bạn thấy gì | Dùng khi |
|---|---|---|---|
| **A. Khung thinking** | Không | Danh sách bước + biểu đồ chữ trong khung "thinking" | UI của bạn đã hiện thinking của model; muốn có ngay |
| **B. Sự kiện `x_progress`** | Có (thêm ~20 dòng JS) | Timeline đồ họa, thanh thời gian chạy trực tiếp | UI tự viết hoặc fork được |
| **C. Open WebUI** | Không sửa code UI, thêm 1 Function | Mỗi bước là một dòng trạng thái; thinking thành khối `<think>` | Dùng Open WebUI |

Xem nhanh mức B ngay không cần cài gì: `python -m scripts.demo_stack` rồi mở `http://127.0.0.1:8000/demo`
(dùng Ollama giả, có độ trễ để thấy thanh thời gian chạy). Khi gateway chạy thật, trang `/demo` cũng dùng được
với Ollama thật.

## 2. Cấu hình (`.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PROGRESS_MODE` | `thinking` | `off` · `thinking` · `event` · `both` |
| `STATUS_FIELD` | `reasoning` | Tên trường thinking mà UI của bạn hiển thị (chế độ `thinking`) |
| `STATUS_INCLUDE_SQL` | `true` | `false` = ẩn nội dung SQL và lỗi DB khỏi tiến độ gửi cho người dùng |
| `PROGRESS_CHART` | `true` | Chế độ `thinking`: thêm biểu đồ thời gian dạng chữ |
| `PROGRESS_CHART_WIDTH` | `28` | Độ rộng thanh của biểu đồ chữ |
| `PROGRESS_DETAIL_MAX` | `300` | Độ dài tối đa phần chi tiết mỗi bước |
| `TRACE_KEEP` | `200` | Số trace giữ trong bộ nhớ cho `GET /v1/traces/{id}` |
| `DEMO_UI` | `true` | Bật `/demo` và `/static/progress-timeline.js` |

**Ghi đè theo từng request** bằng header `X-Progress-Mode: event` (giá trị không hợp lệ bị bỏ qua).
Nhờ vậy cùng một gateway có thể phục vụ UI cũ (mặc định `thinking`) và UI mới (gửi header `event`).

> Bảo mật: tiến độ gửi cho **người dùng cuối** nên có thể lộ câu SQL và tên bảng/cột. Nếu không muốn người dùng
> thấy, đặt `STATUS_INCLUDE_SQL=false`. Model vẫn nhận kết quả đầy đủ để trả lời.

## 3. Mức A: không sửa UI (chế độ `thinking`)

Đặt `PROGRESS_MODE=thinking` và `STATUS_FIELD` đúng tên trường thinking của UI. Gateway ghi vào trường này,
trước khi model bắt đầu suy luận:

````
- ⏳ Phân tích yêu cầu & chọn nguồn dữ liệu…
- ✔ Phân tích yêu cầu & chọn nguồn dữ liệu · 524ms — Cần số liệu → tra cứu cơ sở dữ liệu (MySQL)
- ⏳ Chuyển yêu cầu thành SQL…
- ✔ Chuyển yêu cầu thành SQL · 504ms — `SELECT SUM(net_amount) AS total_revenue FROM revenue WHERE ...`
- ⏳ Kiểm tra an toàn SQL…
- ✔ Kiểm tra an toàn SQL · 0ms — Hợp lệ — chỉ SELECT, bảng được phép, LIMIT ≤ 50
- ⏳ Truy vấn cơ sở dữ liệu…
- ✔ Truy vấn cơ sở dữ liệu · 1ms — 1 dòng

**Dòng thời gian** — chuẩn bị dữ liệu mất 1.0s
```text
Phân tích yêu cầu & chọn nguồn dữ… │██████████████░░░░░░░░░░░░░░│ 524ms
Chuyển yêu cầu thành SQL           │░░░░░░░░░░░░░░██████████████│ 504ms
Kiểm tra an toàn SQL               │░░░░░░░░░░░░░░░░░░░░░░░░░░░█│ 0ms
Truy vấn cơ sở dữ liệu             │░░░░░░░░░░░░░░░░░░░░░░░░░░░█│ 1ms
```
````

Cách biết `STATUS_FIELD` là gì: gọi thẳng Ollama với model thinking rồi xem tên trường trong `delta`:

```bash
curl -N http://localhost:11434/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"qwen3:8b","stream":true,"think":true,"messages":[{"role":"user","content":"1+1?"}]}'
```

Thấy `"reasoning":"..."` thì để `reasoning`; thấy `"reasoning_content"` thì đổi tương ứng.

Giới hạn của mức A: luồng thinking chỉ **nối thêm** được, nên không có thanh chạy trực tiếp; mỗi bước hiện thành
hai dòng (bắt đầu, kết thúc) và biểu đồ chữ chỉ có sau khi giai đoạn chuẩn bị xong. UI nào không hiển thị
thinking của model thì sẽ không thấy gì.

## 4. Mức B: UI tự viết (sự kiện `x_progress`)

### 4.1. Nhúng component có sẵn

Gateway phục vụ sẵn file `GET /static/progress-timeline.js` (ES module, không phụ thuộc thư viện). Sao chép file này
vào dự án UI hoặc import trực tiếp:

```html
<div id="progress"></div>
<script type="module">
import { ProgressTimeline, readChatStream } from "http://<gateway>:8000/static/progress-timeline.js";

const timeline = new ProgressTimeline(document.getElementById("progress"));

async function ask(messages) {
  timeline.reset();
  const res = await fetch("http://<gateway>:8000/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Progress-Mode": "event",               // yêu cầu sự kiện có cấu trúc
      // "Authorization": "Bearer <API_KEY>",   // nếu gateway đặt API_KEY
    },
    body: JSON.stringify({ model: "qwen3:8b", stream: true, think: true, messages }),
  });
  await readChatStream(res, {
    onProgress:  (p) => timeline.push(p),       // vẽ timeline
    onReasoning: (t) => appendThinking(t),      // thinking của model
    onContent:   (t) => appendAnswer(t),        // câu trả lời
  });
}
</script>
```

Tùy biến giao diện bằng CSS variables trên phần tử gốc: `--pt-fg`, `--pt-muted`, `--pt-track`, `--pt-accent`,
`--pt-ok`, `--pt-err`, `--pt-font`, `--pt-mono`. Component tự theo chế độ sáng/tối của hệ thống.

### 4.2. Dùng với React / Vue / Svelte

`ProgressTimeline` là lớp thuần JS gắn vào một phần tử DOM, nên bọc trong effect:

```jsx
// React
function Progress({ events }) {            // events: mảng x_progress nhận được cho lượt này
  const ref = useRef(null), tl = useRef(null);
  useEffect(() => { tl.current = new ProgressTimeline(ref.current); return () => tl.current.reset(); }, []);
  useEffect(() => { tl.current.reset(); events.forEach((e) => tl.current.push(e)); }, [events]);
  return <div ref={ref} />;
}
```

Nếu muốn tự vẽ, chỉ cần đọc sự kiện theo mục 5; mọi thứ cần thiết nằm trong JSON.

### 4.3. Lấy lại timeline sau khi tải lại trang

Mỗi response có header `X-Trace-Id` (trùng `id` của completion). Lưu id này cùng tin nhắn, về sau:

```js
const trace = await (await fetch(`${BASE}/v1/traces/${traceId}`, { headers })).json();
timeline.load(trace);
```

Gateway giữ `TRACE_KEEP` trace gần nhất **trong bộ nhớ** (mất khi khởi động lại). Muốn lưu lâu dài, UI nên tự lưu
`summary` nhận được ở cuối luồng.

Lưu ý CORS: nếu UI chạy ở origin khác, đặt `CORS_ORIGINS` đúng origin của UI. Header `X-Trace-Id` đã được cho phép đọc.

## 5. Đặc tả giao thức `x_progress`

Sự kiện nằm trong `choices[0].delta.x_progress` của các chunk SSE chuẩn `chat.completion.chunk`
(client OpenAI thông thường bỏ qua trường lạ). Chunk đầu tiên luôn có `delta.role = "assistant"`.

**Sự kiện bước** (mỗi lần bước bắt đầu, cập nhật, hoặc kết thúc; luôn là ảnh chụp đầy đủ của bước):

```json
{"v":1,"type":"step","trace_id":"chatcmpl-ab7a…","step":{
  "id":"sql_generate","title":"Chuyển yêu cầu thành SQL","phase":"prepare","status":"done",
  "start_ms":742,"end_ms":1447,"duration_ms":705,
  "detail":"SELECT SUM(net_amount) AS total_revenue FROM revenue WHERE ...",
  "meta":{"kind":"sql"}}}
```

**Sự kiện tổng kết** (một lần, ngay trước chunk `finish_reason`):

```json
{"v":1,"type":"summary","trace_id":"chatcmpl-ab7a…","created":1762300000,"done":true,"total_ms":3290,"steps":[ … ]}
```

| Trường | Ý nghĩa |
|---|---|
| `id` | Định danh bước, duy nhất trong trace. Bước lặp lại có hậu tố: `sql_generate#2` |
| `phase` | `prepare` (tra cứu dữ liệu) hoặc `generate` (model Ollama trả lời) |
| `status` | `running` → `done` hoặc `error` |
| `start_ms`, `end_ms`, `duration_ms` | Mili-giây tính từ lúc gateway nhận request. `end_ms`/`duration_ms` = `null` khi đang chạy |
| `detail` | Một dòng mô tả kết quả; bước lỗi thì là lý do |
| `meta` | Dữ liệu thêm. `kind:"sql"` = `detail` là câu SQL (nên hiển thị dạng code); `rows`, `intent`, `hits[{source,score}]` |

Các `id` hiện có:

| `id` | Tiêu đề | Khi nào |
|---|---|---|
| `rewrite` | Diễn giải câu hỏi theo ngữ cảnh hội thoại | Câu hỏi nối tiếp (có lịch sử) |
| `route` | Phân tích yêu cầu & chọn nguồn dữ liệu | Luôn có khi bật RAG; `meta.intent` = `SQL`/`DOCS`/`NONE` |
| `vector_search` | Tra cứu tài liệu nội bộ (VectorDB) | Nhánh tài liệu |
| `sql_generate` | Chuyển yêu cầu thành SQL | Nhánh SQL |
| `sql_guard` | Kiểm tra an toàn SQL | Nhánh SQL; `error` nếu bị từ chối |
| `sql_execute` | Truy vấn cơ sở dữ liệu | Nhánh SQL; `meta.rows` |
| `llm_wait` | Chờ mô hình phản hồi | Từ lúc gửi sang Ollama đến token đầu tiên |
| `llm_think` | Mô hình suy luận (thinking) | Chỉ khi model có thinking |
| `llm_answer` | Mô hình viết câu trả lời | Từ token nội dung đầu tiên đến hết |
| `llm_generate` | Mô hình sinh câu trả lời | Chỉ ở chế độ không stream |

Nên xử lý theo **`id` bước chưa biết trước** (hiển thị `title` thay vì ánh xạ cứng) để UI vẫn đúng khi gateway
thêm bước mới. Khi SQL lỗi, gateway tự thử lại (`SQL_MAX_RETRIES`): sẽ thấy `sql_generate#2`, `sql_guard#2`...

Thứ tự điển hình của một luồng SSE:

```
data: {…"delta":{"role":"assistant","x_progress":{"type":"step","step":{"id":"route","status":"running",…}}}}
data: {…"delta":{"x_progress":{"type":"step","step":{"id":"route","status":"done",…}}}}
…                                  (các bước sql_* hoặc vector_search)
data: {…"delta":{"x_progress":{"type":"step","step":{"id":"llm_wait","status":"running",…}}}}
data: {…"delta":{"reasoning":"…"}}  ← thinking của model (nguyên văn từ Ollama)
data: {…"delta":{"content":"Doanh"}} ← câu trả lời
data: {…"delta":{"x_progress":{"type":"summary",…}}}
data: {…"choices":[{"delta":{…},"finish_reason":"stop"}]}
data: [DONE]
```

Không stream (`"stream": false`): response JSON có thêm trường `x_trace` (cùng dạng với `GET /v1/traces/{id}`),
trừ khi chế độ là `off`.

## 6. Mức C: Open WebUI

Open WebUI không có chỗ để hiển thị một trường tùy ý như `x_progress`, nên dùng một **Function (Pipe)** làm cầu nối:
pipe gọi gateway với `X-Progress-Mode: event`, đổi mỗi bước thành sự kiện trạng thái của Open WebUI
và bọc thinking của model trong `<think>...</think>`.

1. Open WebUI → **Admin Panel → Functions → "+"**, dán toàn bộ `integration/open_webui_pipe.py`, **Save**, bật công tắc.
2. Bấm biểu tượng bánh răng (**Valves**) của function:
   - `GATEWAY_URL`: địa chỉ gateway, **không có `/v1`**. Nếu Open WebUI chạy trong Docker và gateway chạy trên
     máy chủ, dùng `http://host.docker.internal:8000` (Linux cần thêm `--add-host=host.docker.internal:host-gateway`)
     hoặc IP máy chủ.
   - `API_KEY`: trùng `API_KEY` của gateway nếu có đặt.
3. Chọn trong danh sách model: mỗi model Ollama xuất hiện thành một mục **"RAG · tên-model"**. Chọn model, bật thinking
   như bình thường.

Pipe tự bỏ tiền tố `<function_id>.` mà Open WebUI gắn vào tên model rồi chuyển phần còn lại sang gateway,
nên model và các tham số thinking bạn chọn được giữ nguyên.

Với Open WebUI nên giữ `PASSTHROUGH_PREFIXES="### Task:"` trong `.env` để các request phụ (đặt tiêu đề, gợi ý
câu hỏi tiếp theo) không bị đưa qua bước tra cứu.

**Mức độ kiểm chứng:** pipe đã được kiểm thử tự động với gateway thật và một emitter giả (bản đồ sự kiện, bọc
`<think>`, bỏ tiền tố model, báo lỗi). **Chưa được thử trên một bản Open WebUI thực tế.** API của Functions
(`pipes()`, `pipe(...)`, `__event_emitter__`) và cách UI nhận `<think>` có thể khác giữa các phiên bản; nếu có chỗ
không khớp, xem tài liệu Functions của phiên bản bạn đang chạy.

## 7. UI khác (LibreChat, LobeChat, Chatbox...)

Mọi UI gọi được `/v1/chat/completions` đều dùng được **mức A** nếu nó hiển thị trường thinking/reasoning của
model; hãy đặt `STATUS_FIELD` theo tên trường mà UI đó đọc. Tên trường và việc UI có hiển thị hay không **khác nhau
theo UI và phiên bản**, nên thử bằng `curl` rồi bằng chính UI. Muốn timeline đồ họa trong các UI này thì phải dùng
mức B (sửa/fork UI) hoặc viết một lớp cầu nối tương tự pipe ở mục 6.

## 8. Kiểm tra từng lớp bằng curl

```bash
# Mức A: xem các dòng tiến độ nằm trong trường thinking
curl -N http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"qwen3:8b","stream":true,"messages":[{"role":"user","content":"Doanh thu tháng này?"}]}'

# Mức B: xem sự kiện x_progress và header X-Trace-Id
curl -N -i http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' \
  -H 'X-Progress-Mode: event' \
  -d '{"model":"qwen3:8b","stream":true,"messages":[{"role":"user","content":"Doanh thu tháng này?"}]}'

# Lấy lại trace
curl http://localhost:8000/v1/traces/<trace_id>
```

Dấu hiệu stream đúng: các dòng `x_progress` hiện **lần lượt trong lúc chờ**, không đợi đến khi model trả lời xong
mới đổ ra một lượt.

## 9. Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không thấy tiến độ nào | `PROGRESS_MODE=off`, hoặc UI không hiển thị trường thinking | Kiểm tra bằng `curl`; đặt `STATUS_FIELD` đúng tên |
| Mọi thứ đến một lúc ở cuối | Reverse proxy (nginx...) đang gom bộ đệm | `proxy_buffering off;` (gateway đã gửi `X-Accel-Buffering: no`); nếu có nén gzip cho `text/event-stream` thì tắt |
| Trình duyệt báo CORS | UI ở origin khác | Đặt `CORS_ORIGINS=https://ui-cua-ban`; tránh `*` khi có `API_KEY` |
| Chữ tiến độ lẫn vào câu trả lời | UI đẩy trường thinking vào nội dung | Dùng mức B/C, hoặc `PROGRESS_MODE=off` |
| `/v1/traces/{id}` trả 404 | Đã quá `TRACE_KEEP` hoặc gateway vừa khởi động lại | Lưu `summary` ở phía UI |
| Timeline kẹt ở "đang chạy" | Luồng bị ngắt giữa chừng (không nhận được `summary`) | Gọi `timeline.finish()` trong `onDone` và khi bắt lỗi; bước còn treo sẽ được đánh dấu lỗi "Luồng bị ngắt" |
| Pipe Open WebUI báo không gọi được gateway | `GATEWAY_URL` sai (localhost trong Docker là chính container) | Dùng `host.docker.internal` hoặc IP máy chủ |
| Bước `llm_think` không bao giờ xuất hiện | Model không có thinking, hoặc tên trường thinking lạ | Gateway nhận `reasoning`, `reasoning_content`, `thinking`; kiểm tra bằng `curl` tới Ollama |
