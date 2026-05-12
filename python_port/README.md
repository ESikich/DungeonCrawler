# Dungeon Crawler Python Port

This folder contains the in-progress Python/Pygame port of the JavaScript dungeon crawler.

The existing browser game remains the source reference for behavior. New Python implementation work should happen under this folder.

## Goals

- Build a local Python/Pygame version first.
- Keep game rules in a pygame-free core package.
- Preserve a path toward a browser adapter later.
- Make every migration step testable.

## Current Status

The first core slice is in place:

- Python package metadata under `pyproject.toml`
- `dungeon_crawler.core` modules for models, ECS, RNG, overworld and room/corridor generation, entities, movement, combat, and the public `Game` facade
- enemy registry covering the current JS roster, deterministic spawning, random/chase/cautious/aggressive AI, and basic enemy turns
- item entities, gold pickup, healing potion use, item dropping, and inventory actions
- XP awards, level-ups, HP restoration, and stat growth from defeated enemies
- deterministic overworld sections with ported regional terrain, dungeon entrances, and edge-to-edge section travel
- dungeon floor transitions through `>` and `<` stairs, with floor depth tracked in save/load
- temporary strength boosts with status ticking and stat restoration
- JSON-compatible save/load helpers for core game state
- deterministic 100-turn headless smoke coverage for the core loop
- pygame rendering loads mirrored `assets/tiles/` sprites with JS-style tile color/glyph fallbacks
- browser-readiness notes are documented in `BROWSER_READINESS.md`
- focused tests for the early migration milestones
- a minimal `pygame_app` runner that stays outside the core boundary

## Setup

```bash
python3 -m pip install -e .[dev]
```

To run the pygame adapter:

```bash
python3 -m pip install -e .[pygame]
```

The pygame adapter uses an OpenGL CRT presenter when available, with a software CRT fallback for machines that cannot create a GL context.

On Windows, use a Python version with prebuilt pygame wheels, typically 64-bit Python 3.11 or 3.12. If pip tries to download `pygame-*.tar.gz` and build from source, switch to one of those Python versions instead of compiling pygame locally:

```bat
py -3.12 -m venv .venv-win
.venv-win\Scripts\activate
python -m pip install --upgrade pip
python -m pip install --only-binary pygame -e ".[pygame]"
python -m dungeon_crawler.pygame_app
```

## Commands

```bash
python3 -m pytest
python3 -m dungeon_crawler.pygame_app
```

## Pygame Controls

Move with `WASD` or arrow keys. Walk off an overworld edge to enter the next section, step onto the dungeon entrance sprite to enter a dungeon, `>` to descend, and `<` to climb back up or exit. `Space` waits, `I` opens inventory, `M` opens the overworld map, `Esc` opens the menu, `R` restarts, `F5` saves to `savegame.json`, and `F9` loads it. In inventory, use arrow keys to select, `Enter` to use, and `D` to drop. On the map, use `WASD` or arrows to pan visited chunks and `M` or `Esc` to close. The pygame window is resizable, but snaps back to the original JS-layout aspect ratio while scaling the logical canvas.

CRT tuning opens as an on-screen panel while the pygame adapter is running. Drag the sliders, click toggles, and use the panel buttons to save, reload, or hide the current settings. `Save` writes `crt_tuning.json`; `Reload` reads it back; `F1` shows or hides the panel. Keyboard tuning shortcuts are still available: `F2` selects the next CRT knob, `Shift+F2` selects the previous knob, `F3`/`F4` decrease/increase or toggle the selected value, `F6` saves, `F7` reloads, and `F8` prints all current values.

## Start Here

Read `IMPLEMENTATION_BRIEF.md` for the migration plan and `AGENTS.md` for implementation guardrails.
