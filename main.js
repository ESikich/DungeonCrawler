/** =========================
 *  ECS Dungeon Crawler — With Statistics
 *  Using Game Namespace
 *  ========================= */

// Initialize canvas elements using Game namespace
if (!Game.initializeCanvasElements()) {
    alert('Canvas initialization failed');
}

// --- Entities ---
function createPlayer(x, y) {
    const eid = createEntity();
    addComponent(eid, 'position', {x: x, y: y});
    addComponent(eid, 'health', {hp: 100, maxHp: 100});
    addComponent(eid, 'stats', {strength: 14, agility: 12, accuracy: 6, evasion: 4});
    addComponent(eid, 'vision', {radius: 2, baseRadius: 2, visible: new Set(), seen: new Set()});
    addComponent(eid, 'descriptor', {name: 'Hero', glyph: '@', color: 'yellow'});
    addComponent(eid, 'blocker', {passable: false});
    addComponent(eid, 'progress', {xp: 0, level: 1, next: 20});
    addComponent(eid, 'inventory', {items: [], capacity: 12});
    addComponent(eid, 'status', {lightBoost: 0, speedBoost: 0, strengthBoost: 0});
    return eid;
}

function createMonster(type, x, y) {
    const eid = createEntity();
    addComponent(eid, 'position', {x: x, y: y});
    addComponent(eid, 'vision', {radius: 6, visible: new Set(), seen: new Set()});
    addComponent(eid, 'blocker', {passable: false});
    addComponent(eid, 'ai', {behavior: 'chase', lastPlayerPos: null, active: false});

    if (type === 'slime') {
        addComponent(eid, 'health', {hp: 15, maxHp: 15});
        addComponent(eid, 'stats', {strength: 8, agility: 6, accuracy: 5, evasion: 2});
        addComponent(eid, 'descriptor', {name: 'Green Slime', glyph: 's', color: 'green'});
        addComponent(eid, 'xpValue', {xp: 5});
        addComponent(eid, 'lootTable', {
            drops: [
                {type: 'gold', amount: [2, 8], chance: 0.6},
                {type: 'potion', chance: 0.3},
                {type: 'scroll', chance: 0.1}
            ]
        });
    } else if (type === 'orc') {
        addComponent(eid, 'health', {hp: 25, maxHp: 25});
        addComponent(eid, 'stats', {strength: 12, agility: 8, accuracy: 8, evasion: 4});
        addComponent(eid, 'descriptor', {name: 'Orc Warrior', glyph: 'o', color: 'red'});
        addComponent(eid, 'xpValue', {xp: 12});
        addComponent(eid, 'lootTable', {
            drops: [
                {type: 'gold', amount: [5, 15], chance: 0.7},
                {type: 'potion', chance: 0.4},
                {type: 'strength', chance: 0.2},
                {type: 'bomb', chance: 0.3}
            ]
        });
    } else {
        addComponent(eid, 'health', {hp: 12, maxHp: 12});
        addComponent(eid, 'stats', {strength: 6, agility: 12, accuracy: 7, evasion: 6});
        addComponent(eid, 'descriptor', {name: 'Goblin', glyph: 'g', color: 'brown'});
        addComponent(eid, 'xpValue', {xp: 8});
        addComponent(eid, 'lootTable', {
            drops: [
                {type: 'gold', amount: [3, 10], chance: 0.65},
                {type: 'speed', chance: 0.25},
                {type: 'scroll', chance: 0.2},
                {type: 'vision', chance: 0.15}
            ]
        });
    }
    return eid;
}

function spawnMonstersAvoiding(px, py) {
    const types = ['slime', 'orc', 'goblin'];
    for (let i = 0; i < Math.min(Game.world.rooms.length, 6); i++) {
        if (Math.random() < 0.7) {
            const r = Game.world.rooms[i];
            const x = randInt(r.x, r.x + r.width - 1);
            const y = randInt(r.y, r.y + r.height - 1);
            if (x === px && y === py) continue;
            createMonster(types[randInt(0, types.length - 1)], x, y);
        }
    }
}

// --- Vision / LOS ---
function canSeePlayer(eid) {
    const mpos = getComponent(eid, 'position');
    const v = getComponent(eid, 'vision');
    const ppos = getComponent(Game.world.playerEid, 'position');
    if (!mpos || !v || !ppos) return false;
    const dx = ppos.x - mpos.x, dy = ppos.y - mpos.y;
    if (dx * dx + dy * dy > v.radius * v.radius) return false;
    const canSee = hasLineOfSight(mpos.x, mpos.y, ppos.x, ppos.y);
    if (canSee) Game.stats.timesSeen++;
    return canSee;
}

function updateVision(eid) {
    const pos = getComponent(eid, 'position');
    const v = getComponent(eid, 'vision');
    if (!pos || !v) return;
    v.visible.clear();
    v.visible.add(pos.x + ',' + pos.y);
    v.seen.add(pos.x + ',' + pos.y);
    const r = v.radius;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = pos.x + dx, ty = pos.y + dy;
            if (!inBounds(tx, ty) || dx * dx + dy * dy > r * r) continue;
            if (hasLineOfSight(pos.x, pos.y, tx, ty)) {
                v.visible.add(tx + ',' + ty);
                v.seen.add(tx + ',' + ty);
            }
        }
    }
}

