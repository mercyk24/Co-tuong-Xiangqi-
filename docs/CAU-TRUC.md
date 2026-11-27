# Cấu trúc dự án: phần dùng chung và phần riêng của từng loại cờ

Tài liệu này trả lời câu hỏi "muốn sửa X thì sửa ở đâu, có ảnh hưởng loại cờ khác không". Đọc trước khi sửa bất cứ gì.

Các nhãn dùng trong cả dự án (ghi ở dòng đầu của từng tệp mã nguồn trong `src/`):

| Nhãn | Nghĩa | Sửa thì cần kiểm tra |
|---|---|---|
| **[DÙNG CHUNG]** | Mọi loại cờ chạy cùng một tệp (riêng `30-fsf.js`, `80-analysis.js` chỉ cờ tướng và cờ vua) | Mọi app (`npm test` chạy đủ) |
| **[CỜ TƯỚNG]** | Chỉ app cờ tướng dùng | App cờ tướng; nếu là tệp song sinh thì xem cả bản cờ vua |
| **[CỜ VUA]** | Chỉ app cờ vua dùng | App cờ vua; nếu là tệp song sinh thì xem cả bản cờ tướng |
| **[CỜ VÂY]** | Chỉ app cờ vây dùng | App cờ vây |

## 1. Sơ đồ thư mục

Quy tắc đặt chỗ: **thư mục tên `xiangqi/` là của cờ tướng, `chess/` là của cờ vua, `go/` là của cờ vây, `shared/` hoặc `net/`
là dùng chung.** Cùng một quy tắc ở `src/`, `data/`, `tools/`, `tests/`.

```
src/
  shared/                 [DÙNG CHUNG]
    app/                  module giao diện dùng chung (tiện ích, lưu trữ, màn chơi, chơi qua mạng, cài đặt, báo lỗi,
                          engine mạnh và phân tích ván cho cờ tướng / cờ vua)
    base.css              giao diện chung (bố cục, màu, thẻ, nút, tab, danh sách bài…)
    assets/               icon, service worker sw.js (một cho mọi trang)
  portal/index.html       [DÙNG CHUNG] trang chủ chọn loại cờ
  xiangqi/                [CỜ TƯỚNG]
    core/xq.js            lõi luật (XQ): sinh nước, ký hiệu Hán, FEN, luật lặp thế, engine tự viết, giải chiếu hết
    app/                  module giao diện của cờ tướng (00-game.js là cấu hình GAME)
    game.css              giao diện riêng (ô bị chiếu, font chữ Hán…)
    index.template.html   khung trang /co-tuong/
  chess/                  [CỜ VUA]
    core/chess.js         lõi luật (CH): bàn 0x88, nhập thành, bắt tốt qua đường, phong cấp, SAN, luật hòa, engine tự viết
    app/                  module giao diện của cờ vua
    game.css              giao diện riêng (ô sáng/tối, phong cấp…)
    pieces/               hình quân cburnett (GPLv2+), tải bằng tools/chess/fetch-data.mjs
    index.template.html   khung trang /co-vua/
  go/                     [CỜ VÂY]
    core/go.js            lõi luật (GO): bàn 9/13/19 (và bàn nhỏ cho bài học), khí, ăn quân, tự sát, siêu kiếp,
                          đếm điểm kiểu Trung Quốc, đoán quân chết, SGF, bộ giải bắt quân, máy Monte-Carlo (UCT + RAVE)
    core/kata.js          KataGo viết lại (KATA): đọc mạng .kgo, đặc trưng đầu vào, chạy mạng bằng TensorFlow.js, tìm kiếm PUCT
    app/                  module giao diện của cờ vây (15-kata.js: Worker chạy KataGo, tải mạng khi cần)
    game.css              giao diện riêng (bàn gỗ, quân đá, đất khi đếm điểm…)
    index.template.html   khung trang /co-vay/
data/
  xiangqi/                [CỜ TƯỚNG] bài chiếu hết, chiến thuật, khai cuộc, sách của máy (+ dữ liệu thô sinh bằng Pikafish)
  chess/                  [CỜ VUA] bài chiếu hết, chiến thuật, khai cuộc, sách của máy; chess/src/ là nguyên liệu tải về
  go/                     [CỜ VÂY] bài bắt quân (tự sinh), bài học luật (soạn tay)
tools/
  xiangqi/                [CỜ TƯỚNG] sinh dữ liệu bằng Pikafish (docs/DU-LIEU-CO-TUONG.md)
  chess/                  [CỜ VUA] tải và dựng dữ liệu từ Lichess (docs/DU-LIEU-CO-VUA.md)
  go/                     [CỜ VÂY] sinh bài bắt quân, đổi mạng KataGo sang .kgo (docs/DU-LIEU-CO-VAY.md)
  net/                    [DÙNG CHUNG] thử điểm hẹn, thử tải điểm hẹn
tests/
  unit/{shared,xiangqi,chess,go}/   kiểm tra bằng node:test
  e2e/{shared,xiangqi,chess,go}/    kiểm tra giao diện bằng Playwright; e2e/helpers.js dùng chung
engine/                   [DÙNG CHUNG cho cờ tướng, cờ vua] Fairy-Stockfish WebAssembly; xiangqi-*.nnue là mạng của cờ tướng
server/                   [DÙNG CHUNG] điểm hẹn chơi qua mạng (Cloudflare Worker + bản chạy thử trên máy)
scripts/                  [DÙNG CHUNG] build.js, serve.js, screenshots.js
docs/                     tài liệu (DU-LIEU-*.md là riêng từng loại cờ; còn lại dùng chung)
```

