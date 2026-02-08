const socket = io();

const loginCard = document.getElementById('login');
const nameCard = document.getElementById('name');
const waitingCard = document.getElementById('waiting');
const playerCard = document.getElementById('player');
const gmModeCard = document.getElementById('gm-mode');
const gmCard = document.getElementById('gm');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const connectionStatus = document.getElementById('connection-status');

const usernameInput = document.getElementById('login-username');
const passwordInput = document.getElementById('login-password');

const nameInput = document.getElementById('player-name-input');
const nameBtn = document.getElementById('player-name-btn');
const namePill = document.getElementById('player-name-pill');
const playerScore = document.getElementById('player-score');
const buzzer = document.getElementById('buzzer');
const buzzerStatus = document.getElementById('buzzer-status');

const gmQuestion = document.getElementById('gm-question');
const gmAnswer = document.getElementById('gm-answer');
const gmCategory = document.getElementById('gm-category');
const gmDifficulty = document.getElementById('gm-difficulty');
const gmQueue = document.getElementById('gm-queue');
const gmScores = document.getElementById('gm-scores');
const gmNext = document.getElementById('gm-next');
const gmCorrect = document.getElementById('gm-correct');
const gmIncorrect = document.getElementById('gm-incorrect');
const gmReset = document.getElementById('gm-reset');
const gmResetLobby = document.getElementById('gm-reset-lobby');
const gmBuzzers = document.getElementById('gm-buzzers');

const modeInfinite = document.getElementById('mode-infinite');
const modeFirst = document.getElementById('mode-first');
const firstToConfig = document.getElementById('first-to-config');
const firstToInput = document.getElementById('first-to-input');
const firstToStart = document.getElementById('first-to-start');
const modeError = document.getElementById('mode-error');

let role = null;
let myName = null;
let hasBuzzed = false;
let lastRound = null;
let cachedCreds = null;

try {
  cachedCreds = JSON.parse(sessionStorage.getItem('quizCreds') || 'null');
} catch (_) {
  cachedCreds = null;
}

function showPanel(panel) {
  loginCard.classList.add('hidden');
  nameCard.classList.add('hidden');
  waitingCard.classList.add('hidden');
  playerCard.classList.add('hidden');
  gmModeCard.classList.add('hidden');
  gmCard.classList.add('hidden');
  panel.classList.remove('hidden');
}

loginBtn.addEventListener('click', () => {
  loginError.textContent = '';
  socket.emit('login', {
    username: usernameInput.value.trim(),
    password: passwordInput.value,
  });
});

nameBtn.addEventListener('click', () => {
  socket.emit('set_name', nameInput.value.trim());
});

buzzer.addEventListener('click', () => {
  socket.emit('buzz');
  hasBuzzed = true;
  buzzer.disabled = true;
});

function setModeButtonsDisabled(disabled) {
  modeInfinite.disabled = disabled;
  modeFirst.disabled = disabled;
  firstToStart.disabled = disabled;
}

function sendMode(payload) {
  modeError.textContent = '';
  setModeButtonsDisabled(true);
  socket.emit('gm_set_mode', payload, (res) => {
    setModeButtonsDisabled(false);
    if (!res || !res.ok) {
      modeError.textContent = (res && res.message) || 'Failed to start mode.';
    }
  });
}

modeInfinite.addEventListener('click', () => {
  sendMode({ mode: 'infinite' });
});

modeFirst.addEventListener('click', () => {
  firstToConfig.classList.remove('hidden');
});

firstToStart.addEventListener('click', () => {
  const target = Number(firstToInput.value);
  sendMode({ mode: 'first_to', targetScore: target });
});

if (gmNext) gmNext.addEventListener('click', () => socket.emit('gm_next'));
if (gmCorrect) gmCorrect.addEventListener('click', () => socket.emit('gm_correct'));
if (gmIncorrect) gmIncorrect.addEventListener('click', () => socket.emit('gm_incorrect'));
if (gmReset) gmReset.addEventListener('click', () => socket.emit('gm_reset_scores'));
if (gmResetLobby) gmResetLobby.addEventListener('click', () => socket.emit('gm_reset_lobby'));
if (gmBuzzers) gmBuzzers.addEventListener('click', () => {
  const open = gmBuzzers.dataset.open !== 'true';
  socket.emit('gm_toggle_buzzers', open);
});

