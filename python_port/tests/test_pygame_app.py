def test_pygame_adapter_modules_import_without_initializing_pygame() -> None:
    import dungeon_crawler.pygame_app.app
    import dungeon_crawler.pygame_app.input
    import dungeon_crawler.pygame_app.renderer

    assert dungeon_crawler.pygame_app.app.main is not None


def test_input_maps_game_actions_and_commands() -> None:
    from dungeon_crawler.core.game import Action
    from dungeon_crawler.pygame_app.input import action_from_key, command_from_key

    class FakePygame:
        K_1 = 1
        K_UP = 10
        K_w = 11
        K_DOWN = 12
        K_s = 13
        K_LEFT = 14
        K_a = 15
        K_RIGHT = 16
        K_d = 17
        K_SPACE = 18
        K_r = 19
        K_BACKSPACE = 20
        K_F5 = 21
        K_F9 = 22
        K_ESCAPE = 23
        K_i = 24
        K_q = 25
        K_m = 26

    assert action_from_key(FakePygame.K_1, FakePygame) is None
    assert action_from_key(FakePygame.K_BACKSPACE, FakePygame) is None
    assert action_from_key(FakePygame.K_UP, FakePygame) == Action.move(0, -1)
    assert action_from_key(FakePygame.K_r, FakePygame) == Action.restart()
    assert command_from_key(FakePygame.K_i, FakePygame) == "inventory"
    assert command_from_key(FakePygame.K_m, FakePygame) == "map"
    assert command_from_key(FakePygame.K_ESCAPE, FakePygame) == "menu"
    assert command_from_key(FakePygame.K_F5, FakePygame) == "save"
    assert command_from_key(FakePygame.K_F9, FakePygame) == "load"


def test_playable_demo_does_not_seed_items_in_overworld() -> None:
    from dungeon_crawler.core.game import Game
    from dungeon_crawler.pygame_app.app import setup_playable_demo

    game = Game()
    game.new_game(seed=4)
    setup_playable_demo(game)

    assert game.state.area == "overworld"
    assert game.ecs.entities_with(["item"]) == []


def test_js_tile_assets_are_mirrored_into_python_port() -> None:
    from pathlib import Path

    asset_dir = Path(__file__).resolve().parents[1] / "assets" / "tiles"
    expected = {
        "berserker.png",
        "caveTroll.png",
        "dungeonEntrance.png",
        "dungeonExit.png",
        "giantRat.png",
        "giantSpider.png",
        "goblin.png",
        "orcWarrior.png",
        "rock.png",
        "sand.png",
        "skeletonWarrior.png",
        "slime.png",
        "tree.png",
    }

    assert {path.name for path in asset_dir.glob("*.png")} == expected


def test_renderer_uses_tile_background_color_before_assets() -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.core import tiles
    from dungeon_crawler.core.game import Game
    from dungeon_crawler.pygame_app.renderer import AssetCache, render

    pygame.init()
    try:
        tile_size = 32
        game = Game()
        game.new_game(seed=7)
        game.world.dungeon_grid[0][0] = tiles.grass()
        game.world.dungeon_grid[0][1] = tiles.water()
        player_id = game.world.player_eid
        vision = game.ecs.get_component(player_id, "vision")
        vision.visible.update({(0, 0), (1, 0)})
        vision.seen.update({(0, 0), (1, 0)})
        screen = pygame.display.set_mode(
            (game.config.dungeon_width * tile_size, game.config.dungeon_height * tile_size + 156)
        )
        font = pygame.font.SysFont("monospace", 20)

        render(screen, font, game, tile_size, AssetCache())

        assert screen.get_at((2, 2))[:3] == tiles.grass().color
        assert screen.get_at((tile_size + 2, 2))[:3] == tiles.water().color
    finally:
        pygame.quit()


