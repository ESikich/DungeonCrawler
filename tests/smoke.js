const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {browserScripts, smokeScripts} = require('../scripts/manifest');

const rootDir = path.resolve(__dirname, '..');

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    navigator: {userAgent: 'node-smoke-test'},
    window: {},
    document: {
        addEventListener() {},
        getElementById() { return null; },
        createElement() { return {}; }
    },
    alert(message) {
        throw new Error(message);
    },
    requestAnimationFrame() {
        return 0;
    },
    cancelAnimationFrame() {}
});

function run(code) {
    return vm.runInContext(code, context);
}

function loadScript(file) {
    const source = fs.readFileSync(path.join(rootDir, file), 'utf8');
    vm.runInContext(source, context, {filename: file});
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

for (const script of smokeScripts) {
    loadScript(script);
}

run(`
    globalThis.fakeRenderer = {
        init() { return true; },
        render() {}
    };
    globalThis.fakeInput = {
        setup() {}
    };
`);

function testEventBusResetScopes() {
    const result = run(`
        let appCount = 0;
        let sessionCount = 0;
        Game.Events.on('smoke.scope', function() { appCount++; });
        Game.Events.on('smoke.scope', function() { sessionCount++; }, {scope: 'session'});
        Game.Events.emit('smoke.scope');
        Game.resetAll();
        Game.Events.emit('smoke.scope');
        ({appCount, sessionCount});
    `);

    assert(result.appCount === 2, 'app event listeners should survive resetAll()');
    assert(result.sessionCount === 1, 'session event listeners should be cleared by resetAll()');
}

function testNamespaceAliases() {
    const result = run(`
        ({
            itemDataFor: Game.Items.dataFor === itemDataFor,
            itemCreate: Game.Items.create === createItem,
            itemCreateFromData: Game.Items.createFromData === createItemFromData,
            itemSpawn: Game.Items.spawnAvoiding === spawnItemsAvoiding,
            itemDropLoot: Game.Items.dropLoot === dropLoot,
            itemPickup: Game.Items.pickupAt === pickupItemsAt,
            itemUse: Game.Items.useInventoryItem === useInventoryItem,
            itemDrop: Game.Items.dropInventoryItem === dropInventoryItem,
            monsterDataFor: Game.Monsters.dataFor === monsterDataFor,
            monsterCreateFromData: Game.Monsters.createFromData === createMonsterFromData,
            monsterSpawn: Game.Monsters.spawnAvoiding === spawnMonstersModular,
            monsterProcessAI: Game.Monsters.processAI === processMonsterAI
        });
    `);

    for (const [name, matches] of Object.entries(result)) {
        assert(matches, `namespace alias should match legacy function: ${name}`);
    }
}

function testIndexScriptOrderMatchesManifest() {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    const scriptSources = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(match => match[1]);

    assert(
        JSON.stringify(scriptSources) === JSON.stringify(browserScripts),
        'index.html script order should match scripts/manifest.js browserScripts'
    );
}

function initializeSession() {
    run(`
        Game.Controller.init({
            canvasId: 'smokeCanvas',
            renderer: fakeRenderer,
            inputHandler: fakeInput
        });
        Game.Controller.initGame();
    `);
}

function testGeneratedDungeon() {
    const result = run(`
        const playerPos = Game.ECS.getComponent(Game.world.playerEid, 'position');
        const playerHealth = Game.ECS.getComponent(Game.world.playerEid, 'health');
        ({
            rooms: Game.world.rooms.length,
            gridRows: Game.world.dungeonGrid.length,
            gridCols: Game.world.dungeonGrid[0] ? Game.world.dungeonGrid[0].length : 0,
            playerEid: Game.world.playerEid,
            playerWalkable: playerPos ? Game.world.dungeonGrid[playerPos.y][playerPos.x].walkable : false,
            playerHp: playerHealth ? playerHealth.hp : 0,
            stairsX: Game.world.stairsPos.x,
            stairsY: Game.world.stairsPos.y
        });
    `);

    assert(result.rooms > 0, 'dungeon generation should create at least one room');
    assert(result.gridRows === 17, 'dungeon grid should have expected row count');
    assert(result.gridCols === 25, 'dungeon grid should have expected column count');
    assert(Number.isInteger(result.playerEid), 'player entity should be created');
    assert(result.playerWalkable, 'player should spawn on a walkable tile');
    assert(result.playerHp === 100, 'player should start with expected HP');
    assert(Number.isInteger(result.stairsX) && Number.isInteger(result.stairsY), 'stairs should be placed');
}

function testStairsReachable() {
    const reachable = run(`
        (function() {
            const playerPos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const target = Game.world.stairsPos;
            const seen = new Set();
            const queue = [{x: playerPos.x, y: playerPos.y}];
            let head = 0;

            while (head < queue.length) {
                const current = queue[head++];
                const key = current.x + ',' + current.y;
                if (seen.has(key)) continue;
                seen.add(key);

                if (current.x === target.x && current.y === target.y) {
                    return true;
                }

                for (const dir of [[1,0], [-1,0], [0,1], [0,-1]]) {
                    const nx = current.x + dir[0];
                    const ny = current.y + dir[1];
                    if (inBounds(nx, ny) && Game.world.dungeonGrid[ny][nx].walkable) {
                        queue.push({x: nx, y: ny});
                    }
                }
            }
            return false;
        })();
    `);

    assert(reachable, 'stairs should be reachable from the player spawn');
}

function testTurnProcessing() {
    const result = run(`
        const before = Game.state.turnCount;
        Game.Systems.TurnProcessor.process();
        ({
            before,
            after: Game.state.turnCount,
            playerExists: !!Game.ECS.getComponent(Game.world.playerEid, 'position')
        });
    `);

    assert(result.after >= result.before, 'turn processing should not move turn count backward');
    assert(result.playerExists, 'player should still exist after processing a turn');
}

function testCombatDamageEvent() {
    const result = run(`
        (function() {
            let damageEvents = 0;
            let lastAmount = 0;
            const unsubscribe = Game.Events.on('combat.damage', function(event) {
                damageEvents++;
                lastAmount = event.amount;
            }, {scope: 'session'});

            const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const targetId = Game.ECS.createEntity();
            Game.ECS.addComponent(targetId, 'position', {x: ppos.x, y: ppos.y});
            Game.ECS.addComponent(targetId, 'health', {hp: 999, maxHp: 999});
            Game.ECS.addComponent(targetId, 'descriptor', {name: 'Training Dummy', glyph: 'd', color: 'gray'});
            Game.ECS.addComponent(targetId, 'blocker', {passable: false});

            Game.Systems.Combat.handleAttack(Game.world.playerEid, targetId);
            unsubscribe();

            return {
                damageEvents,
                lastAmount,
                remainingHp: Game.ECS.getComponent(targetId, 'health').hp
            };
        })();
    `);

    assert(result.damageEvents === 1, 'combat attacks should emit one combat.damage event');
    assert(result.lastAmount > 0, 'combat.damage should include a positive damage amount');
    assert(result.remainingHp < 999, 'combat attack should still apply damage');
}

function testItemCreatedEvent() {
    const result = run(`
        (function() {
            let createdEvents = 0;
            let createdName = null;
            const unsubscribe = Game.Events.on('item.created', function(event) {
                createdEvents++;
                createdName = event.item && event.item.name;
            }, {scope: 'session'});

            const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const itemId = Game.Items.create('potion', ppos.x, ppos.y);
            unsubscribe();

            return {
                createdEvents,
                createdName,
                hasItem: !!Game.ECS.getComponent(itemId, 'item')
            };
        })();
    `);

    assert(result.createdEvents === 1, 'Game.Items.create should emit one item.created event');
    assert(result.createdName === 'Healing Potion', 'item.created should include item data');
    assert(result.hasItem, 'Game.Items.create should still create an item entity');
}

function testMonsterCreatedEvent() {
    const result = run(`
        (function() {
            let createdEvents = 0;
            let createdName = null;
            const unsubscribe = Game.Events.on('monster.created', function(event) {
                createdEvents++;
                createdName = event.descriptor && event.descriptor.name;
            }, {scope: 'session'});

            const ppos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const monsterId = Game.Monsters.createFromData(Game.Monsters.dataFor('slime'), ppos.x, ppos.y);
            unsubscribe();

            return {
                createdEvents,
                createdName,
                hasAi: !!Game.ECS.getComponent(monsterId, 'ai')
            };
        })();
    `);

    assert(result.createdEvents === 1, 'Game.Monsters.createFromData should emit one monster.created event');
    assert(result.createdName === 'Green Slime', 'monster.created should include descriptor data');
    assert(result.hasAi, 'Game.Monsters.createFromData should still create an AI entity');
}

testIndexScriptOrderMatchesManifest();
testEventBusResetScopes();
testNamespaceAliases();
initializeSession();
testGeneratedDungeon();
testStairsReachable();
testTurnProcessing();
testCombatDamageEvent();
testItemCreatedEvent();
testMonsterCreatedEvent();

console.log('Smoke tests passed');
