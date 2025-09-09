/** =========================
 *  Monster System - Modular Monster Registry
 *  
 *  HOW TO ADD NEW MONSTERS:
 *  1. Add to MonsterRegistry below, OR
 *  2. Use helper functions + registerMonster() for common patterns:
 *     
 *     // Basic melee monsters
 *     registerMonster('skeleton', MonsterHelpers.meleeMonster('Skeleton', 20, 10, 7, 6, 3, 'S', 'white', 10));
 *     registerMonster('zombie', MonsterHelpers.meleeMonster('Zombie', 30, 8, 5, 4, 2, 'z', 'green', 8));
 *     
 *     // Wandering creatures
 *     registerMonster('rat', MonsterHelpers.wanderingMonster('Giant Rat', 8, 6, 8, 7, 4, 'r', 'brown', 3));
 *     
 *     // Custom behavior monsters
 *     registerMonster('assassin', MonsterHelpers.customMonster('Shadow Assassin', {
 *         health: {hp: 15, maxHp: 15},
 *         stats: {strength: 12, agility: 16, accuracy: 10, evasion: 8},
 *         behavior: 'stealth',  // Custom AI behavior
 *         moveSpeed: 2          // Special properties
 *     }));
 *  
 *  3. For custom AI behaviors, add to MonsterBehaviors object
 *  ========================= */

