# src/ – mã nguồn của app

- `shared/` **[DÙNG CHUNG]** – chạy trong mọi loại cờ (module `app/`, `base.css`, `assets/`). Riêng `app/30-fsf.js` và `app/80-analysis.js` chỉ cờ tướng và cờ vua dùng.
- `portal/` **[DÙNG CHUNG]** – trang chủ chọn loại cờ.
- `xiangqi/` **[CỜ TƯỚNG]** – lõi luật `core/`, module `app/`, `game.css`, `index.template.html`.
- `chess/` **[CỜ VUA]** – lõi luật `core/`, module `app/`, `game.css`, `pieces/`, `index.template.html`.
- `go/` **[CỜ VÂY]** – lõi luật `core/` (kèm máy Monte-Carlo), module `app/`, `game.css`, `index.template.html`.

Phần chung gọi phần dính luật qua `HOOKS` (`src/<loại cờ>/app/03-hooks.js`). Dòng đầu mỗi tệp ghi nhãn và, với tệp song sinh, tên bản bên kia. Sơ đồ đầy đủ và quy tắc sửa: `docs/CAU-TRUC.md`.
