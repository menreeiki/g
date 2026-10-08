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
  const maxPlayers = document.getElementById('maxPlayers').value;
  if (!name) return showModal('Атыңызды енгізіңіз / Введите имя');

  isHost = true;
  socket.emit('createRoom', { maxPlayers, playerName: name });
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim();
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name || !roomId) return showModal('Деректерді толық толтырыңыз / Заполните данные');

  isHost = false;
  socket.emit('joinRoom', { roomId, playerName: name });
}

socket.on('roomCreated', ({ roomId, players }) => {
  currentRoomId = roomId;
  showWaitingRoom(roomId, players);
});

socket.on('joinedRoom', ({ roomId, players }) => {
  currentRoomId = roomId;
  showWaitingRoom(roomId, players);
});

socket.on('playerJoined', ({ players }) => {
  updatePlayerList(players);
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
  if (currentRoomId) {
    socket.emit('startGameHost', { roomId: currentRoomId });
  }
}

// Получение обновленного состояния игры
socket.on('gameStateUpdate', ({ centerCard, myHand, playersStatus }) => {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameArea').classList.remove('hidden');

  // Отображаем уравнение в центре
  document.getElementById('centerEqText').textContent = centerCard.eq;

  // Показываем статус остальных игроков (сколько карт осталось)
  const statusContainer = document.getElementById('playersStatusContainer');
  statusContainer.innerHTML = playersStatus.map(p => `
    <span class="player-badge"><b>${p.name}</b>: ${p.cardsLeft} карт(а)</span>
  `).join(' | ');

  // Отрисовка карт на руках у игрока
  const handEl = document.getElementById('myHand');
  handEl.innerHTML = '';

  myHand.forEach(card => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'tabata-card';
    cardDiv.innerHTML = `<div class="equation-oval">${card.eq}</div>`;

    const handleCardClick = (e) => {
      e.preventDefault();
      socket.emit('submitCard', { roomId: currentRoomId, cardId: card.id });
    };

    cardDiv.addEventListener('click', handleCardClick);
    cardDiv.addEventListener('touchend', handleCardClick);

    handEl.appendChild(cardDiv);
  });
});

socket.on('gameOver', ({ winner }) => {
  showModal(`🏆 Ойын аяқталды!\nЖеңімпаз: ${winner}!`);
  setTimeout(() => location.reload(), 5000);
});

socket.on('notification', (msg) => showModal(msg));