"""CRT-style post-processing for the pygame adapter."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property

from .crt_tuning import CRTTuning


@dataclass(slots=True)
class CRTSettings:
    scanlines: bool = True
    curvature: bool = True
    glow: bool = True
    noise: bool = True
    brightness: float = 1.3
    contrast: float = 1.0
    saturation: float = 1.3


class CRTEffect:
    """Apply the browser CRT shader and CSS composition over the logical game surface."""

    def __init__(self, logical_size: tuple[int, int]) -> None:
        self.logical_size = logical_size
        self.settings = CRTSettings()
        self.tuning = CRTTuning()
        self.shader_render_scale = 0.5
        self._shader_caches: dict[tuple[int, int], _ShaderCache] = {}
        self._post_caches: dict[tuple[int, int], _PostCache] = {}

    def set_area(self, area: str) -> None:
        overworld = area == "overworld"
        self.settings.glow = self.tuning.glow
        self.settings.brightness = self.tuning.brightness_overworld if overworld else self.tuning.brightness_dungeon
        self.settings.saturation = self.tuning.saturation_overworld if overworld else self.tuning.saturation_dungeon

    def apply_tuning(self, tuning: CRTTuning) -> None:
        self.tuning = tuning
        self.settings.scanlines = tuning.scanlines
        self.settings.curvature = tuning.curvature
        self.settings.glow = tuning.glow
        self.settings.noise = tuning.noise
        self.settings.contrast = tuning.contrast

    def apply(self, source: object, *, ticks: int | None = None) -> object:
        shader_output = self.apply_shader(source, ticks=ticks)
        return self.apply_post_draw(shader_output, ticks=ticks)

    def apply_shader(self, source: object, *, ticks: int | None = None) -> object:
        pygame = _pygame()
        original_size = source.get_size()
        render_size = self._shader_render_size(original_size)
        shader_source = pygame.transform.scale(source, render_size) if render_size != original_size else source
        shader_output = self._apply_shader_at_size(shader_source, ticks=ticks)
        return pygame.transform.scale(shader_output, original_size) if render_size != original_size else shader_output

    def _apply_shader_at_size(self, source: object, *, ticks: int | None = None) -> object:
        pygame = _pygame()
        np = _numpy()
        size = source.get_size()
        cache = self._ensure_cache(size)

        source_rgb = pygame.surfarray.array3d(source).astype(np.float32) / 255.0

        sample_x = cache.curved_sample_x if self.settings.curvature else cache.sample_x
        sample_y = cache.curved_sample_y if self.settings.curvature else cache.sample_y
        color = source_rgb[sample_x, sample_y]

        color = ((color - 0.5) * self.settings.contrast + 0.5) * self.settings.brightness

        gray = (
            color[:, :, 0] * 0.299
            + color[:, :, 1] * 0.587
            + color[:, :, 2] * 0.114
        )
        color = gray[:, :, None] * (1.0 - self.settings.saturation) + color * self.settings.saturation

        if self.settings.scanlines:
            scanline = cache.curved_scanline if self.settings.curvature else cache.scanline
            color *= 1.0 - scanline[:, :, None] * self.tuning.shader_scanline_strength

        if self.settings.glow:
            glow = _soft_glow_rgb(np, source_rgb)
            color += glow[sample_x, sample_y] * self.tuning.glow_strength

        color *= _vignette_multiplier(np, cache.u, cache.v, self.tuning.vignette_strength)[:, :, None]

        if self.settings.curvature:
            color[cache.edge_mask] = 0.0
        color = _apply_parent_color_filter(np, color)

        output_rgb = (np.clip(color, 0.0, 1.0) * 255.0).astype(np.uint8)
        return pygame.surfarray.make_surface(output_rgb)

    def _shader_render_size(self, source_size: tuple[int, int]) -> tuple[int, int]:
        if self.shader_render_scale >= 1.0:
            return source_size
        width, height = source_size
        return (
            max(1, int(width * self.shader_render_scale)),
            max(1, int(height * self.shader_render_scale)),
        )

    def apply_post_draw(self, source: object, *, ticks: int | None = None) -> object:
        pygame = _pygame()
        cache = self._ensure_post_cache(pygame, source.get_size())
        frame_ticks = pygame.time.get_ticks() if ticks is None else ticks
        output = source.copy()
        if self.settings.noise:
            cache.blit_noise(pygame, output, frame_ticks, self.tuning.static_probability, self.tuning.static_alpha)
        if self.settings.scanlines and self.tuning.overlay_scanline_alpha > 0:
            output.blit(cache.scanline_overlay(pygame, self.tuning.overlay_scanline_alpha), (0, 0))
        if self.tuning.screen_highlight_alpha > 0 or self.tuning.screen_edge_shadow_alpha > 0:
            cache.apply_screen_glass_overlay(
                pygame,
                output,
                self.tuning.screen_highlight_alpha,
                self.tuning.screen_edge_shadow_alpha,
            )

        return _apply_game_container_surface_filter(pygame, output, self.tuning.blur_strength)

    def _ensure_cache(self, size: tuple[int, int]) -> "_ShaderCache":
        if size not in self._shader_caches:
            self._shader_caches[size] = _ShaderCache(size)
        return self._shader_caches[size]

    def _ensure_post_cache(self, pygame: object, size: tuple[int, int]) -> "_PostCache":
        if size not in self._post_caches:
            self._post_caches[size] = _PostCache(pygame, size)
        return self._post_caches[size]


def _pygame() -> object:
    import pygame

    return pygame


def _numpy() -> object:
    import numpy

    return numpy


def _vignette_multiplier(np: object, u: object, v: object, strength: float) -> object:
    vig_x = u * (1.0 - v)
    vig_y = v * (1.0 - u)
    vignette = np.power(np.maximum(vig_x * vig_y * 15.0, 0.0), 0.25)
    strength = max(0.0, min(1.0, float(strength)))
    return 1.0 + (np.clip(vignette, 0.0, 1.0) - 1.0) * strength


def _screen_glass_overlay_alphas(np: object, u: object, v: object, highlight_alpha: float, edge_alpha: float) -> tuple[object, object]:
    overlay_u = (u + 0.05) / 1.1
    overlay_v = (v + 0.05) / 1.1
    distance_from_center = np.sqrt((overlay_u - 0.5) ** 2 + (overlay_v - 0.5) ** 2) / 0.70710678
    highlight = np.maximum(1.0 - distance_from_center / 0.32, 0.0) * max(0.0, float(highlight_alpha))
    edge = np.clip((distance_from_center - 0.56) / 0.44, 0.0, 1.0) * max(0.0, float(edge_alpha))
    return np.clip(highlight, 0.0, 1.0), np.clip(edge, 0.0, 1.0)


def _soft_glow_rgb(np: object, source_rgb: object) -> object:
    padded = np.pad(source_rgb, ((1, 1), (1, 1), (0, 0)), mode="edge")
    return (
        padded[:-2, :-2] * 1.0
        + padded[1:-1, :-2] * 2.0
        + padded[2:, :-2] * 1.0
        + padded[:-2, 1:-1] * 2.0
        + padded[1:-1, 1:-1] * 4.0
        + padded[2:, 1:-1] * 2.0
        + padded[:-2, 2:] * 1.0
        + padded[1:-1, 2:] * 2.0
        + padded[2:, 2:] * 1.0
    ) / 16.0


def _apply_game_container_surface_filter(pygame: object, source: object, blur_strength: float) -> object:
    return _blur_surface(pygame, source, blur_strength)


def _apply_parent_color_filter(np: object, color: object) -> object:
    return color


def _blur_surface(pygame: object, source: object, blur_strength: float) -> object:
    # Approximation used only by the software fallback. The GPU presenter has the real knob.
    if blur_strength <= 0:
        return source
    width, height = source.get_size()
    scale = max(0.35, 1.0 / (1.0 + blur_strength * 0.35))
    blur_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    softened = pygame.transform.smoothscale(source, blur_size)
    return pygame.transform.smoothscale(softened, (width, height))


class _ShaderCache:
    def __init__(self, size: tuple[int, int]) -> None:
        np = _numpy()
        self.width, self.height = size
        x = (np.arange(self.width, dtype=np.float32) + 0.5) / self.width
        y = (np.arange(self.height, dtype=np.float32) + 0.5) / self.height
        self.u, self.v = np.meshgrid(x, y, indexing="ij")

    @cached_property
    def sample_x(self) -> object:
        return self._sample_axis(self.u, self.width)

    @cached_property
    def sample_y(self) -> object:
        return self._sample_axis(self.v, self.height)

    @cached_property
    def curved_sample_x(self) -> object:
        return self._sample_axis(self.curved_u, self.width)

    @cached_property
    def curved_sample_y(self) -> object:
        return self._sample_axis(self.curved_v, self.height)

    @cached_property
    def curved_u(self) -> object:
        uv_x = self.u * 2.0 - 1.0
        uv_y = self.v * 2.0 - 1.0
        offset_x = abs(uv_y) / 6.0
        return (uv_x + uv_x * offset_x * offset_x) * 0.5 + 0.5

    @cached_property
    def curved_v(self) -> object:
        uv_x = self.u * 2.0 - 1.0
        uv_y = self.v * 2.0 - 1.0
        offset_y = abs(uv_x) / 4.0
        return (uv_y + uv_y * offset_y * offset_y) * 0.5 + 0.5

    @cached_property
    def edge_mask(self) -> object:
        return (
            (self.curved_u < 0.0)
            | (self.curved_u > 1.0)
            | (self.curved_v < 0.0)
            | (self.curved_v > 1.0)
        )

    @cached_property
    def scanline(self) -> object:
        np = _numpy()
        return (0.5 + 0.5 * np.sin(self.v * 800.0)).astype(np.float32)

    @cached_property
    def curved_scanline(self) -> object:
        np = _numpy()
        return (0.5 + 0.5 * np.sin(self.curved_v * 800.0)).astype(np.float32)

    def _sample_axis(self, axis: object, size: int) -> object:
        np = _numpy()
        return np.clip((axis * size).astype(np.int32), 0, size - 1)


class _PostCache:
    def __init__(self, pygame: object, size: tuple[int, int]) -> None:
        np = _numpy()
        self.width, self.height = size
        self.noise_width = max(1, self.width // 4)
        self.noise_height = max(1, self.height // 4)
        self.noise_surface = pygame.Surface((self.noise_width, self.noise_height), pygame.SRCALPHA)
        self._scanline_overlays: dict[float, object] = {}
        self._noise_rng = np.random.default_rng()
        x = (np.arange(self.width, dtype=np.float32) + 0.5) / self.width
        y = (np.arange(self.height, dtype=np.float32) + 0.5) / self.height
        self.u, self.v = np.meshgrid(x, y, indexing="ij")

    def blit_noise(self, pygame: object, target: object, _ticks: int, probability: float, alpha_value: float) -> None:
        np = _numpy()
        rng = self._noise_rng
        rgb = pygame.surfarray.pixels3d(self.noise_surface)
        alpha = pygame.surfarray.pixels_alpha(self.noise_surface)
        rgb[:, :, :] = rng.integers(0, 256, rgb.shape, dtype=np.uint8)
        alpha[:, :] = np.where(
            rng.random((self.noise_width, self.noise_height), dtype=np.float32) < probability,
            max(0, min(255, round(alpha_value * 255))),
            0,
        ).astype(np.uint8)
        del rgb
        del alpha
        target.blit(pygame.transform.scale(self.noise_surface, (self.width, self.height)), (0, 0))

    def scanline_overlay(self, pygame: object, alpha: float) -> object:
        key = round(alpha, 4)
        if key not in self._scanline_overlays:
            self._scanline_overlays[key] = _build_scanline_overlay(pygame, (self.width, self.height), alpha)
        return self._scanline_overlays[key]

    def apply_screen_glass_overlay(self, pygame: object, target: object, highlight_alpha: float, edge_alpha: float) -> None:
        np = _numpy()
        highlight, edge = _screen_glass_overlay_alphas(np, self.u, self.v, highlight_alpha, edge_alpha)
        rgb = pygame.surfarray.pixels3d(target)
        color = rgb.astype(np.float32)
        if highlight_alpha > 0:
            color = color * (1.0 - highlight[:, :, None]) + 255.0 * highlight[:, :, None]
        if edge_alpha > 0:
            color *= 1.0 - edge[:, :, None]
        rgb[:, :, :] = np.clip(color, 0.0, 255.0).astype(np.uint8)
        del rgb


def _build_scanline_overlay(pygame: object, size: tuple[int, int], alpha: float) -> object:
    width, height = size
    overlay = pygame.Surface(size, pygame.SRCALPHA)
    alpha_channel = max(0, min(255, int(alpha * 255)))
    for y in range(2, height, 4):
        pygame.draw.line(overlay, (0, 255, 65, alpha_channel), (0, y), (width, y))
        if y + 1 < height:
            pygame.draw.line(overlay, (0, 255, 65, alpha_channel), (0, y + 1), (width, y + 1))
    return overlay