function hasLineOfSight(x0, y0, x1, y1) {
    const pts = bresenhamLine(x0, y0, x1, y1);
    for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        if (!inBounds(p.x, p.y)) return false;
        if (Game.world.dungeonGrid[p.y][p.x].opaque) return false;
    }
    return true;
}

function bresenhamLine(x0, y0, x1, y1) {
    const pts = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    
    while (true) {
        pts.push({x: x, y: y});
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    return pts;
}

// --- Movement / Combat ---
function processMovement() {
    const events = drainEvents();
    for (let i = 0; i < events.length; i++) {
        if (events[i].type === 'move') {
            handleMove(events[i].entityId, events[i].toX, events[i].toY);
        }
    }
}

function handleMove(eid, toX, toY) {
    const pos = getComponent(eid, 'position');
    if (!pos) return;

    if (!inBounds(toX, toY)) { 
        if (eid === Game.world.playerEid) addMessage("Can't go that way!"); 
        return; 
    }
    if (!Game.world.dungeonGrid[toY][toX].walkable) return;

    const at = getEntitiesAt(toX, toY);
    for (let i = 0; i < at.length; i++) {
        const tid = at[i];
        if (tid === eid) continue;
        const blocker = getComponent(tid, 'blocker');
        if (blocker && !blocker.passable) {
            const th = getComponent(tid, 'health');
            if (th && th.hp > 0) {
                handleAttack(eid, tid);
                return;
            }
        }
    }

    pos.x = toX;
    pos.y = toY;

    if (eid === Game.world.playerEid) { 
        pickupItemsAt(toX, toY);
        const t = Game.world.dungeonGrid[toY][toX];
        if (t && t.glyph === '>') nextLevel();
    }
}

function handleAttack(attackerId, targetId) {
    const as = getComponent(attackerId, 'stats');
    const th = getComponent(targetId, 'health');
    const td = getComponent(targetId, 'descriptor');
    if (!as || !th) return;

    const dmg = randInt(3, 8) + Math.floor(as.strength / 3);
    th.hp -= dmg;

    // Track stats
    if (attackerId === Game.world.playerEid) {
        Game.state.playerAttackedThisTurn = true;
        Game.stats.totalDamageDealt += dmg;
        Game.stats.timesAttacked++;
    } else if (targetId === Game.world.playerEid) {
        Game.stats.totalDamageTaken += dmg;
    }

    const name = td ? td.name : 'enemy';
    addMessage('Dealt ' + dmg + ' damage to ' + name + '!');

    if (th.hp <= 0) {
        addMessage(name + ' defeated!');
        
        // Track death cause for player
        if (targetId === Game.world.playerEid) {
            Game.stats.deathCause = 'Combat';
            Game.stats.killedBy = name;
            Game.stats.endTime = Date.now();
        }
        
        onKill(targetId, attackerId);
        if (targetId === Game.world.playerEid) {
            Game.state.gameOver = true;
            Game.state.current = 'gameOver';
            addMessage('You have died! Press R to restart.');
        }
    }
}

// --- AI Processing ---
function processAI() {
    const aiList = getEntitiesWith(['ai', 'position', 'health']);
    const ppos = getComponent(Game.world.playerEid, 'position');
    for (let i = 0; i < aiList.length; i++) {
        const eid = aiList[i];
        const hp = getComponent(eid, 'health');
        if (!hp || hp.hp <= 0) continue;

        const ai = getComponent(eid, 'ai');
        const pos = getComponent(eid, 'position');

        if (!ai.active) {
            if (canSeePlayer(eid)) {
                ai.active = true;
                ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
            }
            continue;
        }

        if (canSeePlayer(eid)) {
            ai.lastPlayerPos = {x: ppos.x, y: ppos.y};
        }

        if (ai.lastPlayerPos) {
            const tx = ai.lastPlayerPos.x, ty = ai.lastPlayerPos.y;
            const dx = tx - pos.x, dy = ty - pos.y;
            let mx = 0, my = 0;

            if (Math.abs(dx) > Math.abs(dy)) mx = dx > 0 ? 1 : -1;
            else if (dy !== 0)               my = dy > 0 ? 1 : -1;

            if (mx !== 0 || my !== 0) {
                postEvent({type: 'move', entityId: eid, toX: pos.x + mx, toY: pos.y + my});
            }
        }
    }
}

function getEntitiesAt(x, y) {
    const out = [];
    const list = getEntitiesWith(['position']);
    for (let i = 0; i < list.length; i++) {
        const p = getComponent(list[i], 'position');
        if (p && p.x === x && p.y === y) out.push(list[i]);
    }
    return out;
}

function gainXP(amount) {
    const prog = getComponent(Game.world.playerEid, 'progress');
    if (!prog) return;
    prog.xp += Math.max(0, amount | 0);
    Game.stats.totalXpGained += Math.max(0, amount | 0);
    addMessage('Gained ' + amount + ' XP.');
    while (prog.xp >= prog.next) {
        prog.xp -= prog.next;
        prog.level += 1;
        prog.next = Math.floor(prog.next * 1.5) + 10;

        const hp = getComponent(Game.world.playerEid, 'health');
        const st = getComponent(Game.world.playerEid, 'stats');
        if (hp) { hp.maxHp += 10; hp.hp = hp.maxHp; }
        if (st) { st.strength += 1; st.accuracy += 1; if (prog.level % 2 === 0) st.agility += 1; }
        addMessage('You are now level ' + prog.level + '! (+stats, HP restored)');
        
        Game.stats.highestLevel = Math.max(Game.stats.highestLevel, prog.level);
    }
}

function onKill(victimId, killerId) {
    dropLoot(victimId);
    
    if (killerId !== Game.world.playerEid) { 
        destroyEntity(victimId); 
        return; 
    }
    
    // Track enemy kills
    Game.stats.enemiesKilled++;
    
    const xv = getComponent(victimId, 'xpValue');
    if (xv && typeof xv.xp === 'number') { 
        gainXP(xv.xp); 
    }
    destroyEntity(victimId);
}

function enemyAdjacentAutoAttacks() {
    const ppos = getComponent(Game.world.playerEid, 'position');
    if (!ppos) return;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < dirs.length; i++) {
        const nx = ppos.x + dirs[i][0];
        const ny = ppos.y + dirs[i][1];
        if (!inBounds(nx, ny)) continue;

        const ents = getEntitiesAt(nx, ny);
        for (let j = 0; j < ents.length; j++) {
            const eid = ents[j];
            if (eid === Game.world.playerEid) continue;

            const hp = getComponent(eid, 'health');
            if (!hp || hp.hp <= 0) continue;

            const ai = getComponent(eid, 'ai');
            if (ai && !(ai.active || canSeePlayer(eid))) continue;

            handleAttack(eid, Game.world.playerEid);
        }
    }
}

