# Cờ Tướng Luyện Tập

Web app (PWA) miễn phí để luyện cờ tướng: đấu với máy, luyện chiếu hết, học khai cuộc **Bình phong mã** (chơi bên Đen). Chạy offline sau lần mở đầu, lưu tiến độ ngay trên máy, không cần tài khoản.

## Đưa lên GitHub Pages (miễn phí)

1. Tạo repo mới trên GitHub, ví dụ `co-tuong`.
2. Tải lên **toàn bộ file trong thư mục này** (`index.html`, `manifest.webmanifest`, `sw.js`, các `icon-*`, thư mục `src`). Dùng nút *Add file → Upload files* hoặc `git push`.
3. Vào *Settings → Pages*, mục *Build and deployment* chọn *Deploy from a branch*, nhánh `main`, thư mục `/ (root)`, bấm Save.
4. Sau 1–2 phút, mở `https://mercyk24.github.io/Co-tuong-Xiangqi-/` bằng **Safari** trên iPhone.
5. Bấm nút Chia sẻ → **Thêm vào Màn hình chính**. App sẽ mở toàn màn hình như app thường.

Khi cập nhật nội dung, hãy đổi `CACHE = 'xq-v1'` trong `sw.js` thành `xq-v2`, `xq-v3`… để điện thoại nhận bản mới.

## Cấu trúc

- `index.html`: toàn bộ app trong một file (đã ghép từ `src/`).
- `src/xq.js`: luật cờ, ký hiệu Hán, engine alpha-beta, bộ giải chiếu hết. Đã kiểm thử bằng perft (44 / 1.920 / 79.666 / 3.290.240 ở độ sâu 1–4, khớp số chuẩn).
- `src/app.js`, `src/template.html`: giao diện.
- `src/puzzles.json`: 98 bài chiếu hết liên tục, sinh tự động rồi kiểm chứng bằng solver (đúng số nước tối thiểu, chỉ một nước đầu đúng).
- `src/openings_src.js`: bài khai cuộc, gồm chuỗi nước và chú giải tiếng Việt. `node src/build_openings.js` sẽ kiểm tra từng nước có hợp lệ không.
- Muốn build lại: `node src/build_openings.js && python3 src/build.py`.

## Giới hạn cần biết

- Engine do mình tự viết, mạnh ở mức trung bình đến khá, chưa phải cao thủ. Có thể nối Pikafish (WebAssembly) ở bước sau.
- Chuỗi nước khai cuộc lấy từ lý thuyết công khai và đã kiểm tra hợp lệ, nhưng chú giải là tóm tắt ý tưởng; nên đối chiếu thêm với sách hoặc Pikafish.
- Luật lặp thế được đơn giản hóa: lặp ba lần là hòa.

## Thêm cờ thế của bạn

Mỗi bài trong `puzzles.json` có dạng `{"id":..,"fen":"...","n":số nước,"side":0|1,"sol":"..."}`. Chỉ cần có FEN chuẩn của thế cờ và số nước chiếu hết; dùng `XQ.mateLength` để kiểm chứng trước khi thêm.
