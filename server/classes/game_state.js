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

    this.gameCodes = new Map(normalizedCodes.map((code) => [code, null]));
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

    const currentToken = this.gameCodes.get(gameCode);
    if (currentToken && currentToken !== playerToken) {
      return { ok: false, error: 'game_code_taken' };
    }

    const token = currentToken || randomUUID();
    this.gameCodes.set(gameCode, token);
    return {
      ok: true,
      gameCode,
      playerToken: token,
      newlyClaimed: !currentToken,
    };
  }

  // Return public code availability data for the live dashboard.
  getDashboardState() {
    return Array.from(this.gameCodes, ([code, playerToken]) => ({
      code,
      status: playerToken ? 'joined' : 'available',
    }));
  }
}

module.exports = GameState;
