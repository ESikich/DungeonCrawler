/** =========================
 *  Item System - Complete Final Version
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
            hp.hp = clamp(hp.hp + (it.amount || 0), 0, hp