## 2. Một trang được ghép như thế nào

`scripts/build.js` dựng mỗi loại cờ thành một tệp HTML chạy được ngoại tuyến. Danh sách app là mảng `APPS` trong tệp đó:

```
src/<loại cờ>/index.template.html
  <style>   = src/shared/base.css  +  src/<loại cờ>/game.css        (riêng đặt sau nên đè được chung)
  lõi luật  = src/<loại cờ>/core/*.js                                (XQ, CH hoặc GO)
  dữ liệu   = data/<loại cờ>/*.json                                  (theo mục blocks của app)
  mã        = src/shared/app/*.js (trừ các tệp trong mục skip)  +  src/<loại cờ>/app/*.js
              (xếp theo số đầu tên tệp, ghép vào MỘT hàm)
→ dist/co-tuong/index.html, dist/co-vua/index.html, dist/co-vay/index.html
```

Vì các module được ghép vào một hàm, chúng gọi nhau trực tiếp (`Play`, `Store`, `Net`…) mà không cần import.
Thứ tự ghép theo số đầu tên tệp, xen kẽ giữa hai thư mục:

| Số | Tệp | Loại | Việc |
|---|---|---|---|
| 00 | `00-game.js` | riêng | cấu hình `GAME`, `RULES` |
| 01 | `01-util.js` | chung | `$`, `Store`, `toast`, `pagedGrid`… |
| 02 | `02-notation.js` | riêng | ký hiệu nước đi, danh sách nước (`moveListHtml`; cờ tướng, cờ vua thêm `ndt`, `nd1`) |
| 03 | `03-hooks.js` | riêng | `HOOKS`: mọi chỗ phần chung cần tới luật của loại cờ |
| 10 | `10-engine.js` | riêng | máy tự viết (Web Worker), bảng cấp `LEVELS` |
| 20 | `20-board.js` | riêng | bàn cờ SVG, chọn quân |
| 30 | `30-fsf.js` | chung (cờ tướng, cờ vua) | Fairy-Stockfish (cấp 6, phân tích) |
| 40 | `40-play.js` | chung | màn chơi: ván, đồng hồ, lời xin, lưu ván, thanh hai bên |
| 41 | `41-play-ai.js` | riêng | đấu với máy |
| 42 | `42-play-net.js` | chung | màn chơi qua mạng |
| 45 | `45-net.js` | chung | kết nối WebRTC, điểm hẹn, đồng ý |
| 50 | `50-puzzles.js` | riêng | tab Chiếu hết (cờ vây: Bắt quân) |
| 60 | `60-openings.js` / `60-lessons.js` | riêng | tab Khai cuộc (cờ vây: Bài học luật) |
| 70 | `70-settings.js` | chung | sao lưu, quyền riêng tư |
| 75 | `75-report.js` | chung | báo lỗi tự nguyện |
| 80 | `80-analysis.js` / `80-review.js` | chung (cờ tướng, cờ vua) / riêng (cờ vây) | phân tích ván / xem lại ván, SGF |
| 90 | `90-tactics.js` | riêng (cờ tướng, cờ vua) | tab Chiến thuật |
| 99 | `99-boot.js` | chung | điều hướng tab, khởi động |

Hai thư mục không được có tệp trùng tên (build báo lỗi). Mục `skip` của một app liệt kê module dùng chung mà app đó không
ghép vào (cờ vây: `30-fsf.js`, `80-analysis.js`); tên trong `skip` sai thì build báo lỗi.

Trang chủ `src/portal/index.html`, service worker, icon và engine được chép thẳng sang `dist/`. Build tự điền vào `sw.js`
danh sách trang (`PAGES`, lấy từ `APPS`) và CSP của từng trang.