function nextLevel() {
    Game.state.floor -= 1;
    Game.stats.floorsDescended++;
    Game.state.justDescended = true;

    const rem = [];
    Game.ecs.entities.forEach(function(eid) { 
        if (eid !== Game.world.playerEid) rem.push(eid); 
    });
    for (let i = 0; i < rem.length; i++) destroyEntity(rem[i]);

    generateDungeon();

    const p = getComponent(Game.world.playerEid, 'position');
    p.x = Math.min(Math.max(p.x, 0), Game.config.DUNGEON_WIDTH - 1);
    p.y = Math.min(Math.max(p.y, 0), Game.config.DUNGEON_HEIGHT - 1);
    Game.world.dungeonGrid[p.y][p.x] = Tile.floor();

    const oldV = getComponent(Game.world.playerEid, 'vision');
    Game.ecs.components['vision'][Game.world.playerEid] = { 
        radius: oldV ? oldV.radius : 8, 
        baseRadius: oldV ? (oldV.baseRadius || oldV.radius) : 8, 
        visible: new Set(), 
        seen: new Set() 
    };

    connectPlayerToDungeon(p.x, p.y);
    placeStairsFarthestFrom(p.x, p.y);

    spawnMonstersAvoiding(p.x, p.y);
    spawnItemsAvoiding(p.x, p.y);

    updateVision(Game.world.playerEid);
    addMessage('You descend to floor ' + Game.state.floor + '...');
}

// --- UI / Rendering ---
function render() {
    const ctx = Game.rendering.ctx;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, Game.rendering.canvas.width, Game.rendering.canvas.height);
    
    if (Game.state.current === 'start') { 
        renderStart(); 
        return; 
    }
    if (!Game.world.playerEid) return;

    if (Game.state.current === 'playing' || Game.state.current === 'paused' || Game.state.current === 'gameOver') {
        renderDungeon();
        renderEntities();
        renderExplosions();
        renderLighting();
        renderHUD();
        renderMessages();

        if (Game.state.uiMode === 'inventory') renderInventoryOverlay();
        if (Game.state.current === 'paused') renderPause();
        else if (Game.state.current === 'gameOver') renderGameOver();
    }
}

function renderStart() {
    const ctx = Game.rendering.ctx;
    ctx.font = '48px monospace';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText('DUNGEON DURGON', Game.rendering.canvas.width / 2, Game.rendering.canvas.height / 2 - 50);
    ctx.font = '24px monospace';
    ctx.fillStyle = 'lime';
    ctx.fillText('Press SPACE to start', Game.rendering.canvas.width / 2, Game.rendering.canvas.height / 2 + 20);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#ccc';
    ctx.fillText('WASD: Move | I: Inventory | R: Restart', Game.rendering.canvas.width / 2, Game.rendering.canvas.height / 2 + 60);
    ctx.textAlign = 'left';
}

function renderPause() {
    const ctx = Game.rendering.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, Game.rendering.canvas.width, Game.rendering.canvas.height);
    ctx.font = '48px monospace';
    ctx.fillStyle = 'yellow';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', Game.rendering.canvas.width / 2, Game.rendering.canvas.height / 2);
    ctx.font = '20px monospace';
    ctx.fillStyle = 'white';
    ctx.fillText('Press ESC to resume', Game.rendering.canvas.width / 2, Game.rendering.canvas.height / 2 + 40);
    ctx.textAlign = 'left';
}

