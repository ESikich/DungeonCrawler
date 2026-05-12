def test_pygame_adapter_modules_import_without_initializing_pygame() -> None:
    import dungeon_crawler.pygame_app.app
    import dungeon_crawler.pygame_app.gl_crt
    import dungeon_crawler.pygame_app.input
    import dungeon_crawler.pygame_app.renderer
    import dungeon_crawler.pygame_app.crt_tuning_panel

    assert dungeon_crawler.pygame_app.app.main is not None
    assert dungeon_crawler.pygame_app.gl_crt.OpenGLCRTDisplay is not None
    assert dungeon_crawler.pygame_app.crt_tuning_panel.CRTTuningPanel is not None


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
        _is_resize_event,
        _logical_size,
        _resize_event_size,
        _scaled_canvas_rect,
        _window_size,
    )

    class FakeDisplay:
        def get_window_size(self) -> tuple[int, int]:
            return 1280, 720

    class FakePygame:
        VIDEORESIZE = 1
        WINDOWRESIZED = 2
        display = FakeDisplay()

    class FakeScreen:
        def get_size(self) -> tuple[int, int]:
            return 800, 700

    class FakeEvent:
        def __init__(self, event_type: int, **kwargs: int | tuple[int, int]) -> None:
            self.type = event_type
            for key, value in kwargs.items():
                setattr(self, key, value)

    game = Game()
    assert _logical_size(game, 32) == (800, 700)
    assert _clamp_window_size((200, 100)) == (400, 350)
    assert _aspect_locked_window_size((1200, 700), (800, 700), (800, 700)) == (1200, 1050)
    assert _aspect_locked_window_size((800, 1000), (800, 700), (800, 700)) == (1143, 1000)
    assert _aspect_locked_window_size((200, 100), (800, 700), (800, 700)) == (400, 350)
    assert _scaled_canvas_rect((800, 700), (1600, 1400)) == (0, 0, 1600, 1400)
    assert _scaled_canvas_rect((800, 700), (1200, 700)) == (200, 0, 800, 700)
    assert _scaled_canvas_rect((800, 700), (800, 1000)) == (0, 150, 800, 700)
    assert _window_size(FakePygame, FakeScreen()) == (1280, 720)
    assert _is_resize_event(FakePygame, FakeEvent(FakePygame.WINDOWRESIZED)) is True
    assert _resize_event_size(FakeEvent(FakePygame.VIDEORESIZE, size=(1024, 768))) == (1024, 768)
    assert _resize_event_size(FakeEvent(FakePygame.WINDOWRESIZED, x=1024, y=768)) == (1024, 768)


def test_opengl_crt_uses_browser_container_geometry() -> None:
    import pytest

    from dungeon_crawler.pygame_app.gl_crt import _crt_container_rect, _game_container_rect

    container = _crt_container_rect((1200, 900))
    assert container == pytest.approx((129.15, 12.0, 941.7, 876))

    game = _game_container_rect(container)
    assert game == pytest.approx((
        container[0] + container[2] * 0.0349,
        container[1] + container[3] * 0.05,
        container[2] * (1 - 0.0349 * 2),
        container[3] * (1 - 0.05 - 0.075),
    ))


def test_opengl_static_noise_matches_js_canvas_shape() -> None:
    import numpy as np

    from dungeon_crawler.pygame_app.gl_crt import _build_noise_canvas_frame, _noise_canvas_size

    size = _noise_canvas_size((800, 700))
    frame = _build_noise_canvas_frame(np.random.default_rng(17), size, 0.24, 0.0268)

    assert size == (200, 175)
    assert frame.shape == (175, 200, 4)
    assert frame.dtype == np.uint8
    assert set(np.unique(frame[:, :, 3])).issubset({0, 7})
    assert np.count_nonzero(frame[:, :, 3]) > 0
    assert not np.array_equal(frame[:, :, 0], frame[:, :, 1])


def test_crt_vignette_darkens_edges_without_brightening_center() -> None:
    import numpy as np

    from dungeon_crawler.pygame_app.crt import _vignette_multiplier

    u, v = np.meshgrid(
        np.asarray([0.0, 0.5, 1.0], dtype=np.float32),
        np.asarray([0.0, 0.5, 1.0], dtype=np.float32),
        indexing="ij",
    )

    full = _vignette_multiplier(np, u, v, 1.0)
    off = _vignette_multiplier(np, u, v, 0.0)

    assert np.allclose(off, 1.0)
    assert full[0, 0] == 0.0
    assert 0.95 < full[1, 1] <= 1.0
    assert full[0, 0] < full[1, 1]


def test_screen_glass_overlay_restores_css_radial_layer() -> None:
    import numpy as np

    from dungeon_crawler.pygame_app.crt import _screen_glass_overlay_alphas

    u, v = np.meshgrid(
        np.asarray([0.0, 0.5, 1.0], dtype=np.float32),
        np.asarray([0.0, 0.5, 1.0], dtype=np.float32),
        indexing="ij",
    )

    highlight, edge = _screen_glass_overlay_alphas(np, u, v, 0.09, 0.45)

    assert highlight[1, 1] > 0.08
    assert highlight[0, 0] == 0.0
    assert edge[1, 1] == 0.0
    assert edge[0, 0] > 0.0


