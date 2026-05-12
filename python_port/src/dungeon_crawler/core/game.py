"""Public game facade for dispatching actions into the core."""

from __future__ import annotations

import math
import time
from copy import deepcopy
from dataclasses import dataclass

from . import tiles
from .config import GameConfig
from .ecs import ECS
from .entities import create_monster, create_player
from .generation import apply_overworld_tile_rules, generate_basic_dungeon, generate_basic_overworld
from .items import create_gold_entity, create_item_entity
from .monsters import create_from_type, spawn_away_from_player
from .models import (
    DungeonInstance,
    DungeonLevelSnapshot,
    EntitySnapshot,
    GameState,
    ForestReturnContext,
    MINUTES_PER_DAY,
    OverworldTransition,
    Position,
    Tile,
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


FOREST_SECTION_OFFSET = 1_000_000
MAX_FOREST_DEPTH = 4


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
            if (
                self.state.area == "overworld"
                and self._move_targets_tree(action.dx, action.dy)
            ):
                if self._forest_depth() >= MAX_FOREST_DEPTH:
                    add_message(self.world, "The trees are too dense to enter.", "blocked")
                    consumed_turn = True
                else:
                    consumed_turn = self._enter_forest_chunk(action.dx, action.dy)
            elif self.state.area == "overworld" and self._move_leaves_overworld(action.dx, action.dy):
                if self.world.forest_return_section is not None:
                    consumed_turn = self._exit_forest_chunk(action.dx, action.dy)
                else:
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
                self._advance_time()
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
            self._advance_time()

        return consumed_turn

    def clock_minutes(self) -> int:
        return self.state.time_minutes % MINUTES_PER_DAY

    def clock_text(self) -> str:
        minutes = self.clock_minutes()
        return f"{minutes // 60:02d}:{minutes % 60:02d}"

    def day_phase(self) -> str:
        minutes = self.clock_minutes()
        if self.config.day_start_minute <= minutes < self.config.night_start_minute:
            return "day"
        return "night"

    def is_night(self) -> bool:
        return self.day_phase() == "night"

    def _advance_time(self) -> None:
        self.state.time_minutes = (self.state.time_minutes + self.config.minutes_per_turn) % MINUTES_PER_DAY

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
        return not self._active_in_bounds(target_x, target_y)

    def _move_targets_tree(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False
        target_x = player_position.x + dx
        target_y = player_position.y + dy
        if not self._active_in_bounds(target_x, target_y):
            return False
        return self.world.dungeon_grid[target_y][target_x].special == "tree"

    def _enter_forest_chunk(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False

        target_x = player_position.x + dx
        target_y = player_position.y + dy
        if not self._active_in_bounds(target_x, target_y):
            return False

        return self._enter_forest_at_tree(
            target_x,
            target_y,
            dx,
            dy,
            from_grid=deepcopy(self.world.dungeon_grid),
            return_section=self.world.overworld_section,
            return_position=Position(player_position.x, player_position.y),
        )

    def _enter_forest_at_tree(
        self,
        tree_x: int,
        tree_y: int,
        dx: int,
        dy: int,
        *,
        from_grid: list[list[Tile]],
        return_section: tuple[int, int],
        return_position: Position,
    ) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False
        if self._forest_depth() >= MAX_FOREST_DEPTH:
            add_message(self.world, "The trees are too dense to enter.", "blocked")
            return True

        forest_section = self._forest_section_for(return_section, tree_x, tree_y)
        self._save_current_overworld_section()
        self._push_forest_return_context()
        self.world.overworld_section = forest_section
        cached = self.world.overworld_sections.get(forest_section)
        self.world.dungeon_grid = (
            deepcopy(cached) if cached is not None else self._generate_forest_grid(return_section, tree_x, tree_y)
        )
        self.world.overworld_sections[forest_section] = deepcopy(self.world.dungeon_grid)
        self.world.forest_return_section = return_section
        self.world.forest_return_position = return_position
        self.world.forest_tree_position = Position(tree_x, tree_y)
        width = self._active_grid_width()
        height = self._active_grid_height()
        parent_width = len(from_grid[0]) if from_grid else self.config.dungeon_width
        parent_height = len(from_grid) if from_grid else self.config.dungeon_height
        entry_x = self._scale_grid_coordinate(tree_x, parent_width, width)
        entry_y = self._scale_grid_coordinate(tree_y, parent_height, height)

        if dx > 0:
            player_position.x = 0
            player_position.y = entry_y
        elif dx < 0:
            player_position.x = width - 1
            player_position.y = entry_y
        elif dy > 0:
            player_position.x = entry_x
            player_position.y = 0
        else:
            player_position.x = entry_x
            player_position.y = height - 1

        self._ensure_player_tile_walkable(player_position)
        self.world.overworld_transition = OverworldTransition(
            from_grid=from_grid,
            to_grid=deepcopy(self.world.dungeon_grid),
            direction=(dx, dy),
            start_ms=int(time.monotonic() * 1000),
        )
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        self._reveal_overworld_if_needed()
        add_message(self.world, "You push into the trees...", "system")
        return True

    def _forest_depth(self) -> int:
        if self.world.forest_return_section is None:
            return 0
        return 1 + len(self.world.forest_return_stack)

    def _exit_forest_chunk(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None or self.world.forest_return_section is None:
            return False

        current_section = self.world.overworld_section
        current_position = Position(player_position.x, player_position.y)
        old_grid = deepcopy(self.world.dungeon_grid)
        return_section, return_position = self._forest_exit_destination(dx, dy)
        self._save_current_overworld_section()
        self._load_overworld_section(return_section)
        return_position.x = min(max(return_position.x, 0), self._active_grid_width() - 1)
        return_position.y = min(max(return_position.y, 0), self._active_grid_height() - 1)

        if self.world.dungeon_grid[return_position.y][return_position.x].special == "tree":
            self._pop_forest_return_context()
            return self._enter_forest_at_tree(
                return_position.x,
                return_position.y,
                dx,
                dy,
                from_grid=old_grid,
                return_section=return_section,
                return_position=Position(return_position.x - dx, return_position.y - dy),
            )

        if not self.world.dungeon_grid[return_position.y][return_position.x].walkable:
            self.world.overworld_section = current_section
            self.world.dungeon_grid = old_grid
            player_position.x = current_position.x
            player_position.y = current_position.y
            add_message(self.world, "That space is blocked.", "blocked")
            return True

        self._pop_forest_return_context()
        player_position.x = min(max(return_position.x, 0), self._active_grid_width() - 1)
        player_position.y = min(max(return_position.y, 0), self._active_grid_height() - 1)

        self.world.overworld_transition = OverworldTransition(
            from_grid=old_grid,
            to_grid=deepcopy(self.world.dungeon_grid),
            direction=(dx, dy),
            start_ms=int(time.monotonic() * 1000),
        )
        update_vision(self.ecs, self.world, self.config, self.world.player_eid)
        self._reveal_overworld_if_needed()
        add_message(self.world, "You emerge from the forest.", "system")
        return True

    def _push_forest_return_context(self) -> None:
        if (
            self.world.forest_return_section is None
            and self.world.forest_return_position is None
            and self.world.forest_tree_position is None
        ):
            return

        self.world.forest_return_stack.append(
            ForestReturnContext(
                section=self.world.forest_return_section,
                position=deepcopy(self.world.forest_return_position),
                tree_position=deepcopy(self.world.forest_tree_position),
            )
        )

    def _pop_forest_return_context(self) -> None:
        if not self.world.forest_return_stack:
            self.world.forest_return_section = None
            self.world.forest_return_position = None
            self.world.forest_tree_position = None
            return

        context = self.world.forest_return_stack.pop()
        self.world.forest_return_section = context.section
        self.world.forest_return_position = context.position
        self.world.forest_tree_position = context.tree_position

    def _forest_exit_destination(self, dx: int, dy: int) -> tuple[tuple[int, int], Position]:
        tree_section = self.world.forest_return_section
        tree_position = self.world.forest_tree_position
        fallback = self.world.forest_return_position or Position(0, 0)
        if tree_section is None:
            return self.world.overworld_section, fallback
        if tree_position is None:
            return tree_section, fallback

        candidate = Position(tree_position.x + dx, tree_position.y + dy)
        if self._section_position_in_bounds(tree_section, candidate.x, candidate.y):
            return tree_section, candidate

        section_x, section_y = tree_section
        if candidate.x < 0:
            return (section_x - 1, section_y), Position(self.config.dungeon_width - 1, max(0, min(candidate.y, self.config.dungeon_height - 1)))
        if candidate.x >= self._section_width(tree_section):
            return (section_x + 1, section_y), Position(0, max(0, min(candidate.y, self.config.dungeon_height - 1)))
        if candidate.y < 0:
            return (section_x, section_y - 1), Position(max(0, min(candidate.x, self.config.dungeon_width - 1)), self.config.dungeon_height - 1)
        if candidate.y >= self._section_height(tree_section):
            return (section_x, section_y + 1), Position(max(0, min(candidate.x, self.config.dungeon_width - 1)), 0)
        return tree_section, fallback

    def _ensure_player_tile_walkable(self, player_position: Position) -> None:
        if not self.world.dungeon_grid[player_position.y][player_position.x].walkable:
            self.world.dungeon_grid[player_position.y][player_position.x] = tiles.dark_grass()

    def _active_in_bounds(self, x: int, y: int) -> bool:
        return 0 <= y < self._active_grid_height() and 0 <= x < self._active_grid_width()

    def _active_grid_width(self) -> int:
        return len(self.world.dungeon_grid[0]) if self.world.dungeon_grid else self.config.dungeon_width

    def _active_grid_height(self) -> int:
        return len(self.world.dungeon_grid) if self.world.dungeon_grid else self.config.dungeon_height

    def _scale_grid_coordinate(self, value: int, source_size: int, target_size: int) -> int:
        if source_size <= 0 or target_size <= 1:
            return 0
        return min(max(0, math.floor((value + 0.5) * target_size / source_size)), target_size - 1)

    def _section_position_in_bounds(self, section: tuple[int, int], x: int, y: int) -> bool:
        return 0 <= x < self._section_width(section) and 0 <= y < self._section_height(section)

    def _section_width(self, section: tuple[int, int]) -> int:
        grid = self.world.overworld_sections.get(section)
        return len(grid[0]) if grid else self.config.dungeon_width

    def _section_height(self, section: tuple[int, int]) -> int:
        grid = self.world.overworld_sections.get(section)
        return len(grid) if grid else self.config.dungeon_height

    def _forest_section_for(self, section: tuple[int, int], tree_x: int, tree_y: int) -> tuple[int, int]:
        return (
            FOREST_SECTION_OFFSET + section[0] * self.config.dungeon_width + tree_x,
            FOREST_SECTION_OFFSET + section[1] * self.config.dungeon_height + tree_y,
        )

    def _generate_forest_grid(self, parent_section: tuple[int, int], tree_x: int, tree_y: int) -> list[list[Tile]]:
        salt = (
            self.world.overworld_seed
            + parent_section[0] * 92821
            + parent_section[1] * 68917
            + tree_x * 197
            + tree_y * 389
        )
        ratios = self._forest_neighbor_ratios(parent_section, tree_x, tree_y)
        tree_threshold = 18 + round(ratios.get("tree", 0) * 30)
        water_ratio = ratios.get("water", 0)
        rock_ratio = ratios.get("rock", 0)
        sand_ratio = ratios.get("sand", 0)
        width, height = self._forest_grid_size()
        grid = [[tiles.dark_grass() for _x in range(width)] for _y in range(height)]
        for y in range(height):
            for x in range(width):
                edge = x == 0 or y == 0 or x == width - 1 or y == height - 1
                noise = (salt + x * 37 + y * 53 + x * y * 17) % 100
                if edge and noise < 56 + round(ratios.get("tree", 0) * 22):
                    grid[y][x] = tiles.tree()
                elif noise < tree_threshold:
                    grid[y][x] = tiles.tree()
                elif noise < tree_threshold + 9 + round(ratios.get("grass", 0) * 8):
                    grid[y][x] = tiles.light_grass()
        self._apply_forest_patch(grid, "water", water_ratio, salt + 1100)
        self._apply_forest_patch(grid, "rock", rock_ratio, salt + 2200)
        self._apply_forest_patch(grid, "sand", sand_ratio, salt + 3300)
        apply_overworld_tile_rules(self.config, grid)
        self._apply_forest_edge_constraints(grid, parent_section, tree_x, tree_y)
        return grid

    def _apply_forest_edge_constraints(
        self,
        grid: list[list[Tile]],
        parent_section: tuple[int, int],
        tree_x: int,
        tree_y: int,
    ) -> None:
        if not grid or not grid[0]:
            return

        width = len(grid[0])
        height = len(grid)
        edges = (
            ((-1, 0), [(0, y) for y in range(height)]),
            ((1, 0), [(width - 1, y) for y in range(height)]),
            ((0, -1), [(x, 0) for x in range(width)]),
            ((0, 1), [(x, height - 1) for x in range(width)]),
        )
        open_edges: list[tuple[int, int]] = []

        for (dx, dy), cells in edges:
            neighbor = self._forest_parent_tile_at(parent_section, tree_x + dx, tree_y + dy)
            if neighbor.walkable or neighbor.special == "tree":
                open_edges.append((dx, dy))
                continue
            for x, y in cells:
                grid[y][x] = deepcopy(neighbor)

        for dx, dy in open_edges:
            self._open_forest_edge_portal(grid, parent_section, tree_x, tree_y, dx, dy)

    def _open_forest_edge_portal(
        self,
        grid: list[list[Tile]],
        parent_section: tuple[int, int],
        tree_x: int,
        tree_y: int,
        dx: int,
        dy: int,
    ) -> None:
        width = len(grid[0]) if grid else 0
        height = len(grid)
        parent_width, parent_height = self._forest_parent_grid_size(parent_section)
        portal_x = self._scale_grid_coordinate(tree_x, parent_width, width)
        portal_y = self._scale_grid_coordinate(tree_y, parent_height, height)

        if dx < 0:
            cells = [(0, portal_y), (min(1, width - 1), portal_y)]
        elif dx > 0:
            cells = [(width - 1, portal_y), (max(0, width - 2), portal_y)]
        elif dy < 0:
            cells = [(portal_x, 0), (portal_x, min(1, height - 1))]
        else:
            cells = [(portal_x, height - 1), (portal_x, max(0, height - 2))]

        for x, y in cells:
            if 0 <= y < height and 0 <= x < width:
                grid[y][x] = tiles.dark_grass()

    def _forest_parent_grid_size(self, section: tuple[int, int]) -> tuple[int, int]:
        grid = self.world.overworld_sections.get(section)
        if grid:
            return len(grid[0]), len(grid)
        return self.config.dungeon_width, self.config.dungeon_height

    def _forest_grid_size(self) -> tuple[int, int]:
        depth = 1 + len(self.world.forest_return_stack)
        scale = 2 ** max(0, depth - 1)
        width = max(3, math.ceil(self.config.dungeon_width / scale))
        height = max(3, math.ceil(self.config.dungeon_height / scale))
        if width % 2 == 0:
            width += 1
        if height % 2 == 0:
            height += 1
        return width, height

    def _apply_forest_patch(self, grid: list[list[Tile]], category: str, ratio: float, salt: int) -> None:
        if ratio <= 0:
            return

        width = len(grid[0]) if grid else 0
        height = len(grid)
        target_size = max(2, round(ratio * width * height * 0.16))
        start_x = 2 + salt % max(1, width - 4)
        start_y = 2 + (salt // 7) % max(1, height - 4)
        frontier = [(start_x, start_y)]
        painted: set[tuple[int, int]] = set()

        while frontier and len(painted) < target_size:
            index = (salt + len(painted) * 11) % len(frontier)
            x, y = frontier.pop(index)
            if (x, y) in painted or not (0 <= x < width and 0 <= y < height):
                continue
            if x in {0, width - 1} or y in {0, height - 1}:
                continue
            if grid[y][x].special == "tree" and len(painted) > target_size // 3:
                continue

            grid[y][x] = self._forest_patch_tile(category, salt + x * 31 + y * 43)
            painted.add((x, y))

            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx = x + dx
                ny = y + dy
                if (nx, ny) not in painted and 0 <= nx < width and 0 <= ny < height:
                    frontier.append((nx, ny))

    def _forest_patch_tile(self, category: str, salt: int) -> Tile:
        if category == "water":
            return tiles.water()
        if category == "rock":
            return tiles.rock()
        if category == "sand":
            return tiles.sand()
        return tiles.light_grass()

    def _forest_neighbor_ratios(self, section: tuple[int, int], tree_x: int, tree_y: int) -> dict[str, float]:
        counts: dict[str, int] = {}
        total = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                tile = self._forest_parent_tile_at(section, tree_x + dx, tree_y + dy)
                category = self._forest_tile_category(tile)
                counts[category] = counts.get(category, 0) + 1
                total += 1
        if total == 0:
            return {}
        return {category: count / total for category, count in counts.items()}

    def _forest_parent_tile_at(self, section: tuple[int, int], x: int, y: int) -> Tile:
        grid = self.world.overworld_sections.get(section)
        if grid is not None:
            if 0 <= y < len(grid) and 0 <= x < len(grid[y]):
                return self._forest_sample_tile(grid[y][x])
            if self._is_forest_section(section):
                return tiles.tree()
        return self._forest_sample_tile(self._overworld_tile_at(section, x, y))

    def _forest_sample_tile(self, tile: Tile) -> Tile:
        if tile.special == "ocean":
            return tiles.shallow_water() if tile.walkable else tiles.water()
        return tile

    def _is_forest_section(self, section: tuple[int, int]) -> bool:
        return section[0] >= FOREST_SECTION_OFFSET or section[1] >= FOREST_SECTION_OFFSET

    def _overworld_tile_at(self, section: tuple[int, int], x: int, y: int) -> Tile:
        section_x, section_y = section
        while x < 0:
            section_x -= 1
            x += self._section_width((section_x, section_y))
        while x >= self._section_width((section_x, section_y)):
            x -= self._section_width((section_x, section_y))
            section_x += 1
        while y < 0:
            section_y -= 1
            y += self._section_height((section_x, section_y))
        while y >= self._section_height((section_x, section_y)):
            y -= self._section_height((section_x, section_y))
            section_y += 1

        normalized_section = (section_x, section_y)
        grid = self.world.overworld_sections.get(normalized_section)
        if grid is None:
            generated = generate_basic_overworld(self.config, section=normalized_section, seed=self.world.overworld_seed)
            grid = generated.grid
            self.world.overworld_sections[normalized_section] = deepcopy(grid)
        return grid[y][x]

    def _forest_tile_category(self, tile: Tile) -> str:
        if tile.special == "tree":
            return "tree"
        if tile.special == "rock":
            return "rock"
        if tile.special == "sand":
            return "sand"
        if tile.special in {"water", "ocean"}:
            return "water"
        return "grass"

    def _change_overworld_section(self, dx: int, dy: int) -> bool:
        player_position = self._player_position()
        if player_position is None:
            return False

        previous_section = self.world.overworld_section
        previous_position = Position(player_position.x, player_position.y)
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
        if self.world.dungeon_grid[player_position.y][player_position.x].special == "tree":
            return self._enter_forest_at_tree(
                player_position.x,
                player_position.y,
                dx,
                dy,
                from_grid=old_grid,
                return_section=(section_x, section_y),
                return_position=Position(player_position.x - dx, player_position.y - dy),
            )
        if not self.world.dungeon_grid[player_position.y][player_position.x].walkable:
            self.world.overworld_section = previous_section
            self.world.dungeon_grid = old_grid
            player_position.x = previous_position.x
            player_position.y = previous_position.y
            add_message(self.world, "That space is blocked.", "blocked")
            return True
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
