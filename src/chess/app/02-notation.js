  // [CỜ VUA] Chỉ app cờ vua dùng (riêng, không có bản tương ứng bên cờ tướng). Sơ đồ: docs/CAU-TRUC.md
  // 02-notation.js — CỜ VUA: danh sách nước đi theo ký hiệu quốc tế SAN (Nf3, exd5, O-O, e8=Q+), đánh số 1. 1…
  function moveListHtml(notes, startSide, current, clickable) {
    // notes: mảng chuỗi SAN; startSide: 0 nếu nước đầu là Trắng
    let h = '';
    for (let i = 0; i < notes.length; i++) {
      const isWhite = ((i + startSide) % 2) === 0;
      if (isWhite) h += '<span class="mn">' + (Math.floor((i + startSide) / 2) + 1) + '.</span>';
      else if (i === 0) h += '<span class="mn">' + (Math.floor(startSide / 2) + 1) + '…</span>';
      h += '<span class="mv' + (i === current ? ' cur' : '') + (clickable ? ' ck' : '') + '" data-i="' + i + '">' + esc(notes[i]) + '</span>';
    }
    return h;
  }
  // Phần dùng chung gọi ndt() (một câu có ký hiệu nước) và nd1() (một nước) để cờ tướng đổi chữ Hán sang cách ghi người dùng
  // chọn. Cờ vua ghi SAN sẵn, giữ nguyên.
  function ndt(s) { return s; }
  function nd1(s) { return s; }
