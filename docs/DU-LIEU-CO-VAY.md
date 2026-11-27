# Dữ liệu cờ vây [CỜ VÂY]

Hai tệp trong `data/go/`, nhúng vào trang `/co-vay/` khi dựng:

| Tệp | Nội dung | Cách có |
|---|---|---|
| `puzzles.json` | bài "Bắt quân" (tab Bắt quân) | sinh bằng `tools/go/gen_puzzles.js`, **không sửa tay** |
| `lessons.json` | bài học luật (tab Bài học) | soạn tay; `tests/unit/go/content.test.js` kiểm từng bước |

Không dùng nguồn bên ngoài nào: cả hai do dự án tự sinh, tự soạn, nên không có điều kiện giấy phép riêng.
Riêng máy KataGo (cấp 3–6) dùng mạng nơ-ron của KataGo nằm trong `engine/`, xem mục 3.

## 1. Bài bắt quân

```bash
node tools/go/gen_puzzles.js [hạt giống] [hạn mức] [tệp ra]
node tools/go/gen_puzzles.js 20261126 "1:40,2:70,3:70,4:50,5:30" data/go/puzzles.json   # bộ đang dùng (260 bài, ~2 giây)
```

Cách sinh: tạo thế cờ 9×9 bằng 10–36 nước ngẫu nhiên hợp lệ (3/4 số nước đặt gần nước trước cho giống thế giao chiến), rồi tìm
một nhóm quân (tối đa 8 quân, tối đa 3 khí) của bên **không** đi mà bên đi bắt được. Bộ giải trong lõi
(`GO.captureLength`, `GO.captureMoves`) cho số nước tấn công ít nhất `n` (1–5). Giữ bài khi:

- bắt được đúng trong `n` nước, không ít hơn;
- từ 2 nước trở lên thì có tối đa 2 nước đầu đúng (bài rõ ràng);
- bên đi không có nhóm nào đang bị "atari" (bài chỉ có một việc là bắt quân);
- thế cờ chưa có trong bộ (so cả 8 cách xoay, lật bàn).

Mỗi bài: `{ id, fen, t, n }`, `t` là một điểm của nhóm mục tiêu (0..80, hàng 0 ở trên), `fen` theo dạng của lõi
(`"9 b 7.5 <hàng/…>"`). Hạt giống giống nhau thì ra đúng bộ bài như cũ.

Bộ giải coi người phòng thủ thoát khi nhóm có từ 3 khí; người phòng thủ được chạy ra, ăn quân đang vây chỉ còn 1 khí, đánh
"atari" ngược quân vây còn 2 khí, hoặc đi chỗ khác. Trong app, máy đỡ bằng `GO.bestDefense` (nước cầm cự lâu nhất), người giải
đi nước nào bắt được trong số nước còn lại cũng tính là đúng.

## 2. Bài học luật

`lessons.json` là mảng bài `{ id, title, steps }`; mỗi bước `{ fen, goal, text, … }`:

| `goal` | Người học phải | Trường thêm |
|---|---|---|
| `look` | đọc rồi bấm Tiếp | `marks` (chữ trên giao điểm), `score` + `dead` (vẽ đất, quân chết khi đếm điểm) |
| `at` | đặt đúng một trong các điểm | `ok: ["D2"]` |
| `capture` | ăn được ít nhất một quân | |
| `save` | cứu nhóm chứa điểm `t` (sau nước đi có từ 2 khí và không bị bắt trong 3 nước) | `t` |
| `kill` | bắt nhóm chứa điểm `t` trong `n` nước, máy chạy cho bên kia | `t`, `n` |

`done` là lời khen khi làm đúng. Toạ độ ghi kiểu quốc tế (cột bỏ chữ I, hàng đếm từ dưới lên). Bàn có thể từ 5×5 tới 19×19
(bài học dùng 7×7 và 9×9). Sửa bài học xong chạy `node --test tests/unit/go/content.test.js`.

## 3. Mạng KataGo (`engine/kata-g170e-b10c128.kgo`)

