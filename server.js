const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

// ======================================================
// КАРТОЧКИ
// answers = правильные корни СОБСТВЕННОГО уравнения
// displayNumber = число, которое находится НА УГЛАХ карты
// ======================================================

const cardTemplates = [
    { equation: "x² - 6x + 5 = 0", answers: [1, 5], displayNumber: "1" },
    { equation: "5x² + 14x + 8 = 0", answers: [-0.8, -2], displayNumber: "1" },
    { equation: "-7x² + 3x + 4 = 0", answers: [1, -4 / 7], displayNumber: "3" },
    { equation: "x² - 4x - 12 = 0", answers: [6, -2], displayNumber: "3" },
    { equation: "6x² + 5x - 4 = 0", answers: [0.5, -4 / 3], displayNumber: "4" },
    { equation: "x² + 5x - 24 = 0", answers: [3, -8], displayNumber: "0.5" },
    { equation: "-10x² - 7x + 3 = 0", answers: [-1, 0.3], displayNumber: "-2" },
    { equation: "x² - 8x + 16 = 0", answers: [4, 4], displayNumber: "-1" },
    { equation: "x² - 12x + 27 = 0", answers: [9, 3], displayNumber: "1,5" },
    { equation: "2x² - 5x + 2 = 0", answers: [2, 0.5], displayNumber: "2" },
    { equation: "x² + 7x + 10 = 0", answers: [-2, -5], displayNumber: "-2" },
    { equation: "3x² - 10x + 3 = 0", answers: [3, 1 / 3], displayNumber: "3" },
    { equation: "x² - 9 = 0", answers: [3, -3], displayNumber: "3" },
    { equation: "4x² - 9 = 0", answers: [1.5, -1.5], displayNumber: "4" },
    { equation: "x² + 6x + 9 = 0", answers: [-3, -3], displayNumber: "-3" },
    { equation: "2x² + 3x - 2 = 0", answers: [0.5, -2], displayNumber: "2" },
    { equation: "x² - x - 20 = 0", answers: [5, -4], displayNumber: "-5" },
    { equation: "x² + 2x - 15 = 0", answers: [3, -5], displayNumber: "3" },
    { equation: "5x² - 6x + 1 = 0", answers: [1, 0.2], displayNumber: "1" },
    { equation: "x² - 7x + 12 = 0", answers: [4, 3], displayNumber: "4" },
    { equation: "x² + 4x - 5 = 0", answers: [1, -5], displayNumber: "1" },
    { equation: "3x² + 7x + 2 = 0", answers: [-1 / 3, -2], displayNumber: "-2" },
    { equation: "x² - 2x - 8 = 0", answers: [4, -2], displayNumber: "4" },
    { equation: "2x² + 5x + 2 = 0", answers: [-0.5, -2], displayNumber: "-0,5" }
];


// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

function generateDeck() {
    const deck = cardTemplates.map((template, index) => ({
        id: index + 1,
        equation: template.equation,
        answers: template.answers,
        displayNumber: template.displayNumber
    }));

    return deck.sort(() => Math.random() - 0.5);
}


// Преобразует:
// "0,5" -> 0.5
// "-0,5" -> -0.5
// "1,5" -> 1.5
// "1" -> 1
function normalizeNumber(value) {
    if (value === undefined || value === null) {
        return NaN;
    }

    return parseFloat(String(value).replace(',', '.'));
}


// Проверяем:
// есть ли число displayNumber среди корней центрального уравнения
function cardMatchesTableCard(card, tableCard) {
    if (!card || !tableCard) {
        return false;
    }

    const cardNumber = normalizeNumber(card.displayNumber);

    if (Number.isNaN(cardNumber)) {
        return false;
    }

    return tableCard.answers.some(answer => {
        return Math.abs(Number(answer) - cardNumber) < 0.0001;
    });
}


// ======================================================
// CONNECTION
// ======================================================

