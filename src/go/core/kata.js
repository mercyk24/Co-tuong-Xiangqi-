// [CỜ VÂY] Chạy mạng nơ-ron KataGo (đời g170, mô hình phiên bản 8) trong trình duyệt / Web Worker / Node, dùng TensorFlow.js.
// Gồm: đọc tệp mạng đã đổi bằng tools/go/kata_convert.js (.kgo), mã hoá thế cờ thành đầu vào giống hệt KataGo (NNInputs::fillRowV7,
// luật Trung Quốc: tính đất, kiếp đơn, cấm tự sát, Trắng được điểm bù), chạy mạng và đổi đầu ra (xác suất từng nước, tỉ lệ thắng,
// điểm hơn kém, chủ đất từng điểm) về phía Trắng như lệnh kata-raw-nn của KataGo. Không dùng chung gì với cờ tướng / cờ vua.
// Nguồn đối chiếu: mã KataGo v1.18.1 (giấy phép MIT) – cpp/neuralnet/nninputs.cpp, desc.cpp, eigenbackend.cpp, nneval.cpp;
// cpp/game/board.cpp (thang, đất "sống chắc" theo thuật toán Benson). Kiểm tra: tests/unit/go/kata.test.js.
// Phần viết lại từ KataGo: Copyright 2025 David J Wu ("lightvector") and/or other authors of KataGo, giấy phép MIT
// (toàn văn trong tệp NOTICE của dự án).
(function (root) {
  'use strict';
  const NF = 22, NG = 19;   // số kênh đầu vào trên bàn và số đầu vào toàn cục (V7)

  // ---------- Đọc tệp .kgo ----------
  function halfTable() {
    const t = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
      const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
      t[h] = e === 0 ? s * m * Math.pow(2, -24) : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * Math.pow(2, e - 15);
    }
    return t;
  }
  function decodeModel(ab) {
    const u8 = new Uint8Array(ab), dv = new DataView(ab);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'KGO1') throw new Error('Không phải tệp mạng .kgo');
    const jl = dv.getUint32(4, true);
    const meta = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + jl)));
    const start = 8 + jl + ((4 - (8 + jl) % 4) % 4);
    const f16 = meta.dtype === 'f16', H = f16 ? halfTable() : null;
    const get = key => {
      const e = meta.t[key]; if (!e) throw new Error('Thiếu ' + key);
      const [off, len] = e, out = new Float32Array(len);
      if (f16) { const v = new Uint16Array(ab, start + off * 2, len); for (let i = 0; i < len; i++) out[i] = H[v[i]]; }
      else out.set(new Float32Array(ab, start + off * 4, len));
      return out;
    };
    return { meta, get, shape: key => meta.t[key].slice(2) };
  }

  // ---------- Mạng ----------
  // tf: đối tượng TensorFlow.js (đã chọn backend). Mọi trọng số được nạp một lần thành tensor.
  class Net {
    constructor(tf, model) {
      this.tf = tf; this.meta = model.meta;
      const W = {};
      for (const k of Object.keys(model.meta.t)) W[k] = tf.tensor(model.get(k), model.shape(k));
      this.W = W;
    }
    dispose() { for (const k of Object.keys(this.W)) this.W[k].dispose(); }
    // Gộp toàn cục: trung bình, trung bình × (√diện tích − 14)/10, và (khi có) lớn nhất — giống KataGo
    gpool(x, area, withMax) {
      const tf = this.tf, mean = tf.mean(x, [1, 2]), k = (Math.sqrt(area) - 14) * 0.1;
      const parts = [mean, tf.mul(mean, k)];
      parts.push(withMax ? tf.max(x, [1, 2]) : tf.mul(mean, (Math.sqrt(area) - 14) * (Math.sqrt(area) - 14) * 0.01 - 0.1));
      return tf.concat(parts, 1);
    }
    // bin: Float32Array N×H×W×22 (NHWC), glob: Float32Array N×19. Trả về các mảng thô (chưa softmax), phía bên đi.
    run(bin, glob, N, H, Wd) {
      const tf = this.tf, w = this.W, m = this.meta, area = H * Wd;
      const out = tf.tidy(() => {
        const conv = (x, f) => tf.conv2d(x, w[f], 1, 'same');
        const fconv = (x, f, b, act) => tf.fused.conv2d({ x, filter: w[f], strides: 1, pad: 'same', bias: w[b], activation: act ? 'relu' : 'linear' });
        const input = tf.tensor4d(bin, [N, H, Wd, NF]), gin = tf.tensor2d(glob, [N, NG]);
        let x = tf.add(conv(input, 'init.conv'), tf.reshape(tf.matMul(gin, w['init.mul']), [N, 1, 1, m.trunkC]));
        m.blocks.forEach((kind, i) => {
          const p = 'b' + i + '.';
          const a = tf.relu(tf.add(tf.mul(x, w[p + 'pre.s']), w[p + 'pre.b']));
          let h;
          if (kind === 'o') h = fconv(a, p + 'c1', p + 'c1.b', true);
          else {
            const g = fconv(a, p + 'g', p + 'g.b', true);
            const bias = tf.add(tf.matMul(this.gpool(g, area, true), w[p + 'g2b']), w[p + 'mid.b']);
            h = tf.relu(tf.add(conv(a, p + 'reg'), tf.reshape(bias, [N, 1, 1, m.regC])));
          }
          x = tf.add(x, conv(h, p + 'c2'));
        });
        const t = tf.relu(tf.add(tf.mul(x, w['tip.s']), w['tip.b']));
        // Nước đi
        const g1 = fconv(t, 'p.g1', 'p.g1.b', true), gp = this.gpool(g1, area, true);
        const pb = tf.add(tf.matMul(gp, w['p.gb']), w['p.p1.b']);
        const p1 = tf.relu(tf.add(conv(t, 'p.p1'), tf.reshape(pb, [N, 1, 1, pb.shape[1]])));
        const policy = tf.reshape(conv(p1, 'p.p2'), [N, area]), pass = tf.reshape(tf.matMul(gp, w['p.pass']), [N]);
        // Thế cờ
        const v1 = fconv(t, 'v.v1', 'v.v1.b', true), vp = this.gpool(v1, area, false);
        const v2 = tf.relu(tf.add(tf.matMul(vp, w['v.v2']), w['v.v2.b']));
        const value = tf.add(tf.matMul(v2, w['v.v3']), w['v.v3.b']), score = tf.add(tf.matMul(v2, w['v.sv3']), w['v.sv3.b']);
        const own = tf.reshape(conv(v1, 'v.own'), [N, area]);
        return [policy, pass, value, score, own];
      });
      const [policy, pass, value, score, own] = out.map(t => { const d = t.dataSync(); t.dispose(); return d; });
      return { policy, pass, value, score, own, nScore: this.meta.t['v.sv3.b'][1] };
    }
  }

  // ---------- Bàn cờ gọn cho việc mã hoá đầu vào ----------
  // Dùng chung cách đánh số của lõi go.js: Pos có b (mảng có viền), W, n, D, idx(p), pt(i), group, libsOf, tryPlay, make, unmake.
  const EMPTY = 0;
  const colOf = side => side ? 2 : 1;   // bên 0 (Đen) = 1, bên 1 (Trắng) = 2

  // ---- Thang (Board::searchIsLadderCaptured của KataGo, viết đệ quy). Bên phòng thủ là màu của nhóm chứa ô ti.
  const LADDER_BUDGET = 25000;
  function ladderCaptured(pos, ti, defenderFirst) {
    const col = pos.b[ti];
    if (col !== 1 && col !== 2) return false;
    const libs0 = pos.libsOf(ti).length;
    if (libs0 > 2 || (defenderFirst && libs0 > 1)) return false;
    const st = { nodes: 0, limit: (pos.n * pos.n * 3 / 2) | 0, over: false };
    const savedKo = pos.ko; if (defenderFirst) pos.ko = -1;
    const savedSide = pos.side;
    let r;
    try { r = ladderRec(pos, ti, col, defenderFirst, 0, st); } finally { pos.ko = savedKo; pos.side = savedSide; }
    return st.over ? false : r;
  }
  function ladderPlay(pos, i, col) {   // đặt quân màu col ở ô i (bỏ qua lượt đi), trả về true nếu hợp lệ (không tự sát)
    pos.side = col === 1 ? 0 : 1;
    if (pos.b[i] !== EMPTY || i === pos.ko || !pos.tryPlay(i, false)) return false;
    pos.make(pos.pt(i) + 1);
    return true;
  }
  function ladderRec(pos, ti, col, isDefender, depth, st) {
    if (st.over) return false;
    if (++st.nodes > LADDER_BUDGET) { st.over = true; return false; }
    if (depth >= st.limit) return true;
    const libs = pos.libsOf(ti), opp = col === 1 ? 2 : 1;
    if (!isDefender && libs.length <= 1) return true;
    if (!isDefender && libs.length >= 3) return false;
    if (isDefender && libs.length >= 2) return false;
    if (isDefender && pos.ko >= 0) return false;
    let moves;
    if (isDefender) {
      moves = [];
      const seen = new Set();
      for (const s of pos.group(ti).stones) for (const d of pos.D) {   // ăn quân vây quanh đang bị atari để thêm khí
        const t = s + d;
        if (pos.b[t] !== opp || seen.has(t)) continue;
        const g = pos.group(t).stones; g.forEach(x => seen.add(x));
        const l = pos.libsOf(t); if (l.length === 1 && !moves.includes(l[0])) moves.push(l[0]);
      }
      for (const l of libs) if (!moves.includes(l)) moves.push(l);
    } else moves = libs.slice();
    for (const i of moves) {
      if (!ladderPlay(pos, i, isDefender ? col : opp)) continue;
      let r;
      try { r = pos.b[ti] === EMPTY ? true : ladderRec(pos, ti, col, !isDefender, depth + 1, st); } finally { pos.unmake(); }
      if (st.over) return false;
      if (isDefender && !r) return false;   // bên phòng thủ có nước thoát
      if (!isDefender && r) return true;    // bên tấn công có nước bắt được
    }
    return isDefender;   // phòng thủ: mọi nước đều bị bắt; tấn công: không nước nào bắt được
  }
  // Duyệt các nhóm 1–2 khí bị thang (iterLadders): f(điểm p, các nước tấn công thành công nếu nhóm có 2 khí)
  function iterLadders(pos, f) {
    const n = pos.n, done = new Map();
    for (let p = 0; p < n * n; p++) {
      const i = pos.idx(p), c = pos.b[i];
      if (c !== 1 && c !== 2) continue;
      const stones = pos.group(i).stones, libs = pos.libsOf(i).length;
      if (libs !== 1 && libs !== 2) continue;
      const head = Math.min.apply(null, stones);
      if (done.has(head)) { if (done.get(head)) f(p, []); continue; }
      let laddered;
      const working = [];
      if (libs === 1) laddered = ladderCaptured(pos, i, true);
      else {
        const opp = c === 1 ? 2 : 1, savedSide = pos.side;
        for (const l of pos.libsOf(i)) {
          if (!ladderPlay(pos, l, opp)) continue;
          let r;
          try { r = ladderCaptured(pos, i, true); } finally { pos.unmake(); pos.side = savedSide; }
          if (r) working.push(pos.pt(l));
        }
        pos.side = savedSide;
        laddered = working.length > 0;
      }
      done.set(head, laddered);
      if (laddered) f(p, working);
    }
  }

  // ---- Đất "sống chắc" (Board::calculateAreaForPla, thuật toán Benson) và đất lớn, như calculateArea(true, true, true, cấm tự sát)
  function areaForPla(pos, pla, result) {
    const n = pos.n, opp = pla === 1 ? 2 : 1, b = pos.b, D = pos.D;
    const N = pos.W * pos.W, regionOf = new Int32Array(N).fill(-1), chainOf = new Int32Array(N).fill(-1);
    // Nhóm quân của pla
    const chains = [];
    for (let p = 0; p < n * n; p++) {
      const i = pos.idx(p); if (b[i] !== pla || chainOf[i] >= 0) continue;
      const stones = pos.group(i).stones, id = chains.length; stones.forEach(s => { chainOf[s] = id; });
      chains.push({ stones, vital: 0, killed: false });
    }
    const adjPla = i => D.some(d => b[i + d] === pla);
    const adjChain = (i, c) => D.some(d => chainOf[i + d] === c);
    const regions = [];
    for (let p = 0; p < n * n; p++) {
      const i0 = pos.idx(p); if (b[i0] !== EMPTY || regionOf[i0] >= 0) continue;
      const id = regions.length;
      const vital = []; for (const d of D) { const c = chainOf[i0 + d]; if (c >= 0 && !vital.includes(c)) vital.push(c); }
      const reg = { pts: [], internal: 0, containsOpp: false, bordersDead: false, vital };
      const q = [i0]; regionOf[i0] = id;
      while (q.length) {
        const i = q.shift();
        if (reg.vital.length && b[i] === EMPTY) reg.vital = reg.vital.filter(c => adjChain(i, c));
        if (reg.internal < 2 && !adjPla(i)) reg.internal++;
        if (b[i] === opp) reg.containsOpp = true;
        reg.pts.push(i);
        for (const d of D) { const t = i + d; if ((b[t] === EMPTY || b[t] === opp) && regionOf[t] < 0) { regionOf[t] = id; q.push(t); } }
      }
      regions.push(reg);
    }
    const atLeastOnePla = chains.length > 0;
    for (const r of regions) for (const c of r.vital) chains[c].vital++;
    for (;;) {
      let killed = false;
      chains.forEach((ch, ci) => {
        if (ch.killed || ch.vital >= 2) return;
        ch.killed = true; killed = true;
        for (const s of ch.stones) for (const d of D) {
          const t = s + d, ri = regionOf[t];
          if (ri >= 0 && !regions[ri].bordersDead && (b[t] === EMPTY || b[t] === opp)) {
            regions[ri].bordersDead = true;
            for (const c of regions[ri].vital) chains[c].vital--;
          }
        }
        void ci;
      });
      if (!killed) break;
    }
    for (const ch of chains) if (!ch.killed) for (const s of ch.stones) result[s] = pla;
    for (const r of regions) {
      const mark = (r.internal <= 1 && !r.bordersDead && atLeastOnePla) || (!r.containsOpp && !r.bordersDead && atLeastOnePla);
      if (mark) for (const i of r.pts) result[i] = pla;
      else if (!r.containsOpp && atLeastOnePla) for (const i of r.pts) if (result[i] === EMPTY) result[i] = pla;
    }
  }
  function calculateArea(pos) {
    const result = new Uint8Array(pos.W * pos.W);
    areaForPla(pos, 1, result); areaForPla(pos, 2, result);
    for (let p = 0; p < pos.n * pos.n; p++) { const i = pos.idx(p); if (result[i] === EMPTY) result[i] = pos.b[i]; }
    return result;
  }

  // ---------- Mã hoá đầu vào (fillRowV7, luật Trung Quốc) ----------
  // pos: thế cờ của lõi go.js (có lịch sử pos.undo). Ghi vào bin (H×W×22, NHWC) và glob (19) tại vị trí off.
  function features(pos, bin, binOff, glob, globOff) {
    const n = pos.n, pla = colOf(pos.side), opp = pla === 1 ? 2 : 1;
    const set = (p, f) => { bin[binOff + p * NF + f] = 1; };
    for (let p = 0; p < n * n; p++) {
      const i = pos.idx(p); set(p, 0);
      const c = pos.b[i];
      if (c === pla) set(p, 1); else if (c === opp) set(p, 2);
      if (c === 1 || c === 2) { const l = pos.libsOf(i).length; if (l === 1) set(p, 3); else if (l === 2) set(p, 4); else if (l === 3) set(p, 5); }
    }
    if (pos.ko >= 0) set(pos.pt(pos.ko), 6);
    const area = calculateArea(pos);
    for (let p = 0; p < n * n; p++) { const a = area[pos.idx(p)]; if (a === pla) set(p, 18); else if (a === opp) set(p, 19); }
    // Lịch sử 5 nước. Luật Trung Quốc cho "bỏ lượt thân thiện": đối phương vừa bỏ lượt thì giấu lịch sử (như KataGo).
    const U = pos.undo, L = U.length;
    const lastPass = L > 0 && U[L - 1].m === 1000;
    let hist = 0;
    if (!lastPass) {
      for (let k = 1; k <= 5 && k <= L; k++) {
        const m = U[L - k].m; hist = k;
        if (m === 1000) glob[globOff + k - 1] = 1; else set(m - 1, 8 + k);
      }
    }
    iterLadders(pos, (p, working) => {
      set(p, 14);
      if (pos.b[pos.idx(p)] === opp && pos.libsOf(pos.idx(p)).length > 1) for (const w of working) set(w, 17);
    });
    // Thang ở thế 1 và 2 nước trước (lùi tạm rồi đi lại)
    const back = Math.min(hist, 2), saved = [];
    for (let k = 1; k <= 2; k++) {
      if (k <= back) { saved.push(U[U.length - 1].m); pos.unmake(); }
      iterLadders(pos, p => set(p, 14 + k));
    }
    while (saved.length) pos.make(saved.pop());
    // Toàn cục
    const selfKomi = pla === 2 ? pos.komi : -pos.komi;
    glob[globOff + 5] = Math.max(-n * n - 20, Math.min(n * n + 20, selfKomi)) / 20;
    const even = (n * n) % 2 === 0;
    const floor = even ? Math.floor(selfKomi / 2) * 2 : Math.floor((selfKomi - 1) / 2) * 2 + 1;
    const delta = Math.max(0, Math.min(2, selfKomi - floor));
    glob[globOff + 18] = delta < 0.5 ? delta : delta < 1.5 ? 1 - delta : delta - 2;
  }

  // ---------- Hậu xử lý: giống nneval.cpp (phiên bản 8), trả về phía Trắng như kata-raw-nn ----------
  // raw: đầu ra Net.run; k: thứ tự trong lô; pos: thế cờ (để biết nước hợp lệ và bên đi)
  function post(raw, k, pos) {
    const n = pos.n, A = n * n, white = pos.side === 1;
    const policy = new Float32Array(A + 1);
    let mx = -1e30;
    const legal = new Uint8Array(A + 1);
    for (let p = 0; p < A; p++) legal[p] = pos.tryPlay(pos.idx(p), false) ? 1 : 0;   // giống KataGo: kiếp đơn, không xét siêu kiếp
    legal[A] = 1;
    for (let p = 0; p <= A; p++) { const v = legal[p] ? (p < A ? raw.policy[k * A + p] : raw.pass[k]) : -1e30; policy[p] = v; if (v > mx) mx = v; }
    let sum = 0;
    for (let p = 0; p <= A; p++) { policy[p] = legal[p] ? Math.exp(policy[p] - mx) : 0; sum += policy[p]; }
    for (let p = 0; p <= A; p++) policy[p] = legal[p] ? policy[p] / sum : -1;
    const v = raw.value.subarray(k * 3, k * 3 + 3), vm = Math.max(v[0], v[1], v[2]);
    const e = [Math.exp(v[0] - vm), Math.exp(v[1] - vm), Math.exp(v[2] - vm)], es = e[0] + e[1] + e[2];
    const win = e[0] / es, loss = e[1] / es, noRes = e[2] / es;
    const S = raw.nScore, s = raw.score.subarray(k * S, k * S + S);
    const softPlus = x => x > 30 ? x : Math.log1p(Math.exp(x));
    const scoreMean = s[0] * 20 * (1 - noRes), stdev = softPlus(s[1]) * 20, lead = (S >= 3 ? s[2] : s[0]) * 20 * (1 - noRes);
    const own = new Float32Array(A);
    for (let p = 0; p < A; p++) { const t = Math.tanh(raw.own[k * A + p]); own[p] = white ? t : -t; }
    return {
      policy,   // xác suất từng điểm (0..A-1) và bỏ lượt (A); -1: không hợp lệ
      whiteWin: white ? win : loss, whiteLoss: white ? loss : win, noResult: noRes,
      whiteLead: white ? lead : -lead, whiteScore: white ? scoreMean : -scoreMean, scoreStdev: stdev,
      whiteOwnership: own   // +1: chắc chắn của Trắng, -1: của Đen
    };
  }

  // Đánh giá một lô thế cờ: trả về mảng kết quả post()
  function evaluate(net, list) {
    const N = list.length, n = list[0].n;
    const bin = new Float32Array(N * n * n * NF), glob = new Float32Array(N * NG);
    list.forEach((pos, k) => features(pos, bin, k * n * n * NF, glob, k * NG));
    const raw = net.run(bin, glob, N, n, n);
    return list.map((pos, k) => post(raw, k, pos));
  }

  // ---------- Quân chết theo bản đồ chủ đất của mạng ----------
  // own: chủ đất phía Trắng (+1 Trắng, -1 Đen). Nhóm quân Đen mà trung bình nghiêng về Trắng quá ngưỡng là chết (và ngược lại).
  function deadFromOwnership(pos, own, thr) {
    const n = pos.n, dead = new Set(), seen = new Set(), t = thr === undefined ? 0.4 : thr;
    for (let p = 0; p < n * n; p++) {
      const a = pos.at(p); if (a < 0 || seen.has(p)) continue;
      const g = pos.group(pos.idx(p)).stones.map(i => pos.pt(i));
      g.forEach(q => seen.add(q));
      const avg = g.reduce((s, q) => s + own[q], 0) / g.length;
      if ((a === 0 && avg > t) || (a === 1 && avg < -t)) g.forEach(q => dead.add(q));
    }
    return dead;
  }

  // ---------- Tìm nước: cây Monte-Carlo dẫn hướng bằng mạng (PUCT, như KataGo / AlphaZero, rút gọn) ----------
  // Mỗi lần thăm: đi xuống cây theo PUCT, đánh giá lá bằng mạng (giá trị = thắng − thua, phía bên đi), cộng ngược lên.
  // Hai lần bỏ lượt liền nhau: coi như lá, lấy giá trị mạng của thế đó (không mở rộng tiếp).
  const PASS = 1000;
  class Search {
    constructor(net) { this.net = net; }
    // Đánh giá một thế, trả về { v (phía bên đi), r (kết quả post) }
    eval1(pos) { const r = evaluate(this.net, [pos])[0]; return { r, v: pos.side ? r.whiteWin - r.whiteLoss : r.whiteLoss - r.whiteWin }; }
    // Nút con từ xác suất của mạng: chỉ nước hợp lệ theo luật app (có siêu kiếp), giữ tối đa 48 nước có xác suất cao nhất
    kids(pos, r) {
      const A = pos.n * pos.n, list = [];
      for (let p = 0; p < A; p++) if (r.policy[p] > 0) list.push([p + 1, r.policy[p]]);
      list.push([PASS, Math.max(0, r.policy[A])]);
      list.sort((a, b) => b[1] - a[1]);
      const out = []; let sum = 0;
      for (const [m, P] of list) { if (out.length >= 48) break; if (m !== PASS && !pos.isLegal(m)) continue; out.push({ m, P, N: 0, W: 0, kids: null, v: 0 }); sum += P; }
      if (sum > 0) out.forEach(k => { k.P /= sum; });
      return out;
    }
    // opts: visits (số lần thăm tối đa), timeMs (giới hạn thời gian), temp (>0: chọn ngẫu nhiên theo xác suất của mạng khi chỉ 1 lần thăm),
    //       seed (để kiểm tra lặp lại được). Trả về { move, visits, winrate (bên đi), lead (bên đi), top: [[nước, số lần thăm, xác suất]] }
    search(pos, opts) {
      opts = opts || {};
      const t0 = Date.now(), maxV = Math.max(1, opts.visits || 1), tl = opts.timeMs || 0;
      let rnd = Math.random;
      if (opts.seed) { let s = opts.seed | 0; rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
      const e0 = this.eval1(pos), root = { m: 0, N: 1, W: 0, v: e0.v, kids: this.kids(pos, e0.r) };
      const lead0 = pos.side ? e0.r.whiteLead : -e0.r.whiteLead;
      if (!root.kids.length) return { move: PASS, visits: 1, winrate: (e0.v + 1) / 2, lead: lead0, top: [] };
      // Chỉ dùng cảm giác của mạng (1 lần thăm)
      if (maxV <= 1) {
        let pick = root.kids[0];
        if (opts.temp > 0) {
          const pmax = root.kids[0].P, cand = root.kids.filter(k => k.m !== PASS && k.P >= Math.max(0.01, pmax * 0.05));
          if (cand.length) {
            const w = cand.map(k => Math.pow(k.P, 1 / opts.temp)), tot = w.reduce((a, b) => a + b, 0);
            let x = rnd() * tot; pick = cand[cand.length - 1];
            for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x <= 0) { pick = cand[i]; break; } }
            if (root.kids[0].m === PASS) pick = root.kids[0];
          }
        }
        return { move: pick.m, visits: 1, winrate: (e0.v + 1) / 2, lead: lead0, top: root.kids.slice(0, 5).map(k => [k.m, 0, k.P]) };
      }
      const C = 1.1;
      let visits = 1;
      while (visits < maxV && !(tl && Date.now() - t0 > tl)) {
        const path = [root]; let node = root, depth = 0;
        while (node.kids && node.kids.length) {
          const sq = Math.sqrt(node.N), fpu = (node === root ? root.v : -node.W / node.N) - 0.2;
          let best = null, bs = -1e9;
          for (const k of node.kids) {
            const q = k.N ? k.W / k.N : fpu, s = q + C * k.P * sq / (1 + k.N);
            if (s > bs) { bs = s; best = k; }
          }
          pos.make(best.m); depth++; path.push(best); node = best;
          if (!node.N) break;
          if (pos.passes >= 2) break;
        }
        let v;   // giá trị phía bên đi ở lá
        if (node.N && node.kids === null) v = node.v;           // lá đã đánh giá (hết ván)
        else {
          const e = this.eval1(pos); v = e.v; node.v = v;
          node.kids = pos.passes >= 2 ? null : this.kids(pos, e.r);
        }
        for (let i = path.length - 1; i >= 0; i--) {   // nút lưu giá trị theo phía người vừa đi vào nút đó
          const nd = path[i];
          nd.N++; if (i > 0) nd.W += -v;
          v = -v;
        }
        for (let k = 0; k < depth; k++) pos.unmake();
        visits++;
        // Dừng sớm khi nước nhiều lượt thăm nhất không thể bị vượt trong số lượt còn lại
        if (maxV - visits < 1e9 && root.kids.length > 1) {
          const s = root.kids.slice().sort((a, b) => b.N - a.N);
          if (s[0].N - s[1].N > maxV - visits) break;
        }
      }
      const sorted = root.kids.slice().sort((a, b) => b.N - a.N || b.P - a.P), best = sorted[0];
      const wr = best.N ? (best.W / best.N + 1) / 2 : (e0.v + 1) / 2;
      return { move: best.m, visits, winrate: wr, lead: lead0, top: sorted.slice(0, 5).map(k => [k.m, k.N, k.P]) };
    }
  }

  const api = { decodeModel, Net, features, evaluate, calculateArea, ladderCaptured, iterLadders, deadFromOwnership, Search, NF, NG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KATA = api;
})(typeof self !== 'undefined' ? self : this);
