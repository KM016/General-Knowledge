const socket = io();

const loginCard = document.getElementById('login');
const nameCard = document.getElementById('name');
const playerCard = document.getElementById('player');
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
const gmQueue = document.getElementById('gm-queue');
const gmScores = document.getElementById('gm-scores');
const gmNext = document.getElementById('gm-next');
const gmCorrect = document.getElementById('gm-correct');
const gmIncorrect = document.getElementById('gm-incorrect');
const gmReset = document.getElementById('gm-reset');

let role = null;
let myName = null;
let hasBuzzed = false;
let lastRound = null;

function showPanel(panel) {
  loginCard.classList.add('hidden');
  nameCard.classList.add('hidden');
  playerCard.classList.add('hidden');
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
    showPanel(gmCard);
  } else {
    showPanel(nameCard);
  }
});

socket.on('name_set', ({ name }) => {
  myName = name;
  namePill.textContent = name;
  showPanel(playerCard);
});

socket.on('state', (state) => {
  if (role === 'gm') {
    gmQuestion.textContent = state.question || 'No questions loaded';
    gmAnswer.textContent = state.revealed && state.answer ? `Answer: ${state.answer}` : '';

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
    const isActive = !!state.question;
    if (state.round !== lastRound) {
      hasBuzzed = false;
      lastRound = state.round;
    }

    buzzer.disabled = !myName || !isActive || hasBuzzed;
    if (!isActive) {
      buzzerStatus.textContent = 'Waiting for a question…';
    } else if (hasBuzzed) {
      buzzerStatus.textContent = 'Buzzed! Wait for the host.';
    } else {
      buzzerStatus.textContent = 'Buzzer active!';
    }

    const me = state.scores.find((p) => p.name === myName);
    playerScore.textContent = me ? me.score : '0';
  }
});
