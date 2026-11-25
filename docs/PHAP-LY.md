# Lộ trình pháp lý trước khi thương mại hoá

Cập nhật: 25/11/2026 (bản 1.7.0).

> **Lưu ý:** tài liệu này là ghi chép kỹ thuật để chuẩn bị, **không phải tư vấn pháp lý**. Quy định về trò chơi điện tử và dữ liệu cá nhân ở Việt Nam đang thay đổi nhanh (Nghị định 147/2024 đang được sửa đổi). Trước khi nộp hồ sơ hay thu tiền, mang tài liệu này đến luật sư chuyên về game và dữ liệu để xác nhận.

Nguyên tắc: **chưa thu tiền, chưa quảng bá thương mại khi chưa có giấy phép.** Trong lúc chờ, app vẫn là dự án cá nhân, miễn phí, mã nguồn mở. Mỗi bước kỹ thuật dưới đây làm được trước, để khi xin phép thì sản phẩm đã sẵn sàng.

## 1. App thuộc loại nào

| Phần của app | Loại (Nghị định 147/2024) | Lý do |
|---|---|---|
| Đấu máy, giải chiếu hết, chiến thuật, khai cuộc, phân tích ván | **G4** | Tải về qua mạng, không tương tác với người chơi khác hay máy chủ của doanh nghiệp |
| Chơi qua mạng, xem trận | **G1** (rất có thể) | Nhiều người chơi tương tác cùng lúc; ghép phòng, chuyển nước khi mạng chặn và phát thế cờ cho người xem đều qua máy chủ của app |

Hệ quả:
- **G4:** doanh nghiệp + Giấy chứng nhận cung cấp dịch vụ G2, G3, G4 + thông báo phát hành từng trò chơi. Điều kiện kỹ thuật gồm quản lý thời gian chơi của người dưới 18 tuổi (60 phút mỗi trò, 180 phút mỗi ngày), hiển thị liên tục nhãn độ tuổi, cảnh báo sức khỏe.
- **G1:** doanh nghiệp + Giấy phép G1 + quyết định phát hành cho từng trò chơi (Bộ VHTTDL). Thêm: xác thực tài khoản bằng số điện thoại di động tại Việt Nam, lưu thông tin người chơi (họ tên, ngày sinh, số điện thoại) **tại Việt Nam**, quản lý nội dung trao đổi.
- Phạt nặng nếu cung cấp khi chưa có phép (Nghị định 174/2026): G1 không phép 150–170 triệu đồng kèm thu hồi tên miền, ứng dụng; đã có doanh nghiệp bị phạt 120 triệu vì phát hành game G4 khi chưa có giấy chứng nhận.

## 2. Các bước theo thứ tự

### Bước 0 – Nền tảng an toàn (đã làm, bản 1.7.0, không cần doanh nghiệp)

- [x] Chính sách nội dung (CSP) chặt: chỉ chạy mã của app, không eval, chỉ kết nối tới điểm hẹn của app. Tiêu đề chống nhúng trang, chống đoán kiểu tệp, không gửi Referer.
- [x] Lọc tệp sao lưu khi khôi phục: chỉ nhận đúng các mục app dùng, chặn ký tự chèn mã.
- [x] Xin đồng ý rõ ràng (không đánh dấu sẵn) trước lần chơi qua mạng đầu tiên; lưu thời điểm và phiên bản nội dung đồng ý; rút lại được.
- [x] Chính sách quyền riêng tư trong app (Giới thiệu › Quyền riêng tư) và `docs/CHINH-SACH-RIENG-TU.md`. Nút xoá toàn bộ dữ liệu trên máy.
- [x] Máy chủ: giới hạn số kết nối theo địa chỉ IP; tắt nhật ký từng lượt truy cập (nhật ký đó chứa IP và thẻ phiên).
- [x] Chuỗi cung ứng: tệp `NOTICE`, kiểm tra mã băm SHA-256 của engine trong bộ kiểm tra, Dependabot, `npm audit` trong CI, ghim GitHub Actions theo mã commit.
- [x] Nguồn gốc dữ liệu: bài chiếu hết do công cụ của dự án tự sinh (`docs/data.md`).

### Bước 1 – Việc của chủ dự án (không cần code)

