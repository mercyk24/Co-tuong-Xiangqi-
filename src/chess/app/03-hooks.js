  // [CỜ VUA] Chỉ app cờ vua dùng. Mọi chỗ phần dùng chung (src/shared/app/) cần tới luật cờ vua đều đi qua HOOKS ở đây;
  // bản tương ứng của cờ tướng: src/xiangqi/app/03-hooks.js (cùng tên hàm, khác nội dung). Sơ đồ: docs/CAU-TRUC.md
  const HOOKS = {
    // ---- Màn chơi (src/shared/app/40-play.js) ----
    play: {
      init(play) {
        play.promo = null;   // bảng chọn quân phong cấp đang mở: { alts, side }
        $$('#promo [data-t]').forEach(b => b.onclick = () => this.pickPromo(play, +b.dataset.t));
        $('#promo-cancel').onclick = () => this.pickPromo(play, 0);
      },
      reset(play) { play.promo = null; },
      // Chọn quân, đi quân. Phong cấp: hỏi người chơi chọn quân (Hậu, Xe, Tượng, Mã); bật "Luôn phong Hậu" thì không hỏi.
      select(play, sq, side) {
        trySelect(play.ctx, sq, side, (m, alts) => {
          if (alts.length > 1 && !Store.get('autoq', false)) { play.promo = { alts, side }; play.draw(); return; }
          play.doMove(m, true);
        });
      },
      // Người chơi chọn quân phong cấp (t: loại quân 5 Hậu, 4 Xe, 3 Tượng, 2 Mã) hoặc huỷ (t = 0)
      pickPromo(play, t) {
        const p = play.promo; play.promo = null;
        const m = p && t ? p.alts.find(x => CH.mPromo(x) === t) : 0;
        if (m) play.doMove(m, true); else play.draw();
      },
      allowMove(play) { play.promo = null; return true; },
      // Luật kết thúc của cờ vua (CH.Pos.status): chiếu hết, hết nước đi (pat – hòa), không đủ quân, luật 50 nước, lặp ba lần
      checkEnd(play) {
        const st = play.ctx.pos.status();
        if (!st) return;
        if (st.result === 'mate') play.over = GAME.sides[st.winner] + ' thắng – chiếu hết.';
        else play.over = 'Hòa – ' + { stalemate: 'hết nước đi (pat).', insufficient: 'không đủ quân để chiếu hết.', fifty: 'luật 50 nước (50 nước mỗi bên không ăn quân, không đi Tốt).', repetition: 'thế cờ lặp lại ba lần.' }[st.result];
      },
      // Bảng chọn quân phong cấp, hiện ngay trên bàn cờ
      drawExtra(play) {
        const el = $('#promo'), p = play.promo;
        el.hidden = !p || play.screen !== 'game';
        if (!p) return;
        el.classList.toggle('rot', play.board.face && play.sidePos(p.side) === 'top');
        $$('#promo [data-t]').forEach(b => { b.innerHTML = pieceSvg(+b.dataset.t | (p.side << 3)); });
      }
    },
    // ---- Phân tích ván (src/shared/app/80-analysis.js) ----
    ana: {
      // Điểm của engine tính theo phần trăm Tốt (100 = một Tốt). Ngưỡng chưa chính xác / sai lầm / sai lầm nặng theo cách quen dùng.
      AN: { CLAMP: 1000, INACC: 70, MIST: 150, BLUN: 300, UNIT: 100 },
      engineSize: '',
      unitNote: ', đơn vị là Tốt',
      firstClass: '',
      init() { /* không có nút riêng */ },
      // Bài "Lỗi của bạn": một nước đúng (best hoặc nước ngang điểm trong accept), "Xem tiếp" chạy biến pv (nước UCI, tối đa 7)
      mineItem(pos, g, i, pvAll, id) {
        const pv = (pvAll || []).slice(0, 7);
        if (!pv.length || !pos.parse(g.ana.bm[i])) return null;
        const pm = pos.parse(g.moves[i]);
        return { id, fen: pos.fen(), side: pos.side === 0 ? 'w' : 'b', best: g.ana.bm[i], accept: g.ana.acc[i], pv, played: pm ? pos.san(pm) : '', loss: g.ana.ls[i], t: g.t, ok: 0 };
      }
    },
    // ---- Khởi động (src/shared/app/99-boot.js) ----
    boot: {
      // Cài đặt › Luôn phong Hậu
      settings() {
        $('#set-autoq').checked = !!Store.get('autoq', false);
        $('#set-autoq').onchange = e => Store.set('autoq', e.target.checked);
      },
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
      expose() { return { Puz, Tac, Op, FSF, Ana }; }
    }
  };
