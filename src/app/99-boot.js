  // 99-boot.js — Điều hướng giữa các tab và khởi động app (đăng ký service worker, bật engine mạnh).
  // ---------- Điều hướng ----------
  function showTab(name) {
    $$('.view').forEach(v => v.hidden = v.id !== 'v-' + name);
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    if (name !== 'ana') Store.set('tab', name);
    if (name === 'tac') Tac.renderList();
    if (name === 'ana' && !Ana.cur) Ana.renderList();
    if (name === 'about') Backup.render();
    window.scrollTo(0, 0);
  }

  function boot() {
    Engine.init();
    Play.init(); Puz.init(); Tac.init(); Op.init(); Ana.init();
    $('#set-nmode').onchange = e => applyNmode(e.target.value); applyNmode(noteMode());
    Backup.init();
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
  window.__xq = { Play, Puz, Tac, Op, FSF, Ana, Store, Engine, Board, Backup, vi, showTab, version: APP_VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
