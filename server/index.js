const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { LEVELS, MONSTER_TYPES, ITEM_DEFS } = require('../shared/data');
const { GameRoom } = require('./gameRoom');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> GameRoom

function genCode() {
  let c;
  do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(c));
  return c;
}

io.on('connection', (socket) => {
  socket.on('createRoom', (name, cb) => {
    const code = genCode();
    const room = new GameRoom(code, io);
    rooms.set(code, room);
    room.addPlayer(socket, name);
    cb({ code, playerId: socket.id });
  });

  socket.on('joinRoom', (code, name, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ error: 'Room not found' });
    if (room.players.size >= 4) return cb({ error: 'Room full' });
    room.addPlayer(socket, name);
    cb({ code, playerId: socket.id });
  });

  socket.on('startRun', () => {
    const room = findRoomBySocket(socket);
    if (room) room.startRun();
  });

  socket.on('buyItem', (itemKey) => {
    const room = findRoomBySocket(socket);
    if (room) room.buyItem(socket.id, itemKey);
  });

  socket.on('input', (input) => {
    const room = findRoomBySocket(socket);
    if (room) room.handleInput(socket.id, input);
  });

  socket.on('interact', (data) => {
    const room = findRoomBySocket(socket);
    if (room) room.handleInteract(socket.id, data);
  });

  socket.on('nextLevel', () => {
    const room = findRoomBySocket(socket);
    if (room) room.nextLevel();
  });

  socket.on('sellAtVan', () => {
    const room = findRoomBySocket(socket);
    if (room) room.sellAtVan(socket.id);
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket);
    if (room) {
      room.removePlayer(socket.id);
      if (room.players.size === 0) {
        room.stop();
        rooms.delete(room.code);
      }
    }
  });

  function findRoomBySocket(s) {
    for (const room of rooms.values()) {
      if (room.players.has(s.id)) return room;
    }
    return null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ghost Heist server running on port ${PORT}`));
