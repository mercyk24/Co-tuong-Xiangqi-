  // [CỜ VUA] Chỉ app cờ vua dùng (riêng, không có bản tương ứng bên cờ tướng). Sơ đồ: docs/CAU-TRUC.md
  // 00-game.js — Cấu hình riêng của CỜ VUA cho các phần dùng chung (src/shared/). Khác hẳn cờ tướng: tiền tố lưu trữ "xc_",
  // mã máy trên điểm hẹn "xcvn-", tệp sao lưu "co-vua-luyen-tap", engine mạnh chạy biến thể chess.
  const RULES = CH;   // lõi luật cờ vua (src/chess/core/chess.js)
  const GAME = {
    id: 'chess',
    debug: '__xc',   // tên đối tượng gắn vào window cho kiểm tra tự động
    sides: ['Trắng', 'Đen'],   // tên hai bên, bên 0 đi trước
    title: 'Cờ Vua Luyện Tập',
    app: 'co-vua-luyen-tap',
    store: 'xc_',
    netPrefix: 'xcvn-',
    keys: ['ai_side', 'ana_mode', 'games', 'mine', 'net_side', 'net_watch', 'op_stats', 'play_clock', 'play_level', 'play_mode',
      'play_open', 'play_user', 'play_warn', 'puz_done', 'puz_filter', 'tab', 'tac_band', 'tac_best', 'tac_done', 'tac_hist', 'board_flip', 'autoq'],
    fsf: {
      dir: '../engine/', nnue: null, variant: 'chess',
      fen(f) { return f; },          // cờ vua: FEN đầy đủ (quyền nhập thành, bắt tốt qua đường) gửi nguyên cho engine
      toE(u) { return u; },          // nước dạng UCI giống nhau
      fromE(u) { return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u) ? u : ''; }
    }
  };
