  // [CỜ VÂY] Chỉ app cờ vây dùng. Thay cho src/shared/app/80-analysis.js (cờ vây không có engine Fairy-Stockfish nên build bỏ
  // tệp đó). Giữ cùng tên đối tượng Ana và các hàm phần dùng chung gọi tới: games, cur, init, openCurrent, renderList. Sơ đồ: docs/CAU-TRUC.md
  // 80-review.js — CỜ VÂY, tab "Ván đã lưu": xem lại từng nước, ước lượng điểm ở thế đang xem (máy đoán đất và quân chết),
  // phân tích cả ván bằng KataGo (biểu đồ khả năng thắng, đánh dấu nước dở ? / nước hỏng ??, nước KataGo đề nghị),
  // xuất ván ra SGF (định dạng chung của mọi phần mềm cờ vây), nhập ván từ tệp / đoạn chữ SGF.
  // Ngưỡng đánh dấu (khả năng thắng của bên vừa đi tụt bao nhiêu sau nước đó; ván đã ngã ngũ thì xét số điểm mất):
  const MIS = { bad: 0.2, dub: 0.1, badPts: 10, dubPts: 5 };
  const Ana = {
    games: Store.get('games', []), cur: null, k: 0, pos: null, est: null, gen: 0, delAsk: false,
    mv: [], ana: null, marks: null, part: null, anaGen: 0, anaBusy: false,
    init() {
      this.board = new Board($('#ana-board'), p => this.onSquare(p));
      $('#ana-back').onclick = () => this.renderList();
      $('#ana-toplay').onclick = () => showTab('play');
      $('#ana-first').onclick = () => this.go(0);
      $('#ana-prev').onclick = () => this.go(this.k - 1);
      $('#ana-next').onclick = () => this.go(this.k + 1);
      $('#ana-last').onclick = () => this.go(this.cur ? this.cur.moves.length : 0);
      $('#ana-est').onclick = () => this.estimate();
      $('#ana-full').onclick = () => this.analyzeAll();
      $('#ana-mist').onclick = e => { const b = e.target.closest('[data-k]'); if (b) this.go(+b.dataset.k); };
      $('#ana-graph').onclick = e => {
        const r = $('#ana-graph').getBoundingClientRect(), N = this.ana ? this.ana.w.length - 1 : 0;
        if (N > 0 && r.width > 0) this.go(Math.round(((e.clientX - r.left) / r.width * 320 - 4) / 312 * N));
      };
      $('#ana-sgf').onclick = () => this.exportSgf();
      $('#ana-copy').onclick = () => this.copySgf();
      $('#ana-del').onclick = () => this.remove();
      $('#ana-moves').onclick = e => { const b = e.target.closest('[data-i]'); if (b) this.go(+b.dataset.i + 1); };
      $('#ana-imp-file').onclick = () => $('#ana-file').click();
      $('#ana-file').onchange = e => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 200000) { toast('Tệp quá lớn, không phải tệp SGF một ván.', 'warn'); return; }
        const r = new FileReader(); r.onload = () => this.importSgf(String(r.result)); r.readAsText(f);
      };
      $('#ana-imp-text').onclick = () => { this.importSgf($('#ana-paste').value); };
      this.renderList();
    },
    sizeOf(g) { return +String(g.startFen || RULES.START_FEN).split(' ')[0]; },
    renderList() {
      this.cur = null; this.gen++; this.stopAna(); $('#ana-list-wrap').hidden = false; $('#ana-detail').hidden = true;
      const G = this.games;
      $('#ana-list').innerHTML = G.length ? G.map(g => {
        const n = this.sizeOf(g), who = g.imported ? 'nhập từ SGF' + (g.pb || g.pw ? ' · ' + esc((g.pb || '?') + ' – ' + (g.pw || '?')) : '') : g.pvp ? 'hai người chơi' : (g.net ? 'qua mạng · ' : '') + 'bạn cầm ' + SIDE[g.user];
        return '<button class="pz" data-id="' + esc(g.id) + '"><span class="pz-n">' + new Date(g.t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' + n + '×' + n + ' · ' + who + '</span><span class="pz-s">' + g.moves.length + ' nước · ' + (g.pvp || g.net || g.imported ? '' : 'cấp ' + g.level + ' · ') + esc(g.res || 'chưa kết thúc') + '</span></button>';
      }).join('') : '<p class="muted">Chưa có ván nào. Chơi một ván từ Trang chủ (mỗi bên từ 5 nước trở lên) hoặc nhập một tệp SGF ở dưới.</p>';
      $$('#ana-list .pz').forEach(b => b.onclick = () => this.open(b.dataset.id));
    },
    // Từ thẻ kết quả ván vừa chơi
    openCurrent() { const g = Play.saveGame(); if (!g) return; showTab('ana'); this.open(g.id); },
    open(id) {
      const g = this.games.find(x => x.id === id); if (!g) return;
      this.cur = g; $('#ana-list-wrap').hidden = true; $('#ana-detail').hidden = false;
      $('#ana-title').textContent = (g.res || 'Ván chưa kết thúc') + ' · bàn ' + this.sizeOf(g) + '×' + this.sizeOf(g);
      this.stopAna();
      // Các nước hợp lệ của ván (dừng ở nước sai luật đầu tiên nếu tệp bị hỏng)
      const p = GO.Pos.fromFen(g.startFen || RULES.START_FEN); this.mv = [];
      for (const u of g.moves) { const m = this.toMove(u); if (!p.isLegal(m)) break; this.mv.push(m); p.make(m); }
      this.setAna(this.validAna(g.ana) ? g.ana : null);
      $('#ana-full-text').textContent = this.ana ? '' : 'KataGo xem lần lượt từng thế của ván, vẽ biểu đồ khả năng thắng và đánh dấu nước dở (?) và nước hỏng (??). Bàn 19×19 trên điện thoại mất khoảng một phút.';
      this.go(g.moves.length); window.scrollTo(0, 0);
    },
    toMove(u) { return u === 'pass' ? GO.PASS : +u + 1; },
    // Dựng thế cờ sau k nước đầu; danh sách nước ghi đủ cả ván để bấm nhảy tới nước bất kỳ
    go(k) {
      const g = this.cur; if (!g) return;
      this.gen++; this.est = null;
      k = Math.max(0, Math.min(g.moves.length, k)); this.k = k;
      const p = GO.Pos.fromFen(g.startFen || RULES.START_FEN), all = [];
      let pos = k === 0 ? p.clone() : null, last = null;
      for (let i = 0; i < g.moves.length; i++) {
        const m = this.toMove(g.moves[i]);
        if (!p.isLegal(m)) break;
        all.push(p.notation(m)); p.make(m);
        if (i + 1 === k) { pos = p.clone(); last = m === GO.PASS ? null : [m - 1, m - 1]; }
      }
      if (!pos) pos = p.clone();
      this.pos = pos; this.last = last;
      $('#ana-moves').innerHTML = all.length ? moveListHtml(all, 0, k - 1, true, this.marks && this.marks.map(x => x.mk)) : '<span class="muted">Chưa có nước đi.</span>';
      const cur = $('#ana-moves .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
      $('#ana-info').textContent = 'Nước ' + k + '/' + g.moves.length + ' · ' + GAME.sides[pos.side] + ' đi · Đen đã ăn ' + pos.caps[0] + ', Trắng đã ăn ' + pos.caps[1];
      $('#ana-est-text').textContent = '';
      $('#ana-del').textContent = 'Xoá ván này'; this.delAsk = false;
      this.showNote(); this.drawGraph();
      this.draw();
    },
    draw() {
      const mk = this.marks && this.marks[this.k], b = mk && mk.mk && this.ana.b[this.k];
      const st = { pos: this.pos, last: this.last, sel: -1, hint: b && b !== GO.PASS ? [b - 1, b - 1] : null };
      if (this.est) { st.dead = this.est.dead; st.own = this.est.own; }
      this.board.render(st);
    },
    onSquare() { /* bàn xem lại: chỉ xem, không đặt quân */ },
    // Ước lượng điểm ở thế đang xem: KataGo (tải nếu chưa có) cho tỉ lệ thắng, điểm hơn kém, đất và quân chết;
    // không chạy được KataGo thì máy Monte-Carlo chơi thử nhiều ván ngẫu nhiên tới hết để đoán đất và quân chết.
    estimate() {
      if (!this.cur) return;
      const g = this.gen, n = this.pos.n, pos = this.pos, f = x => String(x).replace('.', ',');
      const job = { fen: this.cur.startFen || RULES.START_FEN, moves: this.cur.moves.slice(0, this.k).map(u => this.toMove(u)) };
      $('#ana-est-text').textContent = Kata.state === 'ready' ? 'KataGo đang ước lượng…' : 'Máy đang ước lượng…';
      const show = (r, kata) => {
        if (g !== this.gen || !r || r.error) return;
        const dead = new Set(r.dead), s = pos.score(dead);
        this.est = { dead, own: s.own };
        const head = kata ? 'KataGo: ' + (r.whiteLead > 0 ? 'Trắng' : 'Đen') + ' hơn khoảng ' + f(Math.abs(r.whiteLead).toFixed(1)) + ' điểm, khả năng thắng của Đen ' + Math.round((1 - r.whiteWin) * 100) + '%. ' : '';
        $('#ana-est-text').textContent = head + 'Đếm theo đất và quân chết đang vẽ (luật Trung Quốc, ' + f(pos.komi) + ' điểm bù): Đen ' + f(s.black) + ', Trắng ' + f(s.white) + ' → ' +
          (s.winner < 0 ? 'hòa' : GAME.sides[s.winner] + ' hơn ' + f(s.margin)) + '.' + (kata ? '' : ' Giữa ván, con số này chỉ để tham khảo.');
        this.draw();
      };
      const mc = () => Engine.call({ type: 'ownership', fen: pos.fen(), moves: [], n: n >= 19 ? 120 : 200 }).then(r => show(r, false));
      Kata.ensure().then(ok => ok ? Kata.call(Object.assign({ type: 'ownership' }, job)).then(r => r && r.dead ? show(r, true) : mc()) : mc());
    },
    // ---------- Phân tích cả ván ----------
    // Dữ liệu lưu cùng ván (g.ana): w[i], l[i] = khả năng thắng và số điểm hơn của Đen ở thế sau i nước (i = 0..số nước),
    // b[i] = nước KataGo chọn ở thế đó. Kiểm tra kỹ vì có thể đến từ tệp sao lưu.
    validAna(a) {
      const N = this.mv.length + 1, n = this.sizeOf(this.cur), A = n * n;
      const arr = (x, ok) => Array.isArray(x) && x.length === N && x.every(ok);
      return !!(a && a.v === 1 && a.net === KATA_MODEL && arr(a.w, x => typeof x === 'number' && x >= 0 && x <= 1) &&
        arr(a.l, x => typeof x === 'number' && isFinite(x) && Math.abs(x) <= 1000) && arr(a.b, x => x === GO.PASS || (Number.isInteger(x) && x >= 1 && x <= A)));
    },
    setAna(a) { this.ana = a; this.marks = a ? this.markMoves(a) : null; this.renderAna(); },
    // Đánh dấu từng nước i (đi ở thế i, bởi bên đang đi): nước khác nước KataGo chọn mà làm khả năng thắng của bên đi tụt
    // từ 10% (?) / 20% (??) trở lên; nếu trước nước đó ván đã ngã ngũ (trên 90% hoặc dưới 10%) thì xét số điểm mất (5 / 10 điểm).
    markMoves(a) {
      const s0 = String(this.cur.startFen || RULES.START_FEN).split(' ')[1] === 'w' ? 1 : 0, out = [];
      for (let i = 0; i + 1 < a.w.length; i++) {
        const s = (s0 + i) % 2, me = x => s === 0 ? x : 1 - x, pt = x => s === 0 ? x : -x;
        const wb = me(a.w[i]), wa = me(a.w[i + 1]), dw = wb - wa, dl = pt(a.l[i]) - pt(a.l[i + 1]), done = wb > 0.9 || wb < 0.1;
        let mk = '';
        if (this.mv[i] !== a.b[i]) {
          if (dw >= MIS.bad || (done && dl >= MIS.badPts)) mk = '??';
          else if (dw >= MIS.dub || (done && dl >= MIS.dubPts)) mk = '?';
        }
        out.push({ mk, s, wb, wa, dl });
      }
      return out;
    },
    stopAna() { this.anaGen++; this.anaBusy = false; this.part = null; $('#ana-full').disabled = false; },
    analyzeAll() {
      const g = this.cur; if (!g || this.anaBusy) return;
      const run = ++this.anaGen, fen = g.startFen || RULES.START_FEN, mv = this.mv.slice(), N = mv.length + 1, n = this.sizeOf(g);
      const CH = n >= 19 ? 6 : n >= 13 ? 12 : 24, a = { v: 1, net: KATA_MODEL, w: [], l: [], b: [] };
      const txt = s => { if (run === this.anaGen) $('#ana-full-text').textContent = s; };
      this.anaBusy = true; this.part = a; $('#ana-full').disabled = true;
      txt(Kata.state === 'ready' ? 'KataGo đang phân tích…' : 'Đang tải KataGo (khoảng 7 MB, chỉ lần đầu)…');
      const fail = s => { if (run !== this.anaGen) return; txt(s); this.anaBusy = false; this.part = null; $('#ana-full').disabled = false; this.drawGraph(); };
      const step = i => {
        if (run !== this.anaGen) return;
        if (i >= N) {
          g.ana = a; Store.set('games', this.games);
          this.anaBusy = false; this.part = null; $('#ana-full').disabled = false;
          this.setAna(a); this.go(this.k);
          return;
        }
        const c = Math.min(CH, N - i);
        Kata.call({ type: 'analyze', fen, moves: mv.slice(0, i), next: mv.slice(i, i + c - 1) }).then(r => {
          if (run !== this.anaGen) return;
          if (!r || !Array.isArray(r.list) || r.list.length !== c) { fail('Phân tích bị lỗi' + (r && r.error ? ': ' + r.error : '') + '. Thử lại sau.'); return; }
          r.list.forEach(x => { a.w.push(Math.round(x.w * 1000) / 1000); a.l.push(Math.round(x.l * 10) / 10); a.b.push(x.b); });
          txt('KataGo đang phân tích: ' + a.w.length + '/' + N + ' thế…');
          this.drawGraph();
          step(i + c);
        });
      };
      Kata.ensure().then(ok => ok ? step(0) : fail('Không chạy được KataGo trên máy này nên chưa phân tích được cả ván.'));
    },
    // Tóm tắt và danh sách nước bị đánh dấu (bấm để tới thế ngay trước nước đó, bàn vẽ vòng tròn ở nước KataGo đề nghị)
    renderAna() {
      const M = this.marks, box = $('#ana-mist');
      $('#ana-full').textContent = this.ana ? 'Phân tích lại cả ván' : 'Phân tích cả ván (KataGo)';
      if (!M) { box.innerHTML = ''; this.drawGraph(); return; }
      const cnt = (s, mk) => M.filter(x => x.s === s && x.mk === mk).length, pc = x => Math.round(x * 100) + '%';
      $('#ana-full-text').textContent = 'Đen: ' + cnt(0, '??') + ' nước hỏng (??), ' + cnt(0, '?') + ' nước dở (?) · Trắng: ' + cnt(1, '??') + ' nước hỏng, ' + cnt(1, '?') +
        ' nước dở. Đánh giá nhanh bằng mạng KataGo (mỗi thế một lần), để tham khảo. Bấm vào biểu đồ hoặc một nước dưới đây để xem.';
      const P = GO.Pos.fromFen(this.cur.startFen || RULES.START_FEN);
      box.innerHTML = M.map((x, i) => x.mk ? '<button class="pz" data-k="' + i + '"><span class="pz-n">' + (i + 1) + '. ' + GAME.sides[x.s] + ' ' + esc(P.notation(this.mv[i])) + ' ' + x.mk +
        '</span><span class="pz-s">khả năng thắng ' + pc(x.wb) + ' → ' + pc(x.wa) + (x.dl >= 1 ? ', mất khoảng ' + Math.round(x.dl) + ' điểm' : '') + ' · KataGo: ' + esc(P.notation(this.ana.b[i])) + '</span></button>' : '').join('');
      this.drawGraph();
    },
    // Dòng dưới bàn: khả năng thắng ở thế đang xem; nếu nước tiếp theo bị đánh dấu thì nói nước KataGo đề nghị
    showNote() {
      const el = $('#ana-note'), a = this.ana;
      if (!a || this.k >= a.w.length) { el.hidden = true; return; }
      const w = a.w[this.k], l = a.l[this.k], f = x => String(x).replace('.', ',');
      let s = 'KataGo: khả năng thắng của Đen ' + Math.round(w * 100) + '%, ' + (Math.abs(l) < 0.5 ? 'hai bên gần bằng điểm' : (l > 0 ? 'Đen' : 'Trắng') + ' hơn khoảng ' + f(Math.abs(l).toFixed(1)) + ' điểm') + '.';
      const x = this.marks[this.k];
      if (x && x.mk) {
        const P = GO.Pos.fromFen(this.cur.startFen || RULES.START_FEN), b = a.b[this.k];
        s += ' Nước tiếp theo ' + (this.k + 1) + '. ' + GAME.sides[x.s] + ' ' + P.notation(this.mv[this.k]) + ' ' + (x.mk === '??' ? 'là nước hỏng' : 'là nước dở') +
          ' (khả năng thắng ' + Math.round(x.wb * 100) + '% → ' + Math.round(x.wa * 100) + '%). KataGo đề nghị ' + (b === GO.PASS ? 'bỏ lượt' : P.notation(b) + ' (vòng tròn trên bàn)') + '.';
      }
      el.textContent = s; el.hidden = false;
    },
    // Biểu đồ khả năng thắng của Đen (trên cao là Đen hơn); a: dữ liệu đang phân tích dở (vẽ dần), không có thì dùng this.ana
    drawGraph() {
      const a = this.part || this.ana;
      const el = $('#ana-graph');
      if (!a || a.w.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
      const N = Math.max(this.mv.length, 1), W = 320, H = 96, X = i => (4 + i / N * (W - 8)).toFixed(1), Y = w => ((1 - w) * (H - 8) + 4).toFixed(1);
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Biểu đồ khả năng thắng của Đen theo từng nước">' +
        '<rect class="g-bg" x="0" y="0" width="' + W + '" height="' + H + '"/><line class="g-mid" x1="0" y1="' + Y(0.5) + '" x2="' + W + '" y2="' + Y(0.5) + '"/>';
      s += '<polyline class="g-line" points="' + a.w.map((w, i) => X(i) + ',' + Y(w)).join(' ') + '"/>';
      if (a === this.ana && this.marks) this.marks.forEach((x, i) => { if (x.mk) s += '<circle class="' + (x.mk === '??' ? 'g-bad' : 'g-dub') + '" cx="' + X(i + 1) + '" cy="' + Y(a.w[i + 1]) + '" r="3"/>'; });
      s += '<line class="g-cur" x1="' + X(this.k) + '" y1="0" x2="' + X(this.k) + '" y2="' + H + '"/></svg>';
      el.innerHTML = s; el.hidden = false;
    },
    // Kết quả ván (chữ trong app) -> thẻ RE của SGF: B+4.5, W+R (chịu thua), B+T (hết giờ), 0 (hòa)
    reOf(res) {
      let m;
      const c = x => x === 'Đen' ? 'B' : 'W', o = x => x === 'Đen' ? 'W' : 'B';
      if (!res) return '';
      if (/^Hòa/.test(res)) return '0';
      if ((m = /^(Đen|Trắng) thắng ([\d,]+) điểm/.exec(res))) return c(m[1]) + '+' + m[2].replace(',', '.');
      if ((m = /(Đen|Trắng) chịu thua/.exec(res))) return o(m[1]) + '+R';
      if ((m = /(Đen|Trắng) hết giờ/.exec(res))) return o(m[1]) + '+T';
      if ((m = /^(Đen|Trắng) thắng/.exec(res))) return c(m[1]) + '+';
      return '';
    },
    sgfText() {
      const g = this.cur, meta = { RE: this.reOf(g.res), DT: new Date(g.t).toISOString().slice(0, 10) };
      if (g.pb) meta.PB = g.pb;
      if (g.pw) meta.PW = g.pw;
      return GO.toSgf(g.startFen || RULES.START_FEN, g.moves.map(u => this.toMove(u)), meta);
    },
    exportSgf() {
      if (!this.cur) return;
      const txt = this.sgfText(), name = 'co-vay-' + new Date(this.cur.t).toISOString().slice(0, 10) + '.sgf';
      const blob = new Blob([txt], { type: 'application/x-go-sgf' });
      const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/x-go-sgf' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => { /* người dùng huỷ */ }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Đã tạo tệp ' + name, 'ok');
    },
    copySgf() {
      if (!this.cur) return;
      const s = this.sgfText(), ok = () => toast('Đã chép SGF của ván.', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, () => toast('Không chép được, hãy dùng nút Tải tệp SGF.', 'warn'));
      else toast('Trình duyệt không cho chép, hãy dùng nút Tải tệp SGF.', 'warn');
    },
    // Nhập ván từ SGF (nhánh chính). Tên người chơi, kết quả được làm sạch trước khi lưu (giống kiểm tra tệp sao lưu).
    importSgf(text) {
      let r;
      try { r = GO.fromSgf(text); } catch (e) { toast('Không đọc được SGF: ' + e.message, 'warn'); return; }
      if (r.moves.length > 1000) { toast('Ván quá dài.', 'warn'); return; }
      const clean = v => String(v || '').replace(/[<>"'`&\u0000-\u001f\\]/g, '').trim().slice(0, 40);
      const prop = k => { const m = new RegExp('(?:^|[^A-Z])' + k + '\\[([^\\]]*)\\]').exec(text); return m ? clean(m[1]) : ''; };
      const re = prop('RE'), res = /^B\+/i.test(re) ? 'Đen thắng ' + (re.slice(2) === 'R' ? '(đối thủ chịu thua)' : re.slice(2).replace('.', ',') + ' điểm') : /^W\+/i.test(re) ? 'Trắng thắng ' + (re.slice(2) === 'R' ? '(đối thủ chịu thua)' : re.slice(2).replace('.', ',') + ' điểm') : re === '0' ? 'Hòa' : '';
      const g = { id: 'g' + Date.now(), t: Date.now(), user: 0, level: 0, imported: true, startFen: r.startFen, moves: r.moves.map(m => GO.mvStr(m)), res: clean(res), pb: prop('PB'), pw: prop('PW') };
      this.games.unshift(g); this.games = this.games.slice(0, 20); Store.set('games', this.games);
      $('#ana-paste').value = '';
      toast('Đã nhập ván ' + r.moves.length + ' nước.', 'ok');
      this.open(g.id);
    },
    // Xoá cần bấm hai lần (không lấy lại được)
    remove() {
      if (!this.cur) return;
      if (!this.delAsk) { this.delAsk = true; $('#ana-del').textContent = 'Bấm lần nữa để xoá hẳn'; return; }
      const id = this.cur.id;
      this.games = this.games.filter(g => g.id !== id); Store.set('games', this.games);
      toast('Đã xoá ván khỏi máy này.'); this.renderList();
    }
  };
