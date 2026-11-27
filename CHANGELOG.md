# Nhật ký thay đổi

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/); số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [2.4.0] – 2026-11-27

### Thêm
- **Cờ Vây – phân tích cả ván bằng KataGo** (tab Ván đã lưu, nút "Phân tích cả ván"): KataGo đánh giá lần lượt mọi thế của ván (mỗi thế một lần chạy mạng; ván 19×19 khoảng một phút trên điện thoại cũ, có báo tiến độ, chuyển ván khác thì dừng).
  - Biểu đồ khả năng thắng của Đen theo từng nước; bấm vào biểu đồ để nhảy tới nước đó.
  - Đánh dấu nước dở `?` (khả năng thắng của bên đi tụt từ 10%) và nước hỏng `??` (từ 20%); khi ván đã ngã ngũ thì xét số điểm mất (5 / 10 điểm). Nước bị đánh dấu được tô màu trong danh sách nước và liệt kê riêng để bấm tới.
  - Ở thế ngay trước một nước bị đánh dấu, bàn vẽ vòng tròn ở nước KataGo đề nghị, dòng dưới bàn nói khả năng thắng và số điểm hơn kém.
  - Kết quả lưu cùng ván (trường `ana` của ván trong bộ nhớ máy và tệp sao lưu); dữ liệu không hợp lệ thì bỏ qua.
- Kiểm tra e2e mới cho phân tích cả ván.

## [2.3.0] – 2026-11-27

### Thêm
- **Cờ Vây: máy KataGo.** Mạng nơ-ron KataGo g170 (10 khối, phạm vi công cộng CC0) chạy ngay trong trình duyệt bằng TensorFlow.js (WebAssembly), trong Web Worker, không gửi thế cờ đi đâu. Chỉ tải (khoảng 7 MB, một lần, sau đó dùng được khi không có mạng) khi người chơi chọn cấp KataGo hoặc bấm "Tải KataGo ngay" trong Cài đặt.
  - Đấu máy nay 6 cấp: 1–2 máy Monte-Carlo như trước (không cần tải), 3 KataGo đi theo cảm giác (có ngẫu nhiên), 4 KataGo đi nước đầu tiên nghĩ ra, 5 và 6 KataGo đọc khoảng 2 và 6 giây. Người mới mặc định cấp 2.
  - Gợi ý nước, đếm điểm khi hai bên bỏ lượt (đoán quân chết) và "Ước lượng điểm" trong Ván đã lưu dùng KataGo nếu đã tải; ước lượng điểm có thêm tỉ lệ thắng và số điểm hơn kém. Không chạy được KataGo thì tự quay về máy Monte-Carlo.
  - Mã viết lại: `src/go/core/kata.js` (đặc trưng đầu vào, thang, đất sống chắc kiểu Benson, mạng, tìm kiếm PUCT), `src/go/app/15-kata.js` (Worker); công cụ đổi mạng `tools/go/kata_convert.js` (gộp lớp chuẩn hoá, lưu float16). Thư viện và mạng trong `engine/` (mã băm trong `engine/SHA256SUMS`).
- Kiểm tra mới: `tests/unit/go/kata.test.js` so kết quả mạng với chương trình KataGo 1.18.1 thật trên 8 thế cờ (`tests/unit/go/kata-ref.json`), kiểm tra thang, đất Benson, quân chết, tìm kiếm; e2e đấu KataGo cấp 4, gợi ý, đếm điểm qua mạng có người xem.

### Thay đổi
- Cờ vây chơi qua mạng: máy chủ phòng đếm điểm rồi gửi kết quả (tin mới `over`, kèm danh sách quân chết) cho khách và người xem, thay cho việc mỗi máy tự tính. Khách chờ tối đa 20 giây; không nhận được (chủ phòng dùng bản 2.2.0) thì tự đếm như trước.
- Bảng đếm điểm hiện "Máy đang đoán quân chết…" trong lúc tính (không làm đứng trang); qua mạng không còn nút Xác nhận / Chơi tiếp.
- `scripts/build.js`: `core` của một app có thể là danh sách tệp (cờ vây: `go.js` + `kata.js`).
- Giấy phép: `NOTICE` thêm TensorFlow.js (Apache-2.0), mạng KataGo (CC0) và thông báo MIT của KataGo cho phần viết lại.

