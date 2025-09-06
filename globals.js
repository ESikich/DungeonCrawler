/** =========================
 *  Global Game Namespace - Complete Final Version
 *  ========================= */

// Create a single global namespace
const Game = {
    // --- Constants ---
    config: {
        TILE_SIZE: 32,
        DUNGEON_WIDTH: 25,
        DUNGEON_HEIGHT: 17,
        get DUNGEON_PIXEL_WIDTH() { return this.DUNGEON_WIDTH * this.TILE_SIZE; },
        get DUNGEON_PIXEL_HEIGHT() { return this.DUNGEON_HEIGHT * this.TILE_SIZE; },
        MEMORY_REVEAL: 0.7
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

    // --- Device Detection ---
    device: {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        touchStartPos: null,
        lastTouchTime: 0
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
        this.world.reset();
    }
};

// For backward compatibility during migration
const TILE_SIZE = Game.config.TILE_SIZE;
const DUNGEON_WIDTH = Game.config.DUNGEON_WIDTH;
const DUNGEON_HEIGHT = Game.config.DUNGEON_HEIGHT;
const DUNGEON_PIXEL_WIDTH = Game.config.DUNGEON_PIXEL_WIDTH;
const DUNGEON_PIXEL_HEIGHT = Game.config.DUNGEON_PIXEL_HEIGHT;
