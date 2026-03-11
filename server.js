/**
 * HeartSpace Server v5.5
 * Handles both Voice and Live Video apps
 * With proper room management
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// ============================================
// STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname)));
app.use('/voice', express.static(path.join(__dirname, 'voice')));
app.use('/live', express.static(path.join(__dirname, 'live')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/voice', (req, res) => {
  res.sendFile(path.join(__dirname, 'voice', 'index.html'));
});

app.get('/live', (req, res) => {
  res.sendFile(path.join(__dirname, 'live', 'index.html'));
});

// Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// ============================================
// ROOM MANAGEMENT
// ============================================
const rooms = new Map();

/*
  Room structure:
  {
    id: string,
    creator: socketId,
    creatorName: string,
    participants: Map<socketId, { name, appType }>,
    createdAt: Date
  }
*/

function createRoom(roomId, creatorId, creatorName, appType) {
  const room = {
    id: roomId,
    creator: creatorId,
    creatorName: creatorName || 'Anonymous',
    appType: appType || 'voice',
    participants: new Map(),
    createdAt: new Date()
  };
  
  room.participants.set(creatorId, {
    name: creatorName || 'Anonymous',
    appType: appType
  });
  
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
  console.log(`🗑️ Room deleted: ${roomId}`);
}

function joinRoom(roomId, odayId, userName, appType) {
  const room = rooms.get(roomId);
  if (!room) return null;
  
  room.participants.set(socketId, {
    name: userName || 'Anonymous',
    appType: appType
  });
  
  return room;
}

function leaveRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.participants.delete(socketId);
  
  // Delete room if empty
  if (room.participants.size === 0) {
    deleteRoom(roomId);
  }
  
  return room;
}

function getRoomBySocket(socketId) {
  for (const [roomId, room] of rooms) {
    if (room.participants.has(socketId)) {
      return room;
    }
  }
  return null;
}

