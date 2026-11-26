# Chính sách quyền riêng tư – Cờ Tướng Luyện Tập và Cờ Vua Luyện Tập

Bản ngày 25/11/2026 (áp dụng từ phiên bản 1.7.0). Nội dung giống mục Giới thiệu › Quyền riêng tư trong app; sửa ở đây thì sửa cả trong `src/index.template.html`, và nếu thay đổi nội dung chính thì tăng `Consent.VERSION` trong `src/app/45-net.js` để app hỏi lại sự đồng ý.

## 1. Ai xử lý dữ liệu

Người phát triển app Cờ Tướng Luyện Tập và Cờ Vua Luyện Tập (tài khoản GitHub mercyk24). Hai app chung một trang chủ, xử lý dữ liệu giống nhau theo chính sách này; dữ liệu của mỗi app lưu riêng trên máy, đồng ý chơi qua mạng cũng hỏi riêng cho từng app. Liên hệ và yêu cầu về dữ liệu: mục Issues của kho mã nguồn <https://github.com/mercyk24/co-luyen-tap/issues>. Khi app do doanh nghiệp cung cấp, mục này sẽ ghi tên, địa chỉ và cách liên hệ của doanh nghiệp.

## 2. Dữ liệu trên máy của bạn

Tiến độ bài tập, ván đã chơi, kết quả phân tích, cài đặt, sự đồng ý của bạn và nhật ký lỗi gần đây (để bạn tự chép gửi khi báo lỗi, mục Giới thiệu › Báo lỗi) được lưu trong bộ nhớ của trình duyệt trên chính máy này. App không gửi các dữ liệu này đi đâu. Bạn xem bằng nút Sao lưu, xoá bằng nút Xoá dữ liệu trong mục Quyền riêng tư.

## 3. Khi chơi qua mạng (chỉ khi bạn đồng ý)

Dữ liệu được xử lý: địa chỉ IP, mã phòng, mã kết nối ngẫu nhiên, nước đi và đồng hồ của ván. Mục đích duy nhất: nối hai máy với nhau và chuyển nước đi. Bên nhận:

- **Đối thủ của bạn:** biết địa chỉ IP của bạn khi hai máy nối thẳng (WebRTC).
- **Điểm hẹn của app chạy trên Cloudflare** (Cloudflare, Inc., Hoa Kỳ; máy chủ đặt ở nhiều nước): nhận IP và tin kết nối, chuyển nước đi khi mạng chặn nối thẳng hoặc khi có người xem. Máy chủ chỉ giữ thông tin trong lúc đang kết nối, không lưu ván cờ, và đã tắt ghi nhật ký từng lượt truy cập.
- **Điểm hẹn dự phòng 0.peerjs.com** (dự án PeerJS, máy chủ ở nước ngoài): chỉ dùng khi điểm hẹn của app không vào được.
- **Máy chủ STUN của Google và Cloudflare:** giúp mỗi máy biết địa chỉ IP công khai của mình.
- **Người xem trận:** nhận thế cờ và đồng hồ qua điểm hẹn của app, không biết địa chỉ IP của người chơi.

## 4. Chuyển ra nước ngoài

Các máy chủ ở mục 3 có thể đặt ngoài Việt Nam, nên địa chỉ IP của bạn có thể được xử lý ở nước ngoài trong lúc kết nối. Đây là lý do app xin bạn đồng ý trước khi chơi qua mạng.

## 5. Quyền của bạn

Bạn có quyền được biết, đồng ý hoặc không đồng ý, rút lại sự đồng ý, xem, sao chép và xoá dữ liệu trên máy (nút Sao lưu và Xoá dữ liệu), yêu cầu hạn chế xử lý, phản đối và khiếu nại theo Luật Bảo vệ dữ liệu cá nhân. Rút lại đồng ý không ảnh hưởng các lần kết nối trước đó; sau khi rút lại, app không kết nối qua mạng nữa cho đến khi bạn đồng ý lại.

## 6. Trẻ em

App không hỏi tuổi. Người dưới 16 tuổi nên hỏi ý kiến cha mẹ trước khi chơi qua mạng.

## 7. Không dùng cho mục đích khác

App không có quảng cáo, không theo dõi hành vi, không bán hay chia sẻ dữ liệu cho bên thứ ba ngoài các bên ở mục 3.

## 8. Thay đổi

Khi chính sách thay đổi về nội dung chính, app sẽ hỏi lại sự đồng ý trước lần chơi qua mạng tiếp theo.
