/** =========================
 *  Game Namespace - Refactored Global Variables
 *  ========================= */

// Create a single global namespace instead of polluting window
const Game = {
    // --- Constants ---
    config: {
        TILE_SIZE: 32,
        DUNGEON_WIDTH: 25,
        DUNGEON_HEIGHT: 17,
        DUNGEON_PIXEL_WIDTH: 25 * 32, // calculated
        DUNGEON_PIXEL_HEIGHT: 17 * 32, // calculated
        MEMORY_REVEAL: 0.7
    },

    // --- Rendering ---
    rendering: {
        canvas: null,
        ctx: null,
        lightCanvas: null,
        lightCtx: null
    },

    // --- Game State ---
    state: {
        current: 'start', // 'start', 'playing', 'paused', 'gameOver'
        uiMode: 'game',   // 'game', 'inventory'
        invSelIndex: 0,
        turnCount: 0,
        gameOver: false,
        floor: 0,
        playerGold: 0,
        playerAttackedThisTurn: false,
        justDescended: false
    },

    // --- Visual Effects ---
    effects: {
        explosions: []
    },

    // --- Game Statistics ---
    stats: {
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
        endTime: 0,

        reset() {
            Object.assign(this, {
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
                startTime: Date.now(),
                endTime: 0
            });
        }
    },

    // --- ECS System ---
    ecs: {
        nextEntityId: 1,
        entities: new Set(),
        components: {},
        eventQueue: [],

        reset() {
            this.nextEntityId = 1;
            this.entities.clear();
            this.components = {};
            this.eventQueue = [];
        }
    },

    // --- World Data ---
    world: {
        dungeonGrid: [],
        rooms: [],
        playerEid: null,
        messages: [],
        stairsPos: { x: null, y: null },

        reset() {
            this.dungeonGrid = [];
            this.rooms = [];
            this.playerEid = null;
            this.messages = [];
            this.stairsPos = { x: null, y: null };
        }
    },

    // --- Device Detection ---
    device: {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        touchStartPos: null,
        lastTouchTime: 0
    },

    // --- Initialization Helper ---
    initializeCanvasElements() {
        this.rendering.canvas = document.getElementById('gameCanvas');
        this.rendering.ctx = this.rendering.canvas.getContext('2d');
        
        if (!this.rendering.canvas || !this.rendering.ctx) {
            alert('Canvas not supported');
            return false;
        }
        
        // Offscreen canvas for lighting overlay
        this.rendering.lightCanvas = document.createElement('canvas');
        this.rendering.lightCanvas.width = this.config.DUNGEON_PIXEL_WIDTH;
        this.rendering.lightCanvas.height = this.config.DUNGEON_PIXEL_HEIGHT;
        this.rendering.lightCtx = this.rendering.lightCanvas.getContext('2d');
        
        return true;
    },

    // --- Full Game Reset ---
    resetAll() {
        this.state.current = 'start';
        this.state.uiMode = 'game';
        this.state.invSelIndex = 0;
        this.state.turnCount = 0;
        this.state.gameOver = false;
        this.state.floor = 0;
        this.state.playerGold = 0;
        this.state.playerAttackedThisTurn = false;
        this.state.justDescended = false;

        this.effects.explosions = [];
        this.stats.reset();
        this.ecs.reset();
        this.world.reset();
    }
};

// For backward compatibility during migration, expose some commonly used values
// These can be removed once all files are updated
const TILE_SIZE = Game.config.TILE_SIZE;
const DUNGEON_WIDTH = Game.config.DUNGEON_WIDTH;
const DUNGEON_HEIGHT = Game.config.DUNGEON_HEIGHT;
const DUNGEON_PIXEL_WIDTH = Game.config.DUNGEON_PIXEL_WIDTH;
const DUNGEON_PIXEL_HEIGHT = Game.config.DUNGEON_PIXEL_HEIGHT;

// Export for modules (if using ES6 modules later)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
}
