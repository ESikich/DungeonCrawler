/** =========================
 *  Item System
 *  ========================= */

/**
 * Get item data definition for a given item type
 */
function itemDataFor(type) {
    var items = {
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
    var eid = createEntity();
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
            var r = rooms[i];
            var x = randInt(r.x, r.x + r.width - 1);
            var y = randInt(r.y, r.y + r.height - 1);
            if (x === px && y === py) continue;
            var types = ['potion', 'bomb', 'scroll'];
            createItem(types[randInt(0, types.length - 1)], x, y);
        }
    }
}

/**
 * Drop loot when an entity dies
 */
function dropLoot(victimId) {
    var loot = getComponent(victimId, 'lootTable');
    var pos = getComponent(victimId, 'position');
    if (!loot || !pos) return;
    
    var floorBonus = Math.abs(floor) * 0.05;
    
    for (var i = 0; i < loot.drops.length; i++) {
        var drop = loot.drops[i];
        var chance = Math.min(drop.chance + floorBonus, 0.95);
        
        if (Math.random() < chance) {
            if (drop.type === 'gold') {
                var amount = randInt(drop.amount[0], drop.amount[1]);
                amount = Math.floor(amount * (1 + Math.abs(floor) * 0.2));
                var goldData = itemDataFor('gold');
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
    var inv = getComponent(playerEid, 'inventory');
    if (!inv) return;
    var here = getEntitiesAt(x, y);
    for (var i = 0; i < here.length; i++) {
        var eid = here[i];
        if (eid === playerEid) continue;
        var item = getComponent(eid, 'item');
        if (item) {
            if (item.effect === 'gold') {
                var amount = item.amount || 1;
                playerGold += amount;
                gameStats.goldCollected += amount;
                addMessage('Picked up ' + amount + ' gold! (Total: ' + playerGold + ')');
                destroyEntity(eid);
            } else {
                if (inv.items.length >= inv.capacity) { 
                    addMessage('Inventory full!'); 
                    continue; 
                }
                inv.items.push(JSON.parse(JSON.stringify(item)));
                var name = item.name || 'item';
                var rarity = item.rarity || 'common';
                var color = rarity === 'epic' ? 'Epic ' : rarity === 'rare' ? 'Rare ' : '';
                destroyEntity(eid);
                addMessage('Picked up ' + color + name + '.');
                gameStats.itemsPickedUp++;
            }
        }
    }
}

/**
 * Use an item from the player's inventory
 */
function useInventoryItem(index) {
    var inv = getComponent(playerEid, 'inventory');
    if (!inv || index < 0 || index >= inv.items.length) return false;
    var it = inv.items[index];
    var used = false;
    var hp = getComponent(playerEid, 'health');
    var st = getComponent(playerEid, 'status');
    var stats = getComponent(playerEid, 'stats');
    
    switch (it.effect) {
        case 'heal':
            if (!hp) break;
            var before = hp.hp;
            hp.hp = clamp(hp.hp + (it.amount || 0), 0, hp.maxHp);
            var healed = hp.hp - before;
            addMessage('You quaff the potion (+' + healed + ' HP).');
            gameStats.potionsUsed++;
            used = true; 
            break;
            
        case 'bomb':
            var ppos = getComponent(playerEid, 'position');
            if (!ppos) break;
            var rad = it.radius || 1;
            var dmg = it.damage || 15;
            var hit = 0;
            
            // Create explosion visual effect
            createExplosion(ppos.x, ppos.y, rad);  // <-- ADD THIS LINE
            
            for (var dy = -rad; dy <= rad; dy++) {
                for (var dx = -rad; dx <= rad; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    var tx = ppos.x + dx, ty = ppos.y + dy;
                    if (!inBounds(tx, ty)) continue;
                    var ents = getEntitiesAt(tx, ty);
                    for (var e = 0; e < ents.length; e++) {
                        var eid = ents[e];
                        if (eid === playerEid) continue;
                        var th = getComponent(eid, 'health');
                        var td = getComponent(eid, 'descriptor');
                        if (th && th.hp > 0) {
                            th.hp -= dmg; 
                            hit++;
                            gameStats.totalDamageDealt += dmg;
                            addMessage('The bomb hits ' + (td ? td.name : 'enemy') + ' for ' + dmg + '!');
                            if (th.hp <= 0) { 
                                addMessage((td ? td.name : 'enemy') + ' defeated!'); 
                                onKill(eid, playerEid); 
                            }
                        }
                    }
                }
            }
            if (hit > 0) { 
                used = true; 
                playerAttackedThisTurn = true; 
            } else { 
                addMessage('The bomb fizzles harmlessly.'); 
                used = true; 
            }
            gameStats.bombsUsed++;
            break;
            
        case 'light':
            var v = getComponent(playerEid, 'vision');
            if (v) {
                var bonus = it.bonus || 3;
                var turns = it.turns || 20;
                v.radius = (v.baseRadius || v.radius) + bonus;
                if (!st) { 
                    st = {lightBoost: 0}; 
                    addComponent(playerEid, 'status', st); 
                }
                st.lightBoost = turns;
                addMessage('A brilliant light surrounds you! (+' + bonus + ' vision for ' + turns + ' turns)');
                gameStats.scrollsUsed++;
                used = true;
            }
            break;
            
        case 'speed':
            if (!st) { 
                st = {speedBoost: 0}; 
                addComponent(playerEid, 'status', st); 
            }
            st.speedBoost = it.turns || 15;
            addMessage('You feel much faster! (Extra action every other turn for ' + st.speedBoost + ' turns)');
            gameStats.potionsUsed++;
            used = true;
            break;
            
        case 'strength':
            if (!st) { 
                st = {strengthBoost: 0}; 
                addComponent(playerEid, 'status', st); 
            }
            if (!stats) break;
            st.strengthBoost = it.turns || 20;
            st.strengthBonusAmount = it.bonus || 5;
            stats.strength += st.strengthBonusAmount;
            addMessage('You feel stronger! (+' + st.strengthBonusAmount + ' STR for ' + st.strengthBoost + ' turns)');
            gameStats.potionsUsed++;
            used = true;
            break;
            
        case 'vision':
            var v = getComponent(playerEid, 'vision');
            if (v) {
                var bonus = it.bonus || 2;
                v.radius += bonus;
                v.baseRadius = v.radius;
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
    var inv = getComponent(playerEid, 'inventory');
    var ppos = getComponent(playerEid, 'position');
    if (!inv || !ppos || index < 0 || index >= inv.items.length) return false;
    var data = inv.items[index];
    createItemFromData(data, ppos.x, ppos.y);
    addMessage('Dropped ' + (data.name || 'item') + '.');
    inv.items.splice(index, 1);
    gameStats.itemsDropped++;
    return true;
}
