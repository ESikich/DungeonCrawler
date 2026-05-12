from dungeon_crawler.core import tiles
from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Position, Progress, Vision


def test_new_game_starts_in_overworld_with_dungeon_entrance() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    vision = game.ecs.get_component(player_id, "vision")
    assert isinstance(vision, Vision)
    assert game.state.area == "overworld"
    assert game.state.floor == 0
    assert game.world.overworld_section == (0, 0)
    assert game.world.dungeon_entrance_position is not None
    assert vision.radius == 8
    assert len(vision.visible) == game.config.dungeon_width * game.config.dungeon_height
    assert vision.seen == vision.visible


def test_stepping_on_dungeon_entrance_enters_first_floor() -> None:
    game = Game()
    game.new_game(seed=6)
    _move_player_next_to_entrance(game)

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.area == "dungeon"
    assert game.state.floor == -1
    assert game.state.dungeon_max_depth == 1
    assert game.world.dungeon_grid[_player_position(game).y][_player_position(game).x].glyph == "<"
    assert game.world.messages[-1].text == "You enter the dungeon..."


def test_first_floor_up_stairs_returns_to_overworld() -> None:
    game = Game()
    game.new_game(seed=7)
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))
    assert game.state.area == "dungeon"

    up_stairs = Position(_player_position(game).x, _player_position(game).y)
    _move_player_next_to(game, up_stairs)
    game.dispatch(Action.move(1, 0))

    assert game.state.area == "overworld"
    assert game.state.floor == 0
    assert game.world.dungeon_entrance_position is not None
    assert _visible_tile_count(game) == game.config.dungeon_width * game.config.dungeon_height
    assert game.world.messages[-1].text == "You climb back into the overworld."


def test_reentering_old_dungeon_keeps_original_max_depth() -> None:
    game = Game()
    game.new_game(seed=9)
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))
    assert game.state.dungeon_max_depth == 1

    up_stairs = Position(_player_position(game).x, _player_position(game).y)
    _move_player_next_to(game, up_stairs)
    game.dispatch(Action.move(1, 0))
    assert game.state.area == "overworld"

    player_id = game.world.player_eid
    assert player_id is not None
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(progress, Progress)
    progress.level = 3
    _move_player_next_to_entrance(game)
    game.dispatch(Action.move(1, 0))

    assert game.state.area == "dungeon"
    assert game.state.dungeon_max_depth == 1
    assert game.world.stairs_position is None


def test_overworld_edge_movement_changes_and_caches_sections() -> None:
    game = Game()
    game.new_game(seed=8)
    player_position = _player_position(game)
    player_position.x = game.config.dungeon_width - 1
    player_position.y = game.config.dungeon_height // 2
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()

    consumed = game.dispatch(Action.move(1, 0))

    assert consumed is True
    assert game.state.area == "overworld"
    assert game.world.overworld_section == (1, 0)
    assert _player_position(game).x == 0
    assert (0, 0) in game.world.overworld_sections
    assert (1, 0) in game.world.overworld_sections
    assert game.world.overworld_transition is not None
    assert game.world.overworld_transition.direction == (1, 0)
    assert game.world.overworld_transition.from_grid is not game.world.overworld_transition.to_grid
    assert _visible_tile_count(game) == game.config.dungeon_width * game.config.dungeon_height
    assert game.world.messages[-1].text == "You travel to another part of the overworld."


def _move_player_next_to_entrance(game: Game) -> None:
    entrance = game.world.dungeon_entrance_position
    assert entrance is not None
    _move_player_next_to(game, entrance)


def _move_player_next_to(game: Game, target: Position) -> None:
    player_position = _player_position(game)
    assert target.x > 0
    player_position.x = target.x - 1
    player_position.y = target.y
    game.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()


def _player_position(game: Game) -> Position:
    player_id = game.world.player_eid
    assert player_id is not None
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(progress, Progress)
    position = game.ecs.get_component(player_id, "position")
    assert isinstance(position, Position)
    return position


def _visible_tile_count(game: Game) -> int:
    player_id = game.world.player_eid
    assert player_id is not None
    vision = game.ecs.get_component(player_id, "vision")
    assert isinstance(vision, Vision)
    return len(vision.visible)
