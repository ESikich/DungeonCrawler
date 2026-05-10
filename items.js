/** =========================
 *  Item System - Modular Item Registry
 *  
 *  HOW TO ADD NEW ITEMS:
 *  1. Add to ItemRegistry below, OR
 *  2. Use helper functions + registerItem() for common patterns:
 *     
 *     // Healing potions
 *     registerItem('superHeal', ItemHelpers.healingPotion('Super Potion', 75, 'gold', 'epic'));
 *     
 *     // Temporary boosts
 *     registerItem('ultraSpeed', ItemHelpers.definePotion({
 *         name: 'Ultra Speed', color: 'white', rarity: 'epic',
 *         desc: 'Move faster for 20 turns.', effect: 'tempBoost',
 *         boostType: 'speed', bonus: 5, turns: 20
 *     }));
 *     
 *     // Permanent upgrades  
 *     registerItem('heartStone', ItemHelpers.permanentUpgrade('Heart Stone', 'health', 25, '♥', 'pink', 'epic'));
 *     
 *     // Explosives
 *     registerItem('nuke', ItemHelpers.explosive('Nuclear Bomb', 50, 3, 'yellow', 'epic'));
 *  
 *  3. For custom effects, add to ItemEffects object and reference in item definition
 *  ========================= */

// Item Effect Handlers - Add new effects here
const ItemEffects = {
    // Healing effects
    heal(item, playerEid) {
        const hp = Game.ECS.getComponent(playerEid, 'health');
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!hp) return false;
        
        const before = hp.hp;
        hp.hp = clamp(hp.hp + (item.amount || 0), 0, hp.maxHp);
        const healed = hp.hp - before;

        if (ppos && healed > 0) {
            Game.Events.emit('player.healed', {
                entityId: playerEid,
                position: {x: ppos.x, y: ppos.y},
                amount: healed,
                source: 'item'
            });
        }

        addMessage('You quaff the potion (+' + healed + ' HP).');
        Game.stats.potionsUsed++;
        return true;
    },

    // Temporary stat boosts
    tempBoost(item, playerEid) {
        const status = this.ensureStatus(playerEid);
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        const stats = Game.ECS.getComponent(playerEid, 'stats');
        const hp = Game.ECS.getComponent(playerEid, 'health');
        const turns = item.turns || 15;
        const bonus = item.bonus || 3;
        
        switch (item.boostType) {
            case 'speed':
                status.speedBoost = turns;
                addMessage('You feel much faster! (Extra action every other turn for ' + turns + ' turns)');
                if (ppos) {
                    Game.Events.emit('item.tempBoostApplied', {
                        entityId: playerEid,
                        position: {x: ppos.x, y: ppos.y},
                        boostType: item.boostType,
                        turns
                    });
                }
                break;
            case 'strength':
                if (stats) {
                    status.strengthBoost = turns;
                    status.strengthBonusAmount = bonus;
                    stats.strength += bonus;
                    addMessage('You feel stronger! (+' + bonus + ' STR for ' + turns + ' turns)');
                    if (ppos) {
                        Game.Events.emit('item.tempBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType,
                            turns
                        });
                    }
                }
                break;
            case 'accuracy':
                if (stats) {
                    status.accuracyBoost = turns;
                    status.accuracyBonusAmount = bonus;
                    stats.accuracy += bonus;
                    addMessage('Your focus sharpens! (+' + bonus + ' ACC for ' + turns + ' turns)');
                    this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                }
                break;
            case 'evasion':
                if (stats) {
                    const agilityBonus = item.agilityBonus || 0;
                    status.evasionBoost = turns;
                    status.evasionBonusAmount = bonus;
                    status.agilityBonusAmount = agilityBonus;
                    stats.evasion += bonus;
                    stats.agility += agilityBonus;
                    addMessage('You move with sudden grace! (+' + bonus + ' EVA for ' + turns + ' turns)');
                    this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                }
                break;
            case 'clarity':
                if (stats) {
                    status.clarityBoost = turns;
                    status.clarityAccuracyAmount = item.accuracyBonus || bonus;
                    status.clarityEvasionAmount = item.evasionBonus || bonus;
                    stats.accuracy += status.clarityAccuracyAmount;
                    stats.evasion += status.clarityEvasionAmount;
                    addMessage('Your senses clear! (+' + status.clarityAccuracyAmount + ' ACC, +' + status.clarityEvasionAmount + ' EVA for ' + turns + ' turns)');
                    this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                }
                break;
            case 'damageReduction':
                status.damageReductionBoost = turns;
                status.damageReductionPercent = item.reduction || 0.35;
                addMessage('Your skin hardens like iron! (damage reduced for ' + turns + ' turns)');
                this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                break;
            case 'regen':
                status.regenBoost = turns;
                status.regenAmount = item.regenAmount || bonus;
                addMessage('Mending warmth spreads through you. (healing over ' + turns + ' turns)');
                this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                break;
            case 'maxHealth':
                if (hp) {
                    status.tempMaxHpBoost = turns;
                    status.tempMaxHpAmount = bonus;
                    hp.maxHp += bonus;
                    hp.hp += bonus;
                    addMessage('A guardian force bolsters you! (+' + bonus + ' max HP for ' + turns + ' turns)');
                    this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                }
                break;
            case 'glassFury':
                if (stats) {
                    const evasionPenalty = item.evasionPenalty || 0;
                    status.glassFuryBoost = turns;
                    status.glassFuryStrengthAmount = bonus;
                    status.glassFuryEvasionPenalty = evasionPenalty;
                    stats.strength += bonus;
                    stats.evasion -= evasionPenalty;
                    addMessage('Fury floods your limbs! (+' + bonus + ' STR, -' + evasionPenalty + ' EVA for ' + turns + ' turns)');
                    this.emitTempBoost(playerEid, ppos, item.boostType, turns);
                }
                break;
            case 'light':
                const vision = Game.ECS.getComponent(playerEid, 'vision');
                if (vision) {
                    vision.radius = (vision.baseRadius || vision.radius) + bonus;
                    status.lightBoost = turns;
                    addMessage('A brilliant light surrounds you! (+' + bonus + ' vision for ' + turns + ' turns)');
                    if (ppos) {
                        Game.Events.emit('item.tempBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType,
                            turns
                        });
                    }
                }
                break;
        }
        
        // Track usage based on item kind
        if (item.kind === 'scroll') {
            Game.stats.scrollsUsed++;
        } else {
            Game.stats.potionsUsed++;
        }
        
        return true;
    },

    utility(item, playerEid) {
        switch (item.utilityType) {
            case 'mapping':
                return this.mapFloor(playerEid);
            case 'detection':
                return this.detectNearby(playerEid, item.radius || 8);
            case 'blink':
                return this.blink(playerEid, item.radius || 6);
            case 'silence':
                return this.silenceNearby(playerEid, item.radius || 5, item.turns || 8);
            case 'warding':
                return this.wardPlayer(playerEid, item.radius || 1, item.turns || 5);
            case 'antidote':
                return this.cleanse(playerEid);
        }
        return false;
    },

    // Permanent upgrades
    permanentBoost(item, playerEid) {
        const bonus = item.bonus || 1;
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        
        switch (item.boostType) {
            case 'vision':
                const vision = Game.ECS.getComponent(playerEid, 'vision');
                if (vision) {
                    vision.radius += bonus;
                    vision.baseRadius = vision.radius;
                    addMessage('Your vision expands permanently! (+' + bonus + ' vision radius)');
                    if (ppos) {
                        Game.Events.emit('item.permanentBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType
                        });
                    }
                    return true;
                }
                break;
            case 'health':
                const hp = Game.ECS.getComponent(playerEid, 'health');
                if (hp) {
                    hp.maxHp += bonus;
                    hp.hp += bonus;
                    addMessage('You feel more resilient! (+' + bonus + ' max HP)');
                    if (ppos) {
                        Game.Events.emit('item.permanentBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType,
                            amount: bonus
                        });
                    }
                    return true;
                }
                break;
            case 'strength':
                const stats = Game.ECS.getComponent(playerEid, 'stats');
                if (stats) {
                    stats.strength += bonus;
                    addMessage('You feel permanently stronger! (+' + bonus + ' STR)');
                    if (ppos) {
                        Game.Events.emit('item.permanentBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType
                        });
                    }
                    return true;
                }
                break;
            case 'agility':
                const agilityStats = Game.ECS.getComponent(playerEid, 'stats');
                if (agilityStats) {
                    agilityStats.agility += bonus;
                    agilityStats.evasion += bonus;
                    addMessage('You feel permanently lighter on your feet! (+' + bonus + ' AGI/EVA)');
                    if (ppos) {
                        Game.Events.emit('item.permanentBoostApplied', {
                            entityId: playerEid,
                            position: {x: ppos.x, y: ppos.y},
                            boostType: item.boostType
                        });
                    }
                    return true;
                }
                break;
            case 'goldBonus':
                Game.state.goldMultiplier = (Game.state.goldMultiplier || 1) + bonus;
                addMessage('Gold glints brighter in your eyes. (bonus gold from pickups)');
                if (ppos) {
                    Game.Events.emit('item.permanentBoostApplied', {
                        entityId: playerEid,
                        position: {x: ppos.x, y: ppos.y},
                        boostType: item.boostType
                    });
                }
                return true;
            case 'xpBonus':
                Game.state.xpMultiplier = (Game.state.xpMultiplier || 1) + bonus;
                addMessage('Old lessons settle into your bones. (bonus XP gained)');
                if (ppos) {
                    Game.Events.emit('item.permanentBoostApplied', {
                        entityId: playerEid,
                        position: {x: ppos.x, y: ppos.y},
                        boostType: item.boostType
                    });
                }
                return true;
        }
        return false;
    },

    // Explosive items
    bomb(item, playerEid) {
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;
        
        const rad = item.radius || 1;
        const dmg = item.damage || 15;
        let hit = 0;
        
        // Create explosion visual effect
        Game.Systems.Effects.createExplosion(ppos.x, ppos.y, rad);
        Game.Events.emit('item.bombUsed', {
            entityId: playerEid,
            position: {x: ppos.x, y: ppos.y},
            radius: rad
        });
        
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                if (dx === 0 && dy === 0) continue;
                const tx = ppos.x + dx, ty = ppos.y + dy;
                if (!inBounds(tx, ty)) continue;
                const ents = Game.ECS.getEntitiesAt(tx, ty);
                for (let e = 0; e < ents.length; e++) {
                    const eid = ents[e];
                    if (eid === playerEid) continue;
                    const th = Game.ECS.getComponent(eid, 'health');
                    const td = Game.ECS.getComponent(eid, 'descriptor');
                    if (th && th.hp > 0) {
                        th.hp -= dmg; 
                        hit++;
                        Game.stats.totalDamageDealt += dmg;
                        Game.Events.emit('combat.damage', {
                            attackerId: playerEid,
                            targetId: eid,
                            position: {x: tx, y: ty},
                            amount: dmg,
                            isCritical: false,
                            source: 'bomb'
                        });
                        addMessage('The bomb hits ' + (td ? td.name : 'enemy') + ' for ' + dmg + '!');
                        if (th.hp <= 0) { 
                            addMessage((td ? td.name : 'enemy') + ' defeated!'); 
                            Game.Systems.Combat.onKill(eid, playerEid); 
                        }
                    }
                }
            }
        }
        if (hit > 0) { 
            Game.state.playerAttackedThisTurn = true; 
            addMessage('The explosion hits ' + hit + ' enemies!');
        } else { 
            addMessage('The bomb fizzles harmlessly.'); 
        }
        Game.stats.bombsUsed++;
        return true;
    },

    // Gold collection
    gold(item, playerEid) {
        // Gold is handled in pickupItemsAt, not here
        return false;
    },

    emitTempBoost(playerEid, ppos, boostType, turns) {
        if (!ppos) return;
        Game.Events.emit('item.tempBoostApplied', {
            entityId: playerEid,
            position: {x: ppos.x, y: ppos.y},
            boostType,
            turns
        });
    },

    mapFloor(playerEid) {
        const vision = Game.ECS.getComponent(playerEid, 'vision');
        if (!vision) return false;

        for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
            for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                if (Game.world.dungeonGrid[y][x].walkable) {
                    vision.seen.add(x + ',' + y);
                }
            }
        }
        addMessage('The floor etches itself into your memory.');
        Game.stats.scrollsUsed++;
        return true;
    },

    detectNearby(playerEid, radius) {
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;

        let monsterCount = 0;
        let itemCount = 0;
        const entities = Game.ECS.getEntitiesWith(['position']);
        for (const eid of entities) {
            if (eid === playerEid) continue;
            const pos = Game.ECS.getComponent(eid, 'position');
            const dist = Math.abs(pos.x - ppos.x) + Math.abs(pos.y - ppos.y);
            if (dist > radius) continue;
            if (Game.ECS.getComponent(eid, 'health')) monsterCount++;
            if (Game.ECS.getComponent(eid, 'item')) itemCount++;
        }
        addMessage('You sense ' + monsterCount + ' foes and ' + itemCount + ' items nearby.');
        Game.stats.scrollsUsed++;
        return true;
    },

    blink(playerEid, radius) {
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;

        const candidates = [];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = ppos.x + dx;
                const y = ppos.y + dy;
                if (!inBounds(x, y) || !Game.world.dungeonGrid[y][x].walkable) continue;
                if (Game.ECS.getEntitiesAt(x, y).some(eid => {
                    const blocker = Game.ECS.getComponent(eid, 'blocker');
                    return blocker && !blocker.passable;
                })) continue;
                candidates.push({x, y});
            }
        }

        if (candidates.length === 0) {
            addMessage('The blink magic sputters out.');
            return false;
        }

        const target = candidates[randInt(0, candidates.length - 1)];
        ppos.x = target.x;
        ppos.y = target.y;
        Game.Systems.Vision.update(playerEid);
        addMessage('Space folds around you.');
        Game.stats.scrollsUsed++;
        return true;
    },

    silenceNearby(playerEid, radius, turns) {
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;

        let silenced = 0;
        const aiList = Game.ECS.getEntitiesWith(['ai', 'position']);
        for (const eid of aiList) {
            const pos = Game.ECS.getComponent(eid, 'position');
            const dist = Math.abs(pos.x - ppos.x) + Math.abs(pos.y - ppos.y);
            if (dist <= radius) {
                const ai = Game.ECS.getComponent(eid, 'ai');
                ai.active = false;
                ai.silenced = turns;
                silenced++;
            }
        }
        addMessage('A hush falls over ' + silenced + ' nearby foes.');
        Game.stats.scrollsUsed++;
        return true;
    },

    wardPlayer(playerEid, radius, turns) {
        const status = this.ensureStatus(playerEid);
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;

        status.wardingBoost = turns;
        const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
        let pushed = 0;
        for (const dir of dirs) {
            const x = ppos.x + dir[0];
            const y = ppos.y + dir[1];
            const tx = ppos.x + dir[0] * (radius + 1);
            const ty = ppos.y + dir[1] * (radius + 1);
            if (!inBounds(x, y) || !inBounds(tx, ty) || !Game.world.dungeonGrid[ty][tx].walkable) continue;
            const ents = Game.ECS.getEntitiesAt(x, y);
            for (const eid of ents) {
                if (eid === playerEid || !Game.ECS.getComponent(eid, 'health')) continue;
                const pos = Game.ECS.getComponent(eid, 'position');
                pos.x = tx;
                pos.y = ty;
                pushed++;
            }
        }
        addMessage('A warding pulse pushes back ' + pushed + ' foes.');
        Game.stats.scrollsUsed++;
        return true;
    },

    cleanse(playerEid) {
        const status = this.ensureStatus(playerEid);
        status.poisoned = 0;
        status.bleeding = 0;
        status.silenced = 0;
        addMessage('You feel cleansed.');
        Game.stats.potionsUsed++;
        return true;
    },

    // Helper to ensure status component exists
    ensureStatus(playerEid) {
        let status = Game.ECS.getComponent(playerEid, 'status');
        if (!status) {
            status = {
                lightBoost: 0,
                speedBoost: 0,
                strengthBoost: 0,
                accuracyBoost: 0,
                evasionBoost: 0,
                clarityBoost: 0,
                damageReductionBoost: 0,
                regenBoost: 0,
                tempMaxHpBoost: 0,
                glassFuryBoost: 0,
                wardingBoost: 0
            };
            Game.ECS.addComponent(playerEid, 'status', status);
        }
        return status;
    }
};

