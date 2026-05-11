/** =========================
 *  Game Systems Module - Updated AI for Random Slime Movement
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
                if (eid === Game.world.playerEid && Game.world.overworldTransition) return;

                if (!inBounds(toX, toY)) { 
                    if (eid === Game.world.playerEid && Game.state.area === 'overworld') {
                        Game.Systems.World.changeOverworldSection(toX, toY);
                        return;
                    }
                    if (eid === Game.world.playerEid) addMessage("Can't go that way!"); 
                    return; 
                }
                if (!Game.world.dungeonGrid[toY][toX].walkable) return;
                const fromX = pos.x;
                const fromY = pos.y;

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
                    Game.Items.pickupAt(toX, toY);
                    const t = Game.world.dungeonGrid[toY][toX];
                    if (t && t.special === 'dungeonEntrance' && Game.state.area === 'overworld') Game.Systems.World.enterDungeon();
                    if (t && t.glyph === '>') Game.Systems.World.nextLevel();
                    if (t && t.glyph === '<') {
                        Game.Systems.World.previousLevel({
                            x: Math.sign(toX - fromX),
                            y: Math.sign(toY - fromY)
                        });
                    }
                }
            }
        },
        
        // Combat System
        Combat: {
            handleAttack(attackerId, targetId) {
                const as = Game.ECS.getComponent(attackerId, 'stats');
                const th = Game.ECS.getComponent(targetId, 'health');
                const td = Game.ECS.getComponent(targetId, 'descriptor');
                const ad = Game.ECS.getComponent(attackerId, 'descriptor');
                const tpos = Game.ECS.getComponent(targetId, 'position');
                if (!as || !th || !tpos) return;

                const dmg = randInt(3, 8) + Math.floor(as.strength / 3);
                const isCritical = Math.random() < 0.1;
                let finalDamage = isCritical ? Math.floor(dmg * 1.5) : dmg;

                if (targetId === Game.world.playerEid) {
                    const status = Game.ECS.getComponent(targetId, 'status');
                    if (status && status.wardingBoost > 0) {
                        addMessage('The ward turns the attack aside.');
                        return;
                    }
                    if (status && status.damageReductionBoost > 0) {
                        finalDamage = Math.max(1, Math.floor(finalDamage * (1 - (status.damageReductionPercent || 0.35))));
                    }
                }

                th.hp -= finalDamage;

                Game.Events.emit('combat.damage', {
                    attackerId,
                    targetId,
                    position: {x: tpos.x, y: tpos.y},
                    amount: finalDamage,
                    isCritical
                });

                // Track stats
                if (attackerId === Game.world.playerEid) {
                    Game.state.playerAttackedThisTurn = true;
                    Game.stats.totalDamageDealt += finalDamage;
                    Game.stats.timesAttacked++;
                } else if (targetId === Game.world.playerEid) {
                    Game.stats.totalDamageTaken += finalDamage;
                }

                const targetName = td ? td.name : 'enemy';
                const attackerName = ad ? ad.name : 'attacker';
                const critText = isCritical ? ' CRITICAL!' : '';
                addMessage(`Dealt ${finalDamage} damage to ${targetName}!${critText}`);

                if (th.hp <= 0) {
                    addMessage(targetName + ' defeated!');
                    
                    if (targetId === Game.world.playerEid) {
                        Game.stats.deathCause = 'Combat';
                        Game.stats.killedBy = attackerName;
                        Game.stats.endTime = Date.now();
                        Game.state.gameOver = true;
                        Game.state.current = 'gameOver';
                        addMessage('You have died! Press R to restart.');
                        Game.Events.emit('player.death', {
                            attackerId,
                            attackerName,
                            targetId
                        });
                    } else {
                        this.onKill(targetId, attackerId);
                    }
                }
            },
            
            onKill(victimId, killerId) {
                const vpos = Game.ECS.getComponent(victimId, 'position');

                Game.Items.dropLoot(victimId);
                
                if (killerId !== Game.world.playerEid) { 
                    Game.ECS.destroyEntity(victimId); 
                    return; 
                }
                
                Game.stats.enemiesKilled++;
                
                const xv = Game.ECS.getComponent(victimId, 'xpValue');
                if (xv && typeof xv.xp === 'number') { 
                    if (vpos) {
                        Game.Events.emit('progression.xpAwarded', {
                            entityId: victimId,
                            position: {x: vpos.x, y: vpos.y},
                            amount: xv.xp
                        });
                    }
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
        
        // AI System - UPDATED with random movement for slimes
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
                    const desc = Game.ECS.getComponent(eid, 'descriptor');

                    // Check if this is a slime
                    const isSlime = desc && desc.name && desc.name.toLowerCase().includes('slime');

                    // Handle slime behavior (random movement) - slimes are always active
                    if (isSlime) {
                        // Move randomly every turn with 70% probability
                        if (Math.random() < 0.7) { // 70% chance to move each turn
                            const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                            const randomDir = directions[Math.floor(Math.random() * directions.length)];
                            const newX = pos.x + randomDir[0];
                            const newY = pos.y + randomDir[1];
                            
                            Game.ECS.postEvent({
                                type: 'move', 
                                entityId: eid, 
                                toX: newX, 
                                toY: newY
                            });
                        }
                        // Skip the rest of the AI logic for slimes
                        continue;
                    }

                    // Handle other monsters (chase behavior) - need to see player first
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
                const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (!prog) return;

                const gained = Math.max(0, Math.floor((amount | 0) * (Game.state.xpMultiplier || 1)));
                prog.xp += gained;
                Game.stats.totalXpGained += gained;
                addMessage('Gained ' + gained + ' XP.');

                while (prog.xp >= prog.next) {
                    prog.xp -= prog.next;
                    prog.level += 1;
                    prog.next = Math.floor(prog.next * 1.5) + 10;

                    const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
                    const st = Game.ECS.getComponent(Game.world.playerEid, 'stats');
                    if (hp) {
                        const oldHp = hp.hp;
                        hp.maxHp += 10;
                        hp.hp = hp.maxHp;

                        if (ppos) {
                            Game.Events.emit('player.healed', {
                                entityId: Game.world.playerEid,
                                position: {x: ppos.x, y: ppos.y},
                                amount: hp.hp - oldHp,
                                source: 'levelUp'
                            });
                        }
                    }
                    if (st) { st.strength += 1; st.accuracy += 1; if (prog.level % 2 === 0) st.agility += 1; }
                    addMessage('You are now level ' + prog.level + '! (+stats, HP restored)');
                    
                    Game.stats.highestLevel = Math.max(Game.stats.highestLevel, prog.level);
                    Game.Events.emit('player.levelUp', {
                        entityId: Game.world.playerEid,
                        position: ppos ? {x: ppos.x, y: ppos.y} : null,
                        level: prog.level
                    });
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
                if (st.accuracyBoost > 0) {
                    st.accuracyBoost--;
                    if (st.accuracyBoost === 0 && stats && st.accuracyBonusAmount) {
                        stats.accuracy -= st.accuracyBonusAmount;
                        addMessage('Your focus softens.');
                        st.accuracyBonusAmount = 0;
                    }
                }
                if (st.evasionBoost > 0) {
                    st.evasionBoost--;
                    if (st.evasionBoost === 0 && stats) {
                        if (st.evasionBonusAmount) stats.evasion -= st.evasionBonusAmount;
                        if (st.agilityBonusAmount) stats.agility -= st.agilityBonusAmount;
                        addMessage('Your graceful edge fades.');
                        st.evasionBonusAmount = 0;
                        st.agilityBonusAmount = 0;
                    }
                }
                if (st.clarityBoost > 0) {
                    st.clarityBoost--;
                    if (st.clarityBoost === 0 && stats) {
                        if (st.clarityAccuracyAmount) stats.accuracy -= st.clarityAccuracyAmount;
                        if (st.clarityEvasionAmount) stats.evasion -= st.clarityEvasionAmount;
                        addMessage('Your clarity fades.');
                        st.clarityAccuracyAmount = 0;
                        st.clarityEvasionAmount = 0;
                    }
                }
                if (st.damageReductionBoost > 0) {
                    st.damageReductionBoost--;
                    if (st.damageReductionBoost === 0) {
                        addMessage('Your skin softens.');
                        st.damageReductionPercent = 0;
                    }
                }
                if (st.regenBoost > 0) {
                    const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
                    if (hp && hp.hp < hp.maxHp) {
                        const before = hp.hp;
                        hp.hp = Math.min(hp.maxHp, hp.hp + (st.regenAmount || 1));
                        Game.Events.emit('player.healed', {
                            entityId: Game.world.playerEid,
                            position: Game.ECS.getComponent(Game.world.playerEid, 'position'),
                            amount: hp.hp - before,
                            source: 'regen'
                        });
                    }
                    st.regenBoost--;
                    if (st.regenBoost === 0) {
                        addMessage('The mending warmth fades.');
                        st.regenAmount = 0;
                    }
                }
                if (st.tempMaxHpBoost > 0) {
                    st.tempMaxHpBoost--;
                    if (st.tempMaxHpBoost === 0) {
                        const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
                        if (hp && st.tempMaxHpAmount) {
                            hp.maxHp = Math.max(1, hp.maxHp - st.tempMaxHpAmount);
                            hp.hp = Math.min(hp.hp, hp.maxHp);
                            addMessage('The guardian force fades.');
                        }
                        st.tempMaxHpAmount = 0;
                    }
                }
                if (st.glassFuryBoost > 0) {
                    st.glassFuryBoost--;
                    if (st.glassFuryBoost === 0 && stats) {
                        if (st.glassFuryStrengthAmount) stats.strength -= st.glassFuryStrengthAmount;
                        if (st.glassFuryEvasionPenalty) stats.evasion += st.glassFuryEvasionPenalty;
                        addMessage('The glass fury shatters.');
                        st.glassFuryStrengthAmount = 0;
                        st.glassFuryEvasionPenalty = 0;
                    }
                }
                if (st.wardingBoost > 0) {
                    st.wardingBoost--;
                    if (st.wardingBoost === 0) {
                        addMessage('The ward fades.');
                    }
                }
            }
        },
        
        // World Management System
        World: {
            cloneValue(value) {
                if (value instanceof Set) return new Set(Array.from(value));
                if (Array.isArray(value)) return value.map(item => this.cloneValue(item));
                if (value && typeof value === 'object') {
                    const clone = {};
                    for (const key in value) clone[key] = this.cloneValue(value[key]);
                    return clone;
                }
                return value;
            },

            cloneGrid(grid) {
                return grid.map(row => row.map(tile => this.cloneValue(tile)));
            },

            cloneRooms(rooms) {
                return rooms.map(room => {
                    const restored = new Room(room.x, room.y, room.width, room.height, room.type);
                    restored.connected = !!room.connected;
                    restored.features = this.cloneValue(room.features || []);
                    return restored;
                });
            },

            snapshotNonPlayerEntities() {
                const snapshots = [];
                const componentTypes = Game.ECS.getComponentTypes();

                Game.ECS.getAllEntities().forEach(eid => {
                    if (eid === Game.world.playerEid) return;

                    const components = {};
                    for (let i = 0; i < componentTypes.length; i++) {
                        const type = componentTypes[i];
                        const component = Game.ECS.getComponent(eid, type);
                        if (component) components[type] = this.cloneValue(component);
                    }
                    snapshots.push({components});
                });

                return snapshots;
            },

            restoreNonPlayerEntities(snapshots) {
                if (!snapshots) return;

                for (let i = 0; i < snapshots.length; i++) {
                    const eid = Game.ECS.createEntity();
                    const components = snapshots[i].components || {};
                    for (const type in components) {
                        Game.ECS.addComponent(eid, type, this.cloneValue(components[type]));
                    }
                }
            },

            dungeonLevelKey(floor) {
                const dungeonId = Game.world.activeDungeonId || dungeonIdForSection(Game.world.overworldSection || {x: 0, y: 0});
                return dungeonId + ':' + floor;
            },

            getPlayerLevel() {
                const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
                return Math.max(1, prog && Number.isInteger(prog.level) ? prog.level : 1);
            },

            syncCurrentSectionDungeonEntrance() {
                const section = Game.world.overworldSection || {x: 0, y: 0};
                const id = dungeonIdForSection(section);
                const dungeon = Game.world.dungeons && Game.world.dungeons[id];

                if (dungeon && dungeon.entrance) {
                    Game.world.dungeonEntrancePos = {x: dungeon.entrance.x, y: dungeon.entrance.y};
                    return dungeon;
                }

                for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                    for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                        const tile = Game.world.dungeonGrid[y][x];
                        if (tile && tile.special === 'dungeonEntrance') {
                            Game.world.dungeonEntrancePos = {x: x, y: y};
                            return rememberDungeonEntrance(section, Game.world.dungeonEntrancePos);
                        }
                    }
                }

                Game.world.dungeonEntrancePos = { x: null, y: null };
                return null;
            },

            activateCurrentDungeon() {
                const section = Game.world.overworldSection || {x: 0, y: 0};
                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                const tile = p && inBounds(p.x, p.y) ? Game.world.dungeonGrid[p.y][p.x] : null;
                const entrance = tile && tile.special === 'dungeonEntrance'
                    ? {x: p.x, y: p.y}
                    : (Game.world.dungeonEntrancePos || {x: 12, y: 4});
                const dungeon = rememberDungeonEntrance(section, entrance);
                if (!Number.isInteger(dungeon.maxDepth)) {
                    dungeon.maxDepth = this.getPlayerLevel();
                }
                Game.world.activeDungeonId = dungeon.id;
                Game.world.dungeonEntrancePos = {x: dungeon.entrance.x, y: dungeon.entrance.y};
                return dungeon;
            },

            getActiveDungeon() {
                const id = Game.world.activeDungeonId;
                return id && Game.world.dungeons ? Game.world.dungeons[id] : null;
            },

            getActiveDungeonMaxDepth() {
                const activeDungeon = this.getActiveDungeon();
                if (activeDungeon && Number.isInteger(activeDungeon.maxDepth)) {
                    return Math.max(1, activeDungeon.maxDepth);
                }
                return 1;
            },

            canDescendFromCurrentFloor() {
                if (Game.state.area !== 'dungeon') return false;
                const targetFloor = Game.state.floor - 1;
                return Math.abs(targetFloor) <= this.getActiveDungeonMaxDepth();
            },

            findDownStairs() {
                for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                    for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                        if (Game.world.dungeonGrid[y][x].glyph === '>') {
                            return {x: x, y: y};
                        }
                    }
                }
                return null;
            },

            removeDownStairs() {
                for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                    for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                        if (Game.world.dungeonGrid[y][x].glyph === '>') {
                            Game.world.dungeonGrid[y][x] = Tile.floor();
                        }
                    }
                }
                Game.world.stairsPos = { x: null, y: null };
            },

            syncDownStairsForCurrentDepth() {
                if (!this.canDescendFromCurrentFloor()) {
                    this.removeDownStairs();
                    return;
                }

                const existing = this.findDownStairs();
                if (existing) {
                    Game.world.stairsPos = existing;
                    return;
                }

                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (p) placeStairsFarthestFrom(p.x, p.y);
            },

            saveCurrentDungeonLevel() {
                if (Game.state.area !== 'dungeon' || Game.state.floor >= 0) return;

                Game.world.dungeonLevels[this.dungeonLevelKey(Game.state.floor)] = {
                    grid: this.cloneGrid(Game.world.dungeonGrid),
                    rooms: this.cloneRooms(Game.world.rooms),
                    stairsPos: this.cloneValue(Game.world.stairsPos),
                    entities: this.snapshotNonPlayerEntities()
                };
            },

            saveCurrentOverworldSection() {
                if (Game.state.area !== 'overworld') return;

                const section = Game.world.overworldSection || {x: 0, y: 0};
                const key = overworldSectionKey(section);
                Game.world.overworldSections[key] = this.cloneGrid(Game.world.dungeonGrid);

                if (section.x === 0 && section.y === 0) {
                    Game.world.overworldGrid = Game.world.overworldSections[key];
                }
            },

            clearNonPlayerEntities() {
                const rem = [];
                Game.ECS.getAllEntities().forEach(function(eid) {
                    if (eid !== Game.world.playerEid) rem.push(eid);
                });
                for (let i = 0; i < rem.length; i++) Game.ECS.destroyEntity(rem[i]);
            },

            restoreDungeonLevel(floor) {
                const cached = Game.world.dungeonLevels[this.dungeonLevelKey(floor)];
                if (!cached) return false;

                this.clearNonPlayerEntities();
                Game.world.dungeonGrid = this.cloneGrid(cached.grid);
                Game.world.rooms = this.cloneRooms(cached.rooms);
                Game.world.stairsPos = this.cloneValue(cached.stairsPos);
                this.restoreNonPlayerEntities(cached.entities);
                this.syncDownStairsForCurrentDepth();
                return true;
            },

            loadOverworldSection(section) {
                const key = overworldSectionKey(section);
                const cached = Game.world.overworldSections[key];

                if (cached) {
                    Game.world.dungeonGrid = this.cloneGrid(cached);
                    Game.world.rooms = [new Room(1, 1, Game.config.DUNGEON_WIDTH - 2, Game.config.DUNGEON_HEIGHT - 2, 'overworld')];
                    Game.world.stairsPos = { x: null, y: null };
                    Game.world.overworldSection = {x: section.x, y: section.y};
                    pruneInvalidBridges();
                    pruneWideBridgeComponents();
                    cleanupTinyWater();
                    this.syncCurrentSectionDungeonEntrance();
                    return;
                }

                generateOverworldSection(section);
                Game.world.overworldSections[key] = this.cloneGrid(Game.world.dungeonGrid);
                this.syncCurrentSectionDungeonEntrance();
            },

            changeOverworldSection(toX, toY) {
                const oldGrid = this.cloneGrid(Game.world.dungeonGrid);
                this.saveCurrentOverworldSection();

                const section = Game.world.overworldSection || {x: 0, y: 0};
                const nextSection = {x: section.x, y: section.y};
                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                let direction = {x: 0, y: 0};

                if (toX < 0) {
                    nextSection.x -= 1;
                    direction = {x: -1, y: 0};
                    p.x = Game.config.DUNGEON_WIDTH - 1;
                    p.y = toY;
                } else if (toX >= Game.config.DUNGEON_WIDTH) {
                    nextSection.x += 1;
                    direction = {x: 1, y: 0};
                    p.x = 0;
                    p.y = toY;
                } else if (toY < 0) {
                    nextSection.y -= 1;
                    direction = {x: 0, y: -1};
                    p.x = toX;
                    p.y = Game.config.DUNGEON_HEIGHT - 1;
                } else if (toY >= Game.config.DUNGEON_HEIGHT) {
                    nextSection.y += 1;
                    direction = {x: 0, y: 1};
                    p.x = toX;
                    p.y = 0;
                }

                p.x = Math.min(Math.max(p.x, 0), Game.config.DUNGEON_WIDTH - 1);
                p.y = Math.min(Math.max(p.y, 0), Game.config.DUNGEON_HEIGHT - 1);

                this.loadOverworldSection(nextSection);

                if (!Game.world.dungeonGrid[p.y][p.x].walkable) {
                    Game.world.dungeonGrid[p.y][p.x] = Tile.grass();
                    this.saveCurrentOverworldSection();
                }

                Game.world.overworldTransition = {
                    fromGrid: oldGrid,
                    toGrid: this.cloneGrid(Game.world.dungeonGrid),
                    direction: direction,
                    startTime: Date.now(),
                    duration: 430
                };

                Game.Systems.Vision.update(Game.world.playerEid);
                addMessage('You travel to another part of the overworld.');
            },

            resetPlayerVision(radius) {
                const oldV = Game.ECS.getComponent(Game.world.playerEid, 'vision');
                const baseRadius = oldV ? (oldV.baseRadius || oldV.radius) : (radius || 8);
                Game.ECS.addComponent(Game.world.playerEid, 'vision', {
                    radius: radius || baseRadius,
                    baseRadius: baseRadius,
                    visible: new Set(),
                    seen: new Set()
                });
            },

            generateDungeonLevel(floor, keepPosition) {
                Game.state.floor = floor;
                Game.state.area = 'dungeon';
                generateDungeon();

                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (keepPosition) {
                    p.x = Math.min(Math.max(p.x, 0), Game.config.DUNGEON_WIDTH - 1);
                    p.y = Math.min(Math.max(p.y, 0), Game.config.DUNGEON_HEIGHT - 1);
                    Game.world.dungeonGrid[p.y][p.x] = Tile.floor();
                    connectPlayerToDungeon(p.x, p.y);
                } else {
                    const startRoom = Game.world.rooms[0];
                    p.x = startRoom.centerX();
                    p.y = startRoom.centerY();
                }

                placeUpStairsAt(p.x, p.y);
                if (this.canDescendFromCurrentFloor()) {
                    placeStairsFarthestFrom(p.x, p.y);
                } else {
                    Game.world.stairsPos = { x: null, y: null };
                }
                Game.Monsters.spawnAvoiding(p.x, p.y);
                Game.Items.spawnAvoiding(p.x, p.y);
            },

            setPlayerArrival(arrivalMode) {
                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                if (!p) return;

                if (arrivalMode === 'downStairs' && Game.world.stairsPos && Number.isInteger(Game.world.stairsPos.x)) {
                    p.x = Game.world.stairsPos.x;
                    p.y = Game.world.stairsPos.y;
                    return;
                }

                for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                    for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                        if (arrivalMode === 'upStairs' && Game.world.dungeonGrid[y][x].glyph === '<') {
                            p.x = x;
                            p.y = y;
                            return;
                        }
                    }
                }
            },

            goToDungeonFloor(targetFloor, arrivalMode, message, keepPosition) {
                this.saveCurrentDungeonLevel();
                this.saveCurrentOverworldSection();
                this.clearNonPlayerEntities();
                Game.state.floor = targetFloor;
                Game.state.area = 'dungeon';
                Game.state.justDescended = true;

                if (this.restoreDungeonLevel(targetFloor)) {
                    this.setPlayerArrival(arrivalMode);
                    this.syncDownStairsForCurrentDepth();
                } else {
                    this.generateDungeonLevel(targetFloor, !!keepPosition);
                }

                const oldVision = Game.ECS.getComponent(Game.world.playerEid, 'vision');
                this.resetPlayerVision(oldVision ? oldVision.baseRadius : 2);
                Game.Systems.Vision.update(Game.world.playerEid);
                addMessage(message);
            },

            enterDungeon() {
                const dungeon = this.activateCurrentDungeon();
                Game.Events.emit('world.enterDungeon', {
                    floor: Game.state.floor,
                    playerId: Game.world.playerEid,
                    dungeonId: dungeon.id,
                    maxDepth: dungeon.maxDepth
                });

                Game.world.overworldTransition = null;
                this.goToDungeonFloor(-1, 'upStairs', 'You enter the dungeon...');
            },

            exitDungeon(exitDirection) {
                Game.Events.emit('world.exitDungeon', {
                    floor: Game.state.floor,
                    playerId: Game.world.playerEid
                });

                this.saveCurrentDungeonLevel();
                this.clearNonPlayerEntities();
                Game.state.floor = 0;
                Game.state.area = 'overworld';
                Game.state.justDescended = true;
                Game.world.overworldTransition = null;

                const activeDungeon = this.getActiveDungeon();
                const returnSection = activeDungeon && activeDungeon.section ? activeDungeon.section : {x: 0, y: 0};

                if (!Game.world.overworldGrid || Game.world.overworldGrid.length === 0) {
                    generateOverworld();
                } else {
                    this.loadOverworldSection(returnSection);
                }

                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                const entrance = activeDungeon && activeDungeon.entrance ? activeDungeon.entrance : (Game.world.dungeonEntrancePos || {x: 12, y: 4});
                const dir = exitDirection && (exitDirection.x !== 0 || exitDirection.y !== 0)
                    ? exitDirection
                    : {x: 0, y: 1};
                const ret = {
                    x: Math.min(Math.max(entrance.x + dir.x, 0), Game.config.DUNGEON_WIDTH - 1),
                    y: Math.min(Math.max(entrance.y + dir.y, 0), Game.config.DUNGEON_HEIGHT - 1)
                };
                if (Game.world.dungeonGrid[ret.y][ret.x] && !Game.world.dungeonGrid[ret.y][ret.x].walkable) {
                    Game.world.dungeonGrid[ret.y][ret.x] = Tile.grass();
                    this.saveCurrentOverworldSection();
                }
                p.x = ret.x;
                p.y = ret.y;

                const oldVision = Game.ECS.getComponent(Game.world.playerEid, 'vision');
                const overworldRadius = Math.max(8, oldVision ? oldVision.baseRadius : 8);
                this.resetPlayerVision(overworldRadius);
                Game.Systems.Vision.update(Game.world.playerEid);
                Game.world.activeDungeonId = null;
                addMessage('You climb back into the overworld.');
            },

            previousLevel(exitDirection) {
                if (Game.state.floor === -1) {
                    this.exitDungeon(exitDirection);
                    return;
                }

                const targetFloor = Game.state.floor + 1;
                this.goToDungeonFloor(targetFloor, 'downStairs', 'You climb up to floor ' + targetFloor + '...');
            },

            nextLevel() {
                const targetFloor = Game.state.floor - 1;
                if (!this.canDescendFromCurrentFloor()) {
                    addMessage('This dungeon goes no deeper.');
                    return;
                }

                Game.Events.emit('world.descendStart', {
                    floor: Game.state.floor,
                    playerId: Game.world.playerEid
                });

                Game.stats.floorsDescended++;

                this.goToDungeonFloor(targetFloor, 'upStairs', 'You descend to floor ' + targetFloor + '...', true);
                const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
                Game.Events.emit('world.descended', {
                    floor: Game.state.floor,
                    playerId: Game.world.playerEid,
                    position: {x: p.x, y: p.y}
                });
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

                // Process player movement
                Game.Systems.Movement.process();
                
                // Check if player has speed boost and track action count
                const st = Game.ECS.getComponent(Game.world.playerEid, 'status');
                const hasSpeedBoost = st && st.speedBoost > 0;
                
                // Initialize speed action counter if it doesn't exist
                if (!Game.state.speedActionCount) {
                    Game.state.speedActionCount = 0;
                }
                
                if (hasSpeedBoost) {
                    Game.state.speedActionCount++;
                    
                    // Update vision after player action
                    const seers = Game.ECS.getEntitiesWith(['vision', 'position']);
                    for (let i = 0; i < seers.length; i++) {
                        Game.Systems.Vision.update(seers[i]);
                    }
                    
                    // After player's second action, process enemies normally
                    if (Game.state.speedActionCount >= 2) {
                        Game.state.speedActionCount = 0; // Reset counter
                        
                        // Now process AI and enemies
                        Game.Monsters.processAI();
                        Game.Systems.Movement.process();
                        
                        // Update vision again after AI movement
                        for (let i = 0; i < seers.length; i++) {
                            Game.Systems.Vision.update(seers[i]);
                        }
                        
                        // Enemy attacks
                        if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
                            Game.Systems.Combat.processEnemyAttacks();
                        }
                        
                        Game.Systems.StatusEffects.update();
                        Game.state.justDescended = false;
                        Game.state.turnCount++;
                        
                        return false; // End of full speed turn
                    } else {
                        // Player gets another action, don't process enemies yet
                        return true;
                    }
                } else {
                    // No speed boost - normal turn processing
                    Game.state.speedActionCount = 0; // Reset counter when not speedy
                    
                    Game.Monsters.processAI();
                    Game.Systems.Movement.process();

                    // Update vision for all entities
                    const seers = Game.ECS.getEntitiesWith(['vision', 'position']);
                    for (let i = 0; i < seers.length; i++) {
                        Game.Systems.Vision.update(seers[i]);
                    }

                    // Enemy attacks
                    if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
                        Game.Systems.Combat.processEnemyAttacks();
                    }

                    Game.Systems.StatusEffects.update();
                    Game.state.justDescended = false;
                    Game.state.turnCount++;
                    
                    return false;
                }
            }
        }
    };
})();

// Backward compatibility functions
function processTurn() { return Game.Systems.TurnProcessor.process(); }
function updateVision(eid) { return Game.Systems.Vision.update(eid); }
function createExplosion(x, y, radius) { return Game.Systems.Effects.createExplosion(x, y, radius); }
function updateExplosions() { return Game.Systems.Effects.update(); }
