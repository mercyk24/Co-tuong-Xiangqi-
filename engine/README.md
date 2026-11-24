# Engine mạnh (cấp 6 và phân tích ván)

Các tệp trong thư mục này được chép nguyên sang `dist/engine/` khi dựng và được service worker lưu riêng để dùng ngoại tuyến.

| Tệp | Nguồn | SHA-256 |
|---|---|---|
| `stockfish-512.js` | `stockfish.js` của gói npm `fairy-stockfish-nnue.wasm` 1.1.12, **đã chỉnh** (xem dưới) | `a7fb9d15daa535abdd76707f91800163f8e217e6274aae6cf72048032c59c55b` |
| `stockfish.wasm` | gói npm `fairy-stockfish-nnue.wasm` 1.1.12, giữ nguyên | `7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6` |
| `stockfish.worker.js` | gói npm `fairy-stockfish-nnue.wasm` 1.1.12, giữ nguyên | `067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573` |
| `xiangqi-c07e94a5c7cb.nnue` | mạng NNUE cờ tướng trong [danh sách mạng của Fairy-Stockfish](https://fairy-stockfish.github.io/nnue/) | `c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11` |

## Chỉnh sửa so với bản gốc

Bản gốc khai báo bộ nhớ dùng chung tối đa 2 GB (`maximum: 32768` trang), khiến Safari trên iPhone báo `RangeError: Out of memory`. Trong `stockfish-512.js`, giá trị này được đổi thành `maximum: 8192` (512 MB). Engine thực tế dùng khoảng 460 MB; mức 256 MB hoặc 384 MB làm engine lỗi `memory access out of bounds`. Ngoài ra không có thay đổi nào khác.

## Cách app dùng engine

- Cần `SharedArrayBuffer`, tức trang phải có tiêu đề `Cross-Origin-Opener-Policy: same-origin` và `Cross-Origin-Embedder-Policy: require-corp`. GitHub Pages không cho đặt tiêu đề, nên service worker (`src/assets/sw.js`) tự thêm vào mọi phản hồi; lần mở đầu app tải lại trang một lần để bật chế độ này.
- Mạng NNUE phải được ghi vào hệ thống tệp ảo với **đúng tên gốc** (`/xiangqi-c07e94a5c7cb.nnue`) và bật `Use NNUE`; đặt tên khác thì engine lặng lẽ dùng hàm đánh giá cũ.
- Tọa độ hàng của Fairy-Stockfish đánh số 1–10, của lõi app đánh số 0–9 (`h3e3` ở engine là `h2e2` trong app); chuyển đổi nằm trong `src/app/30-fsf.js`.

## Giấy phép

Fairy-Stockfish và bản WebAssembly phát hành theo GNU GPL-3.0. Mã nguồn: <https://github.com/fairy-stockfish/Fairy-Stockfish> và <https://github.com/fairy-stockfish/fairy-stockfish.wasm>. Tác giả và điều khoản của mạng NNUE: xem trang danh sách mạng ở trên.
