function registerSocketHandlers(io, gameState) {
  // Register the per-client connection lifecycle and initial readiness event.
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.emit('server:ready', { connected: true });

    let joinedGameCode = null;
    let joinedPlayerToken = null;

    // Send the latest code availability snapshot to dashboard clients.
    socket.on('dashboard:subscribe', () => {
      socket.emit('dashboard:state', gameState.getDashboardState());
    });

    // Validate a player's submitted code and place the connection in that game's room.
    socket.on('game:join', async (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return;

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        acknowledge({ ok: false, error: 'invalid_request' });
        return;
      }

      const requestedGameCode = gameState.findGameCode(payload.code);
      if (!requestedGameCode) {
        acknowledge({ ok: false, error: 'invalid_game_code' });
        return;
      }

      if (joinedGameCode && joinedGameCode !== requestedGameCode) {
        acknowledge({ ok: false, error: 'already_joined' });
        return;
      }

      const claim = gameState.claimGameCode(requestedGameCode, payload.playerToken);
      if (!claim.ok) {
        acknowledge({ ok: false, error: claim.error });
        return;
      }

      try {
        await socket.join(`game:${claim.gameCode}`);
        if (!gameState.markPlayerConnected(claim.gameCode, claim.playerToken, socket.id)) {
          await socket.leave(`game:${claim.gameCode}`);
          acknowledge({ ok: false, error: 'join_failed' });
          return;
        }
        joinedGameCode = claim.gameCode;
        joinedPlayerToken = claim.playerToken;
        acknowledge({
          ok: true,
          gameCode: claim.gameCode,
          playerToken: claim.playerToken,
        });
        io.emit('dashboard:state', gameState.getDashboardState());
      } catch (error) {
        console.error(`Unable to join game ${claim.gameCode} for socket ${socket.id}.`, error);
        acknowledge({ ok: false, error: 'join_failed' });
      }
    });

    // Log why this client's connection ended for server-side diagnostics.
    socket.on('disconnect', (reason) => {
      if (joinedGameCode
        && gameState.markPlayerDisconnected(joinedGameCode, joinedPlayerToken, socket.id)) {
        io.emit('dashboard:state', gameState.getDashboardState());
      }
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = registerSocketHandlers;
