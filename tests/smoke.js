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
            area: Game.state.area,
            entranceX: Game.world.dungeonEntrancePos.x,
            entranceY: Game.world.dungeonEntrancePos.y
        });
    `);

    assert(result.rooms > 0, 'overworld generation should create at least one region');
    assert(result.gridRows === 17, 'dungeon grid should have expected row count');
    assert(result.gridCols === 25, 'dungeon grid should have expected column count');
    assert(Number.isInteger(result.playerEid), 'player entity should be created');
    assert(result.playerWalkable, 'player should spawn on a walkable tile');
    assert(result.playerHp === 100, 'player should start with expected HP');
    assert(result.area === 'overworld', 'new game should start in the overworld');
    assert(Number.isInteger(result.entranceX) && Number.isInteger(result.entranceY), 'dungeon entrance should be placed');
}

function testOverworldSeedChangesBetweenGames() {
    const result = run(`
        const firstSeed = Game.world.overworldSeed;
        Game.Controller.initGame();
        const secondSeed = Game.world.overworldSeed;
        ({firstSeed, secondSeed});
    `);

    assert(Number.isInteger(result.firstSeed), 'overworld seed should be an integer');
    assert(Number.isInteger(result.secondSeed), 'new overworld seed should be an integer');
    assert(result.firstSeed !== result.secondSeed, 'overworld seed should change between new games');
}

function testStairsReachable() {
    const reachable = run(`
        (function() {
            const playerPos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const target = Game.world.dungeonEntrancePos;
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

    assert(reachable, 'dungeon entrance should be reachable from the player spawn');
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

function testDungeonEntryAndExit() {
    const result = run(`
        (function() {
            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = Math.max(prog.level, 2);
            Game.Systems.World.enterDungeon();
            const dungeonPos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const entryTile = Game.world.dungeonGrid[dungeonPos.y][dungeonPos.x];
            const inDungeon = Game.state.area === 'dungeon' && Game.state.floor === -1;
            const hasUpStairs = entryTile && entryTile.glyph === '<';
            const hasDownStairs = Number.isInteger(Game.world.stairsPos.x) && Number.isInteger(Game.world.stairsPos.y);

            Game.Systems.World.exitDungeon({x: 1, y: 0});
            const overworldPos = Game.ECS.getComponent(Game.world.playerEid, 'position');
            const returnTile = Game.world.dungeonGrid[overworldPos.y][overworldPos.x];
            const entrance = Game.world.dungeonEntrancePos;

            return {
                inDungeon,
                hasUpStairs,
                hasDownStairs,
                area: Game.state.area,
                floor: Game.state.floor,
                returnedWalkable: returnTile && returnTile.walkable,
                returnedOppositeExitSide: overworldPos.x === entrance.x + 1 &&
                    overworldPos.y === entrance.y
            };
        })();
    `);

    assert(result.inDungeon, 'enterDungeon should move the player to dungeon floor -1');
    assert(result.hasUpStairs, 'dungeon entry tile should become an up stair');
    assert(result.hasDownStairs, 'dungeon should still place down stairs');
    assert(result.area === 'overworld' && result.floor === 0, 'exitDungeon should return to the overworld');
    assert(result.returnedWalkable, 'player should return to a walkable overworld tile');
    assert(result.returnedOppositeExitSide, 'player should return on the side matching their stair approach direction');
}

function testDungeonBacktrackingAndPersistence() {
    const result = run(`
        (function() {
            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = Math.max(prog.level, 2);
            Game.Systems.World.enterDungeon();

            let marker = null;
            for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1 && !marker; y++) {
                for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
                    const tile = Game.world.dungeonGrid[y][x];
                    if (tile.walkable && tile.glyph !== '<' && tile.glyph !== '>') {
                        marker = {x, y};
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([1, 2, 3]);
                        break;
                    }
                }
            }

            Game.Systems.World.nextLevel();
            const reachedLowerFloor = Game.state.area === 'dungeon' && Game.state.floor === -2;

            Game.Systems.World.previousLevel();
            const returnedToFirstFloor = Game.state.area === 'dungeon' && Game.state.floor === -1;
            const markerTile = marker ? Game.world.dungeonGrid[marker.y][marker.x] : null;
            const markerPersisted = markerTile && markerTile.color[0] === 1 &&
                markerTile.color[1] === 2 && markerTile.color[2] === 3;

            Game.Systems.World.previousLevel();

            return {
                reachedLowerFloor,
                returnedToFirstFloor,
                markerPersisted,
                finalArea: Game.state.area,
                finalFloor: Game.state.floor
            };
        })();
    `);

    assert(result.reachedLowerFloor, 'nextLevel should descend to floor -2');
    assert(result.returnedToFirstFloor, 'previousLevel from floor -2 should return to floor -1');
    assert(result.markerPersisted, 'returning to a dungeon floor should restore the existing layout');
    assert(result.finalArea === 'overworld' && result.finalFloor === 0, 'previousLevel from floor -1 should exit to the overworld');
}

function testDungeonMaxDepthMatchesEntryLevel() {
    const result = run(`
        (function() {
            if (Game.state.area !== 'overworld') {
                Game.Systems.World.exitDungeon();
            }

            let section = null;
            for (let sy = -5; sy <= 5 && !section; sy++) {
                for (let sx = -5; sx <= 5; sx++) {
                    const id = sx + ',' + sy;
                    if ((sx !== 0 || sy !== 0) && sectionHasDungeon({x: sx, y: sy}) && !Game.world.dungeons[id]) {
                        section = {x: sx, y: sy};
                        break;
                    }
                }
            }
            if (!section) return {foundSection: false};

            Game.Systems.World.loadOverworldSection(section);
            const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
            p.x = Game.world.dungeonEntrancePos.x;
            p.y = Game.world.dungeonEntrancePos.y;

            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = 1;
            Game.Systems.World.enterDungeon();
            const hasDownStairs = Number.isInteger(Game.world.stairsPos.x) && Number.isInteger(Game.world.stairsPos.y);
            Game.Systems.World.nextLevel();

            const stoppedAtFirstFloor = Game.state.area === 'dungeon' && Game.state.floor === -1;
            const activeDungeon = Game.Systems.World.getActiveDungeon();
            const maxDepth = activeDungeon ? activeDungeon.maxDepth : null;

            Game.Systems.World.exitDungeon();
            return {foundSection: true, stoppedAtFirstFloor, maxDepth, hasDownStairs};
        })();
    `);

    assert(result.foundSection, 'the sampled overworld should include a fresh dungeon chunk');
    assert(result.stoppedAtFirstFloor, 'dungeons should stop descending past the entry level max depth');
    assert(result.maxDepth === 1, 'dungeon max depth should be set from the player level on entry');
    assert(result.hasDownStairs === false, 'level 1 dungeon entries should not generate down stairs');
}

function testDungeonStairsRespectMaxDepth() {
    const result = run(`
        (function() {
            if (Game.state.area !== 'overworld') {
                Game.Systems.World.exitDungeon();
            }

            let section = null;
            for (let sy = -6; sy <= 6 && !section; sy++) {
                for (let sx = -6; sx <= 6; sx++) {
                    const id = sx + ',' + sy;
                    if ((sx !== 0 || sy !== 0) && sectionHasDungeon({x: sx, y: sy}) && !Game.world.dungeons[id]) {
                        section = {x: sx, y: sy};
                        break;
                    }
                }
            }
            if (!section) return {foundSection: false};

            Game.Systems.World.loadOverworldSection(section);
            const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
            p.x = Game.world.dungeonEntrancePos.x;
            p.y = Game.world.dungeonEntrancePos.y;

            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = 1;
            Game.Systems.World.enterDungeon();

            const stairs = {x: p.x + 1, y: p.y};
            Game.world.dungeonGrid[stairs.y][stairs.x] = Tile.stairs();
            const beforeFloor = Game.state.floor;
            p.x = Math.max(0, stairs.x - 1);
            p.y = stairs.y;
            if (!Game.world.dungeonGrid[p.y][p.x].walkable) {
                Game.world.dungeonGrid[p.y][p.x] = Tile.floor();
            }

            Game.Systems.Movement.handleMove(Game.world.playerEid, stairs.x, stairs.y);
            const afterFloor = Game.state.floor;
            const stillActiveDungeon = Game.state.area === 'dungeon' &&
                Game.world.activeDungeonId === section.x + ',' + section.y;

            Game.Systems.World.exitDungeon();
            return {foundSection: true, beforeFloor, afterFloor, stillActiveDungeon};
        })();
    `);

    assert(result.foundSection, 'the sampled overworld should include a fresh dungeon chunk for stair testing');
    assert(result.beforeFloor === -1, 'test should start on dungeon floor -1');
    assert(result.afterFloor === -1, 'walking onto down stairs at max depth should not descend');
    assert(result.stillActiveDungeon, 'down stairs should not re-enter the dungeon as an overworld entrance');
}

function testOldDungeonDepthDoesNotIncreaseAfterLevelUp() {
    const result = run(`
        (function() {
            if (Game.state.area !== 'overworld') {
                Game.Systems.World.exitDungeon();
            }

            let section = null;
            for (let sy = -7; sy <= 7 && !section; sy++) {
                for (let sx = -7; sx <= 7; sx++) {
                    const id = sx + ',' + sy;
                    if ((sx !== 0 || sy !== 0) && sectionHasDungeon({x: sx, y: sy}) && !Game.world.dungeons[id]) {
                        section = {x: sx, y: sy};
                        break;
                    }
                }
            }
            if (!section) return {foundSection: false};

            Game.Systems.World.loadOverworldSection(section);
            const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
            p.x = Game.world.dungeonEntrancePos.x;
            p.y = Game.world.dungeonEntrancePos.y;

            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = 1;
            Game.Systems.World.enterDungeon();
            const firstEntryMaxDepth = Game.Systems.World.getActiveDungeon().maxDepth;
            Game.Systems.World.exitDungeon();

            p.x = Game.world.dungeonEntrancePos.x;
            p.y = Game.world.dungeonEntrancePos.y;
            prog.level = 2;
            Game.Systems.World.enterDungeon();
            const secondEntryMaxDepth = Game.Systems.World.getActiveDungeon().maxDepth;
            const hasDownStairs = Number.isInteger(Game.world.stairsPos.x) && Number.isInteger(Game.world.stairsPos.y);
            Game.Systems.World.nextLevel();
            const stayedOnFirstFloor = Game.state.area === 'dungeon' && Game.state.floor === -1;

            Game.Systems.World.exitDungeon();
            return {foundSection: true, firstEntryMaxDepth, secondEntryMaxDepth, hasDownStairs, stayedOnFirstFloor};
        })();
    `);

    assert(result.foundSection, 'the sampled overworld should include a fresh dungeon chunk for re-entry testing');
    assert(result.firstEntryMaxDepth === 1, 'first entry should lock the dungeon to player level 1');
    assert(result.secondEntryMaxDepth === 1, 're-entering an old dungeon should not increase its max depth');
    assert(result.hasDownStairs === false, 'old level-1 dungeons should not gain down stairs after level up');
    assert(result.stayedOnFirstFloor, 'old level-1 dungeons should still block descent after level up');
}

function testAdditionalDungeonEntrancePersistence() {
    const result = run(`
        (function() {
            if (Game.state.area !== 'overworld') {
                Game.Systems.World.exitDungeon();
            }

            let section = null;
            for (let sy = -4; sy <= 4 && !section; sy++) {
                for (let sx = -4; sx <= 4; sx++) {
                    if ((sx !== 0 || sy !== 0) && sectionHasDungeon({x: sx, y: sy})) {
                        section = {x: sx, y: sy};
                        break;
                    }
                }
            }
            if (!section) return {foundSection: false};

            Game.Systems.World.loadOverworldSection(section);
            const entrance = Game.world.dungeonEntrancePos;
            const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
            p.x = entrance.x;
            p.y = entrance.y;

            const prog = Game.ECS.getComponent(Game.world.playerEid, 'progress');
            prog.level = Math.max(prog.level, 2);
            Game.Systems.World.enterDungeon();
            const dungeonId = Game.world.activeDungeonId;

            let marker = null;
            for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1 && !marker; y++) {
                for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
                    const tile = Game.world.dungeonGrid[y][x];
                    if (tile.walkable && tile.glyph !== '<' && tile.glyph !== '>') {
                        marker = {x, y};
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([9, 8, 7]);
                        break;
                    }
                }
            }

            Game.Systems.World.exitDungeon();
            const returnedToSection = Game.world.overworldSection.x === section.x &&
                Game.world.overworldSection.y === section.y;

            p.x = entrance.x;
            p.y = entrance.y;
            Game.Systems.World.enterDungeon();
            const markerTile = marker ? Game.world.dungeonGrid[marker.y][marker.x] : null;
            const markerPersisted = markerTile && markerTile.color[0] === 9 &&
                markerTile.color[1] === 8 && markerTile.color[2] === 7;
            const reenteredSameDungeon = Game.world.activeDungeonId === dungeonId;

            Game.Systems.World.exitDungeon();

            return {
                foundSection: true,
                returnedToSection,
                markerPersisted,
                reenteredSameDungeon
            };
        })();
    `);

    assert(result.foundSection, 'the sampled overworld should include at least one additional dungeon chunk');
    assert(result.returnedToSection, 'exiting an additional dungeon should return to its overworld chunk');
    assert(result.markerPersisted, 'additional dungeons should save their floor progression independently');
    assert(result.reenteredSameDungeon, 're-entering an additional dungeon should use the same dungeon identity');
}

function testOverworldSectionTravelAndPersistence() {
    const result = run(`
        (function() {
            if (Game.state.area !== 'overworld') {
                Game.Systems.World.exitDungeon();
            }
            Game.Systems.World.loadOverworldSection({x: 0, y: 0});

            Game.world.dungeonGrid[1][1] = Tile.specialFloor([4, 5, 6]);

            const p = Game.ECS.getComponent(Game.world.playerEid, 'position');
            p.x = Game.config.DUNGEON_WIDTH - 1;
            p.y = Math.floor(Game.config.DUNGEON_HEIGHT / 2);
            Game.Systems.Movement.handleMove(Game.world.playerEid, Game.config.DUNGEON_WIDTH, p.y);

            const movedEast = Game.state.area === 'overworld' &&
                Game.world.overworldSection.x === 1 &&
                Game.world.overworldSection.y === 0 &&
                p.x === 0;
            Game.world.overworldTransition = null;

            Game.world.dungeonGrid[2][2] = Tile.specialFloor([7, 8, 9]);

            p.x = 0;
            p.y = Math.floor(Game.config.DUNGEON_HEIGHT / 2);
            Game.Systems.Movement.handleMove(Game.world.playerEid, -1, p.y);

            const returnedWest = Game.world.overworldSection.x === 0 &&
                Game.world.overworldSection.y === 0 &&
                p.x === Game.config.DUNGEON_WIDTH - 1;
            Game.world.overworldTransition = null;
            const marker = Game.world.dungeonGrid[1][1];
            const originPersisted = marker && marker.color[0] === 4 &&
                marker.color[1] === 5 && marker.color[2] === 6;

            p.x = Game.config.DUNGEON_WIDTH - 1;
            p.y = Math.floor(Game.config.DUNGEON_HEIGHT / 2);
            Game.Systems.Movement.handleMove(Game.world.playerEid, Game.config.DUNGEON_WIDTH, p.y);
            const eastMarker = Game.world.dungeonGrid[2][2];
            const eastPersisted = eastMarker && eastMarker.color[0] === 7 &&
                eastMarker.color[1] === 8 && eastMarker.color[2] === 9;

            return {
                movedEast,
                returnedWest,
                originPersisted,
                eastPersisted
            };
        })();
    `);

    assert(result.movedEast, 'walking off the east edge should load the next overworld section');
    assert(result.returnedWest, 'walking off the west edge should return to the previous overworld section');
    assert(result.originPersisted, 'overworld origin section should persist changes');
    assert(result.eastPersisted, 'new overworld sections should persist after being visited');
}

function testOverworldWaterAndBridgeShapes() {
    const result = run(`
        (function() {
            Game.Systems.World.loadOverworldSection({x: 0, y: 0});

            let isolatedWater = 0;
            let invalidBridges = 0;
            let wideBridgeComponents = 0;
            let bridgeComponents = 0;
            const visitedBridge = new Set();

            function isWaterLike(x, y) {
                if (!inBounds(x, y)) return false;
                const special = Game.world.dungeonGrid[y][x].special;
                return special === 'water' || special === 'ocean';
            }

            function isLandLike(x, y) {
                return inBounds(x, y) && !isWaterLike(x, y) &&
                    Game.world.dungeonGrid[y][x].special !== 'bridge';
            }

            function isBridgeApproach(x, y) {
                return inBounds(x, y) &&
                    Game.world.dungeonGrid[y][x].walkable &&
                    !isWaterLike(x, y) &&
                    Game.world.dungeonGrid[y][x].special !== 'bridge' &&
                    Game.world.dungeonGrid[y][x].special !== 'dungeonEntrance';
            }

            function isBridge(x, y) {
                return inBounds(x, y) && Game.world.dungeonGrid[y][x].special === 'bridge';
            }

            for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
                for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                    const special = Game.world.dungeonGrid[y][x].special;
                    if (special === 'water') {
                        let adjacentWater = 0;
                        for (const dir of [[1,0], [-1,0], [0,1], [0,-1]]) {
                            if (isWaterLike(x + dir[0], y + dir[1])) adjacentWater++;
                        }
                        if (adjacentWater === 0) isolatedWater++;
                    }

                    if (special === 'bridge') {
                        let startX = x;
                        let endX = x;
                        while (isBridge(startX - 1, y)) startX--;
                        while (isBridge(endX + 1, y)) endX++;

                        let validSpan = false;
                        if (endX > startX && isBridgeApproach(startX - 1, y) && isBridgeApproach(endX + 1, y)) {
                            validSpan = true;
                            for (let bx = startX; bx <= endX; bx++) {
                                if (!isWaterLike(bx, y - 1) || !isWaterLike(bx, y + 1)) validSpan = false;
                            }
                        }

                        let startY = y;
                        let endY = y;
                        while (isBridge(x, startY - 1)) startY--;
                        while (isBridge(x, endY + 1)) endY++;

                        if (endY > startY && isBridgeApproach(x, startY - 1) && isBridgeApproach(x, endY + 1)) {
                            validSpan = true;
                            for (let by = startY; by <= endY; by++) {
                                if (!isWaterLike(x - 1, by) || !isWaterLike(x + 1, by)) validSpan = false;
                            }
                        }

                        if (!validSpan) invalidBridges++;
                    }

                    if (special === 'bridge') {
                        const key = x + ',' + y;
                        if (!visitedBridge.has(key)) {
                            bridgeComponents++;
                            const stack = [{x, y}];
                            const cells = [];
                            visitedBridge.add(key);

                            while (stack.length > 0) {
                                const current = stack.pop();
                                cells.push(current);

                                for (const dir of [[1,0], [-1,0], [0,1], [0,-1]]) {
                                    const nx = current.x + dir[0];
                                    const ny = current.y + dir[1];
                                    const nkey = nx + ',' + ny;
                                    if (!isBridge(nx, ny) || visitedBridge.has(nkey)) continue;
                                    visitedBridge.add(nkey);
                                    stack.push({x: nx, y: ny});
                                }
                            }

                            const xs = cells.map(cell => cell.x);
                            const ys = cells.map(cell => cell.y);
                            const width = Math.max(...xs) - Math.min(...xs) + 1;
                            const height = Math.max(...ys) - Math.min(...ys) + 1;
                            if (width > 1 && height > 1) wideBridgeComponents++;
                        }
                    }
                }
            }

            return {isolatedWater, invalidBridges, wideBridgeComponents, bridgeComponents};
        })();
    `);

    assert(result.isolatedWater === 0, 'overworld should not generate 1x1 water puddles');
    assert(result.invalidBridges === 0, 'bridges should be one tile wide and connect land across water');
    assert(result.wideBridgeComponents === 0, 'bridges should not become multi-row or multi-column blobs');
    assert(result.bridgeComponents <= 1, 'overworld chunks should have at most one bridge');
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

function testItemTaxonomy() {
    const result = run(`
        (function() {
            const items = Object.values(Game.Items.registry);
            const permanentNonRelics = items
                .filter(item => item.effect === 'permanentBoost' && item.kind !== 'relic')
                .map(item => item.name);
            const relicsWithoutPermanent = items
                .filter(item => item.kind === 'relic' && item.effect !== 'permanentBoost')
                .map(item => item.name);

            return {
                permanentNonRelics,
                relicsWithoutPermanent,
                potionKinds: [
                    'potion', 'minorHeal', 'megaHeal', 'speed', 'ironSkin',
                    'fleetfoot', 'clarity', 'antidote', 'mending'
                ].map(id => Game.Items.dataFor(id).kind),
                elixirKinds: [
                    'strength', 'berserkerRage', 'focusElixir',
                    'graceElixir', 'titanElixir', 'guardianElixir', 'glassFury'
                ].map(id => Game.Items.dataFor(id).kind),
                scrollKinds: [
                    'scroll', 'scrollGreaterLight', 'scrollHaste',
                    'scrollMapping', 'scrollDetection', 'scrollBlink',
                    'scrollSilence', 'scrollWarding'
                ].map(id => Game.Items.dataFor(id).kind),
                relicKinds: [
                    'vitality', 'vision', 'powerStone', 'eyeOfTruth',
                    'heartRelic', 'lensRelic', 'bladeRelic',
                    'featherRelic', 'coinRelic', 'scholarRelic'
                ].map(id => Game.Items.dataFor(id).kind),
                bombKinds: ['bomb', 'bigBomb'].map(id => Game.Items.dataFor(id).kind)
            };
        })();
    `);

    assert(result.permanentNonRelics.length === 0, 'only relics should use permanentBoost');
    assert(result.relicsWithoutPermanent.length === 0, 'all relics should be permanent upgrades');
    assert(result.potionKinds.every(kind => kind === 'potion'), 'potion IDs should be kind=potion');
    assert(result.elixirKinds.every(kind => kind === 'elixir'), 'elixir IDs should be kind=elixir');
    assert(result.scrollKinds.every(kind => kind === 'scroll'), 'scroll IDs should be kind=scroll');
    assert(result.relicKinds.every(kind => kind === 'relic'), 'relic IDs should be kind=relic');
    assert(result.bombKinds.every(kind => kind === 'bomb'), 'bomb IDs should be kind=bomb');
}

function testNewItemEffects() {
    const result = run(`
        (function() {
            const inv = Game.ECS.getComponent(Game.world.playerEid, 'inventory');
            const status = Game.ECS.getComponent(Game.world.playerEid, 'status');
            const stats = Game.ECS.getComponent(Game.world.playerEid, 'stats');
            const hp = Game.ECS.getComponent(Game.world.playerEid, 'health');
            const vision = Game.ECS.getComponent(Game.world.playerEid, 'vision');
            const before = {
                accuracy: stats.accuracy,
                evasion: stats.evasion,
                agility: stats.agility,
                strength: stats.strength,
                maxHp: hp.maxHp,
                vision: vision.radius,
                goldMultiplier: Game.state.goldMultiplier,
                xpMultiplier: Game.state.xpMultiplier
            };

            function use(id) {
                inv.items.push(JSON.parse(JSON.stringify(Game.Items.dataFor(id))));
                return Game.Items.useInventoryItem(inv.items.length - 1);
            }

            const used = {
                ironSkin: use('ironSkin'),
                mending: use('mending'),
                focus: use('focusElixir'),
                grace: use('graceElixir'),
                guardian: use('guardianElixir'),
                glassFury: use('glassFury'),
                blink: use('scrollBlink'),
                warding: use('scrollWarding'),
                coin: use('coinRelic'),
                scholar: use('scholarRelic'),
                feather: use('featherRelic')
            };

            return {
                used,
                damageReductionBoost: status.damageReductionBoost,
                regenBoost: status.regenBoost,
                accuracyDelta: stats.accuracy - before.accuracy,
                evasionDelta: stats.evasion - before.evasion,
                agilityDelta: stats.agility - before.agility,
                strengthDelta: stats.strength - before.strength,
                maxHpDelta: hp.maxHp - before.maxHp,
                wardingBoost: status.wardingBoost,
                goldMultiplier: Game.state.goldMultiplier,
                xpMultiplier: Game.state.xpMultiplier
            };
        })();
    `);

    assert(Object.values(result.used).every(Boolean), 'new representative items should be usable');
    assert(result.damageReductionBoost > 0, 'Iron Skin should set damage reduction');
    assert(result.regenBoost > 0, 'Mending should set regeneration');
    assert(result.accuracyDelta >= 3, 'Focus should increase accuracy');
    assert(result.evasionDelta >= 0, 'Grace/Glass Fury/Feather combined should not break evasion');
    assert(result.agilityDelta >= 2, 'Feather/Grace should increase agility');
    assert(result.strengthDelta >= 12, 'Glass Fury should increase strength');
    assert(result.maxHpDelta >= 20, 'Guardian should increase max HP temporarily');
    assert(result.wardingBoost > 0, 'Warding should set warding status');
    assert(result.goldMultiplier > 1, 'Coin Relic should increase gold multiplier');
    assert(result.xpMultiplier > 1, 'Scholar Relic should increase XP multiplier');
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
testOverworldSeedChangesBetweenGames();
testStairsReachable();
testTurnProcessing();
testDungeonEntryAndExit();
testDungeonBacktrackingAndPersistence();
testDungeonMaxDepthMatchesEntryLevel();
testDungeonStairsRespectMaxDepth();
testOldDungeonDepthDoesNotIncreaseAfterLevelUp();
testAdditionalDungeonEntrancePersistence();
testOverworldSectionTravelAndPersistence();
testOverworldWaterAndBridgeShapes();
testCombatDamageEvent();
testItemCreatedEvent();
testItemTaxonomy();
testNewItemEffects();
testMonsterCreatedEvent();

console.log('Smoke tests passed');