## [2.2.0] – 2026-11-26

### Thêm
- **Cờ Vây** (`/co-vay/`), app thứ ba dùng chung khung với cờ tướng, cờ vua:
  - Bàn 9×9, 13×13, 19×19; luật Trung Quốc (đếm quân và đất, Trắng được 7,5 điểm bù), cấm tự sát, cấm lặp lại thế cờ toàn bàn (siêu kiếp). Bàn 13×13, 19×19 bấm hai lần để đặt quân (đổi được trong Cài đặt).
  - Đấu máy 5 cấp: máy Monte-Carlo (UCT + RAVE) tự viết, chạy trong Web Worker, biết bỏ lượt. Kiểu "cờ bắt quân" (ăn quân trước là thắng) cho người mới.
  - Hai người một máy, chơi qua mạng và xem trận (chủ phòng chọn cỡ bàn). Hai bên bỏ lượt thì đếm điểm: máy đánh dấu sẵn quân chết, người chơi sửa rồi xác nhận hoặc chơi tiếp; qua mạng thì hai máy tự tính ra cùng một kết quả.
  - Bài học luật: 10 bài có bàn cờ tương tác (khí, ăn quân, chạy thoát, chỗ cấm đặt quân, kiếp, hai mắt, thang, lưới, đếm điểm).
  - Bắt quân: 260 bài bắt nhóm quân trong 1–5 nước, sinh bằng `tools/go/gen_puzzles.js`, kiểm bằng bộ giải của lõi luật.
  - Ván đã lưu: xem lại từng nước, ước lượng điểm, xuất / nhập SGF, xoá ván.
- Trang chủ có thẻ Cờ Vây. Điểm hẹn nhận tiền tố mã máy `xgvn-` (phòng cờ vây tách riêng, khoá `g:<mã phòng>`); cần triển khai lại điểm hẹn.
- Kiểm tra mới: `tests/unit/go/` (luật, đếm điểm, SGF, bộ giải, máy chơi, toàn bộ bài học và bài bắt quân), `tests/e2e/go/` (đấu máy, hai người, đếm điểm, bàn 19×19, qua mạng, xem trận, tải lại trang giữa ván, bài học, bắt quân, SGF).

### Thay đổi
- `scripts/build.js`: mục `skip` cho app không ghép một số module dùng chung (cờ vây bỏ `30-fsf.js`, `80-analysis.js`); danh sách trang của service worker (`PAGES`) do build tự điền từ danh sách app.
- `99-boot.js` không còn gọi thẳng các tab riêng: `HOOKS.boot` có thêm `init`, `onTab`, `busy`, `engineInfo` ở cả ba app.
- Chơi qua mạng gửi kèm thế bắt đầu (`fen`) trong tin `state`, `rematch`, `snap` và lưu trong phiên trên máy, để khách và người xem dựng đúng bàn của chủ phòng. Tin của bản cũ không có `fen` vẫn chạy như trước.
- `40-play.js` gọi `HOOKS.play.startFen` (tuỳ chọn) ở mỗi ván mới.
- Tóm tắt tệp sao lưu chỉ nhắc các mục app đó có; tên tệp sao lưu theo loại cờ (`co-vua-sao-luu-…`, `co-vay-sao-luu-…`, trước đây luôn là `co-tuong-…`). Lời mời chơi qua mạng ghi đúng loại cờ (trước đây cờ vua cũng ghi "cờ tướng").
- Chính sách quyền riêng tư (trong app và `docs/CHINH-SACH-RIENG-TU.md`) ghi người phát triển của cả ba app; nội dung xử lý dữ liệu không đổi nên không hỏi lại sự đồng ý.

## [2.1.0] – 2026-11-26

### Thêm
- Cờ tướng: bài chiếu hết tăng từ 98 lên 1078 bài (1–6 nước; 718 bài Đen đi), sinh bằng bộ giải chiếu hết của app, mỗi bài được kiểm chứng đúng số nước tối thiểu và chỉ một nước đầu đúng.
- Cờ tướng: bài chiến thuật tăng từ 89 lên 429 bài, sinh bằng Pikafish tự đấu (2.079 ván, 3 Pikafish chạy song song trong 2 giờ). Hạng bài nay chia tới 1800: Nhập môn 337, Trung bình 47, Nâng cao 45.

