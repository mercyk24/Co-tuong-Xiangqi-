  // 60-openings.js — Tab Khai cuộc: xem và tập các biến khai cuộc (người học cầm Đen), kèm đánh giá Pikafish.
  function pkText(L, ply) {
    const p = L && L.pk && L.pk[ply]; if (!p) return '';
    const e = p.e / 100, a = Math.abs(e);
    const lab = a < 0.3 ? 'cân bằng' : (e > 0 ? 'Đỏ hơn' : 'Đen hơn');
    let t = ' Pikafish: ' + lab + ' (' + (e >= 0 ? 'Đỏ +' : 'Đen +') + a.toFixed(2).replace('.', ',') + ').';
    if (p.b !== undefined) {
      if (p.same) t += ' Trùng nước Pikafish chọn.';
      else if (p.d <= -30) t += ' Pikafish ưu tiên ' + p.b + ', hơn nước trong sách khoảng ' + (-p.d / 100).toFixed(2).replace('.', ',') + '';
      else if (p.b) t += ' Pikafish chọn ' + p.b + ', chênh lệch không đáng kể.';
    }
    return t;
  }

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
      this.renderList();
    },
    renderList() {
      const G = OPENINGS.groups || { bpm: { title: 'Bình phong mã đối Pháo đầu', order: 0 } };
      const keys = Object.keys(G).sort((x, y) => G[x].order - G[y].order);
      let h = '';
      keys.forEach((gk, gi) => {
        const ls = OPENINGS.lines.filter(L => (L.group || 'bpm') === gk); if (!ls.length) return;
        const nd = ls.filter(L => (this.stats[L.id] || {}).done).length;
        h += '<details class="grp"' + '' + '><summary><b>' + esc(ndt(G[gk].title)) + '</b> <span class="badge">' + ls.length + ' biến · ' + nd + ' đã tập</span></summary>';
        if (gk === 'bpm') h += '<div class="card">' + OPENINGS.overview.map(t => '<p>' + esc(ndt(t)) + '</p>').join('') + '</div>';
        h += '<div class="row"><button class="btn primary" data-a="random" data-g="' + gk + '">Tập ngẫu nhiên nhóm này</button></div>';
        ls.forEach(L => {
          const s = this.stats[L.id] || { done: 0, mistakes: 0 };
          h += '<div class="card line"><div class="line-h"><b>' + esc(ndt(L.title)) + '</b><span class="badge">' + (s.done ? '✓ ' + s.done + ' lần' : 'chưa tập') + '</span></div><p class="muted">' + esc(ndt(L.summary)) + '</p><div class="row"><button class="btn" data-a="study" data-id="' + L.id + '">Xem</button><button class="btn primary" data-a="drill" data-id="' + L.id + '">Tập chơi Đen</button></div></div>';
        });
        h += '</details>';
      });
      h += '<div class="card line"><div class="line-h"><b>Tập ngẫu nhiên tất cả</b></div><p class="muted">Máy chọn ngẫu nhiên nước mở đầu và các nhánh của Đỏ trong mọi nhóm; bạn đáp lại bằng nước đúng của sách.</p><div class="row"><button class="btn primary" data-a="random" data-g="">Bắt đầu</button></div></div>';
      $('#op-list').innerHTML = h;
      $$('#op-list button').forEach(b => b.onclick = () => {
        if (b.dataset.a === 'random') this.startRandom(b.dataset.g || '');
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
      this.noteText = k > 0 ? ((L.notes[k] || '') + pkText(L, k)) : 'Thế ban đầu. Bấm ▶ để xem từng nước, hoặc bấm vào nước trong bảng.';
      this.pathNotes = L.moves.slice(0, L.moves.length);
      this.finished = false; this.draw();
    },
    startRandom(g) {
      this.randGroup = g || '';
      $('#op-list-wrap').hidden = true; $('#op-play').hidden = false; this.board.setFlip(true);
      this.line = null; this.mode = 'drill';
      $('#op-study').classList.remove('on'); $('#op-drill').classList.add('on');
      this.startDrill(null);
    },
    startDrill(L) {
      this.gen++;
      this.line = L;
      this.cands = L ? [L] : OPENINGS.lines.filter(x => !this.randGroup || (x.group || 'bpm') === this.randGroup);
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
        this.noteText = 'Đỏ: ' + not + '. ' + (this.cands[0].notes[this.k + 1] || '') + pkText(this.cands[0], this.k + 1);
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
        const eq = this.cands.some(L => L.pk && L.pk[this.k + 1] && L.pk[this.k + 1].alt && L.pk[this.k + 1].alt.indexOf(not) >= 0);
        if (eq) {
          const exp0 = Array.from(new Set(this.cands.filter(L => L.moves.length > this.k).map(L => L.moves[this.k])));
          this.noteText = not + ' cũng là nước tốt (Pikafish chấm gần ngang). Nhưng biến này đi ' + exp0.join(' hoặc ') + ' – hãy đi nước đó để tập tiếp. Không tính là sai.';
          toast('Nước này cũng ổn – thử nước trong sách.');
          return;
        }
        this.mistakes++;
        const exp = Array.from(new Set(this.cands.filter(L => L.moves.length > this.k).map(L => L.moves[this.k])));
        this.noteText = 'Chưa đúng: ' + not + '. Trong sách, nước ở đây là: ' + exp.join(' hoặc ') + '. Hãy thử lại.';
        toast('Chưa đúng – thử lại.', 'warn');
        return;
      }
      this.cands = ok; pos.make(m); this.pathNotes.push(not); this.last = [m >> 7, m & 127];
      this.noteText = 'Đúng: ' + not + '. ' + (ok[0].notes[this.k + 1] || '') + pkText(ok[0], this.k + 1);
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
      toast('Nước đúng: ' + not); this.draw();
    },
    draw() {
      const c = this.ctx, L = this.line;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#op-title').textContent = ndt(L ? L.title : 'Tập ngẫu nhiên' + (this.randGroup && OPENINGS.groups ? ' – ' + OPENINGS.groups[this.randGroup].title : ' – mọi khai cuộc'));
      $('#op-note').textContent = ndt(this.noteText);
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


