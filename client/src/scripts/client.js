(() => {
  // Update the story's connection indicator when it is present in the current passage.
  const setConnectionStatus = (message) => {
    const status = document.querySelector('[data-fish-connection]');
    if (status) status.textContent = message;
  };

  // Report the result of the most recent game-code submission in the story.
  const setJoinStatus = (message) => {
    const status = document.querySelector('[data-game-join-status]');
    if (status) status.textContent = message;
  };

  if (typeof window.io !== 'function') {
    setConnectionStatus('Unable to load the game connection.');
    return;
  }

  const socket = window.io();
  const gameCodeInput = () => document.querySelector('#game-join-form [name="gameCode"]');
  let joinedGameCode = sessionStorage.getItem('fishfishfish.gameCode');
  let playerToken = sessionStorage.getItem('fishfishfish.playerToken');

  // Ask the server to validate a code and join its matching game room.
  const joinGame = (code) => {
    setJoinStatus('Checking game code...');
    const payload = { code };
    if (playerToken && joinedGameCode === code.trim().toUpperCase()) {
      payload.playerToken = playerToken;
    }

    socket.timeout(5000).emit('game:join', payload, (timeoutError, response) => {
      if (timeoutError) {
        setJoinStatus('The server did not respond. Please try again.');
        return;
      }

      if (!response?.ok) {
        if (response?.error === 'game_code_taken') {
          const input = gameCodeInput();
          if (input) {
            input.value = '';
            input.focus();
          }
          setJoinStatus('That game code is already in use. Please try a different code.');
          return;
        }
        setJoinStatus(response?.error === 'invalid_game_code'
          ? 'That game code is not valid.'
          : 'Unable to join the game. Please try again.');
        return;
      }

      joinedGameCode = response.gameCode;
      playerToken = response.playerToken;
      sessionStorage.setItem('fishfishfish.gameCode', joinedGameCode);
      sessionStorage.setItem('fishfishfish.playerToken', playerToken);
      setJoinStatus(`Joined game ${response.gameCode}.`);
    });
  };

  // Show the pending state while Socket.IO establishes or restores a connection.
  socket.on('connect', () => {
    setConnectionStatus('Connected to game server.');
    if (joinedGameCode) joinGame(joinedGameCode);
  });
  // Mark the client ready only after the server's initial handshake event arrives.
  socket.on('server:ready', () => setConnectionStatus('Connected to game server.'));
  // Reflect connection loss; Socket.IO will continue attempting reconnection.
  socket.on('disconnect', () => setConnectionStatus('Disconnected from game server.'));
  // Surface connection failures in the story instead of leaving the status stale.
  socket.on('connect_error', () => setConnectionStatus('Unable to connect to game server.'));

  // Delegate submit handling so the form continues to work after SugarCube redraws passages.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'game-join-form') return;

    event.preventDefault();
    const code = form.elements.namedItem('gameCode')?.value;
    if (typeof code !== 'string' || code.trim() === '') {
      setJoinStatus('Enter a game code to continue.');
      return;
    }
    if (!socket.connected) {
      setJoinStatus('Not connected to the game server. Please try again.');
      return;
    }

    joinGame(code);
  });

  if (joinedGameCode && socket.connected) {
    joinGame(joinedGameCode);
  }

  window.FishGame = Object.freeze({ socket });
})();
