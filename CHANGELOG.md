# Nhật ký thay đổi

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/); số phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

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
