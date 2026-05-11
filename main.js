/** =========================
 *  Main Game Controller
 *  ========================= */

// Main Game Controller with Dependency Injection
Game.Controller = (function() {
    'use strict';
    
    // Private dependencies - injected during initialization
    let renderer = null;
    let ecs = null;
    let systems = null;
    let inputHandler = null;
    let messageSystem = null;
    
    // Private state
    let initialized = false;
    let gameLoop = null;
    
    return {
        // Initialize with dependencies
        init(dependencies) {
            const {
                canvasId,
                renderer: rendererDep,
                ecs: ecsDep,
                systems: systemsDep,
                inputHandler: inputDep,
                messageSystem: messageDep
            } = dependencies;
            
            // Inject dependencies
            renderer = rendererDep || Game.Renderer;
            ecs = ecsDep || Game.ECS;
            systems = systemsDep || Game.Systems;
            inputHandler = inputDep || new Game.InputHandler(this);
            messageSystem = messageDep || Game.MessageSystem;
            
            // Initialize renderer
            if (!renderer.init(canvasId)) {
                throw new Error('Failed to initialize renderer');
            }
            
            // Initialize input
            inputHandler.setup();
            
            initialized = true;
            Game.Events.emit('controller.init', {controller: this});
            return this;
        },
        
        // Start the game
        start() {
            if (!initialized) {
                throw new Error('Game not initialized. Call init() first.');
            }
            
            this.startGameLoop();
            Game.Events.emit('controller.start', {controller: this});
        },
        
        // Game loop
        startGameLoop() {
            const loop = () => {
                this.update();
                this.render();
                gameLoop = requestAnimationFrame(loop);
            };
            loop();
        },
        
        // Stop game loop
        stop() {
            if (gameLoop) {
                cancelAnimationFrame(gameLoop);
                gameLoop = null;
            }
            Game.Events.emit('controller.stop', {controller: this});
        },
        
        // Update game state
        update() {
            messageSystem.update();
            systems.Effects.update();
        },
        
        // Render game
        render() {
            renderer.render(Game.state, Game.world, Game.world.playerEid);
        },
        
        // Game actions (called by input handler)
        handleMove(dx, dy) {
            const pp = ecs.getComponent(Game.world.playerEid, 'position');
            if (!pp) return;
            
            ecs.postEvent({
                type: 'move', 
                entityId: Game.world.playerEid, 
                toX: pp.x + dx, 
                toY: pp.y + dy
            });
            
            // Process the turn (enemies may move less frequently if player has speed boost)
            systems.TurnProcessor.process();
        },
        
        handleWait() {
            messageSystem.add('You wait.');
            systems.TurnProcessor.process();
        },
        
        handleInventoryToggle() {
            if (Game.state.uiMode === 'inventory') {
                Game.state.uiMode = 'game';
            } else {
                Game.state.uiMode = 'inventory';
                Game.state.invSelIndex = 0;
            }
        },
        
        handleInventorySelect(direction) {
            const inv = ecs.getComponent(Game.world.playerEid, 'inventory');
            const n = inv ? inv.items.length : 0;
            if (n > 0) {
                if (direction === 'up') {
                    Game.state.invSelIndex = (Game.state.invSelIndex - 1 + n) % n;
                } else if (direction === 'down') {
                    Game.state.invSelIndex = (Game.state.invSelIndex + 1) % n;
                }
            }
        },
        
        handleInventoryUse() {
            if (Game.Items.useInventoryItem(Game.state.invSelIndex)) {
                Game.state.uiMode = 'game';
                systems.TurnProcessor.process();
            }
        },
        
        handleInventoryDrop() {
            if (Game.Items.dropInventoryItem(Game.state.invSelIndex)) {
                Game.state.uiMode = 'game';
                systems.TurnProcessor.process();
            }
        },
        
        handlePause() {
            if (Game.state.current === 'playing') {
                Game.state.current = 'paused';
            } else if (Game.state.current === 'paused') {
                Game.state.current = 'playing';
            }
        },
        
        resetGame() {
            Game.resetAll();
            this.initGame();
        },
        
        // Initialize new game
        initGame() {
            ecs.reset();
            Game.world.reset();
            Game.state.current = 'playing';
            Game.state.uiMode = 'game';
            Game.state.turnCount = 0;
            Game.state.gameOver = false;
            Game.state.floor = 0;
            Game.state.justDescended = false;
            Game.state.area = 'overworld';
            
            // Ensure explosions array is initialized
            Game.effects.explosions = [];

            if (!Game.stats.startTime) {
                Game.stats.startTime = Date.now();
            }

            const spawn = generateOverworld();
            Game.world.playerEid = createPlayer(spawn.x, spawn.y);

            const p = ecs.getComponent(Game.world.playerEid, 'position');
            const vision = ecs.getComponent(Game.world.playerEid, 'vision');
            vision.radius = 8;

            systems.Vision.update(Game.world.playerEid);
        },
        
        // Getters for dependencies (for testing/debugging)
        getRenderer() { return renderer; },
        getECS() { return ecs; },
        getSystems() { return systems; },
        getInputHandler() { return inputHandler; },
        getMessageSystem() { return messageSystem; }
    };
})();

