/** =========================
 *  HUD Module
 *  ========================= */

Game.HUD = (function() {
    'use strict';
    
    // HUD Configuration
    const CONFIG = {
        height: 100,
        margin: 16,
        barHeight: 12,
        barWidth: 180,
        maxMessages: 3,
        messageLifetime: 5000,
        messageLineHeight: 14
    };
    
    // Color palette
    const COLORS = {
        background: 'rgba(16,16,32,0.95)',
        border: '#444',
        
        // Health colors
        healthBg: '#2a0000',
        healthGood: '#00aa00',
        healthWarn: '#aaaa00',
        healthBad: '#aa0000',
        
        // XP colors
        xpBg: '#001122',
        xpBar: '#4488ff',
        
        // Text colors
        white: '#ffffff',
        gold: '#ffcc00',
        cyan: '#44ccff',
        gray: '#999999',
        green: '#88ff88',
        messages: '#dddddd'
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
        if (ratio > 0.6) return COLORS.healthGood;
        if (ratio > 0.3) return COLORS.healthWarn;
        return COLORS.healthBad;
    }
    
    // Public API
    return {
        getHeight() { return CONFIG.height; },
        
        render(ctx, gameState, playerEid) {
            const components = this.gatherComponents(playerEid);
            if (!components.health) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - CONFIG.height;
            
            // Clear and setup
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            // Background
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, hudY, canvasWidth, CONFIG.height);
            ctx.strokeStyle = COLORS.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, hudY, canvasWidth, CONFIG.height);
            
            // Layout positions
            const leftCol = CONFIG.margin;
            const centerCol = Math.floor(canvasWidth / 2);
            const rightCol = canvasWidth - CONFIG.margin;
            
            // Row 1: Health Bar and XP Bar (top)
            const row1Y = hudY + 20;
            this.renderHealthSection(ctx, leftCol, row1Y, components.health);
            this.renderXPSection(ctx, centerCol - 100, row1Y, components.progress);
            this.renderGoldSection(ctx, rightCol, row1Y, gameState.playerGold);
            
            // Row 2: Stats and Game Info (bottom)
            const row2Y = hudY + 55;
            this.renderStatsSection(ctx, leftCol, row2Y, components.stats, components.status);
            this.renderGameInfoSection(ctx, centerCol, row2Y, gameState, components.progress, components.inventory);
            
            // Row 3: Controls (very bottom)
            const row3Y = hudY + 80;
            this.renderControlsSection(ctx, rightCol, row3Y);
            
            ctx.restore();
        },
        
        renderHealthSection(ctx, x, y, hp) {
            // Health label and value
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = COLORS.white;
            ctx.fillText(`HP: ${hp.hp}/${hp.maxHp}`, x, y - 8);
            
            // Health bar
            const fillPercent = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
            const fillColor = getHealthColor(hp.hp, hp.maxHp);
            drawBar(ctx, x, y + 2, CONFIG.barWidth, CONFIG.barHeight, fillPercent, COLORS.healthBg, fillColor);
        },
        
        renderXPSection(ctx, x, y, prog) {
            if (!prog) return;
            
            // XP label and value
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = COLORS.cyan;
            ctx.fillText(`Level ${prog.level} - XP: ${prog.xp}/${prog.next}`, x, y - 8);
            
            // XP bar
            const fillPercent = Math.min(1, prog.xp / Math.max(1, prog.next));
            drawBar(ctx, x, y + 2, CONFIG.barWidth, CONFIG.barHeight, fillPercent, COLORS.xpBg, COLORS.xpBar);
        },
        
        renderGoldSection(ctx, rightX, y, gold) {
            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = COLORS.gold;
            ctx.textAlign = 'right';
            ctx.fillText(`💰 ${gold}`, rightX, y);
            ctx.textAlign = 'left';
        },
        
        renderStatsSection(ctx, x, y, stats, status) {
            if (!stats) return;
            
            // Base stats
            ctx.font = '13px monospace';
            ctx.fillStyle = COLORS.white;
            ctx.fillText(`STR: ${stats.strength}  AGI: ${stats.agility}  ACC: ${stats.accuracy}  EVA: ${stats.evasion}`, x, y);
            
            // Status effects (below stats)
            if (status) {
                let effects = [];
                if (status.strengthBoost > 0) effects.push(`💪 STR+${status.strengthBoost} (${status.strengthBoost}t)`);
                if (status.speedBoost > 0) effects.push(`⚡ SPD+${status.speedBoost} (${status.speedBoost}t)`);
                if (status.lightBoost > 0) effects.push(`👁️ VIS+${status.lightBoost} (${status.lightBoost}t)`);
                
                if (effects.length > 0) {
                    ctx.font = '11px monospace';
                    ctx.fillStyle = COLORS.green;
                    ctx.fillText(effects.join(' '), x, y + 15);
                }
            }
        },
        
        renderGameInfoSection(ctx, centerX, y, gameState, prog, inv) {
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            
            // Game info (centered)
            ctx.fillStyle = COLORS.gray;
            ctx.fillText(`Floor ${gameState.floor}  •  Turn ${gameState.turnCount}  •  Level ${prog ? prog.level : 1}`, centerX, y);
            
            // Inventory info (centered, below)
            if (inv) {
                ctx.fillStyle = COLORS.cyan;
                ctx.fillText(`Inventory: ${inv.items.length}/${inv.capacity} (Press I)`, centerX, y + 15);
            }
            
            ctx.textAlign = 'left';
        },
        
        renderControlsSection(ctx, rightX, y) {
            ctx.font = '11px monospace';
            ctx.fillStyle = COLORS.gray;
            ctx.textAlign = 'right';
            ctx.fillText('R: Restart  •  ESC: Pause  •  WASD: Move', rightX, y);
            ctx.textAlign = 'left';
        },
        
        renderMessages(ctx, messages) {
            if (!messages || messages.length === 0) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - CONFIG.height;
            
            ctx.save();
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            
            // Position messages above HUD
            let y = hudY - 10;
            const startIndex = Math.max(0, messages.length - CONFIG.maxMessages);
            
            for (let i = messages.length - 1; i >= startIndex; i--) {
                const message = messages[i];
                const age = Date.now() - message.time;
                const alpha = Math.max(0.4, 1 - (age / CONFIG.messageLifetime));
                
                // Message background for better readability
                const textWidth = ctx.measureText(message.text).width;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(canvasWidth - textWidth - 16, y - 8, textWidth + 12, 16);
                
                // Message text
                ctx.globalAlpha = alpha;
                ctx.fillStyle = COLORS.messages;
                ctx.fillText(message.text, canvasWidth - 8, y);
                ctx.globalAlpha = 1;
                
                y -= CONFIG.messageLineHeight;
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
        
        // Configuration methods
        setColorScheme(newColors) {
            Object.assign(COLORS, newColors);
        },
        
        updateConfig(newConfig) {
            Object.assign(CONFIG, newConfig);
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
        }
    };
})();
