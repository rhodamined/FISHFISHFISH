(() => {
  // Update the story's connection indicator when it is present in the current passage.
  const setConnectionStatus = (message) => {
    const status = document.querySelector('[data-fish-connection]');
    if (status) status.textContent = message;
  };

  // Report the result of the most recent Player ID submission in the story.
  const setJoinStatus = (message) => {
    const status = document.querySelector('[data-game-join-status]');
    if (status) status.textContent = message;
  };

  if (typeof window.io !== 'function') {
    setConnectionStatus('Unable to load the game connection.');
    return;
  }

  const socket = window.io();
  const playerIdInput = () => document.querySelector('#game-join-form [name="playerId"]');
  let joinedPlayerId = sessionStorage.getItem('fishfishfish.playerId')
    || sessionStorage.getItem('fishfishfish.gameCode');
  let playerToken = sessionStorage.getItem('fishfishfish.playerToken');

  // Ask the server to validate a code and join its matching player room.
  const joinGame = (playerId) => {
    setJoinStatus('Checking Player ID...');
    const payload = { playerId };
    if (playerToken && joinedPlayerId === playerId.trim().toUpperCase()) {
      payload.playerToken = playerToken;
    }

    socket.timeout(5000).emit('game:join', payload, (timeoutError, response) => {
      if (timeoutError) {
        setJoinStatus('The server did not respond. Please try again.');
        return;
      }

      if (!response?.ok) {
        if (response?.error === 'invalid_player_token') {
          sessionStorage.removeItem('fishfishfish.gameCode');
          sessionStorage.removeItem('fishfishfish.playerId');
          sessionStorage.removeItem('fishfishfish.playerToken');
          joinedPlayerId = null;
          playerToken = null;
          setJoinStatus('The game has restarted. Please sign in with a Player ID again.');
          return;
        }
        if (response?.error === 'player_id_taken') {
          const input = playerIdInput();
          if (input) {
            input.value = '';
            input.focus();
          }
          setJoinStatus('That player ID is already in use. Please try a different ID.');
          return;
        }
        setJoinStatus(response?.error === 'invalid_player_id'
          ? 'That player ID is not valid.'
          : 'Unable to join the game. Please try again.');
        return;
      }

      joinedPlayerId = response.playerId;
      playerToken = response.playerToken;
      sessionStorage.setItem('fishfishfish.playerId', joinedPlayerId);
      sessionStorage.removeItem('fishfishfish.gameCode');
      sessionStorage.setItem('fishfishfish.playerToken', playerToken);
      setJoinStatus(`Joined as player ${response.playerId}.`);
    });
  };

  // Show the pending state while Socket.IO establishes or restores a connection.
  socket.on('connect', () => {
    setConnectionStatus('Connected to game server.');
    if (joinedPlayerId) joinGame(joinedPlayerId);
  });
  // Mark the client ready only after the server's initial handshake event arrives.
  socket.on('server:ready', () => setConnectionStatus('Connected to game server.'));
  // Reflect connection loss; Socket.IO will continue attempting reconnection.
  socket.on('disconnect', () => setConnectionStatus('Disconnected from game server.'));
  // Surface connection failures in the story instead of leaving the status stale.
  socket.on('connect_error', () => setConnectionStatus('Unable to connect to game server.'));

  // Clear a player's saved identity and return them to the join form after a new game starts.
  socket.on('game:reset', () => {
    sessionStorage.removeItem('fishfishfish.gameCode');
    sessionStorage.removeItem('fishfishfish.playerId');
    sessionStorage.removeItem('fishfishfish.playerToken');
    joinedPlayerId = null;
    playerToken = null;

    const input = playerIdInput();
    if (input) {
      input.value = '';
      input.focus();
    }
    setJoinStatus('A new game has started. Please sign in with a player ID.');
    socket.emit('game:reset:ack');
  });

  // Delegate submit handling so the form continues to work after SugarCube redraws passages.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'game-join-form') return;

    event.preventDefault();
    const playerId = form.elements.namedItem('playerId')?.value;
    if (typeof playerId !== 'string' || playerId.trim() === '') {
      setJoinStatus('Enter a player ID to continue.');
      return;
    }
    if (!socket.connected) {
      setJoinStatus('Not connected to the game server. Please try again.');
      return;
    }

    joinGame(playerId);
  });

  if (joinedPlayerId && socket.connected) {
    joinGame(joinedPlayerId);
  }

  window.FishGame = Object.freeze({ socket });
})();
