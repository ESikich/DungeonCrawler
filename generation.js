/** =========================
 *  Enhanced Dungeon Generation System
 *  Multiple generation algorithms, special rooms, and dynamic layouts
 *  ========================= */

// --- Enhanced Tile Constructor ---
function Tile(walkable, opaque, color, glyph, special) {
    this.walkable = walkable;
    this.opaque = opaque;
    this.color = color || [128, 128, 128];
    this.glyph = glyph === undefined ? '?' : glyph;
    this.special = special || null; // For special tile properties
}

Tile.wall = function() {
    return new Tile(false, true, [100, 100, 100], '#');
};

Tile.floor = function() {
    return new Tile(true, false, [50, 50, 50], '.');
};

Tile.stairs = function() {
    return new Tile(true, false, [50, 50, 50], '>', 'downStairs');
};

Tile.upStairs = function() {
    return new Tile(true, false, [50, 50, 50], '<', 'dungeonExit');
};

Tile.grass = function() {
    return new Tile(true, false, [38, 130, 55], '');
};

Tile.lightGrass = function() {
    return new Tile(true, false, [52, 155, 68], '', 'grass');
};

Tile.darkGrass = function() {
    return new Tile(true, false, [28, 105, 45], '', 'grass');
};

Tile.tree = function() {
    return new Tile(false, true, [18, 82, 35], 'T', 'tree');
};

Tile.rock = function() {
    return new Tile(false, true, [105, 105, 95], 'o', 'rock');
};

Tile.sand = function() {
    return new Tile(true, false, [194, 178, 128], '', 'sand');
};

Tile.dungeonEntrance = function() {
    return new Tile(true, false, [0, 0, 0], '', 'dungeonEntrance');
};

Tile.bridge = function() {
    return new Tile(true, false, [126, 82, 42], '=', 'bridge');
};

// New special tiles
Tile.water = function() {
    return new Tile(false, false, [30, 100, 200], '~', 'water');
};

Tile.waterTone = function(color, walkable) {
    return new Tile(walkable === true, false, color, '~', 'water');
};

Tile.shallowWater = function() {
    return Tile.waterTone([62, 156, 224], true);
};

Tile.deepWater = function() {
    return Tile.waterTone([18, 72, 160]);
};

Tile.midDeepWater = function() {
    return Tile.waterTone([12, 56, 140]);
};

Tile.veryDeepWater = function() {
    return Tile.waterTone([6, 34, 105]);
};

Tile.ocean = function() {
    return new Tile(false, false, [26, 108, 184], '~', 'ocean');
};

Tile.oceanTone = function(color, walkable) {
    return new Tile(walkable === true, false, color, '~', 'ocean');
};

Tile.shallowOcean = function() {
    return Tile.oceanTone([56, 162, 210], true);
};

Tile.deepOcean = function() {
    return Tile.oceanTone([8, 42, 118]);
};

Tile.midDeepOcean = function() {
    return Tile.oceanTone([10, 64, 128]);
};

Tile.veryDeepOcean = function() {
    return Tile.oceanTone([4, 42, 96]);
};

Tile.lava = function() {
    return new Tile(false, false, [255, 100, 30], '~', 'lava');
};

Tile.pillar = function() {
    return new Tile(false, true, [120, 120, 120], 'O', 'pillar');
};

Tile.door = function() {
    return new Tile(true, false, [139, 69, 19], '+', 'door');
};

Tile.specialFloor = function(color) {
    return new Tile(true, false, color, '.', 'special');
};

// --- Enhanced Room Constructor ---
function Room(x, y, w, h, type) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.type = type || 'normal';
    this.connected = false;
    this.features = [];
}

Room.prototype.centerX = function() {
    return this.x + Math.floor(this.width / 2);
};

Room.prototype.centerY = function() {
    return this.y + Math.floor(this.height / 2);
};

Room.prototype.intersects = function(other, buffer = 0) {
    return !(this.x + this.width + buffer <= other.x ||
             other.x + other.width + buffer <= this.x ||
             this.y + this.height + buffer <= other.y ||
             other.y + other.height + buffer <= this.y);
};

Room.prototype.getArea = function() {
    return this.width * this.height;
};

Room.prototype.addFeature = function(feature) {
    this.features.push(feature);
};

// --- Generation Algorithms ---
const DungeonGenerators = {
    // Original room-based generation
    rooms: function() {
        initializeGrid();
        const rooms = generateRoomsWithVariety();
        connectAllRooms(rooms);
        return rooms;
    },

    // Cellular automata cave generation
    caves: function() {
        initializeGrid();
        generateCellularCaves();
        const rooms = identifyCaveRooms();
        ensureConnectivity();
        return rooms;
    },

    // Maze-like corridors with rooms
    maze: function() {
        initializeGrid();
        const rooms = generateMazeRooms();
        generateMazeCorridors();
        connectRoomsToMaze(rooms);
        return rooms;
    },

    // Mixed generation combining multiple techniques
    hybrid: function() {
        initializeGrid();
        const rooms = generateHybridLayout();
        addSpecialFeatures(rooms);
        return rooms;
    }
};

// --- Main Generation Function ---
function generateDungeon() {
    Game.state.area = 'dungeon';
    const floor = Math.abs(Game.state.floor);
    
    // Choose generation algorithm based on floor
    let algorithm = 'rooms'; // default
    
    if (floor <= 3) {
        algorithm = Math.random() < 0.8 ? 'rooms' : 'maze';
    } else if (floor <= 6) {
        algorithm = ['rooms', 'caves', 'maze'][randInt(0, 2)];
    } else if (floor <= 10) {
        algorithm = ['caves', 'maze', 'hybrid'][randInt(0, 2)];
    } else {
        algorithm = Math.random() < 0.6 ? 'hybrid' : 'caves';
    }
    
    console.log(`Generating floor ${Game.state.floor} using ${algorithm} algorithm`);
    
    Game.world.rooms = DungeonGenerators[algorithm]();
    
    // Ensure we have at least one room
    if (Game.world.rooms.length === 0) {
        Game.world.rooms = createFallbackRoom();
    }
    
    // Add final touches
    addEnvironmentalHazards();
    validateDungeon();
}

function overworldSectionKey(section) {
    return section.x + ',' + section.y;
}

function dungeonIdForSection(section) {
    return overworldSectionKey(section);
}

function sectionHasDungeon(section) {
    if (section.x === 0 && section.y === 0) return true;
    return overworldRange(section, 905, 0, 8) === 0;
}

function rememberDungeonEntrance(section, entrance) {
    const id = dungeonIdForSection(section);
    if (!Game.world.dungeons[id]) {
        Game.world.dungeons[id] = {
            id: id,
            section: {x: section.x, y: section.y},
            entrance: {x: entrance.x, y: entrance.y},
            maxDepth: null
        };
    } else {
        Game.world.dungeons[id].section = {x: section.x, y: section.y};
        Game.world.dungeons[id].entrance = {x: entrance.x, y: entrance.y};
    }
    return Game.world.dungeons[id];
}

function findOverworldDungeonEntrance(section) {
    const preferred = {
        x: overworldRange(section, 906, 3, Game.config.DUNGEON_WIDTH - 4),
        y: overworldRange(section, 907, 3, Game.config.DUNGEON_HEIGHT - 4)
    };
    let best = null;
    let bestDistance = Infinity;

    for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            const tile = Game.world.dungeonGrid[y][x];
            if (!tile || !tile.walkable || tile.special === 'bridge') continue;

            const distance = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
            if (distance < bestDistance) {
                best = {x: x, y: y};
                bestDistance = distance;
            }
        }
    }

    return best || {x: Math.floor(Game.config.DUNGEON_WIDTH / 2), y: Math.floor(Game.config.DUNGEON_HEIGHT / 2)};
}

function placeDungeonEntranceForSection(section) {
    if (!sectionHasDungeon(section)) return null;

    const entrance = section.x === 0 && section.y === 0
        ? { x: Math.floor(Game.config.DUNGEON_WIDTH / 2), y: 4 }
        : findOverworldDungeonEntrance(section);
    applyOverworldTile(entrance.x, entrance.y, Tile.dungeonEntrance());
    rememberDungeonEntrance(section, entrance);
    return entrance;
}

function overworldNoise(section, x, y, salt) {
    const seed = Game.world.overworldSeed || 1;
    const n = Math.sin(seed + (section.x * 92821) + (section.y * 68917) + (x * 197) + (y * 389) + salt) * 10000;
    return n - Math.floor(n);
}

