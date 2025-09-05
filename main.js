/** =========================
 *  ECS Dungeon Crawler — With Statistics
 *  ========================= */

var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');
if (!canvas || !ctx) alert('Canvas not supported');

// Offscreen for lighting overlay
var lightCanvas = document.createElement('canvas');
lightCanvas.width = DUNGEON_PIXEL_WIDTH;
lightCanvas.height = DUNGEON_PIXEL_HEIGHT;
var lightCtx = lightCanvas.getContext('2d');

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
function Room(x,y,w,h){ this.x=x; this.y=y; this.width=w; this.height=h; }
Room.prototype.centerX = function(){ return this.x + Math.floor(this.width/2); };
Room.prototype.centerY = function(){ return this.y + Math.floor(this.height/2); };
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
        for (var i=0;i<rooms.length;i++){ if(r.intersects(rooms[i])){ overlap=true; break; } }
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
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) if(inBounds(x,y1)) dungeonGrid[y1][x]=Tile.floor();
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) if(inBounds(x2,y)) dungeonGrid[y][x2]=Tile.floor();
    } else {
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) if(inBounds(x1,y)) dungeonGrid[y][x1]=Tile.floor();
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) if(inBounds(x,y2)) dungeonGrid[y2][x]=Tile.floor();
    }
}

function isWalkable(x,y){ return inBounds(x,y) && dungeonGrid[y][x].walkable; }

function carveLShapedCorridor(x1,y1,x2,y2){
    if (Math.random()<0.5){
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) if(inBounds(x,y1)) dungeonGrid[y1][x] = Tile.floor();
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) if(inBounds(x2,y)) dungeonGrid[y][x2] = Tile.floor();
    } else {
        for (var y=Math.min(y1,y2); y<=Math.max(y1,y2); y++) if(inBounds(x1,y)) dungeonGrid[y][x1] = Tile.floor();
        for (var x=Math.min(x1,x2); x<=Math.max(x1,x2); x++) if(inBounds(x,y2)) dungeonGrid[y2][x] = Tile.floor();
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
        if (cd>best.d || (cd===best.d && (cx!==sx || cy!==sy))){ best={x:cx,y:cy,d:cd}; }
        for (var i=0;i<4;i++){
            var nx=cx+dirs[i][0], ny=cy+dirs[i][1];
            if (inBounds(nx,ny) && dist[ny][nx]===-1 && isWalkable(nx,ny)){
                dist[ny][nx]=cd+1; q.push([nx,ny]);
            }
        }
    }
    if (best.x===sx && best.y===sy){
        var near = nearestRoomCenterTo(sx,sy);
        if (isWalkable(near.x,near.y) && !(near.x===sx && near.y===sy)) best={x:near.x,y:near.y,d:1};
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
    stairsPos.x = far.x; stairsPos.y = far.y;
}

// --- Entities ---
function createPlayer(x,y){
    var eid = createEntity();
    addComponent(eid, 'position', {x:x, y:y});
    addComponent(eid, 'health', {hp:100, maxHp:100});
    addComponent(eid, 'stats', {strength:14, agility:12, accuracy:6, evasion:4});
    addComponent(eid, 'vision', {radius:2, baseRadius:2, visible:new Set(), seen:new Set()});
    addComponent(eid, 'descriptor', {name:'Hero', glyph:'@', color:'yellow'});
    addComponent(eid, 'blocker', {passable:false});
    addComponent(eid, 'progress', {xp:0, level:1, next:20});
    addComponent(eid, 'inventory', {items:[], capacity:12});
    addComponent(eid, 'status', {lightBoost:0, speedBoost:0, strengthBoost:0});
    return eid;
}

function createMonster(type,x,y){
    var eid = createEntity();
    addComponent(eid, 'position', {x:x, y:y});
    addComponent(eid, 'vision', {radius:6, visible:new Set(), seen:new Set()});
    addComponent(eid, 'blocker', {passable:false});
    addComponent(eid, 'ai', {behavior:'chase', lastPlayerPos:null, active:false});

    if (type==='slime'){
        addComponent(eid, 'health', {hp:15, maxHp:15});
        addComponent(eid, 'stats', {strength:8, agility:6, accuracy:5, evasion:2});
        addComponent(eid, 'descriptor', {name:'Green Slime', glyph:'s', color:'green'});
        addComponent(eid, 'xpValue', {xp:5});
        addComponent(eid, 'lootTable', {
            drops: [
                {type:'gold', amount:[2,8], chance:0.6},
                {type:'potion', chance:0.3},
                {type:'scroll', chance:0.1}
            ]
        });
    } else if (type==='orc'){
        addComponent(eid, 'health', {hp:25, maxHp:25});
        addComponent(eid, 'stats', {strength:12, agility:8, accuracy:8, evasion:4});
        addComponent(eid, 'descriptor', {name:'Orc Warrior', glyph:'o', color:'red'});
        addComponent(eid, 'xpValue', {xp:12});
        addComponent(eid, 'lootTable', {
            drops: [
                {type:'gold', amount:[5,15], chance:0.7},
                {type:'potion', chance:0.4},
                {type:'strength', chance:0.2},
                {type:'bomb', chance:0.3}
            ]
        });
    } else {
        addComponent(eid, 'health', {hp:12, maxHp:12});
        addComponent(eid, 'stats', {strength:6, agility:12, accuracy:7, evasion:6});
        addComponent(eid, 'descriptor', {name:'Goblin', glyph:'g', color:'brown'});
        addComponent(eid, 'xpValue', {xp:8});
        addComponent(eid, 'lootTable', {
            drops: [
                {type:'gold', amount:[3,10], chance:0.65},
                {type:'speed', chance:0.25},
                {type:'scroll', chance:0.2},
                {type:'vision', chance:0.15}
            ]
        });
    }
    return eid;
}

