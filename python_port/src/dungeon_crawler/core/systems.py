"""Core systems for movement, combat, messages, and vision."""

from __future__ import annotations

from .config import GameConfig
from .ecs import ECS
from .items import create_gold_entity, create_item_entity, create_item_from_data
from .models import (
    AI,
    GameState,
    Health,
    Inventory,
    Item,
    LootDrop,
    Message,
    Position,
    Progress,
    Stats,
    Status,
    Vision,
    WorldState,
)
from .rng import Rng


def add_message(world: WorldState, text: str, category: str = "info") -> None:
    world.messages.append(Message(text=text, category=category))


def resolve_move(
    ecs: ECS,
    world: WorldState,
    state: GameState,
    config: GameConfig,
    rng: Rng,
    entity_id: int,
    dx: int,
    dy: int,
) -> bool:
    """Resolve one move action. Returns whether the action consumed a turn."""

    position = ecs.get_component(entity_id, "position")
    if not isinstance(position, Position):
        return False

    target_x = position.x + dx
    target_y = position.y + dy

    if not config.in_bounds(target_x, target_y):
        if entity_id == world.player_eid:
            add_message(world, "Can't go that way!", "blocked")
        return True

    tile = world.dungeon_grid[target_y][target_x]
    if not tile.walkable:
        if entity_id == world.player_eid:
            add_message(world, "A wall blocks your path.", "blocked")
        return True

    for other_id in ecs.entities_at(target_x, target_y):
        if other_id == entity_id:
            continue
        blocker = ecs.get_component(other_id, "blocker")
        target_health = ecs.get_component(other_id, "health")
        if blocker and not blocker.passable:
            attacker_is_hostile = ecs.has_component(entity_id, "hostile")
            target_is_hostile = ecs.has_component(other_id, "hostile")
            should_attack = target_is_hostile or (other_id == world.player_eid and attacker_is_hostile)
            if should_attack and isinstance(target_health, Health) and target_health.hp > 0:
                resolve_attack(ecs, world, state, rng, entity_id, other_id)
                return True
            if entity_id == world.player_eid:
                add_message(world, "That space is blocked.", "blocked")
            return True

    position.x = target_x
    position.y = target_y
    if entity_id == world.player_eid:
        pickup_items_at_player(ecs, world, state)
    return True


def resolve_attack(
    ecs: ECS,
    world: WorldState,
    state: GameState,
    rng: Rng,
    attacker_id: int,
    target_id: int,
) -> None:
    attacker_stats = ecs.get_component(attacker_id, "stats")
    target_health = ecs.get_component(target_id, "health")
    target_descriptor = ecs.get_component(target_id, "descriptor")
    attacker_descriptor = ecs.get_component(attacker_id, "descriptor")
    if attacker_stats is None or not isinstance(target_health, Health):
        return

    damage = rng.randint(3, 8) + attacker_stats.strength // 3
    critical = rng.chance(0.1)
    final_damage = int(damage * 1.5) if critical else damage

    if target_id == world.player_eid:
        status = ecs.get_component(target_id, "status")
        if isinstance(status, Status) and status.warding_boost > 0:
            add_message(world, "The ward turns the attack aside.", "combat")
            return
        if isinstance(status, Status) and status.damage_reduction_boost > 0:
            final_damage = max(
                1,
                int(final_damage * (1 - status.damage_reduction_percent)),
            )

    target_health.hp -= final_damage
    if attacker_id == world.player_eid:
        state.player_attacked_this_turn = True
    elif target_id == world.player_eid:
        state.enemy_attacked_this_turn = True

    target_name = getattr(target_descriptor, "name", "enemy")
    crit_text = " CRITICAL!" if critical else ""
    add_message(world, f"Dealt {final_damage} damage to {target_name}!{crit_text}", "combat")

    if target_health.hp > 0:
        return

    if target_id == world.player_eid:
        attacker_name = getattr(attacker_descriptor, "name", "attacker")
        state.game_over = True
        state.current = "gameOver"
        add_message(world, f"You have died! Killed by {attacker_name}.", "death")
        return

    if attacker_id == world.player_eid:
        xp_value = ecs.get_component(target_id, "xp_value")
        if isinstance(xp_value, int):
            gain_xp(ecs, world, xp_value, multiplier=state.xp_multiplier)

    drop_loot(ecs, world, state, rng, target_id)
    add_message(world, f"{target_name} defeated!", "combat")
    ecs.destroy_entity(target_id)