// ============================================
// SOCKET HANDLING
// ============================================
io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  
  // User data
  let userData = {
    name: 'Anonymous',
    appType: 'voice',
    currentRoom: null
  };

  // ----------------------------------------
  // SET USER INFO
  // ----------------------------------------
  socket.on('set-name', (name) => {
    userData.name = name || 'Anonymous';
    console.log(`👤 ${socket.id} set name: ${userData.name}`);
  });

  socket.on('set-app-type', (type) => {
    userData.appType = type || 'voice';
    console.log(`📱 ${socket.id} app type: ${userData.appType}`);
  });

  // ----------------------------------------
  // CREATE ROOM
  // ----------------------------------------
  socket.on('create-room', (roomId) => {
    console.log(`🏠 Creating room: ${roomId}`);
    
    // Validate room ID
    if (!roomId || typeof roomId !== 'string' || roomId.trim().length < 3) {
      socket.emit('error', { message: 'Invalid room ID' });
      return;
    }
    
    const cleanRoomId = roomId.trim();
    
    // Check if room exists
    if (rooms.has(cleanRoomId)) {
      socket.emit('error', { message: 'Room already exists. Try joining instead.' });
      return;
    }
    
    // Leave any existing room
    if (userData.currentRoom) {
      socket.leave(userData.currentRoom);
      leaveRoom(userData.currentRoom, socket.id);
    }
    
    // Create the room
    const room = createRoom(cleanRoomId, socket.id, userData.name, userData.appType);
    userData.currentRoom = cleanRoomId;
    
    // Join socket room
    socket.join(cleanRoomId);
    
    // Generate share link
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.HOST || `localhost:${PORT}`;
    const appPath = userData.appType === 'video' ? '/live' : '/voice';
    const shareLink = `${protocol}://${host}${appPath}?room=${encodeURIComponent(cleanRoomId)}`;
    
    // Send success
    socket.emit('room-created', {
      roomId: cleanRoomId,
      shareLink: shareLink
    });
    
    console.log(`✅ Room created: ${cleanRoomId} by ${userData.name}`);
  });

  // ----------------------------------------
  // JOIN ROOM
  // ----------------------------------------
  socket.on('join-room', (roomId) => {
    console.log(`🚪 Joining room: ${roomId}`);
    
    // Validate
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', { message: 'Invalid room ID' });
      return;
    }
    
    const cleanRoomId = roomId.trim();
    const room = getRoom(cleanRoomId);
    
    // Check if room exists
    if (!room) {
      socket.emit('error', { message: 'Room not found. Create it first.' });
      return;
    }
    
    // Check if already in room
    if (room.participants.has(socket.id)) {
      console.log(`⚠️ ${socket.id} already in room ${cleanRoomId}`);
      socket.emit('room-joined', {
        roomId: cleanRoomId,
        creatorName: room.creatorName
      });
      return;
    }
    
    // Check room capacity (max 2 for calls)
    if (room.participants.size >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    // Leave any existing room
    if (userData.currentRoom && userData.currentRoom !== cleanRoomId) {
      socket.leave(userData.currentRoom);
      leaveRoom(userData.currentRoom, socket.id);
    }
    
    // Add to room
    room.participants.set(socket.id, {
      name: userData.name,
      appType: userData.appType
    });
    userData.currentRoom = cleanRoomId;
    
    // Join socket room
    socket.join(cleanRoomId);
    
    // Notify joiner
    socket.emit('room-joined', {
      roomId: cleanRoomId,
      creatorName: room.creatorName
    });
    
    // Notify creator
    socket.to(cleanRoomId).emit('user-joined', {
      id: socket.id,
      name: userData.name
    });
    
    console.log(`✅ ${userData.name} joined room: ${cleanRoomId} (${room.participants.size} participants)`);
  });

  // ----------------------------------------
  // WEBRTC SIGNALING
  // ----------------------------------------
  socket.on('offer', (data) => {
    if (!userData.currentRoom) return;
    
    console.log(`📤 Offer from ${socket.id} in ${userData.currentRoom}`);
    
    socket.to(userData.currentRoom).emit('offer', {
      offer: data.offer,
      from: socket.id,
      fromName: userData.name
    });
  });

  socket.on('answer', (data) => {
    if (!userData.currentRoom) return;
    
    console.log(`📥 Answer from ${socket.id} in ${userData.currentRoom}`);
    
    if (data.targetId) {
      // Send to specific user
      io.to(data.targetId).emit('answer', {
        answer: data.answer,
        from: socket.id,
        fromName: userData.name
      });
    } else {
      // Broadcast to room
      socket.to(userData.currentRoom).emit('answer', {
        answer: data.answer,
        from: socket.id,
        fromName: userData.name
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    if (!userData.currentRoom) return;
    
    socket.to(userData.currentRoom).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // ----------------------------------------
  // CHAT / MESSAGES
  // ----------------------------------------
  socket.on('chat-message', (data) => {
    if (!userData.currentRoom) return;
    
    const message = {
      senderId: socket.id,
      sender: userData.name,
      text: data.text || '',
      type: data.type || 'text',
      audioData: data.audioData,
      duration: data.duration,
      timestamp: new Date().toISOString()
    };
    
    // Send to everyone in room including sender
    io.in(userData.currentRoom).emit('chat-message', message);
    
    console.log(`💬 Message in ${userData.currentRoom} from ${userData.name}`);
  });

  socket.on('typing', (isTyping) => {
    if (!userData.currentRoom) return;
    
    socket.to(userData.currentRoom).emit('user-typing', {
      userId: socket.id,
      name: userData.name,
      isTyping: isTyping
    });
  });

  // ----------------------------------------
  // CALL STATUS
  // ----------------------------------------
  socket.on('mute-status', (isMuted) => {
    if (!userData.currentRoom) return;
    
    socket.to(userData.currentRoom).emit('partner-muted', {
      id: socket.id,
      isMuted: isMuted
    });
  });

  socket.on('video-status', (isOff) => {
    if (!userData.currentRoom) return;
    
    socket.to(userData.currentRoom).emit('partner-video', {
      id: socket.id,
      isOff: isOff
    });
  });

  socket.on('screen-share-status', (isSharing) => {
    if (!userData.currentRoom) return;
    
    socket.to(userData.currentRoom).emit('partner-screen-share', {
      id: socket.id,
      isSharing: isSharing
    });
  });

  // ----------------------------------------
  // HANG UP
  // ----------------------------------------
  socket.on('hang-up', () => {
    if (!userData.currentRoom) return;
    
    const roomId = userData.currentRoom;
    
    console.log(`📞 ${userData.name} hanging up from ${roomId}`);
    
    // Notify others
    socket.to(roomId).emit('call-ended', {
      id: socket.id,
      name: userData.name
    });
    
    // Leave room
    socket.leave(roomId);
    leaveRoom(roomId, socket.id);
    userData.currentRoom = null;
  });

  // ----------------------------------------
  // DISCONNECT
  // ----------------------------------------
  socket.on('disconnect', (reason) => {
    console.log(`❌ Disconnected: ${socket.id} (${reason})`);
    
    if (userData.currentRoom) {
      const roomId = userData.currentRoom;
      
      // Notify others
      socket.to(roomId).emit('user-left', {
        id: socket.id,
        name: userData.name
      });
      
      // Clean up
      leaveRoom(roomId, socket.id);
      userData.currentRoom = null;
    }
  });
});

// ============================================
// CLEANUP
// ============================================
// Clean up empty rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  
  for (const [roomId, room] of rooms) {
    // Delete rooms older than 1 hour with no participants
    if (room.participants.size === 0) {
      deleteRoom(roomId);
    }
    // Delete rooms older than 24 hours regardless
    else if (now - room.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      // Notify participants
      io.in(roomId).emit('error', { message: 'Room expired' });
      deleteRoom(roomId);
    }
  }
}, 5 * 60 * 1000);

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║         HeartSpace Server v5.5            ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  🌐 Server: http://localhost:${PORT}         ║`);
  console.log(`║  📞 Voice:  http://localhost:${PORT}/voice   ║`);
  console.log(`║  📹 Video:  http://localhost:${PORT}/live    ║`);
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  
  // Notify all clients
  io.emit('error', { message: 'Server shutting down' });
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});