- [ ] Bật xác thực hai lớp (2FA) cho GitHub và Cloudflare. Nên dùng ứng dụng xác thực hoặc khoá bảo mật thay vì SMS.
- [ ] Hỏi tác giả mạng NNUE `xiangqi-c07e94a5c7cb.nnue` về điều khoản dùng thương mại (trang danh sách mạng NNUE của Fairy-Stockfish). Không được phép thì bản thương mại dùng mạng khác hoặc chỉ dùng engine tự viết.
- [ ] Chọn tên miền riêng. Hồ sơ xin phép ghi tên miền hoặc ứng dụng cung cấp dịch vụ, nên chọn xong trước khi nộp. Đổi tên miền sau khi có người dùng sẽ làm họ mất dữ liệu (dữ liệu gắn với tên miền), xem `docs/MO-RONG.md`.
- [ ] Gặp luật sư với tài liệu này: xác nhận cách phân loại G1/G4, loại hình doanh nghiệp, ngành nghề đăng ký, nghĩa vụ thuế.

### Bước 2 – Bản "tuân thủ G4" (làm trước khi nộp hồ sơ G4)

Các tính năng kỹ thuật mà điều kiện G2, G3, G4 đòi hỏi. Sẽ làm sau khi luật sư xác nhận cách đáp ứng (ví dụ: người dùng tự khai năm sinh có được chấp nhận không):

- [ ] Hỏi năm sinh lần đầu mở app (lưu trên máy).
- [ ] Đếm thời gian chơi trong ngày cho người dưới 18 tuổi: 60 phút mỗi trò, 180 phút tổng; hết giờ thì khoá đến 0 giờ hôm sau.
- [ ] Hiển thị liên tục nhãn độ tuổi trên màn hình chơi và trong mọi nội dung giới thiệu.
- [ ] Cảnh báo "Chơi quá 180 phút một ngày sẽ ảnh hưởng xấu đến sức khỏe" định kỳ trong lúc chơi.
- [ ] Bản thương mại tắt chế độ chơi qua mạng (cờ dựng `--g4`), cho tới khi có giấy phép G1 hoặc đối tác (xem Bước 4).
- [ ] Ghi tên, địa chỉ doanh nghiệp vào chính sách quyền riêng tư và trang Giới thiệu.

### Bước 3 – Thành lập doanh nghiệp và xin phép G4

- [ ] Thành lập doanh nghiệp (công ty TNHH một thành viên là đủ), đăng ký ngành nghề cung cấp dịch vụ trò chơi điện tử trên mạng. Hộ kinh doanh không đủ điều kiện cho game.
- [ ] Nộp hồ sơ Giấy chứng nhận cung cấp dịch vụ G2, G3, G4 (Sở VHTTDL địa phương).
- [ ] Thông báo phát hành từng trò chơi trước khi phát hành theo thời hạn quy định.
- [ ] Đăng ký thuế; nếu bán trực tiếp trên web thì làm thủ tục website thương mại điện tử (Luật Thương mại điện tử 2025, hiệu lực 01/7/2026).
- [ ] Đưa lên kho ứng dụng: Apple yêu cầu giấy phép game của Việt Nam để phân phối tại Việt Nam; engine GPL không tương thích App Store (xem `docs/RA-SOAT.md` mục 1).

### Bước 4 – Chơi qua mạng: chọn một trong ba hướng

1. **Tạm tắt trong bản thương mại.** Nhẹ nhất. Bản mã nguồn mở vẫn giữ tính năng.
2. **Xin trọn G1.** Cần tài khoản xác thực bằng số điện thoại Việt Nam, lưu dữ liệu người chơi tại Việt Nam, quản lý giờ chơi, quản lý nội dung trao đổi. Phải chuyển máy chủ về Việt Nam (mục 3, hướng B).
3. **Hợp tác với nhà phát hành đã có giấy phép G1**, để họ đứng tên phần chơi qua mạng.

## 3. Chuyển dữ liệu ra máy chủ nước ngoài

### Hiện trạng

Khi chơi qua mạng, các dữ liệu sau rời khỏi máy người dùng:

