  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng. Có bản song sinh bên cờ vua: src/chess/app/41-play-ai.js (giống ~74%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 41-play-ai.js — Đấu với máy: màn chuẩn bị, sách khai cuộc ngắn, gọi engine, nhắc nước yếu, gợi ý.
  // Các hàm được gắn thêm vào Play (định nghĩa trong 40-play.js).
  Object.assign(Play, {
    // Gắn sự kiện cho màn chuẩn bị và tuỳ chọn ván với máy (gọi từ Play.init)
    initAi() {
      // Màn chuẩn bị ván với máy
      $$('#ai-side .chip').forEach(b => b.onclick = () => { this.aiSide = b.dataset.v; Store.set('ai_side', this.aiSide); this.drawAiSetup(); });
      $('#ai-levels').innerHTML = Object.keys(LEVELS).map(k => {
        const nm = LEVELS[k].name.split(' – ')[1], i = nm.indexOf(' (');
        return '<button class="lvl" data-v="' + k + '"><b>' + k + ' · ' + (i > 0 ? nm.slice(0, i) : nm) + '</b>' + (i > 0 ? '<small>' + nm.slice(i + 2, -1) + '</small>' : '') + '</button>';
      }).join('');
      $$('#ai-levels .lvl').forEach(b => b.onclick = () => { this.level = +b.dataset.v; Store.set('play_level', this.level); $('#play-level').value = String(this.level); this.drawAiSetup(); });
      $('#ai-start').onclick = () => this.startAi();
      const lv = $('#play-level'), wr = $('#play-warn'), pw = $('#pm-warn'), aw = $('#ai-warn'), op = $('#play-open');
      op.value = Store.get('play_open', ''); op.onchange = () => { Store.set('play_open', op.value); };
      lv.innerHTML = Object.keys(LEVELS).map(k => '<option value="' + k + '">' + LEVELS[k].name + '</option>').join('');
      lv.value = String(this.level); wr.checked = pw.checked = aw.checked = !!this.warn;
      lv.onchange = () => { this.level = +lv.value; Store.set('play_level', this.level); this.drawBars(); };
      wr.onchange = pw.onchange = aw.onchange = e => { this.warn = e.target.checked; wr.checked = pw.checked = aw.checked = this.warn; Store.set('play_warn', this.warn); };
    },
    // Đấu với máy: màn chuẩn bị (bên cầm, cấp độ, nước mở đầu của máy)
    showAiSetup() { this.screen = 'setup'; this.ask = null; this.closeMenu(); this.draw(); },
    startAi() {
      const v = this.aiSide;
      this.user = v === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +v; Store.set('play_user', this.user);
      this.started = true; this.screen = 'game';
      this.newGame();
      if (v === 'r') toast('Bạn cầm quân ' + SIDE[this.user] + (this.user === 0 ? ', đi trước.' : '.'));
    },
    drawAiSetup() {
      $$('#ai-side .chip').forEach(b => b.classList.toggle('on', b.dataset.v === this.aiSide));
      $$('#ai-levels .lvl').forEach(b => b.classList.toggle('on', +b.dataset.v === this.level));
      $('#ai-open-row').hidden = this.aiSide === '0';
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
    // Nước này có bị chặn vì chiếu dai, đuổi dai không (nước chiếu/đuổi lặp lại vượt giới hạn)
    losesByRule(m) { return !!this.blockedKind(m); },
    engineMove() {
      if (this.over) return;
      const bm = this.bookMove();
      if (bm > 0) { const g0 = this.gen, n0 = this.moves.length; setTimeout(() => { if (g0 === this.gen && !this.over && this.moves.length === n0) this.doMove(bm, false); }, 350); return; }
      const g = this.gen; this.thinking = true; this.draw();
      const lv = LEVELS[this.level];
      // Engine tự viết; nước nó chọn mà bị chặn vì chiếu dai, đuổi dai thì tìm lại, bỏ nước đó (tối đa 6 lần)
      const search = (avoid, msg) => {
        if (msg) toast(msg, 'warn');
        Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: Object.assign({}, lv.opts, { avoid }) }).then(r => {
          if (g !== this.gen) return;
          if (r.move && avoid.length < 6 && this.losesByRule(r.move)) { search(avoid.concat(r.move)); return; }
          this.thinking = false;
          if (r.move) this.doMove(r.move, false); else this.draw();
        });
      };
      if (lv.fsf) {
        if (!FSF.supported()) { search([], 'Trình duyệt chưa bật được engine mạnh (hãy tải lại trang một lần). Tạm dùng cấp 5.'); return; }
        if (!FSF.sf) toast('Đang tải engine cao thủ (13 MB), lần đầu hơi lâu…');
        FSF.best(this.startFen, this.moves.map(m => XQ.mvStr(m)), lv.fsf.ms).then(u => {
          if (g !== this.gen) return;
          const m = this.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === u);
          if (m === undefined) { search([], 'Engine mạnh trả nước không hợp lệ, tạm dùng cấp 5.'); return; }
          if (this.losesByRule(m)) { search([m]); return; }
          this.thinking = false; this.doMove(m, false);
        }).catch(err => { if (g !== this.gen) return; search([], 'Không chạy được engine mạnh (' + (err && err.message || err) + '). Tạm dùng cấp 5.'); });
        return;
      }
      search([]);
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
  });
