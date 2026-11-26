  // [CỜ VUA] Chỉ app cờ vua dùng. Có bản song sinh bên cờ tướng: src/xiangqi/app/50-puzzles.js (giống ~65%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 50-puzzles.js — CỜ VUA, tab Chiếu hết: bài chiếu hết trong 1–5 nước lấy từ kho bài Lichess (CC0).
  // Bài (PUZZLES, tạo bởi tools/chess/build-data.js): { id, lid (mã bài trên Lichess), n (số nước), side (0 Trắng, 1 Đen),
  //   fen (thế người giải đi), pre (nước vừa đi của đối phương, để tô), sol: [nước UCI: người giải, đối phương, người giải…], r (điểm) }
  // Người giải đi đúng nước trong lời giải, hoặc bất kỳ nước nào chiếu hết ngay, là đúng. Máy tự đi nước đáp theo lời giải.

  // Bộ chơi bài theo lời giải nhiều nước, dùng chung cho Chiếu hết và Chiến thuật
  const LinePuzzle = {
    // Nước m có được chấp nhận ở bước k không: đúng lời giải, nằm trong danh sách chấp nhận, hoặc chiếu hết ngay
    accepts(pos, p, k, m) {
      const u = CH.mvStr(m);
      if (u === p.sol[k]) return true;
      if (k === 0 && p.accept && p.accept.indexOf(u) >= 0) return true;
      pos.make(m); const st = pos.status(); pos.unmake();
      return !!(st && st.result === 'mate');
    },
    move(pos, u) { return pos.parse(u); }
  };

  const Puz = {
    ctx: null, cur: null, k: 0, busy: false, solved: false, hintStage: 0, errors: 0, hint: null, last: null, notes: [], gen: 0,
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
      if (!PUZZLES.length) { $('#puz-list').innerHTML = '<p class="muted">Chưa có dữ liệu bài tập.</p>'; return; }
      const f = this.filter;
      const counts = {}; PUZZLES.forEach(p => { counts[p.n] = counts[p.n] || { t: 0, d: 0 }; counts[p.n].t++; if (this.done[p.id]) counts[p.n].d++; });
      let h = '<div class="chips">';
      h += '<button class="chip' + (f === 0 ? ' on' : '') + '" data-f="0">Tất cả</button>';
      for (let n = 1; n <= 5; n++) if (counts[n]) h += '<button class="chip' + (f === n ? ' on' : '') + '" data-f="' + n + '">' + n + ' nước <small>' + counts[n].d + '/' + counts[n].t + '</small></button>';
      h += '</div><div class="grid">';
      PUZZLES.filter(p => !f || p.n === f).forEach(p => {
        h += '<button class="pz' + (this.done[p.id] ? ' ok' : '') + '" data-id="' + p.id + '"><span class="pz-n">' + p.id + '</span><span class="pz-s">' +
          (p.side === 0 ? '<i class="dot w"></i>Trắng' : '<i class="dot b"></i>Đen') + ' · ' + p.n + ' nước <span class="rate">' + p.r + '</span></span>' +
          (this.done[p.id] ? '<span class="tick">✓</span>' : '') + '</button>';
      });
      h += '</div>';
      $('#puz-list').innerHTML = h;
      $$('#puz-list .chip').forEach(b => b.onclick = () => { this.filter = +b.dataset.f; Store.set('puz_filter', this.filter); this.renderList(); });
      $$('#puz-list .pz').forEach(b => b.onclick = () => this.open(+b.dataset.id));
    },
    showList() { this.gen++; closePromo(); $('#puz-play').hidden = true; $('#puz-list-wrap').hidden = false; this.renderList(); },
    open(id) {
      this.gen++; closePromo();
      const p = PUZZLES.find(x => x.id === id); this.cur = p;
      this.ctx = { pos: CH.Pos.fromFen(p.fen), sel: -1, targets: [] };
      this.k = 0; this.busy = false; this.solved = false; this.hintStage = 0; this.errors = 0; this.hint = null; this.notes = [];
      this.last = p.pre ? [CH.sqParse(p.pre.slice(0, 2)), CH.sqParse(p.pre.slice(2, 4))] : null;
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
    remaining() { return Math.ceil((this.cur.sol.length - this.k) / 2); },
    onSquare(sq) {
      if (this.busy || this.solved) return;
      this.hint = null;
      closePromo();
      trySelect(this.ctx, sq, this.cur.side, (m, alts) => askPromo($('#puz-board'), this.cur.side, alts, x => this.attempt(x)));
      this.draw();
    },
    attempt(m) {
      const pos = this.ctx.pos;
      if (!LinePuzzle.accepts(pos, this.cur, this.k, m)) {
        this.errors++;
        toast('Chưa đúng. Hãy tìm nước dẫn tới chiếu hết trong ' + this.remaining() + ' nước.', 'warn');
        return;
      }
      this.notes.push(pos.san(m)); pos.make(m); this.k++; this.last = [CH.mFrom(m), CH.mTo(m)]; this.hintStage = 0;
      const st = pos.status();
      if ((st && st.result === 'mate') || this.k >= this.cur.sol.length) { this.finish(); return; }
      this.busy = true; this.draw();
      const g = this.gen;
      setTimeout(() => {
        if (g !== this.gen) return;
        const d = pos.parse(this.cur.sol[this.k]);
        if (!d) { this.busy = false; this.finish(); return; }
        this.notes.push(pos.san(d)); pos.make(d); this.k++; this.last = [CH.mFrom(d), CH.mTo(d)];
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
      const m = this.ctx.pos.parse(this.cur.sol[this.k]); if (!m) return;
      if (this.hintStage === 0) { this.hint = [CH.mFrom(m), null]; this.hintStage = 1; toast('Gợi ý: hãy dùng quân được đánh dấu.'); }
      else { this.hint = [CH.mFrom(m), CH.mTo(m)]; this.hintStage = 2; toast('Nước đi: ' + this.ctx.pos.san(m)); }
      this.draw();
    },
    playSolution() {
      if (this.busy || this.solved) return;
      this.errors++;
      this.busy = true; const g = this.gen;
      const step = () => {
        if (g !== this.gen) return;
        const pos = this.ctx.pos, m = this.k < this.cur.sol.length ? pos.parse(this.cur.sol[this.k]) : 0;
        if (!m) { this.busy = false; this.solved = true; toast('Đáp án: ' + this.notes.join(' → ')); this.draw(); return; }
        this.notes.push(pos.san(m)); pos.make(m); this.k++; this.last = [CH.mFrom(m), CH.mTo(m)]; this.hint = null; this.draw();
        setTimeout(step, 700);
      };
      step();
    },
    draw() {
      setTimeout(() => Nav.update(), 0);
      const c = this.ctx, p = this.cur;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#puz-title').innerHTML = '<b>Bài ' + p.id + '</b> · ' + SIDE[p.side] + ' đi, chiếu hết trong ' + p.n + ' nước <span class="rate">' + p.r + '</span>';
      let st;
      if (this.solved) st = '<b class="okt">Hoàn thành!</b> ' + esc(this.notes.join(' → '));
      else st = 'Còn <b>' + this.remaining() + '</b> nước. ' + (this.busy ? 'Đối phương đang đỡ…' : 'Đến lượt bạn.');
      $('#puz-status').innerHTML = st;
      $('#puz-next').hidden = !this.solved;
      $('#puz-hint').disabled = this.busy || this.solved; $('#puz-sol').disabled = this.busy || this.solved;
    }
  };
