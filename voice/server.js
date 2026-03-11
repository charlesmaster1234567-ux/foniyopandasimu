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

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(__dirname));

// Room Storage
const rooms = new Map();
const users = new Map();

io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  
  users.set(socket.id, {
    id: socket.id,
    name: 'Anonymous',
    roomId: null,
    role: null
  });

  socket.on('set-name', (name) => {
    const user = users.get(socket.id);
    if (user) user.name = name || 'Anonymous';
  });

  socket.on('create-room', (data) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const user = users.get(socket.id);
    
    console.log(`📦 Creating room: ${roomId}`);

    if (rooms.has(roomId)) {
      socket.emit('error', { type: 'room-exists', message: 'Room already exists! Try a different name or click Join.' });
      return;
    }

    const room = {
      id: roomId,
      creator: socket.id,
      creatorName: user?.name || 'Anonymous',
      joiner: null,
      joinerName: null,
      offer: null,
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      messages: [],
      createdAt: Date.now()
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    
    if (user) {
      user.roomId = roomId;
      user.role = 'caller';
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    socket.emit('room-created', { 
      roomId: roomId,
      shareLink: `${baseUrl}?room=${roomId}`
    });
    
    console.log(`✅ Room created: ${roomId}`);
  });

  socket.on('join-room', (data) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const user = users.get(socket.id);
    
    console.log(`🚪 Joining room: ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { 
        type: 'room-not-found', 
        message: 'Room not found! Make sure your partner clicked "Create Room" first.' 
      });
      return;
    }

    if (room.joiner && room.joiner !== socket.id) {
      socket.emit('error', { type: 'room-full', message: 'Room is full! Only 2 people allowed.' });
      return;
    }

    room.joiner = socket.id;
    room.joinerName = user?.name || 'Anonymous';
    socket.join(roomId);

    if (user) {
      user.roomId = roomId;
      user.role = 'callee';
    }

    socket.emit('room-joined', { 
      roomId: roomId,
      creatorName: room.creatorName,
      messages: room.messages
    });

    if (room.offer) {
      socket.emit('offer', room.offer);
    }

    room.callerCandidates.forEach(candidate => {
      socket.emit('ice-candidate', { candidate, from: 'caller' });
    });

    io.to(room.creator).emit('user-joined', { 
      odId: socket.id,
      name: room.joinerName
    });
    
    console.log(`✅ User joined: ${roomId}`);
  });

  socket.on('offer', (offer) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    room.offer = offer;
    
    if (room.joiner) {
      io.to(room.joiner).emit('offer', offer);
    }
  });

  socket.on('answer', (answer) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    room.answer = answer;
    io.to(room.creator).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    if (user.role === 'caller') {
      room.callerCandidates.push(candidate);
      if (room.joiner) {
        io.to(room.joiner).emit('ice-candidate', { candidate, from: 'caller' });
      }
    } else {
      room.calleeCandidates.push(candidate);
      io.to(room.creator).emit('ice-candidate', { candidate, from: 'callee' });
    }
  });

  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    const room = rooms.get(user?.roomId);
    if (!room) return;

    const message = {
      id: Date.now(),
      sender: user?.name || 'Anonymous',
      senderId: socket.id,
      text: data.text,
      timestamp: Date.now()
    };

    room.messages.push(message);
    io.to(user.roomId).emit('chat-message', message);
  });

  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (user?.roomId) {
      socket.to(user.roomId).emit('user-typing', { name: user.name, isTyping });
    }
  });

  socket.on('mute-status', (isMuted) => {
    const user = users.get(socket.id);
    if (user?.roomId) {
      socket.to(user.roomId).emit('partner-muted', { isMuted });
    }
  });

  socket.on('hang-up', () => {
    const user = users.get(socket.id);
    if (!user?.roomId) return;

    console.log(`📵 Hang up: ${user.roomId}`);
    socket.to(user.roomId).emit('call-ended', { reason: 'Partner ended the call' });
    rooms.delete(user.roomId);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    const user = users.get(socket.id);
    if (user?.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        socket.to(user.roomId).emit('user-left', { name: user.name });

        if (room.creator === socket.id) {
          rooms.delete(user.roomId);
        } else if (room.joiner === socket.id) {
          room.joiner = null;
          room.joinerName = null;
          room.answer = null;
          room.calleeCandidates = [];
        }
      }
    }

    users.delete(socket.id);
  });
});

// API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, users: users.size });
});

app.get('/api/check-room/:roomId', (req, res) => {
  const exists = rooms.has(req.params.roomId);
  res.json({ exists, roomId: req.params.roomId });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Cleanup old rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) { // 2 hours
      rooms.delete(roomId);
      console.log(`🗑️ Cleaned: ${roomId}`);
    }
  });
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          💕 HeartSpace Calls Server v4.0 💕          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  🌐 URL:    http://localhost:${PORT}                      ║`);
  console.log('║  📡 Status: Running                                  ║');
  console.log('║  🔧 Mode:   Self-hosted (No Firebase)                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Quick Start:');
  console.log('   1. Open two browser windows');
  console.log('   2. Window 1: Click "Create Room"');
  console.log('   3. Window 2: Enter same Room ID, click "Join Room"');
  console.log('   4. Enjoy your call! 🎉');
  console.log('');
});