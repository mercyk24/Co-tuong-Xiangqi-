# Sinh dữ liệu bằng Pikafish

Dữ liệu trong `data/` được sinh trên máy tính có [Pikafish](https://github.com/official-pikafish/Pikafish), rồi đưa vào app khi dựng. App không chạy Pikafish. Các lệnh dưới đây chạy từ thư mục gốc của dự án; `PIKAFISH` là đường dẫn tới tệp chạy Pikafish (ví dụ `D:/my-project/Pikafish/Pikafish-Windows-x86-64-universal.exe`).

Sau khi sinh lại bất kỳ dữ liệu nào, chạy `npm test`: bộ kiểm tra `tests/unit/xiangqi/data.test.js` báo ngay nếu có bài hay biến khai cuộc sai luật.

## Bài chiếu hết – `data/xiangqi/puzzles.json`

```bash
node tools/xiangqi/gen_puzzles.js 120000 /tmp/puzzles_raw.json   # chạy 120 giây
node tools/xiangqi/build_puzzles.js /tmp/puzzles_raw.json          # ghi data/xiangqi/puzzles.json
```

Không cần Pikafish. `gen_puzzles.js` đặt quân ngẫu nhiên (Tướng, Sĩ, Tượng và vài quân tấn công), dùng bộ giải chiếu hết của lõi luật cờ (`src/xiangqi/core/xq.js`) để giữ những thế chỉ có **đúng một** nước chiếu dẫn tới chiếu hết trong n nước. `build_puzzles.js` sắp theo số nước, xoay bàn cờ cho một phần bài để có cả bài Đen đi, kiểm tra lại từng bài rồi đánh số. Bài do công cụ tự sinh, không lấy từ sách hay trang web nào.

## Bài chiến thuật – `data/xiangqi/tactics.json`

```bash
node tools/xiangqi/gen_tactics.js PIKAFISH 250 data/xiangqi/tactics.json
```

Cho Pikafish tự chơi (một bên đi yếu có ngẫu nhiên, một bên tìm 1 giây với MultiPV 2), giữ những thế có **đúng một** nước thắng thế: nước tốt nhất ≥ +250 (hoặc chiếu hết), hơn nước thứ hai ≥ 200, và nước thứ hai ≤ +120. Hạng bài được ước lượng theo độ sâu engine tự viết cần để tìm ra nước đó. Chạy lại được: kết quả cũ được giữ.

## Cây khai cuộc – `data/xiangqi/opening_tree.json`

```bash
node tools/xiangqi/gen_opening_tree.js PIKAFISH 1800 data/xiangqi/opening_tree.json 450
```

Duyệt theo tầng từ thế ban đầu, mỗi thế lấy các nước kém nước tốt nhất không quá 40 centipawn (thế đầu 70), tối đa 3 nước (thế đầu 7); dừng ở 12 nước hoặc khi thế đã nghiêng quá 350. Lần chạy gần nhất: 1800 thế, sâu khoảng 6 nước, khoảng 14 phút.

## Biến khai cuộc dài – `data/xiangqi/opening_lines.json`

```bash
node tools/xiangqi/gen_opening_lines.js PIKAFISH data/xiangqi/opening_tree.json data/xiangqi/opening_lines.json 800
```

Với mỗi cặp (nước đầu của Đỏ, nước đáp tốt của Đen), kéo dài đến 22 nước theo nước tốt nhất, kèm hai biến phụ khi Đỏ có nước gần ngang ở nước 3 và nước 5. Kết quả phân tích từng thế được lưu ở `data/xiangqi/opening_lines_cache.json` để chạy lại nhanh và để app biết những nước đáp tương đương.

## Gộp vào app – `data/xiangqi/openings.json`, `data/xiangqi/book.json`

```bash
npm run openings
```

- `tools/xiangqi/build_openings.js` dựng nhóm Bình phong mã có giải thích từ `data/xiangqi/openings_src.js` và `data/xiangqi/pikafish_results.txt`, ghi `data/xiangqi/openings_hand.json`.
- `tools/xiangqi/build_openings_gen.js` gộp nhóm đó với các biến Pikafish thành `data/xiangqi/openings.json`, và tạo sách khai cuộc cho máy `data/xiangqi/book.json` từ cây khai cuộc.

## Kiểm chứng cờ thế – `tools/xiangqi/cothe_verify.js`

```bash
node tools/xiangqi/cothe_verify.js PIKAFISH data/xiangqi/cothe_candidates.json
```

Kiểm tra từng thế (FEN) trong danh sách ứng viên bằng Pikafish và ghi `data/xiangqi/cothe_verified.json`, `data/xiangqi/cothe_report.txt` (hai tệp này không đưa vào kho).
