  // [CỜ VÂY] Chỉ app cờ vây dùng. Cùng tên hàm với src/chess/app/41-play-ai.js (phần dùng chung 40-play.js gọi vào) nhưng
  // nội dung riêng: máy Monte-Carlo, chọn cỡ bàn và kiểu chơi, máy biết bỏ lượt. Sơ đồ: docs/CAU-TRUC.md
  // 41-play-ai.js — CỜ VÂY, đấu với máy: màn chuẩn bị, gọi máy, gợi ý. Các hàm được gắn thêm vào Play (định nghĩa trong 40-play.js).
  Object.assign(Play, {
    initAi() {
      $$('#ai-side .chip').forEach(b => b.onclick = () => { this.aiSide = b.dataset.v; Store.set('ai_side', this.aiSide); this.drawAiSetup(); });
      $('#ai-levels').innerHTML = Object.keys(LEVELS).map(k => {
        const nm = LEVELS[k].name.split(' – ')[1], i = nm.indexOf(' (');
        return '<button class="lvl" data-v="' + k + '"><b>' + k + ' · ' + (i > 0 ? nm.slice(0, i) : nm) + '</b>' + (i > 0 ? '<small>' + nm.slice(i + 2, -1) + '</small>' : '') + '</button>';
      }).join('');
      if (!LEVELS[this.level]) this.level = 2;
      $$('#ai-levels .lvl').forEach(b => b.onclick = () => { this.level = +b.dataset.v; Store.set('play_level', this.level); $('#play-level').value = String(this.level); this.drawAiSetup(); });
      $('#ai-start').onclick = () => this.startAi();
      const lv = $('#play-level');
      lv.innerHTML = Object.keys(LEVELS).map(k => '<option value="' + k + '">' + LEVELS[k].name + '</option>').join('');
      lv.value = String(this.level);
      lv.onchange = () => { this.level = +lv.value; Store.set('play_level', this.level); this.drawBars(); };
    },
    showAiSetup() { this.screen = 'setup'; this.ask = null; this.closeMenu(); this.draw(); },
    startAi() {
      const v = this.aiSide;
      this.user = v === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +v; Store.set('play_user', this.user);
      this.started = true; this.screen = 'game';
      this.newGame();
      if (v === 'r') toast('Bạn cầm quân ' + SIDE[this.user] + (this.user === 0 ? ', đi trước.' : '.'));
    },
    drawAiSetup() {
      $$('#ai-side .chip').forEach(b => b.classList.toggle('on', b.dataset.v === this.aiSide));
      $$('#ai-levels .lvl').forEach(b => b.classList.toggle('on', +b.dataset.v === this.level));
    },
    engineMove() {
      if (this.over || this.scoring) return;
      const g = this.gen; this.thinking = true; this.draw();
      const lv = LEVELS[this.level] || LEVELS[2];
      Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: lv.opts }).then(r => {
        if (g !== this.gen) return;
        this.thinking = false;
        if (!r.move) { this.draw(); return; }
        if (r.move === GO.PASS) toast(this.ctx.pos.passes ? 'Máy cũng bỏ lượt: đếm điểm.' : 'Máy bỏ lượt. Nếu bạn cũng bỏ lượt thì ván kết thúc và đếm điểm.');
        this.doMove(r.move, false);
      });
    },
    analyze() { /* cờ vây không có "báo nước yếu" */ },
    showHint() {
      if (this.thinking || this.over || this.scoring || this.pvp() || this.ctx.pos.side !== this.user) return;
      const g = this.gen; this.thinking = true; this.draw();
      Engine.call({ type: 'search', fen: this.startFen, moves: this.moves.slice(), opts: { playouts: 4000, timeMs: 3000 } }).then(r => {
        if (g !== this.gen) return;
        this.thinking = false;
        if (r.move === GO.PASS) toast('Gợi ý: bỏ lượt (không còn nước nào đáng đi).');
        else if (r.move) { const p = r.move - 1; this.hint = [p, p]; toast('Gợi ý: ' + this.ctx.pos.notation(r.move)); }
        this.draw();
      });
    },
  });
