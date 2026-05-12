"""A minimal renderer for the Python port."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from pathlib import Path

from dungeon_crawler.core.game import Game
from dungeon_crawler.core.models import Descriptor, Health, Inventory, Position, Progress, Stats, Status, Tile, Vision


UI_FONT_CANDIDATES = (
    "im fell english sc",
    "cinzel",
    "garamond",
    "book antiqua",
    "palatino linotype",
    "georgia",
    "serif",
)
GLYPH_FONT_CANDIDATES = ("consolas", "courier new", "monospace")


@dataclass(slots=True)
class AssetCache:
    tiles: dict[str, object] = field(default_factory=dict)
    sprites: dict[str, object] = field(default_factory=dict)

    @classmethod
    def load(cls, tile_size: int, asset_dir: Path | None = None) -> "AssetCache":
        pygame = _pygame()
        port_root = Path(__file__).resolve().parents[3]
        source = asset_dir or port_root / "assets" / "tiles"

        cache = cls()
        cache.tiles = {
            "tree": _load_image(pygame, source / "tree.png", tile_size),
            "rock": _load_image(pygame, source / "rock.png", tile_size),
            "sand": _load_image(pygame, source / "sand.png", tile_size),
            "dungeonEntrance": _load_image(pygame, source / "dungeonEntrance.png", tile_size),
            "dungeonExit": _load_image(pygame, source / "dungeonExit.png", tile_size),
        }
        cache.sprites = {
            "slime": _load_image(pygame, source / "slime.png", tile_size),
            "orcWarrior": _load_image(pygame, source / "orcWarrior.png", tile_size),
            "goblin": _load_image(pygame, source / "goblin.png", tile_size),
            "giantRat": _load_image(pygame, source / "giantRat.png", tile_size),
            "skeletonWarrior": _load_image(pygame, source / "skeletonWarrior.png", tile_size),
            "giantSpider": _load_image(pygame, source / "giantSpider.png", tile_size),
            "berserker": _load_image(pygame, source / "berserker.png", tile_size),
            "caveTroll": _load_image(pygame, source / "caveTroll.png", tile_size),
        }
        cache.tiles = {key: value for key, value in cache.tiles.items() if value is not None}
        cache.sprites = {key: value for key, value in cache.sprites.items() if value is not None}
        return cache


def render(
    screen: object,
    font: object,
    game: Game,
    tile_size: int,
    assets: AssetCache | None = None,
    *,
    ui_mode: str = "game",
    inventory_index: int = 0,
    map_view: tuple[int, int] | None = None,
) -> None:
    pygame = _pygame()
    screen.fill((12, 12, 18))
    visible, seen = _player_visibility(game)
    assets = assets or AssetCache()
    glyph_font = _glyph_font(max(8, tile_size - 4))
    world_width = game.config.dungeon_width * tile_size
    world_height = game.config.dungeon_height * tile_size
    world_surface = pygame.Surface((world_width, world_height))
    world_surface.fill((12, 12, 18))

    transition = game.world.overworld_transition if game.state.area == "overworld" else None
    if transition is not None:
        progress = min(1.0, max(0.0, (int(time.monotonic() * 1000) - transition.start_ms) / transition.duration_ms))
        eased = progress * progress * (3 - 2 * progress)
        direction_x, direction_y = transition.direction
        old_offset = (-direction_x * eased * world_width, -direction_y * eased * world_height)
        new_offset = (
            direction_x * (1 - eased) * world_width,
            direction_y * (1 - eased) * world_height,
        )
        _draw_grid(world_surface, transition.from_grid, tile_size, assets, glyph_font, visible, seen, old_offset)
        _draw_grid(world_surface, transition.to_grid, tile_size, assets, glyph_font, visible, seen, new_offset)
        _draw_entities(world_surface, font, game, tile_size, assets, visible, new_offset)
        if progress >= 1.0:
            game.world.overworld_transition = None
    else:
        _draw_grid(world_surface, game.world.dungeon_grid, tile_size, assets, glyph_font, visible, seen)
        _draw_entities(world_surface, font, game, tile_size, assets, visible)

    _apply_time_of_day_tint(world_surface, game)
    screen.blit(world_surface, (0, 0))

    panel_y = game.config.dungeon_height * tile_size
    _draw_hud(screen, font, game, panel_y)

    if game.state.game_over:
        _draw_game_over(screen, font)
    elif ui_mode == "menu":
        _draw_menu(screen, font, game)
    elif ui_mode == "inventory":
        _draw_inventory(screen, font, game, inventory_index)
    elif ui_mode == "map":
        _draw_overworld_map(screen, game, map_view)


def _pygame() -> object:
    import pygame

    return pygame


def _system_font(candidates: tuple[str, ...], size: int) -> object:
    pygame = _pygame()
    for name in candidates:
        path = pygame.font.match_font(name)
        if path:
            return pygame.font.Font(path, size)
    return pygame.font.SysFont(candidates[-1], size)


def _font(size: int) -> object:
    return _system_font(UI_FONT_CANDIDATES, size)


def _glyph_font(size: int) -> object:
    return _system_font(GLYPH_FONT_CANDIDATES, size)


def _load_image(pygame: object, path: Path, tile_size: int) -> object | None:
    if not path.exists():
        return None
    image = pygame.image.load(str(path))
    try:
        image = image.convert_alpha()
    except pygame.error:
        pass
    if image.get_width() != tile_size or image.get_height() != tile_size:
        image = pygame.transform.smoothscale(image, (tile_size, tile_size))
    return image


def _draw_grid(
    screen: object,
    grid: list[list[Tile]],
    tile_size: int,
    assets: AssetCache,
    glyph_font: object,
    visible: set[tuple[int, int]],
    seen: set[tuple[int, int]],
    offset: tuple[float, float] = (0, 0),
) -> None:
    pygame = _pygame()
    offset_x, offset_y = offset
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    origin_x, origin_y = _grid_origin(screen, grid, tile_size)
    for y, row in enumerate(grid):
        for x, tile in enumerate(row):
            coordinate = (x, y)
            left = round(origin_x + x * tile_size + offset_x)
            top = round(origin_y + y * tile_size + offset_y)
            rect = pygame.Rect(
                left,
                top,
                tile_size,
                tile_size,
            )
            pygame.draw.rect(screen, _tile_color(tile, coordinate, visible, seen), rect)
            image = assets.tiles.get(_tile_asset_key(tile))
            if image is not None and coordinate in visible:
                screen.blit(image, rect)
            elif coordinate in visible:
                _draw_tile_glyph(screen, glyph_font, tile, rect)


def _draw_entities(
    screen: object,
    font: object,
    game: Game,
    tile_size: int,
    assets: AssetCache,
    visible: set[tuple[int, int]],
    offset: tuple[float, float] = (0, 0),
) -> None:
    grid = game.world.dungeon_grid
    origin = _grid_origin(screen, grid, tile_size)
    player_id = game.world.player_eid
    for entity_id in game.ecs.entities_with(["position", "descriptor", "item"]):
        entity_pos = game.ecs.get_component(entity_id, "position")
        descriptor = game.ecs.get_component(entity_id, "descriptor")
        if _entity_should_render(entity_pos, visible) and isinstance(descriptor, Descriptor):
            _draw_entity(screen, font, tile_size, assets, entity_pos, descriptor, offset, origin)

    for entity_id in game.ecs.entities_with(["position", "descriptor", "hostile"]):
        entity_pos = game.ecs.get_component(entity_id, "position")
        descriptor = game.ecs.get_component(entity_id, "descriptor")
        if _entity_should_render(entity_pos, visible) and isinstance(descriptor, Descriptor):
            _draw_entity(screen, font, tile_size, assets, entity_pos, descriptor, offset, origin)

    if player_id is not None:
        player_pos = game.ecs.get_component(player_id, "position")
        if isinstance(player_pos, Position):
            _draw_entity(screen, font, tile_size, assets, player_pos, Descriptor("Hero", "@", "royalBlue"), offset, origin)


def _draw_entity(
    screen: object,
    font: object,
    tile_size: int,
    assets: AssetCache,
    position: Position,
    descriptor: Descriptor,
    offset: tuple[float, float] = (0, 0),
    origin: tuple[int, int] = (0, 0),
) -> None:
    offset_x, offset_y = offset
    origin_x, origin_y = origin
    draw_x = round(origin_x + position.x * tile_size + offset_x)
    draw_y = round(origin_y + position.y * tile_size + offset_y)
    rect_size = (tile_size, tile_size)
    image = assets.sprites.get(descriptor.sprite or "")
    if image is not None:
        screen.blit(image, (draw_x, draw_y))
        return

    glyph = font.render(descriptor.glyph, True, _color_for_descriptor(descriptor.color))
    screen.blit(glyph, glyph.get_rect(center=(draw_x + rect_size[0] // 2, draw_y + rect_size[1] // 2)))


def _grid_origin(screen: object, grid: list[list[Tile]], tile_size: int) -> tuple[int, int]:
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    board_width = cols * tile_size
    board_height = rows * tile_size
    return (
        max(0, (screen.get_width() - board_width) // 2),
        max(0, (screen.get_height() - board_height) // 2),
    )


def _draw_tile_glyph(screen: object, font: object, tile: Tile, rect: object) -> None:
    if not tile.glyph or tile.glyph == ".":
        return
    glyph = font.render(tile.glyph, True, _tile_glyph_color(tile))
    screen.blit(glyph, glyph.get_rect(center=rect.center))


def _tile_glyph_color(tile: Tile) -> tuple[int, int, int]:
    if tile.glyph in {">", "<"}:
        return (255, 215, 0)
    if tile.special == "tree":
        return (0, 45, 20)
    if tile.special == "rock":
        return (125, 80, 45)
    if tile.special == "bridge":
        return (82, 48, 24)
    return (255, 255, 255)


def _color_for_descriptor(color: str) -> tuple[int, int, int]:
    colors = {
        "green": (90, 210, 120),
        "red": (220, 80, 70),
        "orange": (245, 155, 75),
        "gold": (235, 200, 75),
        "brown": (150, 105, 70),
        "purple": (190, 120, 235),
        "white": (230, 230, 230),
    }
    return colors.get(color, (230, 230, 235))


def _player_visibility(game: Game) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    player_id = game.world.player_eid
    if player_id is None:
        return set(), set()
    vision = game.ecs.get_component(player_id, "vision")
    if not isinstance(vision, Vision):
        return set(), set()
    return set(vision.visible), set(vision.seen)


def _tile_color(
    tile: Tile,
    coordinate: tuple[int, int],
    visible: set[tuple[int, int]],
    seen: set[tuple[int, int]],
) -> tuple[int, int, int]:
    if coordinate in visible:
        return tile.color
    if coordinate in seen:
        return _scale_color(tile.color, 0.25)
    return (20, 20, 30)


def _tile_asset_key(tile: Tile) -> str | None:
    if tile.special in {"tree", "rock", "sand", "dungeonEntrance", "downStairs", "dungeonExit"}:
        return tile.special
    return None


def _scale_color(color: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(channel * factor))) for channel in color)


def _entity_should_render(entity_pos: object, visible: set[tuple[int, int]]) -> bool:
    if not isinstance(entity_pos, Position):
        return False
    return not visible or (entity_pos.x, entity_pos.y) in visible


def _message_color(category: str) -> tuple[int, int, int]:
    colors = {
        "blocked": (245, 170, 120),
        "combat": (245, 115, 105),
        "death": (255, 90, 90),
        "item": (130, 220, 170),
        "pickup": (235, 210, 105),
        "progress": (130, 190, 245),
        "status": (210, 170, 255),
        "system": (175, 185, 205),
    }
    return colors.get(category, (230, 230, 235))


def _draw_hud(screen: object, font: object, game: Game, panel_y: int) -> None:
    pygame = _pygame()
    width = screen.get_width()
    panel_height = max(156, screen.get_height() - panel_y)
    padding = 20
    gap = 22
    controls_y = panel_y + panel_height - 26
    content_y = panel_y + padding
    content_width = width - padding * 2
    meter_width = int(content_width * 0.34)
    info_x = padding + meter_width + gap
    info_width = content_width - meter_width - gap

    pygame.draw.rect(screen, (16, 16, 32), pygame.Rect(0, panel_y, width, panel_height))
    pygame.draw.line(screen, (68, 68, 68), (0, panel_y), (width, panel_y), 2)
    divider_x = info_x - gap // 2
    pygame.draw.line(screen, (120, 255, 170), (divider_x, content_y + 4), (divider_x, controls_y - 10), 1)
    pygame.draw.line(screen, (120, 255, 170), (padding, controls_y - 12), (width - padding, controls_y - 12), 1)

    player_id = game.world.player_eid
    health = game.ecs.get_component(player_id, "health") if player_id is not None else None
    progress = game.ecs.get_component(player_id, "progress") if player_id is not None else None
    status = game.ecs.get_component(player_id, "status") if player_id is not None else None

    _draw_meters(screen, padding, content_y, meter_width, health, progress)

    updates_y = _draw_time_line(screen, info_x, content_y, game)
    effects = _status_effects(status)
    if effects:
        updates_y = _draw_status_line(screen, info_x, updates_y + 8, info_width, effects) + 12
    _draw_messages(screen, game, info_x, updates_y, info_width, controls_y - updates_y - 14)
    _draw_controls(screen, padding, controls_y)


def _draw_meters(screen: object, x: int, y: int, width: int, health: object, progress: object) -> None:
    small_font = _font(14)
    value_font = _font(28)
    detail_font = _font(17)
    gap = 16
    meter_width = max(110, (width - gap) // 2)

    if isinstance(health, Health):
        hp_ratio = health.hp / max(1, health.max_hp)
        hp_color = _health_color(hp_ratio)
        _draw_meter(screen, small_font, value_font, "HEALTH", f"{health.hp}/{health.max_hp}", x, y, meter_width, hp_ratio, (90, 0, 0), hp_color)
    else:
        _draw_meter(screen, small_font, value_font, "HEALTH", "--/--", x, y, meter_width, 0, (90, 0, 0), (230, 230, 235))

    xp_x = x + meter_width + gap
    if isinstance(progress, Progress):
        xp_ratio = progress.xp / max(1, progress.next_level_xp)
        label_surface = small_font.render(f"LEVEL {progress.level}", True, (180, 180, 180))
        value_surface = value_font.render(str(progress.level), True, (230, 230, 235))
        detail_surface = detail_font.render(f"XP {progress.xp}/{progress.next_level_xp}", True, (160, 190, 255))
        screen.blit(label_surface, (xp_x, y))
        screen.blit(value_surface, (xp_x, y + 17))
        screen.blit(detail_surface, (xp_x, y + 48))
        _draw_bar(screen, xp_x, y + 74, meter_width, 20, xp_ratio, (24, 30, 58), (75, 135, 245))


def _draw_meter(
    screen: object,
    label_font: object,
    value_font: object,
    label: str,
    value: str,
    x: int,
    y: int,
    width: int,
    ratio: float,
    bg_color: tuple[int, int, int],
    fill_color: tuple[int, int, int],
) -> None:
    screen.blit(label_font.render(label, True, (180, 180, 180)), (x, y))
    screen.blit(value_font.render(value, True, fill_color), (x, y + 17))
    _draw_bar(screen, x, y + 74, width, 20, ratio, bg_color, fill_color)


def _draw_status_line(screen: object, x: int, y: int, width: int, effects: list[str]) -> int:
    label_font = _font(14)
    text_font = _font(17)
    screen.blit(label_font.render("STATUS", True, (120, 255, 170)), (x, y))
    text = _fit_text("   ".join(effects), text_font, width)
    screen.blit(text_font.render(text, True, (120, 255, 170)), (x, y + 20))
    return y + 40


def _draw_time_line(screen: object, x: int, y: int, game: Game) -> int:
    label_font = _font(14)
    value_font = _font(20)
    phase = game.day_phase().upper()
    phase_color = (255, 218, 128) if phase == "DAY" else (142, 170, 255)
    screen.blit(label_font.render("TIME", True, phase_color), (x, y))
    screen.blit(value_font.render(f"{game.clock_text()}  {phase}", True, (230, 230, 235)), (x, y + 18))
    return y + 42


def _draw_messages(screen: object, game: Game, x: int, y: int, width: int, height: int) -> None:
    message_font = _font(17)
    line_height = 22
    max_messages = max(1, min(4, height // line_height))
    messages = game.world.messages[-max_messages:]
    for index, message in enumerate(messages):
        is_latest = index == len(messages) - 1
        color = (240, 240, 245) if is_latest else (175, 180, 194)
        if message.category in {"combat", "death", "blocked", "pickup", "item", "progress", "status"}:
            color = _message_color(message.category) if is_latest else _scale_color(_message_color(message.category), 0.78)
        text = _fit_text(message.text, message_font, width)
        screen.blit(message_font.render(text, True, color), (x, y + index * line_height))


def _draw_controls(screen: object, x: int, y: int) -> None:
    control_font = _font(14)
    controls = "WASD MOVE        I INVENTORY        M MAP        ESC MENU"
    screen.blit(control_font.render(controls, True, (160, 165, 178)), (x, y))


def _draw_bar(
    screen: object,
    x: int,
    y: int,
    width: int,
    height: int,
    ratio: float,
    bg_color: tuple[int, int, int],
    fill_color: tuple[int, int, int],
) -> None:
    pygame = _pygame()
    ratio = max(0, min(1, ratio))
    rect = pygame.Rect(x, y, width, height)
    pygame.draw.rect(screen, bg_color, rect)
    pygame.draw.rect(screen, fill_color, pygame.Rect(x, y, int(width * ratio), height))
    pygame.draw.rect(screen, (96, 96, 110), rect, 1)


def _draw_menu(screen: object, font: object, game: Game) -> None:
    player_id = game.world.player_eid
    health = game.ecs.get_component(player_id, "health") if player_id is not None else None
    stats = game.ecs.get_component(player_id, "stats") if player_id is not None else None
    progress = game.ecs.get_component(player_id, "progress") if player_id is not None else None
    inventory = game.ecs.get_component(player_id, "inventory") if player_id is not None else None
    status = game.ecs.get_component(player_id, "status") if player_id is not None else None

    panel_width = 520
    panel_height = 360
    x = (screen.get_width() - panel_width) // 2
    y = (screen.get_height() - panel_height) // 2
    _draw_overlay_box(screen, x, y, panel_width, panel_height)

    title_font = _font(38)
    title = title_font.render("MENU", True, (255, 235, 120))
    screen.blit(title, (x + (panel_width - title.get_width()) // 2, y + 22))

    left_x = x + 34
    right_x = x + 286
    row_y = y + 98
    line_height = 26
    stat_font = _font(18)
    dim = (175, 180, 194)
    bright = (232, 232, 238)

    location = "Overworld" if game.state.area == "overworld" else f"Floor {game.state.floor}"
    health_text = f"{health.hp}/{health.max_hp}" if isinstance(health, Health) else "--/--"
    level_text = str(progress.level) if isinstance(progress, Progress) else "--"
    xp_text = f"{progress.xp}/{progress.next_level_xp}" if isinstance(progress, Progress) else "--/--"
    inventory_text = f"{len(inventory.items)}/{inventory.capacity}" if isinstance(inventory, Inventory) else "--"
    str_text = str(stats.strength) if isinstance(stats, Stats) else "--"
    agi_text = str(stats.agility) if isinstance(stats, Stats) else "--"
    acc_text = str(stats.accuracy) if isinstance(stats, Stats) else "--"
    eva_text = str(stats.evasion) if isinstance(stats, Stats) else "--"

    left_lines = [
        ("Location", location),
        ("Health", health_text),
        ("Level", f"{level_text}  XP {xp_text}"),
        ("Time", f"{game.clock_text()} {game.day_phase().title()}"),
        ("Turn", str(game.state.turn_count)),
        ("Gold", str(game.state.player_gold)),
        ("Inventory", inventory_text),
    ]
    right_lines = [
        ("STR", str_text),
        ("AGI", agi_text),
        ("ACC", acc_text),
        ("EVA", eva_text),
    ]

    for index, (label, value) in enumerate(left_lines):
        _draw_menu_stat(screen, stat_font, label, value, left_x, row_y + index * line_height, dim, bright)
    for index, (label, value) in enumerate(right_lines):
        _draw_menu_stat(screen, stat_font, label, value, right_x, row_y + index * line_height, dim, bright)

    status_y = row_y + len(left_lines) * line_height + 8
    screen.blit(stat_font.render("STATUS", True, dim), (left_x, status_y))
    effects = _status_effects(status)
    status_text = _fit_text(", ".join(effects) if effects else "Clear", stat_font, panel_width - 160)
    screen.blit(stat_font.render(status_text, True, (120, 255, 170) if effects else bright), (left_x + 88, status_y))

    footer_font = _font(16)
    footer = "ESC: resume    R: restart    F5: save    F9: load"
    footer_surface = footer_font.render(footer, True, (170, 178, 194))
    screen.blit(footer_surface, (x + (panel_width - footer_surface.get_width()) // 2, y + panel_height - 32))


def _apply_time_of_day_tint(surface: object, game: Game) -> None:
    tint_color, alpha = _time_of_day_tint(game.clock_minutes())
    if alpha <= 0:
        return
    pygame = _pygame()
    overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
    overlay.fill((*tint_color, alpha))
    surface.blit(overlay, (0, 0))


def _time_of_day_tint(minutes: int) -> tuple[tuple[int, int, int], int]:
    minute = minutes % (24 * 60)
    points = (
        (0, (3, 8, 36), 136),
        (4 * 60 + 45, (6, 18, 72), 118),
        (5 * 60 + 45, (36, 80, 156), 76),
        (6 * 60 + 30, (255, 160, 64), 54),
        (8 * 60, (255, 218, 144), 18),
        (10 * 60, (255, 255, 255), 0),
        (16 * 60 + 30, (255, 255, 255), 0),
        (17 * 60 + 45, (255, 174, 74), 48),
        (18 * 60 + 45, (70, 108, 202), 72),
        (20 * 60, (8, 18, 72), 132),
        (24 * 60, (3, 8, 36), 136),
    )

    for index in range(len(points) - 1):
        start_minute, start_color, start_alpha = points[index]
        end_minute, end_color, end_alpha = points[index + 1]
        if start_minute <= minute <= end_minute:
            ratio = (minute - start_minute) / max(1, end_minute - start_minute)
            return (
                _lerp_color(start_color, end_color, ratio),
                round(start_alpha + (end_alpha - start_alpha) * ratio),
            )
    return points[0][1], points[0][2]


def _lerp_color(
    start: tuple[int, int, int],
    end: tuple[int, int, int],
    ratio: float,
) -> tuple[int, int, int]:
    clamped = max(0.0, min(1.0, ratio))
    return tuple(round(a + (b - a) * clamped) for a, b in zip(start, end))


def _draw_inventory(screen: object, font: object, game: Game, inventory_index: int) -> None:
    player_id = game.world.player_eid
    inventory = game.ecs.get_component(player_id, "inventory") if player_id is not None else None
    items = inventory.items if isinstance(inventory, Inventory) else []

    box_width = 620
    box_height = 520
    x = (screen.get_width() - box_width) // 2
    y = (screen.get_height() - box_height) // 2
    _draw_overlay_box(screen, x, y, box_width, box_height)

    title_font = _font(30)
    list_font = _font(20)
    desc_font = _font(16)
    title_count = f"{len(items)}/{inventory.capacity}" if isinstance(inventory, Inventory) else "0/0"
    title = title_font.render(f"Inventory ({title_count})", True, (230, 230, 235))
    screen.blit(title, (x + 22, y + 18))

    if not items:
        empty = list_font.render("(empty)", True, (170, 178, 194))
        screen.blit(empty, (x + 22, y + 86))
    else:
        row_height = 28
        visible_items = items[:12]
        for index, item in enumerate(visible_items):
            row_y = y + 78 + index * row_height
            item_y = row_y + 4
            selected = index == inventory_index
            if selected:
                pygame = _pygame()
                pygame.draw.rect(screen, (60, 60, 120), pygame.Rect(x + 16, row_y, box_width - 32, row_height))
            color = (255, 235, 150) if selected else (220, 224, 232)
            line = _fit_text(f"{index + 1}. {_item_summary(item)}", list_font, box_width - 48)
            screen.blit(list_font.render(line, True, color), (x + 24, item_y))

        selected_item = items[min(inventory_index, len(items) - 1)]
        description = _fit_text(_item_description(selected_item), desc_font, box_width - 44)
        screen.blit(desc_font.render(description, True, (150, 205, 255)), (x + 22, y + box_height - 62))

    footer = desc_font.render("Up/Down: select   Enter: use   D: drop   I/Esc: close", True, (170, 178, 194))
    screen.blit(footer, (x + 22, y + box_height - 30))


def _draw_overworld_map(screen: object, game: Game, map_view: tuple[int, int] | None) -> None:
    pygame = _pygame()
    overlay = pygame.Surface((screen.get_width(), screen.get_height()), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 209))
    screen.blit(overlay, (0, 0))

    entries = [
        (section, grid)
        for section, grid in sorted(game.world.overworld_sections.items())
        if grid
    ]
    title_font = _font(28)
    _draw_centered_text(screen, title_font, "Overworld Map", screen.get_width() // 2, 24, (244, 244, 244))

    if not entries:
        empty_font = _font(20)
        _draw_centered_text(screen, empty_font, "No visited chunks", screen.get_width() // 2, 82, (170, 170, 170))
        return

    min_x = min(section[0] for section, _grid in entries)
    max_x = max(section[0] for section, _grid in entries)
    min_y = min(section[1] for section, _grid in entries)
    max_y = max(section[1] for section, _grid in entries)
    max_visible_chunks = 6
    current = game.world.overworld_section
    view_x, view_y = map_view or _map_viewport_for_center(current, (min_x, max_x, min_y, max_y))
    view_max_x = min(max_x, view_x + max_visible_chunks - 1)
    view_max_y = min(max_y, view_y + max_visible_chunks - 1)
    visible_entries = [
        (section, grid)
        for section, grid in entries
        if view_x - 1 <= section[0] <= view_max_x + 1 and view_y - 1 <= section[1] <= view_max_y + 1
    ]

    chunk_cols = view_max_x - view_x + 1
    chunk_rows = view_max_y - view_y + 1
    tile_w = game.config.dungeon_width
    tile_h = game.config.dungeon_height
    gap = 4
    max_map_width = screen.get_width() - 80
    max_map_height = max(120, screen.get_height() - 160)
    cell_by_width = (max_map_width - gap * (chunk_cols - 1)) // max(1, chunk_cols * tile_w)
    cell_by_height = (max_map_height - gap * (chunk_rows - 1)) // max(1, chunk_rows * tile_h)
    cell_size = max(1, min(8, cell_by_width, cell_by_height))
    chunk_w = tile_w * cell_size
    chunk_h = tile_h * cell_size
    map_w = chunk_cols * chunk_w + (chunk_cols - 1) * gap
    map_h = chunk_rows * chunk_h + (chunk_rows - 1) * gap
    origin_x = (screen.get_width() - map_w) // 2
    origin_y = (screen.get_height() - map_h) // 2 + 14
    player_pos = game.ecs.get_component(game.world.player_eid, "position") if game.world.player_eid is not None else None
    player_blink_on = (pygame.time.get_ticks() // 350) % 2 == 0

    for section, grid in visible_entries:
        chunk_x = origin_x + (section[0] - view_x) * (chunk_w + gap)
        chunk_y = origin_y + (section[1] - view_y) * (chunk_h + gap)

        for y in range(tile_h):
            row = grid[y] if y < len(grid) else []
            for x in range(tile_w):
                tile = row[x] if x < len(row) else None
                pygame.draw.rect(
                    screen,
                    _map_tile_color(tile),
                    pygame.Rect(chunk_x + x * cell_size, chunk_y + y * cell_size, cell_size, cell_size),
                )

        for y in range(tile_h):
            row = grid[y] if y < len(grid) else []
            for x in range(tile_w):
                tile = row[x] if x < len(row) else None
                if tile is not None and tile.special == "dungeonEntrance":
                    pygame.draw.rect(
                        screen,
                        (0, 0, 0),
                        pygame.Rect(chunk_x + x * cell_size, chunk_y + y * cell_size, cell_size, cell_size),
                    )

        if player_blink_on and isinstance(player_pos, Position) and section == current:
            marker_size = max(cell_size, 3)
            marker_x = chunk_x + player_pos.x * cell_size + (cell_size - marker_size) // 2
            marker_y = chunk_y + player_pos.y * cell_size + (cell_size - marker_size) // 2
            pygame.draw.rect(screen, (255, 31, 31), pygame.Rect(marker_x, marker_y, marker_size, marker_size))

        border_color = (255, 255, 255) if section == current else (160, 160, 180, 140)
        border_width = 2 if section == current else 1
        pygame.draw.rect(screen, border_color, pygame.Rect(chunk_x - 1, chunk_y - 1, chunk_w + 2, chunk_h + 2), border_width)

    footer_font = _font(16)
    _draw_centered_text(
        screen,
        footer_font,
        "Arrows/WASD: scroll   M/Esc: close",
        screen.get_width() // 2,
        screen.get_height() - 34,
        (204, 204, 204),
    )


def _draw_overlay_box(screen: object, x: int, y: int, width: int, height: int) -> None:
    pygame = _pygame()
    overlay = pygame.Surface((screen.get_width(), screen.get_height()), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 204))
    screen.blit(overlay, (0, 0))
    pygame.draw.rect(screen, (20, 20, 40), pygame.Rect(x, y, width, height))
    pygame.draw.rect(screen, (136, 136, 255), pygame.Rect(x, y, width, height), 2)


def _draw_menu_stat(
    screen: object,
    font: object,
    label: str,
    value: str,
    x: int,
    y: int,
    label_color: tuple[int, int, int],
    value_color: tuple[int, int, int],
) -> None:
    screen.blit(font.render(f"{label}:", True, label_color), (x, y))
    screen.blit(font.render(value, True, value_color), (x + 108, y))


def _draw_centered_text(
    screen: object,
    font: object,
    text: str,
    center_x: int,
    y: int,
    color: tuple[int, int, int],
) -> None:
    surface = font.render(text, True, color)
    screen.blit(surface, (center_x - surface.get_width() // 2, y))


def _map_tile_color(tile: Tile | None) -> tuple[int, int, int]:
    if tile is None:
        return (5, 6, 8)

    if tile.special == "dungeonEntrance":
        return (246, 211, 101)
    if tile.special == "tree":
        return (15, 79, 38)
    if tile.special == "rock":
        return (119, 115, 107)
    if tile.special == "bridge":
        return (154, 99, 47)
    if tile.special == "sand":
        return (194, 170, 101)
    if tile.special == "water":
        return (72, 167, 216) if tile.walkable else (19, 94, 168)
    if tile.special == "ocean":
        return (69, 164, 200) if tile.walkable else (8, 47, 112)
    if tile.glyph in {"<", ">"}:
        return (246, 211, 101)
    if not tile.walkable:
        return (51, 52, 58)
    return tile.color


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


def _item_summary(item: object) -> str:
    name = getattr(item, "name", "Unknown")
    heal = getattr(item, "heal_amount", 0)
    boost = getattr(item, "stat_boost", None)
    amount = getattr(item, "boost_amount", 0)
    turns = getattr(item, "boost_turns", 0)
    if heal:
        return f"{name} (+{heal} HP)"
    if boost:
        return f"{name} (+{amount} {boost.upper()}, {turns}t)"
    return name


def _item_description(item: object) -> str:
    name = getattr(item, "name", "Unknown")
    heal = getattr(item, "heal_amount", 0)
    boost = getattr(item, "stat_boost", None)
    amount = getattr(item, "boost_amount", 0)
    turns = getattr(item, "boost_turns", 0)
    gold = getattr(item, "gold_amount", 0)
    if heal:
        return f"{name}: Restores {heal} health."
    if boost:
        return f"{name}: Raises {boost.upper()} by {amount} for {turns} turns."
    if gold:
        return f"{name}: Worth {gold} gold."
    return f"{name}: No description."


def _health_color(ratio: float) -> tuple[int, int, int]:
    if ratio > 0.6:
        return (95, 210, 105)
    if ratio > 0.3:
        return (220, 205, 90)
    return (230, 90, 90)


def _status_effects(status: object) -> list[str]:
    if not isinstance(status, Status):
        return []
    effects: list[str] = []
    if status.strength_boost > 0:
        effects.append(f"STR +{status.strength_bonus_amount} ({status.strength_boost}t)")
    if status.accuracy_boost > 0:
        effects.append(f"ACC +{status.accuracy_bonus_amount} ({status.accuracy_boost}t)")
    if status.evasion_boost > 0:
        effects.append(f"EVA ({status.evasion_boost}t)")
    if status.speed_boost > 0:
        effects.append(f"SPD ({status.speed_boost}t)")
    if status.light_boost > 0:
        effects.append(f"VIS ({status.light_boost}t)")
    if status.clarity_boost > 0:
        effects.append(f"CLARITY ({status.clarity_boost}t)")
    if status.damage_reduction_boost > 0:
        effects.append(f"WARD ({status.damage_reduction_boost}t)")
    if status.regen_boost > 0:
        effects.append(f"REGEN ({status.regen_boost}t)")
    if status.temp_max_hp_boost > 0:
        effects.append(f"MAX HP ({status.temp_max_hp_boost}t)")
    if status.glass_fury_boost > 0:
        effects.append(f"FURY ({status.glass_fury_boost}t)")
    if status.warding_boost > 0:
        effects.append(f"WARDING ({status.warding_boost}t)")
    return effects


def _fit_text(text: str, font: object, max_width: int) -> str:
    if font.size(text)[0] <= max_width:
        return text

    ellipsis = "..."
    out = text
    while out and font.size(out + ellipsis)[0] > max_width:
        out = out[:-1]
    return out + ellipsis if out else ellipsis


def _draw_game_over(screen: object, font: object) -> None:
    pygame = _pygame()
    width = screen.get_width()
    height = screen.get_height()
    overlay = pygame.Surface((width, height), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 150))
    screen.blit(overlay, (0, 0))

    title_font = _font(34)
    subtext_font = _font(20)
    text = title_font.render("Game Over", True, (255, 90, 90))
    subtext = subtext_font.render("Press R to restart", True, (230, 230, 235))
    screen.blit(text, ((width - text.get_width()) // 2, height // 2 - 28))
    screen.blit(subtext, ((width - subtext.get_width()) // 2, height // 2 + 4))
