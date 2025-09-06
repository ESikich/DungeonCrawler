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
                    this.renderStart();
                    break;
                case 'playing':
                case 'paused':
                case 'gameOver':
                    if (playerEid) {
                        this.renderDungeon(world, playerEid);
                        this.renderEntities(playerEid);
                        this.renderExplosions(Game.effects.explosions);
                        this.renderLighting(playerEid);
                        this.renderHUD(gameState, playerEid);
                        this.renderMessages(world.messages);
                        
                        if (gameState.uiMode === 'inventory') {
                            this.renderInventoryOverlay(gameState, playerEid);
                        }
                        if (gameState.current === 'paused') {
                            this.renderPause();
                        } else if (gameState.current === 'gameOver') {
                            this.renderGameOver(gameState);
                        }
                    }
                    break;
            }
        },
        
        // Individual render methods
        renderStart() {
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
        
        renderDungeon(world, playerEid) {
            const v = Game.ECS.getComponent(playerEid, 'vision');
            if (!v) return;
            
            for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                    const tile = world.dungeonGrid[y][x];
                    const screenX = x * Game.config.TILE_SIZE;
                    const screenY = y * Game.config.TILE_SIZE;
                    const isVisible = v.visible.has(x + ',' + y);
                    const isSeen = v.seen.has(x + ',' + y);
                    
                    if (isVisible) {
                        ctx.fillStyle = 'rgb(' + tile.color.join(',') + ')';
                        ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                        if (tile.glyph && tile.glyph !== '.') {
                            ctx.font = (Game.config.TILE_SIZE - 4) + 'px monospace';
                            ctx.fillStyle = tile.glyph === '>' ? 'gold' : 'white';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(tile.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);
                        }
                    } else if (isSeen) {
                        const dim = tile.color.map(c => Math.floor(c / 4));
                        ctx.fillStyle = 'rgb(' + dim.join(',') + ')';
                        ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                    } else {
                        ctx.fillStyle = 'rgb(20,20,30)';
                        ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                    }
                }
            }
        },
        
        renderEntities(playerEid) {
            const v = Game.ECS.getComponent(playerEid, 'vision');
            if (!v) return;
            const list = Game.ECS.getEntitiesWith(['position', 'descriptor']);
            
            for (let i = 0; i < list.length; i++) {
                const eid = list[i];
                const pos = Game.ECS.getComponent(eid, 'position');
                const desc = Game.ECS.getComponent(eid, 'descriptor');
                const hp = Game.ECS.getComponent(eid, 'health');
                if (hp && hp.hp <= 0) continue;
                if (!v.visible.has(pos.x + ',' + pos.y)) continue;

                const screenX = pos.x * Game.config.TILE_SIZE;
                const screenY = pos.y * Game.config.TILE_SIZE;
                const color = parseColor(desc.color);
                ctx.font = (Game.config.TILE_SIZE - 2) + 'px monospace';
                ctx.fillStyle = 'rgb(' + color.join(',') + ')';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(desc.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);

                // Health bar for non-player entities
                if (hp && hp.hp < hp.maxHp && desc.glyph !== '@') {
                    const bw = Game.config.TILE_SIZE - 4;
                    const bh = 4;
                    const bx = screenX + 2;
                    const by = screenY - 2;
                    ctx.fillStyle = 'rgba(100,0,0,0.8)';
                    ctx.fillRect(bx, by, bw, bh);
                    const pct = hp.hp / hp.maxHp;
                    const fw = bw * pct;
                    ctx.fillStyle = pct > 0.6 ? 'rgba(0,255,0,0.8)' : pct > 0.3 ? 'rgba(255,255,0,0.8)' : 'rgba(255,0,0,0.8)';
                    ctx.fillRect(bx, by, fw, bh);
                }
            }
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        },
        
        renderLighting(playerEid) {
            if (lightCanvas.width !== Game.config.DUNGEON_PIXEL_WIDTH || 
                lightCanvas.height !== Game.config.DUNGEON_PIXEL_HEIGHT) {
                lightCanvas.width = Game.config.DUNGEON_PIXEL_WIDTH;
                lightCanvas.height = Game.config.DUNGEON_PIXEL_HEIGHT;
            }
            
            const pos = Game.ECS.getComponent(playerEid, 'position');
            const v = Game.ECS.getComponent(playerEid, 'vision');
            if (!pos || !v) return;

            lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);

            lightCtx.globalCompositeOperation = 'source-over';
            lightCtx.fillStyle = 'rgba(0,0,0,1)';
            lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);

            if (v.seen && v.seen.size) {
                lightCtx.globalCompositeOperation = 'destination-out';
                lightCtx.beginPath();
                v.seen.forEach(function(key) {
                    if (!v.visible.has(key)) {
                        const parts = key.split(',');
                        const tx = (parts[0] | 0) * Game.config.TILE_SIZE;
                        const ty = (parts[1] | 0) * Game.config.TILE_SIZE;
                        lightCtx.rect(tx, ty, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                    }
                });
                lightCtx.fillStyle = 'rgba(0,0,0,' + Game.config.MEMORY_REVEAL + ')';
                lightCtx.fill();
            }

            const cx = (pos.x + 0.5) * Game.config.TILE_SIZE;
            const cy = (pos.y + 0.5) * Game.config.TILE_SIZE;
            const outer = v.radius * Game.config.TILE_SIZE;
            const grad = lightCtx.createRadialGradient(cx, cy, 0, cx, cy, outer);

            const gamma = 2.2;
            function a(t) { return 1 - Math.pow(t, gamma); }
            grad.addColorStop(0.00, 'rgba(0,0,0,' + a(0.00) + ')');
            grad.addColorStop(0.50, 'rgba(0,0,0,' + a(0.50) + ')');
            grad.addColorStop(0.75, 'rgba(0,0,0,' + a(0.75) + ')');
            grad.addColorStop(0.90, 'rgba(0,0,0,' + a(0.90) + ')');
            grad.addColorStop(1.00, 'rgba(0,0,0,0)');

            lightCtx.save();
            lightCtx.beginPath();
            v.visible.forEach(function(key) {
                const parts = key.split(',');
                const tx = (parts[0] | 0) * Game.config.TILE_SIZE;
                const ty = (parts[1] | 0) * Game.config.TILE_SIZE;
                lightCtx.rect(tx, ty, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            });
            lightCtx.clip();

            lightCtx.globalCompositeOperation = 'destination-out';
            lightCtx.fillStyle = grad;
            lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);
            lightCtx.restore();

            lightCtx.globalCompositeOperation = 'source-over';
            ctx.drawImage(lightCanvas, 0, 0);
        },
        
        // IMPROVED HUD LAYOUT
        renderHUD(gameState, playerEid) {
            const hp = Game.ECS.getComponent(playerEid, 'health');
            const stats = Game.ECS.getComponent(playerEid, 'stats');
            const inv = Game.ECS.getComponent(playerEid, 'inventory');
            const prog = Game.ECS.getComponent(playerEid, 'progress');
            const st = Game.ECS.getComponent(playerEid, 'status');
            if (!hp) return;
            
            const uiH = 120; // Increased height for better spacing
            const hudY = canvas.height - uiH;
            
            // Background
            ctx.fillStyle = 'rgba(16,16,32,0.95)';
            ctx.fillRect(0, hudY, canvas.width, uiH);
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, hudY, canvas.width, uiH);

            const margin = 12;
            
            // === TOP ROW: Health and XP bars ===
            const topRowY = hudY + margin;
            
            // Health section (left side)
            ctx.font = '16px monospace';
            ctx.fillStyle = 'white';
            ctx.fillText('HP: ' + hp.hp + '/' + hp.maxHp, margin, topRowY + 18);
            
            // Health bar
            const healthBarX = margin + 100;
            const healthBarW = 160;
            const healthBarH = 14;
            const healthBarY = topRowY + 6;
            
            ctx.fillStyle = '#400';
            ctx.fillRect(healthBarX, healthBarY, healthBarW, healthBarH);
            if (hp.maxHp > 0) {
                const healthFill = (hp.hp / hp.maxHp) * healthBarW;
                const healthColor = hp.hp > hp.maxHp * 0.6 ? '#4a4' : hp.hp > hp.maxHp * 0.3 ? '#aa4' : '#a44';
                ctx.fillStyle = healthColor;
                ctx.fillRect(healthBarX, healthBarY, healthFill, healthBarH);
            }
            ctx.strokeStyle = '#888';
            ctx.strokeRect(healthBarX, healthBarY, healthBarW, healthBarH);

            // XP section (right side of health)
            if (prog) {
                const xpX = healthBarX + healthBarW + 20;
                const xpW = 140;
                const xpY = healthBarY;
                
                // XP label
                ctx.font = '14px monospace';
                ctx.fillStyle = '#9cf';
                ctx.fillText('LVL ' + prog.level, xpX, topRowY + 16);
                
                // XP bar
                ctx.fillStyle = '#222';
                ctx.fillRect(xpX, xpY, xpW, 12);
                const xpFill = Math.min(1, prog.xp / Math.max(1, prog.next));
                ctx.fillStyle = '#58a6ff';
                ctx.fillRect(xpX, xpY, xpW * xpFill, 12);
                ctx.strokeStyle = '#666';
                ctx.strokeRect(xpX, xpY, xpW, 12);
                
                // XP text
                ctx.font = '11px monospace';
                ctx.fillStyle = '#9cf';
                ctx.fillText('XP: ' + prog.xp + '/' + prog.next, xpX + 2, xpY + 9);
            }

            // Gold (far right)
            ctx.font = '16px monospace';
            ctx.fillStyle = '#ffcc00';
            const goldX = canvas.width - 140;
            ctx.fillText('Gold: ' + gameState.playerGold, goldX, topRowY + 18);

            // === MIDDLE ROW: Stats ===
            const middleRowY = topRowY + 32;
            
            if (stats) {
                ctx.font = '14px monospace';
                ctx.fillStyle = '#ccc';
                
                // Base stats
                let statText = 'STR:' + stats.strength + '  AGI:' + stats.agility + '  ACC:' + stats.accuracy + '  EVA:' + stats.evasion;
                ctx.fillText(statText, margin, middleRowY);
                
                // Status effects (right aligned)
                if (st) {
                    let statusText = '';
                    if (st.strengthBoost > 0) statusText += '[STR+' + st.strengthBoost + '] ';
                    if (st.speedBoost > 0) statusText += '[SPD+' + st.speedBoost + '] ';
                    if (st.lightBoost > 0) statusText += '[VIS+' + st.lightBoost + '] ';
                    
                    if (statusText) {
                        ctx.fillStyle = '#88ff88';
                        const statusX = canvas.width - ctx.measureText(statusText).width - margin;
                        ctx.fillText(statusText.trim(), statusX, middleRowY);
                    }
                }
            }

            // === BOTTOM ROW: Game info and inventory ===
            const bottomRowY = middleRowY + 20;
            
            // Left side: Game info
            ctx.font = '12px monospace';
            ctx.fillStyle = '#999';
            const gameInfoText = 'Turn: ' + gameState.turnCount + '  Floor: ' + gameState.floor + '  Level: ' + (prog ? prog.level : 1);
            ctx.fillText(gameInfoText, margin, bottomRowY);
            
            // Center: Inventory info
            if (inv) {
                ctx.fillStyle = '#9cf';
                const invText = 'Inventory: ' + inv.items.length + '/' + inv.capacity + ' (Press I)';
                const invTextWidth = ctx.measureText(invText).width;
                const invX = (canvas.width - invTextWidth) / 2;
                ctx.fillText(invText, invX, bottomRowY);
            }
            
            // Right side: Controls hint
            ctx.fillStyle = '#666';
            const controlsText = 'R:Restart  ESC:Pause';
            const controlsX = canvas.width - ctx.measureText(controlsText).width - margin;
            ctx.fillText(controlsText, controlsX, bottomRowY);
            
            // === BOTTOM LINE: Additional info ===
            const infoRowY = bottomRowY + 16;
            ctx.font = '10px monospace';
            ctx.fillStyle = '#555';
            
            // Performance/debug info (optional)
            const debugText = 'Entities: ' + Game.ECS.getEntityCount() + '  Visible: ' + 
                (Game.ECS.getComponent(playerEid, 'vision')?.visible.size || 0);
            ctx.fillText(debugText, margin, infoRowY);
        },
        
        renderMessages(messages) {
            if (messages.length === 0) return;
            const uiH = 120; // Updated to match new HUD height
            const hudY = canvas.height - uiH;
            const margin = 12;
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            const lineH = 14;
            let y = hudY + uiH - margin - 20; // Leave space for the new bottom info line
            const start = Math.max(0, messages.length - 3); // Show fewer messages to avoid overlap
            for (let i = messages.length - 1; i >= start; i--) {
                const m = messages[i];
                const age = Date.now() - m.time;
                const a = Math.max(0.3, 1 - (age / 5000));
                ctx.globalAlpha = a;
                ctx.fillStyle = '#ddd';
                ctx.fillText(m.text, canvas.width - margin, y);
                ctx.globalAlpha = 1;
                y -= lineH;
            }
            ctx.textAlign = 'left';
        },
        
        renderInventoryOverlay(gameState, playerEid) {
            const inv = Game.ECS.getComponent(playerEid, 'inventory');
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const w = 520, h = 380;
            const x = (canvas.width - w) / 2;
            const y = (canvas.height - h) / 2;
            ctx.fillStyle = 'rgba(20,20,40,0.95)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#88f';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#fff';
            ctx.font = '22px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('Inventory (' + (inv ? inv.items.length : 0) + '/' + (inv ? inv.capacity : 0) + ')', x + 16, y + 16);

            ctx.font = '14px monospace';
            ctx.fillStyle = '#ccc';
            ctx.fillText('↑/↓ or W/S: select   ENTER/SPACE: use   D: drop   I/ESC: close', x + 16, y + h - 28);

            const listTop = y + 60;

            if (!inv || inv.items.length === 0) {
                ctx.fillStyle = '#bbb';
                ctx.font = '18px monospace';
                ctx.fillText('(empty)', x + 16, listTop);
                return;
            }

            ctx.font = '16px monospace';
            ctx.textBaseline = 'alphabetic';
            const m = ctx.measureText('M');
            const ascent = m.actualBoundingBoxAscent || 14;
            const descent = m.actualBoundingBoxDescent || 4;
            const rowH = ascent + descent + 4;

            gameState.invSelIndex = clamp(gameState.invSelIndex, 0, inv.items.length - 1);

            for (let i = 0; i < inv.items.length; i++) {
                const baselineY = listTop + i * rowH + ascent;

                if (i === gameState.invSelIndex) {
                    ctx.fillStyle = 'rgba(60,60,120,0.85)';
                    ctx.fillRect(x + 10, baselineY - ascent - 2, w - 20, rowH);
                }

                const it = inv.items[i];
                const rarityColor = it.rarity === 'epic' ? '#ff99ff' : it.rarity === 'rare' ? '#99ccff' : '#fff';
                ctx.fillStyle = rarityColor;
                ctx.fillText(((i + 1) + '. ').padEnd(3, ' ') + (it.name || 'Item'), x + 16, baselineY);
            }

            const sel = inv.items[gameState.invSelIndex];
            if (sel) {
                ctx.font = '16px monospace';
                ctx.fillStyle = '#9cf';
                ctx.textBaseline = 'top';
                ctx.fillText('Details: ' + (sel.desc || 'No description.'), x + 16, y + h - 52);
            }
        },
        
        renderPause() {
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
        
        renderGameOver(gameState) {
            ctx.fillStyle = 'rgba(20,0,0,0.95)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const centerX = canvas.width / 2;
            const startY = 50;
            
            // Title
            ctx.font = '48px monospace';
            ctx.fillStyle = '#ff6666';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', centerX, startY);
            
            // Death info
            ctx.font = '20px monospace';
            ctx.fillStyle = '#ffaaaa';
            ctx.fillText('Killed by: ' + Game.stats.killedBy, centerX, startY + 60);
            ctx.fillText('Cause: ' + Game.stats.deathCause, centerX, startY + 85);
            
            // Calculate survival time
            const survivalTime = Game.stats.endTime - Game.stats.startTime;
            const minutes = Math.floor(survivalTime / 60000);
            const seconds = Math.floor((survivalTime % 60000) / 1000);
            
            // Main stats
            ctx.font = '18px monospace';
            ctx.fillStyle = 'white';
            let y = startY + 130;
            const lineHeight = 22;
            
            ctx.fillText('═══ FINAL STATISTICS ═══', centerX, y);
            y += lineHeight * 1.5;
            
            // Create two columns
            ctx.textAlign = 'left';
            const leftX = centerX - 180;
            const rightX = centerX + 40;
            
            // Left column stats
            let leftY = y;
            ctx.fillStyle = '#ffdd88';
            ctx.fillText('SURVIVAL', leftX, leftY);
            ctx.fillStyle = 'white';
            leftY += lineHeight;
            ctx.fillText('Turns Survived: ' + gameState.turnCount, leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Time Played: ' + minutes + 'm ' + seconds + 's', leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Floors Descended: ' + Game.stats.floorsDescended, leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Deepest Floor: ' + Math.abs(gameState.floor), leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Final Level: ' + Game.stats.highestLevel, leftX, leftY);
            leftY += lineHeight + 10;
            
            ctx.fillStyle = '#88ddff';
            ctx.fillText('COMBAT', leftX, leftY);
            ctx.fillStyle = 'white';
            leftY += lineHeight;
            ctx.fillText('Enemies Killed: ' + Game.stats.enemiesKilled, leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Damage Dealt: ' + Game.stats.totalDamageDealt, leftX, leftY);
            leftY += lineHeight;
            ctx.fillText('Damage Taken: ' + Game.stats.totalDamageTaken, leftX, leftY);
            
            // Right column stats  
            let rightY = y;
            ctx.fillStyle = '#ffdd88';
            ctx.fillText('PROGRESSION', rightX, rightY);
            ctx.fillStyle = 'white';
            rightY += lineHeight;
            ctx.fillText('Total XP Gained: ' + Game.stats.totalXpGained, rightX, rightY);
            rightY += lineHeight;
            ctx.fillText('Gold Collected: ' + Game.stats.goldCollected, rightX, rightY);
            rightY += lineHeight;
            ctx.fillText('Final Gold: ' + gameState.playerGold, rightX, rightY);
            rightY += lineHeight + 10;
            
            ctx.fillStyle = '#88ff88';
            ctx.fillText('ITEMS', rightX, rightY);
            ctx.fillStyle = 'white';
            rightY += lineHeight;
            ctx.fillText('Items Picked Up: ' + Game.stats.itemsPickedUp, rightX, rightY);
            rightY += lineHeight;
            ctx.fillText('Potions Used: ' + Game.stats.potionsUsed, rightX, rightY);
            rightY += lineHeight;
            ctx.fillText('Bombs Used: ' + Game.stats.bombsUsed, rightX, rightY);
            
            // Restart instruction
            ctx.font = '24px monospace';
            ctx.fillStyle = '#88ff88';
            ctx.textAlign = 'center';
            ctx.fillText('Press R to restart', centerX, canvas.height - 40);
            ctx.textAlign = 'left';
        },
        
        renderExplosions(explosions) {
            // Safety check - ensure explosions array exists
            if (!explosions || !Array.isArray(explosions)) {
                return;
            }
            
            const now = Date.now();
            
            for (let i = 0; i < explosions.length; i++) {
                const explosion = explosions[i];
                const elapsed = now - explosion.startTime;
                const progress = elapsed / explosion.duration;
                
                if (progress >= 1) continue;
                
                const centerX = (explosion.x + 0.5) * Game.config.TILE_SIZE;
                const centerY = (explosion.y + 0.5) * Game.config.TILE_SIZE;
                
                // Multiple expanding circles
                for (let wave = 0; wave < 3; wave++) {
                    const waveProgress = Math.max(0, progress - wave * 0.1);
                    if (waveProgress <= 0) continue;
                    
                    const currentRadius = waveProgress * explosion.maxRadius * Game.config.TILE_SIZE;
                    const alpha = (1 - waveProgress) * 0.8;
                    
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = wave === 0 ? '#ff6600' : wave === 1 ? '#ff9900' : '#ffcc00';
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
            }
        },
        
        // Getters for external access
        getCanvas() { return canvas; },
        getContext() { return ctx; }
    };
})();
