const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// База карт (теперь без подсказок цифр на карточках)
const ALL_CARDS = [
  { id: 1, eq: "25x² + 21x - 4 = 0", roots: [-1, 0.16] },
  { id: 2, eq: "2x² + 7x + 6 = 0", roots: [-2, -1.5] },
  { id: 3, eq: "x² + x - 20 = 0", roots: [-5, 4] },
  { id: 4, eq: "2x² - 6x + 4 = 0", roots: [1, 2] },
  { id: 5, eq: "x² - 16x + 48 = 0", roots: [4, 12] },
  { id: 6, eq: "2x² + 3x + 1 = 0", roots: [-1, -0.5] },
  { id: 7, eq: "x² - 6x + 5 = 0", roots: [1, 5] },
  { id: 8, eq: "5x² + 14x + 8 = 0", roots: [-2, -0.8] },
  { id: 9, eq: "x² + 5x - 24 = 0", roots: [-8, 3] },
  { id: 10, eq: "x² - 4x - 12 = 0", roots: [-2, 6] },
  { id: 11, eq: "x² - 12x + 27 = 0", roots: [3, 9] },
  { id: 12, eq: "5x² - 17x + 6 = 0", roots: [0.4, 3] }
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
    if (!room) return socket.emit('notification', 'Бөлме табылмады / Комната не найдена');
    if (room.started) return socket.emit('notification', 'Ойын басталып кетті / Игра уже началась');
    if (room.players.length >= room.maxPlayers) return socket.emit('notification', 'Бөлме толы / Комната заполнена');

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
      socket.emit('notification', 'Тек бөлме иесі бастай алады');
    }
  });

  socket.on('submitAnswer', ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    // Если кто-то уже ответил правильно в этом раунде
    if (room.roundAnswered) {
      return socket.emit('notification', 'Опоздал! Кто-то уже дал правильный ответ.');
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const now = Date.now();
    if (now < player.penalizedUntil) {
      const remainingSec = Math.ceil((player.penalizedUntil - now) / 1000);
      return socket.emit('notification', `Айыппұл! ${remainingSec} секунд күтіңіз / Штраф! Ждите ${remainingSec} сек.`);
    }

    const selectedOption = room.options.find(c => c.id === cardId);
    if (!selectedOption) return;

    // Проверяем, совпадает ли уравнение выбранной карточки с корнями центральной
    const isCorrect = (selectedOption.id === room.centerCard.id);

    if (isCorrect) {
      room.roundAnswered = true;
      player.score += 1;

      io.to(roomId).emit('roundWon', {
        winnerName: player.name,
        message: `${player.name} дұрыс тапты! (+1 ұпай)`
      });

      setTimeout(() => nextRound(roomId), 2000);
    } else {
      player.penalizedUntil = Date.now() + 3000;
      socket.emit('notification', 'Қате жауап! 3 секундқа айыппұл / Штраф 3 секунды.');
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
  
  // Создаем 10 вариантов карточек для путаницы
  let opts = [room.centerCard];
  while (opts.length < 10 && opts.length < ALL_CARDS.length) {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});