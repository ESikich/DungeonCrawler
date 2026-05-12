"""Minimal pygame app for the Python dungeon crawler port."""

from __future__ import annotations

import math
from copy import deepcopy
from pathlib import Path

from dungeon_crawler.core.game import Action, Game
from dungeon_crawler.core.models import Inventory, Position
from dungeon_crawler.core.serialization import dumps_game, loads_game
from dungeon_crawler.core.systems import add_message

from .crt import CRTEffect
from .crt_tuning import (
    TUNING_KNOBS,
    adjust_tuning,
    load_tuning,
    save_tuning,
    tuning_summary,
    tuning_value_text,
)
from .crt_tuning_panel import CRTTuningPanel
from .input import action_from_key, command_from_key
from .renderer import AssetCache, render


SAVE_PATH = Path("savegame.json")
CRT_TUNING_PATH = Path("crt_tuning.json")
HUD_HEIGHT = 156
TILE_SIZE = 32
MIN_WINDOW_SIZE = (400, 350)


def main() -> None:
    try:
        import pygame
    except ModuleNotFoundError as exc:
        raise RuntimeError("pygame is not installed. Install it to run the local adapter.") from exc

    pygame.init()
    tile_size = TILE_SIZE
    game = Game()
    game.new_game(seed=7)
    setup_playable_demo(game)

    logical_size = _logical_size(game, tile_size)
    screen, gl_display = _create_display(pygame, logical_size)
    canvas = pygame.Surface(logical_size)
    pygame.display.set_caption("Dungeon Crawler Python Port")
    font = pygame.font.SysFont("monospace", 20)
    assets = AssetCache.load(tile_size)
    crt_effect = None if gl_display is not None else CRTEffect(logical_size)
    crt_tuning = load_tuning(CRT_TUNING_PATH)
    crt_tuning_index = 0
    crt_tuning_panel = CRTTuningPanel(visible=True)
    _apply_crt_tuning(gl_display, crt_effect, crt_tuning)
    _announce_crt_tuning(pygame, crt_tuning, crt_tuning_index, prefix="CRT tuning loaded")
    clock = pygame.time.Clock()
    ui_mode = "game"
    inventory_index = 0
    map_view: tuple[int, int] | None = None

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif _is_resize_event(pygame, event):
                event_size = _resize_event_size(event)
                if event_size is None:
                    continue
                window_size = _aspect_locked_window_size(event_size, _window_size(pygame, screen), logical_size)
                screen, gl_display, crt_effect = _resize_display(
                    pygame,
                    window_size,
                    logical_size,
                    gl_display,
                    crt_effect,
                )
                _apply_crt_tuning(gl_display, crt_effect, crt_tuning)
            elif event.type == pygame.KEYDOWN:
                handled, crt_tuning = crt_tuning_panel.handle_event(event, pygame, crt_tuning, CRT_TUNING_PATH)
                if handled:
                    _apply_crt_tuning(gl_display, crt_effect, crt_tuning)
                    continue
                handled, crt_tuning, crt_tuning_index = _handle_crt_tuning_key(
                    event,
                    pygame,
                    crt_tuning,
                    crt_tuning_index,
                    CRT_TUNING_PATH,
                )
                if handled:
                    _apply_crt_tuning(gl_display, crt_effect, crt_tuning)
                    continue
                if ui_mode == "menu":
                    game, running, ui_mode = _handle_menu_key(
                        event.key,
                        pygame,
                        game,
                        running,
                    )
                elif ui_mode == "inventory":
                    game, ui_mode, inventory_index = _handle_inventory_key(
                        event.key,
                        pygame,
                        game,
                        inventory_index,
                    )
                elif ui_mode == "map":
                    game, ui_mode, map_view = _handle_map_key(event.key, pygame, game, map_view)
                else:
                    game, running, ui_mode, map_view = _handle_game_key(event.key, pygame, game, running, map_view)
                    inventory_index = _clamp_inventory_index(game, inventory_index)
            elif event.type in {pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION} or (
                hasattr(pygame, "MOUSEWHEEL") and event.type == pygame.MOUSEWHEEL
            ):
                handled, crt_tuning = crt_tuning_panel.handle_event(event, pygame, crt_tuning, CRT_TUNING_PATH)
                if handled:
                    _apply_crt_tuning(gl_display, crt_effect, crt_tuning)

        render(
            canvas,
            font,
            game,
            tile_size,
            assets,
            ui_mode=ui_mode,
            inventory_index=inventory_index,
            map_view=map_view,
        )
        overlay = crt_tuning_panel.render(pygame, _window_size(pygame, screen), crt_tuning)
        if gl_display is not None:
            gl_display.set_area(game.state.area)
            gl_display.present(canvas, _window_size(pygame, screen), overlay=overlay)
        else:
            assert crt_effect is not None
            crt_effect.set_area(game.state.area)
            _blit_scaled_canvas(pygame, screen, canvas, crt_effect=crt_effect)
            if overlay is not None:
                screen.blit(overlay, (0, 0))
        pygame.display.flip()
        clock.tick(30)

    pygame.quit()


