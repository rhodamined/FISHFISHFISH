const test = require('node:test');
const assert = require('node:assert/strict');
const registerSocketHandlers = require('./socket_handlers');

class TestSocket {
  constructor() {
    this.id = 'test-socket';
    this.handlers = new Map();
    this.rooms = new Set();
    this.emitted = [];
    this.data = {};
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

test('acknowledges valid Player IDs and rejects invalid IDs', async () => {
  let onConnection;
  const emittedByServer = [];
  const io = {
    on: (event, handler) => {
      assert.equal(event, 'connection');
      onConnection = handler;
    },
    to: (room) => ({
      emit: (event, payload) => emittedByServer.push({ room, event, payload }),
    }),
  };
  const gameState = {
    gameID: 'ABC123',
    findPlayerId: (code) => code === 'FISH1' ? 'FISH1' : null,
    claimPlayerId: (code, token) => code === 'FISH1'
      ? { ok: true, playerId: code, playerToken: token || 'player-1', newlyClaimed: !token }
      : { ok: false, error: 'invalid_player_id' },
    markPlayerConnected: () => true,
    markPlayerDisconnected: () => true,
    getDashboardState: () => ({
      gameID: 'ABC123',
      players: [{ playerId: 'FISH1', status: 'joined', connectionStatus: 'connected' }],
    }),
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);

  let response;
  await socket.handlers.get('game:join')({ playerId: 'FISH1' }, (result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: true, playerId: 'FISH1', playerToken: 'player-1' });
  assert.equal(socket.rooms.has('player:FISH1'), true);
  assert.deepEqual(emittedByServer.at(-1), {
    room: 'dashboard:admins',
    event: 'dashboard:state',
    payload: {
      gameID: 'ABC123',
      players: [{ playerId: 'FISH1', status: 'joined', connectionStatus: 'connected' }],
    },
  });

  await socket.handlers.get('game:join')({ playerId: 'invalid' }, (result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: false, error: 'invalid_player_id' });
  assert.equal(socket.rooms.has('player:FISH1'), true);
});

test('prevents one socket from joining a second Player ID', async () => {
  let onConnection;
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: () => ({ emit: () => {} }),
  };
  const gameState = {
    gameID: 'ABC123',
    findPlayerId: (code) => code,
    claimPlayerId: (code, token) => ({
      ok: true,
      playerId: code,
      playerToken: token || code,
      newlyClaimed: !token,
    }),
    markPlayerConnected: () => true,
    markPlayerDisconnected: () => true,
    getDashboardState: () => ({ gameID: 'ABC123', players: [] }),
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);
  const join = socket.handlers.get('game:join');

  await join({ playerId: 'FISH1' }, () => {});
  let response;
  await join({ playerId: 'FISH2' }, (result) => {
    response = result;
  });

  assert.equal(socket.rooms.has('player:FISH1'), true);
  assert.equal(socket.rooms.has('player:FISH2'), false);
  assert.deepEqual(response, { ok: false, error: 'already_joined' });
});

test('rejects a second socket trying to claim an occupied Player ID', async () => {
  const GameState = require('./classes/game_state');
  let onConnection;
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: () => ({ emit: () => {} }),
  };
  const gameState = new GameState();
  gameState.startNewGame(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  registerSocketHandlers(io, gameState);

  const firstSocket = new TestSocket();
  const secondSocket = new TestSocket();
  onConnection(firstSocket);
  onConnection(secondSocket);

  let firstResponse;
  let secondResponse;
  await firstSocket.handlers.get('game:join')({ playerId: 'FISH1' }, (response) => {
    firstResponse = response;
  });
  await secondSocket.handlers.get('game:join')({ playerId: 'FISH1' }, (response) => {
    secondResponse = response;
  });

  assert.equal(firstResponse.ok, true);
  assert.deepEqual(secondResponse, { ok: false, error: 'player_id_taken' });
  assert.equal(firstSocket.rooms.has('player:FISH1'), true);
  assert.equal(secondSocket.rooms.has('player:FISH1'), false);
});

test('sends a dashboard snapshot to dashboard subscribers', async () => {
  let onConnection;
  const io = { on: (_event, handler) => { onConnection = handler; } };
  const state = {
    gameID: 'ABC123',
    players: [{ playerId: 'FISH1', status: 'available', connectionStatus: 'not joined' }],
  };
  const gameState = {
    gameID: 'ABC123',
    getDashboardState: () => state,
    findPlayerId: () => null,
    claimPlayerId: () => ({ ok: false, error: 'invalid_player_id' }),
  };
  const socket = new TestSocket();

  registerSocketHandlers(io, gameState);
  onConnection(socket);
  await socket.handlers.get('dashboard:authenticate')({ password: 'jasper' }, () => {});
  socket.handlers.get('dashboard:subscribe')();

  assert.deepEqual(socket.emitted.at(-1), { event: 'dashboard:state', payload: state });
});

test('updates authenticated dashboard room on join and disconnect', async () => {
  let onConnection;
  const broadcasts = [];
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: (room) => ({
      emit: (event, payload) => broadcasts.push({ room, event, payload }),
    }),
  };
  const GameState = require('./classes/game_state');
  const gameState = new GameState();
  gameState.startNewGame(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  const socket = new TestSocket();
  registerSocketHandlers(io, gameState);
  onConnection(socket);

  let response;
  await socket.handlers.get('game:join')({ playerId: 'FISH1' }, (result) => {
    response = result;
  });
  assert.equal(response.ok, true);
  assert.equal(broadcasts.at(-1).room, 'dashboard:admins');
  assert.equal(broadcasts.at(-1).payload.players[0].status, 'joined');
  assert.equal(broadcasts.at(-1).payload.players[0].connectionStatus, 'connected');

  socket.handlers.get('disconnect')('transport close');
  assert.equal(broadcasts.at(-1).payload.players[0].status, 'joined');
  assert.equal(broadcasts.at(-1).payload.players[0].connectionStatus, 'disconnected');
});

test('requires dashboard authentication to subscribe or start a new game', async () => {
  let onConnection;
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: () => ({ emit: () => {} }),
    in: () => ({ socketsLeave: async () => {} }),
  };
  const GameState = require('./classes/game_state');
  const gameState = new GameState();
  gameState.startNewGame(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  const socket = new TestSocket();
  registerSocketHandlers(io, gameState);
  onConnection(socket);

  let response;
  socket.handlers.get('dashboard:subscribe')((result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: false, error: 'unauthorized' });

  await socket.handlers.get('dashboard:authenticate')({ password: 'wrong' }, (result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: false, error: 'invalid_password' });

  socket.handlers.get('game:new')((result) => {
    response = result;
  });
  assert.deepEqual(response, { ok: false, error: 'unauthorized' });
});

test('authenticated new-game resets claims and notifies players', async () => {
  let onConnection;
  const roomNotifications = [];
  const broadcasts = [];
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: (room) => ({
      emit: (event, payload) => {
        if (room.startsWith('player:')) roomNotifications.push({ room, event });
        else broadcasts.push({ room, event, payload });
      },
    }),
    in: () => ({ socketsLeave: async () => {} }),
  };
  const GameState = require('./classes/game_state');
  const gameState = new GameState();
  gameState.startNewGame(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  const playerSocket = new TestSocket();
  const adminSocket = new TestSocket();
  const refreshedCodes = Array.from({ length: 11 }, (_, index) => `NEW${index + 1}`);
  registerSocketHandlers(io, gameState, async () => refreshedCodes);
  onConnection(playerSocket);
  onConnection(adminSocket);

  const previousGameID = gameState.gameID;
  await playerSocket.handlers.get('game:join')({ playerId: 'FISH1' }, () => {});
  await adminSocket.handlers.get('dashboard:authenticate')({ password: 'jasper' }, () => {});

  let response;
  await adminSocket.handlers.get('game:new')((result) => {
    response = result;
  });

  assert.equal(response.ok, true);
  assert.match(response.state.gameID, /^[A-Z0-9]{6}$/);
  assert.notEqual(response.state.gameID, previousGameID);
  assert.equal(response.state.players[0].status, 'available');
  assert.equal(response.state.players[0].connectionStatus, 'not joined');
  assert.equal(response.state.players.length, 11);
  assert.equal(response.state.players[0].playerId, 'NEW1');
  assert.deepEqual(roomNotifications, [{ room: 'player:FISH1', event: 'game:reset' }]);
  assert.equal(broadcasts.at(-1).room, 'dashboard:admins');
  assert.equal(broadcasts.at(-1).event, 'dashboard:state');
});

test('keeps the active game intact when refreshing codes fails', async () => {
  let onConnection;
  const roomNotifications = [];
  const io = {
    on: (_event, handler) => { onConnection = handler; },
    to: (room) => ({
      emit: (event) => roomNotifications.push({ room, event }),
    }),
    in: () => ({ socketsLeave: async () => {} }),
  };
  const GameState = require('./classes/game_state');
  const gameState = new GameState();
  gameState.startNewGame(Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`));
  const adminSocket = new TestSocket();
  registerSocketHandlers(io, gameState, async () => {
    throw new Error('Sheets unavailable');
  });
  onConnection(adminSocket);
  await adminSocket.handlers.get('dashboard:authenticate')({ password: 'jasper' }, () => {});

  let response;
  await adminSocket.handlers.get('game:new')((result) => {
    response = result;
  });

  assert.deepEqual(response, { ok: false, error: 'sync_failed' });
  assert.equal(gameState.findPlayerId('FISH1'), 'FISH1');
  assert.equal(gameState.getDashboardState().players.length, 10);
  assert.deepEqual(roomNotifications, []);
});
