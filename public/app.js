const socket = io();

const loginCard = document.getElementById('login');
const nameCard = document.getElementById('name');
const waitingCard = document.getElementById('waiting');
const playerCard = document.getElementById('player');
const gmModeCard = document.getElementById('gm-mode');
const gmCard = document.getElementById('gm');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

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

socket.on('login_result', (res) => {
  if (!res.ok) {
    loginError.textContent = res.message || 'Login failed';
    return;
  }

  role = res.role;
  if (role === 'gm') {
    showPanel(gmModeCard);
  } else {
    showPanel(nameCard);
  }
});

socket.on('name_set', ({ name }) => {
  myName = name;
  namePill.textContent = name;
  showPanel(waitingCard);
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
    if (!state.started) {
      showPanel(waitingCard);
      return;
    }

    showPanel(playerCard);
    const isActive = !!state.question;
    if (state.round !== lastRound) {
      hasBuzzed = false;
      lastRound = state.round;
    }

    buzzer.disabled = !myName || !isActive || hasBuzzed;
    if (!isActive) {
      buzzerStatus.textContent = 'Waiting for a question…';
    } else if (hasBuzzed) {
      buzzerStatus.textContent = 'Buzzer Inactive';
    } else {
      buzzerStatus.textContent = 'Buzzer Active';
    }

    const me = state.scores.find((p) => p.name === myName);
    playerScore.textContent = me ? me.score : '0';
  }
});

window.addEventListener('beforeunload', (event) => {
  event.preventDefault();
  event.returnValue = 'If you refresh, you will reset your progress and need to log in again.';
});
