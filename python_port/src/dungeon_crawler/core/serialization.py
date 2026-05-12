"""JSON-compatible save/load helpers for core game state."""

from __future__ import annotations

import json
from dataclasses import fields
from typing import Any

from .config import GameConfig
from .ecs import ECS
from .game import Game
from .models import (
    AI,
    Blocker,
    Descriptor,
    DungeonInstance,
    DungeonLevelSnapshot,
    EntitySnapshot,
    ForestReturnContext,
    GameState,
    Health,
    Inventory,
    Item,
    LootDrop,
    Message,
    Position,
    Progress,
    Stats,
    Status,
    Tile,
    Vision,
    WorldState,
)
from .rng import Rng


SAVE_VERSION = 1


def game_to_dict(game: Game) -> dict[str, Any]:
    return {
        "version": SAVE_VERSION,
        "config": {
            "dungeon_width": game.config.dungeon_width,
            "dungeon_height": game.config.dungeon_height,
            "memory_reveal": game.config.memory_reveal,
        },
        "rng": _jsonify(game.rng.get_state()),
        "state": _state_to_dict(game.state),
        "world": _world_to_dict(game.world),
        "ecs": _ecs_to_dict(game.ecs),
    }


def game_from_dict(data: dict[str, Any]) -> Game:
    if data.get("version") != SAVE_VERSION:
        raise ValueError(f"Unsupported save version: {data.get('version')!r}")

    config_data = data["config"]
    game = Game(
        config=GameConfig(
            dungeon_width=int(config_data["dungeon_width"]),
            dungeon_height=int(config_data["dungeon_height"]),
            memory_reveal=float(config_data["memory_reveal"]),
        )
    )
    game.rng = Rng()
    game.rng.set_state(data["rng"])
    game.state = _state_from_dict(data["state"])
    game.world = _world_from_dict(data["world"])

    ecs_data = data["ecs"]
    game.ecs = ECS()
    game.ecs.restore(
        next_entity_id=int(ecs_data["next_entity_id"]),
        entities={int(entity_id) for entity_id in ecs_data["entities"]},
        components=_components_from_dict(ecs_data["components"]),
    )
    return game


def dumps_game(game: Game) -> str:
    return json.dumps(game_to_dict(game), sort_keys=True)


def loads_game(payload: str) -> Game:
    return game_from_dict(json.loads(payload))


def _ecs_to_dict(ecs: ECS) -> dict[str, Any]:
    components: dict[str, dict[str, Any]] = {}
    for component_type in ecs.component_types():
        components[component_type] = {
            str(entity_id): _component_to_dict(component_type, component)
            for entity_id, component in ecs.components_for(component_type).items()
        }

    return {
        "next_entity_id": ecs.next_entity_id(),
        "entities": ecs.all_entities(),
        "components": components,
    }


def _components_from_dict(data: dict[str, dict[str, Any]]) -> dict[str, dict[int, object]]:
    return {
        component_type: {
            int(entity_id): _component_from_dict(component_type, component_data)
            for entity_id, component_data in components.items()
        }
        for component_type, components in data.items()
    }


def _component_to_dict(component_type: str, component: object) -> Any:
    if component_type == "position" and isinstance(component, Position):
        return {"x": component.x, "y": component.y}
    if component_type == "health" and isinstance(component, Health):
        return {"hp": component.hp, "max_hp": component.max_hp}
    if component_type == "stats" and isinstance(component, Stats):
        return {
            "strength": component.strength,
            "agility": component.agility,
            "accuracy": component.accuracy,
            "evasion": component.evasion,
        }
    if component_type == "vision" and isinstance(component, Vision):
        return {
            "radius": component.radius,
            "base_radius": component.base_radius,
            "visible": _coords_to_list(component.visible),
            "seen": _coords_to_list(component.seen),
        }
    if component_type == "descriptor" and isinstance(component, Descriptor):
        return {
            "name": component.name,
            "glyph": component.glyph,
            "color": component.color,
            "sprite": component.sprite,
        }
    if component_type == "item" and isinstance(component, Item):
        return _item_to_dict(component)
    if component_type == "ai" and isinstance(component, AI):
        return {
            "behavior": component.behavior,
            "active": component.active,
            "last_player_pos": list(component.last_player_pos) if component.last_player_pos else None,
            "silenced": component.silenced,
        }
    if component_type == "blocker" and isinstance(component, Blocker):
        return {"passable": component.passable}
    if component_type == "inventory" and isinstance(component, Inventory):
        return {"items": [_item_to_dict(item) for item in component.items], "capacity": component.capacity}
    if component_type == "progress" and isinstance(component, Progress):
        return {
            "xp": component.xp,
            "level": component.level,
            "next_level_xp": component.next_level_xp,
        }
    if component_type == "status" and isinstance(component, Status):
        return {field.name: getattr(component, field.name) for field in fields(Status)}
    if component_type == "loot_table" and isinstance(component, list):
        return [_loot_drop_to_dict(drop) for drop in component if isinstance(drop, LootDrop)]
    if component_type in {"hostile", "xp_value"}:
        return component
    raise TypeError(f"Unsupported component {component_type!r}: {component!r}")


