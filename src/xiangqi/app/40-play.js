  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng. Có bản song sinh bên cờ vua: src/chess/app/40-play.js (giống ~89%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 40-play.js — Tab Trang chủ: chọn cách chơi rồi vào ván. Ba màn hình nối tiếp, không bao giờ chồng lên nhau:
  //   'home'  : trang chủ (chọn Đấu với máy / Hai người một máy / Chơi qua mạng; tiếp tục ván đang dở; lối tắt luyện tập)
  //   'setup' : chọn bên, cấp độ, thời gian, tạo/vào phòng… (không có bàn cờ)
  //   'game'  : chỉ bàn cờ và thanh của hai bên; mọi việc khác nằm trong menu ☰
  // Hai người ngồi đối mặt (Đỏ dưới, Đen trên), mỗi người một menu ở phía mình; lưu ván để phân tích.
  // Tệp này giữ phần chung của mọi chế độ: trạng thái ván, nước đi, đồng hồ, lời xin (hòa, đi lại, chịu thua), luật kết thúc,
  // vẽ bàn cờ. Phần riêng: 41-play-ai.js (đấu với máy), 42-play-net.js (giao diện chơi qua mạng; kết nối ở 45-net.js).
  const MIN_PLIES = 10; // ván phải có ít nhất 5 nước mỗi bên mới được lưu và phân tích
  const SIDE = ['Đỏ', 'Đen'];
  const PERPETUAL_MAX = 4;  // số nước chiếu (đuổi) liên tiếp tối đa được làm thế cờ lặp lại; nước thứ 5 bị chặn
  const Play = {
    ctx: { pos: null, sel: -1, targets: [] }, moves: [], notes: [], startFen: XQ.START_FEN,
    user: Store.get('play_user', 1), level: Store.get('play_level', 3), warn: Store.get('play_warn', false),
    last: null, hint: null, thinking: false, over: null, gen: 0, rec: null,
    mode: Store.get('play_mode', 'ai'), clockSet: Store.get('play_clock', '0'),
    clock: null, ask: null, menuFrom: null,
    screen: 'home', started: false, paused: false,
    aiSide: Store.get('ai_side', String(Store.get('play_user', 1))),
    // "setup" = đang ở màn chuẩn bị (giữ tên cũ vì phần chơi qua mạng dùng)
    get setup() { return this.screen === 'setup'; },
    set setup(v) { this.screen = v ? 'setup' : 'game'; },
    pvp() { return this.mode === 'pvp'; },
    net() { return this.mode === 'net'; },
    human() { return this.mode !== 'ai'; },  // không có máy đi (hai người hoặc qua mạng)
    watching() { return this.mode === 'net' && Net.role === 'watch'; },  // đang xem trận của người khác
    netView: 'home',
    // Đang giữa ván (dùng để thu gọn thanh điều hướng, tránh bấm nhầm)
    // Đấu máy: tính là "đang đánh" từ khi người chơi đã đi ít nhất một nước (nước mở đầu của máy chưa tính).
    active() { return this.screen === 'game' && !this.over; },
    // Có ván (hoặc phòng) đang dở để hiện "Tiếp tục" ở trang chủ
    hasGame() {
      if (this.net()) return ['opening', 'waiting', 'joining', 'playing', 'lost', 'ended', 'watching'].includes(Net.state);
      return this.started && !this.over;
    },
    // Đồng hồ: "phút+giây cộng thêm mỗi nước", '0' là không tính giờ.
    CLOCKS: { '0': ['Không tính giờ', ''], '3+2': ['3 phút', '+2 giây mỗi nước'], '5+0': ['5 phút', ''], '10+0': ['10 phút', ''], '10+5': ['10 phút', '+5 giây mỗi nước'], '15+10': ['15 phút', '+10 giây mỗi nước'], '30+0': ['30 phút', ''] },
    init() {
      this.board = new Board($('#play-board'), sq => this.onSquare(sq));
      $('#play-result-ana').onclick = () => Ana.openCurrent();
      $('#play-result-new').onclick = () => (this.net() ? this.netRematch() : this.pvp() ? this.showSetup() : this.showAiSetup());
      $('#play-result-mode').onclick = () => { if (this.net()) { this.netLeave(); return; } this.started = false; this.goHome(); };
      // Menu "Tùy chọn ván" khi đấu với máy: làm xong việc thì đóng menu để thấy bàn cờ.
      $('#am-close').onclick = () => this.closeMenu();
      $('#am-back').onclick = e => { if (e.target === $('#am-back')) this.closeMenu(); };
      $('#play-undo').onclick = () => { this.closeMenu(); this.undo(); };
      $('#play-hint').onclick = () => { this.closeMenu(); this.showHint(); };
      $('#play-flip').onclick = () => { this.closeMenu(); this.board.setFlip(!this.board.flip); this.draw(); };
      $('#play-resign').onclick = () => this.askResign(this.user);
      $('#am-home').onclick = $('#pm-home').onclick = () => this.goHome();
      // Trang chủ
      $$('#play-mode .mode').forEach(b => b.onclick = () => this.pickMode(b.dataset.m));
      $$('#play-home .drill').forEach(b => b.onclick = () => showTab(b.dataset.go));
      $('#home-resume-go').onclick = () => this.resume();
      $('#home-resume-drop').onclick = () => this.dropGame();
      $('#play-back').onclick = () => this.goHome();
      this.initAi();
      this.initNet();
      $('#play-ask-yes').onclick = () => { const a = this.ask; this.ask = null; if (a) a.yes(); this.draw(); };
      $('#play-ask-no').onclick = () => { const a = this.ask; this.ask = null; if (a && a.no) a.no(); this.draw(); };
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
      // Màn chọn thời gian cho ván hai người
      $('#pvp-times').innerHTML = Object.keys(this.CLOCKS).map(k => '<button class="btn" data-k="' + k + '">' + this.CLOCKS[k][0] + (this.CLOCKS[k][1] ? '<small>' + this.CLOCKS[k][1] + '</small>' : '') + '</button>').join('');
      $$('#pvp-times .btn').forEach(b => b.onclick = () => this.startPvp(b.dataset.k));
      this.tick = setInterval(() => this.onTick(), 250);
      this.screen = 'home';
      this.newGame();
      if (this.net()) { this.netView = 'home'; Net.resumeSaved(); this.draw(); }  // mở lại app giữa ván qua mạng: vào lại ván
    },
    // ---- Trang chủ
    goHome() {
      this.closeMenu();
      // Hai người: dừng đồng hồ khi rời bàn cờ, chạy lại khi quay vào
      const c = this.clock;
      if (this.pvp() && c && c.at && !this.over) { this.onTick(); c.at = 0; this.paused = true; }
      this.screen = 'home'; this.draw(); window.scrollTo(0, 0);
    },
    resume() {
      if (this.net()) {
        const st = Net.state;
        this.screen = (st === 'opening' || st === 'waiting' || st === 'joining') ? 'setup' : 'game';
      } else this.screen = 'game';
      if (this.paused && this.clock) { this.clock.at = Date.now(); this.paused = false; }
      this.draw(); window.scrollTo(0, 0);
    },
    dropGame() {
      if (this.net()) { this.netLeave(); return; }
      this.saveGame(); this.started = false; this.paused = false;
      this.newGame();
    },
    pickMode(m) {
      if (this.hasGame()) {
        toast('Bạn đang có ' + (this.net() ? 'phòng' : 'ván') + ' dở: bấm "Tiếp tục" hoặc "Bỏ ván" ở trên trước.', 'warn');
        const r = $('#home-resume'); r.classList.remove('pulse'); void r.offsetWidth; r.classList.add('pulse');
        return;
      }
      this.setMode(m);
    },
    drawHome() {
      const has = this.hasGame(), r = $('#home-resume');
      r.hidden = !has; if (!has) return;
      let t = '', sub = '';
      const n = Math.ceil(this.moves.length / 2), clk = this.clock ? ' · ' + this.CLOCKS[this.net() ? Net.clockSet || '0' : this.clockSet][0] : '';
      if (this.net()) {
        const st = Net.state;
        if (st === 'opening' || st === 'waiting') { t = 'Phòng ' + (Net.code || '') + ' đang chờ đối thủ'; sub = 'Bấm Tiếp tục để xem mã phòng và gửi link mời.'; }
        else if (st === 'joining') { t = 'Đang vào phòng ' + Net.code; sub = Net.msgText || ''; }
        else if (st === 'watching') { t = 'Đang xem phòng ' + Net.code; sub = this.over ? 'Ván đã xong' : 'Nước ' + n + clk; }
        else { t = 'Ván qua mạng · phòng ' + Net.code; sub = (this.over ? 'Đã xong' : st === 'lost' ? 'Đang mất kết nối, đang nối lại' : 'Đang đánh, nước ' + n) + clk; }
        $('#home-resume-drop').textContent = st === 'watching' ? 'Thôi xem' : 'Rời phòng';
      } else {
        t = this.pvp() ? 'Ván hai người đang dở' : 'Ván với máy đang dở';
        sub = (this.pvp() ? 'Đỏ – Đen' : 'Bạn cầm ' + SIDE[this.user] + ' · cấp ' + this.level) + ' · nước ' + n + clk + (this.paused ? ' · đồng hồ đang dừng' : '');
        $('#home-resume-drop').textContent = 'Bỏ ván';
      }
      $('#home-resume-title').textContent = t; $('#home-resume-sub').textContent = sub;
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
      if (this.mode === 'ai' && this.screen === 'game' && this.ctx.pos.side !== this.user) this.engineMove();
    },
    // Hai người: hiện màn chọn thời gian; chọn xong thì vào ván ngay.
    showSetup() {
      this.setup = true; this.ask = null; this.closeMenu();
      $$('#pvp-times .btn').forEach(b => b.classList.toggle('primary', b.dataset.k === this.clockSet));
      this.draw();
    },
    startPvp(k) {
      this.clockSet = k; Store.set('play_clock', k);
      this.setup = false; this.started = true; this.paused = false;
      this.newGame();
      if (this.clock) this.clock.at = Date.now(); // đồng hồ chạy ngay khi vào ván
      this.draw();
    },
    // Chọn chế độ ở trang chủ: vào màn chuẩn bị của chế độ đó (chưa có bàn cờ).
    setMode(m) {
      if (this.net() && m !== 'net') Net.leave();
      if (m !== this.mode || this.screen !== 'setup') this.saveGame();
      this.mode = m; Store.set('play_mode', m);
      this.started = false; this.paused = false; this.screen = 'setup';
      if (!(m === 'net' && this.hasGame())) this.newGame();
      if (m === 'pvp') this.showSetup();
      else if (m === 'net') { this.netView = 'home'; Net.err = ''; this.closeMenu(); this.draw(); }
      else this.showAiSetup();
      window.scrollTo(0, 0);
    },
    // Hai người luôn ngồi đối mặt: Đỏ ở dưới, quân Đen quay về phía người cầm Đen.
    applyOrient() {
      const b = this.board;
      if (this.net()) { b.face = false; const f = !this.watching() && Net.mySide === 1; if (b.flip !== f) b.setFlip(f); return; }
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
      if (this.watching()) { this.drawBars(); return; }   // người xem: chỉ đếm giờ để hiển thị
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
      if (this.thinking || this.over || this.ask || this.screen !== 'game') return;
      if (this.watching()) { toast('Bạn đang xem trận đấu, không đi quân được.'); return; }
      if (this.net() && !Net.connected()) { toast('Đang mất kết nối với đối thủ, chờ nối lại…', 'warn'); return; }
      const side = this.pvp() ? this.ctx.pos.side : this.net() ? Net.mySide : this.user;
      if (this.ctx.pos.side !== side) return;
      this.hint = null;
      trySelect(this.ctx, sq, side, m => this.doMove(m, true));
      this.draw();
    },
    // Thế cờ lặp lại ba lần: hòa nếu không bên nào chiếu dai, đuổi dai. Có bên đang chiếu (đuổi) dai thì ván tiếp tục:
    // bên đó sẽ bị chặn ở nước chiếu (đuổi) lặp lại vượt PERPETUAL_MAX và phải đổi nước (xem Pos.repetitionVerdict).
    repeatDraw() {
      const v = this.ctx.pos.repetitionVerdict();
      return !v || v.result === 'draw';
    },
    // Nước bị chặn vì chiếu dai / đuổi dai ('check' | 'chase' | ''). Nếu mọi nước đều bị chặn thì cho đi (tránh kẹt ván).
    blockedKind(m) {
      const pos = this.ctx.pos, k = pos.perpetualBlocked(m, PERPETUAL_MAX);
      if (!k) return '';
      return pos.legalMoves().some(x => x !== m && !pos.perpetualBlocked(x, PERPETUAL_MAX)) ? k : '';
    },
    doMove(m, byUser) {
      const pos = this.ctx.pos;
      if (byUser) {
        const k = this.blockedKind(m);
        if (k) {
          const who = this.pvp() ? 'Bên ' + SIDE[pos.side] : 'Bạn';
          toast(who + ' không được ' + (k === 'check' ? 'chiếu dai' : 'đuổi dai') + ': đã ' + (k === 'check' ? 'chiếu' : 'đuổi') + ' liên tục ' + PERPETUAL_MAX + ' nước làm thế cờ lặp lại. Hãy đi nước khác.', 'warn');
          this.ctx.sel = -1; this.ctx.targets = []; this.draw();
          return;
        }
      }
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
      } else if (pos.repCount() >= 3 && this.repeatDraw()) this.over = 'Hòa do lặp lại thế cờ ba lần.';
      else if (this.moves.length >= 300) this.over = 'Hòa (quá dài).';
      else if (pos.repCount() >= 2) this.warnPerpetual();
      if (this.over) this.finish();
    },
    // Người chơi vừa đi nước chiếu (đuổi) thứ PERPETUAL_MAX liên tiếp làm thế cờ lặp lại: nhắc rằng nước như vậy tiếp theo sẽ bị chặn.
    warnPerpetual() {
      const pos = this.ctx.pos, mover = pos.side ^ 1;
      const human = this.pvp() || (this.net() ? !this.watching() && mover === Net.mySide : mover === this.user);
      if (!human) return;
      const info = pos.perpetualInfo(mover, PERPETUAL_MAX);
      if (!info || info.streak !== PERPETUAL_MAX) return;
      const w = info.kind === 'check' ? 'chiếu' : 'đuổi';
      toast((this.pvp() ? 'Bên ' + SIDE[mover] + ' đã ' : 'Bạn đã ') + w + ' liên tục ' + PERPETUAL_MAX + ' nước làm thế cờ lặp lại. Nước ' + w + ' lặp lại tiếp theo sẽ không được đi.', 'warn');
    },
    // Lưu ván vào bộ nhớ máy (tối đa 20 ván gần nhất) để phân tích sau.
    saveGame() {
      if (this.moves.length < MIN_PLIES || this.watching()) return null;
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
    drawBars() {
      const pvp = this.pvp(), net = this.net(), ai = this.mode === 'ai';
      for (const pos of ['top', 'bot']) {
        const bar = $('#pbar-' + pos); bar.hidden = this.screen !== 'game'; if (bar.hidden) continue;
        const side = this.barSide(pos), pz = this.ctx.pos, c = this.clock, myTurn = !this.over && pz.side === side;
        const isUser = ai && side === this.user, isEngine = ai && side !== this.user;
        const isMe = net && side === Net.mySide, isOpp = net && side !== Net.mySide;
        const watch = this.watching();
        let st = '';
        if (watch && !this.over) st = myTurn ? (pz.inCheck() ? 'Bị chiếu!' : 'Đang nghĩ…') : 'Chờ';
        else if (this.over) st = /Hòa/.test(this.over) ? 'Hòa' : (this.over.indexOf(SIDE[side] + ' thắng') >= 0 || this.over.indexOf(SIDE[side ^ 1] + ' chịu thua') >= 0 || this.over.indexOf(SIDE[side ^ 1] + ' hết giờ') >= 0 ? 'Thắng' : 'Thua');
        else if (isOpp && Net.state === 'lost') st = 'Mất kết nối…';
        else if (isMe && Net.waitAsk) st = 'Chờ đối thủ trả lời…';
        else if (isEngine) st = this.thinking ? 'Đang nghĩ…' : (myTurn ? 'Sắp đi' : 'Chờ bạn');
        else if (myTurn) st = pz.inCheck() ? 'Bị chiếu!' : (isUser || isMe ? 'Đến lượt bạn' : isOpp ? 'Đang nghĩ…' : 'Đến lượt');
        else st = 'Chờ đối thủ';
        bar.querySelector('.pname').textContent = watch ? SIDE[side] + (side === Net.hostSide ? ' · chủ phòng' : ' · khách') : pvp ? SIDE[side] : net ? (isMe ? 'Bạn · ' : 'Đối thủ · ') + SIDE[side] : (isUser ? 'Bạn · ' + SIDE[side] : 'Máy · ' + SIDE[side] + ' · ' + LEVELS[this.level].name.split(' – ')[1].split(' (')[0]);
        const pst = bar.querySelector('.pst'); pst.textContent = st; pst.classList.toggle('chk', st === 'Bị chiếu!');
        bar.querySelector('.pclk').textContent = c ? this.fmtClock(c.left[side]) : '';
        bar.querySelector('[data-act="menu"]').hidden = isEngine || isOpp || watch;
        bar.classList.toggle('on', myTurn);
        bar.classList.toggle('low', !!(c && c.left[side] < 20000));
        bar.classList.toggle('rot', this.board.face && pos === 'top');
      }
    },
    draw() {
      const c = this.ctx, pvp = this.pvp(), net = this.net(), human = this.human(), scr = this.screen;
      this.board.render({ pos: c.pos, last: this.last, sel: c.sel, targets: c.targets, hint: this.hint });
      const ml = this.notes.length ? moveListHtml(this.notes, 0, this.notes.length - 1, false) : '<span class="muted">Chưa có nước đi.</span>';
      const mv = $(human ? '#pm-moves' : '#play-moves'); mv.innerHTML = ml; mv.scrollTop = mv.scrollHeight;
      // Ba màn hình: trang chủ, chuẩn bị, bàn cờ — chỉ hiện một
      $('#play-home').hidden = scr !== 'home';
      $('#play-head').hidden = scr !== 'setup';
      $('#play-board').hidden = scr !== 'game';
      if (scr === 'home') this.drawHome();
      // Menu "Tùy chọn ván": giữa ván không có Ván mới / đổi chế độ, tránh bấm nhầm.
      $('#play-undo').disabled = this.thinking || !this.moves.length || !!this.over;
      $('#play-hint').disabled = this.thinking || !!this.over || c.pos.side !== this.user;
      $('#play-resign').hidden = !!this.over || !this.moves.length; $('#play-resign').disabled = this.thinking;
      $('#play-title').textContent = net ? 'Chơi qua mạng' : pvp ? 'Hai người một máy' : 'Đấu với máy';
      $('#ai-setup').hidden = !(this.mode === 'ai' && scr === 'setup');
      if (!$('#ai-setup').hidden) this.drawAiSetup();
      $('#pvp-setup').hidden = !(pvp && scr === 'setup');
      this.drawNet();
      // Câu hỏi (xin hòa, xin đi lại, chịu thua) hiện ở phía người phải trả lời; khi đối mặt, phía trên quay ngược.
      const ask = $('#play-ask'); ask.hidden = !this.ask || scr !== 'game';
      if (this.ask) {
        const where = human ? this.sidePos(this.ask.who) : 'bot';
        $('#ask-' + where).appendChild(ask);
        ask.classList.toggle('rot', pvp && this.board.face && where === 'top');
        $('#play-ask-text').textContent = this.ask.text; $('#play-ask-yes').textContent = this.ask.yesLabel; $('#play-ask-no').textContent = this.ask.noLabel;
      }
      // Thẻ kết quả khi ván xong (cả hai chế độ): phân tích, ván mới, đổi chế độ
      const res = $('#play-result'); res.hidden = !(this.over && scr === 'game');
      if (!res.hidden) {
        $('#play-result-text').textContent = this.over;
        const ok = this.moves.length >= MIN_PLIES;
        $('#play-result-ana').hidden = !ok || this.watching();
        $('#play-result-new').hidden = this.watching();
        $('#play-result-mode').textContent = net ? 'Rời phòng' : 'Trang chủ';
        $('#play-result-new').textContent = net ? 'Đấu lại' : 'Ván mới';
        $('#play-result-new').disabled = net && (!Net.connected() || !!Net.waitAsk);
        $('#play-result-note').textContent = this.watching() ? 'Nếu hai người đấu lại, bàn cờ sẽ tự hiện ván mới.' : ok ? '' : 'Ván có dưới 5 nước mỗi bên nên không lưu để phân tích.';
      }
      this.drawBars();
      if (net) Net.castSoon();  // chủ phòng: gửi thế cờ mới cho người xem (nếu có)
      Nav.update();  // đổi bố cục ngay khi trạng thái ván đổi (không chờ vòng kiểm tra định kỳ), tránh bấm trượt
    },
  };
