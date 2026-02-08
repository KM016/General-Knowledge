const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.use(express.static(path.join(__dirname, 'public')));

function loadQuestions(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) return [];
  const ext = path.extname(fullPath).toLowerCase();
  const raw = fs.readFileSync(fullPath, 'utf8');

  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: item.id,
        category: String(item.category || '').trim(),
        difficulty: String(item.difficulty || '').trim(),
        q: String(item.question || item.q || '').trim(),
        a: String(item.answer || item.a || '').trim(),
      }))
      .filter((qa) => qa.q && qa.a);
  }

  if (ext === '.jsonl') {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const item = JSON.parse(line);
          return {
            id: item.id,
            category: String(item.category || '').trim(),
            difficulty: String(item.difficulty || '').trim(),
            q: String(item.question || item.q || '').trim(),
            a: String(item.answer || item.a || '').trim(),
          };
        } catch (_) {
          return null;
        }
      })
      .filter((qa) => qa && qa.q && qa.a);
  }

  // .txt format: question|answer per line
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|');
      if (parts.length < 2) return null;
      const q = parts[0].trim();
      const a = parts.slice(1).join('|').trim();
      return q && a ? { q, a } : null;
    })
    .filter(Boolean);
}

const state = {
  questions: loadQuestions(config.questionsFile),
  questionOrder: [],
  questionPos: 0,
  roundId: 0,
  queue: [], // array of socket ids
  revealed: true,
  players: new Map(), // socketId -> { name, score }
  nameIndex: new Map(), // name -> socketId
  mode: null, // 'first_to' | 'infinite'
  targetScore: null,
  started: false,
  buzzersOpen: false,
  playMode: null, // 'buzzer' | 'type'
  answers: new Map(), // socketId -> answer
};

function getCurrentQuestion() {
  if (!state.questions.length || !state.questionOrder.length) return null;
  const index = state.questionOrder[state.questionPos % state.questionOrder.length];
  return state.questions[index] || null;
}

function resetRound() {
  state.queue = [];
  state.revealed = true;
  state.buzzersOpen = false;
  state.answers.clear();
}

function resetGame() {
  resetRound();
  for (const player of state.players.values()) {
    player.score = 0;
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function initQuestionOrder() {
  state.questionOrder = state.questions.map((_, i) => i);
  shuffle(state.questionOrder);
  state.questionPos = 0;
}

function advanceQuestion() {
  if (!state.questionOrder.length) return;
  state.questionPos += 1;
  if (state.questionPos >= state.questionOrder.length) {
    shuffle(state.questionOrder);
    state.questionPos = 0;
  }
}

function nextQuestion() {
  advanceQuestion();
  state.roundId += 1;
}

initQuestionOrder();

function broadcastState() {
  const question = getCurrentQuestion();
  const queueNames = state.queue
    .map((id) => state.players.get(id))
    .filter(Boolean)
    .map((p) => p.name);

  const basePayload = {
    question: question ? question.q : null,
    queue: queueNames,
    scores: Array.from(state.players.values()).map((p) => ({ name: p.name, score: p.score })),
    round: state.roundId,
    mode: state.mode,
    targetScore: state.targetScore,
    started: state.started,
    buzzersOpen: state.buzzersOpen,
    playMode: state.playMode,
  };

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.role === 'gm') {
      const answers = [];
      for (const [id, answer] of state.answers.entries()) {
        const player = state.players.get(id);
        if (player) {
          answers.push({ id, name: player.name, answer });
        }
      }
      socket.emit('state', {
        ...basePayload,
        revealed: true,
        answer: question ? question.a : null,
        category: question ? question.category : null,
        difficulty: question ? question.difficulty : null,
        answers,
      });
    } else if (socket.data.role === 'player') {
      const playerAnswer = state.answers.get(socket.id) || null;
      socket.emit('state', {
        ...basePayload,
        revealed: false,
        answer: null,
        category: null,
        difficulty: null,
        playerAnswer,
      });
    }
  }
}

