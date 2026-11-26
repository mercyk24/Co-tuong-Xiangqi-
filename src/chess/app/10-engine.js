  // [CỜ VUA] Chỉ app cờ vua dùng. Có bản song sinh bên cờ tướng: src/xiangqi/app/10-engine.js (giống ~78%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 10-engine.js — CỜ VUA: engine tự viết (cấp 1–5, src/chess/core/chess.js) chạy trong Web Worker, có dự phòng chạy trên luồng chính;
  // bảng cấp độ LEVELS (cấp 6: Fairy-Stockfish biến thể chess).
  // ---------- Engine (Web Worker + dự phòng) ----------
  // Hàm xử lý yêu cầu: chạy trong Web Worker (mã được ghép thành chuỗi từ chính hàm này) hoặc trên luồng chính khi không có Worker.
  // Không dùng eval / new Function để trang chạy được với chính sách nội dung (CSP) chặt.
  function chHandle(S, d) {
    function build() { const p = CH.Pos.fromFen(d.fen); for (const m of d.moves) p.make(m); return p; }
    if (d.type === 'search') { const p = build(); const o = d.opts; const r = (o.vary && d.moves.length < (o.varyPlies || 12)) ? S.searchVaried(p, o, o.vary) : S.search(p, o); return { move: r.move, score: r.score, depth: r.depth }; }
    if (d.type === 'analyze') {
      const p = build();
      const r1 = S.search(p, { maxDepth: d.depth, timeMs: d.timeMs });
      const bestNot = r1.move ? p.notation(r1.move) : '';
      p.make(d.move);
      let s2;
      if (p.legalMoves().length === 0) s2 = CH.MATE;
      else { const r2 = S.search(p, { maxDepth: Math.max(1, d.depth - 1), timeMs: d.timeMs }); s2 = -r2.score; }
      return { best: r1.move, bestNot: bestNot, s1: r1.score, s2: s2 };
    }
    return {};
  }
  const Engine = {
    worker: null, pending: new Map(), seq: 0, fb: null, ready: false,
    init() {
      const src = document.getElementById('core-src').textContent;
      try {
        const glue = src + '\n' + chHandle.toString() + `
const S = new CH.Searcher();
onmessage = function (e) { let res; try { res = chHandle(S, e.data); } catch (err) { res = { error: String(err) }; } res.id = e.data.id; postMessage(res); };`;
        const url = URL.createObjectURL(new Blob([glue], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = e => { const f = this.pending.get(e.data.id); if (f) { this.pending.delete(e.data.id); f(e.data); } };
        this.worker.onerror = () => { this.worker = null; this._failPending(); };
      } catch (err) { this.worker = null; }
    },
    _failPending() {
      const items = Array.from(this.pending.entries()); this.pending.clear();
      items.forEach(([id, f]) => f({ error: 'worker', id }));
    },
    call(d) {
      d.id = ++this.seq;
      return new Promise(resolve => {
        if (this.worker) { this.pending.set(d.id, r => { if (r.error === 'worker') this._fallback(d).then(resolve); else resolve(r); }); this.worker.postMessage(d); }
        else this._fallback(d).then(resolve);
      });
    },
    _fallback(d) {
      return new Promise(resolve => setTimeout(() => {
        if (!this.fb) { this.fb = { S: new CH.Searcher(), h: chHandle }; }
        let res; try { res = this.fb.h(this.fb.S, d); } catch (e) { res = { error: String(e) }; }
        res.id = d.id; resolve(res);
      }, 30));
    }
  };
  const LEVELS = {
    1: { name: '1 – Tập sự', opts: { maxDepth: 1, timeMs: 300, noise: 250 } },
    2: { name: '2 – Sơ cấp', opts: { maxDepth: 2, timeMs: 500, noise: 100 } },
    3: { name: '3 – Trung bình', opts: { maxDepth: 3, timeMs: 800, noise: 30 } },
    4: { name: '4 – Khá', opts: { maxDepth: 6, timeMs: 1500 } },
    5: { name: '5 – Mạnh', opts: { maxDepth: 12, timeMs: 3000 } },
    6: { name: '6 – Cao thủ (engine Fairy-Stockfish)', fsf: { ms: 1500 }, opts: { maxDepth: 12, timeMs: 3000 } }
  };

