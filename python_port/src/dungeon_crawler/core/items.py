"""Item registry and item entity helpers."""

from __future__ import annotations

from .ecs import ECS
from .models import Descriptor, Item, Position


ITEMS: dict[str, Item] = {
    "healing_potion": Item(
        item_type="healing_potion",
        name="Healing Potion",
        glyph="!",
        color="red",
        heal_amount=35,
    ),
    "strength_elixir": Item(
        item_type="strength_elixir",
        name="Strength Elixir",
        glyph="!",
        color="orange",
        stat_boost="strength",
        boost_amount=4,
        boost_turns=3,
    ),
}


def item_for_type(item_type: str) -> Item:
    return ITEMS.get(item_type, ITEMS["healing_potion"])


def create_item_entity(ecs: ECS, x: int, y: int, item_type: str = "healing_potion") -> int:
    item = item_for_type(item_type)
    return create_item_from_data(ecs, x, y, item)


def create_gold_entity(ecs: ECS, x: int, y: int, amount: int) -> int:
    item = Item(
        item_type="gold",
        name="Gold",
        glyph="$",
        color="gold",
        gold_amount=amount,
    )
    return create_item_from_data(ecs, x, y, item)


def create_item_from_data(ecs: ECS, x: int, y: int, item: Item) -> int:
    entity_id = ecs.create_entity()
    ecs.add_component(entity_id, "position", Position(x=x, y=y))
    ecs.add_component(entity_id, "item", item)
    ecs.add_component(entity_id, "descriptor", Descriptor(name=item.name, glyph=item.glyph, color=item.color))
    return entity_id
