  // 40-play.js — Tab Đấu máy: ván với máy, hoặc hai người ngồi đối mặt trên một máy (Đỏ phía dưới, Đen phía trên;
  // chọn thời gian trước khi vào ván, mỗi người một thanh điều khiển và menu ☰ ở phía mình: xin hòa / xin đi lại /
  // chịu thua); sách khai cuộc của máy; lưu ván để phân tích.
  // ---------- Đấu máy ----------
  const MIN_PLIES = 10; // ván phải có ít nhất 5 nước mỗi bên mới được lưu và phân tích
  const SIDE = ['Đỏ', 'Đen'];
  const Play = {
    ctx: { pos: null, sel: -1, targets: [] }, moves: [], notes: [], startFen: XQ.START_FEN,
    user: Store.get('play_user', 1), level: Store.get('play_level', 3), warn: Store.get('play_warn', false),
    last: null, hint: null, thinking: false, over: null, gen: 0, rec: null,
    mode: Store.get('play_mode', 'ai'), clockSet: Store.get('play_clock', '0'),
    clock: null, ask: null, menuFrom: null, setup: false,
    pvp() { return this.mode === 'pvp'; },
    net() { return this.mode === 'net'; },
    human() { return this.mode !== 'ai'; },  // không có máy đi (hai người hoặc qua mạng)
    netView: 'home',
    // Đang giữa ván (dùng để thu gọn thanh điều hướng, tránh bấm nhầm)
    // Đấu máy: tính là "đang đánh" từ khi người chơi đã đi ít nhất một nước (nước mở đầu của máy chưa tính).
    active() { return this.human() ? !this.setup && !this.over : !this.over && this.moves.some((m, i) => i % 2 === this.user); },
    // Đồng hồ: "phút+giây cộng thêm mỗi nước", '0' là không tính giờ.
    CLOCKS: { '0': ['Không tính giờ', ''], '3+2': ['3 phút', '+2 giây mỗi nước'], '5+0': ['5 phút', ''], '10+0': ['10 phút', ''], '10+5': ['10 phút', '+5 giây mỗi nước'], '15+10': ['15 phút', '+10 giây mỗi nước'], '30+0': ['30 phút', ''] },
    init() {
      this.board = new Board($('#play-board'), sq => this.onSquare(sq));
      $('#play-result-ana').onclick = () => Ana.openCurrent();
      $('#play-result-new').onclick = () => (this.net() ? this.netRematch() : this.pvp() ? this.showSetup() : this.newGame());
      $('#play-result-mode').onclick = () => (this.net() ? this.netLeave() : this.setMode(this.pvp() ? 'ai' : 'pvp'));
      // Menu "Tùy chọn ván" khi đấu với máy: làm xong việc thì đóng menu để thấy bàn cờ.
      $('#am-close').onclick = () => this.closeMenu();
      $('#am-back').onclick = e => { if (e.target === $('#am-back')) this.closeMenu(); };
      $('#play-new').onclick = () => { this.closeMenu(); this.newGame(); };
      $('#play-undo').onclick = () => { this.closeMenu(); this.undo(); };
      $('#play-hint').onclick = () => { this.closeMenu(); this.showHint(); };
      $('#play-flip').onclick = () => { this.closeMenu(); this.board.setFlip(!this.board.flip); this.draw(); };
      $('#play-resign').onclick = () => this.askResign(this.user);
      $('#am-pvp').onclick = () => { this.closeMenu(); this.setMode('pvp'); };
      $('#play-ask-yes').onclick = () => { const a = this.ask; this.ask = null; if (a) a.yes(); this.draw(); };
      $('#play-ask-no').onclick = () => { const a = this.ask; this.ask = null; if (a && a.no) a.no(); this.draw(); };
      // Chơi qua mạng
      $('#net-go-create').onclick = () => { this.netView = 'create'; Net.err = ''; this.draw(); };
      $('#net-create-back').onclick = () => { this.netView = 'home'; this.draw(); };
      $('#net-cancel').onclick = () => this.setMode('ai');
      $('#net-side').value = Store.get('net_side', 'r');
      $('#net-side').onchange = e => Store.set('net_side', e.target.value);
      $('#net-times').innerHTML = Object.keys(this.CLOCKS).map(k => '<button class="btn" data-k="' + k + '">' + this.CLOCKS[k][0] + (this.CLOCKS[k][1] ? '<small>' + this.CLOCKS[k][1] + '</small>' : '') + '</button>').join('');
      $$('#net-times .btn').forEach(b => b.onclick = () => { Store.set('play_clock', b.dataset.k); this.netView = 'home'; Net.create($('#net-side').value, b.dataset.k); });
      $('#net-join').onclick = () => Net.join($('#net-code').value);
      $('#net-code').onkeydown = e => { if (e.key === 'Enter') Net.join($('#net-code').value); };
      $('#net-wait-cancel').onclick = () => { Net.leave(true); this.draw(); };
      $('#net-banner-leave').onclick = () => this.netLeave();
      $('#net-share').onclick = () => this.netShare();
      $('#net-copy').onclick = () => this.netCopy(Net.code);
      $$('#play-mode .btn').forEach(b => b.onclick = () => this.setMode(b.dataset.m));
      // Thanh điều khiển của từng người (trên/dưới bàn cờ)
      for (const pos of ['top', 'bot']) $('#pbar-' + pos + ' [data-act="menu"]').onclick = () => this.openMenu(pos);
      // Các việc của một bên (xin đi lại, xin hòa, chịu thua) nằm trong menu, tính cho bên đã mở menu.
      $$('#pm [data-act]').forEach(b => b.onclick = () => {
        const side = this.barSide(this.menuFrom || 'bot'), act = b.dataset.act;
        if (act === 'undo') this.askUndo(side);
        else if (act === 'draw') this.askDraw(side);
        else if (act === 'resign') this.askResign(side);
      });
      // Menu ☰
      $('#pm-close').onclick = () => this.closeMenu();
      $('#pm-back').onclick = e => { if (e.target === $('#pm-back')) this.closeMenu(); };
      const sd = $('#play-side'), lv = $('#play-level'), wr = $('#play-warn'), pw = $('#pm-warn'), op = $('#play-open');
      op.value = Store.get('play_open', ''); op.onchange = () => { Store.set('play_open', op.value); };
      sd.value = String(this.user);
      lv.innerHTML = Object.keys(LEVELS).map(k => '<option value="' + k + '">' + LEVELS[k].name + '</option>').join('');
      lv.value = String(this.level); wr.checked = pw.checked = !!this.warn;
      sd.onchange = () => { this.user = +sd.value; Store.set('play_user', this.user); if (!this.moves.length) this.newGame(); };
      lv.onchange = () => { this.level = +lv.value; Store.set('play_level', this.level); };
      wr.onchange = pw.onchange = e => { this.warn = e.target.checked; wr.checked = pw.checked = this.warn; Store.set('play_warn', this.warn); };
      // Màn chọn thời gian cho ván hai người
      $('#pvp-times').innerHTML = Object.keys(this.CLOCKS).map(k => '<button class="btn" data-k="' + k + '">' + this.CLOCKS[k][0] + (this.CLOCKS[k][1] ? '<small>' + this.CLOCKS[k][1] + '</small>' : '') + '</button>').join('');
      $$('#pvp-times .btn').forEach(b => b.onclick = () => this.startPvp(b.dataset.k));
      $('#pvp-setup-cancel').onclick = () => this.setMode('ai');
      this.tick = setInterval(() => this.onTick(), 250);
      this.newGame();
      if (this.pvp()) this.showSetup();
      if (this.net()) { this.setup = true; Net.resumeSaved(); this.draw(); }
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
      if (this.mode === 'ai' && this.ctx.pos.side !== this.user) this.engineMove();
    },
    // Hai người: hiện màn chọn thời gian; chọn xong thì vào ván ngay.
    showSetup() {
      this.setup = true; this.ask = null; this.closeMenu();
      $('#pvp-setup-cancel').textContent = 'Quay lại Đấu với máy';
      $$('#pvp-times .btn').forEach(b => b.classList.toggle('primary', b.dataset.k === this.clockSet));
      this.draw();
    },
    startPvp(k) {
      this.clockSet = k; Store.set('play_clock', k);
      this.setup = false;
      this.newGame();
      if (this.clock) this.clock.at = Date.now(); // đồng hồ chạy ngay khi vào ván
      this.draw();
    },
    setMode(m) {
      if (m === this.mode) { if (m === 'pvp' && !this.setup) this.showSetup(); return; }
      if (this.net()) Net.leave();
      this.saveGame();
      this.mode = m; Store.set('play_mode', m);
      if (m === 'pvp') { this.newGame(); this.showSetup(); }
      else if (m === 'net') { this.newGame(); this.setup = true; this.netView = 'home'; Net.err = ''; this.closeMenu(); this.draw(); }
      else { this.setup = false; this.newGame(); }
    },
    // ---- Chơi qua mạng: các hàm Net gọi vào
    netSide() { return Net.mySide; },
    netStart(mySide, clockSet) {
      this.saveGame(); this.rec = null;
      this.setup = false; this.closeMenu();
      this.gen++;
      this.ctx = { pos: XQ.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.last = null; this.hint = null; this.over = null; this.thinking = false; this.ask = null;
      this.clock = null;
      if (clockSet && clockSet !== '0') { const [mn, inc] = clockSet.split('+').map(Number); this.clock = { left: [mn * 60000, mn * 60000], inc: inc * 1000, at: Date.now() }; }
      this.applyOrient(); this.draw();
    },
    // Dựng lại ván từ danh sách nước (khi nối lại hoặc mở lại app)
    netLoad(list, left, over, running) {
      this.setup = false; this.gen++;
      this.ctx = { pos: XQ.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.ask = null; this.hint = null; this.thinking = false;
      for (const u of list || []) {
        const m = this.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) break;
        this.notes.push(this.ctx.pos.notation(m)); this.ctx.pos.make(m); this.moves.push(m);
      }
      const lm = this.moves[this.moves.length - 1]; this.last = lm ? [lm >> 7, lm & 127] : null;
      if (Net.clockSet && Net.clockSet !== '0') {
        const [mn, inc] = Net.clockSet.split('+').map(Number);
        this.clock = { left: left ? left.slice() : [mn * 60000, mn * 60000], inc: inc * 1000, at: running && !over ? Date.now() : 0 };
      } else this.clock = null;
      this.over = over || null;
      this.applyOrient(); this.draw();
    },
    // Nước của đối thủ tới qua mạng. n là số thứ tự nước (0 = nước đầu).
    netApplyMove(n, u, left) {
      if (n < this.moves.length) return 'dup';
      if (n > this.moves.length || this.over) return 'gap';
      const m = this.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === u);
      if (m === undefined || this.ctx.pos.side === Net.mySide) return 'gap';
      const mover = this.ctx.pos.side, before = this.clock ? this.clock.left.slice() : null;
      this.doMove(m, false);
      if (this.clock && left && left.length === 2) {
        // Lấy giờ đối thủ báo về (chính xác hơn khi mạng trễ), nhưng không cho vượt quá giờ máy mình tự tính,
        // và giữ nguyên giờ của mình theo máy mình.
        const c = this.clock, mine = mover ^ 1;
        c.left[mover] = Math.min(+left[mover] || 0, c.left[mover] + 1500);
        c.left[mine] = before ? before[mine] : c.left[mine];
        c.at = this.over ? 0 : Date.now();
      }
      if (Net.waitAsk === 'undo') Net.waitAsk = '';
      this.draw();
      return 'ok';
    },
    netAsk(k) {
      const me = Net.mySide, op = me ^ 1;
      if (k === 'draw') this.setAsk(me, 'Đối thủ xin hòa. Bạn có đồng ý không?', 'Đồng ý hòa', 'Không', () => { Net.answer(k, true); this.over = 'Hòa – hai bên đồng ý.'; this.finish(); Net.save(); }, () => Net.answer(k, false));
      else if (k === 'undo') this.setAsk(me, 'Đối thủ xin đi lại nước vừa rồi. Bạn có đồng ý không?', 'Cho đi lại', 'Không', () => { Net.answer(k, true); this.undoFor(op); Net.save(); }, () => Net.answer(k, false));
      else if (k === 'rematch') this.setAsk(me, 'Đối thủ muốn đấu lại (đổi màu quân). Bạn có đồng ý không?', 'Đấu lại', 'Không', () => { Net.answer(k, true); if (Net.role === 'host') Net.rematch(); }, () => Net.answer(k, false));
    },
    netAnswer(k, y) {
      const name = { draw: 'xin hòa', undo: 'xin đi lại', rematch: 'đấu lại' }[k] || '';
      if (!y) { toast('Đối thủ không đồng ý ' + name + '.'); this.draw(); return; }
      if (k === 'draw') { this.over = 'Hòa – hai bên đồng ý.'; this.finish(); }
      else if (k === 'undo') this.undoFor(Net.mySide);
      else if (k === 'rematch' && Net.role === 'host') Net.rematch();
      this.draw();
    },
    netOver(text) { if (this.over) return; this.over = text; if (this.clock) this.clock.at = 0; this.finish(); },
    netRematch() {
      if (!Net.connected()) { toast('Đối thủ đã rời phòng hoặc mất kết nối.', 'warn'); return; }
      Net.ask('rematch'); toast('Đã gửi lời mời đấu lại, chờ đối thủ…');
    },
    netLeave() { Net.leave(); this.newGame(); this.setup = true; this.netView = 'home'; this.draw(); },
    netShare() {
      const url = Net.joinLink(), text = 'Vào chơi cờ tướng với mình nhé! Mã phòng: ' + Net.code;
      if (navigator.share) navigator.share({ title: 'Cờ Tướng Luyện Tập', text, url }).catch(() => { /* người dùng huỷ */ });
      else this.netCopy(url);
    },
    netCopy(s) {
      const ok = () => toast('Đã sao chép: ' + s, 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, () => toast(s));
      else toast(s);
    },
    // Hai người luôn ngồi đối mặt: Đỏ ở dưới, quân Đen quay về phía người cầm Đen.
    applyOrient() {
      const b = this.board;
      if (this.net()) { b.face = false; const f = Net.mySide === 1; if (b.flip !== f) b.setFlip(f); return; }
      if (!this.pvp()) { b.face = false; b.setFlip(this.user === 1); return; }
      b.face = true;
      if (b.flip) b.setFlip(false);
    },
    barSide(pos) { const top = this.board.flip ? 0 : 1; return pos === 'top' ? top : top ^ 1; },
    sidePos(side) { return this.barSide('top') === side ? 'top' : 'bot'; },
    openMenu(from) {
      if (this.mode === 'ai') { this.menuFrom = from; $('#am-back').hidden = false; this.draw(); return; }
      this.menuFrom = from;
      const rot = this.board.face && from === 'top';
      $('#pm-back').hidden = false; $('#pm-back').classList.toggle('top', rot); $('#pm').classList.toggle('rot', rot);
      this.draw(); this.drawMenu();
    },
    closeMenu() { $('#pm-back').hidden = true; $('#am-back').hidden = true; this.menuFrom = null; },
    drawMenu() {
      if (!this.menuFrom) return;
      const side = this.barSide(this.menuFrom), busy = !!this.over || !!this.ask || (this.net() && (!Net.connected() || !!Net.waitAsk));
      $('#pm-title').textContent = this.net() ? 'Menu' : 'Menu · bên ' + SIDE[side];
      $('#pm-netinfo').hidden = !this.net();
      if (this.net()) $('#pm-netinfo').textContent = 'Phòng ' + Net.code + (Net.connected() ? ' · đang kết nối với đối thủ' : ' · mất kết nối') + (Net.waitAsk ? ' · đang chờ đối thủ trả lời' : '');
      $('#pm [data-act="undo"]').disabled = busy || !this.moves.some((m, i) => i % 2 === side);
      $('#pm [data-act="draw"]').disabled = busy || !this.moves.length;
      $('#pm [data-act="resign"]').disabled = busy || !this.moves.length;
    },
    // Trừ giờ bên đang đi; hết giờ thì thua.
    onTick() {
      const c = this.clock; if (!c || this.over || !c.at) return;
      const now = Date.now(), side = this.ctx.pos.side;
      c.left[side] -= now - c.at; c.at = now;
      if (this.net()) {
        // Mỗi máy tự báo hết giờ cho phía mình; phía đối thủ chờ thêm 5 giây (phòng trễ mạng) rồi mới xử thua.
        if ((side === Net.mySide && c.left[side] <= 0) || (side !== Net.mySide && c.left[side] <= -5000)) {
          this.netOver(SIDE[side] + ' hết giờ – ' + SIDE[side ^ 1] + ' thắng.');
          Net.sendMsg({ t: 'flag', s: side }); Net.save();
        }
        this.drawBars(); return;
      }
      if (c.left[side] <= 0) {
        c.left[side] = 0;
        this.over = SIDE[side] + ' hết giờ – ' + SIDE[side ^ 1] + ' thắng.';
        this.finish();
      }
      this.drawBars();
    },
    fmtClock(ms) { const t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60), sec = t % 60; return m + ':' + (sec < 10 ? '0' : '') + sec; },
    // Hỏi bên kia (hoặc chính bên đó, khi chịu thua). Câu hỏi hiện ở phía người phải trả lời.
    setAsk(who, text, yesLabel, noLabel, yes, no) { this.ask = { who, text, yesLabel, noLabel, yes, no }; this.closeMenu(); this.draw(); },
    askDraw(side) {
      if (this.net()) { if (!this.over && this.moves.length) { this.closeMenu(); Net.ask('draw'); toast('Đã gửi lời xin hòa, chờ đối thủ trả lời…'); } return; }
      if (this.over || !this.pvp() || !this.moves.length) return;
      this.setAsk(side ^ 1, SIDE[side] + ' xin hòa. ' + SIDE[side ^ 1] + ' có đồng ý không?', SIDE[side ^ 1] + ' đồng ý hòa', 'Không', () => { this.over = 'Hòa – hai bên đồng ý.'; this.finish(); });
    },
    askUndo(side) {
      if (this.net()) { if (!this.over && this.moves.some((m, i) => i % 2 === Net.mySide)) { this.closeMenu(); Net.ask('undo'); toast('Đã gửi lời xin đi lại, chờ đối thủ trả lời…'); } return; }
      if (this.over || !this.pvp() || !this.moves.some((m, i) => i % 2 === side)) return;
      this.setAsk(side ^ 1, SIDE[side] + ' xin đi lại nước vừa rồi. ' + SIDE[side ^ 1] + ' có đồng ý không?', 'Cho đi lại', 'Không', () => this.undoFor(side));
    },
    askResign(side) {
      if (this.over || !this.moves.length || this.thinking) return;
      if (this.net()) side = Net.mySide;
      const text = this.pvp() ? SIDE[side] + ' chịu thua?' : 'Bạn chịu thua ván này?';
      this.setAsk(side, text, 'Chịu thua', 'Đánh tiếp', () => {
        this.gen++; this.thinking = false; this.over = SIDE[side] + ' chịu thua – ' + SIDE[side ^ 1] + ' thắng.';
        if (this.net()) { if (this.clock) this.clock.at = 0; Net.sendMsg({ t: 'resign' }); }
        this.finish(); if (this.net()) Net.save();
      });
    },
    finish() {
      this.closeMenu();
      if (this.moves.length >= MIN_PLIES) this.saveGame();
      this.draw();
    },
    onSquare(sq) {
      if (this.thinking || this.over || this.ask || (this.human() && this.setup)) return;
      if (this.net() && !Net.connected()) { toast('Đang mất kết nối với đối thủ, chờ nối lại…', 'warn'); return; }
      const side = this.pvp() ? this.ctx.pos.side : this.net() ? Net.mySide : this.user;
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
      if (byUser && this.net()) { Net.sendMove(this.moves.length - 1, XQ.mvStr(m), c ? c.left.slice() : null); if (this.warn && !this.over) this.analyze(before, m); return; }
      if (!byUser && this.net()) return;
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
        this.over = SIDE[winner] + ' thắng' + (pos.inCheck() ? ' – chiếu bí.' : ' – đối phương hết nước đi.');
      } else if (pos.repCount() >= 3) this.over = 'Hòa do lặp lại thế cờ ba lần.';
      else if (this.moves.length >= 300) this.over = 'Hòa (quá dài).';
      if (this.over) this.finish();
    },
    // Lưu ván vào bộ nhớ máy (tối đa 20 ván gần nhất) để phân tích sau.
    saveGame() {
      if (this.moves.length < MIN_PLIES) return null;
      let g = this.rec;
      if (!g) {
        g = this.rec = this.pvp() ? { id: 'g' + Date.now(), t: Date.now(), user: 0, pvp: true, level: 0, startFen: this.startFen }
          : this.net() ? { id: 'g' + Date.now(), t: Date.now(), user: Net.mySide, net: true, level: 0, startFen: this.startFen }
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
    // Đi lại khi đấu với máy: lùi về lượt của người chơi.
    undo() {
      if (this.thinking || !this.moves.length) return;
      this.gen++; this.ask = null;
      do { this.ctx.pos.unmake(); this.moves.pop(); this.notes.pop(); } while (this.moves.length && this.ctx.pos.side !== this.user);
      this.afterUndo();
      if (this.ctx.pos.side !== this.user) this.engineMove(); else this.draw();
    },
    // Đi lại khi hai người chơi: bỏ các nước cho tới khi gỡ được nước gần nhất của bên xin đi lại.
    undoFor(side) {
      let n = 0;
      while (this.moves.length) {
        const by = (this.moves.length - 1) % 2; // nước cuối do bên nào đi (Đỏ đi trước)
        this.ctx.pos.unmake(); this.moves.pop(); this.notes.pop(); n++;
        if (by === side) break;
      }
      this.gen++; this.afterUndo(); this.applyOrient(); this.draw();
      return n;
    },
    afterUndo() {
      this.over = null; this.ctx.sel = -1; this.ctx.targets = [];
      const lm = this.moves[this.moves.length - 1]; this.last = lm ? [lm >> 7, lm & 127] : null; this.hint = null;
      if (this.clock) this.clock.at = this.moves.length ? Date.now() : 0;
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
    drawBars() {
      const pvp = this.pvp(), net = this.net(), ai = this.mode === 'ai';
      for (const pos of ['top', 'bot']) {
        const bar = $('#pbar-' + pos); bar.hidden = this.human() && this.setup; if (bar.hidden) continue;
        const side = this.barSide(pos), pz = this.ctx.pos, c = this.clock, myTurn = !this.over && pz.side === side;
        const isUser = ai && side === this.user, isEngine = ai && side !== this.user;
        const isMe = net && side === Net.mySide, isOpp = net && side !== Net.mySide;
        let st = '';
        if (this.over) st = /Hòa/.test(this.over) ? 'Hòa' : (this.over.indexOf(SIDE[side] + ' thắng') >= 0 || this.over.indexOf(SIDE[side ^ 1] + ' chịu thua') >= 0 || this.over.indexOf(SIDE[side ^ 1] + ' hết giờ') >= 0 ? 'Thắng' : 'Thua');
        else if (isOpp && Net.state === 'lost') st = 'Mất kết nối…';
        else if (isMe && Net.waitAsk) st = 'Chờ đối thủ trả lời…';
        else if (isEngine) st = this.thinking ? 'Đang nghĩ…' : (myTurn ? 'Sắp đi' : 'Chờ bạn');
        else if (myTurn) st = pz.inCheck() ? 'Bị chiếu!' : (isUser || isMe ? 'Đến lượt bạn' : isOpp ? 'Đang nghĩ…' : 'Đến lượt');
        else st = 'Chờ đối thủ';
        bar.querySelector('.pname').textContent = pvp ? SIDE[side] : net ? (isMe ? 'Bạn · ' : 'Đối thủ · ') + SIDE[side] : (isUser ? 'Bạn · ' + SIDE[side] : 'Máy · ' + SIDE[side] + ' · ' + LEVELS[this.level].name.split(' – ')[1].split(' (')[0]);
        const pst = bar.querySelector('.pst'); pst.textContent = st; pst.classList.toggle('chk', st === 'Bị chiếu!');
        bar.querySelector('.pclk').textContent = c ? this.fmtClock(c.left[side]) : '';
        bar.querySelector('[data-act="menu"]').hidden = isEngine || isOpp;
        bar.classList.toggle('on', myTurn);
        bar.classList.toggle('low', !!(c && c.left[side] < 20000));
        bar.classList.toggle('rot', this.board.face && pos === 'top');
      }
    },
    draw() {
      const c = this.ctx, pvp = this.pvp(), net = this.net(), human = this.human(), active = this.active();
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      const ml = this.notes.length ? moveListHtml(this.notes, 0, this.notes.length - 1, false) : '<span class="muted">Chưa có nước đi.</span>';
      const mv = $(human ? '#pm-moves' : '#play-moves'); mv.innerHTML = ml; mv.scrollTop = mv.scrollHeight;
      // Menu "Tùy chọn ván": giữa ván không có Ván mới / đổi chế độ, tránh bấm nhầm.
      $('#play-undo').disabled = this.thinking || !this.moves.length || !!this.over;
      $('#play-hint').disabled = this.thinking || !!this.over || c.pos.side !== this.user;
      $('#play-resign').hidden = !active; $('#play-resign').disabled = this.thinking;
      $('#am-new').hidden = active; $('#am-note').hidden = !active;
      $('#play-title').textContent = net ? 'Chơi qua mạng' : pvp ? 'Hai người chơi' : 'Đấu với máy';
      $$('#play-mode .btn').forEach(b => b.classList.toggle('primary', b.dataset.m === this.mode));
      $('#play-mode').hidden = human || active;
      $('#pvp-setup').hidden = !(pvp && this.setup);
      this.drawNet();
      // Câu hỏi (xin hòa, xin đi lại, chịu thua) hiện ở phía người phải trả lời; khi đối mặt, phía trên quay ngược.
      const ask = $('#play-ask'); ask.hidden = !this.ask;
      if (this.ask) {
        const where = human ? this.sidePos(this.ask.who) : 'bot';
        $('#ask-' + where).appendChild(ask);
        ask.classList.toggle('rot', pvp && this.board.face && where === 'top');
        $('#play-ask-text').textContent = this.ask.text; $('#play-ask-yes').textContent = this.ask.yesLabel; $('#play-ask-no').textContent = this.ask.noLabel;
      }
      // Thẻ kết quả khi ván xong (cả hai chế độ): phân tích, ván mới, đổi chế độ
      const res = $('#play-result'); res.hidden = !(this.over && !(human && this.setup));
      if (!res.hidden) {
        $('#play-result-text').textContent = this.over;
        const ok = this.moves.length >= MIN_PLIES;
        $('#play-result-ana').hidden = !ok;
        $('#play-result-mode').textContent = net ? 'Rời phòng' : pvp ? 'Đấu với máy' : 'Hai người chơi';
        $('#play-result-new').textContent = net ? 'Đấu lại' : 'Ván mới';
        $('#play-result-new').disabled = net && (!Net.connected() || !!Net.waitAsk);
        $('#play-result-note').textContent = ok ? '' : 'Ván có dưới 5 nước mỗi bên nên không lưu để phân tích.';
      }
      this.drawBars();
      Nav.update();  // đổi bố cục ngay khi trạng thái ván đổi (không chờ vòng kiểm tra định kỳ), tránh bấm trượt
    },
    // Màn tạo / vào phòng và dải báo mất kết nối
    drawNet() {
      const net = this.net(), st = Net.state;
      const setupShown = net && this.setup;
      $('#net-setup').hidden = !setupShown;
      const banner = $('#net-banner'); banner.hidden = !(net && !this.setup && st === 'lost');
      if (!banner.hidden) $('#net-banner-text').textContent = Net.msgText || 'Mất kết nối, đang nối lại…';
      if (!setupShown) return;
      const waiting = st === 'opening' || st === 'waiting' || st === 'joining';
      $('#net-home').hidden = waiting || this.netView !== 'home';
      $('#net-create').hidden = waiting || this.netView !== 'create';
      $('#net-wait').hidden = !waiting;
      $('#net-err').hidden = !(st === 'error' && Net.err); $('#net-err').textContent = Net.err || '';
      $$('#net-times .btn').forEach(b => b.classList.toggle('primary', b.dataset.k === Store.get('play_clock', '0')));
      if (waiting) {
        const host = Net.role === 'host';
        $('#net-wait-title').textContent = host ? 'Mã phòng của bạn – gửi cho đối thủ:' : 'Đang vào phòng';
        $('#net-code-show').textContent = Net.code || '······';
        $('#net-share-row').hidden = !(host && st === 'waiting');
        $('#net-status').textContent = Net.msgText;
        $('#net-wait-cancel').textContent = host ? 'Huỷ phòng' : 'Huỷ';
      }
    }
  };
