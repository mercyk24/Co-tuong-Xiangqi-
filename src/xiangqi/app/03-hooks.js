  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng. Mọi chỗ phần dùng chung (src/shared/app/) cần tới luật cờ tướng đều đi qua HOOKS ở đây;
  // bản tương ứng của cờ vua: src/chess/app/03-hooks.js (cùng tên hàm, khác nội dung). Sơ đồ: docs/CAU-TRUC.md
  const PERPETUAL_MAX = 4;  // số nước chiếu (đuổi) liên tiếp tối đa được làm thế cờ lặp lại; nước thứ 5 bị chặn
  const HOOKS = {
    // ---- Màn chơi (src/shared/app/40-play.js) ----
    play: {
      init() { /* cờ tướng không có gì thêm */ },
      reset() { /* không có trạng thái riêng */ },
      drawExtra() { /* không có bảng phụ */ },
      select(play, sq, side) { trySelect(play.ctx, sq, side, m => play.doMove(m, true)); },
      // Chặn nước chiếu dai / đuổi dai thứ PERPETUAL_MAX + 1 của người chơi, báo lý do.
      allowMove(play, m, byUser) {
        if (!byUser) return true;
        const pos = play.ctx.pos, k = this.blockedKind(play, m);
        if (!k) return true;
        const who = play.pvp() ? 'Bên ' + GAME.sides[pos.side] : 'Bạn';
        toast(who + ' không được ' + (k === 'check' ? 'chiếu dai' : 'đuổi dai') + ': đã ' + (k === 'check' ? 'chiếu' : 'đuổi') + ' liên tục ' + PERPETUAL_MAX + ' nước làm thế cờ lặp lại. Hãy đi nước khác.', 'warn');
        play.ctx.sel = -1; play.ctx.targets = []; play.draw();
        return false;
      },
      // Nước bị chặn vì chiếu dai / đuổi dai ('check' | 'chase' | ''). Nếu mọi nước đều bị chặn thì cho đi (tránh kẹt ván).
      // Máy cũng dùng hàm này để tránh nước bị chặn (41-play-ai.js).
      blockedKind(play, m) {
        const pos = play.ctx.pos, k = pos.perpetualBlocked(m, PERPETUAL_MAX);
        if (!k) return '';
        return pos.legalMoves().some(x => x !== m && !pos.perpetualBlocked(x, PERPETUAL_MAX)) ? k : '';
      },
      // Kết thúc ván: hết nước đi (chiếu bí hoặc bị vây) là thua; lặp ba lần là hòa nếu không bên nào chiếu (đuổi) dai
      // (có bên đang chiếu dai thì ván tiếp tục, bên đó sẽ bị chặn – xem Pos.repetitionVerdict); 300 nửa nước là hòa.
      checkEnd(play) {
        const pos = play.ctx.pos;
        if (pos.legalMoves().length === 0) {
          const winner = pos.side ^ 1;
          play.over = GAME.sides[winner] + ' thắng' + (pos.inCheck() ? ' – chiếu bí.' : ' – đối phương hết nước đi.');
        } else if (pos.repCount() >= 3 && this.repeatDraw(pos)) play.over = 'Hòa do lặp lại thế cờ ba lần.';
        else if (play.moves.length >= 300) play.over = 'Hòa (quá dài).';
        else if (pos.repCount() >= 2) this.warnPerpetual(play);
      },
      repeatDraw(pos) { const v = pos.repetitionVerdict(); return !v || v.result === 'draw'; },
      // Người chơi vừa đi nước chiếu (đuổi) thứ PERPETUAL_MAX liên tiếp làm thế cờ lặp lại: nhắc rằng nước như vậy tiếp theo sẽ bị chặn.
      warnPerpetual(play) {
        const pos = play.ctx.pos, mover = pos.side ^ 1;
        const human = play.pvp() || (play.net() ? !play.watching() && mover === Net.mySide : mover === play.user);
        if (!human) return;
        const info = pos.perpetualInfo(mover, PERPETUAL_MAX);
        if (!info || info.streak !== PERPETUAL_MAX) return;
        const w = info.kind === 'check' ? 'chiếu' : 'đuổi';
        toast((play.pvp() ? 'Bên ' + GAME.sides[mover] + ' đã ' : 'Bạn đã ') + w + ' liên tục ' + PERPETUAL_MAX + ' nước làm thế cờ lặp lại. Nước ' + w + ' lặp lại tiếp theo sẽ không được đi.', 'warn');
      }
    },
    // ---- Phân tích ván (src/shared/app/80-analysis.js) ----
    ana: {
      // Thang điểm Fairy-Stockfish (cờ tướng) lớn hơn Pikafish khoảng 1,5 lần (đã đo), nên ngưỡng và đơn vị hiển thị đã quy đổi.
      AN: { CLAMP: 1200, INACC: 120, MIST: 270, BLUN: 520, UNIT: 150 },
      engineSize: ' (13 MB)',   // tải lần đầu: engine + mạng NNUE cờ tướng
      unitNote: '',
      firstClass: ' red',        // nước của Đỏ trong danh sách nước tô đỏ
      init() { $('#ana-nm').onclick = () => applyNmode({ vi: 'both', both: 'han', han: 'vi' }[noteMode()]); },
      // Bài "Lỗi của bạn": lời giải ghi sẵn bằng ký hiệu (sol, tối đa 6 nước của đường engine), kèm pv dạng UCI
      mineItem(pos, g, i, pv, id) {
        const sol = [], q = XQ.Pos.fromFen(pos.fen());
        for (const u of pv.slice(0, 6)) { const m = q.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) break; sol.push(q.notation(m)); q.make(m); }
        if (!sol.length) return null;
        const pm = pos.legalMoves().find(x => XQ.mvStr(x) === g.moves[i]);
        return { id, fen: pos.fen(), side: pos.side === 0 ? 'w' : 'b', best: g.ana.bm[i], accept: g.ana.acc[i], pv, sol, played: pm !== undefined ? pos.notation(pm) : '', loss: g.ana.ls[i], t: g.t, ok: 0 };
      }
    },
    // ---- Khởi động (src/shared/app/99-boot.js) ----
    boot: {
      // Cài đặt › Cách ghi nước đi (chữ Hán / tiếng Việt / cả hai)
      settings() { $('#set-nmode').onchange = e => applyNmode(e.target.value); applyNmode(noteMode()); },
      // Dòng tình trạng engine mạnh trong thông tin báo lỗi (75-report.js)
      engineInfo(yn) { return ', đã tải ' + yn(FSF.sf) + ', lỗi ' + yn(FSF.failed); },
      // Các tab riêng: Chiếu hết / Tàn cuộc (Puz), Chiến thuật (Tac), Khai cuộc (Op), Phân tích ván (Ana)
      init() { Puz.init(); Tac.init(); Op.init(); Ana.init(); },
      onTab(name) {
        if (name === 'tac') Tac.renderList();
        if (name === 'ana' && !Ana.cur) Ana.renderList();
      },
      // Đang giải bài / tập khai cuộc dở: thu gọn thanh điều hướng để khỏi bấm nhầm
      busy(tab) {
        if (tab === 'puz') return !$('#puz-play').hidden && !Puz.solved;
        if (tab === 'tac') return !$('#tac-play').hidden && (Tac.mode === 'free' ? !Tac.solved : !Tac.over);
        if (tab === 'op') return !$('#op-play').hidden && Op.mode === 'drill' && !Op.finished;
        return false;
      },
      expose() { return { Puz, Tac, Op, FSF, Ana, vi }; }
    }
  };
