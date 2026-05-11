"""CRT-style post-processing for the pygame adapter."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass


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
    """Apply a light-weight CRT pass over the logical game surface."""

    def __init__(self, logical_size: tuple[int, int]) -> None:
        self.logical_size = logical_size
        self.settings = CRTSettings()
        self._cache_size: tuple[int, int] | None = None
        self._scanline_overlay: object | None = None
        self._vignette_overlay: object | None = None
        self._phosphor_overlay: object | None = None
        self._noise_frames: list[object] = []

    def set_area(self, area: str) -> None:
        overworld = area == "overworld"
        self.settings.glow = not overworld
        self.settings.brightness = 1.08 if overworld else 1.3
        self.settings.saturation = 1.12 if overworld else 1.3

    def apply(self, source: object, *, ticks: int | None = None) -> object:
        pygame = _pygame()
        size = source.get_size()
        if size != self.logical_size:
            self.logical_size = size
        self._ensure_cache(pygame, size)

        frame_ticks = pygame.time.get_ticks() if ticks is None else ticks
        output = self._curve_surface(pygame, source) if self.settings.curvature else source.copy()

        softened = _blur_surface(pygame, output, divisor=2)
        softened.set_alpha(28 if self.settings.glow else 18)
        output.blit(softened, (0, 0))

        if self.settings.glow:
            glow = _blur_surface(pygame, output, divisor=3)
            glow.set_alpha(40)
            output.blit(glow, (0, 0))

        self._apply_tone(pygame, output, frame_ticks)

        if self.settings.scanlines and self._scanline_overlay is not None:
            output.blit(self._scanline_overlay, (0, 0))

        if self.settings.noise and self._noise_frames:
            noise_frame = self._noise_frames[(frame_ticks // 45) % len(self._noise_frames)]
            output.blit(noise_frame, (0, 0))

        if self._vignette_overlay is not None:
            output.blit(self._vignette_overlay, (0, 0))

        return output

    def _ensure_cache(self, pygame: object, size: tuple[int, int]) -> None:
        if self._cache_size == size:
            return
        self._cache_size = size
        self._scanline_overlay = _build_scanline_overlay(pygame, size)
        self._vignette_overlay = _build_vignette_overlay(pygame, size)
        self._phosphor_overlay = _build_phosphor_overlay(pygame, size)
        self._noise_frames = _build_noise_frames(pygame, size, count=6)

    def _curve_surface(self, pygame: object, source: object) -> object:
        width, height = source.get_size()
        scaled_width = max(width, round(width * 1.018))
        scaled_height = max(height, round(height * 1.03))
        scaled = pygame.transform.smoothscale(source, (scaled_width, scaled_height))
        curved = pygame.Surface((width, height))
        curved.fill((0, 0, 0))
        curved.blit(scaled, (-(scaled_width - width) // 2, -(scaled_height - height) // 2))
        return curved

    def _apply_tone(self, pygame: object, surface: object, ticks: int) -> None:
        width, height = surface.get_size()
        flicker = 1.06 + math.sin(ticks * 0.005) * 0.02
        brightness = self.settings.brightness * flicker
        white_alpha = max(0, min(96, int((brightness - 1.0) * 72)))
        if white_alpha:
            white_overlay = pygame.Surface((width, height), pygame.SRCALPHA)
            white_overlay.fill((255, 255, 255, white_alpha))
            surface.blit(white_overlay, (0, 0))

        if self.settings.saturation > 1.0 and self._phosphor_overlay is not None:
            phosphor_alpha = max(0, min(54, int((self.settings.saturation - 1.0) * 64)))
            self._phosphor_overlay.set_alpha(phosphor_alpha)
            surface.blit(self._phosphor_overlay, (0, 0))

        contrast_alpha = max(0, min(18, int(abs(self.settings.contrast - 1.0) * 24)))
        if contrast_alpha:
            contrast_overlay = pygame.Surface((width, height))
            contrast_overlay.fill((contrast_alpha, contrast_alpha, contrast_alpha))
            surface.blit(contrast_overlay, (0, 0), special_flags=pygame.BLEND_RGB_SUB)


def _pygame() -> object:
    import pygame

    return pygame


def _blur_surface(pygame: object, source: object, *, divisor: int) -> object:
    width, height = source.get_size()
    scaled_width = max(1, width // divisor)
    scaled_height = max(1, height // divisor)
    softened = pygame.transform.smoothscale(source, (scaled_width, scaled_height))
    return pygame.transform.smoothscale(softened, (width, height))


def _build_scanline_overlay(pygame: object, size: tuple[int, int]) -> object:
    width, height = size
    overlay = pygame.Surface(size, pygame.SRCALPHA)
    for y in range(0, height, 4):
        pygame.draw.line(overlay, (0, 0, 0, 22), (0, y), (width, y))
        if y + 1 < height:
            pygame.draw.line(overlay, (0, 255, 65, 8), (0, y + 1), (width, y + 1))
    return overlay


def _build_vignette_overlay(pygame: object, size: tuple[int, int]) -> object:
    width, height = size
    overlay = pygame.Surface(size, pygame.SRCALPHA)
    border_radius = max(10, min(width, height) // 12)

    steps = 18
    for step in range(steps):
        inset_x = int(step * width * 0.008)
        inset_y = int(step * height * 0.01)
        rect = pygame.Rect(
            inset_x,
            inset_y,
            max(1, width - inset_x * 2),
            max(1, height - inset_y * 2),
        )
        alpha = 8 + step * 3
        pygame.draw.rect(overlay, (0, 0, 0, alpha), rect, width=2, border_radius=border_radius)

    highlight = pygame.Surface(size, pygame.SRCALPHA)
    pygame.draw.ellipse(
        highlight,
        (255, 255, 255, 10),
        pygame.Rect(int(width * 0.18), int(height * 0.03), int(width * 0.64), int(height * 0.24)),
    )
    overlay.blit(highlight, (0, 0))
    return overlay


def _build_phosphor_overlay(pygame: object, size: tuple[int, int]) -> object:
    width, height = size
    overlay = pygame.Surface(size, pygame.SRCALPHA)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = (
            0,
            6 + int(14 * ratio),
            2 + int(8 * ratio),
            20,
        )
        pygame.draw.line(overlay, color, (0, y), (width, y))
    return overlay


def _build_noise_frames(pygame: object, size: tuple[int, int], *, count: int) -> list[object]:
    width, height = size
    sample_size = (max(1, width // 4), max(1, height // 4))
    frames: list[object] = []

    for index in range(count):
        rng = random.Random(index)
        sample = pygame.Surface(sample_size, pygame.SRCALPHA)
        for y in range(sample_size[1]):
            for x in range(sample_size[0]):
                value = rng.randint(0, 18)
                if value < 5:
                    continue
                sample.set_at(
                    (x, y),
                    (
                        value,
                        min(255, value + 8),
                        value,
                        rng.randint(4, 18),
                    ),
                )
        frames.append(pygame.transform.scale(sample, size))

    return frames
