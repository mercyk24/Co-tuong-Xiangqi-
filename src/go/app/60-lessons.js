  // [CỜ VÂY] Chỉ app cờ vây dùng. Sơ đồ: docs/CAU-TRUC.md
  // 60-lessons.js — CỜ VÂY, tab "Bài học": học luật qua từng bước có bàn cờ (khí, ăn quân, chạy thoát, tự sát, kiếp, hai mắt,
  // thang, lưới, đếm điểm). Nội dung ở data/go/lessons.json (LESSONS), mỗi bước được tests/unit/go/content.test.js kiểm tra.
  // Kiểu bước (goal): look (đọc rồi bấm Tiếp) · at (đặt đúng một trong các điểm ok) · capture (ăn được quân) ·
  // save (cứu nhóm chứa điểm t) · kill (bắt nhóm chứa điểm t trong n nước, máy chạy cho bên kia).
  const Les = {
    list: LESSONS, cur: null, k: 0, pos: null, done: false, busy: false, gen: 0, last: null, left: 0,
    fin: new Set(Store.get('les_done', [])),
    init() {
      this.board = new Board($('#les-board'), p => this.onSquare(p));
      $('#les-back').onclick = () => { this.gen++; this.cur = null; this.renderList(); };
      $('#les-reset').onclick = () => this.step(this.k);
      $('#les-next').onclick = () => this.nextStep();
      this.renderList();
    },
    renderList() {
      this.cur = null;
      $('#les-list-wrap').hidden = false; $('#les-play').hidden = true;
      $('#les-list').innerHTML = this.list.map(l => '<button class="pz' + (this.fin.has(l.id) ? ' done' : '') + '" data-id="' + l.id + '"><span class="pz-n">Bài ' + l.id + '</span><span class="pz-s">' + esc(l.title) + '</span></button>').join('');
      $$('#les-list .pz').forEach(b => b.onclick = () => this.open(+b.dataset.id));
    },
    open(id) {
      const l = this.list.find(x => x.id === id); if (!l) return;
      this.cur = l; $('#les-list-wrap').hidden = true; $('#les-play').hidden = false;
      this.step(0); window.scrollTo(0, 0);
    },
    get s() { return this.cur.steps[this.k]; },
    step(k) {
      this.gen++; this.k = k; this.pos = GO.Pos.fromFen(this.s.fen); this.done = this.s.goal === 'look'; this.busy = false; this.last = null; this.left = this.s.n || 0;
      $('#les-title').textContent = 'Bài ' + this.cur.id + ' · ' + this.cur.title + ' (' + (k + 1) + '/' + this.cur.steps.length + ')';
      $('#les-text').textContent = this.s.text;
      this.status(this.done ? '' : 'Đến lượt ' + GAME.sides[this.pos.side] + '.');
      this.draw();
    },
    draw() {
      const s = this.s, pos = this.pos, marks = {}, st = { pos, last: this.last, sel: -1, hint: null };
      if (s.marks) { for (const n of Object.keys(s.marks)) marks[pos.pointOf(n)] = s.marks[n]; st.marks = marks; }
      if (s.t && pos.at(pos.pointOf(s.t)) >= 0) st.target = new Set(pos.group(pos.idx(pos.pointOf(s.t))).stones.map(i => pos.pt(i)));
      if (s.score) {
        const dead = new Set((s.dead || []).map(n => pos.pointOf(n))), sc = pos.score(dead), f = x => String(x).replace('.', ',');
        st.dead = dead; st.own = sc.own;
        this.status('Đen ' + f(sc.black) + ' điểm · Trắng ' + f(sc.white) + ' điểm (kể cả ' + f(pos.komi) + ' điểm bù).');
      }
      this.board.render(st);
      $('#les-next').textContent = this.k + 1 < this.cur.steps.length ? 'Tiếp ›' : 'Xong bài ✓';
      $('#les-next').disabled = !this.done;
      $('#les-reset').hidden = this.s.goal === 'look';
    },
    status(t, kind) { const el = $('#les-status'); el.textContent = t; el.className = 'status' + (kind ? ' ' + kind : ''); el.hidden = !t; },
    onSquare(p) {
      if (!this.cur || this.done || this.busy) return;
      const s = this.s, pos = this.pos, m = p + 1;
      if (!pos.isLegal(m)) { const why = illegalWhy(pos, p); if (why) this.status(why, 'bad'); return; }
      const t = s.t ? pos.pointOf(s.t) : -1;
      let ok = false;
      if (s.goal === 'at') ok = s.ok.some(n => pos.pointOf(n) === p);
      else if (s.goal === 'capture') { const c = pos.caps[pos.side]; pos.make(m); ok = pos.caps[pos.side ^ 1] > c; pos.unmake(); }
      else if (s.goal === 'save') { pos.make(m); ok = pos.at(t) >= 0 && pos.libsOf(pos.idx(t)).length >= 2 && GO.captureLength(pos, t, 3) === 0; pos.unmake(); }
      else if (s.goal === 'kill') ok = (GO.captureMoves(pos, t, this.left, 300000) || []).includes(m);
      if (!ok) {
        const msg = { at: 'Chưa đúng chỗ, thử lại.', capture: 'Nước này chưa ăn được quân. Hãy đếm khí của quân Trắng.', save: 'Chạy như vậy vẫn bị bắt. Thử hướng khác.', kill: 'Đối phương vẫn thoát được nếu bạn đi ' + pos.notation(m) + '. Thử chỗ khác.' }[s.goal];
        this.status(msg, 'bad'); return;
      }
      pos.make(m); this.last = [p, p];
      if (s.goal === 'kill') {
        this.left--;
        if (pos.at(t) >= 0) {
          this.status('Đúng hướng! Đối phương đang chạy…', 'ok'); this.draw();
          this.busy = true; const g = this.gen;
          setTimeout(() => {
            if (g !== this.gen) return;
            const d = GO.bestDefense(pos, t, this.left);
            pos.make(d); this.busy = false; if (d !== GO.PASS) this.last = [d - 1, d - 1];
            this.status('Tiếp tục bắt nhóm quân có dấu chấm.'); this.draw();
          }, 450);
          return;
        }
      }
      this.done = true;
      this.status(s.done || 'Đúng rồi!', 'ok');
      this.draw();
    },
    nextStep() {
      if (!this.done) return;
      if (this.k + 1 < this.cur.steps.length) { this.step(this.k + 1); return; }
      this.fin.add(this.cur.id); Store.set('les_done', Array.from(this.fin));
      const nx = this.list.find(l => l.id > this.cur.id);
      toast('Xong bài ' + this.cur.id + '!', 'ok');
      if (nx) this.open(nx.id); else this.renderList();
    }
  };
