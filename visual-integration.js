/** =========================
 *  Visual Effects Integration - Fixed for Turn-Based Game
 *  Sets up independent 60fps animation loop alongside turn-based game logic
 *  ========================= */

// Start the visual effects animation loop when the game initializes
if (Game.Controller) {
    const originalInit = Game.Controller.init;
    const originalStart = Game.Controller.start;
    const originalStop = Game.Controller.stop;
    const originalRender = Game.Controller.render;
    
    // Start visual effects when game initializes
    Game.Controller.init = function(dependencies) {
        const result = originalInit.call(this, dependencies);
        Game.VisualEffects.start(); // Start independent animation loop
        return result;
    };
    
    // Ensure visual effects start with game
    Game.Controller.start = function() {
        originalStart.call(this);
        Game.VisualEffects.start();
    };
    
    // Stop visual effects when game stops
    Game.Controller.stop = function() {
        originalStop.call(this);
        Game.VisualEffects.stop();
    };
    
    // Render visual effects on top of game
    Game.Controller.render = function() {
        originalRender.call(this);
        const ctx = Game.Renderer.getContext();
        if (ctx) {
            Game.VisualEffects.render(ctx);
        }
    };
    
    // Remove the update integration - visual effects update themselves
    // Game turns only trigger new effects, don't update existing ones
}

// Enhance HUD rendering with visual effects for health bars
if (Game.HUD && Game.HUD.render) {
    const originalHUDRender = Game.HUD.render;
    
    Game.HUD.render = function(ctx, gameState, playerEid) {
        originalHUDRender.call(this, ctx, gameState, playerEid);
        
        const components = this.gatherComponents(playerEid);
        if (components.health) {
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - this.getHeight();
            
            const hp = components.health;
            const healthPercent = hp.hp / hp.maxHp;
            
            // Low health warning glow - positioned to match the actual health bar location
            if (healthPercent < 0.3) {
                const pulse = 0.3 + Math.sin(Date.now() * 0.008) * 0.7;
                
                // Calculate exact health bar position based on HUD layout
                const CONFIG = {
                    padding: 12,
                    zones: {
                        leftWidth: 200
                    },
                    bars: {
                        width: 140,
                        height: 12
                    }
                };
                
                const leftX = CONFIG.padding;
                const barY = hudY + CONFIG.padding + 25; // Row 2 position
                
                ctx.save();
                ctx.shadowColor = '#ff4444';
                ctx.shadowBlur = 8 * pulse;
                ctx.strokeStyle = `rgba(255, 68, 68, ${pulse * 0.8})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(leftX - 2, barY - 2, CONFIG.bars.width + 4, CONFIG.bars.height + 4);
                ctx.restore();
            }
        }
    };
}

// Enhanced monster spawning with visual effects
if (typeof spawnMonstersModular === 'function') {
    const originalSpawnMonsters = spawnMonstersModular;
    
    window.spawnMonstersModular = function(px, py, world, ecs, customMonsterPool) {
        const result = originalSpawnMonsters.call(this, px, py, world, ecs, customMonsterPool);
        
        const monsters = ecs.getEntitiesWith(['ai', 'descriptor', 'position']);
        
        for (const monsterId of monsters) {
            const desc = ecs.getComponent(monsterId, 'descriptor');
            
            if (monsterId === Game.world.playerEid) continue;
            
            if (desc) {
                // Slow, subtle pulses for monsters - they should be atmospheric, not distracting
                if (desc.name.toLowerCase().includes('berserker') || 
                    desc.name.toLowerCase().includes('troll')) {
                    Game.VFX.pulse(monsterId, 'red', 0.002, 0.15); // Very slow, subtle
                } else if (desc.name.toLowerCase().includes('skeleton') ||
                           desc.name.toLowerCase().includes('wraith')) {
                    Game.VFX.pulse(monsterId, 'cyan', 0.0015, 0.1); // Very slow, very subtle
                } else if (desc.glyph === 'g') {
                    Game.VFX.pulse(monsterId, 'green', 0.001, 0.08); // Barely noticeable
                }
            }
        }
        
        return result;
    };
}

// Add visual effects to level transitions
if (Game.Systems && Game.Systems.World && Game.Systems.World.nextLevel) {
    const originalNextLevel = Game.Systems.World.nextLevel;
    
    Game.Systems.World.nextLevel = function() {
        Game.VFX.shake(6, 500);
        
        originalNextLevel.call(this);
        
        Game.VisualEffects.clear();
        
        const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
        if (ppos) {
            // 3 second golden pulse for level transition
            Game.VFX.pulse(Game.world.playerEid, 'yellow', 0.006, 0.4, 3000);
        }
    };
}

// Game reset enhancement
if (Game.resetAll) {
    const originalResetAll = Game.resetAll;
    
    Game.resetAll = function() {
        Game.VisualEffects.clear();
        
        const canvas = Game.Renderer.getCanvas();
        if (canvas) {
            canvas.style.transform = 'translate(0px, 0px)';
        }
        
        originalResetAll.call(this);
    };
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