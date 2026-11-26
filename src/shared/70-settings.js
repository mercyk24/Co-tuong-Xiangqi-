  // 70-settings.js (dùng chung) — Sao lưu / khôi phục dữ liệu người dùng, quyền riêng tư (rút lại đồng ý, xoá dữ liệu).
  // Phần riêng của từng loại cờ nằm trong GAME (00-game.js): tên app, tiền tố lưu trữ, danh sách khoá, kiểm tra dữ liệu.
  // Sao lưu / khôi phục: mọi dữ liệu của app nằm trong localStorage với tiền tố GAME.store ("xq_" cờ tướng, "xc_" cờ vua).
  const Backup = {
    KEY: GAME.store, pending: null,
    collect() {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(this.KEY) === 0) data[k.slice(this.KEY.length)] = localStorage.getItem(k);
      }
      return { app: GAME.app, version: APP_VERSION, exportedAt: new Date().toISOString(), data };
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
    // Tệp sao lưu đến từ bên ngoài nên được kiểm tra kỹ trước khi ghi vào máy: chỉ nhận đúng các mục app dùng,
    // mỗi mục phải là JSON hợp lệ, không chứa ký tự dùng được để chèn mã vào trang (< > " ' ` &), và không quá lớn.
    MAX_FILE: 5 * 1024 * 1024,
    KEYS: GAME.keys,
    clean(o) {
      if (!o || typeof o !== 'object' || o.app !== GAME.app || !o.data || typeof o.data !== 'object' || Array.isArray(o.data)) return null;
      const bad = v => typeof v === 'string' && /[<>"'`&\u0000-\u001f]/.test(v);
      const deepOk = (v, depth) => {
        if (depth > 8) return false;
        if (v === null || typeof v === 'number' || typeof v === 'boolean') return typeof v !== 'number' || isFinite(v);
        if (typeof v === 'string') return v.length <= 2000 && !bad(v);
        if (Array.isArray(v)) return v.length <= 5000 && v.every(x => deepOk(x, depth + 1));
        if (typeof v === 'object') return Object.keys(v).length <= 5000 && Object.keys(v).every(k => k.length <= 64 && !bad(k) && deepOk(v[k], depth + 1));
        return false;
      };
      const data = {};
      for (const k of Object.keys(o.data)) {
        if (this.KEYS.indexOf(k) < 0) continue;                      // mục lạ: bỏ qua
        const raw = o.data[k];
        if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) return null;
        let v; try { v = JSON.parse(raw); } catch (e) { return null; }
        if (!deepOk(v, 0)) return null;
        if (k === 'games' && !(Array.isArray(v) && v.every(g => g && /^g[A-Za-z0-9_-]{1,40}$/.test(g.id) && isFinite(g.t) && Array.isArray(g.moves)))) return null;
        if (k === 'mine' && !(Array.isArray(v) && v.every(m => m && typeof m.id === 'string' && /^m[A-Za-z0-9_-]{0,40}$/.test(m.id)))) return null;
        if (GAME.checkKey && !GAME.checkKey(k, v)) return null;
        data[k] = raw;
      }
      const ver = String(o.version || '').slice(0, 20), when = Date.parse(o.exportedAt);
      return { app: o.app, version: /^[0-9.]+$/.test(ver) ? ver : '?', exportedAt: isFinite(when) ? new Date(when).toISOString() : new Date(0).toISOString(), data };
    },
    readFile(f) {
      if (f.size > this.MAX_FILE) { toast('File quá lớn, không phải bản sao lưu của app.', 'warn'); return; }
      const r = new FileReader();
      r.onload = () => {
        let o = null; try { o = this.clean(JSON.parse(r.result)); } catch (e) { o = null; }
        if (!o) { toast('File này không phải bản sao lưu của app, hoặc đã bị sửa nên không an toàn để khôi phục.', 'warn'); return; }
        this.pending = o; this.render();
      };
      r.readAsText(f);
    },
    apply() {
      const o = this.pending; if (!o) return;
      const old = [], keep = [GAME.store + 'consent_net', GAME.store + 'net_sess'];  // sự đồng ý là của máy này, không lấy từ tệp
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(this.KEY) === 0 && keep.indexOf(k) < 0) old.push(k); }
      old.forEach(k => localStorage.removeItem(k));
      Object.keys(o.data).forEach(k => { if (typeof o.data[k] === 'string') localStorage.setItem(this.KEY + k, o.data[k]); });
      toast('Đã khôi phục dữ liệu. Đang tải lại…', 'ok');
      setTimeout(() => location.reload(), 600);
    }
  };

  // Quyền riêng tư: xem / rút lại sự đồng ý chơi qua mạng, xoá toàn bộ dữ liệu của app trên máy.
  const Privacy = {
    init() {
      $('#pv-revoke').onclick = () => {
        if (Play.net() && Net.state !== 'idle') Play.netLeave();
        Consent.revoke(); toast('Đã rút lại sự đồng ý. App sẽ hỏi lại trước khi chơi qua mạng.', 'ok'); this.render();
      };
      $('#pv-wipe').onclick = () => { $('#pv-wipe-confirm').hidden = false; $('#pv-wipe').hidden = true; };
      $('#pv-wipe-no').onclick = () => { $('#pv-wipe-confirm').hidden = true; $('#pv-wipe').hidden = false; };
      $('#pv-wipe-yes').onclick = () => this.wipe();
      this.render();
    },
    render() {
      const c = Consent.get();
      $('#pv-status').textContent = c
        ? 'Bạn đã đồng ý gửi thông tin kết nối để chơi qua mạng lúc ' + new Date(c.t).toLocaleString('vi-VN') + '.'
        : 'Bạn chưa đồng ý chơi qua mạng: app không gửi dữ liệu nào ra khỏi máy.';
      $('#pv-revoke').hidden = !c;
    },
    wipe() {
      try { if (Play.net() && Net.state !== 'idle') Net.leave(); } catch (e) { /* bỏ qua */ }
      const ks = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(GAME.store) === 0) ks.push(k); }
      ks.forEach(k => localStorage.removeItem(k));
      try { sessionStorage.clear(); } catch (e) { /* bỏ qua */ }
      toast('Đã xoá dữ liệu của app trên máy này. Đang tải lại…', 'ok');
      setTimeout(() => location.reload(), 600);
    }
  };
