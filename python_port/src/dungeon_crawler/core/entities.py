"""Entity factory helpers for the Python core."""

from __future__ import annotations

from .ecs import ECS
from .models import AI, Blocker, Descriptor, Health, Inventory, Position, Progress, Stats, Status, Vision


def create_player(ecs: ECS, x: int, y: int) -> int:
    entity_id = ecs.create_entity()
    ecs.add_component(entity_id, "position", Position(x=x, y=y))
    ecs.add_component(entity_id, "health", Health(hp=100, max_hp=100))
    ecs.add_component(entity_id, "stats", Stats(strength=14, agility=12, accuracy=6, evasion=4))
    ecs.add_component(entity_id, "vision", Vision(radius=2, base_radius=2))
    ecs.add_component(entity_id, "descriptor", Descriptor(name="Hero", glyph="@", color="royalBlue"))
    ecs.add_component(entity_id, "blocker", Blocker(passable=False))
    ecs.add_component(entity_id, "progress", Progress(xp=0, level=1, next_level_xp=20))
    ecs.add_component(entity_id, "inventory", Inventory(items=[], capacity=12))
    ecs.add_component(entity_id, "status", Status())
    return entity_id


def create_monster(
    ecs: ECS,
    x: int,
    y: int,
    *,
    name: str = "Slime",
    glyph: str = "s",
    color: str = "green",
    hp: int = 12,
    strength: int = 6,
    agility: int = 6,
    accuracy: int = 4,
    evasion: int = 2,
    xp: int = 5,
    behavior: str = "random",
    vision_radius: int = 6,
    sprite: str | None = None,
) -> int:
    entity_id = ecs.create_entity()
    ecs.add_component(entity_id, "position", Position(x=x, y=y))
    ecs.add_component(entity_id, "health", Health(hp=hp, max_hp=hp))
    ecs.add_component(
        entity_id,
        "stats",
        Stats(strength=strength, agility=agility, accuracy=accuracy, evasion=evasion),
    )
    ecs.add_component(entity_id, "descriptor", Descriptor(name=name, glyph=glyph, color=color, sprite=sprite))
    ecs.add_component(entity_id, "vision", Vision(radius=vision_radius, base_radius=vision_radius))
    ecs.add_component(entity_id, "ai", AI(behavior=behavior))
    ecs.add_component(entity_id, "blocker", Blocker(passable=False))
    ecs.add_component(entity_id, "hostile", True)
    ecs.add_component(entity_id, "xp_value", xp)
    return entity_id