io.on('connection', (socket) => {

    console.log(`Игрок подключился: ${socket.id}`);

    socket.emit('connected', socket.id);


    // ==================================================
    // СОЗДАНИЕ КОМНАТЫ
    // ==================================================

    socket.on('createRoom', ({ playerName }) => {

        const roomId = Math.random()
            .toString(36)
            .substring(2, 7)
            .toUpperCase();

        rooms[roomId] = {
            host: socket.id,

            players: [
                {
                    id: socket.id,
                    name: playerName,
                    cards: [],
                    score: 0,
                    penalties: 0
                }
            ],

            deck: [],
            tableCard: null,

            gameStarted: false,

            firstCardPlayed: false,

            currentRound: 1
        };

        socket.join(roomId);

        socket.emit('roomCreated', roomId);

        console.log(
            `Комната создана: ${roomId} игроком ${playerName}`
        );
    });


    // ==================================================
    // ПРИСОЕДИНЕНИЕ
    // ==================================================

    socket.on('joinRoom', ({ roomId, playerName }) => {

        const room = rooms[roomId];

        if (!room) {
            return socket.emit(
                'errorMsg',
                'Комната не найдена!'
            );
        }

        if (room.gameStarted) {
            return socket.emit(
                'errorMsg',
                'Игра уже началась!'
            );
        }

        if (![2, 3, 4, 6].includes(room.players.length + 1)) {
            return socket.emit(
                'errorMsg',
                'В игре могут участвовать только 2, 3, 4 или 6 игроков!'
            );
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            cards: [],
            score: 0,
            penalties: 0
        });

        socket.join(roomId);

        io.to(roomId).emit(
            'updatePlayers',
            room.players
        );

        console.log(
            `Игрок ${playerName} присоединился к комнате ${roomId}`
        );
    });


    // ==================================================
    // НАЧАЛО ИГРЫ
    // ==================================================

    socket.on('startGame', (roomId) => {

        const room = rooms[roomId];

        if (!room || room.host !== socket.id) {
            return;
        }

        if (![2, 3, 4, 6].includes(room.players.length)) {
            return socket.emit(
                'errorMsg',
                'Для начала игры нужно 2, 3, 4 или 6 игроков!'
            );
        }

        room.gameStarted = true;

        room.firstCardPlayed = false;

        room.currentRound = 1;

        room.deck = generateDeck();

        // ==============================================
        // РАВНОМЕРНО РАЗДАЕМ ВСЕ 24 КАРТЫ
        // ==============================================

        const cardsPerPlayer =
            Math.floor(room.deck.length / room.players.length);

        room.players.forEach(player => {

            player.cards = [];
            player.score = 0;
            player.penalties = 0;

            for (let i = 0; i < cardsPerPlayer; i++) {
                player.cards.push(room.deck.pop());
            }
        });

        // На старте центральной карты НЕТ.
        // Первый игрок сам кладет первую карту.

        room.tableCard = null;

        io.to(roomId).emit('gameStarted', {
            players: room.players,
            tableCard: room.tableCard,
            firstCard: true
        });

        console.log(
            `Игра ${roomId} началась. Игроков: ${room.players.length}`
        );
    });


    // ==================================================
    // ИГРА КАРТОЙ
    // ==================================================

    socket.on('playCard', ({ roomId, cardId }) => {

        const room = rooms[roomId];

        if (!room || !room.gameStarted) {
            return;
        }

        const player = room.players.find(
            p => p.id === socket.id
        );

        if (!player) {
            return;
        }

        const cardIndex = player.cards.findIndex(
            c => c.id === cardId
        );

        if (cardIndex === -1) {
            return;
        }

        const cardPlayed = player.cards[cardIndex];


        // ==================================================
        // ПЕРВАЯ КАРТА
        // ==================================================

        if (!room.tableCard) {

            player.cards.splice(cardIndex, 1);

            room.tableCard = cardPlayed;

            room.firstCardPlayed = true;

            player.score += 1;

            // Проверяем победу
            if (player.cards.length === 0) {

                finishGame(room, player);

                return;
            }

            io.to(roomId).emit('updateGame', {
                players: room.players,
                tableCard: room.tableCard,

                lastMoveMessage:
                    `${player.name} положил первую карту!`,

                firstCard: false
            });

            return;
        }


        // ==================================================
        // ПРОВЕРКА СООТВЕТСТВИЯ
        // ==================================================

        const isMatch = cardMatchesTableCard(
            cardPlayed,
            room.tableCard
        );


        // ==================================================
        // ПРАВИЛЬНЫЙ ХОД
        // ==================================================

        if (isMatch) {

            player.cards.splice(cardIndex, 1);

            room.tableCard = cardPlayed;

            player.score += 1;

            room.currentRound++;

            // Победа
            if (player.cards.length === 0) {

                finishGame(room, player);

                return;
            }

            io.to(roomId).emit('updateGame', {

                players: room.players,

                tableCard: room.tableCard,

                lastMoveMessage:
                    `${player.name} успешно сыграл карточку!`,

                firstCard: false
            });

        }

        // ==================================================
        // НЕПРАВИЛЬНЫЙ ХОД
        // ==================================================

        else {

            player.penalties += 1;

            // За неправильный ход минус очко,
            // но score не становится отрицательным.
            player.score = Math.max(
                0,
                player.score - 1
            );


            // ==============================================
            // ШТРАФНАЯ КАРТА
            // ==============================================

            let penaltyCard = null;

            if (room.deck.length > 0) {

                penaltyCard = room.deck.pop();

                player.cards.push(penaltyCard);
            }


            // Сообщение конкретному игроку
            socket.emit('penalty', {
                message: 'ШТРАФ!',
                description:
                    'Эта карта не подходит к решению центрального уравнения.',
                penaltyCard: penaltyCard
            });


            // Обновляем остальных игроков
            io.to(roomId).emit('updateGame', {

                players: room.players,

                tableCard: room.tableCard,

                lastMoveMessage:
                    `${player.name} ошибся — ШТРАФ!`,

                firstCard: false
            });

        }

    });


    // ==================================================
    // ЗАВЕРШЕНИЕ ИГРЫ
    // ==================================================

    function finishGame(room, winner) {

        room.gameStarted = false;

        // Сортировка рейтинга:
        // сначала меньше карт,
        // потом больше очков
        const ranking = [...room.players].sort((a, b) => {

            if (a.cards.length !== b.cards.length) {
                return a.cards.length - b.cards.length;
            }

            return b.score - a.score;
        });


        io.to(
            Object.keys(rooms).find(
                roomId => rooms[roomId] === room
            )
        ).emit('gameOver', {

            winner: winner.name,

            ranking: ranking.map((player, index) => ({
                place: index + 1,
                name: player.name,
                cardsLeft: player.cards.length,
                score: player.score,
                penalties: player.penalties
            }))
        });

    }


    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on('disconnect', () => {

        console.log(
            `Игрок отключился: ${socket.id}`
        );

        for (const roomId in rooms) {

            const room = rooms[roomId];

            room.players = room.players.filter(
                p => p.id !== socket.id
            );

            if (room.players.length === 0) {

                delete rooms[roomId];

            } else {

                // Если отключился хост,
                // передаем хост роль следующему игроку
                if (room.host === socket.id) {
                    room.host = room.players[0].id;
                }

                io.to(roomId).emit(
                    'updatePlayers',
                    room.players
                );
            }
        }

    });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(
        `Сервер запущен на порту ${PORT}`
    );

});