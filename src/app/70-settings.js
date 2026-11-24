  // 70-settings.js — Cài đặt và dữ liệu: cách ghi nước đi, sao lưu / khôi phục dữ liệu người dùng.
  function applyNmode(v) {
    Store.set('nmode', v);
    const sel = $('#set-nmode'); if (sel) sel.value = v;
    const b = $('#ana-nm'); if (b) b.textContent = 'Ghi nước: ' + { vi: 'Việt', han: 'Hán', both: 'Cả hai' }[v];
    try { Play.draw(); } catch (e) { /* bỏ qua */ }
    try { if (Ana.cur) Ana.draw(); } catch (e) { /* bỏ qua */ }
    try { Tac.renderList(); if (Tac.cur && !$('#tac-play').hidden) Tac.draw(); } catch (e) { /* bỏ qua */ }
    try { Op.renderList(); if (!$('#op-play').hidden) Op.draw(); } catch (e) { /* bỏ qua */ }
  }

  // Sao lưu / khôi phục: mọi dữ liệu của app nằm trong localStorage với tiền tố "xq_".
  const Backup = {
    KEY: 'xq_', pending: null,
    collect() {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(this.KEY) === 0) data[k.slice(this.KEY.length)] = localStorage.getItem(k);
      }
      return { app: 'co-tuong-luyen-tap', version: APP_VERSION, exportedAt: new Date().toISOString(), data };
    },
    summary(data) {
      const j = k => { try { return JSON.parse(data[k] || 'null'); } catch (e) { return null; } };
      const games = j('games') || [], mine = j('mine') || [], tdone = j('tac_done') || {}, pdone = j('puz_done') || j('done') || {};
      return games.length + ' ván đã lưu · ' + mine.length + ' bài "Lỗi của bạn" · ' + Object.keys(tdone).length + ' bài chiến thuật đã giải' + (Object.keys(pdone).length ? ' · ' + Object.keys(pdone).length + ' bài chiếu hết' : '');
    },
    init() {
      $('#bk-export').onclick = () => this.exportFile();
      $('#bk-import').onclick = () => $('#bk-file').click();
      $('#bk-file').onchange = e => { const f = e.target.files && e.target.files[0]; if (f) this.readFile(f); e.target.value = ''; };
      $('#bk-apply').onclick = () => this.apply();
      $('#bk-cancel').onclick = () => { this.pending = null; this.render(); };
      this.render();
    },
    render() {
      $('#bk-now').textContent = 'Trên máy này: ' + this.summary(this.collect().data) + '.';
      $('#bk-confirm').hidden = !this.pending;
      if (this.pending) $('#bk-what').textContent = 'File sao lưu ngày ' + new Date(this.pending.exportedAt).toLocaleString('vi-VN') + ' (phiên bản ' + this.pending.version + '): ' + this.summary(this.pending.data) + '. Khôi phục sẽ thay toàn bộ dữ liệu hiện có trên máy này.';
    },
    exportFile() {
      const obj = this.collect(), txt = JSON.stringify(obj);
      const name = 'co-tuong-sao-luu-' + obj.exportedAt.slice(0, 10) + '.json';
      const blob = new Blob([txt], { type: 'application/json' });
      const file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/json' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(() => { /* người dùng huỷ */ });
        return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Đã tạo file ' + name, 'ok');
    },
    readFile(f) {
      const r = new FileReader();
      r.onload = () => {
        let o = null; try { o = JSON.parse(r.result); } catch (e) { o = null; }
        if (!o || o.app !== 'co-tuong-luyen-tap' || !o.data || typeof o.data !== 'object') { toast('File này không phải bản sao lưu của app.', 'warn'); return; }
        this.pending = o; this.render();
      };
      r.readAsText(f);
    },
    apply() {
      const o = this.pending; if (!o) return;
      const old = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(this.KEY) === 0) old.push(k); }
      old.forEach(k => localStorage.removeItem(k));
      Object.keys(o.data).forEach(k => { if (typeof o.data[k] === 'string') localStorage.setItem(this.KEY + k, o.data[k]); });
      toast('Đã khôi phục dữ liệu. Đang tải lại…', 'ok');
      setTimeout(() => location.reload(), 600);
    }
  };
