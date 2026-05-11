from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Health, Position, Progress, Stats
from dungeon_crawler.core.systems import resolve_attack


def test_player_gains_xp_when_defeating_enemy() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(player_position, Position)
    assert isinstance(progress, Progress)

    game.spawn_monster(player_position.x + 1, player_position.y, hp=6, xp=7)
    game.dispatch(Action.move(1, 0))

    assert progress.xp == 7
    assert progress.level == 1
    assert progress.next_level_xp == 20
    assert any("Gained 7 XP." == message.text for message in game.world.messages)


def test_level_up_spends_xp_restores_hp_and_improves_stats() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    progress = game.ecs.get_component(player_id, "progress")
    health = game.ecs.get_component(player_id, "health")
    stats = game.ecs.get_component(player_id, "stats")
    assert isinstance(player_position, Position)
    assert isinstance(progress, Progress)
    assert isinstance(health, Health)
    assert isinstance(stats, Stats)

    health.hp = 42
    game.spawn_monster(player_position.x + 1, player_position.y, hp=6, xp=25)
    game.dispatch(Action.move(1, 0))

    assert progress == Progress(xp=5, level=2, next_level_xp=40)
    assert health == Health(hp=110, max_hp=110)
    assert stats == Stats(strength=15, agility=13, accuracy=7, evasion=4)
    assert any("You are now level 2! (+stats, HP restored)" == message.text for message in game.world.messages)


def test_non_player_kill_does_not_award_player_xp() -> None:
    game = Game()
    game.new_game(seed=5)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    progress = game.ecs.get_component(player_id, "progress")
    assert isinstance(player_position, Position)
    assert isinstance(progress, Progress)

    attacker_id = game.spawn_monster(player_position.x + 1, player_position.y, hp=20, strength=50)
    victim_id = game.spawn_monster(player_position.x + 2, player_position.y, hp=1, xp=99)
    resolve_attack(game.ecs, game.world, game.state, game.rng, attacker_id, victim_id)

    assert progress == Progress(xp=0, level=1, next_level_xp=20)