function overworldRandom(section, salt) {
    return overworldNoise(section, 0, 0, salt);
}

function overworldRange(section, salt, min, max) {
    return Math.floor(overworldRandom(section, salt) * (max - min + 1)) + min;
}

function applyOverworldTile(x, y, tile) {
    if (inBounds(x, y)) Game.world.dungeonGrid[y][x] = tile;
}

function growOverworldPatch(section, seeds, tileFactory, targetSize, salt, options) {
    const frontier = seeds.slice();
    const painted = new Set();
    const avoidWater = !options || options.avoidWater !== false;
    const spreadCutoff = options && options.spreadCutoff !== undefined ? options.spreadCutoff : 0.18;
    let attempts = 0;

    while (frontier.length > 0 && painted.size < targetSize && attempts < targetSize * 12) {
        attempts++;
        const index = Math.floor(overworldRandom(section, salt + attempts) * frontier.length);
        const current = frontier.splice(index, 1)[0];
        const key = current.x + ',' + current.y;

        if (!inBounds(current.x, current.y) || painted.has(key)) continue;
        if (avoidWater && Game.world.dungeonGrid[current.y][current.x].special === 'water') continue;

        applyOverworldTile(current.x, current.y, tileFactory());
        painted.add(key);

        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < dirs.length; i++) {
            const nx = current.x + dirs[i][0];
            const ny = current.y + dirs[i][1];
            if (!inBounds(nx, ny)) continue;

            const spread = overworldNoise(section, nx, ny, salt + attempts + i * 19);
            if (spread > spreadCutoff) frontier.push({x: nx, y: ny});
        }
    }
}

function carveOverworldPathTile(cx, cy) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= 1) {
                const x = cx + dx;
                const y = cy + dy;
                if (!inBounds(x, y)) continue;
                if (Game.world.dungeonGrid[y][x].special === 'water' ||
                    Game.world.dungeonGrid[y][x].special === 'ocean') {
                    continue;
                } else {
                    applyOverworldTile(x, y, Tile.grass());
                }
            }
        }
    }
}

function carveOrganicOverworldPath(section, x1, y1, x2, y2, salt) {
    let x = x1;
    let y = y1;
    let steps = 0;
    const maxSteps = Game.config.DUNGEON_WIDTH * Game.config.DUNGEON_HEIGHT;

    carveOverworldPathTile(x, y);
    while ((x !== x2 || y !== y2) && steps < maxSteps) {
        steps++;
        const dx = Math.sign(x2 - x);
        const dy = Math.sign(y2 - y);
        const horizontalBias = Math.abs(x2 - x) >= Math.abs(y2 - y);
        const n = overworldNoise(section, x, y, salt + steps * 17);

        if (n < 0.18) {
            if (horizontalBias && y !== y2) y += dy;
            else if (!horizontalBias && x !== x2) x += dx;
            else if (x !== x2) x += dx;
            else if (y !== y2) y += dy;
        } else if (n > 0.84) {
            if (horizontalBias && y > 1 && y < Game.config.DUNGEON_HEIGHT - 2) {
                y += overworldNoise(section, x, y, salt + steps * 29) > 0.5 ? 1 : -1;
            } else if (!horizontalBias && x > 1 && x < Game.config.DUNGEON_WIDTH - 2) {
                x += overworldNoise(section, x, y, salt + steps * 31) > 0.5 ? 1 : -1;
            } else if (horizontalBias && x !== x2) {
                x += dx;
            } else if (y !== y2) {
                y += dy;
            }
        } else if (horizontalBias && x !== x2) {
            x += dx;
        } else if (!horizontalBias && y !== y2) {
            y += dy;
        } else if (x !== x2) {
            x += dx;
        } else if (y !== y2) {
            y += dy;
        }

        x = Math.min(Math.max(x, 0), Game.config.DUNGEON_WIDTH - 1);
        y = Math.min(Math.max(y, 0), Game.config.DUNGEON_HEIGHT - 1);
        carveOverworldPathTile(x, y);
    }
}

function overworldBoundaryValue(value, salt, min, max) {
    const seed = Game.world.overworldSeed || 1;
    const n = Math.sin(seed + value * 7411 + salt * 1999) * 10000;
    const normalized = n - Math.floor(n);
    return Math.floor(normalized * (max - min + 1)) + min;
}

function overworldEdgePoint(section, side) {
    switch (side) {
        case 'west':
            return {x: 0, y: overworldBoundaryValue(section.x, 301, 3, Game.config.DUNGEON_HEIGHT - 4)};
        case 'east':
            return {x: Game.config.DUNGEON_WIDTH - 1, y: overworldBoundaryValue(section.x + 1, 301, 3, Game.config.DUNGEON_HEIGHT - 4)};
        case 'north':
            return {x: overworldBoundaryValue(section.y, 503, 4, Game.config.DUNGEON_WIDTH - 5), y: 0};
        case 'south':
            return {x: overworldBoundaryValue(section.y + 1, 503, 4, Game.config.DUNGEON_WIDTH - 5), y: Game.config.DUNGEON_HEIGHT - 1};
    }
    return {x: Math.floor(Game.config.DUNGEON_WIDTH / 2), y: Math.floor(Game.config.DUNGEON_HEIGHT / 2)};
}

function carveOverworldTrails(section) {
    const hub = {
        x: overworldRange(section, 211, 7, Game.config.DUNGEON_WIDTH - 8),
        y: overworldRange(section, 212, 5, Game.config.DUNGEON_HEIGHT - 6)
    };
    const west = overworldEdgePoint(section, 'west');
    const east = overworldEdgePoint(section, 'east');
    const north = overworldEdgePoint(section, 'north');
    const south = overworldEdgePoint(section, 'south');

    carveOrganicOverworldPath(section, west.x, west.y, hub.x, hub.y, 220);
    carveOrganicOverworldPath(section, hub.x, hub.y, east.x, east.y, 240);

    if (overworldRandom(section, 260) > 0.25) {
        const branchTarget = overworldRandom(section, 261) > 0.5 ? north : south;
        carveOrganicOverworldPath(section, hub.x, hub.y, branchTarget.x, branchTarget.y, 280);
    } else {
        carveOrganicOverworldPath(section, north.x, north.y, hub.x, hub.y, 300);
        carveOrganicOverworldPath(section, hub.x, hub.y, south.x, south.y, 320);
    }
}

function isWaterLike(x, y) {
    if (!inBounds(x, y)) return false;
    const special = Game.world.dungeonGrid[y][x].special;
    return special === 'water' || special === 'ocean';
}

function isLandLike(x, y) {
    return inBounds(x, y) && !isWaterLike(x, y) && Game.world.dungeonGrid[y][x].special !== 'bridge';
}

function isBridgeApproach(x, y) {
    return inBounds(x, y) &&
        Game.world.dungeonGrid[y][x].walkable &&
        !isWaterLike(x, y) &&
        Game.world.dungeonGrid[y][x].special !== 'bridge' &&
        Game.world.dungeonGrid[y][x].special !== 'dungeonEntrance';
}

function cleanupTinyWater() {
    const toGrass = [];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            if (Game.world.dungeonGrid[y][x].special !== 'water') continue;

            let adjacentWater = 0;
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (let i = 0; i < dirs.length; i++) {
                if (isWaterLike(x + dirs[i][0], y + dirs[i][1])) adjacentWater++;
            }

            if (adjacentWater === 0) toGrass.push({x, y});
        }
    }

    for (let i = 0; i < toGrass.length; i++) {
        applyOverworldTile(toGrass[i].x, toGrass[i].y, Tile.grass());
    }
}

function waterRunLength(x, y, dx, dy) {
    let length = 0;
    let cx = x;
    let cy = y;

    while (isWaterLike(cx, cy)) {
        length++;
        cx += dx;
        cy += dy;
    }

    return length;
}

function waterBodyTouchesChunkEdge(seeds) {
    const visited = new Set();
    const stack = seeds.slice();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (stack.length > 0) {
        const current = stack.pop();
        const key = current.x + ',' + current.y;
        if (visited.has(key) || !isWaterLike(current.x, current.y)) continue;

        visited.add(key);

        if (current.x === 0 ||
            current.y === 0 ||
            current.x === Game.config.DUNGEON_WIDTH - 1 ||
            current.y === Game.config.DUNGEON_HEIGHT - 1) {
            return true;
        }

        for (let i = 0; i < dirs.length; i++) {
            stack.push({x: current.x + dirs[i][0], y: current.y + dirs[i][1]});
        }
    }

    return false;
}

