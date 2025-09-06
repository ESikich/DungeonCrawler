/** =========================
 *  Game Systems Module
 *  ========================= */

Game.Systems = (function() {
    'use strict';
    
    return {
        // Movement System
        Movement: {
            process() {
                const events = Game.ECS.drainEvents();
                for (let i = 0; i < events.length; i++) {
                    if (events[i].type === 'move') {
                        this.handleMove(events[i].entityId, events[i].toX, events[i].toY);
                    }
                }
            },
            
            handleMove(eid, toX, toY) {
                const pos = Game.ECS.getComponent(eid, 'position');
                if (!pos) return;

                if (!inBounds(toX, toY)) { 
                    if (eid === Game.world.playerEid) addMessage("Can't go that way!"); 
                    return; 
                }
                if (!Game.world.dungeonGrid[toY][toX].walkable) return;

                const at = Game.ECS.getEntitiesAt(toX, toY);
                for (let i = 0; i < at.length; i++) {
                    const tid = at[i];
                    if (tid === eid) continue;
                    const blocker = Game.ECS.getComponent(tid, 'blocker');
                    if (blocker && !blocker.passable) {
                        const th = Game.ECS.getComponent(tid, 'health');
                        if (th && th.hp > 0) {
                            Game.Systems.Combat.handleAttack(eid, tid);
                            return;
                        }
                    }
                }

                pos.x = toX;
                pos.y = toY;

                if (eid === Game.world.playerEid) { 
                    pickupItemsAt(toX, toY);
                    const t = Game.world.dungeonGrid[toY][toX];
                    if (t && t.glyph === '>') Game.Systems.World.nextLevel();
                }
            }
        },
        
        // Combat System
        Combat: {
            handleAttack(attackerId, targetId) {
                const as = Game.ECS.getComponent(attackerId, 'stats');
                const th = Game.ECS.getComponent(targetId, 'health');
                const td = Game.ECS.getComponent(targetId, 'descriptor');
                const ad = Game.ECS.getComponent(attackerId, 'descriptor'); // Get attacker name
                if (!as || !th) return;
        
                const dmg = randInt(3, 8) + Math.floor(as.strength / 3);
                th.hp -= dmg;
        
                // Track stats
                if (attackerId === Game.world.playerEid) {
                    Game.state.playerAttackedThisTurn = true;
                    Game.stats.totalDamageDealt += dmg;
                    Game.stats.timesAttacked++;
                } else if (targetId === Game.world.playerEid) {
                    Game.stats.totalDamageTaken += dmg;
                }
        
                const targetName = td ? td.name : 'enemy';
                const attackerName = ad ? ad.name : 'attacker';
                addMessage('Dealt ' + dmg + ' damage to ' + targetName + '!');
        
                if (th.hp <= 0) {
                    addMessage(targetName + ' defeated!');
                    
                    if (targetId === Game.world.playerEid) {
                        // FIXED: Use attacker's name, not target's name
                        Game.stats.deathCause = 'Combat';
                        Game.stats.killedBy = attackerName; // This was the bug!
                        Game.stats.endTime = Date.now();
                        Game.state.gameOver = true;
                        Game.state.current = 'gameOver';
                        addMessage('You have died! Press R to restart.');
                    } else {
                        this.onKill(targetId, attackerId);
                    }
                }
            },
            
            onKill(victimId, killerId) {
                dropLoot(victimId);
                
                if (killerId !== Game.world.playerEid) { 
                    Game.ECS.destroyEntity(victimId); 
                    return; 
                }
                
                Game.stats.enemiesKilled++;
                
                const xv = Game.ECS.getComponent(victimId, 'xpValue');
                if (xv && typeof xv.xp === 'number') { 
                    Game.Systems.Progression.gainXP(xv.xp); 
                }
                Game.ECS.destroyEntity(victimId);
            },
            
            processEnemyAttacks() {
                const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (!ppos) return;
                const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (let i = 0; i < dirs.length; i++) {
                    const nx = ppos.x + dirs[i][0];
                    const ny = ppos.y + dirs[i][1];
                    if (!inBounds(nx, ny)) continue;

                    const ents = Game.ECS.getEntitiesAt(nx, ny);
                    for (let j = 0; j < ents.length; j++) {
                        const eid = ents[j];
                        if (eid === Game.world.playerEid) continue;

                        const hp = Game.ECS.getComponent(eid, 'health');
                        if (!hp || hp.hp <= 0) continue;

                        const ai = Game.ECS.getComponent(eid, 'ai');
                        if (ai && !(ai.active || Game.Systems.Vision.canSeePlayer(eid))) continue;

                        this.handleAttack(eid, Game.world.playerEid);
                    }
                }
            }
        },
        
        // AI System
        AI: {
            process() {
                const aiList = Game.ECS.getEntitiesWith(['ai', 'position', 'health']);
                const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
                for (let i = 0; i < aiList.length; i++) {
                    const eid = aiList[i];
                    const hp = Game.ECS.getComponent(eid, 'health');
                    if (!hp || hp.hp <= 0) continue;

                    const ai = Game.ECS.getComponent(eid, 'ai');
                    const pos = Game.ECS.getComponent(eid, 'position');

                    if (!ai.active) {
                        if (Game.Systems.Vision.canSeePlayer(eid)) {
                            ai.active = true;
                            ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
                        }
                        continue;
                    }

                    if (Game.Systems.Vision.canSeePlayer(eid)) {
                        ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
                    }

                    if (ai.lastPlayerPos) {
                        const tx = ai.lastPlayerPos.x, ty = ai.lastPlayerPos.y;
                        const dx = tx - pos.x, dy = ty - pos.y;
                        let mx = 0, my = 0;

                        if (Math.abs(dx) > Math.abs(dy)) mx = dx > 0 ? 1 : -1;
                        else if (dy !== 0)               my = dy > 0 ? 1 : -1;

                        if (mx !== 0 || my !== 0) {
                            Game.ECS.postEvent({type: 'move', entityId: eid, toX: pos.x + mx, toY: pos.y + my});
                        }
                    }
                }
            }
        },
        
        // Vision System
        Vision: {
            canSeePlayer(eid) {
                const mpos = Game.ECS.getComponent(eid, 'position');
                const v = Game.ECS.getComponent(eid, 'vision');
                const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (!mpos || !v || !ppos) return false;
                const dx = ppos.x - mpos.x, dy = ppos.y - mpos.y;
                if (dx * dx + dy * dy > v.radius * v.radius) return false;
                const canSee = this.hasLineOfSight(mpos.x, mpos.y, ppos.x, ppos.y);
                if (canSee) Game.stats.timesSeen++;
                return canSee;
            },

            update(eid) {
                const pos = Game.ECS.getComponent(eid, 'position');
                const v = Game.ECS.getComponent(eid, 'vision');
                if (!pos || !v) return;
                v.visible.clear();
                v.visible.add(pos.x + ',' + pos.y);
                v.seen.add(pos.x + ',' + pos.y);
                const r = v.radius;
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const tx = pos.x + dx, ty = pos.y + dy;
                        if (!inBounds(tx, ty) || dx * dx + dy * dy > r * r) continue;
                        if (this.hasLineOfSight(pos.x, pos.y, tx, ty)) {
                            v.visible.add(tx + ',' + ty);
                            v.seen.add(tx + ',' + ty);
                        }
                    }
                }
            },

            hasLineOfSight(x0, y0, x1, y1) {
                const pts = this.bresenhamLine(x0, y0, x1, y1);
                for (let i = 1; i < pts.length - 1; i++) {
                    const p = pts[i];
                    if (!inBounds(p.x, p.y)) return false;
                    if (Game.world.dungeonGrid[p.y][p.x].opaque) return false;
                }
                return true;
            },

            bresenhamLine(x0, y0, x1, y1) {
                const pts = [];
                const dx = Math.abs(x1 - x0);
                const dy = Math.abs(y1 - y0);
                const sx = x0 < x1 ? 1 : -1;
                const sy = y0 < y1 ? 1 : -1;
                let err = dx - dy;
                let x = x0, y = y0;
                
                while (true) {
                    pts.push({x: x, y: y});
                    if (x === x1 && y === y1) break;
                    const e2 = 2 * err;
                    if (e2 > -dy) { err -= dy; x += sx; }
                    if (e2 < dx) { err += dx; y += sy; }
                }
                return pts;
            }
        },
        
        // Progression System
        Progression: {
            gainXP(amount) {
                const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
                if (!prog) return;
                prog.xp += Math.max(0, amount | 0);
                Game.stats.totalXpGained += Math.max(0, amount | 0);
                addMessage('Gained ' + amount + ' XP.');
                while (prog.xp >= prog.next) {
                    prog.xp -= prog.next;
                    prog.level += 1;
                    prog.next = Math.floor(prog.next * 1.5) + 10;

                    const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
                    const st = Game.ECS.getComponent(Game.world.playerEid, 'stats');
                    if (hp) { hp.maxHp += 10; hp.hp = hp.maxHp; }
                    if (st) { st.strength += 1; st.accuracy += 1; if (prog.level % 2 === 0) st.agility += 1; }
                    addMessage('You are now level ' + prog.level + '! (+stats, HP restored)');
                    
                    Game.stats.highestLevel = Math.max(Game.stats.highestLevel, prog.level);
                }
            }
        },
        
        // Status Effects System
        StatusEffects: {
            update() {
                const st = Game.ECS.getComponent(Game.world.playerEid, 'status');
                const stats = Game.ECS.getComponent(Game.world.playerEid, 'stats');
                if (!st) return;
                
                if (st.lightBoost > 0) {
                    st.lightBoost--;
                    if (st.lightBoost === 0) {
                        const v = Game.ECS.getComponent(Game.world.playerEid, 'vision');
                        if (v) v.radius = v.baseRadius || v.radius;
                        addMessage('The bright light fades.');
                    }
                }
                if (st.speedBoost > 0) {
                    st.speedBoost--;
                    if (st.speedBoost === 0) {
                        addMessage('You return to normal speed.');
                    }
                }
                if (st.strengthBoost > 0) {
                    st.strengthBoost--;
                    if (st.strengthBoost === 0 && stats && st.strengthBonusAmount) {
                        stats.strength -= st.strengthBonusAmount;
                        addMessage('Your strength returns to normal.');
                        st.strengthBonusAmount = 0;
                    }
                }
            }
        },
        
        // World Management System
        World: {
            nextLevel() {
                Game.state.floor -= 1;
                Game.stats.floorsDescended++;
                Game.state.justDescended = true;

                const rem = [];
                Game.ECS.getAllEntities().forEach(function(eid) { 
                    if (eid !== Game.world.playerEid) rem.push(eid); 
                });
                for (let i = 0; i < rem.length; i++) Game.ECS.destroyEntity(rem[i]);

                generateDungeon();

                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                p.x = Math.min(Math.max(p.x, 0), Game.config.DUNGEON_WIDTH - 1);
                p.y = Math.min(Math.max(p.y, 0), Game.config.DUNGEON_HEIGHT - 1);
                Game.world.dungeonGrid[p.y][p.x] = Tile.floor();

                const oldV = Game.ECS.getComponent(Game.world.playerEid, 'vision');
                Game.ECS.addComponent(Game.world.playerEid, 'vision', { 
                    radius: oldV ? oldV.radius : 8, 
                    baseRadius: oldV ? (oldV.baseRadius || oldV.radius) : 8, 
                    visible: new Set(), 
                    seen: new Set() 
                });

                connectPlayerToDungeon(p.x, p.y);
                placeStairsFarthestFrom(p.x, p.y);

                spawnMonstersAvoiding(p.x, p.y);
                spawnItemsAvoiding(p.x, p.y);

                Game.Systems.Vision.update(Game.world.playerEid);
                addMessage('You descend to floor ' + Game.state.floor + '...');
            }
        },
        
        // Effects System
        Effects: {
            createExplosion(x, y, radius) {
                Game.effects.explosions.push({
                    x: x,
                    y: y,
                    radius: radius,
                    startTime: Date.now(),
                    duration: 600,
                    maxRadius: radius + 0.5
                });
            },
            
            update() {
                const now = Date.now();
                Game.effects.explosions = Game.effects.explosions.filter(function(explosion) {
                    return (now - explosion.startTime) < explosion.duration;
                });
            }
        },
        
        // Turn Processing System
        TurnProcessor: {
            process() {
                Game.state.playerAttackedThisTurn = false;

                Game.Systems.Movement.process();
                Game.Systems.AI.process();
                Game.Systems.Movement.process();

                const seers = Game.ECS.getEntitiesWith(['vision', 'position']);
                for (let i = 0; i < seers.length; i++) {
                    Game.Systems.Vision.update(seers[i]);
                }

                if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
                    Game.Systems.Combat.processEnemyAttacks();
                }

                Game.Systems.StatusEffects.update();

                Game.state.justDescended = false;
                Game.state.turnCount++;
                
                const st = Game.ECS.getComponent(Game.world.playerEid, 'status');
                if (st && st.speedBoost > 0 && Game.state.turnCount % 2 === 0) {
                    return true; // Extra action
                }
                return false;
            }
        }
    };
})();

// Backward compatibility functions
function processTurn() { return Game.Systems.TurnProcessor.process(); }
function updateVision(eid) { return Game.Systems.Vision.update(eid); }
function createExplosion(x, y, radius) { return Game.Systems.Effects.createExplosion(x, y, radius); }
function updateExplosions() { return Game.Systems.Effects.update(); }
