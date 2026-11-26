# Cấu trúc dự án: phần dùng chung và phần riêng của từng loại cờ

Tài liệu này trả lời câu hỏi "muốn sửa X thì sửa ở đâu, có ảnh hưởng loại cờ kia không". Đọc trước khi sửa bất cứ gì.

Ba nhãn dùng trong cả dự án (ghi ở dòng đầu của từng tệp mã nguồn trong `src/`):

| Nhãn | Nghĩa | Sửa thì cần kiểm tra |
|---|---|---|
| **[DÙNG CHUNG]** | Cả cờ tướng và cờ vua chạy cùng một tệp | Cả hai app (`npm test` chạy đủ cả hai) |
| **[CỜ TƯỚNG]** | Chỉ app cờ tướng dùng | App cờ tướng; nếu là tệp song sinh thì xem cả bản cờ vua |
| **[CỜ VUA]** | Chỉ app cờ vua dùng | App cờ vua; nếu là tệp song sinh thì xem cả bản cờ tướng |

## 1. Sơ đồ thư mục

Quy tắc đặt chỗ: **thư mục tên `xiangqi/` là của cờ tướng, `chess/` là của cờ vua, `shared/` hoặc `net/` là dùng chung.**
Cùng một quy tắc ở `src/`, `data/`, `tools/`, `tests/`.

```
src/
  shared/                 [DÙNG CHUNG]
    app/                  module giao diện dùng chung (tiện ích, lưu trữ, engine mạnh, chơi qua mạng, cài đặt, báo lỗi)
    base.css              giao diện chung (bố cục, màu, thẻ, nút, tab, danh sách bài…)
    assets/               icon, service worker sw.js (một cho cả ba trang)
  portal/index.html       [DÙNG CHUNG] trang chủ chọn loại cờ
  xiangqi/                [CỜ TƯỚNG]
    core/xq.js            lõi luật (XQ): sinh nước, ký hiệu Hán, FEN, luật lặp thế, engine tự viết, giải chiếu hết
    app/                  module giao diện của cờ tướng (00-game.js là cấu hình GAME)
    game.css              giao diện riêng (ô bị chiếu, font chữ Hán…)
    index.template.html   khung trang /co-tuong/
  chess/                  [CỜ VUA]
    core/chess.js         lõi luật (CH): bàn 0x88, nhập thành, bắt tốt qua đường, phong cấp, SAN, luật hòa, engine tự viết
    app/                  module giao diện của cờ vua (00-game.js là cấu hình GAME)
    game.css              giao diện riêng (ô sáng/tối, phong cấp…)
    pieces/               hình quân cburnett (GPLv2+), tải bằng tools/chess/fetch-data.mjs
    index.template.html   khung trang /co-vua/
data/
  xiangqi/                [CỜ TƯỚNG] bài chiếu hết, chiến thuật, khai cuộc, sách của máy (+ dữ liệu thô sinh bằng Pikafish)
  chess/                  [CỜ VUA] bài chiếu hết, chiến thuật, khai cuộc, sách của máy; chess/src/ là nguyên liệu tải về
tools/
  xiangqi/                [CỜ TƯỚNG] sinh dữ liệu bằng Pikafish (docs/DU-LIEU-CO-TUONG.md)
  chess/                  [CỜ VUA] tải và dựng dữ liệu từ Lichess
  net/                    [DÙNG CHUNG] thử điểm hẹn, thử tải điểm hẹn
tests/
  unit/{shared,xiangqi,chess}/   kiểm tra bằng node:test
  e2e/{shared,xiangqi,chess}/    kiểm tra giao diện bằng Playwright; e2e/helpers.js dùng chung
engine/                   [DÙNG CHUNG] Fairy-Stockfish WebAssembly (cả hai app); riêng xiangqi-*.nnue là mạng của cờ tướng
server/                   [DÙNG CHUNG] điểm hẹn chơi qua mạng (Cloudflare Worker + bản chạy thử trên máy)
scripts/                  [DÙNG CHUNG] build.js, serve.js, screenshots.js
docs/                     tài liệu (DU-LIEU-CO-TUONG.md, DU-LIEU-CO-VUA.md là riêng; còn lại dùng chung)
```

## 2. Một trang được ghép như thế nào

`scripts/build.js` dựng mỗi loại cờ thành một tệp HTML chạy được ngoại tuyến:

```
src/<loại cờ>/index.template.html
  <style>   = src/shared/base.css  +  src/<loại cờ>/game.css        (riêng đặt sau nên đè được chung)
  lõi luật  = src/<loại cờ>/core/*.js                                (XQ hoặc CH)
  dữ liệu   = data/<loại cờ>/*.json
  mã        = src/shared/app/*.js  +  src/<loại cờ>/app/*.js         (xếp theo số đầu tên tệp, ghép vào MỘT hàm)
→ dist/co-tuong/index.html  hoặc  dist/co-vua/index.html
```

