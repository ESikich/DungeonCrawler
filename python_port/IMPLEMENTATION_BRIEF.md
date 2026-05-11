# Python/Pygame Port Implementation Brief

We are porting the existing JavaScript dungeon crawler into a new Python project while preserving the current JS game untouched.

Primary goal: build a local Python/Pygame version first.

Secondary goal: keep the architecture clean enough that a browser version can be added later, likely through `pygbag` or a separate browser adapter.

## Existing Project Context

The current game is a vanilla JavaScript browser game using an ECS-style architecture.

Important existing JS files:

- `globals.js`: global config, game state, world state, event bus, stats
- `ecs.js`: entity/component storage and event queue
- `generation.js`: map/tile generation
- `main.js`: game controller, input, player creation
- `systems.js`: movement, combat, vision, progression, world transitions, turn processing
- `items.js`: item registry and item effects
- `monsters.js`: enemy registry, spawning, AI behavior
- `renderer.js`, `hud.js`: canvas rendering and UI
- `tests/smoke.js`: current JS smoke tests

Do not modify or delete the existing JS implementation unless explicitly requested. Create new Python work under `python_port/`.

## Architectural Requirements

Create a Python package with a strict split between core game logic and presentation.

Recommended structure:

```text
python_port/
  README.md
  AGENTS.md
  IMPLEMENTATION_BRIEF.md
  pyproject.toml
  src/
    dungeon_crawler/
      __init__.py
      core/
        __init__.py
        config.py
        models.py
        ecs.py
        rng.py
        tiles.py
        game.py
        generation.py
        entities.py
        monsters.py
        items.py
        systems.py
        vision.py
        serialization.py
      pygame_app/
        __init__.py
        __main__.py
        app.py
        renderer.py
        input.py
  tests/
    test_models.py
    test_ecs.py
    test_generation.py
    test_game.py
    test_combat.py
    test_turns.py
```

The `core` package must not import `pygame`.

All player interaction should flow through action-style APIs, for example:

```python
game.dispatch(Action.move(1, 0))
game.dispatch(Action.wait())
game.dispatch(Action.restart())
game.dispatch(Action.use_item(index))
game.dispatch(Action.drop_item(index))
```

Rendering adapters should read game state but should not own game rules.

Use Python dataclasses where useful.

Use deterministic, injectable RNG. Do not call `random` directly throughout the game logic.

## Testable Migration Plan

Each step below must end with tests or a runnable verification.

### 1. Create Python Project Skeleton

Deliverable:

- New `python_port/` folder
- `pyproject.toml`
- package folders under `src/dungeon_crawler`
- `tests/`
- README with run/test instructions

Verification:

```bash
cd python_port
python -m pytest
```

This should pass, even if only with a placeholder test at first.

### 2. Port Core Config And Data Models

Deliverable:

- `GameConfig`
- `Tile`
- `Position`
- `Health`
- `Stats`
- `Vision`
- `Descriptor`
- `Blocker`
- `Inventory`
- `Progress`
- `Status`
- `GameState`
- `WorldState`

Use dataclasses.

Verification:

Tests instantiate default state and confirm:

- dungeon width/height match current JS defaults: `25 x 17`
- tile constructors work
- default state starts cleanly
- empty world contains no grid/player until initialized

### 3. Port ECS

Deliverable:

Implement:

- `create_entity`
- `destroy_entity`
- `add_component`
- `get_component`
- `has_component`
- `entities_with`
- `entities_at`
- `post_event`
- `drain_events`
- `reset`

Verification:

Tests create entities, attach components, query them, find entities by position, drain events, and reset.

### 4. Add Deterministic RNG Service

Deliverable:

An injectable RNG wrapper, for example:

```python
class Rng:
    def randint(self, min_value: int, max_value: int) -> int: ...
    def chance(self, probability: float) -> bool: ...
    def choice(self, values): ...
```

Verification:

Two games initialized with the same seed should produce matching generated output for the currently implemented generation slice.

### 5. Port Basic Map Generation

Deliverable:

Start with one reliable map generator. It does not need to port every JS generation algorithm immediately.

Minimum requirements:

- 25x17 grid
- walkable floor
- blocking walls
- valid player spawn
- at least one room or connected walkable area

Verification:

Tests confirm:

- grid dimensions
- spawn is in bounds
- spawn tile is walkable
- reachable walkable region exists
- no malformed rows or missing tiles

### 6. Port Player Creation

Deliverable:

Implement `create_player(x, y)` that adds components equivalent to JS:

- position
- health `100/100`
- stats: strength `14`, agility `12`, accuracy `6`, evasion `4`
- vision
- descriptor
- blocker
- progress
- inventory
- status

Verification:

Tests initialize a game and assert the player exists with expected components and values.

### 7. Implement Movement Resolution

Deliverable:

Player movement should:

- update position when target tile is walkable
- block out-of-bounds movement
- block wall movement
- block movement into blocking entities
- trigger combat when moving into hostile living blockers