function horizontalWaterRunTouchesChunkEdge(startX, endX, y) {
    const seeds = [];
    for (let x = startX; x <= endX; x++) {
        seeds.push({x, y});
    }
    return waterBodyTouchesChunkEdge(seeds);
}

function verticalWaterRunTouchesChunkEdge(x, startY, endY) {
    const seeds = [];
    for (let y = startY; y <= endY; y++) {
        seeds.push({x, y});
    }
    return waterBodyTouchesChunkEdge(seeds);
}

function addHorizontalBridgeAcrossRun(startX, endX, y) {
    if (endX - startX + 1 < 2) return false;
    if (startX < 1 || endX > Game.config.DUNGEON_WIDTH - 2) return false;
    if (!horizontalWaterRunTouchesChunkEdge(startX, endX, y)) return false;
    if (!isBridgeApproach(startX - 1, y) || !isBridgeApproach(endX + 1, y)) return false;

    for (let x = startX; x <= endX; x++) {
        if (Game.world.dungeonGrid[y][x].special !== 'water') return false;
    }
    for (let x = startX; x <= endX; x++) {
        if (!isWaterLike(x, y - 1) || !isWaterLike(x, y + 1)) return false;
    }
    const spanLength = endX - startX + 1;
    const centerX = Math.floor((startX + endX) / 2);
    const verticalDepth = 1 +
        waterRunLength(centerX, y - 1, 0, -1) +
        waterRunLength(centerX, y + 1, 0, 1);
    if (spanLength > verticalDepth) return false;

    for (let x = startX; x <= endX; x++) {
        applyOverworldTile(x, y - 1, Tile.water());
        applyOverworldTile(x, y + 1, Tile.water());
    }
    for (let x = startX; x <= endX; x++) {
        applyOverworldTile(x, y, Tile.bridge());
    }
    return true;
}

function addVerticalBridgeAcrossRun(x, startY, endY) {
    if (endY - startY + 1 < 2) return false;
    if (startY < 1 || endY > Game.config.DUNGEON_HEIGHT - 2) return false;
    if (!verticalWaterRunTouchesChunkEdge(x, startY, endY)) return false;
    if (!isBridgeApproach(x, startY - 1) || !isBridgeApproach(x, endY + 1)) return false;

    for (let y = startY; y <= endY; y++) {
        if (Game.world.dungeonGrid[y][x].special !== 'water') return false;
    }
    for (let y = startY; y <= endY; y++) {
        if (!isWaterLike(x - 1, y) || !isWaterLike(x + 1, y)) return false;
    }
    const spanLength = endY - startY + 1;
    const centerY = Math.floor((startY + endY) / 2);
    const horizontalDepth = 1 +
        waterRunLength(x - 1, centerY, -1, 0) +
        waterRunLength(x + 1, centerY, 1, 0);
    if (spanLength > horizontalDepth) return false;

    for (let y = startY; y <= endY; y++) {
        applyOverworldTile(x - 1, y, Tile.water());
        applyOverworldTile(x + 1, y, Tile.water());
    }
    for (let y = startY; y <= endY; y++) {
        applyOverworldTile(x, y, Tile.bridge());
    }
    return true;
}

function hasBridgeNearHorizontalRun(startX, endX, y) {
    for (let yy = y - 1; yy <= y + 1; yy++) {
        for (let x = startX - 1; x <= endX + 1; x++) {
            if (inBounds(x, yy) && Game.world.dungeonGrid[yy][x].special === 'bridge') return true;
        }
    }
    return false;
}

function hasBridgeNearVerticalRun(x, startY, endY) {
    for (let y = startY - 1; y <= endY + 1; y++) {
        for (let xx = x - 1; xx <= x + 1; xx++) {
            if (inBounds(xx, y) && Game.world.dungeonGrid[y][xx].special === 'bridge') return true;
        }
    }
    return false;
}

function addNaturalBridgeCandidates() {
    for (let y = 2; y < Game.config.DUNGEON_HEIGHT - 2; y++) {
        let runStart = null;
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special === 'water') {
                if (runStart === null) runStart = x;
            } else {
                if (runStart !== null) {
                    const runEnd = x - 1;
                    const runLength = runEnd - runStart + 1;
                    if (runLength >= 2 && runLength <= 10 &&
                        !hasBridgeNearHorizontalRun(runStart, runEnd, y) &&
                        isBridgeApproach(runStart - 1, y) && isBridgeApproach(runEnd + 1, y) &&
                        addHorizontalBridgeAcrossRun(runStart, runEnd, y)) {
                        return true;
                    }
                }
                runStart = null;
            }
        }
    }

    for (let x = 2; x < Game.config.DUNGEON_WIDTH - 2; x++) {
        let runStart = null;
        for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special === 'water') {
                if (runStart === null) runStart = y;
            } else {
                if (runStart !== null) {
                    const runEnd = y - 1;
                    const runLength = runEnd - runStart + 1;
                    if (runLength >= 2 && runLength <= 10 &&
                        !hasBridgeNearVerticalRun(x, runStart, runEnd) &&
                        isBridgeApproach(x, runStart - 1) && isBridgeApproach(x, runEnd + 1) &&
                        addVerticalBridgeAcrossRun(x, runStart, runEnd)) {
                        return true;
                    }
                }
                runStart = null;
            }
        }
    }

    return false;
}

function addFallbackBridge() {
    for (let y = 2; y < Game.config.DUNGEON_HEIGHT - 2; y++) {
        let runStart = null;
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special === 'water') {
                if (runStart === null) runStart = x;
            } else {
                if (runStart !== null && isBridgeApproach(runStart - 1, y) && isBridgeApproach(x, y)) {
                    return addHorizontalBridgeAcrossRun(runStart, x - 1, y);
                }
                runStart = null;
            }
        }
    }

    for (let x = 2; x < Game.config.DUNGEON_WIDTH - 2; x++) {
        let runStart = null;
        for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special === 'water') {
                if (runStart === null) runStart = y;
            } else {
                if (runStart !== null && isBridgeApproach(x, runStart - 1) && isBridgeApproach(x, y)) {
                    return addVerticalBridgeAcrossRun(x, runStart, y - 1);
                }
                runStart = null;
            }
        }
    }

    return false;
}

function bridgeTileHasValidSpan(x, y) {
    let startX = x;
    let endX = x;
    while (inBounds(startX - 1, y) && Game.world.dungeonGrid[y][startX - 1].special === 'bridge') startX--;
    while (inBounds(endX + 1, y) && Game.world.dungeonGrid[y][endX + 1].special === 'bridge') endX++;

    if (endX > startX && isBridgeApproach(startX - 1, y) && isBridgeApproach(endX + 1, y)) {
        let waterOnBothSides = true;
        for (let bx = startX; bx <= endX; bx++) {
            if (!isWaterLike(bx, y - 1) || !isWaterLike(bx, y + 1)) {
                waterOnBothSides = false;
                break;
            }
        }
        if (waterOnBothSides) return true;
    }

    let startY = y;
    let endY = y;
    while (inBounds(x, startY - 1) && Game.world.dungeonGrid[startY - 1][x].special === 'bridge') startY--;
    while (inBounds(x, endY + 1) && Game.world.dungeonGrid[endY + 1][x].special === 'bridge') endY++;

    if (endY > startY && isBridgeApproach(x, startY - 1) && isBridgeApproach(x, endY + 1)) {
        let waterOnBothSides = true;
        for (let by = startY; by <= endY; by++) {
            if (!isWaterLike(x - 1, by) || !isWaterLike(x + 1, by)) {
                waterOnBothSides = false;
                break;
            }
        }
        if (waterOnBothSides) return true;
    }

    return false;
}

function pruneInvalidBridges() {
    const toWater = [];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            if (Game.world.dungeonGrid[y][x].special === 'bridge' && !bridgeTileHasValidSpan(x, y)) {
                toWater.push({x, y});
            }
        }
    }

    for (let i = 0; i < toWater.length; i++) {
        applyOverworldTile(toWater[i].x, toWater[i].y, Tile.water());
    }
}

