  // [CỜ VÂY] Chỉ app cờ vây dùng. Sơ đồ: docs/CAU-TRUC.md
  // 15-kata.js — CỜ VÂY: máy KataGo (mạng nơ-ron g170 10 tầng, giấy phép CC0) chạy trong Web Worker riêng bằng TensorFlow.js
  // (WebAssembly). Tải khi cần lần đầu (~5,7 MB mạng + ~1,5 MB thư viện, trong ../engine/), service worker giữ lại để dùng ngoại tuyến.
  // Dùng cho: các cấp máy từ 3 trở lên, gợi ý nước, đoán quân chết khi đếm điểm, ước lượng điểm khi xem lại ván.
  // Không có hoặc không chạy được (máy quá cũ, tải hỏng) thì các chỗ đó quay về máy Monte-Carlo trong 10-engine.js.
  // Lõi: src/go/core/kata.js (mã hoá thế cờ giống KataGo, chạy mạng, tìm nước). Tài liệu: engine/README.md, docs/DU-LIEU-CO-VAY.md.
  const KATA_DIR = '../engine/', KATA_MODEL = 'kata-g170e-b10c128.kgo';
  const KATA_LIBS = ['tf-core.min.js', 'tf-backend-cpu.min.js', 'tf-backend-wasm.min.js'];
  // Hàm chạy trong Worker (được ghép vào mã Worker dưới dạng chữ, nên chỉ dùng GO, KATA và các biến của Worker)
  function kataWorker(d, st) {
    if (d.type === 'init') {
      const base = d.base;
      self.importScripts.apply(self, d.libs.map(f => base + f));
      const T = self.tf;
      T.wasm.setWasmPaths(base);
      // Chạy 1 luồng: bản nhiều luồng của tfjs cần nạp lại script chính trong các luồng phụ, việc này hỏng khi Worker tạo từ Blob.
      T.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
      return T.setBackend('wasm').then(ok => ok ? 'wasm' : Promise.reject(new Error('wasm')))
        .catch(() => T.setBackend('cpu').then(() => 'cpu'))
        .then(backend => {
          st.net = new KATA.Net(T, KATA.decodeModel(d.model));
          st.search = new KATA.Search(st.net);
          const t0 = Date.now(); KATA.evaluate(st.net, [GO.Pos.fromFen(GO.emptyFen(9))]);
          return { ok: true, backend, threads: 1, ms: Date.now() - t0 };
        });
    }
    if (!st.net) return { error: 'chưa nạp mạng' };
    const pos = GO.Pos.fromFen(d.fen);
    for (const m of d.moves) pos.make(m);
    if (d.type === 'search') {
      // Đối phương vừa bỏ lượt: nếu đếm điểm ngay (quân chết theo mạng) mà bên đi thắng thì bỏ lượt theo để kết thúc ván
      if (pos.passes >= 1 && !pos.cg) {
        const e = KATA.evaluate(st.net, [pos])[0], dead = KATA.deadFromOwnership(pos, e.whiteOwnership), s = pos.score(dead);
        if (s.winner === pos.side) return { move: GO.PASS, visits: 1, winrate: 1, lead: s.margin };
      }
      return st.search.search(pos, d.opts || {});
    }
    if (d.type === 'ownership') {
      const e = KATA.evaluate(st.net, [pos])[0];
      return { dead: Array.from(KATA.deadFromOwnership(pos, e.whiteOwnership)), own: Array.from(e.whiteOwnership), whiteLead: e.whiteLead, whiteWin: e.whiteWin };
    }
    // Phân tích cả ván (Ván đã lưu): đánh giá thế sau d.moves rồi lần lượt sau từng nước trong d.next (mỗi thế một lần chạy mạng).
    // Trả về khả năng thắng và số điểm hơn của Đen, nước mạng chọn (m = điểm + 1, bỏ lượt = GO.PASS).
    // (Đánh giá ngay trên thế đang đi, không clone: đầu vào của mạng cần lịch sử nước đi pos.undo mà clone() không chép.)
    if (d.type === 'analyze') {
      const out = [], one = () => {
        const e = KATA.evaluate(st.net, [pos])[0], A = e.policy.length - 1, wl = e.whiteWin + e.whiteLoss;
        let b = 0; for (let p = 1; p <= A; p++) if (e.policy[p] > e.policy[b]) b = p;
        out.push({ w: wl > 0 ? e.whiteLoss / wl : 0.5, l: -e.whiteLead, b: b === A ? GO.PASS : b + 1 });
      };
      one();
      for (const m of d.next || []) { if (!pos.isLegal(m)) break; pos.make(m); one(); }
      return { list: out };
    }
    if (d.type === 'eval') { const e = KATA.evaluate(st.net, [pos])[0]; return { whiteWin: e.whiteWin, whiteLead: e.whiteLead }; }
    return { error: 'không rõ việc ' + d.type };
  }
  const Kata = {
    state: 'none',   // none · loading · ready · failed
    worker: null, pending: new Map(), seq: 0, info: null, err: '', loading: null,
    // Bắt đầu tải (nếu chưa); trả về Promise<boolean> đã sẵn sàng chưa
    ensure(quiet) {
      if (this.state === 'ready') return Promise.resolve(true);
      if (this.state === 'failed') return Promise.resolve(false);
      if (this.loading) return this.loading;
      this.state = 'loading';
      if (!quiet) toast('Đang tải máy KataGo (khoảng 7 MB, chỉ tải một lần)…');
      this.loading = this.start().then(info => {
        this.state = 'ready'; this.info = info; this.loading = null;
        if (!quiet) toast('Máy KataGo đã sẵn sàng.', 'ok');
        this.onChange && this.onChange();
        return true;
      }, e => {
        this.state = 'failed'; this.err = String(e && e.message || e); this.loading = null;
        if (this.worker) { this.worker.terminate(); this.worker = null; }
        toast('Không chạy được KataGo trên máy này (' + this.err + '). Dùng tạm máy thường.', 'warn');
        this.onChange && this.onChange();
        return false;
      });
      return this.loading;
    },
    async start() {
      const base = new URL(KATA_DIR, location.href).href;
      const res = await fetch(base + KATA_MODEL);
      if (!res.ok) throw new Error('không tải được mạng (' + res.status + ')');
      const model = await res.arrayBuffer();
      const src = document.getElementById('core-src').textContent;
      const glue = src + '\n' + kataWorker.toString() + `
const st = {};
onmessage = function (e) {
  const d = e.data, done = r => { r = r || {}; r.id = d.id; postMessage(r); };
  let r;
  try { r = kataWorker(d, st); } catch (err) { done({ error: String(err && err.message || err) }); return; }
  if (r && typeof r.then === 'function') r.then(done, err => done({ error: String(err && err.message || err) })); else done(r);
};`;
      this.worker = new Worker(URL.createObjectURL(new Blob([glue], { type: 'text/javascript' })));
      this.worker.onmessage = e => { const f = this.pending.get(e.data.id); if (f) { this.pending.delete(e.data.id); f(e.data); } };
      this.worker.onerror = e => { this.fail('lỗi Worker' + (e && e.message ? ': ' + e.message : '')); };
      const r = await Promise.race([
        this.post({ type: 'init', model, base, libs: KATA_LIBS }, [model]),
        new Promise((ok, no) => setTimeout(() => no(new Error('quá thời gian khởi động')), 60000))
      ]);
      if (!r || r.error) throw new Error(r ? r.error : 'không khởi động được');
      return r;
    },
    post(d, transfer) {
      d.id = ++this.seq;
      return new Promise(resolve => { this.pending.set(d.id, resolve); this.worker.postMessage(d, transfer || []); });
    },
    fail(msg) {
      const items = Array.from(this.pending.values()); this.pending.clear();
      items.forEach(f => f({ error: msg }));
      if (this.state === 'ready') { this.state = 'failed'; this.err = msg; toast('Máy KataGo gặp lỗi, dùng tạm máy thường.', 'warn'); }
    },
    // Gọi việc khi đã sẵn sàng; chưa sẵn sàng thì trả về { error }
    call(d) { return this.state === 'ready' && this.worker ? this.post(d) : Promise.resolve({ error: 'chưa sẵn sàng' }); },
    label() {
      if (this.state === 'ready') return 'Đã sẵn sàng (' + (this.info.backend === 'wasm' ? 'WebAssembly, ' + this.info.threads + ' luồng' : 'JavaScript, chậm') + ').';
      if (this.state === 'loading') return 'Đang tải…';
      if (this.state === 'failed') return 'Không chạy được trên máy này: ' + this.err;
      return 'Chưa tải. Tự tải khi bạn chọn cấp máy từ 3 trở lên, xin gợi ý hoặc đếm điểm (khoảng 7 MB, một lần).';
    }
  };
