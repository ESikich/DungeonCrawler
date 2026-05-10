/** =========================
 *  Visual Effects Integration - Fixed for Turn-Based Game
 *  Sets up independent 60fps animation loop alongside turn-based game logic
 *  ========================= */

// Centralized visual reactions to gameplay events
if (Game.Events) {
    Game.Events.on('controller.init', function() {
        Game.VisualEffects.start();
    });

    Game.Events.on('controller.start', function() {
        Game.VisualEffects.start();
    });

    Game.Events.on('controller.stop', function() {
        Game.VisualEffects.stop();
    });

    Game.Events.on('combat.damage', function(event) {
        if (!event.position) return;

        if (event.isCritical) {
            Game.VFX.critical(event.position.x, event.position.y, event.amount);
            Game.VFX.shake(6, 200);
        } else {
            Game.VFX.damage(event.position.x, event.position.y, event.amount);
            if (event.source !== 'bomb') {
                Game.VFX.shake(3, 150);
            }
        }
    });

    Game.Events.on('player.death', function() {
        Game.VFX.shake(12, 800);
    });

    Game.Events.on('progression.xpAwarded', function(event) {
        if (event.position) {
            Game.VFX.xp(event.position.x, event.position.y, event.amount);
        }
    });

    Game.Events.on('player.healed', function(event) {
        if (event.position && event.amount > 0) {
            Game.VFX.heal(event.position.x, event.position.y, event.amount);
        }

        if (event.source === 'item') {
            Game.VFX.pulse(event.entityId, 'green', 0.006, 0.4, 2000);
        }
    });

    Game.Events.on('player.levelUp', function(event) {
        Game.VFX.shake(4, 300);
        Game.VFX.pulse(event.entityId, 'gold', 0.05, 0.6);
        setTimeout(() => Game.VFX.stopPulse(event.entityId), 2000);
    });

    Game.Events.on('item.tempBoostApplied', function(event) {
        const colors = {
            speed: 'cyan',
            strength: 'red',
            light: 'yellow'
        };
        const speeds = {
            speed: 0.008,
            strength: 0.005,
            light: 0.004
        };
        const intensities = {
            speed: 0.5,
            strength: 0.3,
            light: 0.6
        };
        const color = colors[event.boostType] || 'white';

        Game.VFX.pulse(
            event.entityId,
            color,
            speeds[event.boostType] || 0.004,
            intensities[event.boostType] || 0.4,
            (event.turns || 1) * 5000
        );
    });

    Game.Events.on('item.permanentBoostApplied', function(event) {
        const colors = {
            vision: 'blue',
            health: 'green',
            strength: 'red'
        };
        const shakes = {
            vision: [3, 200],
            health: [2, 150],
            strength: [4, 250]
        };
        const color = colors[event.boostType] || 'gold';
        const shake = shakes[event.boostType] || [3, 200];

        if (event.boostType === 'health' && event.position && event.amount) {
            Game.VFX.heal(event.position.x, event.position.y, event.amount);
        }
        Game.VFX.pulse(event.entityId, color, 0.003, event.boostType === 'vision' ? 0.7 : 0.5, 4000);
        Game.VFX.shake(shake[0], shake[1]);
    });

    Game.Events.on('item.bombUsed', function(event) {
        const radius = event.radius || 1;
        Game.VFX.shake(8 + radius * 2, 400 + radius * 100);
    });

    Game.Events.on('item.goldPickedUp', function(event) {
        if (event.position) {
            Game.VFX.gold(event.position.x, event.position.y, event.amount);
        }
    });

    Game.Events.on('item.pickedUp', function(event) {
        if (event.rarity === 'epic') {
            Game.VFX.shake(2, 100);
        } else if (event.rarity === 'rare') {
            Game.VFX.shake(1, 50);
        }
    });

    Game.Events.on('item.created', function(event) {
        const item = event.item || {};
        if (event.rarity === 'epic') {
            Game.VFX.pulse(event.entityId, item.color, 0.002, 0.3);
        } else if (event.rarity === 'rare') {
            Game.VFX.pulse(event.entityId, item.color, 0.0015, 0.2);
        }
    });

    Game.Events.on('monster.created', function(event) {
        const desc = event.descriptor;
        if (!desc) return;

        if (desc.name.toLowerCase().includes('berserker') ||
            desc.name.toLowerCase().includes('troll')) {
            Game.VFX.pulse(event.entityId, 'red', 0.002, 0.15);
        } else if (desc.name.toLowerCase().includes('skeleton') ||
                   desc.name.toLowerCase().includes('wraith')) {
            Game.VFX.pulse(event.entityId, 'cyan', 0.0015, 0.1);
        } else if (desc.glyph === 'g') {
            Game.VFX.pulse(event.entityId, 'green', 0.001, 0.08);
        }
    });

    Game.Events.on('world.descendStart', function() {
        Game.VFX.shake(6, 500);
    });

    Game.Events.on('world.descended', function(event) {
        Game.VisualEffects.clear();
        Game.VFX.pulse(event.playerId, 'yellow', 0.006, 0.4, 3000);
    });

    Game.Events.on('game.resetStart', function() {
        Game.VisualEffects.clear();

        const canvas = Game.Renderer.getCanvas();
        if (canvas) {
            canvas.style.transform = 'translate(0px, 0px)';
        }
    });
}

// Initialize visual effects when game starts
document.addEventListener('DOMContentLoaded', function() {
    if (Game.VisualEffects) {
        console.log('Visual Effects System loaded successfully!');
        
        // Start the visual effects immediately
        Game.VisualEffects.start();
        
        // Add subtle startup effect
        setTimeout(() => {
            if (Game.world.playerEid) {
                const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (ppos) {
                    // 3 second golden pulse for game start
                    Game.VFX.pulse(Game.world.playerEid, 'gold', 0.004, 0.2, 3000);
                }
            }
        }, 1000);
    }
});

// Export for debugging
window.VFX = Game.VFX;
window.VisualEffects = Game.VisualEffects;
