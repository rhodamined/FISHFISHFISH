const test = require('node:test');
const assert = require('node:assert/strict');
const registerSocketHandlers = require('./socket_handlers');

class TestSocket {
  constructor() {
    this.id = 'test-socket';
    this.handlers = new Map();
    this.rooms = new Set();
    this.emitted = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, payload) {
    this.emitted.push({ event, payload });
  }

  async join(room) {
    this.rooms.add(room);
  }

  async leave(room) {
    this.rooms.delete(room);
  }
}

test('acknowledges valid codes and rejects invalid codes', async () => {
  let onConnection;
  const emittedByServer = [];
  const io = { on: (event, handler) => {
    assert.equal(event, 'connection');
    onConnection = handler;
  }, emit: (event, payload) => emittedByServer.push({ event, payload }) };
  const gameState = {
    findGameCode: (code) => code === 'FISH1' ? 'FISH1' : null,
    claimGameCode: (code, token) => code === 'FISH1'
      ? { ok: true, gameCode: code, playerToken: token || 'player-1', newlyClaimed: !token }
      : { ok: false, error: 'invalid_game_code' },
    getDashboardState: () => [{ code: 'FISH1', status: 'joined' }],
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);

  let response;
  await socket.handlers.get('game:join')({ code: 'FISH1' }, (result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: true, gameCode: 'FISH1', playerToken: 'player-1' });
  assert.equal(socket.rooms.has('game:FISH1'), true);
  assert.equal(emittedByServer.at(-1).event, 'dashboard:state');

  await socket.handlers.get('game:join')({ code: 'invalid' }, (result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: false, error: 'invalid_game_code' });
  assert.equal(socket.rooms.has('game:FISH1'), true);
});

test('prevents one socket from joining a second game code', async () => {
  let onConnection;
  const io = { on: (_event, handler) => { onConnection = handler; }, emit: () => {} };
  const gameState = {
    findGameCode: (code) => code,
    claimGameCode: (code, token) => ({
      ok: true,
      gameCode: code,
      playerToken: token || code,
      newlyClaimed: !token,
    }),
    getDashboardState: () => [],
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);
  const join = socket.handlers.get('game:join');

  await join({ code: 'FISH1' }, () => {});
  let response;
  await join({ code: 'FISH2' }, (result) => {
    response = result;
  });

  assert.equal(socket.rooms.has('game:FISH1'), true);
  assert.equal(socket.rooms.has('game:FISH2'), false);
  assert.deepEqual(response, { ok: false, error: 'already_joined' });
});

test('rejects a second socket trying to claim an occupied code', async () => {
  const GameState = require('./classes/game_state');
  let onConnection;
  const io = { on: (_event, handler) => { onConnection = handler; }, emit: () => {} };
  const gameState = new GameState();
  gameState.setGameCodes(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  registerSocketHandlers(io, gameState);

  const firstSocket = new TestSocket();
  const secondSocket = new TestSocket();
  onConnection(firstSocket);
  onConnection(secondSocket);

  let firstResponse;
  let secondResponse;
  await firstSocket.handlers.get('game:join')({ code: 'FISH1' }, (response) => {
    firstResponse = response;
  });
  await secondSocket.handlers.get('game:join')({ code: 'FISH1' }, (response) => {
    secondResponse = response;
  });

  assert.equal(firstResponse.ok, true);
  assert.deepEqual(secondResponse, { ok: false, error: 'game_code_taken' });
  assert.equal(firstSocket.rooms.has('game:FISH1'), true);
  assert.equal(secondSocket.rooms.has('game:FISH1'), false);
});

test('sends a dashboard snapshot to dashboard subscribers', () => {
  let onConnection;
  const io = { on: (_event, handler) => { onConnection = handler; }, emit: () => {} };
  const state = [{ code: 'FISH1', status: 'available' }];
  const gameState = {
    getDashboardState: () => state,
    findGameCode: () => null,
    claimGameCode: () => ({ ok: false, error: 'invalid_game_code' }),
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);
  socket.handlers.get('dashboard:subscribe')();

  assert.deepEqual(socket.emitted.at(-1), { event: 'dashboard:state', payload: state });
});
