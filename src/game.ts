import {
  DifficultyLevel,
  updateDifficultyDisplay,
  changeDifficulty,
} from "./difficulty/helpers/difficulty";

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
  TREE_SPEED: 1, // Trees move slower than obstacles for parallax effect
  TREE_SPAWN_MIN_FRAMES: 150, // Minimum frames between tree spawns
  TREE_SPAWN_MAX_FRAMES: 400, // Maximum frames between tree spawns
  TREE_MIN_HEIGHT: 320, // Minimum tree height (8 blocks * 40 = 320)
  TREE_MAX_HEIGHT: 400, // Maximum tree height (10 blocks * 40 = 400)
};

// Debug mode - set to true to draw both blocks and images for obstacles
// const DEBUG = true;

// Obstacle image paths - add any number of images here
const OBSTACLE_IMAGE_PATHS = ["assets/DAN.png", "assets/SAM.png"];

// Tree image paths - add any number of images here
const TREE_IMAGE_PATHS = [
  "assets/trees/tree1.png",
  "assets/trees/tree2.png",
  "assets/trees/tree3.png",
  "assets/trees/tree4.png",
  "assets/trees/tree5.png",
  "assets/trees/tree6.png",
];

// Calculate jump strength based on jump height in blocks
// Using physics: v^2 = 2gh, so v = sqrt(2gh)
// We need to reach JUMP_HEIGHT * BLOCK_SIZE pixels
const JUMP_STRENGTH = -Math.sqrt(
  2 * CONFIG.GRAVITY * CONFIG.JUMP_HEIGHT * CONFIG.BLOCK_SIZE
);

const DEBUG = false;

