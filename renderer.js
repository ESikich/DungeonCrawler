/** =========================
 *  Renderer Module
 *  ========================= */

Game.Renderer = (function() {
    'use strict';
    
    // Private rendering state
    let canvas = null;
    let ctx = null;
    let lightCanvas = null;
    let lightCtx = null;
    
    // Private helper functions
    function renderGlyph(glyph, x, y, color) {
        ctx.font = `${Game.config.TILE_SIZE - 4}px monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, x + Game.config.TILE_SIZE / 2, y + Game.config.TILE_SIZE / 2);
    }
    
    function getItemRarityColor(rarity) {
        switch (rarity) {
            case 'epic': return '#ff99ff';
            case 'rare': return '#99ccff';
            default: return '#fff';
        }
    }
    
    // Public API
    return {
        // Initialization
        init(canvasId) {
            canvas = document.getElementById(canvasId);
            ctx = canvas.getContext('2d');
            
            if (!canvas || !ctx) {
                throw new Error('Canvas not supported or not found');
            }
            
            // Create offscreen lighting canvas
            lightCanvas = document.createElement('canvas');
            lightCanvas.width = Game.config.DUNGEON_PIXEL_WIDTH;
            lightCanvas.height = Game.config.DUNGEON_PIXEL_HEIGHT;
            lightCtx = lightCanvas.getContext('2d');
            
            return true;
        },
        
        // Main render function
        render(gameState, world, playerEid) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            switch (gameState.current) {
                case 'start':
                    this.renderStartScreen();
                    break;
                case 'playing':
                case 'paused':
                case 'gameOver':
                    if (playerEid) {
                        this.renderGameView(gameState, world, playerEid);
                    }
                    break;
            }
        },
        
        // Render game view
        renderGameView(gameState, world, playerEid) {
            // Core game rendering
            this.renderDungeon(world, playerEid);
            this.renderEntities(playerEid);
            this.renderExplosions(Game.effects.explosions);
            this.renderLighting(playerEid);
            
            // UI rendering (delegated to HUD module)
            Game.HUD.render(ctx, gameState, playerEid);
            Game.HUD.renderMessages(ctx, world.messages);
            
            // Overlays
            if (gameState.uiMode === 'inventory') {
                this.renderInventoryOverlay(gameState, playerEid);
            }
            if (gameState.current === 'paused') {
                this.renderPauseOverlay();
            } else if (gameState.current === 'gameOver') {
                this.renderGameOverOverlay(gameState);
            }
        },
        
        // Start screen
        renderStartScreen() {
            ctx.font = '48px monospace';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText('DUNGEON DURGON', canvas.width / 2, canvas.height / 2 - 50);
            
            ctx.font = '24px monospace';
            ctx.fillStyle = 'lime';
            ctx.fillText('Press SPACE to start', canvas.width / 2, canvas.height / 2 + 20);
            
            ctx.font = '16px monospace';
            ctx.fillStyle = '#ccc';
            ctx.fillText('WASD: Move | I: Inventory | R: Restart', canvas.width / 2, canvas.height / 2 + 60);
            
            ctx.textAlign = 'left';
        },
        
        // Dungeon rendering
        renderDungeon(world, playerEid) {
            const vision = Game.ECS.getComponent(playerEid, 'vision');
            if (!vision) return;
            
            for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                    this.renderTile(world.dungeonGrid[y][x], x, y, vision);
                }
            }
        },
        
        renderTile(tile, x, y, vision) {
            const screenX = x * Game.config.TILE_SIZE;
            const screenY = y * Game.config.TILE_SIZE;
            const isVisible = vision.visible.has(`${x},${y}`);
            const isSeen = vision.seen.has(`${x},${y}`);
            
            if (isVisible) {
                // Fully visible
                ctx.fillStyle = `rgb(${tile.color.join(',')})`;
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                
                if (tile.glyph && tile.glyph !== '.') {
                    renderGlyph(tile.glyph, screenX, screenY, tile.glyph === '>' ? 'gold' : 'white');
                }
            } else if (isSeen) {
                // Memory (dimmed)
                const dimColor = tile.color.map(c => Math.floor(c / 4));
                ctx.fillStyle = `rgb(${dimColor.join(',')})`;
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            } else {
                // Unseen
                ctx.fillStyle = 'rgb(20,20,30)';
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            }
        },
        
        // Entity rendering
        renderEntities(playerEid) {
            const vision = Game.ECS.getComponent(playerEid, 'vision');
            if (!vision) return;
            
            const entities = Game.ECS.getEntitiesWith(['position', 'descriptor']);
            
            for (const eid of entities) {
                const pos = Game.ECS.getComponent(eid, 'position');
                const desc = Game.ECS.getComponent(eid, 'descriptor');
                const hp = Game.ECS.getComponent(eid, 'health');
                
                // Skip dead entities or invisible ones
                if ((hp && hp.hp <= 0) || !vision.visible.has(`${pos.x},${pos.y}`)) {
                    continue;
                }
                
                this.renderEntity(eid, pos, desc, hp);
            }
            
            // Reset text alignment
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        },
        
        renderEntity(eid, pos, desc, hp) {
            const screenX = pos.x * Game.config.TILE_SIZE;
            const screenY = pos.y * Game.config.TILE_SIZE;
            const color = parseColor(desc.color);
            
            // Render entity glyph
            ctx.font = `${Game.config.TILE_SIZE - 2}px monospace`;
            ctx.fillStyle = `rgb(${color.join(',')})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(desc.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);
            
            // Health bar for damaged non-player entities
            if (hp && hp.hp < hp.maxHp && desc.glyph !== '@') {
                this.renderEntityHealthBar(screenX, screenY, hp);
            }
        },
        
        renderEntityHealthBar(x, y, hp) {
            const barWidth = Game.config.TILE_SIZE - 4;
            const barHeight = 4;
            const barX = x + 2;
            const barY = y - 2;
            
            // Background
            ctx.fillStyle = 'rgba(100,0,0,0.8)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Fill
            const fillPercent = hp.hp / hp.maxHp;
            const fillWidth = barWidth * fillPercent;
            
            if (fillPercent > 0.6) {
                ctx.fillStyle = 'rgba(0,255,0,0.8)';
            } else if (fillPercent > 0.3) {
                ctx.fillStyle = 'rgba(255,255,0,0.8)';
            } else {
                ctx.fillStyle = 'rgba(255,0,0,0.8)';
            }
            
            ctx.fillRect(barX, barY, fillWidth, barHeight);
        },
        
        // Lighting system with improved LOS edge visibility
        renderLighting(playerEid) {
            const pos = Game.ECS.getComponent(playerEid, 'position');
            const vision = Game.ECS.getComponent(playerEid, 'vision');
            if (!pos || !vision) return;
            
            this.setupLightCanvas();
            this.renderMemoryLayer(vision);
            this.renderVisionGradient(pos, vision);
            
            // Apply lighting to main canvas
            ctx.drawImage(lightCanvas, 0, 0);
        },
        
        setupLightCanvas() {
            if (lightCanvas.width !== Game.config.DUNGEON_PIXEL_WIDTH || 
                lightCanvas.height !== Game.config.DUNGEON_PIXEL_HEIGHT) {
                lightCanvas.width = Game.config.DUNGEON_PIXEL_WIDTH;
                lightCanvas.height = Game.config.DUNGEON_PIXEL_HEIGHT;
            }
            
            lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
            lightCtx.globalCompositeOperation = 'source-over';
            lightCtx.fillStyle = 'rgba(0,0,0,1)';
            lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);
        },
        
        renderMemoryLayer(vision) {
            if (!vision.seen || vision.seen.size === 0) return;
            
            lightCtx.globalCompositeOperation = 'destination-out';
            lightCtx.beginPath();
            
            vision.seen.forEach(key => {
                if (!vision.visible.has(key)) {
                    const [x, y] = key.split(',').map(Number);
                    const tileX = x * Game.config.TILE_SIZE;
                    const tileY = y * Game.config.TILE_SIZE;
                    lightCtx.rect(tileX, tileY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                }
            });
            
            lightCtx.fillStyle = `rgba(0,0,0,${Game.config.MEMORY_REVEAL})`;
            lightCtx.fill();
        },
        
        // IMPROVED: LOS edge visibility matches memory level
        renderVisionGradient(pos, vision) {
            const centerX = (pos.x + 0.5) * Game.config.TILE_SIZE;
            const centerY = (pos.y + 0.5) * Game.config.TILE_SIZE;
            const radius = vision.radius * Game.config.TILE_SIZE;
            
            // Create the main gradient
            const gradient = lightCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            const gamma = 2.2;
            const alphaFunction = t => 1 - Math.pow(t, gamma);
            
            // Memory reveal value (what non-LOS areas show)
            const memoryReveal = Game.config.MEMORY_REVEAL;
            
            gradient.addColorStop(0.00, `rgba(0,0,0,${alphaFunction(0.00)})`);
            gradient.addColorStop(0.50, `rgba(0,0,0,${alphaFunction(0.50)})`);
            gradient.addColorStop(0.75, `rgba(0,0,0,${alphaFunction(0.75)})`);
            gradient.addColorStop(0.90, `rgba(0,0,0,${alphaFunction(0.90)})`);
            // IMPROVED: Instead of going to 0, stop at memory reveal level
            gradient.addColorStop(1.00, `rgba(0,0,0,${memoryReveal})`);
            
            lightCtx.save();
            lightCtx.beginPath();
            
            // Create visibility mask
            vision.visible.forEach(key => {
                const [x, y] = key.split(',').map(Number);
                const tileX = x * Game.config.TILE_SIZE;
                const tileY = y * Game.config.TILE_SIZE;
                lightCtx.rect(tileX, tileY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            });
            
            lightCtx.clip();
            lightCtx.globalCompositeOperation = 'destination-out';
            lightCtx.fillStyle = gradient;
            lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);
            lightCtx.restore();
            lightCtx.globalCompositeOperation = 'source-over';
        },
        
        // Explosions
        renderExplosions(explosions) {
            if (!explosions || !Array.isArray(explosions)) return;
            
            const now = Date.now();
            
            for (const explosion of explosions) {
                const elapsed = now - explosion.startTime;
                const progress = elapsed / explosion.duration;
                
                if (progress >= 1) continue;
                
                this.renderExplosionEffect(explosion, progress);
            }
        },
        
        renderExplosionEffect(explosion, progress) {
            const centerX = (explosion.x + 0.5) * Game.config.TILE_SIZE;
            const centerY = (explosion.y + 0.5) * Game.config.TILE_SIZE;
            
            // Multiple expanding circles
            const waveColors = ['#ff6600', '#ff9900', '#ffcc00'];
            
            for (let wave = 0; wave < 3; wave++) {
                const waveProgress = Math.max(0, progress - wave * 0.1);
                if (waveProgress <= 0) continue;
                
                const currentRadius = waveProgress * explosion.maxRadius * Game.config.TILE_SIZE;
                const alpha = (1 - waveProgress) * 0.8;
                
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = waveColors[wave];
                ctx.lineWidth = 4 - wave;
                ctx.beginPath();
                ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            
            // Inner flash effect
            if (progress < 0.3) {
                const flashAlpha = (1 - progress / 0.3) * 0.4;
                ctx.save();
                ctx.globalAlpha = flashAlpha;
                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.arc(centerX, centerY, explosion.radius * Game.config.TILE_SIZE * 0.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        },
        
        // Overlays
        renderInventoryOverlay(gameState, playerEid) {
            const inventory = Game.ECS.getComponent(playerEid, 'inventory');
            
            // Background overlay
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Inventory panel
            const panelWidth = 520;
            const panelHeight = 380;
            const panelX = (canvas.width - panelWidth) / 2;
            const panelY = (canvas.height - panelHeight) / 2;
            
            this.renderInventoryPanel(panelX, panelY, panelWidth, panelHeight, inventory, gameState.invSelIndex);
        },
        
        renderInventoryPanel(x, y, width, height, inventory, selectedIndex) {
            // Panel background
            ctx.fillStyle = 'rgba(20,20,40,0.95)';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = '#88f';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            
            // Title
            ctx.fillStyle = '#fff';
            ctx.font = '22px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const itemCount = inventory ? inventory.items.length : 0;
            const capacity = inventory ? inventory.capacity : 0;
            ctx.fillText(`Inventory (${itemCount}/${capacity})`, x + 16, y + 16);
            
            // Instructions
            ctx.font = '14px monospace';
            ctx.fillStyle = '#ccc';
            ctx.fillText('↑/↓ or W/S: select   ENTER/SPACE: use   D: drop   I/ESC: close', x + 16, y + height - 28);
            
            // Item list
            this.renderInventoryItems(x + 16, y + 60, width - 32, height - 120, inventory, selectedIndex);
        },
        
        renderInventoryItems(x, y, width, height, inventory, selectedIndex) {
            if (!inventory || inventory.items.length === 0) {
                ctx.fillStyle = '#bbb';
                ctx.font = '18px monospace';
                ctx.fillText('(empty)', x, y);
                return;
            }
            
            ctx.font = '16px monospace';
            ctx.textBaseline = 'alphabetic';
            
            const rowHeight = 24;
            selectedIndex = clamp(selectedIndex, 0, inventory.items.length - 1);
            
            for (let i = 0; i < inventory.items.length; i++) {
                const itemY = y + i * rowHeight;
                
                // Selection highlight
                if (i === selectedIndex) {
                    ctx.fillStyle = 'rgba(60,60,120,0.85)';
                    ctx.fillRect(x - 6, itemY - 16, width, rowHeight);
                }
                
                // Item text
                const item = inventory.items[i];
                const rarityColor = getItemRarityColor(item.rarity);
                ctx.fillStyle = rarityColor;
                ctx.fillText(`${(i + 1)}. ${item.name || 'Item'}`, x, itemY);
            }
            
            // Item description
            if (inventory.items[selectedIndex]) {
                const selectedItem = inventory.items[selectedIndex];
                ctx.font = '16px monospace';
                ctx.fillStyle = '#9cf';
                ctx.textBaseline = 'top';
                ctx.fillText(`Details: ${selectedItem.desc || 'No description.'}`, x, y + height - 20);
            }
        },
        
        renderPauseOverlay() {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.font = '48px monospace';
            ctx.fillStyle = 'yellow';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
            
            ctx.font = '20px monospace';
            ctx.fillStyle = 'white';
            ctx.fillText('Press ESC to resume', canvas.width / 2, canvas.height / 2 + 40);
            
            ctx.textAlign = 'left';
        },
        
        renderGameOverOverlay(gameState) {
            ctx.fillStyle = 'rgba(20,0,0,0.95)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const centerX = canvas.width / 2;
            let y = 50;
            
            // Title
            ctx.font = '48px monospace';
            ctx.fillStyle = '#ff6666';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', centerX, y);
            y += 70;
            
            // Death info
            ctx.font = '20px monospace';
            ctx.fillStyle = '#ffaaaa';
            ctx.fillText(`Killed by: ${Game.stats.killedBy}`, centerX, y);
            y += 25;
            ctx.fillText(`Cause: ${Game.stats.deathCause}`, centerX, y);
            y += 50;
            
            // Statistics
            this.renderGameOverStats(centerX, y, gameState);
            
            // Restart instruction
            ctx.font = '24px monospace';
            ctx.fillStyle = '#88ff88';
            ctx.fillText('Press R to restart', centerX, canvas.height - 40);
            
            ctx.textAlign = 'left';
        },
        
        renderGameOverStats(centerX, startY, gameState) {
            // Calculate survival time
            const survivalTime = Game.stats.endTime - Game.stats.startTime;
            const minutes = Math.floor(survivalTime / 60000);
            const seconds = Math.floor((survivalTime % 60000) / 1000);
            
            const lineHeight = 22;
            let y = startY;
            
            // Header
            ctx.font = '18px monospace';
            ctx.fillStyle = 'white';
            ctx.fillText('═══ FINAL STATISTICS ═══', centerX, y);
            y += lineHeight * 1.5;
            
            // Two-column layout
            ctx.textAlign = 'left';
            const leftX = centerX - 180;
            const rightX = centerX + 40;
            
            // Left column
            y = this.renderStatsColumn(leftX, y, lineHeight, [
                { header: 'SURVIVAL', color: '#ffdd88' },
                { text: `Turns Survived: ${gameState.turnCount}` },
                { text: `Time Played: ${minutes}m ${seconds}s` },
                { text: `Floors Descended: ${Game.stats.floorsDescended}` },
                { text: `Deepest Floor: ${Math.abs(gameState.floor)}` },
                { text: `Final Level: ${Game.stats.highestLevel}` },
                { spacing: 10 },
                { header: 'COMBAT', color: '#88ddff' },
                { text: `Enemies Killed: ${Game.stats.enemiesKilled}` },
                { text: `Damage Dealt: ${Game.stats.totalDamageDealt}` },
                { text: `Damage Taken: ${Game.stats.totalDamageTaken}` }
            ]);
            
            // Right column
            this.renderStatsColumn(rightX, startY + lineHeight * 1.5, lineHeight, [
                { header: 'PROGRESSION', color: '#ffdd88' },
                { text: `Total XP Gained: ${Game.stats.totalXpGained}` },
                { text: `Gold Collected: ${Game.stats.goldCollected}` },
                { text: `Final Gold: ${gameState.playerGold}` },
                { spacing: 10 },
                { header: 'ITEMS', color: '#88ff88' },
                { text: `Items Picked Up: ${Game.stats.itemsPickedUp}` },
                { text: `Potions Used: ${Game.stats.potionsUsed}` },
                { text: `Bombs Used: ${Game.stats.bombsUsed}` }
            ]);
        },
        
        renderStatsColumn(x, startY, lineHeight, items) {
            let y = startY;
            
            for (const item of items) {
                if (item.header) {
                    ctx.fillStyle = item.color;
                    ctx.fillText(item.header, x, y);
                    y += lineHeight;
                    ctx.fillStyle = 'white';
                } else if (item.text) {
                    ctx.fillText(item.text, x, y);
                    y += lineHeight;
                } else if (item.spacing) {
                    y += item.spacing;
                }
            }
            
            return y;
        },
        
        // Getters for external access
        getCanvas() { return canvas; },
        getContext() { return ctx; }
    };
})();
