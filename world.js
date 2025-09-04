/** =========================
 *  World Generation & Utils
 *  ========================= */

// --- Constants ---
var TILE_SIZE = 32;
var DUNGEON_WIDTH = 25;
var DUNGEON_HEIGHT = 17;
var DUNGEON_PIXEL_WIDTH = DUNGEON_WIDTH * TILE_SIZE;
var DUNGEON_PIXEL_HEIGHT = DUNGEON_HEIGHT * TILE_SIZE;
var MEMORY_REVEAL = 0.7;

// --- World data ---
var dungeonGrid = [];
var rooms = [];
var stairsPos = {x:null, y:null};

// --- Utils ---
function randInt(min, max){ 
    return Math.floor(Math.random()*(max-min+1))+min; 
}

function inBounds(x,y){ 
    return x>=0 && x<DUNGEON_WIDTH && y>=0 && y<DUNGEON_HEIGHT; 
}

function parseColor(name){
    var c = {
        white:[255,255,255], black:[0,0,0], red:[255,100,100],
        green:[100,255,100], blue:[100,100,255], yellow:[255,255,100],
        gray:[128,128,128], brown:[139,69,19], purple:[128,0,128],
        cyan:[100,255,255], orange:[255,165,0], gold:[255,215,0]
    };
    return c[name] || [255,255,255];
}

function clamp(v, lo, hi){ 
    return Math.max(lo, Math.min(hi, v)); 
}

// --- Tiles ---
function Tile(walkable, opaque, color, glyph){
    this.walkable = walkable;
    this.opaque = opaque;
    this.color = color || [128,128,128];
    this.glyph = glyph || '?';
}

Tile.wall   = function(){ return new Tile(false, true,  [100,100,100], '#'); };
Tile.floor  = function(){ return new Tile(true,  false, [50,50,50],   '.'); };
Tile.stairs = function(){ return new Tile(true,  false, [255,215,0],  '>'); };

// --- Rooms ---
function Room(x,y,w,h){ 
    this.x=x; this.y=y; this.width=w; this.height=h; 
}

Room.prototype.centerX = function(){ 
    return this.x + Math.floor(this.width/2); 
};

Room.prototype.centerY = function(){ 
    return this.y + Math.floor(this.height/2); 
};

Room.prototype.intersects = function(other){
    return !(this.x + this.width <= other.x ||
             other.x + other.width <= this.x ||
             this.y + this.height <= other.y ||
             other.y + other.height <= this.y);
};

// --- Generation ---
function generateDungeon(){
    dungeonGrid = [];
    for (var y=0;y<DUNGEON_HEIGHT;y++){
        dungeonGrid[y] = [];
        for (var x=0;x<DUNGEON_WIDTH;x++){
            dungeonGrid[y][x] = Tile.wall();
        }
    }

    rooms = [];
    var maxRooms=8, minSize=4, maxSize=10, maxAttempts=120;
    for (var a=0;a<maxAttempts && rooms.length<maxRooms;a++){
        var w = randInt(minSize, maxSize);
        var h = randInt(minSize, maxSize);
        var rx = randInt(1, DUNGEON_WIDTH - w - 2);
        var ry = randInt(1, DUNGEON_HEIGHT - h - 2);
        var r = new Room(rx, ry, w, h);
        var overlap=false;
        for (var i=0;i<rooms.length;i++){ 
            if(r.intersects(rooms[i])){ overlap=true; break; } 
        }
        if(!overlap) rooms.push(r);
    }
    
    if (rooms.length===0){
        var fw=8, fh=6, frx=Math.max(1, Math.floor(DUNGEON_WIDTH/2 - fw/2)), fry=Math.max(1, Math.floor(DUNGEON_HEIGHT/2 - fh/2));
        rooms.push(new Room(frx, fry, fw, fh));
    }

    for (var r=0;r<rooms.length;r++){
        var room = rooms[r];
        for (var y=room.y;y<room.y+room.height;y++){
            for (var x=room.x;x<room.x+room.width;x++){
                dungeonGrid[y][x] = Tile.floor();
            }
        }
    }

    for (var k=0;k<rooms.length-1;k++) connectRooms(rooms[k], rooms[k+1]);
}

