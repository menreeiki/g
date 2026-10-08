const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Расширенная база из 24 карточек с квадратными уравнениями и корнями
const ALL_CARDS = [
  { id: 1, eq: "25x² + 21x - 4 = 0", answers: [-1, 0.16] },
  { id: 2, eq: "2x² + 7x + 6 = 0", answers: [-2, -1.5] },
  { id: 3, eq: "x² + x - 20 = 0", answers: [-5, 4] },
  { id: 4, eq: "2x² - 6x + 4 = 0", answers: [1, 2] },
  { id: 5, eq: "x² - 16x + 48 = 0", answers: [4, 12] },
  { id: 6, eq: "2x² + 3x + 1 = 0", answers: [-1, -0.5] },
  { id: 7, eq: "x² - 6x + 5 = 0", answers: [1, 5] },
  { id: 8, eq: "5x² + 14x + 8 = 0", answers: [-2, -0.8] },
  { id: 9, eq: "x² + 5x - 24 = 0", answers: [-8, 3] },
  { id: 10, eq: "x² - 4x - 12 = 0", answers: [-2, 6] },
  { id: 11, eq: "x² - 12x + 27 = 0", answers: [3, 9] },
  { id: 12, eq: "5x² - 17x + 6 = 0", answers: [0.4, 3] },
  { id: 13, eq: "x² - 9x + 20 = 0", answers: [4, 5] },
  { id: 14, eq: "3x² + 10x + 3 = 0", answers: [-3, -0.33] },
  { id: 15, eq: "x² - 7x + 10 = 0", answers: [2, 5] },
  { id: 16, eq: "4x² - 9 = 0", answers: [-1.5, 1.5] },
  { id: 17, eq: "x² + 8x + 15 = 0", answers: [-5, -3] },
  { id: 18, eq: "2x² - 5x - 3 = 0", answers: [-0.5, 3] },
  { id: 19, eq: "x² - 2x - 15 = 0", answers: [-3, 5] },
  { id: 20, eq: "3x² + 7x + 2 = 0", answers: [-2, -0.33] },
  { id: 21, eq: "x² - 11x + 24 = 0", answers: [3, 8] },
  { id: 22, eq: "x² + 4x - 12 = 0", answers: [-6, 2] },
  { id: 23, eq: "2x² + 5x + 2 = 0", answers: [-2, -0.5] },
  { id: 24, eq: "x² - 8x + 12 = 0", answers: [2, 6] }
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
      players: [{ id: socket.id, name: playerName, hand: [], penalizedUntil: 0 }],
      centerCard: null,
      started: false
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('notification', 'Бөлме табылмады / Комната не найдена');
    if (room.started) return socket.emit('notification', 'Ойын басталып кетті / Игра уже началась');
    if (room.players.length >= room.maxPlayers) return socket.emit('notification', 'Бөлме толы / Комната заполнена');

    room.players.push({ id: socket.id, name: playerName, hand: [], penalizedUntil: 0 });
    socket.join(roomId);

    socket.emit('joinedRoom', { roomId, players: room.players });
    socket.to(roomId).emit('playerJoined', { players: room.players });
  });

  socket.on('startGameHost', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players[0].id === socket.id) {
      room.started = true;
      
      // Раздаем ровно 24 карты поровну всем игрокам
      const shuffledDeck = shuffle([...ALL_CARDS]);
      const countPerPlayer = Math.floor(shuffledDeck.length / room.players.length);
      
      room.players.forEach((player, index) => {
        player.hand = shuffledDeck.slice(index * countPerPlayer, (index + 1) * countPerPlayer);
      });

      // Остаток карт (если есть) можно положить в центр или взять первую
      room.centerCard = shuffledDeck[room.players.length * countPerPlayer] || shuffledDeck[0];

      updateGameState(roomId);
    } else {
      socket.emit('notification', 'Тек бөлме иесі бастай алады');
    }
  });

  socket.on('submitCard', ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const now = Date.now();
    if (now < player.penalizedUntil) {
      const remainingSec = Math.ceil((player.penalizedUntil - now) / 1000);
      return socket.emit('notification', `Айыппұл! ${remainingSec} секунд күтіңіз / Штраф! Ждите.`);
    }

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const selectedCard = player.hand[cardIndex];

    // Проверяем совпадение ответов/корней с центральной картой
    const centerAnswers = room.centerCard.answers;
    const selectedAnswers = selectedCard.answers;
    const hasMatch = selectedAnswers.some(ans => centerAnswers.includes(ans));

    if (hasMatch) {
      // Игрок успешно скидывает карту на центр
      player.hand.splice(cardIndex, 1);
      room.centerCard = selectedCard;

      // Проверяем условие победы (если карт не осталось)
      if (player.hand.length === 0) {
        io.to(roomId).emit('gameOver', { winner: player.name });
        delete rooms[roomId];
        return;
      }

      updateGameState(roomId);
    } else {
      // Ошибка: карта не подходит — штраф 3 секунды
      player.penalizedUntil = Date.now() + 3000;
      socket.emit('notification', 'Қате карточка! Сәйкес келмейді / Неверная карта! Штраф 3 сек.');
    }
  });
});

function updateGameState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach(player => {
    io.to(player.id).emit('gameStateUpdate', {
      centerCard: room.centerCard,
      myHand: player.hand,
      playersStatus: room.players.map(p => ({ name: p.name, cardsLeft: p.hand.length }))
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});