/**
 * HeartSpace Video Server v6.0
 * Video Conferencing with Screen Sharing
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
  pingInterval: 25000,
  maxHttpBufferSize: 1e8 // 100 MB for large data
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================
// DATA STORAGE
// ============================================
const rooms = new Map();
const users = new Map();

// ============================================
// SOCKET.IO HANDLERS
// ============================================
io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  
  // Initialize user
  users.set(socket.id, {
    id: socket.id,
    name: 'Anonymous',
    roomId: null,
    role: null,
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false
  });

  // Set user name
  socket.on('set-name', (name) => {
    const user = users.get(socket.id);
    if (user) {
      user.name = (name || 'Anonymous').substring(0, 30);
      console.log(`👤 ${socket.id} set name: ${user.name}`);
    }
  });

  // Create room
  socket.on('create-room', (roomId) => {
    const user = users.get(socket.id);
    roomId = String(roomId).trim().substring(0, 50);
    
    console.log(`📦 Creating room: ${roomId}`);

    if (rooms.has(roomId)) {
      socket.emit('error', { 
        type: 'room-exists', 
        message: 'Room already exists! Try a different name or join it.' 
      });
      return;
    }

    // Create new room
    const room = {
      id: roomId,
      creator: socket.id,
      creatorName: user?.name || 'Anonymous',
      participants: [socket.id],
      offer: null,
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      messages: [],
      settings: {
        maxParticipants: 2,
        videoEnabled: true,
        audioEnabled: true
      },
      createdAt: Date.now()
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    
    if (user) {
      user.roomId = roomId;
      user.role = 'creator';
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    
    socket.emit('room-created', { 
      roomId: roomId,
      shareLink: `${baseUrl}?room=${encodeURIComponent(roomId)}`
    });
    
    console.log(`✅ Room created: ${roomId}`);
  });

  // Join room
  socket.on('join-room', (roomId) => {
    const user = users.get(socket.id);
    roomId = String(roomId).trim();
    
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
        message: 'Room is full! Maximum 2 participants.' 
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
      participants: room.participants.length
    });

    // Send existing offer if available
    if (room.offer) {
      socket.emit('offer', room.offer);
    }

    // Send existing ICE candidates
    room.callerCandidates.forEach(candidate => {
      socket.emit('ice-candidate', { candidate, from: 'caller' });
    });

    // Notify creator
    io.to(room.creator).emit('user-joined', { 
      odId: socket.id,
      name: user?.name || 'Anonymous'
    });
    
    console.log(`✅ User joined: ${roomId} (${room.participants.length} participants)`);
  });

  // WebRTC Signaling - Offer
  socket.on('offer', (offer) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    room.offer = offer;
    
    // Send to all other participants
    room.participants.forEach(pid => {
      if (pid !== socket.id) {
        io.to(pid).emit('offer', offer);
      }
    });
  });

  // WebRTC Signaling - Answer
  socket.on('answer', (answer) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    room.answer = answer;
    io.to(room.creator).emit('answer', answer);
  });

  // WebRTC Signaling - ICE Candidates
  socket.on('ice-candidate', (candidate) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    if (user.role === 'creator') {
      room.callerCandidates.push(candidate);
      room.participants.forEach(pid => {
        if (pid !== socket.id) {
          io.to(pid).emit('ice-candidate', { candidate, from: 'caller' });
        }
      });
    } else {
      room.calleeCandidates.push(candidate);
      io.to(room.creator).emit('ice-candidate', { candidate, from: 'callee' });
    }
  });

  // Media state changes
  socket.on('media-state', (state) => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    user.isVideoEnabled = state.video;
    user.isAudioEnabled = state.audio;
    user.isScreenSharing = state.screenShare || false;

    socket.to(user.roomId).emit('partner-media-state', {
      odId: socket.id,
      name: user.name,
      video: state.video,
      audio: state.audio,
      screenShare: state.screenShare
    });
  });

  // Chat message
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

    io.to(user.roomId).emit('chat-message', message);
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (user?.roomId) {
      socket.to(user.roomId).emit('user-typing', { 
        name: user.name, 
        isTyping 
      });
    }
  });

  // Hang up
  socket.on('hang-up', () => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    console.log(`📵 Hang up: ${user.roomId}`);
    
    socket.to(user.roomId).emit('call-ended', { 
      reason: 'Partner ended the call',
      endedBy: user.name
    });
    
    // Clean up room
    cleanupRoom(user.roomId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    const user = users.get(socket.id);
    if (user?.roomId) {
      const room = rooms.get(user.roomId);
      
      if (room) {
        socket.to(user.roomId).emit('user-left', { 
          name: user.name,
          odId: socket.id
        });

        // Remove from participants
        room.participants = room.participants.filter(p => p !== socket.id);

        // Delete room if empty or creator left
        if (room.participants.length === 0 || room.creator === socket.id) {
          rooms.delete(user.roomId);
          console.log(`🗑️ Room deleted: ${user.roomId}`);
        }
      }
    }

    users.delete(socket.id);
  });

  // Reconnection
  socket.on('reconnect-attempt', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', { type: 'room-gone', message: 'Room no longer exists' });
      return;
    }
    
    socket.emit('reconnect-success', { roomId: data.roomId });
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
// API ROUTES
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size, 
    users: users.size,
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
    createdAt: room.createdAt
  });
});

// Serve app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           💕 HeartSpace Video Server v6.0 💕           ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  🌐 URL:      http://localhost:${PORT}                      ║`);
  console.log('║  📹 Video:    HD Support                               ║');
  console.log('║  🖥️  Screen:   Screen Sharing                          ║');
  console.log('║  💬 Chat:     Live Messaging                           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Quick Start:');
  console.log('   1. Open two browser windows/tabs');
  console.log('   2. Window 1: Click "Create Room"');
  console.log('   3. Window 2: Enter same Room ID → Click "Join"');
  console.log('   4. Start your video call! 🎉');
  console.log('');
});