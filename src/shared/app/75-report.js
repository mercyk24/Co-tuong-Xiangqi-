  // [DÙNG CHUNG] Cả cờ tướng và cờ vua chạy tệp này. Chỉ dùng RULES và GAME (00-game.js của từng app), không gọi thẳng XQ/CH. Sơ đồ: docs/CAU-TRUC.md
  // 75-report.js (dùng chung) — Báo lỗi tự nguyện (Giới thiệu › Báo lỗi): người dùng xem trước nội dung, tự chép rồi gửi cho người phát triển.
  // Nội dung chỉ gồm phiên bản app, loại máy / trình duyệt, khả năng của trình duyệt, lỗi gần đây (ErrLog) và nhật ký kết nối;
  // không có ván cờ, tiến độ hay dữ liệu cá nhân. App không tự gửi gì đi.
  const Report = {
    ISSUES: 'https://github.com/mercyk24/co-luyen-tap/issues/new',
    text() {
      const L = [], yn = b => (b ? 'có' : 'không');
      const fmt = t => { try { return new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; } catch (e) { return '?'; } };
      L.push(GAME.title + ' ' + ($('#app-version') ? $('#app-version').textContent : APP_VERSION));
      L.push('Lúc: ' + fmt(Date.now()));
      L.push('Trình duyệt: ' + navigator.userAgent);
      L.push('Màn hình: ' + window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) +
        ' · cài lên màn hình chính: ' + yn(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)));
      L.push('Engine mạnh: cách ly ' + yn(window.crossOriginIsolated) + ', SharedArrayBuffer ' + yn(typeof SharedArrayBuffer !== 'undefined') +
        ', đã tải ' + yn(FSF.sf) + ', lỗi ' + yn(FSF.failed) + ' · service worker: ' + yn(navigator.serviceWorker && navigator.serviceWorker.controller));
      L.push('Đang ở: tab ' + Store.get('tab', '?') + ', chế độ ' + Play.mode + ', màn ' + Play.screen + (Play.over ? ', ván đã kết thúc' : ''));
      const errs = ErrLog.list();
      L.push('', 'Lỗi gần đây (' + errs.length + '):');
      if (!errs.length) L.push('  (không có)');
      errs.forEach(e => L.push('  ' + fmt(e.t) + ' [' + e.k + ', bản ' + e.v + (e.n > 1 ? ', ×' + e.n : '') + '] ' + e.m + (e.w ? ' @ ' + e.w : '')));
      if (Net.log.length) {
        L.push('', 'Nhật ký kết nối gần nhất (trạng thái ' + Net.state + (Net.link ? ', đường ' + Net.link : '') + '):');
        Net.log.slice(-40).forEach(x => L.push('  ' + x));
      }
      return L.join('\n');
    },
    init() {
      $('#rp-show').onclick = () => { $('#rp-text').value = this.text(); $('#rp-box').hidden = false; $('#rp-show').hidden = true; };
      $('#rp-copy').onclick = () => {
        const s = $('#rp-text').value, ok = () => toast('Đã chép thông tin lỗi. Dán vào tin nhắn gửi người phát triển.', 'ok');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(ok, () => this.selectText());
        else this.selectText();
      };
      $('#rp-open').onclick = () => { try { window.open(this.ISSUES, '_blank', 'noopener'); } catch (e) { toast(this.ISSUES); } };
      $('#rp-clear').onclick = () => { ErrLog.clear(); $('#rp-text').value = this.text(); this.render(); toast('Đã xoá nhật ký lỗi.', 'ok'); };
      this.render();
    },
    selectText() { const t = $('#rp-text'); t.focus(); t.select(); toast('Chưa chép tự động được: nội dung đã được chọn, hãy bấm Sao chép.', 'warn'); },
    render() {
      const n = ErrLog.list().length;
      $('#rp-count').textContent = n ? 'Có ' + n + ' lỗi được ghi lại trên máy này.' : 'Chưa có lỗi nào được ghi lại trên máy này.';
    }
  };