def test_crt_tuning_can_adjust_save_and_load(tmp_path) -> None:
    from dungeon_crawler.pygame_app.crt_tuning import (
        CRTTuning,
        TUNING_KNOBS,
        adjust_tuning,
        load_tuning,
        save_tuning,
    )

    assert all(knob.name != "shader_noise_strength" for knob in TUNING_KNOBS)

    tuning = CRTTuning()
    brightness = next(knob for knob in TUNING_KNOBS if knob.name == "brightness_dungeon")
    curvature = next(knob for knob in TUNING_KNOBS if knob.name == "curvature")

    adjust_tuning(tuning, brightness, -1)
    adjust_tuning(tuning, curvature, 1)

    path = tmp_path / "crt_tuning.json"
    save_tuning(path, tuning)
    loaded = load_tuning(path)

    assert loaded.brightness_dungeon == 1.28
    assert loaded.curvature is False


def test_crt_tuning_hotkeys_adjust_and_save(tmp_path) -> None:
    from dungeon_crawler.pygame_app.app import _handle_crt_tuning_key
    from dungeon_crawler.pygame_app.crt_tuning import CRTTuning

    class FakeDisplay:
        caption = ""

        def set_caption(self, value: str) -> None:
            self.caption = value

    class FakePygame:
        KMOD_SHIFT = 1
        K_F2 = 2
        K_F3 = 3
        K_F4 = 4
        K_F6 = 6
        K_F7 = 7
        K_F8 = 8
        display = FakeDisplay()

    class FakeEvent:
        def __init__(self, key: int, mod: int = 0) -> None:
            self.key = key
            self.mod = mod

    path = tmp_path / "crt_tuning.json"
    tuning = CRTTuning()

    handled, tuning, index = _handle_crt_tuning_key(FakeEvent(FakePygame.K_F4), FakePygame, tuning, 0, path)
    assert handled is True
    assert index == 0
    assert tuning.brightness_dungeon == 1.32

    handled, tuning, index = _handle_crt_tuning_key(FakeEvent(FakePygame.K_F2), FakePygame, tuning, index, path)
    assert handled is True
    assert index == 1

    handled, tuning, index = _handle_crt_tuning_key(FakeEvent(FakePygame.K_F6), FakePygame, tuning, index, path)
    assert handled is True
    assert path.exists()


def test_crt_tuning_panel_renders_and_saves(tmp_path) -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.pygame_app.crt_tuning import CRTTuning
    from dungeon_crawler.pygame_app.crt_tuning_panel import CRTTuningPanel

    class FakeEvent:
        def __init__(self, event_type: int, **kwargs) -> None:
            self.type = event_type
            for key, value in kwargs.items():
                setattr(self, key, value)

    pygame.init()
    try:
        pygame.display.set_mode((800, 700))
        tuning = CRTTuning()
        panel = CRTTuningPanel(visible=True)
        overlay = panel.render(pygame, pygame.display.get_window_size(), tuning)

        assert overlay is not None
        assert overlay.get_size() == (800, 700)

        handled, tuning = panel.handle_event(
            FakeEvent(pygame.MOUSEBUTTONDOWN, button=1, pos=(32, 650)),
            pygame,
            tuning,
            tmp_path / "crt_tuning.json",
        )

        assert handled is True
        assert (tmp_path / "crt_tuning.json").exists()
    finally:
        pygame.quit()


def test_crt_effect_matches_area_brightness_and_saturation() -> None:
    from dungeon_crawler.pygame_app.crt import CRTEffect

    effect = CRTEffect((160, 120))
    effect.set_area("overworld")

    assert effect.settings.glow is True
    assert effect.settings.brightness == 1.08
    assert effect.settings.saturation == 1.12

    effect.set_area("dungeon")

    assert effect.settings.glow is True
    assert effect.settings.brightness == 1.3
    assert effect.settings.saturation == 1.3


def test_crt_effect_applies_scanlines() -> None:
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


def test_renderer_clears_finished_overworld_transition() -> None:
    import os

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

    import pygame

    from dungeon_crawler.core import tiles
    from dungeon_crawler.core.game import Action, Game
    from dungeon_crawler.core.models import Position
    from dungeon_crawler.pygame_app.renderer import AssetCache, render

    pygame.init()
    try:
        tile_size = 32
        game = Game()
        game.new_game(seed=8)
        player_id = game.world.player_eid
        assert player_id is not None
        player_position = game.ecs.get_component(player_id, "position")
        assert isinstance(player_position, Position)
        player_position.x = game.config.dungeon_width - 1
        player_position.y = game.config.dungeon_height // 2
        game.world.dungeon_grid[player_position.y][player_position.x] = tiles.grass()
        game.dispatch(Action.move(1, 0))
        assert game.world.overworld_transition is not None
        game.world.overworld_transition.start_ms -= game.world.overworld_transition.duration_ms + 1

        screen = pygame.display.set_mode(
            (game.config.dungeon_width * tile_size, game.config.dungeon_height * tile_size + 156)
        )
        font = pygame.font.SysFont("monospace", 20)
        render(screen, font, game, tile_size, AssetCache())

        assert game.world.overworld_transition is None
    finally:
        pygame.quit()
