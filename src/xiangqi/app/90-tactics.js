  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng. Có bản song sinh bên cờ vua: src/chess/app/90-tactics.js (giống ~67%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 90-tactics.js — Tab Chiến thuật: bài tìm nước đúng theo hạng, chế độ 3 phút / 5 phút / sinh tồn, và "Lỗi của bạn".
  // ---------- Chiến thuật ----------
  const Tac = {
    ctx: null, cur: null, solved: false, busy: false, hint: null, hintStage: 0, last: null, gen: 0, errors: 0, notes: [], over: false,
    mine: Store.get('mine', []),
    done: Store.get('tac_done', {}), best: Store.get('tac_best', {}), hist: Store.get('tac_hist', []),
    band: Store.get('tac_band', 0), mode: 'free', left: 0, score: 0, queue: [], timer: null, lives: 0,
    BANDS: [['Tất cả', 0, 9999], ['Nhập môn', 0, 899], ['Trung bình', 900, 1199], ['Nâng cao', 1200, 9999]],
    MODES: { t3: ['Siêu tốc 3 phút', 'Giải càng nhiều càng tốt', 180], t5: ['Tập trung 5 phút', 'Thời gian dài hơn', 300], surv: ['Sinh tồn', 'Sai một lần là kết thúc', 0] },
    init() {
      this.board = new Board($('#tac-board'), sq => this.onSquare(sq));
      $('#tac-back').onclick = () => this.showList();
      $('#tac-hint').onclick = () => this.showHint();
      $('#tac-reset').onclick = () => this.open(this.cur.id);
      $('#tac-sol').onclick = () => this.showAnswer();
      $('#tac-more').onclick = () => this.playLine();
      $('#tac-next').onclick = () => this.next();
      this.renderList();
    },
    minePool() { return this.mine.filter(p => (p.ok || 0) < 2); },
    pool() { const b = this.BANDS[this.band]; return TACTICS.filter(p => p.rating >= b[1] && p.rating <= b[2]); },
    renderList() {
      const total = TACTICS.length, nd = TACTICS.filter(p => this.done[p.id]).length;
      $('#tac-stats').textContent = 'Đã giải ' + nd + '/' + total + ' bài.';
      const mp = this.minePool().length, mt = this.mine.length;
      $('#tac-mine').innerHTML = mt ? '<button class="pz' + (mp ? '' : ' ok') + '" id="tac-mine-go"><span class="pz-n">Lỗi của bạn</span><span class="pz-s">' + mp + ' thế cần luyện lại · ' + (mt - mp) + ' đã thuộc (đúng ngay 2 lần liên tiếp)</span></button>'
        : '<p class="muted">Chơi một ván rồi bấm "Phân tích ván" khi ván kết thúc: các thế bạn đi sai sẽ thành bài tập riêng ở đây.</p>';
      const mg = $('#tac-mine-go'); if (mg) mg.onclick = () => { const l = this.minePool(); if (!l.length) { toast('Bạn đã thuộc hết các lỗi đang có. Chơi và phân tích thêm ván mới nhé.'); return; } this.mode = 'free'; this.open(l[0].id); };
      $('#tac-bands').innerHTML = this.BANDS.map((b, i) => '<button class="chip' + (i === this.band ? ' on' : '') + '" data-b="' + i + '">' + b[0] + '</button>').join('');
      $$('#tac-bands .chip').forEach(c => c.onclick = () => { this.band = +c.dataset.b; Store.set('tac_band', this.band); this.renderList(); });
      $('#tac-modes').innerHTML = Object.keys(this.MODES).map(k => {
        const m = this.MODES[k], bs = this.best[k];
        return '<button class="pz" data-m="' + k + '"><span class="pz-n">' + m[0] + '</span><span class="pz-s">' + m[1] + (bs ? ' · kỷ lục ' + bs : '') + '</span></button>';
      }).join('');
      $$('#tac-modes .pz').forEach(b => b.onclick = () => this.startMode(b.dataset.m));
      const pl = this.pool();
      if (pl.length) pagedGrid($('#tac-grid'), pl, p => '<button class="pz' + (this.done[p.id] ? ' ok' : '') + '" data-id="' + esc(p.id) + '"><span class="pz-n">Bài ' + p.id.slice(1) + '</span><span class="pz-s">' + (p.side === 'w' ? '<i class="dot r"></i>Đỏ' : '<i class="dot b"></i>Đen') + ' đi<span class="rate">' + p.rating + '</span></span>' + (this.done[p.id] ? '<span class="tick">✓</span>' : '') + '</button>',
        id => { this.mode = 'free'; this.open(id); }, p => this.done[p.id]);
      else { $('#tac-grid').onclick = null; $('#tac-grid').innerHTML = '<p class="muted">Chưa có bài trong mức này.</p>'; }
      const H = this.hist.slice(-10).reverse();
      $('#tac-hist').innerHTML = H.length ? H.map(h => '<div class="hrow"><span>' + new Date(h.t).toLocaleDateString('vi-VN') + ' · ' + esc(this.MODES[h.m][0]) + '</span><b>' + h.s + ' bài</b></div>').join('') : 'Chưa có lượt chơi nào.';
    },
    showList() { this.gen++; this.stopTimer(); this.mode = 'free'; $('#tac-play').hidden = true; $('#tac-list-wrap').hidden = false; this.renderList(); },
    shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    startMode(m) {
      const pl = this.pool(); if (!pl.length) { toast('Chưa có bài trong mức này.', 'warn'); return; }
      this.mode = m; this.score = 0; this.over = false; this.left = this.MODES[m][2]; this.queue = this.shuffle(pl);
      this.stopTimer();
      if (this.left) this.timer = setInterval(() => { this.left--; if (this.left <= 0) this.endSession('Hết giờ!'); else this.drawBar(); }, 1000);
      this.open(this.queue.shift().id);
    },
    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
    endSession(msg) {
      if (this.over) return; this.over = true; this.stopTimer(); this.gen++; this.busy = false;
      const m = this.mode; this.hist.push({ t: Date.now(), m, s: this.score }); this.hist = this.hist.slice(-50); Store.set('tac_hist', this.hist);
      if (!this.best[m] || this.score > this.best[m]) { this.best[m] = this.score; Store.set('tac_best', this.best); }
      this.sessionMsg = msg + ' Bạn giải đúng ' + this.score + ' bài.';
      this.draw();
    },
    open(id) {
      this.gen++;
      const p = TACTICS.find(x => x.id === id) || this.mine.find(x => x.id === id); this.cur = p;
      this.ctx = { pos: XQ.Pos.fromFen(p.fen), sel: -1, targets: [] };
      this.user = p.side === 'b' ? 1 : 0;
      this.busy = false; this.solved = false; this.hint = null; this.hintStage = 0; this.errors = 0; this.last = null; this.notes = []; this.sessionMsg = '';
      this.board.setFlip(this.user === 1);
      $('#tac-list-wrap').hidden = true; $('#tac-play').hidden = false;
      this.draw();
    },
    next() {
      if (this.mode !== 'free') {
        if (!this.queue.length) this.queue = this.shuffle(this.pool());
        this.open(this.queue.shift().id); return;
      }
      if (this.cur.id[0] === 'm') {
        const l = this.minePool().filter(p => p.id !== this.cur.id);
        if (!l.length) { toast('Hết bài trong "Lỗi của bạn".', 'ok'); this.showList(); return; }
        this.open(l[0].id); return;
      }
      const list = this.pool(); const i = list.findIndex(p => p.id === this.cur.id);
      const nx = list.slice(i + 1).find(p => !this.done[p.id]) || list[(i + 1) % list.length];
      this.open(nx.id);
    },
    onSquare(sq) {
      if (this.busy || this.solved || this.over) return;
      this.hint = null;
      trySelect(this.ctx, sq, this.user, m => this.attempt(m));
      this.draw();
    },
    attempt(m) {
      const pos = this.ctx.pos, p = this.cur;
      if ((p.accept || [p.best]).indexOf(XQ.mvStr(m)) < 0) {
        this.errors++;
        if (this.mode === 'surv') { toast('Sai rồi. Nước đúng là ' + p.sol[0], 'warn'); this.endSession('Kết thúc!'); return; }
        if (this.mode !== 'free') { toast('Chưa đúng. Bỏ qua bài này.', 'warn'); this.busy = true; const g = this.gen; setTimeout(() => { if (g === this.gen) this.next(); }, 700); return; }
        toast('Chưa đúng. Hãy tìm nước mạnh nhất trong thế này.', 'warn');
        return;
      }
      this.notes.push(pos.notation(m)); pos.make(m); this.last = [m >> 7, m & 127];
      this.solved = true;
      if (p.id[0] === 'm') { p.ok = this.errors ? 0 : (p.ok || 0) + 1; Store.set('mine', this.mine); }
      if (this.mode === 'free') {
        if (!this.done[p.id]) { this.done[p.id] = 1; Store.set('tac_done', this.done); }
        toast(this.errors ? 'Đúng rồi! (sai ' + this.errors + ' lần)' : 'Đúng ngay lần đầu!', 'ok');
      } else {
        this.score++; if (!this.done[p.id]) { this.done[p.id] = 1; Store.set('tac_done', this.done); }
        this.busy = true; const g = this.gen; setTimeout(() => { if (g === this.gen) this.next(); }, 600);
      }
      this.draw();
    },
    showHint() {
      if (this.busy || this.solved || this.over || this.mode !== 'free') return;
      const u = this.cur.best;
      const m = this.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) return;
      if (this.hintStage === 0) { this.hint = [m >> 7, null]; this.hintStage = 1; toast('Gợi ý: hãy dùng quân được đánh dấu.'); }
      else { this.hint = [m >> 7, m & 127]; this.hintStage = 2; const n = this.ctx.pos.notation(m); toast('Nước đi: ' + n); }
      this.draw();
    },
    showAnswer() {
      if (this.busy || this.solved || this.over || this.mode !== 'free') return;
      this.errors++;
      const pos = this.ctx.pos; const m = pos.legalMoves().find(x => XQ.mvStr(x) === this.cur.best); if (m === undefined) return;
      this.notes.push(pos.notation(m)); pos.make(m); this.last = [m >> 7, m & 127]; this.hint = null; this.solved = true;
      toast('Đáp án: ' + this.notes[0]);
      this.draw();
    },
    playLine() {
      if (this.busy || !this.solved) return;
      const pv = this.cur.pv.slice(this.notes.length); if (!pv.length) return;
      this.busy = true; const g = this.gen; let i = 0;
      const step = () => {
        if (g !== this.gen) return;
        const pos = this.ctx.pos; const m = i < pv.length ? pos.legalMoves().find(x => XQ.mvStr(x) === pv[i]) : undefined;
        if (m === undefined) { this.busy = false; this.draw(); return; }
        this.notes.push(pos.notation(m)); pos.make(m); this.last = [m >> 7, m & 127]; i++; this.draw();
        setTimeout(step, 750);
      };
      step();
    },
    drawBar() {
      if (this.mode === 'free') return;
      const mm = Math.floor(this.left / 60), ss = ('0' + (this.left % 60)).slice(-2);
      $('#tac-title').innerHTML = '<div class="tacbar"><span>' + esc(this.MODES[this.mode][0]) + '</span>' + (this.mode === 'surv' ? '' : '<span class="tm">' + mm + ':' + ss + '</span>') + '<span>Điểm ' + this.score + '</span></div>';
    },
    draw() {
      setTimeout(() => Nav.update(), 0);
      const c = this.ctx, p = this.cur;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      if (this.mode === 'free') $('#tac-title').innerHTML = p.id[0] === 'm' ? '<b>Lỗi của bạn</b> · ' + (this.user === 0 ? 'Đỏ' : 'Đen') + ' đi · ván ngày ' + new Date(p.t).toLocaleDateString('vi-VN') : '<b>Bài ' + p.id.slice(1) + '</b> · ' + (this.user === 0 ? 'Đỏ' : 'Đen') + ' đi · hạng ' + p.rating;
      else this.drawBar();
      let st;
      if (this.over) st = '<b class="okt">' + esc(this.sessionMsg) + '</b> Bấm "Danh sách" để chơi lại.';
      else if (this.solved && this.mode === 'free') st = '<b class="okt">Đúng!</b> ' + esc(ndt(this.notes.join(' → '))) + (p.id[0] === 'm' && p.played ? '<br><span class="muted">Trong ván bạn đã đi ' + esc(ndt(p.played)) + ' (mất ≈ ' + fmtPts(p.loss) + ' điểm).' + (this.errors ? '' : ' Đúng ngay lần đầu: ' + (p.ok >= 2 ? 'đã thuộc.' : 'thêm 1 lần nữa là thuộc.')) + '</span>' : '');
      else st = (this.user === 0 ? 'Đỏ' : 'Đen') + ' đi. Tìm nước mạnh nhất.' + (this.busy ? ' …' : '');
      $('#tac-status').innerHTML = st;
      const free = this.mode === 'free';
      $('#tac-next').hidden = !(this.solved && free); $('#tac-more').hidden = !(this.solved && free && this.cur.pv.length > this.notes.length);
      $('#tac-hint').hidden = !free; $('#tac-sol').hidden = !free; $('#tac-reset').hidden = !free;
      $('#tac-hint').disabled = this.busy || this.solved; $('#tac-sol').disabled = this.busy || this.solved;
    }
  };

