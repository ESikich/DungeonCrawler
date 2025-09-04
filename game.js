/** =========================
 *  Main Game Logic
 *  ========================= */

// --- Game/UI state ---
var gameState = 'start';
var uiMode = 'game';
var invSelIndex = 0;
var turnCount = 0;
var gameOver = false;
var floor = 0;
var playerGold = 0;
var playerAttackedThisTurn = false;
var justDescended = false;
var playerEid = null;

// --- Game Statistics ---
var gameStats = {
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
    startTime: 0,
    endTime: 0
};

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
    components['vision'][playerEid] = { 
        radius: oldV ? oldV.radius : 8, 
        baseRadius: oldV ? (oldV.baseRadius||oldV.radius) : 8, 
        visible:new Set(), 
        seen:new Set() 
    };

    connectPlayerToDungeon(p.x,p.y);
    placeStairsFarthestFrom(p.x,p.y);

    spawnMonstersAvoiding(p.x,p.y);
    spawnItemsAvoiding(p.x,p.y);

    updateVision(playerEid);
    addMessage('You descend to floor '+floor+'...');
}

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

function initGame(){
    entities.clear(); 
    components={}; 
    eventQueue=[]; 
    messages=[];
    turnCount=0; 
    gameOver=false; 
    floor=0; 
    justDescended=false; 
    uiMode='game';

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

// --- Game loop ---
function gameLoop(){ 
    updateMessages(); 
    render(); 
    requestAnimationFrame(gameLoop); 
}

// Start
setupInput();
gameLoop();
