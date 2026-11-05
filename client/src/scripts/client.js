(() => {
  // Update the story's connection indicator when it is present in the current passage.
  const setConnectionStatus = (message) => {
    const status = document.querySelector('[data-fish-connection]');
    if (status) status.textContent = message;
  };

  if (typeof window.io !== 'function') {
    setConnectionStatus('Unable to load the game connection.');
    return;
  }

  const socket = window.io();
  // Show the pending state while Socket.IO establishes or restores a connection.
  socket.on('connect', () => setConnectionStatus('Connecting to game server...'));
  // Mark the client ready only after the server's initial handshake event arrives.
  socket.on('server:ready', () => setConnectionStatus('Connected to game server.'));
  // Reflect connection loss; Socket.IO will continue attempting reconnection.
  socket.on('disconnect', () => setConnectionStatus('Disconnected from game server.'));
  // Surface connection failures in the story instead of leaving the status stale.
  socket.on('connect_error', () => setConnectionStatus('Unable to connect to game server.'));

  window.FishGame = Object.freeze({ socket });
})();