// Helper functions to easily create consistent item classes
const ItemHelpers = {
    definePotion(options) {
        return Object.assign({
            kind: 'potion',
            glyph: '!',
            rarity: 'common',
            color: 'purple'
        }, options);
    },

    defineElixir(options) {
        return Object.assign({
            kind: 'elixir',
            glyph: '!',
            rarity: 'rare',
            color: 'orange'
        }, options);
    },

    defineScroll(options) {
        return Object.assign({
            kind: 'scroll',
            glyph: '?',
            rarity: 'common',
            color: 'yellow'
        }, options);
    },

    defineRelic(options) {
        return Object.assign({
            kind: 'relic',
            glyph: 'o',
            rarity: 'epic',
            color: 'blue',
            effect: 'permanentBoost'
        }, options);
    },

    defineBomb(options) {
        return Object.assign({
            kind: 'bomb',
            glyph: '*',
            rarity: 'common',
            color: 'red',
            effect: 'bomb'
        }, options);
    },

    defineGold(options) {
        return Object.assign({
            kind: 'gold',
            name: 'Gold Coins',
            glyph: '$',
            color: 'gold',
            rarity: 'common',
            desc: 'Shiny gold coins.',
            effect: 'gold'
        }, options);
    },

    healingPotion(name, amount, color = 'purple', rarity = 'common') {
        return this.definePotion({
            name,
            color,
            rarity,
            desc: `Restore ${amount} HP.`,
            effect: 'heal',
            amount
        });
    },

    tempBoostItem(name, boostType, bonus, turns, glyph = '!', color = 'cyan', rarity = 'rare') {
        const descriptions = {
            speed: `Move faster for ${turns} turns.`,
            strength: `+${bonus} STR for ${turns} turns.`,
            light: `Boost vision radius for ${turns} turns.`
        };
        const define = glyph === '?' ? this.defineScroll : this.definePotion;

        return define.call(this, {
            name,
            glyph,
            color,
            rarity,
            desc: descriptions[boostType] || `Boost ${boostType} for ${turns} turns.`,
            effect: 'tempBoost',
            boostType,
            bonus,
            turns
        });
    },

    permanentUpgrade(name, boostType, bonus, glyph = 'o', color = 'blue', rarity = 'epic') {
        const descriptions = {
            vision: `Permanently increases vision by ${bonus}.`,
            health: `Permanently increases max HP by ${bonus}.`,
            strength: `Permanently increases strength by ${bonus}.`
        };

        return this.defineRelic({
            name,
            glyph,
            color,
            rarity,
            desc: descriptions[boostType] || `Permanently boost ${boostType} by ${bonus}.`,
            boostType,
            bonus
        });
    },

    explosive(name, damage, radius, color = 'red', rarity = 'common') {
        return this.defineBomb({
            name,
            color,
            rarity,
            desc: `Explodes, dealing ${damage} damage in ${radius} tile radius.`,
            damage,
            radius
        });
    }
};

