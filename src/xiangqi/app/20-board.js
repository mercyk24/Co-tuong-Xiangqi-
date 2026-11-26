  // [CỜ TƯỚNG] Chỉ app cờ tướng dùng. Có bản song sinh bên cờ vua: src/chess/app/20-board.js (giống ~39%). Sửa lỗi ở phần giống nhau thì sửa cả bên kia. Sơ đồ: docs/CAU-TRUC.md
  // 20-board.js — Bàn cờ vẽ bằng SVG (lật bàn, đánh dấu nước vừa đi, gợi ý) và xử lý chọn quân chung.
  // ---------- Bàn cờ SVG ----------
  class Board {
    constructor(host, onSquare) {
      this.host = host; this.onSquare = onSquare; this.flip = false; this.face = false;
      this.cell = 70; this.px = 50; this.py = 62;
      this.W = 8 * this.cell + 2 * this.px; this.H = 9 * this.cell + 2 * this.py;
      host.innerHTML = '<svg class="board" viewBox="0 0 ' + this.W + ' ' + this.H + '" role="img" aria-label="Bàn cờ tướng"><g class="static"></g><g class="dyn"></g></svg>';
      this.svg = host.firstChild; this.gs = this.svg.querySelector('.static'); this.gd = this.svg.querySelector('.dyn');
      this.svg.addEventListener('pointerdown', e => {
        e.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (this.W / rect.width), py = (e.clientY - rect.top) * (this.H / rect.height);
        const dc = Math.round((px - this.px) / this.cell), dr = Math.round((py - this.py) / this.cell);
        if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return;
        const c = this.flip ? 8 - dc : dc, r = this.flip ? 9 - dr : dr;
        this.onSquare && this.onSquare(r * 9 + c);
      });
      this.drawStatic();
    }
    X(c) { return this.px + (this.flip ? 8 - c : c) * this.cell; }
    Y(r) { return this.py + (this.flip ? 9 - r : r) * this.cell; }
    setFlip(f) { this.flip = !!f; this.drawStatic(); }
    drawStatic() {
      const X0 = this.px, Y0 = this.py, c = this.cell, W = this.W, H = this.H;
      let s = '<rect x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="18" class="bd-bg"/>';
      s += '<g class="bd-line">';
      for (let r = 0; r < 10; r++) s += '<line x1="' + X0 + '" y1="' + (Y0 + r * c) + '" x2="' + (X0 + 8 * c) + '" y2="' + (Y0 + r * c) + '"/>';
      for (let k = 0; k < 9; k++) {
        const x = X0 + k * c;
        if (k === 0 || k === 8) s += '<line x1="' + x + '" y1="' + Y0 + '" x2="' + x + '" y2="' + (Y0 + 9 * c) + '"/>';
        else s += '<line x1="' + x + '" y1="' + Y0 + '" x2="' + x + '" y2="' + (Y0 + 4 * c) + '"/><line x1="' + x + '" y1="' + (Y0 + 5 * c) + '" x2="' + x + '" y2="' + (Y0 + 9 * c) + '"/>';
      }
      const dg = (r1, c1, r2, c2) => '<line x1="' + (X0 + c1 * c) + '" y1="' + (Y0 + r1 * c) + '" x2="' + (X0 + c2 * c) + '" y2="' + (Y0 + r2 * c) + '"/>';
      s += dg(0, 3, 2, 5) + dg(0, 5, 2, 3) + dg(7, 3, 9, 5) + dg(7, 5, 9, 3);
      // dấu chấm vị trí pháo/tốt
      const tick = (r, k) => {
        const cx = X0 + k * c, cy = Y0 + r * c, a = 7, l = 14; let t = '';
        for (const sx of [-1, 1]) {
          if ((k === 0 && sx === -1) || (k === 8 && sx === 1)) continue;
          for (const sy of [-1, 1]) t += '<polyline points="' + (cx + sx * (a + l)) + ',' + (cy + sy * a) + ' ' + (cx + sx * a) + ',' + (cy + sy * a) + ' ' + (cx + sx * a) + ',' + (cy + sy * (a + l)) + '"/>';
        }
        return t;
      };
      for (const k of [1, 7]) { s += tick(2, k) + tick(7, k); }
      for (const k of [0, 2, 4, 6, 8]) { s += tick(3, k) + tick(6, k); }
      s += '</g>';
      s += '<text class="river" x="' + (X0 + 2 * c) + '" y="' + (Y0 + 4.5 * c + 14) + '" text-anchor="middle">楚　河</text>';
      s += '<text class="river" x="' + (X0 + 6 * c) + '" y="' + (Y0 + 4.5 * c + 14) + '" text-anchor="middle">漢　界</text>';
      // nhãn cột
      const bottomRed = !this.flip;
      for (let dc = 0; dc < 9; dc++) {
        const fb = 9 - dc, ft = dc + 1, x = X0 + dc * c;
        const bl = bottomRed ? NUMS[fb - 1] : String(fb), tl = bottomRed ? String(ft) : NUMS[ft - 1];
        s += '<text class="fl" x="' + x + '" y="' + (H - 16) + '" text-anchor="middle">' + bl + '</text>';
        s += '<text class="fl" x="' + x + '" y="' + 26 + '" text-anchor="middle">' + tl + '</text>';
      }
      this.gs.innerHTML = s;
    }
    // st: {pos, last:[from,to], sel, targets:[], hint:[from,to]|null, hintFrom:sq}
    render(st) {
      const pos = st.pos;
      let s = '';
      const sqXY = q => [this.X(q % 9), this.Y((q / 9) | 0)];
      if (st.last) {
        for (const q of st.last) { const [x, y] = sqXY(q); s += '<rect class="last" x="' + (x - 33) + '" y="' + (y - 33) + '" width="66" height="66" rx="12"/>'; }
      }
      if (st.hint) {
        const [x1, y1] = sqXY(st.hint[0]), [x2, y2] = sqXY(st.hint[1]);
        s += '<rect class="hintbox" x="' + (x1 - 34) + '" y="' + (y1 - 34) + '" width="68" height="68" rx="12"/>';
        if (st.hint[1] !== undefined && st.hint[1] !== null && st.hint[1] !== st.hint[0]) {
          s += '<line class="hintline" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/><circle class="hintdot" cx="' + x2 + '" cy="' + y2 + '" r="14"/>';
        }
      }
      if (st.sel >= 0) { const [x, y] = sqXY(st.sel); s += '<circle class="selring" cx="' + x + '" cy="' + y + '" r="36"/>'; }
      // quân cờ
      let chk = -1;
      if (pos.inCheck(pos.side)) chk = pos.ks[pos.side];
      for (let q = 0; q < 90; q++) {
        const pc = pos.b[q]; if (!pc) continue;
        const [x, y] = sqXY(q), red = (pc >> 3) === 0;
        if (q === chk) s += '<circle class="chk" cx="' + x + '" cy="' + y + '" r="40"/>';
        const rot = this.face && (red ? this.flip : !this.flip) ? ' rotate(180)' : '';
        s += '<g class="pc ' + (red ? 'r' : 'b') + '" transform="translate(' + x + ',' + y + ')' + rot + '"><circle class="pc-o" r="32"/><circle class="pc-i" r="27"/><text class="pc-t" y="12" text-anchor="middle">' + glyph(pc) + '</text></g>';
      }
      if (st.targets) {
        for (const q of st.targets) {
          const [x, y] = sqXY(q);
          s += pos.b[q] ? '<circle class="tgt cap" cx="' + x + '" cy="' + y + '" r="36"/>' : '<circle class="tgt" cx="' + x + '" cy="' + y + '" r="9"/>';
        }
      }
      this.gd.innerHTML = s;
    }
  }

  // ---------- Điều khiển chọn ô chung ----------
  function trySelect(ctx, sq, side, onMove) {
    // ctx: {pos, sel, targets}; trả về true nếu thay đổi
    const pos = ctx.pos;
    if (ctx.sel >= 0 && ctx.targets.indexOf(sq) >= 0) {
      const m = (ctx.sel << 7) | sq;
      ctx.sel = -1; ctx.targets = [];
      onMove(m);
      return;
    }
    const pc = pos.b[sq];
    if (pc && (pc >> 3) === side && pos.side === side) {
      ctx.sel = sq;
      ctx.targets = pos.legalMoves().filter(m => (m >> 7) === sq).map(m => m & 127);
    } else { ctx.sel = -1; ctx.targets = []; }
  }

