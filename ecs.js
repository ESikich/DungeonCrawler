/** =========================
 *  Entity Component System - Complete Final Version
 *  ========================= */

// ECS Module with private state and public API
Game.ECS = (function() {
    'use strict';
    
    // Private data (only accessible within this module)
    let nextEntityId = 1;
    let entities = new Set();
    let components = {};
    let eventQueue = [];
    
    // Public API
    return {
        // Entity management
        createEntity() {
            const id = nextEntityId++;
            entities.add(id);
            return id;
        },
        
        destroyEntity(eid) {
            entities.delete(eid);
            for (const componentType in components) {
                if (components[componentType] && 
                    components[componentType][eid] !== undefined) {
                    delete components[componentType][eid];
                }
            }
        },
        
        // Component management
        addComponent(eid, type, data) {
            this.createComponentType(type);
            components[type][eid] = data;
        },
        
        getComponent(eid, type) {
            return (components[type] && components[type][eid]) || null;
        },
        
        hasComponent(eid, type) {
            return !!this.getComponent(eid, type);
        },
        
        createComponentType(type) {
            if (!components[type]) {
                components[type] = {};
            }
        },
        
        // Query system
        getEntitiesWith(types) {
            const out = [];
            entities.forEach(eid => {
                if (types.every(type => this.hasComponent(eid, type))) {
                    out.push(eid);
                }
            });
            return out;
        },
        
        getEntitiesAt(x, y) {
            const out = [];
            const list = this.getEntitiesWith(['position']);
            for (let i = 0; i < list.length; i++) {
                const p = this.getComponent(list[i], 'position');
                if (p && p.x === x && p.y === y) out.push(list[i]);
            }
            return out;
        },
        
        // Event system
        postEvent(event) {
            eventQueue.push(event);
        },
        
        drainEvents() {
            const events = eventQueue.slice();
            eventQueue = [];
            return events;
        },
        
        // System management
        reset() {
            nextEntityId = 1;
            entities.clear();
            components = {};
            eventQueue = [];
        },
        
        // Debug/utility methods
        getEntityCount() {
            return entities.size;
        },
        
        getComponentTypes() {
            return Object.keys(components);
        },
        
        getAllEntities() {
            return Array.from(entities);
        }
    };
})();

// Backward compatibility functions
function createEntity() { return Game.ECS.createEntity(); }
function destroyEntity(eid) { return Game.ECS.destroyEntity(eid); }
function addComponent(eid, type, data) { return Game.ECS.addComponent(eid, type, data); }
function getComponent(eid, type) { return Game.ECS.getComponent(eid, type); }
function hasComponent(eid, type) { return Game.ECS.hasComponent(eid, type); }
function getEntitiesWith(types) { return Game.ECS.getEntitiesWith(types); }
function getEntitiesAt(x, y) { return Game.ECS.getEntitiesAt(x, y); }
function postEvent(event) { return Game.ECS.postEvent(event); }
function drainEvents() { return Game.ECS.drainEvents(); }