Vì các module được ghép vào một hàm, chúng gọi nhau trực tiếp (`Play`, `Store`, `Net`…) mà không cần import.
Thứ tự ghép theo số đầu tên tệp, xen kẽ giữa hai thư mục: ví dụ với cờ vua là
`00-game` (riêng) → `01-util` (chung) → `02-notation` (riêng) → `10-engine` (riêng) → `20-board` (riêng) → `30-fsf` (chung)
→ `40…42-play` (riêng) → `45-net` (chung) → `50…60` (riêng) → `70-settings`, `75-report` (chung) → `80…99` (riêng).
Hai thư mục không được có tệp trùng tên (build báo lỗi).

Trang chủ `src/portal/index.html`, service worker, icon và engine được chép thẳng sang `dist/`.

## 3. Ranh giới giữa phần chung và phần riêng

Phần chung **không bao giờ** gọi thẳng `XQ` hay `CH`. Nó chỉ biết hai thứ do từng app cung cấp trong `00-game.js`:

**`RULES`**: lõi luật của app (`XQ` hoặc `CH`). Phần chung hiện chỉ dùng `RULES.mvStr(m)` (đổi nước đi sang chuỗi để gửi qua mạng).

**`GAME`**: cấu hình của app.

| Trường | Cờ tướng | Cờ vua | Phần chung dùng để |
|---|---|---|---|
| `id` | `xiangqi` | `chess` | phân biệt app |
| `title` | Cờ Tướng Luyện Tập | Cờ Vua Luyện Tập | tiêu đề báo lỗi |
| `app` | `co-tuong-luyen-tap` | `co-vua-luyen-tap` | mã app trong tệp sao lưu (không khôi phục chéo) |
| `store` | `xq_` | `xc_` | tiền tố mọi khoá lưu trên máy |
| `netPrefix` | `xqvn-` | `xcvn-` | mã máy trên điểm hẹn (phòng hai loại cờ tách riêng) |
| `keys` | … | … | danh sách khoá được sao lưu |
| `fsf` | biến thể xiangqi + NNUE | biến thể chess, không NNUE | cấu hình Fairy-Stockfish |
| `fmt` | đổi ký hiệu Hán | (không có) | định dạng thông báo |
| `checkKey` | (tuỳ chọn) | (tuỳ chọn) | lọc thêm dữ liệu khi khôi phục |

Ngoài ra, module chơi qua mạng dùng chung (`45-net.js`) gọi vào đối tượng `Play` của từng app. Mỗi app phải có:
`Play.over`, `Play.draw()`, `Play.clock`, `Play.moves`, `Play.mode`, `Play.screen`, `Play.setup()`, `Play.closeMenu()`,
`Play.net`, `Play.netStart()`, `Play.netOver()`, `Play.netLoad()`, `Play.netView()`, `Play.netLeave()`, `Play.netAsk()`,
`Play.netAnswer()`, `Play.netApplyMove()`, `Play.watchStart()`. Đổi tên hay bỏ một hàm trong số này ở một app là làm hỏng
chơi qua mạng của app đó.

## 4. Tệp song sinh: riêng nhưng giống nhau phần lớn

Cờ vua được làm từ khung của cờ tướng, nên nhiều module giao diện là **bản song sinh**: cùng tên, cùng cấu trúc, khác ở chỗ
dính tới luật (bàn cờ, ký hiệu, phong cấp…). Chúng vẫn là tệp riêng, vì phần khác nhau đan xen khắp nơi.
Dòng đầu mỗi tệp song sinh ghi tên bản kia và mức giống nhau.

| Tệp (trong `src/xiangqi/app/` và `src/chess/app/`) | Giống nhau | Phần khác nhau chính |
|---|---|---|
| `42-play-net.js` | ~95% | tên bên (Đỏ/Đen ↔ Trắng/Đen), phong cấp |
| `99-boot.js` | ~92% | đối tượng gắn cho kiểm tra (`__xq` ↔ `__xc`), tuỳ chọn riêng |
| `40-play.js` | ~89% | kết thúc ván (luật lặp thế cờ tướng ↔ pat, 50 nước, không đủ quân), phong cấp |
| `80-analysis.js` | ~88% | thang điểm, cách tạo bài "Lỗi của bạn" |
| `10-engine.js` | ~78% | lõi gọi trong Web Worker, bảng cấp độ |
| `41-play-ai.js` | ~74% | sách khai cuộc, nước mở đầu |
| `90-tactics.js` | ~66% | chủ đề bài, nhiều nước trong lời giải, phong cấp |
| `50-puzzles.js` | ~65% | nguồn bài, cách kiểm tra lời giải |
| `60-openings.js` | ~54% | nhóm khai cuộc, bên người học |
| `20-board.js` | ~39% | bàn 9×10 có sông ↔ bàn 8×8 |
| `index.template.html` | ~90% | phần Giới thiệu (luật), tuỳ chọn riêng, bảng phong cấp |

