
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

// ======================================================
// 24 КАРТЫ
// answers — корни уравнения на карте
// displayNumber — число в углах карты
// ======================================================

const cardTemplates = [
    { equation: "x² - 6x + 5 = 0", answers: [1, 5], displayNumber: "1" },
    { equation: "5x² + 14x + 8 = 0", answers: [-0.8, -2], displayNumber: "-2" },
    { equation: "-7x² + 3x + 4 = 0", answers: [1, -4 / 7], displayNumber: "3" },
    { equation: "x² - 4x - 12 = 0", answers: [6, -2], displayNumber: "3" },
    { equation: "6x² + 5x - 4 = 0", answers: [0.5, -4 / 3], displayNumber: "0.5" },
    { equation: "x² + 5x - 24 = 0", answers: [3, -8], displayNumber: "-3" },
    { equation: "-10x² - 7x + 3 = 0", answers: [-1, 0.3], displayNumber: "-1" },
    { equation: "x² - 8x + 16 = 0", answers: [4, 4], displayNumber: "4" },
    { equation: "x² - 12x + 27 = 0", answers: [9, 3], displayNumber: "1,5" },
    { equation: "2x² - 5x + 2 = 0", answers: [2, 0.5], displayNumber: "2" },
    { equation: "x² + 7x + 10 = 0", answers: [-2, -5], displayNumber: "-2" },
    { equation: "3x² - 10x + 3 = 0", answers: [3, 1 / 3], displayNumber: "3" },
    { equation: "x² - 9 = 0", answers: [3, -3], displayNumber: "-3" },
    { equation: "4x² - 9 = 0", answers: [1.5, -1.5], displayNumber: "4" },
    { equation: "x² + 6x + 9 = 0", answers: [-3, -3], displayNumber: "-3" },
    { equation: "2x² + 3x - 2 = 0", answers: [0.5, -2], displayNumber: "2" },
    { equation: "x² - x - 20 = 0", answers: [5, -4], displayNumber: "5" },
    { equation: "x² + 2x - 15 = 0", answers: [3, -5], displayNumber: "3" },
    { equation: "5x² - 6x + 1 = 0", answers: [1, 0.2], displayNumber: "5" },
    { equation: "x² - 7x + 12 = 0", answers: [4, 3], displayNumber: "4" },
    { equation: "x² + 4x - 5 = 0", answers: [1, -5], displayNumber: "1" },
    { equation: "3x² + 7x + 2 = 0", answers: [-1 / 3, -2], displayNumber: "-2" },
    { equation: "x² - 2x - 8 = 0", answers: [4, -2], displayNumber: "4" },
    { equation: "2x² + 5x + 2 = 0", answers: [-0.5, -2], displayNumber: "-0,5" }
];

function normalizeNumber(value) {
    if (value === null || value === undefined) {
        return NaN;
    }

    return Number(String(value).trim().replace(',', '.'));
}

function generateDeck() {
    const deck = cardTemplates.map((template, index) => ({
        id: index + 1,
        equation: template.equation,
        answers: [...template.answers],
        displayNumber: template.displayNumber
    }));

    // Перемешивание Фишера — Йетса
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}

function cardMatchesTableCard(card, tableCard) {
    if (!card || !tableCard || !Array.isArray(tableCard.answers)) {
        return false;
    }

    const number = normalizeNumber(card.displayNumber);

    if (!Number.isFinite(number)) {
        return false;
    }

    return tableCard.answers.some(answer => {
        const root = normalizeNumber(answer);
        return Number.isFinite(root) && Math.abs(root - number) < 0.0001;
    });
}

function getRoomId(room) {
    return Object.keys(rooms).find(id => rooms[id] === room);
}

function broadcastGame(room) {
    const roomId = getRoomId(room);
    if (!roomId) return;

    io.to(roomId).emit('updateGame', {
        players: room.players,
        tableCard: room.tableCard,
        firstCard: !room.tableCard
    });
}

function finishGame(room, winner) {
    room.gameStarted = false;

    const roomId = getRoomId(room);
    if (!roomId) return;

    const ranking = [...room.players]
        .sort((a, b) => {
            if (a.cards.length !== b.cards.length) {
                return a.cards.length - b.cards.length;
            }
            return b.score - a.score;
        })
        .map((player, index) => ({
            place: index + 1,
            name: player.name,
            cardsLeft: player.cards.length,
            score: player.score,
            penalties: player.penalties
        }));

    io.to(roomId).emit('gameOver', {
        winner: winner.name,
        ranking
    });
}

