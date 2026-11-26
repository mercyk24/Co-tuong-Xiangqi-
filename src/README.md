# src/ – mã nguồn của app

- `shared/` **[DÙNG CHUNG]** – chạy trong cả cờ tướng và cờ vua (module `app/`, `base.css`, `assets/`).
- `portal/` **[DÙNG CHUNG]** – trang chủ chọn loại cờ.
- `xiangqi/` **[CỜ TƯỚNG]** – lõi luật `core/`, module `app/`, `game.css`, `index.template.html`.
- `chess/` **[CỜ VUA]** – lõi luật `core/`, module `app/`, `game.css`, `pieces/`, `index.template.html`.

Phần chung gọi phần dính luật qua `HOOKS` (`src/<loại cờ>/app/03-hooks.js`). Dòng đầu mỗi tệp ghi nhãn và, với tệp song sinh, tên bản bên kia. Sơ đồ đầy đủ và quy tắc sửa: `docs/CAU-TRUC.md`.