// --- Items ---
function itemDataFor(type){
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

function createItemFromData(data,x,y){
    var eid = createEntity();
    addComponent(eid, 'position', {x:x, y:y});
    addComponent(eid, 'item', JSON.parse(JSON.stringify(data)));
    addComponent(eid, 'descriptor', {name:data.name, glyph:data.glyph, color:data.color});
    addComponent(eid, 'blocker', {passable:true});
    return eid;
}

function createItem(type,x,y){
    return createItemFromData(itemDataFor(type), x, y);
}

function spawnItemsAvoiding(px,py){
    for (var i=0;i<rooms.length;i++){
        if (Math.random()<0.5){
            var r=rooms[i];
            var x=randInt(r.x, r.x+r.width-1);
            var y=randInt(r.y, r.y+r.height-1);
            if (x===px && y===py) continue;
            var types=['potion','bomb','scroll'];
            createItem(types[randInt(0,types.length-1)], x, y);
        }
    }
}

function spawnMonstersAvoiding(px,py){
    var types=['slime','orc','goblin'];
    for (var i=0;i<Math.min(rooms.length,6);i++){
        if (Math.random()<0.7){
            var r=rooms[i];
            var x=randInt(r.x, r.x+r.width-1);
            var y=randInt(r.y, r.y+r.height-1);
            if (x===px && y===py) continue;
            createMonster(types[randInt(0,types.length-1)], x, y);
        }
    }
}

// --- Items with Statistics Tracking ---
function dropLoot(victimId){
    var loot = getComponent(victimId, 'lootTable');
    var pos = getComponent(victimId, 'position');
    if (!loot || !pos) return;
    
    var floorBonus = Math.abs(floor) * 0.05;
    
    for (var i = 0; i < loot.drops.length; i++){
        var drop = loot.drops[i];
        var chance = Math.min(drop.chance + floorBonus, 0.95);
        
        if (Math.random() < chance){
            if (drop.type === 'gold'){
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

function pickupItemsAt(x,y){
    var inv = getComponent(playerEid,'inventory');
    if (!inv) return;
    var here = getEntitiesAt(x,y);
    for (var i=0;i<here.length;i++){
        var eid = here[i];
        if (eid===playerEid) continue;
        var item = getComponent(eid,'item');
        if (item){
            if (item.effect === 'gold'){
                var amount = item.amount || 1;
                playerGold += amount;
                gameStats.goldCollected += amount;
                addMessage('Picked up '+amount+' gold! (Total: '+playerGold+')');
                destroyEntity(eid);
            } else {
                if (inv.items.length >= inv.capacity){ 
                    addMessage('Inventory full!'); 
                    continue; 
                }
                inv.items.push(JSON.parse(JSON.stringify(item)));
                var name = item.name || 'item';
                var rarity = item.rarity || 'common';
                var color = rarity === 'epic' ? 'Epic ' : rarity === 'rare' ? 'Rare ' : '';
                destroyEntity(eid);
                addMessage('Picked up '+color+name+'.');
                gameStats.itemsPickedUp++;
            }
        }
    }
}

function useInventoryItem(index){
    var inv = getComponent(playerEid,'inventory');
    if (!inv || index<0 || index>=inv.items.length) return false;
    var it = inv.items[index];
    var used = false;
    var hp = getComponent(playerEid,'health');
    var st = getComponent(playerEid,'status');
    var stats = getComponent(playerEid,'stats');
    
    switch (it.effect){
        case 'heal':
            if (!hp) break;
            var before = hp.hp;
            hp.hp = clamp(hp.hp + (it.amount||0), 0, hp.maxHp);
            var healed = hp.hp - before;
            addMessage('You quaff the potion (+'+healed+' HP).');
            gameStats.potionsUsed++;
            used = true; break;
            
        case 'bomb':
            var ppos = getComponent(playerEid,'position');
            if (!ppos) break;
            var rad = it.radius || 1;
            var dmg = it.damage || 15;
            var hit = 0;
            for (var dy=-rad; dy<=rad; dy++){
                for (var dx=-rad; dx<=rad; dx++){
                    if (dx===0 && dy===0) continue;
                    var tx=ppos.x+dx, ty=ppos.y+dy;
                    if (!inBounds(tx,ty)) continue;
                    var ents = getEntitiesAt(tx,ty);
                    for (var e=0;e<ents.length;e++){
                        var eid = ents[e];
                        if (eid===playerEid) continue;
                        var th = getComponent(eid,'health');
                        var td = getComponent(eid,'descriptor');
                        if (th && th.hp>0){
                            th.hp -= dmg; hit++;
                            gameStats.totalDamageDealt += dmg;
                            addMessage('The bomb hits '+(td?td.name:'enemy')+' for '+dmg+'!');
                            if (th.hp<=0){ addMessage((td?td.name:'enemy')+' defeated!'); onKill(eid, playerEid); }
                        }
                    }
                }
            }
            if (hit>0){ used = true; playerAttackedThisTurn = true; }
            else { addMessage('The bomb fizzles harmlessly.'); used = true; }
            gameStats.bombsUsed++;
            break;
            
        case 'light':
            var v = getComponent(playerEid,'vision');
            if (v){
                var bonus = it.bonus || 3;
                var turns = it.turns || 20;
                v.radius = (v.baseRadius||v.radius) + bonus;
                if (!st) { st = {lightBoost:0}; addComponent(playerEid,'status',st); }
                st.lightBoost = turns;
                addMessage('A brilliant light surrounds you! (+'+bonus+' vision for '+turns+' turns)');
                gameStats.scrollsUsed++;
                used = true;
            }
            break;
            
        case 'speed':
            if (!st) { st = {speedBoost:0}; addComponent(playerEid,'status',st); }
            st.speedBoost = it.turns || 15;
            addMessage('You feel much faster! (Extra action every other turn for '+st.speedBoost+' turns)');
            gameStats.potionsUsed++;
            used = true;
            break;
            
        case 'strength':
            if (!st) { st = {strengthBoost:0}; addComponent(playerEid,'status',st); }
            if (!stats) break;
            st.strengthBoost = it.turns || 20;
            st.strengthBonusAmount = it.bonus || 5;
            stats.strength += st.strengthBonusAmount;
            addMessage('You feel stronger! (+'+st.strengthBonusAmount+' STR for '+st.strengthBoost+' turns)');
            gameStats.potionsUsed++;
            used = true;
            break;
            
        case 'vision':
            var v = getComponent(playerEid,'vision');
            if (v){
                var bonus = it.bonus || 2;
                v.radius += bonus;
                v.baseRadius = v.radius;
                addMessage('Your vision expands permanently! (+'+bonus+' vision radius)');
                used = true;
            }
            break;
            
        default:
            addMessage('Nothing happens.');
            used = true;
    }
    if (used){ inv.items.splice(index,1); }
    return used;
}

function dropInventoryItem(index){
    var inv = getComponent(playerEid,'inventory');
    var ppos = getComponent(playerEid,'position');
    if (!inv || !ppos || index<0 || index>=inv.items.length) return false;
    var data = inv.items[index];
    createItemFromData(data, ppos.x, ppos.y);
    addMessage('Dropped '+(data.name||'item')+'.');
    inv.items.splice(index,1);
    gameStats.itemsDropped++;
    return true;
}

// --- Vision / LOS ---
function canSeePlayer(eid){
    var mpos = getComponent(eid,'position');
    var v = getComponent(eid,'vision');
    var ppos = getComponent(playerEid,'position');
    if (!mpos || !v || !ppos) return false;
    var dx = ppos.x - mpos.x, dy = ppos.y - mpos.y;
    if (dx*dx + dy*dy > v.radius*v.radius) return false;
    var canSee = hasLineOfSight(mpos.x, mpos.y, ppos.x, ppos.y);
    if (canSee) gameStats.timesSeen++;
    return canSee;
}

function updateVision(eid){
    var pos = getComponent(eid,'position');
    var v = getComponent(eid,'vision');
    if (!pos || !v) return;
    v.visible.clear();
    v.visible.add(pos.x+','+pos.y);
    v.seen.add(pos.x+','+pos.y);
    var r = v.radius;
    for (var dy=-r; dy<=r; dy++){
        for (var dx=-r; dx<=r; dx++){
            if (dx===0 && dy===0) continue;
            var tx=pos.x+dx, ty=pos.y+dy;
            if (!inBounds(tx,ty) || dx*dx+dy*dy>r*r) continue;
            if (hasLineOfSight(pos.x,pos.y,tx,ty)){
                v.visible.add(tx+','+ty);
                v.seen.add(tx+','+ty);
            }
        }
    }
}

function hasLineOfSight(x0,y0,x1,y1){
    var pts = bresenhamLine(x0,y0,x1,y1);
    for (var i=1;i<pts.length-1;i++){
        var p=pts[i];
        if (!inBounds(p.x,p.y)) return false;
        if (dungeonGrid[p.y][p.x].opaque) return false;
    }
    return true;
}

function bresenhamLine(x0,y0,x1,y1){
    var pts=[], dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
    var sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx-dy, x=x0, y=y0;
    while (true){
        pts.push({x:x,y:y});
        if (x===x1 && y===y1) break;
        var e2 = 2*err;
        if (e2>-dy){ err-=dy; x+=sx; }
        if (e2<dx){ err+=dx; y+=sy; }
    }
    return pts;
}

// --- Movement / Combat ---
function processMovement(){
    var events = drainEvents();
    for (var i=0;i<events.length;i++){
        if (events[i].type==='move') handleMove(events[i].entityId, events[i].toX, events[i].toY);
    }
}

function handleMove(eid, toX, toY){
    var pos = getComponent(eid,'position');
    if (!pos) return;

    if (!inBounds(toX,toY)){ if (eid===playerEid) addMessage("Can't go that way!"); return; }
    if (!dungeonGrid[toY][toX].walkable) return;

    var at = getEntitiesAt(toX,toY);
    for (var i=0;i<at.length;i++){
        var tid=at[i]; if (tid===eid) continue;
        var blocker = getComponent(tid,'blocker');
        if (blocker && !blocker.passable){
            var th = getComponent(tid,'health');
            if (th && th.hp>0){
                handleAttack(eid, tid);
                return;
            }
        }
    }

    pos.x=toX; pos.y=toY;

    if (eid===playerEid){ 
        pickupItemsAt(toX, toY);
        var t = dungeonGrid[toY][toX];
        if (t && t.glyph==='>') nextLevel();
    }
}

function handleAttack(attackerId, targetId){
    var as = getComponent(attackerId,'stats');
    var th = getComponent(targetId,'health');
    var td = getComponent(targetId,'descriptor');
    if (!as || !th) return;

    var dmg = randInt(3,8) + Math.floor(as.strength/3);
    th.hp -= dmg;

    // Track stats
    if (attackerId === playerEid) {
        playerAttackedThisTurn = true;
        gameStats.totalDamageDealt += dmg;
        gameStats.timesAttacked++;
    } else if (targetId === playerEid) {
        gameStats.totalDamageTaken += dmg;
    }

    var name = td ? td.name : 'enemy';
    addMessage('Dealt '+dmg+' damage to '+name+'!');

    if (th.hp<=0){
        addMessage(name+' defeated!');
        
        // Track death cause for player
        if (targetId === playerEid) {
            gameStats.deathCause = 'Combat';
            gameStats.killedBy = name;
            gameStats.endTime = Date.now();
        }
        
        onKill(targetId, attackerId);
        if (targetId===playerEid){
            gameOver=true; gameState='gameOver';
            addMessage('You have died! Press R to restart.');
        }
    }
}

function processAI(){
    var aiList = getEntitiesWith(['ai','position','health']);
    var ppos = getComponent(playerEid,'position');
    for (var i=0;i<aiList.length;i++){
        var eid = aiList[i];
        var hp = getComponent(eid,'health');
        if (!hp || hp.hp<=0) continue;

        var ai = getComponent(eid,'ai');
        var pos = getComponent(eid,'position');

        if (!ai.active){
            if (canSeePlayer(eid)){
                ai.active = true;
                ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
            }
            continue;
        }

        if (canSeePlayer(eid)){
            ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
        }

        if (ai.lastPlayerPos){
            var tx = ai.lastPlayerPos.x, ty = ai.lastPlayerPos.y;
            var dx = tx - pos.x, dy = ty - pos.y;
            var mx = 0, my = 0;

            if (Math.abs(dx) > Math.abs(dy)) mx = dx>0 ? 1 : -1;
            else if (dy !== 0)               my = dy>0 ? 1 : -1;

            if (mx!==0 || my!==0){
                postEvent({type:'move', entityId:eid, toX:pos.x+mx, toY:pos.y+my});
            }
        }
    }
}

function getEntitiesAt(x,y){
    var out=[], list=getEntitiesWith(['position']);
    for (var i=0;i<list.length;i++){
        var p=getComponent(list[i],'position');
        if (p && p.x===x && p.y===y) out.push(list[i]);
    }
    return out;
}

function gainXP(amount){
    var prog = getComponent(playerEid, 'progress');
    if (!prog) return;
    prog.xp += Math.max(0, amount|0);
    gameStats.totalXpGained += Math.max(0, amount|0);
    addMessage('Gained '+amount+' XP.');
    while (prog.xp >= prog.next){
        prog.xp -= prog.next;
        prog.level += 1;
        prog.next = Math.floor(prog.next * 1.5) + 10;

        var hp = getComponent(playerEid, 'health');
        var st = getComponent(playerEid, 'stats');
        if (hp){ hp.maxHp += 10; hp.hp = hp.maxHp; }
        if (st){ st.strength += 1; st.accuracy += 1; if (prog.level % 2 === 0) st.agility += 1; }
        addMessage('You are now level '+prog.level+'! (+stats, HP restored)');
        
        gameStats.highestLevel = Math.max(gameStats.highestLevel, prog.level);
    }
}

function onKill(victimId, killerId){
    dropLoot(victimId);
    
    if (killerId !== playerEid) { 
        destroyEntity(victimId); 
        return; 
    }
    
    // Track enemy kills
    gameStats.enemiesKilled++;
    
    var xv = getComponent(victimId, 'xpValue');
    if (xv && typeof xv.xp === 'number'){ 
        gainXP(xv.xp); 
    }
    destroyEntity(victimId);
}

function enemyAdjacentAutoAttacks(){
    var ppos = getComponent(playerEid,'position');
    if (!ppos) return;
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var i=0;i<dirs.length;i++){
        var nx = ppos.x + dirs[i][0];
        var ny = ppos.y + dirs[i][1];
        if (!inBounds(nx,ny)) continue;

        var ents = getEntitiesAt(nx,ny);
        for (var j=0;j<ents.length;j++){
            var eid = ents[j];
            if (eid === playerEid) continue;

            var hp = getComponent(eid,'health');
            if (!hp || hp.hp<=0) continue;

            var ai = getComponent(eid,'ai');
            if (ai && !(ai.active || canSeePlayer(eid))) continue;

            handleAttack(eid, playerEid);
        }
    }
}

function nextLevel(){
    floor -= 1;
    gameStats.floorsDescended++;
    justDescended = true;

    var rem = [];
    entities.forEach(function(eid){ if (eid!==playerEid) rem.push(eid); });
    for (var i=0;i<rem.length;i++) destroyEntity(rem[i]);

    generateDungeon();

    var p = getComponent(playerEid,'position');
    p.x = Math.min(Math.max(p.x,0), DUNGEON_WIDTH-1);
    p.y = Math.min(Math.max(p.y,0), DUNGEON_HEIGHT-1);
    dungeonGrid[p.y][p.x] = Tile.floor();

    var oldV = getComponent(playerEid,'vision');
    components['vision'][playerEid] = { radius: oldV ? oldV.radius : 8, baseRadius: oldV ? (oldV.baseRadius||oldV.radius) : 8, visible:new Set(), seen:new Set() };

    connectPlayerToDungeon(p.x,p.y);
    placeStairsFarthestFrom(p.x,p.y);

    spawnMonstersAvoiding(p.x,p.y);
    spawnItemsAvoiding(p.x,p.y);

    updateVision(playerEid);
    addMessage('You descend to floor '+floor+'...');
}

// --- Messages ---
function addMessage(text){
    messages.push({text:text, time:Date.now()});
    if (messages.length>10) messages = messages.slice(-10);
}
function updateMessages(){
    var now=Date.now();
    messages = messages.filter(function(m){ return now - m.time < 5000; });
}

// --- UI / Rendering ---
function render(){
    ctx.fillStyle='black'; ctx.fillRect(0,0,canvas.width,canvas.height);
    if (gameState==='start'){ renderStart(); return; }
    if (!playerEid) return;

    if (gameState==='playing' || gameState==='paused' || gameState==='gameOver'){
        renderDungeon();
        renderEntities();
        renderLighting();
        renderHUD();
        renderMessages();

        if (uiMode==='inventory') renderInventoryOverlay();
        if (gameState==='paused') renderPause();
        else if (gameState==='gameOver') renderGameOver();
    }
}

function renderStart(){
    ctx.font='48px monospace';
    ctx.fillStyle='white';
    ctx.textAlign='center';
    ctx.fillText('DUNGEON DURGON', canvas.width/2, canvas.height/2 - 50);
    ctx.font='24px monospace';
    ctx.fillStyle='lime';
    ctx.fillText('Press SPACE to start', canvas.width/2, canvas.height/2 + 20);
    ctx.font='16px monospace';
    ctx.fillStyle='#ccc';
    ctx.fillText('WASD: Move | I: Inventory | R: Restart', canvas.width/2, canvas.height/2 + 60);
    ctx.textAlign='left';
}

function renderPause(){
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font='48px monospace'; ctx.fillStyle='yellow'; ctx.textAlign='center';
    ctx.fillText('PAUSED', canvas.width/2, canvas.height/2);
    ctx.font='20px monospace'; ctx.fillStyle='white';
    ctx.fillText('Press ESC to resume', canvas.width/2, canvas.height/2 + 40);
    ctx.textAlign='left';
}

function renderGameOver(){
    ctx.fillStyle='rgba(20,0,0,0.95)'; 
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    var centerX = canvas.width/2;
    var startY = 50;
    
    // Title
    ctx.font='48px monospace'; 
    ctx.fillStyle='#ff6666'; 
    ctx.textAlign='center';
    ctx.fillText('GAME OVER', centerX, startY);
    
    // Death info
    ctx.font='20px monospace'; 
    ctx.fillStyle='#ffaaaa';
    ctx.fillText('Killed by: ' + gameStats.killedBy, centerX, startY + 60);
    ctx.fillText('Cause: ' + gameStats.deathCause, centerX, startY + 85);
    
    // Calculate survival time
    var survivalTime = gameStats.endTime - gameStats.startTime;
    var minutes = Math.floor(survivalTime / 60000);
    var seconds = Math.floor((survivalTime % 60000) / 1000);
    
    // Main stats
    ctx.font='18px monospace'; 
    ctx.fillStyle='white';
    var y = startY + 130;
    var lineHeight = 22;
    
    ctx.fillText('═══ FINAL STATISTICS ═══', centerX, y);
    y += lineHeight * 1.5;
    
    // Create two columns
    ctx.textAlign='left';
    var leftX = centerX - 180;
    var rightX = centerX + 40;
    
    // Left column
    var leftY = y;
    ctx.fillStyle='#ffdd88';
    ctx.fillText('SURVIVAL', leftX, leftY);
    ctx.fillStyle='white';
    leftY += lineHeight;
    ctx.fillText('Turns Survived: ' + turnCount, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Time Played: ' + minutes + 'm ' + seconds + 's', leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Floors Descended: ' + gameStats.floorsDescended, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Deepest Floor: ' + Math.abs(floor), leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Final Level: ' + gameStats.highestLevel, leftX, leftY);
    leftY += lineHeight + 10;
    
    ctx.fillStyle='#88ddff';
    ctx.fillText('COMBAT', leftX, leftY);
    ctx.fillStyle='white';
    leftY += lineHeight;
    ctx.fillText('Enemies Killed: ' + gameStats.enemiesKilled, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Damage Dealt: ' + gameStats.totalDamageDealt, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Damage Taken: ' + gameStats.totalDamageTaken, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Times Attacked: ' + gameStats.timesAttacked, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Times Spotted: ' + Math.floor(gameStats.timesSeen / 10), leftX, leftY);
    
    // Right column
    var rightY = y;
    ctx.fillStyle='#ffdd88';
    ctx.fillText('PROGRESSION', rightX, rightY);
    ctx.fillStyle='white';
    rightY += lineHeight;
    ctx.fillText('Total XP Gained: ' + gameStats.totalXpGained, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Gold Collected: ' + gameStats.goldCollected, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Final Gold: ' + playerGold, rightX, rightY);
    rightY += lineHeight + 10;
    
    ctx.fillStyle='#88ff88';
    ctx.fillText('ITEMS', rightX, rightY);
    ctx.fillStyle='white';
    rightY += lineHeight;
    ctx.fillText('Items Picked Up: ' + gameStats.itemsPickedUp, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Items Dropped: ' + gameStats.itemsDropped, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Potions Used: ' + gameStats.potionsUsed, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Bombs Used: ' + gameStats.bombsUsed, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Scrolls Used: ' + gameStats.scrollsUsed, rightX, rightY);
    
    // Calculate some derived stats
    var efficiencyRatio = gameStats.totalDamageDealt > 0 ? (gameStats.totalDamageTaken / gameStats.totalDamageDealt).toFixed(2) : '0.00';
    var avgDamagePerTurn = turnCount > 0 ? (gameStats.totalDamageDealt / turnCount).toFixed(1) : '0.0';
    var xpPerTurn = turnCount > 0 ? (gameStats.totalXpGained / turnCount).toFixed(1) : '0.0';
    var goldPerFloor = gameStats.floorsDescended > 0 ? Math.floor(gameStats.goldCollected / gameStats.floorsDescended) : 0;
    
    // Bottom derived stats
    ctx.textAlign='center';
    var bottomY = canvas.height - 120;
    ctx.fillStyle='#dddd88';
    ctx.fillText('═══ PERFORMANCE METRICS ═══', centerX, bottomY);
    bottomY += lineHeight;
    
    ctx.fillStyle='#cccccc';
    ctx.font='16px monospace';
    ctx.fillText('Damage Efficiency: ' + efficiencyRatio + ' (lower is better)', centerX, bottomY);
    bottomY += lineHeight - 2;
    ctx.fillText('Avg Damage/Turn: ' + avgDamagePerTurn + ' | XP/Turn: ' + xpPerTurn + ' | Gold/Floor: ' + goldPerFloor, centerX, bottomY);
    
    // Restart instruction
    ctx.font='24px monospace'; 
    ctx.fillStyle='#88ff88';
    ctx.fillText('Press R to restart', centerX, canvas.height - 40);
    ctx.textAlign='left';
}

function renderDungeon(){
    var v = getComponent(playerEid,'vision'); if (!v) return;
    for (var y=0;y<DUNGEON_HEIGHT;y++){
        for (var x=0;x<DUNGEON_WIDTH;x++){
            var tile = dungeonGrid[y][x];
            var screenX = x*TILE_SIZE, screenY=y*TILE_SIZE;
            var isVisible = v.visible.has(x+','+y);
            var isSeen    = v.seen.has(x+','+y);
            if (isVisible){
                ctx.fillStyle = 'rgb('+tile.color.join(',')+')';
                ctx.fillRect(screenX,screenY,TILE_SIZE,TILE_SIZE);
                if (tile.glyph && tile.glyph!=='.'){
                    ctx.font=(TILE_SIZE-4)+'px monospace';
                    ctx.fillStyle = tile.glyph==='>' ? 'gold' : 'white';
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText(tile.glyph, screenX+TILE_SIZE/2, screenY+TILE_SIZE/2);
                }
            } else if (isSeen){
                var dim = tile.color.map(function(c){ return Math.floor(c/4); });
                ctx.fillStyle = 'rgb('+dim.join(',')+')';
                ctx.fillRect(screenX,screenY,TILE_SIZE,TILE_SIZE);
            } else {
                ctx.fillStyle = 'rgb(20,20,30)';
                ctx.fillRect(screenX,screenY,TILE_SIZE,TILE_SIZE);
            }
        }
    }
}

function renderEntities(){
    var v = getComponent(playerEid,'vision'); if (!v) return;
    var list = getEntitiesWith(['position','descriptor']);
    for (var i=0;i<list.length;i++){
        var eid=list[i];
        var pos=getComponent(eid,'position');
        var desc=getComponent(eid,'descriptor');
        var hp=getComponent(eid,'health');
        if (hp && hp.hp<=0) continue;
        if (!v.visible.has(pos.x+','+pos.y)) continue;

        var screenX=pos.x*TILE_SIZE, screenY=pos.y*TILE_SIZE;
        var color=parseColor(desc.color);
        ctx.font=(TILE_SIZE-2)+'px monospace';
        ctx.fillStyle='rgb('+color.join(',')+')';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(desc.glyph, screenX+TILE_SIZE/2, screenY+TILE_SIZE/2);

        if (hp && hp.hp<hp.maxHp && desc.glyph!=='@'){
            var bw=TILE_SIZE-4, bh=4, bx=screenX+2, by=screenY-2;
            ctx.fillStyle='rgba(100,0,0,0.8)'; ctx.fillRect(bx,by,bw,bh);
            var pct = hp.hp/hp.maxHp, fw=bw*pct;
            ctx.fillStyle = pct>0.6 ? 'rgba(0,255,0,0.8)' : pct>0.3 ? 'rgba(255,255,0,0.8)' : 'rgba(255,0,0,0.8)';
            ctx.fillRect(bx,by,fw,bh);
        }
    }
    ctx.textAlign='left'; ctx.textBaseline='top';
}

function renderLighting(){
    if (lightCanvas.width!==DUNGEON_PIXEL_WIDTH || lightCanvas.height!==DUNGEON_PIXEL_HEIGHT){
        lightCanvas.width=DUNGEON_PIXEL_WIDTH; 
        lightCanvas.height=DUNGEON_PIXEL_HEIGHT;
    }
    var pos = getComponent(playerEid,'position');
    var v   = getComponent(playerEid,'vision');
    if (!pos || !v) return;

    lightCtx.clearRect(0,0,lightCanvas.width, lightCanvas.height);

    lightCtx.globalCompositeOperation='source-over';
    lightCtx.fillStyle='rgba(0,0,0,1)';
    lightCtx.fillRect(0,0,DUNGEON_PIXEL_WIDTH, DUNGEON_PIXEL_HEIGHT);

    if (v.seen && v.seen.size){
        lightCtx.globalCompositeOperation='destination-out';
        lightCtx.beginPath();
        v.seen.forEach(function(key){
            if (!v.visible.has(key)){
                var parts = key.split(',');
                var tx = (parts[0]|0) * TILE_SIZE;
                var ty = (parts[1]|0) * TILE_SIZE;
                lightCtx.rect(tx,ty,TILE_SIZE,TILE_SIZE);
            }
        });
        lightCtx.fillStyle='rgba(0,0,0,'+MEMORY_REVEAL+')';
        lightCtx.fill();
    }

    var cx = (pos.x+0.5)*TILE_SIZE, cy=(pos.y+0.5)*TILE_SIZE;
    var outer = v.radius * TILE_SIZE;
    var grad = lightCtx.createRadialGradient(cx,cy,0, cx,cy,outer);

    var gamma = 2.2;
    function a(t){ return 1 - Math.pow(t, gamma); }
    grad.addColorStop(0.00, 'rgba(0,0,0,'+a(0.00)+')');
    grad.addColorStop(0.50, 'rgba(0,0,0,'+a(0.50)+')');
    grad.addColorStop(0.75, 'rgba(0,0,0,'+a(0.75)+')');
    grad.addColorStop(0.90, 'rgba(0,0,0,'+a(0.90)+')');
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');

    lightCtx.save();
    lightCtx.beginPath();
    v.visible.forEach(function(key){
        var parts = key.split(',');
        var tx = (parts[0]|0) * TILE_SIZE;
        var ty = (parts[1]|0) * TILE_SIZE;
        lightCtx.rect(tx,ty,TILE_SIZE,TILE_SIZE);
    });
    lightCtx.clip();

    lightCtx.globalCompositeOperation='destination-out';
    lightCtx.fillStyle = grad;
    lightCtx.fillRect(0,0,DUNGEON_PIXEL_WIDTH, DUNGEON_PIXEL_HEIGHT);
    lightCtx.restore();

    lightCtx.globalCompositeOperation='source-over';
    ctx.drawImage(lightCanvas,0,0);
}

function renderHUD(){
    var hp=getComponent(playerEid,'health');
    var stats=getComponent(playerEid,'stats');
    var inv=getComponent(playerEid,'inventory');
    var prog=getComponent(playerEid,'progress');
    var st=getComponent(playerEid,'status');
    if (!hp) return;
    var uiH=100, hudY=canvas.height-uiH;
    ctx.fillStyle='rgba(16,16,32,0.95)'; ctx.fillRect(0,hudY,canvas.width,uiH);
    ctx.strokeStyle='#444'; ctx.lineWidth=1; ctx.strokeRect(0,hudY,canvas.width,uiH);

    var margin=12;
    var textY = hudY + margin + 28;
    ctx.font='16px monospace'; ctx.fillStyle='white';
    ctx.fillText('HP: '+hp.hp+'/'+hp.maxHp, margin, textY);
    var barX=margin+100, barW=180, barH=12, barY=textY-10;
    ctx.fillStyle='#400'; ctx.fillRect(barX,barY,barW,barH);
    if (hp.maxHp>0){
        var fw=(hp.hp/hp.maxHp)*barW;
        var col = hp.hp>hp.maxHp*0.6 ? '#4a4' : hp.hp>hp.maxHp*0.3 ? '#aa4' : '#a44';
        ctx.fillStyle=col; ctx.fillRect(barX,barY,fw,barH);
    }
    ctx.strokeStyle='#888'; ctx.strokeRect(barX,barY,barW,barH);

    if (prog){
        var xpY = barY + 18;
        var xpw = 180, xpx = barX;
        ctx.fillStyle='#222'; ctx.fillRect(xpx,xpY,xpw,8);
        var fp = Math.min(1, prog.xp/Math.max(1,prog.next));
        ctx.fillStyle='#58a6ff'; ctx.fillRect(xpx,xpY, xpw*fp, 8);
        ctx.strokeStyle='#666'; ctx.strokeRect(xpx,xpY,xpw,8);
        ctx.font='12px monospace'; ctx.fillStyle='#9cf';
        ctx.fillText('LVL '+prog.level+'  XP '+prog.xp+'/'+prog.next, xpx + xpw + 10, xpY+8);
    }

    ctx.font='14px monospace'; ctx.fillStyle='#ffcc00';
    ctx.fillText('Gold: '+playerGold, margin + 500, textY);

    var y = textY + 20; ctx.font='12px monospace';
    if (stats){
        ctx.fillStyle='#ccc';
        var statStr = 'STR:'+stats.strength+' AGI:'+stats.agility+' ACC:'+stats.accuracy+' EVA:'+stats.evasion;
        if (st){
            if (st.strengthBoost>0) statStr += ' [STR+]';
            if (st.speedBoost>0) statStr += ' [SPD+]';
            if (st.lightBoost>0) statStr += ' [VIS+]';
        }
        ctx.fillText(statStr, margin, y);
    }
    if (inv){
        ctx.fillStyle='#9cf';
        ctx.fillText('Items: '+inv.items.length+'/'+inv.capacity+' (press I)', margin+360, y);
    }
    ctx.fillStyle='#666';
    ctx.fillText('Turn: '+turnCount+' | Lvl: '+(prog?prog.level:1)+' | Floor: '+floor+' | Press R to restart, ESC to pause', margin, y+14);
}

function renderMessages(){
    if (messages.length===0) return;
    var uiH=100, hudY=canvas.height-uiH, margin=12;
    ctx.font='12px monospace';
    ctx.textAlign='right';
    var lineH=14;
    var y = hudY + uiH - margin;
    var start = Math.max(0, messages.length-4);
    for (var i=messages.length-1; i>=start; i--){
        var m=messages[i], age=Date.now()-m.time, a=Math.max(0.3, 1-(age/5000));
        ctx.globalAlpha=a; ctx.fillStyle='#ddd';
        ctx.fillText(m.text, canvas.width - margin, y);
        ctx.globalAlpha=1;
        y -= lineH;
    }
    ctx.textAlign='left';
}

function renderInventoryOverlay(){
    var inv = getComponent(playerEid,'inventory');
    ctx.fillStyle='rgba(0,0,0,0.8)'; 
    ctx.fillRect(0,0,canvas.width,canvas.height);

    var w=520, h=380;
    var x=(canvas.width-w)/2, y=(canvas.height-h)/2;
    ctx.fillStyle='rgba(20,20,40,0.95)'; 
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#88f'; ctx.lineWidth=2; 
    ctx.strokeRect(x,y,w,h);

    ctx.fillStyle='#fff'; 
    ctx.font='22px monospace'; 
    ctx.textAlign='left'; 
    ctx.textBaseline='top';
    ctx.fillText('Inventory ('+(inv?inv.items.length:0)+'/'+(inv?inv.capacity:0)+')', x+16, y+16);

    ctx.font='14px monospace'; 
    ctx.fillStyle='#ccc';
    ctx.fillText('↑/↓ or W/S: select   ENTER/SPACE: use   D: drop   I/ESC: close', x+16, y+h-28);

    var listTop = y+60;

    if (!inv || inv.items.length===0){
        ctx.fillStyle='#bbb'; 
        ctx.font='18px monospace';
        ctx.fillText('(empty)', x+16, listTop);
        return;
    }

    ctx.font = '16px monospace';
    ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText('M');
    var ascent  = m.actualBoundingBoxAscent || 14;
    var descent = m.actualBoundingBoxDescent || 4;
    var rowH = ascent + descent + 4;

    invSelIndex = clamp(invSelIndex, 0, inv.items.length-1);

    for (var i=0;i<inv.items.length;i++){
        var baselineY = listTop + i*rowH + ascent;

        if (i===invSelIndex){
            ctx.fillStyle='rgba(60,60,120,0.85)';
            ctx.fillRect(x+10, baselineY - ascent - 2, w-20, rowH);
        }

        var it = inv.items[i];
        var rarityColor = it.rarity === 'epic' ? '#ff99ff' : it.rarity === 'rare' ? '#99ccff' : '#fff';
        ctx.fillStyle=rarityColor; 
        ctx.fillText(((i+1)+'. ').padEnd(3,' ') + (it.name||'Item'), x+16, baselineY);
    }

    var sel = inv.items[invSelIndex];
    if (sel){
        ctx.font='16px monospace'; 
        ctx.fillStyle='#9cf'; 
        ctx.textBaseline='top';
        ctx.fillText('Details: '+(sel.desc||'No description.'), x+16, y+h-52);
    }
}

// --- Turn / Input ---
function processTurn(){
    playerAttackedThisTurn = false;

    processMovement();

    processAI();
    processMovement();

    var seers=getEntitiesWith(['vision','position']);
    for (var i=0;i<seers.length;i++) updateVision(seers[i]);

    if (!playerAttackedThisTurn && !justDescended) {
        enemyAdjacentAutoAttacks();
    }

    var st = getComponent(playerEid,'status');
    var stats = getComponent(playerEid,'stats');
    if (st){
        if (st.lightBoost>0){
            st.lightBoost--;
            if (st.lightBoost===0){
                var v = getComponent(playerEid,'vision');
                if (v) v.radius = v.baseRadius || v.radius;
                addMessage('The bright light fades.');
            }
        }
        if (st.speedBoost>0){
            st.speedBoost--;
            if (st.speedBoost===0){
                addMessage('You return to normal speed.');
            }
        }
        if (st.strengthBoost>0){
            st.strengthBoost--;
            if (st.strengthBoost===0 && stats && st.strengthBonusAmount){
                stats.strength -= st.strengthBonusAmount;
                addMessage('Your strength returns to normal.');
                st.strengthBonusAmount = 0;
            }
        }
    }

    justDescended = false;
    turnCount++;
    
    if (st && st.speedBoost > 0 && turnCount % 2 === 0){
        return true;
    }
    return false;
}

function resetGame(){
    gameState='playing';
    uiMode='game';
    gameOver=false;
    justDescended=false;
    playerGold=0;
    turnCount=0;
    
    gameStats = {
        enemiesKilled: 0,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        itemsPickedUp: 0,
        goldCollected: 0,
        potionsUsed: 0,
        bombsUsed: 0,
        scrollsUsed: 0,
        itemsDropped: 0,
        floorsDescended: 0,
        timesSeen: 0,
        timesAttacked: 0,
        highestLevel: 1,
        totalXpGained: 0,
        deathCause: 'Unknown',
        killedBy: 'Unknown',
        startTime: Date.now(),
        endTime: 0
    };
    
    initGame();
}

function setupInput(){
    document.addEventListener('keydown', function(e){
        var key = e.key;
        if (gameState==='start'){ 
            if (key===' '){ gameState='playing'; initGame(); } 
            e.preventDefault(); return; 
        }

        if (gameState==='paused'){ 
            if (key==='Escape') gameState='playing'; 
            e.preventDefault(); return; 
        }
        if (gameState==='gameOver'){ 
            if (key==='r' || key==='R'){ resetGame(); } 
            e.preventDefault(); return; 
        }
        if (gameState!=='playing' || gameOver) return;

        if (uiMode==='inventory'){
            var inv = getComponent(playerEid,'inventory');
            var n = inv ? inv.items.length : 0;
            if (key==='i' || key==='I' || key==='Escape'){ 
                uiMode='game'; e.preventDefault(); return; 
            }
            if (n>0){
                if (key==='ArrowUp' || key==='w' || key==='W'){ 
                    invSelIndex = (invSelIndex-1+n)%n; e.preventDefault(); return; 
                }
                if (key==='ArrowDown' || key==='s' || key==='S'){ 
                    invSelIndex = (invSelIndex+1)%n; e.preventDefault(); return; 
                }
                if (key==='Enter' || key===' '){ 
                    if (useInventoryItem(invSelIndex)){ 
                        uiMode='game'; 
                        processTurn(); 
                    } 
                    e.preventDefault(); return; 
                }
                if (key==='d' || key==='D'){ 
                    if (dropInventoryItem(invSelIndex)){ 
                        uiMode='game'; 
                        processTurn(); 
                    } 
                    e.preventDefault(); return; 
                }
                if (key>='1' && key<='9'){
                    var idx = (key.charCodeAt(0)-'1'.charCodeAt(0));
                    if (idx<n && useInventoryItem(idx)){ 
                        uiMode='game'; 
                        processTurn(); 
                    }
                    e.preventDefault(); return;
                }
            } else {
                if (key==='Enter' || key===' '){ 
                    uiMode='game'; e.preventDefault(); return; 
                }
            }
            e.preventDefault();
            return;
        }

        var pp = getComponent(playerEid,'position'); 
        if (!pp) return;
        var dx=0, dy=0;
        switch (key){
            case 'w': case 'W': case 'ArrowUp': dy=-1; break;
            case 's': case 'S': case 'ArrowDown': dy=1; break;
            case 'a': case 'A': case 'ArrowLeft': dx=-1; break;
            case 'd': case 'D': case 'ArrowRight': dx=1; break;
            case ' ': addMessage('You wait.'); processTurn(); e.preventDefault(); return;
            case 'i': case 'I': uiMode='inventory'; invSelIndex=0; e.preventDefault(); return;
            case 'r': case 'R': resetGame(); e.preventDefault(); return;
            case 'Escape': gameState='paused'; e.preventDefault(); return;
        }
        if (dx!==0 || dy!==0){
            postEvent({type:'move', entityId:playerEid, toX:pp.x+dx, toY:pp.y+dy});
            var extraAction = processTurn();
            if (extraAction) addMessage('Speed boost: extra action!');
            e.preventDefault();
        }
    });
}

// --- Init ---
function initGame(){
    entities.clear(); components={}; eventQueue=[]; messages=[];
    turnCount=0; gameOver=false; floor=0; justDescended=false; uiMode='game';

    if (!gameStats.startTime) {
        gameStats.startTime = Date.now();
    }

    generateDungeon();

    var startRoom = rooms[0];
    playerEid = createPlayer(startRoom.centerX(), startRoom.centerY());

    var p = getComponent(playerEid,'position');
    connectPlayerToDungeon(p.x,p.y);
    placeStairsFarthestFrom(p.x,p.y);

    spawnMonstersAvoiding(p.x,p.y);
    spawnItemsAvoiding(p.x,p.y);

    updateVision(playerEid);
}

// --- Game loop ---
function gameLoop(){ 
    updateMessages(); 
    render(); 
    requestAnimationFrame(gameLoop); 
}

// Start
setupInput();
gameLoop();
