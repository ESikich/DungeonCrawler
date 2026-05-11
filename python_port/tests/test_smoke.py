from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Health, Position
from dungeon_crawler.core.serialization import dumps_game, loads_game


def test_headless_core_100_turn_smoke() -> None:
    game = Game()
    game.new_game(seed=101)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    game.spawn_item(player_position.x + 1, player_position.y, "strength_elixir")
    game.spawn_gold(player_position.x + 2, player_position.y, 13)
    game.spawn_item(player_position.x + 3, player_position.y, "healing_potion")
    game.spawn_random_monster("slime", min_distance=6)
    game.spawn_random_monster("slime", min_distance=6)
    game.spawn_random_monster("orc", min_distance=8)

    actions = [
        Action.move(1, 0),
        Action.use_item(0),
        Action.move(1, 0),
        Action.move(1, 0),
        Action.wait(),
        Action.move(-1, 0),
        Action.move(0, 1),
        Action.move(1, 0),
        Action.move(0, -1),
        Action.wait(),
    ]

    for turn_index in range(100):
        if turn_index == 50:
            game = loads_game(dumps_game(game))

        if not game.state.game_over:
            game.dispatch(actions[turn_index % len(actions)])

        _assert_world_consistent(game)


def _assert_world_consistent(game: Game) -> None:
    assert len(game.world.dungeon_grid) == game.config.dungeon_height
    assert all(len(row) == game.config.dungeon_width for row in game.world.dungeon_grid)
    assert game.state.turn_count >= 0
    assert game.state.player_gold >= 0

    entities = set(game.ecs.all_entities())
    if not game.state.game_over:
        assert game.world.player_eid in entities

    for component_type in game.ecs.component_types():
        assert set(game.ecs.components_for(component_type)).issubset(entities)

    for entity_id in game.ecs.entities_with(["position"]):
        position = game.ecs.get_component(entity_id, "position")
        assert isinstance(position, Position)
        assert game.config.in_bounds(position.x, position.y)
        assert game.world.dungeon_grid[position.y][position.x].walkable

    for entity_id in game.ecs.entities_with(["health"]):
        health = game.ecs.get_component(entity_id, "health")
        assert isinstance(health, Health)
        assert health.max_hp >= 1
        assert health.hp <= health.max_hp
        assert health.hp >= -health.max_hp

    if game.world.player_eid in entities:
        player_position = game.ecs.get_component(game.world.player_eid, "position")
        player_health = game.ecs.get_component(game.world.player_eid, "health")
        assert isinstance(player_position, Position)
        assert isinstance(player_health, Health)