| Dữ liệu | Đi đến | Ở đâu | Lưu bao lâu |
|---|---|---|---|
| Địa chỉ IP, mã kết nối ngẫu nhiên, mã phòng | Điểm hẹn của app (Cloudflare Workers + Durable Objects) | Mạng máy chủ toàn cầu của Cloudflare, công ty Hoa Kỳ | Chỉ trong lúc kết nối; đã tắt nhật ký lượt truy cập |
| Nước đi, đồng hồ (khi mạng chặn nối thẳng hoặc có người xem) | Điểm hẹn của app | Như trên | Không lưu, chỉ chuyển tin |
| Địa chỉ IP, mã kết nối | 0.peerjs.com (dự phòng) | Nước ngoài | Theo chính sách của dự án PeerJS |
| Địa chỉ IP | Máy chủ STUN của Google, Cloudflare | Nước ngoài | Theo chính sách của Google, Cloudflare |
| Địa chỉ IP | Đối thủ (khi nối thẳng) | Máy của đối thủ | — |

Phần luyện tập (đấu máy, bài tập, phân tích) **không gửi dữ liệu nào** ra khỏi máy. Trang web tải từ GitHub Pages hoặc Cloudflare, nên hai bên này vẫn nhận địa chỉ IP khi tải trang, như mọi trang web.

### Quy định liên quan

- **Luật Bảo vệ dữ liệu cá nhân 2025, Điều 20:** chuyển dữ liệu cá nhân xuyên biên giới gồm cả việc dùng nền tảng ở nước ngoài để xử lý dữ liệu thu thập tại Việt Nam. Bên chuyển phải lập **hồ sơ đánh giá tác động chuyển dữ liệu cá nhân xuyên biên giới** và gửi Cục A05 (Bộ Công an) trong 60 ngày kể từ lần chuyển đầu tiên; làm một lần, cập nhật khi thay đổi. Miễn: cơ quan nhà nước, lưu dữ liệu người lao động trên đám mây, chủ thể tự chuyển dữ liệu của mình, trường hợp khác do Chính phủ quy định. Biểu mẫu theo Nghị định 356/2025.
- **Điều 38:** doanh nghiệp nhỏ, khởi nghiệp được chọn không làm đánh giá tác động xử lý dữ liệu, không cử nhân sự bảo vệ dữ liệu trong 5 năm; hộ kinh doanh, doanh nghiệp siêu nhỏ được miễn hẳn (trừ khi xử lý dữ liệu nhạy cảm hoặc dữ liệu của số lượng lớn người). **Chưa rõ miễn trừ này có bao gồm hồ sơ chuyển dữ liệu xuyên biên giới không**, các nguồn diễn giải khác nhau. Coi như phải làm cho chắc.
- **Địa chỉ IP** được coi là dữ liệu giúp xác định một con người, tức là dữ liệu cá nhân.
- **Luật An ninh mạng 2025** (hiệu lực 01/7/2026): doanh nghiệp cung cấp dịch vụ trên mạng phải lưu trữ dữ liệu người dùng tại Việt Nam theo quy định chi tiết của Chính phủ.
- **Nghị định 147/2024, giấy phép G1:** bắt buộc lưu thông tin người chơi tại Việt Nam.
- Phạt vi phạm quy định chuyển dữ liệu xuyên biên giới: tới 5% doanh thu năm trước hoặc 3 tỷ đồng, tuỳ mức nào cao hơn.

### Các hướng xử lý

| Hướng | Làm gì | Hợp với | Chi phí, công sức |
|---|---|---|---|
| **A. Giữ máy chủ nước ngoài, làm đủ thủ tục** | Giữ Cloudflare; xin đồng ý trước khi chơi (đã làm); lập và nộp hồ sơ đánh giá tác động chuyển dữ liệu xuyên biên giới khi có doanh nghiệp; ký điều khoản xử lý dữ liệu của Cloudflare | Giai đoạn miễn phí, G4 với phần chơi mạng tắt hoặc chỉ là tính năng phụ | Thấp. Không đáp ứng được G1 (G1 buộc lưu tại Việt Nam) |
| **B. Chuyển điểm hẹn về Việt Nam** | Chạy điểm hẹn (cùng lõi `server/core.mjs`) trên máy chủ thuê tại Việt Nam (Viettel IDC, VNG Cloud, FPT Cloud, CMC Cloud, VNPT…); thêm máy chủ STUN/TURN riêng ở Việt Nam; **bỏ** 0.peerjs.com và STUN của Google, Cloudflare trong bản thương mại; trang web cũng đặt ở Việt Nam | Bắt buộc nếu xin G1; an toàn nhất về pháp lý | Trung bình: máy chủ ảo vài trăm nghìn đến vài triệu đồng/tháng tuỳ cấu hình, tự vận hành (cập nhật, sao lưu, chống tấn công) |
| **C. Lai** | Máy chủ chính ở Việt Nam (hướng B), Cloudflare chỉ làm CDN cho tệp tĩnh không chứa dữ liệu cá nhân | Khi đông người dùng cần chịu tải tốt | Cao hơn B một chút |
| **D. Nhà phát hành lo** | Đối tác có giấy phép G1 vận hành máy chủ của họ tại Việt Nam | Hướng 3 ở Bước 4 | Chia doanh thu |

