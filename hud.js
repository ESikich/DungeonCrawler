/** =========================
 *  HUD Module - Grid-Based Layout (No Overlaps Possible)
 *  ========================= */

Game.HUD = (function() {
    'use strict';
    
    // HUD Configuration with rigid grid system
    const CONFIG = {
        height: 110,
        padding: 12,
        
        // Grid system - divide HUD into fixed zones
        zones: {
            leftWidth: 200,     // Health section
            centerWidth: 300,   // XP and game info
            rightWidth: 150,    // Gold and controls
            rowHeight: 25       // Fixed row height
        },
        
        bars: {
            width: 140,
            height: 12
        },
        
        maxMessages: 3,
        messageLifetime: 5000
    };
    
    // Color palette
    const COLORS = {
        background: 'rgba(16,16,32,0.95)',
        border: '#444',
        healthBg: '#400',
        healthFill: '#4a4',
        healthWarn: '#aa4',
        healthBad: '#a44',
        xpBg: '#223',
        xpFill: '#48f',
        text: '#fff',
        textDim: '#aaa',
        gold: '#fc0',
        status: '#8f8',
        info: '#88f'
    };
    
    // Helper functions
    function drawBar(ctx, x, y, width, height, fillPercent, bgColor, fillColor) {
        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        
        // Fill
        if (fillPercent > 0) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, width * fillPercent, height);
        }
        
        // Border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
    }
    
    function getHealthColor(hp, maxHp) {
        const ratio = hp / maxHp;
        if (ratio > 0.6) return COLORS.healthFill;
        if (ratio > 0.3) return COLORS.healthWarn;
        return COLORS.healthBad;
    }
    
    // Zone renderers - each zone is completely independent
    const Zones = {
        // LEFT ZONE: Health (200px wide)
        renderLeftZone(ctx, x, y, zoneWidth, components) {
            const hp = components.health;
            if (!hp) return;
            
            // Health text - Row 1
            ctx.font = '14px monospace';
            ctx.fillStyle = COLORS.text;
            ctx.fillText(`Health: ${hp.hp}/${hp.maxHp}`, x, y + 14);
            
            // Health bar - Row 2
            const barY = y + CONFIG.zones.rowHeight;
            const fillPercent = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
            const fillColor = getHealthColor(hp.hp, hp.maxHp);
            drawBar(ctx, x, barY, CONFIG.bars.width, CONFIG.bars.height, fillPercent, COLORS.healthBg, fillColor);
            
            // Stats - Row 3
            const stats = components.stats;
            if (stats) {
                ctx.font = '11px monospace';
                ctx.fillStyle = COLORS.textDim;
                ctx.fillText(`STR:${stats.strength} AGI:${stats.agility}`, x, y + CONFIG.zones.rowHeight * 2 + 12);
                ctx.fillText(`ACC:${stats.accuracy} EVA:${stats.evasion}`, x, y + CONFIG.zones.rowHeight * 3 + 2);
            }
        },
        
        // CENTER ZONE: XP and Game Info (300px wide)
        renderCenterZone(ctx, x, y, zoneWidth, components, gameState) {
            const prog = components.progress;
            
            // XP text - Row 1
            if (prog) {
                ctx.font = '14px monospace';
                ctx.fillStyle = COLORS.info;
                ctx.fillText(`Level ${prog.level} - XP: ${prog.xp}/${prog.next}`, x, y + 14);
                
                // XP bar - Row 2
                const barY = y + CONFIG.zones.rowHeight;
                const fillPercent = Math.min(1, prog.xp / Math.max(1, prog.next));
                drawBar(ctx, x, barY, CONFIG.bars.width, CONFIG.bars.height, fillPercent, COLORS.xpBg, COLORS.xpFill);
            }
            
            // Game info - Row 3
            ctx.font = '12px monospace';
            ctx.fillStyle = COLORS.textDim;
            ctx.fillText(`Floor: ${gameState.floor}  Turn: ${gameState.turnCount}`, x, y + CONFIG.zones.rowHeight * 2 + 12);
            
            // Inventory - Row 4
            const inv = components.inventory;
            if (inv) {
                ctx.fillStyle = COLORS.info;
                ctx.fillText(`Inventory: ${inv.items.length}/${inv.capacity} (I)`, x, y + CONFIG.zones.rowHeight * 3 + 2);
            }
        },
        
        // RIGHT ZONE: Gold and Status (150px wide)
        renderRightZone(ctx, x, y, zoneWidth, components, gameState) {
            // Gold - Row 1
            ctx.font = '16px monospace';
            ctx.fillStyle = COLORS.gold;
            ctx.fillText(`Gold: ${gameState.playerGold}`, x, y + 16);
            
            // Status effects - Row 2 & 3
            const status = components.status;
            if (status) {
                ctx.font = '11px monospace';
                ctx.fillStyle = COLORS.status;
                let statusY = y + CONFIG.zones.rowHeight + 12;
                
                if (status.strengthBoost > 0) {
                    ctx.fillText(`STR+${status.strengthBoost} (${status.strengthBoost}t)`, x, statusY);
                    statusY += 12;
                }
                if (status.speedBoost > 0) {
                    ctx.fillText(`SPD+${status.speedBoost} (${status.speedBoost}t)`, x, statusY);
                    statusY += 12;
                }
                if (status.lightBoost > 0) {
                    ctx.fillText(`VIS+${status.lightBoost} (${status.lightBoost}t)`, x, statusY);
                }
            }
            
            // Controls hint - Bottom
            ctx.font = '10px monospace';
            ctx.fillStyle = COLORS.textDim;
            ctx.fillText('R:Restart ESC:Pause', x, y + CONFIG.zones.rowHeight * 3 + 8);
        }
    };
    
    // Public API
    return {
        getHeight() { 
            return CONFIG.height; 
        },
        
        render(ctx, gameState, playerEid) {
            const components = this.gatherComponents(playerEid);
            if (!components.health) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - CONFIG.height;
            
            // Setup
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Background
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, hudY, canvasWidth, CONFIG.height);
            ctx.strokeStyle = COLORS.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, hudY, canvasWidth, CONFIG.height);
            
            // Calculate zone positions - completely separate with gaps
            const zones = CONFIG.zones;
            const totalContentWidth = zones.leftWidth + zones.centerWidth + zones.rightWidth;
            const remainingSpace = canvasWidth - totalContentWidth - (CONFIG.padding * 2);
            const gap = Math.max(20, remainingSpace / 2); // At least 20px gap
            
            const leftX = CONFIG.padding;
            const centerX = leftX + zones.leftWidth + gap;
            const rightX = centerX + zones.centerWidth + gap;
            const contentY = hudY + CONFIG.padding;
            
            // Debug zone boundaries (remove in production)
            if (false) { // Set to true to see zone boundaries
                ctx.strokeStyle = '#f00';
                ctx.strokeRect(leftX, contentY, zones.leftWidth, CONFIG.height - CONFIG.padding * 2);
                ctx.strokeStyle = '#0f0';
                ctx.strokeRect(centerX, contentY, zones.centerWidth, CONFIG.height - CONFIG.padding * 2);
                ctx.strokeStyle = '#00f';
                ctx.strokeRect(rightX, contentY, zones.rightWidth, CONFIG.height - CONFIG.padding * 2);
            }
            
            // Render each zone independently
            Zones.renderLeftZone(ctx, leftX, contentY, zones.leftWidth, components);
            Zones.renderCenterZone(ctx, centerX, contentY, zones.centerWidth, components, gameState);
            Zones.renderRightZone(ctx, rightX, contentY, zones.rightWidth, components, gameState);
            
            ctx.restore();
        },
        
        renderMessages(ctx, messages) {
            if (!messages || messages.length === 0) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - CONFIG.height;
            
            ctx.save();
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            
            // Position messages above HUD with proper spacing
            let y = hudY - 15;
            const startIndex = Math.max(0, messages.length - CONFIG.maxMessages);
            
            for (let i = messages.length - 1; i >= startIndex; i--) {
                const message = messages[i];
                const age = Date.now() - message.time;
                const alpha = Math.max(0.4, 1 - (age / CONFIG.messageLifetime));
                
                // Message background
                const textWidth = ctx.measureText(message.text).width;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(canvasWidth - textWidth - 16, y - 2, textWidth + 12, 16);
                
                // Message text
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ddd';
                ctx.fillText(message.text, canvasWidth - 8, y);
                ctx.globalAlpha = 1;
                
                y -= 16;
            }
            
            ctx.restore();
        },
        
        gatherComponents(playerEid) {
            return {
                health: Game.ECS.getComponent(playerEid, 'health'),
                stats: Game.ECS.getComponent(playerEid, 'stats'),
                inventory: Game.ECS.getComponent(playerEid, 'inventory'),
                progress: Game.ECS.getComponent(playerEid, 'progress'),
                status: Game.ECS.getComponent(playerEid, 'status')
            };
        },
        
        // Configuration
        updateConfig(newConfig) {
            Object.assign(CONFIG, newConfig);
        },
        
        setColorScheme(newColors) {
            Object.assign(COLORS, newColors);
        },
        
        getBounds(canvasWidth, canvasHeight) {
            return {
                x: 0,
                y: canvasHeight - CONFIG.height,
                width: canvasWidth,
                height: CONFIG.height
            };
        },
        
        containsPoint(x, y, canvasWidth, canvasHeight) {
            const bounds = this.getBounds(canvasWidth, canvasHeight);
            return x >= bounds.x && x < bounds.x + bounds.width &&
                   y >= bounds.y && y < bounds.y + bounds.height;
        },
        
        // Debug helper
        toggleZoneDebug() {
            // You can call this to visualize zone boundaries during development
            console.log('Zone boundaries can be toggled in the render method');
        }
    };
})();
