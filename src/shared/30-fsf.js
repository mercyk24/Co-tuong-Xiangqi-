  // 30-fsf.js (dùng chung) — Engine mạnh: Fairy-Stockfish (WebAssembly). Dùng cho cấp 6 và phân tích ván.
  // Cờ tướng: biến thể xiangqi + mạng NNUE; cờ vua: biến thể chess, đánh giá cổ điển (không cần tải mạng NNUE).
  // Cấu hình riêng (tên biến thể, mạng NNUE, cách đổi FEN và nước đi) nằm trong GAME.fsf.
  const FSF = {
    sf: null, p: null, lines: [], failed: false, chain: Promise.resolve(),
    run(fn) { const p = this.chain.then(() => fn()); this.chain = p.catch(() => {}); return p; },
    DIR: GAME.fsf.dir, NNUE: GAME.fsf.nnue,
    supported() { return !!(window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined' && !this.failed); },
    fen6(f) { return GAME.fsf.fen(f); },
    toFsf(u) { return GAME.fsf.toE(u); },
    fromFsf(u) { return GAME.fsf.fromE(u); },
    wait(re, ms) {
      return new Promise((res, rej) => {
        const t0 = Date.now();
        const i = setInterval(() => {
          const f = this.lines.find(l => re.test(l));
          if (f) { clearInterval(i); res(f); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('quá thời gian chờ engine')); }
        }, 25);
      });
    },
    init() {
      if (this.p) return this.p;
      this.p = (async () => {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = this.DIR + 'stockfish-512.js'; s.onload = res; s.onerror = () => rej(new Error('không tải được engine')); document.head.appendChild(s); });
        const sf = await window.Stockfish();
        sf.addMessageListener(l => { this.lines.push(l); if (this.lines.length > 400) this.lines.splice(0, 200); });
        this.sf = sf;
        sf.postMessage('uci'); await this.wait(/^uciok/, 15000);
        sf.postMessage('setoption name UCI_Variant value ' + GAME.fsf.variant);
        if (this.NNUE) {
          const r = await fetch(this.DIR + this.NNUE); if (!r.ok) throw new Error('không tải được mạng NNUE');
          sf.FS.writeFile('/' + this.NNUE, new Uint8Array(await r.arrayBuffer()));
          sf.postMessage('setoption name EvalFile value /' + this.NNUE);
          sf.postMessage('setoption name Use NNUE value true');
        } else sf.postMessage('setoption name Use NNUE value false');
        sf.postMessage('setoption name Hash value 16');
        this.lines.length = 0; sf.postMessage('isready'); await this.wait(/^readyok/, 20000);
      })().catch(e => { this.failed = true; this.p = null; throw e; });
      return this.p;
    },
    best(startFen, uciMoves, ms) {
      return this.run(async () => {
        await this.init();
        const sf = this.sf; this.lines.length = 0;
        sf.postMessage('setoption name MultiPV value 1');
        sf.postMessage('position fen ' + this.fen6(startFen) + (uciMoves.length ? ' moves ' + uciMoves.map(u => this.toFsf(u)).join(' ') : ''));
        sf.postMessage('go movetime ' + ms);
        const l = await this.wait(/^bestmove/, ms + 15000);
        return this.fromFsf(l.split(/\s+/)[1] || '');
      });
    },
    parseLines() {
      const by = {};
      for (const l of this.lines) {
        if (!/^info /.test(l) || / (lowerbound|upperbound)/.test(l)) continue;
        const m = / depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/.exec(l); if (!m) continue;
        const n = +m[4];
        by[m[2]] = { d: +m[1], v: m[3] === 'cp' ? n : (n > 0 ? 10000 - n : -10000 - n), pv: m[5].trim().split(/\s+/).map(u => this.fromFsf(u)) };
      }
      const seen = {};
      return Object.keys(by).sort((x, y) => x - y).map(k => ({ v: by[k].v, d: by[k].d, m: by[k].pv[0], pv: by[k].pv })).filter(o => o.m && !seen[o.m] && (seen[o.m] = 1));
    },
    stop() { if (this.sf) this.sf.postMessage('stop'); },
    // Phân tích một thế: trả về tối đa mpv nước tốt nhất [{v: điểm theo bên đi (mate quy ra ±10000), m: nước, pv: [...], d: độ sâu}]
    // onUpdate (tuỳ chọn) được gọi định kỳ khi đang tìm, để hiện kết quả dần.
    analyse(startFen, uciMoves, ms, mpv, onUpdate) {
      return this.run(async () => {
        await this.init();
        const sf = this.sf; this.lines.length = 0;
        sf.postMessage('setoption name MultiPV value ' + mpv);
        sf.postMessage('position fen ' + this.fen6(startFen) + (uciMoves.length ? ' moves ' + uciMoves.map(u => this.toFsf(u)).join(' ') : ''));
        sf.postMessage('go movetime ' + ms);
        const tick = onUpdate ? setInterval(() => onUpdate(this.parseLines(), false), 500) : 0;
        let bl; try { bl = await this.wait(/^bestmove/, ms + 15000); } finally { if (tick) clearInterval(tick); }
        const out = this.parseLines();
        if (!out.length) { const u = this.fromFsf(bl.split(/\s+/)[1] || ''); if (u) out.push({ v: 0, d: 0, m: u, pv: [u] }); }
        if (onUpdate) onUpdate(out, true);
        sf.postMessage('setoption name MultiPV value 1');
        return out;
      });
    }
  };