// Input Handler with Dependency Injection
Game.InputHandler = function(gameController) {
    this.controller = gameController;

    this.isSpaceKey = function(e) {
        return e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space';
    };
    
    this.setup = function() {
        document.addEventListener('keydown', (e) => {
            const key = e.key;
            
            // Start screen
            if (Game.state.current === 'start') { 
                if (this.isSpaceKey(e)) { 
                    Game.state.current = 'playing'; 
                    this.controller.initGame(); 
                } 
                e.preventDefault(); 
                return; 
            }

            // Menu state
            if (Game.state.current === 'paused') { 
                if (key === 'Escape') this.controller.handlePause(); 
                if (key === 'r' || key === 'R') this.controller.resetGame();
                e.preventDefault(); 
                return; 
            }
            
            // Game over state
            if (Game.state.current === 'gameOver') { 
                if (key === 'r' || key === 'R') { 
                    this.controller.resetGame(); 
                } 
                e.preventDefault(); 
                return; 
            }
            
            if (Game.state.current !== 'playing' || Game.state.gameOver) return;

            // Inventory mode
            if (Game.state.uiMode === 'inventory') {
                this.handleInventoryInput(key, e);
                return;
            }

            // Game mode
            this.handleGameInput(key, e);
        });
    };
    
    this.handleInventoryInput = function(key, e) {
        const inv = Game.ECS.getComponent(Game.world.playerEid, 'inventory');
        const n = inv ? inv.items.length : 0;
        
        if (key === 'i' || key === 'I' || key === 'Escape') { 
            this.controller.handleInventoryToggle();
            e.preventDefault(); 
            return; 
        }
        
        if (n > 0) {
            if (key === 'ArrowUp' || key === 'w' || key === 'W') { 
                this.controller.handleInventorySelect('up');
                e.preventDefault(); 
                return; 
            }
            if (key === 'ArrowDown' || key === 's' || key === 'S') { 
                this.controller.handleInventorySelect('down');
                e.preventDefault(); 
                return; 
            }
            if (key === 'Enter' || this.isSpaceKey(e)) { 
                this.controller.handleInventoryUse();
                e.preventDefault(); 
                return; 
            }
            if (key === 'd' || key === 'D') { 
                this.controller.handleInventoryDrop();
                e.preventDefault(); 
                return; 
            }
            if (key >= '1' && key <= '9') {
                const idx = (key.charCodeAt(0) - '1'.charCodeAt(0));
                if (idx < n) {
                    Game.state.invSelIndex = idx;
                    this.controller.handleInventoryUse();
                }
                e.preventDefault(); 
                return;
            }
        } else {
            if (key === 'Enter' || this.isSpaceKey(e)) { 
                this.controller.handleInventoryToggle();
                e.preventDefault(); 
                return; 
            }
        }
        e.preventDefault();
    };
    
    this.handleGameInput = function(key, e) {
        let dx = 0, dy = 0;

        if (this.isSpaceKey(e)) {
            this.controller.handleWait();
            e.preventDefault();
            return;
        }
        
        switch (key) {
            case 'w': case 'W': case 'ArrowUp': dy = -1; break;
            case 's': case 'S': case 'ArrowDown': dy = 1; break;
            case 'a': case 'A': case 'ArrowLeft': dx = -1; break;
            case 'd': case 'D': case 'ArrowRight': dx = 1; break;
            case 'i': case 'I': 
                this.controller.handleInventoryToggle(); 
                e.preventDefault(); 
                return;
            case 'r': case 'R': 
                this.controller.resetGame(); 
                e.preventDefault(); 
                return;
            case 'Escape': 
                this.controller.handlePause(); 
                e.preventDefault(); 
                return;
        }
        
        if (dx !== 0 || dy !== 0) {
            this.controller.handleMove(dx, dy);
            e.preventDefault();
        }
    };
};