def test_map_viewport_centers_and_pans_like_js() -> None:
    from dungeon_crawler.core.game import Game
    from dungeon_crawler.pygame_app.app import _map_viewport_for_center, _pan_map_view

    game = Game()
    game.new_game(seed=7)
    game.world.overworld_sections = {
        (-3, 0): game.world.dungeon_grid,
        (0, 0): game.world.dungeon_grid,
        (3, 0): game.world.dungeon_grid,
        (4, 0): game.world.dungeon_grid,
    }

    assert _map_viewport_for_center((0, 0), (-3, 4, 0, 0)) == (-3, 0)
    assert _pan_map_view(game, (-3, 0), 1, 0) == (-2, 0)
    assert _pan_map_view(game, (-2, 0), 99, 0) == (-1, 0)


def test_window_scaling_preserves_logical_aspect_ratio() -> None:
    from dungeon_crawler.core.game import Game
    from dungeon_crawler.pygame_app.app import (
        _aspect_locked_window_size,
        _clamp_window_size,
        _logical_size,
        _scaled_canvas_rect,
    )

    game = Game()
    assert _logical_size(game, 32) == (800, 700)
    assert _clamp_window_size((200, 100)) == (400, 350)
    assert _aspect_locked_window_size((1200, 700), (800, 700), (800, 700)) == (1200, 1050)
    assert _aspect_locked_window_size((800, 1000), (800, 700), (800, 700)) == (1143, 1000)
    assert _aspect_locked_window_size((200, 100), (800, 700), (800, 700)) == (400, 350)
    assert _scaled_canvas_rect((800, 700), (1600, 1400)) == (0, 0, 1600, 1400)
    assert _scaled_canvas_rect((800, 700), (1200, 700)) == (200, 0, 800, 700)
    assert _scaled_canvas_rect((800, 700), (800, 1000)) == (0, 150, 800, 700)


def test_crt_effect_matches_js_area_tuning() -> None:
    from dungeon_crawler.pygame_app.crt import CRTEffect

    effect = CRTEffect((160, 120))
    effect.set_area("overworld")

    assert effect.settings.glow is False
    assert effect.settings.brightness == 1.08
    assert effect.settings.saturation == 1.12

    effect.set_area("dungeon")

    assert effect.settings.glow is True
    assert effect.settings.brightness == 1.3
    assert effect.settings.saturation == 1.3


def test_crt_effect_applies_scanlines_and_vignette() -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.pygame_app.crt import CRTEffect

    pygame.init()
    try:
        pygame.display.set_mode((1, 1))
        source = pygame.Surface((160, 120))
        source.fill((120, 120, 120))

        effect = CRTEffect(source.get_size())
        effect.settings.glow = False
        effect.settings.noise = False
        effect.settings.brightness = 1.0
        effect.settings.saturation = 1.0

        processed = effect.apply(source, ticks=0)

        assert processed.get_at((2, 2))[:3] != source.get_at((2, 2))[:3]
        assert processed.get_at((80, 8))[:3] != processed.get_at((80, 10))[:3]
    finally:
        pygame.quit()


def test_blit_scaled_canvas_uses_crt_output_when_present() -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.pygame_app.app import _blit_scaled_canvas

    class FakeCRTEffect:
        def __init__(self) -> None:
            self.called = False

        def apply(self, canvas: object) -> object:
            self.called = True
            output = canvas.copy()
            output.fill((255, 0, 0))
            return output

    pygame.init()
    try:
        screen = pygame.display.set_mode((160, 120))
        canvas = pygame.Surface((160, 120))
        canvas.fill((0, 0, 255))
        effect = FakeCRTEffect()

        _blit_scaled_canvas(pygame, screen, canvas, crt_effect=effect)

        assert effect.called is True
        assert screen.get_at((10, 10))[:3] == (255, 0, 0)
    finally:
        pygame.quit()


def test_renderer_draws_overworld_map_overlay() -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.core.game import Game
    from dungeon_crawler.pygame_app.renderer import AssetCache, render

    pygame.init()
    try:
        tile_size = 32
        game = Game()
        game.new_game(seed=7)
        screen = pygame.display.set_mode(
            (game.config.dungeon_width * tile_size, game.config.dungeon_height * tile_size + 156)
        )
        font = pygame.font.SysFont("monospace", 20)

        render(screen, font, game, tile_size, AssetCache(), ui_mode="map", map_view=(0, 0))

        assert screen.get_at((screen.get_width() // 2, 30))[:3] != (12, 12, 18)
    finally:
        pygame.quit()
