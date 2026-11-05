const test = require('node:test');
const assert = require('node:assert/strict');
const GameState = require('./game_state');

const codes = Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`);

test('stores ten unique player IDs and finds them case-insensitively', () => {
  const gameState = new GameState();

  gameState.startNewGame(codes);

  assert.equal(gameState.findPlayerId(' fish1 '), 'FISH1');
  assert.equal(gameState.findPlayerId('unknown'), null);
  assert.match(gameState.gameID, /^[A-Z0-9]{6}$/);
});

test('rejects invalid player-ID lists without replacing the current game', () => {
  const gameState = new GameState();
  gameState.startNewGame(codes);

  assert.throws(() => gameState.startNewGame([]), /at least one/);
  assert.throws(() => gameState.startNewGame([...codes.slice(0, 9), '']), /non-empty/);
  assert.throws(() => gameState.startNewGame([...codes.slice(0, 9), 'fish1']), /unique/);
  assert.equal(gameState.findPlayerId('FISH1'), 'FISH1');
});

test('accepts a growing list of valid player IDs', () => {
  const gameState = new GameState();
  const expandedCodes = [...codes, 'FISH11'];

  gameState.startNewGame(expandedCodes);

  assert.equal(gameState.getDashboardState().players.length, 11);
  assert.equal(gameState.findPlayerId('fish11'), 'FISH11');
});

test('generates a different game ID when starting a new game', () => {
  const gameState = new GameState();
  gameState.startNewGame(codes);
  const firstGameID = gameState.gameID;

  gameState.startNewGame(codes);

  assert.match(gameState.gameID, /^[A-Z0-9]{6}$/);
  assert.notEqual(gameState.gameID, firstGameID);
});

test('allows one player token per ID and reports dashboard status', () => {
  const gameState = new GameState();
  gameState.startNewGame(codes);

  const claim = gameState.claimPlayerId('fish1');
  assert.equal(claim.ok, true);
  assert.equal(typeof claim.playerToken, 'string');
  assert.deepEqual(gameState.claimPlayerId('FISH1', 'another-player'), {
    ok: false,
    error: 'player_id_taken',
  });
  assert.deepEqual(gameState.claimPlayerId('FISH1', claim.playerToken), {
    ...claim,
    newlyClaimed: false,
  });

  const dashboardState = gameState.getDashboardState();
  assert.equal(dashboardState.gameID, gameState.gameID);
  assert.deepEqual(dashboardState.players[0], {
    playerId: 'FISH1',
    status: 'joined',
    connectionStatus: 'disconnected',
  });
  assert.deepEqual(dashboardState.players[1], {
    playerId: 'FISH2',
    status: 'available',
    connectionStatus: 'not joined',
  });
});

test('disconnecting retains the claim and stale socket disconnects do not override reconnects', () => {
  const gameState = new GameState();
  gameState.startNewGame(codes);
  const claim = gameState.claimPlayerId('FISH1');

  assert.equal(gameState.markPlayerConnected('FISH1', claim.playerToken, 'socket-1'), true);
  assert.equal(gameState.markPlayerDisconnected('FISH1', claim.playerToken, 'socket-1'), true);
  assert.equal(gameState.findPlayerId('FISH1'), 'FISH1');
  assert.equal(gameState.getDashboardState().players[0].status, 'joined');
  assert.equal(gameState.getDashboardState().players[0].connectionStatus, 'disconnected');

  assert.equal(gameState.markPlayerConnected('FISH1', claim.playerToken, 'socket-2'), true);
  assert.equal(gameState.markPlayerDisconnected('FISH1', claim.playerToken, 'socket-1'), false);
  assert.equal(gameState.getDashboardState().players[0].connectionStatus, 'connected');
});

test('reset preserves player IDs but invalidates player claims and tokens', () => {
  const gameState = new GameState();
  gameState.startNewGame(codes);
  const claim = gameState.claimPlayerId('FISH1');
  gameState.markPlayerConnected('FISH1', claim.playerToken, 'socket-1');

  gameState.resetGame();

  assert.equal(gameState.findPlayerId('FISH1'), 'FISH1');
  assert.deepEqual(gameState.getDashboardState().players[0], {
    playerId: 'FISH1',
    status: 'available',
    connectionStatus: 'not joined',
  });
  assert.deepEqual(gameState.claimPlayerId('FISH1', claim.playerToken), {
    ok: false,
    error: 'invalid_player_token',
  });
});
