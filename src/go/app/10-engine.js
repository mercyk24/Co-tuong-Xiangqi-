  // [CỜ VÂY] Chỉ app cờ vây dùng. Cùng khuôn với src/chess/app/10-engine.js (Worker dựng từ #core-src + hàm xử lý) nhưng
  // máy chơi là Monte-Carlo (GO.Searcher). Máy KataGo (cấp 3–6) ở 15-kata.js. Sơ đồ: docs/CAU-TRUC.md
  // 10-engine.js — CỜ VÂY: chạy máy chơi trong Web Worker (dự phòng chạy trên luồng chính), bảng cấp độ LEVELS.
  // Các việc: 'search' tìm nước (kể cả bỏ lượt), 'ownership' ước lượng đất và quân chết để đếm điểm.
  function goHandle(S, d) {
    function build() { const p = GO.Pos.fromFen(d.fen); for (const m of d.moves) p.make(m); return p; }
    if (d.type === 'search') { const r = S.search(build(), d.opts || {}); return { move: r.move, winrate: r.winrate, playouts: r.playouts }; }
    if (d.type === 'ownership') { const g = GO.guessDead(build(), d.n || 120); return { dead: Array.from(g.dead), own: Array.from(g.own) }; }
    return {};
  }
  const Engine = {
    worker: null, pending: new Map(), seq: 0, fb: null,
    init() {
      const src = document.getElementById('core-src').textContent;
      try {
        const glue = src + '\n' + goHandle.toString() + `
const S = new GO.Searcher();
onmessage = function (e) { let res; try { res = goHandle(S, e.data); } catch (err) { res = { error: String(err) }; } res.id = e.data.id; postMessage(res); };`;
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
        if (!this.fb) this.fb = new GO.Searcher();
        let res; try { res = goHandle(this.fb, d); } catch (e) { res = { error: String(e) }; }
        res.id = d.id; resolve(res);
      }, 30));
    }
  };
  // Cấp độ. Cấp 1–2: máy Monte-Carlo trong lõi go.js (số ván thử mỗi nước, có giới hạn thời gian; noise: xác suất chọn một nước
  // khá thay vì nước tốt nhất). Cấp 3–6: máy KataGo (15-kata.js): visits 1 là chỉ dùng "cảm giác" của mạng (temp > 0 thì chọn
  // ngẫu nhiên theo xác suất, đánh giống người hơn), còn lại là đọc thêm trong thời gian timeMs. KataGo chưa tải được thì cấp 3–6
  // tạm dùng máy Monte-Carlo mạnh nhất (fallback).
  const LEVELS = {
    1: { name: '1 – Tập sự (mới học luật)', opts: { playouts: 150, timeMs: 800, noise: 0.6 } },
    2: { name: '2 – Sơ cấp', opts: { playouts: 1500, timeMs: 2000, noise: 0.15 } },
    3: { name: '3 – Trung bình (KataGo, đi theo cảm giác)', kata: { visits: 1, temp: 1 }, opts: { playouts: 5000, timeMs: 3000 } },
    4: { name: '4 – Khá (KataGo, nước đầu tiên nghĩ ra)', kata: { visits: 1 }, opts: { playouts: 5000, timeMs: 3000 } },
    5: { name: '5 – Mạnh (KataGo, đọc khoảng 2 giây)', kata: { visits: 200, timeMs: 2000 }, opts: { playouts: 8000, timeMs: 4000 } },
    6: { name: '6 – Cao thủ (KataGo, đọc khoảng 6 giây)', kata: { visits: 1000, timeMs: 6000 }, opts: { playouts: 15000, timeMs: 8000 } }
  };
