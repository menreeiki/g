const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

// Карточки: уравнение в центре и числа на углах, которые подходят к другим уравнениям
const cardTemplates = [
    { id: 1, equation: "x² - 6x + 5 = 0", answers: [1, 5], displayCorners: [1, 5, 1, 5] },
    { id: 2, equation: "5x² + 14x + 8 = 0", answers: [-0.8, -2], displayCorners: [-0.8, -2, -0.8, -2] },
    { id: 3, equation: "-7x² + 3x + 4 = 0", answers: [1, -4/7], displayCorners: [1, -4/7, 1, -4/7] },
    { id: 4, equation: "x² - 4x - 12 = 0", answers: [6, -2], displayCorners: [6, -2, 6, -2] },
    { id: 5, equation: "6x² + 5x - 4 = 0", answers: [0.5, -4/3], displayCorners: [0.5, -4/3, 0.5, -4/3] },
    { id: 6, equation: "x² + 5x - 24 = 0", answers: [3, -8], displayCorners: [3, -8, 3, -8] },
    { id: 7, equation: "-10x² - 7x + 3 = 0", answers: [-1, 0.3], displayCorners: [-1, 0.3, -1, 0.3] },
    { id: 8, equation: "x² - 8x + 16 = 0", answers: [4, 4], displayCorners: [4, 4, 4, 4] },
    { id: 9, equation: "x² - 12x + 27 = 0", answers: [9, 3], displayCorners: [9, 3, 9, 3] },
    { id: 10, equation: "2x² - 5x + 2 = 0", answers: [2, 0.5], displayCorners: [2, 0.5, 2, 0.5] },
    { id: 11, equation: "x² + 7x + 10 = 0", answers: [-2, -5], displayCorners: [-2, -5, -2, -5] },
    { id: 12, equation: "3x² - 10x + 3 = 0", answers: [3, 1/3], displayCorners: [3, 1/3, 3, 1/3] },
    { id: 13, equation: "x² - 9 = 0", answers: [3, -3], displayCorners: [3, -3, 3, -3] },
    { id: 14, equation: "4x² - 9 = 0", answers: [1.5, -1.5], displayCorners: [1.5, -1.5, 1.5, -1.5] },
    { id: 15, equation: "x² + 6x + 9 = 0", answers: [-3, -3], displayCorners: [-3, -3, -3, -3] },
    { id: 16, equation: "2x² + 3x - 2 = 0", answers: [0.5, -2], displayCorners: [0.5, -2, 0.5, -2] },
    { id: 17, equation: "x² - x - 20 = 0", answers: [5, -4], displayCorners: [5, -4, 5, -4] },
    { id: 18, equation: "x² + 2x - 15 = 0", answers: [3, -5], displayCorners: [3, -5, 3, -5] },
    { id: 19, equation: "5x² - 6x + 1 = 0", answers: [1, 0.2], displayCorners: [1, 0.2, 1, 0.2] },
    { id: 20, equation: "x² - 7x + 12 = 0", answers: [4, 3], displayCorners: [4, 3, 4, 3] },
    { id: 21, equation: "x² + 4x - 5 = 0", answers: [1, -5], displayCorners: [1, -5, 1, -5] },
    { id: 22, equation: "3x² + 7x + 2 = 0", answers: [-1/3, -2], displayCorners: [-1/3, -2, -1/3, -2] },
    { id: 23, equation: "x² - 2x - 8 = 0", answers: [4, -2], displayCorners: [4, -2, 4, -2] },
    { id: 24, equation: "2x² + 5x + 2 = 0", answers: [-0.5, -2], displayCorners: [-0.5, -2, -0.5, -2] }
];

function generateDeck() {
    let deck = cardTemplates.map((template) => ({
        id: template.id,
        equation: template.equation,
        answers: template.answers, // Корни для проверки решения
        corners: template.displayCorners // Цифры на углах для совпадения с предыдущей картой
    }));
    return deck.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);
    socket.emit('connected', socket.id);

    socket.on('createRoom', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            host: socket.id,
            players: [{ id: socket.id, name: playerName, cards: [], score: 0 }],
            deck: [],
            tableCard: null,
            gameStarted: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        const cleanRoomId = roomId.trim().toUpperCase();
        const room = rooms[cleanRoomId];
        
        if (!room) return socket.emit('errorMsg', 'Комната не найдена!');
        if (room.gameStarted) return socket.emit('errorMsg', 'Игра уже началась!');
        
        // Проверка на лимит игроков (2, 3, 4, 6)
        if (room.players.length >= 6) {
            return socket.emit('errorMsg', 'В комнате уже максимальное количество игроков!');
        }

        room.players.push({ id: socket.id, name: playerName, cards: [], score: 0 });
        socket.join(cleanRoomId);

        socket.emit('joinedRoom', { roomId: cleanRoomId, players: room.players });
        io.to(cleanRoomId).emit('updatePlayers', room.players);
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;

        // Проверяем количество игроков (должно быть 2, 3, 4 или 6)
        const count = room.players.length;
        if (![2, 3, 4, 6].includes(count)) {
            return socket.emit('errorMsg', 'Для начала игры нужно 2, 3, 4 или 6 игроков!');
        }

        room.gameStarted = true;
        room.deck = generateDeck();

        const cardsPerPlayer = Math.floor(room.deck.length / count);
        room.players.forEach(player => {
            player.cards = room.deck.splice(0, cardsPerPlayer);
        });

        room.tableCard = room.deck.pop();

        io.to(roomId).emit('gameStarted', {
            players: room.players,
            tableCard: room.tableCard
        });
    });

    // Ход игрока: проверка совпадения углов сыгранной карты с углами/ответами карты на столе
    socket.on('playCard', ({ roomId, cardId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const cardIndex = player.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const cardPlayed = player.cards[cardIndex];
        const tableCard = room.tableCard;

        // Совпадение проверяется по логике Табаты: корни уравнения на столе должны совпадать с цифрами на углах карты игрока (или наоборот)
        const isMatch = cardPlayed.corners.some(cornerVal => 
            tableCard.answers.includes(cornerVal)
        ) || tableCard.corners.some(tableVal => 
            cardPlayed.answers.includes(tableVal)
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
                lastMoveMessage: `${player.name} хорди карточкасын тастады!`
            });
        } else {
            if (room.deck.length > 0) {
                const penaltyCard = room.deck.pop();
                player.cards.push(penaltyCard);
            }
            socket.emit('penalty', 'Қате жүріс! Айпппұл картасы берілді.');
            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                lastMoveMessage: `${player.name} қателесті — АЙППҰЛ!`
            });
        }
    });

    socket.on('disconnect', () => {
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