function renderGameOver() {
    const ctx = Game.rendering.ctx;
    ctx.fillStyle = 'rgba(20,0,0,0.95)';
    ctx.fillRect(0, 0, Game.rendering.canvas.width, Game.rendering.canvas.height);
    
    const centerX = Game.rendering.canvas.width / 2;
    const startY = 50;
    
    // Title
    ctx.font = '48px monospace';
    ctx.fillStyle = '#ff6666';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', centerX, startY);
    
    // Death info
    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffaaaa';
    ctx.fillText('Killed by: ' + Game.stats.killedBy, centerX, startY + 60);
    ctx.fillText('Cause: ' + Game.stats.deathCause, centerX, startY + 85);
    
    // Calculate survival time
    const survivalTime = Game.stats.endTime - Game.stats.startTime;
    const minutes = Math.floor(survivalTime / 60000);
    const seconds = Math.floor((survivalTime % 60000) / 1000);
    
    // Main stats
    ctx.font = '18px monospace';
    ctx.fillStyle = 'white';
    let y = startY + 130;
    const lineHeight = 22;
    
    ctx.fillText('═══ FINAL STATISTICS ═══', centerX, y);
    y += lineHeight * 1.5;
    
    // Create two columns
    ctx.textAlign = 'left';
    const leftX = centerX - 180;
    const rightX = centerX + 40;
    
    // Left column
    let leftY = y;
    ctx.fillStyle = '#ffdd88';
    ctx.fillText('SURVIVAL', leftX, leftY);
    ctx.fillStyle = 'white';
    leftY += lineHeight;
    ctx.fillText('Turns Survived: ' + Game.state.turnCount, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Time Played: ' + minutes + 'm ' + seconds + 's', leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Floors Descended: ' + Game.stats.floorsDescended, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Deepest Floor: ' + Math.abs(Game.state.floor), leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Final Level: ' + Game.stats.highestLevel, leftX, leftY);
    leftY += lineHeight + 10;
    
    ctx.fillStyle = '#88ddff';
    ctx.fillText('COMBAT', leftX, leftY);
    ctx.fillStyle = 'white';
    leftY += lineHeight;
    ctx.fillText('Enemies Killed: ' + Game.stats.enemiesKilled, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Damage Dealt: ' + Game.stats.totalDamageDealt, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Damage Taken: ' + Game.stats.totalDamageTaken, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Times Attacked: ' + Game.stats.timesAttacked, leftX, leftY);
    leftY += lineHeight;
    ctx.fillText('Times Spotted: ' + Math.floor(Game.stats.timesSeen / 10), leftX, leftY);
    
    // Right column
    let rightY = y;
    ctx.fillStyle = '#ffdd88';
    ctx.fillText('PROGRESSION', rightX, rightY);
    ctx.fillStyle = 'white';
    rightY += lineHeight;
    ctx.fillText('Total XP Gained: ' + Game.stats.totalXpGained, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Gold Collected: ' + Game.stats.goldCollected, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Final Gold: ' + Game.state.playerGold, rightX, rightY);
    rightY += lineHeight + 10;
    
    ctx.fillStyle = '#88ff88';
    ctx.fillText('ITEMS', rightX, rightY);
    ctx.fillStyle = 'white';
    rightY += lineHeight;
    ctx.fillText('Items Picked Up: ' + Game.stats.itemsPickedUp, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Items Dropped: ' + Game.stats.itemsDropped, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Potions Used: ' + Game.stats.potionsUsed, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Bombs Used: ' + Game.stats.bombsUsed, rightX, rightY);
    rightY += lineHeight;
    ctx.fillText('Scrolls Used: ' + Game.stats.scrollsUsed, rightX, rightY);
    
    // Calculate some derived stats
    const efficiencyRatio = Game.stats.totalDamageDealt > 0 ? 
        (Game.stats.totalDamageTaken / Game.stats.totalDamageDealt).toFixed(2) : '0.00';
    const avgDamagePerTurn = Game.state.turnCount > 0 ? 
        (Game.stats.totalDamageDealt / Game.state.turnCount).toFixed(1) : '0.0';
    const xpPerTurn = Game.state.turnCount > 0 ? 
        (Game.stats.totalXpGained / Game.state.turnCount).toFixed(1) : '0.0';
    const goldPerFloor = Game.stats.floorsDescended > 0 ? 
        Math.floor(Game.stats.goldCollected / Game.stats.floorsDescended) : 0;
    
    // Bottom derived stats
    ctx.textAlign = 'center';
    const bottomY = Game.rendering.canvas.height - 120;
    ctx.fillStyle = '#dddd88';
    ctx.fillText('═══ PERFORMANCE METRICS ═══', centerX, bottomY);
    
    ctx.fillStyle = '#cccccc';
    ctx.font = '16px monospace';
    ctx.fillText('Damage Efficiency: ' + efficiencyRatio + ' (lower is better)', centerX, bottomY + lineHeight);
    ctx.fillText('Avg Damage/Turn: ' + avgDamagePerTurn + ' | XP/Turn: ' + xpPerTurn + ' | Gold/Floor: ' + goldPerFloor, 
                centerX, bottomY + (lineHeight - 2) * 2);
    
    // Restart instruction
    ctx.font = '24px monospace';
    ctx.fillStyle = '#88ff88';
    ctx.fillText('Press R to restart', centerX, Game.rendering.canvas.height - 40);
    ctx.textAlign = 'left';
}

function renderDungeon() {
    const v = getComponent(Game.world.playerEid, 'vision');
    if (!v) return;
    
    for (let y = 0; y < Game.config.DUNGEON_HEIGHT; y++) {
        for (let x = 0; x < Game.config.DUNGEON_WIDTH; x++) {
            const tile = Game.world.dungeonGrid[y][x];
            const screenX = x * Game.config.TILE_SIZE;
            const screenY = y * Game.config.TILE_SIZE;
            const isVisible = v.visible.has(x + ',' + y);
            const isSeen = v.seen.has(x + ',' + y);
            
            const ctx = Game.rendering.ctx;
            if (isVisible) {
                ctx.fillStyle = 'rgb(' + tile.color.join(',') + ')';
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                if (tile.glyph && tile.glyph !== '.') {
                    ctx.font = (Game.config.TILE_SIZE - 4) + 'px monospace';
                    ctx.fillStyle = tile.glyph === '>' ? 'gold' : 'white';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tile.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);
                }
            } else if (isSeen) {
                const dim = tile.color.map(function(c) { return Math.floor(c / 4); });
                ctx.fillStyle = 'rgb(' + dim.join(',') + ')';
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            } else {
                ctx.fillStyle = 'rgb(20,20,30)';
                ctx.fillRect(screenX, screenY, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            }
        }
    }
}

function renderEntities() {
    const v = getComponent(Game.world.playerEid, 'vision');
    if (!v) return;
    const list = getEntitiesWith(['position', 'descriptor']);
    const ctx = Game.rendering.ctx;
    
    for (let i = 0; i < list.length; i++) {
        const eid = list[i];
        const pos = getComponent(eid, 'position');
        const desc = getComponent(eid, 'descriptor');
        const hp = getComponent(eid, 'health');
        if (hp && hp.hp <= 0) continue;
        if (!v.visible.has(pos.x + ',' + pos.y)) continue;

        const screenX = pos.x * Game.config.TILE_SIZE;
        const screenY = pos.y * Game.config.TILE_SIZE;
        const color = parseColor(desc.color);
        ctx.font = (Game.config.TILE_SIZE - 2) + 'px monospace';
        ctx.fillStyle = 'rgb(' + color.join(',') + ')';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(desc.glyph, screenX + Game.config.TILE_SIZE / 2, screenY + Game.config.TILE_SIZE / 2);

        if (hp && hp.hp < hp.maxHp && desc.glyph !== '@') {
            const bw = Game.config.TILE_SIZE - 4;
            const bh = 4;
            const bx = screenX + 2;
            const by = screenY - 2;
            ctx.fillStyle = 'rgba(100,0,0,0.8)';
            ctx.fillRect(bx, by, bw, bh);
            const pct = hp.hp / hp.maxHp;
            const fw = bw * pct;
            ctx.fillStyle = pct > 0.6 ? 'rgba(0,255,0,0.8)' : pct > 0.3 ? 'rgba(255,255,0,0.8)' : 'rgba(255,0,0,0.8)';
            ctx.fillRect(bx, by, fw, bh);
        }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
}

function renderLighting() {
    const lightCanvas = Game.rendering.lightCanvas;
    const lightCtx = Game.rendering.lightCtx;
    const ctx = Game.rendering.ctx;
    
    if (lightCanvas.width !== Game.config.DUNGEON_PIXEL_WIDTH || 
        lightCanvas.height !== Game.config.DUNGEON_PIXEL_HEIGHT) {
        lightCanvas.width = Game.config.DUNGEON_PIXEL_WIDTH;
        lightCanvas.height = Game.config.DUNGEON_PIXEL_HEIGHT;
    }
    
    const pos = getComponent(Game.world.playerEid, 'position');
    const v = getComponent(Game.world.playerEid, 'vision');
    if (!pos || !v) return;

    lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);

    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(0,0,0,1)';
    lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);

    if (v.seen && v.seen.size) {
        lightCtx.globalCompositeOperation = 'destination-out';
        lightCtx.beginPath();
        v.seen.forEach(function(key) {
            if (!v.visible.has(key)) {
                const parts = key.split(',');
                const tx = (parts[0] | 0) * Game.config.TILE_SIZE;
                const ty = (parts[1] | 0) * Game.config.TILE_SIZE;
                lightCtx.rect(tx, ty, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
            }
        });
        lightCtx.fillStyle = 'rgba(0,0,0,' + Game.config.MEMORY_REVEAL + ')';
        lightCtx.fill();
    }

    const cx = (pos.x + 0.5) * Game.config.TILE_SIZE;
    const cy = (pos.y + 0.5) * Game.config.TILE_SIZE;
    const outer = v.radius * Game.config.TILE_SIZE;
    const grad = lightCtx.createRadialGradient(cx, cy, 0, cx, cy, outer);

    const gamma = 2.2;
    function a(t) { return 1 - Math.pow(t, gamma); }
    grad.addColorStop(0.00, 'rgba(0,0,0,' + a(0.00) + ')');
    grad.addColorStop(0.50, 'rgba(0,0,0,' + a(0.50) + ')');
    grad.addColorStop(0.75, 'rgba(0,0,0,' + a(0.75) + ')');
    grad.addColorStop(0.90, 'rgba(0,0,0,' + a(0.90) + ')');
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');

    lightCtx.save();
    lightCtx.beginPath();
    v.visible.forEach(function(key) {
        const parts = key.split(',');
        const tx = (parts[0] | 0) * Game.config.TILE_SIZE;
        const ty = (parts[1] | 0) * Game.config.TILE_SIZE;
        lightCtx.rect(tx, ty, Game.config.TILE_SIZE, Game.config.TILE_SIZE);
    });
    lightCtx.clip();

    lightCtx.globalCompositeOperation = 'destination-out';
    lightCtx.fillStyle = grad;
    lightCtx.fillRect(0, 0, Game.config.DUNGEON_PIXEL_WIDTH, Game.config.DUNGEON_PIXEL_HEIGHT);
    lightCtx.restore();

    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);
}

function renderHUD() {
    const hp = getComponent(Game.world.playerEid, 'health');
    const stats = getComponent(Game.world.playerEid, 'stats');
    const inv = getComponent(Game.world.playerEid, 'inventory');
    const prog = getComponent(Game.world.playerEid, 'progress');
    const st = getComponent(Game.world.playerEid, 'status');
    if (!hp) return;
    
    const ctx = Game.rendering.ctx;
    const uiH = 100;
    const hudY = Game.rendering.canvas.height - uiH;
    ctx.fillStyle = 'rgba(16,16,32,0.95)';
    ctx.fillRect(0, hudY, Game.rendering.canvas.width, uiH);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, hudY, Game.rendering.canvas.width, uiH);

    const margin = 12;
    const textY = hudY + margin + 28;
    ctx.font = '16px monospace';
    ctx.fillStyle = 'white';
    ctx.fillText('HP: ' + hp.hp + '/' + hp.maxHp, margin, textY);
    const barX = margin + 100;
    const barW = 180;
    const barH = 12;
    const barY = textY - 10;
    ctx.fillStyle = '#400';
    ctx.fillRect(barX, barY, barW, barH);
    if (hp.maxHp > 0) {
        const fw = (hp.hp / hp.maxHp) * barW;
        const col = hp.hp > hp.maxHp * 0.6 ? '#4a4' : hp.hp > hp.maxHp * 0.3 ? '#aa4' : '#a44';
        ctx.fillStyle = col;
        ctx.fillRect(barX, barY, fw, barH);
    }
    ctx.strokeStyle = '#888';
    ctx.strokeRect(barX, barY, barW, barH);

    if (prog) {
        const xpY = barY + 18;
        const xpw = 180;
        const xpx = barX;
        ctx.fillStyle = '#222';
        ctx.fillRect(xpx, xpY, xpw, 8);
        const fp = Math.min(1, prog.xp / Math.max(1, prog.next));
        ctx.fillStyle = '#58a6ff';
        ctx.fillRect(xpx, xpY, xpw * fp, 8);
        ctx.strokeStyle = '#666';
        ctx.strokeRect(xpx, xpY, xpw, 8);
        ctx.font = '12px monospace';
        ctx.fillStyle = '#9cf';
        ctx.fillText('LVL ' + prog.level + '  XP ' + prog.xp + '/' + prog.next, xpx + xpw + 10, xpY + 8);
    }

    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Gold: ' + Game.state.playerGold, margin + 500, textY);

    const y = textY + 20;
    ctx.font = '12px monospace';
    if (stats) {
        ctx.fillStyle = '#ccc';
        let statStr = 'STR:' + stats.strength + ' AGI:' + stats.agility + ' ACC:' + stats.accuracy + ' EVA:' + stats.evasion;
        if (st) {
            if (st.strengthBoost > 0) statStr += ' [STR+]';
            if (st.speedBoost > 0) statStr += ' [SPD+]';
            if (st.lightBoost > 0) statStr += ' [VIS+]';
        }
        ctx.fillText(statStr, margin, y);
    }
    if (inv) {
        ctx.fillStyle = '#9cf';
        ctx.fillText('Items: ' + inv.items.length + '/' + inv.capacity + ' (press I)', margin + 360, y);
    }
    ctx.fillStyle = '#666';
    ctx.fillText('Turn: ' + Game.state.turnCount + ' | Lvl: ' + (prog ? prog.level : 1) + ' | Floor: ' + Game.state.floor + ' | Press R to restart, ESC to pause', margin, y + 14);
}

