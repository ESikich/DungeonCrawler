/** =========================
 *  UI and Rendering
 *  ========================= */

// Canvas and lighting setup
var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');
if (!canvas || !ctx) alert('Canvas not supported');

var lightCanvas = document.createElement('canvas');
lightCanvas.width = DUNGEON_PIXEL_WIDTH;
lightCanvas.height = DUNGEON_PIXEL_HEIGHT;
var lightCtx = lightCanvas.getContext('2d');

// Message system
var messages = [];

function addMessage(text){
    messages.push({text:text, time:Date.now()});
    if (messages.length>10) messages = messages.slice(-10);
}

function updateMessages(){
    var now=Date.now();
    messages = messages.filter(function(m){ return now - m.time < 5000; });
}

function render(){
    ctx.fillStyle='black'; 
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    if (gameState==='start'){ 
        renderStart(); 
        return; 
    }
    
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
    ctx.fillStyle='rgba(0,0,0,0.8)'; 
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.font='48px monospace'; 
    ctx.fillStyle='yellow'; 
    ctx.textAlign='center';
    ctx.fillText('PAUSED', canvas.width/2, canvas.height/2);
    ctx.font='20px monospace'; 
    ctx.fillStyle='white';
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
    var v = getComponent(playerEid,'vision'); 
    if (!v) return;
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
    var v = getComponent(playerEid,'vision'); 
    if (!v) return;
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
    // Initialize lighting canvas if not done yet
    if (!lightCanvas) initLightCanvas();
    
    if (lightCanvas.width!==DUNGEON_PIXEL_WIDTH || lightCanvas.height!==DUNGEON_PIXEL_HEIGHT){
        lightCanvas.width=DUNGEON_PIXEL_WIDTH; 
        lightCanvas.height=DUNGEON_PIXEL_HEIGHT;
    }
    var pos = getComponent(playerEid,'position');
    var v   = getComponent(playerEid,'vision');
    if (!pos || !v) return;

    lightCtx.clearRect(0,0,lightCanvas.width, lightCanvas.height);

    // Start with everything dark
    lightCtx.globalCompositeOperation='source-over';
    lightCtx.fillStyle='rgba(0,0,0,1)';
    lightCtx.fillRect(0,0,DUNGEON_PIXEL_WIDTH, DUNGEON_PIXEL_HEIGHT);

    // Reveal seen areas with memory
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

    // Create vision gradient for currently visible areas
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

    // Apply gradient only to visible areas
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

    // Draw the lighting overlay onto main canvas
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
