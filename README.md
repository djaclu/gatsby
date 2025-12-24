# Gatsby's World

A simple endless 2D scrolling web game built with TypeScript.

## Features

- Start screen with Enter to start
- Character that can jump (Space) and double jump (Space twice)
- Scrolling floor with animated symbols
- Random obstacle towers (1-10 blocks)
- Destroy blocks with Enter key
- Score counter for obstacles passed
- Collision detection and game over screen

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Open `index.html` in a web browser

## Customization

- **Character Image**: Place a PNG file named `character.png` in the root directory to replace the default character sprite
- **Jump Height**: Modify `JUMP_HEIGHT` in `src/game.ts` (currently set to 2 blocks)
- **Game Speed**: Adjust `OBSTACLE_SPEED` and `FLOOR_SPEED` in the CONFIG object

## Controls

- **Enter**: Start game / Restart after game over / Destroy one block from nearest obstacle
- **Space**: Jump (can press twice for double jump)

