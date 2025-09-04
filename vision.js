/** =========================
 *  Vision and Line of Sight
 *  ========================= */

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
