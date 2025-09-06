/** =========================
 *  Message System - Using Game Namespace
 *  ========================= */

/**
 * Add a message to the game message log
 */
function addMessage(text) {
    Game.world.messages.push({text: text, time: Date.now()});
    if (Game.world.messages.length > 10) {
        Game.world.messages = Game.world.messages.slice(-10);
    }
}

/**
 * Update messages, removing old ones that have expired
 */
function updateMessages() {
    const now = Date.now();
    Game.world.messages = Game.world.messages.filter(function(m) { 
        return now - m.time < 5000; 
    });
}
