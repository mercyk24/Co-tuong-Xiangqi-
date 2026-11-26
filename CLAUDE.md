# Hướng dẫn cho Claude Code trong dự án này

Web app luyện cờ (PWA, tiếng Việt), không dùng framework: trang chủ chọn loại cờ (`/`), Cờ Tướng (`/co-tuong/`), Cờ Vua (`/co-vua/`). Xem `README.md` để biết cấu trúc.

## Lệnh

- `npm ci` – cài công cụ; `npx playwright install chromium` – trình duyệt cho kiểm tra giao diện.
- `npm run build` – dựng `dist/`. `npm start` – dựng và chạy tại http://localhost:4173.
- `npm test` – lint + unit + e2e. Phải đạt trước khi commit.
- `npm run test:unit`, `npm run test:e2e`, `npm run lint` – chạy riêng từng phần.

## Quy tắc

- Không sửa `dist/`, `.build/`, `node_modules/`.
- Mã giao diện: cờ tướng `src/app/NN-ten.js`, cờ vua `src/chess/app/NN-ten.js`, phần dùng chung `src/shared/NN-ten.js`. Mỗi app được ghép `src/shared/` + thư mục của nó theo thứ tự tên tệp trong một hàm duy nhất: các module dùng chung biến (`Play`, `Ana`, `Store`, `$`, …) mà không cần import. Hai thư mục không được có tên tệp trùng nhau (build báo lỗi). Thêm module mới thì đặt số thứ tự phù hợp.
- **Không để lẫn luật hai loại cờ.** Cờ tướng dùng lõi `XQ` (`src/core/xq.js`), cờ vua dùng lõi `CH` (`src/core/chess.js`); mỗi app có `const RULES = XQ|CH`. Mã trong `src/shared/` chỉ được dùng `RULES` và cấu hình `GAME` (`00-game.js` của từng app: khoá lưu trữ `xq_`/`xc_`, tiền tố mạng `xqvn-`/`xcvn-`, mã app trong tệp sao lưu, biến thể engine), không gọi thẳng `XQ` hay `CH`. Sửa phần chung thì chạy kiểm tra của cả hai app.
- Dữ liệu cờ vua (`data/chess/*.json`) dựng bằng `node tools/chess/build-data.js` từ nguyên liệu trong `data/chess/src/` (tải bằng `node tools/chess/fetch-data.mjs`); không sửa tay các tệp JSON.
- Lõi luật cờ `src/core/xq.js`, `src/core/chess.js` phải chạy được cả trong trình duyệt, Web Worker và Node.
- Chữ cho người dùng viết bằng tiếng Việt có dấu. Cờ tướng: ký hiệu nước đi lưu bằng chữ Hán, hiển thị qua `ndt()` / `nd1()`. Cờ vua: ký hiệu quốc tế (SAN), nước đi lưu dạng UCI.
- Không đổi tên hay chỉnh các tệp trong `engine/` (xem `engine/README.md`).
- Phát hành: tăng `version` trong `package.json`, ghi `CHANGELOG.md`, commit, đẩy lên `main`; GitHub Actions tự kiểm tra và triển khai.
- Commit message viết tiếng Việt, ngắn gọn, ở thì hiện tại (ví dụ: "Thêm sao lưu dữ liệu").
- Trang chạy với chính sách nội dung (CSP) chặt, tính khi dựng trong `scripts/build.js`: không dùng `eval`, `new Function`, thuộc tính sự kiện trong HTML (`onclick="…"`) hay thẻ `<script>` tải từ nơi khác. Kết nối tới địa chỉ mới (điểm hẹn, máy chủ) thì thêm vào `CONNECT` trong `scripts/build.js`.
- Chơi qua mạng chỉ chạy sau khi người dùng đồng ý (`Consent` trong `src/shared/45-net.js`). Đổi nội dung xin đồng ý hoặc chính sách quyền riêng tư (`src/index.template.html`, `src/chess/index.template.html`, `docs/CHINH-SACH-RIENG-TU.md`) thì tăng `Consent.VERSION` và giá trị tương ứng trong `tests/e2e/net*.spec.js`, `tests/e2e/security.spec.js`, `tests/e2e/chess.spec.js`.
- Dữ liệu khôi phục từ tệp sao lưu phải qua `Backup.clean()`. Thêm khoá lưu trữ mới (`Store.set('…')`) thì thêm vào `Backup.KEYS` nếu muốn khoá đó được sao lưu.
