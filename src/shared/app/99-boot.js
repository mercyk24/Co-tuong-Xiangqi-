  // [DÙNG CHUNG] Mọi loại cờ chạy tệp này. Phần riêng (các tab luyện tập của từng loại cờ): HOOKS.boot (src/<loại cờ>/app/03-hooks.js). Sơ đồ: docs/CAU-TRUC.md
  // 99-boot.js — Điều hướng giữa các tab và khởi động app (đăng ký service worker, bật engine mạnh).
  // ---------- Điều hướng ----------
  function showTab(name) {
    $$('.view').forEach(v => v.hidden = v.id !== 'v-' + name);
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    if (name !== 'ana') Store.set('tab', name);
    HOOKS.boot.onTab(name);   // tab riêng của từng loại cờ: vẽ lại danh sách khi mở tab
    if (name === 'about') { Backup.render(); Privacy.render(); Report.render(); }
    Nav.peek = false; Nav.update();
    window.scrollTo(0, 0);
  }

  // Thanh điều hướng dưới cùng tự thu thành một nút tròn nhỏ khi đang đánh, giải bài hay tập khai cuộc, để khỏi bấm nhầm.
  // Bấm nút tròn ở góc dưới để mở lại; bấm ra ngoài thanh thì thu lại.
  const Nav = {
    peek: false,
    cur() { const v = $$('.view').find(x => !x.hidden); return v ? v.id.slice(2) : ''; },
    busy() {
      const tab = this.cur();
      if (tab === 'play') return Play.active();
      return HOOKS.boot.busy(tab);   // đang giải bài, tập khai cuộc… ở các tab riêng của từng loại cờ
    },
    update() {
      const b = document.body, busy = this.busy();
      if (!busy) this.peek = false;
      b.classList.toggle('nav-min', busy && !this.peek);
      b.classList.toggle('game-play', this.cur() === 'play' && Play.screen === 'game');
    },
    init() {
      // Bấm nút tròn: thanh điều hướng hiện ra và giữ nguyên; bấm bất kỳ chỗ nào ngoài thanh thì thu lại thành nút.
      $('#nav-handle').onclick = () => { this.peek = true; this.update(); };
      document.addEventListener('pointerdown', e => {
        if (this.peek && !e.target.closest('nav.tabs')) { this.peek = false; this.update(); }
      }, true);
      setInterval(() => this.update(), 300);
      this.update();
    }
  };

  function boot() {
    try { localStorage.setItem('cl_last', GAME.id); } catch (e) { /* bỏ qua */ }   // để trang chủ đánh dấu loại cờ chơi gần nhất
    Engine.init();
    Play.init();
    HOOKS.boot.init();       // các tab riêng của từng loại cờ (bài tập, khai cuộc, phân tích / xem lại ván…)
    HOOKS.boot.settings();   // tuỳ chọn riêng của từng loại cờ trong Cài đặt
    Backup.init();
    Privacy.init();
    Report.init();
    Nav.init();
    // Bấm "Trang chủ" luôn về màn chọn cách chơi (ván đang dở được giữ, có nút Tiếp tục)
    $$('.tab').forEach(t => t.onclick = () => { showTab(t.dataset.tab); if (t.dataset.tab === 'play') Play.goHome(); });
    showTab(Store.get('tab', 'play'));
    // Link mời chơi qua mạng: ...#phong=ABC123
    // Lần đầu mở trang, app có thể tự tải lại một lần (để bật engine mạnh): khi đó chờ tải lại xong rồi mới vào phòng,
    // nếu không mã phòng sẽ mất giữa chừng.
    const hm = /[#&]phong=([A-Za-z0-9]{6})/.exec(location.hash);
    if (hm) {
      let tried = true; try { tried = sessionStorage.getItem(GAME.store + 'coi') === '1'; } catch (e) { /* bỏ qua */ }
      const willReload = !window.crossOriginIsolated && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !tried;
      const go = () => {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* bỏ qua */ }
        showTab('play'); Play.setMode('net'); $('#net-code').value = hm[1].toUpperCase(); Net.join(hm[1]);
      };
      if (willReload) setTimeout(go, 5000); else go();  // nếu sau 5 giây trang vẫn chưa tải lại thì vào phòng luôn
    }
    // Xin trình duyệt giữ dữ liệu lâu dài (không tự xoá khi máy thiếu dung lượng), nếu trình duyệt hỗ trợ.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { /* bỏ qua */ }); } catch (e) { /* bỏ qua */ }
    // iPhone thường ngắt kết nối khi app chạy nền: khi quay lại thì nối lại ngay.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Play.net()) Net.wake(); });
    window.addEventListener('online', () => { if (Play.net()) Net.wake(); });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      // Service worker chung đặt ở gốc trang (phục vụ cả trang chủ, cờ tướng, cờ vua)
      navigator.serviceWorker.register('../sw.js', { scope: '../' }).then(() => navigator.serviceWorker.ready).then(() => {
        // Lần đầu (hoặc sau khi cập nhật) trang chưa có tiêu đề COOP/COEP: tải lại một lần để bật engine mạnh.
        let tried = false; try { tried = sessionStorage.getItem(GAME.store + 'coi') === '1'; } catch (e) { /* bỏ qua */ }
        if (!window.crossOriginIsolated && !tried) { try { sessionStorage.setItem(GAME.store + 'coi', '1'); } catch (e) { /* bỏ qua */ } location.reload(); }
      }).catch(() => { /* bỏ qua */ });
    }
  }
  // Đối tượng cho kiểm tra tự động: window.__xq (cờ tướng) / window.__xc (cờ vua) / window.__xv (cờ vây).
  // Phần chung ở đây; các module riêng (Puz, Tac, Op, Ana…) do HOOKS.boot.expose() thêm vào.
  window[GAME.debug] = Object.assign({ Play, Store, Engine, Board, Backup, Privacy, Consent, Report, ErrLog, Nav, Net, showTab, version: APP_VERSION }, HOOKS.boot.expose());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