Riêng hẳn, không có bản tương ứng: `00-game.js` (cấu hình), `02-notation.js` (ký hiệu nước đi), `game.css`, lõi luật.

**Quy tắc khi sửa tệp song sinh:** sửa lỗi ở phần giống nhau (ví dụ đồng hồ, menu ván, màn kết thúc, lưu ván) thì mở bản
bên kia, sửa giống hệt, rồi chạy `npm test`. Thấy một đoạn giống hệt nhau ở cả hai bản mà không dính tới luật thì nên
chuyển hẳn sang `src/shared/app/` (xem mục 6).

## 5. Muốn sửa X thì sửa ở đâu

| Muốn sửa | Sửa ở | Ảnh hưởng |
|---|---|---|
| Luật đi, luật hòa, ký hiệu nước đi của một loại cờ | `src/<loại cờ>/core/` (+ `02-notation.js`) | chỉ loại cờ đó |
| Sức mạnh máy cấp 1–5 | `src/<loại cờ>/core/` (engine) và `10-engine.js` (bảng cấp) | chỉ loại cờ đó |
| Máy cấp 6, phân tích ván (Fairy-Stockfish) | `src/shared/app/30-fsf.js` (chung), `GAME.fsf` (riêng) | chung: cả hai |
| Màu sắc, bố cục, nút, thẻ | `src/shared/base.css` | cả hai |
| Màu bàn cờ, quân, ô bị chiếu | `src/<loại cờ>/game.css`, `20-board.js` | chỉ loại cờ đó |
| Chơi qua mạng (kết nối, phòng, xem trận) | `src/shared/app/45-net.js`, `server/` | cả hai |
| Màn chơi qua mạng (nút, thông báo) | `42-play-net.js` của từng loại cờ (song sinh) | từng loại cờ |
| Sao lưu, quyền riêng tư, xoá dữ liệu | `src/shared/app/70-settings.js` | cả hai |
| Chữ trong mục Giới thiệu, chính sách | `index.template.html` của **cả hai** + `docs/CHINH-SACH-RIENG-TU.md` | cả hai |
| Bài tập, khai cuộc, sách của máy | `tools/<loại cờ>/` rồi dựng lại `data/<loại cờ>/` (không sửa tay JSON) | chỉ loại cờ đó |
| Lưu ngoại tuyến, tiêu đề bảo mật | `src/shared/assets/sw.js`, `scripts/build.js` | cả ba trang |
| Trang chủ chọn loại cờ | `src/portal/index.html` | trang chủ |

## 6. Thêm loại cờ mới hoặc gom thêm phần chung

**Thêm loại cờ mới** (ví dụ cờ úp): sao chép `src/chess/` thành `src/<tên>/`, viết lõi luật mới trong `core/`, sửa
`00-game.js` (tiền tố lưu trữ, tiền tố mạng, mã app riêng), thêm một mục vào `APPS` trong `scripts/build.js`, thêm tiền tố
mạng vào `ID_RE` trong `server/core.mjs`, thêm thẻ vào trang chủ, thêm trang vào `PAGES` trong `sw.js`.
Tạo `data/<tên>/`, `tools/<tên>/`, `tests/unit/<tên>/`, `tests/e2e/<tên>/`.

**Gom phần chung** (giảm tệp song sinh): chuyển một hàm giống hệt nhau ở hai bản vào một module trong `src/shared/app/`
(chọn số đầu tên tệp sao cho đứng trước module dùng nó), chỗ khác nhau thì đưa thành trường trong `GAME`. Chạy `npm test`.
Ứng viên tốt nhất: `42-play-net.js`, `99-boot.js`, `40-play.js` (đồng hồ, menu ván, lưu ván).

## 7. Kiểm tra

`npm test` chạy lint, kiểm tra đơn vị (`tests/unit/**`) và kiểm tra giao diện (`tests/e2e/**`) của **cả hai** loại cờ cùng phần
chung. Chạy riêng một loại cờ khi đang sửa:

```bash
node --test "tests/unit/chess/*.test.js"
npx playwright test tests/e2e/chess
```
