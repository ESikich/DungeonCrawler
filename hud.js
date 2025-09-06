/** =========================
 *  HUD Module - Fixed Layout Version
 *  ========================= */

Game.HUD = (function() {
    'use strict';
    
    // HUD Configuration
    const CONFIG = {
        height: 120,
        margin: 12,
        barHeight: 14,
        healthBarWidth: 160,
        xpBarWidth: 140,
        maxMessages: 3,
        messageLifetime: 5000,
        messageLineHeight: 14,
        rowSpacing: 24  // Space between rows
    };
    
    // Color palette
    const COLORS = {
        background: 'rgba(16,16,32,0.95)',
        border: '#444',
        healthBg: '#400',
        healthGood: '#4a4',
        healthWarn: '#aa4',
        healthBad: '#a44',
        xpBg: '#222',
        xpBar: '#58a6ff',
        xpText: '#9cf',
        gold: '#ffcc00',
        stats: '#ccc',
        statusEffects: '#88ff88',
        gameInfo: '#999',
        inventory: '#9cf',
        controls: '#666',
        debug: '#555',
        messages: '#ddd'
    };
    
    // Helper functions
    function drawBar(ctx, x, y, width, height, fillPercent, bgColor, fillColor, borderColor = '#888') {
        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        
        // Fill
        if (fillPercent > 0) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, width * fillPercent, height);
        }
        
        // Border
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(x, y, width, height);
    }
    
    function getHealthColor(hp, maxHp) {
        const ratio = hp / maxHp;
        if (ratio > 0.6) return COLORS.healthGood;
        if (ratio > 0.3) return COLORS.healthWarn;
        return COLORS.healthBad;
    }
    
    function rightAlignText(ctx, text, rightX, y, color = 'white') {
        const oldFillStyle = ctx.fillStyle;
        const oldTextAlign = ctx.textAlign;
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(text, rightX, y);
        ctx.fillStyle = oldFillStyle;
        ctx.textAlign = oldTextAlign;
    }
    
    function centerText(ctx, text, centerX, y, color = 'white') {
        const oldFillStyle = ctx.fillStyle;
        const oldTextAlign = ctx.textAlign;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, centerX, y);
        ctx.fillStyle = oldFillStyle;
        ctx.textAlign = oldTextAlign;
    }
    
    // HUD Components
    const Components = {
        renderBackground(ctx, canvasWidth, canvasHeight) {
            const hudY = canvasHeight - CONFIG.height;
            
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, hudY, canvasWidth, CONFIG.height);
            ctx.strokeStyle = COLORS.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, hudY, canvasWidth, CONFIG.height);
            
            return hudY;
        },
        
        renderTopRow(ctx, canvasWidth, y, hp, prog, gold) {
            // Health section (left)
            ctx.font = '16px monospace';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.fillText(`HP: ${hp.hp}/${hp.maxHp}`, CONFIG.margin, y + 16);
            
            // Health bar positioned right after text
            const healthTextWidth = ctx.measureText(`HP: ${hp.hp}/${hp.maxHp}`).width;
            const healthBarX = CONFIG.margin + healthTextWidth + 10;
            const healthBarY = y + 4;
            const fillPercent = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
            const fillColor = getHealthColor(hp.hp, hp.maxHp);
            
            drawBar(ctx, healthBarX, healthBarY, CONFIG.healthBarWidth, CONFIG.barHeight, fillPercent, COLORS.healthBg, fillColor);
            
            // XP section (center-left)
            if (prog) {
                const xpStartX = healthBarX + CONFIG.healthBarWidth + 30;
                
                ctx.font = '14px monospace';
                ctx.fillStyle = COLORS.xpText;
                ctx.textAlign = 'left';
                ctx.fillText(`LVL ${prog.level}`, xpStartX, y + 14);
                
                const xpTextWidth = ctx.measureText(`LVL ${prog.level}`).width;
                const xpBarX = xpStartX + xpTextWidth + 8;
                const xpBarY = y + 4;
                const xpFillPercent = Math.min(1, prog.xp / Math.max(1, prog.next));
                
                drawBar(ctx, xpBarX, xpBarY, CONFIG.xpBarWidth, 12, xpFillPercent, COLORS.xpBg, COLORS.xpBar, '#666');
                
                // XP text overlay
                ctx.font = '11px monospace';
                ctx.fillStyle = COLORS.xpText;
                ctx.textAlign = 'left';
                ctx.fillText(`${prog.xp}/${prog.next}`, xpBarX + 4, xpBarY + 9);
            }
            
            // Gold (right aligned)
            ctx.font = '16px monospace';
            rightAlignText(ctx, `Gold: ${gold}`, canvasWidth - CONFIG.margin, y + 16, COLORS.gold);
        },
        
        renderMiddleRow(ctx, canvasWidth, y, stats, statusEffects) {
            if (!stats) return;
            
            ctx.font = '14px monospace';
            ctx.textAlign = 'left';
            
            // Base stats (left side)
            const statText = `STR:${stats.strength}  AGI:${stats.agility}  ACC:${stats.accuracy}  EVA:${stats.evasion}`;
            ctx.fillStyle = COLORS.stats;
            ctx.fillText(statText, CONFIG.margin, y);
            
            // Status effects (right side)
            if (statusEffects) {
                let statusText = '';
                if (statusEffects.strengthBoost > 0) statusText += `[STR+${statusEffects.strengthBoost}] `;
                if (statusEffects.speedBoost > 0) statusText += `[SPD+${statusEffects.speedBoost}] `;
                if (statusEffects.lightBoost > 0) statusText += `[VIS+${statusEffects.lightBoost}] `;
                
                if (statusText.trim()) {
                    rightAlignText(ctx, statusText.trim(), canvasWidth - CONFIG.margin, y, COLORS.statusEffects);
                }
            }
        },
        
        renderBottomRow(ctx, canvasWidth, y, gameState, prog, inv) {
            ctx.font = '12px monospace';
            ctx.textAlign = 'left';
            
            // Left: Game info
            const gameInfoText = `Turn: ${gameState.turnCount}  Floor: ${gameState.floor}  Level: ${prog ? prog.level : 1}`;
            ctx.fillStyle = COLORS.gameInfo;
            ctx.fillText(gameInfoText, CONFIG.margin, y);
            
            // Center: Inventory
            if (inv) {
                const invText = `Inventory: ${inv.items.length}/${inv.capacity} (Press I)`;
                centerText(ctx, invText, canvasWidth / 2, y, COLORS.inventory);
            }
            
            // Right: Controls
            rightAlignText(ctx, 'R:Restart  ESC:Pause', canvasWidth - CONFIG.margin, y, COLORS.controls);
        },
        
        renderDebugRow(ctx, y, playerEid) {
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = COLORS.debug;
            
            const visibleCount = Game.ECS.getComponent(playerEid, 'vision')?.visible.size || 0;
            const debugText = `Entities: ${Game.ECS.getEntityCount()}  Visible: ${visibleCount}`;
            ctx.fillText(debugText, CONFIG.margin, y);
        }
    };
    
    // Public API
    return {
        // Configuration getters
        getHeight() { return CONFIG.height; },
        getMargin() { return CONFIG.margin; },
        
        // Main render function
        render(ctx, gameState, playerEid) {
            const components = this.gatherComponents(playerEid);
            if (!components.health) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            
            // Render background and get HUD Y position
            const hudY = Components.renderBackground(ctx, canvasWidth, canvasHeight);
            
            // Calculate row positions with proper spacing
            const topRowY = hudY + CONFIG.margin;
            const middleRowY = topRowY + CONFIG.rowSpacing;
            const bottomRowY = middleRowY + CONFIG.rowSpacing;
            const debugRowY = bottomRowY + 18;
            
            // Render each row
            Components.renderTopRow(ctx, canvasWidth, topRowY, components.health, components.progress, gameState.playerGold);
            Components.renderMiddleRow(ctx, canvasWidth, middleRowY, components.stats, components.status);
            Components.renderBottomRow(ctx, canvasWidth, bottomRowY, gameState, components.progress, components.inventory);
            Components.renderDebugRow(ctx, debugRowY, playerEid);
            
            // Reset text alignment
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        },
        
        // Render floating messages
        renderMessages(ctx, messages) {
            if (!messages || messages.length === 0) return;
            
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const hudY = canvasHeight - CONFIG.height;
            
            ctx.font = '12px monospace';
            ctx.textAlign = 'right';
            
            // Position messages above the debug row
            let y = hudY + CONFIG.height - CONFIG.margin - 24;
            const startIndex = Math.max(0, messages.length - CONFIG.maxMessages);
            
            for (let i = messages.length - 1; i >= startIndex; i--) {
                const message = messages[i];
                const age = Date.now() - message.time;
                const alpha = Math.max(0.3, 1 - (age / CONFIG.messageLifetime));
                
                ctx.globalAlpha = alpha;
                ctx.fillStyle = COLORS.messages;
                ctx.fillText(message.text, canvasWidth - CONFIG.margin, y);
                ctx.globalAlpha = 1;
                y -= CONFIG.messageLineHeight;
            }
            
            ctx.textAlign = 'left';
        },
        
        // Utility functions
        gatherComponents(playerEid) {
            return {
                health: Game.ECS.getComponent(playerEid, 'health'),
                stats: Game.ECS.getComponent(playerEid, 'stats'),
                inventory: Game.ECS.getComponent(playerEid, 'inventory'),
                progress: Game.ECS.getComponent(playerEid, 'progress'),
                status: Game.ECS.getComponent(playerEid, 'status')
            };
        },
        
        // Color customization
        setColorScheme(newColors) {
            Object.assign(COLORS, newColors);
        },
        
        getColorScheme() {
            return { ...COLORS };
        },
        
        // Layout customization
        updateConfig(newConfig) {
            Object.assign(CONFIG, newConfig);
        },
        
        getConfig() {
            return { ...CONFIG };
        },
        
        // Get HUD bounds for collision detection
        getBounds(canvasWidth, canvasHeight) {
            return {
                x: 0,
                y: canvasHeight - CONFIG.height,
                width: canvasWidth,
                height: CONFIG.height
            };
        },
        
        // Check if point is inside HUD area
        containsPoint(x, y, canvasWidth, canvasHeight) {
            const bounds = this.getBounds(canvasWidth, canvasHeight);
            return x >= bounds.x && x < bounds.x + bounds.width &&
                   y >= bounds.y && y < bounds.y + bounds.height;
        }
    };
})();
