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
    myHandTitle: "Нұсқалар:",
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
    myHandTitle: "Варианты:",
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

socket.on('nextRoundData', ({ round, maxRounds, centerCard, options }) => {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameArea').classList.remove('hidden');

  const statusEl = document.getElementById('gameStatus');
  statusEl.style.background = '#e91e63';
  statusEl.textContent = `Раунд ${round} / ${maxRounds}`;
  
  // Устанавливаем уравнение в центр БЕЗ цифры
  document.getElementById('centerEqText').textContent = centerCard.eq;

  const handEl = document.getElementById('myHand');
  handEl.innerHTML = '';

  options.forEach(card => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'tabata-card';
    // Карточки выбора тоже содержат только уравнение, без цифр
    cardDiv.innerHTML = `
      <div class="equation-oval">${card.eq}</div>
    `;

    const handleCardClick = (e) => {
      e.preventDefault();
      socket.emit('submitAnswer', { roomId: currentRoomId, cardId: card.id });
    };

    cardDiv.addEventListener('click', handleCardClick);
    cardDiv.addEventListener('touchend', handleCardClick);

    handEl.appendChild(cardDiv);
  });
});

socket.on('roundWon', ({ message }) => {
  const statusEl = document.getElementById('gameStatus');
  statusEl.style.background = '#d9534f'; // Красный статус опоздания
  statusEl.textContent = `Опоздал! ${message}`;
});

socket.on('gameOver', ({ players }) => {
  let resultText = "🎉 Ойын аяқталды! Рейтинг:\n\n";
  players.forEach((p, index) => {
    resultText += `${index + 1}. ${p.name} — ${p.score} ұпай\n`;
  });
  showModal(resultText);
  setTimeout(() => location.reload(), 4000);
});

socket.on('notification', (msg) => showModal(msg));