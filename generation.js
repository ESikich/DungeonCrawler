/** =========================
 *  Dungeon Generation System - Complete Final Version
 *  ========================= */

// --- Tile Constructor ---
function Tile(walkable, opaque, color, glyph) {
    this.walkable = walkable;
    this.opaque = opaque;
    this.color = color || [128, 128, 128];
    this.glyph = glyph || '?';
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

// --- Room Constructor ---
function Room(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
}

Room.prototype.centerX = function() {
    return this.x + Math.floor(this.width / 2);
};

Room.prototype.centerY = function() {
    return this.y + Math.floor(this.height / 2);
};

Room.prototype.intersects = function(other) {
    return !(this.x + this.width <= other.x ||
             other.x + other.width <= this.x ||
             this.y + this.height <= other.y ||
             other.y + other.height <= this.y);
};

// --- Main Generation Function ---
function generateDungeon() {
    Game.world.dungeonGrid = [];
    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        Game.world.dungeonGrid[y] = [];
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            Game.world.dungeonGrid[y][x] = Tile.wall();
        }
    }

    Game.world.rooms = [];
    const maxRooms = 8;
    const minSize = 4;
    const maxSize = 10;
    const maxAttempts = 120;
    
    for (let a = 0; a < maxAttempts && Game.world.rooms.length < maxRooms; a++) {
        const w = randInt(minSize, maxSize);
        const h = randInt(minSize, maxSize);
        const rx = randInt(1, Game.config.DUNGEON_WIDTH - w - 2);
        const ry = randInt(1, Game.config.DUNGEON_HEIGHT - h - 2);
        const r = new Room(rx, ry, w, h);
        
        let overlap = false;
        for (let i = 0; i < Game.world.rooms.length; i++) {
            if (r.intersects(Game.world.rooms[i])) {
                overlap = true;
                break;
            }
        }
        if (!overlap) Game.world.rooms.push(r);
    }
    
    // Fallback room if none were created
    if (Game.world.rooms.length === 0) {
        const fw = 8, fh = 6;
        const frx = Math.max(1, Math.floor(Game.config.DUNGEON_WIDTH / 2 - fw / 2));
        const fry = Math.max(1, Math.floor(Game.config.DUNGEON_HEIGHT / 2 - fh / 2));
        Game.world.rooms.push(new Room(frx, fry, fw, fh));
    }

    // Carve out rooms
    for (let r = 0; r < Game.world.rooms.length; r++) {
        const room = Game.world.rooms[r];
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++) {
                Game.world.dungeonGrid[y][x] = Tile.floor();
            }
        }
    }

    // Connect rooms
    for (let k = 0; k < Game.world.rooms.length - 1; k++) {
        connectRooms(Game.world.rooms[k], Game.world.rooms[k + 1]);
    }
}

// --- Room Connection ---
function connectRooms(r1, r2) {
    const x1 = r1.centerX(), y1 = r1.centerY();
    const x2 = r2.centerX(), y2 = r2.centerY();
    
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

// --- Helper Functions ---
function isWalkable(x, y) {
    return inBounds(x, y) && Game.world.dungeonGrid[y][x].walkable;
}

function carveLShapedCorridor(x1, y1, x2, y2) {
    if (Math.random() < 0.5) {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            if (inBounds(x, y1)) Game.world.dungeonGrid[y1][x] = Tile.floor();
        }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            if (inBounds(x2, y)) Game.world.dungeonGrid[y][x2] = Tile.floor();
        }
    } else {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            if (inBounds(x1, y)) Game.world.dungeonGrid[y][x1] = Tile.floor();
        }
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            if (inBounds(x, y2)) Game.world.dungeonGrid[y2][x] = Tile.floor();
        }
    }
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
