/**
 * HeartSpace Calls v5.0
 * Complete Rewrite - Clean & Bug-Free
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    iceServers: [
      // STUN servers (free, works for ~70% of connections)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      // TURN servers (free fallback for NAT/firewall - from OpenRelay Project)
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100
    }
  };

  // ============================================
  // APPLICATION STATE
  // ============================================
  const App = {
    socket: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    
    currentRoom: null,
    currentRole: null, // 'creator' or 'joiner'
    partnerName: 'Partner',
    myName: 'Anonymous',
    
    isMuted: false,
    callStartTime: null,
    timerInterval: null,
    ringtoneInterval: null,
    qosInterval: null,
    unreadMessages: 0,
    
    // DOM Elements cache
    elements: {}
  };

  // ============================================
  // DOM HELPERS
  // ============================================
  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    App.elements = {
      // Connection
      connectionBar: $('connectionBar'),
      connectionText: document.querySelector('.connection-text'),
      
      // Screens
      preCallScreen: $('preCallScreen'),
      waitingScreen: $('waitingScreen'),
      inCallScreen: $('inCallScreen'),
      
      // Inputs
      userName: $('userName'),
      roomId: $('roomId'),
      roomStatus: $('roomStatus'),
      
      // Buttons
      generateBtn: $('generateBtn'),
      copyRoomBtn: $('copyRoomBtn'),
      createBtn: $('createBtn'),
      joinBtn: $('joinBtn'),
      cancelWaitBtn: $('cancelWaitBtn'),
      muteBtn: $('muteBtn'),
      speakerBtn: $('speakerBtn'),
      chatBtn: $('chatBtn'),
      hangupBtn: $('hangupBtn'),
      
      // Waiting screen
      waitingRoomId: $('waitingRoomId'),
      waitingShareLink: $('waitingShareLink'),
      waitingCopyBtn: $('waitingCopyBtn'),
      
      // Share
      shareLinkBox: $('shareLinkBox'),
      shareLink: $('shareLink'),
      copyLinkBtn: $('copyLinkBtn'),
      
      // Call screen
      callPartnerName: $('callPartnerName'),
      callStatusText: $('callStatusText'),
      callTimer: $('callTimer'),
      localAudio: $('localAudio'),
      remoteAudio: $('remoteAudio'),
      localBars: $('localBars'),
      remoteBars: $('remoteBars'),
      networkQuality: $('networkQuality'),
      volumeSlider: $('volumeSlider'),
      chatBadge: $('chatBadge'),
      
      // Chat
      chatPanel: $('chatPanel'),
      chatMessages: $('chatMessages'),
      chatInput: $('chatInput'),
      sendMsgBtn: $('sendMsgBtn'),
      closeChatBtn: $('closeChatBtn'),
      typingIndicator: $('typingIndicator'),
      
      // History
      historyBtn: $('historyBtn'),
      historyModal: $('historyModal'),
      closeHistoryBtn: $('closeHistoryBtn'),
      historyList: $('historyList'),
      clearHistoryBtn: $('clearHistoryBtn'),
      
      // Theme
      themeBtn: $('themeBtn'),
      
      // Toast
      toastContainer: $('toastContainer')
    };
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  function log(message, type = 'info') {
    const prefix = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${prefix[type] || 'ℹ️'} ${message}`);
  }

  function showToast(message, type = 'info', duration = 4000) {
    const container = App.elements.toastContainer;
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function setConnectionStatus(text, type = 'info') {
    const el = App.elements;
    if (el.connectionText) {
      el.connectionText.textContent = text;
    }
    if (el.connectionBar) {
      el.connectionBar.className = 'connection-bar';
      if (type === 'connected') el.connectionBar.classList.add('connected');
      if (type === 'error') el.connectionBar.classList.add('error');
    }
  }

  function showScreen(screenName) {
    const el = App.elements;
    
    // Hide all screens
    if (el.preCallScreen) el.preCallScreen.classList.add('hidden');
    if (el.waitingScreen) el.waitingScreen.classList.add('hidden');
    if (el.inCallScreen) el.inCallScreen.classList.add('hidden');
    
    // Show requested screen
    switch (screenName) {
      case 'precall':
        if (el.preCallScreen) el.preCallScreen.classList.remove('hidden');
        break;
      case 'waiting':
        if (el.waitingScreen) el.waitingScreen.classList.remove('hidden');
        break;
      case 'incall':
        if (el.inCallScreen) el.inCallScreen.classList.remove('hidden');
        break;
    }
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    button.classList.toggle('loading', isLoading);
    button.disabled = isLoading;
  }

  function enableMainButtons(enabled) {
    const el = App.elements;
    if (el.createBtn) el.createBtn.disabled = !enabled;
    if (el.joinBtn) el.joinBtn.disabled = !enabled;
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function generateRandomRoomId() {
    const adjectives = ['happy', 'sunny', 'cozy', 'sweet', 'calm', 'warm', 'bright', 'soft'];
    const nouns = ['heart', 'star', 'moon', 'cloud', 'dream', 'wave', 'light', 'bird'];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    
    return `${adj}-${noun}-${num}`;
  }

  function getShareableLink(roomId) {
    const baseUrl = window.location.origin;
    return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // SOUND EFFECTS
  // ============================================
  function playSound(type) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      gainNode.gain.value = 0.1;
      
      switch (type) {
        case 'ringtone':
          oscillator.frequency.value = 440;
          oscillator.start();
          setTimeout(() => { oscillator.frequency.value = 550; }, 150);
          setTimeout(() => { oscillator.stop(); ctx.close(); }, 300);
          break;
          
        case 'connected':
          oscillator.frequency.value = 523;
          oscillator.start();
          setTimeout(() => { oscillator.frequency.value = 659; }, 100);
          setTimeout(() => { oscillator.frequency.value = 784; }, 200);
          setTimeout(() => { oscillator.stop(); ctx.close(); }, 300);
          break;
          
        case 'hangup':
          oscillator.frequency.value = 400;
          oscillator.start();
          setTimeout(() => { oscillator.frequency.value = 300; }, 150);
          setTimeout(() => { oscillator.stop(); ctx.close(); }, 300);
          break;
          
        case 'message':
          oscillator.frequency.value = 800;
          gainNode.gain.value = 0.05;
          oscillator.start();
          setTimeout(() => { oscillator.stop(); ctx.close(); }, 100);
          break;
      }
    } catch (e) {
      // Ignore audio errors
    }
  }

  function startRingtone() {
    stopRingtone();
    playSound('ringtone');
    App.ringtoneInterval = setInterval(() => playSound('ringtone'), 2000);
  }

  function stopRingtone() {
    if (App.ringtoneInterval) {
      clearInterval(App.ringtoneInterval);
      App.ringtoneInterval = null;
    }
  }

  // ============================================
  // CALL TIMER
  // ============================================
  function startCallTimer() {
    App.callStartTime = Date.now();
    
    const updateTimer = () => {
      if (!App.callStartTime) return;
      const elapsed = Math.floor((Date.now() - App.callStartTime) / 1000);
      if (App.elements.callTimer) {
        App.elements.callTimer.textContent = formatDuration(elapsed);
      }
    };
    
    updateTimer();
    App.timerInterval = setInterval(updateTimer, 1000);
  }

  function stopCallTimer() {
    if (App.timerInterval) {
      clearInterval(App.timerInterval);
      App.timerInterval = null;
    }
    
    const duration = App.callStartTime 
      ? Math.floor((Date.now() - App.callStartTime) / 1000) 
      : 0;
    
    App.callStartTime = null;
    return duration;
  }

  // ============================================
  // CALL HISTORY
  // ============================================
  function saveCallToHistory(partnerName, duration, type) {
    try {
      const history = JSON.parse(localStorage.getItem('callHistory') || '[]');
      
      history.unshift({
        partner: partnerName || 'Unknown',
        duration: duration,
        type: type, // 'outgoing' or 'incoming'
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 50 calls
      while (history.length > 50) {
        history.pop();
      }
      
      localStorage.setItem('callHistory', JSON.stringify(history));
    } catch (e) {
      log('Failed to save history', 'error');
    }
  }

  function loadCallHistory() {
    const historyList = App.elements.historyList;
    if (!historyList) return;
    
    try {
      const history = JSON.parse(localStorage.getItem('callHistory') || '[]');
      
      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No calls yet 📞</div>';
        return;
      }
      
      historyList.innerHTML = history.map(call => {
        const date = new Date(call.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const icon = call.type === 'outgoing' ? '📤' : '📥';
        
        return `
          <div class="history-item">
            <span class="history-icon">${icon}</span>
            <div class="history-info">
              <div class="history-name">${escapeHTML(call.partner)}</div>
              <div class="history-time">${dateStr} ${timeStr}</div>
            </div>
            <div class="history-duration">${formatDuration(call.duration || 0)}</div>
          </div>
        `;
      }).join('');
      
    } catch (e) {
      historyList.innerHTML = '<div class="empty-state">Error loading history</div>';
    }
  }

  function clearCallHistory() {
    localStorage.removeItem('callHistory');
    loadCallHistory();
    showToast('History cleared', 'success');
  }

  // ============================================
  // VISUALIZER
  // ============================================
  function setVisualizerActive(type, active) {
    const bars = type === 'local' ? App.elements.localBars : App.elements.remoteBars;
    if (bars && bars.parentElement) {
      bars.parentElement.classList.toggle('active', active);
    }
  }

  // ============================================
  // NETWORK QUALITY
  // ============================================
  function updateNetworkQuality(quality) {
    const el = App.elements.networkQuality;
    if (!el) return;
    
    el.className = `network-quality ${quality}`;
    const textEl = el.querySelector('.quality-text');
    if (textEl) {
      textEl.textContent = quality.charAt(0).toUpperCase() + quality.slice(1);
    }
  }

  function startQualityMonitoring() {
    stopQualityMonitoring();
    
    App.qosInterval = setInterval(async () => {
      if (!App.peerConnection || App.peerConnection.connectionState !== 'connected') {
        return;
      }
      
      try {
        const stats = await App.peerConnection.getStats();
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            
            if (total === 0) return;
            
            const lossRatio = packetsLost / total;
            
            let quality = 'excellent';
            if (lossRatio > 0.1) quality = 'poor';
            else if (lossRatio > 0.05) quality = 'fair';
            else if (lossRatio > 0.02) quality = 'good';
            
            updateNetworkQuality(quality);
          }
        });
      } catch (e) {
        // Ignore stats errors
      }
    }, 3000);
  }

  function stopQualityMonitoring() {
    if (App.qosInterval) {
      clearInterval(App.qosInterval);
      App.qosInterval = null;
    }
  }

  // ============================================
  // WEBRTC FUNCTIONS
  // ============================================
  async function createPeerConnection() {
    log('Creating peer connection...', 'info');
    
    App.peerConnection = new RTCPeerConnection({
      iceServers: CONFIG.iceServers
    });
    
    App.remoteStream = new MediaStream();
    
    if (App.elements.remoteAudio) {
      App.elements.remoteAudio.srcObject = App.remoteStream;
    }
    
    // ICE candidate handler
    App.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        log('Sending ICE candidate', 'info');
        App.socket.emit('ice-candidate', event.candidate);
      }
    };
    
    // Connection state handler
    App.peerConnection.onconnectionstatechange = () => {
      const state = App.peerConnection.connectionState;
      log(`Connection state: ${state}`, 'info');
      
      switch (state) {
        case 'connected':
          onCallConnected();
          break;
        case 'disconnected':
          onCallDisconnected();
          break;
        case 'failed':
          onCallFailed();
          break;
      }
    };
    
    // Track handler
    App.peerConnection.ontrack = (event) => {
      log('Received remote track', 'success');
      event.streams[0].getTracks().forEach(track => {
        App.remoteStream.addTrack(track);
      });
      setVisualizerActive('remote', true);
    };
    
    log('Peer connection created', 'success');
  }

  async function getLocalMediaStream() {
    log('Getting local audio...', 'info');
    
    try {
      App.localStream = await navigator.mediaDevices.getUserMedia({
        audio: CONFIG.audioConstraints,
        video: false
      });
      
      if (App.elements.localAudio) {
        App.elements.localAudio.srcObject = App.localStream;
      }
      
      // Add tracks to peer connection
      App.localStream.getTracks().forEach(track => {
        App.peerConnection.addTrack(track, App.localStream);
      });
      
      setVisualizerActive('local', true);
      log('Local audio ready', 'success');
      
    } catch (error) {
      log(`Microphone error: ${error.message}`, 'error');
      showToast('Cannot access microphone. Please check permissions.', 'error');
      throw error;
    }
  }

  async function createAndSendOffer() {
    log('Creating offer...', 'info');
    
    try {
      const offer = await App.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      
      await App.peerConnection.setLocalDescription(offer);
      
      App.socket.emit('offer', offer);
      log('Offer sent', 'success');
      
    } catch (error) {
      log(`Offer error: ${error.message}`, 'error');
      throw error;
    }
  }

  async function handleReceivedOffer(offer) {
    log('Processing received offer...', 'info');
    
    try {
      if (!App.peerConnection) {
        await createPeerConnection();
        await getLocalMediaStream();
      }
      
      await App.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await App.peerConnection.createAnswer();
      await App.peerConnection.setLocalDescription(answer);
      
      App.socket.emit('answer', answer);
      log('Answer sent', 'success');
      
    } catch (error) {
      log(`Handle offer error: ${error.message}`, 'error');
    }
  }

  async function handleReceivedAnswer(answer) {
    log('Processing received answer...', 'info');
    
    try {
      await App.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      log('Answer processed', 'success');
    } catch (error) {
      log(`Handle answer error: ${error.message}`, 'error');
    }
  }

  async function handleReceivedIceCandidate(data) {
    try {
      if (App.peerConnection && data.candidate) {
        await App.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        log('ICE candidate added', 'info');
      }
    } catch (error) {
      log(`ICE error: ${error.message}`, 'error');
    }
  }

  // ============================================
  // CALL STATE HANDLERS
  // ============================================
  function onCallConnected() {
    log('Call connected!', 'success');
    
    playSound('connected');
    stopRingtone();
    
    setConnectionStatus('In Call', 'connected');
    
    if (App.elements.callStatusText) {
      App.elements.callStatusText.textContent = 'Connected';
    }
    
    startCallTimer();
    startQualityMonitoring();
    
    showScreen('incall');
    showToast('Connected! 🎉', 'success');
  }

  function onCallDisconnected() {
    log('Call disconnected', 'warn');
    
    if (App.elements.callStatusText) {
      App.elements.callStatusText.textContent = 'Reconnecting...';
    }
  }

  function onCallFailed() {
    log('Call failed', 'error');
    showToast('Connection failed', 'error');
    endCall();
  }

  // ============================================
  // MAIN CALL FUNCTIONS
  // ============================================
  async function createRoom() {
    const el = App.elements;
    
    const roomId = el.roomId?.value.trim();
    const userName = el.userName?.value.trim() || 'Anonymous';
    
    if (!roomId) {
      showToast('Please enter a Room ID', 'warning');
      el.roomId?.focus();
      return;
    }
    
    if (roomId.length < 3) {
      showToast('Room ID must be at least 3 characters', 'warning');
      return;
    }
    
    // Save user name
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    setButtonLoading(el.createBtn, true);
    
    // Send create room request
    App.socket.emit('create-room', roomId);
  }

  async function joinRoom() {
    const el = App.elements;
    
    const roomId = el.roomId?.value.trim();
    const userName = el.userName?.value.trim() || 'Anonymous';
    
    if (!roomId) {
      showToast('Please enter a Room ID', 'warning');
      el.roomId?.focus();
      return;
    }
    
    // Save user name
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    setButtonLoading(el.joinBtn, true);
    
    // Send join room request
    App.socket.emit('join-room', roomId);
  }

  async function onRoomCreated(data) {
    log('Room created', 'success');
    
    // Extract room ID (handle both string and object)
    const roomId = typeof data === 'string' ? data : (data.roomId || data);
    
    App.currentRoom = roomId;
    App.currentRole = 'creator';
    
    // Generate share link
    const shareLink = typeof data === 'object' && data.shareLink 
      ? data.shareLink 
      : getShareableLink(roomId);
    
    // Update waiting screen
    if (App.elements.waitingRoomId) {
      App.elements.waitingRoomId.textContent = roomId;
    }
    if (App.elements.waitingShareLink) {
      App.elements.waitingShareLink.value = shareLink;
    }
    if (App.elements.shareLink) {
      App.elements.shareLink.value = shareLink;
    }
    
    // Show share box
    if (App.elements.shareLinkBox) {
      App.elements.shareLinkBox.classList.remove('hidden');
    }
    
    try {
      await createPeerConnection();
      await getLocalMediaStream();
      await createAndSendOffer();
      
      showScreen('waiting');
      startRingtone();
      
      showToast(`Room "${roomId}" created! Share the link with your partner.`, 'success', 5000);
      
    } catch (error) {
      log(`Create room error: ${error.message}`, 'error');
      showToast('Failed to create room', 'error');
      showScreen('precall');
    }
    
    setButtonLoading(App.elements.createBtn, false);
  }

  async function onRoomJoined(data) {
    log('Joined room', 'success');
    
    // Extract data
    const roomId = typeof data === 'string' ? data : (data.roomId || data);
    const creatorName = typeof data === 'object' ? data.creatorName : null;
    
    App.currentRoom = roomId;
    App.currentRole = 'joiner';
    App.partnerName = creatorName || 'Partner';
    
    if (App.elements.callPartnerName) {
      App.elements.callPartnerName.textContent = App.partnerName;
    }
    
    showToast('Joined! Connecting...', 'success');
    setButtonLoading(App.elements.joinBtn, false);
  }

  function onPartnerJoined(data) {
    log('Partner joined', 'success');
    
    const partnerName = typeof data === 'object' ? (data.name || 'Partner') : 'Partner';
    App.partnerName = partnerName;
    
    if (App.elements.callPartnerName) {
      App.elements.callPartnerName.textContent = partnerName;
    }
    
    stopRingtone();
    showToast(`${partnerName} joined!`, 'success');
  }

  function endCall() {
    log('Ending call...', 'info');
    
    // Stop sounds and timers
    stopRingtone();
    const duration = stopCallTimer();
    stopQualityMonitoring();
    
    playSound('hangup');
    
    // Save to history if call was connected
    if (duration > 0) {
      const callType = App.currentRole === 'creator' ? 'outgoing' : 'incoming';
      saveCallToHistory(App.partnerName, duration, callType);
    }
    
    // Close peer connection
    if (App.peerConnection) {
      App.peerConnection.close();
      App.peerConnection = null;
    }
    
    // Stop local media
    if (App.localStream) {
      App.localStream.getTracks().forEach(track => track.stop());
      App.localStream = null;
    }
    
    // Clear remote stream
    App.remoteStream = null;
    
    // Reset state
    App.currentRoom = null;
    App.currentRole = null;
    App.partnerName = 'Partner';
    App.isMuted = false;
    App.unreadMessages = 0;
    
    // Reset UI
    setVisualizerActive('local', false);
    setVisualizerActive('remote', false);
    
    if (App.elements.chatPanel) {
      App.elements.chatPanel.classList.add('hidden');
    }
    if (App.elements.chatMessages) {
      App.elements.chatMessages.innerHTML = '';
    }
    if (App.elements.shareLinkBox) {
      App.elements.shareLinkBox.classList.add('hidden');
    }
    if (App.elements.callTimer) {
      App.elements.callTimer.textContent = '00:00';
    }
    if (App.elements.muteBtn) {
      App.elements.muteBtn.classList.remove('active');
      const icon = App.elements.muteBtn.querySelector('.control-icon');
      const label = App.elements.muteBtn.querySelector('.control-label');
      if (icon) icon.textContent = '🎤';
      if (label) label.textContent = 'Mute';
    }
    
    // Show pre-call screen
    showScreen('precall');
    setConnectionStatus('Ready', 'connected');
    enableMainButtons(true);
    
    showToast('Call ended', 'info');
  }

  // ============================================
  // CHAT FUNCTIONS
  // ============================================
  function addChatMessage(data) {
    const container = App.elements.chatMessages;
    if (!container) return;
    
    const isMine = data.senderId === App.socket.id;
    const time = new Date(data.timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isMine ? 'sent' : 'received'}`;
    
    messageDiv.innerHTML = `
      ${!isMine ? `<div class="chat-sender">${escapeHTML(data.sender)}</div>` : ''}
      <div class="chat-bubble">${escapeHTML(data.text)}</div>
      <div class="chat-time">${time}</div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  function sendChatMessage() {
    const input = App.elements.chatInput;
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !App.currentRoom) return;
    
    App.socket.emit('chat-message', { text });
    input.value = '';
    
    // Stop typing indicator
    App.socket.emit('typing', false);
  }

  function handleChatMessage(data) {
    addChatMessage(data);
    
    // If message is from partner
    if (data.senderId !== App.socket.id) {
      playSound('message');
      
      // Update unread count if chat is hidden
      if (App.elements.chatPanel?.classList.contains('hidden')) {
        App.unreadMessages++;
        updateChatBadge();
      }
    }
  }

  function updateChatBadge() {
    const badge = App.elements.chatBadge;
    if (!badge) return;
    
    if (App.unreadMessages > 0) {
      badge.textContent = App.unreadMessages > 9 ? '9+' : App.unreadMessages;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function toggleChat() {
    const panel = App.elements.chatPanel;
    if (!panel) return;
    
    panel.classList.toggle('hidden');
    
    if (!panel.classList.contains('hidden')) {
      App.unreadMessages = 0;
      updateChatBadge();
      App.elements.chatInput?.focus();
    }
  }

  // ============================================
  // CONTROL FUNCTIONS
  // ============================================
  function toggleMute() {
    if (!App.localStream) return;
    
    App.isMuted = !App.isMuted;
    
    App.localStream.getAudioTracks().forEach(track => {
      track.enabled = !App.isMuted;
    });
    
    const btn = App.elements.muteBtn;
    if (btn) {
      btn.classList.toggle('active', App.isMuted);
      const icon = btn.querySelector('.control-icon');
      const label = btn.querySelector('.control-label');
      if (icon) icon.textContent = App.isMuted ? '🔇' : '🎤';
      if (label) label.textContent = App.isMuted ? 'Unmute' : 'Mute';
    }
    
    App.socket.emit('mute-status', App.isMuted);
    showToast(App.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }

  function toggleSpeaker() {
    const btn = App.elements.speakerBtn;
    if (!btn) return;
    
    btn.classList.toggle('active');
    const icon = btn.querySelector('.control-icon');
    const isActive = btn.classList.contains('active');
    if (icon) icon.textContent = isActive ? '🔈' : '🔊';
  }

  function setVolume(value) {
    if (App.elements.remoteAudio) {
      App.elements.remoteAudio.volume = value / 100;
    }
  }

  function hangUp() {
    App.socket.emit('hang-up');
    endCall();
  }

  // ============================================
  // SOCKET EVENT HANDLERS
  // ============================================
  function setupSocketEvents() {
    const socket = App.socket;
    
    socket.on('connect', () => {
      log('Connected to server', 'success');
      setConnectionStatus('Ready to call', 'connected');
      enableMainButtons(true);
      
      // Set app type for server
      socket.emit('set-app-type', 'voice');
      
      // Restore user name
      const savedName = localStorage.getItem('userName');
      if (savedName) {
        App.myName = savedName;
        if (App.elements.userName) {
          App.elements.userName.value = savedName;
        }
        socket.emit('set-name', savedName);
      }
      
      // Check URL for room parameter
      const urlParams = new URLSearchParams(window.location.search);
      const roomFromUrl = urlParams.get('room');
      if (roomFromUrl && App.elements.roomId) {
        App.elements.roomId.value = roomFromUrl;
        showToast('Room ID loaded from link', 'info');
      }
    });
    
    socket.on('disconnect', () => {
      log('Disconnected from server', 'error');
      setConnectionStatus('Disconnected', 'error');
      enableMainButtons(false);
    });
    
    socket.on('error', (data) => {
      log(`Server error: ${data.message}`, 'error');
      showToast(data.message, 'error', 5000);
      
      setButtonLoading(App.elements.createBtn, false);
      setButtonLoading(App.elements.joinBtn, false);
      
      stopRingtone();
      showScreen('precall');
    });
    
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('user-joined', onPartnerJoined);
    
    socket.on('offer', handleReceivedOffer);
    socket.on('answer', handleReceivedAnswer);
    socket.on('ice-candidate', handleReceivedIceCandidate);
    
    socket.on('chat-message', handleChatMessage);
    
    socket.on('user-typing', (data) => {
      const indicator = App.elements.typingIndicator;
      if (indicator) {
        indicator.classList.toggle('hidden', !data.isTyping);
      }
    });
    
    socket.on('partner-muted', (data) => {
      const msg = data.isMuted ? '🔇 Partner muted their mic' : '🔊 Partner unmuted';
      showToast(msg, 'info');
    });
    
    socket.on('user-left', (data) => {
      const name = data.name || 'Partner';
      showToast(`${name} left the call`, 'warning');
      endCall();
    });
    
    socket.on('call-ended', () => {
      showToast('Partner ended the call', 'info');
      endCall();
    });
  }

  // ============================================
  // UI EVENT HANDLERS
  // ============================================
  function setupUIEvents() {
    const el = App.elements;
    
    // Generate Room ID
    el.generateBtn?.addEventListener('click', () => {
      if (el.roomId) {
        el.roomId.value = generateRandomRoomId();
        showToast('Room ID generated', 'success');
      }
    });
    
    // Copy Room ID
    el.copyRoomBtn?.addEventListener('click', () => {
      if (el.roomId?.value) {
        copyToClipboard(el.roomId.value);
      }
    });
    
    // Create Room
    el.createBtn?.addEventListener('click', createRoom);
    
    // Join Room
    el.joinBtn?.addEventListener('click', joinRoom);
    
    // Cancel Waiting
    el.cancelWaitBtn?.addEventListener('click', () => {
      App.socket.emit('hang-up');
      endCall();
    });
    
    // Copy Share Links
    el.copyLinkBtn?.addEventListener('click', () => {
      if (el.shareLink?.value) {
        copyToClipboard(el.shareLink.value);
      }
    });
    
    el.waitingCopyBtn?.addEventListener('click', () => {
      if (el.waitingShareLink?.value) {
        copyToClipboard(el.waitingShareLink.value);
      }
    });
    
    // Call Controls
    el.muteBtn?.addEventListener('click', toggleMute);
    el.speakerBtn?.addEventListener('click', toggleSpeaker);
    el.chatBtn?.addEventListener('click', toggleChat);
    el.hangupBtn?.addEventListener('click', hangUp);
    
    // Volume
    el.volumeSlider?.addEventListener('input', (e) => {
      setVolume(e.target.value);
    });
    
    // Chat
    el.closeChatBtn?.addEventListener('click', () => {
      el.chatPanel?.classList.add('hidden');
    });
    
    el.sendMsgBtn?.addEventListener('click', sendChatMessage);
    
    el.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
    
    // Typing indicator
    let typingTimeout;
    el.chatInput?.addEventListener('input', () => {
      App.socket.emit('typing', true);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        App.socket.emit('typing', false);
      }, 1000);
    });
    
    // History
    el.historyBtn?.addEventListener('click', () => {
      loadCallHistory();
      el.historyModal?.classList.remove('hidden');
    });
    
    el.closeHistoryBtn?.addEventListener('click', () => {
      el.historyModal?.classList.add('hidden');
    });
    
    el.clearHistoryBtn?.addEventListener('click', clearCallHistory);
    
    // Close modal on backdrop click
    document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      el.historyModal?.classList.add('hidden');
    });
    
    // Theme Toggle
    el.themeBtn?.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      
      if (el.themeBtn) {
        el.themeBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
      }
    });
    
    // Enter key on room input
    el.roomId?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        createRoom();
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    if (App.elements.themeBtn) {
      App.elements.themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
  }

  function checkWebRTCSupport() {
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setConnectionStatus('WebRTC not supported', 'error');
      showToast('Your browser does not support audio calls', 'error');
      enableMainButtons(false);
      return false;
    }
    return true;
  }

  function init() {
    log('Initializing HeartSpace Calls v5.0...', 'info');
    
    // Cache DOM elements
    cacheElements();
    
    // Load theme
    loadTheme();
    
    // Check WebRTC support
    if (!checkWebRTCSupport()) {
      return;
    }
    
    // Initialize socket connection
    App.socket = io();
    
    // Setup event handlers
    setupSocketEvents();
    setupUIEvents();
    
    // Generate initial room ID
    if (App.elements.roomId && !App.elements.roomId.value) {
      App.elements.roomId.value = generateRandomRoomId();
    }
    
    // Load saved user name
    const savedName = localStorage.getItem('userName');
    if (savedName && App.elements.userName) {
      App.elements.userName.value = savedName;
    }
    
    log('Initialization complete', 'success');
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

