  // 99-boot.js — Điều hướng giữa các tab và khởi động app (đăng ký service worker, bật engine mạnh).
  // ---------- Điều hướng ----------
  function showTab(name) {
    $$('.view').forEach(v => v.hidden = v.id !== 'v-' + name);
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    if (name !== 'ana') Store.set('tab', name);
    if (name === 'tac') Tac.renderList();
    if (name === 'ana' && !Ana.cur) Ana.renderList();
    if (name === 'about') Backup.render();
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
      if (tab === 'puz') return !$('#puz-play').hidden && !Puz.solved;
      if (tab === 'tac') return !$('#tac-play').hidden && (Tac.mode === 'free' ? !Tac.solved : !Tac.over);
      if (tab === 'op') return !$('#op-play').hidden && Op.mode === 'drill' && !Op.finished;
      return false;
    },
    update() {
      const b = document.body, busy = this.busy();
      if (!busy) this.peek = false;
      b.classList.toggle('nav-min', busy && !this.peek);
      b.classList.toggle('game-play', this.cur() === 'play' && (Play.pvp() ? !Play.setup : Play.active()));
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
    Engine.init();
    Play.init(); Puz.init(); Tac.init(); Op.init(); Ana.init();
    $('#set-nmode').onchange = e => applyNmode(e.target.value); applyNmode(noteMode());
    Backup.init();
    Nav.init();
    $$('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
    showTab(Store.get('tab', 'play'));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
        // Lần đầu (hoặc sau khi cập nhật) trang chưa có tiêu đề COOP/COEP: tải lại một lần để bật engine mạnh.
        let tried = false; try { tried = sessionStorage.getItem('xq_coi') === '1'; } catch (e) { /* bỏ qua */ }
        if (!window.crossOriginIsolated && !tried) { try { sessionStorage.setItem('xq_coi', '1'); } catch (e) { /* bỏ qua */ } location.reload(); }
      }).catch(() => { /* bỏ qua */ });
    }
  }
  window.__xq = { Play, Puz, Tac, Op, FSF, Ana, Store, Engine, Board, Backup, Nav, vi, showTab, version: APP_VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
