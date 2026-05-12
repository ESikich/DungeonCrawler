from dungeon_crawler.core.config import GameConfig
from dungeon_crawler.core.generation import count_reachable_walkable_tiles, generate_basic_dungeon, generate_basic_overworld
from dungeon_crawler.core.rng import Rng


def test_basic_generation_creates_valid_connected_map() -> None:
    config = GameConfig()
    level = generate_basic_dungeon(config, Rng(seed=123))
    walkable_count = sum(tile.walkable for row in level.grid for tile in row)

    assert len(level.grid) == config.dungeon_height
    assert all(len(row) == config.dungeon_width for row in level.grid)
    assert config.in_bounds(level.spawn.x, level.spawn.y)
    assert level.grid[level.spawn.y][level.spawn.x].walkable is True
    assert config.in_bounds(level.stairs.x, level.stairs.y)
    assert level.grid[level.stairs.y][level.stairs.x].glyph == ">"
    assert len(level.rooms) >= 2
    assert count_reachable_walkable_tiles(level.grid, level.spawn) == walkable_count


def test_generation_is_deterministic_for_same_seed() -> None:
    config = GameConfig()
    level_a = generate_basic_dungeon(config, Rng(seed=7))
    level_b = generate_basic_dungeon(config, Rng(seed=7))

    glyphs_a = [[tile.glyph for tile in row] for row in level_a.grid]
    glyphs_b = [[tile.glyph for tile in row] for row in level_b.grid]

    assert glyphs_a == glyphs_b
    assert level_a.spawn == level_b.spawn
    assert level_a.stairs == level_b.stairs
    assert level_a.rooms == level_b.rooms


def test_generation_creates_multiple_rooms_and_corridors() -> None:
    config = GameConfig()
    level = generate_basic_dungeon(config, Rng(seed=99))

    assert len(level.rooms) >= 2
    assert level.spawn != level.stairs
    for x, y, width, height in level.rooms:
        assert x >= 1
        assert y >= 1
        assert x + width < config.dungeon_width
        assert y + height < config.dungeon_height


def test_dungeon_generation_uses_floor_based_algorithm_variety() -> None:
    config = GameConfig()
    cases = {
        "rooms": (1, 1),
        "maze": (1, 2),
        "caves": (4, 7),
        "hybrid": (7, 5),
    }

    for expected_algorithm, (floor_depth, seed) in cases.items():
        level = generate_basic_dungeon(config, Rng(seed=seed), floor_depth=floor_depth)
        walkable_count = sum(tile.walkable for row in level.grid for tile in row)

        assert level.algorithm == expected_algorithm
        assert len(level.rooms) >= 2
        assert count_reachable_walkable_tiles(level.grid, level.spawn) == walkable_count


def test_deep_hybrid_generation_adds_special_room_features() -> None:
    config = GameConfig()
    level = generate_basic_dungeon(config, Rng(seed=6), floor_depth=7)
    specials = {tile.special for row in level.grid for tile in row}

    assert level.algorithm == "hybrid"
    assert "specialFloor" in specials
    assert "lava" in specials


def test_basic_overworld_generation_creates_origin_entrance_and_is_deterministic() -> None:
    config = GameConfig()
    overworld_a = generate_basic_overworld(config, section=(0, 0), seed=1234)
    overworld_b = generate_basic_overworld(config, section=(0, 0), seed=1234)

    assert len(overworld_a.grid) == config.dungeon_height
    assert all(len(row) == config.dungeon_width for row in overworld_a.grid)
    assert overworld_a.grid[overworld_a.spawn.y][overworld_a.spawn.x].walkable is True
    assert overworld_a.entrance is not None
    assert overworld_a.grid[overworld_a.entrance.y][overworld_a.entrance.x].special == "dungeonEntrance"
    assert [[tile.glyph for tile in row] for row in overworld_a.grid] == [
        [tile.glyph for tile in row] for row in overworld_b.grid
    ]


def test_overworld_generation_ports_regional_terrain_types() -> None:
    config = GameConfig()
    specials: set[str] = set()

    for section in ((0, 0), (1, 0), (-1, 1), (4, 4), (5, -2)):
        overworld = generate_basic_overworld(config, section=section, seed=1234)
        specials.update(tile.special or "" for row in overworld.grid for tile in row)

    assert "grass" in specials
    assert "tree" in specials
    assert "water" in specials or "ocean" in specials
    assert "sand" in specials


def test_non_origin_overworld_sections_do_not_stamp_center_grass_slab() -> None:
    config = GameConfig()
    overworld = generate_basic_overworld(config, section=(4, 4), seed=1234)
    center_x = config.dungeon_width // 2
    center_y = config.dungeon_height // 2
    center_patch = [
        overworld.grid[y][x]
        for y in range(center_y - 1, center_y + 2)
        for x in range(center_x - 3, center_x + 4)
    ]

    assert not all(tile.walkable and tile.special in {None, "grass"} for tile in center_patch)
