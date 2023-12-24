function assignReviewPlayers(players) {
    const length = players.length;
    const shiftAmount = Math.floor(Math.random() * (length - 1)) + 1; // Random shift between 1 and length-1
  
    // Use slice and concat to create a new shifted players
    const shiftedArray = players.slice(-shiftAmount).concat(players.slice(0, -shiftAmount));
  
    // Create a dictionary where the names point to the shifted values
    const shiftedDictionary = {};
    for (let i = 0; i < length; i++) {
        const originalItem = players[i];
        const shiftedItem = shiftedArray[i];
        shiftedDictionary[originalItem.name] = shiftedItem;
    }
    return shiftedDictionary;
}

module.exports = {
    assignReviewPlayers
}