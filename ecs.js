/** =========================
 *  ECS (Entity Component System)
 *  ========================= */

function createComponent(type){ 
    if(!components[type]) components[type] = {}; 
}

function createEntity(){ 
    var id = nextEntityId++; 
    entities.add(id); 
    return id; 
}

function addComponent(eid, type, data){ 
    createComponent(type); 
    components[type][eid] = data; 
}

function getComponent(eid, type){ 
    return (components[type] && components[type][eid]) || null; 
}

function hasComponent(eid, type){ 
    return !!getComponent(eid, type); 
}

function getEntitiesWith(types){
    var out = [];
    entities.forEach(function(eid){
        for (var i=0;i<types.length;i++){ 
            if(!hasComponent(eid, types[i])) return; 
        }
        out.push(eid);
    });
    return out;
}

function destroyEntity(eid){
    entities.delete(eid);
    for (var t in components){ 
        if(components[t] && components[t][eid]!==undefined) 
            delete components[t][eid]; 
    }
}

function postEvent(ev){ 
    eventQueue.push(ev); 
}

function drainEvents(){ 
    var e = eventQueue.slice(); 
    eventQueue = []; 
    return e; 
}
