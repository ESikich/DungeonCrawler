/** =========================
 *  Enhanced Item System - Fixed for Turn-Based Game with Proper Durations
 *  ========================= */

// Enhanced Item Effects with Visual Feedback
const EnhancedItemEffects = {
    heal(item, playerEid) {
        const hp = Game.ECS.getComponent(playerEid, 'health');
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!hp) return false;
        
        const before = hp.hp;
        hp.hp = clamp(hp.hp + (item.amount || 0), 0, hp.maxHp);
        const healed = hp.hp - before;
        
        if (ppos && healed > 0) {
            Game.VFX.heal(ppos.x, ppos.y, healed);
            // 2 second healing pulse
            Game.VFX.pulse(playerEid, 'green', 0.006, 0.4, 2000);
        }
        
        addMessage('You quaff the potion (+' + healed + ' HP).');
        Game.stats.potionsUsed++;
        return true;
    },

    tempBoost(item, playerEid) {
        const status = this.ensureStatus(playerEid);
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        const turns = item.turns || 15;
        const bonus = item.bonus || 3;
        
        switch (item.boostType) {
            case 'speed':
                status.speedBoost = turns;
                addMessage('You feel much faster! (Extra action every other turn for ' + turns + ' turns)');
                if (ppos) {
                    // Duration based on turns - approximate 5 seconds per turn when active
                    Game.VFX.pulse(playerEid, 'cyan', 0.008, 0.5, turns * 5000);
                }
                break;
                
            case 'strength':
                const stats = Game.ECS.getComponent(playerEid, 'stats');
                if (stats) {
                    status.strengthBoost = turns;
                    status.strengthBonusAmount = bonus;
                    stats.strength += bonus;
                    addMessage('You feel stronger! (+' + bonus + ' STR for ' + turns + ' turns)');
                    if (ppos) {
                        Game.VFX.pulse(playerEid, 'red', 0.005, 0.3, turns * 5000);
                    }
                }
                break;
                
            case 'light':
                const vision = Game.ECS.getComponent(playerEid, 'vision');
                if (vision) {
                    vision.radius = (vision.baseRadius || vision.radius) + bonus;
                    status.lightBoost = turns;
                    addMessage('A brilliant light surrounds you! (+' + bonus + ' vision for ' + turns + ' turns)');
                    if (ppos) {
                        Game.VFX.pulse(playerEid, 'yellow', 0.004, 0.6, turns * 5000);
                    }
                }
                break;
        }
        
        if (item.kind === 'scroll') {
            Game.stats.scrollsUsed++;
        } else {
            Game.stats.potionsUsed++;
        }
        
        return true;
    },

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
                        // 4 second blue pulse for permanent upgrade
                        Game.VFX.pulse(playerEid, 'blue', 0.003, 0.7, 4000);
                        Game.VFX.shake(3, 200);
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
                        Game.VFX.heal(ppos.x, ppos.y, bonus);
                        Game.VFX.pulse(playerEid, 'green', 0.003, 0.5, 4000);
                        Game.VFX.shake(2, 150);
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
                        Game.VFX.pulse(playerEid, 'red', 0.003, 0.6, 4000);
                        Game.VFX.shake(4, 250);
                    }
                    return true;
                }
                break;
        }
        return false;
    },

    bomb(item, playerEid) {
        const ppos = Game.ECS.getComponent(playerEid, 'position');
        if (!ppos) return false;
        
        const rad = item.radius || 1;
        const dmg = item.damage || 15;
        let hit = 0;
        
        Game.Systems.Effects.createExplosion(ppos.x, ppos.y, rad);
        Game.VFX.shake(8 + rad * 2, 400 + rad * 100);
        
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
                        
                        Game.VFX.damage(tx, ty, dmg);
                        
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

    gold(item, playerEid) {
        return false;
    },

    ensureStatus(playerEid) {
        let status = Game.ECS.getComponent(playerEid, 'status');
        if (!status) {
            status = {lightBoost: 0, speedBoost: 0, strengthBoost: 0};
            Game.ECS.addComponent(playerEid, 'status', status);
        }
        return status;
    }
};

// Replace the original ItemEffects
Object.assign(ItemEffects, EnhancedItemEffects);

// Enhanced item pickup with visual effects
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
                const amount = item.amount || 1;
                Game.state.playerGold += amount;
                Game.stats.goldCollected += amount;
                
                Game.VFX.gold(x, y, amount);
                
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
                
                // Brief pickup effects
                if (rarity === 'epic') {
                    Game.VFX.shake(2, 100);
                } else if (rarity === 'rare') {
                    Game.VFX.shake(1, 50);
                }
                
                Game.ECS.destroyEntity(eid);
                addMessage('Picked up ' + color + name + '.');
                Game.stats.itemsPickedUp++;
            }
        }
    }
}

// Enhanced item creation with visual effects for special items
function createItemFromData(data, x, y) {
    const eid = createEntity();
    addComponent(eid, 'position', {x: x, y: y});
    addComponent(eid, 'item', JSON.parse(JSON.stringify(data)));
    addComponent(eid, 'descriptor', {name: data.name, glyph: data.glyph, color: data.color});
    addComponent(eid, 'blocker', {passable: true});
    
    // Subtle, slow pulses for items on the ground
    if (data.rarity === 'epic') {
        Game.VFX.pulse(eid, data.color, 0.002, 0.3); // Slow, subtle pulse
    } else if (data.rarity === 'rare') {
        Game.VFX.pulse(eid, data.color, 0.0015, 0.2); // Even slower, more subtle
    }
    
    return eid;
}