/** =========================
 *  Entity Component System - Using Game Namespace
 *  ========================= */

/**
 * Create a component type if it doesn't exist
 */
function createComponent(type) {
    if (!Game.ecs.components[type]) {
        Game.ecs.components[type] = {};
    }
}

/**
 * Create a new entity and return its ID
 */
function createEntity() {
    const id = Game.ecs.nextEntityId++;
    Game.ecs.entities.add(id);
    return id;
}

/**
 * Add a component to an entity
 */
function addComponent(eid, type, data) {
    createComponent(type);
    Game.ecs.components[type][eid] = data;
}

/**
 * Get a component from an entity
 */
function getComponent(eid, type) {
    return (Game.ecs.components[type] && Game.ecs.components[type][eid]) || null;
}

/**
 * Check if an entity has a component
 */
function hasComponent(eid, type) {
    return !!getComponent(eid, type);
}

/**
 * Get all entities that have all of the specified component types
 */
function getEntitiesWith(types) {
    const out = [];
    Game.ecs.entities.forEach(function(eid) {
        for (let i = 0; i < types.length; i++) {
            if (!hasComponent(eid, types[i])) {
                return; // Skip this entity
            }
        }
        out.push(eid);
    });
    return out;
}

/**
 * Remove an entity and all its components
 */
function destroyEntity(eid) {
    Game.ecs.entities.delete(eid);
    for (const componentType in Game.ecs.components) {
        if (Game.ecs.components[componentType] && 
            Game.ecs.components[componentType][eid] !== undefined) {
            delete Game.ecs.components[componentType][eid];
        }
    }
}

/**
 * Add an event to the event queue
 */
function postEvent(event) {
    Game.ecs.eventQueue.push(event);
}

/**
 * Get all queued events and clear the queue
 */
function drainEvents() {
    const events = Game.ecs.eventQueue.slice();
    Game.ecs.eventQueue = [];
    return events;
}

// Alternative: More object-oriented approach for ECS functions
// You could also organize the functions like this:
Game.ecs.createEntity = createEntity;
Game.ecs.addComponent = addComponent;
Game.ecs.getComponent = getComponent;
Game.ecs.hasComponent = hasComponent;
Game.ecs.getEntitiesWith = getEntitiesWith;
Game.ecs.destroyEntity = destroyEntity;
Game.ecs.postEvent = postEvent;
Game.ecs.drainEvents = drainEvents;
