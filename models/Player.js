const mongoose = require('mongoose');
const playerSchema = new mongoose.Schema({
    socketId: String,
    name: String,
    color: String,
    guesses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Guess'
    }],
    vote_status: {
        type: Boolean,
        default: false
    },
    reviewed: {
        type: Boolean,
        default: false
    }
});
module.exports = mongoose.model("Player", playerSchema);