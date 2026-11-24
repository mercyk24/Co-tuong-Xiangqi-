# Rà soát dự án – tháng 11/2026 (bản 1.3.0)

Mục đích: đánh giá repo theo hai hướng phát triển sau này: **có nhiều người dùng hơn** và **đóng gói thành ứng dụng trên kho (App Store / Google Play)**. Mỗi mục ghi hiện trạng, rủi ro và việc nên làm. Mức độ: 🔴 cần xử lý trước khi mở rộng · 🟠 nên làm sớm · 🟢 cải thiện thêm.

## Tóm tắt

| # | Vấn đề | Mức | Ảnh hưởng |
|---|---|---|---|
| 1 | Engine Fairy-Stockfish theo GPL-3.0 xung đột với điều khoản App Store | 🔴 | Chặn bản iOS trên App Store nếu giữ engine này |
| 2 | Điều khoản của mạng NNUE cờ tướng chưa được xác minh | 🔴 | Rủi ro pháp lý khi phát hành rộng / thương mại |
| 3 | Chơi qua mạng dựa vào điểm hẹn công cộng miễn phí, chưa có máy chủ chuyển tiếp (TURN) | 🟠 | Một số mạng không nối được; không có cam kết hoạt động |
| 4 | Ván qua mạng do máy chủ phòng giữ bản gốc, chưa có trọng tài phía máy chủ | 🟠 | Chưa đủ cho xếp hạng / thi đấu có thưởng |
| 5 | Kiểm tra tự động chỉ chạy trên Chromium, người dùng chính dùng Safari iPhone | 🟠 | Lỗi riêng của Safari có thể lọt qua |
| 6 | `40-play.js` ôm ba chế độ chơi (~900 dòng) | 🟠 | Khó sửa, dễ sinh lỗi khi thêm tính năng |
| 7 | Dữ liệu người dùng chỉ nằm trong trình duyệt | 🟢 | Đổi máy là mất nếu không sao lưu |
| 8 | Chưa có chính sách quyền riêng tư, theo dõi lỗi, gắn tag phiên bản | 🟢 | Cần khi lên kho ứng dụng / có người dùng thật |

## 1. Giấy phép 🔴

**Hiện trạng**
- Mã của app: GPL-3.0-or-later (`LICENSE`).
- Engine trong app: Fairy-Stockfish bản WebAssembly, GPL-3.0, có **một chỉnh sửa** (giới hạn bộ nhớ 512 MB) đã ghi trong `engine/README.md` kèm đường dẫn mã nguồn gốc.
- Mạng NNUE `xiangqi-c07e94a5c7cb.nnue`: lấy từ danh sách mạng của Fairy-Stockfish; **chưa xác minh điều khoản sử dụng**.
- Pikafish (GPL-3.0) chỉ chạy trên máy tính để sinh dữ liệu, không phân phối kèm app. Dữ liệu sinh ra (thế cờ, điểm đánh giá) là đầu ra của chương trình; thông thường đầu ra không chịu giấy phép của chương trình, nhưng nên ghi công.

**Theo từng hướng phát hành**
- **Web / cài từ Safari (như hiện nay):** ổn, miễn là repo vẫn công khai mã nguồn (đúng yêu cầu GPL khi phân phối engine).
- **Google Play:** GPL được chấp nhận; cần công khai mã nguồn tương ứng với bản phát hành.
- **App Store:** Quỹ Phần mềm Tự do (FSF) cho rằng điều khoản App Store áp thêm hạn chế lên người dùng, trái với GPL; năm 2011 Apple đã gỡ VLC khỏi App Store vì lý do này. Thực tế được coi là không tương thích. Các lựa chọn:
  1. Giữ bản web cho iPhone (đang chạy tốt, không qua App Store).
  2. Bản iOS **bỏ Fairy-Stockfish**: chỉ dùng engine tự viết (cấp 1–5), còn phân tích ván dùng engine tự viết hoặc một máy chủ phân tích. Phần mã bạn tự viết thì bạn là tác giả, có thể cấp thêm giấy phép khác cho bản iOS. Mọi phần lấy từ dự án GPL phải loại ra.
  3. Nếu định thu phí hay thương mại hoá: nên hỏi luật sư trước.

**Việc nên làm**
- Xác minh điều khoản mạng NNUE (hỏi tác giả mạng trên trang danh sách NNUE của Fairy-Stockfish).
- Thêm tệp `NOTICE` liệt kê thành phần bên thứ ba: Fairy-Stockfish, mạng NNUE, Pikafish (dữ liệu), máy chủ PeerJS (dịch vụ).

## 2. Chơi qua mạng 🟠