def gain_xp(ecs: ECS, world: WorldState, amount: int, *, multiplier: float = 1.0) -> None:
    if world.player_eid is None:
        return

    progress = ecs.get_component(world.player_eid, "progress")
    if not isinstance(progress, Progress):
        return

    gained = max(0, int(amount * multiplier))
    progress.xp += gained
    add_message(world, f"Gained {gained} XP.", "progress")

    while progress.xp >= progress.next_level_xp:
        progress.xp -= progress.next_level_xp
        progress.level += 1
        progress.next_level_xp = int(progress.next_level_xp * 1.5) + 10
        _apply_level_up(ecs, world, progress.level)


def _apply_level_up(ecs: ECS, world: WorldState, level: int) -> None:
    if world.player_eid is None:
        return

    health = ecs.get_component(world.player_eid, "health")
    stats = ecs.get_component(world.player_eid, "stats")

    if isinstance(health, Health):
        health.max_hp += 10
        health.hp = health.max_hp

    if isinstance(stats, Stats):
        stats.strength += 1
        stats.accuracy += 1
        if level % 2 == 0:
            stats.agility += 1

    add_message(world, f"You are now level {level}! (+stats, HP restored)", "progress")


def drop_loot(ecs: ECS, world: WorldState, state: GameState, rng: Rng, victim_id: int) -> None:
    position = ecs.get_component(victim_id, "position")
    loot_table = ecs.get_component(victim_id, "loot_table")
    if not isinstance(position, Position) or not isinstance(loot_table, list):
        return

    floor_bonus = abs(state.floor) * 0.05
    for drop in loot_table:
        if not isinstance(drop, LootDrop):
            continue
        if not rng.chance(min(drop.chance + floor_bonus, 0.95)):
            continue
        if drop.drop_type == "gold":
            amount = rng.randint(max(1, drop.min_amount), max(1, drop.max_amount))
            amount = max(1, int(amount * (1 + abs(state.floor) * 0.2)))
            create_gold_entity(ecs, position.x, position.y, amount)
        else:
            create_item_entity(ecs, position.x, position.y, drop.drop_type)


def process_enemy_ai(
    ecs: ECS,
    world: WorldState,
    state: GameState,
    config: GameConfig,
    rng: Rng,
) -> None:
    player_status = ecs.get_component(world.player_eid, "status") if world.player_eid is not None else None
    if isinstance(player_status, Status) and player_status.speed_boost > 0 and rng.chance(0.5):
        return

    player_position = _player_position(ecs, world)
    if player_position is None:
        return

    for entity_id in ecs.entities_with(["ai", "position", "health"]):
        health = ecs.get_component(entity_id, "health")
        position = ecs.get_component(entity_id, "position")
        ai = ecs.get_component(entity_id, "ai")
        if not isinstance(health, Health) or health.hp <= 0:
            continue
        if not isinstance(position, Position) or not isinstance(ai, AI):
            continue
        if ai.silenced > 0:
            ai.silenced -= 1
            continue

        movement = _movement_for_ai(ecs, world, config, rng, entity_id, position, ai, player_position)
        if movement is None:
            continue

        resolve_move(ecs, world, state, config, rng, entity_id, movement[0], movement[1])
        if state.game_over:
            return


def pickup_items_at_player(ecs: ECS, world: WorldState, state: GameState) -> None:
    if world.player_eid is None:
        return

    player_position = ecs.get_component(world.player_eid, "position")
    inventory = ecs.get_component(world.player_eid, "inventory")
    if not isinstance(player_position, Position) or not isinstance(inventory, Inventory):
        return

    for entity_id in list(ecs.entities_at(player_position.x, player_position.y)):
        if entity_id == world.player_eid:
            continue
        item = ecs.get_component(entity_id, "item")
        if not isinstance(item, Item):
            continue

        if item.gold_amount > 0:
            amount = max(1, int(item.gold_amount * state.gold_multiplier))
            state.player_gold += amount
            ecs.destroy_entity(entity_id)
            add_message(world, f"Picked up {amount} gold.", "pickup")
            continue

        if len(inventory.items) >= inventory.capacity:
            add_message(world, "Your pack is full.", "blocked")
            return

        inventory.items.append(item)
        ecs.destroy_entity(entity_id)
        add_message(world, f"Picked up {item.name}.", "pickup")


