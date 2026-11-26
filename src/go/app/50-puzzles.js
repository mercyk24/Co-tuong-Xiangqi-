  // [CỜ VÂY] Chỉ app cờ vây dùng. Sơ đồ: docs/CAU-TRUC.md
  // 50-puzzles.js — CỜ VÂY, tab "Bắt quân": bắt nhóm quân có dấu chấm trong 1–5 nước (ăn ngay, đánh "atari" đúng hướng,
  // thang, lưới…). Bài sinh tự động bằng tools/go/gen_puzzles.js và được bộ giải trong lõi (GO.captureMoves) kiểm tra lại.
  // Người chơi đi nước tấn công; máy đi nước phòng thủ cầm cự lâu nhất (GO.bestDefense). Mọi nước tấn công bắt được đều tính là đúng.
  // PUZZLES: [{ id, fen, t: điểm của nhóm mục tiêu, n: số nước tấn công ít nhất }]
  const Puz = {
    list: PUZZLES, cur: null, pos: null, left: 0, solved: false, viewed: false, busy: false, gen: 0, hint: null, last: null,
    done: new Set(Store.get('puz_done', [])), filter: Store.get('puz_filter', 'all'),
    FILTERS: { all: ['Tất cả', () => true], 1: ['1 nước', p => p.n === 1], 2: ['2 nước', p => p.n === 2], 3: ['3 nước', p => p.n === 3], 4: ['4–5 nước', p => p.n >= 4] },
    init() {
      this.board = new Board($('#puz-board'), p => this.onSquare(p));
      $('#puz-filter').innerHTML = Object.keys(this.FILTERS).map(k => '<button class="chip" data-v="' + k + '">' + this.FILTERS[k][0] + '</button>').join('');
      $$('#puz-filter .chip').forEach(b => b.onclick = () => { this.filter = b.dataset.v; Store.set('puz_filter', this.filter); this.renderList(); });
      $('#puz-back').onclick = () => { this.gen++; this.cur = null; this.renderList(); };
      $('#puz-reset').onclick = () => this.open(this.cur.id);
      $('#puz-hint').onclick = () => this.showHint();
      $('#puz-sol').onclick = () => this.showSolution();
      $('#puz-next').onclick = () => this.next();
      this.renderList();
    },
    shown() { return this.list.filter(this.FILTERS[this.filter] ? this.FILTERS[this.filter][1] : () => true); },
    renderList() {
      $('#puz-list-wrap').hidden = false; $('#puz-play').hidden = true;
      $$('#puz-filter .chip').forEach(b => b.classList.toggle('on', b.dataset.v === this.filter));
      const items = this.shown();
      $('#puz-stats').textContent = 'Đã giải ' + this.list.filter(p => this.done.has(p.id)).length + ' / ' + this.list.length + ' bài.';
      pagedGrid($('#puz-list'), items, p => '<button class="pz' + (this.done.has(p.id) ? ' done' : '') + '" data-id="' + p.id + '"><span class="pz-n">Bài ' + p.id + '</span><span class="pz-s">' + p.n + ' nước · ' + GAME.sides[GO.Pos.fromFen(p.fen).side] + ' đi</span></button>',
        id => this.open(+id), p => this.done.has(p.id));
    },
    open(id) {
      const p = this.list.find(x => x.id === id); if (!p) return;
      this.gen++; this.cur = p; this.pos = GO.Pos.fromFen(p.fen); this.left = p.n; this.solved = false; this.viewed = false; this.busy = false; this.hint = null; this.last = null;
      $('#puz-list-wrap').hidden = true; $('#puz-play').hidden = false; $('#puz-next').hidden = true;
      $('#puz-title').textContent = 'Bài ' + p.id + ' · ' + GAME.sides[this.pos.side] + ' đi · bắt trong ' + p.n + ' nước';
      this.status('Bắt nhóm quân có dấu chấm đỏ. Mỗi nước của bạn, máy sẽ chạy thoát hết sức có thể.');
      this.draw(); window.scrollTo(0, 0);
    },
    targetSet() {
      const pos = this.pos, i = pos.idx(this.cur.t);
      return pos.at(this.cur.t) < 0 ? null : new Set(pos.group(i).stones.map(x => pos.pt(x)));
    },
    draw() { this.board.render({ pos: this.pos, last: this.last, sel: -1, hint: this.hint, target: this.targetSet() }); },
    status(t, kind) { const el = $('#puz-status'); el.textContent = t; el.className = 'status' + (kind ? ' ' + kind : ''); },
    goodMoves() { return GO.captureMoves(this.pos, this.cur.t, this.left, 300000) || []; },
    onSquare(p) {
      if (!this.cur || this.solved || this.busy) return;
      const pos = this.pos, m = p + 1;
      if (!pos.isLegal(m)) return;
      const ok = this.goodMoves().includes(m);
      if (!ok) { this.status('Chưa đúng: đặt ở ' + pos.notation(m) + ' thì đối phương vẫn thoát. Thử chỗ khác.', 'bad'); return; }
      this.play(m);
    },
    // Đi nước tấn công m rồi để máy đỡ
    play(m) {
      const pos = this.pos;
      pos.make(m); this.left--; this.hint = null; this.last = [m - 1, m - 1];
      if (pos.at(this.cur.t) < 0) { this.win(); return; }
      this.status('Đúng! Đối phương đang chạy…', 'ok'); this.draw();
      this.busy = true; const g = this.gen;
      setTimeout(() => {
        if (g !== this.gen) return;
        const d = GO.bestDefense(pos, this.cur.t, this.left);
        pos.make(d); this.busy = false; this.last = d === GO.PASS ? null : [d - 1, d - 1];
        this.status((d === GO.PASS ? 'Đối phương đi chỗ khác.' : 'Đối phương đi ' + pos.notation(d) + '.') + ' Còn tối đa ' + this.left + ' nước để bắt.');
        this.draw();
      }, 450);
    },
    win() {
      this.solved = true;
      if (!this.viewed && !this.done.has(this.cur.id)) { this.done.add(this.cur.id); Store.set('puz_done', Array.from(this.done)); }
      this.status(this.viewed ? 'Đáp án: nhóm quân đã bị bắt. Bấm Làm lại để tự giải.' : 'Bắt được rồi! Bạn đã giải xong bài ' + this.cur.id + '.', 'ok');
      $('#puz-next').hidden = false; this.draw();
    },
    showHint() {
      if (!this.cur || this.solved || this.busy) return;
      const g = this.goodMoves();
      if (!g.length) { this.status('Thế này không còn bắt được, hãy bấm Làm lại.', 'bad'); return; }
      this.hint = [g[0] - 1, g[0] - 1]; this.status('Gợi ý: thử ' + this.pos.notation(g[0]) + '.'); this.draw();
    },
    showSolution() {
      if (!this.cur || this.solved) return;
      this.open(this.cur.id); this.viewed = true;
      const g0 = this.gen, step = () => {
        if (g0 !== this.gen || this.solved) return;
        if (this.busy) { setTimeout(step, 200); return; }
        const g = this.goodMoves(); if (!g.length) return;
        this.play(g[0]);
        if (!this.solved) setTimeout(step, 900);
      };
      setTimeout(step, 400);
    },
    next() {
      const L = this.shown(), i = L.findIndex(p => p.id === this.cur.id);
      const nx = L.slice(i + 1).find(p => !this.done.has(p.id)) || L[i + 1];
      if (nx) this.open(nx.id); else { this.cur = null; this.renderList(); }
    }
  };
