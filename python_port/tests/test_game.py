from dungeon_crawler.core.game import Game
from dungeon_crawler.core.models import Descriptor, Health, Inventory, Position, Progress, Stats, Status, Vision


def test_new_game_creates_player_with_expected_components() -> None:
    game = Game()
    game.new_game(seed=11)

    player_id = game.world.player_eid
    assert player_id is not None

    assert isinstance(game.ecs.get_component(player_id, "position"), Position)
    assert game.ecs.get_component(player_id, "health") == Health(hp=100, max_hp=100)
    assert game.ecs.get_component(player_id, "stats") == Stats(strength=14, agility=12, accuracy=6, evasion=4)
    vision = game.ecs.get_component(player_id, "vision")
    assert isinstance(vision, Vision)
    assert game.state.area == "overworld"
    assert game.state.floor == 0
    assert game.world.dungeon_entrance_position is not None
    assert vision.radius == 8
    assert vision.base_radius == 8
    assert (game.world.spawn_position.x, game.world.spawn_position.y) in vision.visible
    assert vision.seen == vision.visible
    assert game.ecs.get_component(player_id, "descriptor") == Descriptor(name="Hero", glyph="@", color="royalBlue")
    assert game.ecs.get_component(player_id, "progress") == Progress(xp=0, level=1, next_level_xp=20)
    assert game.ecs.get_component(player_id, "inventory") == Inventory(items=[], capacity=12)
    assert game.ecs.get_component(player_id, "status") == Status()