## 3. Ranh giới giữa phần chung và phần riêng

Phần chung **không bao giờ** gọi thẳng `XQ`, `CH` hay `GO`. Nó chỉ biết ba thứ do từng app cung cấp:

**`RULES`** (trong `00-game.js`): lõi luật của app. Phần chung dùng `RULES.Pos`, `RULES.START_FEN`,
`RULES.mvStr(m)` (nước đi → chuỗi gửi qua mạng / lưu ván), `RULES.mFrom(m)`, `RULES.mTo(m)` (ô đi, ô đến; cờ vây: điểm đặt quân,
bỏ lượt là -1). Đối tượng `Pos` của mọi lõi có chung các hàm `fromFen`, `fen`, `legalMoves`, `make`, `unmake`, `parse`,
`notation`, `inCheck` (cờ vây luôn `false`), `side`.

**`GAME`** (trong `00-game.js`): cấu hình của app.

| Trường | Cờ tướng | Cờ vua | Cờ vây | Phần chung dùng để |
|---|---|---|---|---|
| `id` | `xiangqi` | `chess` | `go` | phân biệt app (trang chủ nhớ loại cờ chơi gần nhất) |
| `debug` | `__xq` | `__xc` | `__xv` | tên đối tượng gắn vào `window` cho kiểm tra tự động |
| `sides` | `['Đỏ', 'Đen']` | `['Trắng', 'Đen']` | `['Đen', 'Trắng']` | tên hai bên (bên 0 đi trước) |
| `title` | Cờ Tướng Luyện Tập | Cờ Vua Luyện Tập | Cờ Vây Luyện Tập | tiêu đề báo lỗi, lời mời chơi |
| `app` | `co-tuong-luyen-tap` | `co-vua-luyen-tap` | `co-vay-luyen-tap` | mã app trong tệp sao lưu (không khôi phục chéo), tên tệp sao lưu |
| `store` | `xq_` | `xc_` | `xv_` | tiền tố mọi khoá lưu trên máy |
| `netPrefix` | `xqvn-` | `xcvn-` | `xgvn-` | mã máy trên điểm hẹn (phòng các loại cờ tách riêng) |
| `keys` | … | … | … | danh sách khoá được sao lưu |
| `fsf` | biến thể xiangqi + NNUE | biến thể chess | (không có) | cấu hình Fairy-Stockfish |
| `fmt` | đổi ký hiệu Hán | (không có) | (không có) | định dạng thông báo |
| `puzName` | (không có: "chiếu hết") | (không có) | `bắt quân` | tên bài tập trong lời tóm tắt sao lưu |
| `checkKey` | (tuỳ chọn) | (tuỳ chọn) | (không có) | lọc thêm dữ liệu khi khôi phục |

**`HOOKS`** (trong `03-hooks.js`): các hàm dính luật mà phần chung gọi tới. Các tệp `03-hooks.js` có **cùng tên hàm**:

| Nhóm | Hàm | Cờ tướng | Cờ vua | Cờ vây |
|---|---|---|---|---|
| `play` | `select(play, sq, side)` | chọn quân, đi quân | + hỏi quân phong cấp | đặt quân (bàn lớn bấm hai lần), `sq = -2` là bỏ lượt, lúc đếm điểm thì đánh dấu quân chết |
| | `allowMove(play, m, byUser)` | chặn chiếu dai / đuổi dai | luôn cho đi | luôn cho đi |
| | `checkEnd(play)` | hết nước đi thua; lặp thế; 300 nửa nước hòa | chiếu hết, pat, 50 nước, lặp 3 lần, không đủ quân | hai lần bỏ lượt: đếm điểm; cờ bắt quân: ăn trước thắng |
| | `init`, `reset`, `drawExtra` | (trống) | bảng chọn quân phong cấp | nút Bỏ lượt, chọn cỡ bàn, bảng đếm điểm, vẽ đất |
| | `startFen(play)` *(tuỳ chọn)* | (không có) | (không có) | bàn trống theo cỡ bàn / kiểu chơi đã chọn, gọi ở mỗi ván mới |
| | `blockedKind(play, m)` | máy tránh nước bị chặn | (không có) | (không có) |
| `ana` | `AN`, `mineItem`, `init`, `engineSize`, `unitNote`, `firstClass` | ngưỡng điểm, bài "Lỗi của bạn"… | như cờ tướng, thang phần trăm Tốt | (không có: không ghép `80-analysis.js`) |
| `boot` | `settings()` | Cài đặt › cách ghi nước | Cài đặt › luôn phong Hậu | Cài đặt › bấm hai lần để đặt quân |
| | `init()` | `Puz`, `Tac`, `Op`, `Ana` | như cờ tướng | `Les`, `Puz`, `Ana` |
| | `onTab(name)` | vẽ lại danh sách Chiến thuật / Phân tích khi mở tab | như cờ tướng | vẽ lại Bài học / Ván đã lưu |
| | `busy(tab)` | đang giải bài / tập khai cuộc dở | như cờ tướng | đang giải bài / học dở |
| | `engineInfo(yn)` | dòng tình trạng Fairy-Stockfish trong báo lỗi | như cờ tướng | máy Monte-Carlo |
| | `expose()` | `Puz`, `Tac`, `Op`, `FSF`, `Ana`, `vi` | `Puz`, `Tac`, `Op`, `FSF`, `Ana` | `Puz`, `Les`, `Ana`, `GO` |

