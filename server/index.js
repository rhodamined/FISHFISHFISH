require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const registerSocketHandlers = require('./socket_handlers');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const clientDist = path.resolve(__dirname, '../client/dist');
const port = process.env.PORT || 3005;

const gsheet = require('./google_sheets');

gsheet.readCodesfromGSheet();

registerSocketHandlers(io);

app.use(express.static(clientDist));
// Expose a lightweight endpoint for local and deployment health checks.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});
// Serve the generated Tweego story as the application entry point.
app.get('/', (req, res, next) => {
  // Pass file errors to Express so a missing build is reported as an error.
  res.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

// Start serving the story and its Socket.IO endpoint on the same port.
httpServer.listen(port, () => {
  console.log(`FISHFISHFISH server listening on *:${port}`);
});

// Report listener failures explicitly instead of leaving startup errors hidden.
httpServer.on('error', (error) => {
  console.error('Unable to start the FISHFISHFISH server.', error);
  process.exitCode = 1;
});
