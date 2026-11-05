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
  assert.deepEqual(dashboardState[0], { code: 'FISH1', status: 'joined' });
  assert.deepEqual(dashboardState[1], { code: 'FISH2', status: 'available' });
});