### Thay đổi
- `tools/xiangqi/gen_puzzles.js`: đặt được số bài mỗi mức, chọn đa dạng tổ hợp quân, bỏ bài trùng (kể cả lật, xoay bàn). `build_puzzles.js --append` giữ bài cũ.
- `tools/xiangqi/gen_tactics.js`: chạy nhiều Pikafish song song (`--workers`), giới hạn theo thời gian (`--minutes`), ghi từng bài ngay, giữ mã bài cũ.

## [2.0.2] – 2026-11-26

Sắp xếp lại mã nguồn cho dễ bảo trì và làm trang cờ vua nhẹ hơn. Ngoài danh sách bài có nút "Xem thêm", giao diện giống hệt bản 2.0.1 (so từng điểm ảnh trên cả ba trang).

### Thay đổi
- Mỗi loại cờ một thư mục riêng, cùng quy tắc ở mọi nơi: `xiangqi/` (cờ tướng), `chess/` (cờ vua), `shared/` hoặc `net/` (dùng chung) trong `src/`, `data/`, `tools/`, `tests/`.
  Lõi luật chuyển vào `src/xiangqi/core/`, `src/chess/core/`; module chung vào `src/shared/app/`; icon và service worker vào `src/shared/assets/`.
- Tách CSS: phần chung `src/shared/base.css`, phần riêng `src/xiangqi/game.css`, `src/chess/game.css` (trước đây chép lặp trong hai khung trang).
- Dòng đầu mỗi tệp mã nguồn ghi nhãn [DÙNG CHUNG] / [CỜ TƯỚNG] / [CỜ VUA]; tệp song sinh ghi tên bản bên kia và mức giống nhau.
- Tài liệu mới: `docs/CAU-TRUC.md` (sơ đồ, ranh giới chung/riêng, bảng "muốn sửa X thì sửa ở đâu", cách thêm loại cờ), `docs/DU-LIEU-CO-VUA.md`; `docs/data.md` đổi tên thành `docs/DU-LIEU-CO-TUONG.md`. README ngắn trong `src/`, `data/`, `tools/`, `tests/`.
- Gộp bốn cặp tệp song sinh vào phần dùng chung (`src/shared/app/40-play.js`, `42-play-net.js`, `80-analysis.js`, `99-boot.js`); khoảng 1.000 dòng lặp được bỏ. Phần dính luật từng loại cờ đi qua `HOOKS` (`src/<loại cờ>/app/03-hooks.js`), lõi cờ tướng thêm `XQ.mFrom`, `XQ.mTo` cho giống lõi cờ vua.
- Danh sách bài Chiếu hết và Chiến thuật vẽ từng phần 60 bài, nút "Xem thêm" vẽ tiếp, lần đầu vẽ đủ để thấy bài chưa giải đầu tiên. Trang cờ vua lúc mở giảm từ khoảng 17.400 xuống 2.600 phần tử, nhẹ và mượt hơn trên điện thoại cũ.
- Kiểm tra trang chủ tách ra `tests/e2e/shared/portal.spec.js`. Cần Node.js 22 trở lên (chạy kiểm tra đơn vị theo mẫu thư mục).

## [2.0.1] – 2026-11-26

