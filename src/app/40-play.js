  // 40-play.js — Tab Đấu máy: ván với máy, sách khai cuộc của máy, gợi ý, đi lại, lưu ván để phân tích.
  // ---------- Đấu máy ----------
  const Play = {
    ctx: { pos: null, sel: -1, targets: [] }, moves: [], notes: [], startFen: XQ.START_FEN,
    user: Store.get('play_user', 1), level: Store.get('play_level', 3), warn: Store.get('play_warn', false),
    last: null, hint: null, thinking: false, over: null, gen: 0, rec: null,
    init() {
      this.board = new Board($('#play-board'), sq => this.onSquare(sq));
      $('#play-ana').onclick = () => Ana.openCurrent();
      $('#play-new').onclick = () => this.newGame();
      $('#play-undo').onclick = () => this.undo();
      $('#play-hint').onclick = () => this.showHint();
      $('#play-flip').onclick = () => { this.board.setFlip(!this.board.flip); this.draw(); };
      const sd = $('#play-side'), lv = $('#play-level'), wr = $('#play-warn'), op = $('#play-open');
      op.value = Store.get('play_open', ''); op.onchange = () => { Store.set('play_open', op.value); };
      sd.value = String(this.user);
      lv.innerHTML = Object.keys(LEVELS).map(k => '<option value="' + k + '">' + LEVELS[k].name + '</option>').join('');
      lv.value = String(this.level); wr.checked = !!this.warn;
      sd.onchange = () => { this.user = +sd.value; Store.set('play_user', this.user); this.newGame(); };
      lv.onchange = () => { this.level = +lv.value; Store.set('play_level', this.level); };
      wr.onchange = () => { this.warn = wr.checked; Store.set('play_warn', this.warn); };
      this.newGame();
    },
    newGame() {
      this.saveGame(); this.rec = null;
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
      if (this.over && this.moves.length >= 4) { this.saveGame(); toast('Ván đã kết thúc. Bấm "Phân tích ván" để xem bạn sai ở đâu.'); }
    },
    // Lưu ván vào bộ nhớ máy (tối đa 20 ván gần nhất) để phân tích sau.
    saveGame() {
      if (this.moves.length < 4) return null;
      let g = this.rec;
      if (!g) { g = this.rec = { id: 'g' + Date.now(), t: Date.now(), user: this.user, level: this.level, startFen: this.startFen }; Ana.games.unshift(g); Ana.games = Ana.games.slice(0, 20); }
      g.moves = this.moves.map(m => XQ.mvStr(m)); g.res = this.over || '';
      if (g.ana && g.ana.n !== g.moves.length) g.ana = null;
      Store.set('games', Ana.games);
      return g;
    },
    // Sách khai cuộc ngắn cho máy: chọn ngẫu nhiên trong các nước mở đầu hợp lý để mỗi ván một khác.
    RED_BOOK: ['炮二平五', '炮二平五', '炮二平五', '炮八平五', '兵七進一', '兵七進一', '兵三進一', '相三進五', '相七進五', '傌二進三', '炮二平六'],
    BLACK_BOOK: {
      '炮二平五': ['馬8進7', '馬8進7', '馬8進7', '炮8平5', '馬2進3'],
      '炮八平五': ['馬8進7', '馬8進7', '炮8平5', '馬2進3'],
      '兵七進一': ['象3進5', '炮8平5', '馬8進7', '馬2進3'],
      '兵三進一': ['象7進5', '馬2進3', '炮2平5', '炮8平5'],
      '相三進五': ['炮8平5', '馬8進7', '象3進5'],
      '相七進五': ['炮8平5', '馬8進7', '象7進5'],
      '傌二進三': ['馬8進7', '炮8平5', '卒7進1'],
      '炮二平六': ['馬8進7', '炮8平5', '象3進5']
    },
    bookMove() {
      if (this.level < 3) return 0;
      const pos = this.ctx.pos, pick = arr => arr[(Math.random() * arr.length) | 0];
      const key = this.moves.map(m => XQ.mvStr(m)).join(' ');
      let s = '', u = '';
      if (this.moves.length === 0 && pos.side === 0 && $('#play-open').value) s = $('#play-open').value;
      else if (BOOK[key] && BOOK[key].length) u = pick(BOOK[key]);
      else if (this.moves.length === 0 && pos.side === 0) s = pick(this.RED_BOOK);
      else if (this.moves.length === 1 && pos.side === 1) { const arr = this.BLACK_BOOK[this.notes[0]]; if (arr) s = pick(arr); }
      if (u) { const m = pos.legalMoves().find(x => XQ.mvStr(x) === u); return m !== undefined ? m : 0; }
      if (!s) return 0;
      const m = pos.parse(s); return m > 0 ? m : 0;
    },
    engineMove() {
      if (this.over) return;
      const bm = this.bookMove();
      if (bm > 0) { const g0 = this.gen, n0 = this.moves.length; setTimeout(() => { if (g0 === this.gen && !this.over && this.moves.length === n0) this.doMove(bm, false); }, 350); return; }
      const g = this.gen; this.thinking = true; this.draw();
      const lv = LEVELS[this.level];
      if (lv.fsf) {
        const fallback = msg => { if (msg) toast(msg, 'warn'); Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: lv.opts }).then(r => { if (g !== this.gen) return; this.thinking = false; if (r.move) this.doMove(r.move, false); else this.draw(); }); };
        if (!FSF.supported()) { fallback('Trình duyệt chưa bật được engine mạnh (hãy tải lại trang một lần). Tạm dùng cấp 5.'); return; }
        if (!FSF.sf) toast('Đang tải engine cao thủ (13 MB), lần đầu hơi lâu…');
        FSF.best(this.startFen, this.moves.map(m => XQ.mvStr(m)), lv.fsf.ms).then(u => {
          if (g !== this.gen) return;
          const m = this.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === u);
          if (m === undefined) { fallback('Engine mạnh trả nước không hợp lệ, tạm dùng cấp 5.'); return; }
          this.thinking = false; this.doMove(m, false);
        }).catch(err => { if (g !== this.gen) return; fallback('Không chạy được engine mạnh (' + (err && err.message || err) + '). Tạm dùng cấp 5.'); });
        return;
      }
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
        if (r.best !== m && loss > 130) toast('Nước vừa rồi có thể yếu (mất ≈ ' + (loss / 100).toFixed(1) + ' điểm). Gợi ý: ' + r.bestNot, 'warn');
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
        if (r.move) { this.hint = [r.move >> 7, r.move & 127]; const n = this.ctx.pos.notation(r.move); toast('Gợi ý: ' + n); }
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
      $('#play-ana').disabled = this.moves.length < 4;
    }
  };