function renderMessages() {
    if (Game.world.messages.length === 0) return;
    const uiH = 100;
    const hudY = Game.rendering.canvas.height - uiH;
    const margin = 12;
    const ctx = Game.rendering.ctx;
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    const lineH = 14;
    let y = hudY + uiH - margin;
    const start = Math.max(0, Game.world.messages.length - 4);
    for (let i = Game.world.messages.length - 1; i >= start; i--) {
        const m = Game.world.messages[i];
        const age = Date.now() - m.time;
        const a = Math.max(0.3, 1 - (age / 5000));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ddd';
        ctx.fillText(m.text, Game.rendering.canvas.width - margin, y);
        ctx.globalAlpha = 1;
        y -= lineH;
    }
    ctx.textAlign = 'left';
}

function renderInventoryOverlay() {
    const inv = getComponent(Game.world.playerEid, 'inventory');
    const ctx = Game.rendering.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, Game.rendering.canvas.width, Game.rendering.canvas.height);

    const w = 520, h = 380;
    const x = (Game.rendering.canvas.width - w) / 2;
    const y = (Game.rendering.canvas.height - h) / 2;
    ctx.fillStyle = 'rgba(20,20,40,0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#88f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#fff';
    ctx.font = '22px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Inventory (' + (inv ? inv.items.length : 0) + '/' + (inv ? inv.capacity : 0) + ')', x + 16, y + 16);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#ccc';
    ctx.fillText('↑/↓ or W/S: select   ENTER/SPACE: use   D: drop   I/ESC: close', x + 16, y + h - 28);

    const listTop = y + 60;

    if (!inv || inv.items.length === 0) {
        ctx.fillStyle = '#bbb';
        ctx.font = '18px monospace';
        ctx.fillText('(empty)', x + 16, listTop);
        return;
    }

    ctx.font = '16px monospace';
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText('M');
    const ascent = m.actualBoundingBoxAscent || 14;
    const descent = m.actualBoundingBoxDescent || 4;
    const rowH = ascent + descent + 4;

    Game.state.invSelIndex = clamp(Game.state.invSelIndex, 0, inv.items.length - 1);

    for (let i = 0; i < inv.items.length; i++) {
        const baselineY = listTop + i * rowH + ascent;

        if (i === Game.state.invSelIndex) {
            ctx.fillStyle = 'rgba(60,60,120,0.85)';
            ctx.fillRect(x + 10, baselineY - ascent - 2, w - 20, rowH);
        }

        const it = inv.items[i];
        const rarityColor = it.rarity === 'epic' ? '#ff99ff' : it.rarity === 'rare' ? '#99ccff' : '#fff';
        ctx.fillStyle = rarityColor;
        ctx.fillText(((i + 1) + '. ').padEnd(3, ' ') + (it.name || 'Item'), x + 16, baselineY);
    }

    const sel = inv.items[Game.state.invSelIndex];
    if (sel) {
        ctx.font = '16px monospace';
        ctx.fillStyle = '#9cf';
        ctx.textBaseline = 'top';
        ctx.fillText('Details: ' + (sel.desc || 'No description.'), x + 16, y + h - 52);
    }
}

