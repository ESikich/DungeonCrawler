/** =========================
 *  Visual Effects System - Fixed for Turn-Based Game
 *  Independent animation loop that runs continuously at 60fps
 *  ========================= */

Game.VisualEffects = (function() {
    'use strict';
    
    // Private state
    let damageNumbers = [];
    let screenShakeData = null;
    let colorPulses = new Map();
    let animationFrameId = null;
    let isRunning = false;
    
    // Independent animation loop - runs at 60fps regardless of game turns
    function animationLoop() {
        if (!isRunning) return;
        
        updateEffects();
        animationFrameId = requestAnimationFrame(animationLoop);
    }
    
    function updateEffects() {
        updateScreenShake();
        updateDamageNumbers();
        // Color pulses update automatically based on Date.now()
    }
    
    function updateScreenShake() {
        if (!screenShakeData) return;
        
        const canvas = Game.Renderer.getCanvas();
        if (!canvas) return;
        
        const elapsed = Date.now() - screenShakeData.startTime;
        const progress = elapsed / screenShakeData.duration;
        
        if (progress >= 1) {
            canvas.style.transform = 'translate(0px, 0px)';
            screenShakeData = null;
            return;
        }
        
        const currentIntensity = screenShakeData.intensity * Math.pow(1 - progress, 2);
        const offsetX = (Math.random() - 0.5) * currentIntensity;
        const offsetY = (Math.random() - 0.5) * currentIntensity;
        
        canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
    
    function updateDamageNumbers() {
        for (let i = damageNumbers.length - 1; i >= 0; i--) {
            const num = damageNumbers[i];
            
            // Physics - runs every frame
            num.y += num.vy;
            num.vy += 0.05; // gravity
            num.x += (Math.random() - 0.5) * 0.5; // drift
            num.life--;
            
            if (num.life <= 0) {
                damageNumbers.splice(i, 1);
            }
        }
    }
    
    return {
        // Start the independent animation loop
        start() {
            if (isRunning) return;
            isRunning = true;
            animationLoop();
        },
        
        // Stop the animation loop
        stop() {
            isRunning = false;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        },
        
        // Screen Shake Effect
        ScreenShake: {
            apply(intensity = 8, duration = 400) {
                screenShakeData = {
                    intensity: intensity,
                    duration: duration,
                    startTime: Date.now()
                };
            },
            
            isActive() {
                return screenShakeData !== null;
            }
        },
        
        // Floating Damage Numbers
        DamageNumbers: {
            add(x, y, damage, type = 'damage') {
                const colors = {
                    damage: '#ff4444',
                    heal: '#44ff44',
                    xp: '#44aaff',
                    gold: '#ffaa00',
                    critical: '#ff8844'
                };
                
                const screenX = x * Game.config.TILE_SIZE + Game.config.TILE_SIZE / 2;
                const screenY = y * Game.config.TILE_SIZE + Game.config.TILE_SIZE / 2;
                
                damageNumbers.push({
                    x: screenX + (Math.random() - 0.5) * 10,
                    y: screenY,
                    damage: damage,
                    color: colors[type] || colors.damage,
                    life: 120, // frames, not game turns
                    maxLife: 120,
                    vy: -2.0, // pixels per frame
                    type: type,
                    scale: type === 'critical' ? 1.5 : 1
                });
            },
            
            render(ctx) {
                ctx.save();
                
                for (const num of damageNumbers) {
                    const alpha = num.life / num.maxLife;
                    const scale = num.scale * (0.8 + alpha * 0.2);
                    
                    ctx.globalAlpha = alpha;
                    ctx.font = `${Math.floor(14 * scale)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Shadow for readability
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.fillText(num.damage.toString(), num.x + 1, num.y + 1);
                    
                    // Main text
                    ctx.fillStyle = num.color;
                    ctx.fillText(num.damage.toString(), num.x, num.y);
                }
                
                ctx.restore();
            },
            
            clear() {
                damageNumbers = [];
            }
        },
        
        // Color Pulsing - uses Date.now() so it's frame-independent
        ColorPulse: {
            add(entityId, color, speed = 0.003, intensity = 0.4, duration = null) {
                colorPulses.set(entityId, {
                    baseColor: parseColor(color),
                    speed: speed, // Much slower for turn-based game
                    intensity: intensity,
                    phase: Math.random() * Math.PI * 2,
                    startTime: Date.now(),
                    duration: duration // null = infinite
                });
            },
            
            remove(entityId) {
                colorPulses.delete(entityId);
            },
            
            getColor(entityId, fallbackColor) {
                const pulse = colorPulses.get(entityId);
                if (!pulse) return fallbackColor;
                
                // Check if pulse has expired
                if (pulse.duration && (Date.now() - pulse.startTime) > pulse.duration) {
                    this.remove(entityId);
                    return fallbackColor;
                }
                
                const time = Date.now() * pulse.speed;
                const pulseFactor = 0.7 + Math.sin(time + pulse.phase) * pulse.intensity;
                
                const pulsedColor = pulse.baseColor.map(c => 
                    Math.floor(Math.min(255, c * pulseFactor))
                );
                
                return `rgb(${pulsedColor.join(',')})`;
            },
            
            clear() {
                colorPulses.clear();
            }
        },
        
        // Enhanced Health Bar Rendering
        HealthBars: {
            renderEntityHealthBar(ctx, x, y, hp, options = {}) {
                const defaults = {
                    width: Game.config.TILE_SIZE - 4,
                    height: 4,
                    showBorder: true,
                    animated: true,
                    offsetY: -4
                };
                
                const opts = Object.assign(defaults, options);
                const barX = x + 2;
                const barY = y + opts.offsetY;
                
                const healthPercent = hp.hp / hp.maxHp;
                
                // Smooth color transition
                let barColor;
                if (healthPercent > 0.6) {
                    const greenIntensity = Math.floor(200 + (healthPercent - 0.6) * 137.5);
                    barColor = `rgb(${255 - greenIntensity}, ${greenIntensity}, 0)`;
                } else if (healthPercent > 0.3) {
                    const yellowToRed = (0.6 - healthPercent) / 0.3;
                    const red = Math.floor(255);
                    const green = Math.floor(255 * (1 - yellowToRed));
                    barColor = `rgb(${red}, ${green}, 0)`;
                } else {
                    barColor = '#ff4444';
                }
                
                // Background
                ctx.fillStyle = 'rgba(60, 0, 0, 0.8)';
                ctx.fillRect(barX, barY, opts.width, opts.height);
                
                // Health fill
                if (healthPercent > 0) {
                    ctx.fillStyle = barColor;
                    ctx.fillRect(barX, barY, opts.width * healthPercent, opts.height);
                    
                    // Low health warning pulse - uses Date.now()
                    if (healthPercent < 0.3 && opts.animated) {
                        const pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.5;
                        ctx.shadowColor = barColor;
                        ctx.shadowBlur = 3 * pulse;
                        ctx.fillRect(barX, barY, opts.width * healthPercent, opts.height);
                        ctx.shadowBlur = 0;
                    }
                }
                
                // Border
                if (opts.showBorder) {
                    ctx.strokeStyle = '#666';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(barX, barY, opts.width, opts.height);
                }
            }
        },
        
        // Render all visual effects
        render(ctx) {
            this.DamageNumbers.render(ctx);
        },
        
        // Clear all effects
        clear() {
            this.DamageNumbers.clear();
            this.ColorPulse.clear();
            screenShakeData = null;
        }
    };
})();

// Quick access functions
Game.VFX = {
    shake(intensity, duration) {
        Game.VisualEffects.ScreenShake.apply(intensity, duration);
    },
    
    damage(x, y, amount) {
        Game.VisualEffects.DamageNumbers.add(x, y, amount, 'damage');
    },
    
    heal(x, y, amount) {
        Game.VisualEffects.DamageNumbers.add(x, y, amount, 'heal');
    },
    
    xp(x, y, amount) {
        Game.VisualEffects.DamageNumbers.add(x, y, amount, 'xp');
    },
    
    gold(x, y, amount) {
        Game.VisualEffects.DamageNumbers.add(x, y, amount, 'gold');
    },
    
    critical(x, y, amount) {
        Game.VisualEffects.DamageNumbers.add(x, y, amount, 'critical');
    },
    
    pulse(entityId, color, speed, intensity, durationMs) {
        Game.VisualEffects.ColorPulse.add(entityId, color, speed, intensity, durationMs);
    },
    
    stopPulse(entityId) {
        Game.VisualEffects.ColorPulse.remove(entityId);
    }
};