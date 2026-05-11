from dungeon_crawler.core import tiles
from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.items import item_for_type
from dungeon_crawler.core.models import Descriptor, Health, Inventory, Position, Progress


def test_stepping_on_down_stairs_descends_and_preserves_player_state() -> None:
    game = Game()
    game.new_game(seed=17)
    _enter_dungeon_with_depth(game, 3)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    health = game.ecs.get_component(player_id, "health")
    inventory = game.ecs.get_component(player_id, "inventory")
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(player_position, Position)
    assert isinstance(health, Health)
    assert isinstance(inventory, Inventory)
    assert isinstance(progress, Progress)
    assert game.world.stairs_position is not None

    health.hp = 44
    inventory.items.append(item_for_type("healing_potion"))
    progress.xp = 9
    game.state.player_gold = 12
    _move_player_next_to(game, game.world.stairs_position)

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.floor == -2
    assert game.state.turn_count == 1
    assert game.state.floors_descended == 1
    assert health.hp == 44
    assert inventory.items[0].item_type == "healing_potion"
    assert progress.xp == 9
    assert game.state.player_gold == 12
    assert game.world.dungeon_grid[player_position.y][player_position.x].glyph == "<"
    assert game.world.messages[-1].text == "You descend to floor -2..."


def test_stepping_on_up_stairs_returns_to_previous_floor() -> None:
    game = Game()
    game.new_game(seed=19)
    _enter_dungeon_with_depth(game, 3)
    assert game.world.stairs_position is not None

    _move_player_next_to(game, game.world.stairs_position)
    game.dispatch(Action.move(1, 0))
    assert game.state.floor == -2

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    up_stairs = Position(player_position.x, player_position.y)
    _move_player_next_to(game, up_stairs)

    game.dispatch(Action.move(1, 0))

    assert game.state.floor == -1
    assert game.world.dungeon_grid[player_position.y][player_position.x].glyph == ">"
    assert game.world.messages[-1].text == "You climb up to floor -1..."


def test_returning_to_cached_floor_restores_non_player_entities() -> None:
    game = Game()
    game.new_game(seed=29)
    _enter_dungeon_with_depth(game, 3)
    assert game.world.stairs_position is not None

    item_position = _first_open_floor_away_from_player(game)
    game.spawn_item(item_position.x, item_position.y, "strength_elixir")
    _move_player_next_to(game, game.world.stairs_position)
    game.dispatch(Action.move(1, 0))
    assert game.state.floor == -2

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    up_stairs = Position(player_position.x, player_position.y)
    _move_player_next_to(game, up_stairs)
    game.dispatch(Action.move(1, 0))

    restored_entities = game.ecs.entities_at(item_position.x, item_position.y)
    restored_descriptors = [
        game.ecs.get_component(entity_id, "descriptor")
        for entity_id in restored_entities
        if entity_id != game.world.player_eid
    ]
    assert Descriptor(name="Strength Elixir", glyph="!", color="orange") in restored_descriptors


def test_dungeon_max_depth_blocks_descending() -> None:
    game = Game()
    game.new_game(seed=23)
    _enter_dungeon_with_depth(game, 1)

    descended = game.descend_floor()

    assert descended is False
    assert game.state.floor == -1
    assert game.world.messages[-1].text == "This dungeon goes no deeper."


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
    assert game.state.area == "dungeon"
    assert game.state.floor == -1


def _move_player_next_to(game: Game, target: Position) -> None:
    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    assert target.x > 0

    player_position.x = target.x - 1
    player_position.y = target.y
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.floor()


def _first_open_floor_away_from_player(game: Game) -> Position:
    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    for y, row in enumerate(game.world.dungeon_grid):
        for x, tile in enumerate(row):
            if tile.special is not None or not tile.walkable:
                continue
            if game.ecs.entities_at(x, y):
                continue
            if abs(player_position.x - x) + abs(player_position.y - y) >= 4:
                return Position(x, y)
    raise AssertionError("No open floor found")