// Item Registry - Add new items here!
const ItemRegistry = {
    // === POTIONS ===
    'potion': ItemHelpers.healingPotion('Healing Potion', 25, 'purple', 'common'),
    'minorHeal': ItemHelpers.healingPotion('Minor Healing Potion', 15, 'pink', 'common'),
    'megaHeal': ItemHelpers.healingPotion('Greater Healing Potion', 50, 'red', 'rare'),
    'speed': ItemHelpers.definePotion({
        name: 'Speed Potion',
        color: 'cyan',
        rarity: 'rare',
        desc: 'Move faster - enemies act less frequently for 15 turns.',
        effect: 'tempBoost',
        boostType: 'speed',
        bonus: 3,
        turns: 15
    }),
    'ironSkin': ItemHelpers.definePotion({
        name: 'Iron Skin Potion',
        color: 'gray',
        rarity: 'rare',
        desc: 'Reduce incoming damage for 10 turns.',
        effect: 'tempBoost',
        boostType: 'damageReduction',
        reduction: 0.35,
        turns: 10
    }),
    'fleetfoot': ItemHelpers.definePotion({
        name: 'Fleetfoot Potion',
        color: 'white',
        rarity: 'rare',
        desc: 'Move faster for 8 turns.',
        effect: 'tempBoost',
        boostType: 'speed',
        bonus: 4,
        turns: 8
    }),
    'clarity': ItemHelpers.definePotion({
        name: 'Clarity Potion',
        color: 'blue',
        rarity: 'rare',
        desc: '+2 ACC and +2 EVA for 18 turns.',
        effect: 'tempBoost',
        boostType: 'clarity',
        accuracyBonus: 2,
        evasionBonus: 2,
        turns: 18
    }),
    'antidote': ItemHelpers.definePotion({
        name: 'Antidote Potion',
        color: 'green',
        rarity: 'common',
        desc: 'Cleanses harmful status effects.',
        effect: 'utility',
        utilityType: 'antidote'
    }),
    'mending': ItemHelpers.definePotion({
        name: 'Mending Potion',
        color: 'pink',
        rarity: 'rare',
        desc: 'Regain 3 HP per turn for 8 turns.',
        effect: 'tempBoost',
        boostType: 'regen',
        regenAmount: 3,
        bonus: 3,
        turns: 8
    }),

    // === ELIXIRS ===
    'strength': ItemHelpers.defineElixir({
        name: 'Strength Elixir',
        desc: '+5 STR for 20 turns.',
        effect: 'tempBoost',
        boostType: 'strength',
        bonus: 5,
        turns: 20
    }),
    'berserkerRage': ItemHelpers.defineElixir({
        name: 'Berserker Rage',
        color: 'darkred',
        desc: '+8 STR for 12 turns.',
        effect: 'tempBoost',
        boostType: 'strength',
        bonus: 8,
        turns: 12
    }),
    'focusElixir': ItemHelpers.defineElixir({
        name: 'Elixir of Focus',
        color: 'blue',
        desc: '+3 ACC for 20 turns.',
        effect: 'tempBoost',
        boostType: 'accuracy',
        bonus: 3,
        turns: 20
    }),
    'graceElixir': ItemHelpers.defineElixir({
        name: 'Elixir of Grace',
        color: 'cyan',
        desc: '+3 EVA and +1 AGI for 20 turns.',
        effect: 'tempBoost',
        boostType: 'evasion',
        bonus: 3,
        agilityBonus: 1,
        turns: 20
    }),
    'titanElixir': ItemHelpers.defineElixir({
        name: 'Titan Elixir',
        color: 'red',
        rarity: 'epic',
        desc: '+10 STR for 8 turns.',
        effect: 'tempBoost',
        boostType: 'strength',
        bonus: 10,
        turns: 8
    }),
    'guardianElixir': ItemHelpers.defineElixir({
        name: 'Guardian Elixir',
        color: 'green',
        rarity: 'rare',
        desc: '+20 max HP for 16 turns.',
        effect: 'tempBoost',
        boostType: 'maxHealth',
        bonus: 20,
        turns: 16
    }),
    'glassFury': ItemHelpers.defineElixir({
        name: 'Glass Fury Elixir',
        color: 'purple',
        rarity: 'epic',
        desc: '+12 STR but -3 EVA for 10 turns.',
        effect: 'tempBoost',
        boostType: 'glassFury',
        bonus: 12,
        evasionPenalty: 3,
        turns: 10
    }),

    // === SCROLLS ===
    'scroll': ItemHelpers.defineScroll({
        name: 'Scroll of Light',
        desc: 'Boost vision radius temporarily.',
        effect: 'tempBoost',
        boostType: 'light',
        bonus: 3,
        turns: 20
    }),
    'scrollGreaterLight': ItemHelpers.defineScroll({
        name: 'Scroll of Greater Light',
        color: 'gold',
        rarity: 'rare',
        desc: 'Greatly boost vision radius temporarily.',
        effect: 'tempBoost',
        boostType: 'light',
        bonus: 5,
        turns: 25
    }),
    'scrollHaste': ItemHelpers.defineScroll({
        name: 'Scroll of Haste',
        color: 'cyan',
        rarity: 'rare',
        desc: 'Move much faster for 10 turns.',
        effect: 'tempBoost',
        boostType: 'speed',
        bonus: 3,
        turns: 10
    }),
    'scrollMapping': ItemHelpers.defineScroll({
        name: 'Scroll of Mapping',
        color: 'white',
        rarity: 'rare',
        desc: 'Reveal the current floor layout.',
        effect: 'utility',
        utilityType: 'mapping'
    }),
    'scrollDetection': ItemHelpers.defineScroll({
        name: 'Scroll of Detection',
        color: 'orange',
        rarity: 'rare',
        desc: 'Sense nearby foes and items.',
        effect: 'utility',
        utilityType: 'detection',
        radius: 8
    }),
    'scrollBlink': ItemHelpers.defineScroll({
        name: 'Scroll of Blink',
        color: 'purple',
        rarity: 'rare',
        desc: 'Teleport a short distance.',
        effect: 'utility',
        utilityType: 'blink',
        radius: 6
    }),
    'scrollSilence': ItemHelpers.defineScroll({
        name: 'Scroll of Silence',
        color: 'gray',
        rarity: 'rare',
        desc: 'Quiet nearby foes for 8 turns.',
        effect: 'utility',
        utilityType: 'silence',
        radius: 5,
        turns: 8
    }),
    'scrollWarding': ItemHelpers.defineScroll({
        name: 'Scroll of Warding',
        color: 'gold',
        rarity: 'epic',
        desc: 'Push adjacent foes back and block attacks briefly.',
        effect: 'utility',
        utilityType: 'warding',
        radius: 1,
        turns: 5
    }),

    // === RELICS ===
    'vitality': ItemHelpers.permanentUpgrade('Vitality Relic', 'health', 15, 'o', 'green', 'epic'),
    'vision': ItemHelpers.permanentUpgrade('Vision Orb', 'vision', 1, 'o', 'blue', 'epic'),
    'powerStone': ItemHelpers.permanentUpgrade('Power Stone', 'strength', 2, '*', 'red', 'epic'),
    'eyeOfTruth': ItemHelpers.permanentUpgrade('Eye of Truth', 'vision', 2, 'E', 'silver', 'epic'),
    'heartRelic': ItemHelpers.permanentUpgrade('Heart Relic', 'health', 25, 'o', 'pink', 'epic'),
    'lensRelic': ItemHelpers.permanentUpgrade('Lens Relic', 'vision', 2, 'o', 'cyan', 'epic'),
    'bladeRelic': ItemHelpers.permanentUpgrade('Blade Relic', 'strength', 3, '/', 'red', 'epic'),
    'featherRelic': ItemHelpers.permanentUpgrade('Feather Relic', 'agility', 2, 'o', 'white', 'epic'),
    'coinRelic': ItemHelpers.defineRelic({
        name: 'Coin Relic',
        glyph: '$',
        color: 'gold',
        desc: 'Permanently increases gold pickups by 25%.',
        boostType: 'goldBonus',
        bonus: 0.25
    }),
    'scholarRelic': ItemHelpers.defineRelic({
        name: 'Scholar Relic',
        glyph: 'o',
        color: 'blue',
        desc: 'Permanently increases XP gained by 25%.',
        boostType: 'xpBonus',
        bonus: 0.25
    }),

    // === EXPLOSIVES ===
    'bomb': ItemHelpers.explosive('Bomb', 18, 1, 'red', 'common'),
    'bigBomb': ItemHelpers.explosive('Greater Bomb', 25, 2, 'orange', 'rare'),

    // === SPECIAL ===
    'gold': ItemHelpers.defineGold()
};

