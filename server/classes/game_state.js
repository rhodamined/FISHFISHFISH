const { randomUUID } = require('node:crypto');

const GAME_CODE_COUNT = 10;

class GameState {
  constructor() {
    this.gameCodes = new Map();
  }

  // Replace the in-memory game-code database only after validating the full
  // spreadsheet result, so invalid input cannot leave partial state behind.
  setGameCodes(codes) {
    if (!Array.isArray(codes) || codes.length !== GAME_CODE_COUNT) {
      throw new Error(`Expected exactly ${GAME_CODE_COUNT} game codes from Google Sheets.`);
    }

    const normalizedCodes = codes.map((code, index) => {
      if (typeof code !== 'string' || code.trim() === '') {
        throw new Error(`Game code ${index + 1} must be a non-empty string.`);
      }

      return code.trim().toUpperCase();
    });

    if (new Set(normalizedCodes).size !== GAME_CODE_COUNT) {
      throw new Error('Google Sheets must provide 10 unique game codes.');
    }

    this.gameCodes = new Map(normalizedCodes.map((code) => [
      code,
      { playerToken: null, socketId: null, connected: false },
    ]));
  }

  // Return the canonical stored code for a submitted code, or null if unknown.
  findGameCode(code) {
    if (typeof code !== 'string') return null;

    const normalizedCode = code.trim().toUpperCase();
    return this.gameCodes.has(normalizedCode) ? normalizedCode : null;
  }

  // Claim an available code, or allow the same player token to resume its claim.
  claimGameCode(code, playerToken) {
    const gameCode = this.findGameCode(code);
    if (!gameCode) return { ok: false, error: 'invalid_game_code' };

    const player = this.gameCodes.get(gameCode);
    if (player.playerToken && player.playerToken !== playerToken) {
      return { ok: false, error: 'game_code_taken' };
    }

    const newlyClaimed = !player.playerToken;
    const token = player.playerToken || randomUUID();
    player.playerToken = token;
    return {
      ok: true,
      gameCode,
      playerToken: token,
      newlyClaimed,
    };
  }

  // Associate a claimed code with its currently connected socket.
  markPlayerConnected(code, playerToken, socketId) {
    const gameCode = this.findGameCode(code);
    if (!gameCode) return false;

    const player = this.gameCodes.get(gameCode);
    if (player.playerToken !== playerToken) return false;

    player.socketId = socketId;
    player.connected = true;
    return true;
  }

  // Mark the current socket offline without releasing the player's code.
  markPlayerDisconnected(code, playerToken, socketId) {
    const gameCode = this.findGameCode(code);
    if (!gameCode) return false;

    const player = this.gameCodes.get(gameCode);
    if (player.playerToken !== playerToken || player.socketId !== socketId) return false;

    player.socketId = null;
    player.connected = false;
    return true;
  }

  // Return public code availability data for the live dashboard.
  getDashboardState() {
    return Array.from(this.gameCodes, ([code, player]) => ({
      code,
      status: player.playerToken ? 'joined' : 'available',
      connectionStatus: !player.playerToken
        ? 'not joined'
        : player.connected ? 'connected' : 'disconnected',
    }));
  }
}

module.exports = GameState;
