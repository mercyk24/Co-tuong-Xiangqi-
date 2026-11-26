# tests/ – kiểm tra tự động (`npm test` chạy hết)

| | Kiểm tra đơn vị (`node --test`) | Kiểm tra giao diện (Playwright) |
|---|---|---|
| **[DÙNG CHUNG]** | `unit/shared/` – lõi điểm hẹn, mã băm engine | `e2e/shared/` – chơi qua mạng, bảo mật, trang chủ |
| **[CỜ TƯỚNG]** | `unit/xiangqi/` – luật, lặp thế, dữ liệu | `e2e/xiangqi/` – app cờ tướng |
| **[CỜ VUA]** | `unit/chess/` – luật (perft), dữ liệu | `e2e/chess/` – app cờ vua |

Kiểm tra chơi qua mạng trong `e2e/shared/` chạy trên trang cờ tướng nhưng kiểm tra phần mạng dùng chung;
chơi qua mạng của cờ vua kiểm tra trong `e2e/chess/play.spec.js`. Hàm hỗ trợ dùng chung: `e2e/helpers.js`.