// Easy way to add new items to the registry
function registerItem(id, itemData) {
    ItemRegistry[id] = itemData;
}

// Example of how easy it is to add new items:
// registerItem('superHeal', ItemHelpers.healingPotion('Super Healing Potion', 75, 'gold', 'epic'));
// registerItem('fireBlast', ItemHelpers.explosive('Fire Blast', 30, 2, 'orange', 'rare'));
// registerItem('wisdomScroll', ItemHelpers.defineScroll({
//     name: 'Scroll of Wisdom', color: 'white', rarity: 'epic',
//     desc: 'Boost vision radius for 30 turns.', effect: 'tempBoost',
//     boostType: 'light', bonus: 6, turns: 30
// }));

/**
 * Get item data definition for a given item type
 */
function itemDataFor(type) {
    return ItemRegistry[type] || {
        kind: 'trinket', name: 'Shiny Trinket', effect: 'none', 
        glyph: ')', color: 'gray', desc: 'It shimmers faintly.', rarity: 'common'
    };
}

/**
 * Create an item entity from item data
 */
function createItemFromData(data, x, y) {
    const eid = createEntity();
    addComponent(eid, 'position', {x: x, y: y});
    addComponent(eid, 'item', JSON.parse(JSON.stringify(data)));
    addComponent(eid, 'descriptor', {name: data.name, glyph: data.glyph, color: data.color});
    addComponent(eid, 'blocker', {passable: true});

    Game.Events.emit('item.created', {
        entityId: eid,
        position: {x, y},
        item: data,
        rarity: data.rarity || 'common'
    });

    return eid;
}

