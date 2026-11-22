/* app.js - Giao diện Cờ Tướng Luyện Tập */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Lưu trữ ----------
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('xq_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('xq_' + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  };

  // ---------- Hiển thị quân & ký hiệu ----------
  const HAN_RED = ['', '俥', '傌', '相', '仕', '帥', '炮', '兵'];
  const HAN_BLK = ['', '車', '馬', '象', '士', '將', '砲', '卒'];
  const glyph = p => ((p >> 3) ? HAN_BLK : HAN_RED)[p & 7];
  const VI_PIECE = { '車': 'Xe', '傌': 'Mã', '馬': 'Mã', '相': 'Tượng', '象': 'Tượng', '仕': 'Sĩ', '士': 'Sĩ', '帥': 'Tướng', '將': 'Tướng', '炮': 'Pháo', '兵': 'Tốt', '卒': 'Tốt' };
  const VI_DIR = { '進': 'tiến', '退': 'thoái', '平': 'bình' };
  const VI_PRE = { '前': 'trước', '後': 'sau', '中': 'giữa', '二': 'thứ hai', '三': 'thứ ba', '四': 'thứ tư' };
  const NUMS = '一二三四五六七八九';
  const num = ch => { const k = NUMS.indexOf(ch); return k >= 0 ? String(k + 1) : ch; };
  function vi(han) {
    const c = Array.from(han);
    if (c.length < 4) return han;
    if (VI_PRE[c[0]] !== undefined && VI_PIECE[c[1]]) return VI_PIECE[c[1]] + ' ' + VI_PRE[c[0]] + ' ' + VI_DIR[c[2]] + ' ' + num(c[3]);
    return (VI_PIECE[c[0]] || c[0]) + ' ' + num(c[1]) + ' ' + (VI_DIR[c[2]] || c[2]) + ' ' + num(c[3]);
  }
  function moveListHtml(notes, startSide, current, clickable) {
    // notes: mảng chuỗi ký hiệu; startSide: 0 nếu nước đầu là Đỏ
    let h = '';
    for (let i = 0; i < notes.length; i++) {
      const isRed = ((i + startSide) % 2) === 0;
      if (isRed) h += '<span class="mn">' + (Math.floor((i + startSide) / 2) + 1) + '.</span>';
      else if (i === 0) h += '<span class="mn">' + (Math.floor(startSide / 2) + 1) + '…</span>';
      h += '<span class="mv' + (i === current ? ' cur' : '') + (clickable ? ' ck' : '') + (isRed ? ' red' : '') + '" data-i="' + i + '">' + esc(notes[i]) + '</span>';
    }
    return h;
  }

  // ---------- Engine (Web Worker + dự phòng) ----------
  const HANDLER_SRC = `
function xqHandle(S, d) {
  function build() { const p = XQ.Pos.fromFen(d.fen); for (const m of d.moves) p.make(m); return p; }
  if (d.type === 'search') { const p = build(); const r = S.search(p, d.opts); return { move: r.move, score: r.score, depth: r.depth }; }
  if (d.type === 'analyze') {
    const p = build();
    const r1 = S.search(p, { maxDepth: d.depth, timeMs: d.timeMs });
    const bestNot = r1.move ? p.notation(r1.move) : '';
    p.make(d.move);
    let s2;
    if (p.legalMoves().length === 0) s2 = XQ.MATE;
    else { const r2 = S.search(p, { maxDepth: Math.max(1, d.depth - 1), timeMs: d.timeMs }); s2 = -r2.score; }
    return { best: r1.move, bestNot: bestNot, s1: r1.score, s2: s2 };
  }
  return {};
}`;
  const Engine = {
    worker: null, pending: new Map(), seq: 0, fb: null, ready: false,
    init() {
      const src = document.getElementById('core-src').textContent;
      try {
        const glue = src + '\n' + HANDLER_SRC + `
const S = new XQ.Searcher();
onmessage = function (e) { let res; try { res = xqHandle(S, e.data); } catch (err) { res = { error: String(err) }; } res.id = e.data.id; postMessage(res); };`;
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
        if (!this.fb) { this.fb = { S: new XQ.Searcher(), h: new Function('XQ', HANDLER_SRC + '; return xqHandle;')(XQ) }; }
        let res; try { res = this.fb.h(this.fb.S, d); } catch (e) { res = { error: String(e) }; }
        res.id = d.id; resolve(res);
      }, 30));
    }
  };
  const LEVELS = {
    1: { name: '1 – Tập sự', opts: { maxDepth: 1, timeMs: 300, noise: 220 } },
    2: { name: '2 – Sơ cấp', opts: { maxDepth: 2, timeMs: 500, noise: 90 } },
    3: { name: '3 – Trung bình', opts: { maxDepth: 3, timeMs: 800, noise: 25 } },
    4: { name: '4 – Khá', opts: { maxDepth: 6, timeMs: 1500 } },
    5: { name: '5 – Mạnh', opts: { maxDepth: 9, timeMs: 4000 } }
  };

  // ---------- Bàn cờ SVG ----------
  class Board {
    constructor(host, onSquare) {
      this.host = host; this.onSquare = onSquare; this.flip = false;
      this.cell = 70; this.px = 50; this.py = 62;
      this.W = 8 * this.cell + 2 * this.px; this.H = 9 * this.cell + 2 * this.py;
      host.innerHTML = '<svg class="board" viewBox="0 0 ' + this.W + ' ' + this.H + '" role="img" aria-label="Bàn cờ tướng"><g class="static"></g><g class="dyn"></g></svg>';
      this.svg = host.firstChild; this.gs = this.svg.querySelector('.static'); this.gd = this.svg.querySelector('.dyn');
      this.svg.addEventListener('pointerdown', e => {
        e.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (this.W / rect.width), py = (e.clientY - rect.top) * (this.H / rect.height);
        const dc = Math.round((px - this.px) / this.cell), dr = Math.round((py - this.py) / this.cell);
        if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return;
        const c = this.flip ? 8 - dc : dc, r = this.flip ? 9 - dr : dr;
        this.onSquare && this.onSquare(r * 9 + c);
      });
      this.drawStatic();
    }
    X(c) { return this.px + (this.flip ? 8 - c : c) * this.cell; }
    Y(r) { return this.py + (this.flip ? 9 - r : r) * this.cell; }
    setFlip(f) { this.flip = !!f; this.drawStatic(); }
    drawStatic() {
      const X0 = this.px, Y0 = this.py, c = this.cell, W = this.W, H = this.H;
      let s = '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="18" class="bd-bg"/>';
      s += '<g class="bd-line">';
      for (let r = 0; r < 10; r++) s += '<line x1="' + X0 + '" y1="' + (Y0 + r * c) + '" x2="' + (X0 + 8 * c) + '" y2="' + (Y0 + r * c) + '"/>';
      for (let k = 0; k < 9; k++) {
        const x = X0 + k * c;
        if (k === 0 || k === 8) s += '<line x1="' + x + '" y1="' + Y0 + '" x2="' + x + '" y2="' + (Y0 + 9 * c) + '"/>';
        else s += '<line x1="' + x + '" y1="' + Y0 + '" x2="' + x + '" y2="' + (Y0 + 4 * c) + '"/><line x1="' + x + '" y1="' + (Y0 + 5 * c) + '" x2="' + x + '" y2="' + (Y0 + 9 * c) + '"/>';
      }
      const dg = (r1, c1, r2, c2) => '<line x1="' + (X0 + c1 * c) + '" y1="' + (Y0 + r1 * c) + '" x2="' + (X0 + c2 * c) + '" y2="' + (Y0 + r2 * c) + '"/>';
      s += dg(0, 3, 2, 5) + dg(0, 5, 2, 3) + dg(7, 3, 9, 5) + dg(7, 5, 9, 3);
      // dấu chấm vị trí pháo/tốt
      const tick = (r, k) => {
        const cx = X0 + k * c, cy = Y0 + r * c, a = 7, l = 14; let t = '';
        for (const sx of [-1, 1]) {
          if ((k === 0 && sx === -1) || (k === 8 && sx === 1)) continue;
          for (const sy of [-1, 1]) t += '<polyline points="' + (cx + sx * (a + l)) + ',' + (cy + sy * a) + ' ' + (cx + sx * a) + ',' + (cy + sy * a) + ' ' + (cx + sx * a) + ',' + (cy + sy * (a + l)) + '"/>';
        }
        return t;
      };
      for (const k of [1, 7]) { s += tick(2, k) + tick(7, k); }
      for (const k of [0, 2, 4, 6, 8]) { s += tick(3, k) + tick(6, k); }
      s += '</g>';
      s += '<text class="river" x="' + (X0 + 2 * c) + '" y="' + (Y0 + 4.5 * c + 14) + '" text-anchor="middle">楚　河</text>';
      s += '<text class="river" x="' + (X0 + 6 * c) + '" y="' + (Y0 + 4.5 * c + 14) + '" text-anchor="middle">漢　界</text>';
      // nhãn cột
      const bottomRed = !this.flip;
      for (let dc = 0; dc < 9; dc++) {
        const fb = 9 - dc, ft = dc + 1, x = X0 + dc * c;
        const bl = bottomRed ? NUMS[fb - 1] : String(fb), tl = bottomRed ? String(ft) : NUMS[ft - 1];
        s += '<text class="fl" x="' + x + '" y="' + (H - 16) + '" text-anchor="middle">' + bl + '</text>';
        s += '<text class="fl" x="' + x + '" y="' + 26 + '" text-anchor="middle">' + tl + '</text>';
      }
      this.gs.innerHTML = s;
    }
    // st: {pos, last:[from,to], sel, targets:[], hint:[from,to]|null, hintFrom:sq}
    render(st) {
      const pos = st.pos;
      let s = '';
      const sqXY = q => [this.X(q % 9), this.Y((q / 9) | 0)];
      if (st.last) {
        for (const q of st.last) { const [x, y] = sqXY(q); s += '<rect class="last" x="' + (x - 33) + '" y="' + (y - 33) + '" width="66" height="66" rx="12"/>'; }
      }
      if (st.hint) {
        const [x1, y1] = sqXY(st.hint[0]), [x2, y2] = sqXY(st.hint[1]);
        s += '<rect class="hintbox" x="' + (x1 - 34) + '" y="' + (y1 - 34) + '" width="68" height="68" rx="12"/>';
        if (st.hint[1] !== undefined && st.hint[1] !== null && st.hint[1] !== st.hint[0]) {
          s += '<line class="hintline" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/><circle class="hintdot" cx="' + x2 + '" cy="' + y2 + '" r="14"/>';
        }
      }
      if (st.sel >= 0) { const [x, y] = sqXY(st.sel); s += '<circle class="selring" cx="' + x + '" cy="' + y + '" r="36"/>'; }
      // quân cờ
      let chk = -1;
      if (pos.inCheck(pos.side)) chk = pos.ks[pos.side];
      for (let q = 0; q < 90; q++) {
        const pc = pos.b[q]; if (!pc) continue;
        const [x, y] = sqXY(q), red = (pc >> 3) === 0;
        if (q === chk) s += '<circle class="chk" cx="' + x + '" cy="' + y + '" r="40"/>';
        s += '<g class="pc ' + (red ? 'r' : 'b') + '" transform="translate(' + x + ',' + y + ')"><circle class="pc-o" r="32"/><circle class="pc-i" r="27"/><text class="pc-t" y="12" text-anchor="middle">' + glyph(pc) + '</text></g>';
      }
      if (st.targets) {
        for (const q of st.targets) {
          const [x, y] = sqXY(q);
          s += pos.b[q] ? '<circle class="tgt cap" cx="' + x + '" cy="' + y + '" r="36"/>' : '<circle class="tgt" cx="' + x + '" cy="' + y + '" r="9"/>';
        }
      }
      this.gd.innerHTML = s;
    }
  }

  // ---------- Điều khiển chọn ô chung ----------
  function trySelect(ctx, sq, side, onMove) {
    // ctx: {pos, sel, targets}; trả về true nếu thay đổi
    const pos = ctx.pos;
    if (ctx.sel >= 0 && ctx.targets.indexOf(sq) >= 0) {
      const m = (ctx.sel << 7) | sq;
      ctx.sel = -1; ctx.targets = [];
      onMove(m);
      return;
    }
    const pc = pos.b[sq];
    if (pc && (pc >> 3) === side && pos.side === side) {
      ctx.sel = sq;
      ctx.targets = pos.legalMoves().filter(m => (m >> 7) === sq).map(m => m & 127);
    } else { ctx.sel = -1; ctx.targets = []; }
  }

  function toast(msg, kind) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 2600);
  }

  // ---------- Đấu máy ----------
  const Play = {
    ctx: { pos: null, sel: -1, targets: [] }, moves: [], notes: [], startFen: XQ.START_FEN,
    user: Store.get('play_user', 1), level: Store.get('play_level', 3), warn: Store.get('play_warn', false),
    last: null, hint: null, thinking: false, over: null, gen: 0,
    init() {
      this.board = new Board($('#play-board'), sq => this.onSquare(sq));
      $('#play-new').onclick = () => this.newGame();
      $('#play-undo').onclick = () => this.undo();
      $('#play-hint').onclick = () => this.showHint();
      $('#play-flip').onclick = () => { this.board.setFlip(!this.board.flip); this.draw(); };
      const sd = $('#play-side'), lv = $('#play-level'), wr = $('#play-warn');
      sd.value = String(this.user);
      lv.innerHTML = Object.keys(LEVELS).map(k => '<option value="' + k + '">' + LEVELS[k].name + '</option>').join('');
      lv.value = String(this.level); wr.checked = !!this.warn;
      sd.onchange = () => { this.user = +sd.value; Store.set('play_user', this.user); this.newGame(); };
      lv.onchange = () => { this.level = +lv.value; Store.set('play_level', this.level); };
      wr.onchange = () => { this.warn = wr.checked; Store.set('play_warn', this.warn); };
      this.newGame();
    },
    newGame() {
      this.gen++;
      this.ctx = { pos: XQ.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.last = null; this.hint = null; this.over = null; this.thinking = false;
      this.board.setFlip(this.user === 1);
      this.draw();
      if (this.ctx.pos.side !== this.user) this.engineMove();
    },
    onSquare(sq) {
      if (this.thinking || this.over) return;
      if (this.ctx.pos.side !== this.user) return;
      this.hint = null;
      trySelect(this.ctx, sq, this.user, m => this.doMove(m, true));
      this.draw();
    },
    doMove(m, byUser) {
      const pos = this.ctx.pos;
      const before = { fen: this.startFen, moves: this.moves.slice() };
      this.notes.push(pos.notation(m)); pos.make(m); this.moves.push(m);
      this.last = [m >> 7, m & 127]; this.hint = null;
      this.checkEnd();
      this.draw();
      if (byUser) {
        if (!this.over) this.engineMove();
        if (this.warn) this.analyze(before, m);
      }
    },
    checkEnd() {
      const pos = this.ctx.pos;
      if (pos.legalMoves().length === 0) {
        const winner = pos.side ^ 1;
        this.over = (winner === 0 ? 'Đỏ' : 'Đen') + ' thắng' + (pos.inCheck() ? ' – chiếu bí.' : ' – đối phương hết nước đi.');
      } else if (pos.repCount() >= 3) this.over = 'Hòa do lặp lại thế cờ ba lần.';
      else if (this.moves.length >= 300) this.over = 'Hòa (quá dài).';
    },
    engineMove() {
      if (this.over) return;
      const g = this.gen; this.thinking = true; this.draw();
      const lv = LEVELS[this.level];
      Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: lv.opts }).then(r => {
        if (g !== this.gen) return;
        this.thinking = false;
        if (r.move) this.doMove(r.move, false); else this.draw();
      });
    },
    analyze(before, m) {
      const g = this.gen;
      Engine.call({ type: 'analyze', fen: before.fen, moves: before.moves, move: m, depth: 4, timeMs: 700 }).then(r => {
        if (g !== this.gen || r.error) return;
        const loss = r.s1 - r.s2;
        if (r.best !== m && loss > 130) toast('Nước vừa rồi có thể yếu (mất ≈ ' + (loss / 100).toFixed(1) + ' điểm). Gợi ý: ' + r.bestNot + ' · ' + vi(r.bestNot), 'warn');
        else if (r.best === m) toast('Nước tốt.', 'ok');
      });
    },
    undo() {
      if (this.thinking || !this.moves.length) return;
      this.gen++;
      do { this.ctx.pos.unmake(); this.moves.pop(); this.notes.pop(); } while (this.moves.length && this.ctx.pos.side !== this.user);
      this.over = null; this.ctx.sel = -1; this.ctx.targets = [];
      const lm = this.moves[this.moves.length - 1]; this.last = lm ? [lm >> 7, lm & 127] : null; this.hint = null;
      if (this.ctx.pos.side !== this.user) this.engineMove(); else this.draw();
    },
    showHint() {
      if (this.thinking || this.over || this.ctx.pos.side !== this.user) return;
      const g = this.gen; this.thinking = true; this.draw();
      Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: { maxDepth: 6, timeMs: 1500 } }).then(r => {
        if (g !== this.gen) return;
        this.thinking = false;
        if (r.move) { this.hint = [r.move >> 7, r.move & 127]; const n = this.ctx.pos.notation(r.move); toast('Gợi ý: ' + n + ' · ' + vi(n)); }
        this.draw();
      });
    },
    draw() {
      const c = this.ctx;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      let st;
      if (this.over) st = '<b>' + esc(this.over) + '</b>';
      else {
        const turn = c.pos.side === 0 ? 'Đỏ' : 'Đen';
        st = (this.thinking ? 'Máy đang nghĩ…' : (c.pos.side === this.user ? 'Đến lượt bạn (' + turn + ')' : 'Lượt máy (' + turn + ')'));
        if (c.pos.inCheck()) st += ' · <b class="chk-t">Chiếu tướng!</b>';
      }
      $('#play-status').innerHTML = st;
      $('#play-moves').innerHTML = this.notes.length ? moveListHtml(this.notes, 0, this.notes.length - 1, false) : '<span class="muted">Chưa có nước đi.</span>';
      const mv = $('#play-moves'); mv.scrollTop = mv.scrollHeight;
      $('#play-undo').disabled = this.thinking || !this.moves.length;
      $('#play-hint').disabled = this.thinking || !!this.over;
    }
  };

  // ---------- Chiếu hết ----------
  const Puz = {
    ctx: null, cur: null, remaining: 0, busy: false, solved: false, hintStage: 0, errors: 0, hint: null, last: null, notes: [], gen: 0,
    done: Store.get('puz_done', {}), filter: Store.get('puz_filter', 0),
    init() {
      this.board = new Board($('#puz-board'), sq => this.onSquare(sq));
      $('#puz-back').onclick = () => this.showList();
      $('#puz-reset').onclick = () => this.open(this.cur.id);
      $('#puz-hint').onclick = () => this.showHint();
      $('#puz-sol').onclick = () => this.playSolution();
      $('#puz-next').onclick = () => this.next();
      this.renderList();
    },
    renderList() {
      const f = this.filter;
      const counts = {}; PUZZLES.forEach(p => { counts[p.n] = counts[p.n] || { t: 0, d: 0 }; counts[p.n].t++; if (this.done[p.id]) counts[p.n].d++; });
      let h = '<div class="chips">';
      h += '<button class="chip' + (f === 0 ? ' on' : '') + '" data-f="0">Tất cả</button>';
      for (let n = 1; n <= 6; n++) if (counts[n]) h += '<button class="chip' + (f === n ? ' on' : '') + '" data-f="' + n + '">' + n + ' nước <small>' + counts[n].d + '/' + counts[n].t + '</small></button>';
      h += '</div><div class="grid">';
      PUZZLES.filter(p => !f || p.n === f).forEach(p => {
        h += '<button class="pz' + (this.done[p.id] ? ' ok' : '') + '" data-id="' + p.id + '"><span class="pz-n">' + p.id + '</span><span class="pz-s">' + (p.side === 0 ? '<i class="dot r"></i>Đỏ' : '<i class="dot b"></i>Đen') + ' · ' + p.n + ' nước</span>' + (this.done[p.id] ? '<span class="tick">✓</span>' : '') + '</button>';
      });
      h += '</div>';
      $('#puz-list').innerHTML = h;
      $$('#puz-list .chip').forEach(b => b.onclick = () => { this.filter = +b.dataset.f; Store.set('puz_filter', this.filter); this.renderList(); });
      $$('#puz-list .pz').forEach(b => b.onclick = () => this.open(+b.dataset.id));
    },
    showList() { this.gen++; $('#puz-play').hidden = true; $('#puz-list-wrap').hidden = false; this.renderList(); },
    open(id) {
      this.gen++;
      const p = PUZZLES.find(x => x.id === id); this.cur = p;
      this.ctx = { pos: XQ.Pos.fromFen(p.fen), sel: -1, targets: [] };
      this.remaining = p.n; this.busy = false; this.solved = false; this.hintStage = 0; this.errors = 0; this.hint = null; this.last = null; this.notes = [];
      this.board.setFlip(p.side === 1);
      $('#puz-list-wrap').hidden = true; $('#puz-play').hidden = false;
      this.draw();
    },
    next() {
      const list = PUZZLES.filter(p => !this.filter || p.n === this.filter);
      const i = list.findIndex(p => p.id === this.cur.id);
      const nx = list.slice(i + 1).find(p => !this.done[p.id]) || list[(i + 1) % list.length];
      this.open(nx.id);
    },
    onSquare(sq) {
      if (this.busy || this.solved) return;
      const p = this.cur; this.hint = null;
      trySelect(this.ctx, sq, p.side, m => this.attempt(m));
      this.draw();
    },
    attempt(m) {
      const pos = this.ctx.pos;
      const good = XQ.mateFirstMoves(pos, this.remaining);
      if (good.indexOf(m) < 0) {
        this.errors++;
        toast('Chưa đúng. Hãy tìm chuỗi nước chiếu dẫn tới chiếu hết trong ' + this.remaining + ' nước.', 'warn');
        return;
      }
      this.notes.push(pos.notation(m)); pos.make(m); this.remaining--; this.last = [m >> 7, m & 127];
      if (pos.legalMoves().length === 0) { this.finish(); return; }
      this.busy = true; this.draw();
      const g = this.gen;
      setTimeout(() => {
        if (g !== this.gen) return;
        const d = XQ.bestDefense(pos, this.remaining);
        this.notes.push(pos.notation(d)); pos.make(d); this.last = [d >> 7, d & 127];
        this.busy = false; this.draw();
      }, 500);
    },
    finish() {
      this.solved = true;
      if (!this.done[this.cur.id]) { this.done[this.cur.id] = 1; Store.set('puz_done', this.done); }
      toast(this.errors ? 'Chiếu hết! (sai ' + this.errors + ' lần)' : 'Chiếu hết! Giải đúng ngay lần đầu.', 'ok');
      this.draw();
    },
    showHint() {
      if (this.busy || this.solved) return;
      const good = XQ.mateFirstMoves(this.ctx.pos, this.remaining);
      if (!good.length) return;
      const m = good[0];
      if (this.hintStage === 0) { this.hint = [m >> 7, null]; this.hintStage = 1; toast('Gợi ý: hãy dùng quân được đánh dấu.'); }
      else { this.hint = [m >> 7, m & 127]; this.hintStage = 2; const n = this.ctx.pos.notation(m); toast('Nước đi: ' + n + ' · ' + vi(n)); }
      this.draw();
    },
    playSolution() {
      if (this.busy || this.solved) return;
      this.errors++;
      this.busy = true; const g = this.gen;
      const step = () => {
        if (g !== this.gen) return;
        const pos = this.ctx.pos;
        const good = XQ.mateFirstMoves(pos, this.remaining);
        const m = good[0];
        this.notes.push(pos.notation(m)); pos.make(m); this.remaining--; this.last = [m >> 7, m & 127]; this.hint = null; this.draw();
        if (pos.legalMoves().length === 0) { this.busy = false; this.solved = true; toast('Đáp án: ' + this.notes.join(' ')); this.draw(); return; }
        setTimeout(() => {
          if (g !== this.gen) return;
          const d = XQ.bestDefense(pos, this.remaining);
          this.notes.push(pos.notation(d)); pos.make(d); this.last = [d >> 7, d & 127]; this.draw();
          setTimeout(step, 700);
        }, 700);
      };
      step();
    },
    draw() {
      const c = this.ctx, p = this.cur;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#puz-title').innerHTML = '<b>Bài ' + p.id + '</b> · ' + (p.side === 0 ? 'Đỏ' : 'Đen') + ' đi, chiếu hết trong ' + p.n + ' nước';
      let st;
      if (this.solved) st = '<b class="okt">Hoàn thành!</b> ' + (this.notes.length ? esc(this.notes.join(' ')) : '');
      else st = 'Còn <b>' + this.remaining + '</b> nước chiếu. ' + (this.busy ? 'Đối phương đang đỡ…' : 'Đến lượt bạn.');
      $('#puz-status').innerHTML = st;
      $('#puz-next').hidden = !this.solved;
      $('#puz-hint').disabled = this.busy || this.solved; $('#puz-sol').disabled = this.busy || this.solved;
    }
  };

  // ---------- Khai cuộc ----------
  const Op = {
    ctx: null, line: null, mode: 'study', k: 0, cands: [], flipPref: true, last: null, hint: null, stats: Store.get('op_stats', {}),
    mistakes: 0, finished: false, busy: false, gen: 0, noteText: '', pathNotes: [],
    init() {
      this.board = new Board($('#op-board'), sq => this.onSquare(sq));
      $('#op-back').onclick = () => this.showList();
      $('#op-study').onclick = () => this.setMode('study');
      $('#op-drill').onclick = () => this.setMode('drill');
      $('#op-first').onclick = () => this.goto(0);
      $('#op-prev').onclick = () => this.goto(this.k - 1);
      $('#op-next').onclick = () => this.goto(this.k + 1);
      $('#op-last').onclick = () => this.goto(this.line.moves.length);
      $('#op-flip').onclick = () => { this.board.setFlip(!this.board.flip); this.draw(); };
      $('#op-hint').onclick = () => this.showHint();
      $('#op-again').onclick = () => this.startDrill(this.line);
      $('#op-moves').onclick = e => { const el = e.target.closest('.mv'); if (el && this.mode === 'study') this.goto(+el.dataset.i + 1); };
      $('#op-overview').innerHTML = OPENINGS.overview.map(t => '<p>' + esc(t) + '</p>').join('');
      this.renderList();
    },
    renderList() {
      let h = '';
      OPENINGS.lines.forEach(L => {
        const s = this.stats[L.id] || { done: 0, mistakes: 0 };
        h += '<div class="card line"><div class="line-h"><b>' + esc(L.title) + '</b><span class="badge">' + (s.done ? '✓ ' + s.done + ' lần' : 'chưa tập') + '</span></div><p class="muted">' + esc(L.summary) + '</p><div class="row"><button class="btn" data-a="study" data-id="' + L.id + '">Xem</button><button class="btn primary" data-a="drill" data-id="' + L.id + '">Tập chơi Đen</button></div></div>';
      });
      h += '<div class="card line"><div class="line-h"><b>Tập ngẫu nhiên</b></div><p class="muted">Máy chọn ngẫu nhiên các nhánh của Đỏ; bạn đáp lại bằng nước đúng của Bình phong mã.</p><div class="row"><button class="btn primary" data-a="random">Bắt đầu</button></div></div>';
      $('#op-list').innerHTML = h;
      $$('#op-list button').forEach(b => b.onclick = () => {
        if (b.dataset.a === 'random') this.startRandom();
        else this.open(OPENINGS.lines.find(l => l.id === b.dataset.id), b.dataset.a);
      });
    },
    showList() { this.gen++; $('#op-play').hidden = true; $('#op-list-wrap').hidden = false; this.renderList(); },
    open(L, mode) {
      this.line = L; $('#op-list-wrap').hidden = true; $('#op-play').hidden = false;
      this.board.setFlip(true);
      this.setMode(mode || 'study');
    },
    setMode(mode) {
      this.gen++; this.mode = mode;
      $('#op-study').classList.toggle('on', mode === 'study'); $('#op-drill').classList.toggle('on', mode === 'drill');
      if (mode === 'study') { this.cands = [this.line]; this.goto(0); }
      else this.startDrill(this.line);
    },
    posAt(k, L) {
      const pos = XQ.Pos.fromFen(XQ.START_FEN); const ms = [];
      for (let i = 0; i < k; i++) { const m = pos.parse(L.moves[i]); ms.push(m); pos.make(m); }
      return { pos, ms };
    },
    goto(k) {
      const L = this.line;
      k = Math.max(0, Math.min(L.moves.length, k)); this.k = k;
      const { pos, ms } = this.posAt(k, L);
      this.ctx = { pos, sel: -1, targets: [] };
      const lm = ms[ms.length - 1]; this.last = lm ? [lm >> 7, lm & 127] : null; this.hint = null;
      this.noteText = k > 0 ? (L.notes[k] || '') : 'Thế ban đầu. Bấm ▶ để xem từng nước, hoặc bấm vào nước trong bảng.';
      this.pathNotes = L.moves.slice(0, L.moves.length);
      this.finished = false; this.draw();
    },
    startRandom() {
      $('#op-list-wrap').hidden = true; $('#op-play').hidden = false; this.board.setFlip(true);
      this.line = null; this.mode = 'drill';
      $('#op-study').classList.remove('on'); $('#op-drill').classList.add('on');
      this.startDrill(null);
    },
    startDrill(L) {
      this.gen++;
      this.line = L;
      this.cands = L ? [L] : OPENINGS.lines.slice();
      this.ctx = { pos: XQ.Pos.fromFen(XQ.START_FEN), sel: -1, targets: [] };
      this.k = 0; this.last = null; this.hint = null; this.mistakes = 0; this.finished = false; this.busy = false; this.pathNotes = [];
      this.noteText = 'Bạn cầm Đen. Hãy đáp lại từng nước của Đỏ bằng nước đúng của Bình phong mã.';
      this.draw();
      this.redReply();
    },
    redReply() {
      const pos = this.ctx.pos; if (pos.side !== 0) return;
      const avail = this.cands.filter(L => L.moves.length > this.k);
      if (!avail.length) { this.finish(); return; }
      const pick = avail[(Math.random() * avail.length) | 0], not = pick.moves[this.k];
      this.cands = avail.filter(L => L.moves[this.k] === not);
      this.busy = true; const g = this.gen;
      setTimeout(() => {
        if (g !== this.gen) return;
        const m = pos.parse(not); pos.make(m); this.pathNotes.push(not);
        this.last = [m >> 7, m & 127];
        this.noteText = 'Đỏ: ' + not + ' · ' + vi(not) + '. ' + (this.cands[0].notes[this.k + 1] || '');
        this.k++; this.busy = false;
        if (!this.cands.some(L => L.moves.length > this.k)) { this.draw(); this.finish(); return; }
        this.draw();
      }, 450);
    },
    onSquare(sq) {
      if (this.mode !== 'drill' || this.busy || this.finished) return;
      this.hint = null;
      trySelect(this.ctx, sq, 1, m => this.userMove(m));
      this.draw();
    },
    userMove(m) {
      const pos = this.ctx.pos, not = pos.notation(m);
      const ok = this.cands.filter(L => L.moves[this.k] === not);
      if (!ok.length) {
        this.mistakes++;
        const exp = Array.from(new Set(this.cands.filter(L => L.moves.length > this.k).map(L => L.moves[this.k])));
        this.noteText = 'Chưa đúng: ' + not + '. Trong sách, nước ở đây là: ' + exp.join(' hoặc ') + '. Hãy thử lại.';
        toast('Chưa đúng – thử lại.', 'warn');
        return;
      }
      this.cands = ok; pos.make(m); this.pathNotes.push(not); this.last = [m >> 7, m & 127];
      this.noteText = 'Đúng: ' + not + ' · ' + vi(not) + '. ' + (ok[0].notes[this.k + 1] || '');
      this.k++;
      if (!ok.some(L => L.moves.length > this.k)) { this.draw(); this.finish(); return; }
      this.draw();
      this.redReply();
    },
    finish() {
      this.finished = true;
      const L = this.cands[0];
      const s = this.stats[L.id] || { done: 0, mistakes: 0 };
      s.done++; s.mistakes += this.mistakes; this.stats[L.id] = s; Store.set('op_stats', this.stats);
      this.noteText += ' — Hoàn thành biến "' + L.title + '" với ' + this.mistakes + ' lần sai.';
      toast('Hoàn thành biến! ' + (this.mistakes ? this.mistakes + ' lần sai.' : 'Không sai nước nào.'), 'ok');
      this.draw();
    },
    showHint() {
      if (this.mode !== 'drill' || this.busy || this.finished) return;
      const avail = this.cands.filter(L => L.moves.length > this.k);
      if (!avail.length) return;
      const not = avail[0].moves[this.k], m = this.ctx.pos.parse(not);
      this.hint = [m >> 7, m & 127]; this.mistakes++;
      toast('Nước đúng: ' + not + ' · ' + vi(not)); this.draw();
    },
    draw() {
      const c = this.ctx, L = this.line;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#op-title').textContent = L ? L.title : 'Tập ngẫu nhiên – Bình phong mã đối Pháo đầu';
      $('#op-note').textContent = this.noteText;
      const study = this.mode === 'study';
      $('#op-nav').hidden = !study;
      $('#op-hint').hidden = study; $('#op-again').hidden = study;
      $('#op-study').hidden = !L;
      let notes = [], cur = -1;
      if (study) { notes = L.moves; cur = this.k - 1; }
      else { notes = this.pathNotes; cur = notes.length - 1; }
      $('#op-moves').innerHTML = notes.length ? moveListHtml(notes, 0, cur, study) : '<span class="muted">Chưa có nước đi.</span>';
      const cu = $('#op-moves .cur'); if (cu && cu.scrollIntoView) { try { cu.scrollIntoView({ block: 'nearest' }); } catch (e) { /* bỏ qua */ } }
    }
  };

  // ---------- Điều hướng ----------
  function showTab(name) {
    $$('.view').forEach(v => v.hidden = v.id !== 'v-' + name);
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    Store.set('tab', name);
    window.scrollTo(0, 0);
  }

  function boot() {
    Engine.init();
    Play.init(); Puz.init(); Op.init();
    $$('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
    showTab(Store.get('tab', 'play'));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* bỏ qua */ });
    }
  }
  window.__xq = { Play, Puz, Op, Engine, Board, vi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