def _logical_size(game: Game, tile_size: int) -> tuple[int, int]:
    return game.config.dungeon_width * tile_size, game.config.dungeon_height * tile_size + HUD_HEIGHT


def _apply_crt_tuning(gl_display: object | None, crt_effect: object | None, tuning: object) -> None:
    if gl_display is not None:
        gl_display.apply_tuning(tuning)
    if crt_effect is not None and hasattr(crt_effect, "apply_tuning"):
        crt_effect.apply_tuning(tuning)


def _handle_crt_tuning_key(
    event: object,
    pygame: object,
    tuning: object,
    tuning_index: int,
    path: Path,
) -> tuple[bool, object, int]:
    knob = TUNING_KNOBS[tuning_index]

    if event.key == pygame.K_F2:
        direction = -1 if getattr(event, "mod", 0) & pygame.KMOD_SHIFT else 1
        tuning_index = (tuning_index + direction) % len(TUNING_KNOBS)
        _announce_crt_tuning(pygame, tuning, tuning_index, prefix="CRT knob")
        return True, tuning, tuning_index

    if event.key == pygame.K_F3:
        adjust_tuning(tuning, knob, -1)
        _announce_crt_tuning(pygame, tuning, tuning_index, prefix="CRT adjusted")
        return True, tuning, tuning_index

    if event.key == pygame.K_F4:
        adjust_tuning(tuning, knob, 1)
        _announce_crt_tuning(pygame, tuning, tuning_index, prefix="CRT adjusted")
        return True, tuning, tuning_index

    if event.key == pygame.K_F6:
        save_tuning(path, tuning)
        print(f"Saved CRT tuning to {path}: {tuning_summary(tuning)}")
        return True, tuning, tuning_index

    if event.key == pygame.K_F7:
        tuning = load_tuning(path)
        _announce_crt_tuning(pygame, tuning, tuning_index, prefix=f"Reloaded {path}")
        return True, tuning, tuning_index

    if event.key == pygame.K_F8:
        print("CRT tuning controls: F2 next knob, Shift+F2 previous, F3/F4 adjust or toggle, F6 save, F7 reload, F8 print.")
        print(f"Current CRT tuning: {tuning_summary(tuning)}")
        _announce_crt_tuning(pygame, tuning, tuning_index, prefix="CRT tuning")
        return True, tuning, tuning_index

    return False, tuning, tuning_index


def _announce_crt_tuning(pygame: object, tuning: object, tuning_index: int, *, prefix: str) -> None:
    knob = TUNING_KNOBS[tuning_index]
    value = tuning_value_text(tuning, knob)
    message = f"{prefix}: {knob.label} = {value}"
    pygame.display.set_caption(f"Dungeon Crawler Python Port - {knob.label}: {value}")
    print(message)


def _window_size(pygame: object, screen: object) -> tuple[int, int]:
    get_window_size = getattr(pygame.display, "get_window_size", None)
    if get_window_size is not None:
        return get_window_size()
    return screen.get_size()


def _is_resize_event(pygame: object, event: object) -> bool:
    event_types = {pygame.VIDEORESIZE}
    for name in ("WINDOWRESIZED", "WINDOWSIZECHANGED"):
        value = getattr(pygame, name, None)
        if value is not None:
            event_types.add(value)
    return event.type in event_types


def _resize_event_size(event: object) -> tuple[int, int] | None:
    if hasattr(event, "size"):
        return event.size
    if hasattr(event, "x") and hasattr(event, "y"):
        return event.x, event.y
    return None


