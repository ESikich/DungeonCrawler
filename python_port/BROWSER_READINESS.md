# Browser Readiness Check

This document records the current browser-readiness status for the Python port.

## Recommendation

Prefer `pygbag` first if the pygame adapter remains simple and the target browser version can accept pygame-style input/rendering tradeoffs.

Use a separate browser adapter over `dungeon_crawler.core` if the browser version should preserve the current JavaScript/canvas feel more closely, including richer layout, asset loading, menus, or mobile-specific controls.

## Current Status

- Core has no `pygame` imports. Pygame usage is isolated under `dungeon_crawler.pygame_app`.
- Core has no DOM/browser assumptions such as `window`, `document`, canvas APIs, or animation-frame APIs.
- Core uses injectable deterministic RNG through `Rng`.
- Player input is action-based through `Game.dispatch(Action...)`.
- Core state is JSON-serializable through `game_to_dict`, `game_from_dict`, `dumps_game`, and `loads_game`.
- Rendering is adapter-owned. The pygame adapter reads core state but does not own game rules.

## Notes

- Asset-backed rendering loads mirrored sprites from `assets/tiles/` and falls back to glyph/color drawing if files are unavailable.
- The current pygame app writes `savegame.json` locally for save/load. A browser adapter should provide its own storage backend around the same serialization helpers.
- Browser work should keep `dungeon_crawler.core` free of pygame, DOM, and storage-specific imports.
