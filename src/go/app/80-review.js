  // [CỜ VÂY] Chỉ app cờ vây dùng. Thay cho src/shared/app/80-analysis.js (cờ vây không có engine Fairy-Stockfish nên build bỏ
  // tệp đó). Giữ cùng tên đối tượng Ana và các hàm phần dùng chung gọi tới: games, cur, init, openCurrent, renderList. Sơ đồ: docs/CAU-TRUC.md
  // 80-review.js — CỜ VÂY, tab "Ván đã lưu": xem lại từng nước, ước lượng điểm ở thế đang xem (máy đoán đất và quân chết),
  // xuất ván ra SGF (định dạng chung của mọi phần mềm cờ vây), nhập ván từ tệp / đoạn chữ SGF.
  const Ana = {
    games: Store.get('games', []), cur: null, k: 0, pos: null, est: null, gen: 0, delAsk: false,
    init() {
      this.board = new Board($('#ana-board'), p => this.onSquare(p));
      $('#ana-back').onclick = () => this.renderList();
      $('#ana-toplay').onclick = () => showTab('play');
      $('#ana-first').onclick = () => this.go(0);
      $('#ana-prev').onclick = () => this.go(this.k - 1);
      $('#ana-next').onclick = () => this.go(this.k + 1);
      $('#ana-last').onclick = () => this.go(this.cur ? this.cur.moves.length : 0);
      $('#ana-est').onclick = () => this.estimate();
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
      this.cur = null; this.gen++; $('#ana-list-wrap').hidden = false; $('#ana-detail').hidden = true;
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
      $('#ana-moves').innerHTML = all.length ? moveListHtml(all, 0, k - 1, true) : '<span class="muted">Chưa có nước đi.</span>';
      const cur = $('#ana-moves .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
      $('#ana-info').textContent = 'Nước ' + k + '/' + g.moves.length + ' · ' + GAME.sides[pos.side] + ' đi · Đen đã ăn ' + pos.caps[0] + ', Trắng đã ăn ' + pos.caps[1];
      $('#ana-est-text').textContent = '';
      $('#ana-del').textContent = 'Xoá ván này'; this.delAsk = false;
      this.draw();
    },
    draw() {
      const st = { pos: this.pos, last: this.last, sel: -1, hint: null };
      if (this.est) { st.dead = this.est.dead; st.own = this.est.own; }
      this.board.render(st);
    },
    onSquare() { /* bàn xem lại: chỉ xem, không đặt quân */ },
    // Ước lượng điểm ở thế đang xem: máy chơi thử nhiều ván ngẫu nhiên tới hết để đoán đất và quân chết
    estimate() {
      if (!this.cur) return;
      const g = this.gen, n = this.pos.n;
      $('#ana-est-text').textContent = 'Máy đang ước lượng…';
      Engine.call({ type: 'ownership', fen: this.pos.fen(), moves: [], n: n >= 19 ? 120 : 200 }).then(r => {
        if (g !== this.gen || r.error) return;
        const dead = new Set(r.dead), s = this.pos.score(dead), f = x => String(x).replace('.', ',');
        this.est = { dead, own: s.own };
        $('#ana-est-text').textContent = 'Ước lượng (luật Trung Quốc, ' + f(this.pos.komi) + ' điểm bù): Đen ' + f(s.black) + ', Trắng ' + f(s.white) + ' → ' +
          (s.winner < 0 ? 'hòa' : GAME.sides[s.winner] + ' hơn ' + f(s.margin)) + '. Giữa ván, con số này chỉ để tham khảo.';
        this.draw();
      });
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