function connectRooms(r1, r2){
    var x1=r1.centerX(), y1=r1.centerY();
    var x2=r2.centerX(), y2=r2.centerY();
    if (Math.random()<0.5){
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) 
            if(inBounds(x,y1)) dungeonGrid[y1][x]=Tile.floor();
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) 
            if(inBounds(x2,y)) dungeonGrid[y][x2]=Tile.floor();
    } else {
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) 
            if(inBounds(x1,y)) dungeonGrid[y][x1]=Tile.floor();
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) 
            if(inBounds(x,y2)) dungeonGrid[y2][x]=Tile.floor();
    }
}

function isWalkable(x,y){ 
    return inBounds(x,y) && dungeonGrid[y][x].walkable; 
}

function carveLShapedCorridor(x1,y1,x2,y2){
    if (Math.random()<0.5){
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) 
            if(inBounds(x,y1)) dungeonGrid[y1][x] = Tile.floor();
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) 
            if(inBounds(x2,y)) dungeonGrid[y][x2] = Tile.floor();
    } else {
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) 
            if(inBounds(x1,y)) dungeonGrid[y][x1] = Tile.floor();
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) 
            if(inBounds(x,y2)) dungeonGrid[y2][x] = Tile.floor();
    }
}

function nearestRoomCenterTo(px,py){
    var best=null, bestDist=Infinity;
    for (var i=0;i<rooms.length;i++){
        var cx=rooms[i].centerX(), cy=rooms[i].centerY();
        var d = Math.abs(px-cx)+Math.abs(py-cy);
        if (d<bestDist){ bestDist=d; best={x:cx,y:cy}; }
    }
    return best || {x:px, y:py};
}

function connectPlayerToDungeon(px,py){
    if (!isWalkable(px,py)) dungeonGrid[py][px] = Tile.floor();
    var target = nearestRoomCenterTo(px,py);
    carveLShapedCorridor(px,py,target.x,target.y);
}

function farthestReachableFrom(sx,sy){
    var q=[], head=0;
    var dist = Array.from({length:DUNGEON_HEIGHT}, ()=>Array(DUNGEON_WIDTH).fill(-1));
    if (!isWalkable(sx,sy)) return {x:sx,y:sy,d:0};
    dist[sy][sx]=0;
    q.push([sx,sy]);
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    var best = {x:sx, y:sy, d:0};
    while (head<q.length){
        var cur = q[head++], cx=cur[0], cy=cur[1];
        var cd = dist[cy][cx];
        if (cd>best.d || (cd===best.d && (cx!==sx || cy!==sy))){ 
            best={x:cx,y:cy,d:cd}; 
        }
        for (var i=0;i<4;i++){
            var nx=cx+dirs[i][0], ny=cy+dirs[i][1];
            if (inBounds(nx,ny) && dist[ny][nx]===-1 && isWalkable(nx,ny)){
                dist[ny][nx]=cd+1; 
                q.push([nx,ny]);
            }
        }
    }
    if (best.x===sx && best.y===sy){
        var near = nearestRoomCenterTo(sx,sy);
        if (isWalkable(near.x,near.y) && !(near.x===sx && near.y===sy)) 
            best={x:near.x,y:near.y,d:1};
    }
    return best;
}

function placeStairsFarthestFrom(px,py){
    var far = farthestReachableFrom(px,py);
    if (far.x===px && far.y===py){
        var neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
        for (var i=0;i<neighbors.length;i++){
            var nx=px+neighbors[i][0], ny=py+neighbors[i][1];
            if (isWalkable(nx,ny)){ far={x:nx,y:ny,d:1}; break; }
        }
    }
    dungeonGrid[far.y][far.x] = Tile.stairs();
    stairsPos.x = far.x; 
    stairsPos.y = far.y;
}
