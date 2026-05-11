"""Basic deterministic dungeon generation."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
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


@dataclass(slots=True, frozen=True)
class GeneratedOverworld:
    grid: list[list[Tile]]
    spawn: Position
    entrance: Position | None


def generate_basic_dungeon(config: GameConfig, rng: Rng) -> GeneratedLevel:
    """Generate a connected room-and-corridor dungeon."""

    grid = [[tiles.wall() for _ in range(config.dungeon_width)] for _ in range(config.dungeon_height)]
    rooms = _place_rooms(config, rng)

    for room in rooms:
        _carve_room(grid, room)

    for previous, current in zip(rooms, rooms[1:]):
        _connect_rooms(grid, _room_center(previous), _room_center(current), rng)

    spawn = _room_center(rooms[0])
    stairs_position = _room_center(rooms[-1])
    grid[stairs_position.y][stairs_position.x] = tiles.stairs()
    return GeneratedLevel(grid=grid, spawn=spawn, stairs=stairs_position, rooms=rooms)


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
    _apply_shoreline_sand(config, grid)
    _apply_grass_tones(config, grid)
    _apply_water_tones(config, grid)

    entrance = _place_dungeon_entrance(config, grid, section, seed)
    spawn = _spawn_for_section(config, section, entrance)
    _ensure_walkable(grid, spawn)
    _clear_spawn_area(config, grid, spawn)
    if entrance is not None:
        _ensure_entrance_path(config, grid, entrance, spawn)
    return GeneratedOverworld(grid=grid, spawn=spawn, entrance=entrance)


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
    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            if not _can_become_sand(grid[y][x]):
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

    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            if not _is_grass_like(grid[y][x]):
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

    for y in range(config.dungeon_height):
        for x in range(config.dungeon_width):
            special = grid[y][x].special
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


def _place_rooms(config: GameConfig, rng: Rng) -> list[tuple[int, int, int, int]]:
    max_rooms = 6
    attempts = 80
    rooms: list[tuple[int, int, int, int]] = []

    for _ in range(attempts):
        width = rng.randint(4, min(8, config.dungeon_width - 4))
        height = rng.randint(3, min(6, config.dungeon_height - 4))
        x = rng.randint(1, config.dungeon_width - width - 1)
        y = rng.randint(1, config.dungeon_height - height - 1)
        room = (x, y, width, height)

        if any(_rooms_intersect(room, existing, buffer=1) for existing in rooms):
            continue

        rooms.append(room)
        if len(rooms) >= max_rooms:
            break

    if len(rooms) < 2:
        return _fallback_rooms(config)

    return rooms


def _fallback_rooms(config: GameConfig) -> list[tuple[int, int, int, int]]:
    top_height = max(3, config.dungeon_height // 3)
    bottom_height = max(3, config.dungeon_height // 3)
    room_width = max(5, config.dungeon_width // 3)
    return [
        (2, 2, room_width, top_height),
        (config.dungeon_width - room_width - 2, config.dungeon_height - bottom_height - 2, room_width, bottom_height),
    ]


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


def _carve_room(grid: list[list[Tile]], room: tuple[int, int, int, int]) -> None:
    x, y, width, height = room
    for tile_y in range(y, y + height):
        for tile_x in range(x, x + width):
            grid[tile_y][tile_x] = tiles.floor()


def _connect_rooms(grid: list[list[Tile]], start: Position, end: Position, rng: Rng) -> None:
    if rng.chance(0.5):
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
