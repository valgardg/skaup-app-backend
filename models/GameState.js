const mongoose = require('mongoose');
const gameStateSchema = new mongoose.Schema({
    lobbyName: {
        type: String,
        unique: true,
        required: true
    },
    lobbyOwner: {
        type: String,
    },

    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    phase: {
        type: String,
        default: "GuessPhase"
    }
});
module.exports = mongoose.model("GameState", gameStateSchema);