def use_inventory_item(ecs: ECS, world: WorldState, state: GameState, index: int, rng: Rng | None = None) -> bool:
    if world.player_eid is None:
        return False

    inventory = ecs.get_component(world.player_eid, "inventory")
    health = ecs.get_component(world.player_eid, "health")
    if not isinstance(inventory, Inventory):
        return False
    if index < 0 or index >= len(inventory.items):
        add_message(world, "There is no item there.", "blocked")
        return False

    item = inventory.items[index]
    if item.heal_amount > 0 and isinstance(health, Health):
        if health.hp >= health.max_hp:
            add_message(world, "You are already at full health.", "blocked")
            return False
        before = health.hp
        health.hp = min(health.max_hp, health.hp + item.heal_amount)
        del inventory.items[index]
        add_message(world, f"Used {item.name}. Restored {health.hp - before} HP.", "item")
        return True

    if item.stat_boost is not None:
        if apply_stat_boost(ecs, world, state, item):
            del inventory.items[index]
            return True
        return False

    if item.effect == "permanentBoost":
        if apply_permanent_boost(ecs, world, state, item):
            del inventory.items[index]
            return True
        return False

    if item.effect == "utility":
        if apply_utility_item(ecs, world, state, item):
            del inventory.items[index]
            return True
        return False

    if item.effect == "bomb":
        if use_bomb_item(ecs, world, state, item, rng):
            del inventory.items[index]
            return True
        return False

    add_message(world, f"Nothing happens when you use {item.name}.", "item")
    return False


def apply_stat_boost(ecs: ECS, world: WorldState, state: GameState, item: Item) -> bool:
    if world.player_eid is None:
        return False

    stats = ecs.get_component(world.player_eid, "stats")
    health = ecs.get_component(world.player_eid, "health")
    vision = ecs.get_component(world.player_eid, "vision")
    status = ecs.get_component(world.player_eid, "status")
    if not isinstance(stats, Stats) or not isinstance(status, Status):
        return False

    if item.stat_boost == "strength":
        if status.strength_boost > 0:
            add_message(world, "You are already empowered.", "blocked")
            return False
        stats.strength += item.boost_amount
        status.strength_boost = item.boost_turns
        status.strength_bonus_amount = item.boost_amount
        state.status_applied_this_turn = True
        add_message(
            world,
            f"Used {item.name}. Strength +{item.boost_amount} for {item.boost_turns} turns.",
            "item",
        )
        return True

    if item.stat_boost == "accuracy":
        if status.accuracy_boost > 0:
            add_message(world, "You are already focused.", "blocked")
            return False
        stats.accuracy += item.boost_amount
        status.accuracy_boost = item.boost_turns
        status.accuracy_bonus_amount = item.boost_amount
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Accuracy +{item.boost_amount} for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "evasion":
        if status.evasion_boost > 0:
            add_message(world, "You are already moving gracefully.", "blocked")
            return False
        stats.evasion += item.boost_amount
        stats.agility += item.agility_bonus
        status.evasion_boost = item.boost_turns
        status.evasion_bonus_amount = item.boost_amount
        status.agility_bonus_amount = item.agility_bonus
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Evasion +{item.boost_amount} for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "clarity":
        if status.clarity_boost > 0:
            add_message(world, "Your senses are already clear.", "blocked")
            return False
        accuracy_bonus = item.accuracy_bonus or item.boost_amount
        evasion_bonus = item.evasion_bonus or item.boost_amount
        stats.accuracy += accuracy_bonus
        stats.evasion += evasion_bonus
        status.clarity_boost = item.boost_turns
        status.clarity_accuracy_amount = accuracy_bonus
        status.clarity_evasion_amount = evasion_bonus
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Accuracy +{accuracy_bonus}, evasion +{evasion_bonus} for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "speed":
        if status.speed_boost > 0:
            add_message(world, "You are already hastened.", "blocked")
            return False
        status.speed_boost = item.boost_turns
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Speed boosted for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "light":
        if not isinstance(vision, Vision):
            return False
        if status.light_boost > 0:
            add_message(world, "Light already surrounds you.", "blocked")
            return False
        vision.radius = vision.base_radius + item.boost_amount
        status.light_boost = item.boost_turns
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Vision +{item.boost_amount} for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "damageReduction":
        if status.damage_reduction_boost > 0:
            add_message(world, "Your skin is already hardened.", "blocked")
            return False
        status.damage_reduction_boost = item.boost_turns
        status.damage_reduction_percent = item.reduction
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Damage reduced for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "regen":
        if status.regen_boost > 0:
            add_message(world, "You are already mending.", "blocked")
            return False
        status.regen_boost = item.boost_turns
        status.regen_amount = item.regen_amount or item.boost_amount or 1
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Regenerating for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "maxHealth" and isinstance(health, Health):
        if status.temp_max_hp_boost > 0:
            add_message(world, "You are already guarded.", "blocked")
            return False
        amount = item.temp_max_hp_amount or item.boost_amount
        health.max_hp += amount
        health.hp += amount
        status.temp_max_hp_boost = item.boost_turns
        status.temp_max_hp_amount = amount
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Max HP +{amount} for {item.boost_turns} turns.", "item")
        return True

    if item.stat_boost == "glassFury":
        if status.glass_fury_boost > 0:
            add_message(world, "Fury is already flooding you.", "blocked")
            return False
        stats.strength += item.boost_amount
        stats.evasion -= item.evasion_penalty
        status.glass_fury_boost = item.boost_turns
        status.glass_fury_strength_amount = item.boost_amount
        status.glass_fury_evasion_penalty = item.evasion_penalty
        state.status_applied_this_turn = True
        add_message(world, f"Used {item.name}. Strength +{item.boost_amount} for {item.boost_turns} turns.", "item")
        return True

    add_message(world, f"Nothing happens when you use {item.name}.", "item")
    return False


