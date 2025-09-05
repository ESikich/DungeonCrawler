/** =========================
 *  Message System
 *  ========================= */

/**
 * Add a message to the game message log
 */
function addMessage(text) {
    window.messages.push({text: text, time: Date.now()});
    if (window.messages.length > 10) {
        window.messages = window.messages.slice(-10);
    }
}

/**
 * Update messages, removing old ones that have expired
 */
function updateMessages() {
    var now = Date.now();
    window.messages = window.messages.filter(function(m) { 
        return now - m.time < 5000; 
    });
}