def _component_from_dict(component_type: str, data: Any) -> object:
    if component_type == "position":
        return Position(x=int(data["x"]), y=int(data["y"]))
    if component_type == "health":
        return Health(hp=int(data["hp"]), max_hp=int(data["max_hp"]))
    if component_type == "stats":
        return Stats(
            strength=int(data["strength"]),
            agility=int(data["agility"]),
            accuracy=int(data["accuracy"]),
            evasion=int(data["evasion"]),
        )
    if component_type == "vision":
        return Vision(
            radius=int(data["radius"]),
            base_radius=int(data["base_radius"]),
            visible=_coords_from_list(data["visible"]),
            seen=_coords_from_list(data["seen"]),
        )
    if component_type == "descriptor":
        return Descriptor(
            name=str(data["name"]),
            glyph=str(data["glyph"]),
            color=str(data["color"]),
            sprite=data.get("sprite"),
        )
    if component_type == "item":
        return _item_from_dict(data)
    if component_type == "ai":
        last_player_pos = data["last_player_pos"]
        return AI(
            behavior=str(data["behavior"]),
            active=bool(data["active"]),
            last_player_pos=tuple(last_player_pos) if last_player_pos is not None else None,
            silenced=int(data.get("silenced", 0)),
        )
    if component_type == "blocker":
        return Blocker(passable=bool(data["passable"]))
    if component_type == "inventory":
        return Inventory(items=[_item_from_dict(item) for item in data["items"]], capacity=int(data["capacity"]))
    if component_type == "progress":
        return Progress(
            xp=int(data["xp"]),
            level=int(data["level"]),
            next_level_xp=int(data["next_level_xp"]),
        )
    if component_type == "status":
        return Status(**data)
    if component_type == "hostile":
        return bool(data)
    if component_type == "xp_value":
        return int(data)
    if component_type == "loot_table":
        return [_loot_drop_from_dict(drop) for drop in data]
    raise TypeError(f"Unsupported component type {component_type!r}")


def _state_to_dict(state: GameState) -> dict[str, Any]:
    return {
        "current": state.current,
        "turn_count": state.turn_count,
        "game_over": state.game_over,
        "area": state.area,
        "floor": state.floor,
        "dungeon_max_depth": state.dungeon_max_depth,
        "floors_descended": state.floors_descended,
        "player_gold": state.player_gold,
        "gold_multiplier": state.gold_multiplier,
        "xp_multiplier": state.xp_multiplier,
        "player_attacked_this_turn": state.player_attacked_this_turn,
        "enemy_attacked_this_turn": state.enemy_attacked_this_turn,
        "status_applied_this_turn": state.status_applied_this_turn,
    }


def _state_from_dict(data: dict[str, Any]) -> GameState:
    return GameState(
        current=str(data["current"]),
        turn_count=int(data["turn_count"]),
        game_over=bool(data["game_over"]),
        area=str(data.get("area", "dungeon" if int(data.get("floor", -1)) < 0 else "overworld")),
        floor=int(data.get("floor", -1)),
        dungeon_max_depth=int(data.get("dungeon_max_depth", 1)),
        floors_descended=int(data.get("floors_descended", 0)),
        player_gold=int(data["player_gold"]),
        gold_multiplier=float(data.get("gold_multiplier", 1.0)),
        xp_multiplier=float(data.get("xp_multiplier", 1.0)),
        player_attacked_this_turn=bool(data["player_attacked_this_turn"]),
        enemy_attacked_this_turn=bool(data["enemy_attacked_this_turn"]),
        status_applied_this_turn=bool(data["status_applied_this_turn"]),
    )