function pruneWideBridgeComponents() {
    const visited = new Set();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const key = x + ',' + y;
            if (visited.has(key) || Game.world.dungeonGrid[y][x].special !== 'bridge') continue;

            const stack = [{x, y}];
            const cells = [];
            visited.add(key);

            while (stack.length > 0) {
                const current = stack.pop();
                cells.push(current);

                for (let i = 0; i < dirs.length; i++) {
                    const nx = current.x + dirs[i][0];
                    const ny = current.y + dirs[i][1];
                    const nkey = nx + ',' + ny;
                    if (!inBounds(nx, ny) || visited.has(nkey)) continue;
                    if (Game.world.dungeonGrid[ny][nx].special !== 'bridge') continue;
                    visited.add(nkey);
                    stack.push({x: nx, y: ny});
                }
            }

            const xs = cells.map(cell => cell.x);
            const ys = cells.map(cell => cell.y);
            const width = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1;
            const height = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 1;

            if ((width > 1 && height > 1) || (width === 1 && height === 1)) {
                for (let i = 0; i < cells.length; i++) {
                    applyOverworldTile(cells[i].x, cells[i].y, Tile.water());
                }
            }
        }
    }
}

function addOverworldBridges() {
    addNaturalBridgeCandidates();
    pruneInvalidBridges();
    pruneWideBridgeComponents();
    cleanupTinyWater();
}

function canBecomeShorelineSand(tile) {
    return tile.walkable && (!tile.special || tile.special === 'grass');
}

function isGrassLikeTile(tile) {
    return tile.walkable && (!tile.special || tile.special === 'grass');
}

function applyShorelineSand() {
    const candidates = new Set();
    const toSand = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const tile = Game.world.dungeonGrid[y][x];
            if (!canBecomeShorelineSand(tile)) continue;

            let waterBorders = 0;
            for (let i = 0; i < dirs.length; i++) {
                if (isWaterLike(x + dirs[i][0], y + dirs[i][1])) waterBorders++;
            }

            if (waterBorders > 0) toSand.push({x, y, waterBorders});
        }
    }

    for (let i = 0; i < toSand.length; i++) {
        candidates.add(toSand[i].x + ',' + toSand[i].y);
    }

    const smoothedSand = toSand.filter(function(cell) {
        let candidateNeighbors = 0;

        for (let i = 0; i < dirs.length; i++) {
            if (candidates.has((cell.x + dirs[i][0]) + ',' + (cell.y + dirs[i][1]))) {
                candidateNeighbors++;
            }
        }

        return cell.waterBorders > 1 || candidateNeighbors > 1;
    });

    for (let i = 0; i < smoothedSand.length; i++) {
        applyOverworldTile(smoothedSand[i].x, smoothedSand[i].y, Tile.sand());
    }
}

function nearestDistance(x, y, sources, maxDistance) {
    let nearest = maxDistance + 1;

    for (let i = 0; i < sources.length; i++) {
        const distance = Math.abs(x - sources[i].x) + Math.abs(y - sources[i].y);
        if (distance < nearest) nearest = distance;
        if (nearest === 1) break;
    }

    return nearest;
}

function applyGrassTones() {
    const forestSources = [];
    const shoreSources = [];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special === 'tree') forestSources.push({x, y});
            if (special === 'sand' || special === 'water' || special === 'ocean') shoreSources.push({x, y});
        }
    }

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            if (!isGrassLikeTile(Game.world.dungeonGrid[y][x])) continue;

            const forestDistance = nearestDistance(x, y, forestSources, 8);
            const shoreDistance = nearestDistance(x, y, shoreSources, 8);

            if (forestDistance <= 2 && shoreDistance > 1) {
                applyOverworldTile(x, y, Tile.darkGrass());
            } else if (shoreDistance <= 2 || forestDistance >= 5) {
                applyOverworldTile(x, y, Tile.lightGrass());
            } else {
                applyOverworldTile(x, y, Tile.grass());
            }
        }
    }
}

function isWaterToneSource(tile) {
    return tile.special !== 'water' && tile.special !== 'ocean' && tile.special !== 'bridge';
}

function applyWaterTones() {
    const landSources = [];

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            if (isWaterToneSource(Game.world.dungeonGrid[y][x])) {
                landSources.push({x, y});
            }
        }
    }

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const special = Game.world.dungeonGrid[y][x].special;
            if (special !== 'water' && special !== 'ocean') continue;

            const shoreDistance = nearestDistance(x, y, landSources, 6);
            if (special === 'ocean') {
                if (shoreDistance <= 1) {
                    applyOverworldTile(x, y, Tile.shallowOcean());
                } else if (shoreDistance <= 3) {
                    applyOverworldTile(x, y, Tile.ocean());
                } else if (shoreDistance <= 5) {
                    applyOverworldTile(x, y, Tile.midDeepOcean());
                } else {
                    applyOverworldTile(x, y, Tile.veryDeepOcean());
                }
            } else if (shoreDistance <= 1) {
                applyOverworldTile(x, y, Tile.shallowWater());
            } else if (shoreDistance <= 3) {
                applyOverworldTile(x, y, Tile.water());
            } else if (shoreDistance <= 5) {
                applyOverworldTile(x, y, Tile.midDeepWater());
            } else {
                applyOverworldTile(x, y, Tile.veryDeepWater());
            }
        }
    }
}

function paintHorizontalRiver(section, worldY, salt, width) {
    const localBaseY = worldY - section.y * Game.config.DUNGEON_HEIGHT;
    if (localBaseY < -6 || localBaseY > Game.config.DUNGEON_HEIGHT + 6) return;

    for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
        const worldX = section.x * Game.config.DUNGEON_WIDTH + x;
        const meander = Math.round(Math.sin(worldX * 0.28 + salt) * 2 + Math.sin(worldX * 0.09 + salt * 0.7));
        const riverY = localBaseY + meander;
        for (let dy = -width; dy <= width; dy++) {
            if (Math.abs(dy) === width && overworldNoise(section, x, riverY + dy, salt + 11) < 0.35) continue;
            applyOverworldTile(x, riverY + dy, Tile.water());
        }
    }
}

function paintVerticalRiver(section, worldX, salt, width) {
    const localBaseX = worldX - section.x * Game.config.DUNGEON_WIDTH;
    if (localBaseX < -6 || localBaseX > Game.config.DUNGEON_WIDTH + 6) return;

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        const worldY = section.y * Game.config.DUNGEON_HEIGHT + y;
        const meander = Math.round(Math.sin(worldY * 0.24 + salt) * 2 + Math.sin(worldY * 0.11 + salt * 0.5));
        const riverX = localBaseX + meander;
        for (let dx = -width; dx <= width; dx++) {
            if (Math.abs(dx) === width && overworldNoise(section, riverX + dx, y, salt + 23) < 0.35) continue;
            applyOverworldTile(riverX + dx, y, Tile.water());
        }
    }
}

function paintOcean(section) {
    const width = Game.config.DUNGEON_WIDTH;
    const height = Game.config.DUNGEON_HEIGHT;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const worldX = section.x * width + x;
            const worldY = section.y * height + y;

            const eastCoast = 92 + Math.round(Math.sin(worldY * 0.12) * 7) +
                Math.round(Math.sin(worldY * 0.035 + 2.3) * 11);
            const southCoast = 72 + Math.round(Math.sin(worldX * 0.11 + 1.1) * 5) +
                Math.round(Math.sin(worldX * 0.045) * 9);
            const inlandSeaCenterX = -72;
            const inlandSeaCenterY = -44;
            const inlandSea = ((worldX - inlandSeaCenterX) * (worldX - inlandSeaCenterX)) / (24 * 24) +
                ((worldY - inlandSeaCenterY) * (worldY - inlandSeaCenterY)) / (17 * 17);

            if (worldX > eastCoast || worldY > southCoast || inlandSea < 1) {
                applyOverworldTile(x, y, Tile.ocean());
            }
        }
    }
}