def _create_display(pygame: object, logical_size: tuple[int, int]) -> tuple[object, object | None]:
    try:
        from .gl_crt import OpenGLCRTDisplay

        pygame.display.gl_set_attribute(pygame.GL_DOUBLEBUFFER, 1)
        screen = pygame.display.set_mode(logical_size, pygame.RESIZABLE | pygame.OPENGL | pygame.DOUBLEBUF)
        return screen, OpenGLCRTDisplay(pygame, logical_size)
    except Exception as exc:
        print(f"OpenGL CRT unavailable, using software CRT: {exc}")
        screen = pygame.display.set_mode(logical_size, pygame.RESIZABLE)
        return screen, None


def _resize_display(
    pygame: object,
    window_size: tuple[int, int],
    logical_size: tuple[int, int],
    gl_display: object | None,
    crt_effect: object | None,
) -> tuple[object, object | None, object | None]:
    if gl_display is None:
        return pygame.display.set_mode(window_size, pygame.RESIZABLE), None, crt_effect

    try:
        from .gl_crt import OpenGLCRTDisplay

        screen = pygame.display.set_mode(window_size, pygame.RESIZABLE | pygame.OPENGL | pygame.DOUBLEBUF)
        return screen, OpenGLCRTDisplay(pygame, logical_size), None
    except Exception as exc:
        print(f"OpenGL CRT resize failed, using software CRT: {exc}")
        screen = pygame.display.set_mode(window_size, pygame.RESIZABLE)
        return screen, None, CRTEffect(logical_size)


def _clamp_window_size(size: tuple[int, int]) -> tuple[int, int]:
    return max(MIN_WINDOW_SIZE[0], size[0]), max(MIN_WINDOW_SIZE[1], size[1])


def _aspect_locked_window_size(
    requested_size: tuple[int, int],
    previous_size: tuple[int, int],
    logical_size: tuple[int, int],
) -> tuple[int, int]:
    requested_w, requested_h = _clamp_window_size(requested_size)
    previous_w, previous_h = _clamp_window_size(previous_size)
    logical_w, logical_h = logical_size

    if abs(requested_w - previous_w) >= abs(requested_h - previous_h):
        width = requested_w
        height = round(width * logical_h / logical_w)
    else:
        height = requested_h
        width = round(height * logical_w / logical_h)

    scale = max(MIN_WINDOW_SIZE[0] / width, MIN_WINDOW_SIZE[1] / height, 1)
    return round(width * scale), round(height * scale)


def _scaled_canvas_rect(logical_size: tuple[int, int], window_size: tuple[int, int]) -> tuple[int, int, int, int]:
    logical_w, logical_h = logical_size
    window_w, window_h = window_size
    scale = min(window_w / logical_w, window_h / logical_h)
    scaled_w = max(1, int(logical_w * scale))
    scaled_h = max(1, int(logical_h * scale))
    x = (window_w - scaled_w) // 2
    y = (window_h - scaled_h) // 2
    return x, y, scaled_w, scaled_h


def _blit_scaled_canvas(
    pygame: object,
    screen: object,
    canvas: object,
    *,
    crt_effect: object | None = None,
) -> None:
    ticks = pygame.time.get_ticks()
    if crt_effect is not None and hasattr(crt_effect, "apply_shader") and hasattr(crt_effect, "apply_post_draw"):
        presented = crt_effect.apply_shader(canvas, ticks=ticks)
    else:
        presented = crt_effect.apply(canvas) if crt_effect is not None else canvas

    rect = _scaled_canvas_rect(presented.get_size(), screen.get_size())
    screen.fill((0, 0, 0))
    if rect[2:] == presented.get_size():
        scaled = presented
    else:
        scaled = pygame.transform.scale(presented, rect[2:])

    if crt_effect is not None and hasattr(crt_effect, "apply_shader") and hasattr(crt_effect, "apply_post_draw"):
        scaled = crt_effect.apply_post_draw(scaled, ticks=ticks)

    screen.blit(scaled, rect[:2])


