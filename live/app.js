/**
 * HeartSpace Video v6.0
 * Full-Featured Video Conferencing App
 * 
 * Features:
 * - HD Video Calling
 * - Screen Sharing
 * - Camera Flip
 * - Picture-in-Picture
 * - Fullscreen Mode
 * - Live Chat
 * - Connection Stats
 * - Dark Mode
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
      { urls: 'stun:stun4.l.google.com:19302' },
      // TURN servers (free fallback for NAT/firewall - from OpenRelay Project)
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    videoQuality: {
      hd: { width: 1280, height: 720, frameRate: 30 },
      sd: { width: 640, height: 480, frameRate: 24 },
      low: { width: 320, height: 240, frameRate: 15 }
    },
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
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
    screenStream: null,
    
    currentRoom: null,
    currentRole: null,
    partnerName: 'Partner',
    myName: 'Anonymous',
    
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false,
    selectedQuality: 'hd',
    currentCameraIndex: 0,
    availableCameras: [],
    
    callStartTime: null,
    timerInterval: null,
    statsInterval: null,
    ringtoneInterval: null,
    
    unreadMessages: 0,
    isVideosSwapped: false,
    
    elements: {}
  };

  // ============================================
  // DOM CACHE
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
      
      // Preview
      previewVideo: $('previewVideo'),
      previewPlaceholder: $('previewPlaceholder'),
      previewCameraBtn: $('previewCameraBtn'),
      previewMicBtn: $('previewMicBtn'),
      flipCameraBtn: $('flipCameraBtn'),
      
      // Inputs
      userName: $('userName'),
      roomId: $('roomId'),
      
      // Buttons
      generateBtn: $('generateBtn'),
      copyRoomBtn: $('copyRoomBtn'),
      createBtn: $('createBtn'),
      joinBtn: $('joinBtn'),
      
      // Quality
      qualityOptions: document.querySelectorAll('input[name="quality"]'),
      
      // Waiting
      waitingRoomId: $('waitingRoomId'),
      waitingShareLink: $('waitingShareLink'),
      waitingCopyBtn: $('waitingCopyBtn'),
      cancelWaitBtn: $('cancelWaitBtn'),
      shareWhatsApp: $('shareWhatsApp'),
      shareTelegram: $('shareTelegram'),
      shareEmail: $('shareEmail'),
      
      // In-Call Videos
      videoGrid: $('videoGrid'),
      localVideo: $('localVideo'),
      remoteVideo: $('remoteVideo'),
      localVideoWrapper: $('localVideoWrapper'),
      remoteVideoWrapper: $('remoteVideoWrapper'),
      localVideoOff: $('localVideoOff'),
      remoteVideoOff: $('remoteVideoOff'),
      remoteVideoName: $('remoteVideoName'),
      remoteVideoStatus: $('remoteVideoStatus'),
      remoteMicIndicator: $('remoteMicIndicator'),
      swapVideosBtn: $('swapVideosBtn'),
      
      // Call Info
      callRoomName: $('callRoomName'),
      callTimer: $('callTimer'),
      connectionQuality: $('connectionQuality'),
      
      // Controls
      micBtn: $('micBtn'),
      cameraBtn: $('cameraBtn'),
      screenShareBtn: $('screenShareBtn'),
      chatBtn: $('chatBtn'),
      moreBtn: $('moreBtn'),
      hangupBtn: $('hangupBtn'),
      chatBadge: $('chatBadge'),
      
      // More Menu
      moreMenu: $('moreMenu'),
      flipCameraCallBtn: $('flipCameraCallBtn'),
      pipCallBtn: $('pipCallBtn'),
      fullscreenCallBtn: $('fullscreenCallBtn'),
      statsBtn: $('statsBtn'),
      
      // Header Actions
      pipBtn: $('pipBtn'),
      fullscreenBtn: $('fullscreenBtn'),
      settingsBtn: $('settingsBtn'),
      themeBtn: $('themeBtn'),
      
      // Chat
      chatPanel: $('chatPanel'),
      chatMessages: $('chatMessages'),
      chatInput: $('chatInput'),
      sendMsgBtn: $('sendMsgBtn'),
      closeChatBtn: $('closeChatBtn'),
      typingIndicator: $('typingIndicator'),
      
      // Settings Modal
      settingsModal: $('settingsModal'),
      closeSettingsBtn: $('closeSettingsBtn'),
      cameraSelect: $('cameraSelect'),
      micSelect: $('micSelect'),
      speakerSelect: $('speakerSelect'),
      volumeSlider: $('volumeSlider'),
      
      // Stats Modal
      statsModal: $('statsModal'),
      closeStatsBtn: $('closeStatsBtn'),
      statResolution: $('statResolution'),
      statFrameRate: $('statFrameRate'),
      statBitrate: $('statBitrate'),
      statPacketLoss: $('statPacketLoss'),
      statLatency: $('statLatency'),
      statConnection: $('statConnection'),
      
      // Remote Audio
      remoteAudio: $('remoteAudio'),
      
      // Toast
      toastContainer: $('toastContainer')
    };
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  function log(message, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
    console.log(`${icons[type] || 'ℹ️'} [HeartSpace] ${message}`);
  }

  function showToast(message, type = 'info', duration = 4000) {
    const container = App.elements.toastContainer;
    if (!container) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHTML(message)}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function setConnectionStatus(text, type = 'info') {
    const el = App.elements;
    if (el.connectionText) el.connectionText.textContent = text;
    if (el.connectionBar) {
      el.connectionBar.className = 'connection-bar';
      if (type === 'connected') el.connectionBar.classList.add('connected');
      if (type === 'error') el.connectionBar.classList.add('error');
    }
  }

  function showScreen(name) {
    const el = App.elements;
    el.preCallScreen?.classList.toggle('hidden', name !== 'precall');
    el.waitingScreen?.classList.toggle('hidden', name !== 'waiting');
    el.inCallScreen?.classList.toggle('hidden', name !== 'incall');
    
    // Show/hide header buttons based on screen
    if ($('pipBtn')) $('pipBtn').classList.toggle('hidden', name !== 'incall');
    if ($('fullscreenBtn')) $('fullscreenBtn').classList.toggle('hidden', name !== 'incall');
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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function generateRoomId() {
    const adjectives = ['happy', 'sunny', 'cozy', 'sweet', 'calm', 'warm', 'bright', 'cool'];
    const nouns = ['star', 'moon', 'cloud', 'wave', 'tree', 'bird', 'lake', 'hill'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}-${noun}-${num}`;
  }

  function getShareLink(roomId) {
    return `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
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
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ============================================
  // SOUND EFFECTS
  // ============================================
  function playSound(type) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.1;
      
      switch (type) {
        case 'ring':
          osc.frequency.value = 440;
          osc.start();
          setTimeout(() => osc.frequency.value = 550, 150);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'connect':
          osc.frequency.value = 523;
          osc.start();
          setTimeout(() => osc.frequency.value = 659, 100);
          setTimeout(() => osc.frequency.value = 784, 200);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'hangup':
          osc.frequency.value = 400;
          osc.start();
          setTimeout(() => osc.frequency.value = 300, 150);
          setTimeout(() => { osc.stop(); ctx.close(); }, 300);
          break;
        case 'message':
          osc.frequency.value = 800;
          gain.gain.value = 0.05;
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 80);
          break;
      }
    } catch (e) {}
  }

  function startRingtone() {
    stopRingtone();
    playSound('ring');
    App.ringtoneInterval = setInterval(() => playSound('ring'), 2000);
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
    
    const update = () => {
      if (!App.callStartTime) return;
      const elapsed = Math.floor((Date.now() - App.callStartTime) / 1000);
      if (App.elements.callTimer) {
        App.elements.callTimer.textContent = formatDuration(elapsed);
      }
    };
    
    update();
    App.timerInterval = setInterval(update, 1000);
  }

  function stopCallTimer() {
    if (App.timerInterval) {
      clearInterval(App.timerInterval);
      App.timerInterval = null;
    }
    const duration = App.callStartTime ? Math.floor((Date.now() - App.callStartTime) / 1000) : 0;
    App.callStartTime = null;
    return duration;
  }

  // ============================================
  // MEDIA DEVICES
  // ============================================
  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      App.availableCameras = devices.filter(d => d.kind === 'videoinput');
      const mics = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      
      // Populate settings selects
      populateDeviceSelect(App.elements.cameraSelect, App.availableCameras, 'Camera');
      populateDeviceSelect(App.elements.micSelect, mics, 'Microphone');
      populateDeviceSelect(App.elements.speakerSelect, speakers, 'Speaker');
      
      // Show flip camera button if multiple cameras
      if (App.elements.flipCameraBtn) {
        App.elements.flipCameraBtn.style.display = App.availableCameras.length > 1 ? '' : 'none';
      }
      
      log(`Found ${App.availableCameras.length} cameras, ${mics.length} mics`, 'info');
      
    } catch (e) {
      log(`Enumerate devices error: ${e.message}`, 'error');
    }
  }

  function populateDeviceSelect(select, devices, defaultLabel) {
    if (!select) return;
    
    select.innerHTML = '';
    
    if (devices.length === 0) {
      const option = document.createElement('option');
      option.textContent = `No ${defaultLabel} found`;
      select.appendChild(option);
      return;
    }
    
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `${defaultLabel} ${index + 1}`;
      select.appendChild(option);
    });
  }

  async function getMediaStream(videoEnabled = true, audioEnabled = true) {
    const quality = CONFIG.videoQuality[App.selectedQuality] || CONFIG.videoQuality.hd;
    
    const constraints = {
      video: videoEnabled ? {
        width: { ideal: quality.width },
        height: { ideal: quality.height },
        frameRate: { ideal: quality.frameRate },
        facingMode: 'user'
      } : false,
      audio: audioEnabled ? CONFIG.audioConstraints : false
    };
    
    // Use specific camera if selected
    if (videoEnabled && App.availableCameras.length > 0) {
      const cameraId = App.availableCameras[App.currentCameraIndex]?.deviceId;
      if (cameraId) {
        constraints.video.deviceId = { exact: cameraId };
      }
    }
    
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      log(`Media error: ${e.message}`, 'error');
      throw e;
    }
  }

  // ============================================
  // PREVIEW
  // ============================================
  async function startPreview() {
    try {
      await enumerateDevices();
      
      App.localStream = await getMediaStream(App.isVideoEnabled, App.isAudioEnabled);
      
      if (App.elements.previewVideo) {
        App.elements.previewVideo.srcObject = App.localStream;
      }
      
      updatePreviewPlaceholder();
      updatePreviewButtons();
      
      log('Preview started', 'success');
      
    } catch (e) {
      log(`Preview error: ${e.message}`, 'error');
      showToast('Cannot access camera/microphone', 'error');
    }
  }

  function updatePreviewPlaceholder() {
    const placeholder = App.elements.previewPlaceholder;
    if (!placeholder) return;
    
    placeholder.classList.toggle('hidden', App.isVideoEnabled && App.localStream);
  }

  function updatePreviewButtons() {
    const el = App.elements;
    
    if (el.previewCameraBtn) {
      el.previewCameraBtn.classList.toggle('active', App.isVideoEnabled);
      el.previewCameraBtn.textContent = App.isVideoEnabled ? '📹' : '📷';
    }
    
    if (el.previewMicBtn) {
      el.previewMicBtn.classList.toggle('active', App.isAudioEnabled);
      el.previewMicBtn.textContent = App.isAudioEnabled ? '🎤' : '🔇';
    }
  }

  async function togglePreviewCamera() {
    App.isVideoEnabled = !App.isVideoEnabled;
    
    if (App.localStream) {
      App.localStream.getVideoTracks().forEach(track => {
        track.enabled = App.isVideoEnabled;
      });
    }
    
    updatePreviewPlaceholder();
    updatePreviewButtons();
    
    showToast(App.isVideoEnabled ? 'Camera on' : 'Camera off', 'info');
  }

  function togglePreviewMic() {
    App.isAudioEnabled = !App.isAudioEnabled;
    
    if (App.localStream) {
      App.localStream.getAudioTracks().forEach(track => {
        track.enabled = App.isAudioEnabled;
      });
    }
    
    updatePreviewButtons();
    showToast(App.isAudioEnabled ? 'Microphone on' : 'Microphone off', 'info');
  }

  async function flipCamera() {
    if (App.availableCameras.length <= 1) {
      showToast('Only one camera available', 'warning');
      return;
    }
    
    App.currentCameraIndex = (App.currentCameraIndex + 1) % App.availableCameras.length;
    
    try {
      // Stop current video tracks
      if (App.localStream) {
        App.localStream.getVideoTracks().forEach(track => track.stop());
      }
      
      // Get new stream with different camera
      const newStream = await getMediaStream(true, App.isAudioEnabled);
      
      // Replace video track
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      if (App.localStream) {
        // Remove old video tracks
        App.localStream.getVideoTracks().forEach(track => {
          App.localStream.removeTrack(track);
        });
        // Add new video track
        App.localStream.addTrack(newVideoTrack);
      }
      
      // Update preview video
      if (App.elements.previewVideo) {
        App.elements.previewVideo.srcObject = App.localStream;
      }
      
      // Update local video in call
      if (App.elements.localVideo) {
        App.elements.localVideo.srcObject = App.localStream;
      }
      
      // Replace track in peer connection
      if (App.peerConnection) {
        const senders = App.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }
      
      showToast('Camera switched', 'success');
      
    } catch (e) {
      log(`Flip camera error: ${e.message}`, 'error');
      showToast('Failed to switch camera', 'error');
    }
  }

  // ============================================
  // WEBRTC
  // ============================================
  async function createPeerConnection() {
    log('Creating peer connection...', 'info');
    
    App.peerConnection = new RTCPeerConnection({
      iceServers: CONFIG.iceServers
    });
    
    App.remoteStream = new MediaStream();
    
    if (App.elements.remoteVideo) {
      App.elements.remoteVideo.srcObject = App.remoteStream;
    }
    if (App.elements.remoteAudio) {
      App.elements.remoteAudio.srcObject = App.remoteStream;
    }
    
    // ICE candidates
    App.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        App.socket.emit('ice-candidate', event.candidate);
      }
    };
    
    // Connection state
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
    
    // Incoming tracks
    App.peerConnection.ontrack = (event) => {
      log(`Track received: ${event.track.kind}`, 'success');
      event.streams[0].getTracks().forEach(track => {
        App.remoteStream.addTrack(track);
      });
      
      // Hide remote video off overlay when video track is active
      if (event.track.kind === 'video') {
        App.elements.remoteVideoOff?.classList.add('hidden');
      }
    };
    
    log('Peer connection created', 'success');
  }

  async function addLocalTracks() {
    if (!App.localStream || !App.peerConnection) return;
    
    App.localStream.getTracks().forEach(track => {
      App.peerConnection.addTrack(track, App.localStream);
    });
    
    // Update local video display
    if (App.elements.localVideo) {
      App.elements.localVideo.srcObject = App.localStream;
    }
  }

  async function createOffer() {
    try {
      const offer = await App.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await App.peerConnection.setLocalDescription(offer);
      App.socket.emit('offer', offer);
      log('Offer sent', 'success');
    } catch (e) {
      log(`Offer error: ${e.message}`, 'error');
      throw e;
    }
  }

  async function handleOffer(offer) {
    try {
      if (!App.peerConnection) {
        await createPeerConnection();
        
        // Get media if not already
        if (!App.localStream) {
          App.localStream = await getMediaStream(App.isVideoEnabled, App.isAudioEnabled);
        }
        
        await addLocalTracks();
      }
      
      await App.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await App.peerConnection.createAnswer();
      await App.peerConnection.setLocalDescription(answer);
      
      App.socket.emit('answer', answer);
      log('Answer sent', 'success');
    } catch (e) {
      log(`Handle offer error: ${e.message}`, 'error');
    }
  }

  async function handleAnswer(answer) {
    try {
      await App.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      log('Answer processed', 'success');
    } catch (e) {
      log(`Handle answer error: ${e.message}`, 'error');
    }
  }

  async function handleIceCandidate(data) {
    try {
      if (App.peerConnection && data.candidate) {
        await App.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (e) {
      log(`ICE error: ${e.message}`, 'error');
    }
  }

  // ============================================
  // CALL STATE
  // ============================================
  function onCallConnected() {
    log('Call connected!', 'success');
    
    playSound('connect');
    stopRingtone();
    
    setConnectionStatus('In Call', 'connected');
    startCallTimer();
    startStatsMonitoring();
    
    showScreen('incall');
    updateControlButtons();
    
    // Update room name display
    if (App.elements.callRoomName && App.currentRoom) {
      App.elements.callRoomName.textContent = App.currentRoom;
    }
    
    // Update partner name
    if (App.elements.remoteVideoName) {
      App.elements.remoteVideoName.textContent = App.partnerName;
    }
    
    showToast('Connected! 🎉', 'success');
  }

  function onCallDisconnected() {
    log('Call disconnected', 'warn');
    showToast('Connection lost. Reconnecting...', 'warning');
  }

  function onCallFailed() {
    log('Call failed', 'error');
    showToast('Connection failed', 'error');
    endCall();
  }

  // ============================================
  // CALL CONTROLS
  // ============================================
  function updateControlButtons() {
    const el = App.elements;
    
    // Mic button
    if (el.micBtn) {
      el.micBtn.classList.toggle('active', App.isAudioEnabled);
      const icon = el.micBtn.querySelector('.control-icon');
      if (icon) icon.textContent = App.isAudioEnabled ? '🎤' : '🔇';
    }
    
    // Camera button
    if (el.cameraBtn) {
      el.cameraBtn.classList.toggle('active', App.isVideoEnabled);
      const icon = el.cameraBtn.querySelector('.control-icon');
      if (icon) icon.textContent = App.isVideoEnabled ? '📹' : '📷';
    }
    
    // Screen share button
    if (el.screenShareBtn) {
      el.screenShareBtn.classList.toggle('active', App.isScreenSharing);
    }
    
    // Local video off overlay
    if (el.localVideoOff) {
      el.localVideoOff.classList.toggle('hidden', App.isVideoEnabled);
    }
  }

  function toggleMic() {
    App.isAudioEnabled = !App.isAudioEnabled;
    
    if (App.localStream) {
      App.localStream.getAudioTracks().forEach(track => {
        track.enabled = App.isAudioEnabled;
      });
    }
    
    // Notify partner
    App.socket.emit('media-state', {
      video: App.isVideoEnabled,
      audio: App.isAudioEnabled,
      screenShare: App.isScreenSharing
    });
    
    updateControlButtons();
    showToast(App.isAudioEnabled ? 'Microphone on' : 'Microphone muted', 'info');
  }

  function toggleCamera() {
    App.isVideoEnabled = !App.isVideoEnabled;
    
    if (App.localStream) {
      App.localStream.getVideoTracks().forEach(track => {
        track.enabled = App.isVideoEnabled;
      });
    }
    
    // Notify partner
    App.socket.emit('media-state', {
      video: App.isVideoEnabled,
      audio: App.isAudioEnabled,
      screenShare: App.isScreenSharing
    });
    
    updateControlButtons();
    showToast(App.isVideoEnabled ? 'Camera on' : 'Camera off', 'info');
  }

  async function toggleScreenShare() {
    if (App.isScreenSharing) {
      stopScreenShare();
      return;
    }
    
    try {
      App.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });
      
      const screenTrack = App.screenStream.getVideoTracks()[0];
      
      // Replace video track in peer connection
      if (App.peerConnection) {
        const senders = App.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }
      }
      
      // Update local video display
      if (App.elements.localVideo) {
        App.elements.localVideo.srcObject = App.screenStream;
      }
      
      // Handle screen share stop
      screenTrack.onended = () => {
        stopScreenShare();
      };
      
      App.isScreenSharing = true;
      
      // Notify partner
      App.socket.emit('media-state', {
        video: App.isVideoEnabled,
        audio: App.isAudioEnabled,
        screenShare: true
      });
      
      updateControlButtons();
      showToast('Screen sharing started', 'success');
      
    } catch (e) {
      log(`Screen share error: ${e.message}`, 'error');
      if (e.name !== 'NotAllowedError') {
        showToast('Failed to share screen', 'error');
      }
    }
  }

  async function stopScreenShare() {
    if (!App.isScreenSharing) return;
    
    // Stop screen stream
    if (App.screenStream) {
      App.screenStream.getTracks().forEach(track => track.stop());
      App.screenStream = null;
    }
    
    // Restore camera video
    const videoTrack = App.localStream?.getVideoTracks()[0];
    
    if (videoTrack && App.peerConnection) {
      const senders = App.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(videoTrack);
      }
    }
    
    // Update local video display
    if (App.elements.localVideo) {
      App.elements.localVideo.srcObject = App.localStream;
    }
    
    App.isScreenSharing = false;
    
    // Notify partner
    App.socket.emit('media-state', {
      video: App.isVideoEnabled,
      audio: App.isAudioEnabled,
      screenShare: false
    });
    
    updateControlButtons();
    showToast('Screen sharing stopped', 'info');
  }

  function swapVideos() {
    App.isVideosSwapped = !App.isVideosSwapped;
    App.elements.videoGrid?.classList.toggle('swapped', App.isVideosSwapped);
  }

  // ============================================
  // PICTURE-IN-PICTURE & FULLSCREEN
  // ============================================
  async function togglePictureInPicture() {
    const video = App.elements.remoteVideo;
    if (!video) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        showToast('Exited Picture-in-Picture', 'info');
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
        showToast('Picture-in-Picture enabled', 'success');
      } else {
        showToast('Picture-in-Picture not supported', 'warning');
      }
    } catch (e) {
      log(`PiP error: ${e.message}`, 'error');
    }
  }

  function toggleFullscreen() {
    const app = document.getElementById('app');
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
      app?.classList.remove('fullscreen');
      showToast('Exited fullscreen', 'info');
    } else {
      app?.requestFullscreen().catch(() => {});
      app?.classList.add('fullscreen');
      showToast('Fullscreen enabled', 'success');
    }
  }

  // ============================================
  // CONNECTION STATS
  // ============================================
  function startStatsMonitoring() {
    stopStatsMonitoring();
    
    App.statsInterval = setInterval(async () => {
      if (!App.peerConnection || App.peerConnection.connectionState !== 'connected') return;
      
      try {
        const stats = await App.peerConnection.getStats();
        let videoStats = null;
        let audioStats = null;
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            videoStats = report;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            audioStats = report;
          }
        });
        
        updateConnectionQuality(videoStats, audioStats);
        updateStatsModal(stats, videoStats, audioStats);
        
      } catch (e) {}
    }, 2000);
  }

  function stopStatsMonitoring() {
    if (App.statsInterval) {
      clearInterval(App.statsInterval);
      App.statsInterval = null;
    }
  }

  function updateConnectionQuality(videoStats, audioStats) {
    const el = App.elements.connectionQuality;
    if (!el) return;
    
    let quality = 'excellent';
    let packetsLost = 0;
    let packetsReceived = 0;
    
    if (audioStats) {
      packetsLost += audioStats.packetsLost || 0;
      packetsReceived += audioStats.packetsReceived || 0;
    }
    if (videoStats) {
      packetsLost += videoStats.packetsLost || 0;
      packetsReceived += videoStats.packetsReceived || 0;
    }
    
    const total = packetsLost + packetsReceived;
    const lossRatio = total > 0 ? packetsLost / total : 0;
    
    if (lossRatio > 0.1) quality = 'poor';
    else if (lossRatio > 0.05) quality = 'fair';
    else if (lossRatio > 0.02) quality = 'good';
    
    el.className = `connection-quality ${quality}`;
    const label = el.querySelector('.quality-label');
    if (label) label.textContent = quality.charAt(0).toUpperCase() + quality.slice(1);
  }

  function updateStatsModal(stats, videoStats, audioStats) {
    const el = App.elements;
    
    if (videoStats) {
      // Resolution
      if (el.statResolution) {
        const width = videoStats.frameWidth || '-';
        const height = videoStats.frameHeight || '-';
        el.statResolution.textContent = `${width}x${height}`;
      }
      
      // Frame rate
      if (el.statFrameRate) {
        el.statFrameRate.textContent = `${Math.round(videoStats.framesPerSecond || 0)} fps`;
      }
      
      // Packet loss
      if (el.statPacketLoss) {
        const lost = videoStats.packetsLost || 0;
        const received = videoStats.packetsReceived || 0;
        const total = lost + received;
        const percent = total > 0 ? ((lost / total) * 100).toFixed(1) : '0';
        el.statPacketLoss.textContent = `${percent}%`;
      }
    }
    
    // Find candidate pair for latency
    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (el.statLatency && report.currentRoundTripTime) {
          el.statLatency.textContent = `${Math.round(report.currentRoundTripTime * 1000)} ms`;
        }
        if (el.statBitrate && report.availableOutgoingBitrate) {
          el.statBitrate.textContent = `${Math.round(report.availableOutgoingBitrate / 1000)} kbps`;
        }
      }
    });
    
    // Connection state
    if (el.statConnection && App.peerConnection) {
      el.statConnection.textContent = App.peerConnection.connectionState;
    }
  }

  // ============================================
  // CHAT
  // ============================================
  function addChatMessage(data) {
    const container = App.elements.chatMessages;
    if (!container) return;
    
    const isMine = data.senderId === App.socket.id;
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `chat-message ${isMine ? 'sent' : 'received'}`;
    div.innerHTML = `
      ${!isMine ? `<div class="chat-sender">${escapeHTML(data.sender)}</div>` : ''}
      <div class="chat-bubble">${escapeHTML(data.text)}</div>
      <div class="chat-time">${time}</div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function sendMessage() {
    const input = App.elements.chatInput;
    if (!input) return;
    
    const text = input.value.trim();
    if (!text || !App.currentRoom) return;
    
    App.socket.emit('chat-message', { text });
    input.value = '';
    App.socket.emit('typing', false);
  }

  function handleChatMessage(data) {
    addChatMessage(data);
    
    if (data.senderId !== App.socket.id) {
      playSound('message');
      
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

  function toggleMoreMenu() {
    App.elements.moreMenu?.classList.toggle('hidden');
  }

  // ============================================
  // ROOM MANAGEMENT
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
    
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    // Get selected quality
    App.selectedQuality = document.querySelector('input[name="quality"]:checked')?.value || 'hd';
    
    setButtonLoading(el.createBtn, true);
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
    
    App.myName = userName;
    localStorage.setItem('userName', userName);
    App.socket.emit('set-name', userName);
    
    // Get selected quality
    App.selectedQuality = document.querySelector('input[name="quality"]:checked')?.value || 'hd';
    
    setButtonLoading(el.joinBtn, true);
    App.socket.emit('join-room', roomId);
  }

  async function onRoomCreated(data) {
    log('Room created', 'success');
    
    const roomId = typeof data === 'string' ? data : data.roomId;
    const shareLink = typeof data === 'object' && data.shareLink ? data.shareLink : getShareLink(roomId);
    
    App.currentRoom = roomId;
    App.currentRole = 'creator';
    
    // Update waiting screen
    if (App.elements.waitingRoomId) App.elements.waitingRoomId.textContent = roomId;
    if (App.elements.waitingShareLink) App.elements.waitingShareLink.value = shareLink;
    
    try {
      await createPeerConnection();
      await addLocalTracks();
      await createOffer();
      
      showScreen('waiting');
      startRingtone();
      
      showToast(`Room "${roomId}" created! Share the link.`, 'success', 5000);
    } catch (e) {
      showToast('Failed to create room', 'error');
      showScreen('precall');
    }
    
    setButtonLoading(App.elements.createBtn, false);
  }

  async function onRoomJoined(data) {
    log('Joined room', 'success');
    
    const roomId = typeof data === 'string' ? data : data.roomId;
    const creatorName = typeof data === 'object' ? data.creatorName : null;
    
    App.currentRoom = roomId;
    App.currentRole = 'joiner';
    App.partnerName = creatorName || 'Partner';
    
    showToast('Joined! Connecting...', 'success');
    setButtonLoading(App.elements.joinBtn, false);
  }

  function onPartnerJoined(data) {
    log('Partner joined', 'success');
    App.partnerName = data.name || 'Partner';
    stopRingtone();
    showToast(`${App.partnerName} joined!`, 'success');
  }

  function onPartnerMediaState(data) {
    // Update remote video/audio indicators
    if (App.elements.remoteVideoOff) {
      App.elements.remoteVideoOff.classList.toggle('hidden', data.video);
    }
    
    if (App.elements.remoteMicIndicator) {
      App.elements.remoteMicIndicator.classList.toggle('muted', !data.audio);
      App.elements.remoteMicIndicator.textContent = data.audio ? '🎤' : '🔇';
    }
    
    if (App.elements.remoteVideoStatus) {
      if (data.screenShare) {
        App.elements.remoteVideoStatus.textContent = '(Screen sharing)';
      } else {
        App.elements.remoteVideoStatus.textContent = '';
      }
    }
  }

  function endCall() {
    log('Ending call...', 'info');
    
    stopRingtone();
    stopStatsMonitoring();
    const duration = stopCallTimer();
    
    playSound('hangup');
    
    // Close peer connection
    if (App.peerConnection) {
      App.peerConnection.close();
      App.peerConnection = null;
    }
    
    // Stop screen share
    if (App.screenStream) {
      App.screenStream.getTracks().forEach(track => track.stop());
      App.screenStream = null;
    }
    
    // Keep local stream for preview
    // App.localStream stays active
    
    // Reset state
    App.currentRoom = null;
    App.currentRole = null;
    App.partnerName = 'Partner';
    App.isScreenSharing = false;
    App.unreadMessages = 0;
    App.isVideosSwapped = false;
    
    // Reset UI
    App.elements.chatPanel?.classList.add('hidden');
    App.elements.chatMessages && (App.elements.chatMessages.innerHTML = '');
    App.elements.moreMenu?.classList.add('hidden');
    App.elements.videoGrid?.classList.remove('swapped');
    
    if (App.elements.callTimer) App.elements.callTimer.textContent = '00:00';
    
    updateChatBadge();
    
    // Back to preview
    if (App.elements.previewVideo && App.localStream) {
      App.elements.previewVideo.srcObject = App.localStream;
    }
    
    showScreen('precall');
    setConnectionStatus('Ready', 'connected');
    enableMainButtons(true);
    
    showToast('Call ended', 'info');
  }

  // ============================================
  // SOCKET EVENTS
  // ============================================
  function setupSocketEvents() {
    const socket = App.socket;
    
    socket.on('connect', () => {
      log('Connected to server', 'success');
      setConnectionStatus('Ready to call', 'connected');
      enableMainButtons(true);
      
      // Set app type for server
      socket.emit('set-app-type', 'video');
      
      // Restore username
      const savedName = localStorage.getItem('userName');
      if (savedName) {
        App.myName = savedName;
        if (App.elements.userName) App.elements.userName.value = savedName;
        socket.emit('set-name', savedName);
      }
      
      // Check URL for room
      const params = new URLSearchParams(window.location.search);
      const roomFromUrl = params.get('room');
      if (roomFromUrl && App.elements.roomId) {
        App.elements.roomId.value = roomFromUrl;
        showToast('Room ID loaded from link', 'info');
      }
    });
    
    socket.on('disconnect', () => {
      log('Disconnected', 'error');
      setConnectionStatus('Disconnected', 'error');
      enableMainButtons(false);
    });
    
    socket.on('error', (data) => {
      log(`Error: ${data.message}`, 'error');
      showToast(data.message, 'error', 5000);
      setButtonLoading(App.elements.createBtn, false);
      setButtonLoading(App.elements.joinBtn, false);
      stopRingtone();
      showScreen('precall');
    });
    
    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('user-joined', onPartnerJoined);
    
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    
    socket.on('partner-media-state', onPartnerMediaState);
    socket.on('chat-message', handleChatMessage);
    
    socket.on('user-typing', (data) => {
      const indicator = App.elements.typingIndicator;
      if (indicator) {
        indicator.classList.toggle('hidden', !data.isTyping);
      }
    });
    
    socket.on('user-left', (data) => {
      showToast(`${data.name || 'Partner'} left`, 'warning');
      endCall();
    });
    
    socket.on('call-ended', (data) => {
      showToast(data.reason || 'Call ended', 'info');
      endCall();
    });
    
    socket.on('room-expired', () => {
      showToast('Room expired', 'warning');
      endCall();
    });
  }

  // ============================================
  // UI EVENT HANDLERS
  // ============================================
  function setupUIEvents() {
    const el = App.elements;
    
    // Preview controls
    el.previewCameraBtn?.addEventListener('click', togglePreviewCamera);
    el.previewMicBtn?.addEventListener('click', togglePreviewMic);
    el.flipCameraBtn?.addEventListener('click', flipCamera);
    
    // Room setup
    el.generateBtn?.addEventListener('click', () => {
      if (el.roomId) {
        el.roomId.value = generateRoomId();
        showToast('Room ID generated', 'success');
      }
    });
    
    el.copyRoomBtn?.addEventListener('click', () => {
      if (el.roomId?.value) copyToClipboard(el.roomId.value);
    });
    
    el.createBtn?.addEventListener('click', createRoom);
    el.joinBtn?.addEventListener('click', joinRoom);
    
    el.roomId?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') createRoom();
    });
    
    // Waiting screen
    el.waitingCopyBtn?.addEventListener('click', () => {
      if (el.waitingShareLink?.value) copyToClipboard(el.waitingShareLink.value);
    });
    
    el.cancelWaitBtn?.addEventListener('click', () => {
      App.socket.emit('hang-up');
      endCall();
    });
    
    // Share buttons
    el.shareWhatsApp?.addEventListener('click', () => {
      const link = el.waitingShareLink?.value;
      if (link) window.open(`https://wa.me/?text=${encodeURIComponent('Join my video call: ' + link)}`, '_blank');
    });
    
    el.shareTelegram?.addEventListener('click', () => {
      const link = el.waitingShareLink?.value;
      if (link) window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join my video call!')}`, '_blank');
    });
    
    el.shareEmail?.addEventListener('click', () => {
      const link = el.waitingShareLink?.value;
      if (link) window.open(`mailto:?subject=${encodeURIComponent('Join my video call')}&body=${encodeURIComponent('Click here to join: ' + link)}`, '_blank');
    });
    
    // Call controls
    el.micBtn?.addEventListener('click', toggleMic);
    el.cameraBtn?.addEventListener('click', toggleCamera);
    el.screenShareBtn?.addEventListener('click', toggleScreenShare);
    el.chatBtn?.addEventListener('click', toggleChat);
    el.moreBtn?.addEventListener('click', toggleMoreMenu);
    el.hangupBtn?.addEventListener('click', () => {
      App.socket.emit('hang-up');
      endCall();
    });
    
    // More menu
    el.flipCameraCallBtn?.addEventListener('click', () => {
      flipCamera();
      toggleMoreMenu();
    });
    
    el.pipCallBtn?.addEventListener('click', () => {
      togglePictureInPicture();
      toggleMoreMenu();
    });
    
    el.fullscreenCallBtn?.addEventListener('click', () => {
      toggleFullscreen();
      toggleMoreMenu();
    });
    
    el.statsBtn?.addEventListener('click', () => {
      el.statsModal?.classList.remove('hidden');
      toggleMoreMenu();
    });
    
    // Video controls
    el.swapVideosBtn?.addEventListener('click', swapVideos);
    
    // Header buttons
    el.pipBtn?.addEventListener('click', togglePictureInPicture);
    el.fullscreenBtn?.addEventListener('click', toggleFullscreen);
    
    el.settingsBtn?.addEventListener('click', () => {
      el.settingsModal?.classList.remove('hidden');
    });
    
    el.themeBtn?.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
      el.themeBtn.textContent = isDark ? '🌙' : '☀️';
    });
    
    // Chat
    el.closeChatBtn?.addEventListener('click', () => el.chatPanel?.classList.add('hidden'));
    el.sendMsgBtn?.addEventListener('click', sendMessage);
    el.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
    
    let typingTimeout;
    el.chatInput?.addEventListener('input', () => {
      App.socket.emit('typing', true);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => App.socket.emit('typing', false), 1000);
    });
    
    // Modals
    el.closeSettingsBtn?.addEventListener('click', () => el.settingsModal?.classList.add('hidden'));
    el.closeStatsBtn?.addEventListener('click', () => el.statsModal?.classList.add('hidden'));
    
    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        el.settingsModal?.classList.add('hidden');
        el.statsModal?.classList.add('hidden');
      });
    });
    
    // Close more menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!el.moreBtn?.contains(e.target) && !el.moreMenu?.contains(e.target)) {
        el.moreMenu?.classList.add('hidden');
      }
    });
    
    // Volume slider
    el.volumeSlider?.addEventListener('input', () => {
      if (el.remoteAudio) el.remoteAudio.volume = el.volumeSlider.value / 100;
      if (el.remoteVideo) el.remoteVideo.volume = el.volumeSlider.value / 100;
    });
    
    // Device selection
    el.cameraSelect?.addEventListener('change', async () => {
      const deviceId = el.cameraSelect.value;
      const index = App.availableCameras.findIndex(c => c.deviceId === deviceId);
      if (index >= 0) {
        App.currentCameraIndex = index;
        await flipCamera(); // Reuse flip camera logic
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

  async function init() {
    log('Initializing HeartSpace Video v6.0...', 'info');
    
    // Cache DOM elements
    cacheElements();
    
    // Load theme
    loadTheme();
    
    // Check WebRTC support
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setConnectionStatus('WebRTC not supported', 'error');
      showToast('Your browser does not support video calls', 'error');
      enableMainButtons(false);
      return;
    }
    
    // Connect socket
    App.socket = io();
    
    // Setup events
    setupSocketEvents();
    setupUIEvents();
    
    // Generate room ID
    if (App.elements.roomId && !App.elements.roomId.value) {
      App.elements.roomId.value = generateRoomId();
    }
    
    // Load saved username
    const savedName = localStorage.getItem('userName');
    if (savedName && App.elements.userName) {
      App.elements.userName.value = savedName;
    }
    
    // Start camera preview
    await startPreview();
    
    log('Initialization complete', 'success');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