function generateOverworldSection(section) {
    Game.state.area = 'overworld';
    Game.state.floor = 0;
    Game.world.dungeonGrid = [];
    Game.world.rooms = [new Room(1, 1, Game.config.DUNGEON_WIDTH - 2, Game.config.DUNGEON_HEIGHT - 2, 'overworld')];
    Game.world.stairsPos = { x: null, y: null };
    Game.world.overworldSection = { x: section.x, y: section.y };

    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        Game.world.dungeonGrid[y] = [];
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const grassNoise = overworldNoise(section, x, y, 9);
            if (grassNoise < 0.22) {
                Game.world.dungeonGrid[y][x] = Tile.darkGrass();
            } else if (grassNoise > 0.78) {
                Game.world.dungeonGrid[y][x] = Tile.lightGrass();
            } else {
                Game.world.dungeonGrid[y][x] = Tile.grass();
            }
        }
    }

    paintOcean(section);
    paintHorizontalRiver(section, 5, 1.4, 1);
    paintHorizontalRiver(section, 31, 3.1, 2);
    paintVerticalRiver(section, -18, 2.2, 1);
    paintVerticalRiver(section, 44, 4.7, 2);

    const midX = Math.floor(Game.config.DUNGEON_WIDTH / 2);
    const midY = Math.floor(Game.config.DUNGEON_HEIGHT / 2);

    if (overworldRandom(section, 71) > 0.2) {
        const lakeX = overworldRange(section, 72, 4, Game.config.DUNGEON_WIDTH - 5);
        const lakeY = overworldRange(section, 73, 3, Game.config.DUNGEON_HEIGHT - 4);
        growOverworldPatch(
            section,
            [
                {x: lakeX, y: lakeY},
                {x: lakeX + 1, y: lakeY},
                {x: lakeX, y: lakeY + 1},
                {x: lakeX - 1, y: lakeY}
            ],
            Tile.water,
            overworldRange(section, 74, 34, 95),
            76,
            {avoidWater: false, spreadCutoff: 0.05}
        );
    }

    const forestCount = overworldRange(section, 100, 4, 7);
    for (let i = 0; i < forestCount; i++) {
        const seedX = overworldRange(section, 101 + i * 10, 3, Game.config.DUNGEON_WIDTH - 4);
        const seedY = overworldRange(section, 102 + i * 10, 2, Game.config.DUNGEON_HEIGHT - 3);
        growOverworldPatch(
            section,
            [
                {x: seedX, y: seedY},
                {x: seedX + overworldRange(section, 103 + i * 10, -1, 1), y: seedY + 1}
            ],
            Tile.tree,
            overworldRange(section, 104 + i * 10, 18, 42),
            105 + i * 10,
            {avoidWater: true, spreadCutoff: 0.1}
        );
    }

    const edgeSeeds = [
        {x: 1, y: overworldRange(section, 141, 2, Game.config.DUNGEON_HEIGHT - 3)},
        {x: Game.config.DUNGEON_WIDTH - 2, y: overworldRange(section, 142, 2, Game.config.DUNGEON_HEIGHT - 3)},
        {x: overworldRange(section, 143, 2, Game.config.DUNGEON_WIDTH - 3), y: 1},
        {x: overworldRange(section, 144, 2, Game.config.DUNGEON_WIDTH - 3), y: Game.config.DUNGEON_HEIGHT - 2}
    ];
    for (let i = 0; i < edgeSeeds.length; i++) {
        growOverworldPatch(
            section,
            [edgeSeeds[i]],
            Tile.tree,
            overworldRange(section, 145 + i, 10, 24),
            150 + i * 7,
            {avoidWater: true, spreadCutoff: 0.08}
        );
    }

    const ridgeCount = overworldRange(section, 160, 1, 3);
    for (let i = 0; i < ridgeCount; i++) {
        const startX = overworldRange(section, 161 + i * 10, 2, Game.config.DUNGEON_WIDTH - 8);
        const startY = overworldRange(section, 162 + i * 10, 2, Game.config.DUNGEON_HEIGHT - 7);
        growOverworldPatch(
            section,
            [{x: startX, y: startY}, {x: startX + 1, y: startY}],
            Tile.rock,
            overworldRange(section, 163 + i * 10, 5, 12),
            165 + i * 10,
            {avoidWater: true}
        );
    }

    carveOverworldTrails(section);
    cleanupTinyWater();
    addOverworldBridges();
    applyShorelineSand();
    applyGrassTones();
    applyWaterTones();
    if (!(section.x === 0 && section.y === 0)) {
        placeDungeonEntranceForSection(section);
    }

    return { x: midX, y: midY };
}

function generateOverworld() {
    const section = { x: 0, y: 0 };
    generateOverworldSection(section);

    const entrance = { x: Math.floor(Game.config.DUNGEON_WIDTH / 2), y: 4 };
    const spawn = { x: entrance.x, y: Game.config.DUNGEON_HEIGHT - 4 };
    placeDungeonEntranceForSection(section);

    for (let y = entrance.y + 1; y <= spawn.y; y++) {
        applyOverworldTile(entrance.x, y, Tile.grass());
    }
    applyOverworldTile(entrance.x, entrance.y, Tile.dungeonEntrance());
    rememberDungeonEntrance(section, entrance);

    Game.world.dungeonEntrancePos = entrance;
    Game.world.overworldReturnPos = { x: entrance.x, y: entrance.y + 1 };
    Game.world.overworldGrid = Game.world.dungeonGrid;
    Game.world.overworldSection = section;
    Game.world.overworldSections[overworldSectionKey(section)] = Game.world.dungeonGrid;
    return spawn;
}

// --- Core Generation Functions ---
function initializeGrid() {
    Game.world.dungeonGrid = [];
    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        Game.world.dungeonGrid[y] = [];
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            Game.world.dungeonGrid[y][x] = Tile.wall();
        }
    }
}

function generateRoomsWithVariety() {
    const rooms = [];
    const maxRooms = randInt(6, 12);
    const maxAttempts = 150;
    
    // Generate rooms of different sizes and shapes
    for (let attempt = 0; attempt < maxAttempts && rooms.length < maxRooms; attempt++) {
        let room;
        
        // 20% chance for special room shapes
        if (Math.random() < 0.2 && rooms.length > 2) {
            room = generateSpecialRoom();
        } else {
            room = generateNormalRoom();
        }
        
        if (room && !roomOverlaps(room, rooms)) {
            rooms.push(room);
            carveRoom(room);
        }
    }
    
    return rooms;
}

function generateNormalRoom() {
    const minSize = 4, maxSize = 12;
    const w = randInt(minSize, maxSize);
    const h = randInt(minSize, maxSize);
    const x = randInt(1, Game.config.DUNGEON_WIDTH - w - 2);
    const y = randInt(1, Game.config.DUNGEON_HEIGHT - h - 2);
    
    const roomType = Math.random() < 0.1 ? 'special' : 'normal';
    return new Room(x, y, w, h, roomType);
}

function generateSpecialRoom() {
    const shapes = ['L', 'T', 'plus', 'circle'];
    const shape = shapes[randInt(0, shapes.length - 1)];
    
    switch (shape) {
        case 'L':
            return generateLShapedRoom();
        case 'T':
            return generateTShapedRoom();
        case 'plus':
            return generatePlusRoom();
        case 'circle':
            return generateCircularRoom();
        default:
            return generateNormalRoom();
    }
}

function generateLShapedRoom() {
    const baseW = randInt(6, 10);
    const baseH = randInt(6, 10);
    const armW = randInt(3, 6);
    const armH = randInt(3, 6);
    
    const x = randInt(2, Game.config.DUNGEON_WIDTH - baseW - 3);
    const y = randInt(2, Game.config.DUNGEON_HEIGHT - baseH - 3);
    
    const room = new Room(x, y, baseW, baseH, 'L-shaped');
    room.addFeature({type: 'arm', x: x + baseW, y: y, w: armW, h: armH});
    
    return room;
}

function generateTShapedRoom() {
    const baseW = randInt(8, 12);
    const baseH = randInt(4, 6);
    const stemW = randInt(3, 5);
    const stemH = randInt(4, 7);
    
    const x = randInt(2, Game.config.DUNGEON_WIDTH - baseW - 3);
    const y = randInt(2, Game.config.DUNGEON_HEIGHT - baseH - stemH - 3);
    
    const room = new Room(x, y, baseW, baseH, 'T-shaped');
    const stemX = x + Math.floor((baseW - stemW) / 2);
    room.addFeature({type: 'stem', x: stemX, y: y + baseH, w: stemW, h: stemH});
    
    return room;
}