**Kiến trúc (bản 1.3.0)**
- Hai máy nối thẳng bằng WebRTC (kênh dữ liệu). Nước đi không qua máy chủ nào.
- Để tìm thấy nhau, hai máy dùng điểm hẹn công cộng `0.peerjs.com` (chỉ chuyển lời mời kết nối) và máy chủ STUN của Google, Cloudflare. Phần kết nối tự viết (`src/app/45-net.js`), không thêm thư viện. Tin gửi lên điểm hẹn phải đúng dạng thư viện PeerJS 1.5.5 (máy chủ kiểm tra từng trường và cả nội dung SDP, sai dạng là bị ngắt kết nối); điểm hẹn giả dùng khi kiểm tra cũng kiểm tra dạng tin y như vậy.
- Mã phòng 6 ký tự, có link mời `…/#phong=MÃ`. Máy tạo phòng giữ bản gốc của ván. Khi rớt mạng, hai máy tự nối lại và đồng bộ toàn bộ ván. Mở lại app trong vòng 2 giờ vẫn nối tiếp được ván đang dở.
- Điểm hẹn ngắt giữa lúc đang vào phòng thì app tự vào lại (tối đa 2 lần). Lời báo lỗi tách riêng: không tìm thấy phòng, chủ phòng không phản hồi, điểm hẹn liên tục ngắt, hai máy thấy nhau nhưng mạng chặn nối thẳng, phòng đã có người.
- Đã có: kiểm tra nước đi hợp lệ, chặn tin giả "bạn hết giờ", giới hạn giờ khai khống, đồng bộ lại khi số nước hai máy lệch nhau, báo khi khác phiên bản giao thức.

**Giới hạn và rủi ro**
- `0.peerjs.com` là dịch vụ miễn phí, không cam kết luôn hoạt động. Khi có nhiều người dùng, nên tự chạy máy chủ PeerJS (gói `peer` trên npm, có sẵn ảnh Docker) trên một máy chủ nhỏ, rồi đổi địa chỉ trong `45-net.js`.
- Chưa có **TURN** (máy chủ chuyển tiếp). Một phần mạng 4G hoặc mạng công ty chặn kết nối thẳng; khi đó app báo rõ lỗi và gợi ý dùng chung Wi-Fi. Muốn "ai cũng nối được" thì cần TURN (tự chạy coturn hoặc thuê dịch vụ) và có chi phí băng thông, dù nước cờ rất nhẹ.
- Hai máy biết địa chỉ IP của nhau (đặc điểm của WebRTC). Điều này đã ghi trong mục Giới thiệu.
- Chống gian lận: máy chủ phòng có thể sửa ván, và người chơi có thể dùng engine trong lúc đánh. Đủ cho chơi với bạn bè, **không đủ cho xếp hạng hay thi đấu**. Khi cần những thứ này phải có máy chủ làm trọng tài, cùng tài khoản và xếp hạng (Firebase, Supabase, Cloudflare Workers… đều làm được, phải chọn và trả phí khi lớn).
- Ghép cặp với người lạ cần máy chủ và một lượng người chơi đủ đông; chưa có.

**Kiểm tra**
- `tests/e2e/net.spec.js`: 10 bài, hai trang nối WebRTC thật qua điểm hẹn giả (tạo / vào phòng, đồng bộ nước và đồng hồ, xin hòa / đi lại / chịu thua / đấu lại, rớt mạng và nối lại, gói tin bị rơi, link mời trên máy mới, sai mã, khác phiên bản, tin giả, máy thứ ba vào phòng đã đủ người, điểm hẹn ngắt lúc đang vào phòng).
- `tests/e2e/net-real.spec.js`: chạy với điểm hẹn thật, cần Internet, chạy tay bằng `XQ_NET_REAL=1`. `node tools/check-signal.js` thử riêng điểm hẹn không cần trình duyệt.
- Bài học: bản đầu gửi tin dạng tối giản, qua được điểm hẹn giả nhưng bị `0.peerjs.com` chặn. Vì vậy trước mỗi lần phát hành có sửa phần mạng, phải chạy `net-real` (là điều kiện để phát hành).
- **Chưa kiểm tra trên hai iPhone thật ở hai mạng khác nhau.** Cần làm trước khi giới thiệu rộng.

## 3. Đóng gói thành ứng dụng 🟠

