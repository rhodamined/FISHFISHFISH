(() => {
  const grid = document.querySelector('#game-grid');

  // Render the server's current code availability as ten dashboard cards.
  const renderGames = (games) => {
    grid.replaceChildren();

    games.forEach((game) => {
      const card = document.createElement('article');
      card.className = `game-card${game.status === 'joined' ? ' is-joined' : ''}`;

      const code = document.createElement('strong');
      code.className = 'game-code';
      code.textContent = game.code;

      const playerStatus = document.createElement('span');
      playerStatus.className = `game-status player-status is-${game.status}`;
      playerStatus.textContent = game.status === 'joined' ? 'Player joined' : 'Available';

      const connectionStatus = document.createElement('span');
      connectionStatus.className = `game-status connection-status is-${game.connectionStatus.replaceAll(' ', '-')}`;
      connectionStatus.textContent = game.connectionStatus === 'not joined'
        ? 'Not connected'
        : game.connectionStatus === 'connected' ? 'Connected' : 'Disconnected';

      card.append(code, playerStatus, connectionStatus);
      grid.append(card);
    });
  };

  if (typeof window.io !== 'function') {
    return;
  }

  const socket = window.io();

  // Request the current game-code snapshot whenever this dashboard connects.
  socket.on('connect', () => {
    socket.emit('dashboard:subscribe');
  });
  // Update every card when the server sends an initial snapshot or a join update.
  socket.on('dashboard:state', renderGames);
})();
