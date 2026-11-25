/* xq.js - Lõi cờ tướng: luật đi, ký hiệu Hán, engine alpha-beta, solver chiếu hết.
 * Chạy được trong trình duyệt, Web Worker và Node. */
(function (root) {
  'use strict';

  // ---------- Hằng số ----------
  const R = 1, N = 2, B = 3, A = 4, K = 5, C = 6, P = 7; // loại quân; Đen = +8
  const ROW = new Int8Array(90), COL = new Int8Array(90);
  for (let i = 0; i < 90; i++) { ROW[i] = (i / 9) | 0; COL[i] = i % 9; }
  const DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
  const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
  const FEN_CH = { r: R, n: N, b: B, e: B, a: A, k: K, c: C, p: P };
  const CH_FEN = ['', 'r', 'n', 'b', 'a', 'k', 'c', 'p'];

  // Bảng tiền xử lý
  const KN = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
              [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];
  const knightT = [], bishopT = [], advisorT = [], kingT = [];
  for (let s = 0; s < 90; s++) {
    const r = ROW[s], c = COL[s];
    const kn = [], bi = [], ad = [], ki = [];
    for (const [dr, dc, lr, lc] of KN) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) kn.push([nr * 9 + nc, (r + lr) * 9 + (c + lc)]);
    }
    for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) bi.push([nr * 9 + nc, (r + dr / 2) * 9 + (c + dc / 2)]);
    }
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) ad.push(nr * 9 + nc);
    }
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) ki.push(nr * 9 + nc);
    }
    knightT.push(kn); bishopT.push(bi); advisorT.push(ad); kingT.push(ki);
  }
  function inPalace(side, s) {
    const r = ROW[s], c = COL[s];
    return c >= 3 && c <= 5 && (side === 0 ? r >= 7 : r <= 2);
  }

  // ---------- Zobrist (PRNG cố định) ----------
  let seed = 123456789;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  const ZLO = new Int32Array(16 * 90), ZHI = new Int32Array(16 * 90);
  for (let i = 0; i < ZLO.length; i++) { ZLO[i] = rnd(); ZHI[i] = rnd(); }
  const ZSIDE_LO = rnd(), ZSIDE_HI = rnd();

  // ---------- Đánh giá ----------
  const VAL = new Int32Array(16 * 90); // góc nhìn Đỏ: Đỏ dương, Đen âm
  function pst(type, row, col) { // row theo góc nhìn bên đó (9 = nhà)
    const cen = 4 - Math.abs(col - 4);
    switch (type) {
      case R: return 1000 + (9 - row) * 3 + (col === 4 ? 4 : 0);
      case N: return 450 + cen * 5 + Math.min(9 - row, 5) * 4 - (col === 0 || col === 8 ? 25 : 0);
      case C: return 480 + (col === 4 ? 14 : 0) + Math.min(9 - row, 6) * 2;
      case B: return 200 + (row === 7 && col === 4 ? 6 : 0);
      case A: return 200 + (row === 8 && col === 4 ? 6 : 0);
      case K: return 0;
      case P:
        if (row >= 5) return 100 + (row === 6 ? 4 : 0);
        return 200 + (4 - row) * 6 + (col >= 3 && col <= 5 ? 24 : 0) - (row === 0 ? 40 : 0);
    }
    return 0;
  }
  for (let t = 1; t <= 7; t++) {
    for (let s = 0; s < 90; s++) {
      VAL[t * 90 + s] = pst(t, ROW[s], COL[s]);
      VAL[(t + 8) * 90 + s] = -pst(t, 9 - ROW[s], COL[s]);
    }
  }
  const MVV = [0, 10, 4, 2, 2, 100, 5, 1];
  const CHASE_VAL = [0, 9, 4, 2, 2, 100, 4, 1]; // giá trị quân khi xét đuổi: Xe 9, Mã/Pháo 4, Tượng/Sĩ 2, Tốt 1

  // ---------- Thế cờ ----------
  class Pos {
    constructor() {
      this.b = new Int8Array(90);
      this.side = 0;
      this.ks = [-1, -1];
      this.sc = 0;
      this.lo = 0; this.hi = 0;
      this.mv = []; this.cp = []; this.hl = []; this.hh = []; this.ss = [];
    }

    static fromFen(fen) {
      const p = new Pos();
      p.loadFen(fen || START_FEN);
      return p;
    }

    loadFen(fen) {
      this.b.fill(0); this.ks = [-1, -1]; this.sc = 0; this.lo = 0; this.hi = 0;
      this.mv = []; this.cp = []; this.hl = []; this.hh = []; this.ss = [];
      const parts = fen.trim().split(/\s+/);
      const rows = parts[0].split('/');
      if (rows.length !== 10) throw new Error('FEN sai: cần 10 hàng');
      for (let r = 0; r < 10; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (ch >= '0' && ch <= '9') { c += +ch; continue; }
          const low = ch.toLowerCase();
          const t = FEN_CH[low];
          if (!t || c > 8) throw new Error('FEN sai: ' + ch);
          const code = ch === low ? t + 8 : t;
          this._put(code, r * 9 + c);
          c++;
        }
        if (c !== 9) throw new Error('FEN sai: hàng ' + r + ' có ' + c + ' cột');
      }
      this.side = (parts[1] === 'b' || parts[1] === 'B') ? 1 : 0;
      if (this.side) { this.lo ^= ZSIDE_LO; this.hi ^= ZSIDE_HI; }
    }

    _put(code, s) {
      this.b[s] = code;
      if ((code & 7) === K) this.ks[code >> 3] = s;
      this.sc += VAL[code * 90 + s];
      this.lo ^= ZLO[code * 90 + s]; this.hi ^= ZHI[code * 90 + s];
    }

    fen() {
      const rows = [];
      for (let r = 0; r < 10; r++) {
        let s = '', e = 0;
        for (let c = 0; c < 9; c++) {
          const p = this.b[r * 9 + c];
          if (!p) { e++; continue; }
          if (e) { s += e; e = 0; }
          const ch = CH_FEN[p & 7];
          s += (p >> 3) ? ch : ch.toUpperCase();
        }
        if (e) s += e;
        rows.push(s);
      }
      return rows.join('/') + ' ' + (this.side ? 'b' : 'w');
    }

    clone() { return Pos.fromFen(this.fen()); }

    attacked(sq, by) {
      const b = this.b, r0 = ROW[sq], c0 = COL[sq];
      const eR = (by << 3) | R, eC = (by << 3) | C, eK = (by << 3) | K, eN = (by << 3) | N, eP = (by << 3) | P;
      for (let d = 0; d < 4; d++) {
        const dr = DR[d], dc = DC[d];
        let r = r0 + dr, c = c0 + dc, screen = false;
        while (r >= 0 && r < 10 && c >= 0 && c < 9) {
          const q = b[r * 9 + c];
          if (q !== 0) {
            if (!screen) {
              if (q === eR) return true;
              if (q === eK && dc === 0) return true;
              screen = true;
            } else {
              if (q === eC) return true;
              break;
            }
          }
          r += dr; c += dc;
        }
      }
      for (let i = 0; i < 8; i++) {
        const k = KN[i];
        const sr = r0 - k[0], sc = c0 - k[1];
        if (sr >= 0 && sr < 10 && sc >= 0 && sc < 9 && b[sr * 9 + sc] === eN && b[(sr + k[2]) * 9 + (sc + k[3])] === 0) return true;
      }
      if (by === 1) {
        if (r0 >= 1 && b[(r0 - 1) * 9 + c0] === eP) return true;
        if (r0 >= 5) {
          if (c0 > 0 && b[r0 * 9 + c0 - 1] === eP) return true;
          if (c0 < 8 && b[r0 * 9 + c0 + 1] === eP) return true;
        }
      } else {
        if (r0 <= 8 && b[(r0 + 1) * 9 + c0] === eP) return true;
        if (r0 <= 4) {
          if (c0 > 0 && b[r0 * 9 + c0 - 1] === eP) return true;
          if (c0 < 8 && b[r0 * 9 + c0 + 1] === eP) return true;
        }
      }
      return false;
    }

    inCheck(side) {
      if (side === undefined) side = this.side;
      return this.attacked(this.ks[side], side ^ 1);
    }

    // Sinh nước giả hợp lệ (chưa lọc tự chiếu). Trả về mảng số nguyên from<<7|to
    pseudo(capOnly) {
      const b = this.b, side = this.side, out = [];
      for (let s = 0; s < 90; s++) {
        const p = b[s];
        if (p === 0 || (p >> 3) !== side) continue;
        const t = p & 7, r0 = ROW[s], c0 = COL[s], f = s << 7;
        switch (t) {
          case R:
            for (let d = 0; d < 4; d++) {
              let r = r0 + DR[d], c = c0 + DC[d];
              while (r >= 0 && r < 10 && c >= 0 && c < 9) {
                const to = r * 9 + c, q = b[to];
                if (q === 0) { if (!capOnly) out.push(f | to); }
                else { if ((q >> 3) !== side) out.push(f | to); break; }
                r += DR[d]; c += DC[d];
              }
            }
            break;
          case C:
            for (let d = 0; d < 4; d++) {
              let r = r0 + DR[d], c = c0 + DC[d], jumped = false;
              while (r >= 0 && r < 10 && c >= 0 && c < 9) {
                const to = r * 9 + c, q = b[to];
                if (!jumped) {
                  if (q === 0) { if (!capOnly) out.push(f | to); }
                  else jumped = true;
                } else if (q !== 0) {
                  if ((q >> 3) !== side) out.push(f | to);
                  break;
                }
                r += DR[d]; c += DC[d];
              }
            }
            break;
          case N: {
            const L = knightT[s];
            for (let i = 0; i < L.length; i++) {
              if (b[L[i][1]] !== 0) continue;
              const q = b[L[i][0]];
              if (q === 0) { if (!capOnly) out.push(f | L[i][0]); }
              else if ((q >> 3) !== side) out.push(f | L[i][0]);
            }
            break;
          }
          case B: {
            const L = bishopT[s];
            for (let i = 0; i < L.length; i++) {
              const to = L[i][0];
              if (side === 0 ? ROW[to] < 5 : ROW[to] > 4) continue;
              if (b[L[i][1]] !== 0) continue;
              const q = b[to];
              if (q === 0) { if (!capOnly) out.push(f | to); }
              else if ((q >> 3) !== side) out.push(f | to);
            }
            break;
          }
          case A: {
            const L = advisorT[s];
            for (let i = 0; i < L.length; i++) {
              const to = L[i];
              if (!inPalace(side, to)) continue;
              const q = b[to];
              if (q === 0) { if (!capOnly) out.push(f | to); }
              else if ((q >> 3) !== side) out.push(f | to);
            }
            break;
          }
          case K: {
            const L = kingT[s];
            for (let i = 0; i < L.length; i++) {
              const to = L[i];
              if (!inPalace(side, to)) continue;
              const q = b[to];
              if (q === 0) { if (!capOnly) out.push(f | to); }
              else if ((q >> 3) !== side) out.push(f | to);
            }
            break;
          }
          case P: {
            const fr = side === 0 ? -1 : 1;
            const crossed = side === 0 ? r0 <= 4 : r0 >= 5;
            const nr = r0 + fr;
            if (nr >= 0 && nr < 10) {
              const to = nr * 9 + c0, q = b[to];
              if (q === 0) { if (!capOnly) out.push(f | to); }
              else if ((q >> 3) !== side) out.push(f | to);
            }
            if (crossed) {
              for (const dc of [-1, 1]) {
                const nc = c0 + dc;
                if (nc < 0 || nc > 8) continue;
                const to = r0 * 9 + nc, q = b[to];
                if (q === 0) { if (!capOnly) out.push(f | to); }
                else if ((q >> 3) !== side) out.push(f | to);
              }
            }
            break;
          }
        }
      }
      return out;
    }

    make(m) {
      const f = m >> 7, t = m & 127, b = this.b;
      const p = b[f], cap = b[t];
      this.mv.push(m); this.cp.push(cap); this.hl.push(this.lo); this.hh.push(this.hi); this.ss.push(this.sc);
      let lo = this.lo ^ ZLO[p * 90 + f] ^ ZLO[p * 90 + t] ^ ZSIDE_LO;
      let hi = this.hi ^ ZHI[p * 90 + f] ^ ZHI[p * 90 + t] ^ ZSIDE_HI;
      let sc = this.sc + VAL[p * 90 + t] - VAL[p * 90 + f];
      if (cap) { lo ^= ZLO[cap * 90 + t]; hi ^= ZHI[cap * 90 + t]; sc -= VAL[cap * 90 + t]; }
      this.lo = lo; this.hi = hi; this.sc = sc;
      b[t] = p; b[f] = 0;
      if ((p & 7) === K) this.ks[p >> 3] = t;
      this.side ^= 1;
    }

    unmake() {
      const m = this.mv.pop(), cap = this.cp.pop();
      this.lo = this.hl.pop(); this.hi = this.hh.pop(); this.sc = this.ss.pop();
      const f = m >> 7, t = m & 127, b = this.b;
      const p = b[t];
      b[f] = p; b[t] = cap;
      if ((p & 7) === K) this.ks[p >> 3] = f;
      this.side ^= 1;
    }

    legalMoves(capOnly) {
      const ps = this.pseudo(capOnly), out = [], side = this.side;
      for (let i = 0; i < ps.length; i++) {
        this.make(ps[i]);
        if (!this.inCheck(side)) out.push(ps[i]);
        this.unmake();
      }
      return out;
    }

    isLegal(m) { return this.legalMoves().indexOf(m) >= 0; }

    // Kết quả: null nếu còn đi được; 'mate' nếu bên đi bị hết cờ/bí (thua)
    status() {
      if (this.legalMoves().length === 0) return 'mate';
      return null;
    }

    perft(d) {
      if (d === 0) return 1;
      const ms = this.legalMoves();
      if (d === 1) return ms.length;
      let n = 0;
      for (const m of ms) { this.make(m); n += this.perft(d - 1); this.unmake(); }
      return n;
    }

    // Số lần thế hiện tại đã xuất hiện (kể cả bây giờ)
    repCount() {
      let n = 1;
      for (let i = this.hl.length - 1; i >= 0; i--) {
        if (this.hl[i] === this.lo && this.hh[i] === this.hi) n++;
      }
      return n;
    }

    // ---------- Luật lặp thế: chiếu dai, đuổi dai ----------
    // App dùng hai lớp: (1) perpetualBlocked: không cho đi nước chiếu (đuổi) liên tiếp vượt giới hạn (app đặt 4) làm thế cờ lặp lại;
    // (2) repetitionVerdict: khi thế cờ lặp lại ba lần, cho biết có bên nào đang chiếu/đuổi dai không (app chỉ xử hòa khi không có).
    // Bản rút gọn của luật cờ tướng (luật châu Á): khi một thế cờ lặp lại ba lần, xét vòng nước gần nhất dẫn về thế đó.
    //   - Bên nào mọi nước trong vòng đều chiếu: "chiếu dai".
    //   - Bên nào mọi nước đều chiếu hoặc đuổi (có ít nhất một nước đuổi): "đuổi dai".
    //   - Chỉ một bên phạm luật: bên đó thua. Hai bên cùng phạm: chiếu dai gặp đuổi dai thì bên chiếu dai thua, còn lại hòa.
    //   - Không bên nào phạm: hòa.
    // "Đuổi": quân vừa đi (không phải Tướng, Tốt) tạo thế ăn mới, ăn được thật (không làm Tướng mình bị chiếu), vào một quân
    // không phải Tướng, không phải Tốt chưa qua sông, mà quân đó không được bảo vệ, hoặc có giá trị cao hơn quân đuổi
    // (ví dụ Mã, Pháo đuổi Xe). Chưa xét: đuổi bằng nước mở đường cho quân khác, và nhiều ngoại lệ chi tiết của luật thi đấu.
    capsFrom(sq, side) {
      const keep = this.side; this.side = side;
      const out = this.pseudo(true).filter(m => (m >> 7) === sq).map(m => m & 127);
      this.side = keep;
      return out;
    }

    // Thế sau nước `m` (vừa đi, bên đi là s): nước đó có "đuổi" quân nào không. pre: các ô quân này ăn được trước khi đi.
    chaseAfter(m, s, pre) {
      const t = m & 127, b = this.b, at = b[t] & 7, o = s ^ 1;
      if (at === K || at === P) return false;
      for (const tq of this.capsFrom(t, s)) {
        if (pre.indexOf(tq) >= 0) continue;                         // đã ăn được từ trước, không phải đuổi mới
        const qt = b[tq] & 7;
        if (qt === K) continue;                                      // ăn Tướng là chiếu, xét riêng
        if (qt === P && (o === 0 ? ROW[tq] >= 5 : ROW[tq] <= 4)) continue;  // Tốt chưa qua sông được đuổi tự do
        this.side = s; this.make((t << 7) | tq);
        const legal = !this.inCheck(s);
        const guarded = legal && this.legalMoves().some(x => (x & 127) === tq);
        this.unmake(); this.side = o;
        if (!legal) continue;
        if (!guarded || CHASE_VAL[qt] > CHASE_VAL[at]) return true;
      }
      return false;
    }

    // Vòng nước gần nhất dẫn về thế hiện tại. null nếu thế này chưa từng xuất hiện.
    // kinds[side]: 'check' (chiếu dai) | 'chase' (đuổi dai) | '' (có nước nhàn, không phạm luật).
    repCycle() {
      let j = -1;
      for (let i = this.hl.length - 1; i >= 0; i--) if (this.hl[i] === this.lo && this.hh[i] === this.hi) { j = i; break; }
      if (j < 0) return null;
      const cyc = this.mv.slice(j);
      for (let i = 0; i < cyc.length; i++) this.unmake();
      const allChk = [true, true], allBad = [true, true], moved = [false, false];
      for (const m of cyc) {
        const s = this.side, pre = this.capsFrom(m >> 7, s);
        this.make(m);
        moved[s] = true;
        const chk = this.inCheck(s ^ 1);
        const bad = chk || this.chaseAfter(m, s, pre);
        if (!chk) allChk[s] = false;
        if (!bad) allBad[s] = false;
      }
      const kinds = [0, 1].map(x => !moved[x] ? '' : allChk[x] ? 'check' : allBad[x] ? 'chase' : '');
      return { kinds, len: cyc.length };
    }

    // Loại của n nước gần nhất: 'check' (chiếu) | 'chase' (đuổi) | '' (nước khác).
    recentKinds(n) {
      n = Math.min(n, this.mv.length);
      const ms = this.mv.slice(this.mv.length - n), out = [];
      for (let i = 0; i < n; i++) this.unmake();
      for (const m of ms) {
        const s = this.side, pre = this.capsFrom(m >> 7, s);
        this.make(m);
        out.push(this.inCheck(s ^ 1) ? 'check' : this.chaseAfter(m, s, pre) ? 'chase' : '');
      }
      return out;
    }

    // Bên s (vừa đi) có đang chiếu (đuổi) dai không: thế hiện tại đã từng xuất hiện, mọi nước của s trong vòng lặp đều
    // chiếu (đuổi), và đếm số nước chiếu (đuổi) liên tiếp của s tính tới nước vừa đi.
    // Trả về null nếu không; nếu có: { kind: 'check' | 'chase', streak }.
    perpetualInfo(s, maxCount) {
      if (this.repCount() < 2) return null;
      const c = this.repCycle(), kind = c && c.kinds[s];
      if (!kind) return null;
      const ks = this.recentKinds(2 * (maxCount || 6) + 2);
      let streak = 0;
      for (let i = ks.length - 1; i >= 0; i -= 2) { if (ks[i]) streak++; else break; }
      return { kind, streak };
    }

    // Nước m có bị cấm vì chiếu dai / đuổi dai không: sau nước này thế cờ lặp lại một thế đã có, và bên đi đã chiếu (đuổi)
    // liên tục quá `limit` nước. Trả về 'check' | 'chase' nếu bị cấm, '' nếu được đi.
    perpetualBlocked(m, limit) {
      const s = this.side;
      this.make(m);
      const info = this.perpetualInfo(s, limit + 1);
      this.unmake();
      return info && info.streak > limit ? info.kind : '';
    }

    // Phân xử khi thế hiện tại lặp lại lần thứ ba: null nếu chưa tới ba lần;
    // { result: 'draw' } hoặc { result: 'lose', side: bên thua, why: 'check' | 'chase' }.
    repetitionVerdict() {
      if (this.repCount() < 3) return null;
      const c = this.repCycle(); if (!c) return null;
      const [k0, k1] = c.kinds;
      if (k0 && k1) {
        if (k0 === 'check' && k1 === 'chase') return { result: 'lose', side: 0, why: 'check' };
        if (k1 === 'check' && k0 === 'chase') return { result: 'lose', side: 1, why: 'check' };
        return { result: 'draw' };
      }
      if (k0) return { result: 'lose', side: 0, why: k0 };
      if (k1) return { result: 'lose', side: 1, why: k1 };
      return { result: 'draw' };
    }

    // ---------- Ký hiệu Hán ----------
    notation(m) {
      const b = this.b, f = m >> 7, t = m & 127, p = b[f];
      const side = p >> 3, type = p & 7;
      const fr = ROW[f], fc = COL[f], tr = ROW[t], tc = COL[t];
      const file = c => side === 0 ? 9 - c : c + 1;
      const num = n => side === 0 ? '一二三四五六七八九'[n - 1] : String(n);
      const names = side ? ['', '車', '馬', '象', '士', '將', '炮', '卒'] : ['', '車', '傌', '相', '仕', '帥', '炮', '兵'];
      const same = [];
      for (let r = 0; r < 10; r++) if (b[r * 9 + fc] === p) same.push(r);
      let head;
      if (same.length > 1 && type !== K) {
        same.sort((x, y) => side === 0 ? x - y : y - x); // phần tử đầu = phía trước
        const idx = same.indexOf(fr), n = same.length;
        let pre;
        if (idx === 0) pre = '前'; else if (idx === n - 1) pre = '後';
        else pre = n === 3 ? '中' : '二三四'[idx - 1];
        head = pre + names[type];
      } else head = names[type] + num(file(fc));
      let dir, tail;
      if (tr === fr) { dir = '平'; tail = num(file(tc)); }
      else {
        const forward = side === 0 ? tr < fr : tr > fr;
        dir = forward ? '進' : '退';
        tail = (type === N || type === B || type === A) ? num(file(tc)) : num(Math.abs(tr - fr));
      }
      return head + dir + tail;
    }

    parse(str) {
      const norm = s => s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[一二三四五六七八九]/g, ch => String('一二三四五六七八九'.indexOf(ch) + 1))
        .replace(/[俥]/g, '車').replace(/[傌]/g, '馬').replace(/[砲]/g, '炮').replace(/[象]/g, '相')
        .replace(/[仕]/g, '士').replace(/[帥將]/g, '帥').replace(/[卒]/g, '兵')
        .replace(/[进]/g, '進').replace(/[后]/g, '後').replace(/[退]/g, '退').replace(/[车]/g, '車')
        .replace(/[马]/g, '馬').replace(/[炮]/g, '炮').replace(/[兵]/g, '兵');
      const target = norm(str.trim());
      const ms = this.legalMoves();
      for (const m of ms) if (norm(this.notation(m)) === target) return m;
      return -1;
    }
  }

  // ---------- Tiện ích ----------
  function sq(r, c) { return r * 9 + c; }
  function mvStr(m) { // dạng toạ độ: a0..i9 (cột a-i từ trái, hàng 0 ở dưới phía Đỏ)
    const f = m >> 7, t = m & 127;
    return 'abcdefghi'[COL[f]] + (9 - ROW[f]) + 'abcdefghi'[COL[t]] + (9 - ROW[t]);
  }
  function rotateFen(fen) { // xoay 180° và đổi màu: biến bài Đỏ chiếu thành Đen chiếu
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    const grid = rows.map(r => {
      const a = [];
      for (const ch of r) { if (ch >= '0' && ch <= '9') for (let i = 0; i < +ch; i++) a.push(''); else a.push(ch); }
      return a;
    });
    const flat = [].concat(...grid).reverse().map(ch => ch === '' ? '' : (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()));
    const out = [];
    for (let r = 0; r < 10; r++) {
      let s = '', e = 0;
      for (let c = 0; c < 9; c++) {
        const ch = flat[r * 9 + c];
        if (ch === '') e++; else { if (e) { s += e; e = 0; } s += ch; }
      }
      if (e) s += e;
      out.push(s);
    }
    return out.join('/') + ' ' + (parts[1] === 'b' ? 'w' : 'b');
  }

  // ---------- Engine ----------
  const INF = 32000, MATE = 30000;
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;

  // opts.avoid: các nước gốc không được chọn (ví dụ nước bị chặn vì chiếu dai);
  // nếu bỏ hết thì vẫn giữ nguyên danh sách.
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
      this.ttMove = new Int16Array(TT_SIZE);
      this.history = new Int32Array(90 * 90);
      this.killers = [];
      for (let i = 0; i < 80; i++) this.killers.push([0, 0]);
      this.nodes = 0; this.stop = false; this.deadline = 0;
    }

    clear() { this.ttDepth.fill(-1); this.history.fill(0); }

    evaluate(pos) {
      return (pos.side === 0 ? pos.sc : -pos.sc) + 8;
    }

    scoreMoves(pos, moves, ttm, ply) {
      const b = pos.b, sc = new Array(moves.length);
      const k0 = this.killers[ply][0], k1 = this.killers[ply][1];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i], f = m >> 7, t = m & 127;
        let s = 0;
        if (m === ttm) s = 1e7;
        else if (b[t]) s = 1e6 + MVV[b[t] & 7] * 100 - MVV[b[f] & 7];
        else if (m === k0) s = 9e5;
        else if (m === k1) s = 8e5;
        else s = this.history[f * 90 + t];
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

    qsearch(pos, alpha, beta, ply) {
      this.nodes++;
      if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
      if (this.stop) return 0;
      const inChk = pos.inCheck();
      let moves;
      if (inChk) {
        moves = pos.legalMoves();
        if (moves.length === 0) return -MATE + ply;
      } else {
        const stand = this.evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        if (ply > 60) return stand;
        moves = pos.legalMoves(true);
      }
      const sc = this.scoreMoves(pos, moves, 0, Math.min(ply, 79));
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

    negamax(pos, depth, alpha, beta, ply) {
      this.nodes++;
      if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) this.stop = true;
      if (this.stop) return 0;
      if (ply > 0) {
        // lặp thế trong nhánh tìm kiếm -> hoà
        const hl = pos.hl, hh = pos.hh;
        for (let i = hl.length - 1, k = 0; i >= 0 && k < 16; i--, k++) {
          if (hl[i] === pos.lo && hh[i] === pos.hi) return 0;
        }
      }
      const inChk = pos.inCheck();
      if (inChk && ply < 40) depth++;
      if (depth <= 0) return this.qsearch(pos, alpha, beta, ply);
      const idx = pos.lo & TT_MASK, origAlpha = alpha;
      let ttm = 0;
      if (this.ttKey[idx] === pos.hi && this.ttDepth[idx] >= 0) {
        ttm = this.ttMove[idx];
        if (this.ttDepth[idx] >= depth && ply > 0) {
          let v = this.ttScore[idx];
          if (v > MATE - 100) v -= ply; else if (v < -MATE + 100) v += ply;
          const fl = this.ttFlag[idx];
          if (fl === 0) return v;
          if (fl === 1 && v >= beta) return v;
          if (fl === 2 && v <= alpha) return v;
        }
      }
      const moves = pos.legalMoves();
      if (moves.length === 0) return -MATE + ply;
      const sc = this.scoreMoves(pos, moves, ttm, Math.min(ply, 79));
      let best = -INF, bestMove = 0;
      for (let i = 0; i < moves.length; i++) {
        this.pick(moves, sc, i);
        const m = moves[i];
        const isCap = pos.b[m & 127] !== 0;
        pos.make(m);
        let v;
        if (i === 0) v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
        else {
          v = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1);
          if (v > alpha && v < beta && !this.stop) v = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
        }
        pos.unmake();
        if (this.stop) return 0;
        if (v > best) { best = v; bestMove = m; }
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            if (!isCap) {
              const kl = this.killers[Math.min(ply, 79)];
              if (kl[0] !== m) { kl[1] = kl[0]; kl[0] = m; }
              this.history[(m >> 7) * 90 + (m & 127)] += depth * depth;
            }
            break;
          }
        }
      }
      let store = best;
      if (store > MATE - 100) store += ply; else if (store < -MATE + 100) store -= ply;
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
        const v = -this.negamax(pos, d - 1, -INF, INF, 1);
        pos.unmake();
        if (this.stop) return this.search(pos, Object.assign({}, opts, { vary: 0 }));
        scored.push([v, m]);
      }
      let best = -INF; for (const s of scored) if (s[0] > best) best = s[0];
      if (Math.abs(best) > MATE - 100) return this.search(pos, Object.assign({}, opts, { vary: 0 }));
      const pool = scored.filter(s => s[0] >= best - margin);
      const pick = pool[(Math.random() * pool.length) | 0];
      return { move: pick[1], score: pick[0], depth: d, nodes: this.nodes };
    }

    // opts: {maxDepth, timeMs, noise}
    search(pos, opts) {
      opts = opts || {};
      const maxDepth = opts.maxDepth || 4, timeMs = opts.timeMs || 1000, noise = opts.noise || 0;
      this.deadline = Date.now() + timeMs; this.stop = false; this.nodes = 0;
      const moves = avoidMoves(pos.legalMoves(), opts.avoid);
      if (moves.length === 0) return { move: 0, score: -MATE, depth: 0, nodes: 0 };
      if (moves.length === 1) return { move: moves[0], score: 0, depth: 0, nodes: 0 };
      const hist = this.history; for (let i = 0; i < hist.length; i++) hist[i] >>= 3;
      let bestMove = moves[0], bestScore = -INF, doneDepth = 0;
      // Mức thấp: chấm điểm mọi nước gốc, cộng nhiễu rồi chọn
      if (noise > 0) {
        const d = Math.max(1, maxDepth);
        const scored = [];
        for (const m of moves) {
          pos.make(m);
          const v = -this.negamax(pos, d - 1, -INF, INF, 1);
          pos.unmake();
          scored.push([v + (Math.random() * 2 - 1) * noise, v, m]);
        }
        scored.sort((a, b) => b[0] - a[0]);
        return { move: scored[0][2], score: scored[0][1], depth: d, nodes: this.nodes };
      }
      for (let d = 1; d <= maxDepth; d++) {
        let alpha = -INF, iterBest = 0, iterScore = -INF;
        const beta = INF;
        const sc = this.scoreMoves(pos, moves, bestMove, 0);
        for (let i = 0; i < moves.length; i++) {
          this.pick(moves, sc, i);
          const m = moves[i];
          pos.make(m);
          let v;
          if (i === 0) v = -this.negamax(pos, d - 1, -beta, -alpha, 1);
          else {
            v = -this.negamax(pos, d - 1, -alpha - 1, -alpha, 1);
            if (v > alpha && !this.stop) v = -this.negamax(pos, d - 1, -beta, -alpha, 1);
          }
          pos.unmake();
          if (this.stop) break;
          if (v > iterScore) { iterScore = v; iterBest = m; }
          if (v > alpha) alpha = v;
        }
        if (this.stop) break;
        bestMove = iterBest; bestScore = iterScore; doneDepth = d;
        // đưa nước tốt nhất lên đầu cho vòng sau
        const bi = moves.indexOf(bestMove);
        if (bi > 0) { moves.splice(bi, 1); moves.unshift(bestMove); }
        if (Math.abs(bestScore) > MATE - 100) break;
        if (Date.now() > this.deadline) break;
      }
      return { move: bestMove, score: bestScore, depth: doneDepth, nodes: this.nodes };
    }
  }

  // ---------- Solver chiếu hết (chỉ dùng nước chiếu của bên tấn công) ----------
  const mateMemo = new Map();
  function canMate(pos, n) {
    if (n <= 0) return false;
    const key = pos.hi + ':' + pos.lo + ':' + n;
    const hit = mateMemo.get(key);
    if (hit !== undefined) return hit;
    let result = false;
    const att = pos.side;
    const moves = pos.legalMoves();
    for (let i = 0; i < moves.length && !result; i++) {
      pos.make(moves[i]);
      if (pos.inCheck(att ^ 1)) {
        const defs = pos.legalMoves();
        if (defs.length === 0) result = true;
        else if (n > 1) {
          let all = true;
          for (let j = 0; j < defs.length && all; j++) {
            pos.make(defs[j]);
            if (!canMate(pos, n - 1)) all = false;
            pos.unmake();
          }
          if (all) result = true;
        }
      }
      pos.unmake();
    }
    if (mateMemo.size > 400000) mateMemo.clear();
    mateMemo.set(key, result);
    return result;
  }
  // Số nước chiếu hết ngắn nhất (<= maxN) của bên đang đi; Infinity nếu không có
  function mateLength(pos, maxN) {
    for (let n = 1; n <= maxN; n++) if (canMate(pos, n)) return n;
    return Infinity;
  }
  // Các nước chiếu đầu tiên giữ được chiếu hết trong n nước
  function mateFirstMoves(pos, n) {
    const att = pos.side, res = [];
    for (const m of pos.legalMoves()) {
      pos.make(m);
      if (pos.inCheck(att ^ 1)) {
        const defs = pos.legalMoves();
        let ok;
        if (defs.length === 0) ok = true;
        else if (n > 1) {
          ok = true;
          for (const d of defs) {
            pos.make(d);
            if (!canMate(pos, n - 1)) ok = false;
            pos.unmake();
            if (!ok) break;
          }
        } else ok = false;
        if (ok) res.push(m);
      }
      pos.unmake();
    }
    return res;
  }
  // Nước phòng thủ kháng cự lâu nhất (sau khi tấn công vừa đi)
  function bestDefense(pos, maxN) {
    const defs = pos.legalMoves();
    let best = defs[0], bestLen = -1;
    for (const d of defs) {
      pos.make(d);
      const len = mateLength(pos, maxN);
      pos.unmake();
      const v = len === Infinity ? 99 : len;
      if (v > bestLen) { bestLen = v; best = d; }
    }
    return best;
  }

  const XQ = {
    START_FEN, Pos, Searcher, sq, mvStr, rotateFen, ROW, COL,
    canMate, mateLength, mateFirstMoves, bestDefense,
    MATE, T: { R, N, B, A, K, C, P }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = XQ;
  else root.XQ = XQ;
})(typeof self !== 'undefined' ? self : this);