// Factory for creating game instances
Game.Factory = {
    createGame(config = {}) {
        const gameController = Game.Controller;
        
        // Configure dependencies
        const dependencies = {
            canvasId: config.canvasId || 'gameCanvas',
            renderer: config.renderer || Game.Renderer,
            ecs: config.ecs || Game.ECS,
            systems: config.systems || Game.Systems,
            inputHandler: config.inputHandler || null, // Will create default
            messageSystem: config.messageSystem || Game.MessageSystem
        };
        
        return gameController.init(dependencies);
    }
};

// Entity factory functions (now pure functions that take dependencies)
function createPlayer(x, y, ecs = Game.ECS) {
    const eid = ecs.createEntity();
    ecs.addComponent(eid, 'position', {x: x, y: y});
    ecs.addComponent(eid, 'health', {hp: 100, maxHp: 100});
    ecs.addComponent(eid, 'stats', {strength: 14, agility: 12, accuracy: 6, evasion: 4});
    ecs.addComponent(eid, 'vision', {radius: 2, baseRadius: 2, visible: new Set(), seen: new Set()});
    ecs.addComponent(eid, 'descriptor', {name: 'Hero', glyph: '@', color: 'royalBlue'});
    ecs.addComponent(eid, 'blocker', {passable: false});
    ecs.addComponent(eid, 'progress', {xp: 0, level: 1, next: 20});
    ecs.addComponent(eid, 'inventory', {items: [], capacity: 12});
    ecs.addComponent(eid, 'status', {
        lightBoost: 0,
        speedBoost: 0,
        strengthBoost: 0,
        accuracyBoost: 0,
        evasionBoost: 0,
        clarityBoost: 0,
        damageReductionBoost: 0,
        regenBoost: 0,
        tempMaxHpBoost: 0,
        glassFuryBoost: 0,
        wardingBoost: 0
    });
    return eid;
}

// UPDATED: Now uses the modular monster system
function createMonster(type, x, y, ecs = Game.ECS) {
    return Game.Monsters.createFromData(Game.Monsters.dataFor(type), x, y, ecs);
}

// UPDATED: Now uses the new monster system
function spawnMonstersAvoiding(px, py, world = Game.world, ecs = Game.ECS) {
    Game.Monsters.spawnAvoiding(px, py, world, ecs);
}

// Clean game initialization
function initializeGame() {
    try {
        // Create and start the game with dependency injection
        const game = Game.Factory.createGame({
            canvasId: 'gameCanvas'
        });
        
        // Start the game
        game.start();
        
        console.log('Game initialized successfully with dependency injection!');
        return game;
        
    } catch (error) {
        console.error('Failed to initialize game:', error);
        alert('Failed to initialize game: ' + error.message);
        return null;
    }
}

// Backward compatibility functions (for transition period)
function resetGame() {
    if (window.gameInstance) {
        window.gameInstance.resetGame();
    }
}

function setupInput() {
    // Input is now handled by the InputHandler dependency
    console.log('Input setup handled by dependency injection');
}

function gameLoop() {
    // Game loop is now handled by the Controller
    console.log('Game loop handled by dependency injection');
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Store global reference for backward compatibility
    window.gameInstance = initializeGame();
});

// Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Game,
        createPlayer,
        createMonster,
        spawnMonstersAvoiding
    };
}
