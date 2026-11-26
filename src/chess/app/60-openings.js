  // 60-openings.js — CỜ VUA, tab Khai cuộc: xem và tập các biến của những khai cuộc phổ biến.
  // Dữ liệu (OPENINGS, tạo bởi tools/chess/build-data.js từ danh sách khai cuộc CC0 của Lichess):
  //   groups: { khoá: { title, en, side (bên người học: 0 Trắng, 1 Đen), order, about: [đoạn giới thiệu] } }
  //   lines:  [{ id, group, eco, name, moves: [SAN…] }]
  //   names:  { "e4 c5 Nf3": "Sicilian Defense: …" }  tên khai cuộc tại từng chuỗi nước (để biết đang ở biến nào)
  const Op = {
    ctx: null, line: null, group: '', side: 0, mode: 'study', k: 0, cands: [], last: null, hint: null, stats: Store.get('op_stats', {}),
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
      $('#op-again').onclick = () => this.startDrill(this.line, this.group);
      $('#op-moves').onclick = e => { const el = e.target.closest('.mv'); if (el && this.mode === 'study') this.goto(+el.dataset.i + 1); };
      this.renderList();
    },
    groups() { const G = OPENINGS.groups || {}; return Object.keys(G).sort((x, y) => G[x].order - G[y].order); },
    renderList() {
      const G = OPENINGS.groups || {};
      let h = '';
      if (!OPENINGS.lines || !OPENINGS.lines.length) { $('#op-list').innerHTML = '<p class="muted">Chưa có dữ liệu khai cuộc.</p>'; return; }
      for (const gk of this.groups()) {
        const g = G[gk], ls = OPENINGS.lines.filter(L => L.group === gk); if (!ls.length) continue;
        const nd = ls.filter(L => (this.stats[L.id] || {}).done).length;
        h += '<details class="grp"><summary><b>' + esc(g.title) + '</b> <span class="badge">' + (g.side ? 'bạn cầm Đen' : 'bạn cầm Trắng') + ' · ' + ls.length + ' biến · ' + nd + ' đã tập</span></summary>';
        h += '<div class="card">' + (g.en ? '<p class="muted">' + esc(g.en) + '</p>' : '') + (g.about || []).map(t => '<p>' + esc(t) + '</p>').join('') + '</div>';
        h += '<div class="row"><button class="btn primary" data-a="random" data-g="' + esc(gk) + '">Tập ngẫu nhiên nhóm này</button></div>';
        for (const L of ls) {
          const s = this.stats[L.id] || { done: 0 };
          h += '<div class="card line"><div class="line-h"><b>' + esc(L.name) + '</b><span class="badge">' + esc(L.eco) + ' · ' + (s.done ? '✓ ' + s.done + ' lần' : 'chưa tập') + '</span></div>' +
            '<p class="muted">' + esc(this.sanLine(L.moves)) + '</p>' +
            '<div class="row"><button class="btn" data-a="study" data-id="' + esc(L.id) + '">Xem</button><button class="btn primary" data-a="drill" data-id="' + esc(L.id) + '">Tập</button></div></div>';
        }
        h += '</details>';
      }
      h += '<div class="card line"><div class="line-h"><b>Tập ngẫu nhiên tất cả</b></div><p class="muted">Máy chọn ngẫu nhiên một nhóm và một biến; bạn đi các nước của bên mình.</p><div class="row"><button class="btn primary" data-a="random" data-g="">Bắt đầu</button></div></div>';
      $('#op-list').innerHTML = h;
      $$('#op-list button').forEach(b => b.onclick = () => {
        if (b.dataset.a === 'random') this.startRandom(b.dataset.g || '');
        else this.open(OPENINGS.lines.find(l => l.id === b.dataset.id), b.dataset.a);
      });
    },
    sanLine(ms) { return ms.map((m, i) => (i % 2 ? '' : (i / 2 + 1) + '. ') + m).join(' '); },
    showList() { this.gen++; $('#op-play').hidden = true; $('#op-list-wrap').hidden = false; this.renderList(); },
    open(L, mode) {
      this.line = L; this.group = L.group; this.side = (OPENINGS.groups[L.group] || {}).side || 0;
      $('#op-list-wrap').hidden = true; $('#op-play').hidden = false;
      this.board.setFlip(this.side === 1);
      this.setMode(mode || 'study');
    },
    setMode(mode) {
      this.gen++; this.mode = mode;
      $('#op-study').classList.toggle('on', mode === 'study'); $('#op-drill').classList.toggle('on', mode === 'drill');
      if (mode === 'study') { this.cands = [this.line]; this.goto(0); }
      else this.startDrill(this.line, this.group);
    },
    nameAt(moves) { return (OPENINGS.names || {})[moves.join(' ')] || ''; },
    goto(k) {
      const L = this.line;
      k = Math.max(0, Math.min(L.moves.length, k)); this.k = k;
      const pos = CH.Pos.fromFen(CH.START_FEN); let lm = 0;
      for (let i = 0; i < k; i++) { lm = pos.parseSan(L.moves[i]); pos.make(lm); }
      this.ctx = { pos, sel: -1, targets: [] };
      this.last = lm ? [CH.mFrom(lm), CH.mTo(lm)] : null; this.hint = null;
      const g = OPENINGS.groups[L.group] || {};
      if (k === 0) this.noteText = g.title + ' – ' + L.name + ' (' + L.eco + '). Bấm ▶ để xem từng nước, hoặc bấm vào nước trong bảng.';
      else {
        const nm = this.nameAt(L.moves.slice(0, k));
        this.noteText = (k % 2 ? 'Trắng' : 'Đen') + ' đi ' + L.moves[k - 1] + '.' + (nm ? ' Đây là: ' + nm + '.' : '') + (k === L.moves.length ? ' Hết biến.' : '');
      }
      this.pathNotes = L.moves.slice();
      this.finished = false; this.draw();
    },
    startRandom(g) {
      const keys = this.groups().filter(k => OPENINGS.lines.some(L => L.group === k));
      const gk = g || keys[(Math.random() * keys.length) | 0];
      this.group = gk; this.side = (OPENINGS.groups[gk] || {}).side || 0;
      $('#op-list-wrap').hidden = true; $('#op-play').hidden = false; this.board.setFlip(this.side === 1);
      this.line = null; this.mode = 'drill';
      $('#op-study').classList.remove('on'); $('#op-drill').classList.add('on');
      this.startDrill(null, gk);
    },
    startDrill(L, gk) {
      this.gen++;
      this.line = L; this.group = gk;
      this.cands = L ? [L] : OPENINGS.lines.filter(x => x.group === gk);
      this.ctx = { pos: CH.Pos.fromFen(CH.START_FEN), sel: -1, targets: [] };
      this.k = 0; this.last = null; this.hint = null; this.mistakes = 0; this.finished = false; this.busy = false; this.pathNotes = [];
      const g = OPENINGS.groups[gk] || {};
      this.noteText = 'Bạn cầm ' + SIDE[this.side] + '. Hãy đi các nước của ' + (g.title || 'khai cuộc') + (L ? ' – ' + L.name : '') + '.';
      this.draw();
      this.oppReply();
    },
    // Máy đi nước của đối phương (chọn ngẫu nhiên trong các biến còn khớp)
    oppReply() {
      const pos = this.ctx.pos; if (pos.side === this.side) return;
      const avail = this.cands.filter(L => L.moves.length > this.k);
      if (!avail.length) { this.finish(); return; }
      const pick = avail[(Math.random() * avail.length) | 0], san = pick.moves[this.k];
      this.cands = avail.filter(L => L.moves[this.k] === san);
      this.busy = true; const g = this.gen;
      setTimeout(() => {
        if (g !== this.gen) return;
        const m = pos.parseSan(san); if (!m) { this.busy = false; return; }
        pos.make(m); this.pathNotes.push(san);
        this.last = [CH.mFrom(m), CH.mTo(m)];
        this.k++; this.busy = false;
        const nm = this.nameAt(this.pathNotes);
        this.noteText = SIDE[this.side ^ 1] + ' đi ' + san + '.' + (nm ? ' (' + nm + ')' : '') + ' Đến lượt bạn.';
        if (!this.cands.some(L => L.moves.length > this.k)) { this.draw(); this.finish(); return; }
        this.draw();
      }, 450);
    },
    onSquare(sq) {
      if (this.mode !== 'drill' || this.busy || this.finished) return;
      this.hint = null;
      trySelect(this.ctx, sq, this.side, m => this.userMove(m));
      this.draw();
    },
    userMove(m) {
      const pos = this.ctx.pos, san = pos.san(m).replace(/[+#]$/, '');
      const ok = this.cands.filter(L => L.moves[this.k] && L.moves[this.k].replace(/[+#]$/, '') === san);
      if (!ok.length) {
        this.mistakes++;
        const exp = Array.from(new Set(this.cands.filter(L => L.moves.length > this.k).map(L => L.moves[this.k])));
        this.noteText = 'Chưa đúng: ' + san + '. Trong biến này, nước ở đây là: ' + exp.join(' hoặc ') + '. Hãy thử lại.';
        toast('Chưa đúng – thử lại.', 'warn');
        return;
      }
      const full = ok[0].moves[this.k];
      this.cands = ok; pos.make(m); this.pathNotes.push(full); this.last = [CH.mFrom(m), CH.mTo(m)];
      this.k++;
      const nm = this.nameAt(this.pathNotes);
      this.noteText = 'Đúng: ' + full + '.' + (nm ? ' (' + nm + ')' : '');
      if (!ok.some(L => L.moves.length > this.k)) { this.draw(); this.finish(); return; }
      this.draw();
      this.oppReply();
    },
    finish() {
      this.finished = true;
      const L = this.cands[0];
      if (L) {
        const s = this.stats[L.id] || { done: 0, mistakes: 0 };
        s.done++; s.mistakes += this.mistakes; this.stats[L.id] = s; Store.set('op_stats', this.stats);
        this.noteText += ' — Hoàn thành biến "' + L.name + '" với ' + this.mistakes + ' lần sai.';
      }
      toast('Hoàn thành biến! ' + (this.mistakes ? this.mistakes + ' lần sai.' : 'Không sai nước nào.'), 'ok');
      this.draw();
    },
    showHint() {
      if (this.mode !== 'drill' || this.busy || this.finished) return;
      const avail = this.cands.filter(L => L.moves.length > this.k);
      if (!avail.length) return;
      const san = avail[0].moves[this.k], m = this.ctx.pos.parseSan(san);
      if (!m) return;
      this.hint = [CH.mFrom(m), CH.mTo(m)]; this.mistakes++;
      toast('Nước đúng: ' + san); this.draw();
    },
    draw() {
      setTimeout(() => Nav.update(), 0);
      const c = this.ctx, L = this.line, g = (OPENINGS.groups || {})[this.group] || {};
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      $('#op-title').textContent = L ? L.name : 'Tập ngẫu nhiên – ' + (g.title || 'mọi khai cuộc');
      $('#op-note').textContent = this.noteText;
      const study = this.mode === 'study';
      $('#op-nav').hidden = !study;
      $('#op-hint').hidden = study; $('#op-again').hidden = study;
      $('#op-study').hidden = !L;
      const notes = study ? L.moves : this.pathNotes, cur = study ? this.k - 1 : notes.length - 1;
      $('#op-moves').innerHTML = notes.length ? moveListHtml(notes, 0, cur, study) : '<span class="muted">Chưa có nước đi.</span>';
      const cu = $('#op-moves .cur'); if (cu && cu.scrollIntoView) { try { cu.scrollIntoView({ block: 'nearest' }); } catch (e) { /* bỏ qua */ } }
    }
  };