def apply_permanent_boost(ecs: ECS, world: WorldState, state: GameState, item: Item) -> bool:
    if world.player_eid is None:
        return False

    health = ecs.get_component(world.player_eid, "health")
    stats = ecs.get_component(world.player_eid, "stats")
    vision = ecs.get_component(world.player_eid, "vision")
    amount = item.permanent_amount

    if item.permanent_boost == "health" and isinstance(health, Health):
        health.max_hp += int(amount)
        health.hp += int(amount)
        add_message(world, f"Used {item.name}. Max HP +{int(amount)}.", "item")
        return True
    if item.permanent_boost == "vision" and isinstance(vision, Vision):
        vision.radius += int(amount)
        vision.base_radius += int(amount)
        add_message(world, f"Used {item.name}. Vision +{int(amount)}.", "item")
        return True
    if item.permanent_boost == "strength" and isinstance(stats, Stats):
        stats.strength += int(amount)
        add_message(world, f"Used {item.name}. Strength +{int(amount)}.", "item")
        return True
    if item.permanent_boost == "agility" and isinstance(stats, Stats):
        stats.agility += int(amount)
        stats.evasion += int(amount)
        add_message(world, f"Used {item.name}. Agility and evasion +{int(amount)}.", "item")
        return True
    if item.permanent_boost == "goldBonus":
        state.gold_multiplier += amount
        add_message(world, f"Used {item.name}. Gold pickups improved.", "item")
        return True
    if item.permanent_boost == "xpBonus":
        state.xp_multiplier += amount
        add_message(world, f"Used {item.name}. XP gains improved.", "item")
        return True
    return False