def _handle_game_key(
    key: int,
    pygame: object,
    game: Game,
    running: bool,
    map_view: tuple[int, int] | None,
) -> tuple[Game, bool, str, tuple[int, int] | None]:
    command = command_from_key(key, pygame)
    if command == "quit":
        return game, False, "game", map_view
    if command == "menu":
        return game, running, "menu", map_view
    if command == "inventory":
        return game, running, "inventory", map_view
    if command == "map":
        ui_mode, map_view = _open_map(game, map_view)
        return game, running, ui_mode, map_view
    if command == "save":
        _save_game(game)
        return game, running, "game", map_view
    if command == "load":
        return _load_game(game), running, "game", map_view

    action = action_from_key(key, pygame)
    if action is not None:
        game.dispatch(action)
        if action.kind == "restart":
            setup_playable_demo(game)
    return game, running, "game", map_view


def _handle_menu_key(
    key: int,
    pygame: object,
    game: Game,
    running: bool,
) -> tuple[Game, bool, str]:
    if key == pygame.K_ESCAPE:
        return game, running, "game"
    if key == pygame.K_r:
        game.new_game(seed=7)
        setup_playable_demo(game)
        return game, running, "game"
    if key == pygame.K_F5:
        _save_game(game)
        return game, running, "menu"
    if key == pygame.K_F9:
        return _load_game(game), running, "menu"
    if key == pygame.K_q:
        return game, False, "menu"
    return game, running, "menu"


def _handle_inventory_key(
    key: int,
    pygame: object,
    game: Game,
    inventory_index: int,
) -> tuple[Game, str, int]:
    inventory_count = _inventory_count(game)
    if key in {pygame.K_ESCAPE, pygame.K_i}:
        return game, "game", inventory_index
    if key in {pygame.K_UP, pygame.K_w} and inventory_count:
        return game, "inventory", (inventory_index - 1) % inventory_count
    if key in {pygame.K_DOWN, pygame.K_s} and inventory_count:
        return game, "inventory", (inventory_index + 1) % inventory_count
    if key in {pygame.K_RETURN, pygame.K_SPACE} and inventory_count:
        game.dispatch(Action.use_item(inventory_index))
        return game, "game", _clamp_inventory_index(game, inventory_index)
    if key == pygame.K_d and inventory_count:
        game.dispatch(Action.drop_item(inventory_index))
        return game, "game", _clamp_inventory_index(game, inventory_index)
    return game, "inventory", inventory_index


def _handle_map_key(
    key: int,
    pygame: object,
    game: Game,
    map_view: tuple[int, int] | None,
) -> tuple[Game, str, tuple[int, int] | None]:
    if key in {pygame.K_ESCAPE, pygame.K_m}:
        return game, "game", map_view
    if key in {pygame.K_UP, pygame.K_w}:
        return game, "map", _pan_map_view(game, map_view, 0, -1)
    if key in {pygame.K_DOWN, pygame.K_s}:
        return game, "map", _pan_map_view(game, map_view, 0, 1)
    if key in {pygame.K_LEFT, pygame.K_a}:
        return game, "map", _pan_map_view(game, map_view, -1, 0)
    if key in {pygame.K_RIGHT, pygame.K_d}:
        return game, "map", _pan_map_view(game, map_view, 1, 0)
    return game, "map", map_view


def _open_map(game: Game, map_view: tuple[int, int] | None) -> tuple[str, tuple[int, int] | None]:
    if game.state.area != "overworld":
        add_message(game.world, "You can only check the map in the overworld.", "blocked")
        return "game", map_view

    _save_current_overworld_section(game)
    return "map", _map_viewport_for_center(game.world.overworld_section, _visited_map_bounds(game))


def _pan_map_view(game: Game, map_view: tuple[int, int] | None, dx: int, dy: int) -> tuple[int, int]:
    bounds = _visited_map_bounds(game)
    view = map_view or _map_viewport_for_center(game.world.overworld_section, bounds)
    max_visible_chunks = 6
    max_view_x = max(bounds[0], bounds[1] - max_visible_chunks + 1)
    max_view_y = max(bounds[2], bounds[3] - max_visible_chunks + 1)
    next_x = min(max(view[0] + dx, bounds[0]), max_view_x)
    next_y = min(max(view[1] + dy, bounds[2]), max_view_y)
    return next_x, next_y


