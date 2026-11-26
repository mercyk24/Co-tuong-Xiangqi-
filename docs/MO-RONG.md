# Mở rộng chơi qua mạng: 5000 người cùng lúc

Tài liệu này trả lời câu hỏi: nếu có 5000 người chơi qua mạng cùng lúc (2500 ván), các ván có diễn ra bình thường không?
Nó ghi lại những gì đã đo, những chỗ sẽ nghẽn và cách đã làm để gỡ.

## 1. Kết luận ngắn

| Phần | Bản 1.3.0 (chỉ dùng điểm hẹn công cộng) | Sau khi cài điểm hẹn riêng (server/) |
|---|---|---|
| Máy tính nước đi (engine) | Chạy trên máy từng người, không nghẽn | Như cũ |
| Tải trang | GitHub Pages, giới hạn mềm 100 GB/tháng | Thêm bản trang trên Cloudflare, tải tệp tĩnh không giới hạn |
| Hai máy tìm nhau (điểm hẹn) | `0.peerjs.com`: dùng chung với mọi app PeerJS trên thế giới, không cam kết, mặc định của phần mềm này là tối đa 5000 kết nối mỗi máy chủ | Mỗi phòng chạy riêng trên Cloudflare; đã thử 5000 và 10000 người cùng lúc, đều đạt 100% |
| Mạng chặn nối thẳng (một phần 4G, mạng công ty) | Không chơi được, báo lỗi | Ván tự đi qua điểm hẹn riêng |
| Điểm hẹn riêng hỏng hoặc hết hạn mức | Không áp dụng | App tự chuyển sang `0.peerjs.com` |

**Với bản 1.3.0, 5000 người cùng lúc thì không chắc chơi được.** Nước đi không cần máy chủ. Vấn đề nằm ở bước hai máy tìm nhau:
- Bước này dựa hoàn toàn vào `0.peerjs.com`, một máy chủ miễn phí dùng chung, không có cam kết hoạt động.
- Phần mềm máy chủ PeerJS mặc định cho tối đa 5000 kết nối mỗi máy chủ (`concurrent_limit`). Riêng 5000 người của app đã chạm mức đó, chưa tính người của app khác.
- Khi đó máy chủ trả lỗi "Server has reached its concurrent user limit" và người mới không vào được phòng.
- Ngoài ra, người ở mạng chặn kết nối thẳng không chơi được, mà ở quy mô lớn thì số người này đáng kể.

## 2. Đã làm gì

### 2.1 Điểm hẹn riêng (`server/`)
- **Giao thức:** nói cùng giao thức với PeerJS, nên app chỉ cần thêm địa chỉ máy chủ, phần nối WebRTC giữ nguyên.
- **`server/core.mjs`:** lõi dùng chung, không phụ thuộc nền tảng.
  - **Phòng riêng:** mỗi phòng có ô riêng, tối đa 3 kết nối.
  - **Kiểm tra tin:** dạng tin được kiểm tra như PeerJS; tối đa 16 KB một tin.
  - **Giới hạn tốc độ:** dồn tối đa 60 tin, sau đó trung bình 5 tin mỗi giây.
  - **Nối lại:** cùng mã máy và cùng thẻ được thay kết nối cũ, nên máy nối lại ngay, không bị báo "trùng mã".
  - **Tin mới so với PeerJS:**
    - `RELAY`: chuyển tin ván cờ khi hai máy không nối thẳng được.
    - `LEAVE`: báo máy kia đã rời điểm hẹn.
- **`server/worker.mjs`:** bản chạy trên Cloudflare Workers.
  - **Mỗi phòng một Durable Object:** không có điểm nghẽn chung, số phòng tăng bao nhiêu cũng được.
  - **WebSocket ngủ đông:** phòng không tốn tiền khi hai máy đang nối thẳng.
  - **Nhịp tim:** Cloudflare tự trả lời mà không đánh thức phòng.
  - **Phục vụ luôn trang web** từ `dist/`, kèm tiêu đề COOP/COEP qua tệp `_headers`.
  - **Chặn trang lạ:** chỉ trang của app được dùng điểm hẹn, qua biến `ALLOWED_ORIGINS`.
