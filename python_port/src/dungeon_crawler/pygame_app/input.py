"""Input mapping for the minimal pygame adapter."""

from __future__ import annotations

from dungeon_crawler.core.game import Action


def command_from_key(key: int, pygame_module: object) -> str | None:
    if key == pygame_module.K_F5:
        return "save"
    if key == pygame_module.K_F9:
        return "load"
    if key == pygame_module.K_ESCAPE:
        return "menu"
    if key == pygame_module.K_i:
        return "inventory"
    if key == pygame_module.K_m:
        return "map"
    if key == pygame_module.K_q:
        return "quit"
    return None


def action_from_key(key: int, pygame_module: object) -> Action | None:
    if key in {pygame_module.K_UP, pygame_module.K_w}:
        return Action.move(0, -1)
    if key in {pygame_module.K_DOWN, pygame_module.K_s}:
        return Action.move(0, 1)
    if key in {pygame_module.K_LEFT, pygame_module.K_a}:
        return Action.move(-1, 0)
    if key in {pygame_module.K_RIGHT, pygame_module.K_d}:
        return Action.move(1, 0)
    if key == pygame_module.K_SPACE:
        return Action.wait()
    if key == pygame_module.K_r:
        return Action.restart()
    return None