// --- Turn / Input ---
function processTurn() {
    Game.state.playerAttackedThisTurn = false;

    processMovement();

    processAI();
    processMovement();

    const seers = getEntitiesWith(['vision', 'position']);
    for (let i = 0; i < seers.length; i++) updateVision(seers[i]);

    if (!Game.state.playerAttackedThisTurn && !Game.state.justDescended) {
        enemyAdjacentAutoAttacks();
    }

    const st = getComponent(Game.world.playerEid, 'status');
    const stats = getComponent(Game.world.playerEid, 'stats');
    if (st) {
        if (st.lightBoost > 0) {
            st.lightBoost--;
            if (st.lightBoost === 0) {
                const v = getComponent(Game.world.playerEid, 'vision');
                if (v) v.radius = v.baseRadius || v.radius;
                addMessage('The bright light fades.');
            }
        }
        if (st.speedBoost > 0) {
            st.speedBoost--;
            if (st.speedBoost === 0) {
                addMessage('You return to normal speed.');
            }
        }
        if (st.strengthBoost > 0) {
            st.strengthBoost--;
            if (st.strengthBoost === 0 && stats && st.strengthBonusAmount) {
                stats.strength -= st.strengthBonusAmount;
                addMessage('Your strength returns to normal.');
                st.strengthBonusAmount = 0;
            }
        }
    }

    Game.state.justDescended = false;
    Game.state.turnCount++;
    
    if (st && st.speedBoost > 0 && Game.state.turnCount % 2 === 0) {
        return true;
    }
    return false;
}

