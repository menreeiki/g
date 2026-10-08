const socket = io();
let currentRoomId = null;
let currentLang = 'kk';
let isHost = false;

const translations = {
  kk: {
    createTitle: "Жаңа бөлме құру",
    joinTitle: "Бөлмеге қосылу",
    btnCreate: "Бөлме ашу",
    btnJoin: "Қосылу",
    waitingTitle: "Ойыншылар күтілуде...",
    roomCodeLabel: "Бөлме коды:",
    centerTitle: "Ортадағы карточка (теңдеу):",
    myHandTitle: "Сіздің қолдағы карталарыңыз:",
    btnStart: "Ойынды бастау"
  },
  ru: {
    createTitle: "Создать комнату",
    joinTitle: "Присоединиться",
    btnCreate: "Создать",
    btnJoin: "Войти",
    waitingTitle: "Ожидание игроков...",
    roomCodeLabel: "Код комнаты:",
    centerTitle: "Карточка в центре (уравнение):",
    myHandTitle: "Ваши карты на руках:",
    btnStart: "Начать игру"
  }
};

function setLanguage(lang) {
  currentLang = lang;
  document.getElementById('btn-kk').classList.toggle('active', lang === 'kk');
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');

  document.querySelectorAll('[data-key]').forEach(el => {
    const key = el.getAttribute('data-key');
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
}

function showModal(text) {
  document.getElementById('modalMessage').textContent = text;
  document.getElementById('customModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('customModal').classList.add('hidden');
}

function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) return showModal('Атыңызды енгізіңіз / Введите имя');

  isHost = true;
  socket.emit('createRoom', { playerName: name });
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim();
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name || !roomId) return showModal('Деректерді толық толтырыңыз / Заполните данные');

  isHost = false;
  socket.emit('joinRoom', { roomId, playerName: name });
}

socket.on('roomCreated', (roomId) => {
  currentRoomId = roomId;
  showWaitingRoom(roomId, [{ id: socket.id, name: document.getElementById('playerName').value.trim() }]);
});

socket.on('updatePlayers', (players) => {
  updatePlayerList(players);
});

socket.on('errorMsg', (msg) => {
  showModal(msg);
});

function showWaitingRoom(roomId, players) {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('waitingRoom').classList.remove('hidden');
  document.getElementById('displayRoomCode').textContent = roomId;
  updatePlayerList(players);

  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.style.display = isHost ? 'block' : 'none';
  }
}

function updatePlayerList(players) {
  const list = document.getElementById('playerList');
  list.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
}

function hostStartGame() {
  if (currentRoomId && isHost) {
    socket.emit('startGame', currentRoomId);
  }
}

// Начало игры
socket.on('gameStarted', ({ players, tableCard }) => {
  startGameInterface(players, tableCard);
});

// Обновление состояния игры после ходов
socket.on('updateGame', ({ players, tableCard, lastMoveMessage }) => {
  startGameInterface(players, tableCard);
  if (lastMoveMessage) {
    console.log(lastMoveMessage);
  }
});

// Обработка штрафов
socket.on('penalty', (msg) => {
  showModal(msg);
});

function startGameInterface(players, tableCard) {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameArea').classList.remove('hidden');

  // Отображаем центральную карточку с уравнением и её углами
  const centerCardEl = document.getElementById('centerEqText').parentElement;
  if (centerCardEl) {
    centerCardEl.innerHTML = `
      <div class="card center-card">
          <div class="corner-top-left">${tableCard.answers[0] !== undefined ? tableCard.answers[0] : ''}</div>
          <div class="corner-top-right">${tableCard.answers[1] !== undefined ? tableCard.answers[1] : tableCard.answers[0]}</div>
          <div class="equation-text">${tableCard.equation}</div>
          <div class="corner-bottom-left">${tableCard.answers[1] !== undefined ? tableCard.answers[1] : ''}</div>
          <div class="corner-bottom-right">${tableCard.answers[0] !== undefined ? tableCard.answers[0] : ''}</div>
      </div>
    `;
  }

  // Статус остальных игроков (сколько карт на руках)
  const statusContainer = document.getElementById('playersStatusContainer');
  statusContainer.innerHTML = players.map(p => `
    <span class="player-badge"><b>${p.name}</b>: ${p.cards.length} карт(а)</span>
  `).join(' | ');

  // Находим себя в списке игроков
  const me = players.find(p => p.id === socket.id);
  const handEl = document.getElementById('myHand');
  handEl.innerHTML = '';

  if (me && me.cards) {
    me.cards.forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'tabata-card card';
      
      // Отрисовываем карточку с цифрами на углах так же, как на твоем фото
      cardDiv.innerHTML = `
          <div class="corner-top-left">${card.answers[0] !== undefined ? card.answers[0] : ''}</div>
          <div class="corner-top-right">${card.answers[1] !== undefined ? card.answers[1] : card.answers[0]}</div>
          <div class="equation-text">${card.equation}</div>
          <div class="corner-bottom-left">${card.answers[1] !== undefined ? card.answers[1] : ''}</div>
          <div class="corner-bottom-right">${card.answers[0] !== undefined ? card.answers[0] : ''}</div>
      `;

      const handleCardClick = (e) => {
        e.preventDefault();
        socket.emit('playCard', { roomId: currentRoomId, cardId: card.id });
      };

      cardDiv.addEventListener('click', handleCardClick);
      cardDiv.addEventListener('touchend', handleCardClick);

      handEl.appendChild(cardDiv);
    });
  }
}

socket.on('gameOver', ({ winner }) => {
  showModal(`🏆 Ойын аяқталды!\nЖеңімпаз: ${winner}!`);
  setTimeout(() => location.reload(), 5000);
});