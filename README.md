# Dungeon Durgon

A vanilla JavaScript roguelike dungeon crawler rendered on an HTML canvas with CRT-style visual effects.

## Run

Requires Node.js.

```powershell
npm start
```

Then open `http://localhost:8080`. Running through localhost lets image tiles and the WebGL CRT curve work together.

## Controls

- `WASD` or arrow keys: move
- `I`: inventory
- `M`: overworld map
- `Enter` or `Space`: use selected inventory item
- `D`: drop selected inventory item
- `R`: restart
- `Esc`: open menu or close inventory

## Validate

```powershell
npm test
npm run check
```

`npm test` runs the smoke harness for dungeon generation, event emissions, namespace aliases, and turn processing. `npm run check` syntax-checks all JavaScript files.
