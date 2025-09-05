/** =========================
 *  Utility Functions
 *  ========================= */

/**
 * Generate a random integer between min and max (inclusive)
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if coordinates are within the dungeon bounds
 */
function inBounds(x, y) {
    return x >= 0 && x < window.DUNGEON_WIDTH && y >= 0 && y < window.DUNGEON_HEIGHT;
}

/**
 * Parse a color name into RGB array
 */
function parseColor(name) {
    var colors = {
        white: [255, 255, 255],
        black: [0, 0, 0],
        red: [255, 100, 100],
        green: [100, 255, 100],
        blue: [100, 100, 255],
        yellow: [255, 255, 100],
        gray: [128, 128, 128],
        brown: [139, 69, 19],
        purple: [128, 0, 128],
        cyan: [100, 255, 255],
        orange: [255, 165, 0],
        gold: [255, 215, 0]
    };
    return colors[name] || [255, 255, 255];
}

/**
 * Clamp a value between a minimum and maximum
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