function generatePlusRoom() {
    const centerW = randInt(4, 6);
    const centerH = randInt(4, 6);
    const armLength = randInt(3, 5);
    
    const centerX = randInt(armLength + 1, Game.config.DUNGEON_WIDTH - centerW - armLength - 2);
    const centerY = randInt(armLength + 1, Game.config.DUNGEON_HEIGHT - centerH - armLength - 2);
    
    const room = new Room(centerX, centerY, centerW, centerH, 'plus');
    
    // Add four arms
    room.addFeature({type: 'arm', x: centerX - armLength, y: centerY + 1, w: armLength, h: centerH - 2});
    room.addFeature({type: 'arm', x: centerX + centerW, y: centerY + 1, w: armLength, h: centerH - 2});
    room.addFeature({type: 'arm', x: centerX + 1, y: centerY - armLength, w: centerW - 2, h: armLength});
    room.addFeature({type: 'arm', x: centerX + 1, y: centerY + centerH, w: centerW - 2, h: armLength});
    
    return room;
}

function generateCircularRoom() {
    const radius = randInt(3, 6);
    const diameter = radius * 2 + 1;
    const centerX = randInt(radius + 1, Game.config.DUNGEON_WIDTH - radius - 2);
    const centerY = randInt(radius + 1, Game.config.DUNGEON_HEIGHT - radius - 2);
    
    const room = new Room(centerX - radius, centerY - radius, diameter, diameter, 'circular');
    room.addFeature({type: 'circle', centerX: centerX, centerY: centerY, radius: radius});
    
    return room;
}

function generateCellularCaves() {
    // Initialize with random noise
    for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            if (Math.random() < 0.45) {
                Game.world.dungeonGrid[y][x] = Tile.floor();
            }
        }
    }
    
    // Apply cellular automata rules
    for (let iteration = 0; iteration < 5; iteration++) {
        const newGrid = [];
        
        for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
            newGrid[y] = [];
            for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
                const wallCount = countNeighboringWalls(x, y);
                
                if (x === 0 || y === 0 || x === Game.config.DUNGEON_WIDTH - 1 || y === Game.config.DUNGEON_HEIGHT - 1) {
                    newGrid[y][x] = Tile.wall();
                } else if (wallCount >= 5) {
                    newGrid[y][x] = Tile.wall();
                } else if (wallCount <= 3) {
                    newGrid[y][x] = Tile.floor();
                } else {
                    newGrid[y][x] = Game.world.dungeonGrid[y][x];
                }
            }
        }
        
        Game.world.dungeonGrid = newGrid;
    }
}

function generateMazeRooms() {
    const rooms = [];
    const roomCount = randInt(4, 8);
    
    for (let i = 0; i < roomCount; i++) {
        const attempts = 50;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const w = randInt(4, 8);
            const h = randInt(4, 8);
            const x = randInt(2, Game.config.DUNGEON_WIDTH - w - 3);
            const y = randInt(2, Game.config.DUNGEON_HEIGHT - h - 3);
            
            const room = new Room(x, y, w, h, 'maze-room');
            
            if (!roomOverlaps(room, rooms, 4)) {
                rooms.push(room);
                carveRoom(room);
                break;
            }
        }
    }
    
    return rooms;
}

function generateMazeCorridors() {
    const corridorWidth = 1;
    
    // Create horizontal corridors
    for (let y = 3; y < Game.config.DUNGEON_HEIGHT - 3; y += 4) {
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            if (Math.random() < 0.7) {
                Game.world.dungeonGrid[y][x] = Tile.floor();
            }
        }
    }
    
    // Create vertical corridors
    for (let x = 3; x < Game.config.DUNGEON_WIDTH - 3; x += 4) {
        for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
            if (Math.random() < 0.7) {
                Game.world.dungeonGrid[y][x] = Tile.floor();
            }
        }
    }
}

function generateHybridLayout() {
    const rooms = [];
    
    // Generate some normal rooms
    const normalRooms = Math.floor(generateRoomsWithVariety().length * 0.6);
    rooms.push(...generateRoomsWithVariety().slice(0, normalRooms));
    
    // Add cave sections
    generateCellularCaves();
    
    // Identify cave rooms
    const caveRooms = identifyCaveRooms();
    rooms.push(...caveRooms.slice(0, 3));
    
    // Add some maze corridors
    if (Math.random() < 0.5) {
        generateMazeCorridors();
    }
    
    return rooms;
}

// --- Room Carving and Features ---
function carveRoom(room) {
    // Carve main room area
    for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
            if (inBounds(x, y)) {
                if (room.type === 'special') {
                    Game.world.dungeonGrid[y][x] = Tile.specialFloor([70, 70, 100]);
                } else {
                    Game.world.dungeonGrid[y][x] = Tile.floor();
                }
            }
        }
    }
    
    // Carve special features
    for (const feature of room.features) {
        carveFeature(feature);
    }
    
    // Add room-specific decorations
    addRoomDecorations(room);
}

function carveFeature(feature) {
    switch (feature.type) {
        case 'arm':
        case 'stem':
            for (let y = feature.y; y < feature.y + feature.h; y++) {
                for (let x = feature.x; x < feature.x + feature.w; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.floor();
                    }
                }
            }
            break;
            
        case 'circle':
            const {centerX, centerY, radius} = feature;
            for (let y = centerY - radius; y <= centerY + radius; y++) {
                for (let x = centerX - radius; x <= centerX + radius; x++) {
                    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                    if (distance <= radius && inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.floor();
                    }
                }
            }
            break;
    }
}

function addRoomDecorations(room) {
    if (room.type === 'special' && Math.random() < 0.3) {
        // Add pillars to special rooms
        const pillarCount = randInt(1, 3);
        for (let i = 0; i < pillarCount; i++) {
            const px = randInt(room.x + 1, room.x + room.width - 2);
            const py = randInt(room.y + 1, room.y + room.height - 2);
            if (inBounds(px, py)) {
                Game.world.dungeonGrid[py][px] = Tile.pillar();
            }
        }
    }
    
    if (room.type === 'circular' && Math.random() < 0.4) {
        // Add water feature in center of circular rooms
        const centerX = room.centerX();
        const centerY = room.centerY();
        if (inBounds(centerX, centerY)) {
            Game.world.dungeonGrid[centerY][centerX] = Tile.water();
        }
    }
}

// --- Connectivity ---
function connectAllRooms(rooms) {
    if (rooms.length < 2) return;
    
    // Use minimum spanning tree for interesting connections
    const connections = generateMinimumSpanningTree(rooms);
    
    for (const connection of connections) {
        connectRooms(rooms[connection.from], rooms[connection.to]);
        rooms[connection.from].connected = true;
        rooms[connection.to].connected = true;
    }
    
    // Add some extra connections for loops
    addExtraConnections(rooms);
}

function generateMinimumSpanningTree(rooms) {
    const connections = [];
    const connected = new Set([0]);
    
    while (connected.size < rooms.length) {
        let bestConnection = null;
        let bestDistance = Infinity;
        
        for (const connectedIndex of connected) {
            for (let i = 0; i < rooms.length; i++) {
                if (connected.has(i)) continue;
                
                const distance = roomDistance(rooms[connectedIndex], rooms[i]);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestConnection = {from: connectedIndex, to: i};
                }
            }
        }
        
        if (bestConnection) {
            connections.push(bestConnection);
            connected.add(bestConnection.to);
        } else {
            break;
        }
    }
    
    return connections;
}

function addExtraConnections(rooms) {
    const extraConnections = Math.floor(rooms.length * 0.3);
    
    for (let i = 0; i < extraConnections; i++) {
        const room1 = rooms[randInt(0, rooms.length - 1)];
        const room2 = rooms[randInt(0, rooms.length - 1)];
        
        if (room1 !== room2 && Math.random() < 0.5) {
            connectRooms(room1, room2);
        }
    }
}

function connectRooms(r1, r2) {
    const x1 = r1.centerX(), y1 = r1.centerY();
    const x2 = r2.centerX(), y2 = r2.centerY();
    
    // Choose L-shaped or direct connection
    if (Math.random() < 0.3) {
        carveStraightCorridor(x1, y1, x2, y2);
    } else {
        carveLShapedCorridor(x1, y1, x2, y2);
    }
}

function carveStraightCorridor(x1, y1, x2, y2) {
    const points = bresenhamLine(x1, y1, x2, y2);
    
    for (const point of points) {
        if (inBounds(point.x, point.y)) {
            Game.world.dungeonGrid[point.y][point.x] = Tile.floor();
        }
    }
}

