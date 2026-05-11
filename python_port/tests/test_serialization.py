import json

from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core import tiles
from dungeon_crawler.core.models import Health, Inventory, Position, Progress, Stats, Status
from dungeon_crawler.core.serialization import dumps_game, game_from_dict, game_to_dict, loads_game


def test_game_to_dict_is_json_compatible_and_restores_core_state() -> None:
    game = Game()
    game.new_game(seed=31)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    player_health = game.ecs.get_component(player_id, "health")
    inventory = game.ecs.get_component(player_id, "inventory")
    progress = game.ecs.get_component(player_id, "progress")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(player_position, Position)
    assert isinstance(player_health, Health)
    assert isinstance(inventory, Inventory)
    assert isinstance(progress, Progress)
    assert isinstance(status, Status)

    player_health.hp = 55
    game.spawn_gold(player_position.x + 1, player_position.y, 11)
    game.dispatch(Action.move(1, 0))
    game.spawn_item(player_position.x + 1, player_position.y, "strength_elixir")
    game.dispatch(Action.move(1, 0))
    game.dispatch(Action.use_item(0))
    game.spawn_monster_type("orc", player_position.x + 3, player_position.y)

    payload = game_to_dict(game)
    encoded = json.dumps(payload)
    restored = game_from_dict(json.loads(encoded))

    restored_player_id = restored.world.player_eid
    assert restored_player_id == player_id
    assert restored.state.turn_count == game.state.turn_count
    assert restored.state.area == game.state.area
    assert restored.state.floor == game.state.floor
    assert restored.state.dungeon_max_depth == game.state.dungeon_max_depth
    assert restored.state.floors_descended == game.state.floors_descended
    assert restored.state.player_gold == 11
    assert restored.world.messages[-1].text == game.world.messages[-1].text
    assert [[tile.glyph for tile in row] for row in restored.world.dungeon_grid] == [
        [tile.glyph for tile in row] for row in game.world.dungeon_grid
    ]
    assert restored.ecs.get_component(restored_player_id, "position") == game.ecs.get_component(player_id, "position")
    assert restored.ecs.get_component(restored_player_id, "health") == game.ecs.get_component(player_id, "health")
    assert restored.ecs.get_component(restored_player_id, "stats") == game.ecs.get_component(player_id, "stats")
    assert restored.ecs.get_component(restored_player_id, "progress") == game.ecs.get_component(player_id, "progress")
    assert restored.ecs.get_component(restored_player_id, "status") == game.ecs.get_component(player_id, "status")


def test_dump_load_roundtrip_can_continue_playing_deterministically() -> None:
    game = Game()
    game.new_game(seed=41)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    game.spawn_monster(player_position.x + 4, player_position.y)
    payload = dumps_game(game)
    restored = loads_game(payload)

    game.dispatch(Action.wait())
    restored.dispatch(Action.wait())

    assert dumps_game(restored) == dumps_game(game)


def test_save_load_preserves_cached_dungeon_levels() -> None:
    game = Game()
    game.new_game(seed=43)
    _enter_dungeon_with_depth(game, 3)
    assert game.world.stairs_position is not None

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    stairs = game.world.stairs_position
    player_position.x = stairs.x - 1
    player_position.y = stairs.y
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.floor()
    game.dispatch(Action.move(1, 0))

    restored = loads_game(dumps_game(game))

    assert restored.state.floor == -2
    assert -1 in restored.world.dungeon_levels
    cached = restored.world.dungeon_levels[-1]
    assert cached.stairs_position == stairs
    assert cached.dungeon_grid[stairs.y][stairs.x].glyph == ">"


def _enter_dungeon_with_depth(game: Game, depth: int) -> None:
    player_id = game.world.player_eid
    assert player_id is not None
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(progress, Progress)
    progress.level = depth
    entrance = game.world.dungeon_entrance_position
    assert entrance is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    player_position.x = entrance.x
    player_position.y = entrance.y
    assert game.enter_dungeon() is True
