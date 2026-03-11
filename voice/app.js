/**
 * HeartSpace Voice v5.5
 * Voice Calls with Voice Notes & Messaging
 * 100% Free - Production Ready
 */

(function() {
  'use strict';

  // ============================================
  // ICE SERVERS (FREE)
  // ============================================
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:relay.metered.ca:80',
      username: 'e8dd65b92c62d5e24328ff6e',
      credential: 'kLsEr9bZT+I5VGcf'
    },
    {
      urls: 'turn:relay.metered.ca:443',
      username: 'e8dd65b92c62d5e24328ff6e',
      credential: 'kLsEr9bZT+I5VGcf'
    }
  ];

  // ============================================
  // CONFIG
  // ============================================
  const CONFIG = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    }
  };

  // ============================================
  // STATE
  // ============================================
  const App = {
    socket: null,
    pc: null,
    localStream: null,
    remoteStream: null,
    
    room: null,
    role: null,
    myName: 'Anonymous',
    partnerName: 'Partner',
    
    muted: false,
    speakerOff: false,
    
    callStart: null,
    timerInterval: null,
    ringInterval: null,
    qosInterval: null,
    
    iceQueue: [],
    iceReady: false,
    reconnectAttempts: 0,
    
    // Messages
    msgPanelOpen: false,
    unreadMsgs: 0,
    
    // Voice Recording
    mediaRecorder: null,
    audioChunks: [],
    recordStart: null,
    recordInterval: null,
    
    el: {}
  };

  // ============================================
  // HELPERS
  // ============================================
  const $ = id => document.getElementById(id);
  
  const log = (msg, type = 'info') => {
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${icons[type]} [HeartSpace Voice] ${msg}`);
  };

  const toast = (msg, type = 'info', duration = 4000) => {
    const container = App.el.toastContainer;
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
    container.appendChild(div);
    
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transform = 'translateX(100%)';
      setTimeout(() => div.remove(), 300);
    }, duration);
  };

  const escape = str => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const formatTime = secs => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const randomRoom = () => {
    const adj = ['happy', 'sunny', 'cozy', 'sweet', 'calm', 'warm', 'bright'];
    const noun = ['heart', 'star', 'moon', 'cloud', 'dream', 'wave', 'sky'];
    return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${Math.floor(Math.random() * 1000)}`;
  };

  const shareLink = room => `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;

  const copyText = text => {
    navigator.clipboard.writeText(text)
      .then(() => toast('Copied!', 'success'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied!', 'success');
      });
  };

  // ============================================
  // DOM CACHE
  // ============================================
  const cacheDOM = () => {
    App.el = {
      // Connection
      connectionBar: $('connectionBar'),
      connText: document.querySelector('.conn-text'),
      toastContainer: $('toastContainer'),
      
      // Screens
      preCall: $('preCallScreen'),
      waiting: $('waitingScreen'),
      inCall: $('inCallScreen'),
      
      // Audio
      localAudio: $('localAudio'),
      remoteAudio: $('remoteAudio'),
      
      // Inputs
      userName: $('userName'),
      roomId: $('roomId'),
      
      // Pre-call buttons
      generateBtn: $('generateBtn'),
      copyRoomBtn: $('copyRoomBtn'),
      createBtn: $('createBtn'),
      joinBtn: $('joinBtn'),
      
      // Waiting
      waitingRoomId: $('waitingRoomId'),
      waitingShareLink: $('waitingShareLink'),
      waitingCopyBtn: $('waitingCopyBtn'),
      cancelWaitBtn: $('cancelWaitBtn'),
      
      // Call info
      partnerName: $('callPartnerName'),
      partnerInitial: $('partnerInitial'),
      statusText: $('callStatusText'),
      timer: $('callTimer'),
      netQuality: $('networkQuality'),
      shareLinkBox: $('shareLinkBox'),
      shareLink: $('shareLink'),
      copyLinkBtn: $('copyLinkBtn'),
      
      // Controls
      muteBtn: $('muteBtn'),
      speakerBtn: $('speakerBtn'),
      hangupBtn: $('hangupBtn'),
      messageBtn: $('messageBtn'),
      voiceNoteBtn: $('voiceNoteBtn'),
      msgBadge: $('msgBadge'),
      
      // Sound waves
      soundWaves: document.querySelector('.sound-waves'),
      
      // Messages panel
      msgPanel: $('messagesPanel'),
      msgList: $('messagesList'),
      msgInput: $('msgInput'),
      sendMsgBtn: $('sendMsgBtn'),
      closeMsgBtn: $('closeMsgBtn'),
      voiceRecordBtn: $('voiceRecordBtn'),
      typingIndicator: $('typingIndicator'),
      
      // Voice recording
      voiceOverlay: $('voiceRecordOverlay'),
      recordTimer: $('recordTimer'),
      cancelRecordBtn: $('cancelRecordBtn'),
      sendRecordBtn: $('sendRecordBtn'),
      
      // History
      historyBtn: $('historyBtn'),
      historyModal: $('historyModal'),
      historyList: $('historyList'),
      closeHistoryBtn: $('closeHistoryBtn'),
      clearHistoryBtn: $('clearHistoryBtn'),
      
      // Theme
      themeBtn: $('themeBtn')
    };
  };

  // ============================================
  // UI UPDATES
  // ============================================
  const setConnStatus = (text, type = 'info') => {
    if (App.el.connText) App.el.connText.textContent = text;
    if (App.el.connectionBar) {
      App.el.connectionBar.className = 'connection-bar';
      if (type === 'connected') App.el.connectionBar.classList.add('connected');
      if (type === 'error') App.el.connectionBar.classList.add('error');
    }
  };

  const showScreen = name => {
    App.el.preCall?.classList.add('hidden');
    App.el.waiting?.classList.add('hidden');
    App.el.inCall?.classList.add('hidden');
    
    if (name === 'precall') App.el.preCall?.classList.remove('hidden');
    if (name === 'waiting') App.el.waiting?.classList.remove('hidden');
    if (name === 'incall') App.el.inCall?.classList.remove('hidden');
  };

  const setLoading = (btn, loading) => {
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = loading;
  };

  const enableButtons = enabled => {
    if (App.el.createBtn) App.el.createBtn.disabled = !enabled;
    if (App.el.joinBtn) App.el.joinBtn.disabled = !enabled;
  };

  const updateNetQuality = quality => {
    const el = App.el.netQuality;
    if (!el) return;
    el.className = `net-badge ${quality}`;
    const text = el.querySelector('.quality-text');
    if (text) text.textContent = quality.charAt(0).toUpperCase() + quality.slice(1);
  };

  const updateMsgBadge = () => {
    const badge = App.el.msgBadge;
    if (!badge) return;
    if (App.unreadMsgs > 0 && !App.msgPanelOpen) {
      badge.textContent = App.unreadMsgs > 9 ? '9+' : App.unreadMsgs;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  };

  const updatePartnerDisplay = () => {
    if (App.el.partnerName) App.el.partnerName.textContent = App.partnerName;
    if (App.el.partnerInitial) App.el.partnerInitial.textContent = App.partnerName.charAt(0).toUpperCase();
  };

  const setSoundWavesActive = active => {
    App.el.soundWaves?.classList.toggle('active', active);
  };

  // ============================================
  // SOUNDS
  // ============================================
  const playTone = type => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.1;
      
      osc.start();
      
      switch (type) {
        case 'ring':
          osc.frequency.value = 440;
          setTimeout(() => osc.frequency.value = 550, 150);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'connect':
          osc.frequency.value = 523;
          setTimeout(() => osc.frequency.value = 659, 100);
          setTimeout(() => osc.frequency.value = 784, 200);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'hangup':
          osc.frequency.value = 400;
          setTimeout(() => osc.frequency.value = 300, 150);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'message':
          gain.gain.value = 0.05;
          osc.frequency.value = 800;
          setTimeout(() => { osc.stop(); ctx.close(); }, 100);
          break;
      }
    } catch (e) {}
  };

  const startRing = () => {
    stopRing();
    playTone('ring');
    App.ringInterval = setInterval(() => playTone('ring'), 2000);
  };

  const stopRing = () => {
    if (App.ringInterval) {
      clearInterval(App.ringInterval);
      App.ringInterval = null;
    }
  };

  // ============================================
  // TIMER
  // ============================================
  const startTimer = () => {
    App.callStart = Date.now();
    const update = () => {
      if (!App.callStart) return;
      const secs = Math.floor((Date.now() - App.callStart) / 1000);
      if (App.el.timer) App.el.timer.textContent = formatTime(secs);
    };
    update();
    App.timerInterval = setInterval(update, 1000);
  };

  const stopTimer = () => {
    if (App.timerInterval) {
      clearInterval(App.timerInterval);
      App.timerInterval = null;
    }
    const duration = App.callStart ? Math.floor((Date.now() - App.callStart) / 1000) : 0;
    App.callStart = null;
    return duration;
  };

  // ============================================
  // HISTORY
  // ============================================
  const saveHistory = (partner, duration, type) => {
    try {
      const history = JSON.parse(localStorage.getItem('voiceCallHistory') || '[]');
      history.unshift({ partner, duration, type, time: new Date().toISOString() });
      if (history.length > 50) history.pop();
      localStorage.setItem('voiceCallHistory', JSON.stringify(history));
    } catch (e) {}
  };

  const loadHistory = () => {
    const list = App.el.historyList;
    if (!list) return;
    
    try {
      const history = JSON.parse(localStorage.getItem('voiceCallHistory') || '[]');
      
      if (!history.length) {
        list.innerHTML = `<div class="empty-state"><span>📞</span><p>No calls yet</p><small>Your call history will appear here</small></div>`;
        return;
      }
      
      list.innerHTML = history.map(c => {
        const d = new Date(c.time);
        const icon = c.type === 'outgoing' ? '📤' : '📥';
        return `
          <div class="history-item">
            <span class="history-icon">${icon}</span>
            <div class="history-info">
              <div class="history-name">${escape(c.partner)}</div>
              <div class="history-time">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
            <div class="history-duration">${formatTime(c.duration || 0)}</div>
          </div>`;
      }).join('');
    } catch (e) {}
  };

  const clearHistory = () => {
    localStorage.removeItem('voiceCallHistory');
    loadHistory();
    toast('History cleared', 'success');
  };

  // ============================================
  // QUALITY MONITORING
  // ============================================
  const startQosMonitor = () => {
    stopQosMonitor();
    
    App.qosInterval = setInterval(async () => {
      if (!App.pc || App.pc.connectionState !== 'connected') return;
      
      try {
        const stats = await App.pc.getStats();
        let lost = 0, received = 0, rtt = 0;
        
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            lost += r.packetsLost || 0;
            received += r.packetsReceived || 0;
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            rtt = r.currentRoundTripTime || 0;
          }
        });
        
        const total = lost + received;
        if (!total) return;
        
        const lossRate = lost / total;
        let quality = 'excellent';
        
        if (lossRate > 0.1 || rtt > 0.5) quality = 'poor';
        else if (lossRate > 0.05 || rtt > 0.3) quality = 'fair';
        else if (lossRate > 0.02 || rtt > 0.15) quality = 'good';
        
        updateNetQuality(quality);
      } catch (e) {}
    }, 3000);
  };

  const stopQosMonitor = () => {
    if (App.qosInterval) {
      clearInterval(App.qosInterval);
      App.qosInterval = null;
    }
  };

  // ============================================
  // MEDIA
  // ============================================
  const getMedia = async () => {
    log('Getting audio...', 'info');
    
    try {
      App.localStream = await navigator.mediaDevices.getUserMedia({
        audio: CONFIG.audio,
        video: false
      });
      
      if (App.el.localAudio) {
        App.el.localAudio.srcObject = App.localStream;
      }
      
      if (App.pc) {
        App.localStream.getTracks().forEach(track => {
          App.pc.addTrack(track, App.localStream);
        });
      }
      
      log('Audio ready', 'success');
    } catch (e) {
      log('Media error: ' + e.message, 'error');
      
      if (e.name === 'NotAllowedError') {
        toast('Please allow microphone access', 'error');
      } else {
        toast('Cannot access microphone', 'error');
      }
      throw e;
    }
  };

  const stopMedia = () => {
    if (App.localStream) {
      App.localStream.getTracks().forEach(t => t.stop());
      App.localStream = null;
    }
  };

  // ============================================
  // WEBRTC
  // ============================================
  const createPC = async () => {
    log('Creating peer connection...', 'info');
    
    App.iceQueue = [];
    App.iceReady = false;
    
    if (App.pc) {
      App.pc.close();
      App.pc = null;
    }
    
    App.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    
    App.remoteStream = new MediaStream();
    if (App.el.remoteAudio) {
      App.el.remoteAudio.srcObject = App.remoteStream;
    }
    
    App.pc.onicecandidate = e => {
      if (e.candidate) {
        log('ICE: ' + (e.candidate.type || 'unknown'), 'info');
        App.socket.emit('ice-candidate', { candidate: e.candidate });
      }
    };
    
    App.pc.oniceconnectionstatechange = () => {
      const state = App.pc?.iceConnectionState;
      log('ICE: ' + state, 'info');
      
      switch (state) {
        case 'connected':
        case 'completed':
          onConnected();
          break;
        case 'disconnected':
          onDisconnected();
          break;
        case 'failed':
          onFailed();
          break;
      }
    };
    
    App.pc.ontrack = e => {
      log('Remote track received', 'success');
      e.streams[0].getTracks().forEach(t => App.remoteStream.addTrack(t));
      setSoundWavesActive(true);
    };
    
    log('Peer connection created', 'success');
  };

  // ============================================
  // SIGNALING
  // ============================================
  const sendOffer = async () => {
    log('Creating offer...', 'info');
    
    try {
      const offer = await App.pc.createOffer({ offerToReceiveAudio: true });
      await App.pc.setLocalDescription(offer);
      
      App.socket.emit('offer', { offer, fromName: App.myName });
      log('Offer sent', 'success');
    } catch (e) {
      log('Offer error: ' + e.message, 'error');
      throw e;
    }
  };

  const handleOffer = async data => {
    log('Received offer...', 'info');
    
    try {
      if (data.fromName) {
        App.partnerName = data.fromName;
        updatePartnerDisplay();
      }
      
      if (!App.pc) await createPC();
      if (!App.localStream) await getMedia();
      
      await App.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      App.iceReady = true;
      
      await processIceQueue();
      
      const answer = await App.pc.createAnswer();
      await App.pc.setLocalDescription(answer);
      
      App.socket.emit('answer', { answer, targetId: data.from, fromName: App.myName });
      log('Answer sent', 'success');
      
      if (App.el.inCall?.classList.contains('hidden')) {
        showScreen('incall');
        if (App.el.statusText) App.el.statusText.textContent = 'Connecting...';
      }
    } catch (e) {
      log('Handle offer error: ' + e.message, 'error');
      toast('Connection failed', 'error');
    }
  };

  const handleAnswer = async data => {
    log('Received answer...', 'info');
    
    try {
      if (data.fromName) {
        App.partnerName = data.fromName;
        updatePartnerDisplay();
      }
      
      await App.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      App.iceReady = true;
      
      await processIceQueue();
    } catch (e) {
      log('Handle answer error: ' + e.message, 'error');
    }
  };

  const handleIce = async data => {
    try {
      if (!data.candidate) return;
      
      if (!App.pc || !App.iceReady) {
        App.iceQueue.push(data.candidate);
        return;
      }
      
      await App.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      log('ICE error: ' + e.message, 'error');
    }
  };

  const processIceQueue = async () => {
    if (!App.pc || !App.iceReady || !App.iceQueue.length) return;
    
    for (const candidate of App.iceQueue) {
      try {
        await App.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    }
    App.iceQueue = [];
  };

  // ============================================
  // CONNECTION HANDLERS
  // ============================================
  const onConnected = () => {
    if (App.callStart) return;
    
    log('Call connected!', 'success');
    
    playTone('connect');
    stopRing();
    
    setConnStatus('In Call', 'connected');
    if (App.el.statusText) App.el.statusText.textContent = 'Connected';
    
    startTimer();
    startQosMonitor();
    setSoundWavesActive(true);
    
    showScreen('incall');
    toast('Connected! 🎉', 'success');
    
    App.reconnectAttempts = 0;
  };

  const onDisconnected = () => {
    log('Disconnected...', 'warn');
    if (App.el.statusText) App.el.statusText.textContent = 'Reconnecting...';
    toast('Connection unstable...', 'warning');
    setSoundWavesActive(false);
  };

  const onFailed = async () => {
    log('Connection failed', 'error');
    
    App.reconnectAttempts++;
    
    if (App.reconnectAttempts <= 3 && App.role === 'creator') {
      log('ICE restart...', 'warn');
      toast('Reconnecting...', 'warning');
      
      try {
        const offer = await App.pc.createOffer({ iceRestart: true });
        await App.pc.setLocalDescription(offer);
        App.socket.emit('offer', { offer });
      } catch (e) {
        endCall();
      }
    } else {
      toast('Connection failed', 'error');
      endCall();
    }
  };

  // ============================================
  // CALL MANAGEMENT
  // ============================================
  const createRoom = async () => {
    const roomId = App.el.roomId?.value.trim();
    const userName = App.el.userName?.value.trim() || 'Anonymous';
    
    if (!roomId) {
      toast('Enter a Room ID', 'warning');
      App.el.roomId?.focus();
      return;
    }
    
    if (roomId.length < 3) {
      toast('Room ID too short', 'warning');
      return;
    }
    
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    setLoading(App.el.createBtn, true);
    App.socket.emit('create-room', roomId);
  };

  const joinRoom = async () => {
    const roomId = App.el.roomId?.value.trim();
    const userName = App.el.userName?.value.trim() || 'Anonymous';
    
    if (!roomId) {
      toast('Enter a Room ID', 'warning');
      App.el.roomId?.focus();
      return;
    }
    
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    setLoading(App.el.joinBtn, true);
    App.socket.emit('join-room', roomId);
  };

  const onRoomCreated = async data => {
    log('Room created', 'success');
    
    const roomId = typeof data === 'string' ? data : (data.roomId || data);
    const link = shareLink(roomId);
    
    App.room = roomId;
    App.role = 'creator';
    
    if (App.el.waitingRoomId) App.el.waitingRoomId.textContent = roomId;
    if (App.el.waitingShareLink) App.el.waitingShareLink.value = link;
    if (App.el.shareLink) App.el.shareLink.value = link;
    if (App.el.shareLinkBox) App.el.shareLinkBox.classList.remove('hidden');
    
    try {
      await createPC();
      await getMedia();
      await sendOffer();
      
      showScreen('waiting');
      startRing();
      
      toast(`Room "${roomId}" created!`, 'success', 5000);
    } catch (e) {
      toast('Failed to create room', 'error');
      showScreen('precall');
    }
    
    setLoading(App.el.createBtn, false);
  };

  const onRoomJoined = async data => {
    log('Joined room', 'success');
    
    const roomId = typeof data === 'string' ? data : (data.roomId || data);
    App.room = roomId;
    App.role = 'joiner';
    
    if (data.creatorName) {
      App.partnerName = data.creatorName;
      updatePartnerDisplay();
    }
    
    setLoading(App.el.joinBtn, false);
    toast('Joined! Connecting...', 'success');
    
    try {
      await createPC();
      await getMedia();
    } catch (e) {
      toast('Failed to setup', 'error');
      showScreen('precall');
    }
  };

  const onPartnerJoined = data => {
    log('Partner joined', 'success');
    
    App.partnerName = (typeof data === 'object' ? data.name : null) || 'Partner';
    updatePartnerDisplay();
    
    stopRing();
    toast(`${App.partnerName} joined!`, 'success');
    
    if (App.role === 'creator') {
      sendOffer().catch(e => log('Offer error: ' + e.message, 'error'));
    }
  };

  const endCall = () => {
    log('Ending call...', 'info');
    
    stopRing();
    const duration = stopTimer();
    stopQosMonitor();
    setSoundWavesActive(false);
    
    playTone('hangup');
    
    if (duration > 0) {
      saveHistory(App.partnerName, duration, App.role === 'creator' ? 'outgoing' : 'incoming');
    }
    
    if (App.pc) {
      App.pc.close();
      App.pc = null;
    }
    
    stopMedia();
    stopRecording(true);
    
    App.remoteStream = null;
    App.iceQueue = [];
    App.iceReady = false;
    App.room = null;
    App.role = null;
    App.partnerName = 'Partner';
    App.muted = false;
    App.speakerOff = false;
    App.unreadMsgs = 0;
    App.reconnectAttempts = 0;
    App.msgPanelOpen = false;
    
    if (App.el.msgPanel) App.el.msgPanel.classList.add('hidden');
    if (App.el.msgList) App.el.msgList.innerHTML = '';
    if (App.el.shareLinkBox) App.el.shareLinkBox.classList.add('hidden');
    if (App.el.timer) App.el.timer.textContent = '00:00';
    
    resetControls();
    showScreen('precall');
    setConnStatus('Ready', 'connected');
    enableButtons(true);
    
    toast('Call ended', 'info');
  };

  const resetControls = () => {
    App.el.muteBtn?.classList.remove('active');
    App.el.speakerBtn?.classList.remove('active');
    updateMsgBadge();
  };

  // ============================================
  // CONTROLS
  // ============================================
  const toggleMute = () => {
    if (!App.localStream) return;
    
    App.muted = !App.muted;
    App.localStream.getAudioTracks().forEach(t => t.enabled = !App.muted);
    
    App.el.muteBtn?.classList.toggle('active', App.muted);
    App.socket.emit('mute-status', App.muted);
    toast(App.muted ? 'Muted' : 'Unmuted', 'info');
  };

  const toggleSpeaker = () => {
    App.speakerOff = !App.speakerOff;
    
    if (App.el.remoteAudio) {
      App.el.remoteAudio.muted = App.speakerOff;
    }
    
    App.el.speakerBtn?.classList.toggle('active', App.speakerOff);
    toast(App.speakerOff ? 'Speaker off' : 'Speaker on', 'info');
  };

  const hangup = () => {
    App.socket.emit('hang-up');
    endCall();
  };

  // ============================================
  // MESSAGES
  // ============================================
  const toggleMsgPanel = () => {
    App.msgPanelOpen = !App.msgPanelOpen;
    App.el.msgPanel?.classList.toggle('hidden', !App.msgPanelOpen);
    
    if (App.msgPanelOpen) {
      App.unreadMsgs = 0;
      updateMsgBadge();
      App.el.msgInput?.focus();
    }
  };

  const sendMessage = () => {
    const text = App.el.msgInput?.value.trim();
    if (!text || !App.room) return;
    
    App.socket.emit('chat-message', { text });
    App.el.msgInput.value = '';
    App.socket.emit('typing', false);
  };

  const addMessage = data => {
    const list = App.el.msgList;
    if (!list) return;
    
    const mine = data.senderId === App.socket.id;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `message ${mine ? 'sent' : 'received'}`;
    
    // Check if voice note
    if (data.type === 'voice' && data.audioData) {
      const waves = Array(12).fill(0).map(() => `<span style="height:${4 + Math.random() * 16}px"></span>`).join('');
      div.innerHTML = `
        ${!mine ? `<div class="msg-sender">${escape(data.sender)}</div>` : ''}
        <div class="msg-bubble">
          <div class="voice-msg">
            <button class="voice-play-btn" data-audio="${data.audioData}">
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <div class="voice-wave">${waves}</div>
            <span class="voice-duration">${data.duration || '0:00'}</span>
          </div>
        </div>
        <div class="msg-time">${time}</div>
      `;
    } else {
      div.innerHTML = `
        ${!mine ? `<div class="msg-sender">${escape(data.sender)}</div>` : ''}
        <div class="msg-bubble">${escape(data.text)}</div>
        <div class="msg-time">${time}</div>
      `;
    }
    
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    
    // Add play functionality for voice notes
    const playBtn = div.querySelector('.voice-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => playVoiceNote(playBtn));
    }
  };

  const handleMessage = data => {
    addMessage(data);
    
    if (data.senderId !== App.socket.id) {
      playTone('message');
      
      if (!App.msgPanelOpen) {
        App.unreadMsgs++;
        updateMsgBadge();
      }
    }
  };

  // ============================================
  // VOICE NOTES
  // ============================================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      App.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      App.audioChunks = [];
      
      App.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
          App.audioChunks.push(e.data);
        }
      };
      
      App.mediaRecorder.start();
      App.recordStart = Date.now();
      
      // Update timer
      const updateRecordTimer = () => {
        if (!App.recordStart) return;
        const secs = Math.floor((Date.now() - App.recordStart) / 1000);
        if (App.el.recordTimer) App.el.recordTimer.textContent = formatTime(secs);
      };
      updateRecordTimer();
      App.recordInterval = setInterval(updateRecordTimer, 1000);
      
      // Show overlay
      App.el.voiceOverlay?.classList.remove('hidden');
      App.el.voiceRecordBtn?.classList.add('recording');
      
      log('Recording started', 'info');
      
    } catch (e) {
      log('Record error: ' + e.message, 'error');
      toast('Cannot access microphone', 'error');
    }
  };

  const stopRecording = (cancel = false) => {
    if (App.recordInterval) {
      clearInterval(App.recordInterval);
      App.recordInterval = null;
    }
    
    const duration = App.recordStart ? Math.floor((Date.now() - App.recordStart) / 1000) : 0;
    App.recordStart = null;
    
    App.el.voiceOverlay?.classList.add('hidden');
    App.el.voiceRecordBtn?.classList.remove('recording');
    
    if (App.mediaRecorder && App.mediaRecorder.state !== 'inactive') {
      App.mediaRecorder.onstop = async () => {
        if (!cancel && App.audioChunks.length > 0) {
          const blob = new Blob(App.audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          
          reader.onloadend = () => {
            const base64 = reader.result;
            
            App.socket.emit('chat-message', {
              type: 'voice',
              audioData: base64,
              duration: formatTime(duration)
            });
          };
          
          reader.readAsDataURL(blob);
        }
        
        // Stop all tracks
        App.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        App.mediaRecorder = null;
        App.audioChunks = [];
      };
      
      App.mediaRecorder.stop();
    }
    
    log(cancel ? 'Recording cancelled' : 'Recording stopped', 'info');
  };

  const playVoiceNote = (btn) => {
    const audioData = btn.dataset.audio;
    if (!audioData) return;
    
    const audio = new Audio(audioData);
    
    const icon = btn.querySelector('svg');
    const originalIcon = icon.innerHTML;
    
    audio.onplay = () => {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    };
    
    audio.onended = () => {
      icon.innerHTML = originalIcon;
    };
    
    audio.play();
  };

  // ============================================
  // SOCKET EVENTS
  // ============================================
  const setupSocket = () => {
    const s = App.socket;
    
    s.on('connect', () => {
      log('Connected to server', 'success');
      setConnStatus('Ready', 'connected');
      enableButtons(true);
      
      s.emit('set-app-type', 'voice');
      
      const name = localStorage.getItem('userName');
      if (name) {
        App.myName = name;
        if (App.el.userName) App.el.userName.value = name;
        s.emit('set-name', name);
      }
      
      const params = new URLSearchParams(location.search);
      const room = params.get('room');
      if (room && App.el.roomId) {
        App.el.roomId.value = room;
        toast('Room ID loaded', 'info');
      }
    });
    
    s.on('disconnect', () => {
      log('Disconnected', 'error');
      setConnStatus('Disconnected', 'error');
      enableButtons(false);
    });
    
    s.on('reconnect', () => {
      log('Reconnected', 'success');
      setConnStatus('Reconnected', 'connected');
      enableButtons(true);
    });
    
    s.on('error', data => {
      log('Server error: ' + data.message, 'error');
      toast(data.message, 'error', 5000);
      
      setLoading(App.el.createBtn, false);
      setLoading(App.el.joinBtn, false);
      stopRing();
      showScreen('precall');
    });
    
    s.on('room-created', onRoomCreated);
    s.on('room-joined', onRoomJoined);
    s.on('user-joined', onPartnerJoined);
    
    s.on('offer', handleOffer);
    s.on('answer', handleAnswer);
    s.on('ice-candidate', handleIce);
    
    s.on('chat-message', handleMessage);
    
    s.on('user-typing', data => {
      App.el.typingIndicator?.classList.toggle('hidden', !data.isTyping);
    });
    
    s.on('partner-muted', data => {
      toast(data.isMuted ? '🔇 Partner muted' : '🔊 Partner unmuted', 'info');
    });
    
    s.on('user-left', data => {
      toast(`${data.name || 'Partner'} left`, 'warning');
      endCall();
    });
    
    s.on('call-ended', () => {
      toast('Partner ended the call', 'info');
      endCall();
    });
  };

  // ============================================
  // UI EVENTS
  // ============================================
  const setupUI = () => {
    // Pre-call
    App.el.generateBtn?.addEventListener('click', () => {
      if (App.el.roomId) {
        App.el.roomId.value = randomRoom();
        toast('Room ID generated', 'success');
      }
    });
    
    App.el.copyRoomBtn?.addEventListener('click', () => {
      if (App.el.roomId?.value) copyText(App.el.roomId.value);
    });
    
    App.el.createBtn?.addEventListener('click', createRoom);
    App.el.joinBtn?.addEventListener('click', joinRoom);
    
    App.el.roomId?.addEventListener('keypress', e => {
      if (e.key === 'Enter') createRoom();
    });
    
    // Waiting
    App.el.cancelWaitBtn?.addEventListener('click', () => {
      App.socket.emit('hang-up');
      endCall();
    });
    
    App.el.waitingCopyBtn?.addEventListener('click', () => {
      if (App.el.waitingShareLink?.value) copyText(App.el.waitingShareLink.value);
    });
    
    App.el.copyLinkBtn?.addEventListener('click', () => {
      if (App.el.shareLink?.value) copyText(App.el.shareLink.value);
    });
    
    // Controls
    App.el.muteBtn?.addEventListener('click', toggleMute);
    App.el.speakerBtn?.addEventListener('click', toggleSpeaker);
    App.el.hangupBtn?.addEventListener('click', hangup);
    App.el.messageBtn?.addEventListener('click', toggleMsgPanel);
    App.el.voiceNoteBtn?.addEventListener('click', toggleMsgPanel);
    
    // Messages
    App.el.closeMsgBtn?.addEventListener('click', () => {
      App.msgPanelOpen = false;
      App.el.msgPanel?.classList.add('hidden');
    });
    
    App.el.sendMsgBtn?.addEventListener('click', sendMessage);
    
    App.el.msgInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage();
    });
    
    let typingTimer;
    App.el.msgInput?.addEventListener('input', () => {
      App.socket.emit('typing', true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => App.socket.emit('typing', false), 1000);
    });
    
    // Voice recording
    App.el.voiceRecordBtn?.addEventListener('click', () => {
      if (App.mediaRecorder && App.mediaRecorder.state === 'recording') {
        stopRecording(false);
      } else {
        startRecording();
      }
    });
    
    App.el.cancelRecordBtn?.addEventListener('click', () => stopRecording(true));
    App.el.sendRecordBtn?.addEventListener('click', () => stopRecording(false));
    
    // History
    App.el.historyBtn?.addEventListener('click', () => {
      loadHistory();
      App.el.historyModal?.classList.remove('hidden');
    });
    
    App.el.closeHistoryBtn?.addEventListener('click', () => {
      App.el.historyModal?.classList.add('hidden');
    });
    
    App.el.clearHistoryBtn?.addEventListener('click', clearHistory);
    
    // Modal overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        App.el.historyModal?.classList.add('hidden');
      });
    });
    
    // Theme
    App.el.themeBtn?.addEventListener('click', () => {
      const html = document.documentElement;
      const dark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', dark ? 'light' : 'dark');
      localStorage.setItem('theme', dark ? 'light' : 'dark');
    });
    
    // Before unload
    window.addEventListener('beforeunload', e => {
      if (App.room) {
        e.preventDefault();
        e.returnValue = 'Leave call?';
      }
    });
  };

  // ============================================
  // THEME
  // ============================================
  const loadTheme = () => {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  };

  // ============================================
  // WEBRTC CHECK
  // ============================================
  const checkSupport = () => {
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setConnStatus('WebRTC not supported', 'error');
      toast('Your browser does not support voice calls', 'error');
      enableButtons(false);
      return false;
    }
    return true;
  };

  // ============================================
  // INIT
  // ============================================
  const init = () => {
    log('HeartSpace Voice v5.5 starting...', 'info');
    
    cacheDOM();
    loadTheme();
    
    if (!checkSupport()) return;
    
    App.socket = io();
    
    setupSocket();
    setupUI();
    
    if (App.el.roomId && !App.el.roomId.value) {
      App.el.roomId.value = randomRoom();
    }
    
    const name = localStorage.getItem('userName');
    if (name && App.el.userName) {
      App.el.userName.value = name;
    }
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    
    log('Ready!', 'success');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();