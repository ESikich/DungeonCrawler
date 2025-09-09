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
 *     registerItem('ultraSpeed', ItemHelpers.tempBoostItem('Ultra Speed', 'speed', 5, 20, '!', 'white', 'epic'));
 *     registerItem('might', ItemHelpers.tempBoostItem('Scroll of Might', 'strength', 8, 15, '?', 'red', 'rare'));
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
        if (!hp) return false;
        
        const before = hp.hp;
        hp.hp = clamp(hp.hp + (item.amount || 0), 0, hp.maxHp);
        const healed = hp.hp - before;
        addMessage('You quaff the potion (+' + healed + ' HP).');
        Game.stats.potionsUsed++;
        return true;
    },

    // Temporary stat boosts
    tempBoost(item, playerEid) {
        const status = this.ensureStatus(playerEid);
        const turns = item.turns || 15;
        const bonus = item.bonus || 3;
        
        switch (item.boostType) {
            case 'speed':
                status.speedBoost = turns;
                addMessage('You feel much faster! (Extra action every other turn for ' + turns + ' turns)');
                break;
            case 'strength':
                const stats = Game.ECS.getComponent(playerEid, 'stats');
                if (stats) {
                    status.strengthBoost = turns;
                    status.strengthBonusAmount = bonus;
                    stats.strength += bonus;
                    addMessage('You feel stronger! (+' + bonus + ' STR for ' + turns + ' turns)');
                }
                break;
            case 'light':
                const vision = Game.ECS.getComponent(playerEid, 'vision');
                if (vision) {
                    vision.radius = (vision.baseRadius || vision.radius) + bonus;
                    status.lightBoost = turns;
                    addMessage('A brilliant light surrounds you! (+' + bonus + ' vision for ' + turns + ' turns)');
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

    // Permanent upgrades
    permanentBoost(item, playerEid) {
        const bonus = item.bonus || 1;
        
        switch (item.boostType) {
            case 'vision':
                const vision = Game.ECS.getComponent(playerEid, 'vision');
                if (vision) {
                    vision.radius += bonus;
                    vision.baseRadius = vision.radius;
                    addMessage('Your vision expands permanently! (+' + bonus + ' vision radius)');
                    return true;
                }
                break;
            case 'health':
                const hp = Game.ECS.getComponent(playerEid, 'health');
                if (hp) {
                    hp.maxHp += bonus;
                    hp.hp += bonus;
                    addMessage('You feel more resilient! (+' + bonus + ' max HP)');
                    return true;
                }
                break;
            case 'strength':
                const stats = Game.ECS.getComponent(playerEid, 'stats');
                if (stats) {
                    stats.strength += bonus;
                    addMessage('You feel permanently stronger! (+' + bonus + ' STR)');
                    return true;
                }
                break;
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

    // Helper to ensure status component exists
    ensureStatus(playerEid) {
        let status = Game.ECS.getComponent(playerEid, 'status');
        if (!status) {
            status = {lightBoost: 0, speedBoost: 0, strengthBoost: 0};
            Game.ECS.addComponent(playerEid, 'status', status);
        }
        return status;
    }
};

// Item Registry - Add new items here!
const ItemRegistry = {
    // === POTIONS ===
    'potion': {
        kind: 'potion', name: 'Healing Potion', glyph: '!', color: 'purple', rarity: 'common',
        desc: 'Restore 25 HP.',
        effect: 'heal', amount: 25
    },
    
    'speed': {
        kind: 'potion', name: 'Speed Potion', glyph: '!', color: 'cyan', rarity: 'rare',
        desc: 'Move faster for 15 turns.',
        effect: 'tempBoost', boostType: 'speed', bonus: 3, turns: 15
    },
    
    'strength': {
        kind: 'elixir', name: 'Strength Elixir', glyph: '!', color: 'orange', rarity: 'rare',
        desc: '+5 STR for 20 turns.',
        effect: 'tempBoost', boostType: 'strength', bonus: 5, turns: 20
    },

    'megaHeal': {
        kind: 'potion', name: 'Greater Healing Potion', glyph: '!', color: 'red', rarity: 'rare',
        desc: 'Restore 50 HP.',
        effect: 'heal', amount: 50
    },

    'vitality': {
        kind: 'elixir', name: 'Elixir of Vitality', glyph: '!', color: 'green', rarity: 'epic',
        desc: 'Permanently increases max HP by 15.',
        effect: 'permanentBoost', boostType: 'health', bonus: 15
    },

    // === SCROLLS ===
    'scroll': {
        kind: 'scroll', name: 'Scroll of Light', glyph: '?', color: 'yellow', rarity: 'common',
        desc: 'Boost vision radius temporarily.',
        effect: 'tempBoost', boostType: 'light', bonus: 3, turns: 20
    },

    'scrollGreaterLight': {
        kind: 'scroll', name: 'Scroll of Greater Light', glyph: '?', color: 'gold', rarity: 'rare',
        desc: 'Greatly boost vision radius temporarily.',
        effect: 'tempBoost', boostType: 'light', bonus: 5, turns: 25
    },

    'scrollHaste': {
        kind: 'scroll', name: 'Scroll of Haste', glyph: '?', color: 'cyan', rarity: 'rare',
        desc: 'Move much faster for 10 turns.',
        effect: 'tempBoost', boostType: 'speed', bonus: 3, turns: 10
    },

    // === PERMANENT UPGRADES ===
    'vision': {
        kind: 'orb', name: 'Vision Orb', glyph: 'o', color: 'blue', rarity: 'epic',
        desc: 'Permanently increases vision by 1.',
        effect: 'permanentBoost', boostType: 'vision', bonus: 1
    },

    'powerStone': {
        kind: 'stone', name: 'Power Stone', glyph: '*', color: 'red', rarity: 'epic',
        desc: 'Permanently increases strength by 2.',
        effect: 'permanentBoost', boostType: 'strength', bonus: 2
    },

    // === EXPLOSIVES ===
    'bomb': {
        kind: 'bomb', name: 'Bomb', glyph: '*', color: 'red', rarity: 'common',
        desc: 'Explodes, damaging nearby foes.',
        effect: 'bomb', damage: 18, radius: 1
    },

    'bigBomb': {
        kind: 'bomb', name: 'Greater Bomb', glyph: '*', color: 'orange', rarity: 'rare',
        desc: 'Large explosion with increased damage.',
        effect: 'bomb', damage: 25, radius: 2
    },

    // === SPECIAL ===
    'gold': {
        kind: 'gold', name: 'Gold Coins', glyph: '$', color: 'gold', rarity: 'common',
        desc: 'Shiny gold coins.',
        effect: 'gold'
    }
};

// Helper functions to easily create new items
const ItemHelpers = {
    // Create a healing potion
    healingPotion(name, amount, color = 'purple', rarity = 'common') {
        return {
            kind: 'potion', name, glyph: '!', color, rarity,
            desc: `Restore ${amount} HP.`,
            effect: 'heal', amount
        };
    },

    // Create a temporary boost item  
    tempBoostItem(name, boostType, bonus, turns, glyph = '!', color = 'cyan', rarity = 'rare') {
        const descriptions = {
            speed: `Move faster for ${turns} turns.`,
            strength: `+${bonus} STR for ${turns} turns.`,
            light: `Boost vision radius for ${turns} turns.`
        };
        
        return {
            kind: boostType === 'light' ? 'scroll' : 'potion',
            name, glyph, color, rarity,
            desc: descriptions[boostType] || `Boost ${boostType} for ${turns} turns.`,
            effect: 'tempBoost', boostType, bonus, turns
        };
    },

    // Create a permanent upgrade
    permanentUpgrade(name, boostType, bonus, glyph = 'o', color = 'blue', rarity = 'epic') {
        const descriptions = {
            vision: `Permanently increases vision by ${bonus}.`,
            health: `Permanently increases max HP by ${bonus}.`,
            strength: `Permanently increases strength by ${bonus}.`
        };
        
        return {
            kind: 'orb', name, glyph, color, rarity,
            desc: descriptions[boostType] || `Permanently boost ${boostType} by ${bonus}.`,
            effect: 'permanentBoost', boostType, bonus
        };
    },

    // Create an explosive
    explosive(name, damage, radius, color = 'red', rarity = 'common') {
        return {
            kind: 'bomb', name, glyph: '*', color, rarity,
            desc: `Explodes, dealing ${damage} damage in ${radius} tile radius.`,
            effect: 'bomb', damage, radius
        };
    }
};

// Easy way to add new items to the registry
function registerItem(id, itemData) {
    ItemRegistry[id] = itemData;
}

// Example of how easy it is to add new items:
// registerItem('superHeal', ItemHelpers.healingPotion('Super Healing Potion', 75, 'gold', 'epic'));
// registerItem('fireBlast', ItemHelpers.explosive('Fire Blast', 30, 2, 'orange', 'rare'));
// registerItem('wisdomScroll', ItemHelpers.tempBoostItem('Scroll of Wisdom', 'light', 6, 30, '?', 'white', 'epic'));

// Register some bonus items dynamically as examples:
registerItem('minorHeal', ItemHelpers.healingPotion('Minor Healing Potion', 15, 'pink', 'common'));
registerItem('berserkerRage', ItemHelpers.tempBoostItem('Berserker Rage', 'strength', 8, 12, '!', 'darkred', 'rare'));
registerItem('eyeOfTruth', ItemHelpers.permanentUpgrade('Eye of Truth', 'vision', 2, '👁', 'silver', 'epic'));

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
    return eid;
}

/**
 * Create an item entity of the specified type
 */
function createItem(type, x, y) {
    return createItemFromData(itemDataFor(type), x, y);
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
            const commonItems = ['potion', 'bomb', 'scroll', 'minorHeal'];
            const rareItems = ['speed', 'strength', 'megaHeal', 'scrollGreaterLight', 'berserkerRage', 'bigBomb'];
            const epicItems = ['vision', 'vitality', 'powerStone', 'eyeOfTruth'];
            
            let itemType;
            const roll = Math.random();
            if (roll < 0.7) {
                itemType = commonItems[randInt(0, commonItems.length - 1)];
            } else if (roll < 0.95) {
                itemType = rareItems[randInt(0, rareItems.length - 1)];
            } else {
                itemType = epicItems[randInt(0, epicItems.length - 1)];
            }
            
            createItem(itemType, x, y);
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
                const goldData = itemDataFor('gold');
                goldData.amount = amount;
                goldData.name = amount + ' Gold';
                createItemFromData(goldData, pos.x, pos.y);
            } else {
                createItem(drop.type, pos.x, pos.y);
            }
        }
    }
}

