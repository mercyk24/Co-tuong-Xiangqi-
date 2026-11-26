// [CỜ VÂY] Lõi luật cờ vây, chỉ app cờ vây và công cụ tools/go/ dùng. Sơ đồ: docs/CAU-TRUC.md
/* go.js - Lõi CỜ VÂY: bàn 9×9 / 13×13 / 19×19, đặt quân, khí, ăn quân, cấm tự sát, cấm lặp lại toàn bàn (siêu kiếp),
 * đếm điểm kiểu Trung Quốc (đất + quân, điểm bù cho Trắng), ước lượng quân chết, ghi ván SGF, bộ giải "bắt quân",
 * máy chơi Monte-Carlo (UCT + RAVE). Biến thể "cờ bắt quân": ai ăn được quân trước là thắng.
 * KHÔNG dùng chung gì với lõi cờ tướng / cờ vua. Chạy được trong trình duyệt, Web Worker và Node.
 *
 * Quy ước:
 * - Điểm p = hàng * N + cột (hàng 0 ở trên cùng). Nước đi m = p + 1 (luôn khác 0); bỏ lượt PASS = 1000.
 * - Bên 0 là Đen (đi trước), bên 1 là Trắng.
 * - Thế cờ dạng chữ ("FEN" của app): "<N> <b|w> <komi> <hàng/hàng/…>[ cg]", ô trống '.', Đen 'x', Trắng 'o';
 *   'cg' là cờ bắt quân. Ví dụ bàn 9 trống: "9 b 7.5 ........./…/.........".
 * - Toạ độ hiển thị kiểu quốc tế: cột A–T bỏ chữ I, hàng đánh số từ dưới lên (A1 là góc dưới trái). */