def apply_utility_item(ecs: ECS, world: WorldState, state: GameState, item: Item) -> bool:
    if world.player_eid is None:
        return False

    if item.utility_type == "mapping":
        vision = ecs.get_component(world.player_eid, "vision")
        if not isinstance(vision, Vision):
            return False
        for y, row in enumerate(world.dungeon_grid):
            for x, tile in enumerate(row):
                if tile.walkable:
                    vision.seen.add((x, y))
        add_message(world, "The floor etches itself into your memory.", "item")
        return True

    if item.utility_type == "detection":
        player_position = ecs.get_component(world.player_eid, "position")
        if not isinstance(player_position, Position):
            return False
        radius = item.radius or 8
        monsters = 0
        items = 0
        for entity_id in ecs.entities_with(["position"]):
            if entity_id == world.player_eid:
                continue
            position = ecs.get_component(entity_id, "position")
            if not isinstance(position, Position):
                continue
            if abs(position.x - player_position.x) + abs(position.y - player_position.y) > radius:
                continue
            monsters += 1 if ecs.has_component(entity_id, "health") else 0
            items += 1 if ecs.has_component(entity_id, "item") else 0
        add_message(world, f"You sense {monsters} foes and {items} items nearby.", "item")
        return True

    if item.utility_type == "blink":
        return blink_player(ecs, world, item.radius or 6)

    if item.utility_type == "silence":
        player_position = ecs.get_component(world.player_eid, "position")
        if not isinstance(player_position, Position):
            return False
        silenced = 0
        for entity_id in ecs.entities_with(["ai", "position"]):
            ai = ecs.get_component(entity_id, "ai")
            position = ecs.get_component(entity_id, "position")
            if not isinstance(ai, AI) or not isinstance(position, Position):
                continue
            if abs(position.x - player_position.x) + abs(position.y - player_position.y) <= (item.radius or 5):
                ai.active = False
                ai.silenced = item.boost_turns or 8
                silenced += 1
        add_message(world, f"A hush falls over {silenced} nearby foes.", "item")
        return True

    if item.utility_type == "warding":
        status = ecs.get_component(world.player_eid, "status")
        if not isinstance(status, Status):
            return False
        status.warding_boost = item.boost_turns or 5
        add_message(world, f"Used {item.name}. Warding for {status.warding_boost} turns.", "item")
        return True

    if item.utility_type == "antidote":
        status = ecs.get_component(world.player_eid, "status")
        if not isinstance(status, Status):
            return False
        status.damage_reduction_boost = 0
        status.warding_boost = 0
        add_message(world, "You feel cleansed.", "item")
        return True

    return False


def blink_player(ecs: ECS, world: WorldState, radius: int) -> bool:
    if world.player_eid is None:
        return False
    player_position = ecs.get_component(world.player_eid, "position")
    if not isinstance(player_position, Position):
        return False
    candidates: list[tuple[int, int]] = []
    for y, row in enumerate(world.dungeon_grid):
        for x, tile in enumerate(row):
            if abs(x - player_position.x) + abs(y - player_position.y) > radius:
                continue
            if not tile.walkable:
                continue
            blocked = any(
                entity_id != world.player_eid
                and (blocker := ecs.get_component(entity_id, "blocker")) is not None
                and not getattr(blocker, "passable", True)
                for entity_id in ecs.entities_at(x, y)
            )
            if not blocked:
                candidates.append((x, y))
    if not candidates:
        add_message(world, "The blink magic sputters out.", "blocked")
        return False
    target_x, target_y = candidates[0]
    player_position.x = target_x
    player_position.y = target_y
    add_message(world, "Space folds around you.", "item")
    return True


def use_bomb_item(ecs: ECS, world: WorldState, state: GameState, item: Item, rng: Rng | None = None) -> bool:
    if world.player_eid is None:
        return False
    player_position = ecs.get_component(world.player_eid, "position")
    if not isinstance(player_position, Position):
        return False

    radius = item.radius or 1
    damage = item.damage or 1
    hits = 0
    for entity_id in list(ecs.entities_with(["hostile", "position", "health"])):
        position = ecs.get_component(entity_id, "position")
        health = ecs.get_component(entity_id, "health")
        if not isinstance(position, Position) or not isinstance(health, Health):
            continue
        if max(abs(position.x - player_position.x), abs(position.y - player_position.y)) > radius:
            continue
        health.hp -= damage
        hits += 1
        if health.hp <= 0:
            xp_value = ecs.get_component(entity_id, "xp_value")
            if isinstance(xp_value, int):
                gain_xp(ecs, world, xp_value, multiplier=state.xp_multiplier)
            if rng is not None:
                drop_loot(ecs, world, state, rng, entity_id)
            add_message(world, f"{getattr(ecs.get_component(entity_id, 'descriptor'), 'name', 'enemy')} defeated!", "combat")
            ecs.destroy_entity(entity_id)

    state.player_attacked_this_turn = hits > 0
    add_message(world, f"The explosion hits {hits} enemies!" if hits else "The bomb fizzles harmlessly.", "item")
    return True


def drop_inventory_item(ecs: ECS, world: WorldState, index: int) -> bool:
    if world.player_eid is None:
        return False

    inventory = ecs.get_component(world.player_eid, "inventory")
    player_position = ecs.get_component(world.player_eid, "position")
    if not isinstance(inventory, Inventory) or not isinstance(player_position, Position):
        return False
    if index < 0 or index >= len(inventory.items):
        add_message(world, "There is no item there.", "blocked")
        return False

    item = inventory.items.pop(index)
    create_item_from_data(ecs, player_position.x, player_position.y, item)
    add_message(world, f"Dropped {item.name}.", "item")
    return True


