/** =========================
 *  Enhanced Renderer
 *  ========================= */

// Store the original renderGameView method
const originalRenderGameView = Game.Renderer.renderGameView;

// Override only the renderGameView method to add shake support
Game.Renderer.renderGameView = function(gameState, world, playerEid) {
    const ctx = this.getContext();
    
    // Get current shake offset
    const shakeOffset = Game.VisualEffects.DungeonShake.getOffset();
    
    // === DUNGEON RENDERING (with shake) ===
    ctx.save();
    ctx.translate(shakeOffset.x, shakeOffset.y);
    
    // Render dungeon and entities with shake applied
    this.renderDungeon(world, playerEid);
    this.renderEntities(playerEid);
    this.renderExplosions(Game.effects.explosions);
    this.renderLighting(playerEid);
    
    ctx.restore();
    
    // === UI RENDERING (without shake) ===
    // UI elements are rendered without the shake transform
    Game.HUD.render(ctx, gameState, playerEid);
    Game.HUD.renderMessages(ctx, world.messages);
    
    // === VISUAL EFFECTS (with shake applied to world effects) ===
    Game.VisualEffects.render(ctx);
    
    // === OVERLAYS (without shake) ===
    if (gameState.uiMode === 'inventory') {
        this.renderInventoryOverlay(gameState, playerEid);
    }
    if (gameState.current === 'paused') {
        this.renderPauseOverlay();
    } else if (gameState.current === 'gameOver') {
        this.renderGameOverOverlay(gameState);
    }
};

// Enhanced entity rendering with color pulse support
const originalRenderEntity = Game.Renderer.renderEntity;
Game.Renderer.renderEntity = function(eid, pos, desc, hp) {
    const screenX = pos.x * Game.config.TILE_SIZE;
    const screenY = pos.y * Game.config.TILE_SIZE;
    
    // Get pulsed color if available
    const pulsedColor = Game.VisualEffects?.ColorPulse?.getColor(eid, desc.color) || desc.color;
    const color = parseColor(pulsedColor);
    
    const ctx = this.getContext();
    ctx.font = `${Game.config.TILE_SIZE - 2}px monospace`;
    ctx.fillStyle = `rgb(${color.join(',')})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(desc.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);
    
    // Enhanced health bar rendering
    if (hp && hp.hp < hp.maxHp && desc.glyph !== '@') {
        if (Game.VisualEffects?.HealthBars?.renderEntityHealthBar) {
            Game.VisualEffects.HealthBars.renderEntityHealthBar(ctx, screenX, screenY, hp, {
                animated: true,
                offsetY: -6
            });
        } else {
            // Fallback to original health bar rendering
            this.renderEntityHealthBar(screenX, screenY, hp);
        }
    }
};

// Enhanced main render method to include visual effects
const originalRender = Game.Renderer.render;
Game.Renderer.render = function(gameState, world, playerEid) {
    // Call original render logic
    originalRender.call(this, gameState, world, playerEid);
};
