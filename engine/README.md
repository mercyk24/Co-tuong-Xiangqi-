# Engine mạnh (cờ tướng cấp 6 và phân tích ván; cờ vây cấp 3–6)

Các tệp trong thư mục này được chép nguyên sang `dist/engine/` khi dựng và được service worker lưu riêng để dùng ngoại tuyến.

| Tệp | Nguồn | SHA-256 |
|---|---|---|
| `stockfish-512.js` | `stockfish.js` của gói npm `fairy-stockfish-nnue.wasm` 1.1.12, **đã chỉnh** (xem dưới) | `a7fb9d15daa535abdd76707f91800163f8e217e6274aae6cf72048032c59c55b` |
| `stockfish.wasm` | gói npm `fairy-stockfish-nnue.wasm` 1.1.12, giữ nguyên | `7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6` |
| `stockfish.worker.js` | gói npm `fairy-stockfish-nnue.wasm` 1.1.12, giữ nguyên | `067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573` |
| `xiangqi-c07e94a5c7cb.nnue` | mạng NNUE cờ tướng trong [danh sách mạng của Fairy-Stockfish](https://fairy-stockfish.github.io/nnue/) | `c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11` |
| `tf-core.min.js` | `dist/tf-core.min.js` của gói npm `@tensorflow/tfjs-core` 4.22.0, giữ nguyên | `0924438788ff7da57b14d0f7c45a05d81611a5a4b52653da6d065e86d348757c` |
| `tf-backend-cpu.min.js` | `dist/tf-backend-cpu.min.js` của gói npm `@tensorflow/tfjs-backend-cpu` 4.22.0, giữ nguyên | `4f232e90455e04cc5f69a691295d07a881a4ad93d7f229598459b9b533259d83` |
| `tf-backend-wasm.min.js` | `dist/tf-backend-wasm.min.js` của gói npm `@tensorflow/tfjs-backend-wasm` 4.22.0, giữ nguyên | `691bbec0ef8b5a7f17f212e9c5d85832030f90d030b46e99acb4dea1fb16f009` |
| `tfjs-backend-wasm.wasm` | gói npm `@tensorflow/tfjs-backend-wasm` 4.22.0, giữ nguyên | `70a5d516060464e5269f01c74bac1772d6b8ab6cb612acf16b5cdaf61f78d892` |
| `tfjs-backend-wasm-simd.wasm` | gói npm `@tensorflow/tfjs-backend-wasm` 4.22.0, giữ nguyên | `77ebb28a6d34f371dbbf2086b7f2de8994acd8ea5a3cf1fa24d2c26c840cac7b` |
| `kata-g170e-b10c128.kgo` | mạng KataGo `g170e-b10c128-s1141046784-d204142634.bin.gz` (SHA-256 `1a8e05a4ea3fca20dab79410cbb566c760767fcdd2fa0b701cfe259a84cc8b04`), **đổi định dạng** bằng `tools/go/kata_convert.js` (xem dưới) | `569e9c2e0ed660887a6b413678258f0f6ae4914d567fd580dfccb2a336c62881` |

Mã băm cũng nằm trong `SHA256SUMS`; bộ kiểm tra `tests/unit/shared/engine-integrity.test.js` so từng tệp với danh sách này, nên tệp engine bị thay là kiểm tra báo lỗi ngay. Cố ý cập nhật engine thì sửa cả `SHA256SUMS` và bảng trên.

## Chỉnh sửa so với bản gốc

Bản gốc khai báo bộ nhớ dùng chung tối đa 2 GB (`maximum: 32768` trang), khiến Safari trên iPhone báo `RangeError: Out of memory`. Trong `stockfish-512.js`, giá trị này được đổi thành `maximum: 8192` (512 MB). Engine thực tế dùng khoảng 460 MB; mức 256 MB hoặc 384 MB làm engine lỗi `memory access out of bounds`. Ngoài ra không có thay đổi nào khác.

## Cách app dùng engine

- Cần `SharedArrayBuffer`, tức trang phải có tiêu đề `Cross-Origin-Opener-Policy: same-origin` và `Cross-Origin-Embedder-Policy: require-corp`. GitHub Pages không cho đặt tiêu đề, nên service worker (`src/shared/assets/sw.js`) tự thêm vào mọi phản hồi; lần mở đầu app tải lại trang một lần để bật chế độ này.
- Mạng NNUE phải được ghi vào hệ thống tệp ảo với **đúng tên gốc** (`/xiangqi-c07e94a5c7cb.nnue`) và bật `Use NNUE`; đặt tên khác thì engine lặng lẽ dùng hàm đánh giá cũ.
- Tọa độ hàng của Fairy-Stockfish đánh số 1–10, của lõi app đánh số 0–9 (`h3e3` ở engine là `h2e2` trong app); chuyển đổi nằm trong `src/shared/app/30-fsf.js`.

## KataGo cho cờ vây

- `src/go/core/kata.js` là bản viết lại bằng JavaScript phần mã hoá đầu vào (đặc trưng V7: khí, kiếp, thang, đất sống chắc kiểu Benson, 5 nước gần nhất), mạng nơ-ron (dựng bằng phép tính của TensorFlow.js) và hậu xử lý của KataGo, cùng một bộ tìm kiếm PUCT rút gọn. Kết quả mạng được so với KataGo 1.18.1 thật (lệnh `kata-raw-nn`) trong `tests/unit/go/kata.test.js`.
- `src/go/app/15-kata.js` chạy tất cả trong một Worker; chỉ tải các tệp này khi người dùng chọn cấp 3–6 (hoặc bấm tải trước trong Cài đặt). Chạy 1 luồng: bản nhiều luồng của tfjs (`tfjs-backend-wasm-threaded-simd.wasm`) cần nạp lại script chính trong các luồng phụ, việc này hỏng khi Worker được tạo từ Blob, nên không đưa tệp đó vào.
- Định dạng `.kgo`: 4 byte `KGO1`, độ dài phần mô tả (uint32), phần mô tả JSON (tên tensor, vị trí, kích thước), rồi trọng số dạng float16. Lớp chuẩn hoá (batch norm) đã được gộp sẵn vào lớp tích chập kế tiếp, nên tệp nhỏ hơn (5,7 MB so với 10 MB của bản gốc) mà kết quả gần như không đổi. Tạo lại: `node tools/go/kata_convert.js <tệp .bin.gz> engine/kata-g170e-b10c128.kgo`.
- Thời gian một lần đánh giá (WebAssembly có SIMD, 1 luồng): iPhone 8 khoảng 48 ms (9×9), 93 ms (13×13), 197 ms (19×19); máy tính xách tay khoảng 17 / 35 / 91 ms.

## Giấy phép

Fairy-Stockfish và bản WebAssembly phát hành theo GNU GPL-3.0. Mã nguồn: <https://github.com/fairy-stockfish/Fairy-Stockfish> và <https://github.com/fairy-stockfish/fairy-stockfish.wasm>. Tác giả và điều khoản của mạng NNUE: xem trang danh sách mạng ở trên.

TensorFlow.js phát hành theo giấy phép Apache-2.0 (<https://github.com/tensorflow/tfjs>). KataGo phát hành theo giấy phép MIT (<https://github.com/lightvector/KataGo>); phần viết lại trong `src/go/core/kata.js` giữ ghi công này. Mạng g170 của KataGo được tác giả phát hành vào phạm vi công cộng (CC0): <https://katagotraining.org/> và <https://github.com/lightvector/KataGo/releases>.