/**
 * Create an item entity of the specified type
 */
function createItem(type, x, y) {
    return Game.Items.createFromData(Game.Items.dataFor(type), x, y);
}

/**
 * Spawn items randomly in rooms, avoiding the player position
 */
function spawnItemsAvoiding(px, py) {
    for (let i = 0; i < Game.world.rooms.length; i++) {
        if (Math.random() < 0.5) {
            const r = Game.world.rooms[i];
            const x = randInt(r.x, r.x + r.width - 1);
            const y = randInt(r.y, r.y + r.height - 1);
            if (x === px && y === py) continue;
            
            // Updated item spawn list with new items
            const commonItems = ['potion', 'bomb', 'scroll', 'minorHeal', 'antidote'];
            const rareItems = [
                'speed', 'strength', 'megaHeal', 'scrollGreaterLight',
                'berserkerRage', 'bigBomb', 'ironSkin', 'fleetfoot',
                'clarity', 'mending', 'focusElixir', 'graceElixir',
                'guardianElixir', 'scrollMapping', 'scrollDetection',
                'scrollBlink', 'scrollSilence'
            ];
            const epicItems = [
                'vision', 'vitality', 'powerStone', 'eyeOfTruth',
                'titanElixir', 'glassFury', 'scrollWarding',
                'heartRelic', 'lensRelic', 'bladeRelic',
                'featherRelic', 'coinRelic', 'scholarRelic'
            ];
            
            let itemType;
            const roll = Math.random();
            if (roll < 0.7) {
                itemType = commonItems[randInt(0, commonItems.length - 1)];
            } else if (roll < 0.95) {
                itemType = rareItems[randInt(0, rareItems.length - 1)];
            } else {
                itemType = epicItems[randInt(0, epicItems.length - 1)];
            }
            
            Game.Items.create(itemType, x, y);
        }
    }
}

