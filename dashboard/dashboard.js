(() => {
  const grid = document.querySelector('#game-grid');
  const loginForm = document.querySelector('#dashboard-login-form');
  const passwordInput = loginForm.elements.namedItem('password');
  const authStatus = document.querySelector('#dashboard-auth-status');
  const newGameButton = document.querySelector('#new-game-button');
  const gameIdInfo = document.querySelector('#game-id-info');
  const gameIdDisplay = document.querySelector('#game-id');

  // Render the current game ID and player availability as dashboard cards.
  const renderGames = (state) => {
    if (!state || typeof state.gameID !== 'string' || !Array.isArray(state.players)) return;
    gameIdDisplay.textContent = state.gameID;
    grid.replaceChildren();

    state.players.forEach((player) => {
      const card = document.createElement('article');
      card.className = `game-card${player.status === 'joined' ? ' is-joined' : ''}`;

      const playerId = document.createElement('strong');
      playerId.className = 'player-id';
      playerId.textContent = player.playerId;

      const playerStatus = document.createElement('span');
      playerStatus.className = `game-status player-status is-${player.status}`;
      playerStatus.textContent = player.status === 'joined' ? 'Player joined' : 'Available';

      const connectionStatus = document.createElement('span');
      connectionStatus.className = `game-status connection-status is-${player.connectionStatus.replaceAll(' ', '-')}`;
      connectionStatus.textContent = player.connectionStatus === 'not joined'
        ? 'Not connected'
        : player.connectionStatus === 'connected' ? 'Connected' : 'Disconnected';

      const statuses = document.createElement('div');
      statuses.className = 'game-statuses';
      statuses.append(playerStatus, connectionStatus);

      card.append(playerId, statuses);
      grid.append(card);
    });
  };

  if (typeof window.io !== 'function') {
    authStatus.textContent = 'Unable to load the dashboard connection.';
    return;
  }

  const socket = window.io();
  let dashboardPassword = '';
  let authenticated = false;

  // Authenticate this dashboard socket before requesting game state or reset controls.
  const authenticate = (password) => {
    authStatus.textContent = 'Checking password...';
    socket.timeout(5000).emit('dashboard:authenticate', { password }, (timeoutError, response) => {
      if (timeoutError || !response?.ok) {
        authenticated = false;
        dashboardPassword = '';
        newGameButton.disabled = true;
        gameIdInfo.hidden = true;
        authStatus.textContent = timeoutError
          ? 'The server did not respond. Please try again.'
          : 'Incorrect password.';
        return;
      }

      authenticated = true;
      dashboardPassword = password;
      passwordInput.value = '';
      gameIdInfo.hidden = false;
      authStatus.textContent = 'Signed in.';
      newGameButton.disabled = false;
      socket.emit('dashboard:subscribe');
    });
  };

  // Submit the password through Socket.IO; it is checked by the server, not bundled in the client.
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!socket.connected) {
      authStatus.textContent = 'Not connected to the server.';
      return;
    }

    authenticate(passwordInput.value);
  });

  // Start a new game only after the dashboard operator confirms the reset.
  newGameButton.addEventListener('click', () => {
    if (!authenticated || !window.confirm('Start a new game? All players will need to sign in again.')) {
      return;
    }

    newGameButton.disabled = true;
    authStatus.textContent = 'Starting a new game...';
    socket.timeout(10000).emit('game:new', (timeoutError, response) => {
      newGameButton.disabled = !authenticated;
      authStatus.textContent = timeoutError || !response?.ok
        ? response?.error === 'sync_failed'
          ? 'Unable to refresh player IDs. The current game was not reset.'
          : response?.error === 'reset_failed'
          ? 'Player IDs refreshed, but players could not all be reset.'
          : 'Unable to start a new game.'
        : 'New game started.';
    });
  });

  // Reauthenticate after automatic Socket.IO reconnection before subscribing again.
  socket.on('connect', () => {
    if (dashboardPassword) authenticate(dashboardPassword);
    else authStatus.textContent = 'Enter the dashboard password to view player IDs.';
  });

  // Update every card when the server sends an initial snapshot or a join/reset update.
  socket.on('dashboard:state', renderGames);
  socket.on('disconnect', () => {
    authenticated = false;
    newGameButton.disabled = true;
    gameIdInfo.hidden = true;
    authStatus.textContent = 'Disconnected - reconnecting...';
  });
})();
