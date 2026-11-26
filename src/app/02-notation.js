  // 02-notation.js — Cờ tướng: chữ Hán của quân, chuyển ký hiệu nước đi sang tiếng Việt, danh sách nước, cài đặt cách ghi nước.
  // ---------- Hiển thị quân & ký hiệu ----------
  const HAN_RED = ['', '俥', '傌', '相', '仕', '帥', '炮', '兵'];
  const HAN_BLK = ['', '車', '馬', '象', '士', '將', '砲', '卒'];
  const glyph = p => ((p >> 3) ? HAN_BLK : HAN_RED)[p & 7];
  const VI_PIECE = { '車': 'Xe', '傌': 'Mã', '馬': 'Mã', '相': 'Tượng', '象': 'Tượng', '仕': 'Sĩ', '士': 'Sĩ', '帥': 'Tướng', '將': 'Tướng', '炮': 'Pháo', '兵': 'Tốt', '卒': 'Tốt' };
  const VI_DIR = { '進': 'tiến', '退': 'thoái', '平': 'bình' };
  const VI_PRE = { '前': 'trước', '後': 'sau', '中': 'giữa', '二': 'thứ hai', '三': 'thứ ba', '四': 'thứ tư' };
  const NUMS = '一二三四五六七八九';
  const num = ch => { const k = NUMS.indexOf(ch); return k >= 0 ? String(k + 1) : ch; };
  function vi(han) {
    const c = Array.from(han);
    if (c.length < 4) return han;
    if (VI_PRE[c[0]] !== undefined && VI_PIECE[c[1]]) return VI_PIECE[c[1]] + ' ' + VI_PRE[c[0]] + ' ' + VI_DIR[c[2]] + ' ' + num(c[3]);
    return (VI_PIECE[c[0]] || c[0]) + ' ' + num(c[1]) + ' ' + (VI_DIR[c[2]] || c[2]) + ' ' + num(c[3]);
  }
  // Hiển thị ký hiệu nước đi theo cài đặt: 'vi' (mặc định, tiếng Việt), 'han' (chữ Hán), 'both' (cả hai).
  const NOTE_RE = /(?:[前後中][車俥傌馬炮砲兵卒相象仕士]|[車俥傌馬炮砲相象仕士帥將兵卒][一二三四五六七八九1-9])[進退平][一二三四五六七八九1-9]/g;
  const noteMode = () => Store.get('nmode', 'vi');
  function ndt(text) { const m = noteMode(); if (m === 'han' || !text) return text; let r = String(text).replace(NOTE_RE, s => m === 'both' ? s + ' (' + vi(s) + ')' : vi(s)); if (m === 'vi') r = r.replace(/\s*\([一-鿿]+\)/g, ''); return r; }
  const nd1 = han => (noteMode() === 'han' ? han : vi(han));
  function moveListHtml(notes, startSide, current, clickable) {
    // notes: mảng chuỗi ký hiệu; startSide: 0 nếu nước đầu là Đỏ
    let h = '';
    for (let i = 0; i < notes.length; i++) {
      const isRed = ((i + startSide) % 2) === 0;
      if (isRed) h += '<span class="mn">' + (Math.floor((i + startSide) / 2) + 1) + '.</span>';
      else if (i === 0) h += '<span class="mn">' + (Math.floor(startSide / 2) + 1) + '…</span>';
      h += '<span class="mv' + (i === current ? ' cur' : '') + (clickable ? ' ck' : '') + (isRed ? ' red' : '') + '" data-i="' + i + '">' + esc(nd1(notes[i])) + '</span>';
    }
    return h;
  }


  function applyNmode(v) {
    Store.set('nmode', v);
    const sel = $('#set-nmode'); if (sel) sel.value = v;
    const b = $('#ana-nm'); if (b) b.textContent = 'Ghi nước: ' + { vi: 'Việt', han: 'Hán', both: 'Cả hai' }[v];
    try { Play.draw(); } catch (e) { /* bỏ qua */ }
    try { if (Ana.cur) Ana.draw(); } catch (e) { /* bỏ qua */ }
    try { Tac.renderList(); if (Tac.cur && !$('#tac-play').hidden) Tac.draw(); } catch (e) { /* bỏ qua */ }
    try { Op.renderList(); if (!$('#op-play').hidden) Op.draw(); } catch (e) { /* bỏ qua */ }
  }

