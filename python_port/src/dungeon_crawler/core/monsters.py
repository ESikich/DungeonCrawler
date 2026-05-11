"""Enemy registry and spawning helpers."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .config import GameConfig
from .ecs import ECS
from .entities import create_monster
from .models import Position, WorldState
from .rng import Rng


@dataclass(slots=True, frozen=True)
class MonsterDefinition:
    name: str
    glyph: str
    color: str
    sprite: str
    hp: int
    strength: int
    agility: int
    accuracy: int
    evasion: int
    behavior: str
    xp: int


MONSTERS: dict[str, MonsterDefinition] = {
    "slime": MonsterDefinition(
        name="Green Slime",
        glyph="s",
        color="green",
        sprite="slime",
        hp=15,
        strength=8,
        agility=6,
        accuracy=5,
        evasion=2,
        behavior="random",
        xp=5,
    ),
    "orc": MonsterDefinition(
        name="Orc Warrior",
        glyph="o",
        color="red",
        sprite="orcWarrior",
        hp=25,
        strength=12,
        agility=8,
        accuracy=8,
        evasion=4,
        behavior="chase",
        xp=12,
    ),
    "goblin": MonsterDefinition(
        name="Goblin",
        glyph="g",
        color="brown",
        sprite="goblin",
        hp=12,
        strength=6,
        agility=12,
        accuracy=7,
        evasion=6,
        behavior="chase",
        xp=8,
    ),
    "rat": MonsterDefinition(
        name="Giant Rat",
        glyph="r",
        color="brown",
        sprite="giantRat",
        hp=8,
        strength=4,
        agility=10,
        accuracy=6,
        evasion=7,
        behavior="cautious",
        xp=3,
    ),
    "berserker": MonsterDefinition(
        name="Berserker",
        glyph="B",
        color="red",
        sprite="berserker",
        hp=35,
        strength=16,
        agility=6,
        accuracy=9,
        evasion=2,
        behavior="aggressive",
        xp=20,
    ),
    "skeleton": MonsterDefinition(
        name="Skeleton Warrior",
        glyph="S",
        color="white",
        sprite="skeletonWarrior",
        hp=18,
        strength=10,
        agility=7,
        accuracy=6,
        evasion=3,
        behavior="chase",
        xp=10,
    ),
    "spider": MonsterDefinition(
        name="Giant Spider",
        glyph="x",
        color="purple",
        sprite="giantSpider",
        hp=10,
        strength=6,
        agility=14,
        accuracy=8,
        evasion=9,
        behavior="cautious",
        xp=6,
    ),
    "troll": MonsterDefinition(
        name="Cave Troll",
        glyph="T",
        color="green",
        sprite="caveTroll",
        hp=45,
        strength=18,
        agility=4,
        accuracy=10,
        evasion=1,
        behavior="chase",
        xp=25,
    ),
}


def create_from_type(ecs: ECS, monster_type: str, x: int, y: int, *, floor_depth: int = 1) -> int:
    definition = MONSTERS.get(monster_type, MONSTERS["goblin"])
    scaled = _scale_for_floor(definition, floor_depth)
    return create_monster(
        ecs,
        x,
        y,
        name=scaled.name,
        glyph=scaled.glyph,
        color=scaled.color,
        sprite=scaled.sprite,
        hp=scaled.hp,
        strength=scaled.strength,
        agility=scaled.agility,
        accuracy=scaled.accuracy,
        evasion=scaled.evasion,
        xp=scaled.xp,
        behavior=scaled.behavior,
    )


def spawn_away_from_player(
    ecs: ECS,
    world: WorldState,
    config: GameConfig,
    rng: Rng,
    monster_type: str = "slime",
    *,
    min_distance: int = 4,
    floor_depth: int = 1,
) -> int:
    player_position = _player_position(ecs, world)
    candidates: list[tuple[int, int]] = []

    for y, row in enumerate(world.dungeon_grid):
        for x, tile in enumerate(row):
            if not tile.walkable or tile.special == "dungeonEntrance":
                continue
            if not config.in_bounds(x, y):
                continue
            if ecs.entities_at(x, y):
                continue
            if player_position is not None:
                distance = abs(player_position.x - x) + abs(player_position.y - y)
                if distance < min_distance:
                    continue
            candidates.append((x, y))

    if not candidates:
        raise ValueError("No valid monster spawn positions")

    x, y = rng.choice(candidates)
    return create_from_type(ecs, monster_type, x, y, floor_depth=floor_depth)


def _scale_for_floor(definition: MonsterDefinition, floor_depth: int) -> MonsterDefinition:
    if floor_depth <= 1:
        return definition

    scaling_factor = 1 + (floor_depth - 1) * 0.15 * (1 / (1 + (floor_depth - 1) * 0.05))
    speed_factor = math.sqrt(scaling_factor)
    name = definition.name

    if floor_depth >= 5:
        prefixes = ("Elite", "Veteran", "Ancient", "Cursed", "Shadow")
        prefix = prefixes[min((floor_depth - 5) // 2, len(prefixes) - 1)]
        name = f"{prefix} {name}"

    return MonsterDefinition(
        name=name,
        glyph=definition.glyph,
        color=definition.color,
        sprite=definition.sprite,
        hp=max(1, int(definition.hp * scaling_factor)),
        strength=max(1, int(definition.strength * scaling_factor)),
        agility=max(1, int(definition.agility * speed_factor)),
        accuracy=max(1, int(definition.accuracy * scaling_factor)),
        evasion=max(1, int(definition.evasion * speed_factor)),
        behavior=definition.behavior,
        xp=max(1, int(definition.xp * scaling_factor)),
    )


def _player_position(ecs: ECS, world: WorldState) -> Position | None:
    if world.player_eid is None:
        return None
    position = ecs.get_component(world.player_eid, "position")
    return position if isinstance(position, Position) else None
