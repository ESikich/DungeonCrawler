/** =========================
 *  Global Variables and Constants
 *  ========================= */

// --- Canvas and Rendering Constants ---
window.TILE_SIZE = 32;
window.DUNGEON_WIDTH = 25;
window.DUNGEON_HEIGHT = 17;
window.DUNGEON_PIXEL_WIDTH = window.DUNGEON_WIDTH * window.TILE_SIZE;
window.DUNGEON_PIXEL_HEIGHT = window.DUNGEON_HEIGHT * window.TILE_SIZE;
window.MEMORY_REVEAL = 0.7;

// --- Canvas Elements ---
window.canvas = null;
window.ctx = null;
window.lightCanvas = null;
window.lightCtx = null;

// --- Game State ---
window.gameState = 'start';
window.uiMode = 'game';
window.invSelIndex = 0;
window.turnCount = 0;
window.gameOver = false;
window.floor = 0;
window.playerGold = 0;
window.playerAttackedThisTurn = false;
window.justDescended = false;

// --- Game Statistics ---
window.gameStats = {
    enemiesKilled: 0,
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    itemsPickedUp: 0,
    goldCollected: 0,
    potionsUsed: 0,
    bombsUsed: 0,
    scrollsUsed: 0,
    itemsDropped: 0,
    floorsDescended: 0,
    timesSeen: 0,
    timesAttacked: 0,
    highestLevel: 1,
    totalXpGained: 0,
    deathCause: 'Unknown',
    killedBy: 'Unknown',
    startTime: 0,
    endTime: 0
};

// --- ECS System ---
window.nextEntityId = 1;
window.entities = new Set();
window.components = {};
window.eventQueue = [];

// --- World Data ---
window.dungeonGrid = [];
window.rooms = [];
window.playerEid = null;
window.messages = [];
window.stairsPos = {x: null, y: null};

// --- Mobile Support ---
window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
window.touchStartPos = null;
window.lastTouchTime = 0;
window.initializeCanvasElements = function() {
    window.canvas = document.getElementById('gameCanvas');
    window.ctx = window.canvas.getContext('2d');
    if (!window.canvas || !window.ctx) {
        alert('Canvas not supported');
        return false;
    }
    
    // Offscreen canvas for lighting overlay
    window.lightCanvas = document.createElement('canvas');
    window.lightCanvas.width = window.DUNGEON_PIXEL_WIDTH;
    window.lightCanvas.height = window.DUNGEON_PIXEL_HEIGHT;
    window.lightCtx = window.lightCanvas.getContext('2d');
    
    return true;
};
