# Hướng dẫn cho Claude Code trong dự án này

Web app luyện cờ (PWA, tiếng Việt), không dùng framework: trang chủ chọn loại cờ (`/`), Cờ Tướng (`/co-tuong/`), Cờ Vua (`/co-vua/`). **Trước khi sửa, đọc `docs/CAU-TRUC.md`**: phần nào dùng chung, phần nào riêng của từng loại cờ, tệp song sinh, sửa X ở đâu.

## Lệnh

- `npm ci` – cài công cụ; `npx playwright install chromium` – trình duyệt cho kiểm tra giao diện.
- `npm run build` – dựng `dist/`. `npm start` – dựng và chạy tại http://localhost:4173.
- `npm test` – lint + unit + e2e. Phải đạt trước khi commit.
- `npm run test:unit`, `npm run test:e2e`, `npm run lint` – chạy riêng từng phần.

## Quy tắc

- Không sửa `dist/`, `.build/`, `node_modules/`.
- Cách đặt chỗ: `xiangqi/` là cờ tướng, `chess/` là cờ vua, `shared/` (hoặc `net/`) là dùng chung, ở cả `src/`, `data/`, `tools/`, `tests/`. Dòng đầu mỗi tệp trong `src/` ghi nhãn **[DÙNG CHUNG]** / **[CỜ TƯỚNG]** / **[CỜ VUA]**; tệp mới cũng phải có nhãn.
- Mã giao diện: cờ tướng `src/xiangqi/app/NN-ten.js`, cờ vua `src/chess/app/NN-ten.js`, phần dùng chung `src/shared/app/NN-ten.js`. Mỗi app được ghép `src/shared/app/` + thư mục của nó theo thứ tự tên tệp trong một hàm duy nhất: các module dùng chung biến (`Play`, `Ana`, `Store`, `$`, …) mà không cần import. Hai thư mục không được có tên tệp trùng nhau (build báo lỗi). Thêm module mới thì đặt số thứ tự phù hợp. CSS: `src/shared/base.css` (chung) rồi `src/<loại cờ>/game.css` (riêng).
- **Phần dính luật trong mã chung đi qua `HOOKS`** (`src/<loại cờ>/app/03-hooks.js`, hai tệp có cùng tên hàm). Cần thêm khác biệt giữa hai loại cờ vào phần chung thì thêm hàm vào cả hai `03-hooks.js`, không viết `if (GAME.id === …)`.
- **Tệp song sinh** (cùng tên ở `src/xiangqi/app/` và `src/chess/app/`, dòng đầu ghi "bản song sinh"): sửa lỗi ở phần giống nhau thì sửa cả bản bên kia. Đoạn giống hệt, không dính luật thì nên chuyển vào `src/shared/app/`.
- **Không để lẫn luật hai loại cờ.** Cờ tướng dùng lõi `XQ` (`src/xiangqi/core/xq.js`), cờ vua dùng lõi `CH` (`src/chess/core/chess.js`); mỗi app có `const RULES = XQ|CH`. Mã trong `src/shared/app/` chỉ được dùng `RULES`, `HOOKS` và cấu hình `GAME` (`00-game.js` của từng app: khoá lưu trữ `xq_`/`xc_`, tiền tố mạng `xqvn-`/`xcvn-`, mã app trong tệp sao lưu, biến thể engine), không gọi thẳng `XQ` hay `CH`. Sửa phần chung thì chạy kiểm tra của cả hai app.
- Không sửa tay dữ liệu trong `data/`: cờ tướng dựng bằng `tools/xiangqi/` (`docs/DU-LIEU-CO-TUONG.md`), cờ vua bằng `tools/chess/` (`docs/DU-LIEU-CO-VUA.md`).
- Lõi luật cờ `src/xiangqi/core/xq.js`, `src/chess/core/chess.js` phải chạy được cả trong trình duyệt, Web Worker và Node.
- Chữ cho người dùng viết bằng tiếng Việt có dấu. Cờ tướng: ký hiệu nước đi lưu bằng chữ Hán, hiển thị qua `ndt()` / `nd1()`. Cờ vua: ký hiệu quốc tế (SAN), nước đi lưu dạng UCI.
- Không đổi tên hay chỉnh các tệp trong `engine/` (xem `engine/README.md`).
- Phát hành: tăng `version` trong `package.json`, ghi `CHANGELOG.md`, commit, đẩy lên `main`; GitHub Actions tự kiểm tra và triển khai.
- Commit message viết tiếng Việt, ngắn gọn, ở thì hiện tại (ví dụ: "Thêm sao lưu dữ liệu").
- Trang chạy với chính sách nội dung (CSP) chặt, tính khi dựng trong `scripts/build.js`: không dùng `eval`, `new Function`, thuộc tính sự kiện trong HTML (`onclick="…"`) hay thẻ `<script>` tải từ nơi khác. Kết nối tới địa chỉ mới (điểm hẹn, máy chủ) thì thêm vào `CONNECT` trong `scripts/build.js`.
- Chơi qua mạng chỉ chạy sau khi người dùng đồng ý (`Consent` trong `src/shared/app/45-net.js`). Đổi nội dung xin đồng ý hoặc chính sách quyền riêng tư (`src/xiangqi/index.template.html`, `src/chess/index.template.html`, `docs/CHINH-SACH-RIENG-TU.md`) thì tăng `Consent.VERSION` và giá trị tương ứng trong `tests/e2e/shared/net*.spec.js`, `tests/e2e/shared/security.spec.js`, `tests/e2e/chess/play.spec.js`.
- Dữ liệu khôi phục từ tệp sao lưu phải qua `Backup.clean()`. Thêm khoá lưu trữ mới (`Store.set('…')`) thì thêm vào `Backup.KEYS` nếu muốn khoá đó được sao lưu.