def _world_to_dict(world: WorldState) -> dict[str, Any]:
    return {
        "dungeon_grid": [[_tile_to_dict(tile) for tile in row] for row in world.dungeon_grid],
        "dungeon_levels": {
            str(floor): _dungeon_level_to_dict(snapshot)
            for floor, snapshot in sorted(world.dungeon_levels.items())
        },
        "dungeons": {
            dungeon_id: _dungeon_instance_to_dict(dungeon)
            for dungeon_id, dungeon in sorted(world.dungeons.items())
        },
        "active_dungeon_id": world.active_dungeon_id,
        "overworld_sections": {
            _section_to_key(section): [[_tile_to_dict(tile) for tile in row] for row in grid]
            for section, grid in sorted(world.overworld_sections.items())
        },
        "overworld_section": list(world.overworld_section),
        "overworld_seed": world.overworld_seed,
        "player_eid": world.player_eid,
        "rooms": [list(room) for room in world.rooms],
        "messages": [{"text": message.text, "category": message.category} for message in world.messages],
        "spawn_position": _position_to_dict(world.spawn_position) if world.spawn_position else None,
        "stairs_position": _position_to_dict(world.stairs_position) if world.stairs_position else None,
        "dungeon_entrance_position": (
            _position_to_dict(world.dungeon_entrance_position) if world.dungeon_entrance_position else None
        ),
        "overworld_return_position": (
            _position_to_dict(world.overworld_return_position) if world.overworld_return_position else None
        ),
        "forest_return_section": list(world.forest_return_section) if world.forest_return_section else None,
        "forest_return_position": (
            _position_to_dict(world.forest_return_position) if world.forest_return_position else None
        ),
        "forest_tree_position": _position_to_dict(world.forest_tree_position) if world.forest_tree_position else None,
        "forest_return_stack": [_forest_return_context_to_dict(context) for context in world.forest_return_stack],
    }


def _world_from_dict(data: dict[str, Any]) -> WorldState:
    spawn_position = data["spawn_position"]
    stairs_position = data.get("stairs_position")
    dungeon_entrance_position = data.get("dungeon_entrance_position")
    overworld_return_position = data.get("overworld_return_position")
    forest_return_section = data.get("forest_return_section")
    forest_return_position = data.get("forest_return_position")
    forest_tree_position = data.get("forest_tree_position")
    forest_return_stack = data.get("forest_return_stack", [])
    overworld_section = data.get("overworld_section", [0, 0])
    world = WorldState(
        dungeon_grid=[[_tile_from_dict(tile) for tile in row] for row in data["dungeon_grid"]],
        dungeon_levels={
            int(floor): _dungeon_level_from_dict(snapshot)
            for floor, snapshot in data.get("dungeon_levels", {}).items()
        },
        dungeons={
            dungeon_id: _dungeon_instance_from_dict(dungeon)
            for dungeon_id, dungeon in data.get("dungeons", {}).items()
        },
        active_dungeon_id=data.get("active_dungeon_id"),
        overworld_sections={
            _section_from_key(section): [[_tile_from_dict(tile) for tile in grid_row] for grid_row in grid]
            for section, grid in data.get("overworld_sections", {}).items()
        },
        overworld_section=(int(overworld_section[0]), int(overworld_section[1])),
        overworld_seed=int(data.get("overworld_seed", 0)),
        player_eid=int(data["player_eid"]) if data["player_eid"] is not None else None,
        rooms=[tuple(room) for room in data["rooms"]],
        messages=[Message(text=str(message["text"]), category=str(message["category"])) for message in data["messages"]],
        spawn_position=_position_from_dict(spawn_position) if spawn_position is not None else None,
        stairs_position=_position_from_dict(stairs_position) if stairs_position is not None else None,
        dungeon_entrance_position=(
            _position_from_dict(dungeon_entrance_position) if dungeon_entrance_position is not None else None
        ),
        overworld_return_position=(
            _position_from_dict(overworld_return_position) if overworld_return_position is not None else None
        ),
        forest_return_section=(
            (int(forest_return_section[0]), int(forest_return_section[1]))
            if forest_return_section is not None
            else None
        ),
        forest_return_position=(
            _position_from_dict(forest_return_position) if forest_return_position is not None else None
        ),
        forest_tree_position=(
            _position_from_dict(forest_tree_position) if forest_tree_position is not None else None
        ),
        forest_return_stack=[_forest_return_context_from_dict(context) for context in forest_return_stack],
    )
    if world.active_dungeon_id is not None and world.active_dungeon_id in world.dungeons:
        world.dungeon_levels = world.dungeons[world.active_dungeon_id].levels
    return world


