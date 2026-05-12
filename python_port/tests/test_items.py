from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Health, Inventory, Item, LootDrop, Position


def test_player_picks_up_healing_item_on_move() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    inventory = game.ecs.get_component(player_id, "inventory")
    assert isinstance(player_position, Position)
    assert isinstance(inventory, Inventory)

    item_id = game.spawn_item(player_position.x + 1, player_position.y)
    game.dispatch(Action.move(1, 0))

    assert game.ecs.get_component(item_id, "item") is None
    assert inventory.items == [
        Item(
            item_type="healing_potion",
            name="Healing Potion",
            glyph="!",
            color="red",
            heal_amount=35,
        )
    ]
    assert game.world.messages[-1].text == "Picked up Healing Potion."


def test_gold_pickup_increments_currency_without_using_inventory_space() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    inventory = game.ecs.get_component(player_id, "inventory")
    assert isinstance(player_position, Position)
    assert isinstance(inventory, Inventory)

    gold_id = game.spawn_gold(player_position.x + 1, player_position.y, 9)
    game.dispatch(Action.move(1, 0))

    assert game.ecs.get_component(gold_id, "item") is None
    assert game.state.player_gold == 9
    assert inventory.items == []
    assert game.world.messages[-1].text == "Picked up 9 gold."


def test_using_healing_item_restores_hp_and_consumes_turn() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    player_health = game.ecs.get_component(player_id, "health")
    inventory = game.ecs.get_component(player_id, "inventory")
    assert isinstance(player_position, Position)
    assert isinstance(player_health, Health)
    assert isinstance(inventory, Inventory)

    player_health.hp = 60
    game.spawn_item(player_position.x + 1, player_position.y)
    game.dispatch(Action.move(1, 0))
    turn_after_pickup = game.state.turn_count

    consumed = game.dispatch(Action.use_item(0))

    assert consumed is True
    assert player_health.hp == 95
    assert inventory.items == []
    assert game.state.turn_count == turn_after_pickup + 1
    assert game.world.messages[-1].text == "Used Healing Potion. Restored 35 HP."


def test_using_healing_item_at_full_hp_does_not_consume_it_or_turn() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    inventory = game.ecs.get_component(player_id, "inventory")
    assert isinstance(inventory, Inventory)

    inventory.items.append(
        Item(
            item_type="healing_potion",
            name="Healing Potion",
            glyph="!",
            color="red",
            heal_amount=35,
        )
    )

    consumed = game.dispatch(Action.use_item(0))

    assert consumed is False
    assert len(inventory.items) == 1
    assert game.state.turn_count == 0
    assert game.world.messages[-1].text == "You are already at full health."


def test_drop_item_removes_from_inventory_and_places_entity_at_player() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    inventory = game.ecs.get_component(player_id, "inventory")
    assert isinstance(player_position, Position)
    assert isinstance(inventory, Inventory)

    inventory.items.append(
        Item(
            item_type="healing_potion",
            name="Healing Potion",
            glyph="!",
            color="red",
            heal_amount=35,
        )
    )

    consumed = game.dispatch(Action.drop_item(0))
    dropped_items = [
        entity_id
        for entity_id in game.ecs.entities_at(player_position.x, player_position.y)
        if game.ecs.has_component(entity_id, "item")
    ]

    assert consumed is True
    assert inventory.items == []
    assert len(dropped_items) == 1
    assert game.world.messages[-1].text == "Dropped Healing Potion."


def test_defeated_enemy_drops_loot_table_rewards() -> None:
    game = Game()
    game.new_game(seed=2)

    player_id = game.world.player_eid
    assert player_id is not None
    player_position = game.ecs.get_component(player_id, "position")
    assert isinstance(player_position, Position)

    enemy_id = game.spawn_monster(
        player_position.x + 1,
        player_position.y,
        hp=1,
        loot_table=(LootDrop("gold", 1.0, 5, 5),),
    )

    consumed = game.dispatch(Action.move(1, 0))

    dropped = [
        game.ecs.get_component(entity_id, "item")
        for entity_id in game.ecs.entities_at(player_position.x + 1, player_position.y)
        if entity_id != enemy_id
    ]
    assert consumed is True
    assert game.ecs.get_component(enemy_id, "health") is None
    assert any(isinstance(item, Item) and item.gold_amount >= 5 for item in dropped)

