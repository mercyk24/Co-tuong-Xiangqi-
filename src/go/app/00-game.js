  // [CỜ VÂY] Chỉ app cờ vây dùng (riêng). Sơ đồ: docs/CAU-TRUC.md
  // 00-game.js — Cấu hình riêng của CỜ VÂY cho các phần dùng chung (src/shared/): tiền tố lưu trữ "xv_", mã máy trên điểm hẹn
  // "xgvn-", tệp sao lưu "co-vay-luyen-tap". Cờ vây không có engine Fairy-Stockfish (không có GAME.fsf, build bỏ 30-fsf.js
  // và 80-analysis.js); máy chơi là Monte-Carlo tự viết trong lõi src/go/core/go.js.
  const RULES = GO;   // lõi luật cờ vây (src/go/core/go.js)
  const GAME = {
    id: 'go',
    debug: '__xv',   // tên đối tượng gắn vào window cho kiểm tra tự động
    sides: ['Đen', 'Trắng'],   // tên hai bên, bên 0 (Đen) đi trước
    title: 'Cờ Vây Luyện Tập',
    app: 'co-vay-luyen-tap',
    store: 'xv_',
    netPrefix: 'xgvn-',
    puzName: 'bắt quân',   // tên bài tập trong lời tóm tắt sao lưu (cờ tướng, cờ vua: "chiếu hết")
    keys: ['ai_side', 'games', 'net_side', 'net_watch', 'play_clock', 'play_level', 'play_mode', 'play_user', 'play_warn',
      'puz_done', 'puz_filter', 'les_done', 'tab', 'go_size', 'go_var', 'go_confirm']
  };
