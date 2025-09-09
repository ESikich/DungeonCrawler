/** =========================
 *  Enhanced Dungeon Generation System
 *  Multiple generation algorithms, special rooms, and dynamic layouts
 *  ========================= */

// --- Enhanced Tile Constructor ---
function Tile(walkable, opaque, color, glyph, special) {
    this.walkable = walkable;
    this.opaque = opaque;
    this.color = color || [128, 128, 128];
    this.glyph = glyph || '?';
    this.special = special || null; // For special tile properties
}

Tile.wall = function() {
    return new Tile(false, true, [100, 100, 100], '#');
};

Tile.floor = function() {
    return new Tile(true, false, [50, 50, 50], '.');
};

Tile.stairs = function() {
    return new Tile(true, false, [255, 215, 0], '>');
};

// New special tiles
Tile.water = function() {
    return new Tile(false, false, [30, 100, 200], '~', 'water');
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