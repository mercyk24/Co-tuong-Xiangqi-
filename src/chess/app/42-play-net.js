  // [CỜ VUA] Chỉ app cờ vua dùng. Có bản song sinh bên cờ tướng: src/xiangqi/app/42-play-net.js (giống ~95%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 42-play-net.js — CỜ VUA. Phần giao diện của chơi qua mạng: màn tạo / vào phòng, xin đồng ý, xem trận, các hàm Net gọi vào.
  // Kết nối và giao thức nằm trong 45-net.js. Các hàm được gắn thêm vào Play (định nghĩa trong 40-play.js).
  Object.assign(Play, {
    // Gắn sự kiện cho màn chơi qua mạng (gọi từ Play.init)
    initNet() {
      // Chơi qua mạng: lần đầu phải đồng ý cho gửi thông tin kết nối ra ngoài máy
      $('#net-consent-yes').onclick = () => {
        Consent.give(); const code = Net.pendingJoin; Net.pendingJoin = '';
        if (code) { $('#net-code').value = code; Net.join(code); } else this.draw();
      };
      $('#net-consent-no').onclick = () => { Net.pendingJoin = ''; this.goHome(); };
      $('#net-consent-policy').onclick = () => { showTab('about'); const el = $('#privacy'); if (el) el.scrollIntoView(); };
      $('#net-go-create').onclick = () => { this.netView = 'create'; Net.err = ''; this.draw(); };
      $('#net-create-back').onclick = () => { this.netView = 'home'; this.draw(); };
      $('#net-side').value = Store.get('net_side', 'r');
      $('#net-side').onchange = e => Store.set('net_side', e.target.value);
      $('#net-times').innerHTML = Object.keys(this.CLOCKS).map(k => '<button class="btn" data-k="' + k + '">' + this.CLOCKS[k][0] + (this.CLOCKS[k][1] ? '<small>' + this.CLOCKS[k][1] + '</small>' : '') + '</button>').join('');
      $$('#net-times .btn').forEach(b => b.onclick = () => { Store.set('play_clock', b.dataset.k); this.netView = 'home'; Net.create($('#net-side').value, b.dataset.k); });
      $('#net-join').onclick = () => Net.join($('#net-code').value);
      $('#net-code').onkeydown = e => { if (e.key === 'Enter') Net.join($('#net-code').value); };
      $('#net-wait-cancel').onclick = () => { Net.leave(true); this.draw(); };
      $('#net-banner-leave').onclick = () => this.netLeave();
      $('#net-watch-yes').onclick = () => Net.watch();
      $('#net-watch-no').onclick = () => { Net.canWatch = false; Net.err = ''; Net.state = 'idle'; this.draw(); };
      $('#net-allow-watch').checked = Store.get('net_watch', true);
      $('#net-allow-watch').onchange = e => Store.set('net_watch', e.target.checked);
      $('#net-share').onclick = () => this.netShare();
      $('#net-copy').onclick = () => this.netCopy(Net.code);
    },
    // ---- Chơi qua mạng: các hàm Net gọi vào
    netSide() { return Net.mySide; },
    netStart(mySide, clockSet) {
      this.saveGame(); this.rec = null;
      this.setup = false; this.started = true; this.closeMenu();
      this.gen++;
      this.ctx = { pos: CH.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.last = null; this.hint = null; this.over = null; this.thinking = false; this.ask = null;
      this.clock = null;
      if (clockSet && clockSet !== '0') { const [mn, inc] = clockSet.split('+').map(Number); this.clock = { left: [mn * 60000, mn * 60000], inc: inc * 1000, at: Date.now() }; }
      this.applyOrient(); this.draw();
    },
    // Dựng lại ván từ danh sách nước (khi nối lại hoặc mở lại app)
    netLoad(list, left, over, running) {
      this.setup = false; this.started = true; this.gen++;
      this.ctx = { pos: CH.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.ask = null; this.hint = null; this.thinking = false;
      for (const u of list || []) {
        const m = this.ctx.pos.legalMoves().find(x => CH.mvStr(x) === u); if (m === undefined) break;
        this.notes.push(this.ctx.pos.notation(m)); this.ctx.pos.make(m); this.moves.push(m);
      }
      const lm = this.moves[this.moves.length - 1]; this.last = lm ? [CH.mFrom(lm), CH.mTo(lm)] : null;
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
      const m = this.ctx.pos.legalMoves().find(x => CH.mvStr(x) === u);
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
    // Người xem: bàn cờ chỉ để xem, Trắng ở dưới, chờ thế cờ từ chủ phòng
    watchStart() {
      this.saveGame(); this.rec = null; this.started = true; this.screen = 'game'; this.closeMenu();
      this.gen++; this.ctx = { pos: CH.Pos.fromFen(this.startFen), sel: -1, targets: [] };
      this.moves = []; this.notes = []; this.last = null; this.hint = null; this.over = null; this.thinking = false; this.ask = null; this.clock = null;
      this.applyOrient(); this.draw();
    },
    netLeave() { Net.leave(); this.started = false; this.screen = 'home'; this.netView = 'home'; this.newGame(); },
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
    // Màn tạo / vào phòng và dải báo mất kết nối
    drawNet() {
      const net = this.net(), st = Net.state;
      const setupShown = net && this.setup;
      $('#net-setup').hidden = !setupShown;
      const watch = this.watching(), game = net && this.screen === 'game';
      const banner = $('#net-banner'); banner.hidden = !(game && (st === 'lost' || watch));
      banner.classList.toggle('watch', watch);
      if (!banner.hidden) $('#net-banner-text').textContent = watch ? '👁 Đang xem phòng ' + Net.code + (Net.msgText ? ' · ' + Net.msgText : Net.watchers > 1 ? ' · ' + Net.watchers + ' người xem' : '') : (Net.msgText || 'Mất kết nối, đang nối lại…');
      $('#net-banner-leave').textContent = watch ? 'Thôi xem' : 'Rời phòng';
      // Người chơi thấy số người đang xem phòng mình
      const wn = $('#net-watchn'); wn.hidden = !(game && !watch && Net.watchers > 0);
      if (!wn.hidden) wn.textContent = '👁 ' + Net.watchers + ' người đang xem';
      $('#net-watch-ask').hidden = !(net && st === 'error' && Net.canWatch);
      if (!setupShown) return;
      const waiting = st === 'opening' || st === 'waiting' || st === 'joining';
      const ask = !Consent.ok() && !waiting;
      $('#net-consent').hidden = !ask;
      $('#net-consent-code').hidden = !(ask && Net.pendingJoin);
      if (ask && Net.pendingJoin) $('#net-consent-code').textContent = 'Bạn được mời vào phòng ' + Net.pendingJoin + '. Đồng ý thì app vào phòng ngay.';
      $('#net-home').hidden = ask || waiting || this.netView !== 'home';
      $('#net-create').hidden = ask || waiting || this.netView !== 'create';
      $('#net-wait').hidden = !waiting;
      $('#net-err').hidden = !(st === 'error' && Net.err); $('#net-err').textContent = Net.err || '';
      $$('#net-times .btn').forEach(b => b.classList.toggle('primary', b.dataset.k === Store.get('play_clock', '0')));
      if (waiting) {
        const host = Net.role === 'host';
        $('#net-wait-title').textContent = host ? 'Mã phòng của bạn – gửi cho đối thủ:' : Net.role === 'watch' ? 'Đang vào xem phòng' : 'Đang vào phòng';
        $('#net-code-show').textContent = Net.code || '······';
        $('#net-share-row').hidden = !(host && st === 'waiting');
        $('#net-status').textContent = Net.msgText;
        $('#net-wait-cancel').textContent = host ? 'Huỷ phòng' : 'Huỷ';
      }
    }
  });
