from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import AI, Descriptor, Health, Position, Stats
from dungeon_crawler.core.monsters import MONSTERS


def test_spawn_monster_type_uses_registry_components() -> None:
    game = Game()
    game.new_game(seed=13)

    enemy_id = game.spawn_monster_type("orc", 3, 3)

    assert game.ecs.get_component(enemy_id, "descriptor") == Descriptor(
        name="Orc Warrior",
        glyph="o",
        color="red",
        sprite="orcWarrior",
    )
    assert game.ecs.get_component(enemy_id, "health") == Health(hp=25, max_hp=25)
    assert game.ecs.get_component(enemy_id, "stats") == Stats(
        strength=12,
        agility=8,
        accuracy=8,
        evasion=4,
    )
    assert game.ecs.get_component(enemy_id, "ai") == AI(behavior="chase")


def test_monster_registry_ports_js_roster() -> None:
    assert set(MONSTERS) == {
        "slime",
        "orc",
        "goblin",
        "rat",
        "berserker",
        "skeleton",
        "spider",
        "troll",
    }

    expected = {
        "slime": ("Green Slime", "s", "green", "slime", 15, 8, 6, 5, 2, "random", 5),
        "orc": ("Orc Warrior", "o", "red", "orcWarrior", 25, 12, 8, 8, 4, "chase", 12),
        "goblin": ("Goblin", "g", "brown", "goblin", 12, 6, 12, 7, 6, "chase", 8),
        "rat": ("Giant Rat", "r", "brown", "giantRat", 8, 4, 10, 6, 7, "cautious", 3),
        "berserker": ("Berserker", "B", "red", "berserker", 35, 16, 6, 9, 2, "aggressive", 20),
        "skeleton": ("Skeleton Warrior", "S", "white", "skeletonWarrior", 18, 10, 7, 6, 3, "chase", 10),
        "spider": ("Giant Spider", "x", "purple", "giantSpider", 10, 6, 14, 8, 9, "cautious", 6),
        "troll": ("Cave Troll", "T", "green", "caveTroll", 45, 18, 4, 10, 1, "chase", 25),
    }

    for monster_type, values in expected.items():
        definition = MONSTERS[monster_type]
        assert (
            definition.name,
            definition.glyph,
            definition.color,
            definition.sprite,
            definition.hp,
            definition.strength,
            definition.agility,
            definition.accuracy,
            definition.evasion,
            definition.behavior,
            definition.xp,
        ) == values


def test_random_spawn_avoids_player_and_blocking_tiles() -> None:
    game = Game()
    game.new_game(seed=21)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    enemy_id = game.spawn_random_monster("slime", min_distance=5)
    enemy_position = game.ecs.get_component(enemy_id, "position")

    assert isinstance(enemy_position, Position)
    assert game.world.dungeon_grid[enemy_position.y][enemy_position.x].walkable is True
    assert (enemy_position.x, enemy_position.y) != (player_position.x, player_position.y)
    assert abs(enemy_position.x - player_position.x) + abs(enemy_position.y - player_position.y) >= 5


def test_chasing_enemy_moves_toward_seen_player_on_turn() -> None:
    game = Game()
    game.new_game(seed=1)
    _enter_dungeon(game)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    enemy_id = game.spawn_monster_type("orc", player_position.x + 3, player_position.y)
    game.dispatch(Action.wait())

    enemy_position = game.ecs.get_component(enemy_id, "position")
    enemy_ai = game.ecs.get_component(enemy_id, "ai")
    assert enemy_position == Position(player_position.x + 2, player_position.y)
    assert enemy_ai == AI(behavior="chase", active=True, last_player_pos=(player_position.x, player_position.y))
    assert game.state.turn_count == 1


def test_enemy_attack_during_ai_happens_once_per_turn() -> None:
    game = Game()
    game.new_game(seed=1)
    _enter_dungeon(game)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    player_health = game.ecs.get_component(player_id, "health")
    assert isinstance(player_position, Position)
    assert isinstance(player_health, Health)

    game.spawn_monster_type("orc", player_position.x + 1, player_position.y)
    game.dispatch(Action.wait())

    attack_messages = [
        message.text
        for message in game.world.messages
        if message.text.startswith("Dealt ") and message.text.endswith(" damage to Hero!")
    ]
    damage = int(attack_messages[0].split()[1])

    assert len(attack_messages) == 1
    assert player_health.hp == 100 - damage


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