Mạng `g170e-b10c128-s1141046784-d204142634.bin.gz` (10 khối, 128 kênh, đợt huấn luyện g170, phạm vi công cộng CC0) được đổi
sang định dạng riêng của app:

```bash
node tools/go/kata_convert.js g170e-b10c128-s1141046784-d204142634.bin.gz engine/kata-g170e-b10c128.kgo
```

- SHA-256 tệp gốc: `1a8e05a4ea3fca20dab79410cbb566c760767fcdd2fa0b701cfe259a84cc8b04`; tệp ra ghi trong `engine/SHA256SUMS`.
- Công cụ đọc tệp `.bin.gz` (phiên bản mô hình 8), gộp các lớp chuẩn hoá (batch norm, kèm hàm kích hoạt) vào lớp tích chập kế
  tiếp và lưu trọng số dạng float16: 5,7 MB thay vì 11 MB. Thêm `--f32` để lưu float32 (để đối chiếu).
- Vì sao chọn b10: b6 (2 MB) nhanh hơn khoảng gấp đôi nhưng yếu hơn rõ; b10 trên iPhone 8 vẫn đủ nhanh (1 lần đánh giá 19×19
  khoảng 0,2 giây) để cấp 5–6 đọc vài chục tới vài trăm nước trong 2–6 giây. Các mạng lớn hơn (b15, b20, b40) quá chậm trên điện thoại.
- Kiểm tra: `tests/unit/go/kata-ref.json` chứa tỉ lệ thắng, điểm hơn kém, nước tốt nhất và bản đồ chủ đất do chính chương trình
  KataGo 1.18.1 (bản Eigen AVX2, lệnh `kata-raw-nn 0`, luật `chinese`) tính trên 8 thế cờ; `tests/unit/go/kata.test.js` chạy
  mạng bằng TensorFlow.js và so từng số. Sai lệch thực tế dưới 0,001 (xác suất nước đi) và 0,01 (chủ đất).

Các cấp: 1–2 là máy Monte-Carlo (không cần tải); 3 đi theo xác suất của mạng có ngẫu nhiên (nhiệt độ 1, chỉ trong các nước mạng
thấy hợp lý); 4 đi nước mạng cho điểm cao nhất; 5 và 6 tìm kiếm PUCT khoảng 2 và 6 giây (tối đa 200 / 1000 lần đánh giá). Gợi ý
đọc khoảng 2,5 giây. Đếm điểm và ước lượng điểm dùng bản đồ chủ đất của mạng (nhóm quân có chủ đất trung bình nghiêng về đối
phương quá 0,4 là chết). Không tải được mạng (máy quá cũ, hết bộ nhớ) thì tất cả tự quay về máy Monte-Carlo.

### Phân tích cả ván (Ván đã lưu)

Việc `analyze` của Worker KataGo chạy mạng một lần cho từng thế của ván (thế ban đầu và sau mỗi nước) và lưu vào ván đã lưu
trường `ana`: `{ v: 1, net: 'kata-g170e-b10c128.kgo', w: [...], l: [...], b: [...] }`, với `w[i]` là khả năng thắng của Đen
(0–1, làm tròn 3 chữ số), `l[i]` số điểm Đen hơn (làm tròn 0,1), `b[i]` nước mạng chọn ở thế sau `i` nước (điểm + 1, bỏ lượt = 1000).
Đổi mạng (tên `net` khác) thì dữ liệu cũ bị bỏ qua. Nước thứ `i + 1` bị đánh dấu khi khác `b[i]` và làm khả năng thắng của bên
vừa đi tụt từ 0,1 (`?`) hoặc 0,2 (`??`); nếu trước nước đó bên đi đã trên 90% hoặc dưới 10% thì xét số điểm mất từ 5 (`?`) hoặc
10 (`??`). Ngưỡng ở hằng `MIS` đầu `src/go/app/80-review.js`. Đây là đánh giá nhanh không tìm kiếm, đủ để chỉ ra các nước sai lớn.

