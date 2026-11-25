# Hướng dẫn cho Claude Code trong dự án này

Web app luyện cờ tướng (PWA, tiếng Việt), không dùng framework. Xem `README.md` để biết cấu trúc.

## Lệnh

- `npm ci` – cài công cụ; `npx playwright install chromium` – trình duyệt cho kiểm tra giao diện.
- `npm run build` – dựng `dist/`. `npm start` – dựng và chạy tại http://localhost:4173.
- `npm test` – lint + unit + e2e. Phải đạt trước khi commit.
- `npm run test:unit`, `npm run test:e2e`, `npm run lint` – chạy riêng từng phần.

## Quy tắc

- Không sửa `dist/`, `.build/`, `node_modules/`.
- Mã giao diện nằm trong `src/app/NN-ten.js`, được ghép theo thứ tự tên trong một hàm duy nhất: các module dùng chung biến (`Play`, `Ana`, `Store`, `$`, …) mà không cần import. Thêm module mới thì đặt số thứ tự phù hợp.
- Lõi luật cờ `src/core/xq.js` phải chạy được cả trong trình duyệt, Web Worker và Node.
- Chữ cho người dùng viết bằng tiếng Việt có dấu. Ký hiệu nước đi lưu bằng chữ Hán, hiển thị qua `ndt()` / `nd1()`.
- Không đổi tên hay chỉnh các tệp trong `engine/` (xem `engine/README.md`).
- Phát hành: tăng `version` trong `package.json`, ghi `CHANGELOG.md`, commit, đẩy lên `main`; GitHub Actions tự kiểm tra và triển khai.
- Commit message viết tiếng Việt, ngắn gọn, ở thì hiện tại (ví dụ: "Thêm sao lưu dữ liệu").
- Trang chạy với chính sách nội dung (CSP) chặt, tính khi dựng trong `scripts/build.js`: không dùng `eval`, `new Function`, thuộc tính sự kiện trong HTML (`onclick="…"`) hay thẻ `<script>` tải từ nơi khác. Kết nối tới địa chỉ mới (điểm hẹn, máy chủ) thì thêm vào `CONNECT` trong `scripts/build.js`.
- Chơi qua mạng chỉ chạy sau khi người dùng đồng ý (`Consent` trong `src/app/45-net.js`). Đổi nội dung xin đồng ý hoặc chính sách quyền riêng tư (`src/index.template.html`, `docs/CHINH-SACH-RIENG-TU.md`) thì tăng `Consent.VERSION` và giá trị tương ứng trong `tests/e2e/net*.spec.js`, `tests/e2e/security.spec.js`.
- Dữ liệu khôi phục từ tệp sao lưu phải qua `Backup.clean()`. Thêm khoá lưu trữ mới (`Store.set('…')`) thì thêm vào `Backup.KEYS` nếu muốn khoá đó được sao lưu.
