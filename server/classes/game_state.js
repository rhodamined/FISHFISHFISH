const { randomInt, randomUUID } = require('node:crypto');

const GAME_ID_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

class GameState {
  constructor() {
    this.players = new Map();
    this.gameID = null;
    this.issuedGameIDs = new Set();
  }

  // Start a game only after validating its full player-ID list.
  startNewGame(playerIds) {
    const normalizedPlayerIds = this.normalizePlayerIds(playerIds);
    const gameID = this.createGameID();
    this.players = new Map(normalizedPlayerIds.map((playerId) => [
      playerId,
      { playerToken: null, socketId: null, connected: false },
    ]));
    this.gameID = gameID;
    return gameID;
  }

  createGameID() {
    if (this.issuedGameIDs.size >= GAME_ID_CHARACTERS.length ** 6) {
      throw new Error('Unable to generate a unique game ID.');
    }

    let gameID;
    do {
      gameID = Array.from({ length: 6 }, () => (
        GAME_ID_CHARACTERS[randomInt(GAME_ID_CHARACTERS.length)]
      )).join('');
    } while (this.issuedGameIDs.has(gameID));

    this.issuedGameIDs.add(gameID);
    return gameID;
  }

  // Validate and normalize a spreadsheet result without changing active game state.
  normalizePlayerIds(playerIds) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new Error('Google Sheets must provide at least one player ID.');
    }

    const normalizedPlayerIds = playerIds.map((playerId, index) => {
      if (typeof playerId !== 'string' || playerId.trim() === '') {
        throw new Error(`Player ID ${index + 1} must be a non-empty string.`);
      }

      return playerId.trim().toUpperCase();
    });

    if (new Set(normalizedPlayerIds).size !== normalizedPlayerIds.length) {
      throw new Error('Google Sheets must provide unique player IDs.');
    }

    return normalizedPlayerIds;
  }

  // Return the canonical player ID for a submitted code, or null if unknown.
  findPlayerId(value) {
    if (typeof value !== 'string') return null;

    const normalizedPlayerId = value.trim().toUpperCase();
    return this.players.has(normalizedPlayerId) ? normalizedPlayerId : null;
  }

  // Claim an available player ID, or allow its token to resume the claim.
  claimPlayerId(value, playerToken) {
    const playerId = this.findPlayerId(value);
    if (!playerId) return { ok: false, error: 'invalid_player_id' };

    const player = this.players.get(playerId);
    if (player.playerToken && player.playerToken !== playerToken) {
      return { ok: false, error: 'player_id_taken' };
    }
    if (!player.playerToken && playerToken) {
      return { ok: false, error: 'invalid_player_token' };
    }

    const newlyClaimed = !player.playerToken;
    const token = player.playerToken || randomUUID();
    player.playerToken = token;
    return {
      ok: true,
      playerId,
      playerToken: token,
      newlyClaimed,
    };
  }

  // Associate a claimed player ID with its currently connected socket.
  markPlayerConnected(playerId, playerToken, socketId) {
    playerId = this.findPlayerId(playerId);
    if (!playerId) return false;

    const player = this.players.get(playerId);
    if (player.playerToken !== playerToken) return false;

    player.socketId = socketId;
    player.connected = true;
    return true;
  }

  // Mark the current socket offline without releasing the player's ID.
  markPlayerDisconnected(playerId, playerToken, socketId) {
    playerId = this.findPlayerId(playerId);
    if (!playerId) return false;

    const player = this.players.get(playerId);
    if (player.playerToken !== playerToken || player.socketId !== socketId) return false;

    player.socketId = null;
    player.connected = false;
    return true;
  }

  // Clear all player claims and connection states while retaining spreadsheet codes.
  resetGame() {
    for (const playerId of this.players.keys()) {
      this.players.set(playerId, {
        playerToken: null,
        socketId: null,
        connected: false,
      });
    }
  }

  // Return the game ID and player availability data for the dashboard.
  getDashboardState() {
    return {
      gameID: this.gameID,
      players: Array.from(this.players, ([playerId, player]) => ({
        playerId,
        status: player.playerToken ? 'joined' : 'available',
        connectionStatus: !player.playerToken
          ? 'not joined'
          : player.connected ? 'connected' : 'disconnected',
      })),
    };
  }
}

module.exports = GameState;