- **`server/dev-server.mjs`:** bản chạy bằng Node trên máy (WebSocket tự viết, không cần cài gì). Dùng để kiểm tra tự động và thử tải.
- **`wrangler.jsonc`:** cấu hình đưa lên Cloudflare.

### 2.2 App (`src/shared/45-net.js`, dùng chung cho cờ tướng và cờ vua)
- **Danh sách điểm hẹn:** điểm hẹn riêng (`NET_OWN`) trước, `0.peerjs.com` dự phòng.
  - Tạo phòng: điểm hẹn riêng không vào được thì tạo ở điểm hẹn dự phòng.
  - Vào phòng: không vào được điểm hẹn riêng, hoặc không thấy phòng ở đó, thì tìm tiếp ở điểm hẹn dự phòng.
- **Đi qua điểm hẹn khi không nối thẳng được:**
  - Khi nào chuyển: chủ phòng đã trả lời mà sau 7 giây vẫn chưa nối thẳng, hoặc WebRTC báo hỏng.
  - Cách chuyển: khách chuyển sang gửi tin qua điểm hẹn riêng. Chủ phòng nhận theo đúng luật như lời gọi WebRTC (phòng đã có người thì vẫn báo).
  - Tần suất hỏi thăm khi đi qua điểm hẹn: 10 giây một lần (đỡ tải), im lặng 32 giây thì coi là mất kết nối.
  - Phát hiện sớm: khi một máy rời điểm hẹn, máy kia biết ngay nhờ `LEAVE`.
- **Thẻ của máy giữ cố định suốt ván, lưu cùng phiên:** mở lại app thì nối lại đúng chỗ cũ.
- **Nhịp tim:** 30 giây với điểm hẹn riêng, 5 giây với `0.peerjs.com`.
- **Chưa điền địa chỉ (`NET_OWN = ''`):** app chạy y như bản 1.3.0.

### 2.3 Xem trận đấu (từ bản 1.6.0)
- **Vai người xem:** người xem có mã máy `xqvn-w…`, vào cùng ô phòng, tính riêng (tối đa 20 người), không gửi được gì tới người chơi.
- **Phát thế cờ:**
  - Chủ phòng gửi `CAST` (toàn bộ thế cờ, dưới 4 KB) mỗi khi ván đổi; máy chủ chuyển tới mọi người xem.
  - Tin máy chủ gửi ra không tính phí, nên 20 người xem cũng chỉ tốn như một.
  - Đồng hồ không đổi thì không gửi lại; người xem tự đếm giờ.
- **Khi có người vào hoặc rời:** chủ phòng nhận `WATCH {n}`, gửi thế cờ riêng cho người mới, và báo số người xem cho khách qua kênh nối thẳng.
- **Chủ phòng tắt cho xem:** người xem nhận `{t:'nowatch'}` và được báo không xem được.

### 2.4 Cờ vua dùng chung điểm hẹn (từ bản 2.0.0)
- **Tiền tố mã máy:** cờ tướng `xqvn-…` (người xem `xqvn-w…`), cờ vua `xcvn-…` (người xem `xcvn-w…`). Điểm hẹn chỉ nhận hai tiền tố này.
- **Phòng tách riêng:** ô phòng (Durable Object) của cờ vua có tên `c:<mã phòng>`, của cờ tướng giữ nguyên tên cũ, nên cùng một mã 6 ký tự ở hai loại cờ là hai phòng khác nhau. Một máy cờ vua cố vào ô của cờ tướng (hoặc ngược lại) bị từ chối (`bad-id`).
- **Cần đưa lại `server/worker.mjs` lên Cloudflare** (`npx wrangler deploy`) để cờ vua dùng được điểm hẹn riêng. Chưa đưa lên thì cờ vua tự dùng `0.peerjs.com`, cờ tướng không bị ảnh hưởng.
- Hạn mức và chi phí ở mục 4 tính chung cho cả hai loại cờ.

