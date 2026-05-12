"""Public game facade for dispatching actions into the core."""

from __future__ import annotations

import time
from copy import deepcopy
from dataclasses import dataclass

from . import tiles
from .config import GameConfig
from .ecs import ECS
from .entities import create_monster, create_player
from .generation import generate_basic_dungeon, generate_basic_overworld
from .items import create_gold_entity, create_item_entity
from .monsters import create_from_type, spawn_away_from_player
from .models import (
    DungeonInstance,
    DungeonLevelSnapshot,
    EntitySnapshot,
    GameState,
    OverworldTransition,
    Position,
    WorldState,
)
from .rng import Rng
from .systems import (
    add_message,
    drop_inventory_item,
    process_enemy_ai,
    process_enemy_attacks,
    process_status_effects,
    resolve_move,
    update_vision,
    use_inventory_item,
)


@dataclass(slots=True, frozen=True)
class Action:
    kind: str
    dx: int = 0
    dy: int = 0
    index: int = 0

    @classmethod
    def move(cls, dx: int, dy: int) -> "Action":
        return cls(kind="move", dx=dx, dy=dy)

    @classmethod
    def wait(cls) -> "Action":
        return cls(kind="wait")

    @classmethod
    def restart(cls) -> "Action":
        return cls(kind="restart")

    @classmethod
    def use_item(cls, index: int) -> "Action":
        return cls(kind="use_item", index=index)

    @classmethod
    def drop_item(cls, index: int) -> "Action":
        return cls(kind="drop_item", index=index)


