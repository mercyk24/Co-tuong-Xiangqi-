  // [CỜ VÂY] Chỉ app cờ vây dùng. Mọi chỗ phần dùng chung (src/shared/app/) cần tới luật cờ vây đều đi qua HOOKS ở đây;
  // bản tương ứng: src/xiangqi/app/03-hooks.js, src/chess/app/03-hooks.js (cùng tên hàm, khác nội dung). Sơ đồ: docs/CAU-TRUC.md
  // Khác cờ tướng / cờ vua: có nút Bỏ lượt; hai bên cùng bỏ lượt thì đếm điểm (luật Trung Quốc: quân + đất, Trắng được 7,5 điểm bù).
  // Đấu với máy và hai người một máy: máy đoán sẵn quân chết, người chơi bấm vào nhóm quân để sửa rồi Xác nhận (hoặc Chơi tiếp).
  // Chơi qua mạng: máy của chủ phòng đoán quân chết, tính kết quả rồi gửi cho khách (tin 'over'), nên hai bên luôn cùng một kết quả.
  // Đoán quân chết: KataGo (15-kata.js) nếu đã tải, không thì máy Monte-Carlo trong Worker (10-engine.js).
  const DEAD_N = { 9: 200, 13: 140, 19: 90 };   // số ván thử khi đoán quân chết bằng Monte-Carlo, theo cỡ bàn
  function estimateDead(play, pos) {
    const job = { fen: play.startFen, moves: play.moves.slice() };
    const mc = () => Engine.call(Object.assign({ type: 'ownership', n: DEAD_N[pos.n] || 120 }, job)).then(r => new Set(r.dead || []));
    if (Kata.state !== 'ready') return mc();
    return Kata.call(Object.assign({ type: 'ownership' }, job)).then(r => r && r.dead ? new Set(r.dead) : mc());
  }
  // Tên lý do không đặt được quân
  function illegalWhy(pos, p) {
    const i = pos.idx(p);
    if (pos.at(p) >= 0) return '';
    if (i === pos.ko) return 'Kiếp: chưa được ăn lại ngay. Hãy đánh chỗ khác một nước rồi mới ăn lại.';
    if (!pos.tryPlay(i, false)) return 'Không được đặt quân vào chỗ hết khí (tự sát), trừ khi nước đó ăn được quân.';
    return 'Không được tạo lại đúng thế cờ đã có trước đó (luật cấm lặp).';
  }
  const HOOKS = {
    // ---- Màn chơi (src/shared/app/40-play.js) ----
    play: {
      init(play) {
        play.scoring = null;   // đang đếm điểm: { pos, dead: Set }
        play.final = null;     // kết quả đếm điểm khi ván xong: { pos, dead, own }
        play.warn = false;     // cờ vây không có "báo nước yếu"
        $('#go-pass').onclick = () => play.onSquare(-2);
        // Lúc đếm điểm thì bên nào cũng bấm được vào bàn để đánh dấu quân chết (kể cả khi đang là "lượt" của máy)
        const tap = play.board.onSquare;
        play.board.onSquare = sq => {
          if (play.scoring && play.screen === 'game' && !play.over) { if (!play.scoring.net && !play.scoring.busy) { this.select(play, sq); play.draw(); } return; }
          tap(sq);
        };
        $('#go-score-ok').onclick = () => this.confirmScore(play);
        $('#go-score-resume').onclick = () => { play.scoring = null; toast('Chơi tiếp: hai bên cùng bỏ lượt lần nữa thì đếm điểm lại.'); play.draw(); };
        // Chọn cỡ bàn (cùng một lựa chọn ở màn đấu máy, hai người, tạo phòng)
        $$('.go-size').forEach(row => {
          row.innerHTML = GO.SIZES.map(n => '<button class="chip" data-v="' + n + '">' + n + '×' + n + '</button>').join('');
          row.onclick = e => {
            const b = e.target.closest('[data-v]'); if (!b) return;
            Store.set('go_size', +b.dataset.v); this.syncSetup(play);
          };
        });
        $$('#ai-var .chip').forEach(b => b.onclick = () => { Store.set('go_var', b.dataset.v); this.syncSetup(play); });
        this.drawChips();
      },
      // Thế bắt đầu của ván mới: bàn trống theo cỡ đã chọn; "cờ bắt quân" chỉ khi đấu với máy
      startFen(play) {
        const n = Store.get('go_size', 9), cg = play.mode === 'ai' && Store.get('go_var', 'area') === 'cg';
        return GO.emptyFen(GO.SIZES.includes(n) ? n : 9, cg ? 0 : 7.5, cg);
      },
      syncSetup(play) {
        this.drawChips();
        if (play.screen === 'setup' && !(play.net() && play.hasGame())) play.newGame();
      },
      drawChips() {
        const n = Store.get('go_size', 9), v = Store.get('go_var', 'area');
        $$('.go-size .chip').forEach(b => b.classList.toggle('on', +b.dataset.v === n));
        $$('#ai-var .chip').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      },
      reset(play) { play.scoring = null; play.final = null; },
      // Bấm vào bàn: đặt quân (bàn 13×13, 19×19: bấm lần đầu hiện quân nháp, bấm lại đúng chỗ đó mới đặt);
      // sq = -2 là nút Bỏ lượt; đang đếm điểm thì bấm vào nhóm quân để đánh dấu chết / sống.
      select(play, sq, side) {
        const ctx = play.ctx, pos = ctx.pos;
        if (play.scoring) {
          if (play.scoring.net || play.scoring.busy || sq < 0 || pos.at(sq) < 0) return;
          const g = pos.group(pos.idx(sq)).stones.map(i => pos.pt(i)), D = play.scoring.dead;
          const allDead = g.every(p => D.has(p));
          g.forEach(p => allDead ? D.delete(p) : D.add(p));
          return;
        }
        if (sq === -2) { ctx.sel = -1; play.doMove(GO.PASS, true); return; }
        const m = sq + 1;
        if (!pos.isLegal(m)) { ctx.sel = -1; const why = illegalWhy(pos, sq); if (why) toast(why, 'warn'); return; }
        const confirm = Store.get('go_confirm', 'auto');
        const need = confirm === 'on' || (confirm === 'auto' && pos.n >= 13);
        if (need && ctx.sel !== sq) { ctx.sel = sq; return; }
        ctx.sel = -1;
        play.doMove(m, true);
      },
      allowMove(play) { play.ctx.sel = -1; return true; },
      // Kết thúc: cờ bắt quân (ăn được quân trước là thắng) hoặc hai bên cùng bỏ lượt (đếm điểm)
      checkEnd(play) {
        const pos = play.ctx.pos;
        if (pos.cg) { if (pos.ended) play.over = GAME.sides[pos.ended - 1] + ' thắng – ăn được quân trước.'; return; }
        if (pos.passes < 2) return;
        if (play.thinking) play.thinking = false;
        const net = play.net();
        play.scoring = { pos, dead: new Set(), busy: true, net, wait: net && Net.role !== 'host' };
        if (net && Net.role !== 'host') {   // khách: chờ chủ phòng gửi kết quả; quá 20 giây (chủ phòng dùng bản cũ, mất tin) thì tự đếm
          setTimeout(() => {
            if (!play.scoring || play.scoring.pos !== pos || play.over) return;
            estimateDead(play, pos).then(dead => {
              if (!play.scoring || play.scoring.pos !== pos || play.over) return;
              this.netResult(play, { text: pos.resultText(dead) + ' Quân chết do máy này ước lượng (chưa nhận được kết quả từ chủ phòng).', dead: Array.from(dead) });
            });
          }, 20000);
          return;
        }
        estimateDead(play, pos).then(dead => {
          const sc = play.scoring;
          if (!sc || sc.pos !== pos || play.over) return;
          if (!net) { sc.dead = dead; sc.busy = false; play.draw(); return; }
          // Chủ phòng: chốt kết quả và gửi cho khách
          const text = pos.resultText(dead) + ' Quân chết do máy của chủ phòng ước lượng.';
          play.final = { pos, dead, own: pos.score(dead).own };
          play.scoring = null;
          play.over = text;
          if (play.clock) play.clock.at = 0;
          Net.sendMsg({ t: 'over', text, dead: Array.from(dead) });
          play.finish(); Net.save(); Net.castSoon();
        });
      },
      // Khách nhận kết quả đếm điểm từ chủ phòng (tin 'over' của src/shared/app/45-net.js)
      netResult(play, m) {
        const pos = play.ctx.pos, A = pos.n * pos.n;
        if (play.over || typeof m.text !== 'string') return;
        const dead = new Set((Array.isArray(m.dead) ? m.dead : []).filter(p => Number.isInteger(p) && p >= 0 && p < A && pos.at(p) >= 0));
        play.final = { pos, dead, own: pos.score(dead).own };
        play.scoring = null;
        play.netOver(m.text.slice(0, 300));
      },
      // Người chơi xác nhận kết quả đếm điểm
      confirmScore(play) {
        const sc = play.scoring; if (!sc || sc.pos !== play.ctx.pos || sc.busy || sc.net) return;
        const pos = sc.pos, s = pos.score(sc.dead);
        play.final = { pos, dead: sc.dead, own: s.own };
        play.scoring = null;
        play.over = pos.resultText(sc.dead);
        play.finish();
      },
      // Vẽ thêm: nút Bỏ lượt, số quân đã ăn, bảng đếm điểm; đếm điểm / ván xong thì vẽ lại bàn có đánh dấu quân chết và đất
      drawExtra(play) {
        const pos = play.ctx.pos, game = play.screen === 'game';
        if (play.scoring && (play.scoring.pos !== pos || pos.passes < 2 || play.over)) play.scoring = null;
        if (play.final && play.final.pos !== pos) play.final = null;
        const sc = play.scoring, fin = play.over && play.final;
        if (sc || fin) {
          const dead = sc ? sc.dead : fin.dead, own = sc ? pos.score(dead).own : fin.own;
          play.board.render({ pos, last: play.last, sel: -1, hint: null, dead, own });
        }
        const turnHuman = !play.over && !sc && !play.thinking && !play.watching() &&
          (play.pvp() || (play.net() ? pos.side === Net.mySide : pos.side === play.user));
        const pass = $('#go-pass');
        pass.hidden = !game || !turnHuman || pos.cg;
        pass.textContent = 'Bỏ lượt' + (play.pvp() ? ' (' + GAME.sides[pos.side] + ')' : '');
        const info = $('#go-info');
        info.hidden = !game;
        if (game) info.textContent = (pos.cg ? 'Cờ bắt quân: ai ăn được quân trước là thắng · ' : '') + 'Đen đã ăn ' + pos.caps[0] + ' · Trắng đã ăn ' + pos.caps[1] +
          (!pos.cg && pos.passes === 1 && !play.over ? ' · ' + GAME.sides[pos.side ^ 1] + ' vừa bỏ lượt' : '');
        const box = $('#go-score');
        box.hidden = !(sc && game);
        if (sc && game) {
          const s = pos.score(sc.dead), f = x => String(x).replace('.', ',');
          $('#go-score-help').hidden = sc.net;
          $('#go-score-ok').hidden = $('#go-score-resume').hidden = sc.net;
          $('#go-score-ok').disabled = sc.busy;
          $('#go-score-text').textContent = sc.wait ? 'Hai bên đã bỏ lượt. Đang chờ máy của chủ phòng đếm điểm…' :
            sc.busy ? 'Máy đang đoán quân chết…' :
              'Đen ' + f(s.black) + ' · Trắng ' + f(s.white) + ' (kể cả ' + f(pos.komi) + ' điểm bù) → ' + (s.winner < 0 ? 'hòa' : GAME.sides[s.winner] + ' hơn ' + f(s.margin) + ' điểm');
        }
      }
    },
    // ---- Khởi động (src/shared/app/99-boot.js) ----
    boot: {
      // Cài đặt › Bấm hai lần để đặt quân
      settings() {
        const el = $('#set-confirm');
        el.value = Store.get('go_confirm', 'auto');
        el.onchange = e => Store.set('go_confirm', e.target.value);
        // Cài đặt › Máy KataGo: tình trạng và nút tải trước (để dùng ngoại tuyến)
        const show = () => { $('#kata-state').textContent = Kata.label(); $('#kata-load').hidden = Kata.state === 'ready' || Kata.state === 'loading'; };
        Kata.onChange = show; show();
        $('#kata-load').onclick = () => { Kata.state = Kata.state === 'failed' ? 'none' : Kata.state; Kata.ensure(); show(); };
      },
      // Dòng tình trạng máy chơi trong thông tin báo lỗi (75-report.js): cờ vây không có engine Fairy-Stockfish
      engineInfo(yn) { return ' (cờ vây không dùng) · máy Monte-Carlo trong Worker ' + yn(!!Engine.worker) + ' · KataGo: ' + Kata.state + (Kata.info ? ' ' + Kata.info.backend + '/' + Kata.info.threads : '') + (Kata.err ? ' (' + Kata.err + ')' : ''); },
      // Các tab riêng: Bài học (Les), Bắt quân (Puz), Ván đã lưu (Ana)
      init() { Les.init(); Puz.init(); Ana.init(); },
      onTab(name) {
        if (name === 'ana' && !Ana.cur) Ana.renderList();
        if (name === 'les' && !Les.cur) Les.renderList();
      },
      busy(tab) {
        if (tab === 'puz') return !$('#puz-play').hidden && !Puz.solved;
        if (tab === 'les') return !!Les.cur && !Les.done;
        return false;
      },
      expose() { return { Puz, Les, Ana, GO, Kata }; }
    }
  };