Verification:

Tests cover movement into:

- floor
- wall
- map edge
- occupied blocking tile
- hostile entity

### 8. Port Combat Basics

Deliverable:

Implement:

- attack resolution
- deterministic damage through RNG
- HP reduction
- enemy defeat/removal
- player death/game-over state
- combat messages

Verification:

Tests:

- force deterministic damage
- attack enemy
- kill enemy
- kill player
- assert messages and game state

### 9. Port Enemy Registry And Spawning

Deliverable:

Create declarative enemy registry inspired by `monsters.js`.

Minimum enemy set for first playable slice:

- simple weak wandering enemy
- simple chasing enemy

Each enemy should define:

- name
- glyph/color
- health
- stats
- behavior
- XP value

Verification:

Tests spawn enemies away from the player and assert:

- valid position
- valid components
- no spawn on wall
- no spawn on player

### 10. Port Basic Enemy AI

Deliverable:

Implement at least:

- random movement behavior
- chase behavior using player position or remembered player position

Verification:

Tests use seeded RNG and known map layouts to assert expected queued movements or resulting positions.

### 11. Implement Turn Processor

Deliverable:

Expose one main action API, such as:

```python
game.dispatch(action)
```

A turn should process:

- player action
- movement/combat
- enemy AI
- enemy movement
- enemy attacks
- vision updates
- status effect ticks
- turn counter

Verification:

Tests issue actions and assert:

- turn count changes
- player position changes
- enemies act
- messages are emitted
- game-over state works

### 12. Port Vision/Fog State

Deliverable:

Implement visible/seen tile tracking independent of rendering.

Verification:

Tests place player in a known layout and assert expected visible/seen coordinates before and after movement.

### 13. Add Message Log

Deliverable:

Core message log independent of pygame.

Messages should be emitted for:

- blocked movement
- combat
- death
- pickups later
- restart/state changes

Avoid hard dependency on wall-clock timestamps in core tests.

Verification:

Tests perform actions and assert message text or message categories.

### 14. Add Minimal Pygame Runner

Deliverable:

A local app launched by:

```bash
cd python_port
python -m dungeon_crawler.pygame_app
```

Minimum behavior:

- open pygame window
- render grid
- render player
- render enemies
- show basic HUD/messages
- accept movement keys
- support restart
- support quit

Verification:

- Smoke test imports pygame app modules
- Manual verification command opens playable window

The pygame adapter should remain thin and should not contain game rules.

### 15. Add Headless Core Smoke Test

Deliverable:

A pytest or script simulating deterministic turns without pygame.

Verification:

Run a 100-turn deterministic simulation and assert:

- no crash
- player entity remains valid unless game over
- positions remain in bounds
- HP does not become nonsensical
- world state remains internally consistent

### 16. Port Items And Inventory

Deliverable:

Add item registry and core mechanics:

- item entity
- pickup
- inventory capacity
- use item
- drop item
- basic healing item
- gold or simple currency item

Verification:

Tests:

- pick up item
- use item
- drop item
- enforce capacity
- assert HP/gold/inventory changes

### 17. Port Progression And Status Effects

Deliverable:

Implement:

- XP
- level up
- temporary stat boosts
- status ticking
- stat restoration after temporary effects

Verification:

Tests:

- award XP
- level up
- apply effect
- tick duration down
- confirm stats restore correctly

### 18. Add Save/Load Serialization

Deliverable:

JSON-compatible serialization for core state.

Verification:

Tests:

- save game
- load game
- compare player/world/components/messages
- continue playing after load

### 19. Replace Placeholder Pygame Visuals With Assets

Deliverable:

Load existing tile assets from the root `tiles/` folder or mirrored assets under `python_port/assets`.

Fallback to glyph/color rendering if assets are unavailable.

Verification:

- pygame starts with assets present
- pygame starts with assets missing
- render fallback does not crash

### 20. Browser Readiness Check

Deliverable:

Short document describing preferred browser path:

- `pygbag` if pygame architecture remains compatible
- separate JS/canvas adapter if browser UX should preserve the current web feel

Verification checklist:

- core has no pygame imports
- core has no DOM/browser assumptions
- core has deterministic RNG
- core exposes action-based input
- core state is serializable
- rendering is adapter-owned

## Quality Bar

- Keep existing JS game working.
- Prefer small, tested steps.
- Avoid porting every advanced feature immediately.
- Build a playable vertical slice first.
- Keep core logic deterministic and testable.
- Keep pygame as an adapter, not the engine.
- Do not introduce browser-specific decisions into the Python core yet.

## Suggested First Implementation Slice

The first real milestone should be:

- `python_port` skeleton
- core models
- ECS
- deterministic RNG
- basic map generation
- player creation
- movement
- basic combat
- minimal pygame render

That gives the port a working spine before deeper systems like inventory, progression, visual effects, and world transitions are moved over.