// Game state
enum GameState {
  START,
  PLAYING,
  GAME_OVER_ANIMATING,
  GAME_OVER,
}
export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState = GameState.START;
  private score: number = 0;
  difficulty: DifficultyLevel = DifficultyLevel.MEDIUM;

  // Character
  private characterX: number = CONFIG.CHARACTER_START_X;
  private characterY: number = CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE;
  private characterVelocityY: number = 0;
  private characterImage: HTMLImageElement | null = null;
  private characterBarkImage: HTMLImageElement | null = null;
  private isBarking: boolean = false; // Track if character is in bark animation
  private obstacleImages: { image: HTMLImageElement; path: string }[] = [];
  private madObstacleImages: Map<string, HTMLImageElement> = new Map(); // Maps original image path to mad image
  private canDoubleJump: boolean = false;
  private hasDoubleJumped: boolean = false;
  private lives: number = 3;
  private isInCollision: boolean = false;
  // Touch controls
  private lastTapTime: number = 0;
  private tapDelay: number = 300; // Milliseconds between taps for double tap
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private swipeThreshold: number = 50; // Minimum distance for swipe
  private characterRotation: number = 0; // Rotation in degrees for game over animation
  private gameOverAnimationTime: number = 0; // Time elapsed in animation
  private gameOverAnimationDuration: number = 2000; // Animation duration in milliseconds
  private shakeTime: number = 0; // Time elapsed in shake animation
  private shakeDuration: number = 2000; // Shake animation duration in milliseconds
  private shakeOffsetX: number = 0; // Current shake offset in X direction
  private shakeOffsetY: number = 0; // Current shake offset in Y direction

  // Floor
  private floorOffset: number = 0;

  // Obstacles
  private obstacles: Obstacle[] = [];
  private obstacleTimer: number = 0;
  obstacleSpacing: number = CONFIG.OBSTACLE_SPACING;
  private obstacleSpacingHistory: number[] = []; // Track last 3 spacing values

  // Trees (background parallax)
  private trees: Tree[] = [];
  private treeImages: HTMLImageElement[] = [];
  private treeTimer: number = 0;
  private treeSpawnCounter: number = 0;
  private nextTreeSpawnFrame: number = 0; // Random frame count until next spawn

  // UI Elements
  private startScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private scoreDisplay: HTMLElement;
  private scoreValue: HTMLElement;
  private finalScore: HTMLElement;
  private tryAgainBtn: HTMLButtonElement;
  private returnStartBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private livesDisplay: HTMLElement;
  difficultyText: HTMLElement;
  private instructions: HTMLElement;
  private quitBtn: HTMLButtonElement;
  private topUIContainer: HTMLElement;
  private difficultySelector!: HTMLElement;
  private musicSelector!: HTMLElement;
  private musicText!: HTMLElement;
  private backgroundMusic: HTMLAudioElement | null = null;
  private isMusicOn: boolean = false;
  private selectedMenuOption: "difficulty" | "music" = "difficulty";

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.setupCanvasSize();
    window.addEventListener("resize", () => this.setupCanvasSize());

    // Load UI elements
    this.startScreen = document.getElementById("start-screen")!;
    this.gameOverScreen = document.getElementById("game-over-screen")!;
    this.scoreDisplay = document.getElementById("score-display")!;
    this.scoreValue = document.getElementById("score-value")!;
    this.finalScore = document.getElementById("final-score")!;
    this.livesDisplay = document.getElementById("lives-display")!;
    this.difficultyText = document.getElementById("difficulty-text")!;
    this.difficultySelector = document.getElementById("difficulty-selector")!;
    this.musicSelector = document.getElementById("music-selector")!;
    this.musicText = document.getElementById("music-text")!;
    this.instructions = document.getElementById("instructions")!;
    this.topUIContainer = document.getElementById("top-ui-container")!;
    this.quitBtn = document.getElementById("quit-btn") as HTMLButtonElement;
    this.startBtn = document.getElementById("start-btn") as HTMLButtonElement;
    this.tryAgainBtn = document.getElementById(
      "try-again-btn"
    ) as HTMLButtonElement;
    this.returnStartBtn = document.getElementById(
      "return-start-btn"
    ) as HTMLButtonElement;

    // Initialize difficulty display
    this.difficultyText.textContent = DifficultyLevel[this.difficulty];

    // Show instructions on start screen
    this.instructions.classList.remove("hidden");

    // Try to load character image, fallback to rectangle if not found
    this.loadCharacterImage();

    // Load obstacle image
    this.loadObstacleImage();

    // Load character bark image
    this.loadCharacterBarkImage();

    // Load mad obstacle image
    this.loadMadObstacleImage();

    // Load tree images
    this.loadTreeImages();

    // Initialize tree spawn timer
    this.nextTreeSpawnFrame =
      CONFIG.TREE_SPAWN_MIN_FRAMES +
      Math.floor(
        Math.random() *
          (CONFIG.TREE_SPAWN_MAX_FRAMES - CONFIG.TREE_SPAWN_MIN_FRAMES)
      );

    // Load music preference from localStorage
    this.loadMusicPreference();

    // Initialize background music
    this.initializeBackgroundMusic();

    // Update menu selection display
    this.updateMenuSelection();

    // Load font
    this.loadFont();

    // Setup event listeners
    this.setupEventListeners();
    this.setupTouchControls();

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
    // Load GBY.png as the character sprite
    img.src = "/assets/GBY.png";
  }

  private loadCharacterBarkImage(): void {
    const img = new Image();
    img.onload = () => {
      this.characterBarkImage = img;
    };
    img.onerror = () => {
      console.warn("Failed to load character bark image: /assets/GBY-BARK.png");
      this.characterBarkImage = null;
    };
    // Load GBY-BARK.png for bark animation
    img.src = "/assets/GBY-BARK.png";
  }

  private loadObstacleImage(): void {
    // Load all obstacle images from the paths array
    let loadedCount = 0;
    const totalImages = OBSTACLE_IMAGE_PATHS.length;

    OBSTACLE_IMAGE_PATHS.forEach((imagePath) => {
      const img = new Image();
      img.onload = () => {
        this.obstacleImages.push({ image: img, path: imagePath });
        loadedCount++;
      };
      img.onerror = () => {
        // If image doesn't exist, skip it
        console.warn(`Failed to load obstacle image: ${imagePath}`);
        loadedCount++;
      };
      img.src = imagePath;
    });
  }

  private getRandomObstacleImage(): {
    image: HTMLImageElement | null;
    path: string | null;
  } {
    if (this.obstacleImages.length === 0) {
      return { image: null, path: null };
    }
    // Randomly select an image from the loaded images
    const randomIndex = Math.floor(Math.random() * this.obstacleImages.length);
    const obstacleData = this.obstacleImages[randomIndex];
    return { image: obstacleData.image, path: obstacleData.path };
  }

  private loadMadObstacleImage(): void {
    // Load mad images for each obstacle type
    const madImageMap: { [key: string]: string } = {
      "assets/DAN.png": "assets/DAN-MAD.png",
      "assets/SAM.png": "assets/SAM-MAD.png",
    };

    OBSTACLE_IMAGE_PATHS.forEach((originalPath) => {
      const madPath = madImageMap[originalPath];
      if (madPath) {
        const img = new Image();
        img.onload = () => {
          this.madObstacleImages.set(originalPath, img);
        };
        img.onerror = () => {
          console.warn(`Failed to load mad obstacle image: ${madPath}`);
        };
        img.src = madPath;
      }
    });
  }

  private loadTreeImages(): void {
    // Load all tree images from the paths array
    TREE_IMAGE_PATHS.forEach((imagePath) => {
      const img = new Image();
      img.onload = () => {
        this.treeImages.push(img);
      };
      img.onerror = () => {
        console.warn(`Failed to load tree image: ${imagePath}`);
      };
      img.src = imagePath;
    });
  }

  private getRandomTreeImage(): HTMLImageElement | null {
    if (this.treeImages.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * this.treeImages.length);
    return this.treeImages[randomIndex];
  }

  private loadFont(): void {
    // Load the Tiny5 font for canvas rendering
    const font = new FontFace("Tiny5", "url(/fonts/Tiny5-Regular.ttf)");
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
        }
      } else if (e.key === " " && this.state === GameState.PLAYING) {
        e.preventDefault();
        // Destroy one block from the nearest obstacle
        this.destroyBlock();
      } else if (e.key === "ArrowUp" && this.state === GameState.PLAYING) {
        e.preventDefault();
        this.jump();
      } else if (this.state === GameState.START) {
        // Handle menu navigation and selection
        // Check both e.key and e.code for better browser compatibility
        const isArrowDown =
          e.key === "ArrowDown" || e.code === "ArrowDown" || e.keyCode === 40;
        const isArrowUp =
          e.key === "ArrowUp" || e.code === "ArrowUp" || e.keyCode === 38;
        const isArrowLeft =
          e.key === "ArrowLeft" || e.code === "ArrowLeft" || e.keyCode === 37;
        const isArrowRight =
          e.key === "ArrowRight" || e.code === "ArrowRight" || e.keyCode === 39;

        if (isArrowDown) {
          e.preventDefault();
          e.stopPropagation();
          // Toggle between difficulty and music
          this.selectedMenuOption =
            this.selectedMenuOption === "difficulty" ? "music" : "difficulty";
          this.updateMenuSelection();
        } else if (isArrowUp) {
          e.preventDefault();
          e.stopPropagation();
          // Toggle between difficulty and music (reverse)
          this.selectedMenuOption =
            this.selectedMenuOption === "difficulty" ? "music" : "difficulty";
          this.updateMenuSelection();
        } else if (isArrowLeft || isArrowRight) {
          e.preventDefault();
          e.stopPropagation();
          if (this.selectedMenuOption === "difficulty") {
            // Change difficulty
            if (isArrowLeft) {
              changeDifficulty(this, -1);
            } else {
              changeDifficulty(this, 1);
            }
          } else if (this.selectedMenuOption === "music") {
            // Toggle music (both left and right toggle on/off)
            this.toggleMusic(!this.isMusicOn);
          }
        }
      }
    });

    // Button event listeners
    this.startBtn.addEventListener("click", () => {
      if (this.state === GameState.START) {
        this.startGame();
      }
    });

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

    this.quitBtn.addEventListener("click", () => {
      if (
        this.state === GameState.PLAYING ||
        this.state === GameState.GAME_OVER_ANIMATING
      ) {
        // Force game over
        this.finishGameOver();
      }
    });
  }

  private setupCanvasSize(): void {
    // Canvas fills the entire viewport
    const maxWidth = window.innerWidth;
    const maxHeight = window.innerHeight;

    // Set canvas internal resolution to match viewport
    this.canvas.width = maxWidth;
    this.canvas.height = maxHeight;

    // Update CONFIG to match actual canvas size for game logic
    (CONFIG as any).CANVAS_WIDTH = maxWidth;
    (CONFIG as any).CANVAS_HEIGHT = maxHeight;
    (CONFIG as any).FLOOR_Y = maxHeight - 50; // Keep floor near bottom
    (CONFIG as any).CHARACTER_START_X = maxWidth * 0.15; // 15% from left edge

    // Canvas style fills container (handled by CSS)
    this.canvas.style.width = `${maxWidth}px`;
    this.canvas.style.height = `${maxHeight}px`;
  }

  private setupTouchControls(): void {
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchStartTime = Date.now();
    });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (!e.changedTouches[0]) return;

      const touch = e.changedTouches[0];
      const touchEndX = touch.clientX;
      const touchEndY = touch.clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;
      const deltaTime = touchEndTime - this.touchStartTime;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (this.state === GameState.PLAYING) {
        // Check for swipe right (bark)
        if (
          Math.abs(deltaX) > Math.abs(deltaY) &&
          deltaX > this.swipeThreshold &&
          deltaTime < 300
        ) {
          this.destroyBlock();
          return;
        }

        // Check for tap/double tap (jump)
        if (distance < 10 && deltaTime < 300) {
          const currentTime = Date.now();
          const timeSinceLastTap = currentTime - this.lastTapTime;

          if (timeSinceLastTap < this.tapDelay && timeSinceLastTap > 0) {
            // Double tap - double jump
            if (this.characterY >= CONFIG.FLOOR_Y - CONFIG.CHARACTER_SIZE) {
              // On ground: do normal jump first
              this.jump();
              // Then immediately trigger double jump on next frame
              requestAnimationFrame(() => {
                if (this.canDoubleJump && !this.hasDoubleJumped) {
                  this.characterVelocityY = JUMP_STRENGTH;
                  this.hasDoubleJumped = true;
                  this.canDoubleJump = false;
                }
              });
            } else if (this.canDoubleJump && !this.hasDoubleJumped) {
              // Already in air, trigger double jump
              this.characterVelocityY = JUMP_STRENGTH;
              this.hasDoubleJumped = true;
              this.canDoubleJump = false;
            }
          } else {
            // Single tap - jump
            this.jump();
          }
          this.lastTapTime = currentTime;
        }
      } else if (this.state === GameState.START) {
        // Handle difficulty selection on start screen with swipe
        if (
          Math.abs(deltaX) > Math.abs(deltaY) &&
          Math.abs(deltaX) > this.swipeThreshold &&
          deltaTime < 300
        ) {
          if (deltaX > 0) {
            // Swipe right - increase difficulty
            changeDifficulty(this, 1);
          } else {
            // Swipe left - decrease difficulty
            changeDifficulty(this, -1);
          }
        }
      }
    });
  }

  private startGame(): void {
    this.state = GameState.PLAYING;
    this.startScreen.classList.add("hidden");
    this.instructions.classList.add("hidden");
    this.gameOverScreen.classList.add("hidden");
    this.topUIContainer.classList.remove("hidden");
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
    this.instructions.classList.remove("hidden");
    this.topUIContainer.classList.add("hidden");
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
    this.trees = [];
    this.treeSpawnCounter = 0;
    this.nextTreeSpawnFrame =
      CONFIG.TREE_SPAWN_MIN_FRAMES +
      Math.floor(
        Math.random() *
          (CONFIG.TREE_SPAWN_MAX_FRAMES - CONFIG.TREE_SPAWN_MIN_FRAMES)
      );
    this.canDoubleJump = false;
    this.hasDoubleJumped = false;
    this.isInCollision = false;
    this.characterRotation = 0;
    this.gameOverAnimationTime = 0;
    this.shakeTime = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.isBarking = false;
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
        if (distance < minDistance && obstacle.blocks.length > 2) {
          minDistance = distance;
          nearestObstacle = obstacle;
        }
      }
    }

    if (nearestObstacle && nearestObstacle.blocks.length > 2) {
      // Remove the top block (minimum 2 blocks required)
      nearestObstacle.blocks.pop();
      // Start shake animation and switch to bark image
      this.shakeTime = 0;
      this.isBarking = true;
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
      heartImg.src = "/assets/life.png";
      heartImg.alt = "Life";
      this.livesDisplay.appendChild(heartImg);
    }
  }

  private gameOver(): void {
    // Start the animation instead of immediately showing game over screen
    this.state = GameState.GAME_OVER_ANIMATING;
    this.characterRotation = 0;
    this.gameOverAnimationTime = 0;
  }

  private finishGameOver(): void {
    // Called after animation completes or when quit is pressed
    this.state = GameState.GAME_OVER;
    this.topUIContainer.classList.add("hidden");
    this.gameOverScreen.classList.remove("hidden");
  }

  private update(): void {
    if (this.state === GameState.GAME_OVER_ANIMATING) {
      // Update animation
      this.gameOverAnimationTime += 16; // Assume ~60fps (16ms per frame)
      const progress = Math.min(
        this.gameOverAnimationTime / this.gameOverAnimationDuration,
        1
      );
      this.characterRotation = progress * 180; // Rotate from 0 to 180 degrees

      if (progress >= 1) {
        // Animation complete, show game over screen
        this.finishGameOver();
      }
      return;
    }

    // Update shake animation
    if (this.shakeTime >= 0 && this.shakeTime < this.shakeDuration) {
      this.shakeTime += 16; // Assume ~60fps (16ms per frame)
      const progress = this.shakeTime / this.shakeDuration;
      const intensity = 1 - progress; // Decrease intensity over time
      const shakeAmount = 5 * intensity; // Max shake of 5 pixels

      // Generate random shake offset
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * shakeAmount;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * shakeAmount;

      if (progress >= 1) {
        // Animation complete
        this.shakeTime = -1; // Set to -1 to stop animation
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
        this.isBarking = false; // Switch back to normal image
      }
    }

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
      // Track spacing history (keep last 3 values)
      this.obstacleSpacingHistory.push(this.obstacleSpacing);
      if (this.obstacleSpacingHistory.length > 3) {
        this.obstacleSpacingHistory.shift(); // Remove oldest value
      }
      const blockCount = Math.floor(Math.random() * 9) + 2; // 2-10 blocks (minimum 2)
      const { image: randomImage, path: imagePath } =
        this.getRandomObstacleImage();
      this.obstacles.push(
        new Obstacle(CONFIG.CANVAS_WIDTH, blockCount, randomImage, imagePath)
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

    // Spawn trees randomly (with spacing to avoid overlap)
    this.treeSpawnCounter++;
    if (this.treeSpawnCounter >= this.nextTreeSpawnFrame) {
      const randomTreeImage = this.getRandomTreeImage();
      if (randomTreeImage) {
        // Check if there's enough space from the last tree
        let canSpawn = true;
        if (this.trees.length > 0) {
          const lastTree = this.trees[this.trees.length - 1];
          const minDistance = CONFIG.CANVAS_WIDTH * 0.5; // Minimum distance between trees
          if (CONFIG.CANVAS_WIDTH - lastTree.x < minDistance) {
            canSpawn = false;
          }
        }

        if (canSpawn) {
          this.trees.push(new Tree(CONFIG.CANVAS_WIDTH, randomTreeImage));
          // Set next spawn frame randomly
          this.nextTreeSpawnFrame =
            CONFIG.TREE_SPAWN_MIN_FRAMES +
            Math.floor(
              Math.random() *
                (CONFIG.TREE_SPAWN_MAX_FRAMES - CONFIG.TREE_SPAWN_MIN_FRAMES)
            );
          this.treeSpawnCounter = 0;
        }
      } else {
        // If no image available, still reset counter to try again
        this.nextTreeSpawnFrame =
          CONFIG.TREE_SPAWN_MIN_FRAMES +
          Math.floor(
            Math.random() *
              (CONFIG.TREE_SPAWN_MAX_FRAMES - CONFIG.TREE_SPAWN_MIN_FRAMES)
          );
        this.treeSpawnCounter = 0;
      }
    }

    // Move trees (slower than obstacles for parallax)
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i];
      tree.x -= CONFIG.TREE_SPEED;

      // Remove trees that are off screen
      if (tree.x + tree.width < 0) {
        this.trees.splice(i, 1);
      }
    }

    // Cache current time once per frame instead of calling Date.now() multiple times
    const currentTime = Date.now();

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
        // Swap obstacle image to mad version
        this.makeObstacleMad(obstacle);
        if (this.lives <= 0) {
          this.gameOver();
          return;
        }
      }

      // Update mad obstacle timers (use cached time)
      if (obstacle.madUntil && currentTime >= obstacle.madUntil) {
        obstacle.restoreOriginalImage();
      }
    }
  }

  private makeObstacleMad(obstacle: Obstacle): void {
    if (obstacle.originalImagePath && obstacle.originalImage) {
      const madImage = this.madObstacleImages.get(obstacle.originalImagePath);
      if (madImage) {
        obstacle.image = madImage;
        obstacle.madUntil = Date.now() + 2000; // 2 seconds from now
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

    if (
      this.state === GameState.PLAYING ||
      this.state === GameState.GAME_OVER_ANIMATING
    ) {
      // Draw floor
      this.drawFloor();

      // Draw trees (behind obstacles for parallax effect)
      for (const tree of this.trees) {
        this.drawTree(tree);
      }

      // Draw obstacles
      for (const obstacle of this.obstacles) {
        this.drawObstacle(obstacle);
      }

      // Draw character (also during animation)
      this.drawCharacter();

      // Draw collision debug visuals if debug mode is enabled
      if (DEBUG) {
        this.drawCollisionDebug();
      }
    }
  }

  private drawTree(tree: Tree): void {
    if (tree.image) {
      // Use stored height and width (calculated once when tree is created)
      // Draw tree aligned to floor
      this.ctx.drawImage(
        tree.image,
        tree.x,
        CONFIG.FLOOR_Y - tree.height,
        tree.width,
        tree.height
      );
    }
  }

  private drawFloor(): void {
    this.ctx.fillStyle = "#f5f5dc"; // Beige cream
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
    // Draw moving average of obstacle spacing
    if (this.obstacleSpacingHistory.length > 0) {
      const movingAverage =
        this.obstacleSpacingHistory.reduce((a, b) => a + b, 0) /
        this.obstacleSpacingHistory.length;
      this.ctx.fillStyle = "#000000";
      this.ctx.font = "16px Tiny5";
      this.ctx.fillText(
        `Obstacle Spacing MA (3): ${movingAverage.toFixed(1)}`,
        10,
        30
      );
    }

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
      // Optimize: find min without spread operator
      let obstacleTop = obstacle.blocks[0]?.y ?? 0;
      for (let i = 1; i < obstacle.blocks.length; i++) {
        if (obstacle.blocks[i].y < obstacleTop) {
          obstacleTop = obstacle.blocks[i].y;
        }
      }
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
    // Use bark image if barking, otherwise use normal image
    const currentImage =
      this.isBarking && this.characterBarkImage
        ? this.characterBarkImage
        : this.characterImage;

    // Calculate character center for rotation
    const imageHeight = 80;
    const imageAspectRatio = currentImage
      ? currentImage.width / currentImage.height
      : 1;
    const imageWidth = imageHeight * imageAspectRatio;
    const centerX = this.characterX + CONFIG.CHARACTER_SIZE / 2;
    const centerY = this.characterY + CONFIG.CHARACTER_SIZE / 2;

    // Apply rotation if animating
    if (
      this.state === GameState.GAME_OVER_ANIMATING &&
      this.characterRotation > 0
    ) {
      this.ctx.save();
      this.ctx.translate(centerX, centerY);
      this.ctx.rotate((this.characterRotation * Math.PI) / 180);
      this.ctx.translate(-centerX, -centerY);
    }

    // Apply shake offset to drawing position
    const drawX = this.characterX + this.shakeOffsetX;
    const drawY = this.characterY + this.shakeOffsetY;

    if (currentImage) {
      // Calculate aspect ratio to maintain proportions
      const imageAspectRatio = currentImage.width / currentImage.height;
      const imageHeight = 80; // Same height as green square
      const imageWidth = imageHeight * imageAspectRatio; // Maintain aspect ratio

      // Draw image with bottom aligned to where green square bottom would be
      // characterY is the top, so bottom is at characterY + CHARACTER_SIZE
      // Image bottom will be at characterY + imageHeight, which equals characterY + CHARACTER_SIZE

      this.ctx.drawImage(
        currentImage,
        drawX,
        drawY - imageHeight / 2,
        imageWidth,
        imageHeight
      );
    } else {
      // Fallback: draw a rectangle
      this.ctx.fillStyle = "#00FF00";
      this.ctx.fillRect(
        drawX,
        drawY,
        CONFIG.CHARACTER_SIZE,
        CONFIG.CHARACTER_SIZE
      );
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        drawX,
        drawY,
        CONFIG.CHARACTER_SIZE,
        CONFIG.CHARACTER_SIZE
      );
    }

    // Restore transformation if rotation was applied
    if (
      this.state === GameState.GAME_OVER_ANIMATING &&
      this.characterRotation > 0
    ) {
      this.ctx.restore();
    }
  }

  private gameLoop(): void {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.gameLoop());
  }

  private loadMusicPreference(): void {
    const savedMusicState = localStorage.getItem("musicOn");
    if (savedMusicState !== null) {
      this.isMusicOn = savedMusicState === "true";
    } else {
      this.isMusicOn = false; // Default to off
      localStorage.setItem("musicOn", "false");
    }
    this.updateMusicDisplay();
  }

  private initializeBackgroundMusic(): void {
    this.backgroundMusic = new Audio("/assets/Bark Them All Away.mp3");
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = 0.5; // Set volume to 50%

    // Handle autoplay restrictions
    this.backgroundMusic.addEventListener("error", (e) => {
      console.warn("Failed to load background music:", e);
    });

    // Ensure music loops by restarting if it ends (fallback if loop property doesn't work)
    this.backgroundMusic.addEventListener("ended", () => {
      if (this.isMusicOn && this.backgroundMusic) {
        this.backgroundMusic.currentTime = 0;
        this.backgroundMusic.play().catch((error) => {
          console.warn("Failed to restart background music:", error);
        });
      }
    });

    // Start playing if music is on
    if (this.isMusicOn) {
      this.playBackgroundMusic();
    }
  }

  private playBackgroundMusic(): void {
    if (this.backgroundMusic && this.isMusicOn) {
      this.backgroundMusic.play().catch((error) => {
        console.warn("Failed to play background music:", error);
        // Some browsers require user interaction before autoplay
      });
    }
  }

  private stopBackgroundMusic(): void {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
  }

  private toggleMusic(on: boolean): void {
    this.isMusicOn = on;
    localStorage.setItem("musicOn", on.toString());
    this.updateMusicDisplay();

    if (this.isMusicOn) {
      this.playBackgroundMusic();
    } else {
      this.stopBackgroundMusic();
    }
  }

  private updateMusicDisplay(): void {
    if (this.musicText) {
      this.musicText.textContent = `music ${this.isMusicOn ? "on" : "off"}`;
    }
  }

  private updateMenuSelection(): void {
    // Update visual selection indicators
    if (this.difficultySelector && this.musicSelector) {
      if (this.selectedMenuOption === "difficulty") {
        this.difficultySelector.classList.add("selected");
        this.musicSelector.classList.remove("selected");
      } else {
        this.difficultySelector.classList.remove("selected");
        this.musicSelector.classList.add("selected");
      }
    }
  }
}