/**
 * Drop loot when an entity dies
 */
function dropLoot(victimId) {
    const loot = getComponent(victimId, 'lootTable');
    const pos = getComponent(victimId, 'position');
    if (!loot || !pos) return;
    
    const floorBonus = Math.abs(Game.state.floor) * 0.05;
    
    for (let i = 0; i < loot.drops.length; i++) {
        const drop = loot.drops[i];
        const chance = Math.min(drop.chance + floorBonus, 0.95);
        
        if (Math.random() < chance) {
            if (drop.type === 'gold') {
                let amount = randInt(drop.amount[0], drop.amount[1]);
                amount = Math.floor(amount * (1 + Math.abs(Game.state.floor) * 0.2));
                const goldData = Game.Items.dataFor('gold');
                goldData.amount = amount;
                goldData.name = amount + ' Gold';
                Game.Items.createFromData(goldData, pos.x, pos.y);
            } else {
                Game.Items.create(drop.type, pos.x, pos.y);
            }
        }
    }
}

/**
 * Pick up all items at the specified position
 */
function pickupItemsAt(x, y) {
    const inv = Game.ECS.getComponent(Game.world.playerEid, 'inventory');
    if (!inv) return;
    const here = Game.ECS.getEntitiesAt(x, y);
    for (let i = 0; i < here.length; i++) {
        const eid = here[i];
        if (eid === Game.world.playerEid) continue;
        const item = Game.ECS.getComponent(eid, 'item');
        if (item) {
            if (item.effect === 'gold') {
                const amount = Math.max(1, Math.floor((item.amount || 1) * (Game.state.goldMultiplier || 1)));
                Game.state.playerGold += amount;
                Game.stats.goldCollected += amount;

                Game.Events.emit('item.goldPickedUp', {
                    entityId: eid,
                    position: {x, y},
                    amount
                });

                addMessage('Picked up ' + amount + ' gold! (Total: ' + Game.state.playerGold + ')');
                Game.ECS.destroyEntity(eid);
            } else {
                if (inv.items.length >= inv.capacity) { 
                    addMessage('Inventory full!'); 
                    continue; 
                }
                inv.items.push(JSON.parse(JSON.stringify(item)));
                const name = item.name || 'item';
                const rarity = item.rarity || 'common';
                const color = rarity === 'epic' ? 'Epic ' : rarity === 'rare' ? 'Rare ' : '';

                Game.Events.emit('item.pickedUp', {
                    entityId: eid,
                    position: {x, y},
                    item,
                    rarity
                });

                Game.ECS.destroyEntity(eid);
                addMessage('Picked up ' + color + name + '.');
                Game.stats.itemsPickedUp++;
            }
        }
    }
}

