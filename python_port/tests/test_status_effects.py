from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.items import item_for_type
from dungeon_crawler.core.models import Health, Inventory, Item, Stats, Status, Vision


def strength_elixir() -> Item:
    return Item(
        item_type="strength_elixir",
        name="Strength Elixir",
        glyph="!",
        color="orange",
        stat_boost="strength",
        boost_amount=4,
        boost_turns=3,
    )


def test_strength_elixir_applies_temporary_boost_without_immediate_tick() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    stats = game.ecs.get_component(player_id, "stats")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(inventory, Inventory)
    assert isinstance(stats, Stats)
    assert isinstance(status, Status)

    inventory.items.append(strength_elixir())

    consumed = game.dispatch(Action.use_item(0))

    assert consumed is True
    assert stats.strength == 18
    assert status.strength_boost == 3
    assert status.strength_bonus_amount == 4
    assert inventory.items == []
    assert game.state.turn_count == 1
    assert game.world.messages[-1].text == "Used Strength Elixir. Strength +4 for 3 turns."


def test_strength_boost_ticks_down_and_restores_stat() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    stats = game.ecs.get_component(player_id, "stats")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(inventory, Inventory)
    assert isinstance(stats, Stats)
    assert isinstance(status, Status)

    inventory.items.append(strength_elixir())
    game.dispatch(Action.use_item(0))

    game.dispatch(Action.wait())
    assert stats.strength == 18
    assert status.strength_boost == 2

    game.dispatch(Action.wait())
    assert stats.strength == 18
    assert status.strength_boost == 1

    game.dispatch(Action.wait())
    assert stats.strength == 14
    assert status.strength_boost == 0
    assert status.strength_bonus_amount == 0
    assert game.world.messages[-1].text == "Your strength returns to normal."


def test_strength_boost_cannot_stack() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    stats = game.ecs.get_component(player_id, "stats")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(inventory, Inventory)
    assert isinstance(stats, Stats)
    assert isinstance(status, Status)

    inventory.items.append(strength_elixir())
    inventory.items.append(strength_elixir())
    game.dispatch(Action.use_item(0))
    turn_after_first_use = game.state.turn_count

    consumed = game.dispatch(Action.use_item(0))

    assert consumed is False
    assert stats.strength == 18
    assert status.strength_boost == 3
    assert len(inventory.items) == 1
    assert game.state.turn_count == turn_after_first_use
    assert game.world.messages[-1].text == "You are already empowered."


def test_light_scroll_expands_vision_then_restores_base_radius() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    vision = game.ecs.get_component(player_id, "vision")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(inventory, Inventory)
    assert isinstance(vision, Vision)
    assert isinstance(status, Status)

    inventory.items.append(item_for_type("scroll"))
    base_radius = vision.base_radius

    assert game.dispatch(Action.use_item(0)) is True
    assert vision.radius == base_radius + 3
    assert status.light_boost == 20

    for _ in range(20):
        game.dispatch(Action.wait())

    assert vision.radius == base_radius
    assert status.light_boost == 0
    assert game.world.messages[-1].text == "The bright light fades."


def test_regen_potion_heals_over_time_and_expires() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    health = game.ecs.get_component(player_id, "health")
    status = game.ecs.get_component(player_id, "status")
    assert isinstance(inventory, Inventory)
    assert isinstance(health, Health)
    assert isinstance(status, Status)

    health.hp = 50
    inventory.items.append(item_for_type("mending"))

    assert game.dispatch(Action.use_item(0)) is True
    assert status.regen_boost == 8
    assert health.hp == 50

    game.dispatch(Action.wait())

    assert health.hp == 53
    assert status.regen_boost == 7

