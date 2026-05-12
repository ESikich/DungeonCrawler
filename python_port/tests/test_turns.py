from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Blocker, Position


def test_wait_advances_turn_and_logs_message() -> None:
    game = Game()
    game.new_game(seed=3)

    consumed = game.dispatch(Action.wait())

    assert consumed is True
    assert game.state.turn_count == 1
    assert game.state.time_minutes == 8 * 60 + 15
    assert game.clock_text() == "08:15"
    assert game.day_phase() == "day"
    assert game.world.messages[-1].text == "You wait."


def test_clock_wraps_and_switches_day_phase() -> None:
    game = Game()
    game.new_game(seed=3)
    game.state.time_minutes = 17 * 60 + 45

    game.dispatch(Action.wait())

    assert game.clock_text() == "18:00"
    assert game.day_phase() == "night"
    assert game.is_night() is True

    game.state.time_minutes = 23 * 60 + 45
    game.dispatch(Action.wait())

    assert game.clock_text() == "00:00"
    assert game.day_phase() == "night"


def test_wall_and_bounds_movement_are_blocked_but_consume_turn() -> None:
    game = Game()
    game.new_game(seed=3)
    _enter_dungeon(game)

    player_id = game.world.player_eid
    assert player_id is not None

    game.dispatch(Action.move(-99, 0))
    assert game.state.turn_count == 1
    assert game.world.messages[-1].text == "Can't go that way!"

    game.dispatch(Action.move(0, -99))
    assert game.state.turn_count == 2


def test_moving_into_non_hostile_blocker_does_not_change_position() -> None:
    game = Game()
    game.new_game(seed=3)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    blocker_id = game.ecs.create_entity()
    game.ecs.add_component(blocker_id, "position", Position(player_position.x + 1, player_position.y))
    game.ecs.add_component(blocker_id, "blocker", Blocker(passable=False))

    consumed = game.dispatch(Action.move(1, 0))

    updated_position = game.ecs.get_component(player_id, "position")
    assert consumed is True
    assert isinstance(updated_position, Position)
    assert updated_position.x == player_position.x
    assert updated_position.y == player_position.y
    assert game.world.messages[-1].text == "That space is blocked."


def _enter_dungeon(game: Game) -> None:
    player_id = game.world.player_eid
    assert player_id is not None
    entrance = game.world.dungeon_entrance_position
    assert entrance is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)
    player_position.x = entrance.x
    player_position.y = entrance.y
    assert game.enter_dungeon() is True
