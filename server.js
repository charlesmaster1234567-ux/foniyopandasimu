/**
 * ConnectPro Server
 * Unified Landing Page + Video/Voice Calling Platform
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// Serve static files from root
app.use(express.static(__dirname));

// ============================================
// DATA STORAGE (Shared across all apps)
// ============================================
const rooms = new Map();
const users = new Map();

// ============================================
// SOCKET.IO HANDLERS (Unified for all apps)
// Supports 99+ participants using mesh topology
// ============================================
io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  
  // Initialize user
  users.set(socket.id, {
    id: socket.id,
    name: 'Anonymous',
    roomId: null,
    role: null,
    appType: null, // 'video' or 'voice'
    isMuted: false,
    isVideoOff: false
  });

  // Set user name
  socket.on('set-name', (name) => {
    const user = users.get(socket.id);
    if (user) {
      user.name = (name || 'Anonymous').substring(0, 30);
      
      // Notify room participants about name change
      if (user.roomId) {
        const room = rooms.get(user.roomId);
        if (room) {
          io.to(user.roomId).emit('participant-updated', {
            odId: socket.id,
            name: user.name,
            isMuted: user.isMuted,
            isVideoOff: user.isVideoOff
          });
        }
      }
    }
  });

  // Set app type (video or voice)
  socket.on('set-app-type', (appType) => {
    const user = users.get(socket.id);
    if (user) {
      user.appType = appType;
    }
  });

  // Create room (now supports 99+ participants)
  socket.on('create-room', (data) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const user = users.get(socket.id);
    const maxParticipants = typeof data === 'object' ? (data.maxParticipants || 99) : 99;
    
    console.log(`📦 Creating ${user?.appType || 'video'} room: ${roomId} (max ${maxParticipants} participants)`);

    if (rooms.has(roomId)) {
      socket.emit('error', { 
        type: 'room-exists', 
        message: 'Room already exists! Try a different name or join it.' 
      });
      return;
    }

    // Create new room with support for 99+ participants
    const room = {
      id: roomId,
      creator: socket.id,
      creatorName: user?.name || 'Anonymous',
      participants: [],
      offer: null,
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      messages: [],
      appType: user?.appType || 'video',
      settings: {
        maxParticipants: Math.min(maxParticipants, 99), // Cap at 99 for mesh
        videoEnabled: true,
        audioEnabled: true
      },
      createdAt: Date.now(),
      // Store all offers/answers for mesh topology
      offers: new Map(), // participantId -> offer
      answers: new Map(), // participantId -> answer
      iceCandidates: new Map() // participantId -> candidates[]
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    room.participants.push(socket.id);
    
    if (user) {
      user.roomId = roomId;
      user.role = 'creator';
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    
    socket.emit('room-created', { 
      roomId: roomId,
      shareLink: `${baseUrl}?room=${encodeURIComponent(roomId)}`,
      maxParticipants: room.settings.maxParticipants,
      participantCount: 1
    });
    
    console.log(`✅ Room created: ${roomId} (${room.appType}) - Max ${room.settings.maxParticipants} participants`);
  });

  // Join room (now supports 99+ participants)
  socket.on('join-room', (data) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const user = users.get(socket.id);
    
    console.log(`🚪 Joining room: ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { 
        type: 'room-not-found', 
        message: 'Room not found! Ask your partner to create it first.' 
      });
      return;
    }

    if (room.participants.length >= room.settings.maxParticipants) {
      socket.emit('error', { 
        type: 'room-full', 
        message: `Room is full! Maximum ${room.settings.maxParticipants} participants.` 
      });
      return;
    }

    // Add to room
    room.participants.push(socket.id);
    socket.join(roomId);

    if (user) {
      user.roomId = roomId;
      user.role = 'joiner';
    }

    // Send room info to joiner
    socket.emit('room-joined', { 
      roomId: roomId,
      creatorName: room.creatorName,
      messages: room.messages,
      participants: room.participants.length,
      maxParticipants: room.settings.maxParticipants,
      participantList: getParticipantList(room)
    });

    // Notify all existing participants about new user
    room.participants.forEach(pid => {
      if (pid !== socket.id) {
        io.to(pid).emit('user-joined', { 
          odId: socket.id,
          name: user?.name || 'Anonymous'
        });
        
        // Send existing participant info to new joiner
        const existingUser = users.get(pid);
        socket.emit('participant-joined', {
          odId: pid,
          name: existingUser?.name || 'Anonymous',
          isMuted: existingUser?.isMuted || false,
          isVideoOff: existingUser?.isVideoOff || false
        });
      }
    });
    
    console.log(`✅ User joined: ${roomId} (${room.participants.length} participants)`);
  });

  // Get participant list helper
  function getParticipantList(room) {
    return room.participants.map(pid => {
      const user = users.get(pid);
      return {
        odId: pid,
        name: user?.name || 'Anonymous',
        isMuted: user?.isMuted || false,
        isVideoOff: user?.isVideoOff || false
      };
    });
  }

  // WebRTC Signaling - Offer (broadcast to all participants in mesh)
  socket.on('offer', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    const targetId = data.targetId; // Specific target or broadcast to all
    const offer = data.offer;
    
    // Store offer
    room.offers.set(socket.id, offer);
    
    if (targetId) {
      // Send to specific participant
      io.to(targetId).emit('offer', {
        offer: offer,
        from: socket.id,
        fromName: user?.name || 'Anonymous'
      });
    } else {
      // Broadcast to all other participants (mesh topology)
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('offer', {
            offer: offer,
            from: socket.id,
            fromName: user?.name || 'Anonymous'
          });
        }
      });
    }
  });

  // WebRTC Signaling - Answer
  socket.on('answer', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    const targetId = data.targetId;
    const answer = data.answer;
    
    // Store answer
    room.answers.set(socket.id, answer);
    
    // Send to specific participant
    if (targetId) {
      io.to(targetId).emit('answer', {
        answer: answer,
        from: socket.id
      });
    }
  });

  // WebRTC Signaling - ICE Candidates (broadcast to all)
  socket.on('ice-candidate', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    const targetId = data.targetId;
    const candidate = data.candidate;
    
    // Store ICE candidates for this peer
    if (!room.iceCandidates.has(socket.id)) {
      room.iceCandidates.set(socket.id, []);
    }
    room.iceCandidates.get(socket.id).push(candidate);

    if (targetId) {
      // Send to specific participant
      io.to(targetId).emit('ice-candidate', { 
        candidate: candidate, 
        from: socket.id 
      });
    } else {
      // Broadcast to all other participants
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('ice-candidate', { 
            candidate: candidate, 
            from: socket.id 
          });
        }
      });
    }
  });

  // Request for ice-candidates from a specific participant
  socket.on('request-ice-candidates', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;
    
    const targetId = data.targetId;
    
    // Send stored ICE candidates to the requester
    const storedCandidates = room.iceCandidates.get(targetId);
    if (storedCandidates) {
      storedCandidates.forEach(candidate => {
        socket.emit('ice-candidate', { candidate, from: targetId });
      });
    }
  });

  // Media state changes
  socket.on('media-state', (state) => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    user.isVideoEnabled = state.video;
    user.isAudioEnabled = state.audio;
    user.isScreenSharing = state.screenShare || false;
    user.isMuted = state.muted || false;
    user.isVideoOff = state.videoOff || false;

    // Broadcast to all participants
    const room = rooms.get(user.roomId);
    if (room) {
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('partner-media-state', {
            odId: socket.id,
            name: user.name,
            video: state.video,
            audio: state.audio,
            screenShare: state.screenShare,
            muted: state.muted,
            videoOff: state.videoOff
          });
        }
      });
    }
  });

  // Chat message (broadcast to all)
  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    const message = {
      id: Date.now(),
      sender: user?.name || 'Anonymous',
      senderId: socket.id,
      text: String(data.text).substring(0, 1000),
      timestamp: Date.now()
    };

    room.messages.push(message);
    
    // Keep only last 100 messages
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    // Broadcast to all participants in room
    io.to(user.roomId).emit('chat-message', message);
  });

  // Typing indicator (broadcast to all)
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (user?.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.participants.forEach(pid => {
          if (pid !== socket.id) {
            io.to(pid).emit('user-typing', { 
              name: user.name, 
              odId: socket.id,
              isTyping 
            });
          }
        });
      }
    }
  });

  // Mute status (broadcast to all)
  socket.on('mute-status', (isMuted) => {
    const user = users.get(socket.id);
    if (user?.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.participants.forEach(pid => {
          if (pid !== socket.id) {
            io.to(pid).emit('partner-muted', { 
              odId: socket.id,
              name: user.name,
              isMuted 
            });
          }
        });
      }
    }
  });

  // Hang up (notify all participants)
  socket.on('hang-up', () => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    console.log(`📵 Hang up: ${user.roomId} - User: ${socket.id}`);
    
    const room = rooms.get(user.roomId);
    if (room) {
      // Notify all other participants
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('call-ended', { 
            reason: `${user.name} ended the call`,
            endedBy: user.name,
            leftId: socket.id
          });
        }
      });
      
      // Remove participant from room
      room.participants = room.participants.filter(p => p !== socket.id);
      
      // Clean up room data for this participant
      room.offers.delete(socket.id);
      room.answers.delete(socket.id);
      room.iceCandidates.delete(socket.id);
      
      // If room is empty, delete it
      if (room.participants.length === 0) {
        rooms.delete(user.roomId);
        console.log(`🗑️ Room deleted (empty): ${user.roomId}`);
      }
    }
    
    user.roomId = null;
    user.role = null;
  });

  // Leave room explicitly
  socket.on('leave-room', () => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    const room = rooms.get(user.roomId);
    if (room) {
      // Notify others
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('user-left', { 
            name: user.name,
            odId: socket.id
          });
        }
      });
      
      // Remove participant
      room.participants = room.participants.filter(p => p !== socket.id);
      room.offers.delete(socket.id);
      room.answers.delete(socket.id);
      room.iceCandidates.delete(socket.id);
      
      // Delete room if empty or creator left
      if (room.participants.length === 0 || room.creator === socket.id) {
        rooms.delete(user.roomId);
      }
    }
    
    user.roomId = null;
    user.role = null;
    socket.leave(user.roomId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    const user = users.get(socket.id);
    if (user?.roomId) {
      const room = rooms.get(user.roomId);
      
      if (room) {
        // Notify all remaining participants
        room.participants.forEach(pid => {
          io.to(pid).emit('user-left', { 
            name: user.name,
            odId: socket.id
          });
        });

        // Remove from participants
        room.participants = room.participants.filter(p => p !== socket.id);
        
        // Clean up
        room.offers.delete(socket.id);
        room.answers.delete(socket.id);
        room.iceCandidates.delete(socket.id);

        // Delete room if empty or creator left
        if (room.participants.length === 0 || room.creator === socket.id) {
          rooms.delete(user.roomId);
          console.log(`🗑️ Room deleted: ${user.roomId}`);
        }
      }
    }

    users.delete(socket.id);
  });
});

// Cleanup room helper
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    room.participants.forEach(pid => {
      const user = users.get(pid);
      if (user) {
        user.roomId = null;
        user.role = null;
      }
    });
    rooms.delete(roomId);
  }
}

// ============================================
// ROUTES
// ============================================

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve video call app
app.get('/live', (req, res) => {
  res.sendFile(path.join(__dirname, 'live', 'index.html'));
});

// Serve voice call app
app.get('/voice', (req, res) => {
  res.sendFile(path.join(__dirname, 'voice', 'index.html'));
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'ConnectPro',
    uptime: process.uptime()
  });
});

app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    id: room.id,
    participants: room.participants.length,
    maxParticipants: room.settings.maxParticipants,
    appType: room.appType,
    createdAt: room.createdAt
  });
});

// ============================================
// CLEANUP OLD ROOMS
// ============================================
setInterval(() => {
  const now = Date.now();
  const maxAge = 3 * 60 * 60 * 1000; // 3 hours

  rooms.forEach((room, roomId) => {
    if (now - room.createdAt > maxAge) {
      io.to(roomId).emit('room-expired', { message: 'Room expired due to inactivity' });
      cleanupRoom(roomId);
      console.log(`🗑️ Expired room cleaned: ${roomId}`);
    }
  });
}, 10 * 60 * 1000); // Check every 10 minutes

// ============================================
// HTTPS CONFIGURATION
// For production, use proper SSL certificates
// ============================================
const fs = require('fs');
const https = require('https');

// Check for SSL certificates (create with generate-certs.js for development)
const SSL_OPTIONS = {
  key: process.env.SSL_KEY_PATH && fs.existsSync(process.env.SSL_KEY_PATH) 
    ? fs.readFileSync(process.env.SSL_KEY_PATH) 
    : null,
  cert: process.env.SSL_CERT_PATH && fs.existsSync(process.env.SSL_CERT_PATH) 
    ? fs.readFileSync(process.env.SSL_CERT_PATH) 
    : null
};

const isHTTPS = SSL_OPTIONS.key && SSL_OPTIONS.cert;

// Force HTTPS in production (when SSL certificates are present)
if (isHTTPS || process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      // Redirect to HTTPS
      const httpsPort = process.env.HTTPS_PORT || 443;
      res.redirect(`https://${req.hostname}${req.url}`);
    } else {
      next();
    }
  });
  
  console.log('🔒 HTTPS mode enabled');
}

// ============================================
// START SERVER
// ============================================
const startServer = () => {
  if (isHTTPS) {
    // Start HTTPS server
    const httpsServer = https.createServer(SSL_OPTIONS, app);
    const httpsPort = process.env.HTTPS_PORT || 3443;
    
    // Attach Socket.IO to HTTPS server
    const io = require('socket.io')(httpsServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
      pingTimeout: 60000,
      pingInterval: 25000
    });
    
    // Re-initialize Socket.IO handlers for HTTPS
    // (The io.on('connection') is already set up above, just need to attach)
    
    httpsServer.listen(httpsPort, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║        🚀 HeartSpace Server v3.0 (HTTPS) 🚀            ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  🌐 HTTPS:   https://localhost:${httpsPort}                  ║`);
      console.log('║  📄 Landing:  / (HeartSpace Home)                    ║');
      console.log('║  📹 Video:    /live (Video Calls)                   ║');
      console.log('║  📞 Voice:    /voice (Voice Calls)                 ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📋 Quick Start:');
      console.log(`   1. Landing: https://localhost:${httpsPort}`);
      console.log(`   2. Video:   https://localhost:${httpsPort}/live`);
      console.log(`   3. Voice:   https://localhost:${httpsPort}/voice`);
      console.log('');
    });
    
    console.log('✅ HTTPS Server running');
  } else {
    // Start HTTP server (development mode)
    server.listen(PORT, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║           🚀 HeartSpace Server v3.0 🚀                ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  🌐 URL:      http://localhost:${PORT}                      ║`);
      console.log('║  📄 Landing:  / (HeartSpace Home)                   ║');
      console.log('║  📹 Video:    /live (Video Calls)                    ║');
      console.log('║  📞 Voice:    /voice (Voice Calls)                  ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📋 Quick Start:');
      console.log('   1. Landing: http://localhost:3000');
      console.log('   2. Video:  http://localhost:3000/live');
      console.log('   3. Voice:  http://localhost:3000/voice');
      console.log('');
      console.log('💡 For HTTPS in production, add SSL certificates');
      console.log('   and set SSL_KEY_PATH and SSL_CERT_PATH env vars');
      console.log('');
    });
  }
};

startServer();

