// Express with socket.io 
// Socket.io doc tutorial: https://socket.io/get-started/chat
// Youtube tutorial Pedrotech: https://www.youtube.com/watch?v=djMy4QsPWiI
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require("cors");

// const GameState = require('./server/classes/game_state');
// const gs = new GameState();

const google_auth = require('./server/google_sheets');



app.use(cors()); 

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3005",
      "http://localhost:3006",
      "http://localhost:5174"
    ],
    methods: ["GET", "POST"]
  }
});


// route through dist
const port = process.env.PORT || 3005; 
app.use(express.static('public'));

// server file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// socket
io.on('connection', (socket) => {
  console.log('io: a user connected');


  // --- DISCONNECT  --- //
  socket.on('disconnect', () => {
    // console.log('io: user disconnected');
  });
});


// ON SERVER SPIN UP, WAIT FOR INIT TO COMPLETE BEFORE SERVER LISTENING
// https://stackoverflow.com/questions/58728146/wait-for-async-function-to-finish-before-app-listen-in-express
const configureApplication = async () => {

  // listen
  server.listen(port, () => {
    console.log('index.js: server listening on *:' + port);
  });

  io.listen(4000, () => {
    console.log('index.js: socket open on *:4000');
  });
}

configureApplication();
