  // [CỜ VÂY] Chỉ app cờ vây dùng. Cùng giao diện lớp Board với cờ tướng / cờ vua (render, flip, setFlip, face) để phần dùng chung
  // (40-play.js) vẽ được, nhưng cách vẽ khác hẳn. Sơ đồ: docs/CAU-TRUC.md
  // 20-board.js — CỜ VÂY: bàn 9×9 / 13×13 / 19×19 (hoặc bàn nhỏ trong bài học) vẽ bằng SVG: lưới, sao, toạ độ, quân đá,
  // dấu nước vừa đi, quân "nháp" chờ bấm lần hai, gợi ý, đánh dấu quân chết và đất khi đếm điểm, nhóm quân mục tiêu của bài tập.
  // Bấm vào bàn: gọi onSquare(p) với p là điểm gần nhất (0..N²-1).
  const HOSHI = { 9: [2, 6, 4], 13: [3, 9, 6], 19: [3, 9, 15] };
  let boardSeq = 0;   // mỗi bàn một mã riêng cho dải màu của quân (bàn đang ẩn thì trình duyệt không vẽ dải màu mượn từ bàn đó)
  class Board {
    constructor(host, onSquare) {
      this.host = host; this.onSquare = onSquare; this.flip = false; this.face = false; this.n = 0;
      this.cell = 40; this.m = 46; this.uid = ++boardSeq;
      const u = this.uid;
      host.innerHTML = '<svg class="board gboard" role="img" aria-label="Bàn cờ vây">' +
        '<defs><radialGradient id="gsb' + u + '" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6b6b6b"/><stop offset="1" stop-color="#0d0d0d"/></radialGradient>' +
        '<radialGradient id="gsw' + u + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".75" stop-color="#e6e2d8"/><stop offset="1" stop-color="#bdb8ab"/></radialGradient></defs>' +
        '<g class="static"></g><g class="dyn"></g></svg>';
      this.svg = host.firstChild; this.gs = this.svg.querySelector('.static'); this.gd = this.svg.querySelector('.dyn');
      this.svg.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!this.n) return;
        const rect = this.svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (this.W / rect.width), py = (e.clientY - rect.top) * (this.W / rect.height);
        const dc = Math.round((px - this.m) / this.cell), dr = Math.round((py - this.m) / this.cell);
        if (dc < 0 || dc >= this.n || dr < 0 || dr >= this.n) return;
        const c = this.flip ? this.n - 1 - dc : dc, r = this.flip ? this.n - 1 - dr : dr;
        this.onSquare && this.onSquare(r * this.n + c);
      });
    }
    X(c) { return this.m + (this.flip ? this.n - 1 - c : c) * this.cell; }
    Y(r) { return this.m + (this.flip ? this.n - 1 - r : r) * this.cell; }
    setFlip(f) { this.flip = !!f; if (this.n) this.drawStatic(); }
    size(n) {
      if (n === this.n) return;
      this.n = n; this.W = (n - 1) * this.cell + 2 * this.m;
      this.svg.setAttribute('viewBox', '0 0 ' + this.W + ' ' + this.W);
      this.svg.setAttribute('aria-label', 'Bàn cờ vây ' + n + '×' + n);
      this.svg.classList.toggle('g19', n >= 17); this.svg.classList.toggle('g13', n >= 12 && n < 17);
      this.drawStatic();
    }
    drawStatic() {
      const n = this.n, c = this.cell, a = this.m, b = this.m + (n - 1) * c;
      let s = '<rect class="gwood" x="0" y="0" width="' + this.W + '" height="' + this.W + '" rx="10"/>';
      for (let i = 0; i < n; i++) {
        const v = a + i * c;
        s += '<line class="gl1' + (i === 0 || i === n - 1 ? ' ge' : '') + '" x1="' + a + '" y1="' + v + '" x2="' + b + '" y2="' + v + '"/>';
        s += '<line class="gl1' + (i === 0 || i === n - 1 ? ' ge' : '') + '" x1="' + v + '" y1="' + a + '" x2="' + v + '" y2="' + b + '"/>';
      }
      const h = HOSHI[n];
      if (h) {
        const pts = n === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] : h.flatMap(r => h.map(k => [r, k]));
        for (const [r, k] of pts) s += '<circle class="hoshi" cx="' + this.X(k) + '" cy="' + this.Y(r) + '" r="' + (n >= 17 ? 4 : 5) + '"/>';
      } else if (n % 2) s += '<circle class="hoshi" cx="' + this.X((n - 1) / 2) + '" cy="' + this.Y((n - 1) / 2) + '" r="5"/>';
      // Toạ độ: chữ cột (bỏ I) trên và dưới, số hàng (đếm từ dưới lên) trái và phải
      for (let i = 0; i < n; i++) {
        const col = GO.COLS[i], row = n - i;
        s += '<text class="gco" x="' + this.X(i) + '" y="' + (a - 28) + '" text-anchor="middle">' + col + '</text>';
        s += '<text class="gco" x="' + this.X(i) + '" y="' + (b + 38) + '" text-anchor="middle">' + col + '</text>';
        s += '<text class="gco" x="' + (a - 32) + '" y="' + (this.Y(i) + 5) + '" text-anchor="middle">' + row + '</text>';
        s += '<text class="gco" x="' + (b + 32) + '" y="' + (this.Y(i) + 5) + '" text-anchor="middle">' + row + '</text>';
      }
      this.gs.innerHTML = s;
    }
    stone(p, col, cls) {
      const r = (p / this.n) | 0, k = p % this.n;
      return '<circle class="st ' + (col ? 'sw' : 'sb') + (cls ? ' ' + cls : '') + '" fill="url(#' + (col ? 'gsw' : 'gsb') + this.uid + ')" cx="' + this.X(k) + '" cy="' + this.Y(r) + '" r="' + (this.cell * 0.47) + '"/>';
    }
    // st: { pos, last:[p,p]|null, sel (điểm quân nháp, -1 nếu không), hint:[p,p]|null,
    //       dead: Set điểm quân chết, own: mảng chủ đất (0 Đen, 1 Trắng, -1 không ai) để vẽ ô vuông nhỏ,
    //       target: Set điểm của nhóm mục tiêu (bài bắt quân), marks: { p: 'A' } chữ đánh dấu (bài học) }
    render(st) {
      const pos = st.pos, n = pos.n, c = this.cell;
      this.size(n);
      let s = '';
      const XY = p => [this.X(p % n), this.Y((p / n) | 0)];
      for (let p = 0; p < n * n; p++) {
        const a = pos.at(p); if (a < 0) continue;
        const dead = st.dead && st.dead.has(p);
        s += this.stone(p, a, dead ? 'dead' : '');
        if (st.target && st.target.has(p)) { const [x, y] = XY(p); s += '<circle class="tgtm ' + (a ? 'on-w' : 'on-b') + '" cx="' + x + '" cy="' + y + '" r="' + (c * 0.17) + '"/>'; }
      }
      if (st.own) {
        for (let p = 0; p < n * n; p++) {
          const o = st.own[p]; if (o !== 0 && o !== 1) continue;
          const a = pos.at(p); if (a >= 0 && !(st.dead && st.dead.has(p))) continue;
          const [x, y] = XY(p), h = c * 0.18;
          s += '<rect class="terr ' + (o ? 'tw' : 'tb') + '" x="' + (x - h) + '" y="' + (y - h) + '" width="' + (2 * h) + '" height="' + (2 * h) + '"/>';
        }
      }
      const lm = st.last && st.last[1];
      if (lm !== undefined && lm !== null && lm >= 0 && pos.at(lm) >= 0) { const [x, y] = XY(lm); s += '<circle class="lastm ' + (pos.at(lm) ? 'on-w' : 'on-b') + '" cx="' + x + '" cy="' + y + '" r="' + (c * 0.2) + '"/>'; }
      if (st.sel >= 0 && pos.at(st.sel) < 0) s += this.stone(st.sel, pos.side, 'ghost');
      if (st.hint && st.hint[1] >= 0) { const [x, y] = XY(st.hint[1]); s += '<circle class="hintg" cx="' + x + '" cy="' + y + '" r="' + (c * 0.42) + '"/>'; }
      if (st.marks) for (const k of Object.keys(st.marks)) {
        const p = +k, [x, y] = XY(p), a = pos.at(p);
        if (a < 0) s += '<circle class="mkbg" cx="' + x + '" cy="' + y + '" r="' + (c * 0.3) + '"/>';
        s += '<text class="mk ' + (a === 0 ? 'on-b' : 'on-w') + '" x="' + x + '" y="' + (y + 7) + '" text-anchor="middle">' + esc(st.marks[k]) + '</text>';
      }
      this.gd.innerHTML = s;
    }
  }
