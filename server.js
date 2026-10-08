const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Расширенная база карт с точными корнями
const ALL_CARDS = [
  { id: 1, eq: "25x² + 21x - 4 = 0", topAnswer: "-1", roots: [-1, 0.16] },
  { id: 2, eq: "2x² + 7x + 6 = 0", topAnswer: "-2", roots: [-2, -1.5] },
  { id: 3, eq: "x² + x - 20 = 0", topAnswer: "4", roots: [-5, 4] },
  { id: 4, eq: "2x² - 6x + 4 = 0", topAnswer: "2", roots: [1, 2] },
  { id: 5, eq: "x² - 16x + 48 = 0", topAnswer: "12", roots: [4, 12] },
  { id: 6, eq: "2x² + 3x + 1 = 0", topAnswer: "-0,5", roots: [-1, -0.5] },
  { id: 7, eq: "x² - 6x + 5 = 0", topAnswer: "5", roots: [1, 5] },
  { id: 8, eq: "5x² + 14x + 8 = 0", topAnswer: "-0,8", roots: [-2, -0.8] },
  { id: 9, eq: "x² + 5x - 24 = 0", topAnswer: "3", roots: [-8, 3] },
  { id: 10, eq: "x² - 4x - 12 = 0", topAnswer: "6", roots: [-2, 6] },
  { id: 11, eq: "x² - 12x + 27 = 0", topAnswer: "9", roots: [3, 9] },
  { id: 12, eq: "5x² - 17x + 6 = 0", topAnswer: "3", roots: [0.4, 3] }
];

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

const rooms = {};

io.on('connection', (socket) => {
  socket.on('createRoom', ({ maxPlayers, playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      maxPlayers: parseInt(maxPlayers),
      players: [{ id: socket.id, name: playerName, score: 0, penalizedUntil: 0 }],
      currentRound: 0,
      maxRounds: 10,
      centerCard: null,
      options: [],
      started: false,
      roundAnswered: false
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', 'Бөлме табылмады / Комната не найдена');
    if (room.started) return socket.emit('errorMsg', 'Ойын басталып кетті / Игра уже началась');
    if (room.players.length >= room.maxPlayers) return socket.emit('errorMsg', 'Бөлме толы / Комната заполнена');

    room.players.push({ id: socket.id, name: playerName, score: 0, penalizedUntil: 0 });
    socket.join(roomId);

    socket.emit('joinedRoom', { roomId, players: room.players });
    socket.to(roomId).emit('playerJoined', { players: room.players });
  });

  socket.on('startGameHost', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players[0].id === socket.id) {
      room.started = true;
      nextRound(roomId);
    } else {
      socket.emit('errorMsg', 'Тек бөлме иесі бастай алады / Только создатель может начать');
    }
  });

  socket.on('submitAnswer', ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || !room.started || room.roundAnswered) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const now = Date.now();
    if (now < player.penalizedUntil) {
      const remainingSec = Math.ceil((player.penalizedUntil - now) / 1000);
      return socket.emit('errorMsg', `Айыппұл! ${remainingSec} секунд күтіңіз / Штраф! Подождите ${remainingSec} сек.`);
    }

    const selectedOption = room.options.find(c => c.id === cardId);
    if (!selectedOption) return;

    const selAns = parseFloat(selectedOption.topAnswer.replace(',', '.'));
    const isCorrect = room.centerCard.roots.some(r => Math.abs(r - selAns) < 0.05);

    if (isCorrect) {
      room.roundAnswered = true; // Блокируем раунд, так как первый ответил верно
      player.score += 1;

      // Уведомляем победителя и остальных
      io.to(roomId).emit('roundWon', {
        winnerName: player.name,
        message: `${player.name} бірінші дұрыс тапты! (+1 ұпай)`
      });

      // Переход к следующему раунду через 2 секунды
      setTimeout(() => nextRound(roomId), 2000);
    } else {
      player.penalizedUntil = Date.now() + 3000;
      socket.emit('errorMsg', 'Қате жауап! 3 секундқа құлыпталдыңыз / Неверно! Штраф 3 секунды.');
    }
  });
});

function nextRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.currentRound++;
  room.roundAnswered = false;

  if (room.currentRound > room.maxRounds) {
    room.players.sort((a, b) => b.score - a.score);
    io.to(roomId).emit('gameOver', { players: room.players });
    delete rooms[roomId];
    return;
  }

  const shuffled = shuffle([...ALL_CARDS]);
  room.centerCard = shuffled[0];
  
  // Создаем 10 вариантов ответов для максимальной путаницы
  let opts = [room.centerCard];
  while (opts.length < 10) {
    const randomCard = ALL_CARDS[Math.floor(Math.random() * ALL_CARDS.length)];
    if (!opts.some(c => c.id === randomCard.id)) {
      opts.push(randomCard);
    }
  }
  room.options = shuffle(opts);

  io.to(roomId).emit('nextRoundData', {
    round: room.currentRound,
    maxRounds: room.maxRounds,
    centerCard: room.centerCard,
    options: room.options
  });
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});