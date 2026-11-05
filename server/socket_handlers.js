const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'jasper';

function registerSocketHandlers(io, gameState, readPlayerIdsFromGSheet) {
  let gameResetInProgress = false;

  // Register the per-client connection lifecycle and initial readiness event.
  io.on('connection', (socket) => {
    console.info(`[Game ${gameState.gameID}] [Socket.IO] Client connected: ${socket.id}`);
    socket.emit('server:ready', { connected: true });

    let joinedPlayerId = null;
    let joinedPlayerToken = null;

    // Authenticate dashboard controls using a server-side password check.
    socket.on('dashboard:authenticate', async (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return;

      const authenticated = payload?.password === DASHBOARD_PASSWORD;
      try {
        if (authenticated) {
          await socket.join('dashboard:admins');
        } else {
          await socket.leave('dashboard:admins');
        }
        socket.data.dashboardAuthenticated = authenticated;
        acknowledge(authenticated
          ? { ok: true }
          : { ok: false, error: 'invalid_password' });
      } catch (error) {
        socket.data.dashboardAuthenticated = false;
        console.error(`[Game ${gameState.gameID}] Unable to set dashboard access for socket ${socket.id}.`, error);
        acknowledge({ ok: false, error: 'authentication_failed' });
      }
    });

    // Send the latest player availability snapshot to dashboard clients.
    socket.on('dashboard:subscribe', (acknowledge) => {
      if (!socket.data.dashboardAuthenticated) {
        if (typeof acknowledge === 'function') {
          acknowledge({ ok: false, error: 'unauthorized' });
        }
        return;
      }

      socket.emit('dashboard:state', gameState.getDashboardState());
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    // Start a fresh game after dashboard authentication, clearing all claims.
    socket.on('game:new', async (acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      if (!socket.data.dashboardAuthenticated) {
        acknowledge({ ok: false, error: 'unauthorized' });
        return;
      }
      if (gameResetInProgress) {
        acknowledge({ ok: false, error: 'reset_in_progress' });
        return;
      }
      if (typeof readPlayerIdsFromGSheet !== 'function') {
        acknowledge({ ok: false, error: 'sync_unavailable' });
        return;
      }

      gameResetInProgress = true;
      let refreshedPlayerIds;
      try {
        refreshedPlayerIds = gameState.normalizePlayerIds(
          await readPlayerIdsFromGSheet(),
        );
      } catch (error) {
        console.error(`[Game ${gameState.gameID}] Unable to reload player IDs from Google Sheets.`, error);
        gameResetInProgress = false;
        acknowledge({ ok: false, error: 'sync_failed' });
        return;
      }

      const joinedPlayerIds = gameState.getDashboardState().players
        .filter((player) => player.status === 'joined')
        .map((player) => player.playerId);

      try {
        for (const playerId of joinedPlayerIds) {
          const room = `player:${playerId}`;
          io.to(room).emit('game:reset');
          await io.in(room).socketsLeave(room);
        }

        gameState.startNewGame(refreshedPlayerIds);
        const state = gameState.getDashboardState();
        io.to('dashboard:admins').emit('dashboard:state', state);
        console.info(`[Google Sheets] Sync successful for game ${state.gameID}: loaded ${state.players.length} player IDs.`);
        console.info(`[Game ${state.gameID}] New game started with ${state.players.length} player IDs.`);
        acknowledge({ ok: true, state });
      } catch (error) {
        console.error(`[Game ${gameState.gameID}] Unable to reset player rooms after refreshing player IDs.`, error);
        acknowledge({ ok: false, error: 'reset_failed' });
      } finally {
        gameResetInProgress = false;
      }
    });

    // Validate a submitted Player ID and place the connection in that player's room.
    socket.on('game:join', async (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      if (gameResetInProgress) {
        acknowledge({ ok: false, error: 'reset_in_progress' });
        return;
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        acknowledge({ ok: false, error: 'invalid_request' });
        return;
      }

      const requestedPlayerId = gameState.findPlayerId(payload.playerId);
      if (!requestedPlayerId) {
        acknowledge({ ok: false, error: 'invalid_player_id' });
        return;
      }

      if (joinedPlayerId && joinedPlayerId !== requestedPlayerId) {
        acknowledge({ ok: false, error: 'already_joined' });
        return;
      }

      const claim = gameState.claimPlayerId(requestedPlayerId, payload.playerToken);
      if (!claim.ok) {
        if (claim.error === 'invalid_player_token') {
          acknowledge({ ok: false, error: claim.error });
          return;
        }
        acknowledge({ ok: false, error: claim.error });
        return;
      }

      try {
        await socket.join(`player:${claim.playerId}`);
        if (!gameState.markPlayerConnected(claim.playerId, claim.playerToken, socket.id)) {
          await socket.leave(`player:${claim.playerId}`);
          acknowledge({ ok: false, error: 'join_failed' });
          return;
        }
        joinedPlayerId = claim.playerId;
        joinedPlayerToken = claim.playerToken;
        if (claim.newlyClaimed) {
          console.info(`[Game ${gameState.gameID}] Player ID ${claim.playerId} claimed by socket ${socket.id}.`);
        } else {
          console.info(`[Game ${gameState.gameID}] Player ID ${claim.playerId} reconnected on socket ${socket.id}.`);
        }
        acknowledge({
          ok: true,
          playerId: claim.playerId,
          playerToken: claim.playerToken,
        });
        io.to('dashboard:admins').emit('dashboard:state', gameState.getDashboardState());
      } catch (error) {
        console.error(`[Game ${gameState.gameID}] Unable to join player ID ${claim.playerId} for socket ${socket.id}.`, error);
        acknowledge({ ok: false, error: 'join_failed' });
      }
    });

    // Clear this socket's old game association after it receives a reset notice.
    socket.on('game:reset:ack', async () => {
      if (!joinedPlayerId) return;

      try {
        await socket.leave(`player:${joinedPlayerId}`);
        joinedPlayerId = null;
        joinedPlayerToken = null;
      } catch (error) {
        console.error(`[Game ${gameState.gameID}] Unable to remove reset socket ${socket.id} from its player room.`, error);
      }
    });

    // Log why this client's connection ended for server-side diagnostics.
    socket.on('disconnect', (reason) => {
      if (joinedPlayerId
        && gameState.markPlayerDisconnected(joinedPlayerId, joinedPlayerToken, socket.id)) {
        io.to('dashboard:admins').emit('dashboard:state', gameState.getDashboardState());
      }
      console.info(`[Game ${gameState.gameID}] [Socket.IO] Client disconnected: ${socket.id} (${reason}).`);
    });
  });
}

module.exports = registerSocketHandlers;
