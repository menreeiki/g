const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

// Список готовых уравнений с их корнями для карточек
const cardTemplates = [
    { equation: "x² - 6x + 5 = 0", answers: [1, 5], displayNumber: "1" },
    { equation: "5x² + 14x + 8 = 0", answers: [-0.8, -2], displayNumber: "1" },
    { equation: "-7x² + 3x + 4 = 0", answers: [1, -4/7], displayNumber: "3" },
    { equation: "x² - 4x - 12 = 0", answers: [6, -2], displayNumber: "3" },
    { equation: "6x² + 5x - 4 = 0", answers: [0.5, -4/3], displayNumber: "4" },
    { equation: "x² + 5x - 24 = 0", answers: [3, -8], displayNumber: "0.5" },
    { equation: "-10x² - 7x + 3 = 0", answers: [-1, 0.3], displayNumber: "-2" },
    { equation: "x² - 8x + 16 = 0", answers: [4, 4], displayNumber: "-1" },
    { equation: "x² - 12x + 27 = 0", answers: [9, 3], displayNumber: "1,5" },
    { equation: "2x² - 5x + 2 = 0", answers: [2, 0.5], displayNumber: "2" },
    { equation: "x² + 7x + 10 = 0", answers: [-2, -5], displayNumber: "-2" },
    { equation: "3x² - 10x + 3 = 0", answers: [3, 1/3], displayNumber: "3" },
    { equation: "x² - 9 = 0", answers: [3, -3], displayNumber: "3" },
    { equation: "4x² - 9 = 0", answers: [1.5, -1.5], displayNumber: "4" },
    { equation: "x² + 6x + 9 = 0", answers: [-3, -3], displayNumber: "-3" },
    { equation: "2x² + 3x - 2 = 0", answers: [0.5, -2], displayNumber: "2" },
    { equation: "x² - x - 20 = 0", answers: [5, -4], displayNumber: "-5" },
    { equation: "x² + 2x - 15 = 0", answers: [3, -5], displayNumber: "3" },
    { equation: "5x² - 6x + 1 = 0", answers: [1, 0.2], displayNumber: "1" },
    { equation: "x² - 7x + 12 = 0", answers: [4, 3], displayNumber: "4" },
    { equation: "x² + 4x - 5 = 0", answers: [1, -5], displayNumber: "1" },
    { equation: "3x² + 7x + 2 = 0", answers: [-1/3, -2], displayNumber: "-2" },
    { equation: "x² - 2x - 8 = 0", answers: [4, -2], displayNumber: "4" },
    { equation: "2x² + 5x + 2 = 0", answers: [-0.5, -2], displayNumber: "-0,5" }
];

function generateDeck() {
    let deck = cardTemplates.map((template, index) => ({
        id: index + 1,
        equation: template.equation,
        answers: template.answers,
        displayNumber: template.displayNumber
    }));
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.emit('connected', socket.id);

    // Создание комнаты
    socket.on('createRoom', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            host: socket.id,
            players: [{ id: socket.id, name: playerName, cards: [], score: 0 }],
            deck: [],
            tableCard: null,
            gameStarted: false,
            currentRound: 1
        };
        socket.join(roomId);
        
        // Исправление: отправляем и roomId, и список игроков объектом, как ждет клиент
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
        console.log(`Комната создана: ${roomId} игроком ${playerName}`);
    });

    // Присоединение к комнате
    socket.on('joinRoom', ({ roomId, playerName }) => {
        const cleanRoomId = roomId.trim().toUpperCase();
        const room = rooms[cleanRoomId];
        
        if (!room) {
            return socket.emit('errorMsg', 'Комната не найдена!');
        }
        if (room.gameStarted) {
            return socket.emit('errorMsg', 'Игра уже началась!');
        }

        room.players.push({ id: socket.id, name: playerName, cards: [], score: 0 });
        socket.join(cleanRoomId);

        // Отправляем успешное подключение присоединившемуся игроку
        socket.emit('joinedRoom', { roomId: cleanRoomId, players: room.players });
        // Обновляем список для всех в комнате
        io.to(cleanRoomId).emit('updatePlayers', room.players);
        console.log(`Игрок ${playerName} присоединился к комнате ${cleanRoomId}`);
    });

    // Старт игры
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;

        room.gameStarted = true;
        room.deck = generateDeck();

        const cardsPerPlayer = Math.floor(room.deck.length / room.players.length);
        room.players.forEach(player => {
            player.cards = room.deck.splice(0, cardsPerPlayer);
        });

        room.tableCard = room.deck.pop();

        io.to(roomId).emit('gameStarted', {
            players: room.players,
            tableCard: room.tableCard
        });
    });

    // Ход игрока (клик по карте)
    socket.on('playCard', ({ roomId, cardId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const cardIndex = player.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const cardPlayed = player.cards[cardIndex];
        const tableCard = room.tableCard;

        const isMatch = cardPlayed.answers.some(ans => 
            tableCard.answers.includes(ans)
        );

        if (isMatch) {
            player.cards.splice(cardIndex, 1);
            room.tableCard = cardPlayed;

            if (player.cards.length === 0) {
                io.to(roomId).emit('gameOver', { winner: player.name });
                room.gameStarted = false;
                return;
            }

            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                lastMoveMessage: `${player.name} успешно сыграл карточку!`
            });
        } else {
            if (room.deck.length > 0) {
                const penaltyCard = room.deck.pop();
                player.cards.push(penaltyCard);
            }
            socket.emit('penalty', 'Неверный ответ! Штрафная карта.');
            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                lastMoveMessage: `${player.name} ошиблись — ШТРАФ!`
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});