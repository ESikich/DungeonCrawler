from dungeon_crawler.core.config import GameConfig
from dungeon_crawler.core.models import GameState, Tile, WorldState
from dungeon_crawler.core import tiles
from dungeon_crawler.core.tiles import floor, up_stairs, wall


def test_default_config_matches_js_dimensions() -> None:
    config = GameConfig()
    assert config.dungeon_width == 25
    assert config.dungeon_height == 17


def test_tile_constructors_match_expected_flags() -> None:
    wall_tile = wall()
    floor_tile = floor()

    assert wall_tile == Tile(walkable=False, opaque=True, color=(100, 100, 100), glyph="#")
    assert floor_tile.walkable is True
    assert floor_tile.opaque is False
    assert floor_tile.glyph == "."
    assert up_stairs().glyph == "<"
    assert up_stairs().special == "dungeonExit"


def test_overworld_tile_constructors_match_js_values() -> None:
    expected = {
        "grass": (True, False, (38, 130, 55), "", None),
        "light_grass": (True, False, (52, 155, 68), "", "grass"),
        "dark_grass": (True, False, (28, 105, 45), "", "grass"),
        "tree": (False, True, (18, 82, 35), "T", "tree"),
        "rock": (False, True, (105, 105, 95), "o", "rock"),
        "sand": (True, False, (194, 178, 128), "", "sand"),
        "dungeon_entrance": (True, False, (0, 0, 0), "", "dungeonEntrance"),
        "bridge": (True, False, (126, 82, 42), "=", "bridge"),
        "water": (False, False, (30, 100, 200), "~", "water"),
        "shallow_water": (True, False, (62, 156, 224), "~", "water"),
        "mid_deep_water": (False, False, (12, 56, 140), "~", "water"),
        "very_deep_water": (False, False, (6, 34, 105), "~", "water"),
        "ocean": (False, False, (26, 108, 184), "~", "ocean"),
        "shallow_ocean": (True, False, (56, 162, 210), "~", "ocean"),
        "mid_deep_ocean": (False, False, (10, 64, 128), "~", "ocean"),
        "very_deep_ocean": (False, False, (4, 42, 96), "~", "ocean"),
    }

    for name, values in expected.items():
        tile = getattr(tiles, name)()
        assert (tile.walkable, tile.opaque, tile.color, tile.glyph, tile.special) == values


def test_default_state_and_empty_world_start_clean() -> None:
    state = GameState()
    world = WorldState()

    assert state.current == "start"
    assert state.turn_count == 0
    assert state.game_over is False
    assert state.area == "overworld"
    assert state.floor == 0
    assert state.dungeon_max_depth == 1
    assert world.dungeon_grid == []
    assert world.overworld_section == (0, 0)
    assert world.player_eid is None
    assert world.spawn_position is None
    assert world.stairs_position is None
