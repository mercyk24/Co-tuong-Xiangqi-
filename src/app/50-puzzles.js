  // 50-puzzles.js — Tab Chiếu hết: bài chiếu hết có lời giải kiểm chứng bằng solver.
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
      else { this.hint = [m >> 7, m & 127]; this.hintStage = 2; const n = this.ctx.pos.notation(m); toast('Nước đi: ' + n); }
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
        if (pos.legalMoves().length === 0) { this.busy = false; this.solved = true; toast('Đáp án: ' + this.notes.join(' → ')); this.draw(); return; }
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
      setTimeout(() => Nav.update(), 0);
      const c = this.ctx, p = this.cur;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#puz-title').innerHTML = '<b>Bài ' + p.id + '</b> · ' + (p.side === 0 ? 'Đỏ' : 'Đen') + ' đi, chiếu hết trong ' + p.n + ' nước';
      let st;
      if (this.solved) st = '<b class="okt">Hoàn thành!</b> ' + (this.notes.length ? esc(ndt(this.notes.join(' → '))) : '');
      else st = 'Còn <b>' + this.remaining + '</b> nước chiếu. ' + (this.busy ? 'Đối phương đang đỡ…' : 'Đến lượt bạn.');
      $('#puz-status').innerHTML = st;
      $('#puz-next').hidden = !this.solved;
      $('#puz-hint').disabled = this.busy || this.solved; $('#puz-sol').disabled = this.busy || this.solved;
    }
  };

  // Đánh giá của Pikafish (tìm ngắn, chỉ để tham khảo)
