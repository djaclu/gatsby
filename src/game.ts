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
const OBSTACLE_IMAGE_PATHS = ["/assets/DAN.png", "/assets/SAM.png"];

// Tree image paths - add any number of images here
const TREE_IMAGE_PATHS = [
  "/assets/trees/tree1.png",
  "/assets/trees/tree2.png",
  "/assets/trees/tree3.png",
  "/assets/trees/tree4.png",
  "/assets/trees/tree5.png",
  "/assets/trees/tree6.png",
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
  private usernameInput: HTMLInputElement;
  private submitScoreBtn: HTMLButtonElement;
  private submitMessage: HTMLElement;
  private difficultySelector!: HTMLElement;
  private musicSelector!: HTMLElement;
  private musicText!: HTMLElement;
  private backgroundMusic: HTMLAudioElement | null = null;
  private isMusicOn: boolean = false;
  private selectedMenuOption: "difficulty" | "music" = "difficulty";
  private leaderboardEntries: { username: string; score: number }[] = [];
  private leaderboardScrollInterval: number | null = null;
  private currentLeaderboardIndex: number = 0; // Current position in leaderboard (0-24, showing 5 at a time)
  private displayedRows: HTMLTableRowElement[] = []; // Track displayed rows for smooth removal
  private username: string = ""; // Store username for score submission
  private landscapeWarning: HTMLElement;
  private closeLandscapeWarningBtn: HTMLButtonElement;
  private isGamePausedForOrientation: boolean = false;
  private firstTimeTutorial: HTMLElement;
  private closeTutorialBtn: HTMLButtonElement;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.setupCanvasSize();
    window.addEventListener("resize", () => {
      this.setupCanvasSize();
      this.updateInstructionsVisibility();
    });

    // Initial check for instructions visibility
    this.updateInstructionsVisibility();

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
    this.usernameInput = document.getElementById(
      "username-input"
    ) as HTMLInputElement;
    this.submitScoreBtn = document.getElementById(
      "submit-score-btn"
    ) as HTMLButtonElement;
    this.submitMessage = document.getElementById("submit-message")!;
    this.landscapeWarning = document.getElementById("landscape-warning")!;
    this.closeLandscapeWarningBtn = document.getElementById(
      "close-landscape-warning"
    ) as HTMLButtonElement;
    this.firstTimeTutorial = document.getElementById("first-time-tutorial")!;
    this.closeTutorialBtn = document.getElementById(
      "close-tutorial"
    ) as HTMLButtonElement;

    // Initialize settings window
    const menuIcon = document.getElementById("menu-icon") as HTMLButtonElement;
    const settingsWindow = document.getElementById("settings-window")!;

    menuIcon.addEventListener("click", () => {
      settingsWindow.classList.toggle("hidden");
    });

    // Close settings when clicking outside
    settingsWindow.addEventListener("click", (e) => {
      if (e.target === settingsWindow) {
        settingsWindow.classList.add("hidden");
      }
    });

    // Initialize difficulty display
    this.difficultyText.textContent = DifficultyLevel[this.difficulty];

    // Instructions should only show during gameplay, not on start screen
    this.instructions.classList.add("hidden");

    // Initialize leaderboard with placeholder data
    this.initializeLeaderboard();

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

    // Setup landscape warning
    this.closeLandscapeWarningBtn.addEventListener("click", () => {
      this.landscapeWarning.classList.add("hidden");
      if (this.isGamePausedForOrientation) {
        // Check orientation again when closing
        const isMobile = window.innerWidth <= 768;
        const isPortrait = window.innerHeight > window.innerWidth;
        if (!isPortrait || !isMobile) {
          this.isGamePausedForOrientation = false;
          this.startGame(); // Start the game
        }
      }
    });

    // Listen for orientation changes
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        if (this.isGamePausedForOrientation) {
          const isMobile = window.innerWidth <= 768;
          const isPortrait = window.innerHeight > window.innerWidth;
          if (!isPortrait || !isMobile) {
            this.landscapeWarning.classList.add("hidden");
            this.isGamePausedForOrientation = false;
            this.startGame(); // Start the game
          }
        }
      }, 100);
    });

    // Check for first-time user and show tutorial
    this.checkFirstTimeUser();

    // Check for first-time user and show tutorial
    this.checkFirstTimeUser();

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
      "/assets/DAN.png": "/assets/DAN-MAD.png",
      "/assets/SAM.png": "/assets/SAM-MAD.png",
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

    // Submit score button
    this.submitScoreBtn.addEventListener("click", () => {
      this.handleScoreSubmission();
    });

    // Allow Enter key to submit score
    this.usernameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleScoreSubmission();
      }
    });

    // Add click listeners to difficulty arrows
    const difficultyArrows =
      this.difficultySelector.querySelectorAll(".difficulty-arrow");
    if (difficultyArrows.length >= 2) {
      // Left arrow - decrease difficulty
      difficultyArrows[0].addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeDifficulty(this, -1);
      });
      // Right arrow - increase difficulty
      difficultyArrows[1].addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeDifficulty(this, 1);
      });
    }

    // Add click listeners to music arrows
    const musicArrows =
      this.musicSelector.querySelectorAll(".difficulty-arrow");
    if (musicArrows.length >= 2) {
      // Left arrow - toggle music off
      musicArrows[0].addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMusic(false);
      });
      // Right arrow - toggle music on
      musicArrows[1].addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMusic(true);
      });
    }

    // Also allow clicking on the selector itself to toggle music
    this.musicSelector.addEventListener("click", (e) => {
      // Only toggle if clicking on the selector itself, not the arrows
      if (
        e.target === this.musicSelector ||
        (e.target as HTMLElement).id === "music-text"
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleMusic(!this.isMusicOn);
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
    // Stop leaderboard auto-scroll when game starts
    this.stopLeaderboardAutoScroll();

    // Check if mobile and in portrait orientation
    const isMobile = window.innerWidth <= 768;
    const isPortrait = window.innerHeight > window.innerWidth;

    if (isMobile && isPortrait) {
      // Pause game and show landscape warning
      this.isGamePausedForOrientation = true;
      this.state = GameState.START; // Keep in START state until orientation is correct
      this.landscapeWarning.classList.remove("hidden");
      return;
    }

    // If warning was showing, hide it
    this.landscapeWarning.classList.add("hidden");
    this.isGamePausedForOrientation = false;

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
    this.instructions.classList.add("hidden");
    this.topUIContainer.classList.add("hidden");
    this.resetGame();
    // Refresh and restart leaderboard auto-scroll when returning to start screen
    this.refreshLeaderboard().then(() => {
      this.currentLeaderboardIndex = 0;
      this.displayTopTen();
      // Only autoscroll if there are more than 5 entries
      if (this.leaderboardEntries.length > 5) {
        this.startLeaderboardAutoScroll();
      }
    });
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

  private async initializeLeaderboard(): Promise<void> {
    try {
      console.log("Fetching leaderboard from API...");
      // Fetch leaderboard from API
      const response = await fetch("/api/leaderboard");
      console.log("Leaderboard API response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Leaderboard data received:", data);

        // Use real data from API (even if empty)
        // Filter out any entries with null/undefined scores and ensure valid data
        this.leaderboardEntries = (data.entries || [])
          .filter(
            (entry: any) => entry && entry.username && entry.score != null
          )
          .map((entry: any) => ({
            username: entry.username || "Unknown",
            score:
              typeof entry.score === "number"
                ? entry.score
                : Number(entry.score) || 0,
            position: entry.position || 0,
          }));

        if (this.leaderboardEntries.length === 0) {
          console.log("Leaderboard is empty - no scores yet");
          console.log("Using placeholder leaderboard values");
          this.loadPlaceholderLeaderboard();
        } else {
          console.log(
            `Loaded ${this.leaderboardEntries.length} entries from database`
          );
        }
      } else {
        // API returned an error status
        // Clone the response first so we can read it without consuming the original
        const responseClone = response.clone();
        let errorText = "";
        try {
          errorText = await responseClone.text();
          // Try to parse as JSON
          try {
            const errorData = JSON.parse(errorText);
            errorText =
              errorData.error ||
              errorData.message ||
              errorData.details ||
              errorText;
          } catch {
            // Not JSON, use text as-is
          }
        } catch (readError) {
          errorText = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error("Leaderboard API error:", response.status, errorText);
        console.log("Using placeholder leaderboard values due to error");

        // Use placeholder data for any error
        this.loadPlaceholderLeaderboard();
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      console.log("Using placeholder leaderboard values due to fetch error");
      // Use placeholder data for any error
      this.loadPlaceholderLeaderboard();
    }

    // Display top 5 by default (or empty if no data)
    this.currentLeaderboardIndex = 0;
    this.displayTopTen();

    // Start auto-scrolling (only if we have more than 5 entries)
    if (this.leaderboardEntries.length > 5) {
      this.startLeaderboardAutoScroll();
    }
  }

  private loadPlaceholderLeaderboard(): void {
    console.log("Loading placeholder leaderboard data");
    // Generate placeholder data for top 25 scores
    this.leaderboardEntries = [];
    for (let i = 1; i <= 25; i++) {
      this.leaderboardEntries.push({
        username: `Player${i}`,
        score: Math.floor(Math.random() * 10000) + 1000,
      });
    }

    // Sort by score descending
    this.leaderboardEntries.sort((a, b) => b.score - a.score);
    console.log(
      `Generated ${this.leaderboardEntries.length} placeholder entries`
    );
  }

  private displayTopTen(): void {
    this.displayLeaderboardGroup(0);
  }

  private displayLeaderboardGroup(groupIndex: number): void {
    const leaderboardBody = document.getElementById("leaderboard-body");
    if (!leaderboardBody) return;

    // If no entries, show empty state
    if (this.leaderboardEntries.length === 0) {
      leaderboardBody.innerHTML = "";
      this.displayedRows = [];
      const row = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 3;
      emptyCell.textContent = "No scores yet";
      emptyCell.style.textAlign = "center";
      emptyCell.style.color = "#888";
      emptyCell.style.padding = "20px";
      row.appendChild(emptyCell);
      leaderboardBody.appendChild(row);
      return;
    }

    // Calculate the group of 10 scores (1-10, 11-20, 21-30, etc.)
    const groupSize = 10;
    const startIndex = groupIndex * groupSize;
    const endIndex = Math.min(
      startIndex + groupSize,
      this.leaderboardEntries.length
    );
    const entriesToShow = this.leaderboardEntries.slice(startIndex, endIndex);

    // Fade out existing content
    leaderboardBody.style.opacity = "0";
    leaderboardBody.style.transform = "translateY(-10px)";
    leaderboardBody.style.transition = "opacity 0.5s ease, transform 0.5s ease";

    setTimeout(() => {
      // Clear existing rows
      leaderboardBody.innerHTML = "";
      this.displayedRows = [];

      // Always show exactly 10 rows
      for (let i = 0; i < groupSize; i++) {
        const position = startIndex + i + 1;
        let row: HTMLTableRowElement;

        if (i < entriesToShow.length) {
          // Show actual entry
          row = this.createLeaderboardRow(entriesToShow[i], position);
        } else {
          // Fill with empty row
          row = this.createEmptyLeaderboardRow(position);
        }

        leaderboardBody.appendChild(row);
        this.displayedRows.push(row);
      }

      // Fade in new content
      requestAnimationFrame(() => {
        leaderboardBody.style.opacity = "1";
        leaderboardBody.style.transform = "translateY(0)";
      });
    }, 500);
  }

  private createEmptyLeaderboardRow(position: number): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.style.opacity = "0.3"; // Make empty rows semi-transparent

    const positionCell = document.createElement("td");
    positionCell.textContent = position.toString();
    const usernameCell = document.createElement("td");
    usernameCell.textContent = "—";
    const scoreCell = document.createElement("td");
    scoreCell.textContent = "—";

    row.appendChild(positionCell);
    row.appendChild(usernameCell);
    row.appendChild(scoreCell);

    return row;
  }

  private createLeaderboardRow(
    entry: { username: string; score: number },
    position: number
  ): HTMLTableRowElement {
    const row = document.createElement("tr");

    // Get current player's username from localStorage
    const currentPlayerUsername =
      localStorage.getItem("gatsbys-username") || this.username;
    const isCurrentPlayer =
      currentPlayerUsername &&
      entry.username &&
      entry.username.toLowerCase() === currentPlayerUsername.toLowerCase();

    // If this is the current player's score, add bold styling
    if (isCurrentPlayer) {
      row.style.fontWeight = "bold";
      row.style.color = "#000";
    }

    const positionCell = document.createElement("td");
    positionCell.textContent = position.toString();
    const usernameCell = document.createElement("td");
    usernameCell.textContent = entry.username || "Unknown";
    const scoreCell = document.createElement("td");
    const score = entry.score != null ? Number(entry.score) : 0;
    scoreCell.textContent = isNaN(score) ? "0" : score.toLocaleString();

    row.appendChild(positionCell);
    row.appendChild(usernameCell);
    row.appendChild(scoreCell);

    return row;
  }

  private scrollToNextScore(): void {
    if (this.leaderboardEntries.length === 0) return;

    // Move to next group of 10
    // Group 0: positions 1-10
    // Group 1: positions 11-20
    // Group 2: positions 21-30
    this.currentLeaderboardIndex++;

    // Calculate maximum group index (for 25 entries, we have 3 groups: 0-2)
    const groupSize = 10;
    const maxGroupIndex =
      Math.ceil(this.leaderboardEntries.length / groupSize) - 1;

    // If we've reached the end, reset to beginning
    if (this.currentLeaderboardIndex > maxGroupIndex) {
      this.currentLeaderboardIndex = 0;
    }

    // Display the group with smooth transition
    this.displayLeaderboardGroup(this.currentLeaderboardIndex);
  }

  private startLeaderboardAutoScroll(): void {
    // Only autoscroll if there are more than 10 scores
    if (this.leaderboardEntries.length <= 10) {
      return;
    }

    // Clear any existing interval
    if (this.leaderboardScrollInterval !== null) {
      clearInterval(this.leaderboardScrollInterval);
    }

    // Auto-scroll every 4 seconds to reveal next group
    this.leaderboardScrollInterval = window.setInterval(() => {
      this.scrollToNextScore();
    }, 4000);
  }

  private stopLeaderboardAutoScroll(): void {
    if (this.leaderboardScrollInterval !== null) {
      clearInterval(this.leaderboardScrollInterval);
      this.leaderboardScrollInterval = null;
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

    // Clear username input and message
    this.usernameInput.value = "";
    this.submitMessage.textContent = "";
    this.submitMessage.classList.add("hidden");

    // Load saved username if available
    const savedUsername = localStorage.getItem("gatsbys-username");
    if (savedUsername) {
      this.usernameInput.value = savedUsername;
    }
  }

  private async handleScoreSubmission(): Promise<void> {
    const username = this.usernameInput.value.trim();

    // If username is empty, do nothing
    if (!username) {
      return;
    }

    // Sanitize username (remove special characters, limit length)
    const sanitizedUsername = username
      .slice(0, 50)
      .replace(/[^a-zA-Z0-9_-]/g, "");

    if (sanitizedUsername.length === 0) {
      this.showSubmitMessage(
        "Invalid username. Use only letters, numbers, hyphens, and underscores.",
        "error"
      );
      return;
    }

    // Disable button during submission
    this.submitScoreBtn.disabled = true;
    this.submitScoreBtn.textContent = "Submitting...";

    try {
      // Submit score (API handles replacing if username exists)
      const result = await this.submitScore(sanitizedUsername, this.score);

      if (result.success) {
        // Save username for future games
        localStorage.setItem("gatsbys-username", sanitizedUsername);
        this.showSubmitMessage(
          result.message || "Score submitted successfully!",
          "success"
        );

        // Refresh leaderboard after submission
        await this.refreshLeaderboard();
      } else {
        // Show the actual error message from the API
        this.showSubmitMessage(
          result.message || "Failed to submit score. Please try again.",
          "error"
        );
      }
    } catch (error) {
      console.error("Error submitting score:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error submitting score. Please try again.";
      this.showSubmitMessage(errorMessage, "error");
    } finally {
      // Re-enable button
      this.submitScoreBtn.disabled = false;
      this.submitScoreBtn.textContent = "Submit Score";
    }
  }

  private showSubmitMessage(message: string, type: "success" | "error"): void {
    this.submitMessage.textContent = message;
    this.submitMessage.classList.remove("hidden");
    this.submitMessage.className = `submit-message ${type}`;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.submitMessage.classList.add("hidden");
    }, 3000);
  }

  private async submitScore(
    username: string,
    score: number
  ): Promise<{ success: boolean; message?: string }> {
    try {
      console.log("Submitting score:", { username, score });
      const response = await fetch("/api/submit-score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, score }),
      });

      console.log("Response status:", response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log("Score submitted:", data);
        return {
          success: data.success !== false,
          message:
            data.message ||
            (data.success ? "Score submitted!" : "Score not updated."),
        };
      } else {
        // Try to get error message from response
        // Clone the response first so we can read it without consuming the original
        const responseClone = response.clone();
        let errorMessage = "Failed to submit score";
        try {
          const errorText = await responseClone.text();
          // Try to parse as JSON
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.message || errorMessage;
            console.error("API error response:", errorData);
          } catch {
            // Not JSON, use text as-is
            errorMessage = errorText || errorMessage;
            console.error("API error text:", errorText);
          }
        } catch (readError) {
          console.error("Failed to read error response:", readError);
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error("Failed to submit score:", errorMessage, response.status);
        return {
          success: false,
          message: errorMessage,
        };
      }
    } catch (error) {
      console.error("Error submitting score:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Network error. Please check your connection and ensure the API is running.";

      // Check if it's a 404 (API not found)
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return {
          success: false,
          message:
            "API endpoint not found. Make sure the serverless function is deployed.",
        };
      }

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  private async refreshLeaderboard(): Promise<void> {
    try {
      console.log("Refreshing leaderboard...");
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        const data = await response.json();
        this.leaderboardEntries = data.entries || [];
        console.log(
          `Refreshed leaderboard: ${this.leaderboardEntries.length} entries`
        );

        // Update display if we're on the start screen
        if (this.state === GameState.START) {
          this.currentLeaderboardIndex = 0;
          this.displayTopTen();

          // Restart auto-scroll if we have more than 5 entries
          if (this.leaderboardEntries.length > 5) {
            this.startLeaderboardAutoScroll();
          }
        }
      } else {
        console.error("Failed to refresh leaderboard:", response.status);
      }
    } catch (error) {
      console.error("Failed to refresh leaderboard:", error);
    }
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

  private updateInstructionsVisibility(): void {
    // Check window width to determine if mobile or desktop
    // This ensures instructions update when window is resized
    const isMobile = window.innerWidth <= 768;

    // The CSS media queries handle the actual display,
    // but we can add a class to help with any additional logic if needed
    if (this.instructions) {
      if (isMobile) {
        this.instructions.classList.add("mobile-view");
        this.instructions.classList.remove("desktop-view");
      } else {
        this.instructions.classList.add("desktop-view");
        this.instructions.classList.remove("mobile-view");
      }
    }
  }

  private checkFirstTimeUser(): void {
    const hasSeenTutorial = localStorage.getItem("gatsbys-world-tutorial-seen");

    // Show tutorial if it hasn't been seen (null, undefined, or "false")
    if (!hasSeenTutorial || hasSeenTutorial === "false") {
      // Show tutorial after a short delay to ensure page is loaded
      setTimeout(() => {
        if (this.firstTimeTutorial) {
          this.firstTimeTutorial.classList.remove("hidden");
        }
      }, 500);
    }

    // Close tutorial button
    if (this.closeTutorialBtn) {
      this.closeTutorialBtn.addEventListener("click", () => {
        if (this.firstTimeTutorial) {
          this.firstTimeTutorial.classList.add("hidden");
        }
        localStorage.setItem("gatsbys-world-tutorial-seen", "true");
      });
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
