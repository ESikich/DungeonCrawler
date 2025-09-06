/** =========================
 *  Message System - Complete Final Version
 *  ========================= */

// Message System as Injectable Dependency
Game.MessageSystem = {
    add(text) {
        Game.world.messages.push({text: text, time: Date.now()});
        if (Game.world.messages.length > 10) {
            Game.world.messages = Game.world.messages.slice(-10);
        }
    },
    
    update() {
        const now = Date.now();
        Game.world.messages = Game.world.messages.filter(function(m) { 
            return now - m.time < 5000; 
        });
    },
    
    clear() {
        Game.world.messages = [];
    },
    
    getMessages() {
        return Game.world.messages.slice(); // Return copy
    }
};

// Backward compatibility function
function addMessage(text) {
    Game.MessageSystem.add(text);
}

// Backward compatibility function
function updateMessages() {
    Game.MessageSystem.update();
}