io.on('connection', (socket) => {
  socket.on('login', ({ username, password }) => {
    const isGM =
      username === config.gameMaster.username && password === config.gameMaster.password;
    const isPlayer =
      username === config.playerLogin.username && password === config.playerLogin.password;

    if (!isGM && !isPlayer) {
      socket.emit('login_result', { ok: false, message: 'Invalid credentials' });
      return;
    }

    socket.data.role = isGM ? 'gm' : 'player';
    socket.emit('login_result', {
      ok: true,
      role: isGM ? 'gm' : 'player',
      questionActive: !!getCurrentQuestion(),
    });

    if (isGM) {
      broadcastState();
    }
  });

  socket.on('set_name', (nameRaw) => {
    const name = String(nameRaw || '').trim();
    if (!name) return;

    const existingId = state.nameIndex.get(name);
    if (existingId && existingId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingId);
      if (existingSocket) {
        existingSocket.emit('force_logout', { reason: 'Another session took your name.' });
        existingSocket.disconnect(true);
      }
      state.players.delete(existingId);
    }

    const previous = state.players.get(socket.id);
    const score = previous ? previous.score : 0;
    state.players.set(socket.id, { name, score });
    state.nameIndex.set(name, socket.id);
    socket.emit('name_set', { name });
    broadcastState();
  });

  socket.on('buzz', () => {
    if (!state.players.has(socket.id)) return;
    if (!getCurrentQuestion()) return;
    if (!state.started) return;
    if (state.playMode !== 'buzzer') return;
    if (!state.buzzersOpen) return;
    if (state.queue.includes(socket.id)) return;

    state.queue.push(socket.id);
    broadcastState();
  });

  socket.on('gm_next', () => {
    if (!state.started) return;
    nextQuestion();
    resetRound();
    broadcastState();
  });

  socket.on('gm_set_mode', ({ mode, targetScore }, ack) => {
    if (socket.data.role !== 'gm') {
      if (typeof ack === 'function') ack({ ok: false, message: 'Not authorized.' });
      return;
    }
    if (mode !== 'first_to' && mode !== 'infinite') {
      if (typeof ack === 'function') ack({ ok: false, message: 'Invalid mode.' });
      return;
    }
    state.mode = mode;
    state.targetScore = mode === 'first_to' ? Number(targetScore) : null;
    if (mode === 'first_to') {
      if (!Number.isInteger(state.targetScore)) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Target must be a number.' });
        return;
      }
      if (state.targetScore < 10 || state.targetScore > 100) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Target must be 10–100.' });
        return;
      }
    }
    resetGame();
    state.roundId += 1;
    state.started = false;
    state.playMode = null;
    resetRound();
    broadcastState();
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('gm_toggle_buzzers', (open) => {
    if (socket.data.role !== 'gm') return;
    if (state.playMode !== 'buzzer') return;
    state.buzzersOpen = !!open;
    broadcastState();
  });

  socket.on('gm_set_play_mode', (mode) => {
    if (socket.data.role !== 'gm') return;
    if (mode !== 'buzzer' && mode !== 'type') return;
    state.playMode = mode;
    state.started = true;
    resetRound();
    broadcastState();
  });

  socket.on('submit_answer', (answerRaw) => {
    if (!state.players.has(socket.id)) return;
    if (!getCurrentQuestion()) return;
    if (!state.started) return;
    if (state.playMode !== 'type') return;
    const answer = String(answerRaw || '').trim();
    if (!answer) return;
    state.answers.set(socket.id, answer);
    broadcastState();
  });

  socket.on('gm_mark_answer', ({ id, correct }) => {
    if (socket.data.role !== 'gm') return;
    if (!state.answers.has(id)) return;
    const player = state.players.get(id);
    if (!player) return;
    if (correct) {
      player.score += 1;
    }
    state.answers.delete(id);
    broadcastState();
  });

  socket.on('gm_correct', () => {
    if (state.playMode !== 'buzzer') return;
    const currentId = state.queue[0];
    if (!currentId) return;
    const player = state.players.get(currentId);
    if (!player) return;

    player.score += 1;
    state.queue = [];
    state.revealed = true;
    if (state.mode === 'first_to' && state.targetScore && player.score >= state.targetScore) {
      resetGame();
      nextQuestion();
      resetRound();
      broadcastState();
      return;
    }
    nextQuestion();
    resetRound();
    broadcastState();
  });

  socket.on('gm_incorrect', () => {
    if (state.playMode !== 'buzzer') return;
    if (!state.queue.length) return;
    state.queue.shift();
    if (!state.queue.length) {
      state.revealed = true;
    }
    broadcastState();
  });

  socket.on('gm_reset_scores', () => {
    for (const player of state.players.values()) {
      player.score = 0;
    }
    broadcastState();
  });

  socket.on('gm_reset_lobby', () => {
    if (socket.data.role !== 'gm') return;
    resetGame();
    state.queue = [];
    state.players.clear();
    state.nameIndex.clear();
    state.answers.clear();
    state.mode = null;
    state.playMode = null;
    state.started = false;
    state.buzzersOpen = false;
    state.roundId += 1;
    io.emit('lobby_reset');
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (state.queue.includes(socket.id)) {
      state.queue = state.queue.filter((id) => id !== socket.id);
    }
    if (state.players.has(socket.id)) {
      const player = state.players.get(socket.id);
      if (player && state.nameIndex.get(player.name) === socket.id) {
        state.nameIndex.delete(player.name);
      }
      state.players.delete(socket.id);
    }
    if (state.answers.has(socket.id)) {
      state.answers.delete(socket.id);
    }
    broadcastState();
  });
});

server.listen(config.port, () => {
  console.log(`Quiz game running on http://localhost:${config.port}`);
});
