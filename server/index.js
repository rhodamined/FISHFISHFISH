require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const registerSocketHandlers = require('./socket_handlers');
const GameState = require('./classes/game_state');
const { readPlayerIdsFromGSheet } = require('./google_sheets');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const clientDist = path.resolve(__dirname, '../client/dist');
const dashboardDirectory = path.resolve(__dirname, '../dashboard');
const port = process.env.PORT || 3005;
const gameState = new GameState();

app.use(express.static(clientDist));
app.use('/dashboard', express.static(dashboardDirectory));
// Expose a lightweight endpoint for local and deployment health checks.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});
// Serve the separate live game dashboard.
app.get('/dashboard', (req, res, next) => {
  res.sendFile(path.join(dashboardDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
});
// Serve the generated Tweego story as the application entry point.
app.get('/', (req, res, next) => {
  // Pass file errors to Express so a missing build is reported as an error.
  res.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

// Load and validate the game's codes before accepting HTTP or socket clients.
async function startServer() {
  const playerIds = await readPlayerIdsFromGSheet();
  gameState.startNewGame(playerIds);
  console.info(`[Google Sheets] Sync successful for game ${gameState.gameID}: loaded ${playerIds.length} player IDs.`);
  registerSocketHandlers(io, gameState, readPlayerIdsFromGSheet);

  // Start serving the story and its Socket.IO endpoint on the same port.
  await new Promise((resolve, reject) => {
    const onListening = () => {
      httpServer.off('error', onError);
      console.info(`[Game ${gameState.gameID}] FISHFISHFISH server listening on *:${port}`);
      resolve();
    };
    const onError = (error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };

    httpServer.once('listening', onListening);
    httpServer.once('error', onError);
    httpServer.listen(port);
  });
}

startServer().catch((error) => {
  console.error('Unable to initialize the FISHFISHFISH server.', error);
  process.exitCode = 1;
});
