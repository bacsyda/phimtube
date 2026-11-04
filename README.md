# PhimTube

Web xem phim giao diện kiểu YouTube, viết bằng Next.js 14 (App Router) + Tailwind. Dữ liệu lấy từ 4 nguồn phim (KKPhim, VSPhim, VSMov, TOPXX), phát bằng hls.js.

## Chạy

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
npm test         # kiểm tra các mapper dữ liệu bằng fixture thật (không cần mạng)
```

## Cấu hình (tuỳ chọn)

Sao chép `.env.example` thành `.env.local` rồi chỉnh:

| Biến | Ý nghĩa |
| --- | --- |
| `<ID>_API`, `<ID>_IMG` | Địa chỉ API và ảnh của từng nguồn, với `<ID>` là `KKPHIM`, `VSPHIM`, `VSMOV`, `TOPXX` (mặc định đã có sẵn) |
| `HLS_RATE_LIMIT` | Số yêu cầu / phút / IP cho proxy `/api/hls` (mặc định 600) |
| `HLS_ALLOWED_HOSTS` | Danh sách host được phép proxy (để trống = mọi host công khai). Nếu bật, nhớ thêm host video của cả 4 nguồn |

## Cấu trúc

- `app/` — các trang (`/`, `/search`, `/watch/[slug]`, `/da-xem`, `/xem-sau`) và API (`/api/list`, `/api/search`, `/api/suggest`, `/api/preview`, `/api/hls`, `/api/alt`)
- `components/` — `Player` (trình phát tự viết), `Watch` (trang xem), `MovieCard` (thẻ phim + xem trước), `InfiniteGrid`, `FilterBar`, ...
- `lib/sources.js` — danh sách nguồn phim (thêm nguồn mới ở đây); `lib/current.js` — đọc nguồn đang duyệt từ cookie; `lib/adapters/` — lớp dữ liệu, xem mục "Kiến trúc dữ liệu"; `lib/history.js` — lịch sử / Xem sau / ẩn phim (localStorage, có cache); `lib/hls.js` — nạp hls.js và nhớ host cần proxy

## Lưu ý về `/api/hls`

Proxy này chỉ phục vụ yêu cầu từ chính trang (kiểm tra `Sec-Fetch-Site`/`Referer`), từ chối địa chỉ nội bộ (kiểm tra cả IP sau khi phân giải DNS và từng chặng chuyển hướng), giới hạn tốc độ theo IP và không trả HTML/SVG. Nếu đặt sau reverse proxy, hãy chắc chắn nó đặt header `X-Forwarded-For` để giới hạn tốc độ theo đúng IP người dùng.

## Kiến trúc dữ liệu: khung chỉ hiển thị, ruột do nguồn quyết định

Giao diện không biết nguồn nào có trường gì. Mỗi nguồn có một **adapter** (`lib/adapters/`) lo việc gọi API và đổi dữ liệu về **mô hình chuẩn**; chọn nguồn khác thì toàn bộ phần bên trong (loại, bộ lọc, danh sách, tìm kiếm, lịch sử) đổi theo.

```
sources.js (cấu hình)  →  adapters/index.js: source(id)  →  kk.js (KKPhim, VSMov, VSPhim) | topxx.js
```

**Giao diện của một adapter** (`lib/adapters/index.js` có ghi chú đầy đủ):

| | |
| --- | --- |
| `feeds`, `filterKeys`, `exclusive` | thông tin tĩnh: các "loại" (Phim bộ, Hôm nay...), các khoá lọc nguồn có, nguồn có cho kết hợp nhiều bộ lọc không |
| `catalog()` | các nhóm lọc lấy từ **API của nguồn** (thể loại, quốc gia, năm...), cache 1 giờ |
| `list(page, {feed, filters})`, `search(q, page)`, `detail(id)` | trả về mô hình chuẩn |

**Mô hình chuẩn** — thẻ phim: `src, slug, title, original, year, cover, poster, country[], lang, quality, episode, duration, kind, isSeries`. Chỉ `slug` và `title` là bắt buộc; mọi trường khác có thể rỗng và giao diện chỉ hiện cái nào có (không đoán). `kind` là `series` / `single` / `null` (không rõ). `slug` là mã dạng chuỗi mờ: slug với KKPhim/VSMov/VSPhim, `code` với TOPXX. Chi tiết phim thêm `desc, time, actors, directors, genres, genreSlugs, countries, servers[{name, episodes[{name, slug, m3u8, embed}]}]`.

**Khác biệt giữa các nguồn** (đo bằng dữ liệu thật, `test/fixtures/`):

| | KKPhim | VSMov | VSPhim | TOPXX |
| --- | --- | --- | --- | --- |
| Loại | bộ, lẻ, hoạt hình, TV | bộ, subteam | không có | hôm nay |
| Bộ lọc | thể loại, quốc gia, năm (kết hợp được) | thể loại, quốc gia (chọn một) | thể loại, quốc gia (chọn một) | thể loại, quốc gia (chọn một) |
| Thẻ trong danh sách | đủ (trừ "mới cập nhật") | thiếu loại/ngôn ngữ/chất lượng | có, quốc gia là chuỗi | có |
| Phát | m3u8 + embed | chỉ embed | chỉ embed | chỉ embed |
| Loại phim | bộ + lẻ | bộ + lẻ | chỉ lẻ | chỉ lẻ |

Nguồn chỉ có phim lẻ (`kinds: ['single']` trong `lib/sources.js`) không có tập, không có nút tập trước/sau, và (cùng với `alt: false`) không tham gia "Thử nguồn khác". Nguồn chỉ có embed (`preview: false`) bỏ qua xem trước khi rê chuột và không lưu được tiến độ xem (iframe không báo thời gian).

**Thêm hoặc sửa một nguồn:** (1) chạy `node scripts/sample.mjs <nguồn>` lấy dữ liệu thật vào `samples/`; (2) chép các file cần thiết vào `test/fixtures/<nguồn>/`; (3) sửa mục `CFG` trong `adapters/kk.js` (nguồn cùng họ) hoặc viết adapter mới; (4) viết test, chạy `npm test`. Khi một nguồn đổi schema, chạy lại bước 1-2 rồi `npm test` sẽ chỉ ra trường nào lệch.

## Nhiều nguồn phim

- **Chọn nguồn**: mục "Nguồn phim" ở thanh bên (thu gọn thì hiện chữ viết tắt; trên điện thoại và ở trang xem phim nằm trong ngăn kéo). Nguồn đang duyệt lưu trong cookie `phimtube-src`. Loại và bộ lọc là của riêng từng nguồn, nên đổi nguồn thì về trang chủ (tìm kiếm giữ từ khóa).
- **Link xem phim** luôn có `?src=` (vd `/watch/ten-phim?src=vsmov&tap=tap-1`), nên link chia sẻ luôn đúng nguồn. Link cũ không có `?src=` được hiểu là KKPhim.
- **URL trang chủ** dùng khoá chung: `/?feed=phim-le&genre=hanh-dong&country=han-quoc&year=2023`. Khoá nào nguồn không có thì bị bỏ.
- **Lịch sử / Xem sau / Ẩn phim** lưu theo khoá `nguồn:slug`. Hai trang "Video đã xem" và "Xem sau" mặc định chỉ hiện phim của nguồn đang chọn, có nút "Hiện cả nguồn khác"; nút xóa lịch sử cũng chỉ xóa theo phạm vi đang xem.
- **Proxy `/api/hls`** nhận thêm `s=<id nguồn>` để gửi đúng `Referer` (cấu hình ở `lib/sources.js`, không nhận Referer từ người dùng).
- **Video lỗi**: popup có nút "Thử nguồn khác", tìm cùng phim ở các nguồn tham gia (khớp tên gốc + năm).

## Kiểm tra một nguồn bị lỗi

Adapter ghi lỗi chi tiết ra terminal (nguồn nào, URL nào, mã HTTP). Để xem dữ liệu thật của các nguồn:

```bash
node scripts/sample.mjs            # cả 4 nguồn → samples/<nguồn>/*.json + samples/summary.txt
node scripts/sample.mjs topxx      # chỉ một nguồn
npm test                           # chạy mapper trên fixture
```

`scripts/probe.mjs` và `probe2.mjs` là công cụ đo cũ (in cấu trúc từng endpoint), vẫn dùng được cho nguồn mới.
