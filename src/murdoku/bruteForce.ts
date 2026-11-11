import { isStandable } from "./board";
import { isValidSolution, satisfies } from "./clues";
import { range } from "./rng";
import type { Clue, Puzzle, Solution } from "./types";

/**
 * Backtracking search for every solution, up to `limit`. Shares no deduction
 * logic with `solve`, so tests use it as the reference to check `solve` against.
 */
export function bruteForceSolutions(puzzle: Puzzle, limit = Infinity): Solution[] {
  const { board, people, clues } = puzzle;
  const { size } = board;
  const cells = range(size * size).filter((c) => isStandable(board, c));
  // clues that can already be checked once persons 0..p are placed
  const checkable = (clue: Clue, p: number) =>
    "other" in clue
      ? Math.max(clue.person, clue.other) === p
      : clue.person === p && ["inRoom", "on", "beside"].includes(clue.type);
  const early = people.map((_, p) => clues.filter((clue) => checkable(clue, p)));

  const found: Solution[] = [];
  const placed: number[] = [];
  const place = (p: number) => {
    if (found.length >= limit) return;
    if (p === people.length) {
      if (isValidSolution(puzzle, placed)) found.push([...placed]);
      return;
    }
    for (const cell of cells) {
      const clash = placed
        .slice(0, p)
        .some((c) => Math.floor(c / size) === Math.floor(cell / size) || c % size === cell % size);
      if (clash) continue;
      placed[p] = cell;
      if (early[p]!.every((clue) => satisfies(puzzle, clue, placed))) place(p + 1);
    }
    placed.length = p;
  };
  place(0);
  return found;
}

export function countSolutions(puzzle: Puzzle, limit = 2): number {
  return bruteForceSolutions(puzzle, limit).length;
}