def _forest_return_context_to_dict(context: ForestReturnContext) -> dict[str, Any]:
    return {
        "section": list(context.section) if context.section else None,
        "position": _position_to_dict(context.position) if context.position else None,
        "tree_position": _position_to_dict(context.tree_position) if context.tree_position else None,
    }


def _forest_return_context_from_dict(data: dict[str, Any]) -> ForestReturnContext:
    section = data.get("section")
    return ForestReturnContext(
        section=(int(section[0]), int(section[1])) if section is not None else None,
        position=_position_from_dict(data["position"]) if data.get("position") is not None else None,
        tree_position=_position_from_dict(data["tree_position"]) if data.get("tree_position") is not None else None,
    )


def _dungeon_level_to_dict(snapshot: DungeonLevelSnapshot) -> dict[str, Any]:
    return {
        "dungeon_grid": [[_tile_to_dict(tile) for tile in row] for row in snapshot.dungeon_grid],
        "rooms": [list(room) for room in snapshot.rooms],
        "stairs_position": _position_to_dict(snapshot.stairs_position) if snapshot.stairs_position else None,
        "entities": [_entity_snapshot_to_dict(entity) for entity in snapshot.entities],
    }


def _dungeon_level_from_dict(data: dict[str, Any]) -> DungeonLevelSnapshot:
    stairs_position = data.get("stairs_position")
    return DungeonLevelSnapshot(
        dungeon_grid=[[_tile_from_dict(tile) for tile in row] for row in data["dungeon_grid"]],
        rooms=[tuple(room) for room in data["rooms"]],
        stairs_position=_position_from_dict(stairs_position) if stairs_position is not None else None,
        entities=[_entity_snapshot_from_dict(entity) for entity in data["entities"]],
    )


def _dungeon_instance_to_dict(dungeon: DungeonInstance) -> dict[str, Any]:
    return {
        "dungeon_id": dungeon.dungeon_id,
        "section": list(dungeon.section),
        "entrance": _position_to_dict(dungeon.entrance),
        "max_depth": dungeon.max_depth,
        "levels": {
            str(floor): _dungeon_level_to_dict(snapshot)
            for floor, snapshot in sorted(dungeon.levels.items())
        },
    }


def _dungeon_instance_from_dict(data: dict[str, Any]) -> DungeonInstance:
    section = data["section"]
    return DungeonInstance(
        dungeon_id=str(data["dungeon_id"]),
        section=(int(section[0]), int(section[1])),
        entrance=_position_from_dict(data["entrance"]),
        max_depth=int(data.get("max_depth", 1)),
        levels={
            int(floor): _dungeon_level_from_dict(snapshot)
            for floor, snapshot in data.get("levels", {}).items()
        },
    )


def _entity_snapshot_to_dict(snapshot: EntitySnapshot) -> dict[str, Any]:
    return {
        "components": {
            component_type: _component_to_dict(component_type, component)
            for component_type, component in sorted(snapshot.components.items())
        }
    }


def _entity_snapshot_from_dict(data: dict[str, Any]) -> EntitySnapshot:
    return EntitySnapshot(
        components={
            component_type: _component_from_dict(component_type, component)
            for component_type, component in data["components"].items()
        }
    )


def _tile_to_dict(tile: Tile) -> dict[str, Any]:
    return {
        "walkable": tile.walkable,
        "opaque": tile.opaque,
        "color": list(tile.color),
        "glyph": tile.glyph,
        "special": tile.special,
    }


