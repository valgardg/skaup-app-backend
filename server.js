// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const app = express();
// Add this to allow CORS
const allowedOrigins = [
    "http://localhost:3000",
    // "http://192.168.1.15:3000",
];
app.use(cors({
    origin: function(origin, callback) {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    }
  }));
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
    //   origin: "http://localhost:3000",  // Your React app's origin
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
});

class GameState {
    constructor() {
        this.players = [];
        this.phase = "GuessPhase";
    }
}

class Player {
    constructor(socketId, name, color) {
        this.socketId = socketId;
        this.name = name;
        this.color = color;
        this.guesses = [];
        this.vote_status = false;
    }

    addGuess(guess) {
        this.guesses.push(guess);
    }
}

class Guess {
    constructor(guess){
        this.guess = guess;
        this.ticked = false;
    }
}

var gameState = new GameState();

io.on('connection', (socket) => {
    console.log('User connected');
    console.log(socket.id);

    socket.on('fetch-game', (data) => {
        console.log("game state fetched");
        io.emit('game-state', gameState);
    });


    socket.on('join-game', (data) => {
        var newPlayer = new Player(socket.id, data.name, data.color);
        gameState.players.push(newPlayer);
        io.emit('game-state', gameState);
    });

    socket.on('submit-guess', (data) => {
        if(gameState.phase != "GuessPhase" || gameState.players.find(player => player.name === data.name).vote_status === true) {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        var newGuess = new Guess(data.guess);
        player.addGuess(newGuess);
        console.log('Received guess from client: ', data);
        io.emit('game-state', gameState);
    });

    socket.on('delete-guess', (data) => {
        if(gameState.phase != "GuessPhase" || gameState.players.find(player => player.name === data.name).vote_status === true) {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        player.guesses = player.guesses.filter(guessObject => guessObject.guess !== data.guess);
        console.log('Removing guess from client: ', data);
        io.emit('game-state', gameState);
    });

    socket.on('tick-guess', (data) => {
        if(gameState.phase != "WatchPhase") {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        var guess = player.guesses.find(guessObject => guessObject.guess === data.guess);
        guess.ticked = !guess.ticked;
        console.log('Ticking guess from client: ', data);
        io.emit('game-state', gameState);
    });

    socket.on("player-ready", (data) => {
        console.log("player ready, game phase: " + gameState.phase);
        if(gameState.phase !== "GuessPhase") {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        player.vote_status = true;
        if(gameState.players.every(player => player.vote_status === true)) {
            gameState.phase = "WatchPhase";
        }
        io.emit('game-state', gameState);
    });

    socket.on("player-unready", (data) => {
        if(gameState.phase !== "GuessPhase") {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        player.vote_status = false;
        io.emit('game-state', gameState);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        console.log(socket.id);
        gameState.players = gameState.players.filter(player => player.socketId !== socket.id);
        io.emit("game-state", gameState);
    });

    socket.on('reset-game', () => {
        console.log('Resetting game');
        gameState = new GameState();
        io.emit('game-state', gameState);
    });

    socket.on('end-watch-phase', () => {
        console.log('Ending watch phase');
        gameState.phase = "ReviewPhase";
        io.emit('game-state', gameState); 
    });
});

// server.listen(3001, '0.0.0.0', () => { // used for local network testing
server.listen(3001, () => {
  console.log('Server listening on port 3001');
});
