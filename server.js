// server.js
const express = require('express');
const mongoose = require('mongoose')
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
// local libraries
const { assignReviewPlayers } = require('./assignReviews.js');

require("dotenv").config();

const connectionString = process.env.DB_CONNECTION_STRING
const port = process.env.PORT;

const app = express();

// MIDDLEWARE
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
app.use(express.json());

// Connect to MongoDB
mongoose.connect(connectionString)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.log(err));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
    //   origin: "http://localhost:3000",  // Your React app's origin
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
});

const GameState = require('./models/GameState.js');
const Player = require('./models/Player.js');
const Guess = require('./models/Guess.js');

var gameState = new GameState();

io.on('connection', (socket) => {
    console.log('User connected');
    console.log(socket.id);

    socket.on('join-game', async (data) => {
        let gameState = await GameState.findOne({lobbyName: data.lobbyName});
        const newPlayer = new Player({socketId: socket.id, name: data.name, color: data.color});
        const savedPlayer = await newPlayer.save();
        if(gameState){
            console.log("lobby exists!");
            gameState.players.push(savedPlayer._id);
        }else{
            console.log("lobby CREATED!");
            gameState = new GameState({lobbyName: data.lobbyName, players: [savedPlayer._id], lobbyOwner: savedPlayer._id});
        }
        await gameState.save();
        console.log(gameState);
        // set socket attributes
        socket.lobbyName = data.lobbyName;
        socket.userName = data.name;
        // join room and emit
        socket.join(socket.lobbyName);
        const populatedGameState = await GameState.findOne({ _id: gameState._id }).populate('players');
        io.to(socket.lobbyName).emit('game-state', populatedGameState);
    });

    socket.on('submit-guess', async (data) => {
        let gameState = await GameState.findOne({lobbyName: socket.lobbyName});
        if(gameState.phase != "GuessPhase" || gameState.players.find(player => player.name === data.name).vote_status === true) {
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        var newGuess = new Guess(data.guess);
        player.addGuess(newGuess);

        console.log('Received guess from client: ', data);
        io.to(data.lobbyName).emit('game-state', gameState);
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
        if(player.socketId !== socket.id) {
            return;
        }
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

    socket.on('disconnect', async () => {
        // let gameState = await GameState.findOne({lobbyName: socket.lobbyName});
        // gameState.players = gameState.players.filter(player => player.socketId !== socket.id);
        // await gameState.save();
        console.log('User disconnected');
        console.log(socket.id);

        // io.to(socket.lobbyName).emit("game-state", gameState);
    });

    socket.on('reset-game', () => {
        console.log('Resetting game');
        gameState = new GameState();
        io.emit('game-state', gameState);
    });

    socket.on('fetch-review-info', (data) => {
        console.log("fetch review info called");
        var reviewInfo = assignReviewPlayers(gameState.players);
        console.log(reviewInfo);
        io.emit('review-info', reviewInfo);
    });

    socket.on('accept-guess', (data) => {
        if(gameState.phase != "ReviewPhase"){
            return;
        }
        var player = gameState.players.find(player => player.name === data.guess.owner);
        var guess = player.guesses.find(guessObject => guessObject.guess === data.guess.guess);
        guess.accepted = !guess.accepted;
        io.emit('game-state', gameState);
    });

    socket.on("player-reviewed", (data) => {
        if(gameState.phase != "ReviewPhase"){
            return;
        }
        var player = gameState.players.find(player => player.name === data.name);
        player.reviewed = true;
        if(gameState.players.every(player => player.reviewed === true)) {
            gameState.phase = "ResultPhase";
        }
        console.log(player.name + " has been reviewed");
        io.emit('game-state', gameState);
    });

    socket.on('end-watch-phase', () => {
        console.log('Ending watch phase');
        gameState.phase = "ReviewPhase";
        io.emit('game-state', gameState);
        var reviewInfo = assignReviewPlayers(gameState.players);
        console.log(reviewInfo);
        io.emit('review-info', reviewInfo); 
    });
});

// server.listen(3001, '0.0.0.0', () => { // used for local network testing
server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${port}`);
});