class Game:
    """Thin facade over the core state and systems."""

    def __init__(self, *, config: GameConfig | None = None, rng: Rng | None = None, ecs: ECS | None = None) -> None:
        self.config = config or GameConfig()
        self.rng = rng or Rng()
        self.ecs = ecs or ECS()
        self.state = GameState()
        self.world = WorldState()

    def new_game(self, *, seed: int | None = None) -> None:
        if seed is not None:
            self.rng = Rng(seed)
        self.ecs.reset()
        self.state = GameState(current="playing", area="overworld", floor=0)
        self.world = WorldState()
        self.world.overworld_seed = self.rng.randint(1, 1_000_000_000)

        overworld = generate_basic_overworld(
            self.config,
            section=self.world.overworld_section,
            seed=self.world.overworld_seed,
        )
        self.world.dungeon_grid = overworld.grid
        self.world.overworld_sections[self.world.overworld_section] = deepcopy(overworld.grid)
        self.world.spawn_position = overworld.spawn
        self.world.dungeon_entrance_position = overworld.entrance
        self.world.player_eid = create_player(self.ecs, overworld.spawn.x, overworld.spawn.y)
        self._set_player_vision(8)

        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        self._reveal_overworld_if_needed()
        add_message(self.world, "Welcome to the overworld.", "system")

    def dispatch(self, action: Action) -> bool:
        if action.kind == "restart":
            self.new_game()
            add_message(self.world, "Game restarted.", "system")
            return True

        if self.world.player_eid is None or self.state.current not in {"playing"}:
            return False

        self.state.player_attacked_this_turn = False
        self.state.enemy_attacked_this_turn = False
        self.state.status_applied_this_turn = False
        consumed_turn = False
        position_before = self._player_position_tuple()

        if action.kind == "move":
            if self.state.area == "overworld" and self._move_leaves_overworld(action.dx, action.dy):
                consumed_turn = self._change_overworld_section(action.dx, action.dy)
            else:
                consumed_turn = resolve_move(
                    self.ecs,
                    self.world,
                    self.state,
                    self.config,
                    self.rng,
                    self.world.player_eid,
                    action.dx,
                    action.dy,
                )
        elif action.kind == "wait":
            add_message(self.world, "You wait.", "action")
            consumed_turn = True
        elif action.kind == "use_item":
            consumed_turn = use_inventory_item(self.ecs, self.world, self.state, action.index, self.rng)
        elif action.kind == "drop_item":
            consumed_turn = drop_inventory_item(self.ecs, self.world, action.index)

        if consumed_turn:
            update_vision(self.ecs, self.world, self.config, self.world.player_eid)
            self._reveal_overworld_if_needed()
            position_after = self._player_position_tuple()
            moved = position_before is not None and position_after is not None and position_before != position_after
            if action.kind == "move" and moved and self._handle_tile_transition():
                self.state.turn_count += 1
                return True
            if self.state.area == "dungeon" and not self.state.player_attacked_this_turn:
                process_enemy_ai(self.ecs, self.world, self.state, self.config, self.rng)
                if not self.state.game_over:
                    process_enemy_attacks(self.ecs, self.world, self.state, self.rng)
            if not self.state.game_over and not self.state.status_applied_this_turn:
                process_status_effects(self.ecs, self.world)
            if self.world.player_eid is not None:
                update_vision(self.ecs, self.world, self.config, self.world.player_eid)
                self._reveal_overworld_if_needed()
            self.state.turn_count += 1

        return consumed_turn

    def spawn_monster(self, x: int, y: int, **kwargs: object) -> int:
        return create_monster(self.ecs, x, y, **kwargs)

    def spawn_monster_type(self, monster_type: str, x: int, y: int) -> int:
        return create_from_type(self.ecs, monster_type, x, y, floor_depth=abs(self.state.floor))

    def spawn_random_monster(self, monster_type: str = "slime", *, min_distance: int = 4) -> int:
        return spawn_away_from_player(
            self.ecs,
            self.world,
            self.config,
            self.rng,
            monster_type,
            min_distance=min_distance,
            floor_depth=abs(self.state.floor),
        )

    def spawn_item(self, x: int, y: int, item_type: str = "healing_potion") -> int:
        return create_item_entity(self.ecs, x, y, item_type)

    def spawn_gold(self, x: int, y: int, amount: int) -> int:
        return create_gold_entity(self.ecs, x, y, amount)

    def descend_floor(self) -> bool:
        if self.state.area != "dungeon":
            return self.enter_dungeon()
        target_floor = self.state.floor - 1
        if abs(target_floor) > self.state.dungeon_max_depth:
            add_message(self.world, "This dungeon goes no deeper.", "blocked")
            return False

        self._go_to_floor(target_floor, arrival="up_stairs", keep_position=True)
        self.state.floors_descended += 1
        add_message(self.world, f"You descend to floor {self.state.floor}...", "system")
        return True

    def ascend_floor(self) -> bool:
        if self.state.floor == -1:
            return self.exit_dungeon()
        if self.state.floor >= 0:
            return False

        self._go_to_floor(self.state.floor + 1, arrival="down_stairs", keep_position=False)
        add_message(self.world, f"You climb up to floor {self.state.floor}...", "system")
        return True

    def enter_dungeon(self) -> bool:
        if self.state.area != "overworld":
            return False

        player_position = self._player_position()
        if player_position is None:
            return False

        tile = self.world.dungeon_grid[player_position.y][player_position.x]
        if tile.special != "dungeonEntrance":
            add_message(self.world, "There is no dungeon entrance here.", "blocked")
            return False

        self._save_current_overworld_section()
        self.world.overworld_return_position = Position(player_position.x, player_position.y)
        self.world.dungeon_entrance_position = Position(player_position.x, player_position.y)
        dungeon = self._activate_dungeon_for_current_entrance(player_position)
        self.state.area = "dungeon"
        self.state.floor = -1
        self.state.dungeon_max_depth = dungeon.max_depth
        self._clear_non_player_entities()

        if not self._restore_floor(-1, arrival="up_stairs"):
            self._generate_floor(arrival="up_stairs", keep_position=False)

        self._set_player_vision(2)
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        add_message(self.world, "You enter the dungeon...", "system")
        return True

    def exit_dungeon(self) -> bool:
        if self.state.area != "dungeon":
            return False

        self._save_current_floor()
        self._clear_non_player_entities()
        self.world.active_dungeon_id = None
        self.state.area = "overworld"
        self.state.floor = 0
        self.world.stairs_position = None
        self._load_overworld_section(self.world.overworld_section)

        player_position = self._player_position()
        entrance = self.world.overworld_return_position or self.world.dungeon_entrance_position
        if player_position is not None and entrance is not None:
            player_position.x = entrance.x
            player_position.y = min(self.config.dungeon_height - 1, entrance.y + 1)
            if not self.world.dungeon_grid[player_position.y][player_position.x].walkable:
                self.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()

        self._set_player_vision(8)
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        self._reveal_overworld_if_needed()
        add_message(self.world, "You climb back into the overworld.", "system")
        return True

    def _handle_tile_transition(self) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False

        tile = self.world.dungeon_grid[player_position.y][player_position.x]
        if tile.special == "dungeonEntrance" and self.state.area == "overworld":
            return self.enter_dungeon()
        if tile.special == "downStairs":
            return self.descend_floor()
        if tile.special == "dungeonExit":
            return self.ascend_floor()
        return False

    def _move_leaves_overworld(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False
        target_x = player_position.x + dx
        target_y = player_position.y + dy
        return not self.config.in_bounds(target_x, target_y)

    def _change_overworld_section(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False

        old_grid = deepcopy(self.world.dungeon_grid)
        target_x = player_position.x + dx
        target_y = player_position.y + dy
        section_x, section_y = self.world.overworld_section
        direction = (0, 0)

        if target_x < 0:
            section_x -= 1
            direction = (-1, 0)
            player_position.x = self.config.dungeon_width - 1
            player_position.y = max(0, min(target_y, self.config.dungeon_height - 1))
        elif target_x >= self.config.dungeon_width:
            section_x += 1
            direction = (1, 0)
            player_position.x = 0
            player_position.y = max(0, min(target_y, self.config.dungeon_height - 1))
        elif target_y < 0:
            section_y -= 1
            direction = (0, -1)
            player_position.x = max(0, min(target_x, self.config.dungeon_width - 1))
            player_position.y = self.config.dungeon_height - 1
        elif target_y >= self.config.dungeon_height:
            section_y += 1
            direction = (0, 1)
            player_position.x = max(0, min(target_x, self.config.dungeon_width - 1))
            player_position.y = 0

        self._save_current_overworld_section()
        self._load_overworld_section((section_x, section_y))
        if not self.world.dungeon_grid[player_position.y][player_position.x].walkable:
            self.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()
            self._save_current_overworld_section()
        self.world.overworld_transition = OverworldTransition(
            from_grid=old_grid,
            to_grid=deepcopy(self.world.dungeon_grid),
            direction=direction,
            start_ms=int(time.monotonic() * 1000),
        )
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        self._reveal_overworld_if_needed()
        add_message(self.world, "You travel to another part of the overworld.", "system")
        return True

    def _go_to_floor(self, floor: int, *, arrival: str, keep_position: bool) -> None:
        self._save_current_floor()
        self._clear_non_player_entities()
        self.state.floor = floor
        self.state.area = "dungeon"
        if self._restore_floor(floor, arrival=arrival):
            return

        self._generate_floor(arrival=arrival, keep_position=keep_position)

    def _generate_floor(self, *, arrival: str, keep_position: bool) -> None:
        level = generate_basic_dungeon(self.config, self.rng, floor_depth=abs(self.state.floor))
        self.world.dungeon_grid = level.grid
        self.world.spawn_position = level.spawn
        self.world.stairs_position = level.stairs
        self.world.rooms = level.rooms

        player_position = self._player_position()
        if player_position is None:
            return

        if keep_position:
            player_position.x = max(0, min(player_position.x, self.config.dungeon_width - 1))
            player_position.y = max(0, min(player_position.y, self.config.dungeon_height - 1))
            self.world.dungeon_grid[player_position.y][player_position.x] = tiles.floor()
        else:
            player_position.x = level.spawn.x
            player_position.y = level.spawn.y

        self.world.dungeon_grid[player_position.y][player_position.x] = tiles.up_stairs()
        if arrival == "down_stairs" and self.world.stairs_position is not None:
            player_position.x = self.world.stairs_position.x
            player_position.y = self.world.stairs_position.y

        self._sync_down_stairs(player_position)

        self._populate_floor(player_position)
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)

    def _save_current_floor(self) -> None:
        if self.state.floor >= 0 or not self.world.dungeon_grid:
            return
        levels = self._active_dungeon_levels()
        levels[self.state.floor] = DungeonLevelSnapshot(
            dungeon_grid=deepcopy(self.world.dungeon_grid),
            rooms=list(self.world.rooms),
            stairs_position=deepcopy(self.world.stairs_position),
            entities=self._snapshot_non_player_entities(),
        )
        self.world.dungeon_levels = levels

    def _save_current_overworld_section(self) -> None:
        if self.state.area != "overworld" or not self.world.dungeon_grid:
            return
        self.world.overworld_sections[self.world.overworld_section] = deepcopy(self.world.dungeon_grid)

    def _load_overworld_section(self, section: tuple[int, int]) -> None:
        self.world.overworld_section = section
        cached = self.world.overworld_sections.get(section)
        if cached is not None:
            self.world.dungeon_grid = deepcopy(cached)
            self.world.dungeon_entrance_position = self._find_tile("dungeonEntrance")
            self.world.rooms = []
            return

        generated = generate_basic_overworld(self.config, section=section, seed=self.world.overworld_seed)
        self.world.dungeon_grid = generated.grid
        self.world.dungeon_entrance_position = generated.entrance
        self.world.overworld_sections[section] = deepcopy(generated.grid)
        self.world.rooms = []

    def _restore_floor(self, floor: int, *, arrival: str) -> bool:
        snapshot = self._active_dungeon_levels().get(floor)
        if snapshot is None:
            return False

        self.world.dungeon_grid = deepcopy(snapshot.dungeon_grid)
        self.world.rooms = list(snapshot.rooms)
        self.world.stairs_position = deepcopy(snapshot.stairs_position)
        self._restore_non_player_entities(snapshot.entities)

        player_position = self._player_position()
        if player_position is None:
            return True

        if arrival == "down_stairs" and self.world.stairs_position is not None:
            player_position.x = self.world.stairs_position.x
            player_position.y = self.world.stairs_position.y
        elif arrival == "up_stairs":
            stairs = self._find_tile("dungeonExit")
            if stairs is not None:
                player_position.x = stairs.x
                player_position.y = stairs.y

        self._sync_down_stairs(player_position)
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        return True

    def _active_dungeon_levels(self) -> dict[int, DungeonLevelSnapshot]:
        active = self._active_dungeon()
        if active is None:
            return self.world.dungeon_levels
        self.world.dungeon_levels = active.levels
        return active.levels

    def _active_dungeon(self) -> DungeonInstance | None:
        if self.world.active_dungeon_id is None:
            return None
        return self.world.dungeons.get(self.world.active_dungeon_id)

    def _activate_dungeon_for_current_entrance(self, entrance: Position) -> DungeonInstance:
        dungeon_id = self._dungeon_id(entrance)
        dungeon = self.world.dungeons.get(dungeon_id)
        if dungeon is None:
            dungeon = DungeonInstance(
                dungeon_id=dungeon_id,
                section=self.world.overworld_section,
                entrance=Position(entrance.x, entrance.y),
                max_depth=self._player_level(),
            )
            self.world.dungeons[dungeon_id] = dungeon
        self.world.active_dungeon_id = dungeon_id
        self.world.dungeon_levels = dungeon.levels
        return dungeon

    def _dungeon_id(self, entrance: Position) -> str:
        section_x, section_y = self.world.overworld_section
        return f"{section_x},{section_y}:{entrance.x},{entrance.y}"

    def _snapshot_non_player_entities(self) -> list[EntitySnapshot]:
        snapshots: list[EntitySnapshot] = []
        for entity_id in self.ecs.all_entities():
            if entity_id == self.world.player_eid:
                continue
            components = {
                component_type: deepcopy(self.ecs.get_component(entity_id, component_type))
                for component_type in self.ecs.component_types()
                if self.ecs.has_component(entity_id, component_type)
            }
            snapshots.append(EntitySnapshot(components=components))
        return snapshots

    def _restore_non_player_entities(self, snapshots: list[EntitySnapshot]) -> None:
        for snapshot in snapshots:
            entity_id = self.ecs.create_entity()
            for component_type, component in snapshot.components.items():
                self.ecs.add_component(entity_id, component_type, deepcopy(component))

    def _find_tile(self, special: str) -> Position | None:
        for y, row in enumerate(self.world.dungeon_grid):
            for x, tile in enumerate(row):
                if tile.special == special:
                    return Position(x, y)
        return None

    def _sync_down_stairs(self, player_position: Position) -> None:
        next_floor = self.state.floor - 1
        if abs(next_floor) > self.state.dungeon_max_depth:
            if self.world.stairs_position is not None:
                self.world.dungeon_grid[self.world.stairs_position.y][self.world.stairs_position.x] = tiles.floor()
            self.world.stairs_position = None
            return

        stairs = self.world.stairs_position
        if stairs is not None and (stairs.x, stairs.y) != (player_position.x, player_position.y):
            self.world.dungeon_grid[stairs.y][stairs.x] = tiles.stairs()
            return

        replacement = self._farthest_walkable_from(player_position)
        if replacement is not None:
            self.world.stairs_position = replacement
            self.world.dungeon_grid[replacement.y][replacement.x] = tiles.stairs()

    def _farthest_walkable_from(self, player_position: Position) -> Position | None:
        best: Position | None = None
        best_distance = -1
        for y, row in enumerate(self.world.dungeon_grid):
            for x, tile in enumerate(row):
                if not tile.walkable or tile.special is not None or (x, y) == (player_position.x, player_position.y):
                    continue
                distance = abs(player_position.x - x) + abs(player_position.y - y)
                if distance > best_distance:
                    best = Position(x, y)
                    best_distance = distance
        return best

    def _populate_floor(self, player_position: Position) -> None:
        depth = abs(self.state.floor)
        monster_types = self._monster_pool_for_depth(depth)
        max_spawns = min(len(self.world.rooms), 5 + depth // 3)

        for _ in range(max_spawns):
            if not self.rng.chance(0.7):
                continue
            monster_type = self.rng.choice(monster_types)
            try:
                self.spawn_random_monster(monster_type, min_distance=4)
            except ValueError:
                break

        if self.rng.chance(0.75):
            self._spawn_floor_item(player_position, "healing_potion")
        if self.rng.chance(0.35):
            self._spawn_floor_item(player_position, "strength_elixir")

    def _spawn_floor_item(self, player_position: Position, item_type: str) -> None:
        candidates: list[tuple[int, int]] = []
        for y, row in enumerate(self.world.dungeon_grid):
            for x, tile in enumerate(row):
                if not tile.walkable or tile.special is not None or self.ecs.entities_at(x, y):
                    continue
                if abs(player_position.x - x) + abs(player_position.y - y) < 3:
                    continue
                candidates.append((x, y))
        if candidates:
            x, y = self.rng.choice(candidates)
            self.spawn_item(x, y, item_type)

    def _clear_non_player_entities(self) -> None:
        for entity_id in self.ecs.all_entities():
            if entity_id != self.world.player_eid:
                self.ecs.destroy_entity(entity_id)

    def _player_position(self) -> Position | None:
        if self.world.player_eid is None:
            return None
        position = self.ecs.get_component(self.world.player_eid, "position")
        return position if isinstance(position, Position) else None

    def _player_position_tuple(self) -> tuple[int, int] | None:
        position = self._player_position()
        if position is None:
            return None
        return (position.x, position.y)

    def _set_player_vision(self, radius: int) -> None:
        if self.world.player_eid is None:
            return
        vision = self.ecs.get_component(self.world.player_eid, "vision")
        if hasattr(vision, "radius") and hasattr(vision, "base_radius"):
            vision.radius = radius
            vision.base_radius = radius
            vision.visible.clear()
            vision.seen.clear()

    def _reveal_overworld_if_needed(self) -> None:
        if self.state.area != "overworld" or self.world.player_eid is None:
            return
        vision = self.ecs.get_component(self.world.player_eid, "vision")
        if not hasattr(vision, "visible") or not hasattr(vision, "seen"):
            return
        all_tiles = {
            (x, y)
            for y, row in enumerate(self.world.dungeon_grid)
            for x, _tile in enumerate(row)
        }
        vision.visible = set(all_tiles)
        vision.seen.update(all_tiles)

    def _player_level(self) -> int:
        if self.world.player_eid is None:
            return 1
        progress = self.ecs.get_component(self.world.player_eid, "progress")
        level = getattr(progress, "level", 1)
        return max(1, int(level))

    @staticmethod
    def _monster_pool_for_depth(depth: int) -> tuple[str, ...]:
        if depth <= 2:
            return ("slime", "rat", "goblin", "goblin", "orc")
        if depth <= 5:
            return ("goblin", "orc", "skeleton", "slime", "spider", "berserker")
        return ("orc", "skeleton", "berserker", "spider", "troll")
