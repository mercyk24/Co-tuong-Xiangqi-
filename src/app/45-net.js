  // 45-net.js — Chơi qua mạng giữa hai thiết bị: kết nối thẳng WebRTC (DataChannel).
  // Hai máy tìm nhau qua "điểm hẹn" nói giao thức PeerJS: điểm hẹn riêng của app (Cloudflare, server/) nếu đã cài,
  // dự phòng bằng điểm hẹn công cộng 0.peerjs.com. Nước đi đi thẳng giữa hai máy; nếu mạng không cho nối thẳng
  // và đang dùng điểm hẹn riêng thì tin ván cờ đi qua điểm hẹn (RELAY).
  // Người tạo phòng (host) giữ bản gốc của ván: khi nối lại sau rớt mạng, host gửi lại toàn bộ ván để hai máy khớp nhau.
  // ---------- Chơi qua mạng ----------
  const NET_PROTO = 1;                      // đổi khi giao thức giữa hai máy thay đổi
  const NET_PREFIX = 'xqvn-';               // tiền tố mã máy trên điểm hẹn, tránh trùng với ứng dụng khác
  const NET_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const NET_ICE_FAIL = 'Hai máy đã tìm thấy nhau nhưng không nối thẳng được: mạng của một bên (thường là 4G hoặc Wi-Fi công ty) chặn kết nối trực tiếp. Hãy thử cho cả hai máy dùng chung một Wi-Fi, hoặc đổi sang mạng khác.';
  // Địa chỉ điểm hẹn riêng (Cloudflare Worker trong server/), ví dụ 'wss://co-tuong.ten-ban.workers.dev'.
  // Để trống thì chỉ dùng điểm hẹn công cộng. Xem docs/MO-RONG.md.
  const NET_OWN = 'wss://co-tuong.cotuong-mercy.workers.dev';
  const NET_PUBLIC = 'wss://0.peerjs.com:443';
  const NET_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

  // Dạng tin trên điểm hẹn phải giống hệt thư viện PeerJS 1.5.5: máy chủ 0.peerjs.com kiểm tra từng trường,
  // gặp tin thiếu trường thì bỏ tin và ngắt kết nối của người gửi.
  const sigOffer = (sdp, cid) => ({ sdp: { type: sdp.type, sdp: sdp.sdp }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary' });
  const sigAnswer = (sdp, cid) => ({ sdp: { type: sdp.type, sdp: sdp.sdp }, type: 'data', connectionId: cid });
  const sigCand = (c, cid) => ({ candidate: c, type: 'data', connectionId: cid });
  // Kiểm tra dạng tin như máy chủ thật (dùng cho điểm hẹn giả khi kiểm tra tự động)
  function sigValid(type, p) {
    if (!p || p.type !== 'data' || typeof p.connectionId !== 'string') return false;
    if (type === 'OFFER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || '') && p.label && p.serialization);
    if (type === 'ANSWER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || ''));
    if (type === 'CANDIDATE') return !!(p.candidate && typeof p.candidate.candidate === 'string');
    return false;
  }

  // Điểm hẹn PeerJS: chỉ chuyển lời mời kết nối (OFFER/ANSWER/CANDIDATE) giữa hai mã máy.
  // srv: { url, own, hb } — own: điểm hẹn riêng (có phòng riêng, có RELAY); hb: nhịp tim (ms).
  class PeerSignal {
    constructor(id, onMsg, onClose, opt) {
      this.id = id; this.onMsg = onMsg; this.onClose = onClose; this.ws = null; this.hb = 0; this.relay = false;
      this.srv = opt.srv; this.token = opt.token; this.room = opt.room;
    }
    ready() { return !!(this.ws && this.ws.readyState === 1); }
    open() {
      return new Promise((resolve, reject) => {
        let done = false;
        const q = 'key=peerjs&id=' + encodeURIComponent(this.id) + '&token=' + this.token + '&version=1.5.5' + (this.srv.own ? '&room=' + this.room.toLowerCase() : '');
        const ws = this.ws = new WebSocket(this.srv.url + '/peerjs?' + q);
        const fail = why => { if (!done) { done = true; reject(new Error(why)); } };
        const timer = setTimeout(() => { fail('timeout'); try { ws.close(); } catch (e) { /* bỏ qua */ } }, 12000);
        ws.onmessage = ev => {
          let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.type === 'OPEN') {
            done = true; clearTimeout(timer);
            this.relay = !!(this.srv.own && m.payload && m.payload.relay);
            this.hb = setInterval(() => this.raw({ type: 'HEARTBEAT' }), this.srv.hb || 5000); resolve(); return;
          }
          if (m.type === 'ID-TAKEN') { clearTimeout(timer); fail('id-taken'); return; }
          if (m.type === 'ERROR' || m.type === 'INVALID-KEY') { clearTimeout(timer); fail(m.payload && m.payload.msg === 'room-full' ? 'full' : 'server'); return; }
          if (m.type === 'HEARTBEAT') return;
          this.onMsg(m);
        };
        ws.onerror = () => { clearTimeout(timer); fail('network'); };
        ws.onclose = () => { clearTimeout(this.hb); clearTimeout(timer); fail('closed'); if (done && this.onClose) this.onClose(); };
      });
    }
    raw(o) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } catch (e) { /* bỏ qua */ } }
    send(type, dst, payload) { this.raw({ type, dst, payload }); }
    close() { clearInterval(this.hb); this.onClose = null; try { if (this.ws) this.ws.close(); } catch (e) { /* bỏ qua */ } }
  }

  // Danh sách điểm hẹn, thử lần lượt. Kiểm tra tự động có thể thay bằng window.__XQ_SIGNAL__:
  //   'local' (giả trong trình duyệt), 'public' (chỉ 0.peerjs.com) hoặc mảng địa chỉ điểm hẹn riêng (ws://...).
  function netServers() {
    const o = window.__XQ_SIGNAL__;
    if (o === 'local') return [{ local: true }];
    if (o === 'public') return [{ url: NET_PUBLIC, own: false, hb: 5000 }];
    if (Array.isArray(o)) return o.map(url => ({ url, own: true, hb: 30000 }));
    const l = [];
    if (NET_OWN) l.push({ url: NET_OWN, own: true, hb: 30000 });
    l.push({ url: NET_PUBLIC, own: false, hb: 5000 });
    return l;
  }

  // Điểm hẹn giả trong cùng trình duyệt (BroadcastChannel), chỉ dùng cho kiểm tra tự động.
  // Bắt chước máy chủ thật: tin sai dạng thì bị bỏ và kết nối của người gửi bị ngắt.
  class LocalSignal {
    constructor(id, onMsg, onClose) { this.id = id; this.onMsg = onMsg; this.onClose = onClose; this.ch = null; this.relay = false; }
    ready() { return !!this.ch; }
    open() {
      this.ch = new BroadcastChannel('xq-signal');
      this.ch.onmessage = ev => { const m = ev.data; if (m && m.dst === this.id) this.onMsg(m); };
      return Promise.resolve();
    }
    send(type, dst, payload) {
      if (!this.ch) return;
      if (!sigValid(type, payload)) {
        console.error('[xq] tin điểm hẹn sai dạng', type, payload);
        const cb = this.onClose; this.close(); setTimeout(() => { if (cb) cb(); }, 300); return;
      }
      this.ch.postMessage({ type, dst, src: this.id, payload });
    }
    close() { this.onClose = null; if (this.ch) this.ch.close(); this.ch = null; }
  }

  const Net = {
    state: 'idle',  // idle | opening | waiting | joining | playing | lost | ended | error
    role: '', code: '', myId: '', peerId: '', mySide: 0, clockSet: '0', sideChoice: 'r',
    sig: null, pc: null, dc: null, pendingIce: [], lastSeen: 0, ping: 0, retryT: 0, joinT: 0, err: '', everConnected: false,
    connId: '', gotAnswer: false, sigDrops: 0, spare: {},  // spare: kết nối tạm để báo phòng đã có người
    si: 0, token: '',  // si: đang dùng điểm hẹn thứ mấy trong netServers(); token: thẻ cố định của máy này trong phòng
    link: '',          // đường tin ván cờ: 'dc' (nối thẳng) | 'relay' (qua điểm hẹn) | '' (chưa có)
    waitAsk: '',    // lời xin đang chờ đối thủ trả lời: 'draw' | 'undo' | 'rematch'
    msgText: '', log: [],
    // Nhật ký kết nối ngắn (100 dòng gần nhất) để dò lỗi
    trace(s) { this.log.push(new Date().toISOString().slice(11, 23) + ' [' + this.state + '] ' + s); if (this.log.length > 100) this.log.shift(); },
    newConnId() { return 'dc_' + Math.random().toString(36).slice(2, 12); },
    newCode() { let s = ''; for (let i = 0; i < 6; i++) s += NET_CODE_CHARS[(Math.random() * NET_CODE_CHARS.length) | 0]; return s; },
    newToken() { return Math.random().toString(36).slice(2, 12) + 'x'; },
    servers() { return netServers(); },
    srv() { const l = this.servers(); return l[Math.min(this.si, l.length - 1)]; },
    canRelay() { return !!(this.sig && this.sig.relay); },
    p2pMs() { return window.__XQ_P2P_MS__ || 7000; },
    ice() { return Array.isArray(window.__XQ_ICE__) ? window.__XQ_ICE__ : NET_ICE; },
    joinLink() { return location.origin + location.pathname + '#phong=' + this.code; },
    status(text) { this.msgText = text; Play.draw(); },

    // ---- Lưu phiên để mở lại app (hoặc tải lại trang) vẫn nối tiếp được ván đang dở
    save() {
      if (!this.code || this.state === 'idle' || this.state === 'error') { Store.set('net_sess', null); return; }
      Store.set('net_sess', { t: Date.now(), role: this.role, code: this.code, myId: this.myId, peerId: this.peerId, mySide: this.mySide, clockSet: this.clockSet, si: this.si, token: this.token,
        moves: Play.moves.map(m => XQ.mvStr(m)), left: Play.clock ? Play.clock.left.slice() : null, over: Play.over, started: this.state !== 'waiting' });
    },
    resumeSaved() {
      const s = Store.get('net_sess', null);
      if (!s || Date.now() - s.t > 2 * 3600 * 1000 || s.over || !s.started) { Store.set('net_sess', null); return false; }
      Object.assign(this, { role: s.role, code: s.code, myId: s.myId, peerId: s.peerId, mySide: s.mySide, clockSet: s.clockSet, si: s.si || 0, token: s.token || this.newToken() });
      Play.netLoad(s.moves, s.left, null, false);
      this.state = 'lost'; this.everConnected = true;
      this.status('Đang nối lại ván với đối thủ…');
      this.connectSignal();
      return true;
    },

    // ---- Tạo phòng / vào phòng / rời phòng
    async create(sideChoice, clockSet) {
      this.reset();
      this.role = 'host'; this.sideChoice = sideChoice; this.clockSet = clockSet;
      this.mySide = sideChoice === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +sideChoice;
      this.state = 'opening'; this.status('Đang tạo phòng…');
      this.token = this.newToken();
      // Thử từng điểm hẹn: điểm hẹn riêng trước, hỏng thì sang điểm hẹn công cộng
      let err = null;
      for (this.si = 0; this.si < this.servers().length; this.si++) {
        for (let i = 0; i < 4; i++) {
          this.code = this.newCode(); this.myId = NET_PREFIX + this.code.toLowerCase();
          try { await this.openSignal(); this.state = 'waiting'; this.status('Đang chờ đối thủ vào phòng…'); this.save(); return; } catch (e) {
            err = e; if (e.message !== 'id-taken') break;
          }
          if (this.state !== 'opening') return;  // người dùng đã huỷ
        }
        this.trace('điểm hẹn ' + this.si + ' hỏng (' + (err && err.message) + ')');
      }
      this.si = 0;
      this.fail(err && err.message === 'id-taken' ? 'Không tạo được mã phòng, hãy thử lại.' : this.sigError(err));
    },
    async join(code) {
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) { toast('Mã phòng gồm 6 ký tự.', 'warn'); return; }
      this.reset();
      this.role = 'guest'; this.code = code; this.peerId = NET_PREFIX + code.toLowerCase();
      this.myId = NET_PREFIX + 'g' + Math.random().toString(36).slice(2, 12);
      this.token = this.newToken(); this.si = 0;
      this.state = 'joining'; this.status('Đang tìm phòng ' + code + '…');
      this.joinAt(0);
    },
    // Vào phòng qua điểm hẹn thứ i; không vào được điểm hẹn đó thì thử điểm hẹn tiếp theo
    async joinAt(i) {
      this.si = i;
      try { await this.openSignal(); } catch (e) {
        if (this.state !== 'joining') return;
        if (e.message === 'full') { this.fail('Phòng ' + this.code + ' đã có người chơi.'); return; }
        if (i + 1 < this.servers().length) { this.trace('điểm hẹn ' + i + ' hỏng (' + e.message + '), thử điểm hẹn tiếp'); this.joinAt(i + 1); return; }
        this.fail(this.sigError(e)); return;
      }
      if (this.state === 'joining') this.dial();
    },
    leave(silent) {
      if (!silent) this.sendMsg({ t: 'bye' });
      this.reset(); Store.set('net_sess', null);
    },
    reset() {
      clearInterval(this.ping); clearTimeout(this.retryT); clearTimeout(this.joinT); clearTimeout(this.needT); clearTimeout(this.p2pT);
      this.closePeer();
      if (this.sig) this.sig.close();
      Object.keys(this.spare).forEach(k => this.dropSpare(k));
      Object.assign(this, { sig: null, state: 'idle', role: '', code: '', peerId: '', err: '', waitAsk: '', msgText: '', everConnected: false, connId: '', gotAnswer: false, sigDrops: 0, si: 0, link: '' });
    },
    fail(text) {
      clearInterval(this.ping); clearTimeout(this.joinT); clearTimeout(this.retryT); clearTimeout(this.p2pT);
      this.closePeer(); if (this.sig) this.sig.close(); this.sig = null;
      this.state = 'error'; this.err = text; Store.set('net_sess', null);
      Play.setup = true; Play.netView = 'home'; Play.closeMenu(); Play.draw();  // quay về màn tạo / vào phòng để thấy lời báo
    },
    sigError(e) {
      const m = e && e.message;
      if (m === 'id-taken') return 'Máy này vẫn đang giữ phòng cũ trên điểm hẹn, hãy đợi vài giây rồi thử lại.';
      if (m === 'full') return 'Phòng ' + this.code + ' đã có người chơi.';
      if (!navigator.onLine) return 'Máy đang không có mạng. Hãy bật Wi-Fi hoặc 4G rồi thử lại.';
      return 'Không vào được điểm hẹn kết nối. Hãy kiểm tra mạng rồi thử lại sau ít phút.';
    },

    // ---- Điểm hẹn
    async openSignal() {
      if (this.sig) this.sig.close();
      const srv = this.srv();
      const S = srv.local ? LocalSignal : PeerSignal;
      const sig = new S(this.myId, m => this.onSignal(m), () => { if (this.sig === sig) { this.sig = null; this.trace('điểm hẹn ngắt'); this.sigClosed(); } },
        { srv, token: this.token || (this.token = this.newToken()), room: this.code });
      await sig.open();
      this.sig = sig;
      this.trace('đã vào điểm hẹn ' + (srv.local ? 'giả' : srv.url) + ' với mã máy ' + this.myId + (sig.relay ? ' (có chuyển tin)' : ''));
    },
    // Nối lại điểm hẹn (khi đang chờ hoặc đang nối lại ván)
    async connectSignal() {
      try { await this.openSignal(); } catch (e) {
        if (this.state === 'lost' || this.state === 'waiting') { this.scheduleRetry(); return; }
        this.fail(this.sigError(e)); return;
      }
      if (this.role === 'guest' && (this.state === 'lost' || this.state === 'joining')) this.dial();
    },
    // Điểm hẹn ngắt giữa chừng
    sigClosed() {
      if (this.state === 'joining') {
        if (this.connected()) return;  // đã nối thẳng xong, không cần điểm hẹn nữa
        // Đang vào phòng: thử vào lại điểm hẹn và gọi lại, tối đa 2 lần, rồi mới báo lỗi
        if (++this.sigDrops > 2) { this.fail('Điểm hẹn kết nối liên tục bị ngắt nên chưa tìm được phòng. Đây là lỗi phía máy chủ trung gian, không phải mạng của bạn; hãy thử lại sau ít phút.'); return; }
        clearTimeout(this.joinT); clearTimeout(this.retryT); clearTimeout(this.p2pT); this.closePeer();
        this.retryT = setTimeout(() => { if (this.state === 'joining' && !this.sig) this.connectSignal(); }, 1000);
        return;
      }
      // Đang chơi qua điểm hẹn mà điểm hẹn ngắt: coi như mất kết nối
      if (this.link === 'relay' && (this.state === 'playing' || this.state === 'ended')) { this.lost(); return; }
      this.scheduleRetry();
    },
    scheduleRetry() {
      this.trace('hẹn thử lại');
      if (!(this.state === 'lost' || this.state === 'waiting' || this.state === 'playing')) return;
      clearTimeout(this.retryT);
      this.retryT = setTimeout(() => { if (!this.sig) this.connectSignal(); else if (this.role === 'guest' && this.state === 'lost') this.dial(); }, 3000);
    },
    onSignal(m) {
      const p = m.payload || {};
      this.trace('điểm hẹn: ' + m.type);
      if (m.type === 'EXPIRE') {
        if (this.role === 'guest' && this.state === 'joining' && this.si + 1 < this.servers().length) {
          // Không thấy phòng ở điểm hẹn này: có thể chủ phòng tạo ở điểm hẹn dự phòng
          this.trace('không thấy phòng ở điểm hẹn ' + this.si + ', thử điểm hẹn tiếp');
          clearTimeout(this.joinT); clearTimeout(this.p2pT); this.closePeer();
          if (this.sig) this.sig.close(); this.sig = null;
          this.joinAt(this.si + 1);
          return;
        }
        if (this.role === 'guest' && this.state === 'joining') this.fail('Không tìm thấy phòng ' + this.code + '. Kiểm tra lại mã, hoặc người tạo phòng đã thoát.');
        else if (this.role === 'guest' && this.state === 'lost') this.scheduleRetry();
        return;
      }
      if (m.type === 'OFFER' && this.role === 'host') {
        // Nhận người vào phòng khi: đang chờ; hoặc đúng người cũ nối lại; hoặc ván chưa có nước nào (người cũ vào lỗi rồi vào lại).
        const known = this.peerId && m.src === this.peerId;
        const fresh = !Play.moves.length && !Play.over && (this.state === 'playing' || this.state === 'lost');
        if (!(this.state === 'waiting' || known || fresh)) { this.rejectBusy(m.src, p); return; }
        this.peerId = m.src; this.connId = p.connectionId; this.accept(p);
        return;
      }
      if (m.type === 'RELAY') { this.onRelay(m.src, p); return; }
      if (m.type === 'LEAVE') {
        if (m.src === this.peerId && this.link === 'relay' && (this.state === 'playing' || this.state === 'ended')) this.lost();
        return;
      }
      if (m.type === 'ANSWER' && this.role === 'guest' && this.pc) {
        if (p.connectionId !== this.connId) { this.trace('bỏ trả lời cũ'); return; }
        this.gotAnswer = true;
        this.pc.setRemoteDescription(p.sdp).then(() => this.flushIce()).catch(() => { /* bỏ qua */ });
        return;
      }
      if (m.type === 'CANDIDATE' && p.candidate && window.__XQ_NO_P2P__) return;
      if (m.type === 'CANDIDATE' && p.candidate) {
        const sp = this.spare[p.connectionId];
        if (sp) { if (sp.pc.remoteDescription) sp.pc.addIceCandidate(p.candidate).catch(() => { /* bỏ qua */ }); else sp.q.push(p.candidate); return; }
        const ok = this.pc && m.src === this.peerId && p.connectionId === this.connId;
        const ty = / typ (\w+)/.exec(p.candidate.candidate || ''); this.trace('địa chỉ đối thủ: ' + (ty ? ty[1] : '?') + (ok ? '' : ' (không thuộc kết nối hiện tại, bỏ qua)'));
        if (!ok) return;
        if (this.pc.remoteDescription) this.pc.addIceCandidate(p.candidate).catch(() => { /* bỏ qua */ });
        else this.pendingIce.push(p.candidate);
      }
    },
    // Phòng đã có người: nối tạm với người mới chỉ để báo "phòng đã có người" rồi đóng
    // (điểm hẹn không cho gửi tin tự đặt, nên phải báo qua kênh nối thẳng).
    async rejectBusy(src, p) {
      const cid = p.connectionId; if (!cid || this.spare[cid]) return;
      this.trace('phòng đã có người, từ chối ' + src);
      const pc = new RTCPeerConnection({ iceServers: this.ice() });
      const sp = this.spare[cid] = { pc, q: [], t: setTimeout(() => this.dropSpare(cid), 20000) };
      pc.onicecandidate = e => { if (e.candidate && this.sig) this.sig.send('CANDIDATE', src, sigCand(e.candidate.toJSON(), cid)); };
      pc.ondatachannel = e => { const dc = e.channel; dc.onopen = () => { try { dc.send(JSON.stringify({ t: 'busy' })); } catch (x) { /* bỏ qua */ } setTimeout(() => this.dropSpare(cid), 1500); }; };
      try {
        await pc.setRemoteDescription(p.sdp);
        sp.q.forEach(c => pc.addIceCandidate(c).catch(() => { /* bỏ qua */ })); sp.q = [];
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        if (this.sig) this.sig.send('ANSWER', src, sigAnswer(a, cid));
      } catch (e) { this.dropSpare(cid); }
    },
    // ---- Chơi qua điểm hẹn (khi mạng không cho nối thẳng)
    startRelay() {
      if (!this.canRelay() || this.connected()) return;
      this.trace('không nối thẳng được, chuyển sang đi qua điểm hẹn');
      clearTimeout(this.joinT); clearTimeout(this.p2pT);
      this.closePeer(); this.link = 'relay';
      this.onOpen();
    },
    onRelay(src, p) {
      let o; try { o = JSON.parse(p.d); } catch (e) { return; }
      if (!o || typeof o.t !== 'string') return;
      if (this.role === 'host' && (src !== this.peerId || this.link !== 'relay')) {
        // Khách chuyển sang đi qua điểm hẹn (lần đầu hoặc khi nối lại): nhận theo đúng luật như lời gọi WebRTC
        const known = this.peerId && src === this.peerId;
        const fresh = !Play.moves.length && !Play.over && (this.state === 'playing' || this.state === 'lost');
        if (!(this.state === 'waiting' || known || fresh)) { if (this.sig) this.sig.send('RELAY', src, { d: JSON.stringify({ t: 'busy' }) }); return; }
        this.trace('khách nối qua điểm hẹn');
        this.peerId = src; this.closePeer(); this.link = 'relay';
        this.onOpen();
      }
      if (this.link !== 'relay' || src !== this.peerId) return;
      this.lastSeen = Date.now();
      this.onMsg(o);
    },
    dropSpare(cid) { const sp = this.spare[cid]; if (!sp) return; delete this.spare[cid]; clearTimeout(sp.t); try { sp.pc.close(); } catch (e) { /* bỏ qua */ } },
    flushIce() { const l = this.pendingIce; this.pendingIce = []; l.forEach(c => this.pc.addIceCandidate(c).catch(() => { /* bỏ qua */ })); },

    // ---- WebRTC
    newPeer() {
      this.closePeer();
      const pc = this.pc = new RTCPeerConnection({ iceServers: this.ice() });
      this.pendingIce = [];
      pc.onicecandidate = e => {
        if (!e.candidate) { this.trace('đã thu thập xong địa chỉ'); return; }
        const ty = / typ (\w+)/.exec(e.candidate.candidate || ''); this.trace('địa chỉ của mình: ' + (ty ? ty[1] : '?'));
        if (window.__XQ_NO_P2P__) return;  // kiểm tra tự động: giả lập mạng chặn nối thẳng
        if (this.sig) this.sig.send('CANDIDATE', this.peerId, sigCand(e.candidate.toJSON(), this.connId));
      };
      pc.oniceconnectionstatechange = () => { if (this.pc === pc) this.trace('ICE: ' + pc.iceConnectionState); };
      pc.onconnectionstatechange = () => {
        if (this.pc !== pc) return;
        this.trace('WebRTC: ' + pc.connectionState);
        if (pc.connectionState === 'failed') {
          if (this.role === 'guest' && (this.state === 'joining' || this.state === 'lost') && this.canRelay()) this.startRelay();
          else if (!this.everConnected && this.role === 'guest') this.fail(NET_ICE_FAIL);
          else if (this.state === 'lost') this.scheduleRetry();  // lần nối lại này hỏng: thử lại
          else this.lost();
        }
      };
      return pc;
    },
    closePeer() {
      const pc = this.pc, dc = this.dc; this.pc = null; this.dc = null; this.link = '';
      try { if (dc) dc.close(); } catch (e) { /* bỏ qua */ }
      try { if (pc) pc.close(); } catch (e) { /* bỏ qua */ }
    },
    async dial() {
      this.trace('gọi tới chủ phòng');
      if (!this.sig) return;
      this.connId = this.newConnId(); this.gotAnswer = false;
      const pc = this.newPeer();
      this.bindDc(pc.createDataChannel('xq', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.pc !== pc || !this.sig) return;
      this.sig.send('OFFER', this.peerId, sigOffer(offer, this.connId));
      this.trace('đã gửi lời gọi tới ' + this.peerId);
      clearTimeout(this.joinT); clearTimeout(this.p2pT);
      // Có điểm hẹn riêng: chủ phòng đã trả lời mà sau vài giây vẫn chưa nối thẳng được thì đi qua điểm hẹn
      if (this.canRelay()) this.p2pT = setTimeout(() => { if (this.pc === pc && this.gotAnswer && !this.connected()) this.startRelay(); }, this.p2pMs());
      this.joinT = setTimeout(() => {
        if (this.pc !== pc || (this.dc && this.dc.readyState === 'open')) return;
        if (this.state === 'joining') {
          // Chưa nhận được trả lời: chủ phòng không phản hồi. Đã trả lời mà chưa nối được: mạng chặn nối thẳng.
          if (this.gotAnswer) this.fail(NET_ICE_FAIL);
          else this.fail('Không có phản hồi từ phòng ' + this.code + '. Kiểm tra lại mã phòng; nếu mã đúng, có thể máy của chủ phòng đang tắt màn hình hoặc đã thoát app, nhờ họ mở lại app rồi thử vào lại.');
        } else this.scheduleRetry();
      }, this.state === 'lost' ? 8000 : (window.__XQ_JOIN_MS__ || 25000));  // nối lại: thử lại nhanh hơn
    },
    async accept(p) {
      this.trace('nhận lời gọi');
      const pc = this.newPeer();
      pc.ondatachannel = e => this.bindDc(e.channel);
      await pc.setRemoteDescription(p.sdp);
      this.flushIce();
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      if (this.sig) this.sig.send('ANSWER', this.peerId, sigAnswer(ans, this.connId));
      this.trace('đã trả lời ' + this.peerId);
    },
    bindDc(dc) {
      this.dc = dc;
      dc.onopen = () => { if (this.dc === dc) { clearTimeout(this.p2pT); this.link = 'dc'; this.onOpen(); } };
      dc.onclose = () => { if (this.dc === dc) this.lost(); };
      dc.onmessage = e => { if (this.dc !== dc) return; let m; try { m = JSON.parse(e.data); } catch (x) { return; } this.lastSeen = Date.now(); this.onMsg(m); };
    },
    sendMsg(o) {
      try {
        if (this.link === 'relay') { if (this.sig && this.sig.ready()) { this.sig.send('RELAY', this.peerId, { d: JSON.stringify(o) }); return true; } return false; }
        if (this.dc && this.dc.readyState === 'open') { this.dc.send(JSON.stringify(o)); return true; }
      } catch (e) { /* bỏ qua */ }
      return false;
    },
    connected() { return this.link === 'relay' ? !!(this.sig && this.sig.ready()) : !!(this.dc && this.dc.readyState === 'open'); },

    onOpen() {
      this.trace(this.link === 'relay' ? 'đi qua điểm hẹn' : 'kênh dữ liệu mở');
      clearTimeout(this.joinT);
      this.everConnected = true; this.lastSeen = Date.now();
      clearInterval(this.ping);
      // Đi qua điểm hẹn thì hỏi thăm thưa hơn (đỡ tải máy chủ); im lặng quá lâu thì coi là mất kết nối
      const relay = this.link === 'relay', every = relay ? 10000 : 4000, quiet = relay ? 32000 : 15000;
      this.ping = setInterval(() => {
        this.sendMsg({ t: 'ping', n: Play.moves.length });
        if (Date.now() - this.lastSeen > quiet && this.connected()) this.lost();
      }, every);
      this.sendMsg({ t: 'hello', p: NET_PROTO, v: APP_VERSION });
      if (this.role === 'host') this.sendState();
      else {
        // Tin nhắn đầu tiên ngay lúc kênh vừa mở đôi khi bị rơi: máy khách xin lại trạng thái ván cho tới khi nhận được.
        const ask = () => {
          if (!this.connected() || !(this.state === 'joining' || this.state === 'lost')) return;
          this.sendMsg({ t: 'need' }); this.needT = setTimeout(ask, 1500);
        };
        clearTimeout(this.needT); ask();
      }
    },
    // Host gửi toàn bộ ván (bắt đầu ván mới hoặc nối lại sau khi rớt mạng)
    sendState() {
      const fresh = this.state === 'waiting';
      if (fresh) { Play.netStart(this.mySide, this.clockSet); }
      this.state = Play.over ? 'ended' : 'playing';
      if (Play.clock && !Play.over) Play.clock.at = Date.now();
      this.sendMsg({ t: 'state', hostSide: this.mySide, clock: this.clockSet, moves: Play.moves.map(m => XQ.mvStr(m)), left: Play.clock ? Play.clock.left : null, over: Play.over || '' });
      this.status(fresh ? '' : 'Đã nối lại.');
      this.save();
    },
    lost() {
      this.trace('mất kết nối');
      if (this.state === 'joining' && this.role === 'guest' && this.everConnected) { this.fail('Mất kết nối khi đang vào phòng ' + this.code + '. Hãy thử vào lại.'); return; }
      if (!(this.state === 'playing' || this.state === 'ended')) return;
      this.closePeer(); clearInterval(this.ping);
      this.state = 'lost';
      if (Play.clock) Play.clock.at = 0;  // tạm dừng đồng hồ khi mất kết nối
      this.status('Mất kết nối với đối thủ, đang nối lại…');
      if (!this.sig) this.connectSignal();
      else if (this.role === 'guest') this.scheduleRetry();
    },
    // Quay lại app (iPhone thường ngắt mạng khi app ở nền): nối lại ngay
    wake() {
      if (this.state === 'playing' && !this.connected()) this.lost();
      else if ((this.state === 'lost' || this.state === 'waiting') && !this.sig) this.connectSignal();
      else if (this.state === 'lost' && this.role === 'guest') this.dial();
    },

    // ---- Tin nhắn giữa hai máy
    onMsg(m) {
      if (m.t === 'ping') {
        this.sendMsg({ t: 'pong' });
        // Lưới an toàn: số nước hai máy lệch nhau hai lần liên tiếp (không phải do nước đang trên đường) thì đồng bộ lại.
        if (typeof m.n === 'number' && m.n !== Play.moves.length && (this.state === 'playing' || this.state === 'ended')) {
          this.miss = (this.miss || 0) + 1;
          if (this.miss >= 2) { this.miss = 0; this.trace('lệch số nước, đồng bộ lại'); if (this.role === 'host') this.sendState(); else this.sendMsg({ t: 'need' }); }
        } else this.miss = 0;
        return;
      }
      if (m.t === 'pong') return;
      if (m.t === 'busy') { if (this.role === 'guest' && this.state === 'joining') this.fail('Phòng ' + this.code + ' đã có người chơi.'); return; }
      this.trace('nhận: ' + m.t);
      if (m.t === 'hello') {
        if (m.p !== NET_PROTO) this.fail('Hai máy đang dùng phiên bản app khác nhau (' + APP_VERSION + ' và ' + m.v + '). Cả hai hãy đóng hẳn app rồi mở lại để cập nhật.');
        return;
      }
      if (m.t === 'state' && this.role === 'guest') {
        const fresh = this.state === 'joining';
        this.mySide = m.hostSide ^ 1; this.clockSet = m.clock;
        if (fresh) Play.netStart(this.mySide, this.clockSet);
        else {
          const mine = Play.moves.map(x => XQ.mvStr(x)).join(' ');
          if (mine !== m.moves.join(' ')) toast('Đã đồng bộ lại ván theo máy của đối thủ.');
        }
        Play.netLoad(m.moves, m.left, m.over || null, true);
        this.state = Play.over ? 'ended' : 'playing';
        this.status(fresh ? '' : 'Đã nối lại.');
        this.save();
        return;
      }
      if (m.t === 'need' && this.role === 'host') { if (this.state !== 'waiting' || this.connected()) this.sendState(); return; }
      if (m.t === 'move') {
        const r = Play.netApplyMove(m.n, m.u, m.left);
        if (r === 'gap') { if (this.role === 'host') this.sendState(); else this.sendMsg({ t: 'need' }); }
        this.save();
        return;
      }
      if (m.t === 'ask') { Play.netAsk(m.k); return; }
      if (m.t === 'ans') { this.waitAsk = ''; Play.netAnswer(m.k, m.y); this.save(); return; }
      if (m.t === 'resign') { Play.netOver(SIDE[this.mySide ^ 1] + ' chịu thua – ' + SIDE[this.mySide] + ' thắng.'); this.save(); return; }
      if (m.t === 'flag') {
        // Chỉ tin báo hết giờ của chính đối thủ; báo "bạn hết giờ" chỉ được nhận khi đồng hồ của mình cũng đã gần hết.
        const c = Play.clock, mine = m.s === this.mySide;
        if (!c || (mine && c.left[this.mySide] > 3000)) return;
        Play.netOver(SIDE[m.s] + ' hết giờ – ' + SIDE[m.s ^ 1] + ' thắng.'); this.save(); return;
      }
      if (m.t === 'rematch' && this.role === 'guest') { this.mySide = m.hostSide ^ 1; this.clockSet = m.clock; Play.netStart(this.mySide, this.clockSet); this.state = 'playing'; this.save(); return; }
      if (m.t === 'bye') {
        this.closePeer(); clearInterval(this.ping);
        if (!Play.over) Play.netOver('Đối thủ đã rời phòng.');
        this.state = 'ended'; this.status('Đối thủ đã rời phòng.');
        if (this.sig) this.sig.close(); this.sig = null;
        Store.set('net_sess', null);
      }
    },
    sendMove(n, u, left) { if (!this.sendMsg({ t: 'move', n, u, left })) this.lost(); this.save(); },
    ask(k) { this.waitAsk = k; if (!this.sendMsg({ t: 'ask', k })) { this.waitAsk = ''; toast('Đang mất kết nối, chưa gửi được.', 'warn'); } Play.draw(); },
    answer(k, y) { this.sendMsg({ t: 'ans', k, y }); },
    // Host bắt đầu ván mới với cùng đối thủ, hai bên đổi màu quân
    rematch() {
      this.mySide ^= 1;
      Play.netStart(this.mySide, this.clockSet);
      this.state = 'playing';
      this.sendMsg({ t: 'rematch', hostSide: this.mySide, clock: this.clockSet });
      this.save();
    }
  };

