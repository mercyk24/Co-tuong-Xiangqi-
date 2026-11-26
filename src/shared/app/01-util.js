  // [DÙNG CHUNG] Mọi loại cờ (cờ tướng, cờ vua, cờ vây) chạy tệp này. Chỉ dùng RULES và GAME (00-game.js của từng app), không gọi thẳng XQ/CH. Sơ đồ: docs/CAU-TRUC.md
  // 01-util.js (dùng chung cho mọi loại cờ) — Tiện ích: truy vấn DOM, lưu trữ (localStorage, tiền tố theo GAME.store), nhật ký lỗi trên máy, thông báo nhỏ.
  // chuyển ký hiệu nước đi sang tiếng Việt, danh sách nước, thông báo nổi.
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Lưu trữ ----------
  const Store = {
    get(k, d) { try { const v = localStorage.getItem(GAME.store + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(GAME.store + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }
  };

  // ---------- Nhật ký lỗi trên máy ----------
  // Ghi tối đa 30 lỗi gần nhất vào bộ nhớ của trình duyệt, chỉ để người dùng tự xem và chép gửi khi báo lỗi
  // (Giới thiệu › Báo lỗi). App không tự gửi nhật ký này đi đâu.
  const ErrLog = {
    KEY: GAME.store + 'errlog', MAX: 30,
    list() { try { const l = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } },
    add(kind, msg, where) {
      try {
        const l = this.list(), m = String(msg || '?').slice(0, 300), w = String(where || '').slice(0, 160), last = l[l.length - 1];
        if (last && last.m === m && last.w === w) { last.n = (last.n || 1) + 1; last.t = Date.now(); }  // lỗi lặp lại: chỉ đếm
        else l.push({ t: Date.now(), k: kind, m, w, v: APP_VERSION });
        localStorage.setItem(this.KEY, JSON.stringify(l.slice(-this.MAX)));
      } catch (e) { /* bỏ qua */ }
    },
    clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* bỏ qua */ } }
  };
  window.addEventListener('error', e => ErrLog.add('lỗi', e.message, (e.filename ? e.filename.split('/').pop() : '') + ':' + e.lineno + ':' + e.colno));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; ErrLog.add('promise', r && (r.stack || r.message) || r, ''); });

  function toast(msg, kind) {
    const t = $('#toast'); t.textContent = GAME.fmt ? GAME.fmt(msg) : msg; t.className = 'show ' + (kind || '');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 2600);
  }
  // Danh sách bài dài (cờ vua có hàng nghìn bài): mỗi lần chỉ vẽ một phần (step thẻ), nút "Xem thêm" vẽ tiếp. Lần đầu vẽ đủ
  // để thấy bài đầu tiên chưa giải. Bấm thẻ (phần tử có data-id) gọi onPick(id). Dùng một trình nghe chung cho cả lưới.
  function pagedGrid(el, items, itemHtml, onPick, isDone, step) {
    step = step || 60;
    let shown = 0;
    const firstTodo = isDone ? items.findIndex(x => !isDone(x)) : 0;
    const more = n => {
      const part = items.slice(shown, shown + n); shown += part.length;
      const old = el.querySelector('.more'); if (old) old.remove();
      el.insertAdjacentHTML('beforeend', part.map(itemHtml).join('') +
        (shown < items.length ? '<button class="btn more" type="button">Xem thêm (còn ' + (items.length - shown) + ' bài)</button>' : ''));
    };
    el.onclick = e => {
      if (e.target.closest('.more')) { more(step); return; }
      const b = e.target.closest('[data-id]'); if (b && el.contains(b)) onPick(b.dataset.id);
    };
    el.innerHTML = '';
    more(Math.max(step, Math.ceil((Math.max(0, firstTodo) + 1) / step) * step));
  }