// Monster AI Behaviors - Add new behaviors here
const MonsterBehaviors = {
    // Standard chase behavior
    chase: {
        needsActivation: true,
        process(eid, ai, pos, ppos, desc) {
            if (Game.Systems.Vision.canSeePlayer(eid)) {
                ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
            }

            if (ai.lastPlayerPos) {
                const tx = ai.lastPlayerPos.x, ty = ai.lastPlayerPos.y;
                const dx = tx - pos.x, dy = ty - pos.y;
                let mx = 0, my = 0;

                if (Math.abs(dx) > Math.abs(dy)) mx = dx > 0 ? 1 : -1;
                else if (dy !== 0) my = dy > 0 ? 1 : -1;

                if (mx !== 0 || my !== 0) {
                    Game.ECS.postEvent({type: 'move', entityId: eid, toX: pos.x + mx, toY: pos.y + my});
                }
            }
        }
    },

    // Random wandering behavior
    random: {
        needsActivation: false,
        process(eid, ai, pos, ppos, desc) {
            if (Math.random() < 0.7) { // 70% chance to move
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
        }
    },

    // Cautious behavior - moves away if player gets too close
    cautious: {
        needsActivation: true,
        process(eid, ai, pos, ppos, desc) {
            const dx = ppos.x - pos.x;
            const dy = ppos.y - pos.y;
            const distance = Math.abs(dx) + Math.abs(dy);

            if (distance <= 2) {
                // Run away!
                let mx = dx > 0 ? -1 : dx < 0 ? 1 : 0;
                let my = dy > 0 ? -1 : dy < 0 ? 1 : 0;
                
                // If can't move directly away, try perpendicular
                if (mx === 0 && my === 0) {
                    const perpendicular = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    const randomDir = perpendicular[Math.floor(Math.random() * perpendicular.length)];
                    mx = randomDir[0];
                    my = randomDir[1];
                }

                Game.ECS.postEvent({type: 'move', entityId: eid, toX: pos.x + mx, toY: pos.y + my});
            } else if (distance <= 4 && Math.random() < 0.3) {
                // Sometimes move randomly when nearby
                const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                const randomDir = directions[Math.floor(Math.random() * directions.length)];
                Game.ECS.postEvent({
                    type: 'move', 
                    entityId: eid, 
                    toX: pos.x + randomDir[0], 
                    toY: pos.y + randomDir[1]
                });
            }
        }
    },

    // Aggressive behavior - always moves toward player when active
    aggressive: {
        needsActivation: true,
        process(eid, ai, pos, ppos, desc) {
            // Always move toward player, no memory needed
            const dx = ppos.x - pos.x;
            const dy = ppos.y - pos.y;
            let mx = 0, my = 0;

            if (Math.abs(dx) > Math.abs(dy)) mx = dx > 0 ? 1 : -1;
            else if (dy !== 0) my = dy > 0 ? 1 : -1;

            if (mx !== 0 || my !== 0) {
                Game.ECS.postEvent({type: 'move', entityId: eid, toX: pos.x + mx, toY: pos.y + my});
            }
        }
    }
};

// Monster Registry - Add new monsters here!
const MonsterRegistry = {
    // === ORIGINAL MONSTERS ===
    'slime': {
        name: 'Green Slime', glyph: 's', color: 'green',
        health: {hp: 15, maxHp: 15},
        stats: {strength: 8, agility: 6, accuracy: 5, evasion: 2},
        behavior: 'random',
        xpValue: {xp: 5},
        lootTable: {
            drops: [
                {type: 'gold', amount: [2, 8], chance: 0.6},
                {type: 'potion', chance: 0.3},
                {type: 'scroll', chance: 0.1}
            ]
        }
    },

    'orc': {
        name: 'Orc Warrior', glyph: 'o', color: 'red',
        health: {hp: 25, maxHp: 25},
        stats: {strength: 12, agility: 8, accuracy: 8, evasion: 4},
        behavior: 'chase',
        xpValue: {xp: 12},
        lootTable: {
            drops: [
                {type: 'gold', amount: [5, 15], chance: 0.7},
                {type: 'potion', chance: 0.4},
                {type: 'strength', chance: 0.2},
                {type: 'bomb', chance: 0.3}
            ]
        }
    },

    'goblin': {
        name: 'Goblin', glyph: 'g', color: 'brown',
        health: {hp: 12, maxHp: 12},
        stats: {strength: 6, agility: 12, accuracy: 7, evasion: 6},
        behavior: 'chase',
        xpValue: {xp: 8},
        lootTable: {
            drops: [
                {type: 'gold', amount: [3, 10], chance: 0.65},
                {type: 'speed', chance: 0.25},
                {type: 'scroll', chance: 0.2},
                {type: 'vision', chance: 0.15}
            ]
        }
    },

    // === NEW MONSTERS (examples) ===
    'rat': {
        name: 'Giant Rat', glyph: 'r', color: 'brown',
        health: {hp: 8, maxHp: 8},
        stats: {strength: 4, agility: 10, accuracy: 6, evasion: 7},
        behavior: 'cautious',
        xpValue: {xp: 3},
        lootTable: {
            drops: [
                {type: 'gold', amount: [1, 3], chance: 0.4}
            ]
        }
    },

    'berserker': {
        name: 'Berserker', glyph: 'B', color: 'red',
        health: {hp: 35, maxHp: 35},
        stats: {strength: 16, agility: 6, accuracy: 9, evasion: 2},
        behavior: 'aggressive',
        xpValue: {xp: 20},
        lootTable: {
            drops: [
                {type: 'gold', amount: [10, 25], chance: 0.8},
                {type: 'strength', chance: 0.5},
                {type: 'megaHeal', chance: 0.3}
            ]
        }
    }
};

// Helper functions to easily create new monsters
const MonsterHelpers = {
    // Create a basic melee monster with chase behavior
    meleeMonster(name, hp, str, agi, acc, eva, glyph, color, xp, lootChance = 0.6) {
        return {
            name, glyph, color,
            health: {hp, maxHp: hp},
            stats: {strength: str, agility: agi, accuracy: acc, evasion: eva},
            behavior: 'chase',
            xpValue: {xp},
            lootTable: {
                drops: [
                    {type: 'gold', amount: [Math.floor(xp * 0.5), Math.floor(xp * 1.5)], chance: lootChance},
                    {type: 'potion', chance: lootChance * 0.5}
                ]
            }
        };
    },

    // Create a wandering monster with random movement
    wanderingMonster(name, hp, str, agi, acc, eva, glyph, color, xp) {
        return {
            name, glyph, color,
            health: {hp, maxHp: hp},
            stats: {strength: str, agility: agi, accuracy: acc, evasion: eva},
            behavior: 'random',
            xpValue: {xp},
            lootTable: {
                drops: [
                    {type: 'gold', amount: [1, Math.floor(xp * 0.8)], chance: 0.4}
                ]
            }
        };
    },

    // Create a cautious monster that runs away
    cautiousMonster(name, hp, str, agi, acc, eva, glyph, color, xp) {
        return {
            name, glyph, color,
            health: {hp, maxHp: hp},
            stats: {strength: str, agility: agi, accuracy: acc, evasion: eva},
            behavior: 'cautious',
            xpValue: {xp},
            lootTable: {
                drops: [
                    {type: 'gold', amount: [Math.floor(xp * 0.3), Math.floor(xp * 1.2)], chance: 0.5}
                ]
            }
        };
    },

    // Create a custom monster with any properties
    customMonster(name, properties) {
        const defaults = {
            name,
            glyph: 'm',
            color: 'white',
            health: {hp: 10, maxHp: 10},
            stats: {strength: 8, agility: 8, accuracy: 6, evasion: 4},
            behavior: 'chase',
            xpValue: {xp: 5},
            lootTable: {
                drops: [{type: 'gold', amount: [1, 5], chance: 0.5}]
            }
        };
        
        return Object.assign(defaults, properties);
    }
};

// Easy way to add new monsters to the registry
function registerMonster(id, monsterData) {
    MonsterRegistry[id] = monsterData;
}

// Example of how easy it is to add new monsters:
registerMonster('skeleton', MonsterHelpers.meleeMonster('Skeleton Warrior', 18, 10, 7, 6, 3, 'S', 'white', 10));
registerMonster('spider', MonsterHelpers.cautiousMonster('Giant Spider', 10, 6, 14, 8, 9, 'x', 'purple', 6));
registerMonster('troll', MonsterHelpers.meleeMonster('Cave Troll', 45, 18, 4, 10, 1, 'T', 'green', 25, 0.9));

/**
 * Get monster data definition for a given monster type
 */
function monsterDataFor(type) {
    return MonsterRegistry[type] || MonsterRegistry['goblin']; // Default fallback
}

/**
 * Apply floor-based scaling to monster stats
 */
function scaleMonsterForFloor(monsterData, floor) {
    const scaledData = JSON.parse(JSON.stringify(monsterData)); // Deep copy
    
    if (floor <= 1) {
        return scaledData; // No scaling on first floor
    }
    
    // Calculate scaling factor: 15% increase per floor, with diminishing returns
    const floorDepth = Math.abs(floor);
    const scalingFactor = 1 + (floorDepth - 1) * 0.15 * (1 / (1 + (floorDepth - 1) * 0.05));
    
    // Scale health
    if (scaledData.health) {
        scaledData.health.hp = Math.floor(scaledData.health.hp * scalingFactor);
        scaledData.health.maxHp = scaledData.health.hp;
    }
    
    // Scale combat stats
    if (scaledData.stats) {
        scaledData.stats.strength = Math.floor(scaledData.stats.strength * scalingFactor);
        scaledData.stats.accuracy = Math.floor(scaledData.stats.accuracy * scalingFactor);
        // Agility and evasion scale more slowly to avoid making monsters too hard to hit
        scaledData.stats.agility = Math.floor(scaledData.stats.agility * Math.sqrt(scalingFactor));
        scaledData.stats.evasion = Math.floor(scaledData.stats.evasion * Math.sqrt(scalingFactor));
    }
    
    // Scale XP reward
    if (scaledData.xpValue) {
        scaledData.xpValue.xp = Math.floor(scaledData.xpValue.xp * scalingFactor);
    }
    
    // Scale gold drops
    if (scaledData.lootTable && scaledData.lootTable.drops) {
        for (const drop of scaledData.lootTable.drops) {
            if (drop.type === 'gold' && drop.amount) {
                drop.amount = drop.amount.map(amount => Math.floor(amount * scalingFactor));
            }
        }
    }
    
    // Update name to reflect scaling on deeper floors
    if (floorDepth >= 5) {
        const prefixes = ['Elite', 'Veteran', 'Ancient', 'Cursed', 'Shadow'];
        const prefix = prefixes[Math.min(Math.floor((floorDepth - 5) / 2), prefixes.length - 1)];
        scaledData.name = `${prefix} ${scaledData.name}`;
    }
    
    return scaledData;
}

/**
 * Create a monster entity from monster data with floor scaling
 */
function createMonsterFromData(data, x, y, ecs = Game.ECS) {
    const floor = Game.state.floor;
    const scaledData = scaleMonsterForFloor(data, floor);
    
    const eid = ecs.createEntity();
    ecs.addComponent(eid, 'position', {x: x, y: y});
    ecs.addComponent(eid, 'vision', {radius: 6, visible: new Set(), seen: new Set()});
    ecs.addComponent(eid, 'blocker', {passable: false});
    ecs.addComponent(eid, 'ai', {
        behavior: scaledData.behavior || 'chase',
        lastPlayerPos: null,
        active: false
    });
    ecs.addComponent(eid, 'descriptor', {
        name: scaledData.name,
        glyph: scaledData.glyph,
        color: scaledData.color
    });

    // Add all other components from the scaled monster data
    for (const [componentType, componentData] of Object.entries(scaledData)) {
        if (componentType !== 'name' && componentType !== 'glyph' && componentType !== 'color' && componentType !== 'behavior') {
            ecs.addComponent(eid, componentType, JSON.parse(JSON.stringify(componentData)));
        }
    }
    
    return eid;
}

/**
 * NEW: Monster spawning function that uses the modular system
 */
function spawnMonstersModular(px, py, world = Game.world, ecs = Game.ECS, customMonsterPool = null) {
    // Define monster pools based on current floor for variety
    const floor = Math.abs(Game.state.floor);
    let monsterPool;
    
    if (customMonsterPool) {
        monsterPool = customMonsterPool;
    } else if (floor <= 2) {
        // Early floors - mostly weak monsters
        monsterPool = {
            common: ['slime', 'rat', 'goblin'],
            uncommon: ['orc'],
            rare: ['skeleton']
        };
    } else if (floor <= 5) {
        // Mid floors - more variety
        monsterPool = {
            common: ['goblin', 'orc', 'skeleton'],
            uncommon: ['slime', 'spider', 'berserker'],
            rare: ['troll']
        };
    } else {
        // Deep floors - tougher monsters
        monsterPool = {
            common: ['orc', 'skeleton', 'berserker'],
            uncommon: ['spider', 'troll'],
            rare: ['berserker', 'troll'] // More dangerous
        };
    }
    
    // Spawn more monsters on deeper floors
    const baseMonsterCount = Math.min(world.rooms.length, 6);
    const extraMonsters = Math.floor(floor / 3); // +1 monster every 3 floors
    const totalMonsters = Math.min(baseMonsterCount + extraMonsters, world.rooms.length);

    for (let i = 0; i < totalMonsters; i++) {
        if (Math.random() < 0.7) {
            const r = world.rooms[i];
            const x = randInt(r.x, r.x + r.width - 1);
            const y = randInt(r.y, r.y + r.height - 1);
            if (x === px && y === py) continue;
            
            // Choose monster type based on rarity
            let monsterType;
            const roll = Math.random();
            
            if (roll < 0.6 && monsterPool.common) {
                monsterType = monsterPool.common[randInt(0, monsterPool.common.length - 1)];
            } else if (roll < 0.9 && monsterPool.uncommon) {
                monsterType = monsterPool.uncommon[randInt(0, monsterPool.uncommon.length - 1)];
            } else if (monsterPool.rare) {
                monsterType = monsterPool.rare[randInt(0, monsterPool.rare.length - 1)];
            } else {
                // Fallback to common if no rare/uncommon available
                monsterType = monsterPool.common[randInt(0, monsterPool.common.length - 1)];
            }
            
            createMonsterFromData(monsterDataFor(monsterType), x, y, ecs);
        }
    }
}

/**
 * Updated AI system to handle the new behavior system
 */
function processMonsterAI() {
    // Check if player has speed boost - if so, enemies move less frequently
    const playerStatus = Game.ECS.getComponent(Game.world.playerEid, 'status');
    const playerSpeedBoost = playerStatus && playerStatus.speedBoost > 0;
    
    // If player is speed boosted, enemies only move 50% of the time (making player effectively 2x faster)
    if (playerSpeedBoost && Math.random() < 0.5) {
        return; // Skip enemy movement this turn
    }
    
    const aiList = Game.ECS.getEntitiesWith(['ai', 'position', 'health']);
    const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
    
    for (let i = 0; i < aiList.length; i++) {
        const eid = aiList[i];
        const hp = Game.ECS.getComponent(eid, 'health');
        if (!hp || hp.hp <= 0) continue;

        const ai = Game.ECS.getComponent(eid, 'ai');
        const pos = Game.ECS.getComponent(eid, 'position');
        const desc = Game.ECS.getComponent(eid, 'descriptor');

        // Get behavior handler
        const behaviorName = ai.behavior || 'chase';
        const behavior = MonsterBehaviors[behaviorName];
        
        if (!behavior) {
            console.warn(`Unknown monster behavior: ${behaviorName}`);
            continue;
        }

        // Handle activation for behaviors that need it
        if (behavior.needsActivation && !ai.active) {
            if (Game.Systems.Vision.canSeePlayer(eid)) {
                ai.active = true;
                ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
            }
            continue;
        }

        // Process the behavior
        behavior.process(eid, ai, pos, ppos, desc);
    }
}