def _map_viewport_for_center(center: tuple[int, int], bounds: tuple[int, int, int, int]) -> tuple[int, int]:
    min_x, max_x, min_y, max_y = bounds
    max_visible_chunks = 6
    visited_width = max_x - min_x + 1
    visited_height = max_y - min_y + 1
    x = math.floor(center[0] - (max_visible_chunks - 1) / 2)
    y = math.floor(center[1] - (max_visible_chunks - 1) / 2)

    if visited_width <= max_visible_chunks:
        x = min_x
    else:
        x = min(max(x, min_x), max_x - max_visible_chunks + 1)

    if visited_height <= max_visible_chunks:
        y = min_y
    else:
        y = min(max(y, min_y), max_y - max_visible_chunks + 1)

    return x, y


def _visited_map_bounds(game: Game) -> tuple[int, int, int, int]:
    sections = game.world.overworld_sections
    if not sections:
        section_x, section_y = game.world.overworld_section
        return section_x, section_x, section_y, section_y

    xs = [section[0] for section in sections]
    ys = [section[1] for section in sections]
    return min(xs), max(xs), min(ys), max(ys)


def _save_current_overworld_section(game: Game) -> None:
    if game.state.area == "overworld" and game.world.dungeon_grid:
        game.world.overworld_sections[game.world.overworld_section] = deepcopy(game.world.dungeon_grid)


def _save_game(game: Game) -> None:
    SAVE_PATH.write_text(dumps_game(game), encoding="utf-8")
    add_message(game.world, f"Saved to {SAVE_PATH}.", "system")


def _load_game(game: Game) -> Game:
    if SAVE_PATH.exists():
        loaded = loads_game(SAVE_PATH.read_text(encoding="utf-8"))
        add_message(loaded.world, f"Loaded {SAVE_PATH}.", "system")
        return loaded
    add_message(game.world, "No save file found.", "blocked")
    return game


def _inventory_count(game: Game) -> int:
    player_id = game.world.player_eid
    if player_id is None:
        return 0
    inventory = game.ecs.get_component(player_id, "inventory")
    return len(inventory.items) if isinstance(inventory, Inventory) else 0


def _clamp_inventory_index(game: Game, inventory_index: int) -> int:
    inventory_count = _inventory_count(game)
    if inventory_count == 0:
        return 0
    return max(0, min(inventory_index, inventory_count - 1))


def setup_playable_demo(game: Game) -> None:
    player_id = game.world.player_eid
    if player_id is None:
        return

    player_position = game.ecs.get_component(player_id, "position")
    if not isinstance(player_position, Position):
        return

    if game.state.area == "dungeon":
        _place_item(game, player_position.x + 1, player_position.y, "gold", amount=7)
        _place_item(game, player_position.x + 2, player_position.y, "healing_potion")
        _place_item(game, player_position.x, player_position.y + 1, "strength_elixir")
        _place_monster(game, player_position.x + 4, player_position.y, "slime")
        _place_monster(game, player_position.x + 6, player_position.y + 1, "goblin")
        _place_monster(game, player_position.x - 3, player_position.y + 2, "rat")
        add_message(game.world, "Dungeon supplies seeded for this demo.", "system")
        return
    add_message(game.world, "Find a dungeon entrance. Press I for inventory, Esc for menu.", "system")


def _place_item(game: Game, x: int, y: int, item_type: str, *, amount: int = 0) -> None:
    position = _nearest_open_tile(game, x, y)
    if position is None:
        return
    if item_type == "gold":
        game.spawn_gold(position.x, position.y, amount)
    else:
        game.spawn_item(position.x, position.y, item_type)


def _place_monster(game: Game, x: int, y: int, monster_type: str) -> None:
    position = _nearest_open_tile(game, x, y)
    if position is not None:
        game.spawn_monster_type(monster_type, position.x, position.y)


def _nearest_open_tile(game: Game, preferred_x: int, preferred_y: int) -> Position | None:
    candidates = [(preferred_x, preferred_y)]
    for radius in range(1, 8):
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if abs(dx) + abs(dy) == radius:
                    candidates.append((preferred_x + dx, preferred_y + dy))

    for x, y in candidates:
        if not game.config.in_bounds(x, y):
            continue
        if not game.world.dungeon_grid[y][x].walkable:
            continue
        if game.ecs.entities_at(x, y):
            continue
        return Position(x, y)
    return None
