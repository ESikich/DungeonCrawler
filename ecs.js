/** =========================
 *  Entity Component System
 *  ========================= */

// ECS state - these will be managed by globals.js instead
// var nextEntityId = 1;
// var entities = new Set();
// var components = {};
// var eventQueue = [];

/**
 * Create a component type if it doesn't exist
 */
function createComponent(type) {
    if (!window.components[type]) {
        window.components[type] = {};
    }
}

/**
 * Create a new entity and return its ID
 */
function createEntity() {
    var id = window.nextEntityId++;
    window.entities.add(id);
    return id;
}

/**
 * Add a component to an entity
 */
function addComponent(eid, type, data) {
    createComponent(type);
    window.components[type][eid] = data;
}

/**
 * Get a component from an entity
 */
function getComponent(eid, type) {
    return (window.components[type] && window.components[type][eid]) || null;
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
    var out = [];
    window.entities.forEach(function(eid) {
        for (var i = 0; i < types.length; i++) {
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
    window.entities.delete(eid);
    for (var componentType in window.components) {
        if (window.components[componentType] && window.components[componentType][eid] !== undefined) {
            delete window.components[componentType][eid];
        }
    }
}

/**
 * Add an event to the event queue
 */
function postEvent(event) {
    window.eventQueue.push(event);
}

/**
 * Get all queued events and clear the queue
 */
function drainEvents() {
    var events = window.eventQueue.slice();
    window.eventQueue = [];
    return events;
}
