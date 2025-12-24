// Game configuration
const CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  FLOOR_Y: 500,
  CHARACTER_START_X: 100,
  CHARACTER_SIZE: 40,
  JUMP_HEIGHT: 3, // blocks (parameterized - change this to adjust jump height)
  GRAVITY: 0.1,
  OBSTACLE_SPEED: 3,
  OBSTACLE_SPACING: 300,
  BLOCK_SIZE: 40,
  FLOOR_SYMBOL: "-",
  FLOOR_SPEED: 3,
};

// Debug mode - set to true to draw both blocks and images for obstacles
const DEBUG = true;

// Calculate jump strength based on jump height in blocks
// Using physics: v^2 = 2gh, so v = sqrt(2gh)
// We need to reach JUMP_HEIGHT * BLOCK_SIZE pixels
const JUMP_STRENGTH = -Math.sqrt(
  2 * CONFIG.GRAVITY * CONFIG.JUMP_HEIGHT * CONFIG.BLOCK_SIZE
);

// Game state
enum GameState {
  START,
  PLAYING,
  GAME_OVER,
}

class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState = GameState.START;
  private score: number = 0;

  // Character
  private characterX: number = CONFIG.CHARACTER_START_X;
  private characterY: number = CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE;
  private characterVelocityY: number = 0;
  private characterImage: HTMLImageElement | null = null;
  private obstacleImage: HTMLImageElement | null = null;
  private canDoubleJump: boolean = false;
  private hasDoubleJumped: boolean = false;
  private lives: number = 3;
  private isInCollision: boolean = false;

  // Floor
  private floorOffset: number = 0;

  // Obstacles
  private obstacles: Obstacle[] = [];
  private obstacleTimer: number = 0;
  private obstacleSpacing: number = CONFIG.OBSTACLE_SPACING;

  // UI Elements
  private startScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private scoreDisplay: HTMLElement;
  private scoreValue: HTMLElement;
  private finalScore: HTMLElement;
  private tryAgainBtn: HTMLButtonElement;
  private returnStartBtn: HTMLButtonElement;
  private livesDisplay: HTMLElement;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.width = CONFIG.CANVAS_WIDTH;
    this.canvas.height = CONFIG.CANVAS_HEIGHT;

    // Load UI elements
    this.startScreen = document.getElementById("start-screen")!;
    this.gameOverScreen = document.getElementById("game-over-screen")!;
    this.scoreDisplay = document.getElementById("score-display")!;
    this.scoreValue = document.getElementById("score-value")!;
    this.finalScore = document.getElementById("final-score")!;
    this.livesDisplay = document.getElementById("lives-display")!;
    this.tryAgainBtn = document.getElementById(
      "try-again-btn"
    ) as HTMLButtonElement;
    this.returnStartBtn = document.getElementById(
      "return-start-btn"
    ) as HTMLButtonElement;

    // Try to load character image, fallback to rectangle if not found
    this.loadCharacterImage();

    // Load obstacle image
    this.loadObstacleImage();

    // Load font
    this.loadFont();

    // Setup event listeners
    this.setupEventListeners();

    // Start game loop
    this.gameLoop();
  }

  private loadCharacterImage(): void {
    const img = new Image();
    img.onload = () => {
      this.characterImage = img;
    };
    img.onerror = () => {
      // If image doesn't exist, we'll draw a rectangle instead
      this.characterImage = null;
    };
    // Load feistyGatsby.png as the character sprite
    img.src = "assets/feistyGatsby.png";
  }

  private loadObstacleImage(): void {
    const img = new Image();
    img.onload = () => {
      this.obstacleImage = img;
    };
    img.onerror = () => {
      // If image doesn't exist, obstacles will use default blocks
      this.obstacleImage = null;
    };
    // Load SAM.png as the obstacle image
    img.src = "assets/SAM.png";
  }

  private loadFont(): void {
    // Load the Tiny5 font for canvas rendering
    const font = new FontFace("Tiny5", "url(fonts/Tiny5-Regular.ttf)");
    font
      .load()
      .then((loadedFont) => {
        (document.fonts as any).add(loadedFont);
      })
      .catch((error) => {
        console.warn("Failed to load Tiny5 font:", error);
      });
  }

  private setupEventListeners(): void {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (this.state === GameState.START) {
          this.startGame();
        } else if (this.state === GameState.PLAYING) {
          // Destroy one block from the nearest obstacle
          this.destroyBlock();
        }
      } else if (e.key === " " && this.state === GameState.PLAYING) {
        e.preventDefault();
        this.jump();
      }
    });

    // Button event listeners
    this.tryAgainBtn.addEventListener("click", () => {
      if (this.state === GameState.GAME_OVER) {
        this.restartGame();
      }
    });

    this.returnStartBtn.addEventListener("click", () => {
      if (this.state === GameState.GAME_OVER) {
        this.returnToStart();
      }
    });
  }

  private startGame(): void {
    this.state = GameState.PLAYING;
    this.startScreen.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.scoreDisplay.classList.remove("hidden");
    this.livesDisplay.classList.remove("hidden");
    this.resetGame();
    this.updateLivesDisplay();
  }

  private restartGame(): void {
    this.startGame();
  }

  private returnToStart(): void {
    this.state = GameState.START;
    this.gameOverScreen.classList.add("hidden");
    this.startScreen.classList.remove("hidden");
    this.scoreDisplay.classList.add("hidden");
    this.livesDisplay.classList.add("hidden");
    this.resetGame();
  }

  private resetGame(): void {
    this.score = 0;
    this.lives = 3;
    this.characterX = CONFIG.CHARACTER_START_X;
    this.characterY = CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE;
    this.characterVelocityY = 0;
    this.floorOffset = 0;
    this.obstacles = [];
    this.obstacleTimer = 0;
    this.canDoubleJump = false;
    this.hasDoubleJumped = false;
    this.isInCollision = false;
    this.updateScore();
    this.updateLivesDisplay();
  }

  private jump(): void {
    if (this.characterY >= CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE) {
      // On ground, can jump
      this.characterVelocityY = JUMP_STRENGTH;
      this.canDoubleJump = true;
      this.hasDoubleJumped = false;
    } else if (this.canDoubleJump && !this.hasDoubleJumped) {
      // Double jump
      this.characterVelocityY = JUMP_STRENGTH;
      this.hasDoubleJumped = true;
      this.canDoubleJump = false;
    }
  }

  private destroyBlock(): void {
    // Find the nearest obstacle in front of the character that is on screen
    let nearestObstacle: Obstacle | null = null;
    let minDistance = Infinity;

    for (const obstacle of this.obstacles) {
      // Calculate obstacle width for on-screen check
      let obstacleWidth = CONFIG.BLOCK_SIZE;
      if (obstacle.image && obstacle.blocks.length > 0) {
        const obstacleHeight = obstacle.blocks.length * CONFIG.BLOCK_SIZE;
        const imageAspectRatio = obstacle.image.width / obstacle.image.height;
        obstacleWidth = obstacleHeight * imageAspectRatio;
      }

      // Check if obstacle is on screen (any part visible)
      // Allow destruction once any part of the image begins being rendered on screen
      const isOnScreen =
        obstacle.x + obstacleWidth > 0 && obstacle.x < CONFIG.CANVAS_WIDTH;

      if (obstacle.x > this.characterX && isOnScreen) {
        const distance = obstacle.x - this.characterX;
        if (distance < minDistance && obstacle.blocks.length > 0) {
          minDistance = distance;
          nearestObstacle = obstacle;
        }
      }
    }

    if (nearestObstacle && nearestObstacle.blocks.length > 0) {
      // Remove the top block
      nearestObstacle.blocks.pop();
    }
  }

  private updateScore(): void {
    this.scoreValue.textContent = this.score.toString();
    this.finalScore.textContent = this.score.toString();
  }

  private updateLivesDisplay(): void {
    // Clear existing hearts
    this.livesDisplay.innerHTML = "";

    // Add heart images for each life
    for (let i = 0; i < this.lives; i++) {
      const heartImg = document.createElement("img");
      heartImg.src = "assets/life.png";
      heartImg.alt = "Life";
      this.livesDisplay.appendChild(heartImg);
    }
  }

  private gameOver(): void {
    this.state = GameState.GAME_OVER;
    this.scoreDisplay.classList.add("hidden");
    this.livesDisplay.classList.add("hidden");
    this.gameOverScreen.classList.remove("hidden");
  }

  private update(): void {
    if (this.state !== GameState.PLAYING) return;

    // Update floor
    this.floorOffset += CONFIG.FLOOR_SPEED;

    // Update character physics
    this.characterVelocityY += CONFIG.GRAVITY;
    this.characterY += this.characterVelocityY;

    // Ground collision
    if (this.characterY >= CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE) {
      this.characterY = CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE;
      this.characterVelocityY = 0;
      this.canDoubleJump = false;
      this.hasDoubleJumped = false;
    }

    // Update obstacles
    this.obstacleTimer++;
    if (this.obstacleTimer >= this.obstacleSpacing) {
      this.obstacleTimer = 0;
      this.obstacleSpacing = Math.round(
        CONFIG.OBSTACLE_SPACING * (0.5 + 1.0 * Math.random())
      );
      console.log(this.obstacleSpacing);
      const blockCount = Math.floor(Math.random() * 10) + 1; // 1-10 blocks
      this.obstacles.push(
        new Obstacle(CONFIG.CANVAS_WIDTH, blockCount, this.obstacleImage)
      );
    }

    // Check if character is currently colliding with any obstacle
    let currentlyColliding = false;
    for (const obstacle of this.obstacles) {
      if (this.checkCollision(obstacle)) {
        currentlyColliding = true;
        break;
      }
    }

    // If we were in a collision but are now clear, reset the flag
    if (this.isInCollision && !currentlyColliding) {
      this.isInCollision = false;
    }

    // Move obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.x -= CONFIG.OBSTACLE_SPEED;

      // Remove obstacles that are off screen
      if (obstacle.x + CONFIG.BLOCK_SIZE < 0) {
        this.obstacles.splice(i, 1);
        this.score += obstacle.blocks.length;
        this.updateScore();
      }

      // Collision detection - only process if not already in a collision state
      if (!this.isInCollision && this.checkCollision(obstacle)) {
        this.isInCollision = true;
        this.lives--;
        this.updateLivesDisplay();
        if (this.lives <= 0) {
          this.gameOver();
          return;
        }
      }
    }
  }

  private checkCollision(obstacle: Obstacle): boolean {
    const charLeft = this.characterX;
    const charRight = this.characterX + CONFIG.CHARACTER_SIZE;
    const charTop = this.characterY;
    const charBottom = this.characterY + CONFIG.CHARACTER_SIZE;

    const obstacleLeft = obstacle.x;
    // Calculate obstacle width - use image width if image exists, otherwise use BLOCK_SIZE
    let obstacleWidth = CONFIG.BLOCK_SIZE;
    if (obstacle.image && obstacle.blocks.length > 0) {
      const obstacleHeight = obstacle.blocks.length * CONFIG.BLOCK_SIZE;
      const imageAspectRatio = obstacle.image.width / obstacle.image.height;
      obstacleWidth = obstacleHeight * imageAspectRatio;
    }
    const obstacleRight = obstacle.x + obstacleWidth;

    // Check horizontal overlap
    if (charRight > obstacleLeft && charLeft < obstacleRight) {
      // Check collision with each block in the tower
      for (const block of obstacle.blocks) {
        const blockTop = block.y;
        const blockBottom = block.y + CONFIG.BLOCK_SIZE;

        // Check vertical overlap
        if (charBottom > blockTop && charTop < blockBottom) {
          return true; // Collision detected
        }
      }
    }

    return false;
  }

  private draw(): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    if (this.state === GameState.PLAYING) {
      // Draw floor
      this.drawFloor();

      // Draw obstacles
      for (const obstacle of this.obstacles) {
        this.drawObstacle(obstacle);
      }

      // Draw character
      this.drawCharacter();

      // Draw collision debug visuals if debug mode is enabled
      if (DEBUG) {
        this.drawCollisionDebug();
      }
    }
  }

  private drawFloor(): void {
    this.ctx.fillStyle = "#f8f8f2";
    this.ctx.fillRect(
      0,
      CONFIG.FLOOR_Y,
      CONFIG.CANVAS_WIDTH,
      CONFIG.CANVAS_HEIGHT - CONFIG.FLOOR_Y
    );

    // Draw floor symbols
    this.ctx.fillStyle = "#000000";
    this.ctx.font = "20px Tiny5";
    const symbolWidth = 20;
    const startX = -(this.floorOffset % symbolWidth);

    for (let x = startX; x < CONFIG.CANVAS_WIDTH; x += symbolWidth) {
      this.ctx.fillText(CONFIG.FLOOR_SYMBOL, x, CONFIG.FLOOR_Y + 15);
    }
  }

  private drawObstacle(obstacle: Obstacle): void {
    // Always draw blocks if in debug mode, or if no image is available
    const shouldDrawBlocks = DEBUG || !obstacle.image;

    if (shouldDrawBlocks) {
      this.ctx.fillStyle = "#8B0000";
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = 2;

      for (const block of obstacle.blocks) {
        this.ctx.fillRect(
          obstacle.x,
          block.y,
          CONFIG.BLOCK_SIZE,
          CONFIG.BLOCK_SIZE
        );
        this.ctx.strokeRect(
          obstacle.x,
          block.y,
          CONFIG.BLOCK_SIZE,
          CONFIG.BLOCK_SIZE
        );
      }
    }

    // Draw image if available (and always in debug mode if image exists)
    if (obstacle.image && obstacle.blocks.length > 0) {
      // Calculate obstacle height based on number of remaining blocks
      const obstacleHeight = obstacle.blocks.length * CONFIG.BLOCK_SIZE;

      // Calculate image aspect ratio and scale width to maintain aspect ratio
      const imageAspectRatio = obstacle.image.width / obstacle.image.height;
      const imageHeight = obstacleHeight;
      const imageWidth = imageHeight * imageAspectRatio;

      // Calculate the bottom Y position of the obstacle (lowest block)
      const bottomY = Math.max(
        ...obstacle.blocks.map((block) => block.y + CONFIG.BLOCK_SIZE)
      );
      const drawY = bottomY - obstacleHeight;

      // Draw the image scaled to match the obstacle height
      // If debug mode, draw with some transparency so blocks are visible
      if (DEBUG) {
        this.ctx.globalAlpha = 0.7;
      }
      this.ctx.drawImage(
        obstacle.image,
        obstacle.x,
        drawY,
        imageWidth,
        imageHeight
      );
      if (DEBUG) {
        this.ctx.globalAlpha = 1.0;
      }
    }
  }

  private drawCollisionDebug(): void {
    // Draw character collision box
    this.ctx.strokeStyle = "#00FF00";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.strokeRect(
      this.characterX,
      this.characterY,
      CONFIG.CHARACTER_SIZE,
      CONFIG.CHARACTER_SIZE
    );
    this.ctx.setLineDash([]);

    // Draw obstacle collision boxes and check for collisions
    for (const obstacle of this.obstacles) {
      // Calculate obstacle dimensions
      let obstacleWidth = CONFIG.BLOCK_SIZE;
      let obstacleHeight = obstacle.blocks.length * CONFIG.BLOCK_SIZE;
      if (obstacle.image && obstacle.blocks.length > 0) {
        const imageAspectRatio = obstacle.image.width / obstacle.image.height;
        obstacleWidth = obstacleHeight * imageAspectRatio;
      }

      // Calculate obstacle bounds
      const obstacleLeft = obstacle.x;
      const obstacleRight = obstacle.x + obstacleWidth;
      const obstacleTop = Math.min(...obstacle.blocks.map((block) => block.y));
      const obstacleBottom = obstacleTop + obstacleHeight;

      // Check if currently colliding
      const isColliding = this.checkCollision(obstacle);

      // Draw obstacle collision box
      this.ctx.strokeStyle = isColliding ? "#FF0000" : "#FFFF00";
      this.ctx.lineWidth = isColliding ? 3 : 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeRect(
        obstacleLeft,
        obstacleTop,
        obstacleWidth,
        obstacleHeight
      );
      this.ctx.setLineDash([]);

      // Draw individual block collision boxes
      this.ctx.strokeStyle = "#FF8800";
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([2, 2]);
      for (const block of obstacle.blocks) {
        this.ctx.strokeRect(
          obstacle.x,
          block.y,
          CONFIG.BLOCK_SIZE,
          CONFIG.BLOCK_SIZE
        );
      }
      this.ctx.setLineDash([]);

      // Draw collision indicator if colliding
      if (isColliding) {
        // Draw red overlay on collision area
        this.ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
        const charLeft = this.characterX;
        const charRight = this.characterX + CONFIG.CHARACTER_SIZE;
        const charTop = this.characterY;
        const charBottom = this.characterY + CONFIG.CHARACTER_SIZE;

        const overlapLeft = Math.max(charLeft, obstacleLeft);
        const overlapRight = Math.min(charRight, obstacleRight);
        const overlapTop = Math.max(charTop, obstacleTop);
        const overlapBottom = Math.min(charBottom, obstacleBottom);

        this.ctx.fillRect(
          overlapLeft,
          overlapTop,
          overlapRight - overlapLeft,
          overlapBottom - overlapTop
        );

        // Draw "COLLISION" text
        this.ctx.fillStyle = "#FF0000";
        this.ctx.font = "bold 20px Tiny5";
        this.ctx.fillText("COLLISION!", overlapLeft, overlapTop - 10);
      }
    }

    // Draw collision state indicator
    if (this.isInCollision) {
      this.ctx.fillStyle = "#FF0000";
      this.ctx.font = "bold 16px Tiny5";
      this.ctx.fillText("IN COLLISION STATE", 10, CONFIG.CANVAS_HEIGHT - 30);
    }
  }

  private drawCharacter(): void {
    if (this.characterImage) {
      // Calculate aspect ratio to maintain proportions
      const imageAspectRatio =
        this.characterImage.width / this.characterImage.height;
      const imageHeight = 80; // Same height as green square
      const imageWidth = imageHeight * imageAspectRatio; // Maintain aspect ratio

      // Draw image with bottom aligned to where green square bottom would be
      // characterY is the top, so bottom is at characterY + CHARACTER_SIZE
      // Image bottom will be at characterY + imageHeight, which equals characterY + CHARACTER_SIZE

      this.ctx.drawImage(
        this.characterImage,
        this.characterX,
        this.characterY - imageHeight / 2,
        imageWidth,
        imageHeight
      );
    } else {
      // Fallback: draw a rectangle
      this.ctx.fillStyle = "#00FF00";
      this.ctx.fillRect(
        this.characterX,
        this.characterY,
        CONFIG.CHARACTER_SIZE,
        CONFIG.CHARACTER_SIZE
      );
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        this.characterX,
        this.characterY,
        CONFIG.CHARACTER_SIZE,
        CONFIG.CHARACTER_SIZE
      );
    }
  }

  private gameLoop(): void {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.gameLoop());
  }
}

class Obstacle {
  x: number;
  blocks: { y: number }[];
  image: HTMLImageElement | null;

  constructor(
    startX: number,
    blockCount: number,
    image: HTMLImageElement | null = null
  ) {
    this.x = startX;
    this.blocks = [];
    this.image = image;

    // Create blocks stacked from bottom to top
    for (let i = 0; i < blockCount; i++) {
      this.blocks.push({
        y: CONFIG.FLOOR_Y - CONFIG.BLOCK_SIZE - i * CONFIG.BLOCK_SIZE,
      });
    }
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
