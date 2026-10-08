const socket = io();
let currentRoomId = null;
let currentLang = 'kk';

const translations = {
  kk: {
    createTitle: "Жаңа бөлме құру",
    joinTitle: "Бөлмеге қосылу",
    btnCreate: "Бөлме ашу",
    btnJoin: "Қосылу",
    waitingTitle: "Ойыншылар күтілуде...",
    roomCodeLabel: "Бөлме коды:",
    centerTitle: "Ортадағы карта:",
    myHandTitle: "Сіздің карталарыңыз (жүру үшін басыңыз):"
  },
  ru: {
    createTitle: "Создать комнату",
    joinTitle: "Присоединиться",
    btnCreate: "Создать",
    btnJoin: "Войти",
    waitingTitle: "Ожидание игроков...",
    roomCodeLabel: "Код комнаты:",
    centerTitle: "Карта в центре:",
    myHandTitle: "Ваши карты (нажмите для хода):"
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

function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  const maxPlayers = document.getElementById('maxPlayers').value;
  if (!name) return alert('Атыңызды енгізіңіз / Введите имя');

  socket.emit('createRoom', { maxPlayers, playerName: name });
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim();
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name || !roomId) return alert('Деректерді толық толтырыңыз / Заполните данные');

  socket.emit('joinRoom', { roomId, playerName: name });
}

socket.on('roomCreated', ({ roomId, players }) => {
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
}

function updatePlayerList(players) {
  const list = document.getElementById('playerList');
  list.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
}

socket.on('gameStarted', ({ hand, centerCard, players }) => {
  document.getElementById('waitingRoom').classList.add('hidden');
  document.getElementById('gameArea').classList.remove('hidden');

  renderCenterCard(centerCard);
  renderHand(hand);
});

socket.on('gameUpdate', ({ centerCard, players, lastAction }) => {
  renderCenterCard(centerCard);
  document.getElementById('gameStatus').textContent = lastAction;
});

function renderCenterCard(card) {
  const centerEl = document.getElementById('centerCard');
  centerEl.innerHTML = `
    <div class="top-answer">${card.topAnswer}</div>
    <div class="equation-oval">${card.eq}</div>
  `;
}

function renderHand(hand) {
  const handEl = document.getElementById('myHand');
  handEl.innerHTML = '';
  hand.forEach(card => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'tabata-card';
    cardDiv.innerHTML = `
      <div class="top-answer">${card.topAnswer}</div>
      <div class="equation-oval">${card.eq}</div>
    `;
    cardDiv.onclick = () => {
      socket.emit('playCard', { roomId: currentRoomId, cardId: card.id });
    };
    handEl.appendChild(cardDiv);
  });
}

socket.on('penalized', ({ message }) => {
  alert(message);
});

socket.on('gameOver', ({ winner }) => {
  alert(`Ойын аяқталды! Жеңімпаз: ${winner} 🎉`);
  location.reload();
});

socket.on('errorMsg', (msg) => alert(msg));