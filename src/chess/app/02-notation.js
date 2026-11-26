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
