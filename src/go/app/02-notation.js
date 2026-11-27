  // [CỜ VÂY] Chỉ app cờ vây dùng (riêng). Sơ đồ: docs/CAU-TRUC.md
  // 02-notation.js — CỜ VÂY: danh sách nước đi theo toạ độ quốc tế (D4, Q16; cột bỏ chữ I), đánh số 1. 2. 3. từng nước
  // (cờ vây thường đếm từng quân đặt xuống, không gộp cặp như cờ vua).
  // marks (tuỳ chọn, Ván đã lưu sau khi phân tích cả ván): marks[i] = '?' (nước dở) hoặc '??' (nước hỏng) thì ghi dấu và tô màu
  function moveListHtml(notes, startSide, current, clickable, marks) {
    let h = '';
    for (let i = 0; i < notes.length; i++) {
      const black = ((i + startSide) % 2) === 0, mk = marks && marks[i] ? marks[i] : '';
      h += '<span class="mn">' + (i + 1) + '.</span><span class="mv ' + (black ? 'mb' : 'mw') + (i === current ? ' cur' : '') + (clickable ? ' ck' : '') + (mk ? (mk === '??' ? ' mk2' : ' mk1') : '') + '" data-i="' + i + '">' + esc(notes[i] + mk) + '</span>';
    }
    return h;
  }
  // Không có ndt() / nd1() như cờ tướng, cờ vua: hai hàm đó chỉ 80-analysis.js dùng, mà app cờ vây không có tệp này.
