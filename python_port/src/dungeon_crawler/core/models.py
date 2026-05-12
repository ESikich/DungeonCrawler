"""Dataclasses used by the Python dungeon crawler core."""

from __future__ import annotations

from dataclasses import dataclass, field


Coordinate = tuple[int, int]
Color = tuple[int, int, int]
MINUTES_PER_DAY = 24 * 60


@dataclass(slots=True, frozen=True)
class Tile:
    walkable: bool
    opaque: bool
    color: Color = (128, 128, 128)
    glyph: str = "?"
    special: str | None = None


@dataclass(slots=True)
class Position:
    x: int
    y: int


@dataclass(slots=True)
class Health:
    hp: int
    max_hp: int


@dataclass(slots=True)
class Stats:
    strength: int
    agility: int
    accuracy: int
    evasion: int


@dataclass(slots=True)
class Vision:
    radius: int = 2
    base_radius: int = 2
    visible: set[Coordinate] = field(default_factory=set)
    seen: set[Coordinate] = field(default_factory=set)


@dataclass(slots=True)
class Descriptor:
    name: str
    glyph: str
    color: str = "white"
    sprite: str | None = None


@dataclass(slots=True, frozen=True)
class Item:
    item_type: str
    name: str
    glyph: str
    color: str = "white"
    rarity: str = "common"
    description: str = ""
    effect: str = "none"
    heal_amount: int = 0
    gold_amount: int = 0
    stat_boost: str | None = None
    boost_amount: int = 0
    boost_turns: int = 0
    accuracy_bonus: int = 0
    evasion_bonus: int = 0
    agility_bonus: int = 0
    reduction: float = 0.35
    regen_amount: int = 0
    temp_max_hp_amount: int = 0
    evasion_penalty: int = 0
    radius: int = 0
    damage: int = 0
    permanent_boost: str | None = None
    permanent_amount: float = 0
    utility_type: str | None = None


@dataclass(slots=True, frozen=True)
class LootDrop:
    drop_type: str
    chance: float
    min_amount: int = 0
    max_amount: int = 0


@dataclass(slots=True)
class AI:
    behavior: str = "chase"
    active: bool = False
    last_player_pos: Coordinate | None = None
    silenced: int = 0


@dataclass(slots=True, frozen=True)
class Blocker:
    passable: bool = False


@dataclass(slots=True)
class Inventory:
    items: list[Item] = field(default_factory=list)
    capacity: int = 12


@dataclass(slots=True)
class Progress:
    xp: int = 0
    level: int = 1
    next_level_xp: int = 20


@dataclass(slots=True)
class Status:
    light_boost: int = 0
    speed_boost: int = 0
    strength_boost: int = 0
    accuracy_boost: int = 0
    evasion_boost: int = 0
    clarity_boost: int = 0
    damage_reduction_boost: int = 0
    regen_boost: int = 0
    temp_max_hp_boost: int = 0
    glass_fury_boost: int = 0
    warding_boost: int = 0
    strength_bonus_amount: int = 0
    accuracy_bonus_amount: int = 0
    evasion_bonus_amount: int = 0
    agility_bonus_amount: int = 0
    clarity_accuracy_amount: int = 0
    clarity_evasion_amount: int = 0
    damage_reduction_percent: float = 0.35
    regen_amount: int = 0
    temp_max_hp_amount: int = 0
    glass_fury_strength_amount: int = 0
    glass_fury_evasion_penalty: int = 0


@dataclass(slots=True)
class Message:
    text: str
    category: str = "info"


@dataclass(slots=True)
class EntitySnapshot:
    components: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class DungeonLevelSnapshot:
    dungeon_grid: list[list[Tile]] = field(default_factory=list)
    rooms: list[tuple[int, int, int, int]] = field(default_factory=list)
    stairs_position: Position | None = None
    entities: list[EntitySnapshot] = field(default_factory=list)


@dataclass(slots=True)
class DungeonInstance:
    dungeon_id: str
    section: Coordinate
    entrance: Position
    max_depth: int = 1
    levels: dict[int, DungeonLevelSnapshot] = field(default_factory=dict)


@dataclass(slots=True)
class OverworldTransition:
    from_grid: list[list[Tile]]
    to_grid: list[list[Tile]]
    direction: Coordinate
    start_ms: int
    duration_ms: int = 430


@dataclass(slots=True)
class ForestReturnContext:
    section: Coordinate | None = None
    position: Position | None = None
    tree_position: Position | None = None


@dataclass(slots=True)
class GameState:
    current: str = "start"
    turn_count: int = 0
    time_minutes: int = 8 * 60
    game_over: bool = False
    area: str = "overworld"
    floor: int = 0
    dungeon_max_depth: int = 1
    floors_descended: int = 0
    player_gold: int = 0
    gold_multiplier: float = 1.0
    xp_multiplier: float = 1.0
    player_attacked_this_turn: bool = False
    enemy_attacked_this_turn: bool = False
    status_applied_this_turn: bool = False


@dataclass(slots=True)
class WorldState:
    dungeon_grid: list[list[Tile]] = field(default_factory=list)
    dungeon_levels: dict[int, DungeonLevelSnapshot] = field(default_factory=dict)
    dungeons: dict[str, DungeonInstance] = field(default_factory=dict)
    active_dungeon_id: str | None = None
    overworld_sections: dict[Coordinate, list[list[Tile]]] = field(default_factory=dict)
    overworld_section: Coordinate = (0, 0)
    overworld_seed: int = 0
    player_eid: int | None = None
    rooms: list[tuple[int, int, int, int]] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    spawn_position: Position | None = None
    stairs_position: Position | None = None
    dungeon_entrance_position: Position | None = None
    overworld_return_position: Position | None = None
    overworld_transition: OverworldTransition | None = None
    forest_return_section: Coordinate | None = None
    forest_return_position: Position | None = None
    forest_tree_position: Position | None = None
    forest_return_stack: list[ForestReturnContext] = field(default_factory=list)