function carveLShapedCorridor(x1, y1, x2, y2) {
    if (Math.random() < 0.5) {
        // Horizontal then vertical
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            if (inBounds(x, y1)) Game.world.dungeonGrid[y1][x] = Tile.floor();
        }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            if (inBounds(x2, y)) Game.world.dungeonGrid[y][x2] = Tile.floor();
        }
    } else {
        // Vertical then horizontal
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            if (inBounds(x1, y)) Game.world.dungeonGrid[y][x1] = Tile.floor();
        }
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            if (inBounds(x, y2)) Game.world.dungeonGrid[y2][x] = Tile.floor();
        }
    }
}

// --- Environmental Features ---
function addEnvironmentalHazards() {
    const floor = Math.abs(Game.state.floor);
    
    if (floor >= 5 && Math.random() < 0.3) {
        addWaterFeatures();
    }
    
    if (floor >= 8 && Math.random() < 0.2) {
        addLavaFeatures();
    }
    
    if (Math.random() < 0.1) {
        addSecretAreas();
    }
}

function addWaterFeatures() {
    const waterCount = randInt(1, 3);
    
    for (let i = 0; i < waterCount; i++) {
        const x = randInt(2, Game.config.DUNGEON_WIDTH - 3);
        const y = randInt(2, Game.config.DUNGEON_HEIGHT - 3);
        
        if (Game.world.dungeonGrid[y][x].walkable) {
            Game.world.dungeonGrid[y][x] = Tile.water();
        }
    }
}

function addLavaFeatures() {
    const lavaCount = randInt(1, 2);
    
    for (let i = 0; i < lavaCount; i++) {
        const x = randInt(2, Game.config.DUNGEON_WIDTH - 3);
        const y = randInt(2, Game.config.DUNGEON_HEIGHT - 3);
        
        if (Game.world.dungeonGrid[y][x].walkable) {
            Game.world.dungeonGrid[y][x] = Tile.lava();
            
            // Add glow effect around lava
            const neighbors = [[1,0], [-1,0], [0,1], [0,-1]];
            for (const [dx, dy] of neighbors) {
                const nx = x + dx, ny = y + dy;
                if (inBounds(nx, ny) && Game.world.dungeonGrid[ny][nx].walkable) {
                    if (Math.random() < 0.3) {
                        Game.world.dungeonGrid[ny][nx] = Tile.specialFloor([100, 50, 30]);
                    }
                }
            }
        }
    }
}

function addSecretAreas() {
    if (Game.world.rooms.length < 2) return;
    
    const room = Game.world.rooms[randInt(0, Game.world.rooms.length - 1)];
    const secretSize = 3;
    
    // Try to add secret room adjacent to existing room
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dir = directions[randInt(0, directions.length - 1)];
    
    const secretX = room.x + (dir[0] > 0 ? room.width : dir[0] < 0 ? -secretSize : randInt(1, room.width - secretSize));
    const secretY = room.y + (dir[1] > 0 ? room.height : dir[1] < 0 ? -secretSize : randInt(1, room.height - secretSize));
    
    if (inBounds(secretX, secretY) && inBounds(secretX + secretSize - 1, secretY + secretSize - 1)) {
        // Carve secret room
        for (let y = secretY; y < secretY + secretSize; y++) {
            for (let x = secretX; x < secretX + secretSize; x++) {
                Game.world.dungeonGrid[y][x] = Tile.specialFloor([100, 100, 150]);
            }
        }
        
        // Add secret door
        const doorX = room.x + (dir[0] > 0 ? room.width - 1 : dir[0] < 0 ? 0 : randInt(1, room.width - 2));
        const doorY = room.y + (dir[1] > 0 ? room.height - 1 : dir[1] < 0 ? 0 : randInt(1, room.height - 2));
        
        if (inBounds(doorX, doorY)) {
            Game.world.dungeonGrid[doorY][doorX] = Tile.door();
        }
    }
}

// --- Utility Functions ---
function roomOverlaps(room, existingRooms, buffer = 1) {
    for (const existing of existingRooms) {
        if (room.intersects(existing, buffer)) {
            return true;
        }
    }
    return false;
}

function roomDistance(r1, r2) {
    const dx = r1.centerX() - r2.centerX();
    const dy = r1.centerY() - r2.centerY();
    return Math.sqrt(dx * dx + dy * dy);
}

function countNeighboringWalls(x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (!inBounds(nx, ny) || !Game.world.dungeonGrid[ny][nx].walkable) {
                count++;
            }
        }
    }
    return count;
}

function identifyCaveRooms() {
    const rooms = [];
    const visited = new Set();
    
    for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            if (!visited.has(`${x},${y}`) && Game.world.dungeonGrid[y][x].walkable) {
                const area = floodFillArea(x, y, visited);
                if (area.tiles.length >= 16) {
                    const bounds = area.bounds;
                    const room = new Room(bounds.minX, bounds.minY, 
                                        bounds.maxX - bounds.minX + 1, 
                                        bounds.maxY - bounds.minY + 1, 'cave');
                    rooms.push(room);
                }
            }
        }
    }
    
    return rooms;
}

function floodFillArea(startX, startY, visited) {
    const stack = [{x: startX, y: startY}];
    const tiles = [];
    const bounds = {minX: startX, maxX: startX, minY: startY, maxY: startY};
    
    while (stack.length > 0) {
        const {x, y} = stack.pop();
        const key = `${x},${y}`;
        
        if (visited.has(key) || !inBounds(x, y) || !Game.world.dungeonGrid[y][x].walkable) {
            continue;
        }
        
        visited.add(key);
        tiles.push({x, y});
        
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
        
        stack.push({x: x + 1, y}, {x: x - 1, y}, {x, y: y + 1}, {x, y: y - 1});
    }
    
    return {tiles, bounds};
}

function ensureConnectivity() {
    // Implementation for ensuring cave areas are connected
    const rooms = identifyCaveRooms();
    if (rooms.length > 1) {
        connectAllRooms(rooms);
    }
}

function connectRoomsToMaze(rooms) {
    for (const room of rooms) {
        // Find nearest maze corridor and connect
        const centerX = room.centerX();
        const centerY = room.centerY();
        
        let nearestCorridor = null;
        let nearestDistance = Infinity;
        
        for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
            for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
                if (Game.world.dungeonGrid[y][x].walkable && !isInAnyRoom(x, y, rooms)) {
                    const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestCorridor = {x, y};
                    }
                }
            }
        }
        
        if (nearestCorridor) {
            carveLShapedCorridor(centerX, centerY, nearestCorridor.x, nearestCorridor.y);
        }
    }
}

function isInAnyRoom(x, y, rooms) {
    for (const room of rooms) {
        if (x >= room.x && x < room.x + room.width &&
            y >= room.y && y < room.y + room.height) {
            return true;
        }
    }
    return false;
}

function bresenhamLine(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    
    while (true) {
        points.push({x: x, y: y});
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    return points;
}

function createFallbackRoom() {
    const fw = 8, fh = 6;
    const frx = Math.max(1, Math.floor(Game.config.DUNGEON_WIDTH / 2 - fw / 2));
    const fry = Math.max(1, Math.floor(Game.config.DUNGEON_HEIGHT / 2 - fh / 2));
    const fallbackRoom = new Room(frx, fry, fw, fh, 'fallback');
    carveRoom(fallbackRoom);
    return [fallbackRoom];
}

function validateDungeon() {
    // Ensure all floor tiles are reachable
    const reachable = new Set();
    const startRoom = Game.world.rooms[0];
    
    if (startRoom) {
        floodFillReachability(startRoom.centerX(), startRoom.centerY(), reachable);
        
        // If less than 80% of floor tiles are reachable, add connecting corridors
        const totalFloorTiles = countFloorTiles();
        if (reachable.size < totalFloorTiles * 0.8) {
            addConnectingCorridors(reachable);
        }
    }
}

function floodFillReachability(startX, startY, reachable) {
    const stack = [{x: startX, y: startY}];
    
    while (stack.length > 0) {
        const {x, y} = stack.pop();
        const key = `${x},${y}`;
        
        if (reachable.has(key) || !inBounds(x, y) || !isWalkable(x, y)) {
            continue;
        }
        
        reachable.add(key);
        
        stack.push(
            {x: x + 1, y}, {x: x - 1, y}, 
            {x, y: y + 1}, {x, y: y - 1}
        );
    }
}

function countFloorTiles() {
    let count = 0;
    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            if (isWalkable(x, y)) count++;
        }
    }
    return count;
}

