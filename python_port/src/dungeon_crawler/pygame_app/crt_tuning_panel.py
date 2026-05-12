"""Mouse-driven CRT tuning panel overlay."""

from __future__ import annotations

from pathlib import Path

from .crt_tuning import (
    CRTTuning,
    TUNING_KNOBS,
    adjust_tuning,
    load_tuning,
    save_tuning,
    tuning_value_text,
)


class CRTTuningPanel:
    def __init__(self, *, visible: bool = True) -> None:
        self.visible = visible
        self.dragging_knob: str | None = None
        self.scroll_y = 0

    def handle_event(self, event: object, pygame: object, tuning: CRTTuning, path: Path) -> tuple[bool, CRTTuning]:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_F1:
            self.visible = not self.visible
            return True, tuning

        if not self.visible:
            return False, tuning

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            return self._handle_mouse_down(event.pos, pygame, tuning, path), tuning

        if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging_knob = None
            return True, tuning

        if event.type == pygame.MOUSEMOTION and self.dragging_knob is not None:
            self._set_numeric_value_from_mouse(self.dragging_knob, event.pos[0], pygame.display.get_window_size(), tuning)
            return True, tuning

        if hasattr(pygame, "MOUSEWHEEL") and event.type == pygame.MOUSEWHEEL:
            self.scroll_y = max(0, self.scroll_y - event.y * 28)
            return True, tuning

        return False, tuning

    def render(self, pygame: object, window_size: tuple[int, int], tuning: CRTTuning) -> object | None:
        if not self.visible:
            return None

        width, height = window_size
        overlay = pygame.Surface(window_size, pygame.SRCALPHA)
        font = pygame.font.SysFont("consolas", 15) or pygame.font.SysFont("monospace", 15)
        small_font = pygame.font.SysFont("consolas", 13) or pygame.font.SysFont("monospace", 13)
        panel = self._panel_rect(window_size)

        pygame.draw.rect(overlay, (8, 13, 14, 230), panel, border_radius=8)
        pygame.draw.rect(overlay, (0, 255, 65, 145), panel, width=1, border_radius=8)
        pygame.draw.line(overlay, (0, 255, 65, 80), (panel.x + 14, panel.y + 55), (panel.right - 14, panel.y + 55), 1)

        title = font.render("CRT TUNING", True, (165, 255, 190))
        overlay.blit(title, (panel.x + 14, panel.y + 13))
        hint = small_font.render("F1 hide/show  F3/F4 keys still work", True, (145, 172, 158))
        overlay.blit(hint, (panel.x + 14, panel.y + 34))

        content_rect = pygame.Rect(panel.x + 10, panel.y + 63, panel.width - 20, panel.height - 116)
        old_clip = overlay.get_clip()
        overlay.set_clip(content_rect)
        for knob, row in self._visible_rows(pygame, window_size):
            self._draw_knob_row(pygame, overlay, font, small_font, row, knob, tuning)
        overlay.set_clip(old_clip)

        self._draw_buttons(pygame, overlay, font, window_size)
        footer = small_font.render("Drag sliders. Click toggles. Save writes crt_tuning.json.", True, (130, 154, 142))
        overlay.blit(footer, (panel.x + 14, panel.bottom - 24))
        return overlay

    def _handle_mouse_down(self, pos: tuple[int, int], pygame: object, tuning: CRTTuning, path: Path) -> bool:
        window_size = pygame.display.get_window_size()
        panel = self._panel_rect(window_size)
        if not panel.collidepoint(pos):
            return False

        button = self._button_at(pos, pygame, window_size)
        if button == "save":
            save_tuning(path, tuning)
            print(f"Saved CRT tuning to {path}.")
            return True
        if button == "reload":
            loaded = load_tuning(path)
            for knob in TUNING_KNOBS:
                setattr(tuning, knob.name, getattr(loaded, knob.name))
            print(f"Reloaded CRT tuning from {path}.")
            return True
        if button == "hide":
            self.visible = False
            return True

        for knob, row in self._visible_rows(pygame, window_size):
            if row.collidepoint(pos):
                if knob.is_bool:
                    adjust_tuning(tuning, knob, 1)
                    return True
                self.dragging_knob = knob.name
                self._set_numeric_value_from_mouse(knob.name, pos[0], window_size, tuning)
                return True
        return True

    def _draw_knob_row(
        self,
        pygame: object,
        overlay: object,
        font: object,
        small_font: object,
        row: object,
        knob: object,
        tuning: CRTTuning,
    ) -> None:
        label_color = (220, 235, 226) if not knob.is_bool else (175, 220, 190)
        value = getattr(tuning, knob.name)
        overlay.blit(small_font.render(knob.label, True, label_color), (row.x + 6, row.y + 7))

        if knob.is_bool:
            box = pygame.Rect(row.right - 62, row.y + 7, 18, 18)
            pygame.draw.rect(overlay, (5, 35, 18, 235), box, border_radius=3)
            pygame.draw.rect(overlay, (0, 255, 65, 170), box, width=1, border_radius=3)
            if value:
                pygame.draw.rect(overlay, (0, 255, 65, 210), box.inflate(-6, -6), border_radius=2)
            overlay.blit(small_font.render("on" if value else "off", True, (185, 230, 195)), (row.right - 36, row.y + 8))
            return

        value_text = tuning_value_text(tuning, knob)
        overlay.blit(small_font.render(value_text, True, (165, 185, 255)), (row.right - 58, row.y + 7))
        track = self._slider_rect(row)
        pygame.draw.line(overlay, (45, 68, 56), (track.x, track.centery), (track.right, track.centery), 4)
        pygame.draw.line(overlay, (0, 255, 65, 110), (track.x, track.centery), (track.right, track.centery), 1)

        ratio = (float(value) - knob.minimum) / max(0.0001, knob.maximum - knob.minimum)
        knob_x = track.x + max(0.0, min(1.0, ratio)) * track.width
        pygame.draw.circle(overlay, (3, 12, 8), (round(knob_x), track.centery), 8)
        pygame.draw.circle(overlay, (120, 255, 170), (round(knob_x), track.centery), 7, width=2)

    def _draw_buttons(self, pygame: object, overlay: object, font: object, window_size: tuple[int, int]) -> None:
        for name, rect, label in self._button_rects(pygame, window_size):
            pygame.draw.rect(overlay, (13, 31, 24, 240), rect, border_radius=5)
            pygame.draw.rect(overlay, (0, 255, 65, 115), rect, width=1, border_radius=5)
            text = font.render(label, True, (175, 255, 194))
            overlay.blit(text, (rect.centerx - text.get_width() // 2, rect.centery - text.get_height() // 2))

    def _visible_rows(self, pygame: object, window_size: tuple[int, int]) -> list[tuple[object, object]]:
        panel = self._panel_rect(window_size)
        row_height = 30
        start_y = panel.y + 66 - self.scroll_y
        rows = []
        for index, knob in enumerate(TUNING_KNOBS):
            row = pygame.Rect(panel.x + 10, start_y + index * row_height, panel.width - 20, row_height - 3)
            if row.bottom >= panel.y + 62 and row.y <= panel.bottom - 54:
                rows.append((knob, row))
        return rows

    def _set_numeric_value_from_mouse(
        self,
        knob_name: str,
        mouse_x: int,
        window_size: tuple[int, int],
        tuning: CRTTuning,
    ) -> None:
        knob = next(item for item in TUNING_KNOBS if item.name == knob_name)
        panel = self._panel_rect(window_size)
        track_x = panel.x + 190
        track_width = max(80, panel.width - 270)
        ratio = (mouse_x - track_x) / track_width
        value = knob.minimum + max(0.0, min(1.0, ratio)) * (knob.maximum - knob.minimum)
        setattr(tuning, knob.name, round(value, 4))

    def _slider_rect(self, row: object) -> object:
        return row.__class__(row.x + 180, row.y + 7, max(80, row.width - 255), 16)

    def _panel_rect(self, window_size: tuple[int, int]) -> object:
        import pygame

        width, height = window_size
        panel_width = min(460, max(340, width - 28))
        panel_height = min(height - 28, 690)
        return pygame.Rect(14, 14, panel_width, panel_height)

    def _button_rects(self, pygame: object, window_size: tuple[int, int]) -> list[tuple[str, object, str]]:
        panel = self._panel_rect(window_size)
        y = panel.bottom - 50
        button_width = 86
        gap = 8
        return [
            ("save", pygame.Rect(panel.x + 14, y, button_width, 24), "Save"),
            ("reload", pygame.Rect(panel.x + 14 + (button_width + gap), y, button_width, 24), "Reload"),
            ("hide", pygame.Rect(panel.x + 14 + (button_width + gap) * 2, y, button_width, 24), "Hide"),
        ]

    def _button_at(self, pos: tuple[int, int], pygame: object, window_size: tuple[int, int]) -> str | None:
        for name, rect, _label in self._button_rects(pygame, window_size):
            if rect.collidepoint(pos):
                return name
        return None