Thêm một khác biệt mới giữa các loại cờ vào phần chung: thêm hàm vào **mọi** `03-hooks.js` (cùng tên), rồi gọi qua `HOOKS`.
Hàm tuỳ chọn (chỉ một loại cờ cần) thì phần chung phải kiểm tra có hay không trước khi gọi, như `HOOKS.play.startFen`.

Phần chung chơi qua mạng gửi kèm thế bắt đầu (`fen`) trong các tin `state`, `rematch`, `snap` và trong phiên lưu trên máy,
nên khách và người xem dựng đúng bàn của chủ phòng (cờ vây: cỡ bàn). Tin không có `fen` (bản cũ) thì dùng `RULES.START_FEN`.

## 4. Tệp song sinh: riêng nhưng còn giống nhau một phần

Cờ vua được làm từ khung của cờ tướng. Bốn cặp giống nhau nhiều nhất (`40-play`, `42-play-net`, `80-analysis`, `99-boot`)
**đã gộp** vào `src/shared/app/`, phần khác nhau đưa vào `HOOKS`. Còn lại là **tệp song sinh** giữa cờ tướng và cờ vua: cùng
tên, cùng cấu trúc, khác ở chỗ dính tới luật, nên vẫn để riêng. Dòng đầu mỗi tệp song sinh ghi tên bản kia và mức giống nhau.

| Tệp (trong `src/xiangqi/app/` và `src/chess/app/`) | Giống nhau | Phần khác nhau chính |
|---|---|---|
| `10-engine.js` | ~78% | lõi gọi trong Web Worker, bảng cấp độ |
| `41-play-ai.js` | ~74% | sách khai cuộc, nước mở đầu, tránh nước bị chặn (cờ tướng) |
| `90-tactics.js` | ~67% | chủ đề bài, nhiều nước trong lời giải, phong cấp |
| `50-puzzles.js` | ~64% | nguồn bài, cách kiểm tra lời giải |
| `60-openings.js` | ~54% | nhóm khai cuộc, bên người học |
| `20-board.js` | ~39% | bàn 9×10 có sông ↔ bàn 8×8 |
| `index.template.html` | ~90% | phần Giới thiệu (luật), tuỳ chọn riêng, bảng phong cấp |

Cờ vây khác hẳn nên các tệp trong `src/go/app/` **không** là song sinh: chúng chỉ giữ cùng tên hàm mà phần chung gọi tới
(`Board.render/flip/setFlip/face`, `Play.initAi/showAiSetup/engineMove/showHint/analyze`, `Ana.games/cur/init/openCurrent/renderList`,
`Engine.init/call`, `LEVELS[k].name` dạng "số – tên (ghi chú)"). Riêng khung trang `src/go/index.template.html` giữ nguyên các
phần chung (màn chơi, chơi qua mạng, giới thiệu, quyền riêng tư) như hai khung kia: sửa phần chung thì sửa cả ba.

**Quy tắc khi sửa tệp song sinh:** sửa lỗi ở phần giống nhau thì mở bản bên kia, sửa giống hệt, rồi chạy `npm test`. Thấy một
đoạn giống hệt nhau ở cả hai bản mà không dính tới luật thì nên chuyển hẳn sang `src/shared/app/` (xem mục 6).

## 5. Muốn sửa X thì sửa ở đâu

