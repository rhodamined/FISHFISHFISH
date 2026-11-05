const test = require('node:test');
const assert = require('node:assert/strict');
const GameState = require('./game_state');

const codes = Array.from({ length: 10 }, (_, index) => `FISH${index + 1}`);

test('stores ten unique normalized game codes and finds codes case-insensitively', () => {
  const gameState = new GameState();

  gameState.setGameCodes(codes);

  assert.equal(gameState.findGameCode(' fish1 '), 'FISH1');
  assert.equal(gameState.findGameCode('unknown'), null);
});

test('rejects invalid game-code lists without replacing the current list', () => {
  const gameState = new GameState();
  gameState.setGameCodes(codes);

  assert.throws(() => gameState.setGameCodes(codes.slice(1)), /exactly 10/);
  assert.throws(() => gameState.setGameCodes([...codes.slice(0, 9), '']), /non-empty/);
  assert.throws(() => gameState.setGameCodes([...codes.slice(0, 9), 'fish1']), /unique/);
  assert.equal(gameState.findGameCode('FISH1'), 'FISH1');
});

test('allows one player token per code and reports dashboard status', () => {
  const gameState = new GameState();
  gameState.setGameCodes(codes);

  const claim = gameState.claimGameCode('fish1');
  assert.equal(claim.ok, true);
  assert.equal(typeof claim.playerToken, 'string');
  assert.deepEqual(gameState.claimGameCode('FISH1', 'another-player'), {
    ok: false,
    error: 'game_code_taken',
  });
  assert.deepEqual(gameState.claimGameCode('FISH1', claim.playerToken), {
    ...claim,
    newlyClaimed: false,
  });

  const dashboardState = gameState.getDashboardState();
  assert.deepEqual(dashboardState[0], {
    code: 'FISH1',
    status: 'joined',
    connectionStatus: 'disconnected',
  });
  assert.deepEqual(dashboardState[1], {
    code: 'FISH2',
    status: 'available',
    connectionStatus: 'not joined',
  });
});

test('disconnecting retains the claim and stale socket disconnects do not override reconnects', () => {
  const gameState = new GameState();
  gameState.setGameCodes(codes);
  const claim = gameState.claimGameCode('FISH1');

  assert.equal(gameState.markPlayerConnected('FISH1', claim.playerToken, 'socket-1'), true);
  assert.equal(gameState.markPlayerDisconnected('FISH1', claim.playerToken, 'socket-1'), true);
  assert.equal(gameState.findGameCode('FISH1'), 'FISH1');
  assert.equal(gameState.getDashboardState()[0].status, 'joined');
  assert.equal(gameState.getDashboardState()[0].connectionStatus, 'disconnected');

  assert.equal(gameState.markPlayerConnected('FISH1', claim.playerToken, 'socket-2'), true);
  assert.equal(gameState.markPlayerDisconnected('FISH1', claim.playerToken, 'socket-1'), false);
  assert.equal(gameState.getDashboardState()[0].connectionStatus, 'connected');
});