/**
 * Pick up all items at the specified position
 */
function pickupItemsAt(x, y) {
    const inv = getComponent(Game.world.playerEid, 'inventory');
    if (!inv) return;
    const here = getEntitiesAt(x, y);
    for (let i = 0; i < here.length; i++) {
        const eid = here[i];
        if (eid === Game.world.playerEid) continue;
        const item = getComponent(eid, 'item');
        if (item) {
            if (item.effect === 'gold') {
                const amount = item.amount || 1;
                Game.state.playerGold += amount;
                Game.stats.goldCollected += amount;
                addMessage('Picked up ' + amount + ' gold! (Total: ' + Game.state.playerGold + ')');
                destroyEntity(eid);
            } else {
                if (inv.items.length >= inv.capacity) { 
                    addMessage('Inventory full!'); 
                    continue; 
                }
                inv.items.push(JSON.parse(JSON.stringify(item)));
                const name = item.name || 'item';
                const rarity = item.rarity || 'common';
                const color = rarity === 'epic' ? 'Epic ' : rarity === 'rare' ? 'Rare ' : '';
                destroyEntity(eid);
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
    createItemFromData(data, ppos.x, ppos.y);
    addMessage('Dropped ' + (data.name || 'item') + '.');
    inv.items.splice(index, 1);
    Game.stats.itemsDropped++;
    return true;
}