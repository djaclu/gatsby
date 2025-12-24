import { Game } from "../../game";

export enum DifficultyLevel {
  EASY,
  MEDIUM,
  HARD,
}

export const DifficultySettings = {
  [DifficultyLevel.EASY]: {
    obstacleSpacing: 300,
  },
  [DifficultyLevel.MEDIUM]: {
    obstacleSpacing: 200,
  },
  [DifficultyLevel.HARD]: {
    obstacleSpacing: 500,
  },
};

export function updateDifficultyDisplay(game: Game, debug = true): void {
  const difficultyNames = {
    [DifficultyLevel.EASY]: "Easy",
    [DifficultyLevel.MEDIUM]: "Medium",
    [DifficultyLevel.HARD]: "Hard",
  };
  game.difficultyText.textContent = difficultyNames[game.difficulty];

  if (debug) console.log(`Difficulty: ${game.obstacleSpacing}`);
}

export function changeDifficulty(game: Game, direction: number): void {
  const difficulties = [
    DifficultyLevel.EASY,
    DifficultyLevel.MEDIUM,
    DifficultyLevel.HARD,
  ];
  const currentIndex = difficulties.indexOf(game.difficulty);
  let newIndex = currentIndex + direction;

  // Wrap around
  if (newIndex < 0) {
    newIndex = difficulties.length - 1;
  } else if (newIndex >= difficulties.length) {
    newIndex = 0;
  }

  game.difficulty = difficulties[newIndex];
  updateDifficultyDisplay(game);

  const difficultySettings = DifficultySettings[game.difficulty];
  game.obstacleSpacing = difficultySettings.obstacleSpacing;
}