## 3. Đã đo

Chạy `node tools/load-signal.mjs` với `server/dev-server.mjs` trên một máy ảo 2 nhân, 8 GB RAM, cùng máy với công cụ thử. Mỗi cặp làm đúng như app:
- vào điểm hẹn;
- gửi lời mời và trả lời;
- trao đổi 4 địa chỉ mỗi bên;
- gửi qua lại các tin ván cờ qua máy chủ;
- giữ kết nối tới khi mọi cặp xong.

| Lần thử | Kết quả | Đông nhất | Vào điểm hẹn (trung vị / p99) | Lời mời → trả lời (p99) | Tin qua máy chủ, khứ hồi (p99) |
|---|---|---|---|---|---|
| 2500 cặp = 5000 người, 30 tin/cặp | 2500/2500 (100%) | 5000 kết nối | 1 ms / 6 ms | 4 ms | 7 ms (75 000 lượt) |
| 5000 cặp = 10 000 người, 10 tin/cặp | 5000/5000 (100%) | 10 000 kết nối | 1 ms / 11 ms | 10 ms | 8 ms (50 000 lượt) |

Ý nghĩa của các số đo:
- **Thời gian rất thấp** vì máy chủ và công cụ thử nằm cùng một máy. Ở thực tế, cộng thêm thời gian đường truyền (Việt Nam tới Cloudflare thường vài chục ms).
- **Phần đã được chứng minh:** lõi điểm hẹn và cách tổ chức phòng chịu được 5000–10 000 người trên một máy nhỏ.
- **Trên Cloudflare:** mỗi phòng nằm ở một Durable Object riêng. Giới hạn mềm của một Durable Object là 1000 yêu cầu mỗi giây, trong khi một phòng dùng chưa tới 1 tin mỗi giây.

Bản Cloudflare chạy thử trên máy (`npx wrangler dev`, Windows, ngày 25/11/2026):
- **Giao thức:** 8/8 phép kiểm tra giao thức đạt. App thật chạy với nó đạt 5/5 bài (nối thẳng, đi qua điểm hẹn, chuyển điểm hẹn dự phòng, báo sai mã).
- **Chặn trang lạ:** không có Origin hoặc Origin lạ bị từ chối (403).
- **Tiêu đề COOP/COEP:** trang được trả kèm đủ.
- **Thử tải 500 cặp (1000 người):** đạt 100%, nhưng chậm (vào điểm hẹn trung vị khoảng 1 giây).
- **Thử tải 2500 cặp:** phần lớn hỏng. Bộ chạy thử của wrangler chỉ mở được khoảng 1100 kết nối rồi báo "Network connection lost".
  - Đây là giới hạn của bộ chạy thử trên máy (lớp ProxyWorker), không phải của mã: cùng lõi đó chạy bằng Node vẫn chịu được 5000 người.

**Bản thật trên Cloudflare** (`https://co-tuong.cotuong-mercy.workers.dev`, 25/11/2026):
- Thử tải chạy từ một máy tính trên mạng nhà ở Việt Nam, đi qua trung tâm dữ liệu Singapore/Hong Kong.
- Giao thức: 8/8 phép kiểm tra đạt. Origin lạ hoặc thiếu Origin bị từ chối (403).

| Lần thử | Kết quả | Đông nhất | Vào điểm hẹn (trung vị / p99) | Lời mời → trả lời (trung vị / p99) | Tin qua máy chủ, khứ hồi (trung vị / p99) |
|---|---|---|---|---|---|
| 500 cặp, 20 tin/cặp | 500/500 (100%) | 1000 | 428 ms / 1,7 s | 95 / 730 ms | 89 / 593 ms |
| 1500 cặp, 10 tin/cặp | 1500/1500 (100%) | 3000 | 400 / 630 ms | 87 / 134 ms | 82 / 130 ms |
| 2500 cặp = 5000 người, 10 tin/cặp | 2500/2500 (100%) | 5000 | 444 ms / 1,9 s | 99 / 959 ms | 86 / 305 ms |