class Obstacle {
  x: number;
  blocks: { y: number }[];
  image: HTMLImageElement | null;
  originalImage: HTMLImageElement | null;
  originalImagePath: string | null = null; // Store path to original image for mad image lookup
  madUntil: number | null = null; // Timestamp when to restore original image

  constructor(
    startX: number,
    blockCount: number,
    image: HTMLImageElement | null = null,
    imagePath: string | null = null
  ) {
    this.x = startX;
    this.blocks = [];
    this.image = image;
    this.originalImage = image; // Store original image
    this.originalImagePath = imagePath; // Store path for mad image lookup

    // Create blocks stacked from bottom to top
    for (let i = 0; i < blockCount; i++) {
      this.blocks.push({
        y: CONFIG.FLOOR_Y - CONFIG.BLOCK_SIZE - i * CONFIG.BLOCK_SIZE,
      });
    }
  }

  restoreOriginalImage(): void {
    this.image = this.originalImage;
    this.madUntil = null;
  }
}

class Tree {
  x: number;
  image: HTMLImageElement;
  width: number;
  height: number;

  constructor(startX: number, image: HTMLImageElement) {
    this.x = startX;
    this.image = image;

    // Calculate tree height once when created (8-10 blocks: 320-400px)
    // Randomize height for variety
    const heightVariation = Math.random();
    this.height =
      CONFIG.TREE_MIN_HEIGHT +
      (CONFIG.TREE_MAX_HEIGHT - CONFIG.TREE_MIN_HEIGHT) * heightVariation;

    // Calculate width maintaining aspect ratio
    this.width = (image.width / image.height) * this.height;
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