### Thay đổi
- Repo đổi tên thành `mercyk24/co-luyen-tap`. Trang web chuyển sang https://mercyk24.github.io/co-luyen-tap/ (địa chỉ cũ `…/Co-tuong-Xiangqi-/` không còn). Liên kết báo lỗi và mục liên hệ trong chính sách quyền riêng tư trỏ sang repo mới; nội dung chính sách không đổi nên không hỏi đồng ý lại.
- Cập nhật thư viện kiểm tra và GitHub Actions theo các đề xuất của Dependabot (#1–#6): @playwright/test 1.65.1, actions/checkout 7, actions/setup-node 7, actions/upload-artifact 7, actions/upload-pages-artifact 5, actions/deploy-pages 5.

## [2.0.0] – 2026-11-26

### Thêm
- **Trang chủ chọn loại cờ** ở địa chỉ gốc. Cờ tướng chuyển sang `/co-tuong/`, cờ vua ở `/co-vua/`. Trang chủ đánh dấu loại cờ chơi gần nhất. Link mời cũ dạng `…/#phong=ABC123` tự chuyển sang cờ tướng và vào đúng phòng.
- **Cờ Vua** với đủ các phần như cờ tướng:
  - Luật đầy đủ: nhập thành, bắt tốt qua đường, phong cấp (chọn quân, hoặc bật "Luôn phong Hậu"), chiếu hết, pat, lặp lại ba lần, luật 50 nước, không đủ quân. Lõi luật mới `src/core/chess.js`, kiểm bằng perft.
  - Ghi nước theo ký hiệu quốc tế (SAN).
  - Đấu máy 6 cấp (cấp 6: Fairy-Stockfish), sách khai cuộc của máy; hai người một máy; chơi qua mạng và xem trận; phân tích ván và "Lỗi của bạn".
  - Chiếu hết 1–5 nước và chiến thuật từ kho bài tập Lichess (CC0), lời giải được kiểm lại bằng lõi luật.
  - Khai cuộc: 13 nhóm có giới thiệu tiếng Việt, 92 biến chính, tên theo danh mục Lichess (CC0).
  - Hình quân cburnett (GPLv2+).
- Công cụ `tools/chess/fetch-data.mjs` (tải nguyên liệu) và `tools/chess/build-data.js` (dựng `data/chess/*.json`, kiểm từng nước).

### Thay đổi
- Mã dùng chung hai app chuyển sang `src/shared/` (tiện ích, lưu trữ, engine mạnh, chơi qua mạng, cài đặt, sao lưu, báo lỗi), đọc cấu hình `GAME` của từng app. Dữ liệu, tiến độ, cài đặt, tệp sao lưu và sự đồng ý chơi qua mạng của hai loại cờ tách riêng; tệp sao lưu cờ tướng không khôi phục được vào cờ vua và ngược lại.
- Một service worker dùng chung cho cả ba trang (lưu ngoại tuyến từng trang, engine dùng chung). Mỗi loại cờ cài lên màn hình chính thành một biểu tượng riêng.
- Điểm hẹn riêng (`server/`) nhận thêm mã máy cờ vua `xcvn-…`, giữ phòng của hai loại cờ tách riêng. **Cần `wrangler deploy` lại** để cờ vua dùng điểm hẹn riêng; chưa deploy thì cờ vua tự dùng `0.peerjs.com`.
- Máy mở đầu đa dạng hơn: sách khai cuộc cờ tướng do Pikafish sinh mở rộng từ 597 lên 2355 thế (mỗi thế giữ tới 4 nước tốt, sâu tới 7 nửa nước); sách cờ vua 3500 thế, sâu tới 16 nửa nước, bỏ các khai cuộc đùa và nước kém.
- Chính sách quyền riêng tư ghi tên cả hai app; cách xử lý dữ liệu không đổi nên không hỏi đồng ý lại.

### Sửa lỗi
- Chơi qua mạng với điểm hẹn riêng: khi mã phòng bắt đầu bằng chữ W (khoảng 1/32 số phòng), điểm hẹn nhầm chủ phòng là người xem nên khách không vào được phòng (báo không tìm thấy). Lỗi có từ bản 1.6.0; cần deploy lại điểm hẹn để hết.

### Lưu ý khi nâng cấp
- Người đã cài cờ tướng lên màn hình chính từ bản cũ (địa chỉ gốc): mở biểu tượng cũ sẽ vào trang chủ; chọn Cờ Tướng rồi cài lại để có biểu tượng mở thẳng vào cờ tướng. Dữ liệu cũ vẫn còn vì cùng tên miền và cùng khoá lưu trữ.

## [1.8.0] – 2026-11-25

### Thêm
- **Luật chiếu dai, đuổi dai.** Trước đây thế cờ lặp lại ba lần luôn là hòa, nên bên đang thua có thể chiếu liên tục để ép hòa. Nay:
  - Mỗi bên được chiếu liên tục (hoặc đuổi bắt liên tục một quân) tối đa 4 nước làm thế cờ lặp lại. Nước thứ 4 app nhắc trước; nước thứ 5 như vậy **không được đi**, người chơi phải chọn nước khác.
  - Thế cờ lặp lại ba lần mà không bên nào chiếu dai, đuổi dai thì hòa như trước; có bên đang chiếu (đuổi) dai thì ván tiếp tục cho tới khi bên đó phải đổi nước.
  - Áp dụng cho mọi chế độ, kể cả chơi qua mạng. Máy (cấp 1–6) tự tránh nước bị chặn.
  - Bản rút gọn của luật thi đấu: "đuổi" là quân vừa đi (không phải Tướng, Tốt) tạo thế ăn mới vào quân không được bảo vệ hoặc quân giá trị cao hơn; Tốt chưa qua sông được đuổi tự do. Chưa xét đuổi bằng nước mở đường cho quân khác.
- **Báo lỗi tự nguyện** (Giới thiệu › Báo lỗi): app ghi tối đa 30 lỗi gần nhất trên máy. Người dùng bấm "Xem thông tin lỗi" để đọc trước nội dung (phiên bản, loại máy, trình duyệt, lỗi, nhật ký kết nối; không có ván cờ hay dữ liệu cá nhân), rồi tự chép gửi. App không tự gửi gì đi; xoá nhật ký được.

### Thay đổi
- Tách phần chơi: `40-play.js` (phần chung) thêm `41-play-ai.js` (đấu với máy) và `42-play-net.js` (giao diện chơi qua mạng). Không đổi cách dùng.
- `tools/load-signal.mjs --check` chỉ kiểm tra giao thức, không tự thử tải nữa (muốn thử tải thì thêm `--cap`).

## [1.7.0] – 2026-11-25

Bước chuẩn bị đầu tiên trước khi xin phép thương mại hoá: bảo mật và quyền riêng tư. Lộ trình đầy đủ: `docs/PHAP-LY.md`.

### Thêm
- **Xin đồng ý trước khi chơi qua mạng.** Lần đầu vào "Chơi qua mạng" (hoặc mở link mời), app nói rõ dữ liệu nào rời khỏi máy (địa chỉ IP, mã phòng, nước đi), đi đâu (đối thủ, điểm hẹn trên Cloudflare, 0.peerjs.com, STUN của Google và Cloudflare, có thể ở nước ngoài) và chờ bấm "Tôi đồng ý".
  - Không có ô đánh dấu sẵn. Không đồng ý thì không kết nối gì, các chế độ khác vẫn dùng bình thường.
  - App lưu thời điểm và phiên bản nội dung đã đồng ý. Đổi chính sách thì hỏi lại.
- **Mục Quyền riêng tư** trong Giới thiệu: xem và rút lại sự đồng ý, xoá toàn bộ dữ liệu của app trên máy, đọc chính sách quyền riêng tư đầy đủ (cũng có ở `docs/CHINH-SACH-RIENG-TU.md`).
- Tệp `NOTICE` liệt kê thành phần bên thứ ba và nguồn gốc dữ liệu. `docs/PHAP-LY.md`: phân loại G1/G4, các bước xin phép, các hướng xử lý việc chuyển dữ liệu ra máy chủ nước ngoài.

### Bảo mật
- **Chính sách nội dung (CSP):** trang chỉ chạy đúng mã của app (theo mã băm, tính khi dựng), không dùng `eval`, chỉ kết nối tới điểm hẹn của app. Mã có lọt vào trang cũng không chạy được.
  - Lõi luật cờ nạp bằng thẻ script thường thay cho `eval`; engine tự viết không còn dùng `new Function`.
  - Thêm tiêu đề chống nhúng trang vào khung, chống đoán kiểu tệp, không gửi Referer, tắt camera/micro/vị trí. Trên GitHub Pages, service worker tự thêm các tiêu đề này.
- **Khôi phục từ tệp sao lưu:** chỉ nhận các mục app dùng, từ chối tệp quá lớn, dữ liệu sai dạng hoặc có ký tự dùng để chèn mã. Sự đồng ý chơi qua mạng không lấy từ tệp.
- **Máy chủ:** giới hạn 120 lần mở kết nối mỗi phút cho một địa chỉ IP. Tắt nhật ký từng lượt truy cập (có IP và thẻ phiên), chỉ ghi lỗi.
- **Chuỗi cung ứng:** bộ kiểm tra so mã băm SHA-256 của engine (`engine/SHA256SUMS`); Dependabot cho npm và GitHub Actions; `npm audit` trong CI; GitHub Actions ghim theo mã commit.

### Sửa
- Lời nhắc ở mục Phân tích ván và "Lỗi của bạn" còn nhắc "tab Đấu máy" và "từ 4 nước".
- Trang Giới thiệu ghi "không thu thập dữ liệu", chưa đúng khi chơi qua mạng; nay nói rõ và trỏ tới mục Quyền riêng tư.

## [1.6.0] – 2026-11-25

### Thêm
- **Xem trận đấu qua mạng.** Khi nhập mã một phòng đã đủ hai người, app hỏi "Bạn có muốn vào xem trận đấu không?".
  - Người xem thấy bàn cờ, đồng hồ và kết quả, nhưng không đi quân được.
  - Nếu hai người đấu lại, bàn cờ tự hiện ván mới.
- **Hai người chơi thấy số người đang xem.** Người tạo phòng có thể tắt "Cho người khác vào xem trận" khi tạo phòng.
- **Điểm hẹn riêng có vai người xem** (tối đa 20 người mỗi phòng, tính riêng với người chơi):
  - Chủ phòng phát thế cờ một lần (tin `CAST`), máy chủ chuyển tới mọi người xem.
  - Tin máy chủ gửi đi không tính phí trên Cloudflare.
  - Chỉ có khi dùng điểm hẹn riêng; ở điểm hẹn dự phòng `0.peerjs.com` thì không xem được.

## [1.5.0] – 2026-11-25

### Thay đổi
- **Trang chủ chọn cách chơi:** Đấu với máy, Hai người một máy, Chơi qua mạng, kèm lối tắt luyện tập (Chiếu hết, Chiến thuật, Khai cuộc, Phân tích ván). Tab đầu tiên đổi tên thành "Trang chủ".
- **Ba màn hình nối tiếp, không chồng lên nhau:** trang chủ → màn chuẩn bị (không có bàn cờ) → bàn cờ (chỉ bàn cờ và thanh của hai bên).
- **Đấu với máy có màn chuẩn bị riêng:** chọn bên cầm (Đỏ, Đen hoặc ngẫu nhiên), cấp độ và nước mở đầu của máy rồi mới vào ván. Máy không tự đi khi chưa bấm Bắt đầu.
- **Về trang chủ giữa ván:** menu ☰ có "Về trang chủ (giữ ván)". Trang chủ hiện thẻ ván đang dở với hai nút Tiếp tục và Bỏ ván; ván hai người thì đồng hồ dừng trong lúc ở trang chủ.
- **Thẻ kết quả:** nút "Ván mới" mở lại màn chuẩn bị của chế độ đang chơi; nút "Trang chủ" về màn chọn cách chơi.

## [1.4.0] – 2026-11-25

### Thêm
- **Điểm hẹn riêng cho chơi qua mạng** (`server/`), chạy trên Cloudflare Workers + Durable Objects (mỗi phòng một ô riêng), nói cùng giao thức PeerJS, đặt tại `co-tuong.cotuong-mercy.workers.dev`. Có bản chạy trên máy bằng Node (`npm run signal`).
- Thử tải bản thật trên Cloudflare: 5000 người kết nối cùng lúc (2500 cặp), thành công 100%, tin qua máy chủ trung vị 86 ms (`npm run load`, `docs/MO-RONG.md`).
- Khi mạng không cho hai máy nối thẳng, ván tự đi qua điểm hẹn riêng thay vì báo lỗi.
- App thử lần lượt nhiều điểm hẹn: điểm hẹn riêng trước, `0.peerjs.com` dự phòng; khách không thấy phòng ở điểm hẹn đầu thì tìm tiếp ở điểm hẹn sau.
- Bản sao trang web trên Cloudflare (cùng worker), kèm tiêu đề COOP/COEP (`dist/_headers`), để không phụ thuộc giới hạn băng thông của GitHub Pages.

### Thay đổi
- Máy giữ cố định một "thẻ" suốt ván, nên khi rớt mạng có thể nối lại đúng mã máy cũ ngay, không phải chờ điểm hẹn xoá kết nối cũ.
- Điểm hẹn riêng: nhịp tim 30 giây (Cloudflare tự trả lời, không đánh thức máy chủ); máy kia biết ngay khi một máy rời điểm hẹn.

## [1.3.0] – 2026-11-24

### Thêm
- **Chơi qua mạng** giữa hai thiết bị (tab Đấu máy → "Qua mạng"): tạo phòng với mã 6 ký tự hoặc gửi link mời, chọn bên cầm và thời gian; hai máy nối thẳng bằng WebRTC, không cần tài khoản, nước đi không qua máy chủ.
  - Mỗi người một thanh ở phía mình; xin hòa, xin đi lại, đấu lại (đổi màu) đều phải được đối thủ đồng ý.
  - Rớt mạng thì báo rõ, tự nối lại và đồng bộ lại ván; đồng hồ tạm dừng khi mất kết nối; mở lại app (trong 2 giờ) vẫn nối tiếp ván đang dở.
  - Tự đồng bộ lại khi một nước đi bị rơi trên đường; không tin tin giả "hết giờ" hay giờ khai khống từ máy đối thủ.
  - Báo lỗi dễ hiểu và đúng nguyên nhân: không tìm thấy phòng, chủ phòng không phản hồi, phòng đã có người, điểm hẹn kết nối bị ngắt, mạng chặn kết nối thẳng, khác phiên bản app.
  - Điểm hẹn kết nối ngắt đúng lúc đang vào phòng thì tự vào lại, không bắt người chơi chờ rồi báo lỗi.
  - Tin gửi lên điểm hẹn `0.peerjs.com` đúng dạng thư viện PeerJS chính thức (máy chủ chặn tin sai dạng); bộ kiểm tra tự động cũng kiểm tra dạng tin như máy chủ thật.
- App xin trình duyệt giữ dữ liệu lâu dài (giảm nguy cơ mất tiến độ).
- Tài liệu rà soát dự án cho hướng nhiều người dùng / thành ứng dụng: `docs/RA-SOAT.md`.

### Thay đổi
- Nút chọn chế độ: Với máy · Hai người · Qua mạng.

## [1.2.0] – 2026-11-24

### Thay đổi
- **Hai người chơi** luôn ngồi đối mặt: Đỏ phía dưới, Đen phía trên, quân Đen quay về phía người cầm Đen. Bỏ các lựa chọn hướng bàn khác.
- Bấm "Hai người chơi" (hoặc Ván mới ở thẻ kết quả) sẽ hiện màn **chọn thời gian** trước; chọn xong là vào ván ngay và đồng hồ của Đỏ chạy luôn.
- Giao diện gọn: trên và dưới bàn cờ mỗi người chỉ có một thanh nhỏ (nút ☰, tên bên, trạng thái, đồng hồ); thanh, câu hỏi và menu phía Đen quay ngược.
- Mọi chức năng gom vào menu ☰ của từng người: Xin đi lại, Xin hòa, Chịu thua (tính cho bên mở menu), báo nước yếu, biên bản ván. Trong lúc đánh không có nút Ván mới hay Đấu với máy, tránh bấm nhầm; hai nút này nằm ở thẻ kết quả khi ván xong.
- Bàn cờ hai người nằm giữa màn hình.
- Xin đi lại khi chơi hai người phải được bên kia đồng ý; gỡ đúng nước gần nhất của bên xin.
- Nút "Phân tích ván" của ván hai người chỉ hiện trong thẻ kết quả khi ván đã xong.
- Ván phải có ít nhất 5 nước mỗi bên (10 nước tính cả hai bên) mới được lưu và phân tích, áp dụng cho cả hai chế độ.

- **Đấu với máy** gọn lại theo cùng kiểu: trên bàn cờ là thanh của máy (bên, cấp độ, đang nghĩ), dưới là thanh của bạn. Mọi nút gom vào mục **Tùy chọn ván** (nút ☰ ở thanh của bạn): Gợi ý, Đi lại, Lật bàn, Chịu thua, Cấp độ, Báo nước yếu, biên bản ván. Phần Ván mới (bên cầm, nước mở đầu của máy, chuyển sang Hai người chơi) chỉ hiện khi chưa vào ván hoặc ván đã xong.
- Khi ván xong (cả hai chế độ), thẻ kết quả hiện Phân tích ván (nếu đủ 5 nước mỗi bên), Ván mới và nút đổi chế độ.

### Thêm
- Thanh điều hướng dưới cùng tự thu thành một **nút tròn** nhỏ ở góc dưới bên phải khi đang đánh (cả hai chế độ), đang giải bài chiếu hết / chiến thuật hoặc đang tập khai cuộc, để khỏi bấm nhầm. Bấm nút tròn để mở lại thanh; bấm ra ngoài thanh thì thanh thu lại thành nút.

## [1.1.0] – 2026-11-24

### Thêm
- Chế độ **Hai người chơi** trên một máy (tab Đấu máy): hai bên cùng đi trên một bàn cờ.
  - Hướng bàn: lật theo lượt (chuyền máy cho nhau), đối mặt (đặt máy nằm giữa, quân Đen và đồng hồ phía trên quay ngược), hoặc cố định.
  - Đồng hồ tùy chọn từ 3 đến 30 phút, có cộng giây mỗi nước; hết giờ thì thua.
  - Xin hòa (bên kia xác nhận), chịu thua, đi lại từng nước.
- Nút **Chịu thua** khi đấu với máy.
- Phân tích ván hai người: nhận xét nước đi của cả hai bên, thống kê riêng cho Đỏ và Đen.

### Thay đổi
- Nâng ESLint lên 10.15.0 (hết cảnh báo bảo mật của `npm audit`).

## [1.0.0] – 2026-11-23

Bản đầu tiên được quản lý bằng Git, kiểm tra và triển khai tự động. Gộp toàn bộ các bản dựng thủ công trước đó (bộ nhớ đệm `xq-v1` đến `xq-v9`).

### Thêm
- Sao lưu toàn bộ dữ liệu ra file JSON và khôi phục từ file (mục Giới thiệu).
- Số phiên bản và ngày dựng hiển thị trong mục Giới thiệu.
- Kiểm tra tự động: luật cờ (perft đến độ sâu 4, ký hiệu, FEN), toàn vẹn dữ liệu, giao diện đầu-cuối (kể cả engine mạnh); kiểm tra lỗi mã bằng ESLint.
- GitHub Actions: chạy kiểm tra ở mọi lần đẩy mã và tự triển khai lên GitHub Pages khi nhánh `main` đạt.
- README, tài liệu engine và quy trình sinh dữ liệu, giấy phép GPL-3.0.

### Thay đổi
- Mã giao diện tách thành 11 module trong `src/app/`; bước dựng viết lại bằng Node (`scripts/build.js`), không cần Python.
- Tên cache của service worker tự sinh theo phiên bản và nội dung, không còn phải đổi tay.
- Thư mục engine đổi từ `wasm-demo/` thành `engine/`.
- Ghi công engine chính xác hơn: mạng NNUE cờ tướng lấy từ danh sách mạng của Fairy-Stockfish.

### Tính năng đã có trước bản này
- Đấu máy 6 cấp; cấp 6 dùng Fairy-Stockfish NNUE (WebAssembly) chạy trong trình duyệt, kể cả trên iPhone.
- Sách khai cuộc cho máy (597 thế) do Pikafish sinh, máy đổi hướng ở 5–6 nước đầu.
- Phân tích ván ba mức (Nhanh, Kỹ, Rất kỹ), đường đi dự kiến, soi sâu một thế; bài tập "Lỗi của bạn".
- Chiến thuật (89 bài do Pikafish kiểm tra) với chế độ 3 phút, 5 phút, sinh tồn.
- Chiếu hết (98 bài), khai cuộc (69 biến trong 8 nhóm).
- Ghi nước đi bằng tiếng Việt, chữ Hán hoặc cả hai.
- Chạy ngoại tuyến, cài lên màn hình chính iPhone.
