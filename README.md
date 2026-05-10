# Dungeon Durgon

A vanilla JavaScript roguelike dungeon crawler rendered on an HTML canvas with CRT-style visual effects.

## Run

Open `index.html` in a browser.

## Controls

- `WASD` or arrow keys: move
- `I`: inventory
- `Enter` or `Space`: use selected inventory item
- `D`: drop selected inventory item
- `R`: restart
- `Esc`: pause or close inventory

## Validate

Requires Node.js.

```powershell
npm test
npm run check
```

`npm test` runs the smoke harness for dungeon generation, event emissions, namespace aliases, and turn processing. `npm run check` syntax-checks all JavaScript files.