| Muốn sửa | Sửa ở | Ảnh hưởng |
|---|---|---|
| Luật đi, luật hòa, ký hiệu nước đi của một loại cờ | `src/<loại cờ>/core/` (+ `02-notation.js`) | chỉ loại cờ đó |
| Sức mạnh máy tự viết | `src/<loại cờ>/core/` (engine) và `10-engine.js` (bảng cấp) | chỉ loại cờ đó |
| Máy cấp 6, phân tích ván (Fairy-Stockfish) | `src/shared/app/30-fsf.js`, `80-analysis.js` (chung), `GAME.fsf` (riêng) | cờ tướng, cờ vua |
| Đếm điểm, đoán quân chết (cờ vây) | `src/go/core/go.js` (`score`, `guessDead`), `src/go/core/kata.js` (`deadFromOwnership`), `HOOKS.play` trong `src/go/app/03-hooks.js` (qua mạng: máy chủ phòng đếm rồi gửi tin `over`) | cờ vây |
| Máy KataGo (cờ vây cấp 3–6, gợi ý, ước lượng điểm) | `src/go/core/kata.js`, `src/go/app/15-kata.js`, bảng cấp `src/go/app/10-engine.js`, tệp trong `engine/` | cờ vây |
| Màu sắc, bố cục, nút, thẻ | `src/shared/base.css` | mọi app |
| Màu bàn cờ, quân, ô bị chiếu | `src/<loại cờ>/game.css`, `20-board.js` | chỉ loại cờ đó |
| Chơi qua mạng (kết nối, phòng, xem trận) | `src/shared/app/45-net.js`, `server/` | mọi app |
| Màn chơi, đồng hồ, lời xin hòa / đi lại, lưu ván | `src/shared/app/40-play.js` | mọi app |
| Luật kết thúc ván, chặn nước, phong cấp, bỏ lượt | `HOOKS.play` trong `03-hooks.js` | chỉ loại cờ đó |
| Màn chơi qua mạng (nút, thông báo) | `src/shared/app/42-play-net.js` | mọi app |
| Danh sách bài (chia phần, "Xem thêm") | `pagedGrid` trong `src/shared/app/01-util.js` | mọi app |
| Sao lưu, quyền riêng tư, xoá dữ liệu | `src/shared/app/70-settings.js` | mọi app |
| Chữ trong mục Giới thiệu, chính sách | `index.template.html` của **cả ba** + `docs/CHINH-SACH-RIENG-TU.md` | mọi app |
| Bài tập, khai cuộc, sách của máy | `tools/<loại cờ>/` rồi dựng lại `data/<loại cờ>/` (không sửa tay JSON) | chỉ loại cờ đó |
| Bài học luật cờ vây | `data/go/lessons.json` (soạn tay; `tests/unit/go/content.test.js` kiểm tra từng bước) | cờ vây |
| Lưu ngoại tuyến, tiêu đề bảo mật | `src/shared/assets/sw.js`, `scripts/build.js` | mọi trang |
| Trang chủ chọn loại cờ | `src/portal/index.html` | trang chủ |

## 6. Thêm loại cờ mới hoặc gom thêm phần chung

**Thêm loại cờ mới**: tạo `src/<tên>/` (lấy `src/chess/` làm mẫu nếu giống cờ vua, `src/go/` nếu khác hẳn), viết lõi luật trong
`core/` (có đủ các tên ở mục 3), viết `00-game.js` (tiền tố lưu trữ, tiền tố mạng, mã app riêng, `debug`, `sides`), `03-hooks.js`
(đủ các hàm ở mục 3), thêm một mục vào `APPS` trong `scripts/build.js` (kèm `skip` nếu không dùng Fairy-Stockfish), thêm tiền tố
mạng vào `ID_RE`, `ROOM_NS` và `isWatcher` trong `server/core.mjs` (cần triển khai lại điểm hẹn), thêm thẻ vào trang chủ.
Tạo `data/<tên>/`, `tools/<tên>/`, `tests/unit/<tên>/`, `tests/e2e/<tên>/`. Trang mới tự có trong `PAGES` của service worker.

**Gom phần chung** (giảm tệp song sinh): chuyển một hàm giống hệt nhau ở hai bản vào một module trong `src/shared/app/`
(chọn số đầu tên tệp sao cho đứng trước module dùng nó), chỗ khác nhau thì đưa thành trường trong `GAME` hoặc hàm trong `HOOKS`.
Chạy `npm test`. Đã gộp: `40-play.js`, `42-play-net.js`, `80-analysis.js`, `99-boot.js`. Ứng viên tiếp theo: `10-engine.js`
(phần Worker giống nhau ở cả ba app), `41-play-ai.js`.

## 7. Kiểm tra

`npm test` chạy lint, kiểm tra đơn vị (`tests/unit/**`) và kiểm tra giao diện (`tests/e2e/**`) của **mọi** loại cờ cùng phần
chung. Chạy riêng một loại cờ khi đang sửa:

```bash
node --test "tests/unit/go/*.test.js"
npx playwright test tests/e2e/go
```
