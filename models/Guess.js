const mongoose = require('mongoose');
const guessSchema = new mongoose.Schema({
    guess: String,
    ticked: {
        type: Boolean,
        default: false
    },
    accepted: {
        type: Boolean,
        default: false
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }
});
module.exports = mongoose.model('Guess', guessSchema);