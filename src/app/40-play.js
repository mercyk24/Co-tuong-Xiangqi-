  // 40-play.js — Tab Đấu máy: ván với máy hoặc hai người trên một máy (hướng bàn, đồng hồ, xin hòa, chịu thua),
  // sách khai cuộc của máy, gợi ý, đi lại, lưu ván để phân tích.
  // ---------- Đấu máy ----------
  const Play = {
    ctx: { pos: null, sel: -1, targets: [] }, moves: [], notes: [], startFen: XQ.START_FEN,
    user: Store.get('play_user', 1), level: Store.get('play_level', 3), warn: Store.get('play_warn', false),
    last: null, hint: null, thinking: false, over: null, gen: 0, rec: null,
    mode: Store.get('play_mode', 'ai'), orient: Store.get('play_orient', 'turn'), clockSet: Store.get('play_clock', '0'),
    clock: null, ask: null,
    pvp() { return this.mode === 'pvp'; },
    // Đồng hồ: "phút+giây cộng thêm mỗi nước", '0' là không tính giờ.
    CLOCKS: { '0': 'Không tính giờ', '3+2': '3 phút +2 giây/nước', '5+0': '5 phút', '10+0': '10 phút', '10+5': '10 phút +5 giây/nước', '15+10': '15 phút +10 giây/nước', '30+0': '30 phút' },
    init() {
      this.board = new Board($('#play-board'), sq => this.onSquare(sq));
      $('#play-ana').onclick = () => Ana.openCurrent();
      $('#play-new').onclick = () => this.newGame();
      $('#play-undo').onclick = () => this.undo();
      $('#play-hint').onclick = () => this.showHint();
      $('#play-flip').onclick = () => { this.board.setFlip(!this.board.flip); this.draw(); };
      $('#play-resign').onclick = () => this.askResign();
      $('#play-draw').onclick = () => this.askDraw();
      $('#play-ask-yes').onclick = () => { const a = this.ask; this.ask = null; if (a) a.yes(); this.draw(); };
      $('#play-ask-no').onclick = () => { this.ask = null; this.draw(); };
      $$('#play-mode .btn').forEach(b => b.onclick = () => this.setMode(b.dataset.m));
      const or = $('#play-orient'), ck = $('#play-clock');
      ck.innerHTML = Object.keys(this.CLOCKS).map(k => '<option value="' + k + '">' + this.CLOCKS[k] + '</option>').join('');
      or.value = this.orient; ck.value = this.clockSet;
      or.onchange = () => { this.orient = or.value; Store.set('play_orient', this.orient); this.applyOrient(); this.draw(); };
      ck.onchange = () => { this.clockSet = ck.value; Store.set('play_clock', this.clockSet); this.newGame(); };
      this.tick = setInterval(() => this.onTick(), 250);
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
      this.ask = null; this.clock = null;
      if (this.pvp() && this.clockSet !== '0') {
        const [mn, inc] = this.clockSet.split('+').map(Number);
        this.clock = { left: [mn * 60000, mn * 60000], inc: inc * 1000, at: 0 };
      }
      this.applyOrient();
      this.draw();
      if (!this.pvp() && this.ctx.pos.side !== this.user) this.engineMove();
    },
    setMode(m) {
      if (m === this.mode) return;
      this.mode = m; Store.set('play_mode', m); this.newGame();
    },
    // Hướng bàn khi hai người chơi: cố định (Đỏ ở dưới), lật theo lượt, hoặc đối mặt (đặt máy nằm giữa, quân Đen quay ngược).
    applyOrient() {
      const b = this.board;
      if (!this.pvp()) { b.face = false; b.setFlip(this.user === 1); return; }
      b.face = this.orient === 'face';
      const want = this.orient === 'turn' ? this.ctx.pos.side === 1 : false;
      if (b.flip !== want) b.setFlip(want);
    },
    // Trừ giờ bên đang đi; hết giờ thì thua.
    onTick() {
      const c = this.clock; if (!c || this.over || !c.at) return;
      const now = Date.now(), side = this.ctx.pos.side;
      c.left[side] -= now - c.at; c.at = now;
      if (c.left[side] <= 0) {
        c.left[side] = 0;
        this.over = (side === 0 ? 'Đỏ' : 'Đen') + ' hết giờ – ' + (side === 0 ? 'Đen' : 'Đỏ') + ' thắng.';
        this.finish();
      }
      this.drawClocks();
    },
    fmtClock(ms) { const t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60), sec = t % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; },
    drawClocks() {
      const c = this.clock, top = $('#play-clk-top'), bot = $('#play-clk-bot');
      if (!c) { top.hidden = bot.hidden = true; return; }
      top.hidden = bot.hidden = false;
      const topSide = this.board.flip ? 0 : 1, side = this.over ? -1 : this.ctx.pos.side;
      const one = (el, sd) => {
        el.textContent = (sd === 0 ? 'Đỏ ' : 'Đen ') + this.fmtClock(c.left[sd]);
        el.className = 'clk' + (sd === side && c.at ? ' on' : '') + (c.left[sd] < 20000 ? ' low' : '') + (el === top && this.board.face ? ' rot' : '');
      };
      one(top, topSide); one(bot, topSide ^ 1);
    },
    askDraw() {
      if (this.over || !this.pvp()) return;
      const s = this.ctx.pos.side, me = s === 0 ? 'Đỏ' : 'Đen', other = s === 0 ? 'Đen' : 'Đỏ';
      this.ask = { who: s ^ 1, text: me + ' xin hòa. ' + other + ' có đồng ý không?', yes: () => { this.over = 'Hòa – hai bên đồng ý.'; this.finish(); }, yesLabel: other + ' đồng ý hòa', noLabel: 'Không' };
      this.draw();
    },
    askResign() {
      if (this.over || !this.moves.length) return;
      const s = this.pvp() ? this.ctx.pos.side : this.user, me = s === 0 ? 'Đỏ' : 'Đen', other = s === 0 ? 'Đen' : 'Đỏ';
      this.ask = { who: s, text: (this.pvp() ? me + ' chịu thua?' : 'Bạn chịu thua ván này?'), yes: () => { this.gen++; this.thinking = false; this.over = me + ' chịu thua – ' + other + ' thắng.'; this.finish(); }, yesLabel: 'Chịu thua', noLabel: 'Đánh tiếp' };
      this.draw();
    },
    finish() {
      if (this.moves.length >= 4) { this.saveGame(); toast('Ván đã kết thúc. Bấm "Phân tích ván" để xem ' + (this.pvp() ? 'lại cả hai bên.' : 'bạn sai ở đâu.')); }
      this.draw();
    },
    onSquare(sq) {
      if (this.thinking || this.over || this.ask) return;
      const side = this.pvp() ? this.ctx.pos.side : this.user;
      if (this.ctx.pos.side !== side) return;
      this.hint = null;
      trySelect(this.ctx, sq, side, m => this.doMove(m, true));
      this.draw();
    },
    doMove(m, byUser) {
      const pos = this.ctx.pos;
      const before = { fen: this.startFen, moves: this.moves.slice() };
      const mover = pos.side;
      this.notes.push(pos.notation(m)); pos.make(m); this.moves.push(m);
      this.last = [m >> 7, m & 127]; this.hint = null; this.ask = null;
      const c = this.clock;
      if (c) { const now = Date.now(); if (c.at) { c.left[mover] -= now - c.at; c.left[mover] += c.inc; } c.at = now; }
      this.checkEnd();
      if (this.pvp()) this.applyOrient();
      this.draw();
      if (byUser && this.pvp()) { if (this.warn && !this.over) this.analyze(before, m); return; }
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
      if (this.over) this.finish();
    },
    // Lưu ván vào bộ nhớ máy (tối đa 20 ván gần nhất) để phân tích sau.
    saveGame() {
      if (this.moves.length < 4) return null;
      let g = this.rec;
      if (!g) {
        g = this.rec = this.pvp() ? { id: 'g' + Date.now(), t: Date.now(), user: 0, pvp: true, level: 0, startFen: this.startFen }
          : { id: 'g' + Date.now(), t: Date.now(), user: this.user, level: this.level, startFen: this.startFen };
        Ana.games.unshift(g); Ana.games = Ana.games.slice(0, 20);
      }
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
      this.gen++; this.ask = null;
      if (this.pvp()) { this.ctx.pos.unmake(); this.moves.pop(); this.notes.pop(); }
      else do { this.ctx.pos.unmake(); this.moves.pop(); this.notes.pop(); } while (this.moves.length && this.ctx.pos.side !== this.user);
      this.over = null; this.ctx.sel = -1; this.ctx.targets = [];
      const lm = this.moves[this.moves.length - 1]; this.last = lm ? [lm >> 7, lm & 127] : null; this.hint = null;
      if (this.clock) this.clock.at = this.moves.length ? Date.now() : 0;
      if (this.pvp()) { this.applyOrient(); this.draw(); return; }
      if (this.ctx.pos.side !== this.user) this.engineMove(); else this.draw();
    },
    showHint() {
      if (this.thinking || this.over || this.pvp() || this.ctx.pos.side !== this.user) return;
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
        st = this.pvp() ? 'Lượt <b>' + turn + '</b>' + (this.moves.length ? '' : ' (Đỏ đi trước)')
          : (this.thinking ? 'Máy đang nghĩ…' : (c.pos.side === this.user ? 'Đến lượt bạn (' + turn + ')' : 'Lượt máy (' + turn + ')'));
        if (c.pos.inCheck()) st += ' · <b class="chk-t">Chiếu tướng!</b>';
      }
      $('#play-status').innerHTML = st;
      $('#play-moves').innerHTML = this.notes.length ? moveListHtml(this.notes, 0, this.notes.length - 1, false) : '<span class="muted">Chưa có nước đi.</span>';
      const mv = $('#play-moves'); mv.scrollTop = mv.scrollHeight;
      $('#play-undo').disabled = this.thinking || !this.moves.length;
      $('#play-hint').disabled = this.thinking || !!this.over;
      $('#play-ana').disabled = this.moves.length < 4;
      const pvp = this.pvp();
      $('#play-title').textContent = pvp ? 'Hai người chơi' : 'Đấu với máy';
      $$('#play-mode .btn').forEach(b => b.classList.toggle('primary', b.dataset.m === this.mode));
      $('#play-hint').hidden = pvp; $('#play-draw').hidden = !pvp;
      $('#play-resign').disabled = !!this.over || !this.moves.length || this.thinking;
      $('#play-draw').disabled = !!this.over || !this.moves.length;
      $$('#play-set-ai').forEach(e => { e.hidden = pvp; }); $$('#play-set-pvp').forEach(e => { e.hidden = !pvp; });
      const ask = $('#play-ask'); ask.hidden = !this.ask;
      // Chơi đối mặt: câu hỏi dành cho người ngồi phía trên (Đen) thì quay ngược lại cho họ đọc.
      ask.classList.toggle('rot', !!(this.ask && pvp && this.board.face && this.ask.who === 1));
      if (this.ask) { $('#play-ask-text').textContent = this.ask.text; $('#play-ask-yes').textContent = this.ask.yesLabel; $('#play-ask-no').textContent = this.ask.noLabel; }
      this.drawClocks();
    }
  };

