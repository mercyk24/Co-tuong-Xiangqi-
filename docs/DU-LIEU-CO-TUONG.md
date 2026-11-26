# Sinh dữ liệu bằng Pikafish

Dữ liệu trong `data/` được sinh trên máy tính có [Pikafish](https://github.com/official-pikafish/Pikafish), rồi đưa vào app khi dựng. App không chạy Pikafish. Các lệnh dưới đây chạy từ thư mục gốc của dự án; `PIKAFISH` là đường dẫn tới tệp chạy Pikafish (ví dụ `D:/my-project/Pikafish/Pikafish-Windows-x86-64-universal.exe`).

Sau khi sinh lại bất kỳ dữ liệu nào, chạy `npm test`: bộ kiểm tra `tests/unit/xiangqi/data.test.js` báo ngay nếu có bài hay biến khai cuộc sai luật.

## Bài chiếu hết – `data/xiangqi/puzzles.json`

```bash
node tools/xiangqi/gen_puzzles.js 600000 /tmp/puzzles_raw.json 1:80,2:200,3:250,4:200,5:150,6:100   # tối đa 10 phút
node tools/xiangqi/build_puzzles.js /tmp/puzzles_raw.json --append                                   # ghi data/xiangqi/puzzles.json
```

Không cần Pikafish. `gen_puzzles.js` đặt quân ngẫu nhiên (Tướng, Sĩ, Tượng và vài quân tấn công), dùng bộ giải chiếu hết của lõi luật cờ (`src/xiangqi/core/xq.js`) để giữ những thế chỉ có **đúng một** nước chiếu dẫn tới chiếu hết trong n nước, không có quân tấn công thừa. Đối số thứ ba là số bài cần cho mỗi mức n nước. Để đa dạng, mỗi tổ hợp quân tấn công chiếm tối đa 1/8 số bài của một mức; bài trùng (kể cả sau khi lật trái–phải, xoay bàn) với bài đã có trong app bị bỏ.

`build_puzzles.js` xoay bàn cờ cho 2/3 số bài mới để có cả bài Đen đi, kiểm tra lại từng bài, sắp theo số nước rồi đánh số. `--append` giữ nguyên các bài đang có (không có thì thay toàn bộ). Bài do công cụ tự sinh, không lấy từ sách hay trang web nào. Lần sinh gần nhất (bản 2.1.0): 980 bài mới trong khoảng 25 giây, tổng 1078 bài.

## Bài chiến thuật – `data/xiangqi/tactics.json`

```bash
node tools/xiangqi/gen_tactics.js PIKAFISH --minutes 120 --workers 2 --threads 2
```

Cho Pikafish tự chơi: một bên đi yếu có ngẫu nhiên (độ sâu 2–5 đổi theo từng ván, để sơ hở có độ khó khác nhau), một bên mạnh lọc nhanh 0,4 giây/nước với MultiPV 2, thế đạt thì kiểm lại 1,5 giây. Giữ những thế có **đúng một** nước thắng thế: nước tốt nhất ≥ +250 (hoặc chiếu hết), hơn nước thứ hai ≥ 200, và nước thứ hai ≤ +120. Hạng bài được ước lượng theo độ sâu engine tự viết cần để tìm ra nước đó (độ sâu 1 → 700 … độ sâu 7 → 1600, sâu hơn → 1800); bài dễ nhất (700) chỉ giữ 40% (`--easy`). Đo thử: khoảng 1 bài mới mỗi phút cho mỗi Pikafish 2 luồng.

- `--workers` Pikafish chạy song song, mỗi cái `--threads` luồng: nên để `workers × threads` ≤ số nhân CPU.
- `--minutes` thời gian chạy tối đa; `--games` giới hạn số ván (0 = chạy hết thời gian); `--out` tệp ra.
- Chạy lại được: bài cũ (cả mã bài) giữ nguyên, bài mới nối tiếp; mỗi bài mới được ghi ngay nên dừng giữa chừng không mất bài.

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
