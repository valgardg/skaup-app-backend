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
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(connectionString)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.log(err));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
      origin: "*", // Allow all origins
      methods: ["GET", "POST"],
      credentials: true
    }
});

const GameState = require('./models/GameState.js');
const Player = require('./models/Player.js');
const Guess = require('./models/Guess.js');

io.on('connection', (socket) => {
    console.log('User connected');
    console.log(socket.id);

    // done
    socket.on('join-game', async (data) => {
        let gameState = await GameState.findOne({lobbyName: data.lobbyName});
        var existingPlayer = await Player.findOne({name: data.name});
        
        if(gameState){
            console.log("lobby exists!");
            if(existingPlayer == null){
                const newPlayer = new Player({socketId: socket.id, name: data.name, color: data.color});
                const savedPlayer = await newPlayer.save();
                gameState.players.push(savedPlayer._id);
            }
        }else{
            console.log("lobby CREATED!");
            gameState = new GameState({lobbyName: data.lobbyName, players: [existingPlayer._id], lobbyOwner: existingPlayer._id});
        }
        await gameState.save();
        console.log(gameState);
        // set socket attributes
        socket.lobbyName = data.lobbyName;
        socket.userName = data.name;
        // join room and emit
        socket.join(socket.lobbyName);

        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
    });

    // done
    socket.on('submit-guess', async (data) => {
        let gameState = await GameState.findOne({lobbyName: socket.lobbyName}).populate('players');
        
        // if (gameState.phase != "GuessPhase") {
        //     return;
        // }

        var player = gameState.players.find(player => player.name === data.name);
        
        if (!player || player.vote_status === true) {
            return;
        }

        var newGuess = new Guess({guess: data.guess, owner: player._id});
        player.guesses.push(newGuess._id);
        await newGuess.save();
        await player.save();
        
        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });


        io.to(socket.lobbyName).emit('game-state', populatedGameState);
        console.log('Received guess from client: ', data);
    });

    // done
    socket.on('delete-guess', async (data) => {
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
        
        if (gameState.phase != "GuessPhase") {
            return;
        }

        var player = await Player.findOne({ name: data.name }).populate('guesses');
        
        if (!player || player.vote_status === true) {
            return;
        }
        
        console.log('before:', player.guesses);
        
        player.guesses = player.guesses.filter(guessObject => guessObject.guess !== data.guess);
        
        console.log('after:', player.guesses);

        await player.save();

        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
        console.log('Removing guess from client: ', data);
    });

    // done
    socket.on('tick-guess', async (data) => {
        try{

            let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
            if(gameState.phase != "WatchPhase") {
                return;
            }
            
            var player = await Player.findOne({ name: data.name }).populate('guesses');
            
            if(player.name !== socket.userName) {
                return;
            }
            
            var guess = player.guesses.find(guessObject => guessObject.guess === data.guess);
            guess.ticked = !guess.ticked;
            await guess.save();
            
            const populatedGameState = await GameState.findOne({ _id: gameState._id })
            .populate({
                path: 'players',
                populate: {
                    path: 'guesses',
                    model: 'Guess',
                    populate: {
                        path: 'owner',
                        model: 'Player',
                        select: 'name' // Add other fields you need from the Player model
                    }
                }
            });
            
            io.to(socket.lobbyName).emit('game-state', populatedGameState);
            console.log('Ticking guess from client: ', data);
        }catch(err){
            console.log("error ticking guess", err);
        };
    });

    // done
    socket.on("player-ready", async (data) => {
        try{

            let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
            if(gameState.phase !== "GuessPhase") {
                return;
            }
            
            var player = await Player.findOne({ name: data.name }).populate('guesses');
            
            player.vote_status = true;
            await player.save();
            
            // check if everyone is ready for watch phase
            gameState = await GameState.findOne({ lobbyName: socket.lobbyName }).populate('players');
            
            if(gameState.players.every(player => player.vote_status === true)) {
                gameState.phase = "WatchPhase";
                await gameState.save();
            }else{
                console.log("not everyone is ready");
                console.log(gameState.players);
            }
            
            // emit game state
            const populatedGameState = await GameState.findOne({ _id: gameState._id })
            .populate({
                path: 'players',
                populate: {
                    path: 'guesses',
                    model: 'Guess',
                    populate: {
                        path: 'owner',
                        model: 'Player',
                        select: 'name' // Add other fields you need from the Player model
                    }
                }
            });
            
            io.to(socket.lobbyName).emit('game-state', populatedGameState);
        }
        catch(err){
            console.log("error ticking guess", err);
        };
    });

    // done
    socket.on("player-unready", async (data) => {
        try{
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
        if(gameState.phase !== "GuessPhase") {
            return;
        }

        var player = await Player.findOne({ name: data.name }).populate('guesses');
        
        player.vote_status = true;
        await player.save();

        // emit game state
        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
        }catch(err){
            console.log("error ticking guess", err);
        }
    });

    // FOR LATER ALLIGATOR
    socket.on('disconnect', async () => {
        // let gameState = await GameState.findOne({lobbyName: socket.lobbyName});
        // gameState.players = gameState.players.filter(player => player.socketId !== socket.id);
        // await gameState.save();
        console.log('User disconnected');
        console.log(socket.id);

        //io.to(socket.lobbyName).emit("game-state", gameState);
    });

    // done
    socket.on('reset-game', async () => {
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
        console.log('Resetting game');
        gameState.phase = "GuessPhase";
        gameState.players.forEach(async (player) => {
            player.guesses = [];
            player.vote_status = false;
            player.reviewed = false;
            await player.save();
        });
        await gameState.save();

        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
    });

    // done
    socket.on('accept-guess', async (data) => {
        try{
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName }).populate('players');
        if(gameState.phase != "ReviewPhase"){
            return;
        }
        console.log('accept-guess data:', data);
        var player = await Player.findOne({ name: data.guess.owner.name }).populate('guesses');
        var guess = player.guesses.find(guessObject => guessObject.guess === data.guess.guess);
        guess.accepted = !guess.accepted;
        await guess.save();

        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
    }catch(err){
        console.log("error ticking guess", err);
    }
    });

    // done
    socket.on("player-reviewed", async (data) => {
        try{
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName }).populate('players');
        if(gameState.phase != "ReviewPhase"){
            return;
        }

        var player = await Player.findOne({ name: data.name }).populate('guesses');
        player.reviewed = true;
        await player.save();

        var updatedGameState = await GameState.findOne({ lobbyName: socket.lobbyName }).populate('players');
        
        if(updatedGameState.players.every(player => player.reviewed === true)) {
            gameState.phase = "ResultPhase";
        }
        await gameState.save();
        console.log(player.name + " has been reviewed");

        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);
    }catch(err){
        console.log("error ticking guess", err);
    }
    });

    // done
    socket.on('end-watch-phase', async () => {
        try{
        let gameState = await GameState.findOne({ lobbyName: socket.lobbyName });
        console.log('Ending watch phase');
        gameState.phase = "ReviewPhase";
        await gameState.save();
        
        const populatedGameState = await GameState.findOne({ _id: gameState._id })
        .populate({
            path: 'players',
            populate: {
                path: 'guesses',
                model: 'Guess',
                populate: {
                    path: 'owner',
                    model: 'Player',
                    select: 'name' // Add other fields you need from the Player model
                }
            }
        });

        io.to(socket.lobbyName).emit('game-state', populatedGameState);

        var reviewInfo = assignReviewPlayers(populatedGameState.players);
        console.log(reviewInfo);
        io.to(socket.lobbyName).emit('review-info', reviewInfo); 
    }catch(err){
        console.log("error ticking guess", err);
    }
    });
});

// server.listen(3001, '0.0.0.0', () => { // used for local network testing
server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${port}`);
});