function resetGame() {
    Game.state.current = 'playing';
    Game.state.uiMode = 'game';
    Game.state.gameOver = false;
    Game.state.justDescended = false;
    Game.state.playerGold = 0;
    Game.state.turnCount = 0;
    Game.effects.explosions = [];
    
    Game.stats.reset();
    
    initGame();
}

function setupInput() {
    document.addEventListener('keydown', function(e) {
        const key = e.key;
        if (Game.state.current === 'start') { 
            if (key === ' ') { 
                Game.state.current = 'playing'; 
                initGame(); 
            } 
            e.preventDefault(); 
            return; 
        }

        if (Game.state.current === 'paused') { 
            if (key === 'Escape') Game.state.current = 'playing'; 
            e.preventDefault(); 
            return; 
        }
        if (Game.state.current === 'gameOver') { 
            if (key === 'r' || key === 'R') { resetGame(); } 
            e.preventDefault(); 
            return; 
        }
        if (Game.state.current !== 'playing' || Game.state.gameOver) return;

        if (Game.state.uiMode === 'inventory') {
            const inv = getComponent(Game.world.playerEid, 'inventory');
            const n = inv ? inv.items.length : 0;
            if (key === 'i' || key === 'I' || key === 'Escape') { 
                Game.state.uiMode = 'game'; 
                e.preventDefault(); 
                return; 
            }
            if (n > 0) {
                if (key === 'ArrowUp' || key === 'w' || key === 'W') { 
                    Game.state.invSelIndex = (Game.state.invSelIndex - 1 + n) % n; 
                    e.preventDefault(); 
                    return; 
                }
                if (key === 'ArrowDown' || key === 's' || key === 'S') { 
                    Game.state.invSelIndex = (Game.state.invSelIndex + 1) % n; 
                    e.preventDefault(); 
                    return; 
                }
                if (key === 'Enter' || key === ' ') { 
                    if (useInventoryItem(Game.state.invSelIndex)) { 
                        Game.state.uiMode = 'game'; 
                        processTurn(); 
                    } 
                    e.preventDefault(); 
                    return; 
                }
                if (key === 'd' || key === 'D') { 
                    if (dropInventoryItem(Game.state.invSelIndex)) { 
                        Game.state.uiMode = 'game'; 
                        processTurn(); 
                    } 
                    e.preventDefault(); 
                    return; 
                }
                if (key >= '1' && key <= '9') {
                    const idx = (key.charCodeAt(0) - '1'.charCodeAt(0));
                    if (idx < n && useInventoryItem(idx)) { 
                        Game.state.uiMode = 'game'; 
                        processTurn(); 
                    }
                    e.preventDefault(); 
                    return;
                }
            } else {
                if (key === 'Enter' || key === ' ') { 
                    Game.state.uiMode = 'game'; 
                    e.preventDefault(); 
                    return; 
                }
            }
            e.preventDefault();
            return;
        }

        const pp = getComponent(Game.world.playerEid, 'position'); 
        if (!pp) return;
        let dx = 0, dy = 0;
        switch (key) {
            case 'w': case 'W': case 'ArrowUp': dy = -1; break;
            case 's': case 'S': case 'ArrowDown': dy = 1; break;
            case 'a': case 'A': case 'ArrowLeft': dx = -1; break;
            case 'd': case 'D': case 'ArrowRight': dx = 1; break;
            case ' ': addMessage('You wait.'); processTurn(); e.preventDefault(); return;
            case 'i': case 'I': Game.state.uiMode = 'inventory'; Game.state.invSelIndex = 0; e.preventDefault(); return;
            case 'r': case 'R': resetGame(); e.preventDefault(); return;
            case 'Escape': Game.state.current = 'paused'; e.preventDefault(); return;
        }
        if (dx !== 0 || dy !== 0) {
            postEvent({type: 'move', entityId: Game.world.playerEid, toX: pp.x + dx, toY: pp.y + dy});
            const extraAction = processTurn();
            if (extraAction) addMessage('Speed boost: extra action!');
            e.preventDefault();
        }
    });
}