def process_status_effects(ecs: ECS, world: WorldState) -> None:
    if world.player_eid is None:
        return

    status = ecs.get_component(world.player_eid, "status")
    stats = ecs.get_component(world.player_eid, "stats")
    health = ecs.get_component(world.player_eid, "health")
    vision = ecs.get_component(world.player_eid, "vision")
    if not isinstance(status, Status):
        return

    if status.light_boost > 0:
        status.light_boost -= 1
        if status.light_boost == 0 and isinstance(vision, Vision):
            vision.radius = vision.base_radius
            add_message(world, "The bright light fades.", "status")

    if status.speed_boost > 0:
        status.speed_boost -= 1
        if status.speed_boost == 0:
            add_message(world, "You return to normal speed.", "status")

    if status.strength_boost > 0:
        status.strength_boost -= 1
        if status.strength_boost == 0 and isinstance(stats, Stats) and status.strength_bonus_amount:
            stats.strength -= status.strength_bonus_amount
            status.strength_bonus_amount = 0
            add_message(world, "Your strength returns to normal.", "status")

    if status.accuracy_boost > 0:
        status.accuracy_boost -= 1
        if status.accuracy_boost == 0 and isinstance(stats, Stats) and status.accuracy_bonus_amount:
            stats.accuracy -= status.accuracy_bonus_amount
            status.accuracy_bonus_amount = 0
            add_message(world, "Your focus softens.", "status")

    if status.evasion_boost > 0:
        status.evasion_boost -= 1
        if status.evasion_boost == 0 and isinstance(stats, Stats):
            if status.evasion_bonus_amount:
                stats.evasion -= status.evasion_bonus_amount
            if status.agility_bonus_amount:
                stats.agility -= status.agility_bonus_amount
            status.evasion_bonus_amount = 0
            status.agility_bonus_amount = 0
            add_message(world, "Your graceful edge fades.", "status")

    if status.clarity_boost > 0:
        status.clarity_boost -= 1
        if status.clarity_boost == 0 and isinstance(stats, Stats):
            if status.clarity_accuracy_amount:
                stats.accuracy -= status.clarity_accuracy_amount
            if status.clarity_evasion_amount:
                stats.evasion -= status.clarity_evasion_amount
            status.clarity_accuracy_amount = 0
            status.clarity_evasion_amount = 0
            add_message(world, "Your clarity fades.", "status")

    if status.damage_reduction_boost > 0:
        status.damage_reduction_boost -= 1
        if status.damage_reduction_boost == 0:
            status.damage_reduction_percent = 0.35
            add_message(world, "Your skin softens.", "status")

    if status.regen_boost > 0:
        if isinstance(health, Health) and health.hp < health.max_hp:
            health.hp = min(health.max_hp, health.hp + max(1, status.regen_amount))
        status.regen_boost -= 1
        if status.regen_boost == 0:
            status.regen_amount = 0
            add_message(world, "The mending warmth fades.", "status")

    if status.temp_max_hp_boost > 0:
        status.temp_max_hp_boost -= 1
        if status.temp_max_hp_boost == 0 and isinstance(health, Health):
            health.max_hp = max(1, health.max_hp - status.temp_max_hp_amount)
            health.hp = min(health.hp, health.max_hp)
            status.temp_max_hp_amount = 0
            add_message(world, "The guardian force fades.", "status")

    if status.glass_fury_boost > 0:
        status.glass_fury_boost -= 1
        if status.glass_fury_boost == 0 and isinstance(stats, Stats):
            stats.strength -= status.glass_fury_strength_amount
            stats.evasion += status.glass_fury_evasion_penalty
            status.glass_fury_strength_amount = 0
            status.glass_fury_evasion_penalty = 0
            add_message(world, "The glass fury shatters.", "status")

    if status.warding_boost > 0:
        status.warding_boost -= 1
        if status.warding_boost == 0:
            add_message(world, "The ward fades.", "status")