- **Android:** đóng gói bản web bằng Trusted Web Activity hoặc Capacitor. Cần kiểm chứng engine mạnh (cần `SharedArrayBuffer` và cross-origin isolation) chạy được trong WebView. Nếu không, phải dùng engine bản gốc cho Android.
- **iOS:** vướng giấy phép (mục 1). Ngoài ra cũng phải kiểm chứng cross-origin isolation trong WKWebView.
- Yêu cầu chung của kho ứng dụng: tài khoản nhà phát triển (có phí), biểu tượng và ảnh chụp đủ kích thước, **trang chính sách quyền riêng tư** (bắt buộc vì có kết nối mạng và lộ IP khi chơi qua mạng), mô tả, độ tuổi.
- Bộ nhớ: engine dùng khoảng 460 MB trên iPhone. App đã tự lùi về cấp 5 khi thiếu bộ nhớ, nhưng trên máy yếu vẫn có thể bị hệ điều hành đóng.

## 4. Kiến trúc mã và bảo trì 🟠

**Điểm mạnh**
- Lõi luật cờ (`src/core/xq.js`) tách riêng, chạy được cả trình duyệt và Node, kiểm tra perft đến độ sâu 4.
- Bước dựng bằng Node. CI/CD trên GitHub Actions kiểm tra rồi mới triển khai. Có ESLint.
- 32 bài kiểm tra giao diện và 9 bài kiểm tra luật cờ, dữ liệu.

**Nên cải thiện**
- `src/app/40-play.js` gánh cả ba chế độ (đấu máy, hai người, qua mạng) với nhiều nhánh `if`. Nên tách thành ba bộ điều khiển dùng chung một lớp "ván cờ" (bàn cờ, nước đi, đồng hồ, kết quả).
- Các module dùng chung phạm vi thay vì `import` / `export`. Khi thêm tính năng lớn, nên chuyển sang ES modules kèm một bộ đóng gói (ví dụ esbuild). Có thể thêm JSDoc hoặc TypeScript cho phần mạng và đồng hồ.
- Thêm WebKit (Safari) vào Playwright và CI. Cần thử trước xem engine WebAssembly có chạy trong WebKit headless không; nếu không, chỉ chạy các bài không cần engine.
- `index.html` khoảng 360 KB vì nhúng sẵn dữ liệu. Hiện vẫn ổn; khi dữ liệu lớn hơn nên tách JSON ra và tải khi cần.

## 5. Dữ liệu người dùng 🟢

- Mọi dữ liệu (ván đã lưu, bài "Lỗi của bạn", tiến độ) nằm trong bộ nhớ trình duyệt. Đã có sao lưu / khôi phục ra file, và từ bản này app xin trình duyệt giữ dữ liệu lâu dài (`navigator.storage.persist`).
- Chưa đồng bộ giữa các máy. Muốn đồng bộ thì cần tài khoản và máy chủ (cùng hạ tầng với xếp hạng ở mục 2).
- Giới hạn hiện tại: 20 ván gần nhất, 200 bài "Lỗi của bạn".

## 6. Khả năng truy cập và ngôn ngữ 🟢

- Bàn cờ chỉ điều khiển được bằng chạm hoặc chuột, chưa dùng được bằng bàn phím hay trình đọc màn hình.
- Chỉ có tiếng Việt. Nếu muốn có người dùng nước ngoài, cần tách chữ hiển thị ra tệp ngôn ngữ.

## 7. Vận hành 🟢

- Chưa có theo dõi lỗi từ máy người dùng. Có thể thêm nút "Gửi nhật ký lỗi" (đã có sẵn nhật ký kết nối `Net.log`) hoặc dịch vụ theo dõi lỗi tôn trọng quyền riêng tư.
- Nên gắn tag Git cho mỗi phiên bản (`v1.3.0`…) để dễ đối chiếu và quay lại.
- Thư mục cũ `co-tuong-luyen-tap` trên máy tính không còn dùng; có thể nén lại để lưu trữ.

## Lộ trình đề xuất

1. Kiểm tra chơi qua mạng trên hai điện thoại thật ở hai mạng khác nhau (Wi-Fi và 4G); ghi lại trường hợp không nối được.
2. Xác minh giấy phép mạng NNUE; thêm `NOTICE` và trang chính sách quyền riêng tư.
3. Thêm WebKit vào bộ kiểm tra tự động.
4. Tách `40-play.js` thành ba bộ điều khiển; chuyển sang ES modules.
5. Khi có người dùng ngoài nhóm bạn bè: tự chạy máy chủ PeerJS, thêm TURN.
6. Nếu muốn xếp hạng, đồng bộ nhiều máy hay ghép cặp với người lạ: chọn hạ tầng máy chủ (tài khoản, trọng tài ván đấu).
7. Nếu lên kho ứng dụng: Android trước (đóng gói bản web); iOS chỉ khi đã bỏ engine GPL hoặc có phương án pháp lý.