io.on('connection', socket => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on('createRoom', ({ playerName }) => {
        const roomId = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();

        rooms[roomId] = {
            host: socket.id,
            players: [{
                id: socket.id,
                name: playerName,
                cards: [],
                score: 0,
                penalties: 0
            }],
            deck: [],
            tableCard: null,
            gameStarted: false,
            currentRound: 1
        };

        socket.join(roomId);
        socket.emit('roomCreated', roomId);

        console.log(`Комната создана: ${roomId}`);
    });

    // ==================================================
    // ПРИСОЕДИНЕНИЕ ИГРОКА
    // ==================================================

    socket.on('joinRoom', ({ roomId, playerName }) => {
        roomId = String(roomId || '').trim().toUpperCase();

        const room = rooms[roomId];

        if (!room) {
            socket.emit('errorMsg', 'Комната не найдена!');
            return;
        }

        if (room.gameStarted) {
            socket.emit('errorMsg', 'Игра уже началась!');
            return;
        }

        if (![2, 3, 4, 6].includes(room.players.length + 1)) {
            socket.emit(
                'errorMsg',
                'В игре могут участвовать 2, 3, 4 или 6 игроков!'
            );
            return;
        }

        if (room.players.some(p => p.id === socket.id)) {
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            cards: [],
            score: 0,
            penalties: 0
        });

        socket.join(roomId);

        // Персональное подтверждение второму игроку
        socket.emit('roomJoined', {
            roomId,
            players: room.players
        });

        // Обновление списка у всех участников
        io.to(roomId).emit('updatePlayers', room.players);

        console.log(`${playerName} вошёл в комнату ${roomId}`);
    });

    // ==================================================
    // НАЧАЛО ИГРЫ
    // ==================================================

    socket.on('startGame', roomId => {
        const room = rooms[roomId];

        if (!room || room.host !== socket.id) {
            return;
        }

        if (room.gameStarted) {
            return;
        }

        if (![2, 3, 4, 6].includes(room.players.length)) {
            socket.emit(
                'errorMsg',
                'Для начала игры нужно 2, 3, 4 или 6 игроков!'
            );
            return;
        }

        room.gameStarted = true;
        room.currentRound = 1;
        room.deck = generateDeck();
        room.tableCard = null;

        const cardsPerPlayer = Math.floor(
            room.deck.length / room.players.length
        );

for (const player of room.players) {
    player.cards = [];
    player.score = 0;
    player.penalties = 0;

    for (let i = 0; i < cardsPerPlayer; i++) {
        player.cards.push(room.deck.pop());
    }

    // Случайно перемешиваем карты в руке игрока
    for (let i = player.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [player.cards[i], player.cards[j]] =
            [player.cards[j], player.cards[i]];
    }
}


        io.to(roomId).emit('gameStarted', {
            players: room.players,
            tableCard: null,
            firstCard: true
        });

        console.log(`Игра ${roomId} началась`);
    });

    // ==================================================
    // ХОД КАРТОЙ
    // ==================================================

    socket.on('playCard', ({ roomId, cardId }) => {
        if (!roomId) {
            socket.emit('errorMsg', 'Не найдена комната игрока.');
            return;
        }

        const room = rooms[roomId];

        if (!room || !room.gameStarted) {
            return;
        }

        const player = room.players.find(p => p.id === socket.id);

        if (!player) {
            return;
        }

        const cardIndex = player.cards.findIndex(
            card => String(card.id) === String(cardId)
        );

        // Карта уже сыграна или не принадлежит этому игроку
        if (cardIndex === -1) {
            return;
        }

        const cardPlayed = player.cards[cardIndex];

        // Первый ход: можно положить любую карту
        if (!room.tableCard) {
            player.cards.splice(cardIndex, 1);
            room.tableCard = cardPlayed;
            player.score += 1;
            room.currentRound += 1;

            if (player.cards.length === 0) {
                finishGame(room, player);
                return;
            }

            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                firstCard: false,
                lastMoveMessage: `${player.name} положил первую карту!`
            });

            return;
        }

        // Проверяем, есть ли у кого-нибудь из игроков
        // карта, которая подходит к центральному уравнению.
        const hasAnyMatch = room.players.some(p =>
            p.cards.some(card =>
                cardMatchesTableCard(card, room.tableCard)
            )
        );

        const isMatch = cardMatchesTableCard(
            cardPlayed,
            room.tableCard
        );

        // Если в оставшихся руках вообще нет совпадений,
        // не наказываем игроков за невозможный ход.
        if (!hasAnyMatch) {
            player.cards.splice(cardIndex, 1);
            room.tableCard = cardPlayed;
            player.score += 1;
            room.currentRound += 1;

            if (player.cards.length === 0) {
                finishGame(room, player);
                return;
            }

            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                firstCard: false,
                lastMoveMessage:
                    'Совпадений не осталось — игра продолжается.'
            });

            return;
        }

        if (isMatch) {
            player.cards.splice(cardIndex, 1);
            room.tableCard = cardPlayed;
            player.score += 1;
            room.currentRound += 1;

            if (player.cards.length === 0) {
                finishGame(room, player);
                return;
            }

            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,
                firstCard: false,
                lastMoveMessage:
                    `${player.name} успешно сыграл карточку!`
            });

            return;
        }

        // Неправильный ответ
        player.penalties += 1;
        player.score = Math.max(0, player.score - 1);

        socket.emit('penalty', {
            message: 'ШТРАФ!',
            description:
                'Число в углу карты не совпадает с корнями центрального уравнения.'
        });

        io.to(roomId).emit('updateGame', {
            players: room.players,
            tableCard: room.tableCard,
            firstCard: false,
            lastMoveMessage: `${player.name} получил штраф.`
        });
    });

    // ==================================================
    // ОТКЛЮЧЕНИЕ
    // ==================================================

    socket.on('disconnect', () => {
        for (const roomId of Object.keys(rooms)) {
            const room = rooms[roomId];

            room.players = room.players.filter(
                player => player.id !== socket.id
            );

            if (room.players.length === 0) {
                delete rooms[roomId];
                continue;
            }

            if (room.host === socket.id) {
                room.host = room.players[0].id;
            }

            io.to(roomId).emit('updatePlayers', room.players);
        }

        console.log(`Игрок отключился: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
