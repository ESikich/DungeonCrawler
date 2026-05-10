/** =========================
 *  HUD Module - Readable Display Panel
 *  ========================= */

Game.HUD = (function() {
    'use strict';
    
    const CONFIG = {
        height: 156,
        padding: 20,
        columnGap: 22,

        bars: {
            height: 20
        },

        maxMessages: 4,
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
        info: '#88f',
        panelLine: 'rgba(120, 255, 170, 0.28)'
    };

    function getHudHeight(canvasHeight) {
        const dungeonHeight = Game.config && Game.config.DUNGEON_PIXEL_HEIGHT ? Game.config.DUNGEON_PIXEL_HEIGHT : 0;
        const availableHeight = dungeonHeight > 0 ? canvasHeight - dungeonHeight : 0;
        return Math.max(CONFIG.height, availableHeight);
    }

    function drawBar(ctx, x, y, width, height, fillPercent, bgColor, fillColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);

        if (fillPercent > 0) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, width * fillPercent, height);
        }

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
    }

    function drawLabel(ctx, label, value, x, y, valueColor) {
        ctx.font = '15px "Share Tech Mono", monospace';
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(label, x, y);

        ctx.font = '28px "Share Tech Mono", monospace';
        ctx.fillStyle = valueColor || COLORS.text;
        ctx.fillText(value, x, y + 16);
    }

    function fitText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;

        let fitted = text;
        while (fitted.length > 1 && ctx.measureText(fitted + '...').width > maxWidth) {
            fitted = fitted.slice(0, -1);
        }
        return fitted + '...';
    }

    function getHealthColor(hp, maxHp) {
        const ratio = hp / maxHp;
        if (ratio > 0.6) return COLORS.healthFill;
        if (ratio > 0.3) return COLORS.healthWarn;
        return COLORS.healthBad;
    }

    function getActiveEffects(status) {
        if (!status) return [];

        const effects = [];
        if (status.strengthBoost > 0) effects.push(`STR +${status.strengthBonusAmount || status.strengthBoost} (${status.strengthBoost}t)`);
        if (status.speedBoost > 0) effects.push(`SPD (${status.speedBoost}t)`);
        if (status.lightBoost > 0) effects.push(`VIS (${status.lightBoost}t)`);
        if (status.accuracyBoost > 0) effects.push(`ACC +${status.accuracyBonusAmount || '?'} (${status.accuracyBoost}t)`);
        if (status.evasionBoost > 0) effects.push(`EVA +${status.evasionBonusAmount || status.agilityBonusAmount || '?'} (${status.evasionBoost}t)`);
        if (status.clarityBoost > 0) effects.push(`CLARITY (${status.clarityBoost}t)`);
        if (status.damageReductionBoost > 0) effects.push(`WARD (${status.damageReductionBoost}t)`);
        if (status.regenBoost > 0) effects.push(`REGEN (${status.regenBoost}t)`);
        if (status.tempMaxHpBoost > 0) effects.push(`MAX HP (${status.tempMaxHpBoost}t)`);
        if (status.glassFuryBoost > 0) effects.push(`FURY (${status.glassFuryBoost}t)`);
        if (status.wardingBoost > 0) effects.push(`WARDING (${status.wardingBoost}t)`);
        if (status.poisoned > 0) effects.push(`POISON (${status.poisoned}t)`);
        if (status.bleeding > 0) effects.push(`BLEED (${status.bleeding}t)`);
        if (status.silenced > 0) effects.push(`SILENCE (${status.silenced}t)`);
        return effects;
    }

    const Sections = {
        renderMeters(ctx, x, y, width, components) {
            const hp = components.health;
            if (!hp) return;
            const meterGap = 18;
            const meterWidth = Math.floor((width - meterGap) / 2);
            const xpX = x + meterWidth + meterGap;

            ctx.font = '16px "Share Tech Mono", monospace';
            ctx.fillStyle = COLORS.textDim;
            ctx.fillText('HEALTH', x, y);

            ctx.font = '28px "Share Tech Mono", monospace';
            ctx.fillStyle = getHealthColor(hp.hp, hp.maxHp);
            ctx.fillText(`${hp.hp}/${hp.maxHp}`, x, y + 18);

            const barY = y + 58;
            const fillPercent = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
            const fillColor = getHealthColor(hp.hp, hp.maxHp);
            drawBar(ctx, x, barY, meterWidth, CONFIG.bars.height, fillPercent, COLORS.healthBg, fillColor);

            const prog = components.progress;
            if (prog) {
                ctx.font = '16px "Share Tech Mono", monospace';
                ctx.fillStyle = COLORS.textDim;
                ctx.fillText(`LEVEL ${prog.level}`, xpX, y);

                ctx.font = '28px "Share Tech Mono", monospace';
                ctx.fillStyle = COLORS.info;
                ctx.fillText(`XP ${prog.xp}/${prog.next}`, xpX, y + 18);

                const xpFillPercent = Math.min(1, prog.xp / Math.max(1, prog.next));
                drawBar(ctx, xpX, barY, meterWidth, CONFIG.bars.height, xpFillPercent, COLORS.xpBg, COLORS.xpFill);
            }
        },

        renderStatus(ctx, x, y, width, components) {
            const effects = getActiveEffects(components.status);
            if (effects.length === 0) return 0;

            const statusText = effects.slice(0, 2).join('  ');

            ctx.font = '16px "Share Tech Mono", monospace';
            ctx.fillStyle = COLORS.status;
            ctx.fillText('STATUS', x, y);

            ctx.font = '22px "Share Tech Mono", monospace';
            ctx.fillStyle = COLORS.status;
            ctx.fillText(fitText(ctx, statusText, width), x, y + 30);
            return 56;
        },

        renderControls(ctx, x, y, width) {
            ctx.font = '20px "Share Tech Mono", monospace';
            ctx.fillStyle = COLORS.textDim;
            ctx.fillText('WASD MOVE', x, y);
            ctx.fillText('I INVENTORY', x + width * 0.34, y);
            ctx.fillText('ESC MENU', x + width * 0.68, y);
        },

        renderUpdates(ctx, x, y, width, messages, bottomY) {
            ctx.font = '18px "Share Tech Mono", monospace';
            ctx.fillStyle = COLORS.textDim;
            ctx.fillText('UPDATES', x, y);

            ctx.font = '18px "Share Tech Mono", monospace';
            ctx.fillStyle = '#ddd';

            if (!messages || messages.length === 0) {
                ctx.fillStyle = COLORS.textDim;
                ctx.fillText('No recent updates', x, y + 32);
                return;
            }

            const lineHeight = 22;
            const maxLines = Math.max(1, Math.floor((bottomY - (y + 30)) / lineHeight));
            const messagesToShow = Math.min(CONFIG.maxMessages, maxLines);
            const startIndex = Math.max(0, messages.length - messagesToShow);
            let lineY = y + 30;
            for (let i = startIndex; i < messages.length; i++) {
                const message = messages[i];
                const age = Date.now() - message.time;
                const alpha = Math.max(0.45, 1 - (age / CONFIG.messageLifetime));

                ctx.globalAlpha = alpha;
                ctx.fillStyle = i === messages.length - 1 ? '#fff' : '#bbb';
                ctx.fillText(fitText(ctx, message.text, width), x, lineY);
                ctx.globalAlpha = 1;
                lineY += lineHeight;
            }
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
            const hudHeight = getHudHeight(canvasHeight);
            const hudY = canvasHeight - hudHeight;
            
            // Setup
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, hudY, canvasWidth, hudHeight);
            ctx.strokeStyle = COLORS.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, hudY, canvasWidth, hudHeight);

            ctx.strokeStyle = COLORS.panelLine;
            ctx.beginPath();
            ctx.moveTo(CONFIG.padding, hudY + 1);
            ctx.lineTo(canvasWidth - CONFIG.padding, hudY + 1);
            ctx.stroke();

            const contentWidth = canvasWidth - CONFIG.padding * 2;
            const gap = CONFIG.columnGap;
            const meterWidth = Math.floor(contentWidth * 0.34);
            const infoWidth = contentWidth - meterWidth - gap;
            const meterX = CONFIG.padding;
            const infoX = meterX + meterWidth + gap;
            const contentY = hudY + CONFIG.padding;
            const controlsY = hudY + hudHeight - 26;

            if (false) { // Set to true to see zone boundaries
                ctx.strokeStyle = '#f00';
                ctx.strokeRect(meterX, contentY, meterWidth, hudHeight - CONFIG.padding * 2);
                ctx.strokeStyle = '#0f0';
                ctx.strokeRect(infoX, contentY, infoWidth, hudHeight - CONFIG.padding * 2);
            }

            ctx.strokeStyle = COLORS.panelLine;
            ctx.beginPath();
            ctx.moveTo(infoX - gap / 2, contentY + 4);
            ctx.lineTo(infoX - gap / 2, controlsY - 10);
            ctx.moveTo(CONFIG.padding, controlsY - 12);
            ctx.lineTo(canvasWidth - CONFIG.padding, controlsY - 12);
            ctx.stroke();

            Sections.renderMeters(ctx, meterX, contentY, meterWidth - 8, components);
            const statusHeight = Sections.renderStatus(ctx, infoX, contentY, infoWidth, components);
            const updatesY = contentY + statusHeight;
            Sections.renderUpdates(ctx, infoX, updatesY, infoWidth, Game.world.messages, controlsY - 16);
            Sections.renderControls(ctx, CONFIG.padding, controlsY, contentWidth);

            if (components.health && components.health.hp / components.health.maxHp < 0.3) {
                const pulse = 0.55 + Math.sin(Date.now() * 0.004) * 0.25;
                const healthMeterWidth = Math.floor((meterWidth - 8 - 18) / 2);
                const barY = contentY + 58;

                ctx.save();
                ctx.shadowColor = '#ff4444';
                ctx.shadowBlur = 4 * pulse;
                ctx.strokeStyle = `rgba(255, 68, 68, ${pulse * 0.5})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(meterX - 2, barY - 2, healthMeterWidth + 4, CONFIG.bars.height + 4);
                ctx.restore();
            }
            
            ctx.restore();
        },
        
        renderMessages(ctx, messages) {
            // Messages are rendered inside the HUD panel.
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
            const hudHeight = getHudHeight(canvasHeight);
            return {
                x: 0,
                y: canvasHeight - hudHeight,
                width: canvasWidth,
                height: hudHeight
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
