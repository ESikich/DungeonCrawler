/** =========================
 *  Global Variables - Shared across all modules
 *  ========================= */

// --- Constants ---
var TILE_SIZE = 32;
var DUNGEON_WIDTH = 25;
var DUNGEON_HEIGHT = 17;
var DUNGEON_PIXEL_WIDTH = DUNGEON_WIDTH * TILE_SIZE;
var DUNGEON_PIXEL_HEIGHT = DUNGEON_HEIGHT * TILE_SIZE;
var MEMORY_REVEAL = 0.7;

// --- ECS Core ---
var nextEntityId = 1;
var entities = new Set();
var components = {};
var eventQueue = [];

// --- World Data ---
var dungeonGrid = [];
var rooms = [];
var stairsPos = {x:null, y:null};

// --- Game State ---
var gameState = 'start';  // Proper start state like original
var uiMode = 'game';
var invSelIndex = 0;
var turnCount = 0;
var gameOver = false;
var floor = 0;
var playerGold = 0;
var playerAttackedThisTurn = false;
var justDescended = false;
var playerEid = null;

// --- UI/Rendering ---
var canvas = null;
var ctx = null;
var lightCanvas = document.createElement('canvas');
var lightCtx = null;
var messages = [];

// Initialize canvas when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('gameCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        lightCanvas.width = DUNGEON_PIXEL_WIDTH;
        lightCanvas.height = DUNGEON_PIXEL_HEIGHT;
        lightCtx = lightCanvas.getContext('2d');
    }
});

// --- Game Statistics ---
var gameStats = {
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
};/** =========================
 *  Global Variables - Shared across all modules
 *  ========================= */

// --- Constants ---
var TILE_SIZE = 32;
var DUNGEON_WIDTH = 25;
var DUNGEON_HEIGHT = 17;
var DUNGEON_PIXEL_WIDTH = DUNGEON_WIDTH * TILE_SIZE;
var DUNGEON_PIXEL_HEIGHT = DUNGEON_HEIGHT * TILE_SIZE;
var MEMORY_REVEAL = 0.7;

// --- ECS Core ---
var nextEntityId = 1;
var entities = new Set();
var components = {};
var eventQueue = [];

// --- World Data ---
var dungeonGrid = [];
var rooms = [];
var stairsPos = {x:null, y:null};

// --- Game State ---
var gameState = 'start';
var uiMode = 'game';
var invSelIndex = 0;
var turnCount = 0;
var gameOver = false;
var floor = 0;
var playerGold = 0;
var playerAttackedThisTurn = false;
var justDescended = false;
var playerEid = null;

// --- UI/Rendering ---
var canvas = null;
var ctx = null;
var lightCanvas = document.createElement('canvas');
var lightCtx = null;
var messages = [];

// Initialize canvas when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('gameCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        lightCanvas.width = DUNGEON_PIXEL_WIDTH;
        lightCanvas.height = DUNGEON_PIXEL_HEIGHT;
        lightCtx = lightCanvas.getContext('2d');
    }
});

// --- Game Statistics ---
var gameStats = {
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
