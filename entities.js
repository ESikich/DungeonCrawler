/** =========================
 *  Entity Creation
 *  ========================= */

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
