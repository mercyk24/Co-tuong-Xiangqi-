// [CỜ VUA] Lõi luật cờ vua, chỉ app cờ vua và công cụ tools/chess/ dùng. Sơ đồ: docs/CAU-TRUC.md
/* chess.js - Lõi CỜ VUA: luật đi đầy đủ (nhập thành, bắt tốt qua đường, phong cấp), luật hòa, ký hiệu SAN,
 * FEN, nước dạng UCI, engine alpha-beta cho cấp 1–5.
 * KHÔNG dùng chung gì với lõi cờ tướng (xq.js): bàn 8×8, quân và luật khác hẳn.
 * Chạy được trong trình duyệt, Web Worker và Node. */
(function (root) {
  'use strict';

  // ---------- Hằng số ----------
  // Loại quân; quân Đen = loại + 8 (bit 3). Trắng đi trước (side 0), Đen side 1.
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const WHITE = 0, BLACK = 1;
  // Ô theo kiểu 0x88: ô = hàng*16 + cột. Hàng 0 là hàng 8 (phía Đen, trên cùng), hàng 7 là hàng 1 (phía Trắng). Cột 0 là cột a.
  const sq = (r, c) => r * 16 + c;
  const ROW = s => s >> 4, COL = s => s & 7;
  const onBoard = s => (s & 0x88) === 0;
  const FILES = 'abcdefgh';
  const sqName = s => FILES[s & 7] + (8 - (s >> 4));
  const sqParse = n => (/^[a-h][1-8]$/.test(n) ? sq(8 - +n[1], FILES.indexOf(n[0])) : -1);
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FEN_CH = { p: P, n: N, b: B, r: R, q: Q, k: K };
  const CH_FEN = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
  const SAN_CH = ['', '', 'N', 'B', 'R', 'Q', 'K'];
  const N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  const B_OFF = [-17, -15, 15, 17];
  const R_OFF = [-16, -1, 1, 16];
  const K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  // Quyền nhập thành: 1 Trắng cánh Vua, 2 Trắng cánh Hậu, 4 Đen cánh Vua, 8 Đen cánh Hậu
  const WK = 1, WQ = 2, BK = 4, BQ = 8;
  const CMASK = new Int8Array(128).fill(15);
  CMASK[sq(7, 4)] = 15 & ~(WK | WQ); CMASK[sq(7, 7)] = 15 & ~WK; CMASK[sq(7, 0)] = 15 & ~WQ;
  CMASK[sq(0, 4)] = 15 & ~(BK | BQ); CMASK[sq(0, 7)] = 15 & ~BK; CMASK[sq(0, 0)] = 15 & ~BQ;

  // Nước đi là số nguyên: (từ << 7) | đến | (quân phong cấp << 14)
  const mFrom = m => (m >> 7) & 127, mTo = m => m & 127, mPromo = m => m >> 14;
  const mk = (f, t, pr) => (f << 7) | t | ((pr || 0) << 14);
  // Dạng chữ UCI: e2e4, e7e8q
  function mvStr(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? CH_FEN[mPromo(m)] : ''); }

  // ---------- Băm Zobrist (hai số 32 bit) ----------
  let seed = 0x9e3779b9;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return (t ^ t >>> 14) >>> 0 | 0; }
  const ZP_LO = [], ZP_HI = [];
  for (let p = 0; p < 16; p++) { ZP_LO.push(new Int32Array(128)); ZP_HI.push(new Int32Array(128)); for (let s = 0; s < 128; s++) { ZP_LO[p][s] = rnd(); ZP_HI[p][s] = rnd(); } }
  const ZSIDE_LO = rnd(), ZSIDE_HI = rnd();
  const ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
  const ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }

  // ---------- Đánh giá: giá trị quân + bảng vị trí (nhìn từ phía Trắng, hàng 0 = hàng 8) ----------
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  const PST = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
  ];
  const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const PAWN_EG = [0, 0, 0, 0, 0, 0, 0, 0, 90, 90, 90, 90, 90, 90, 90, 90, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30,
    15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  // Điểm (mg, eg) của quân `code` ở ô s, theo phía Trắng (Đen mang dấu âm)
  const MG = [], EG = [];
  for (let code = 0; code < 16; code++) {
    MG.push(new Int16Array(128)); EG.push(new Int16Array(128));
    const t = code & 7, black = code >> 3;
    if (!t || t > 6) continue;
    for (let s = 0; s < 128; s++) {
      if (!onBoard(s)) continue;
      const r = ROW(s), c = COL(s), i = (black ? 7 - r : r) * 8 + c;
      let mg = VAL[t] + PST[t][i], eg = VAL[t] + (t === K ? KING_EG[i] : t === P ? PST[t][i] / 2 + PAWN_EG[i] + 20 : PST[t][i]);
      if (black) { mg = -mg; eg = -eg; }
      MG[code][s] = mg; EG[code][s] = eg;
    }
  }
  const MATE = 30000, INF = 32000;

  // ---------- Thế cờ ----------
  class Pos {
    constructor() {
      this.b = new Int8Array(128);
      this.side = WHITE; this.cr = 0; this.ep = -1; this.hm = 0; this.fm = 1;
      this.ks = [-1, -1];
      this.mg = 0; this.eg = 0; this.ph = 0;
      this.lo = 0; this.hi = 0;
      this.mv = []; this.st = []; this.hl = []; this.hh = [];
    }

    static fromFen(fen) { const p = new Pos(); p.loadFen(fen || START_FEN); return p; }

    loadFen(fen) {
      this.b.fill(0); this.ks = [-1, -1]; this.mg = 0; this.eg = 0; this.ph = 0; this.lo = 0; this.hi = 0;
      this.mv = []; this.st = []; this.hl = []; this.hh = [];
      const parts = String(fen).trim().split(/\s+/);
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('FEN sai: cần 8 hàng');
      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') { c += +ch; continue; }
          const low = ch.toLowerCase(), t = FEN_CH[low];
          if (!t || c > 7) throw new Error('FEN sai: ' + ch);
          this._put(ch === low ? t + 8 : t, sq(r, c));
          c++;
        }
        if (c !== 8) throw new Error('FEN sai: hàng ' + (8 - r) + ' có ' + c + ' cột');
      }
      if (this.ks[0] < 0 || this.ks[1] < 0) throw new Error('FEN sai: thiếu Vua');
      this.side = parts[1] === 'b' ? BLACK : WHITE;
      this.cr = 0;
      for (const ch of (parts[2] || '-')) this.cr |= ch === 'K' ? WK : ch === 'Q' ? WQ : ch === 'k' ? BK : ch === 'q' ? BQ : 0;
      // bỏ quyền nhập thành không khớp vị trí Vua, Xe
      const b = this.b;
      if (b[sq(7, 4)] !== K) this.cr &= ~(WK | WQ);
      if (b[sq(7, 7)] !== R) this.cr &= ~WK;
      if (b[sq(7, 0)] !== R) this.cr &= ~WQ;
      if (b[sq(0, 4)] !== K + 8) this.cr &= ~(BK | BQ);
      if (b[sq(0, 7)] !== R + 8) this.cr &= ~BK;
      if (b[sq(0, 0)] !== R + 8) this.cr &= ~BQ;
      this.ep = parts[3] && parts[3] !== '-' ? sqParse(parts[3]) : -1;
      this.hm = parts[4] !== undefined ? (+parts[4] || 0) : 0;
      this.fm = parts[5] !== undefined ? Math.max(1, +parts[5] || 1) : 1;
      if (this.side) { this.lo ^= ZSIDE_LO; this.hi ^= ZSIDE_HI; }
      this.lo ^= ZC_LO[this.cr]; this.hi ^= ZC_HI[this.cr];
      this._epHash();
    }

    _put(code, s) {
      this.b[s] = code;
      this.lo ^= ZP_LO[code][s]; this.hi ^= ZP_HI[code][s];
      this.mg += MG[code][s]; this.eg += EG[code][s]; this.ph += PHASE[code & 7];
      if ((code & 7) === K) this.ks[code >> 3] = s;
    }
    _del(s) {
      const code = this.b[s];
      this.b[s] = 0;
      this.lo ^= ZP_LO[code][s]; this.hi ^= ZP_HI[code][s];
      this.mg -= MG[code][s]; this.eg -= EG[code][s]; this.ph -= PHASE[code & 7];
      return code;
    }
    // Ô bắt tốt qua đường chỉ tính vào mã băm khi bên đi thật sự có Tốt bắt được (để luật lặp thế đúng)
    _epOk() {
      if (this.ep < 0) return false;
      const us = this.side, pawn = us ? P + 8 : P, d = us ? -16 : 16;   // Tốt bên đi nằm ngay dưới (Trắng) / trên (Đen) ô ep
      return (onBoard(this.ep + d - 1) && this.b[this.ep + d - 1] === pawn) || (onBoard(this.ep + d + 1) && this.b[this.ep + d + 1] === pawn);
    }
    _epHash() { if (this._epOk()) { this.lo ^= ZE_LO[this.ep & 7]; this.hi ^= ZE_HI[this.ep & 7]; } }

    fen() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let e = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.b[sq(r, c)];
          if (!p) { e++; continue; }
          if (e) { s += e; e = 0; }
          const ch = CH_FEN[p & 7];
          s += p & 8 ? ch : ch.toUpperCase();
        }
        if (e) s += e;
        if (r < 7) s += '/';
      }
      let c = '';
      if (this.cr & WK) c += 'K'; if (this.cr & WQ) c += 'Q'; if (this.cr & BK) c += 'k'; if (this.cr & BQ) c += 'q';
      return s + ' ' + (this.side ? 'b' : 'w') + ' ' + (c || '-') + ' ' + (this._epOk() ? sqName(this.ep) : '-') + ' ' + this.hm + ' ' + this.fm;
    }

    // Ô s có bị bên `by` tấn công không
    attacked(s, by) {
      const b = this.b, off = by ? 8 : 0;
      // Tốt: Tốt Trắng ở s+15 / s+17 ăn chéo lên s; Tốt Đen ở s-15 / s-17
      if (by === WHITE) { if ((onBoard(s + 15) && b[s + 15] === P) || (onBoard(s + 17) && b[s + 17] === P)) return true; }
      else if ((onBoard(s - 15) && b[s - 15] === P + 8) || (onBoard(s - 17) && b[s - 17] === P + 8)) return true;
      for (const d of N_OFF) { const t = s + d; if (onBoard(t) && b[t] === N + off) return true; }
      for (const d of K_OFF) { const t = s + d; if (onBoard(t) && b[t] === K + off) return true; }
      for (const d of B_OFF) {
        for (let t = s + d; onBoard(t); t += d) { const p = b[t]; if (p) { if (p === B + off || p === Q + off) return true; break; } }
      }
      for (const d of R_OFF) {
        for (let t = s + d; onBoard(t); t += d) { const p = b[t]; if (p) { if (p === R + off || p === Q + off) return true; break; } }
      }
      return false;
    }

    inCheck(side) { if (side === undefined) side = this.side; return this.attacked(this.ks[side], side ^ 1); }

    // Nước giả hợp lệ (chưa xét Vua mình bị chiếu). capOnly: chỉ nước ăn quân và phong cấp
    pseudo(capOnly) {
      const out = [], b = this.b, us = this.side, them = us ^ 1;
      const mine = p => p && (p >> 3) === us, theirs = p => p && (p >> 3) === them;
      const fwd = us ? 16 : -16, startRow = us ? 1 : 6, promoRow = us ? 7 : 0;
      for (let s = 0; s < 120; s++) {
        if (!onBoard(s)) { s += 7; continue; }
        const p = b[s];
        if (!mine(p)) continue;
        const t = p & 7;
        if (t === P) {
          const one = s + fwd;
          const addP = (to) => {
            if (ROW(to) === promoRow) { out.push(mk(s, to, Q)); out.push(mk(s, to, N)); out.push(mk(s, to, R)); out.push(mk(s, to, B)); }
            else out.push(mk(s, to));
          };
          if (onBoard(one) && !b[one]) {
            if (ROW(one) === promoRow) addP(one);
            else if (!capOnly) {
              out.push(mk(s, one));
              const two = one + fwd;
              if (ROW(s) === startRow && !b[two]) out.push(mk(s, two));
            }
          }
          for (const d of [fwd - 1, fwd + 1]) {
            const to = s + d;
            if (!onBoard(to)) continue;
            if (theirs(b[to])) addP(to);
            else if (to === this.ep && this._epOk()) out.push(mk(s, to));
          }
        } else if (t === N || t === K) {
          for (const d of (t === N ? N_OFF : K_OFF)) {
            const to = s + d;
            if (!onBoard(to)) continue;
            const q = b[to];
            if (q ? theirs(q) : !capOnly) out.push(mk(s, to));
          }
        } else {
          const dirs = t === B ? B_OFF : t === R ? R_OFF : K_OFF;
          for (const d of dirs) {
            for (let to = s + d; onBoard(to); to += d) {
              const q = b[to];
              if (!q) { if (!capOnly) out.push(mk(s, to)); continue; }
              if (theirs(q)) out.push(mk(s, to));
              break;
            }
          }
        }
      }
      // Nhập thành: Vua và Xe chưa đi, ô giữa trống, Vua không đang bị chiếu và không đi qua ô bị tấn công
      if (!capOnly) {
        const ks = this.ks[us], r = us ? 0 : 7;
        if (ks === sq(r, 4)) {
          const kSide = us ? BK : WK, qSide = us ? BQ : WQ;
          if ((this.cr & kSide) && !b[sq(r, 5)] && !b[sq(r, 6)] && !this.attacked(ks, them) && !this.attacked(sq(r, 5), them) && !this.attacked(sq(r, 6), them)) out.push(mk(ks, sq(r, 6)));
          if ((this.cr & qSide) && !b[sq(r, 3)] && !b[sq(r, 2)] && !b[sq(r, 1)] && !this.attacked(ks, them) && !this.attacked(sq(r, 3), them) && !this.attacked(sq(r, 2), them)) out.push(mk(ks, sq(r, 2)));
        }
      }
      return out;
    }

    legalMoves(capOnly) {
      const out = [], us = this.side;
      for (const m of this.pseudo(capOnly)) {
        this.make(m);
        if (!this.attacked(this.ks[us], us ^ 1)) out.push(m);
        this.unmake();
      }
      return out;
    }

    isLegal(m) { return this.legalMoves().indexOf(m) >= 0; }

    // Nước này có ăn quân không (kể cả bắt tốt qua đường)
    isCapture(m) {
      const t = mTo(m);
      return !!this.b[t] || ((this.b[mFrom(m)] & 7) === P && t === this.ep && COL(t) !== COL(mFrom(m)));
    }

    make(m) {
      const f = mFrom(m), t = mTo(m), pr = mPromo(m), b = this.b, us = this.side;
      const pc = b[f], typ = pc & 7;
      this.st.push({ cr: this.cr, ep: this.ep, hm: this.hm, cap: 0, capSq: -1, ks0: this.ks[0], ks1: this.ks[1] });
      const S = this.st[this.st.length - 1];
      this.hl.push(this.lo); this.hh.push(this.hi);
      this.mv.push(m);
      // gỡ phần băm của quyền nhập thành / ep cũ
      this.lo ^= ZC_LO[this.cr]; this.hi ^= ZC_HI[this.cr];
      if (this._epOk()) { this.lo ^= ZE_LO[this.ep & 7]; this.hi ^= ZE_HI[this.ep & 7]; }
      let capSq = t;
      if (typ === P && t === this.ep && COL(t) !== COL(f) && !b[t]) capSq = t + (us ? -16 : 16);
      if (b[capSq]) { S.cap = this._del(capSq); S.capSq = capSq; }
      this._del(f);
      this._put(pr ? (pr | (us << 3)) : pc, t);
      if (typ === K && Math.abs(t - f) === 2) {               // nhập thành: chuyển Xe
        const rf = t > f ? f + 3 : f - 4, rt = t > f ? f + 1 : f - 1;
        this._put(this._del(rf), rt);
      }
      this.ep = (typ === P && Math.abs(t - f) === 32) ? (f + t) >> 1 : -1;
      this.cr &= CMASK[f] & CMASK[t];
      this.hm = (typ === P || S.cap) ? 0 : this.hm + 1;
      if (us === BLACK) this.fm++;
      this.side = us ^ 1;
      this.lo ^= ZSIDE_LO; this.hi ^= ZSIDE_HI;
      this.lo ^= ZC_LO[this.cr]; this.hi ^= ZC_HI[this.cr];
      this._epHash();
    }

    unmake() {
      const m = this.mv.pop(), S = this.st.pop();
      const f = mFrom(m), t = mTo(m), pr = mPromo(m);
      this.side ^= 1;
      const us = this.side, b = this.b;
      if (us === BLACK) this.fm--;
      const moved = b[t];
      if ((moved & 7) === K && Math.abs(t - f) === 2) {
        const rf = t > f ? f + 3 : f - 4, rt = t > f ? f + 1 : f - 1;
        this._put(this._del(rt), rf);
      }
      this._del(t);
      this._put(pr ? (P | (us << 3)) : moved, f);
      if (S.cap) this._put(S.cap, S.capSq);
      this.cr = S.cr; this.ep = S.ep; this.hm = S.hm; this.ks[0] = S.ks0; this.ks[1] = S.ks1;
      this.lo = this.hl.pop(); this.hi = this.hh.pop();
    }

    // Nước "trống" cho tìm kiếm (null move): đổi lượt, không đi quân
    makeNull() {
      this.st.push({ cr: this.cr, ep: this.ep, hm: this.hm, nul: true });
      this.hl.push(this.lo); this.hh.push(this.hi); this.mv.push(0);
      if (this._epOk()) { this.lo ^= ZE_LO[this.ep & 7]; this.hi ^= ZE_HI[this.ep & 7]; }
      this.ep = -1; this.hm++;
      this.side ^= 1; this.lo ^= ZSIDE_LO; this.hi ^= ZSIDE_HI;
    }
    unmakeNull() {
      const S = this.st.pop(); this.mv.pop();
      this.side ^= 1; this.ep = S.ep; this.hm = S.hm; this.cr = S.cr;
      this.lo = this.hl.pop(); this.hi = this.hh.pop();
    }

    // Số lần thế hiện tại đã xuất hiện (tính cả lần này), chỉ xét từ nước ăn quân / đi Tốt gần nhất
    repCount() {
      let n = 1;
      const L = this.hl.length;
      for (let i = L - 2, k = 2; i >= 0 && k <= this.hm; i -= 2, k += 2) if (this.hl[i] === this.lo && this.hh[i] === this.hi) n++;
      return n;
    }

    // Không đủ quân để chiếu hết: chỉ còn hai Vua; Vua + một quân nhẹ; hoặc Vua + Tượng mỗi bên, hai Tượng cùng màu ô
    insufficient() {
      const minors = [], b = this.b;
      for (let s = 0; s < 120; s++) {
        if (!onBoard(s)) { s += 7; continue; }
        const t = b[s] & 7;
        if (!t || t === K) continue;
        if (t === P || t === R || t === Q) return false;
        minors.push([t, s]);
      }
      if (minors.length <= 1) return true;
      if (minors.every(x => x[0] === B)) {
        const col = s => (ROW(s) + COL(s)) & 1;
        return minors.every(x => col(x[1]) === col(minors[0][1]));
      }
      return false;
    }

    // Kết quả theo luật tại thế hiện tại: null nếu ván tiếp tục; nếu không:
    // { result: 'mate' | 'stalemate' | 'insufficient' | 'fifty' | 'repetition', winner: 0 | 1 | -1 (hòa) }
    status() {
      if (!this.legalMoves().length) return this.inCheck() ? { result: 'mate', winner: this.side ^ 1 } : { result: 'stalemate', winner: -1 };
      if (this.insufficient()) return { result: 'insufficient', winner: -1 };
      if (this.hm >= 100) return { result: 'fifty', winner: -1 };
      if (this.repCount() >= 3) return { result: 'repetition', winner: -1 };
      return null;
    }

    // ---------- Ký hiệu SAN (Nf3, exd5, O-O, e8=Q+, Qxf7#) ----------
    san(m) {
      const f = mFrom(m), t = mTo(m), pr = mPromo(m), typ = this.b[f] & 7;
      let s;
      if (typ === K && Math.abs(t - f) === 2) s = t > f ? 'O-O' : 'O-O-O';
      else {
        const cap = this.isCapture(m);
        if (typ === P) s = (cap ? FILES[COL(f)] + 'x' : '') + sqName(t) + (pr ? '=' + SAN_CH[pr] : '');
        else {
          let amb = '';
          const others = this.legalMoves().filter(x => x !== m && mTo(x) === t && (this.b[mFrom(x)] & 7) === typ && mFrom(x) !== f);
          if (others.length) {
            const sameFile = others.some(x => COL(mFrom(x)) === COL(f)), sameRow = others.some(x => ROW(mFrom(x)) === ROW(f));
            amb = !sameFile ? FILES[COL(f)] : !sameRow ? String(8 - ROW(f)) : sqName(f);
          }
          s = SAN_CH[typ] + amb + (cap ? 'x' : '') + sqName(t);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
      this.unmake();
      return s;
    }
    notation(m) { return this.san(m); }

    // Đọc nước dạng SAN (chấp nhận thiếu +, #, !, ?; 0-0 thay O-O) hoặc UCI. Trả về 0 nếu không hợp lệ.
    parseSan(str) {
      const clean = x => x.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/=/g, '');
      const want = clean(String(str).trim());
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(str).trim())) return this.parse(String(str).trim());
      for (const m of this.legalMoves()) if (clean(this.san(m)) === want) return m;
      return 0;
    }

    // Đọc nước dạng UCI (e2e4, e7e8q). Trả về 0 nếu không hợp lệ.
    parse(u) {
      const x = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(u).trim());
      if (!x) return 0;
      const m = mk(sqParse(x[1]), sqParse(x[2]), x[3] ? FEN_CH[x[3]] : 0);
      return this.isLegal(m) ? m : 0;
    }

    clone() { const p = Pos.fromFen(this.fen()); return p; }
  }

  // ---------- Engine alpha-beta (cấp 1–5) ----------
  const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const MVV = [0, 1, 3, 3, 5, 9, 20];
  function avoidMoves(moves, avoid) {
    if (!avoid || !avoid.length) return moves;
    const f = moves.filter(m => avoid.indexOf(m) < 0);
    return f.length ? f : moves;
  }

  class Searcher {
    constructor() {
      this.ttKey = new Int32Array(TT_SIZE);
      this.ttScore = new Int32Array(TT_SIZE);
      this.ttDepth = new Int8Array(TT_SIZE).fill(-1);
      this.ttFlag = new Int8Array(TT_SIZE);
      this.ttMove = new Int32Array(TT_SIZE);
      this.history = new Int32Array(128 * 128);
      this.killers = [];
      for (let i = 0; i < 100; i++) this.killers.push([0, 0]);
      this.nodes = 0; this.stop = false; this.deadline = 0;
    }

    clear() { this.ttDepth.fill(-1); this.history.fill(0); }

    // Điểm theo bên đi: pha giữa ván / tàn cuộc nội suy theo lượng quân; cộng thưởng cặp Tượng và dồn Vua khi tàn cuộc
    evaluate(pos) {
      const ph = Math.min(24, pos.ph);
      let v = ((pos.mg * ph) + (pos.eg * (24 - ph))) / 24;
      const b = pos.b;
      let wb = 0, bb = 0, wMat = 0, bMat = 0, wPawn = 0, bPawn = 0;
      for (let s = 0; s < 120; s++) {
        if (!onBoard(s)) { s += 7; continue; }
        const p = b[s]; if (!p) continue;
        const t = p & 7;
        if (p & 8) { if (t === B) bb++; if (t === P) bPawn++; else if (t !== K) bMat += VAL[t]; }
        else { if (t === B) wb++; if (t === P) wPawn++; else if (t !== K) wMat += VAL[t]; }
      }
      if (wb >= 2) v += 30; if (bb >= 2) v -= 30;
      // Tàn cuộc thắng thế rõ (thường là Hậu/Xe với Vua trơ trọi): đẩy Vua thua ra mép, kéo Vua thắng lại gần
      if (ph <= 6) {
        const diff = (wMat + wPawn * 100) - (bMat + bPawn * 100);
        if (Math.abs(diff) >= 400) {
          const win = diff > 0 ? 0 : 1, kw = pos.ks[win], kl = pos.ks[win ^ 1];
          const cd = s => Math.max(3 - COL(s), COL(s) - 4) + Math.max(3 - ROW(s), ROW(s) - 4);
          const dist = Math.abs(ROW(kw) - ROW(kl)) + Math.abs(COL(kw) - COL(kl));
          const bonus = cd(kl) * 10 + (14 - dist) * 4;
          v += win === 0 ? bonus : -bonus;
        }
      }
      // Không đủ quân để thắng: kéo về hòa
      if (!wPawn && wMat <= 330 && v > 0) v = v / 8;
      if (!bPawn && bMat <= 330 && v < 0) v = v / 8;
      return ((pos.side === WHITE ? v : -v) | 0) + 10;
    }

    scoreMoves(pos, moves, ttm, ply) {
      const b = pos.b, sc = new Array(moves.length);
      const k0 = this.killers[ply][0], k1 = this.killers[ply][1];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], f = mFrom(m), t = mTo(m);
        let s;
        if (m === ttm) s = 1e7;
        else if (b[t]) s = 1e6 + MVV[b[t] & 7] * 100 - MVV[b[f] & 7];
        else if (mPromo(m) === Q) s = 1e6 + 800;
        else if ((b[f] & 7) === P && t === pos.ep) s = 1e6 + 100;
        else if (m === k0) s = 9e5;
        else if (m === k1) s = 8e5;
        else s = this.history[f * 128 + t];
        sc[i] = s;
      }
      return sc;
    }

    pick(moves, sc, i) {
      let best = i;
      for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[best]) best = j;
      if (best !== i) {
        const tm = moves[i]; moves[i] = moves[best]; moves[best] = tm;
        const ts = sc[i]; sc[i] = sc[best]; sc[best] = ts;
      }
    }

    tick() {
      this.nodes++;
      if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
      return this.stop;
    }

    qsearch(pos, alpha, beta, ply) {
      if (this.tick()) return 0;
      const inChk = pos.inCheck();
      let moves;
      if (inChk) {
        moves = pos.legalMoves();
        if (!moves.length) return -MATE + ply;
      } else {
        const stand = this.evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (ply > 60) return stand;
        moves = pos.legalMoves(true).filter(m => !mPromo(m) || mPromo(m) === Q);
      }
      const sc = this.scoreMoves(pos, moves, 0, Math.min(ply, 99));
      for (let i = 0; i < moves.length; i++) {
        this.pick(moves, sc, i);
        pos.make(moves[i]);
        const v = -this.qsearch(pos, -beta, -alpha, ply + 1);
        pos.unmake();
        if (this.stop) return 0;
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    negamax(pos, depth, alpha, beta, ply, allowNull) {
      if (this.tick()) return 0;
      if (ply > 0) {
        if (pos.hm >= 100 || pos.insufficient()) return 0;
        // lặp thế trong nhánh tìm kiếm (hoặc với các nước đã đi) -> hòa
        const hl = pos.hl, hh = pos.hh;
        for (let i = hl.length - 2, k = 2; i >= 0 && k <= pos.hm; i -= 2, k += 2) if (hl[i] === pos.lo && hh[i] === pos.hi) return 0;
      }
      const inChk = pos.inCheck();
      if (inChk && ply < 60) depth++;
      if (depth <= 0) return this.qsearch(pos, alpha, beta, ply);
      const idx = pos.lo & TT_MASK, origAlpha = alpha;
      let ttm = 0;
      if (this.ttKey[idx] === pos.hi && this.ttDepth[idx] >= 0) {
        ttm = this.ttMove[idx];
        if (this.ttDepth[idx] >= depth && ply > 0) {
          let v = this.ttScore[idx];
          if (v > MATE - 200) v -= ply; else if (v < -MATE + 200) v += ply;
          const fl = this.ttFlag[idx];
          if (fl === 0) return v;
          if (fl === 1 && v >= beta) return v;
          if (fl === 2 && v <= alpha) return v;
        }
      }
      // Nước trống: bỏ lượt mà vẫn vượt beta thì cắt nhánh (không dùng khi bị chiếu hoặc chỉ còn Tốt, tránh thế cờ bắt buộc phải đi)
      if (allowNull && !inChk && depth >= 3 && ply > 0 && beta < MATE - 200) {
        let big = false;
        for (let s = 0; s < 120 && !big; s++) { if (!onBoard(s)) { s += 7; continue; } const p = pos.b[s]; if (p && (p >> 3) === pos.side && (p & 7) > P && (p & 7) < K) big = true; }
        if (big && this.evaluate(pos) >= beta) {
          pos.makeNull();
          const v = -this.negamax(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
          pos.unmakeNull();
          if (this.stop) return 0;
          if (v >= beta) return v;
        }
      }
      const moves = pos.legalMoves();
      if (!moves.length) return inChk ? -MATE + ply : 0;
      const sc = this.scoreMoves(pos, moves, ttm, Math.min(ply, 99));
      let best = -INF, bestMove = 0;
      for (let i = 0; i < moves.length; i++) {
        this.pick(moves, sc, i);
        const m = moves[i];
        const quiet = !pos.isCapture(m) && !mPromo(m);
        pos.make(m);
        let v;
        if (i === 0) v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
        else {
          // Giảm độ sâu cho nước yên lặng xếp sau (không chiếu, không bị chiếu)
          let red = 0;
          if (quiet && depth >= 3 && i >= 4 && !inChk && !pos.inCheck()) red = i >= 12 ? 2 : 1;
          v = -this.negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
          if (red && v > alpha && !this.stop) v = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (v > alpha && v < beta && !this.stop) v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake();
        if (this.stop) return 0;
        if (v > best) { best = v; bestMove = m; }
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            if (quiet) {
              const kl = this.killers[Math.min(ply, 99)];
              if (kl[0] !== m) { kl[1] = kl[0]; kl[0] = m; }
              this.history[mFrom(m) * 128 + mTo(m)] += depth * depth;
            }
            break;
          }
        }
      }
      let store = best;
      if (store > MATE - 200) store += ply; else if (store < -MATE + 200) store -= ply;
      this.ttKey[idx] = pos.hi; this.ttScore[idx] = store; this.ttDepth[idx] = Math.min(depth, 100);
      this.ttFlag[idx] = best <= origAlpha ? 2 : (best >= beta ? 1 : 0);
      this.ttMove[idx] = bestMove;
      return best;
    }

    // Khai cuộc đa dạng: chấm điểm mọi nước gốc, chọn ngẫu nhiên trong nhóm nước chênh nhau không quá `margin` điểm.
    searchVaried(pos, opts, margin) {
      const moves = avoidMoves(pos.legalMoves(), opts.avoid);
      if (moves.length < 2) return this.search(pos, opts);
      const d = Math.max(2, opts.varyDepth || 4);
      this.deadline = Date.now() + Math.max(opts.timeMs || 1000, 3000); this.stop = false; this.nodes = 0;
      const hist = this.history; for (let i = 0; i < hist.length; i++) hist[i] >>= 3;
      const scored = [];
      for (const m of moves) {
        pos.make(m);
        const v = -this.negamax(pos, d - 1, -INF, INF, 1, true);
        pos.unmake();
        if (this.stop) return this.search(pos, Object.assign({}, opts, { vary: 0 }));
        scored.push([v, m]);
      }
      let best = -INF; for (const s of scored) if (s[0] > best) best = s[0];
      if (Math.abs(best) > MATE - 200) return this.search(pos, Object.assign({}, opts, { vary: 0 }));
      const pool = scored.filter(s => s[0] >= best - margin);
      const pick = pool[(Math.random() * pool.length) | 0];
      return { move: pick[1], score: pick[0], depth: d, nodes: this.nodes };
    }

    // opts: {maxDepth, timeMs, noise, avoid}
    search(pos, opts) {
      opts = opts || {};
      const maxDepth = opts.maxDepth || 4, timeMs = opts.timeMs || 1000, noise = opts.noise || 0;
      this.deadline = Date.now() + timeMs; this.stop = false; this.nodes = 0;
      const moves = avoidMoves(pos.legalMoves(), opts.avoid);
      if (!moves.length) return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0 };
      if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };
      const hist = this.history; for (let i = 0; i < hist.length; i++) hist[i] >>= 3;
      let bestMove = moves[0], bestScore = -INF, doneDepth = 0;
      // Cấp thấp: chấm điểm mọi nước gốc, cộng nhiễu rồi chọn
      if (noise > 0) {
        const d = Math.max(1, maxDepth), scored = [];
        for (const m of moves) {
          pos.make(m);
          const v = -this.negamax(pos, d - 1, -INF, INF, 1, true);
          pos.unmake();
          scored.push([v + (Math.abs(v) > MATE - 200 ? 0 : (Math.random() * 2 - 1) * noise), v, m]);
        }
        scored.sort((a, b) => b[0] - a[0]);
        return { move: scored[0][2], score: scored[0][1], depth: d, nodes: this.nodes };
      }
      for (let d = 1; d <= maxDepth; d++) {
        let alpha = -INF, iterBest = 0, iterScore = -INF;
        const sc = this.scoreMoves(pos, moves, bestMove, 0);
        for (let i = 0; i < moves.length; i++) {
          this.pick(moves, sc, i);
          const m = moves[i];
          pos.make(m);
          let v;
          if (i === 0) v = -this.negamax(pos, d - 1, -INF, -alpha, 1, true);
          else {
            v = -this.negamax(pos, d - 1, -alpha - 1, -alpha, 1, true);
            if (v > alpha && !this.stop) v = -this.negamax(pos, d - 1, -INF, -alpha, 1, true);
          }
          pos.unmake();
          if (this.stop) break;
          if (v > iterScore) { iterScore = v; iterBest = m; }
          if (v > alpha) alpha = v;
        }
        if (this.stop && !iterBest) break;
        if (iterBest) { bestMove = iterBest; bestScore = iterScore; doneDepth = d; }
        if (this.stop) break;
        if (Math.abs(bestScore) > MATE - 200) break;
      }
      return { move: bestMove, score: bestScore, depth: doneDepth, nodes: this.nodes };
    }
  }

  // Đếm số thế ở độ sâu d (perft) — dùng để kiểm tra luật đi với các con số chuẩn
  function perft(pos, d) {
    if (d === 0) return 1;
    const ms = pos.legalMoves();
    if (d === 1) return ms.length;
    let n = 0;
    for (const m of ms) { pos.make(m); n += perft(pos, d - 1); pos.unmake(); }
    return n;
  }

  const CH = {
    START_FEN, Pos, Searcher, sq, sqName, sqParse, mvStr, mk, mFrom, mTo, mPromo, ROW, COL, perft,
    MATE, T: { P, N, B, R, Q, K }, GAME: 'chess'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CH;
  else root.CH = CH;
})(typeof self !== 'undefined' ? self : this);
