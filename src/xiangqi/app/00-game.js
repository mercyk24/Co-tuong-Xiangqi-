  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng (riêng, không có bản tương ứng bên cờ vua). Sơ đồ: docs/CAU-TRUC.md
  // 00-game.js — Cấu hình riêng của CỜ TƯỚNG cho các phần dùng chung (src/shared/): tên app, tiền tố lưu trữ, mã phòng
  // trên điểm hẹn, engine mạnh. Cờ vua có tệp cùng tên trong src/chess/ với giá trị khác, nên hai app không bao giờ lẫn dữ liệu.
  const RULES = XQ;   // lõi luật cờ tướng (src/xiangqi/core/xq.js)
  const GAME = {
    id: 'xiangqi',
    debug: '__xq',   // tên đối tượng gắn vào window cho kiểm tra tự động
    sides: ['Đỏ', 'Đen'],   // tên hai bên, bên 0 đi trước
    title: 'Cờ Tướng Luyện Tập',
    app: 'co-tuong-luyen-tap',          // tên trong tệp sao lưu: chỉ khôi phục được tệp của đúng loại cờ
    store: 'xq_',                        // tiền tố localStorage (giữ nguyên từ trước để không mất dữ liệu người dùng)
    netPrefix: 'xqvn-',                  // tiền tố mã máy trên điểm hẹn
    keys: ['ai_side', 'ana_mode', 'games', 'mine', 'net_side', 'net_watch', 'nmode', 'op_stats', 'play_clock', 'play_level', 'play_mode',
      'play_open', 'play_user', 'play_warn', 'puz_done', 'done', 'puz_filter', 'tab', 'tac_band', 'tac_best', 'tac_done', 'tac_hist'],
    fmt: msg => ndt(msg),                // thông báo có ký hiệu Hán: đổi sang cách ghi người dùng chọn
    fsf: {
      dir: '../engine/', nnue: 'xiangqi-c07e94a5c7cb.nnue', variant: 'xiangqi',
      fen(f) { const t = f.trim().split(/\s+/); return t[0] + ' ' + (t[1] || 'w') + ' - - 0 1'; },
      // Fairy-Stockfish đánh số hàng từ 1, lõi của app đánh số từ 0
      toE(u) { return u.replace(/^([a-i])(\d)([a-i])(\d)/, (_, a, b, c, d) => a + (+b + 1) + c + (+d + 1)); },
      fromE(u) { const m = /^([a-i])(\d+)([a-i])(\d+)/.exec(u); return m ? m[1] + (+m[2] - 1) + m[3] + (+m[4] - 1) : ''; }
    }
  };
