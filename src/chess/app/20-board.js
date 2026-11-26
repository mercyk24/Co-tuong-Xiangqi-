  // [CỜ VUA] Chỉ app cờ vua dùng. Có bản song sinh bên cờ tướng: src/xiangqi/app/20-board.js (giống ~39%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 20-board.js — CỜ VUA: bàn 8×8 vẽ bằng SVG (quân đứng trong ô, lật bàn, đánh dấu nước vừa đi, gợi ý, ô bị chiếu)
  // và xử lý chọn quân, kể cả nước phong cấp (một ô đích có tới bốn nước: phong Hậu, Xe, Tượng, Mã).
  // Hình quân là các <symbol id="cp-wK"…> nhúng sẵn trong trang (build lấy từ src/chess/pieces/).
  const PIECE_ID = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
  const pieceRef = code => '#cp-' + ((code >> 3) ? 'b' : 'w') + PIECE_ID[code & 7];
  // Hình một quân dùng riêng (bảng phong cấp, danh sách quân bị ăn…)
  const pieceSvg = code => '<svg viewBox="0 0 45 45" class="pcico" aria-hidden="true"><use href="' + pieceRef(code) + '"/></svg>';
  class Board {
    constructor(host, onSquare) {
      this.host = host; this.onSquare = onSquare; this.flip = false; this.face = false;
      this.cell = 80; this.W = this.H = 8 * this.cell;
      host.innerHTML = '<svg class="board cboard" viewBox="0 0 ' + this.W + ' ' + this.H + '" role="img" aria-label="Bàn cờ vua"><g class="static"></g><g class="dyn"></g></svg>';
      this.svg = host.firstChild; this.gs = this.svg.querySelector('.static'); this.gd = this.svg.querySelector('.dyn');
      this.svg.addEventListener('pointerdown', e => {
        e.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (this.W / rect.width), py = (e.clientY - rect.top) * (this.H / rect.height);
        const dc = Math.floor(px / this.cell), dr = Math.floor(py / this.cell);
        if (dc < 0 || dc > 7 || dr < 0 || dr > 7) return;
        const c = this.flip ? 7 - dc : dc, r = this.flip ? 7 - dr : dr;
        this.onSquare && this.onSquare(CH.sq(r, c));
      });
      this.drawStatic();
    }
    X(c) { return (this.flip ? 7 - c : c) * this.cell; }
    Y(r) { return (this.flip ? 7 - r : r) * this.cell; }
    setFlip(f) { this.flip = !!f; this.drawStatic(); }
    drawStatic() {
      const c = this.cell;
      let s = '';
      for (let r = 0; r < 8; r++) {
        for (let k = 0; k < 8; k++) s += '<rect class="' + ((r + k) & 1 ? 'sq-d' : 'sq-l') + '" x="' + this.X(k) + '" y="' + this.Y(r) + '" width="' + c + '" height="' + c + '"/>';
      }
      // nhãn cột (a–h) ở hàng dưới cùng, nhãn hàng (1–8) ở cột trái, nằm trong ô như bàn cờ thật
      for (let k = 0; k < 8; k++) {
        const col = this.flip ? 7 - k : k, light = ((7 + col) & 1) === 0;
        s += '<text class="coord ' + (light ? 'on-l' : 'on-d') + '" x="' + (k * c + c - 6) + '" y="' + (8 * c - 6) + '" text-anchor="end">' + 'abcdefgh'[col] + '</text>';
      }
      for (let r = 0; r < 8; r++) {
        const row = this.flip ? 7 - r : r, col = this.flip ? 7 : 0, light = ((row + col) & 1) === 0;
        s += '<text class="coord ' + (light ? 'on-l' : 'on-d') + '" x="5" y="' + (r * c + 18) + '">' + (8 - row) + '</text>';
      }
      this.gs.innerHTML = s;
    }
    // st: {pos, last:[from,to], sel, targets:[], hint:[from,to]|null}
    render(st) {
      const pos = st.pos, c = this.cell;
      let s = '';
      const XY = q => [this.X(CH.COL(q)), this.Y(CH.ROW(q))];
      const box = (q, cls) => { const [x, y] = XY(q); return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + c + '" height="' + c + '"/>'; };
      if (st.last) for (const q of st.last) s += box(q, 'last');
      if (st.sel >= 0) s += box(st.sel, 'selsq');
      if (st.hint) {
        s += box(st.hint[0], 'hintbox');
        if (st.hint[1] !== undefined && st.hint[1] !== null && st.hint[1] !== st.hint[0]) {
          const [x1, y1] = XY(st.hint[0]), [x2, y2] = XY(st.hint[1]), h = c / 2;
          s += '<line class="hintline" x1="' + (x1 + h) + '" y1="' + (y1 + h) + '" x2="' + (x2 + h) + '" y2="' + (y2 + h) + '"/><circle class="hintdot" cx="' + (x2 + h) + '" cy="' + (y2 + h) + '" r="13"/>';
        }
      }
      if (pos.inCheck(pos.side)) { const [x, y] = XY(pos.ks[pos.side]); s += '<circle class="chk" cx="' + (x + c / 2) + '" cy="' + (y + c / 2) + '" r="' + (c * 0.48) + '"/>'; }
      for (let r = 0; r < 8; r++) {
        for (let k = 0; k < 8; k++) {
          const q = CH.sq(r, k), pc = pos.b[q];
          if (!pc) continue;
          const [x, y] = XY(q), white = (pc >> 3) === 0;
          const rot = this.face && (white ? this.flip : !this.flip) ? ' transform="rotate(180 ' + (x + c / 2) + ' ' + (y + c / 2) + ')"' : '';
          s += '<use class="cp" href="' + pieceRef(pc) + '" x="' + (x + 2) + '" y="' + (y + 2) + '" width="' + (c - 4) + '" height="' + (c - 4) + '"' + rot + '/>';
        }
      }
      if (st.targets) {
        for (const q of st.targets) {
          const [x, y] = XY(q);
          s += pos.b[q] || (q === pos.ep && (pos.b[st.sel] & 7) === CH.T.P)
            ? '<circle class="tgt cap" cx="' + (x + c / 2) + '" cy="' + (y + c / 2) + '" r="' + (c / 2 - 4) + '"/>'
            : '<circle class="tgt" cx="' + (x + c / 2) + '" cy="' + (y + c / 2) + '" r="12"/>';
        }
      }
      this.gd.innerHTML = s;
    }
  }

  // ---------- Điều khiển chọn ô chung ----------
  // Bấm quân của mình rồi bấm ô đích. onMove(m, alts): alts là mọi nước cùng ô đi/ô đến (nhiều hơn 1 khi phong cấp);
  // m là nước mặc định (phong Hậu).
  // Phong cấp trên các bàn cờ luyện tập (Chiếu hết, Chiến thuật): hiện bảng chọn quân ngay dưới bàn cờ.
  // Bàn cờ của Trang chủ dùng bảng #promo riêng (40-play.js). Bật "Luôn phong Hậu" thì không hỏi.
  const PROMO_NAME = { 5: 'Hậu', 4: 'Xe', 3: 'Tượng', 2: 'Mã' };
  function closePromo() { const o = document.getElementById('promo-x'); if (o) o.remove(); }
  function askPromo(boardEl, side, alts, pick) {
    closePromo();
    if (alts.length < 2 || Store.get('autoq', false)) { pick(alts.find(m => CH.mPromo(m) === CH.T.Q) || alts[0]); return; }
    const el = document.createElement('div');
    el.className = 'promo'; el.id = 'promo-x';
    el.innerHTML = '<p>Phong cấp thành quân nào?</p><div class="promo-row">' +
      [5, 4, 3, 2].map(t => '<button data-t="' + t + '" aria-label="' + PROMO_NAME[t] + '">' + pieceSvg(t | (side << 3)) + '</button>').join('') +
      '</div><button class="btn sm" data-t="0" style="margin-top:6px">Huỷ</button>';
    el.querySelectorAll('[data-t]').forEach(b => {
      b.onclick = () => { const t = +b.dataset.t; closePromo(); const m = t ? alts.find(x => CH.mPromo(x) === t) : 0; if (m) pick(m); };
    });
    boardEl.insertAdjacentElement('afterend', el);
  }
  function trySelect(ctx, sq, side, onMove) {
    const pos = ctx.pos;
    if (ctx.sel >= 0 && ctx.targets.indexOf(sq) >= 0) {
      const from = ctx.sel;
      const alts = pos.legalMoves().filter(m => CH.mFrom(m) === from && CH.mTo(m) === sq);
      ctx.sel = -1; ctx.targets = [];
      if (!alts.length) return;
      onMove(alts.find(m => CH.mPromo(m) === CH.T.Q) || alts[0], alts);
      return;
    }
    const pc = pos.b[sq];
    if (pc && (pc >> 3) === side && pos.side === side) {
      ctx.sel = sq;
      const t = []; for (const m of pos.legalMoves()) if (CH.mFrom(m) === sq && t.indexOf(CH.mTo(m)) < 0) t.push(CH.mTo(m));
      ctx.targets = t;
    } else { ctx.sel = -1; ctx.targets = []; }
  }
