const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
      .map((item) => ({ q: String(item.q || '').trim(), a: String(item.a || '').trim() }))
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
          return { q: String(item.q || '').trim(), a: String(item.a || '').trim() };
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
  currentIndex: 0,
  queue: [], // array of socket ids
  revealed: true,
  players: new Map(), // socketId -> { name, score }
};

function getCurrentQuestion() {
  if (!state.questions.length) return null;
  return state.questions[state.currentIndex % state.questions.length];
}

function resetRound() {
  state.queue = [];
  state.revealed = true;
}

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
    round: state.currentIndex,
  };

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.role === 'gm') {
      socket.emit('state', {
        ...basePayload,
        revealed: true,
        answer: question ? question.a : null,
      });
    } else if (socket.data.role === 'player') {
      socket.emit('state', {
        ...basePayload,
        revealed: false,
        answer: null,
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

    let finalName = name;
    const existingNames = new Set(Array.from(state.players.values()).map((p) => p.name));
    if (existingNames.has(finalName)) {
      let i = 2;
      while (existingNames.has(`${finalName} ${i}`)) i += 1;
      finalName = `${finalName} ${i}`;
    }

    state.players.set(socket.id, { name: finalName, score: 0 });
    socket.emit('name_set', { name: finalName });
    broadcastState();
  });

  socket.on('buzz', () => {
    if (!state.players.has(socket.id)) return;
    if (!getCurrentQuestion()) return;
    if (state.queue.includes(socket.id)) return;

    state.queue.push(socket.id);
    broadcastState();
  });

  socket.on('gm_next', () => {
    state.currentIndex += 1;
    resetRound();
    broadcastState();
  });

  socket.on('gm_correct', () => {
    const currentId = state.queue[0];
    if (!currentId) return;
    const player = state.players.get(currentId);
    if (!player) return;

    player.score += 1;
    state.queue = [];
    state.revealed = true;
    broadcastState();
  });

  socket.on('gm_incorrect', () => {
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

  socket.on('disconnect', () => {
    if (state.queue.includes(socket.id)) {
      state.queue = state.queue.filter((id) => id !== socket.id);
    }
    if (state.players.has(socket.id)) {
      state.players.delete(socket.id);
    }
    broadcastState();
  });
});

server.listen(config.port, () => {
  console.log(`Quiz game running on http://localhost:${config.port}`);
});