/**
 * Use an item from the player's inventory
 */
function useInventoryItem(index) {
    const inv = Game.ECS.getComponent(Game.world.playerEid, 'inventory');
    if (!inv || index < 0 || index >= inv.items.length) return false;
    
    const item = inv.items[index];
    let used = false;
    
    // Use the modular effect system
    const effectHandler = ItemEffects[item.effect];
    if (effectHandler) {
        used = effectHandler.call(ItemEffects, item, Game.world.playerEid);
    } else {
        addMessage('Nothing happens.');
        used = true;
    }
    
    if (used) { 
        inv.items.splice(index, 1); 
    }
    return used;
}

/**
 * Drop an item from the player's inventory
 */
function dropInventoryItem(index) {
    const inv = getComponent(Game.world.playerEid, 'inventory');
    const ppos = getComponent(Game.world.playerEid, 'position');
    if (!inv || !ppos || index < 0 || index >= inv.items.length) return false;
    const data = inv.items[index];
    Game.Items.createFromData(data, ppos.x, ppos.y);
    addMessage('Dropped ' + (data.name || 'item') + '.');
    inv.items.splice(index, 1);
    Game.stats.itemsDropped++;
    return true;
}

Game.Items = {
    registry: ItemRegistry,
    effects: ItemEffects,
    helpers: ItemHelpers,
    register: registerItem,
    dataFor: itemDataFor,
    createFromData: createItemFromData,
    create: createItem,
    spawnAvoiding: spawnItemsAvoiding,
    dropLoot,
    pickupAt: pickupItemsAt,
    useInventoryItem,
    dropInventoryItem
};