def process_enemy_attacks(ecs: ECS, world: WorldState, state: GameState, rng: Rng) -> None:
    if state.enemy_attacked_this_turn or world.player_eid is None:
        return

    player_position = _player_position(ecs, world)
    if player_position is None:
        return

    for entity_id in ecs.entities_with(["hostile", "position", "health"]):
        health = ecs.get_component(entity_id, "health")
        position = ecs.get_component(entity_id, "position")
        if not isinstance(health, Health) or health.hp <= 0:
            continue
        if not isinstance(position, Position):
            continue
        if abs(position.x - player_position.x) + abs(position.y - player_position.y) == 1:
            resolve_attack(ecs, world, state, rng, entity_id, world.player_eid)
            if state.game_over:
                return


def _movement_for_ai(
    ecs: ECS,
    world: WorldState,
    config: GameConfig,
    rng: Rng,
    entity_id: int,
    position: Position,
    ai: AI,
    player_position: Position,
) -> tuple[int, int] | None:
    if ai.behavior == "random":
        if not rng.chance(0.7):
            return None
        return rng.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))

    if ai.behavior == "cautious":
        if can_see_player(ecs, world, config, entity_id):
            ai.active = True
            ai.last_player_pos = (player_position.x, player_position.y)
            dx = position.x - player_position.x
            dy = position.y - player_position.y
            if abs(dx) > abs(dy):
                return (1 if dx > 0 else -1, 0)
            if dy != 0:
                return (0, 1 if dy > 0 else -1)
        if rng.chance(0.35):
            return rng.choice(((1, 0), (-1, 0), (0, 1), (0, -1)))
        return None

    if ai.behavior not in {"chase", "aggressive"}:
        return None

    if ai.behavior == "aggressive" or can_see_player(ecs, world, config, entity_id):
        ai.active = True
        ai.last_player_pos = (player_position.x, player_position.y)

    if not ai.active or ai.last_player_pos is None:
        return None

    target_x, target_y = ai.last_player_pos
    dx = target_x - position.x
    dy = target_y - position.y
    if dx == 0 and dy == 0:
        return None
    if abs(dx) > abs(dy):
        return (1 if dx > 0 else -1, 0)
    return (0, 1 if dy > 0 else -1)


def can_see_player(ecs: ECS, world: WorldState, config: GameConfig, entity_id: int) -> bool:
    player_position = _player_position(ecs, world)
    position = ecs.get_component(entity_id, "position")
    vision = ecs.get_component(entity_id, "vision")
    if not isinstance(player_position, Position):
        return False
    if not isinstance(position, Position) or not isinstance(vision, Vision):
        return False

    dx = player_position.x - position.x
    dy = player_position.y - position.y
    if dx * dx + dy * dy > vision.radius * vision.radius:
        return False
    return has_line_of_sight(world, position.x, position.y, player_position.x, player_position.y)


def update_vision(ecs: ECS, world: WorldState, config: GameConfig, entity_id: int) -> None:
    position = ecs.get_component(entity_id, "position")
    vision = ecs.get_component(entity_id, "vision")
    if not isinstance(position, Position) or not isinstance(vision, Vision):
        return

    vision.visible.clear()
    vision.visible.add((position.x, position.y))
    vision.seen.add((position.x, position.y))

    radius = vision.radius
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx == 0 and dy == 0:
                continue
            target_x = position.x + dx
            target_y = position.y + dy
            if not config.in_bounds(target_x, target_y):
                continue
            if dx * dx + dy * dy > radius * radius:
                continue
            if has_line_of_sight(world, position.x, position.y, target_x, target_y):
                vision.visible.add((target_x, target_y))
                vision.seen.add((target_x, target_y))


def has_line_of_sight(world: WorldState, x0: int, y0: int, x1: int, y1: int) -> bool:
    line = bresenham_line(x0, y0, x1, y1)
    for x, y in line[1:-1]:
        if world.dungeon_grid[y][x].opaque:
            return False
    return True


def bresenham_line(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    x, y = x0, y0

    while True:
        points.append((x, y))
        if x == x1 and y == y1:
            break
        err2 = 2 * err
        if err2 > -dy:
            err -= dy
            x += sx
        if err2 < dx:
            err += dx
            y += sy
    return points


def _player_position(ecs: ECS, world: WorldState) -> Position | None:
    if world.player_eid is None:
        return None
    position = ecs.get_component(world.player_eid, "position")
    return position if isinstance(position, Position) else None
