export type CellValue = number | null;
export type BoardValues = CellValue[];

export const BOARD_SIZE = 9;
export const CELL_COUNT = 81;

export function createEmptyValues(): BoardValues {
  return Array<CellValue>(CELL_COUNT).fill(null);
}

export function createEmptyNotes(): number[] {
  return Array<number>(CELL_COUNT).fill(0);
}

export function toRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE };
}

export function toIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export function inSameUnit(a: number, b: number): boolean {
  const aPos = toRowCol(a);
  const bPos = toRowCol(b);
  if (aPos.row === bPos.row || aPos.col === bPos.col) {
    return true;
  }
  return (
    Math.floor(aPos.row / 3) === Math.floor(bPos.row / 3) &&
    Math.floor(aPos.col / 3) === Math.floor(bPos.col / 3)
  );
}

export function getPeers(index: number): number[] {
  const peers: number[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (i !== index && inSameUnit(index, i)) {
      peers.push(i);
    }
  }
  return peers;
}

export function computeCompletedDigits(values: BoardValues): Set<number> {
  const counts = Array<number>(10).fill(0);
  for (const value of values) {
    if (value !== null) {
      counts[value] += 1;
    }
  }

  const completed = new Set<number>();
  for (let digit = 1; digit <= 9; digit += 1) {
    if (counts[digit] === 9) {
      completed.add(digit);
    }
  }
  return completed;
}

export function computeBlockingMask(values: BoardValues, digit: number): boolean[] {
  const mask = Array<boolean>(CELL_COUNT).fill(false);
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (values[index] !== digit) {
      continue;
    }
    const peers = getPeers(index);
    for (const peer of peers) {
      mask[peer] = true;
    }
  }
  return mask;
}

export function bitForDigit(digit: number): number {
  return 1 << (digit - 1);
}

export function hasNote(noteMask: number, digit: number): boolean {
  return (noteMask & bitForDigit(digit)) !== 0;
}
