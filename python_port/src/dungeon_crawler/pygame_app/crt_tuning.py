"""Runtime CRT tuning values and JSON persistence."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(slots=True)
class CRTTuning:
    curvature: bool = True
    scanlines: bool = True
    glow: bool = True
    noise: bool = True
    brightness_dungeon: float = 1.3
    brightness_overworld: float = 1.08
    contrast: float = 1.0
    saturation_dungeon: float = 1.3
    saturation_overworld: float = 1.12
    shader_scanline_strength: float = 0.04
    glow_strength: float = 0.1
    overlay_scanline_alpha: float = 0.1
    static_probability: float = 0.24
    static_alpha: float = 0.0268
    blur_strength: float = 1.0
    vignette_strength: float = 1.0
    screen_highlight_alpha: float = 0.09
    screen_edge_shadow_alpha: float = 0.45
    monitor_glow_strength: float = 0.3
    bezel_shadow_strength: float = 0.55
    screen_corner_radius: float = 8.0


@dataclass(frozen=True, slots=True)
class TuningKnob:
    name: str
    label: str
    step: float = 0.01
    minimum: float = 0.0
    maximum: float = 2.0
    is_bool: bool = False


TUNING_KNOBS: tuple[TuningKnob, ...] = (
    TuningKnob("brightness_dungeon", "Dungeon brightness", 0.02, 0.2, 2.5),
    TuningKnob("brightness_overworld", "Overworld brightness", 0.02, 0.2, 2.5),
    TuningKnob("contrast", "Contrast", 0.02, 0.2, 2.5),
    TuningKnob("saturation_dungeon", "Dungeon saturation", 0.02, 0.0, 2.5),
    TuningKnob("saturation_overworld", "Overworld saturation", 0.02, 0.0, 2.5),
    TuningKnob("shader_scanline_strength", "Shader scanline", 0.005, 0.0, 0.2),
    TuningKnob("overlay_scanline_alpha", "Overlay scanline", 0.01, 0.0, 0.5),
    TuningKnob("static_probability", "Static probability", 0.02, 0.0, 1.0),
    TuningKnob("static_alpha", "Static alpha", 0.005, 0.0, 0.2),
    TuningKnob("glow_strength", "Glow strength", 0.01, 0.0, 0.5),
    TuningKnob("blur_strength", "Blur strength", 0.05, 0.0, 2.0),
    TuningKnob("vignette_strength", "Vignette", 0.05, 0.0, 1.0),
    TuningKnob("screen_highlight_alpha", "Screen highlight", 0.005, 0.0, 0.2),
    TuningKnob("screen_edge_shadow_alpha", "Screen edge shadow", 0.02, 0.0, 0.8),
    TuningKnob("monitor_glow_strength", "Monitor glow", 0.02, 0.0, 1.0),
    TuningKnob("bezel_shadow_strength", "Bezel shadow", 0.02, 0.0, 1.0),
    TuningKnob("screen_corner_radius", "Screen corner radius", 1.0, 0.0, 30.0),
    TuningKnob("curvature", "Curvature", is_bool=True),
    TuningKnob("scanlines", "Scanlines", is_bool=True),
    TuningKnob("glow", "Glow", is_bool=True),
    TuningKnob("noise", "Noise/static", is_bool=True),
)


def load_tuning(path: Path) -> CRTTuning:
    tuning = CRTTuning()
    if not path.exists():
        return tuning

    try:
        values = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return tuning

    if not isinstance(values, dict):
        return tuning

    for key, value in values.items():
        if hasattr(tuning, key):
            setattr(tuning, key, value)
    return tuning


def save_tuning(path: Path, tuning: CRTTuning) -> None:
    path.write_text(json.dumps(asdict(tuning), indent=2, sort_keys=True) + "\n", encoding="utf-8")


def adjust_tuning(tuning: CRTTuning, knob: TuningKnob, direction: int) -> None:
    if knob.is_bool:
        setattr(tuning, knob.name, not bool(getattr(tuning, knob.name)))
        return

    value = float(getattr(tuning, knob.name)) + knob.step * direction
    value = max(knob.minimum, min(knob.maximum, value))
    setattr(tuning, knob.name, round(value, 4))


def tuning_value_text(tuning: CRTTuning, knob: TuningKnob) -> str:
    value = getattr(tuning, knob.name)
    if isinstance(value, bool):
        return "on" if value else "off"
    return f"{value:.4g}"


def tuning_summary(tuning: CRTTuning) -> str:
    return ", ".join(f"{knob.name}={tuning_value_text(tuning, knob)}" for knob in TUNING_KNOBS)
