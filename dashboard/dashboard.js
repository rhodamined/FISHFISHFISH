(() => {
  const grid = document.querySelector('#game-grid');
  const connectionStatus = document.querySelector('#connection-status');

  // Render the server's current code availability as ten dashboard cards.
  const renderGames = (games) => {
    grid.replaceChildren();

    games.forEach((game, index) => {
      const card = document.createElement('article');
      card.className = `game-card${game.status === 'joined' ? ' is-joined' : ''}`;

      const number = document.createElement('span');
      number.className = 'game-number';
      number.textContent = `GAME ${String(index + 1).padStart(2, '0')}`;

      const code = document.createElement('strong');
      code.className = 'game-code';
      code.textContent = game.code;

      const status = document.createElement('span');
      status.className = 'game-status';
      status.textContent = game.status === 'joined' ? 'Player joined' : 'Available';

      card.append(number, code, status);
      grid.append(card);
    });
  };

  if (typeof window.io !== 'function') {
    connectionStatus.textContent = 'Unable to load the dashboard connection.';
    return;
  }

  const socket = window.io();

  // Request the current game-code snapshot whenever this dashboard connects.
  socket.on('connect', () => {
    connectionStatus.textContent = 'Connected';
    socket.emit('dashboard:subscribe');
  });
  // Update every card when the server sends an initial snapshot or a join update.
  socket.on('dashboard:state', renderGames);
  // Keep the dashboard's connection state visible while Socket.IO reconnects.
  socket.on('disconnect', () => {
    connectionStatus.textContent = 'Disconnected - reconnecting...';
  });
  // Report connection errors while allowing Socket.IO's automatic retries.
  socket.on('connect_error', () => {
    connectionStatus.textContent = 'Unable to connect - retrying...';
  });
})();
