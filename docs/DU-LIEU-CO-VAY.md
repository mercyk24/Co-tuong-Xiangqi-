# Dữ liệu cờ vây [CỜ VÂY]

Hai tệp trong `data/go/`, nhúng vào trang `/co-vay/` khi dựng:

| Tệp | Nội dung | Cách có |
|---|---|---|
| `puzzles.json` | bài "Bắt quân" (tab Bắt quân) | sinh bằng `tools/go/gen_puzzles.js`, **không sửa tay** |
| `lessons.json` | bài học luật (tab Bài học) | soạn tay; `tests/unit/go/content.test.js` kiểm từng bước |

Không dùng nguồn bên ngoài nào: cả hai do dự án tự sinh, tự soạn, nên không có điều kiện giấy phép riêng.

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