def _tile_from_dict(data: dict[str, Any]) -> Tile:
    return Tile(
        walkable=bool(data["walkable"]),
        opaque=bool(data["opaque"]),
        color=tuple(data["color"]),
        glyph=str(data["glyph"]),
        special=data["special"],
    )


def _position_to_dict(position: Position) -> dict[str, int]:
    return {"x": position.x, "y": position.y}


def _position_from_dict(data: dict[str, Any]) -> Position:
    return Position(x=int(data["x"]), y=int(data["y"]))


def _section_to_key(section: tuple[int, int]) -> str:
    return f"{section[0]},{section[1]}"


def _section_from_key(key: str) -> tuple[int, int]:
    x, y = key.split(",", 1)
    return (int(x), int(y))


def _item_to_dict(item: Item) -> dict[str, Any]:
    return {
        "item_type": item.item_type,
        "name": item.name,
        "glyph": item.glyph,
        "color": item.color,
        "rarity": item.rarity,
        "description": item.description,
        "effect": item.effect,
        "heal_amount": item.heal_amount,
        "gold_amount": item.gold_amount,
        "stat_boost": item.stat_boost,
        "boost_amount": item.boost_amount,
        "boost_turns": item.boost_turns,
        "accuracy_bonus": item.accuracy_bonus,
        "evasion_bonus": item.evasion_bonus,
        "agility_bonus": item.agility_bonus,
        "reduction": item.reduction,
        "regen_amount": item.regen_amount,
        "temp_max_hp_amount": item.temp_max_hp_amount,
        "evasion_penalty": item.evasion_penalty,
        "radius": item.radius,
        "damage": item.damage,
        "permanent_boost": item.permanent_boost,
        "permanent_amount": item.permanent_amount,
        "utility_type": item.utility_type,
    }


def _item_from_dict(data: dict[str, Any]) -> Item:
    return Item(
        item_type=str(data["item_type"]),
        name=str(data["name"]),
        glyph=str(data["glyph"]),
        color=str(data["color"]),
        rarity=str(data.get("rarity", "common")),
        description=str(data.get("description", "")),
        effect=str(data.get("effect", "none")),
        heal_amount=int(data.get("heal_amount", 0)),
        gold_amount=int(data.get("gold_amount", 0)),
        stat_boost=data.get("stat_boost"),
        boost_amount=int(data.get("boost_amount", 0)),
        boost_turns=int(data.get("boost_turns", 0)),
        accuracy_bonus=int(data.get("accuracy_bonus", 0)),
        evasion_bonus=int(data.get("evasion_bonus", 0)),
        agility_bonus=int(data.get("agility_bonus", 0)),
        reduction=float(data.get("reduction", 0.35)),
        regen_amount=int(data.get("regen_amount", 0)),
        temp_max_hp_amount=int(data.get("temp_max_hp_amount", 0)),
        evasion_penalty=int(data.get("evasion_penalty", 0)),
        radius=int(data.get("radius", 0)),
        damage=int(data.get("damage", 0)),
        permanent_boost=data.get("permanent_boost"),
        permanent_amount=float(data.get("permanent_amount", 0)),
        utility_type=data.get("utility_type"),
    )


def _loot_drop_to_dict(drop: LootDrop) -> dict[str, Any]:
    return {
        "drop_type": drop.drop_type,
        "chance": drop.chance,
        "min_amount": drop.min_amount,
        "max_amount": drop.max_amount,
    }


def _loot_drop_from_dict(data: dict[str, Any]) -> LootDrop:
    return LootDrop(
        drop_type=str(data["drop_type"]),
        chance=float(data["chance"]),
        min_amount=int(data.get("min_amount", 0)),
        max_amount=int(data.get("max_amount", 0)),
    )


def _coords_to_list(coords: set[tuple[int, int]]) -> list[list[int]]:
    return [[x, y] for x, y in sorted(coords)]


def _coords_from_list(coords: list[list[int]]) -> set[tuple[int, int]]:
    return {(int(x), int(y)) for x, y in coords}


def _jsonify(value: Any) -> Any:
    if isinstance(value, tuple):
        return [_jsonify(item) for item in value]
    if isinstance(value, list):
        return [_jsonify(item) for item in value]
    return value