socket.on('login_result', (res) => {
  if (!res.ok) {
    loginError.textContent = res.message || 'Login failed';
    return;
  }

  role = res.role;
  cachedCreds = {
    username: usernameInput.value.trim(),
    password: passwordInput.value,
    role,
  };
  sessionStorage.setItem('quizCreds', JSON.stringify(cachedCreds));
  if (role === 'gm') {
    showPanel(gmModeCard);
  } else {
    showPanel(nameCard);
  }
});

socket.on('name_set', ({ name }) => {
  myName = name;
  sessionStorage.setItem('quizName', myName);
  namePill.textContent = name;
  showPanel(waitingCard);
});

socket.on('force_logout', () => {
  sessionStorage.removeItem('quizName');
  myName = null;
  showPanel(nameCard);
});

socket.on('state', (state) => {
  if (role === 'gm') {
    if (state.started) {
      showPanel(gmCard);
    } else {
      showPanel(gmModeCard);
    }
    gmQuestion.textContent = state.question || 'No questions loaded';
    gmAnswer.textContent = state.answer ? `Answer: ${state.answer}` : '';
    gmCategory.textContent = state.category ? `Category: ${state.category}` : 'Category: —';
    gmDifficulty.textContent = state.difficulty ? `Difficulty: ${state.difficulty}` : 'Difficulty: —';
    if (gmBuzzers) {
      gmBuzzers.dataset.open = state.buzzersOpen ? 'true' : 'false';
      gmBuzzers.textContent = state.buzzersOpen ? 'Lock Buzzers' : 'Unlock Buzzers';
    }

    gmQueue.innerHTML = '';
    state.queue.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      gmQueue.appendChild(li);
    });

    gmScores.innerHTML = '';
    state.scores
      .sort((a, b) => b.score - a.score)
      .forEach((p) => {
        const div = document.createElement('div');
        div.className = 'score-chip';
        div.textContent = `${p.name}: ${p.score}`;
        gmScores.appendChild(div);
      });
  }

  if (role === 'player') {
    if (!myName) {
      showPanel(nameCard);
      return;
    }
    if (!state.started) {
      showPanel(waitingCard);
      return;
    }

    showPanel(playerCard);
    const isActive = !!state.question && state.buzzersOpen;
    if (state.round !== lastRound) {
      hasBuzzed = false;
      lastRound = state.round;
    }

    buzzer.disabled = !myName || !isActive || hasBuzzed;
    if (!isActive) {
      buzzerStatus.textContent = state.question ? 'Buzzer locked by host.' : 'Waiting for a question…';
    } else if (hasBuzzed) {
      buzzerStatus.textContent = 'Buzzer Inactive';
    } else {
      buzzerStatus.textContent = 'Buzzer Active';
    }

    const me = state.scores.find((p) => p.name === myName);
    playerScore.textContent = me ? me.score : '0';
  }
});

socket.on('connect', () => {
  connectionStatus.textContent = '';
  const storedName = sessionStorage.getItem('quizName');
  if (cachedCreds && cachedCreds.username && cachedCreds.password) {
    usernameInput.value = cachedCreds.username;
    passwordInput.value = cachedCreds.password;
    socket.emit('login', {
      username: cachedCreds.username,
      password: cachedCreds.password,
    });
  }
  if (storedName) {
    myName = storedName;
    socket.emit('set_name', myName);
  }
});

socket.on('disconnect', () => {
  connectionStatus.textContent = 'Connection lost. Reconnecting…';
});

socket.on('connect_error', () => {
  connectionStatus.textContent = 'Cannot reach server. Check your connection.';
});

socket.on('lobby_reset', () => {
  sessionStorage.removeItem('quizName');
  sessionStorage.removeItem('quizCreds');
  myName = null;
  role = null;
  showPanel(loginCard);
});

window.addEventListener('beforeunload', (event) => {
  event.preventDefault();
  event.returnValue = 'If you refresh, you will reset your progress and need to log in again.';
});
