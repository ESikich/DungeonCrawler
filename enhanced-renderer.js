/** =========================
 *  Enhanced Renderer - Complete Integration with Visual Effects
 *  ========================= */

// Store original methods
const originalRenderEntity = Game.Renderer.renderEntity;
const originalRender = Game.Renderer.render;
const originalRenderEntities = Game.Renderer.renderEntities;

// Enhanced entity rendering
Game.Renderer.renderEntity = function(eid, pos, desc, hp) {
    const screenX = pos.x * Game.config.TILE_SIZE;
    const screenY = pos.y * Game.config.TILE_SIZE;
    
    const pulsedColor = Game.VisualEffects.ColorPulse.getColor(eid, desc.color);
    const color = parseColor(pulsedColor);
    
    const ctx = this.getContext();
    ctx.font = `${Game.config.TILE_SIZE - 2}px monospace`;
    ctx.fillStyle = `rgb(${color.join(',')})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(desc.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);
    
    if (hp && hp.hp < hp.maxHp && desc.glyph !== '@') {
        Game.VisualEffects.HealthBars.renderEntityHealthBar(ctx, screenX, screenY, hp, {
            animated: true,
            offsetY: -6
        });
    }
};

// Enhanced main render
Game.Renderer.render = function(gameState, world, playerEid) {
    const ctx = this.getContext();
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    switch (gameState.current) {
        case 'start':
            this.renderStartScreen();
            break;
        case 'playing':
        case 'paused':
        case 'gameOver':
            if (playerEid) {
                this.renderGameView(gameState, world, playerEid);
                Game.VisualEffects.render(ctx);
            }
            break;
    }
};

// Enhanced entities rendering
Game.Renderer.renderEntities = function(playerEid) {
    const vision = Game.ECS.getComponent(playerEid, 'vision');
    if (!vision) return;
    
    const entities = Game.ECS.getEntitiesWith(['position', 'descriptor']);
    
    for (const eid of entities) {
        const pos = Game.ECS.getComponent(eid, 'position');
        const desc = Game.ECS.getComponent(eid, 'descriptor');
        const hp = Game.ECS.getComponent(eid, 'health');
        
        if ((hp && hp.hp <= 0) || !vision.visible.has(`${pos.x},${pos.y}`)) {
            continue;
        }
        
        this.renderEntity(eid, pos, desc, hp);
    }
    
    const ctx = this.getContext();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
};