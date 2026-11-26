# Dữ liệu cờ vua [CỜ VUA]

Mọi tệp trong `data/chess/*.json` đều do công cụ sinh ra, **không sửa tay**. Mỗi nước đi đều được kiểm lại bằng lõi luật
`src/chess/core/chess.js`; bài hay biến nào sai thì bị bỏ.

## 1. Tải nguyên liệu (cần mạng, chạy một lần)

```bash
npm i --no-save fzstd          # giải nén kho bài Lichess (không ghi vào package.json); thiếu thì dùng zlib của Node
node tools/chess/fetch-data.mjs                    # hình quân + danh mục khai cuộc + kho bài tập
node tools/chess/fetch-data.mjs --only-puzzles     # chỉ tải lại kho bài tập
node tools/chess/fetch-data.mjs --skip-puzzles     # bỏ qua kho bài tập (~270 MB nén)
```

| Nguyên liệu | Nguồn | Giấy phép | Ghi vào |
|---|---|---|---|
| Hình quân cburnett | lichess-org/lila | GPLv2+ | `src/chess/pieces/*.svg` |
| Danh mục khai cuộc | lichess-org/chess-openings | CC0 | `data/chess/src/openings/{a..e}.tsv` |
| Kho bài tập (chọn lọc theo độ phổ biến) | database.lichess.org | CC0 | `data/chess/src/puzzles-selected.csv` |

## 2. Dựng dữ liệu cho app (không cần mạng)

```bash
node tools/chess/build-data.js
```

| Tệp | Nội dung |
|---|---|
| `data/chess/puzzles.json` | bài chiếu hết 1–5 nước (tab Chiếu hết) |
| `data/chess/tactics.json` | bài chiến thuật theo điểm khó (tab Chiến thuật) |
| `data/chess/openings.json` | 13 nhóm khai cuộc, các biến chính do dự án chọn (`LINES` trong build-data.js), tên theo Lichess |
| `data/chess/book.json` | sách của máy: chuỗi nước UCI → các nước tiếp theo (tới 16 nửa nước) |

Muốn thêm biến khai cuộc: sửa `LINES` (và `GROUPS` nếu thêm nhóm) trong `tools/chess/build-data.js`, chạy lại lệnh trên.
Dựng lại với cùng nguyên liệu luôn ra đúng tệp như cũ. `tests/unit/chess/data.test.js` kiểm tra toàn bộ dữ liệu.
