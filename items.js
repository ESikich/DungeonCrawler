/** =========================
 *  Item System - Using Game Namespace
 *  ========================= */

/**
 * Get item data definition for a given item type
 */
function itemDataFor(type) {
    const items = {
        'potion': {kind:'potion', name:'Healing Potion', effect:'heal', amount:25, glyph:'!', color:'purple', desc:'Restore 25 HP.', rarity:'common'},
        'bomb': {kind:'bomb', name:'Bomb', effect:'bomb', damage:18, radius:1, glyph:'*', color:'red', desc:'Explodes, damaging nearby foes.', rarity:'common'},
        'scroll': {kind:'scroll', name:'Scroll of Light', effect:'light', bonus:3, turns:20, glyph:'?', color:'yellow', desc:'Boost vision radius temporarily.', rarity:'common'},
        'speed': {kind:'potion', name:'Speed Potion', effect:'speed', bonus:3, turns:15, glyph:'!', color:'cyan', desc:'Move faster for 15 turns.', rarity:'rare'},
        'strength': {kind:'elixir', name:'Strength Elixir', effect:'strength', bonus:5, turns:20, glyph:'!', color:'orange', desc:'+5 STR for 20 turns.', rarity:'rare'},
        'vision': {kind:'orb', name:'Vision Orb', effect:'vision', bonus:1, glyph:'o', color:'blue', desc:'Permanently increases vision by 1.', rarity:'epic'},
        'gold': {kind:'gold', name:'Gold Coins', effect:'gold', glyph:'$', color:'gold', desc:'Shiny gold coins.', rarity:'common'}
    };
    return items[type] || {kind:'trinket', name:'Shiny Trinket', effect:'none', glyph:')', color:'gray', desc:'It shimmers faintly.', rarity:'common'};
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
            const types = ['potion', 'bomb', 'scroll'];
            createItem(types[randInt(0, types.length - 1)], x, y);
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
    const inv = getComponent(Game.world.playerEid, 'inventory');
    if (!inv || index < 0 || index >= inv.items.length) return false;
    const it = inv.items[index];
    let used = false;
    const hp = getComponent(Game.world.playerEid, 'health');
    const st = getComponent(Game.world.playerEid, 'status');
    const stats = getComponent(Game.world.playerEid, 'stats');
    
    switch (it.effect) {
        case 'heal':
            if (!hp) break;
            const before = hp.hp;
            hp.hp = clamp(hp.hp + (it.amount || 0), 0, hp.maxHp);
            const healed = hp.hp - before;
            addMessage('You quaff the potion (+' + healed + ' HP).');
            Game.stats.potionsUsed++;
            used = true; 
            break;
            
        case 'bomb':
            const ppos = getComponent(Game.world.playerEid, 'position');
            if (!ppos) break;
            const rad = it.radius || 1;
            const dmg = it.damage || 15;
            let hit = 0;
            
            // Create explosion visual effect
            createExplosion(ppos.x, ppos.y, rad);
            
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const tx = ppos.x + dx, ty = ppos.y + dy;
                    if (!inBounds(tx, ty)) continue;
                    const ents = getEntitiesAt(tx, ty);
                    for (let e = 0; e < ents.length; e++) {
                        const eid = ents[e];
                        if (eid === Game.world.playerEid) continue;
                        const th = getComponent(eid, 'health');
                        const td = getComponent(eid, 'descriptor');
                        if (th && th.hp > 0) {
                            th.hp -= dmg; 
                            hit++;
                            Game.stats.totalDamageDealt += dmg;
                            addMessage('The bomb hits ' + (td ? td.name : 'enemy') + ' for ' + dmg + '!');
                            if (th.hp <= 0) { 
                                addMessage((td ? td.name : 'enemy') + ' defeated!'); 
                                onKill(eid, Game.world.playerEid); 
                            }
                        }
                    }
                }
            }
            if (hit > 0) { 
                used = true; 
                Game.state.playerAttackedThisTurn = true; 
            } else { 
                addMessage('The bomb fizzles harmlessly.'); 
                used = true; 
            }
            Game.stats.bombsUsed++;
            break;
            
        case 'light':
            const v = getComponent(Game.world.playerEid, 'vision');
            if (v) {
                const bonus = it.bonus || 3;
                const turns = it.turns || 20;
                v.radius = (v.baseRadius || v.radius) + bonus;
                if (!st) { 
                    const newStatus = {lightBoost: 0}; 
                    addComponent(Game.world.playerEid, 'status', newStatus); 
                }
                const status = getComponent(Game.world.playerEid, 'status');
                status.lightBoost = turns;
                addMessage('A brilliant light surrounds you! (+' + bonus + ' vision for ' + turns + ' turns)');
                Game.stats.scrollsUsed++;
                used = true;
            }
            break;
            
        case 'speed':
            if (!st) { 
                const newStatus = {speedBoost: 0}; 
                addComponent(Game.world.playerEid, 'status', newStatus); 
            }
            const status = getComponent(Game.world.playerEid, 'status');
            status.speedBoost = it.turns || 15;
            addMessage('You feel much faster! (Extra action every other turn for ' + status.speedBoost + ' turns)');
            Game.stats.potionsUsed++;
            used = true;
            break;
            
        case 'strength':
            if (!st) { 
                const newStatus = {strengthBoost: 0}; 
                addComponent(Game.world.playerEid, 'status', newStatus); 
            }
            if (!stats) break;
            const strengthStatus = getComponent(Game.world.playerEid, 'status');
            strengthStatus.strengthBoost = it.turns || 20;
            strengthStatus.strengthBonusAmount = it.bonus || 5;
            stats.strength += strengthStatus.strengthBonusAmount;
            addMessage('You feel stronger! (+' + strengthStatus.strengthBonusAmount + ' STR for ' + strengthStatus.strengthBoost + ' turns)');
            Game.stats.potionsUsed++;
            used = true;
            break;
            
        case 'vision':
            const visionComp = getComponent(Game.world.playerEid, 'vision');
            if (visionComp) {
                const bonus = it.bonus || 2;
                visionComp.radius += bonus;
                visionComp.baseRadius = visionComp.radius;
                addMessage('Your vision expands permanently! (+' + bonus + ' vision radius)');
                used = true;
            }
            break;
            
        default:
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