// --- Init ---
function initGame() {
    Game.ecs.reset();
    Game.world.reset();
    Game.state.turnCount = 0;
    Game.state.gameOver = false;
    Game.state.floor = 0;
    Game.state.justDescended = false;
    Game.state.uiMode = 'game';
    Game.effects.explosions = [];

    if (!Game.stats.startTime) {
        Game.stats.startTime = Date.now();
    }

    generateDungeon();

    const startRoom = Game.world.rooms[0];
    Game.world.playerEid = createPlayer(startRoom.centerX(), startRoom.centerY());

    const p = getComponent(Game.world.playerEid, 'position');
    connectPlayerToDungeon(p.x, p.y);
    placeStairsFarthestFrom(p.x, p.y);

    spawnMonstersAvoiding(p.x, p.y);
    spawnItemsAvoiding(p.x, p.y);

    updateVision(Game.world.playerEid);
}

function createExplosion(x, y, radius) {
    Game.effects.explosions.push({
        x: x,
        y: y,
        radius: radius,
        startTime: Date.now(),
        duration: 600,
        maxRadius: radius + 0.5
    });
}

function updateExplosions() {
    const now = Date.now();
    Game.effects.explosions = Game.effects.explosions.filter(function(explosion) {
        return (now - explosion.startTime) < explosion.duration;
    });
}

function renderExplosions() {
    const now = Date.now();
    const ctx = Game.rendering.ctx;
    
    for (let i = 0; i < Game.effects.explosions.length; i++) {
        const explosion = Game.effects.explosions[i];
        const elapsed = now - explosion.startTime;
        const progress = elapsed / explosion.duration;
        
        if (progress >= 1) continue;
        
        const centerX = (explosion.x + 0.5) * Game.config.TILE_SIZE;
        const centerY = (explosion.y + 0.5) * Game.config.TILE_SIZE;
        
        // Create multiple expanding circles for the blast effect
        for (let wave = 0; wave < 3; wave++) {
            const waveProgress = Math.max(0, progress - wave * 0.1);
            if (waveProgress <= 0) continue;
            
            const currentRadius = waveProgress * explosion.maxRadius * Game.config.TILE_SIZE;
            const alpha = (1 - waveProgress) * 0.8;
            
            // Outer blast ring
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = wave === 0 ? '#ff6600' : wave === 1 ? '#ff9900' : '#ffcc00';
            ctx.lineWidth = 4 - wave;
            ctx.beginPath();
            ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        
        // Inner flash effect
        if (progress < 0.3) {
            const flashAlpha = (1 - progress / 0.3) * 0.4;
            ctx.save();
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(centerX, centerY, explosion.radius * Game.config.TILE_SIZE * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        // Affected tiles highlight
        const tileAlpha = (1 - progress) * 0.3;
        if (tileAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = tileAlpha;
            ctx.fillStyle = '#ff0000';
            
            const rad = Math.floor(explosion.radius);
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const tx = explosion.x + dx;
                    const ty = explosion.y + dy;
                    if (inBounds(tx, ty)) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist <= explosion.radius) {
                            ctx.fillRect(tx * Game.config.TILE_SIZE, ty * Game.config.TILE_SIZE, 
                                       Game.config.TILE_SIZE, Game.config.TILE_SIZE);
                        }
                    }
                }
            }
            ctx.restore();
        }
    }
}

// --- Game loop ---
function gameLoop() { 
    updateMessages();
    updateExplosions();
    render(); 
    requestAnimationFrame(gameLoop); 
}

// Start
setupInput();
gameLoop();
