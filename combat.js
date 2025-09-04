/** =========================
 *  Combat and AI Systems
 *  ========================= */

function processMovement(){
    var events = drainEvents();
    for (var i=0;i<events.length;i++){
        if (events[i].type==='move') handleMove(events[i].entityId, events[i].toX, events[i].toY);
    }
}

function handleMove(eid, toX, toY){
    var pos = getComponent(eid,'position');
    if (!pos) return;

    if (!inBounds(toX,toY)){ 
        if (eid===playerEid) addMessage("Can't go that way!"); 
        return; 
    }
    if (!dungeonGrid[toY][toX].walkable) return;

    var at = getEntitiesAt(toX,toY);
    for (var i=0;i<at.length;i++){
        var tid=at[i]; 
        if (tid===eid) continue;
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
            gameOver=true; 
            gameState='gameOver';
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
