from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Health, Position, Status
from dungeon_crawler.core.systems import resolve_attack


def test_moving_into_hostile_triggers_deterministic_attack() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    enemy_id = game.spawn_monster(player_position.x + 1, player_position.y, hp=20, strength=5)
    consumed = game.dispatch(Action.move(1, 0))

    enemy_health = game.ecs.get_component(enemy_id, "health")
    assert consumed is True
    assert enemy_health == Health(hp=11, max_hp=20)
    assert any("Dealt 9 damage to Slime!" in message.text for message in game.world.messages)


def test_enemy_is_removed_when_killed() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    enemy_id = game.spawn_monster(player_position.x + 1, player_position.y, hp=6)
    game.dispatch(Action.move(1, 0))

    assert game.ecs.get_component(enemy_id, "health") is None
    assert any("Gained 5 XP." == message.text for message in game.world.messages)
    assert any("Slime defeated!" == message.text for message in game.world.messages)


def test_player_death_sets_game_over_state() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_health = game.ecs.get_component(player_id, "health")
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_health, Health)
    assert isinstance(player_position, Position)

    player_health.hp = 4
    attacker_id = game.spawn_monster(player_position.x + 1, player_position.y, name="Ogre", hp=20, strength=9)
    game.ecs.add_component(attacker_id, "status", Status())
    resolve_attack(game.ecs, game.world, game.state, game.rng, attacker_id, player_id)

    assert game.state.game_over is True
    assert game.state.current == "gameOver"
    assert any("You have died! Killed by Ogre." == message.text for message in game.world.messages)