function addConnectingCorridors(reachable) {
    // Find unreachable floor areas and connect them
    for (let y = 1; y < Game.config.DUNGEON_HEIGHT - 1; y++) {
        for (let x = 1; x < Game.config.DUNGEON_WIDTH - 1; x++) {
            if (isWalkable(x, y) && !reachable.has(`${x},${y}`)) {
                // Find nearest reachable tile and connect
                const nearest = findNearestReachableTile(x, y, reachable);
                if (nearest) {
                    carveLShapedCorridor(x, y, nearest.x, nearest.y);
                    floodFillReachability(x, y, reachable);
                }
            }
        }
    }
}

function findNearestReachableTile(x, y, reachable) {
    let nearest = null;
    let nearestDistance = Infinity;
    
    for (const key of reachable) {
        const [rx, ry] = key.split(',').map(Number);
        const distance = Math.abs(x - rx) + Math.abs(y - ry);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = {x: rx, y: ry};
        }
    }
    
    return nearest;
}

function addSpecialFeatures(rooms) {
    const floor = Math.abs(Game.state.floor);
    
    // Add special room types based on floor depth
    for (const room of rooms) {
        if (Math.random() < 0.15) {
            const specialTypes = ['treasure', 'danger', 'puzzle', 'shrine'];
            let availableTypes = specialTypes;
            
            if (floor >= 5) availableTypes.push('lava_chamber');
            if (floor >= 8) availableTypes.push('ice_chamber');
            if (floor >= 10) availableTypes.push('void_chamber');
            
            const specialType = availableTypes[randInt(0, availableTypes.length - 1)];
            applySpecialRoomFeatures(room, specialType);
        }
    }
}

function applySpecialRoomFeatures(room, type) {
    switch (type) {
        case 'treasure':
            // Gold-colored floor and pillars
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([150, 150, 50]);
                    }
                }
            }
            room.type = 'treasure';
            break;
            
        case 'danger':
            // Red-tinted floor with scattered pillars
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([100, 50, 50]);
                    }
                }
            }
            
            // Add some pillars as obstacles
            const pillarCount = randInt(2, 4);
            for (let i = 0; i < pillarCount; i++) {
                const px = randInt(room.x + 1, room.x + room.width - 2);
                const py = randInt(room.y + 1, room.y + room.height - 2);
                if (inBounds(px, py)) {
                    Game.world.dungeonGrid[py][px] = Tile.pillar();
                }
            }
            room.type = 'danger';
            break;
            
        case 'lava_chamber':
            // Lava pools with heated floor
            const centerX = room.centerX();
            const centerY = room.centerY();
            
            // Heated floor
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([120, 60, 30]);
                    }
                }
            }
            
            // Central lava pool
            if (inBounds(centerX, centerY)) {
                Game.world.dungeonGrid[centerY][centerX] = Tile.lava();
                
                // Surrounding heated tiles
                const neighbors = [[1,0], [-1,0], [0,1], [0,-1], [1,1], [-1,-1], [1,-1], [-1,1]];
                for (const [dx, dy] of neighbors) {
                    const nx = centerX + dx, ny = centerY + dy;
                    if (inBounds(nx, ny) && Math.random() < 0.6) {
                        Game.world.dungeonGrid[ny][nx] = Tile.specialFloor([150, 70, 20]);
                    }
                }
            }
            room.type = 'lava_chamber';
            break;
            
        case 'ice_chamber':
            // Ice-blue floor with water features
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([50, 100, 150]);
                    }
                }
            }
            
            // Add some water/ice patches
            const iceCount = randInt(1, 3);
            for (let i = 0; i < iceCount; i++) {
                const ix = randInt(room.x + 1, room.x + room.width - 2);
                const iy = randInt(room.y + 1, room.y + room.height - 2);
                if (inBounds(ix, iy)) {
                    Game.world.dungeonGrid[iy][ix] = Tile.water();
                }
            }
            room.type = 'ice_chamber';
            break;
            
        case 'shrine':
            // Sacred purple floor with central pillar
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    if (inBounds(x, y)) {
                        Game.world.dungeonGrid[y][x] = Tile.specialFloor([100, 50, 150]);
                    }
                }
            }
            
            // Central shrine pillar
            const shrineX = room.centerX();
            const shrineY = room.centerY();
            if (inBounds(shrineX, shrineY)) {
                Game.world.dungeonGrid[shrineY][shrineX] = Tile.pillar();
            }
            room.type = 'shrine';
            break;
    }
}

// --- Enhanced Utility Functions ---
function isWalkable(x, y) {
    return inBounds(x, y) && Game.world.dungeonGrid[y][x].walkable;
}

function nearestRoomCenterTo(px, py) {
    let best = null;
    let bestDist = Infinity;
    
    for (let i = 0; i < Game.world.rooms.length; i++) {
        const cx = Game.world.rooms[i].centerX();
        const cy = Game.world.rooms[i].centerY();
        const d = Math.abs(px - cx) + Math.abs(py - cy);
        if (d < bestDist) {
            bestDist = d;
            best = {x: cx, y: cy};
        }
    }
    return best || {x: px, y: py};
}

function connectPlayerToDungeon(px, py) {
    if (!isWalkable(px, py)) Game.world.dungeonGrid[py][px] = Tile.floor();
    const target = nearestRoomCenterTo(px, py);
    carveLShapedCorridor(px, py, target.x, target.y);
}

function farthestReachableFrom(sx, sy) {
    const q = [];
    let head = 0;
    const dist = Array.from({length: Game.config.DUNGEON_HEIGHT}, 
                           () => Array(Game.config.DUNGEON_WIDTH).fill(-1));
    
    if (!isWalkable(sx, sy)) return {x: sx, y: sy, d: 0};
    
    dist[sy][sx] = 0;
    q.push([sx, sy]);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = {x: sx, y: sy, d: 0};
    
    while (head < q.length) {
        const cur = q[head++];
        const cx = cur[0], cy = cur[1];
        const cd = dist[cy][cx];
        
        if (cd > best.d || (cd === best.d && (cx !== sx || cy !== sy))) {
            best = {x: cx, y: cy, d: cd};
        }
        
        for (let i = 0; i < 4; i++) {
            const nx = cx + dirs[i][0];
            const ny = cy + dirs[i][1];
            if (inBounds(nx, ny) && dist[ny][nx] === -1 && isWalkable(nx, ny)) {
                dist[ny][nx] = cd + 1;
                q.push([nx, ny]);
            }
        }
    }
    
    if (best.x === sx && best.y === sy) {
        const near = nearestRoomCenterTo(sx, sy);
        if (isWalkable(near.x, near.y) && !(near.x === sx && near.y === sy)) {
            best = {x: near.x, y: near.y, d: 1};
        }
    }
    return best;
}

function placeStairsFarthestFrom(px, py) {
    const far = farthestReachableFrom(px, py);
    
    if (far.x === px && far.y === py) {
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < neighbors.length; i++) {
            const nx = px + neighbors[i][0];
            const ny = py + neighbors[i][1];
            if (isWalkable(nx, ny)) {
                far.x = nx;
                far.y = ny;
                far.d = 1;
                break;
            }
        }
    }
    
    Game.world.dungeonGrid[far.y][far.x] = Tile.stairs();
    Game.world.stairsPos.x = far.x;
    Game.world.stairsPos.y = far.y;
}

function placeUpStairsAt(x, y) {
    if (!inBounds(x, y)) return;
    Game.world.dungeonGrid[y][x] = Tile.upStairs();
}

// --- Room Type Information ---
function getRoomTypeInfo(room) {
    const types = {
        normal: { description: 'A regular chamber', color: 'gray' },
        special: { description: 'A mystical room', color: 'purple' },
        treasure: { description: 'A treasure chamber', color: 'gold' },
        danger: { description: 'A dangerous area', color: 'red' },
        lava_chamber: { description: 'A scorching lava chamber', color: 'orange' },
        ice_chamber: { description: 'A freezing ice chamber', color: 'cyan' },
        shrine: { description: 'An ancient shrine', color: 'purple' },
        cave: { description: 'A natural cave', color: 'brown' },
        'L-shaped': { description: 'An L-shaped chamber', color: 'gray' },
        'T-shaped': { description: 'A T-shaped chamber', color: 'gray' },
        plus: { description: 'A plus-shaped chamber', color: 'gray' },
        circular: { description: 'A circular chamber', color: 'blue' }
    };
    
    return types[room.type] || types.normal;
}
