"""Basic deterministic dungeon generation."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import math

from .config import GameConfig
from .models import Position, Tile
from .rng import Rng
from . import tiles


@dataclass(slots=True, frozen=True)
class GeneratedLevel:
    grid: list[list[Tile]]
    spawn: Position
    stairs: Position
    rooms: list[tuple[int, int, int, int]]
    algorithm: str = "rooms"


@dataclass(slots=True, frozen=True)
class GeneratedOverworld:
    grid: list[list[Tile]]
    spawn: Position
    entrance: Position | None


@dataclass(slots=True)
class _DungeonRoom:
    x: int
    y: int
    width: int
    height: int
    room_type: str = "normal"
    features: list[dict[str, int | str]] = field(default_factory=list)

    def tuple(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.width, self.height)

    def center(self) -> Position:
        return Position(self.x + self.width // 2, self.y + self.height // 2)


def generate_basic_dungeon(config: GameConfig, rng: Rng, *, floor_depth: int = 1) -> GeneratedLevel:
    """Generate a connected dungeon with JS-style floor-based variety."""

    algorithm = _choose_dungeon_algorithm(rng, floor_depth)
    grid = [[tiles.wall() for _ in range(config.dungeon_width)] for _ in range(config.dungeon_height)]
    room_objects = _generate_dungeon_layout(config, rng, grid, algorithm, floor_depth)
    if not room_objects:
        room_objects = _create_fallback_rooms(config, grid)

    _validate_dungeon_connectivity(config, grid, room_objects, rng)
    _add_environmental_hazards(config, rng, grid, floor_depth)

    spawn = room_objects[0].center()
    stairs_position = _farthest_walkable_position(config, grid, spawn) or room_objects[-1].center()
    grid[spawn.y][spawn.x] = tiles.floor()
    grid[stairs_position.y][stairs_position.x] = tiles.stairs()
    rooms = [room.tuple() for room in room_objects]
    return GeneratedLevel(grid=grid, spawn=spawn, stairs=stairs_position, rooms=rooms, algorithm=algorithm)


def generate_basic_overworld(
    config: GameConfig,
    *,
    section: tuple[int, int] = (0, 0),
    seed: int = 0,
) -> GeneratedOverworld:
    """Generate a deterministic overworld section using the JS terrain pipeline."""

    grid = _base_overworld_grid(config, section, seed)
    _paint_ocean(config, grid, section, seed)
    _paint_regional_water(config, grid, section, seed)
    _paint_regional_terrain(config, grid, section, seed)
    _paint_local_features(config, grid, section, seed)
    _carve_overworld_trails(config, grid, section, seed)
    _cleanup_tiny_water(config, grid)
    _add_overworld_bridges(config, grid)
    apply_overworld_tile_rules(config, grid)

    entrance = _place_dungeon_entrance(config, grid, section, seed)
    spawn = _spawn_for_section(config, section, entrance)
    if section == (0, 0):
        _ensure_walkable(grid, spawn)
    if section == (0, 0) and entrance is not None:
        _ensure_entrance_path(config, grid, entrance, spawn)
    return GeneratedOverworld(grid=grid, spawn=spawn, entrance=entrance)


def apply_overworld_tile_rules(config: GameConfig, grid: list[list[Tile]]) -> None:
    _apply_shoreline_sand(config, grid)
    _apply_grass_tones(config, grid)
    _apply_water_tones(config, grid)


def _base_overworld_grid(config: GameConfig, section: tuple[int, int], seed: int) -> list[list[Tile]]:
    grid: list[list[Tile]] = []
    for y in range(config.dungeon_height):
        row: list[Tile] = []
        for x in range(config.dungeon_width):
            grass_noise = _overworld_field(seed, _world_x(config, section, x), _world_y(config, section, y), 9)
            if grass_noise < 0.22:
                row.append(tiles.dark_grass())
            elif grass_noise > 0.78:
                row.append(tiles.light_grass())
            else:
                row.append(tiles.grass())
        grid.append(row)
    return grid


def _paint_ocean(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> None:
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            world_x = _world_x(config, section, x)
            world_y = _world_y(config, section, y)
            east_coast = 92 + round(math.sin(world_y * 0.12) * 7) + round(math.sin(world_y * 0.035 + 2.3) * 11)
            south_coast = 72 + round(math.sin(world_x * 0.11 + 1.1) * 5) + round(math.sin(world_x * 0.045) * 9)
            inland_sea = ((world_x + 72) ** 2) / (24 * 24) + ((world_y + 44) ** 2) / (17 * 17)
            if world_x > east_coast or world_y > south_coast or inland_sea < 1:
                grid[y][x] = tiles.ocean()


def _paint_regional_water(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> None:
    basins = _regional_water_features_near_section(config, section, seed)
    rivers = _regional_river_features_near_section(config, section, seed)

    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            world_x = _world_x(config, section, x)
            world_y = _world_y(config, section, y)
            painted = False

            for feature in basins:
                if _basin_value_at(seed, feature, world_x, world_y) <= 1:
                    grid[y][x] = tiles.water()
                    painted = True
                    break
                width_noise = _overworld_field(seed, world_x, world_y, 731 + feature["region_x"] * 19)
                width = feature["river_width"] + width_noise * 1.15
                if _feature_river_distance(feature, world_x, world_y) <= width:
                    grid[y][x] = tiles.water()
                    painted = True
                    break

            if painted:
                continue

            for feature in rivers:
                width_noise = _overworld_field(seed, world_x, world_y, 790 + feature["region_x"] * 23 + feature["region_y"] * 29)
                width = feature["width"] + width_noise * 0.85
                if _river_path_distance(feature, world_x, world_y) <= width:
                    grid[y][x] = tiles.water()
                    break


def _paint_regional_terrain(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> None:
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            special = grid[y][x].special
            if special in {"water", "ocean", "bridge"}:
                continue

            world_x = _world_x(config, section, x)
            world_y = _world_y(config, section, y)
            forest = _overworld_field(seed, world_x, world_y, 41)
            ridge = _overworld_field(seed, world_x, world_y, 87)
            detail = _overworld_world_noise(seed, world_x, world_y, 113)

            if ridge > 0.8 and forest < 0.72 and detail > 0.28:
                grid[y][x] = tiles.rock()
            elif forest > 0.61 and detail > 0.16:
                grid[y][x] = tiles.tree()
            elif forest > 0.52 and detail > 0.52:
                grid[y][x] = tiles.dark_grass()
            elif forest < 0.28 or ridge > 0.67:
                grid[y][x] = tiles.light_grass()
            else:
                grid[y][x] = tiles.grass()


def _paint_local_features(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> None:
    if _overworld_random(seed, section, 71) > 0.55:
        lake_x = _overworld_range(seed, section, 72, 4, config.dungeon_width - 5)
        lake_y = _overworld_range(seed, section, 73, 3, config.dungeon_height - 4)
        _grow_patch(
            config,
            grid,
            section,
            seed,
            seeds=[Position(lake_x, lake_y), Position(lake_x + 1, lake_y), Position(lake_x, lake_y + 1), Position(lake_x - 1, lake_y)],
            tile_factory=tiles.water,
            target_size=_overworld_range(seed, section, 74, 18, 46),
            salt=76,
            avoid_water=False,
            spread_cutoff=0.05,
        )

    for index in range(_overworld_range(seed, section, 100, 1, 3)):
        seed_x = _overworld_range(seed, section, 101 + index * 10, 3, config.dungeon_width - 4)
        seed_y = _overworld_range(seed, section, 102 + index * 10, 2, config.dungeon_height - 3)
        _grow_patch(
            config,
            grid,
            section,
            seed,
            seeds=[
                Position(seed_x, seed_y),
                Position(
                    seed_x + _overworld_range(seed, section, 103 + index * 10, -1, 1),
                    seed_y + 1,
                ),
            ],
            tile_factory=tiles.tree,
            target_size=_overworld_range(seed, section, 104 + index * 10, 8, 20),
            salt=105 + index * 10,
            avoid_water=True,
            spread_cutoff=0.1,
        )

    for index in range(_overworld_range(seed, section, 160, 0, 2)):
        start_x = _overworld_range(seed, section, 161 + index * 10, 2, config.dungeon_width - 8)
        start_y = _overworld_range(seed, section, 162 + index * 10, 2, config.dungeon_height - 7)
        _grow_patch(
            config,
            grid,
            section,
            seed,
            seeds=[Position(start_x, start_y), Position(start_x + 1, start_y)],
            tile_factory=tiles.rock,
            target_size=_overworld_range(seed, section, 163 + index * 10, 3, 8),
            salt=165 + index * 10,
            avoid_water=True,
        )


def _grow_patch(
    config: GameConfig,
    grid: list[list[Tile]],
    section: tuple[int, int],
    seed: int,
    *,
    seeds: list[Position],
    tile_factory: object,
    target_size: int,
    salt: int,
    avoid_water: bool = True,
    spread_cutoff: float = 0.18,
) -> None:
    frontier = list(seeds)
    painted: set[tuple[int, int]] = set()
    attempts = 0

    while frontier and len(painted) < target_size and attempts < target_size * 12:
        attempts += 1
        index = int(_overworld_random(seed, section, salt + attempts) * len(frontier))
        current = frontier.pop(index)
        key = (current.x, current.y)

        if not config.in_bounds(current.x, current.y) or key in painted:
            continue
        if avoid_water and _is_water_like(grid, current.x, current.y):
            continue

        grid[current.y][current.x] = tile_factory()
        painted.add(key)

        for offset, (dx, dy) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
            nx = current.x + dx
            ny = current.y + dy
            if not config.in_bounds(nx, ny):
                continue
            spread = _overworld_noise(seed, section, nx, ny, salt + attempts + offset * 19)
            if spread > spread_cutoff:
                frontier.append(Position(nx, ny))


def _carve_overworld_trails(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> None:
    hub = Position(
        _overworld_range(seed, section, 211, 7, config.dungeon_width - 8),
        _overworld_range(seed, section, 212, 5, config.dungeon_height - 6),
    )
    west = _overworld_edge_point(config, seed, section, "west")
    east = _overworld_edge_point(config, seed, section, "east")
    north = _overworld_edge_point(config, seed, section, "north")
    south = _overworld_edge_point(config, seed, section, "south")

    _carve_organic_path(config, grid, section, seed, west, hub, 220)
    _carve_organic_path(config, grid, section, seed, hub, east, 240)
    if _overworld_random(seed, section, 260) > 0.25:
        _carve_organic_path(config, grid, section, seed, hub, north if _overworld_random(seed, section, 261) > 0.5 else south, 280)
    else:
        _carve_organic_path(config, grid, section, seed, north, hub, 300)
        _carve_organic_path(config, grid, section, seed, hub, south, 320)


def _carve_organic_path(
    config: GameConfig,
    grid: list[list[Tile]],
    section: tuple[int, int],
    seed: int,
    start: Position,
    end: Position,
    salt: int,
) -> None:
    x = start.x
    y = start.y
    steps = 0
    max_steps = config.dungeon_width * config.dungeon_height
    _carve_path_tile(config, grid, x, y)

    while (x, y) != (end.x, end.y) and steps < max_steps:
        steps += 1
        dx = _sign(end.x - x)
        dy = _sign(end.y - y)
        horizontal_bias = abs(end.x - x) >= abs(end.y - y)
        noise = _overworld_noise(seed, section, x, y, salt + steps * 17)

        if noise < 0.18:
            if horizontal_bias and y != end.y:
                y += dy
            elif not horizontal_bias and x != end.x:
                x += dx
            elif x != end.x:
                x += dx
            elif y != end.y:
                y += dy
        elif noise > 0.84:
            if horizontal_bias and 1 < y < config.dungeon_height - 2:
                y += 1 if _overworld_noise(seed, section, x, y, salt + steps * 29) > 0.5 else -1
            elif not horizontal_bias and 1 < x < config.dungeon_width - 2:
                x += 1 if _overworld_noise(seed, section, x, y, salt + steps * 31) > 0.5 else -1
            elif horizontal_bias and x != end.x:
                x += dx
            elif y != end.y:
                y += dy
        elif horizontal_bias and x != end.x:
            x += dx
        elif not horizontal_bias and y != end.y:
            y += dy
        elif x != end.x:
            x += dx
        elif y != end.y:
            y += dy

        x = max(0, min(x, config.dungeon_width - 1))
        y = max(0, min(y, config.dungeon_height - 1))
        _carve_path_tile(config, grid, x, y)


def _carve_path_tile(config: GameConfig, grid: list[list[Tile]], cx: int, cy: int) -> None:
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if abs(dx) + abs(dy) > 1:
                continue
            x = cx + dx
            y = cy + dy
            if not config.in_bounds(x, y):
                continue
            if grid[y][x].special not in {"water", "ocean"}:
                grid[y][x] = tiles.grass()


def _cleanup_tiny_water(config: GameConfig, grid: list[list[Tile]]) -> None:
    to_grass: list[Position] = []
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            if grid[y][x].special != "water":
                continue
            adjacent = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if _is_water_like(grid, x + dx, y + dy))
            if adjacent == 0:
                to_grass.append(Position(x, y))
    for position in to_grass:
        grid[position.y][position.x] = tiles.grass()


def _add_overworld_bridges(config: GameConfig, grid: list[list[Tile]]) -> None:
    _add_natural_bridge_candidates(config, grid)
    _prune_invalid_bridges(config, grid)
    _prune_wide_bridge_components(config, grid)
    _cleanup_tiny_water(config, grid)


def _add_natural_bridge_candidates(config: GameConfig, grid: list[list[Tile]]) -> bool:
    for y in range(2, config.dungeon_height - 2):
        run_start: int | None = None
        for x in range(1, config.dungeon_width - 1):
            if grid[y][x].special == "water":
                run_start = x if run_start is None else run_start
                continue
            if run_start is not None:
                run_end = x - 1
                run_length = run_end - run_start + 1
                if (
                    2 <= run_length <= 10
                    and not _has_bridge_near_horizontal_run(config, grid, run_start, run_end, y)
                    and _is_bridge_approach(grid, run_start - 1, y)
                    and _is_bridge_approach(grid, run_end + 1, y)
                    and _add_horizontal_bridge_across_run(config, grid, run_start, run_end, y)
                ):
                    return True
            run_start = None

    for x in range(2, config.dungeon_width - 2):
        run_start: int | None = None
        for y in range(1, config.dungeon_height - 1):
            if grid[y][x].special == "water":
                run_start = y if run_start is None else run_start
                continue
            if run_start is not None:
                run_end = y - 1
                run_length = run_end - run_start + 1
                if (
                    2 <= run_length <= 10
                    and not _has_bridge_near_vertical_run(config, grid, x, run_start, run_end)
                    and _is_bridge_approach(grid, x, run_start - 1)
                    and _is_bridge_approach(grid, x, run_end + 1)
                    and _add_vertical_bridge_across_run(config, grid, x, run_start, run_end)
                ):
                    return True
            run_start = None

    return False


def _water_run_length(grid: list[list[Tile]], x: int, y: int, dx: int, dy: int) -> int:
    length = 0
    current_x = x
    current_y = y
    while _is_water_like(grid, current_x, current_y):
        length += 1
        current_x += dx
        current_y += dy
    return length


def _water_body_touches_chunk_edge(config: GameConfig, grid: list[list[Tile]], seeds: list[Position]) -> bool:
    visited: set[tuple[int, int]] = set()
    stack = list(seeds)
    while stack:
        current = stack.pop()
        key = (current.x, current.y)
        if key in visited or not _is_water_like(grid, current.x, current.y):
            continue
        visited.add(key)
        if (
            current.x == 0
            or current.y == 0
            or current.x == config.dungeon_width - 1
            or current.y == config.dungeon_height - 1
        ):
            return True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            stack.append(Position(current.x + dx, current.y + dy))
    return False


def _horizontal_water_run_touches_chunk_edge(
    config: GameConfig,
    grid: list[list[Tile]],
    start_x: int,
    end_x: int,
    y: int,
) -> bool:
    return _water_body_touches_chunk_edge(config, grid, [Position(x, y) for x in range(start_x, end_x + 1)])


def _vertical_water_run_touches_chunk_edge(
    config: GameConfig,
    grid: list[list[Tile]],
    x: int,
    start_y: int,
    end_y: int,
) -> bool:
    return _water_body_touches_chunk_edge(config, grid, [Position(x, y) for y in range(start_y, end_y + 1)])


def _add_horizontal_bridge_across_run(
    config: GameConfig,
    grid: list[list[Tile]],
    start_x: int,
    end_x: int,
    y: int,
) -> bool:
    if end_x - start_x + 1 < 2:
        return False
    if start_x < 1 or end_x > config.dungeon_width - 2:
        return False
    if not _horizontal_water_run_touches_chunk_edge(config, grid, start_x, end_x, y):
        return False
    if not _is_bridge_approach(grid, start_x - 1, y) or not _is_bridge_approach(grid, end_x + 1, y):
        return False

    for x in range(start_x, end_x + 1):
        if grid[y][x].special != "water":
            return False
    for x in range(start_x, end_x + 1):
        if not _is_water_like(grid, x, y - 1) or not _is_water_like(grid, x, y + 1):
            return False

    span_length = end_x - start_x + 1
    center_x = (start_x + end_x) // 2
    vertical_depth = 1 + _water_run_length(grid, center_x, y - 1, 0, -1) + _water_run_length(grid, center_x, y + 1, 0, 1)
    if span_length > vertical_depth:
        return False

    for x in range(start_x, end_x + 1):
        grid[y - 1][x] = tiles.water()
        grid[y + 1][x] = tiles.water()
    for x in range(start_x, end_x + 1):
        grid[y][x] = tiles.bridge()
    return True


def _add_vertical_bridge_across_run(
    config: GameConfig,
    grid: list[list[Tile]],
    x: int,
    start_y: int,
    end_y: int,
) -> bool:
    if end_y - start_y + 1 < 2:
        return False
    if start_y < 1 or end_y > config.dungeon_height - 2:
        return False
    if not _vertical_water_run_touches_chunk_edge(config, grid, x, start_y, end_y):
        return False
    if not _is_bridge_approach(grid, x, start_y - 1) or not _is_bridge_approach(grid, x, end_y + 1):
        return False

    for y in range(start_y, end_y + 1):
        if grid[y][x].special != "water":
            return False
    for y in range(start_y, end_y + 1):
        if not _is_water_like(grid, x - 1, y) or not _is_water_like(grid, x + 1, y):
            return False

    span_length = end_y - start_y + 1
    center_y = (start_y + end_y) // 2
    horizontal_depth = 1 + _water_run_length(grid, x - 1, center_y, -1, 0) + _water_run_length(grid, x + 1, center_y, 1, 0)
    if span_length > horizontal_depth:
        return False

    for y in range(start_y, end_y + 1):
        grid[y][x - 1] = tiles.water()
        grid[y][x + 1] = tiles.water()
    for y in range(start_y, end_y + 1):
        grid[y][x] = tiles.bridge()
    return True


def _has_bridge_near_horizontal_run(
    config: GameConfig,
    grid: list[list[Tile]],
    start_x: int,
    end_x: int,
    y: int,
) -> bool:
    for yy in range(y - 1, y + 2):
        for x in range(start_x - 1, end_x + 2):
            if config.in_bounds(x, yy) and grid[yy][x].special == "bridge":
                return True
    return False


def _has_bridge_near_vertical_run(
    config: GameConfig,
    grid: list[list[Tile]],
    x: int,
    start_y: int,
    end_y: int,
) -> bool:
    for y in range(start_y - 1, end_y + 2):
        for xx in range(x - 1, x + 2):
            if config.in_bounds(xx, y) and grid[y][xx].special == "bridge":
                return True
    return False


def _bridge_tile_has_valid_span(config: GameConfig, grid: list[list[Tile]], x: int, y: int) -> bool:
    start_x = x
    end_x = x
    while config.in_bounds(start_x - 1, y) and grid[y][start_x - 1].special == "bridge":
        start_x -= 1
    while config.in_bounds(end_x + 1, y) and grid[y][end_x + 1].special == "bridge":
        end_x += 1

    if end_x > start_x and _is_bridge_approach(grid, start_x - 1, y) and _is_bridge_approach(grid, end_x + 1, y):
        if all(_is_water_like(grid, bx, y - 1) and _is_water_like(grid, bx, y + 1) for bx in range(start_x, end_x + 1)):
            return True

    start_y = y
    end_y = y
    while config.in_bounds(x, start_y - 1) and grid[start_y - 1][x].special == "bridge":
        start_y -= 1
    while config.in_bounds(x, end_y + 1) and grid[end_y + 1][x].special == "bridge":
        end_y += 1

    if end_y > start_y and _is_bridge_approach(grid, x, start_y - 1) and _is_bridge_approach(grid, x, end_y + 1):
        if all(_is_water_like(grid, x - 1, by) and _is_water_like(grid, x + 1, by) for by in range(start_y, end_y + 1)):
            return True

    return False


def _prune_invalid_bridges(config: GameConfig, grid: list[list[Tile]]) -> None:
    to_water: list[Position] = []
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            if grid[y][x].special == "bridge" and not _bridge_tile_has_valid_span(config, grid, x, y):
                to_water.append(Position(x, y))
    for position in to_water:
        grid[position.y][position.x] = tiles.water()


def _prune_wide_bridge_components(config: GameConfig, grid: list[list[Tile]]) -> None:
    visited: set[tuple[int, int]] = set()
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            key = (x, y)
            if key in visited or grid[y][x].special != "bridge":
                continue
            stack = [Position(x, y)]
            cells: list[Position] = []
            visited.add(key)
            while stack:
                current = stack.pop()
                cells.append(current)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx = current.x + dx
                    ny = current.y + dy
                    nkey = (nx, ny)
                    if not config.in_bounds(nx, ny) or nkey in visited:
                        continue
                    if grid[ny][nx].special != "bridge":
                        continue
                    visited.add(nkey)
                    stack.append(Position(nx, ny))

            xs = [cell.x for cell in cells]
            ys = [cell.y for cell in cells]
            width = max(xs) - min(xs) + 1
            height = max(ys) - min(ys) + 1
            if (width > 1 and height > 1) or (width == 1 and height == 1):
                for cell in cells:
                    grid[cell.y][cell.x] = tiles.water()


def _apply_shoreline_sand(config: GameConfig, grid: list[list[Tile]]) -> None:
    candidates: set[tuple[int, int]] = set()
    for y, row in enumerate(grid):
        for x, tile in enumerate(row):
            if not _can_become_sand(tile):
                continue
            water_borders = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if _is_water_like(grid, x + dx, y + dy))
            if water_borders:
                candidates.add((x, y))

    for x, y in candidates:
        neighbor_candidates = sum((x + dx, y + dy) in candidates for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        water_borders = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if _is_water_like(grid, x + dx, y + dy))
        if water_borders > 1 or neighbor_candidates > 1:
            grid[y][x] = tiles.sand()


def _apply_grass_tones(config: GameConfig, grid: list[list[Tile]]) -> None:
    forest_sources = [Position(x, y) for y, row in enumerate(grid) for x, tile in enumerate(row) if tile.special == "tree"]
    shore_sources = [
        Position(x, y)
        for y, row in enumerate(grid)
        for x, tile in enumerate(row)
        if tile.special in {"sand", "water", "ocean"}
    ]

    for y, row in enumerate(grid):
        for x, tile in enumerate(row):
            if not _is_grass_like(tile):
                continue
            forest_distance = _nearest_distance(x, y, forest_sources, 8)
            shore_distance = _nearest_distance(x, y, shore_sources, 8)
            if forest_distance <= 2 and shore_distance > 1:
                grid[y][x] = tiles.dark_grass()
            elif shore_distance <= 2 or forest_distance >= 5:
                grid[y][x] = tiles.light_grass()
            else:
                grid[y][x] = tiles.grass()


def _apply_water_tones(config: GameConfig, grid: list[list[Tile]]) -> None:
    land_sources = [
        Position(x, y)
        for y, row in enumerate(grid)
        for x, tile in enumerate(row)
        if tile.special not in {"water", "ocean", "bridge"}
    ]

    for y, row in enumerate(grid):
        for x, tile in enumerate(row):
            special = tile.special
            if special not in {"water", "ocean"}:
                continue
            shore_distance = _nearest_distance(x, y, land_sources, 6)
            if special == "ocean":
                if shore_distance <= 1:
                    grid[y][x] = tiles.shallow_ocean()
                elif shore_distance <= 3:
                    grid[y][x] = tiles.ocean()
                elif shore_distance <= 5:
                    grid[y][x] = tiles.mid_deep_ocean()
                else:
                    grid[y][x] = tiles.very_deep_ocean()
            elif shore_distance <= 1:
                grid[y][x] = tiles.shallow_water()
            elif shore_distance <= 3:
                grid[y][x] = tiles.water()
            elif shore_distance <= 5:
                grid[y][x] = tiles.mid_deep_water()
            else:
                grid[y][x] = tiles.very_deep_water()


def _place_dungeon_entrance(config: GameConfig, grid: list[list[Tile]], section: tuple[int, int], seed: int) -> Position | None:
    if not _section_has_dungeon(seed, section):
        return None
    if section == (0, 0):
        entrance = Position(config.dungeon_width // 2, 4)
    else:
        entrance = _find_overworld_dungeon_entrance(config, grid, section, seed)
    grid[entrance.y][entrance.x] = tiles.dungeon_entrance()
    return entrance


def _find_overworld_dungeon_entrance(
    config: GameConfig,
    grid: list[list[Tile]],
    section: tuple[int, int],
    seed: int,
) -> Position:
    preferred = Position(
        _overworld_range(seed, section, 906, 3, config.dungeon_width - 4),
        _overworld_range(seed, section, 907, 3, config.dungeon_height - 4),
    )
    best: Position | None = None
    best_distance = 10**9
    for y in range(1, config.dungeon_height - 1):
        for x in range(1, config.dungeon_width - 1):
            tile = grid[y][x]
            if not tile.walkable or tile.special == "bridge":
                continue
            distance = abs(x - preferred.x) + abs(y - preferred.y)
            if distance < best_distance:
                best = Position(x, y)
                best_distance = distance
    return best or Position(config.dungeon_width // 2, config.dungeon_height // 2)


def _spawn_for_section(config: GameConfig, section: tuple[int, int], entrance: Position | None) -> Position:
    if section == (0, 0) and entrance is not None:
        return Position(entrance.x, config.dungeon_height - 4)
    return Position(config.dungeon_width // 2, config.dungeon_height // 2)


def _ensure_entrance_path(config: GameConfig, grid: list[list[Tile]], entrance: Position, spawn: Position) -> None:
    if entrance.x == spawn.x:
        for y in range(min(entrance.y, spawn.y), max(entrance.y, spawn.y) + 1):
            if grid[y][entrance.x].special != "dungeonEntrance":
                grid[y][entrance.x] = tiles.grass()
    _ensure_walkable(grid, spawn)
    _clear_cardinal_neighbors(grid, entrance)
    grid[entrance.y][entrance.x] = tiles.dungeon_entrance()


def _ensure_walkable(grid: list[list[Tile]], position: Position) -> None:
    if not grid[position.y][position.x].walkable:
        grid[position.y][position.x] = tiles.grass()


def _clear_cardinal_neighbors(grid: list[list[Tile]], position: Position) -> None:
    height = len(grid)
    width = len(grid[0]) if height else 0
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        x = position.x + dx
        y = position.y + dy
        if 0 <= x < width and 0 <= y < height and grid[y][x].special != "dungeonEntrance":
            grid[y][x] = tiles.grass()


def _clear_spawn_area(config: GameConfig, grid: list[list[Tile]], spawn: Position) -> None:
    for dy in range(-1, 2):
        for dx in range(-3, 4):
            x = spawn.x + dx
            y = spawn.y + dy
            if config.in_bounds(x, y) and grid[y][x].special != "dungeonEntrance":
                grid[y][x] = tiles.grass()


def _section_has_dungeon(seed: int, section: tuple[int, int]) -> bool:
    return section == (0, 0) or _overworld_range(seed, section, 905, 0, 8) == 0


def _world_x(config: GameConfig, section: tuple[int, int], x: int) -> int:
    return section[0] * config.dungeon_width + x


def _world_y(config: GameConfig, section: tuple[int, int], y: int) -> int:
    return section[1] * config.dungeon_height + y


def _fract(value: float) -> float:
    return value - math.floor(value)


def _overworld_noise(seed: int, section: tuple[int, int], x: int, y: int, salt: int) -> float:
    return _fract(math.sin(seed + section[0] * 92821 + section[1] * 68917 + x * 197 + y * 389 + salt) * 10000)


def _overworld_random(seed: int, section: tuple[int, int], salt: int) -> float:
    return _overworld_noise(seed, section, 0, 0, salt)


def _overworld_range(seed: int, section: tuple[int, int], salt: int, min_value: int, max_value: int) -> int:
    return math.floor(_overworld_random(seed, section, salt) * (max_value - min_value + 1)) + min_value


def _overworld_world_noise(seed: int, world_x: int, world_y: int, salt: int) -> float:
    return _fract(math.sin(seed + world_x * 197 + world_y * 389 + salt) * 10000)


def _overworld_field(seed: int, world_x: int, world_y: int, salt: int) -> float:
    scaled_seed = seed * 0.00001
    value = (
        math.sin(scaled_seed + salt * 1.73 + world_x * 0.071 + world_y * 0.043)
        + math.sin(scaled_seed * 1.7 + salt * 2.31 - world_x * 0.046 + world_y * 0.083) * 0.62
        + math.sin(scaled_seed * 2.3 + salt * 3.19 + world_x * 0.137 - world_y * 0.108) * 0.34
    )
    return max(0, min(1, (value / 1.96 + 1) / 2))


def _seeded_unit(seed: int, a: int, b: int, salt: int) -> float:
    return _fract(math.sin(seed + a * 127.1 + b * 311.7 + salt * 74.7) * 10000)


def _seeded_range(seed: int, a: int, b: int, salt: int, min_value: float, max_value: float) -> float:
    return min_value + _seeded_unit(seed, a, b, salt) * (max_value - min_value)


def _water_cell_size(config: GameConfig) -> tuple[int, int]:
    return (config.dungeon_width * 8, config.dungeon_height * 8)


def _river_cell_size(config: GameConfig) -> tuple[int, int]:
    return (config.dungeon_width * 4, config.dungeon_height * 4)


def _regional_water_features_near_section(config: GameConfig, section: tuple[int, int], seed: int) -> list[dict[str, object]]:
    width, height = _water_cell_size(config)
    center_x = _world_x(config, section, config.dungeon_width // 2)
    center_y = _world_y(config, section, config.dungeon_height // 2)
    base_x = math.floor(center_x / width)
    base_y = math.floor(center_y / height)
    features: list[dict[str, object]] = []
    for region_y in range(base_y - 2, base_y + 3):
        for region_x in range(base_x - 2, base_x + 3):
            feature = _make_regional_water_feature(config, seed, region_x, region_y)
            if feature is not None:
                features.append(feature)
    return features


def _make_regional_water_feature(config: GameConfig, seed: int, region_x: int, region_y: int) -> dict[str, object] | None:
    if _seeded_unit(seed, region_x, region_y, 700) < 0.38:
        return None
    width, height = _water_cell_size(config)
    cx = region_x * width + _seeded_range(seed, region_x, region_y, 701, width * 0.16, width * 0.84)
    cy = region_y * height + _seeded_range(seed, region_x, region_y, 702, height * 0.16, height * 0.84)
    huge = _seeded_unit(seed, region_x, region_y, 703) > 0.74
    radius_x = _seeded_range(seed, region_x, region_y, 704, width * (0.34 if huge else 0.16), width * (0.68 if huge else 0.34))
    radius_y = _seeded_range(seed, region_x, region_y, 705, height * (0.34 if huge else 0.16), height * (0.72 if huge else 0.38))
    angle = _seeded_range(seed, region_x, region_y, 706, 0, math.pi)
    source_angle = _seeded_range(seed, region_x, region_y, 707, 0, math.pi * 2)
    source_distance = _seeded_range(seed, region_x, region_y, 708, width * 0.56, width * 1.05)
    source = {
        "x": cx + math.cos(source_angle) * source_distance,
        "y": cy + math.sin(source_angle) * source_distance * 0.72,
    }
    mouth_angle = source_angle + math.pi + _seeded_range(seed, region_x, region_y, 709, -0.55, 0.55)
    mouth = {
        "x": cx + math.cos(mouth_angle) * radius_x * 0.85,
        "y": cy + math.sin(mouth_angle) * radius_y * 0.85,
    }
    bend = _seeded_range(seed, region_x, region_y, 710, -0.48, 0.48)
    mid = {
        "x": (source["x"] + mouth["x"]) / 2 + math.cos(source_angle + math.pi / 2) * width * bend,
        "y": (source["y"] + mouth["y"]) / 2 + math.sin(source_angle + math.pi / 2) * height * bend,
    }
    return {
        "region_x": region_x,
        "region_y": region_y,
        "cx": cx,
        "cy": cy,
        "radius_x": radius_x,
        "radius_y": radius_y,
        "angle": angle,
        "source": source,
        "mouth": mouth,
        "mid": mid,
        "river_width": 2.2 if huge else 1.7,
    }


def _regional_river_features_near_section(config: GameConfig, section: tuple[int, int], seed: int) -> list[dict[str, object]]:
    width, height = _river_cell_size(config)
    center_x = _world_x(config, section, config.dungeon_width // 2)
    center_y = _world_y(config, section, config.dungeon_height // 2)
    base_x = math.floor(center_x / width)
    base_y = math.floor(center_y / height)
    return [
        _make_regional_river_feature(config, seed, region_x, region_y)
        for region_y in range(base_y - 1, base_y + 2)
        for region_x in range(base_x - 1, base_x + 2)
    ]


def _make_regional_river_feature(config: GameConfig, seed: int, region_x: int, region_y: int) -> dict[str, object]:
    width, height = _river_cell_size(config)
    start_edge = math.floor(_seeded_unit(seed, region_x, region_y, 741) * 4)
    end_edge = math.floor(_seeded_unit(seed, region_x, region_y, 742) * 4)
    if end_edge == start_edge:
        end_edge = (start_edge + 2) % 4
    if abs(end_edge - start_edge) == 2 and _seeded_unit(seed, region_x, region_y, 743) < 0.42:
        end_edge = (start_edge + (1 if _seeded_unit(seed, region_x, region_y, 744) < 0.5 else 3)) % 4

    start = _river_edge_point(config, seed, region_x, region_y, start_edge, 745)
    end = _river_edge_point(config, seed, region_x, region_y, end_edge, 746)
    points = [start]
    bend_side = -1 if _seeded_unit(seed, region_x, region_y, 747) < 0.5 else 1
    dx = end["x"] - start["x"]
    dy = end["y"] - start["y"]
    length = max(1, math.sqrt(dx * dx + dy * dy))
    nx = -dy / length
    ny = dx / length

    for index in range(1, 5):
        t = index / 5
        wave = math.sin(t * math.pi) * _seeded_range(seed, region_x, region_y, 750 + index, width * 0.1, width * 0.34)
        points.append(
            {
                "x": start["x"] + dx * t + nx * wave * bend_side + _seeded_range(seed, region_x, region_y, 760 + index, -width * 0.08, width * 0.08),
                "y": start["y"] + dy * t + ny * wave * bend_side + _seeded_range(seed, region_x, region_y, 770 + index, -height * 0.12, height * 0.12),
            }
        )
    points.append(end)
    return {
        "region_x": region_x,
        "region_y": region_y,
        "points": points,
        "width": _seeded_range(seed, region_x, region_y, 780, 1.2, 2.5),
    }


def _river_edge_point(config: GameConfig, seed: int, region_x: int, region_y: int, edge: int, salt: int) -> dict[str, float]:
    width, height = _river_cell_size(config)
    left = region_x * width
    top = region_y * height
    pad_x = width * 0.12
    pad_y = height * 0.12
    if edge == 0:
        return {"x": left + _seeded_range(seed, region_x, region_y, salt, pad_x, width - pad_x), "y": top - height * 0.18}
    if edge == 1:
        return {"x": left + width * 1.18, "y": top + _seeded_range(seed, region_x, region_y, salt, pad_y, height - pad_y)}
    if edge == 2:
        return {"x": left + _seeded_range(seed, region_x, region_y, salt, pad_x, width - pad_x), "y": top + height * 1.18}
    return {"x": left - width * 0.18, "y": top + _seeded_range(seed, region_x, region_y, salt, pad_y, height - pad_y)}


def _basin_value_at(seed: int, feature: dict[str, object], world_x: int, world_y: int) -> float:
    dx = world_x - float(feature["cx"])
    dy = world_y - float(feature["cy"])
    cos_value = math.cos(float(feature["angle"]))
    sin_value = math.sin(float(feature["angle"]))
    rx = dx * cos_value + dy * sin_value
    ry = -dx * sin_value + dy * cos_value
    warp = (
        (_overworld_field(seed, world_x, world_y, 721 + int(feature["region_x"]) * 13 + int(feature["region_y"]) * 17) - 0.5) * 0.28
        + (_overworld_world_noise(seed, math.floor(world_x / 3), math.floor(world_y / 3), 722) - 0.5) * 0.14
    )
    return (rx * rx) / (float(feature["radius_x"]) ** 2) + (ry * ry) / (float(feature["radius_y"]) ** 2) - warp


def _distance_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx = bx - ax
    dy = by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    cx = ax + t * dx
    cy = ay + t * dy
    return math.sqrt((px - cx) ** 2 + (py - cy) ** 2)


def _feature_river_distance(feature: dict[str, object], world_x: int, world_y: int) -> float:
    source = feature["source"]
    mid = feature["mid"]
    mouth = feature["mouth"]
    assert isinstance(source, dict) and isinstance(mid, dict) and isinstance(mouth, dict)
    return min(
        _distance_to_segment(world_x, world_y, float(source["x"]), float(source["y"]), float(mid["x"]), float(mid["y"])),
        _distance_to_segment(world_x, world_y, float(mid["x"]), float(mid["y"]), float(mouth["x"]), float(mouth["y"])),
    )


def _river_path_distance(feature: dict[str, object], world_x: int, world_y: int) -> float:
    points = feature["points"]
    assert isinstance(points, list)
    best = math.inf
    for index in range(len(points) - 1):
        a = points[index]
        b = points[index + 1]
        best = min(best, _distance_to_segment(world_x, world_y, a["x"], a["y"], b["x"], b["y"]))
    return best


def _overworld_boundary_value(seed: int, value: int, salt: int, min_value: int, max_value: int) -> int:
    normalized = _fract(math.sin(seed + value * 7411 + salt * 1999) * 10000)
    return math.floor(normalized * (max_value - min_value + 1)) + min_value


def _overworld_edge_point(config: GameConfig, seed: int, section: tuple[int, int], side: str) -> Position:
    if side == "west":
        return Position(0, _overworld_boundary_value(seed, section[0], 301, 3, config.dungeon_height - 4))
    if side == "east":
        return Position(config.dungeon_width - 1, _overworld_boundary_value(seed, section[0] + 1, 301, 3, config.dungeon_height - 4))
    if side == "north":
        return Position(_overworld_boundary_value(seed, section[1], 503, 4, config.dungeon_width - 5), 0)
    if side == "south":
        return Position(_overworld_boundary_value(seed, section[1] + 1, 503, 4, config.dungeon_width - 5), config.dungeon_height - 1)
    return Position(config.dungeon_width // 2, config.dungeon_height // 2)


def _is_water_like(grid: list[list[Tile]], x: int, y: int) -> bool:
    return 0 <= y < len(grid) and 0 <= x < len(grid[y]) and grid[y][x].special in {"water", "ocean"}


def _is_bridge_approach(grid: list[list[Tile]], x: int, y: int) -> bool:
    if not (0 <= y < len(grid) and 0 <= x < len(grid[y])):
        return False
    tile = grid[y][x]
    return tile.walkable and tile.special not in {"water", "ocean", "bridge", "dungeonEntrance"}


def _can_become_sand(tile: Tile) -> bool:
    return tile.walkable and tile.special in {None, "grass"}


def _is_grass_like(tile: Tile) -> bool:
    return tile.walkable and tile.special in {None, "grass"}


def _nearest_distance(x: int, y: int, sources: list[Position], max_distance: int) -> int:
    nearest = max_distance + 1
    for source in sources:
        nearest = min(nearest, abs(x - source.x) + abs(y - source.y))
        if nearest == 1:
            break
    return nearest


def _sign(value: int) -> int:
    if value < 0:
        return -1
    if value > 0:
        return 1
    return 0


def _choose_dungeon_algorithm(rng: Rng, floor_depth: int) -> str:
    depth = max(1, abs(floor_depth))
    if depth <= 3:
        return "rooms" if rng.chance(0.8) else "maze"
    if depth <= 6:
        return rng.choice(("rooms", "caves", "maze"))
    if depth <= 10:
        return rng.choice(("caves", "maze", "hybrid"))
    return "hybrid" if rng.chance(0.6) else "caves"


def _generate_dungeon_layout(
    config: GameConfig,
    rng: Rng,
    grid: list[list[Tile]],
    algorithm: str,
    floor_depth: int,
) -> list[_DungeonRoom]:
    if algorithm == "caves":
        _generate_cellular_caves(config, rng, grid)
        rooms = _identify_cave_rooms(config, grid)
        _connect_all_rooms(config, rng, grid, rooms)
        return rooms

    if algorithm == "maze":
        rooms = _generate_maze_rooms(config, rng, grid)
        _generate_maze_corridors(config, rng, grid)
        _connect_rooms_to_maze(config, rng, grid, rooms)
        return rooms

    if algorithm == "hybrid":
        rooms = _generate_rooms_with_variety(config, rng, grid, target_scale=0.6)
        _generate_cellular_caves(config, rng, grid)
        rooms.extend(_identify_cave_rooms(config, grid)[:3])
        if rng.chance(0.5):
            _generate_maze_corridors(config, rng, grid)
        _connect_all_rooms(config, rng, grid, rooms)
        _add_special_features(config, rng, grid, rooms, floor_depth)
        return rooms

    rooms = _generate_rooms_with_variety(config, rng, grid)
    _connect_all_rooms(config, rng, grid, rooms)
    return rooms


def _generate_rooms_with_variety(
    config: GameConfig,
    rng: Rng,
    grid: list[list[Tile]],
    *,
    target_scale: float = 1.0,
) -> list[_DungeonRoom]:
    max_rooms = max(2, int(rng.randint(6, 12) * target_scale))
    rooms: list[_DungeonRoom] = []

    for _ in range(150):
        if len(rooms) >= max_rooms:
            break
        room = _generate_special_room(config, rng) if len(rooms) > 2 and rng.chance(0.2) else _generate_normal_room(config, rng)
        if room is None or any(_rooms_intersect(room.tuple(), existing.tuple(), buffer=1) for existing in rooms):
            continue
        rooms.append(room)
        _carve_room(grid, room)

    if len(rooms) < 2:
        return _create_fallback_rooms(config, grid)
    return rooms


def _generate_normal_room(config: GameConfig, rng: Rng) -> _DungeonRoom | None:
    max_width = min(12, config.dungeon_width - 4)
    max_height = min(12, config.dungeon_height - 4)
    if max_width < 4 or max_height < 4:
        return None
    width = rng.randint(4, max_width)
    height = rng.randint(4, max_height)
    x = rng.randint(1, config.dungeon_width - width - 2)
    y = rng.randint(1, config.dungeon_height - height - 2)
    room_type = "special" if rng.chance(0.1) else "normal"
    return _DungeonRoom(x, y, width, height, room_type)


def _generate_special_room(config: GameConfig, rng: Rng) -> _DungeonRoom | None:
    shape = rng.choice(("L", "T", "plus", "circle"))
    if shape == "L":
        base_width = rng.randint(6, min(10, config.dungeon_width - 8))
        base_height = rng.randint(6, min(10, config.dungeon_height - 7))
        x = rng.randint(2, config.dungeon_width - base_width - 3)
        y = rng.randint(2, config.dungeon_height - base_height - 3)
        return _DungeonRoom(
            x,
            y,
            base_width,
            base_height,
            "L-shaped",
            [{"type": "arm", "x": x + base_width - 3, "y": y, "w": 3, "h": 3}],
        )
    if shape == "T":
        base_width = rng.randint(8, min(12, config.dungeon_width - 5))
        base_height = rng.randint(4, min(6, config.dungeon_height - 8))
        stem_height = rng.randint(3, min(5, config.dungeon_height - base_height - 4))
        stem_width = rng.randint(3, min(5, base_width))
        x = rng.randint(2, config.dungeon_width - base_width - 3)
        y = rng.randint(2, config.dungeon_height - base_height - stem_height - 3)
        stem_x = x + (base_width - stem_width) // 2
        return _DungeonRoom(x, y, base_width, base_height, "T-shaped", [{"type": "stem", "x": stem_x, "y": y + base_height, "w": stem_width, "h": stem_height}])
    if shape == "plus":
        center_width = rng.randint(4, min(6, config.dungeon_width - 10))
        center_height = rng.randint(4, min(6, config.dungeon_height - 10))
        arm = rng.randint(2, 3)
        x = rng.randint(arm + 1, config.dungeon_width - center_width - arm - 2)
        y = rng.randint(arm + 1, config.dungeon_height - center_height - arm - 2)
        return _DungeonRoom(
            x,
            y,
            center_width,
            center_height,
            "plus",
            [
                {"type": "arm", "x": x - arm, "y": y + 1, "w": arm, "h": center_height - 2},
                {"type": "arm", "x": x + center_width, "y": y + 1, "w": arm, "h": center_height - 2},
                {"type": "arm", "x": x + 1, "y": y - arm, "w": center_width - 2, "h": arm},
                {"type": "arm", "x": x + 1, "y": y + center_height, "w": center_width - 2, "h": arm},
            ],
        )
    radius = rng.randint(3, min(5, (config.dungeon_width - 4) // 2, (config.dungeon_height - 4) // 2))
    center_x = rng.randint(radius + 1, config.dungeon_width - radius - 2)
    center_y = rng.randint(radius + 1, config.dungeon_height - radius - 2)
    diameter = radius * 2 + 1
    return _DungeonRoom(center_x - radius, center_y - radius, diameter, diameter, "circular", [{"type": "circle", "centerX": center_x, "centerY": center_y, "radius": radius}])


def _create_fallback_rooms(config: GameConfig, grid: list[list[Tile]]) -> list[_DungeonRoom]:
    top_height = max(3, config.dungeon_height // 3)
    bottom_height = max(3, config.dungeon_height // 3)
    room_width = max(5, config.dungeon_width // 3)
    rooms = [
        _DungeonRoom(2, 2, room_width, top_height, "fallback"),
        _DungeonRoom(config.dungeon_width - room_width - 2, config.dungeon_height - bottom_height - 2, room_width, bottom_height, "fallback"),
    ]
    for room in rooms:
        _carve_room(grid, room)
    _connect_all_rooms(config, Rng(0), grid, rooms)
    return rooms


def _rooms_intersect(
    room: tuple[int, int, int, int],
    other: tuple[int, int, int, int],
    *,
    buffer: int = 0,
) -> bool:
    x, y, width, height = room
    ox, oy, owidth, oheight = other
    return not (
        x + width + buffer <= ox
        or ox + owidth + buffer <= x
        or y + height + buffer <= oy
        or oy + oheight + buffer <= y
    )


def _carve_room(grid: list[list[Tile]], room: _DungeonRoom) -> None:
    for tile_y in range(room.y, room.y + room.height):
        for tile_x in range(room.x, room.x + room.width):
            if _grid_in_bounds(grid, tile_x, tile_y):
                grid[tile_y][tile_x] = tiles.special_floor((70, 70, 100)) if room.room_type == "special" else tiles.floor()
    for feature in room.features:
        _carve_room_feature(grid, feature)
    _add_room_decorations(grid, room)


def _carve_room_feature(grid: list[list[Tile]], feature: dict[str, int | str]) -> None:
    feature_type = feature["type"]
    if feature_type in {"arm", "stem"}:
        for y in range(int(feature["y"]), int(feature["y"]) + int(feature["h"])):
            for x in range(int(feature["x"]), int(feature["x"]) + int(feature["w"])):
                if _grid_in_bounds(grid, x, y):
                    grid[y][x] = tiles.floor()
    elif feature_type == "circle":
        center_x = int(feature["centerX"])
        center_y = int(feature["centerY"])
        radius = int(feature["radius"])
        for y in range(center_y - radius, center_y + radius + 1):
            for x in range(center_x - radius, center_x + radius + 1):
                if _grid_in_bounds(grid, x, y) and (x - center_x) ** 2 + (y - center_y) ** 2 <= radius * radius:
                    grid[y][x] = tiles.floor()


def _add_room_decorations(grid: list[list[Tile]], room: _DungeonRoom) -> None:
    center = room.center()
    if room.room_type == "circular" and _grid_in_bounds(grid, center.x, center.y):
        grid[center.y][center.x] = tiles.shallow_water()


def _connect_rooms(grid: list[list[Tile]], start: Position, end: Position, rng: Rng) -> None:
    if rng.chance(0.3):
        for x, y in _bresenham_line(start.x, start.y, end.x, end.y):
            if _grid_in_bounds(grid, x, y):
                grid[y][x] = tiles.floor()
    elif rng.chance(0.5):
        _carve_horizontal_corridor(grid, start.x, end.x, start.y)
        _carve_vertical_corridor(grid, start.y, end.y, end.x)
    else:
        _carve_vertical_corridor(grid, start.y, end.y, start.x)
        _carve_horizontal_corridor(grid, start.x, end.x, end.y)


def _carve_horizontal_corridor(grid: list[list[Tile]], x1: int, x2: int, y: int) -> None:
    for x in range(min(x1, x2), max(x1, x2) + 1):
        grid[y][x] = tiles.floor()


def _carve_vertical_corridor(grid: list[list[Tile]], y1: int, y2: int, x: int) -> None:
    for y in range(min(y1, y2), max(y1, y2) + 1):
        grid[y][x] = tiles.floor()


def _room_center(room: tuple[int, int, int, int]) -> Position:
    x, y, width, height = room
    return Position(x=x + width // 2, y=y + height // 2)


def _connect_all_rooms(config: GameConfig, rng: Rng, grid: list[list[Tile]], rooms: list[_DungeonRoom]) -> None:
    if len(rooms) < 2:
        return
    connected = {0}
    while len(connected) < len(rooms):
        best: tuple[int, int] | None = None
        best_distance = 10**9
        for connected_index in connected:
            for index, room in enumerate(rooms):
                if index in connected:
                    continue
                distance = _room_distance(rooms[connected_index], room)
                if distance < best_distance:
                    best = (connected_index, index)
                    best_distance = distance
        if best is None:
            break
        _connect_rooms(grid, rooms[best[0]].center(), rooms[best[1]].center(), rng)
        connected.add(best[1])
    for _ in range(len(rooms) // 3):
        first = rng.choice(rooms)
        second = rng.choice(rooms)
        if first is not second and rng.chance(0.5):
            _connect_rooms(grid, first.center(), second.center(), rng)


def _room_distance(first: _DungeonRoom, second: _DungeonRoom) -> int:
    first_center = first.center()
    second_center = second.center()
    return abs(first_center.x - second_center.x) + abs(first_center.y - second_center.y)


def _generate_cellular_caves(config: GameConfig, rng: Rng, grid: list[list[Tile]]) -> None:
    for y in range(1, config.dungeon_height - 1):
        for x in range(1, config.dungeon_width - 1):
            if rng.chance(0.45):
                grid[y][x] = tiles.floor()
    for _ in range(5):
        next_grid = [[tiles.wall() for _ in range(config.dungeon_width)] for _ in range(config.dungeon_height)]
        for y in range(config.dungeon_height):
            for x in range(config.dungeon_width):
                wall_count = _neighboring_wall_count(config, grid, x, y)
                if x == 0 or y == 0 or x == config.dungeon_width - 1 or y == config.dungeon_height - 1:
                    next_grid[y][x] = tiles.wall()
                elif wall_count >= 5:
                    next_grid[y][x] = tiles.wall()
                elif wall_count <= 3:
                    next_grid[y][x] = tiles.floor()
                else:
                    next_grid[y][x] = grid[y][x]
        for y in range(config.dungeon_height):
            grid[y][:] = next_grid[y]


def _neighboring_wall_count(config: GameConfig, grid: list[list[Tile]], x: int, y: int) -> int:
    count = 0
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            nx = x + dx
            ny = y + dy
            if not config.in_bounds(nx, ny) or not grid[ny][nx].walkable:
                count += 1
    return count


def _identify_cave_rooms(config: GameConfig, grid: list[list[Tile]]) -> list[_DungeonRoom]:
    visited: set[tuple[int, int]] = set()
    rooms: list[_DungeonRoom] = []
    for y in range(1, config.dungeon_height - 1):
        for x in range(1, config.dungeon_width - 1):
            if (x, y) in visited or not grid[y][x].walkable:
                continue
            cells = _walkable_component(config, grid, Position(x, y), visited)
            if len(cells) < 16:
                continue
            xs = [cell[0] for cell in cells]
            ys = [cell[1] for cell in cells]
            rooms.append(_DungeonRoom(min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, "cave"))
    return rooms


def _walkable_component(config: GameConfig, grid: list[list[Tile]], start: Position, visited: set[tuple[int, int]]) -> list[tuple[int, int]]:
    stack = [(start.x, start.y)]
    cells: list[tuple[int, int]] = []
    while stack:
        x, y = stack.pop()
        if (x, y) in visited or not config.in_bounds(x, y) or not grid[y][x].walkable:
            continue
        visited.add((x, y))
        cells.append((x, y))
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return cells


def _generate_maze_rooms(config: GameConfig, rng: Rng, grid: list[list[Tile]]) -> list[_DungeonRoom]:
    rooms: list[_DungeonRoom] = []
    for _ in range(rng.randint(4, 8)):
        for _attempt in range(50):
            width = rng.randint(4, min(8, config.dungeon_width - 5))
            height = rng.randint(4, min(8, config.dungeon_height - 5))
            x = rng.randint(2, config.dungeon_width - width - 3)
            y = rng.randint(2, config.dungeon_height - height - 3)
            room = _DungeonRoom(x, y, width, height, "maze-room")
            if any(_rooms_intersect(room.tuple(), existing.tuple(), buffer=4) for existing in rooms):
                continue
            rooms.append(room)
            _carve_room(grid, room)
            break
    return rooms or _create_fallback_rooms(config, grid)


def _generate_maze_corridors(config: GameConfig, rng: Rng, grid: list[list[Tile]]) -> None:
    for y in range(3, config.dungeon_height - 3, 4):
        for x in range(1, config.dungeon_width - 1):
            if rng.chance(0.7):
                grid[y][x] = tiles.floor()
    for x in range(3, config.dungeon_width - 3, 4):
        for y in range(1, config.dungeon_height - 1):
            if rng.chance(0.7):
                grid[y][x] = tiles.floor()


def _connect_rooms_to_maze(config: GameConfig, rng: Rng, grid: list[list[Tile]], rooms: list[_DungeonRoom]) -> None:
    for room in rooms:
        center = room.center()
        nearest: Position | None = None
        best_distance = 10**9
        for y in range(1, config.dungeon_height - 1):
            for x in range(1, config.dungeon_width - 1):
                if not grid[y][x].walkable or _position_in_any_room(x, y, rooms):
                    continue
                distance = abs(center.x - x) + abs(center.y - y)
                if distance < best_distance:
                    nearest = Position(x, y)
                    best_distance = distance
        if nearest is not None:
            _connect_rooms(grid, center, nearest, rng)


def _position_in_any_room(x: int, y: int, rooms: list[_DungeonRoom]) -> bool:
    return any(room.x <= x < room.x + room.width and room.y <= y < room.y + room.height for room in rooms)


def _validate_dungeon_connectivity(config: GameConfig, grid: list[list[Tile]], rooms: list[_DungeonRoom], rng: Rng) -> None:
    start = rooms[0].center()
    if not config.in_bounds(start.x, start.y):
        return
    if not grid[start.y][start.x].walkable:
        grid[start.y][start.x] = tiles.floor()
    reachable = _reachable_coordinates(config, grid, start)
    for y in range(1, config.dungeon_height - 1):
        for x in range(1, config.dungeon_width - 1):
            if grid[y][x].walkable and (x, y) not in reachable:
                nearest = _nearest_reachable(x, y, reachable)
                if nearest is not None:
                    _connect_rooms(grid, Position(x, y), Position(nearest[0], nearest[1]), rng)
                    reachable = _reachable_coordinates(config, grid, start)


def _reachable_coordinates(config: GameConfig, grid: list[list[Tile]], start: Position) -> set[tuple[int, int]]:
    queue: deque[tuple[int, int]] = deque([(start.x, start.y)])
    seen = {(start.x, start.y)}
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not config.in_bounds(nx, ny) or (nx, ny) in seen or not grid[ny][nx].walkable:
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return seen


def _nearest_reachable(x: int, y: int, reachable: set[tuple[int, int]]) -> tuple[int, int] | None:
    best: tuple[int, int] | None = None
    best_distance = 10**9
    for rx, ry in reachable:
        distance = abs(x - rx) + abs(y - ry)
        if distance < best_distance:
            best = (rx, ry)
            best_distance = distance
    return best


def _farthest_walkable_position(config: GameConfig, grid: list[list[Tile]], start: Position) -> Position | None:
    queue: deque[tuple[int, int]] = deque([(start.x, start.y)])
    distances = {(start.x, start.y): 0}
    best = start
    while queue:
        x, y = queue.popleft()
        if distances[(x, y)] > distances[(best.x, best.y)]:
            best = Position(x, y)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not config.in_bounds(nx, ny) or (nx, ny) in distances or not grid[ny][nx].walkable:
                continue
            distances[(nx, ny)] = distances[(x, y)] + 1
            queue.append((nx, ny))
    return best if best != start else None


def _add_environmental_hazards(config: GameConfig, rng: Rng, grid: list[list[Tile]], floor_depth: int) -> None:
    if floor_depth >= 5 and rng.chance(0.3):
        _replace_random_walkable_tiles(config, rng, grid, tiles.shallow_water, rng.randint(1, 3))
    if floor_depth >= 8 and rng.chance(0.2):
        _replace_random_walkable_tiles(config, rng, grid, tiles.lava, rng.randint(1, 2))


def _replace_random_walkable_tiles(config: GameConfig, rng: Rng, grid: list[list[Tile]], tile_factory: object, count: int) -> None:
    candidates = [
        (x, y)
        for y in range(2, config.dungeon_height - 2)
        for x in range(2, config.dungeon_width - 2)
        if grid[y][x].walkable and grid[y][x].special not in {"downStairs", "dungeonExit"}
    ]
    for _ in range(min(count, len(candidates))):
        x, y = rng.choice(candidates)
        candidates.remove((x, y))
        grid[y][x] = tile_factory()


def _add_special_features(config: GameConfig, rng: Rng, grid: list[list[Tile]], rooms: list[_DungeonRoom], floor_depth: int) -> None:
    for room in rooms:
        if not rng.chance(0.15):
            continue
        special_types = ["treasure", "danger", "shrine"]
        if floor_depth >= 5:
            special_types.append("lava_chamber")
        if floor_depth >= 8:
            special_types.append("ice_chamber")
        special_type = rng.choice(tuple(special_types))
        _apply_special_room_features(config, rng, grid, room, special_type)


def _apply_special_room_features(config: GameConfig, rng: Rng, grid: list[list[Tile]], room: _DungeonRoom, special_type: str) -> None:
    colors = {
        "treasure": (150, 150, 50),
        "danger": (100, 50, 50),
        "shrine": (100, 50, 150),
        "lava_chamber": (120, 60, 30),
        "ice_chamber": (50, 100, 150),
    }
    color = colors.get(special_type, (70, 70, 100))
    for y in range(room.y, room.y + room.height):
        for x in range(room.x, room.x + room.width):
            if config.in_bounds(x, y):
                grid[y][x] = tiles.special_floor(color)
    center = room.center()
    if not config.in_bounds(center.x, center.y):
        return
    if special_type in {"danger", "shrine"}:
        grid[center.y][center.x] = tiles.pillar()
    elif special_type == "lava_chamber":
        grid[center.y][center.x] = tiles.lava()
    elif special_type == "ice_chamber":
        for _ in range(rng.randint(1, 3)):
            x = rng.randint(room.x + 1, max(room.x + 1, room.x + room.width - 2))
            y = rng.randint(room.y + 1, max(room.y + 1, room.y + room.height - 2))
            if config.in_bounds(x, y):
                grid[y][x] = tiles.shallow_water()


def _grid_in_bounds(grid: list[list[Tile]], x: int, y: int) -> bool:
    return 0 <= y < len(grid) and 0 <= x < len(grid[y])


def _bresenham_line(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    x, y = x0, y0

    while True:
        points.append((x, y))
        if x == x1 and y == y1:
            break
        err2 = 2 * err
        if err2 > -dy:
            err -= dy
            x += sx
        if err2 < dx:
            err += dx
            y += sy
    return points


def count_reachable_walkable_tiles(grid: list[list[Tile]], start: Position) -> int:
    """Count the size of the connected walkable region from the starting point."""

    height = len(grid)
    width = len(grid[0]) if height else 0
    if not (0 <= start.x < width and 0 <= start.y < height):
        return 0
    if not grid[start.y][start.x].walkable:
        return 0

    queue: deque[tuple[int, int]] = deque([(start.x, start.y)])
    seen = {(start.x, start.y)}
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            if (nx, ny) in seen or not grid[ny][nx].walkable:
                continue
            seen.add((nx, ny))
            queue.append((nx, ny))
    return len(seen)
