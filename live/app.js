/**
 * HeartSpace Live v5.5
 * Real-Time Video Chat Application
 * 100% Free - No Paid Services Required
 * 
 * Features:
 * - HD Video/Audio calling
 * - Screen sharing
 * - In-call chat
 * - Camera flip
 * - Picture-in-Picture
 * - Fullscreen mode
 * - Call history
 * - Network quality monitoring
 * - Auto-reconnection
 * - Dark/Light theme
 */

(function() {
  'use strict';

  // ============================================
  // FREE ICE SERVERS CONFIGURATION
  // ============================================
  const ICE_SERVERS = [
    // === STUN SERVERS (Free, for NAT traversal) ===
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voipbuster.com:3478' },
    { urls: 'stun:stun.services.mozilla.com:3478' },
    
    // === TURN SERVERS (Free, for relay when direct fails) ===
    // OpenRelay by Metered (Free public TURN)
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
    // Additional free TURN servers
    {
      urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
      username: 'webrtc',
      credential: 'webrtc'
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
    },
    {
      urls: 'turn:relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92c62d5e24328ff6e',
      credential: 'kLsEr9bZT+I5VGcf'
    }
  ];

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: 'user'
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    },
    connection: {
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }
  };

  // ============================================
  // APP STATE
  // ============================================
  const App = {
    // Socket & WebRTC
    socket: null,
    pc: null,
    localStream: null,
    remoteStream: null,
    screenStream: null,
    
    // Room info
    room: null,
    role: null,
    myName: 'Anonymous',
    partnerName: 'Partner',
    
    // UI states
    muted: false,
    videoOff: false,
    screenSharing: false,
    frontCamera: true,
    fullscreen: false,
    pip: false,
    chatOpen: false,
    unreadMsgs: 0,
    
    // Timers
    callStart: null,
    timerInterval: null,
    ringInterval: null,
    qosInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 3,
    
    // ICE handling
    iceQueue: [],
    iceReady: false,
    
    // DOM cache
    el: {}
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  const $ = id => document.getElementById(id);
  
  const log = (msg, type = 'info') => {
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${icons[type]} [HeartSpace] ${msg}`);
  };

  const toast = (message, type = 'info', duration = 4000) => {
    const container = App.el.toastContainer;
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
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
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const randomRoomId = () => {
    const adj = ['happy', 'sunny', 'cozy', 'sweet', 'calm', 'warm', 'bright', 'cool'];
    const noun = ['heart', 'star', 'moon', 'cloud', 'dream', 'wave', 'light', 'sky'];
    return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${Math.floor(Math.random() * 1000)}`;
  };

  const shareLink = roomId => `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;

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
  // DOM CACHING
  // ============================================
  const cacheDOM = () => {
    App.el = {
      // Bars & Containers
      connectionBar: $('connectionBar'),
      connText: document.querySelector('.connection-text'),
      toastContainer: $('toastContainer'),
      
      // Screens
      preCall: $('preCallScreen'),
      waiting: $('waitingScreen'),
      inCall: $('inCallScreen'),
      
      // Inputs
      userName: $('userName'),
      roomId: $('roomId'),
      roomStatus: $('roomStatus'),
      
      // Pre-call buttons
      generateBtn: $('generateBtn'),
      copyRoomBtn: $('copyRoomBtn'),
      createBtn: $('createBtn'),
      joinBtn: $('joinBtn'),
      previewBtn: $('previewBtn'),
      
      // Waiting
      cancelWaitBtn: $('cancelWaitBtn'),
      waitingRoomId: $('waitingRoomId'),
      waitingShareLink: $('waitingShareLink'),
      waitingCopyBtn: $('waitingCopyBtn'),
      waitingPreview: $('waitingPreview'),
      
      // Share link
      shareLinkBox: $('shareLinkBox'),
      shareLink: $('shareLink'),
      copyLinkBtn: $('copyLinkBtn'),
      
      // Call info
      partnerName: $('callPartnerName'),
      statusText: $('callStatusText'),
      timer: $('callTimer'),
      netQuality: $('networkQuality'),
      
      // Videos
      localVideo: $('localVideo'),
      remoteVideo: $('remoteVideo'),
      localContainer: $('localVideoContainer'),
      remoteContainer: $('remoteVideoContainer'),
      
      // Controls
      muteBtn: $('muteBtn'),
      videoBtn: $('videoBtn'),
      screenBtn: $('screenShareBtn'),
      flipBtn: $('flipCameraBtn'),
      chatBtn: $('chatBtn'),
      fullscreenBtn: $('fullscreenBtn'),
      pipBtn: $('pipBtn'),
      settingsBtn: $('settingsBtn'),
      hangupBtn: $('hangupBtn'),
      chatBadge: $('chatBadge'),
      
      // Chat
      chatPanel: $('chatPanel'),
      chatMessages: $('chatMessages'),
      chatInput: $('chatInput'),
      sendMsgBtn: $('sendMsgBtn'),
      closeChatBtn: $('closeChatBtn'),
      typingIndicator: $('typingIndicator'),
      
      // Modals
      historyModal: $('historyModal'),
      historyList: $('historyList'),
      historyBtn: $('historyBtn'),
      closeHistoryBtn: $('closeHistoryBtn'),
      clearHistoryBtn: $('clearHistoryBtn'),
      
      settingsModal: $('settingsModal'),
      closeSettingsBtn: $('closeSettingsBtn'),
      cameraSelect: $('cameraSelect'),
      micSelect: $('micSelect'),
      speakerSelect: $('speakerSelect'),
      qualitySelect: $('videoQualitySelect'),
      
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
    el.className = `network-badge ${quality}`;
    const text = el.querySelector('.quality-text');
    if (text) text.textContent = quality.charAt(0).toUpperCase() + quality.slice(1);
  };

  const updateChatBadge = () => {
    const badge = App.el.chatBadge;
    if (!badge) return;
    if (App.unreadMsgs > 0) {
      badge.textContent = App.unreadMsgs > 9 ? '9+' : App.unreadMsgs;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
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
      
      const play = (freq, start, end) => {
        setTimeout(() => { osc.frequency.value = freq; }, start);
        if (end) setTimeout(() => { osc.stop(); ctx.close(); }, end);
      };
      
      osc.start();
      
      switch (type) {
        case 'ring': play(440, 0); play(550, 150); play(0, 0, 300); break;
        case 'connect': play(523, 0); play(659, 100); play(784, 200); play(0, 0, 300); break;
        case 'hangup': play(400, 0); play(300, 150); play(0, 0, 300); break;
        case 'message': gain.gain.value = 0.05; play(800, 0); play(0, 0, 100); break;
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
      const history = JSON.parse(localStorage.getItem('liveCallHistory') || '[]');
      history.unshift({ partner, duration, type, time: new Date().toISOString() });
      if (history.length > 50) history.pop();
      localStorage.setItem('liveCallHistory', JSON.stringify(history));
    } catch (e) {}
  };

  const loadHistory = () => {
    const list = App.el.historyList;
    if (!list) return;
    
    try {
      const history = JSON.parse(localStorage.getItem('liveCallHistory') || '[]');
      
      if (!history.length) {
        list.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📹</span>
            <p>No video calls yet</p>
            <span class="empty-hint">Your call history will appear here</span>
          </div>`;
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
    } catch (e) {
      list.innerHTML = '<div class="empty-state">Error loading</div>';
    }
  };

  const clearHistory = () => {
    localStorage.removeItem('liveCallHistory');
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
        let lost = 0, received = 0, fps = 0, rtt = 0;
        
        stats.forEach(r => {
          if (r.type === 'inbound-rtp') {
            lost += r.packetsLost || 0;
            received += r.packetsReceived || 0;
            if (r.kind === 'video') fps = r.framesPerSecond || 0;
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            rtt = r.currentRoundTripTime || 0;
          }
        });
        
        const total = lost + received;
        if (!total) return;
        
        const lossRate = lost / total;
        let quality = 'excellent';
        
        if (lossRate > 0.1 || fps < 10 || rtt > 0.5) quality = 'poor';
        else if (lossRate > 0.05 || fps < 20 || rtt > 0.3) quality = 'fair';
        else if (lossRate > 0.02 || fps < 25 || rtt > 0.15) quality = 'good';
        
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
  // DEVICE MANAGEMENT
  // ============================================
  const listDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const videos = devices.filter(d => d.kind === 'videoinput');
      const audios = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      
      if (App.el.cameraSelect) {
        App.el.cameraSelect.innerHTML = videos.map((d, i) => 
          `<option value="${d.deviceId}">${d.label || `Camera ${i+1}`}</option>`).join('');
      }
      
      if (App.el.micSelect) {
        App.el.micSelect.innerHTML = audios.map((d, i) => 
          `<option value="${d.deviceId}">${d.label || `Mic ${i+1}`}</option>`).join('');
      }
      
      if (App.el.speakerSelect) {
        App.el.speakerSelect.innerHTML = speakers.map((d, i) => 
          `<option value="${d.deviceId}">${d.label || `Speaker ${i+1}`}</option>`).join('');
      }
    } catch (e) {
      log('Device list error: ' + e.message, 'error');
    }
  };

  // ============================================
  // MEDIA STREAMS
  // ============================================
  const getMedia = async (video = true) => {
    log('Getting media...', 'info');
    
    try {
      App.localStream = await navigator.mediaDevices.getUserMedia({
        audio: CONFIG.audio,
        video: video ? CONFIG.video : false
      });
      
      // Display locally
      if (App.el.localVideo) {
        App.el.localVideo.srcObject = App.localStream;
        App.el.localVideo.muted = true;
      }
      
      if (App.el.waitingPreview) {
        App.el.waitingPreview.srcObject = App.localStream;
        App.el.waitingPreview.muted = true;
      }
      
      // Add to peer connection
      if (App.pc) {
        App.localStream.getTracks().forEach(track => {
          App.pc.addTrack(track, App.localStream);
        });
      }
      
      if (App.el.localContainer) {
        App.el.localContainer.classList.add('active');
      }
      
      log('Media ready', 'success');
      await listDevices();
      
    } catch (e) {
      log('Media error: ' + e.message, 'error');
      
      if (e.name === 'NotAllowedError') {
        toast('Please allow camera/mic access', 'error');
      } else if (e.name === 'NotFoundError') {
        toast('Camera/mic not found', 'error');
      } else {
        toast('Cannot access media devices', 'error');
      }
      throw e;
    }
  };

  const stopMedia = () => {
    if (App.localStream) {
      App.localStream.getTracks().forEach(t => t.stop());
      App.localStream = null;
    }
    if (App.el.localVideo) App.el.localVideo.srcObject = null;
    if (App.el.waitingPreview) App.el.waitingPreview.srcObject = null;
  };

  // ============================================
  // WEBRTC PEER CONNECTION
  // ============================================
  const createPeerConnection = async () => {
    log('Creating peer connection...', 'info');
    
    // Reset
    App.iceQueue = [];
    App.iceReady = false;
    
    if (App.pc) {
      App.pc.close();
      App.pc = null;
    }
    
    // Create new connection
    App.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      ...CONFIG.connection
    });
    
    App.remoteStream = new MediaStream();
    if (App.el.remoteVideo) {
      App.el.remoteVideo.srcObject = App.remoteStream;
    }
    
    // ICE candidate
    App.pc.onicecandidate = e => {
      if (e.candidate) {
        log(`ICE: ${e.candidate.type || 'unknown'} ${e.candidate.protocol || ''}`, 'info');
        App.socket.emit('ice-candidate', { candidate: e.candidate });
      }
    };
    
    // ICE gathering state
    App.pc.onicegatheringstatechange = () => {
      log(`ICE gathering: ${App.pc?.iceGatheringState}`, 'info');
    };
    
    // ICE connection state
    App.pc.oniceconnectionstatechange = () => {
      const state = App.pc?.iceConnectionState;
      log(`ICE connection: ${state}`, 'info');
      
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
    
    // Connection state
    App.pc.onconnectionstatechange = () => {
      log(`Connection: ${App.pc?.connectionState}`, 'info');
    };
    
    // Remote track
    App.pc.ontrack = e => {
      log(`Remote track: ${e.track.kind}`, 'success');
      e.streams[0].getTracks().forEach(t => App.remoteStream.addTrack(t));
      
      if (App.el.remoteVideo) {
        App.el.remoteVideo.srcObject = App.remoteStream;
      }
      if (App.el.remoteContainer) {
        App.el.remoteContainer.classList.add('active');
      }
    };
    
    // Renegotiation
    App.pc.onnegotiationneeded = async () => {
      log('Negotiation needed', 'info');
      if (App.role === 'creator' && App.pc?.signalingState === 'stable') {
        try {
          await sendOffer();
        } catch (e) {
          log('Renegotiation error: ' + e.message, 'error');
        }
      }
    };
    
    log('Peer connection created', 'success');
  };

  // ============================================
  // SIGNALING
  // ============================================
  const sendOffer = async () => {
    log('Creating offer...', 'info');
    
    try {
      const offer = await App.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await App.pc.setLocalDescription(offer);
      
      App.socket.emit('offer', {
        offer,
        fromName: App.myName
      });
      
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
        if (App.el.partnerName) App.el.partnerName.textContent = App.partnerName;
      }
      
      if (!App.pc) await createPeerConnection();
      if (!App.localStream) await getMedia();
      
      await App.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      App.iceReady = true;
      log('Remote description set', 'success');
      
      // Process queued ICE
      await processIceQueue();
      
      // Create answer
      const answer = await App.pc.createAnswer();
      await App.pc.setLocalDescription(answer);
      
      App.socket.emit('answer', {
        answer,
        targetId: data.from,
        fromName: App.myName
      });
      
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
        if (App.el.partnerName) App.el.partnerName.textContent = App.partnerName;
      }
      
      await App.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      App.iceReady = true;
      log('Remote description set', 'success');
      
      await processIceQueue();
      
    } catch (e) {
      log('Handle answer error: ' + e.message, 'error');
    }
  };

  const handleIce = async data => {
    try {
      if (!data.candidate) return;
      
      if (!App.pc || !App.iceReady) {
        log('Queueing ICE candidate', 'info');
        App.iceQueue.push(data.candidate);
        return;
      }
      
      await App.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      log('ICE candidate added', 'success');
      
    } catch (e) {
      log('ICE error: ' + e.message, 'error');
    }
  };

  const processIceQueue = async () => {
    if (!App.pc || !App.iceReady || !App.iceQueue.length) return;
    
    log(`Processing ${App.iceQueue.length} queued ICE candidates`, 'info');
    
    for (const candidate of App.iceQueue) {
      try {
        await App.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        log('Queued ICE error: ' + e.message, 'error');
      }
    }
    
    App.iceQueue = [];
  };

  // ============================================
  // CONNECTION STATE HANDLERS
  // ============================================
  const onConnected = () => {
    if (App.callStart) return; // Already connected
    
    log('Call connected!', 'success');
    
    playTone('connect');
    stopRing();
    
    setConnStatus('In Call', 'connected');
    if (App.el.statusText) App.el.statusText.textContent = 'Connected';
    
    startTimer();
    startQosMonitor();
    
    showScreen('incall');
    toast('Connected! 🎉', 'success');
    
    App.reconnectAttempts = 0;
  };

  const onDisconnected = () => {
    log('Disconnected, attempting reconnect...', 'warn');
    if (App.el.statusText) App.el.statusText.textContent = 'Reconnecting...';
    toast('Connection unstable...', 'warning');
  };

  const onFailed = async () => {
    log('Connection failed', 'error');
    
    App.reconnectAttempts++;
    
    if (App.reconnectAttempts <= App.maxReconnectAttempts && App.role === 'creator') {
      log(`ICE restart attempt ${App.reconnectAttempts}...`, 'warn');
      toast('Reconnecting...', 'warning');
      
      try {
        const offer = await App.pc.createOffer({ iceRestart: true });
        await App.pc.setLocalDescription(offer);
        App.socket.emit('offer', { offer });
      } catch (e) {
        log('ICE restart failed: ' + e.message, 'error');
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
  const previewCamera = async () => {
    try {
      setLoading(App.el.previewBtn, true);
      await getMedia();
      toast('Camera preview active', 'success');
    } catch (e) {
      toast('Camera access failed', 'error');
    } finally {
      setLoading(App.el.previewBtn, false);
    }
  };

  const createRoom = async () => {
    const roomId = App.el.roomId?.value.trim();
    const userName = App.el.userName?.value.trim() || 'Anonymous';
    
    if (!roomId) {
      toast('Enter a Room ID', 'warning');
      App.el.roomId?.focus();
      return;
    }
    
    if (roomId.length < 3) {
      toast('Room ID too short (min 3 chars)', 'warning');
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
    const link = typeof data === 'object' && data.shareLink ? data.shareLink : shareLink(roomId);
    
    App.room = roomId;
    App.role = 'creator';
    
    if (App.el.waitingRoomId) App.el.waitingRoomId.textContent = roomId;
    if (App.el.waitingShareLink) App.el.waitingShareLink.value = link;
    if (App.el.shareLink) App.el.shareLink.value = link;
    if (App.el.shareLinkBox) App.el.shareLinkBox.classList.remove('hidden');
    
    try {
      await createPeerConnection();
      await getMedia();
      await sendOffer();
      
      showScreen('waiting');
      startRing();
      
      toast(`Room "${roomId}" created! Share the link`, 'success', 5000);
    } catch (e) {
      log('Create room error: ' + e.message, 'error');
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
      if (App.el.partnerName) App.el.partnerName.textContent = App.partnerName;
    }
    
    setLoading(App.el.joinBtn, false);
    toast('Joined! Connecting...', 'success');
    
    try {
      await createPeerConnection();
      await getMedia();
      log('Ready for offer', 'info');
    } catch (e) {
      log('Join setup error: ' + e.message, 'error');
      toast('Failed to setup', 'error');
      showScreen('precall');
    }
  };

  const onPartnerJoined = data => {
    log('Partner joined', 'success');
    
    App.partnerName = (typeof data === 'object' ? data.name : null) || 'Partner';
    if (App.el.partnerName) App.el.partnerName.textContent = App.partnerName;
    
    stopRing();
    toast(`${App.partnerName} joined!`, 'success');
    
    // Resend offer for joiner
    if (App.role === 'creator') {
      log('Sending new offer...', 'info');
      sendOffer().catch(e => log('Offer error: ' + e.message, 'error'));
    }
  };

  const endCall = () => {
    log('Ending call...', 'info');
    
    stopRing();
    const duration = stopTimer();
    stopQosMonitor();
    
    playTone('hangup');
    
    // Save history
    if (duration > 0) {
      saveHistory(App.partnerName, duration, App.role === 'creator' ? 'outgoing' : 'incoming');
    }
    
    // Stop screen share
    if (App.screenStream) {
      App.screenStream.getTracks().forEach(t => t.stop());
      App.screenStream = null;
    }
    
    // Close peer connection
    if (App.pc) {
      App.pc.close();
      App.pc = null;
    }
    
    // Stop media
    stopMedia();
    
    // Reset state
    App.remoteStream = null;
    App.iceQueue = [];
    App.iceReady = false;
    App.room = null;
    App.role = null;
    App.partnerName = 'Partner';
    App.muted = false;
    App.videoOff = false;
    App.screenSharing = false;
    App.unreadMsgs = 0;
    App.reconnectAttempts = 0;
    
    // Exit PiP/Fullscreen
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    
    // Reset UI
    if (App.el.remoteVideo) App.el.remoteVideo.srcObject = null;
    if (App.el.chatPanel) App.el.chatPanel.classList.add('hidden');
    if (App.el.chatMessages) App.el.chatMessages.innerHTML = '';
    if (App.el.shareLinkBox) App.el.shareLinkBox.classList.add('hidden');
    if (App.el.timer) App.el.timer.textContent = '00:00';
    
    resetControls();
    showScreen('precall');
    setConnStatus('Ready', 'connected');
    enableButtons(true);
    
    toast('Call ended', 'info');
  };

  const resetControls = () => {
    // Mute
    if (App.el.muteBtn) {
      App.el.muteBtn.classList.remove('active');
    }
    
    // Video
    if (App.el.videoBtn) {
      App.el.videoBtn.classList.remove('active');
    }
    
    // Screen
    if (App.el.screenBtn) {
      App.el.screenBtn.classList.remove('active');
    }
    
    // Badge
    updateChatBadge();
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

  const toggleVideo = () => {
    if (!App.localStream) return;
    
    App.videoOff = !App.videoOff;
    App.localStream.getVideoTracks().forEach(t => t.enabled = !App.videoOff);
    
    App.el.videoBtn?.classList.toggle('active', App.videoOff);
    App.el.localContainer?.classList.toggle('video-off', App.videoOff);
    
    App.socket.emit('video-status', App.videoOff);
    toast(App.videoOff ? 'Camera off' : 'Camera on', 'info');
  };

  const flipCamera = async () => {
    if (!App.localStream) return;
    
    App.frontCamera = !App.frontCamera;
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { ...CONFIG.video, facingMode: App.frontCamera ? 'user' : 'environment' },
        audio: false
      });
      
      const newTrack = newStream.getVideoTracks()[0];
      const oldTrack = App.localStream.getVideoTracks()[0];
      
      // Replace in peer connection
      if (App.pc) {
        const sender = App.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      
      // Replace in stream
      App.localStream.removeTrack(oldTrack);
      App.localStream.addTrack(newTrack);
      oldTrack.stop();
      
      if (App.el.localVideo) App.el.localVideo.srcObject = App.localStream;
      
      toast(App.frontCamera ? 'Front camera' : 'Back camera', 'info');
    } catch (e) {
      log('Flip camera error: ' + e.message, 'error');
      toast('Could not switch camera', 'error');
      App.frontCamera = !App.frontCamera;
    }
  };

  const toggleScreen = async () => {
    if (App.screenSharing) {
      // Stop sharing
      if (App.screenStream) {
        App.screenStream.getTracks().forEach(t => t.stop());
        App.screenStream = null;
      }
      
      // Restore camera
      if (App.localStream && App.pc) {
        const camTrack = App.localStream.getVideoTracks()[0];
        if (camTrack) {
          const sender = App.pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(camTrack);
        }
        if (App.el.localVideo) App.el.localVideo.srcObject = App.localStream;
      }
      
      App.screenSharing = false;
      App.el.screenBtn?.classList.remove('active');
      App.socket.emit('screen-share-status', false);
      toast('Screen share stopped', 'info');
      
    } else {
      // Start sharing
      try {
        App.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true
        });
        
        const screenTrack = App.screenStream.getVideoTracks()[0];
        
        if (App.pc) {
          const sender = App.pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(screenTrack);
        }
        
        if (App.el.localVideo) App.el.localVideo.srcObject = App.screenStream;
        
        // Handle stop from browser UI
        screenTrack.onended = () => toggleScreen();
        
        App.screenSharing = true;
        App.el.screenBtn?.classList.add('active');
        App.socket.emit('screen-share-status', true);
        toast('Screen sharing', 'success');
        
      } catch (e) {
        if (e.name !== 'AbortError') {
          log('Screen share error: ' + e.message, 'error');
          toast('Screen share failed', 'error');
        }
      }
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        App.fullscreen = false;
      } else {
        await App.el.inCall?.requestFullscreen();
        App.fullscreen = true;
      }
      App.el.fullscreenBtn?.classList.toggle('active', App.fullscreen);
    } catch (e) {
      log('Fullscreen error: ' + e.message, 'error');
    }
  };

  const togglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        App.pip = false;
      } else if (App.el.remoteVideo) {
        await App.el.remoteVideo.requestPictureInPicture();
        App.pip = true;
      }
      App.el.pipBtn?.classList.toggle('active', App.pip);
    } catch (e) {
      log('PiP error: ' + e.message, 'error');
      toast('PiP not supported', 'warning');
    }
  };

  const toggleChat = () => {
    App.chatOpen = !App.chatOpen;
    App.el.chatPanel?.classList.toggle('hidden', !App.chatOpen);
    
    if (App.chatOpen) {
      App.unreadMsgs = 0;
      updateChatBadge();
      App.el.chatInput?.focus();
    }
  };

  const hangup = () => {
    App.socket.emit('hang-up');
    endCall();
  };

  // ============================================
  // CHAT
  // ============================================
  const sendMessage = () => {
    const input = App.el.chatInput;
    const text = input?.value.trim();
    
    if (!text || !App.room) return;
    
    App.socket.emit('chat-message', { text });
    input.value = '';
    App.socket.emit('typing', false);
  };

  const addMessage = data => {
    const container = App.el.chatMessages;
    if (!container) return;
    
    const mine = data.senderId === App.socket.id;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `chat-message ${mine ? 'sent' : 'received'}`;
    div.innerHTML = `
      ${!mine ? `<div class="chat-sender">${escape(data.sender)}</div>` : ''}
      <div class="chat-bubble">${escape(data.text)}</div>
      <div class="chat-time">${time}</div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  };

  const handleMessage = data => {
    addMessage(data);
    
    if (data.senderId !== App.socket.id) {
      playTone('message');
      
      if (!App.chatOpen) {
        App.unreadMsgs++;
        updateChatBadge();
      }
    }
  };

  // ============================================
  // SETTINGS
  // ============================================
  const openSettings = () => {
    App.el.settingsModal?.classList.remove('hidden');
    listDevices();
  };

  const closeSettings = () => {
    App.el.settingsModal?.classList.add('hidden');
  };

  const changeCamera = async deviceId => {
    if (!App.localStream || !deviceId) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false
      });
      
      const newTrack = stream.getVideoTracks()[0];
      const oldTrack = App.localStream.getVideoTracks()[0];
      
      if (App.pc) {
        const sender = App.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      
      App.localStream.removeTrack(oldTrack);
      App.localStream.addTrack(newTrack);
      oldTrack.stop();
      
      if (App.el.localVideo) App.el.localVideo.srcObject = App.localStream;
      toast('Camera changed', 'success');
    } catch (e) {
      toast('Failed to change camera', 'error');
    }
  };

  const changeMic = async deviceId => {
    if (!App.localStream || !deviceId) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      });
      
      const newTrack = stream.getAudioTracks()[0];
      const oldTrack = App.localStream.getAudioTracks()[0];
      
      if (App.pc) {
        const sender = App.pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(newTrack);
      }
      
      App.localStream.removeTrack(oldTrack);
      App.localStream.addTrack(newTrack);
      oldTrack.stop();
      
      newTrack.enabled = !App.muted;
      toast('Microphone changed', 'success');
    } catch (e) {
      toast('Failed to change mic', 'error');
    }
  };

  const changeSpeaker = async deviceId => {
    if (!App.el.remoteVideo || !deviceId) return;
    
    try {
      if (App.el.remoteVideo.setSinkId) {
        await App.el.remoteVideo.setSinkId(deviceId);
        toast('Speaker changed', 'success');
      } else {
        toast('Not supported', 'warning');
      }
    } catch (e) {
      toast('Failed to change speaker', 'error');
    }
  };

  // ============================================
  // LOCAL VIDEO DRAG
  // ============================================
  const setupDrag = () => {
    const el = App.el.localContainer;
    if (!el) return;
    
    let dragging = false;
    let startX, startY, startLeft, startTop;
    
    const onStart = e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      el.style.transition = 'none';
      
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
    };
    
    const onMove = e => {
      if (!dragging) return;
      e.preventDefault();
      
      let x, y;
      if (e.type === 'touchmove') {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else {
        x = e.clientX;
        y = e.clientY;
      }
      
      const dx = x - startX;
      const dy = y - startY;
      
      const newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth - el.offsetWidth));
      const newTop = Math.max(0, Math.min(startTop + dy, window.innerHeight - el.offsetHeight));
      
      el.style.position = 'fixed';
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    
    const onEnd = () => {
      dragging = false;
      el.style.transition = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    };
    
    el.addEventListener('mousedown', onStart);
    el.addEventListener('touchstart', onStart, { passive: false });
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
      
      s.emit('set-app-type', 'video');
      
      const name = localStorage.getItem('userName');
      if (name) {
        App.myName = name;
        if (App.el.userName) App.el.userName.value = name;
        s.emit('set-name', name);
      }
      
      // Auto-fill room from URL
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
    
    // Room events
    s.on('room-created', onRoomCreated);
    s.on('room-joined', onRoomJoined);
    s.on('user-joined', onPartnerJoined);
    
    // Signaling
    s.on('offer', handleOffer);
    s.on('answer', handleAnswer);
    s.on('ice-candidate', handleIce);
    
    // Chat
    s.on('chat-message', handleMessage);
    
    s.on('user-typing', data => {
      App.el.typingIndicator?.classList.toggle('hidden', !data.isTyping);
    });
    
    // Status
    s.on('partner-muted', data => {
      toast(data.isMuted ? '🔇 Partner muted' : '🔊 Partner unmuted', 'info');
    });
    
    s.on('partner-video', data => {
      toast(data.isOff ? '📷 Partner camera off' : '📹 Partner camera on', 'info');
      App.el.remoteContainer?.classList.toggle('video-off', data.isOff);
    });
    
    s.on('partner-screen-share', data => {
      toast(data.isSharing ? '🖥️ Partner sharing screen' : '📹 Partner stopped sharing', 'info');
    });
    
    // Call end
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
        App.el.roomId.value = randomRoomId();
        toast('Room ID generated', 'success');
      }
    });
    
    App.el.copyRoomBtn?.addEventListener('click', () => {
      if (App.el.roomId?.value) copyText(App.el.roomId.value);
    });
    
    App.el.createBtn?.addEventListener('click', createRoom);
    App.el.joinBtn?.addEventListener('click', joinRoom);
    App.el.previewBtn?.addEventListener('click', previewCamera);
    
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
    App.el.videoBtn?.addEventListener('click', toggleVideo);
    App.el.screenBtn?.addEventListener('click', toggleScreen);
    App.el.flipBtn?.addEventListener('click', flipCamera);
    App.el.chatBtn?.addEventListener('click', toggleChat);
    App.el.fullscreenBtn?.addEventListener('click', toggleFullscreen);
    App.el.pipBtn?.addEventListener('click', togglePip);
    App.el.settingsBtn?.addEventListener('click', openSettings);
    App.el.hangupBtn?.addEventListener('click', hangup);
    
    // Chat
    App.el.closeChatBtn?.addEventListener('click', () => {
      App.chatOpen = false;
      App.el.chatPanel?.classList.add('hidden');
    });
    
    App.el.sendMsgBtn?.addEventListener('click', sendMessage);
    
    App.el.chatInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage();
    });
    
    let typingTimer;
    App.el.chatInput?.addEventListener('input', () => {
      App.socket.emit('typing', true);
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => App.socket.emit('typing', false), 1000);
    });
    
    // History
    App.el.historyBtn?.addEventListener('click', () => {
      loadHistory();
      App.el.historyModal?.classList.remove('hidden');
    });
    
    App.el.closeHistoryBtn?.addEventListener('click', () => {
      App.el.historyModal?.classList.add('hidden');
    });
    
    App.el.clearHistoryBtn?.addEventListener('click', clearHistory);
    
    // Settings
    App.el.closeSettingsBtn?.addEventListener('click', closeSettings);
    
    App.el.cameraSelect?.addEventListener('change', e => changeCamera(e.target.value));
    App.el.micSelect?.addEventListener('change', e => changeMic(e.target.value));
    App.el.speakerSelect?.addEventListener('change', e => changeSpeaker(e.target.value));
    
    // Modal overlays
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', () => {
        App.el.historyModal?.classList.add('hidden');
        App.el.settingsModal?.classList.add('hidden');
      });
    });
    
    // Theme
    App.el.themeBtn?.addEventListener('click', () => {
      const html = document.documentElement;
      const dark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', dark ? 'light' : 'dark');
      localStorage.setItem('theme', dark ? 'light' : 'dark');
    });
    
    // Double-click remote video for fullscreen
    App.el.remoteVideo?.addEventListener('dblclick', toggleFullscreen);
    
    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      App.fullscreen = !!document.fullscreenElement;
      App.el.fullscreenBtn?.classList.toggle('active', App.fullscreen);
    });
    
    // PiP change
    App.el.remoteVideo?.addEventListener('leavepictureinpicture', () => {
      App.pip = false;
      App.el.pipBtn?.classList.remove('active');
    });
    
    // Before unload warning
    window.addEventListener('beforeunload', e => {
      if (App.room) {
        e.preventDefault();
        e.returnValue = 'Leave call?';
      }
    });
    
    // Setup drag
    setupDrag();
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
      toast('Your browser does not support video calls', 'error');
      enableButtons(false);
      return false;
    }
    return true;
  };

  // ============================================
  // INIT
  // ============================================
  const init = async () => {
    log('HeartSpace Live v5.5 starting...', 'info');
    
    cacheDOM();
    loadTheme();
    
    if (!checkSupport()) return;
    
    // Connect socket
    App.socket = io();
    
    setupSocket();
    setupUI();
    
    // Generate room ID
    if (App.el.roomId && !App.el.roomId.value) {
      App.el.roomId.value = randomRoomId();
    }
    
    // Restore name
    const name = localStorage.getItem('userName');
    if (name && App.el.userName) {
      App.el.userName.value = name;
    }
    
    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    
    log('Ready!', 'success');
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();