- **Máy chủ sau mỗi đợt tải:** vẫn trả lời `/health` trong 0,15–0,21 giây. `wrangler tail` không ghi lỗi nào phía máy chủ.
- **Lần thử 2500 cặp đầu tiên:** chương trình thử tải trên máy Windows bị sập ngay từ đầu, lúc đó gần như chưa có tải. Chạy lại cùng lệnh thì đạt 100%.
- **Độ trễ chậm nhất ở mức 5000 kết nối cao hơn ở mức 3000:** có lẽ vì một máy tính phải bắt tay TLS hàng nghìn lần cùng lúc. Người thật ở nhiều mạng khác nhau sẽ không bị dồn như vậy.
- **App thật với bản thật:** 5/5 bài `net-own` đạt (nối thẳng, đi qua điểm hẹn, chuyển điểm hẹn dự phòng, báo sai mã).

Chưa đo:
- Ván dài hàng chục phút với nhiều người cùng lúc.
- Chơi thật trên hai điện thoại ở hai mạng khác nhau.
- **Không thử tải `0.peerjs.com`:** đó là máy chủ dùng chung của người khác.

## 4. Chi phí ước tính (Cloudflare, giá tháng 11/2026)

- **Gói miễn phí:** Workers 100 000 yêu cầu/ngày; Durable Objects 100 000 yêu cầu/ngày; tải tệp tĩnh không giới hạn.
- **Gói trả phí** (từ 5 USD/tháng):
  - Workers: 10 triệu yêu cầu/tháng, thêm 0,30 USD mỗi triệu.
  - Durable Objects: 1 triệu yêu cầu/tháng, thêm 0,15 USD mỗi triệu.
  - Tin WebSocket gửi lên Durable Object tính 20 tin = 1 yêu cầu.

Một ván nối thẳng tốn khoảng:
- 2–3 yêu cầu Worker (mở kết nối);
- khoảng 7 yêu cầu Durable Object (mở kết nối, khoảng 12 tin bắt tay, và nhịp tim nếu Cloudflare có tính).

Một ván 15 phút phải đi qua máy chủ tốn thêm khoảng 14 yêu cầu Durable Object.

| Tình huống | Số ván/ngày | Chi phí |
|---|---|---|
| Bình thường (dưới ~14 000 ván/ngày) | < 14 000 | **0 USD** |
| 5000 người đánh liên tục 24/24, ván 15 phút | ~240 000 | khoảng **15–20 USD/tháng** |

Khi vượt hạn mức miễn phí, máy chủ Cloudflare báo lỗi và **app tự chuyển sang `0.peerjs.com`**, nên người chơi không bị chặn hẳn.

Muốn không bao giờ bị ngắt vì hạn mức thì nâng lên gói 5 USD/tháng.

## 5. Cách đưa điểm hẹn riêng lên (cần làm một lần)

1. **Tạo tài khoản:** người dùng tạo tài khoản Cloudflare miễn phí tại https://dash.cloudflare.com/sign-up (chỉ cần email).
2. **Cài công cụ:** trong thư mục dự án, chạy `npm i -D wrangler`.
3. **Thử trên máy (không cần tài khoản):**
   - Chạy `npx wrangler dev` (cổng 8787).
   - Ở cửa sổ khác, chạy `node tools/load-signal.mjs ws://127.0.0.1:8787 --cap 500`.
4. **Đăng nhập và đưa lên:**
   - Chạy `npx wrangler login`. Trình duyệt mở ra, người dùng bấm đồng ý.
   - Chạy `npx wrangler deploy`. Wrangler in ra địa chỉ dạng `https://co-tuong.<tên>.workers.dev`.
