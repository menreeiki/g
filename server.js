const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// База из 24 карт игры ТАБАТА (уравнение в центре и ответ в углу)
const ALL_CARDS = [
  { id: 1, eq: "25x² + 21x - 4 = 0", topAnswer: "-2", roots: [-1, 0.16] },
  { id: 2, eq: "2x² + 7x + 6 = 0", topAnswer: "4", roots: [-2, -1.5] },
  { id: 3, eq: "x² + x - 20 = 0", topAnswer: "1", roots: [-5, 4] },
  { id: 4, eq: "2x² - 6x + 4 = 0", topAnswer: "4", roots: [1, 2] },
  { id: 5, eq: "x² - 16x + 48 = 0", topAnswer: "-1", roots: [4, 12] },
  { id: 6, eq: "2x² + 3x + 1 = 0", topAnswer: "1,5", roots: [-1, -0.5] },
  { id: 7, eq: "14x² - 33x + 18 = 0", topAnswer: "1", roots: [0.75, 1.607] },
  { id: 8, eq: "x² - 6x + 5 = 0", topAnswer: "-2", roots: [1, 5] },
  { id: 9, eq: "5x² + 14x + 8 = 0", topAnswer: "1", roots: [-2, -0.8] },
  { id: 10, eq: "-7x² + 3x + 4 = 0", topAnswer: "3", roots: [1, -0.57] },
  { id: 11, eq: "x² + 5x - 24 = 0", topAnswer: "0,5", roots: [-8, 3] },
  { id: 12, eq: "6x² + 5x - 4 = 0", topAnswer: "4", roots: [-1.33, 0.5] },
  { id: 13, eq: "x² - 8x + 16 = 0", topAnswer: "-1", roots: [4] },
  { id: 14, eq: "-10x² - 7x + 3 = 0", topAnswer: "-2", roots: [-1, 0.3] },
  { id: 15, eq: "x² - 4x - 12 = 0", topAnswer: "3", roots: [-2, 6] },
  { id: 16, eq: "x² - 12x + 27 = 0", topAnswer: "1,5", roots: [3, 9] },
  { id: 17, eq: "6x² + x - 15 = 0", topAnswer: "3", roots: [-1.67, 1.5] },
  { id: 18, eq: "5x² - 17x + 6 = 0", topAnswer: "0,5", roots: [0.4, 3] },
  { id: 19, eq: "4x² + 24x - 13 = 0", topAnswer: "1", roots: [-6.5, 0.5] },
  { id: 20, eq: "213x² + 27x - 240 = 0", topAnswer: "1,5", roots: [1, -1.127] },
  { id: 21, eq: "10x² - 19x + 6 = 0", topAnswer: "0,5", roots: [0.4, 1.5] },
  { id: 22, eq: "6x² - x - 1 = 0", topAnswer: "-1", roots: [-0.33, 0.5] },
  { id: 23, eq: "x² + 9x + 8 = 0", topAnswer: "0,5", roots: [-8, -1] },
  { id: 24, eq: "4x² + 12x - 7 = 0", topAnswer: "-1", roots: [-3.5, 0.5] }
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
      players: [{ id: socket.id, name: playerName, hand: [], penalized: false }],
      centerCard: null,
      started: false
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, maxPlayers, players: rooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit('errorMsg', 'Бөлме табылмады / Комната не найдена');
    }
    if (room.started) {
      return socket.emit('errorMsg', 'Ойын басталып кетті / Игра уже началась');
    }
    if (room.players.length >= room.maxPlayers) {
      return socket.emit('errorMsg', 'Бөлме толы / Комната заполнена');
    }

    room.players.push({ id: socket.id, name: playerName, hand: [], penalized: false });
    socket.join(roomId);

    io.to(roomId).emit('playerJoined', { players: room.players, maxPlayers: room.maxPlayers });

    if (room.players.length === room.maxPlayers) {
      startGame(roomId);
    }
  });

  socket.on('playCard', ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (player.penalized) {
      return socket.emit('errorMsg', 'Айыппұл! Сіз бұл раундты өткізесіз / Штраф! Вы пропускаете этот раунд');
    }

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const cardToPlay = player.hand[cardIndex];
    const centerCard = room.centerCard;

    // Проверка совпадения ответа карты с корнями центральной карты
    const topAnsNum = parseFloat(cardToPlay.topAnswer.replace(',', '.'));
    const isCorrect = centerCard.roots.some(r => Math.abs(r - topAnsNum) < 0.05);

    if (isCorrect) {
      player.hand.splice(cardIndex, 1);
      room.centerCard = cardToPlay;

      // Снимаем штрафы со всех игроков для следующего хода
      room.players.forEach(p => p.penalized = false);

      io.to(roomId).emit('gameUpdate', {
        centerCard: room.centerCard,
        players: room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.hand.length })),
        lastAction: `${player.name} дұрыс жүрді! / сделал правильный ход!`
      });

      if (player.hand.length === 0) {
        io.to(roomId).emit('gameOver', { winner: player.name });
      }
    } else {
      // Игрок сделал ошибочный ход -> Штраф
      player.penalized = true;
      socket.emit('penalized', { message: 'Қате жүріс! Айыппұл салынды. / Неверный ход! Вы получили штраф.' });
      io.to(roomId).emit('gameUpdate', {
        centerCard: room.centerCard,
        players: room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.hand.length })),
        lastAction: `${player.name} қате жүрді және айыппұл алды! / сделал ошибку и получил штраф!`
      });
    }
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  const shuffledCards = shuffle([...ALL_CARDS]);
  const cardsPerPlayer = Math.floor(24 / room.maxPlayers);

  room.players.forEach((player, idx) => {
    player.hand = shuffledCards.slice(idx * cardsPerPlayer, (idx + 1) * cardsPerPlayer);
  });

  room.centerCard = shuffledCards[shuffledCards.length - 1]; // Первая карта в центр
  room.started = true;

  room.players.forEach(player => {
    io.to(player.id).emit('gameStarted', {
      hand: player.hand,
      centerCard: room.centerCard,
      players: room.players.map(p => ({ id: p.id, name: p.name, cardsCount: p.hand.length }))
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});