# AGENTS.md

This folder is a planned Python/Pygame port of the existing JavaScript dungeon crawler.

## Primary Objective

Build a local Python/Pygame version first, while keeping the core architecture suitable for a browser adapter later.

Read `IMPLEMENTATION_BRIEF.md` before making implementation changes.

## Guardrails

- Do not modify the existing JavaScript game outside `python_port/` unless explicitly requested.
- Keep `dungeon_crawler.core` free of `pygame` imports.
- Treat `pygame_app` as an adapter over the core, not as the owner of game rules.
- Use deterministic, injectable RNG in core logic.
- Make every migration step testable with `pytest` where possible.
- Prefer a small playable vertical slice over a broad partial port.
- Keep state serialization in mind when designing core objects.

## Expected Commands

From `python_port/`:

```bash
python -m pytest
python -m dungeon_crawler.pygame_app
```

The pygame command may not work until the pygame adapter milestone is implemented.

## Suggested Package Boundaries

- `core/config.py`: constants and tunable settings
- `core/models.py`: dataclasses for components and state
- `core/ecs.py`: entity/component store and event queue
- `core/rng.py`: deterministic random service
- `core/tiles.py`: tile constructors and helpers
- `core/generation.py`: map generation
- `core/entities.py`: player/entity factories
- `core/monsters.py`: enemy registry and enemy creation
- `core/items.py`: item registry and item effects
- `core/systems.py`: movement, combat, turn processing, status
- `core/vision.py`: field-of-view and seen/visible tracking
- `core/game.py`: public game facade and action dispatch
- `core/serialization.py`: save/load helpers
- `pygame_app/`: input, rendering, and app loop only

## Testing Expectations

Each completed step should include focused tests. Good early tests include:

- default config and model construction
- ECS entity/component behavior
- deterministic RNG behavior
- map dimensions and reachable player spawn
- player creation components
- movement into floor/wall/bounds/blockers
- combat resolution and defeat
- turn processor state changes

Most tests should run without pygame.

## Existing JS Reference Points

Use these files as behavioral references:

- `../globals.js`
- `../ecs.js`
- `../generation.js`
- `../main.js`
- `../systems.js`
- `../items.js`
- `../monsters.js`
- `../tests/smoke.js`

Avoid line-for-line translation when a Pythonic design is clearer, but preserve player-facing behavior where practical.