5. **Kiểm tra:**
   - Mở `https://co-tuong.<tên>.workers.dev/health`, phải thấy `{"ok":true,...}`.
   - Kiểm tra giao thức (không thử tải): `node tools/load-signal.mjs wss://co-tuong.<tên>.workers.dev --check --origin https://mercyk24.github.io`.
   - Thử tải nhẹ: `node tools/load-signal.mjs wss://co-tuong.<tên>.workers.dev --cap 200 --origin https://mercyk24.github.io`. Từ bản 1.7.0 máy chủ giới hạn 120 lần mở kết nối mỗi phút cho một IP, nên thử tải từ một máy sẽ bị chặn phần lớn; đó là giới hạn hoạt động đúng, không phải máy chủ quá tải.
6. **Bật trong app:**
   - Điền `const NET_OWN = 'wss://co-tuong.<tên>.workers.dev';` trong `src/app/45-net.js`.
   - Thêm `https://co-tuong.<tên>.workers.dev` vào `ALLOWED_ORIGINS` trong `wrangler.jsonc`, rồi `npx wrangler deploy` lại.
   - Chạy kiểm tra, rồi phát hành.
   - **Đã làm ở bản 1.4.0** với địa chỉ `wss://co-tuong.cotuong-mercy.workers.dev`.
7. **(Tuỳ chọn) Tự động đưa lên:**
   - Tạo API token Cloudflare (quyền "Edit Cloudflare Workers").
   - Lưu vào GitHub Secrets với tên `CLOUDFLARE_API_TOKEN`.
   - Thêm bước `npx wrangler deploy` vào CI.

Địa chỉ `https://co-tuong.<tên>.workers.dev` cũng là một bản sao đầy đủ của trang (lấy từ `dist/`). Nếu GitHub Pages chạm giới hạn băng thông, có thể giới thiệu địa chỉ này cho người dùng mới.

## 6. Tải trang khi đông người

- **Mỗi người mới tải khoảng 13 MB** (engine 1,6 MB và mạng NNUE 11 MB) đúng một lần.
  - Service worker giữ engine trong bộ nhớ đệm riêng (`xq-engine-v2`), không xoá khi cập nhật app.
  - Mỗi bản cập nhật chỉ tải lại khoảng 0,4 MB.
- **GitHub Pages:** giới hạn mềm 100 GB/tháng, tương đương khoảng 7500 người mới mỗi tháng. Vượt mức thì GitHub có thể gửi thư nhắc hoặc giới hạn tốc độ.
- **Cách gỡ:** dùng bản trang trên Cloudflare (mục 5). Cloudflare không tính tiền và không giới hạn tải tệp tĩnh.

## 7. Còn lại (chưa cần cho "ván diễn ra bình thường")

- **Giới hạn số kết nối theo địa chỉ IP (đã làm, bản 1.7.0):** Workers Rate Limiting (`CONN_LIMIT` trong `wrangler.jsonc`), 120 lần mở kết nối mỗi phút cho một IP. Mức rộng để nhiều người dùng chung IP (4G, trường học) không bị chặn. Vượt mức thì máy chủ trả 429 và app tự chuyển sang điểm hẹn dự phòng.
- **Nhật ký (đổi ở bản 1.7.0):** tắt nhật ký từng lượt truy cập (`invocation_logs: false`), vì nhật ký đó chứa địa chỉ IP, địa chỉ kết nối kèm mã phòng và thẻ phiên. Chỉ còn ghi lỗi. Số lượt truy cập, lỗi, thời gian chạy vẫn xem được ở mục **Metrics** của worker trong trang quản trị Cloudflare. Trang Observability sẽ gần như trống, đó là bình thường.
- **Chống gian lận, tài khoản, xếp hạng, ghép cặp với người lạ:** cần máy chủ làm trọng tài. Đây là bước sau, xem `docs/RA-SOAT.md`.
- **Thử thật trên hai điện thoại ở hai mạng khác nhau:** chưa làm.