(function (root) {
  'use strict';
  const PASS = 1000;
  const EMPTY = 0, BL = 1, WH = 2, EDGE = 3;          // giá trị ô trong mảng bàn có viền
  const COLS = 'ABCDEFGHJKLMNOPQRST';
  const SIZES = [9, 13, 19];

  // Số ngẫu nhiên cố định (Zobrist) để nhận ra thế cờ lặp lại
  let seed = 0x2545F491;
  const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const ZB = new Uint32Array(21 * 21 * 3), ZB2 = new Uint32Array(21 * 21 * 3);
  for (let i = 0; i < ZB.length; i++) { ZB[i] = rnd32(); ZB2[i] = rnd32(); }

  const emptyFen = (n, komi, cg) => n + ' b ' + (komi === undefined ? 7.5 : komi) + ' ' + Array(n).fill('.'.repeat(n)).join('/') + (cg ? ' cg' : '');
  const START_FEN = emptyFen(9);

  // ---------- Thế cờ ----------
  class Pos {
    constructor(n) {
      this.n = n; this.W = n + 2;
      this.b = new Uint8Array(this.W * this.W).fill(EDGE);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) this.b[(r + 1) * this.W + c + 1] = EMPTY;
      this.side = 0; this.komi = 7.5; this.cg = false;
      this.caps = [0, 0];       // số quân mỗi bên đã ăn
      this.ko = -1;              // ô cấm đánh lại ngay (kiếp đơn), dạng chỉ số trong mảng có viền
      this.passes = 0;           // số lần bỏ lượt liên tiếp
      this.hlo = 0; this.hhi = 0;
      this.hist = new Set();     // các thế cờ đã có (siêu kiếp)
      this.undo = [];
      this.mark = new Uint32Array(this.W * this.W); this.gen = 1;
      this.D = [-this.W, -1, 1, this.W];
      this.ended = 0;            // cờ bắt quân: 1 + bên vừa ăn quân (0 = chưa kết thúc)
    }
    static fromFen(fen) {
      const t = String(fen).trim().split(/\s+/), n = +t[0];
      if (!SIZES.includes(n) && !(n >= 5 && n <= 19)) throw new Error('Cỡ bàn không hợp lệ');
      const p = new Pos(n);
      p.side = t[1] === 'w' ? 1 : 0; p.komi = +t[2]; p.cg = t[4] === 'cg';
      const rows = (t[3] || '').split('/');
      if (rows.length !== n) throw new Error('Thế cờ không hợp lệ');
      rows.forEach((row, r) => { if (row.length !== n) throw new Error('Thế cờ không hợp lệ'); for (let c = 0; c < n; c++) { const ch = row[c]; if (ch === 'x' || ch === 'o') p.put((r + 1) * p.W + c + 1, ch === 'x' ? BL : WH); } });
      p.hist.add(p.key());
      return p;
    }
    fen() {
      const rows = [];
      for (let r = 0; r < this.n; r++) { let s = ''; for (let c = 0; c < this.n; c++) { const v = this.b[(r + 1) * this.W + c + 1]; s += v === BL ? 'x' : v === WH ? 'o' : '.'; } rows.push(s); }
      return this.n + ' ' + (this.side ? 'w' : 'b') + ' ' + this.komi + ' ' + rows.join('/') + (this.cg ? ' cg' : '');
    }
    clone() { const q = Pos.fromFen(this.fen()); q.caps = this.caps.slice(); q.ko = this.ko; q.passes = this.passes; q.hist = new Set(this.hist); q.ended = this.ended; return q; }
    key() { return this.hhi * 4294967296 + this.hlo; }
    // điểm p (0..N²-1) <-> chỉ số trong mảng có viền
    idx(p) { return ((p / this.n) | 0) * this.W + this.W + (p % this.n) + 1; }
    pt(i) { return ((i / this.W) | 0) * this.n - this.n + (i % this.W) - 1; }
    at(p) { const v = this.b[this.idx(p)]; return v === BL ? 0 : v === WH ? 1 : -1; }   // 0 Đen, 1 Trắng, -1 trống
    put(i, v) { this.b[i] = v; const z = i * 3 + v; this.hlo = (this.hlo ^ ZB[z]) >>> 0; this.hhi = (this.hhi ^ ZB2[z]) >>> 0; }
    lift(i) { const v = this.b[i]; const z = i * 3 + v; this.hlo = (this.hlo ^ ZB[z]) >>> 0; this.hhi = (this.hhi ^ ZB2[z]) >>> 0; this.b[i] = EMPTY; }
    // Nhóm quân chứa ô i: danh sách quân và số khí (đếm tối đa max khí nếu có, để nhanh)
    group(i, max) {
      const col = this.b[i], g = ++this.gen, st = [i], stones = [];
      let libs = 0; this.mark[i] = g;
      while (st.length) {
        const s = st.pop(); stones.push(s);
        for (const d of this.D) {
          const t = s + d, v = this.b[t];
          if (this.mark[t] === g) continue;
          if (v === EMPTY) { this.mark[t] = g; libs++; if (max && libs >= max) return { stones, libs, partial: true }; }
          else if (v === col) { this.mark[t] = g; st.push(t); }
        }
      }
      return { stones, libs };
    }
    libsOf(i) {   // danh sách khí của nhóm chứa ô i
      const col = this.b[i], g = ++this.gen, st = [i], libs = [];
      this.mark[i] = g;
      while (st.length) {
        const s = st.pop();
        for (const d of this.D) {
          const t = s + d, v = this.b[t];
          if (this.mark[t] === g) continue;
          if (v === EMPTY) { this.mark[t] = g; libs.push(t); }
          else if (v === col) { this.mark[t] = g; st.push(t); }
        }
      }
      return libs;
    }
    // Thử đặt quân ở ô i cho bên đi: trả về null nếu không hợp lệ, ngược lại { cap: [các ô bị ăn], hlo, hhi } (không đổi bàn)
    tryPlay(i, superko) {
      if (this.b[i] !== EMPTY || i === this.ko || this.ended) return null;
      const me = this.side ? WH : BL, op = me === BL ? WH : BL;
      let cap = null, hasLib = false;
      for (const d of this.D) {
        const t = i + d, v = this.b[t];
        if (v === EMPTY) hasLib = true;
        else if (v === op) {
          const g = this.group(t, 2);
          if (g.libs === 1) { if (!cap) cap = []; for (const s of g.stones) if (!cap.includes(s)) cap.push(s); }
        } else if (v === me && !hasLib) { if (this.group(t, 2).libs >= 2) hasLib = true; }
      }
      if (!hasLib && !cap) return null;                 // tự sát: không được
      let lo = (this.hlo ^ ZB[i * 3 + me]) >>> 0, hi = (this.hhi ^ ZB2[i * 3 + me]) >>> 0;
      if (cap) for (const s of cap) { lo = (lo ^ ZB[s * 3 + op]) >>> 0; hi = (hi ^ ZB2[s * 3 + op]) >>> 0; }
      if (superko && this.hist.has(hi * 4294967296 + lo)) return null;   // lặp lại thế cờ đã có: không được
      return { cap: cap || [], lo, hi };
    }
    isLegal(m) {
      if (m === PASS) return !this.ended;
      const p = m - 1; if (!(p >= 0 && p < this.n * this.n)) return false;
      return !!this.tryPlay(this.idx(p), true);
    }
    legalMoves() {
      if (this.ended) return [];
      const out = [];
      for (let p = 0; p < this.n * this.n; p++) if (this.tryPlay(this.idx(p), true)) out.push(p + 1);
      out.push(PASS);
      return out;
    }
    make(m) {
      const rec = { m, ko: this.ko, passes: this.passes, lo: this.hlo, hi: this.hhi, cap: [], ended: this.ended };
      if (m === PASS) { this.passes++; this.ko = -1; }
      else {
        const i = this.idx(m - 1), r = this.tryPlay(i, false);
        if (!r) throw new Error('Nước không hợp lệ');
        const me = this.side ? WH : BL;
        this.put(i, me);
        for (const s of r.cap) this.lift(s);
        rec.cap = r.cap; this.caps[this.side] += r.cap.length;
        this.ko = -1;
        if (r.cap.length === 1) { const g = this.group(i); if (g.stones.length === 1 && g.libs === 1) this.ko = r.cap[0]; }
        this.passes = 0;
        if (this.cg && r.cap.length) this.ended = 1 + this.side;
      }
      this.undo.push(rec);
      this.side ^= 1;
      rec.added = !this.hist.has(this.key()); if (rec.added) this.hist.add(this.key());
      return true;
    }
    unmake() {
      const rec = this.undo.pop(); if (!rec) return;
      if (rec.added) this.hist.delete(this.key());
      this.side ^= 1;
      if (rec.m !== PASS) {
        const i = this.idx(rec.m - 1), op = this.side ? BL : WH;
        this.lift(i);
        for (const s of rec.cap) this.put(s, op);
        this.caps[this.side] -= rec.cap.length;
      }
      this.ko = rec.ko; this.passes = rec.passes; this.hlo = rec.lo; this.hhi = rec.hi; this.ended = rec.ended;
    }
    // Ký hiệu nước: "D4" hoặc "Bỏ lượt"; dạng chuỗi gửi qua mạng/lưu: "d4" hoặc "pass"
    pname(p) { return COLS[p % this.n] + (this.n - ((p / this.n) | 0)); }
    notation(m) { return m === PASS ? 'Bỏ lượt' : this.pname(m - 1); }
    parse(s) {
      s = String(s).trim().toUpperCase();
      if (s === 'PASS') return this.isLegal(PASS) ? PASS : 0;
      const p = this.pointOf(s);
      return p >= 0 && this.isLegal(p + 1) ? p + 1 : 0;
    }
    // Điểm p theo tên ("D4"), không cần ô trống; -1 nếu sai
    pointOf(s) {
      s = String(s).trim().toUpperCase();
      const c = COLS.indexOf(s[0]), r = this.n - +s.slice(1);
      return c >= 0 && c < this.n && r >= 0 && r < this.n && /^\d+$/.test(s.slice(1)) ? r * this.n + c : -1;
    }
    inCheck() { return false; }
    // Mắt thật đơn giản của màu col tại ô trống i (dùng để máy không tự lấp mắt mình)
    isEye(i, col) {
      for (const d of this.D) { const v = this.b[i + d]; if (v !== col && v !== EDGE) return false; }
      let bad = 0, edge = false;
      for (const d of [-this.W - 1, -this.W + 1, this.W - 1, this.W + 1]) { const v = this.b[i + d]; if (v === EDGE) edge = true; else if (v !== col && v !== EMPTY) bad++; }
      return edge ? bad === 0 : bad <= 1;
    }
    // ---------- Đếm điểm (luật Trung Quốc: quân sống + đất; quân chết tính cho bên kia) ----------
    // dead: tập điểm p của quân chết. Trả về điểm Đen, Trắng (đã cộng komi), chủ của từng điểm (0 Đen, 1 Trắng, -1 không ai).
    score(dead) {
      const n = this.n, own = new Int8Array(n * n).fill(-1), live = new Int8Array(n * n).fill(-1);
      const D = dead || new Set();
      for (let p = 0; p < n * n; p++) { const a = this.at(p); if (a >= 0 && !D.has(p)) live[p] = a; }
      const seen = new Uint8Array(n * n);
      for (let p = 0; p < n * n; p++) {
        if (live[p] >= 0) { own[p] = live[p]; continue; }
        if (seen[p]) continue;
        // vùng trống (kể cả quân chết) liền nhau: thuộc bên nào nếu chỉ giáp quân sống của một bên
        const reg = [], st = [p]; seen[p] = 1; let touch = 0;
        while (st.length) {
          const q = st.pop(); reg.push(q);
          const r = (q / n) | 0, c = q % n;
          for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            const t = rr * n + cc;
            if (live[t] >= 0) touch |= 1 << live[t];
            else if (!seen[t]) { seen[t] = 1; st.push(t); }
          }
        }
        const o = touch === 1 ? 0 : touch === 2 ? 1 : -1;
        for (const q of reg) own[q] = o;
      }
      let b = 0, w = this.komi;
      for (let p = 0; p < n * n; p++) { if (own[p] === 0) b++; else if (own[p] === 1) w++; }
      return { black: b, white: w, own, winner: b > w ? 0 : w > b ? 1 : -1, margin: Math.abs(b - w) };
    }
    resultText(dead) {
      const s = this.score(dead);
      const f = x => String(x).replace('.', ',');
      if (s.winner < 0) return 'Hòa (Đen ' + f(s.black) + ', Trắng ' + f(s.white) + ').';
      return (s.winner === 0 ? 'Đen' : 'Trắng') + ' thắng ' + f(s.margin) + ' điểm (Đen ' + f(s.black) + ', Trắng ' + f(s.white) + ' kể cả ' + f(this.komi) + ' điểm bù).';
    }
  }

  // ---------- Ván nhanh ngẫu nhiên (playout) ----------
  // Bàn chơi nhanh: không kiểm siêu kiếp, chỉ kiếp đơn; không đặt vào mắt mình; ưu tiên ăn quân / cứu quân bị "atari".
  function playout(pos, maxMoves, amaf, rng) {
    const n = pos.n, N2 = n * n;
    let passes = pos.passes, moves = 0, firstCap = pos.ended;
    const empties = [];
    for (let p = 0; p < N2; p++) if (pos.b[pos.idx(p)] === EMPTY) empties.push(pos.idx(p));
    while (moves < maxMoves && passes < 2 && !firstCap) {
      const me = pos.side ? WH : BL;
      let played = -1;
      // 1) Ăn nhóm đối phương chỉ còn 1 khí cạnh nước vừa rồi; 2) cứu nhóm mình chỉ còn 1 khí
      const last = pos.undo.length ? pos.undo[pos.undo.length - 1] : null;
      if (last && last.m !== PASS && rng() < 0.9) {
        const li = pos.idx(last.m - 1);
        for (const d of pos.D) {
          const t = li + d, v = pos.b[t];
          if (v === EMPTY || v === EDGE) continue;
          const libs = pos.libsOf(t);
          if (libs.length === 1 && pos.tryPlay(libs[0], false)) {
            if (v !== me) { played = libs[0]; break; }
            // cứu: chạy ra chỉ khi sau đó có từ 2 khí trở lên
            const r = pos.tryPlay(libs[0], false);
            if (r) { pos.put(libs[0], me); const ok = pos.group(libs[0], 3).libs >= 2; pos.lift(libs[0]); if (ok) { played = libs[0]; break; } }
          }
        }
      }
      if (played < 0) {
        // nước ngẫu nhiên hợp lệ, không lấp mắt mình
        let k = empties.length;
        while (k > 0) {
          const j = (rng() * k) | 0, i = empties[j];
          empties[j] = empties[k - 1]; empties[k - 1] = i; k--;
          if (pos.b[i] !== EMPTY) continue;
          if (pos.isEye(i, me)) continue;
          if (pos.tryPlay(i, false)) { played = i; break; }
        }
      }
      if (played < 0) { pos.make(PASS); passes++; }
      else {
        const m = pos.pt(played) + 1, before = pos.caps[0] + pos.caps[1];
        if (amaf && amaf[m] === undefined) amaf[m] = pos.side;
        pos.make(m); passes = 0;
        if (pos.caps[0] + pos.caps[1] !== before) { // quân bị ăn: ô trống mới
          for (const s of pos.undo[pos.undo.length - 1].cap) empties.push(s);
          if (pos.cg) firstCap = pos.ended;
        }
      }
      moves++;
    }
    return moves;
  }
  // Kết quả một ván nhanh, nhìn từ bên `side`: 1 thắng, 0 thua
  function playoutWinner(pos) {
    if (pos.cg) return pos.ended ? pos.ended - 1 : (pos.caps[0] > pos.caps[1] ? 0 : pos.caps[1] > pos.caps[0] ? 1 : -1);
    const s = pos.score(null); return s.winner;
  }
  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // Ước lượng chủ của từng điểm (để đoán quân chết khi đếm điểm): chạy nhiều ván nhanh từ thế hiện tại.
  function ownership(pos, nPlayouts, seedV) {
    const n = pos.n, acc = new Float32Array(n * n), rng = mulberry(seedV || 12345);
    for (let k = 0; k < nPlayouts; k++) {
      const q = pos.clone(); q.passes = 0;
      playout(q, n * n * 3, null, rng);
      const s = q.score(null);
      for (let p = 0; p < n * n; p++) acc[p] += s.own[p] === 0 ? 1 : s.own[p] === 1 ? -1 : 0;
    }
    for (let p = 0; p < n * n; p++) acc[p] /= nPlayouts;
    return acc;   // +1: chắc chắn của Đen, -1: chắc chắn của Trắng
  }
  // Đoán quân chết: nhóm quân mà phần lớn ván nhanh đều bị bên kia chiếm
  function guessDead(pos, nPlayouts) {
    const own = ownership(pos, nPlayouts || 160), dead = new Set(), n = pos.n, seen = new Set();
    for (let p = 0; p < n * n; p++) {
      const a = pos.at(p); if (a < 0 || seen.has(p)) continue;
      const g = pos.group(pos.idx(p)).stones.map(i => pos.pt(i));
      g.forEach(q => seen.add(q));
      const avg = g.reduce((s, q) => s + own[q], 0) / g.length;
      if ((a === 0 && avg < -0.4) || (a === 1 && avg > 0.4)) g.forEach(q => dead.add(q));
    }
    return { dead, own };
  }

  // ---------- Máy chơi: Monte-Carlo tìm kiếm cây (UCT + RAVE) ----------
  class Node {
    constructor(m, side) { this.m = m; this.side = side; this.n = 0; this.w = 0; this.pn = 0; this.pw = 0; this.rn = 0; this.rw = 0; this.kids = null; }
  }
  class Searcher {
    constructor() { this.rng = Math.random; }
    clear() { /* không giữ gì giữa các lần tìm */ }
    candidates(pos) {
      const me = pos.side ? WH : BL, out = [];
      for (let p = 0; p < pos.n * pos.n; p++) { const i = pos.idx(p); if (pos.b[i] === EMPTY && !pos.isEye(i, me) && pos.tryPlay(i, true)) out.push(p + 1); }
      return out;
    }
    // Nút con kèm "kinh nghiệm" ban đầu (số ván ảo, chỉ để hướng việc tìm kiếm; khi chọn nước cuối cùng thì không tính):
    // ăn quân, cứu quân bị atari, đánh gần nước vừa rồi thì tốt; tự vào atari, đánh đường 1–2 lúc bàn còn trống thì kém;
    // đầu ván trên bàn lớn ưu tiên đường 3–4.
    kids(pos) {
      const side = pos.side, me = side ? WH : BL, n = pos.n;
      const stones = pos.undo.length;
      const last = stones && pos.undo[stones - 1].m !== PASS ? pos.undo[stones - 1].m - 1 : -1;
      const lr = last >= 0 ? (last / n) | 0 : 0, lc = last >= 0 ? last % n : 0;
      const early = stones < n * (n >= 13 ? 3 : 2);
      return this.candidates(pos).map(m => {
        const nd = new Node(m, side), i = pos.idx(m - 1), r = pos.tryPlay(i, false);
        let pn = 0, pw = 0;
        const add = (k, w) => { pn += k; pw += k * w; };
        if (r.cap.length) add(12 + Math.min(20, r.cap.length * 4), 0.85);
        let saves = false;
        for (const d of pos.D) { const v = pos.b[i + d]; if (v === me && pos.group(i + d, 2).libs === 1) saves = true; }
        pos.put(i, me);
        const g = pos.group(i, 3);
        pos.lift(i);
        if (g.libs === 1 && !r.cap.length) add(14, 0.05);          // tự vào atari
        else if (saves && g.libs >= 2) add(10, 0.8);              // chạy thoát
        const rr = ((m - 1) / n) | 0, cc = (m - 1) % n, line = Math.min(rr, cc, n - 1 - rr, n - 1 - cc);
        if (early) {
          if (line === 0) add(20, 0.1);
          else if (line === 1) add(12, 0.25);
          else if (n >= 13 && (line === 2 || line === 3)) add(10, 0.7);
        } else if (line === 0) add(6, 0.3);
        if (last >= 0 && Math.abs(rr - lr) + Math.abs(cc - lc) <= 2) add(6, 0.65);   // đáp lại gần nước vừa rồi
        if (pn) { nd.n = pn; nd.w = pw; nd.pn = pn; nd.pw = pw; }
        return nd;
      });
    }
    // opts: playouts (số ván nhanh), timeMs, noise (0..1: xác suất chọn ngẫu nhiên trong các nước khá), seed
    search(pos0, opts) {
      opts = opts || {};
      const pos = pos0.clone(), me = pos.side, t0 = Date.now();
      const rng = opts.seed ? mulberry(opts.seed) : Math.random;
      // Đối phương vừa bỏ lượt: nếu đếm điểm lúc này (có đoán quân chết) mà mình thắng thì bỏ lượt theo để kết thúc ván
      if (!pos.cg && pos.passes >= 1) {
        const g = guessDead(pos, 120), s = pos.score(g.dead);
        if (s.winner === me) return { move: PASS, winrate: 1, playouts: 0 };
      }
      const cand = this.candidates(pos);
      if (!cand.length) return { move: PASS, winrate: 0, playouts: 0 };
      const root = new Node(0, me ^ 1); root.kids = this.kids(pos);
      const maxP = opts.playouts || 1000, tl = opts.timeMs || 1e9, K = 400;
      let np = 0;
      while (np < maxP && (np & 63 || Date.now() - t0 < tl)) {
        // chọn đường đi trong cây
        const path = [root]; let node = root, depth = 0;
        while (node.kids && node.kids.length) {
          let best = null, bv = -1;
          const lg = Math.log(node.n + 1);
          for (const k of node.kids) {
            const beta = k.rn / (k.n + k.rn + k.n * k.rn / K + 1e-9);
            const q = k.n ? k.w / k.n : 0.5, rq = k.rn ? k.rw / k.rn : 0.5;
            const v = (1 - beta) * q + beta * rq + 0.35 * Math.sqrt(lg / (k.n + 1)) + rng() * 1e-6;
            if (v > bv) { bv = v; best = k; }
          }
          node = best; pos.make(node.m); path.push(node); depth++;
          if (node.n >= 8 && !node.kids && !pos.ended) node.kids = this.kids(pos);
          if (pos.ended) break;
        }
        // ván nhanh tới hết
        const amaf = {};
        const pm = playout(pos, pos.n * pos.n * 3, amaf, rng);
        const win = playoutWinner(pos);
        for (let k = 0; k < pm; k++) pos.unmake();
        for (let k = 0; k < depth; k++) pos.unmake();
        // cập nhật
        for (const nd of path) {
          nd.n++; if (win === nd.side) nd.w++;
          if (nd.kids) for (const k of nd.kids) if (amaf[k.m] === k.side) { k.rn++; if (win === k.side) k.rw++; }
        }
        np++;
      }
      // Chọn nước được thử nhiều nhất (chỉ tính ván thật, không tính số ván ảo ban đầu)
      const real = k => k.n - k.pn;
      const kids = root.kids.slice().sort((a, b) => real(b) - real(a) || b.w / (b.n || 1) - a.w / (a.n || 1));
      let pick = kids[0];
      if (opts.noise && rng() < opts.noise) {
        const ok = kids.filter(k => real(k) >= real(kids[0]) * 0.15);
        pick = ok[(rng() * ok.length) | 0] || kids[0];
      }
      const wr = real(pick) > 0 ? (pick.w - pick.pw) / real(pick) : 0.5;
      // Thua chắc và đối phương đã bỏ lượt: bỏ lượt (tránh đánh vô ích trong đất người)
      if (pos.passes >= 1 && wr < 0.05) return { move: PASS, winrate: wr, playouts: np };
      return { move: pick.m, winrate: wr, playouts: np };
    }
  }

  // ---------- Bộ giải "bắt quân" (đọc thang, lưới) ----------
  // Người tấn công (bên đi) có bắt được nhóm chứa điểm `target` trong tối đa `depth` nước của mình không?
  // Người phòng thủ "thoát" khi nhóm có từ 3 khí trở lên, hoặc người tấn công hết lượt. Người phòng thủ được chạy ra (đi vào khí),
  // ăn quân đang vây chỉ còn 1 khí, hoặc đi chỗ khác. Trả về danh sách nước đầu tiên bắt được (rỗng: không bắt được).
  // maxNodes: giới hạn số thế cờ xét (mặc định 200000); vượt giới hạn thì trả về null (không chắc chắn).
  let nodes = 0, limit = Infinity;
  const OVER = { over: true };
  const tick = () => { if (++nodes > limit) throw OVER; };
  function guarded(fn, maxNodes) {
    nodes = 0; limit = maxNodes || 200000;
    try { return fn(); } catch (e) { if (e === OVER) return null; throw e; } finally { limit = Infinity; }
  }
  function captureMoves(pos, target, depth, maxNodes) {
    return guarded(() => {
      const out = [], ti = pos.idx(target);
      if (pos.b[ti] === EMPTY || depth <= 0) return out;
      for (const m of attackCands(pos, ti)) {
        pos.make(m);
        let ok;
        try { ok = pos.b[ti] === EMPTY || !defend(pos, ti, depth - 1); } finally { pos.unmake(); }
        if (ok) out.push(m);
      }
      return out;
    }, maxNodes);
  }
  function attackCands(pos, ti) {
    const libs = pos.libsOf(ti), set = new Set(libs);
    if (libs.length === 2) for (const l of libs) for (const d of pos.D) if (pos.b[l + d] === EMPTY) set.add(l + d);   // khí thứ hai
    const ms = [];
    for (const i of set) { const m = pos.pt(i) + 1; if (pos.isLegal(m)) ms.push(m); }
    return ms;
  }
  function defenseCands(pos, ti) {
    const col = pos.b[ti], cands = new Set(pos.libsOf(ti)), seen = new Set();
    for (const s of pos.group(ti).stones) for (const d of pos.D) {
      const t = s + d;
      if (pos.b[t] === EMPTY || pos.b[t] === EDGE || pos.b[t] === col || seen.has(t)) continue;
      const g = pos.group(t).stones; g.forEach(x => seen.add(x));
      const l = pos.libsOf(t);
      if (l.length <= 2) for (const x of l) cands.add(x);   // ăn quân đang vây (1 khí) hoặc đánh "atari" ngược (2 khí)
    }
    const ms = [];
    for (const i of cands) { const m = pos.pt(i) + 1; if (pos.isLegal(m)) ms.push(m); }
    ms.push(PASS);   // đi chỗ khác
    return ms;
  }
  // true: người tấn công (bên đi, còn d nước) bắt được
  function attack(pos, ti, d) {
    tick();
    if (pos.b[ti] === EMPTY) return true;
    if (d <= 0) return false;
    const n = pos.libsOf(ti).length;
    if (n >= 3) return false;
    for (const m of attackCands(pos, ti)) {
      pos.make(m);
      let ok;
      try { ok = pos.b[ti] === EMPTY || !defend(pos, ti, d - 1); } finally { pos.unmake(); }
      if (ok) return true;
    }
    return false;
  }
  // true: người phòng thủ (bên đi) giữ được nhóm khi người tấn công còn d nước
  function defend(pos, ti, d) {
    tick();
    if (pos.b[ti] === EMPTY) return false;
    if (d <= 0 || pos.libsOf(ti).length >= 3) return true;
    for (const m of defenseCands(pos, ti)) {
      pos.make(m);
      let ok;
      try { ok = pos.b[ti] !== EMPTY && !attack(pos, ti, d); } finally { pos.unmake(); }
      if (ok) return true;
    }
    return false;
  }
  // Số nước tấn công ít nhất để bắt (1..depth); 0: không bắt được trong depth nước; -1: quá giới hạn tính toán
  function captureLength(pos, target, depth, maxNodes) {
    for (let d = 1; d <= depth; d++) {
      const r = captureMoves(pos, target, d, maxNodes);
      if (r === null) return -1;
      if (r.length) return d;
    }
    return 0;
  }
  // Nước phòng thủ tốt nhất (kéo dài nhất) cho người phòng thủ đang đi, dùng khi giải bài trong app
  function bestDefense(pos, target, depth) {
    const ti = pos.idx(target);
    let best = PASS, bestLen = -1;
    for (const m of defenseCands(pos, ti)) {
      pos.make(m);
      let len;
      try { len = pos.b[ti] === EMPTY ? 0 : captureLength(pos, target, depth, 50000); } finally { pos.unmake(); }
      if (len === 0 || len === -1) len = 99;
      if (len > bestLen || (len === bestLen && best === PASS)) { bestLen = len; best = m; }
    }
    return best;
  }

  // ---------- SGF ----------
  const sgfC = i => String.fromCharCode(97 + i);
  function toSgf(startFen, moves, meta) {
    const p = Pos.fromFen(startFen), n = p.n;
    let s = '(;GM[1]FF[4]CA[UTF-8]AP[Co Luyen Tap]SZ[' + n + ']KM[' + p.komi + ']RU[Chinese]';
    if (meta && meta.PB) s += 'PB[' + meta.PB + ']'; if (meta && meta.PW) s += 'PW[' + meta.PW + ']';
    if (meta && meta.RE) s += 'RE[' + meta.RE + ']'; if (meta && meta.DT) s += 'DT[' + meta.DT + ']';
    const ab = [], aw = [];
    for (let q = 0; q < n * n; q++) { const a = p.at(q); if (a === 0) ab.push(q); else if (a === 1) aw.push(q); }
    if (ab.length) s += 'AB' + ab.map(q => '[' + sgfC(q % n) + sgfC((q / n) | 0) + ']').join('');
    if (aw.length) s += 'AW' + aw.map(q => '[' + sgfC(q % n) + sgfC((q / n) | 0) + ']').join('');
    if (p.side === 1) s += 'PL[W]';
    for (const m of moves) {
      const c = p.side ? 'W' : 'B';
      s += ';' + c + '[' + (m === PASS ? '' : sgfC((m - 1) % n) + sgfC(((m - 1) / n) | 0)) + ']';
      p.make(m);
    }
    return s + ')';
  }
  // Đọc SGF (nhánh chính): trả về { startFen, moves } hoặc ném lỗi
  function fromSgf(text) {
    const t = String(text);
    const prop = k => { const m = new RegExp('(?:^|[^A-Z])' + k + '((?:\\[[^\\]]*\\])+)').exec(t); return m ? m[1].slice(1, -1).split('][') : null; };
    const sz = prop('SZ'), n = sz ? +sz[0] : 19;
    if (!(n >= 5 && n <= 19)) throw new Error('Cỡ bàn không hỗ trợ');
    const km = prop('KM'), komi = km ? +km[0] : 7.5;
    const p = Pos.fromFen(emptyFen(n, isFinite(komi) ? komi : 7.5));
    const xy = v => v.length >= 2 ? (v.charCodeAt(1) - 97) * n + (v.charCodeAt(0) - 97) : -1;
    for (const v of prop('AB') || []) { const q = xy(v); if (q >= 0) p.put(p.idx(q), BL); }
    for (const v of prop('AW') || []) { const q = xy(v); if (q >= 0) p.put(p.idx(q), WH); }
    const pl = prop('PL'); if (pl && pl[0] === 'W') p.side = 1;
    p.hist = new Set([p.key()]);
    const startFen = p.fen(), moves = [];
    const re = /;\s*([BW])\[([a-s]{0,2})\]/g; let mm;
    while ((mm = re.exec(t))) {
      const side = mm[1] === 'B' ? 0 : 1;
      if (side !== p.side) { p.make(PASS); moves.push(PASS); }   // thiếu lượt: coi như bỏ lượt
      const q = mm[2] === '' || (n <= 19 && mm[2] === 'tt') ? -1 : xy(mm[2]);
      const m = q < 0 ? PASS : q + 1;
      if (!p.isLegal(m)) throw new Error('Nước đi không hợp lệ trong SGF: ' + mm[0]);
      p.make(m); moves.push(m);
    }
    return { startFen, moves };
  }

  const api = {
    Pos, Searcher, PASS, START_FEN, SIZES, COLS, emptyFen, ownership, guessDead, playout,
    captureMoves, captureLength, bestDefense, toSgf, fromSgf,
    // ô đi / ô đến của một nước (giống tên hàm của lõi cờ tướng, cờ vua): cờ vây chỉ có ô đặt quân; bỏ lượt: -1
    mFrom: m => m === PASS ? -1 : m - 1, mTo: m => m === PASS ? -1 : m - 1,
    mvStr: m => m === PASS ? 'pass' : String(m - 1)   // dạng chuỗi không cần cỡ bàn: số thứ tự điểm
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GO = api;
})(typeof self !== 'undefined' ? self : this);
