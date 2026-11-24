# Sinh dữ liệu bằng Pikafish

Dữ liệu trong `data/` được sinh trên máy tính có [Pikafish](https://github.com/official-pikafish/Pikafish), rồi đưa vào app khi dựng. App không chạy Pikafish. Các lệnh dưới đây chạy từ thư mục gốc của dự án; `PIKAFISH` là đường dẫn tới tệp chạy Pikafish (ví dụ `D:/my-project/Pikafish/Pikafish-Windows-x86-64-universal.exe`).

Sau khi sinh lại bất kỳ dữ liệu nào, chạy `npm test`: bộ kiểm tra `tests/unit/data.test.js` báo ngay nếu có bài hay biến khai cuộc sai luật.

## Bài chiến thuật – `data/tactics.json`

```bash
node tools/gen_tactics.js PIKAFISH 250 data/tactics.json
```

Cho Pikafish tự chơi (một bên đi yếu có ngẫu nhiên, một bên tìm 1 giây với MultiPV 2), giữ những thế có **đúng một** nước thắng thế: nước tốt nhất ≥ +250 (hoặc chiếu hết), hơn nước thứ hai ≥ 200, và nước thứ hai ≤ +120. Hạng bài được ước lượng theo độ sâu engine tự viết cần để tìm ra nước đó. Chạy lại được: kết quả cũ được giữ.

## Cây khai cuộc – `data/opening_tree.json`

```bash
node tools/gen_opening_tree.js PIKAFISH 1800 data/opening_tree.json 450
```

Duyệt theo tầng từ thế ban đầu, mỗi thế lấy các nước kém nước tốt nhất không quá 40 centipawn (thế đầu 70), tối đa 3 nước (thế đầu 7); dừng ở 12 nước hoặc khi thế đã nghiêng quá 350. Lần chạy gần nhất: 1800 thế, sâu khoảng 6 nước, khoảng 14 phút.

## Biến khai cuộc dài – `data/opening_lines.json`

```bash
node tools/gen_opening_lines.js PIKAFISH data/opening_tree.json data/opening_lines.json 800
```

Với mỗi cặp (nước đầu của Đỏ, nước đáp tốt của Đen), kéo dài đến 22 nước theo nước tốt nhất, kèm hai biến phụ khi Đỏ có nước gần ngang ở nước 3 và nước 5. Kết quả phân tích từng thế được lưu ở `data/opening_lines_cache.json` để chạy lại nhanh và để app biết những nước đáp tương đương.

## Gộp vào app – `data/openings.json`, `data/book.json`

```bash
npm run openings
```

- `tools/build_openings.js` dựng nhóm Bình phong mã có giải thích từ `data/openings_src.js` và `data/pikafish_results.txt`, ghi `data/openings_hand.json`.
- `tools/build_openings_gen.js` gộp nhóm đó với các biến Pikafish thành `data/openings.json`, và tạo sách khai cuộc cho máy `data/book.json` từ cây khai cuộc.

## Kiểm chứng cờ thế – `tools/cothe_verify.js`

```bash
node tools/cothe_verify.js PIKAFISH data/cothe_candidates.json
```

Kiểm tra từng thế (FEN) trong danh sách ứng viên bằng Pikafish và ghi `data/cothe_verified.json`, `data/cothe_report.txt` (hai tệp này không đưa vào kho).
