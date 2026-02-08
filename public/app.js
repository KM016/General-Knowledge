const socket = io();

const loginCard = document.getElementById('login');
const nameCard = document.getElementById('name');
const waitingCard = document.getElementById('waiting');
const playerCard = document.getElementById('player');
const gmModeCard = document.getElementById('gm-mode');
const gmPlayModeCard = document.getElementById('gm-play-mode');
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
const gmAnswers = document.getElementById('gm-answers');
const gmQueueCard = document.getElementById('gm-queue-card');
const gmAnswersCard = document.getElementById('gm-answers-card');
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
const playBuzzer = document.getElementById('play-buzzer');
const playType = document.getElementById('play-type');

let role = null;
let myName = null;
let hasBuzzed = false;
let lastRound = null;
let cachedCreds = null;

const buzzerWrap = document.getElementById('buzzer-wrap');
const typeinWrap = document.getElementById('typein-wrap');
const typeinInput = document.getElementById('typein-input');
const typeinSubmit = document.getElementById('typein-submit');
const typeinStatus = document.getElementById('typein-status');

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
  gmPlayModeCard.classList.add('hidden');
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

if (playBuzzer) playBuzzer.addEventListener('click', () => socket.emit('gm_set_play_mode', 'buzzer'));
if (playType) playType.addEventListener('click', () => socket.emit('gm_set_play_mode', 'type'));

if (gmNext) gmNext.addEventListener('click', () => socket.emit('gm_next'));
if (gmCorrect) gmCorrect.addEventListener('click', () => socket.emit('gm_correct'));
if (gmIncorrect) gmIncorrect.addEventListener('click', () => socket.emit('gm_incorrect'));
if (gmReset) gmReset.addEventListener('click', () => socket.emit('gm_reset_scores'));
if (gmResetLobby) gmResetLobby.addEventListener('click', () => socket.emit('gm_reset_lobby'));
if (gmBuzzers) gmBuzzers.addEventListener('click', () => {
  const open = gmBuzzers.dataset.open !== 'true';
  socket.emit('gm_toggle_buzzers', open);
});

if (typeinSubmit) typeinSubmit.addEventListener('click', () => {
  const answer = typeinInput.value.trim();
  if (!answer) return;
  socket.emit('submit_answer', answer);
  typeinStatus.textContent = 'Answer submitted.';
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
    if (!state.mode) {
      showPanel(gmModeCard);
    } else if (!state.playMode) {
      showPanel(gmPlayModeCard);
    } else {
      showPanel(gmCard);
    }
    gmQuestion.textContent = state.question || 'No questions loaded';
    gmAnswer.textContent = state.answer ? `Answer: ${state.answer}` : '';
    gmCategory.textContent = state.category ? `Category: ${state.category}` : 'Category: —';
    gmDifficulty.textContent = state.difficulty ? `Difficulty: ${state.difficulty}` : 'Difficulty: —';
    if (gmQueueCard) gmQueueCard.classList.toggle('hidden', state.playMode !== 'buzzer');
    if (gmAnswersCard) gmAnswersCard.classList.toggle('hidden', state.playMode !== 'type');
    if (gmBuzzers) {
      gmBuzzers.dataset.open = state.buzzersOpen ? 'true' : 'false';
      gmBuzzers.textContent = state.buzzersOpen ? 'Lock Buzzers' : 'Unlock Buzzers';
      gmBuzzers.disabled = state.playMode !== 'buzzer';
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

    if (gmAnswers) {
      gmAnswers.innerHTML = '';
      (state.answers || []).forEach((a) => {
        const card = document.createElement('div');
        card.className = 'answer-card';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = a.name;
        const text = document.createElement('div');
        text.textContent = a.answer;
        const actions = document.createElement('div');
        actions.className = 'row';
        const correct = document.createElement('button');
        correct.className = 'good';
        correct.textContent = 'Correct';
        correct.addEventListener('click', () => socket.emit('gm_mark_answer', { id: a.id, correct: true }));
        const incorrect = document.createElement('button');
        incorrect.className = 'bad';
        incorrect.textContent = 'Incorrect';
        incorrect.addEventListener('click', () => socket.emit('gm_mark_answer', { id: a.id, correct: false }));
        actions.append(correct, incorrect);
        card.append(name, text, actions);
        gmAnswers.appendChild(card);
      });
    }
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
    const isBuzzerMode = state.playMode === 'buzzer';
    const isTypeMode = state.playMode === 'type';
    if (buzzerWrap) buzzerWrap.classList.toggle('hidden', !isBuzzerMode);
    if (typeinWrap) typeinWrap.classList.toggle('hidden', !isTypeMode);

    const isActive = isBuzzerMode && !!state.question && state.buzzersOpen;
    if (state.round !== lastRound) {
      hasBuzzed = false;
      lastRound = state.round;
      if (typeinInput) typeinInput.value = '';
      if (typeinStatus) typeinStatus.textContent = '';
    }

    buzzer.disabled = !myName || !isActive || hasBuzzed;
    if (!isActive) {
      buzzerStatus.textContent = state.question ? 'Buzzer locked by host.' : 'Waiting for a question…';
    } else if (hasBuzzed) {
      buzzerStatus.textContent = 'Buzzer Inactive';
    } else {
      buzzerStatus.textContent = 'Buzzer Active';
    }

    if (isTypeMode) {
      const canSubmit = !!state.question;
      if (typeinSubmit) typeinSubmit.disabled = !canSubmit;
      const submitted = !!state.playerAnswer;
      if (typeinStatus && submitted) typeinStatus.textContent = 'Answer submitted.';
      if (typeinStatus && !submitted && !canSubmit) typeinStatus.textContent = 'Waiting for a question…';
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
