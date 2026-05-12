"""Item registry and item entity helpers."""

from __future__ import annotations

from .ecs import ECS
from .models import Descriptor, Item, Position


ITEMS: dict[str, Item] = {
    "healing_potion": Item("healing_potion", "Healing Potion", "!", "red", heal_amount=35),
    "potion": Item("potion", "Healing Potion", "!", "purple", heal_amount=25, effect="heal"),
    "minorHeal": Item("minorHeal", "Minor Healing Potion", "!", "pink", heal_amount=15, effect="heal"),
    "megaHeal": Item("megaHeal", "Greater Healing Potion", "!", "red", rarity="rare", heal_amount=50, effect="heal"),
    "speed": Item("speed", "Speed Potion", "!", "cyan", rarity="rare", effect="tempBoost", stat_boost="speed", boost_turns=15),
    "ironSkin": Item(
        "ironSkin",
        "Iron Skin Potion",
        "!",
        "gray",
        rarity="rare",
        effect="tempBoost",
        stat_boost="damageReduction",
        boost_turns=10,
        reduction=0.35,
    ),
    "fleetfoot": Item("fleetfoot", "Fleetfoot Potion", "!", "white", rarity="rare", effect="tempBoost", stat_boost="speed", boost_turns=8),
    "clarity": Item(
        "clarity",
        "Clarity Potion",
        "!",
        "blue",
        rarity="rare",
        effect="tempBoost",
        stat_boost="clarity",
        boost_turns=18,
        accuracy_bonus=2,
        evasion_bonus=2,
    ),
    "antidote": Item("antidote", "Antidote Potion", "!", "green", effect="utility", utility_type="antidote"),
    "mending": Item(
        "mending",
        "Mending Potion",
        "!",
        "pink",
        rarity="rare",
        effect="tempBoost",
        stat_boost="regen",
        boost_turns=8,
        regen_amount=3,
    ),
    "strength_elixir": Item(
        "strength_elixir",
        "Strength Elixir",
        "!",
        "orange",
        stat_boost="strength",
        boost_amount=4,
        boost_turns=3,
    ),
    "strength": Item(
        "strength",
        "Strength Elixir",
        "!",
        "orange",
        rarity="rare",
        effect="tempBoost",
        stat_boost="strength",
        boost_amount=5,
        boost_turns=20,
    ),
    "berserkerRage": Item(
        "berserkerRage",
        "Berserker Rage",
        "!",
        "darkred",
        rarity="rare",
        effect="tempBoost",
        stat_boost="strength",
        boost_amount=8,
        boost_turns=12,
    ),
    "focusElixir": Item(
        "focusElixir",
        "Elixir of Focus",
        "!",
        "blue",
        rarity="rare",
        effect="tempBoost",
        stat_boost="accuracy",
        boost_amount=3,
        boost_turns=20,
    ),
    "graceElixir": Item(
        "graceElixir",
        "Elixir of Grace",
        "!",
        "cyan",
        rarity="rare",
        effect="tempBoost",
        stat_boost="evasion",
        boost_amount=3,
        agility_bonus=1,
        boost_turns=20,
    ),
    "titanElixir": Item(
        "titanElixir",
        "Titan Elixir",
        "!",
        "red",
        rarity="epic",
        effect="tempBoost",
        stat_boost="strength",
        boost_amount=10,
        boost_turns=8,
    ),
    "guardianElixir": Item(
        "guardianElixir",
        "Guardian Elixir",
        "!",
        "green",
        rarity="rare",
        effect="tempBoost",
        stat_boost="maxHealth",
        temp_max_hp_amount=20,
        boost_turns=16,
    ),
    "glassFury": Item(
        "glassFury",
        "Glass Fury Elixir",
        "!",
        "purple",
        rarity="epic",
        effect="tempBoost",
        stat_boost="glassFury",
        boost_amount=12,
        evasion_penalty=3,
        boost_turns=10,
    ),
    "scroll": Item("scroll", "Scroll of Light", "?", "yellow", effect="tempBoost", stat_boost="light", boost_amount=3, boost_turns=20),
    "scrollGreaterLight": Item(
        "scrollGreaterLight",
        "Scroll of Greater Light",
        "?",
        "gold",
        rarity="rare",
        effect="tempBoost",
        stat_boost="light",
        boost_amount=5,
        boost_turns=25,
    ),
    "scrollHaste": Item("scrollHaste", "Scroll of Haste", "?", "cyan", rarity="rare", effect="tempBoost", stat_boost="speed", boost_turns=10),
    "scrollMapping": Item("scrollMapping", "Scroll of Mapping", "?", "white", rarity="rare", effect="utility", utility_type="mapping"),
    "scrollDetection": Item("scrollDetection", "Scroll of Detection", "?", "orange", rarity="rare", effect="utility", utility_type="detection", radius=8),
    "scrollBlink": Item("scrollBlink", "Scroll of Blink", "?", "purple", rarity="rare", effect="utility", utility_type="blink", radius=6),
    "scrollSilence": Item("scrollSilence", "Scroll of Silence", "?", "gray", rarity="rare", effect="utility", utility_type="silence", radius=5, boost_turns=8),
    "scrollWarding": Item("scrollWarding", "Scroll of Warding", "?", "gold", rarity="epic", effect="utility", utility_type="warding", radius=1, boost_turns=5),
    "vitality": Item("vitality", "Vitality Relic", "o", "green", rarity="epic", effect="permanentBoost", permanent_boost="health", permanent_amount=15),
    "vision": Item("vision", "Vision Orb", "o", "blue", rarity="epic", effect="permanentBoost", permanent_boost="vision", permanent_amount=1),
    "powerStone": Item("powerStone", "Power Stone", "*", "red", rarity="epic", effect="permanentBoost", permanent_boost="strength", permanent_amount=2),
    "eyeOfTruth": Item("eyeOfTruth", "Eye of Truth", "E", "silver", rarity="epic", effect="permanentBoost", permanent_boost="vision", permanent_amount=2),
    "heartRelic": Item("heartRelic", "Heart Relic", "o", "pink", rarity="epic", effect="permanentBoost", permanent_boost="health", permanent_amount=25),
    "lensRelic": Item("lensRelic", "Lens Relic", "o", "cyan", rarity="epic", effect="permanentBoost", permanent_boost="vision", permanent_amount=2),
    "bladeRelic": Item("bladeRelic", "Blade Relic", "/", "red", rarity="epic", effect="permanentBoost", permanent_boost="strength", permanent_amount=3),
    "featherRelic": Item("featherRelic", "Feather Relic", "o", "white", rarity="epic", effect="permanentBoost", permanent_boost="agility", permanent_amount=2),
    "coinRelic": Item("coinRelic", "Coin Relic", "$", "gold", rarity="epic", effect="permanentBoost", permanent_boost="goldBonus", permanent_amount=0.25),
    "scholarRelic": Item("scholarRelic", "Scholar Relic", "o", "blue", rarity="epic", effect="permanentBoost", permanent_boost="xpBonus", permanent_amount=0.25),
    "bomb": Item("bomb", "Bomb", "*", "red", effect="bomb", radius=1, damage=18),
    "bigBomb": Item("bigBomb", "Greater Bomb", "*", "orange", rarity="rare", effect="bomb", radius=2, damage=25),
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