Ở mọi hướng đều nên giữ thiết kế hiện tại: **thu thập ít nhất có thể.** Không tài khoản khi chưa bắt buộc, máy chủ không lưu ván cờ, không ghi nhật ký IP. Dữ liệu càng ít thì hồ sơ càng đơn giản và rủi ro càng nhỏ.

### Đề xuất

- **Bây giờ (chưa thương mại):** giữ hướng A. Đã có xin đồng ý, chính sách, tắt nhật ký.
- **Khi thành lập doanh nghiệp và xin G4:** nếu bản thương mại tắt chơi qua mạng thì phần thương mại không chuyển dữ liệu ra nước ngoài, không cần hồ sơ chuyển dữ liệu cho phần đó. Nếu vẫn giữ chơi qua mạng: hướng A kèm hồ sơ chuyển dữ liệu, hoặc chuyển luôn sang B.
- **Nếu xin G1:** hướng B (hoặc D). Việc kỹ thuật cần làm trước:
  - [ ] Máy chủ điểm hẹn chạy bằng Node trên máy chủ thường (dựa trên `server/dev-server.mjs`, thêm TLS, giới hạn theo IP, chạy nền, tự khởi động lại), kèm Dockerfile.
  - [ ] Cờ dựng chọn danh sách điểm hẹn và máy chủ STUN/TURN cho từng bản (bản cộng đồng / bản thương mại Việt Nam).
  - [ ] Máy chủ STUN/TURN riêng (coturn) đặt tại Việt Nam.
  - [ ] Tài khoản người chơi và xác thực số điện thoại (cần nhà cung cấp SMS OTP tại Việt Nam), cơ sở dữ liệu đặt tại Việt Nam.

## 4. Giấy phép phần mềm và dữ liệu

| Thành phần | Tình trạng | Việc cần làm |
|---|---|---|
| Mã app | GPL-3.0-or-later, mã nguồn công khai | Giữ công khai mã nguồn của mọi bản phát hành |
| Fairy-Stockfish (GPL-3.0) | Dùng thương mại được nếu giữ mã nguồn mở | Không đưa lên App Store kèm engine này |
| Mạng NNUE | **Chưa xác minh** | Bước 1 |
| Bài chiếu hết | Tự sinh bằng công cụ của dự án | Đã ghi nguồn trong `docs/data.md` |
| Dữ liệu sinh bằng Pikafish | Kết quả phân tích, ghi công trong `NOTICE` | — |
| Chú giải khai cuộc | Tự viết; chuỗi nước đi là kiến thức phổ biến | — |

## 5. Nguồn tham khảo

- Nghị định 147/2024/NĐ-CP (quản lý dịch vụ Internet và trò chơi điện tử), sửa đổi bởi Nghị định 116/2026; dự thảo sửa đổi đang lấy ý kiến.
- Nghị định 174/2026/NĐ-CP (xử phạt, hiệu lực 01/7/2026).
- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (hiệu lực 01/01/2026); Nghị định 330 về xử phạt.
- Luật An ninh mạng số 116/2025/QH15 (hiệu lực 01/7/2026).
- Luật Thương mại điện tử số 122/2025/QH15 (hiệu lực 01/7/2026).
- Thủ tục nộp hồ sơ đánh giá tác động chuyển dữ liệu cá nhân xuyên biên giới: Cổng dịch vụ công Bộ Công an hoặc Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao (A05).
