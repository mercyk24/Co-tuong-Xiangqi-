  // [DÙNG CHUNG] Cả cờ tướng và cờ vua chạy tệp này. Phần riêng (thang điểm, cách tạo bài "Lỗi của bạn"): HOOKS.ana. Sơ đồ: docs/CAU-TRUC.md
  // 80-analysis.js — Phân tích ván bằng engine mạnh (Fairy-Stockfish): điểm từng nước, nước sai, đường đi dự kiến, soi sâu; tạo bài "Lỗi của bạn".
  // ---------- Phân tích ván ----------
  // Ngưỡng điểm (chưa chính xác / sai lầm / sai lầm nặng) và đơn vị hiển thị: riêng từng loại cờ (HOOKS.ana.AN)
  const AN = HOOKS.ana.AN;
  const fmtPts = v => (v / AN.UNIT).toFixed(1).replace('.', ',');
  const clampV = v => Math.max(-AN.CLAMP, Math.min(AN.CLAMP, v));
  function posAt(g, i) {
    const p = RULES.Pos.fromFen(g.startFen);
    for (let j = 0; j < i; j++) { const m = p.legalMoves().find(x => RULES.mvStr(x) === g.moves[j]); if (m === undefined) break; p.make(m); }
    return p;
  }
  // Nước thứ i có phải của người cần nhận xét không (ván hai người: cả hai bên).
  const isMine = (g, i) => !!g.pvp || (i % 2) === (g.user === 0 ? 0 : 1);
  const Ana = {
    games: Store.get('games', []), cur: null, k: 0, gen: 0, running: false, showBest: true, notes: [],
    init() {
      this.board = new Board($('#ana-board'), () => { });
      $('#ana-toplay').onclick = () => { this.cancel(); showTab('play'); Play.goHome(); };
      $('#ana-back').onclick = () => { this.cancel(); this.renderList(); };
      $('#ana-deep').onclick = () => this.toggleLive();
      HOOKS.ana.init();   // cờ tướng: nút đổi cách ghi nước
      $('#ana-mode').value = Store.get('ana_mode', 'max');
      $('#ana-mode').onchange = e => Store.set('ana_mode', e.target.value);
      $('#ana-redo').onclick = () => { if (this.cur && !this.running) { this.cur.ana = null; Store.set('games', this.games); this.k = 0; this.draw(); this.run(this.cur); } };
      $('#ana-first').onclick = () => this.go(0);
      $('#ana-prev').onclick = () => this.go(this.k - 1);
      $('#ana-next').onclick = () => this.go(this.k + 1);
      $('#ana-last').onclick = () => this.go(this.cur ? this.cur.moves.length : 0);
      $('#ana-best').onclick = () => { this.showBest = !this.showBest; this.draw(); };
      $('#ana-mine').onclick = () => { this.cancel(); showTab('tac'); };
      this.renderList();
    },
    quality(loss) { return loss >= AN.BLUN ? 3 : loss >= AN.MIST ? 2 : loss >= AN.INACC ? 1 : 0; },
    QN: ['', 'Chưa chính xác', 'Sai lầm', 'Sai lầm nặng'],
    QM: ['', '?!', '?', '??'],
    openCurrent() {
      const g = Play.saveGame();
      if (!g) { toast('Ván cần ít nhất 5 nước mỗi bên mới phân tích được.', 'warn'); return; }
      showTab('ana'); this.open(g.id);
    },
    show() { this.gen++; this.renderList(); },
    renderList() {
      this.cur = null; $('#ana-list-wrap').hidden = false; $('#ana-detail').hidden = true;
      const G = this.games;
      $('#ana-list').innerHTML = G.length ? G.map(g => {
        const n = g.moves.length, st = g.ana ? ' · đã phân tích' : '';
        return '<button class="pz" data-id="' + esc(g.id) + '"><span class="pz-n">' + new Date(g.t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (g.pvp ? ' · hai người chơi' : (g.net ? ' · qua mạng' : '') + ' · bạn cầm ' + SIDE[g.user]) + '</span><span class="pz-s">' + n + ' nước · ' + (g.pvp || g.net ? '' : 'cấp ' + g.level + ' · ') + esc(g.res || 'chưa kết thúc') + st + '</span></button>';
      }).join('') : '<p class="muted">Chưa có ván nào. Chơi một ván từ Trang chủ (mỗi bên từ 5 nước trở lên) rồi quay lại đây.</p>';
      $$('#ana-list .pz').forEach(b => b.onclick = () => this.open(b.dataset.id));
    },
    open(id) {
      const g = this.games.find(x => x.id === id); if (!g) return;
      this.cancel(); this.liveHtml = ''; this.cur = g; this.running = false;
      const p = RULES.Pos.fromFen(g.startFen); this.notes = [];
      for (const u of g.moves) { const m = p.legalMoves().find(x => RULES.mvStr(x) === u); if (m === undefined) break; this.notes.push(p.notation(m)); p.make(m); }
      this.showBest = true;
      $('#ana-list-wrap').hidden = true; $('#ana-detail').hidden = false;
      this.board.setFlip(g.user === 1);
      this.k = 0;
      if (g.ana) { this.k = this.worst(g); this.draw(); }
      else { this.draw(); this.run(g); }
    },
    worst(g) { let b = -1, bl = AN.MIST - 1; g.ana.ls.forEach((l, i) => { if (isMine(g, i) && l > bl) { bl = l; b = i; } }); return b >= 0 ? b : 0; },
    go(k) { const g = this.cur; if (!g) return; this.stopLive(); this.k = Math.max(0, Math.min(g.moves.length, k)); this.draw(); },
    MODES: {
      fast: { opp: 350, mine: 700, re: 0, name: 'Nhanh' },
      deep: { opp: 1200, mine: 2400, re: 0, name: 'Kỹ' },
      max: { opp: 350, mine: 700, re: 8000, name: 'Rất kỹ' }
    },
    cancel() { this.gen++; this.stopLive(); if (this.running) { FSF.stop(); this.running = false; } },
    async run(g) {
      if (!FSF.supported()) { this.msg = 'Cần engine mạnh để phân tích. Hãy tải lại trang một lần (kéo xuống để làm mới hoặc đóng và mở lại app), rồi mở lại ván này.'; this.draw(); return; }
      const gen = ++this.gen, N = g.moves.length, mode = Store.get('ana_mode', 'max'), M = this.MODES[mode] || this.MODES.max;
      this.running = true; this.msg = ''; this.status = '';
      if (!FSF.sf) toast('Đang tải engine cao thủ' + HOOKS.ana.engineSize + ', lần đầu hơi lâu…');
      const stm = [], bm = [], acc = [], pvs = [];
      const me = g.user, mineAt = i => i < N && isMine(g, i);
      try {
        for (let i = 0; i <= N; i++) {
          if (gen !== this.gen) return;
          this.status = (M.re ? 'Bước 1/2 – quét nhanh ' : 'Đang phân tích ') + 'thế ' + (i + 1) + '/' + (N + 1) + '…'; this.draw();
          const pos = posAt(g, i);
          if (!pos.legalMoves().length) { stm.push(-10000); bm.push(''); acc.push([]); pvs.push([]); continue; }
          const mine = (g.pvp || pos.side === me) && i < N;
          const L = await FSF.analyse(g.startFen, g.moves.slice(0, i), mine ? M.mine : M.opp, mine ? 3 : 1);
          if (gen !== this.gen) return;
          stm.push(L[0].v); bm.push(L[0].m); pvs.push(L[0].pv);
          acc.push(mine ? L.filter(l => L[0].v - l.v <= 40).map(l => l.m) : [L[0].m]);
        }
        if (M.re) {
          // Bước 2: soi sâu những nước sai nghi ngờ (tối đa 10 nước nặng nhất), cả thế trước và thế sau nước đó.
          const pre = [];
          for (let i = 0; i < N; i++) if (mineAt(i)) { let l = Math.max(0, clampV(stm[i]) - clampV(-stm[i + 1])); if (g.moves[i] === bm[i] || acc[i].indexOf(g.moves[i]) >= 0) l = 0; if (l >= AN.INACC * 0.7) pre.push([i, l]); }
          pre.sort((x, y) => y[1] - x[1]);
          const flag = pre.slice(0, 10).map(x => x[0]);
          for (let j = 0; j < flag.length; j++) {
            const i = flag[j];
            if (gen !== this.gen) return;
            this.status = 'Bước 2/2 – soi sâu nước sai ' + (j + 1) + '/' + flag.length + ' (nước thứ ' + (i + 1) + ', ' + (M.re / 1000) + ' giây mỗi thế)…'; this.draw();
            const L = await FSF.analyse(g.startFen, g.moves.slice(0, i), M.re, 3);
            if (gen !== this.gen) return;
            stm[i] = L[0].v; bm[i] = L[0].m; pvs[i] = L[0].pv; acc[i] = L.filter(l => L[0].v - l.v <= 40).map(l => l.m);
            if (posAt(g, i + 1).legalMoves().length) {
              const L2 = await FSF.analyse(g.startFen, g.moves.slice(0, i + 1), M.re, 1);
              if (gen !== this.gen) return;
              stm[i + 1] = L2[0].v; bm[i + 1] = L2[0].m; pvs[i + 1] = L2[0].pv; acc[i + 1] = [L2[0].m];
            }
          }
        }
      } catch (e) {
        if (gen !== this.gen) return;
        this.running = false; this.msg = 'Phân tích bị gián đoạn (' + (e && e.message || e) + '). Thử lại sau.'; this.draw(); return;
      }
      if (gen !== this.gen) return;
      const ev = stm.map((v, i) => (posAt(g, i).side === 0 ? v : -v));
      const ls = [];
      for (let i = 0; i < N; i++) {
        let l = Math.max(0, clampV(stm[i]) - clampV(-stm[i + 1]));
        if (g.moves[i] === bm[i] || acc[i].indexOf(g.moves[i]) >= 0) l = 0;
        ls.push(Math.round(l));
      }
      g.ana = { n: N, ev: ev.map(Math.round), bm, ls, acc, mode, pv: pvs.map(p => (p || []).slice(0, 7).join(' ')) };
      Store.set('games', this.games);
      this.running = false; this.status = '';
      const added = this.makePuzzles(g, stm, pvs);
      this.k = this.worst(g);
      this.draw();
      if (added) toast('Đã thêm ' + added + ' bài vào "Lỗi của bạn" (tab Chiến thuật).', 'ok');
    },
    // Chuyển dãy nước UCI (từ thế pos) thành ký hiệu, dừng khi gặp nước không hợp lệ.
    pvNotes(pos, uci, max) {
      const q = RULES.Pos.fromFen(pos.fen()), out = [];
      for (const u of (uci || []).slice(0, max || 7)) { const m = q.legalMoves().find(x => RULES.mvStr(x) === u); if (m === undefined) break; out.push(q.notation(m)); q.make(m); }
      return out;
    },
    evText(vRed) {
      if (Math.abs(vRed) > 9000) return SIDE[vRed > 0 ? 0 : 1] + ' chiếu hết sau ' + (10000 - Math.abs(vRed)) + ' nước';
      if (Math.abs(vRed) < AN.UNIT * 0.12) return 'cân bằng (' + (vRed >= 0 ? '+' : '−') + fmtPts(Math.abs(vRed)) + ')';
      return SIDE[vRed > 0 ? 0 : 1] + ' +' + fmtPts(Math.abs(vRed));
    },
    // Soi sâu thế đang xem: engine tìm 15 giây, hiện 3 nước tốt nhất kèm đường đi dự kiến.
    stopLive() { if (this.live) { this.live = false; FSF.stop(); } },
    toggleLive() {
      if (this.live) { this.stopLive(); return; }
      const g = this.cur; if (!g || this.running) return;
      if (!FSF.supported()) { toast('Cần engine mạnh: hãy tải lại trang một lần.', 'warn'); return; }
      const k = this.k, pos = posAt(g, k), gen = this.gen;
      if (!pos.legalMoves().length) { toast('Thế này đã hết nước đi.'); return; }
      this.live = true; this.liveK = k; this.liveHtml = '<span class="muted">Đang tìm…</span>'; this.draw();
      const upd = (L, fin) => {
        if (!this.live && !fin) return;
        if (gen !== this.gen || this.k !== k) return;
        this.liveHtml = L.map((l, r) => {
          const vr = pos.side === 0 ? l.v : -l.v, nt = this.pvNotes(pos, l.pv, 8);
          return '<div style="margin:6px 0"><b>' + (r + 1) + '.</b> ' + esc(this.evText(vr)) + ' <span class="muted">(độ sâu ' + l.d + ')</span><br>' + esc(ndt(nt.join(' → '))) + '</div>';
        }).join('') || '<span class="muted">Đang tìm…</span>';
        if (fin) this.liveHtml += '<span class="muted">Đã tìm xong. Điểm nhìn từ phía ' + SIDE.join('/') + HOOKS.ana.unitNote + ', số càng lớn càng có lợi.</span>';
        this.drawLive();
      };
      FSF.analyse(g.startFen, g.moves.slice(0, k), 15000, 3, upd).then(() => { this.live = false; if (gen === this.gen && this.k === k) this.draw(); }).catch(e => { this.live = false; this.liveHtml = 'Lỗi khi soi sâu: ' + esc(e && e.message || e); this.drawLive(); });
    },
    drawLive() {
      const box = $('#ana-live'); if (!box) return;
      box.hidden = !(this.liveK === this.k && this.liveHtml);
      box.innerHTML = this.liveHtml || '';
      $('#ana-deep').textContent = this.live ? 'Dừng soi sâu' : 'Soi sâu thế này';
    },
    // Mỗi sai lầm của người chơi, ở thế chưa thua hẳn, thành một bài tập "tìm nước đúng".
    makePuzzles(g, stm, pvs) {
      const mine = Store.get('mine', []); let added = 0;
      for (let i = 0; i < g.moves.length; i++) {
        if (!isMine(g, i)) continue;
        if (g.ana.ls[i] < AN.MIST || stm[i] < -900) continue;
        const id = 'm' + g.id.slice(1) + '_' + i; if (mine.some(x => x.id === id)) continue;
        // Bài "Lỗi của bạn": cách ghi lời giải riêng từng loại cờ (HOOKS.ana.mineItem); null = bỏ qua
        const item = HOOKS.ana.mineItem(posAt(g, i), g, i, pvs[i], id);
        if (!item) continue;
        mine.unshift(item);
        added++;
      }
      Store.set('mine', mine.slice(0, 200)); Tac.mine = Store.get('mine', []);
      return added;
    },
    graph(g) {
      const ev = g.ana.ev, n = ev.length, W = 300, H = 70, sg = g.user === 0 ? 1 : -1;
      const X = i => (n > 1 ? i * W / (n - 1) : 0), Y = v => H / 2 - Math.max(-900, Math.min(900, v * sg)) / 900 * (H / 2 - 4);
      let d = ''; ev.forEach((v, i) => { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
      let dots = '';
      g.ana.ls.forEach((l, i) => { if (isMine(g, i) && l >= AN.MIST) dots += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(ev[i]).toFixed(1) + '" r="3" fill="#c0392b"/>'; });
      return '<svg id="ana-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:70px;display:block;background:var(--card);border:1px solid var(--line);border-radius:12px"><line x1="0" y1="' + H / 2 + '" x2="' + W + '" y2="' + H / 2 + '" stroke="#999" stroke-width=".5" stroke-dasharray="3 3"/><path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' + dots + '<line id="ana-cur" x1="' + X(this.k).toFixed(1) + '" y1="0" x2="' + X(this.k).toFixed(1) + '" y2="' + H + '" stroke="#555" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>';
    },
    draw() {
      const g = this.cur; if (!g) return;
      const N = g.moves.length, k = this.k, pos = posAt(g, k), A = g.ana;
      const lastM = k > 0 ? (() => { const p0 = posAt(g, k - 1); const m = p0.legalMoves().find(x => RULES.mvStr(x) === g.moves[k - 1]); return m === undefined ? null : [RULES.mFrom(m), RULES.mTo(m)]; })() : null;
      let hint = null, info = '';
      const mover = k < N ? SIDE[pos.side] : '';
      if (k < N) {
        info = '<b>Nước ' + (k + 1) + ' (' + mover + '):</b> ' + esc(ndt(this.notes[k]));
        if (A) {
          const l = A.ls[k], q = this.quality(l), mine = isMine(g, k);
          if (q > 0) {
            const bmv = pos.legalMoves().find(x => RULES.mvStr(x) === A.bm[k]);
            const bn = bmv !== undefined ? pos.notation(bmv) : '';
            info += '<br><b class="' + (q >= 2 ? 'chk-t' : '') + '">' + this.QN[q] + (mine ? '' : ' (của máy)') + '</b>, mất ≈ ' + fmtPts(l) + ' điểm.' + (bn ? ' Engine chọn <b>' + esc(ndt(bn)) + '</b>.' : '');
            if (bmv !== undefined && this.showBest) hint = [RULES.mFrom(bmv), RULES.mTo(bmv)];
          } else info += '<br><b class=\"okt\">' + (g.moves[k] === A.bm[k] ? 'Trùng nước engine chọn.' : 'Nước tốt.') + '</b>';
          if (A.pv && A.pv[k]) {
            const best = A.pv[k].split(' ').filter(Boolean), line = this.pvNotes(pos, best, 7);
            if (line.length) info += '<br><span class=\"muted\">Engine dự kiến từ thế này: ' + esc(ndt(line.join(' → '))) + '</span>';
            if (q > 0 && A.pv[k + 1]) {
              const pos2 = posAt(g, k + 1), rl = this.pvNotes(pos2, A.pv[k + 1].split(' ').filter(Boolean), 6);
              if (rl.length) info += '<br><span class=\"muted\">Sau nước bạn đã đi, đối thủ có: ' + esc(ndt(rl.join(' → '))) + '</span>';
            }
          }
        }
      } else info = '<b>Thế cuối ván.</b> ' + esc(g.res || 'Ván chưa kết thúc.');
      if (!A && this.running) info = esc(this.status || 'Đang phân tích…') + '<br><span class="muted">Hãy giữ màn hình sáng và để app ở phía trước cho đến khi xong.</span>';
      if (!A && this.msg) info = esc(this.msg);
      this.board.render({ pos, last: lastM, sel: -1, targets: [], hint });
      $('#ana-title').textContent = (g.pvp ? 'Hai người chơi' : (g.net ? 'Qua mạng · ' : '') + 'Bạn cầm ' + SIDE[g.user] + (g.net ? '' : ' · cấp ' + g.level)) + ' · ' + N + ' nước';
      $('#ana-info').innerHTML = info;
      $('#ana-deep').disabled = this.running; $('#ana-redo').disabled = this.running; $('#ana-mode').disabled = this.running;
      $('#ana-modeinfo').textContent = A && A.mode ? 'Ván này đã phân tích ở mức: ' + (this.MODES[A.mode] ? this.MODES[A.mode].name : A.mode) + '.' : '';
      this.drawLive();
      $('#ana-best').disabled = !A; $('#ana-best').textContent = this.showBest ? 'Ẩn nước đúng' : 'Hiện nước đúng';
      $('#ana-first').disabled = $('#ana-prev').disabled = k === 0; $('#ana-next').disabled = $('#ana-last').disabled = k >= N;
      if (A) {
        $('#ana-graph').innerHTML = this.graph(g);
        const svg = $('#ana-svg'); svg.onclick = e => { const r = svg.getBoundingClientRect(); this.go(Math.round((e.clientX - r.left) / r.width * N)); };
        const stat = side => {
          const c = [0, 0, 0, 0]; let tot = 0, n = 0;
          A.ls.forEach((l, i) => { if (i % 2 === side) { c[this.quality(l)]++; tot += Math.min(l, 600); n++; } });
          return n + ' nước: <b>' + c[0] + '</b> tốt · <b>' + c[1] + '</b> chưa chính xác (?!) · <b>' + c[2] + '</b> sai lầm (?) · <b>' + c[3] + '</b> sai lầm nặng (??). Mỗi nước mất trung bình ≈ ' + fmtPts(n ? tot / n : 0) + ' điểm.';
        };
        $('#ana-sum').innerHTML = g.pvp
          ? '<b>' + SIDE[0] + '</b> đi ' + stat(0) + '<br><b>' + SIDE[1] + '</b> đi ' + stat(1) + '<br>Đường biểu đồ: lên là ' + SIDE[0] + ' có lợi, xuống là ' + SIDE[1] + ' có lợi; chấm đỏ là chỗ sai lầm. Bấm vào biểu đồ hoặc danh sách nước để nhảy tới.'
          : 'Bạn đi ' + stat(g.user === 0 ? 0 : 1) + '<br>Đường biểu đồ: lên là bạn có lợi, chấm đỏ là chỗ bạn sai lầm. Bấm vào biểu đồ hoặc danh sách nước để nhảy tới.';
        $('#ana-moves').innerHTML = this.notes.map((nt, i) => {
          const isRed = i % 2 === 0, q = isMine(g, i) ? this.quality(A.ls[i]) : 0;
          return (isRed ? '<span class="mn">' + (i / 2 + 1) + '.</span>' : '') + '<span class="mv ck' + (isRed ? HOOKS.ana.firstClass : '') + (i === k ? ' cur' : '') + (q ? ' q' + q : '') + '" data-i="' + i + '">' + esc(nd1(nt)) + (q ? this.QM[q] : '') + '</span>';
        }).join('');
      } else {
        $('#ana-graph').innerHTML = ''; $('#ana-sum').textContent = '';
        $('#ana-moves').innerHTML = moveListHtml(this.notes, 0, k, true);
      }
      $$('#ana-moves .mv').forEach(s => s.onclick = () => this.go(+s.dataset.i));
      const cur = $('#ana-moves .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  };

