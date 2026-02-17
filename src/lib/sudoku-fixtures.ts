import { createEmptyValues, type BoardValues } from "@/lib/sudoku";

export type SudokuFixture = {
  id: string;
  name: string;
  imagePath: string;
  expectedGrid: string;
  enabled?: boolean;
};

export type GridTransform =
  | "identity"
  | "rotate90"
  | "rotate180"
  | "rotate270"
  | "flipH"
  | "flipV"
  | "transpose"
  | "antiTranspose";

export const sudokuFixtures: SudokuFixture[] = [
  {
    id: "sudoku-1",
    name: "Sudoku 1",
    imagePath: "/test-images/sudoku_1.png",
    expectedGrid:
      "..8..........3.7..36...4..8.7.4.9........548.6.5..3.2...376..5.5.6.......2.5.8.3.",
    enabled: true
  },
  {
    id: "sudoku-2",
    name: "Sudoku 2",
    imagePath: "/test-images/sudoku_2.png",
    expectedGrid:
      ".......83...5912.74..68..51.6.35.8.......9.3.37..64..2712...46.8...75..9..5..63..",
    enabled: true
  },
];

export function parseExpectedGrid(grid: string): BoardValues {
  const normalized = grid.trim();
  if (normalized.length !== 81) {
    throw new Error(`Expected grid must have 81 characters, received ${normalized.length}`);
  }

  const values = createEmptyValues();
  for (let i = 0; i < 81; i += 1) {
    const char = normalized[i];
    if (char >= "1" && char <= "9") {
      values[i] = Number.parseInt(char, 10);
    } else if (char === "." || char === "0") {
      values[i] = null;
    } else {
      throw new Error(`Invalid expected grid character '${char}' at index ${i}`);
    }
  }

  return values;
}

export function scoreRecognition(expected: BoardValues, actual: BoardValues): {
  totalExpected: number;
  matchedExpected: number;
  falsePositives: number;
  accuracy: number;
} {
  let totalExpected = 0;
  let matchedExpected = 0;
  let falsePositives = 0;

  for (let i = 0; i < 81; i += 1) {
    if (expected[i] !== null) {
      totalExpected += 1;
      if (actual[i] === expected[i]) {
        matchedExpected += 1;
      }
    }

    if (actual[i] !== null && actual[i] !== expected[i]) {
      falsePositives += 1;
    }
  }

  const accuracy = totalExpected === 0 ? 0 : matchedExpected / totalExpected;
  return { totalExpected, matchedExpected, falsePositives, accuracy };
}

function sourceForTransform(
  row: number,
  col: number,
  transform: GridTransform
): { sourceRow: number; sourceCol: number } {
  if (transform === "identity") return { sourceRow: row, sourceCol: col };
  if (transform === "rotate90") return { sourceRow: 8 - col, sourceCol: row };
  if (transform === "rotate180") return { sourceRow: 8 - row, sourceCol: 8 - col };
  if (transform === "rotate270") return { sourceRow: col, sourceCol: 8 - row };
  if (transform === "flipH") return { sourceRow: row, sourceCol: 8 - col };
  if (transform === "flipV") return { sourceRow: 8 - row, sourceCol: col };
  if (transform === "transpose") return { sourceRow: col, sourceCol: row };
  return { sourceRow: 8 - col, sourceCol: 8 - row };
}

export function transformGrid(values: BoardValues, transform: GridTransform): BoardValues {
  const next: BoardValues = Array<BoardValues[number]>(81).fill(null);
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const { sourceRow, sourceCol } = sourceForTransform(row, col, transform);
      next[row * 9 + col] = values[sourceRow * 9 + sourceCol];
    }
  }
  return next;
}

export function bestAlignment(expected: BoardValues, actual: BoardValues): {
  transform: GridTransform;
  accuracy: number;
  falsePositives: number;
  matchedExpected: number;
  totalExpected: number;
} {
  const transforms: GridTransform[] = [
    "identity",
    "rotate90",
    "rotate180",
    "rotate270",
    "flipH",
    "flipV",
    "transpose",
    "antiTranspose"
  ];

  let best = {
    transform: "identity" as GridTransform,
    ...scoreRecognition(expected, actual)
  };

  for (const transform of transforms) {
    const transformed = transformGrid(actual, transform);
    const score = scoreRecognition(expected, transformed);
    if (score.accuracy > best.accuracy || (score.accuracy === best.accuracy && score.falsePositives < best.falsePositives)) {
      best = { transform, ...score };
    }
  }

  return best;
}

export function gridToString(values: BoardValues): string {
  return values.map((value) => (value === null ? "." : String(value))).join("");
}
