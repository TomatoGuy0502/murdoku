import { describe, expect, test } from "vite-plus/test";
import { isStandable } from "./board";
import {
  MAX_LEVEL,
  bruteForceSolutions,
  generatePuzzle,
  isValidSolution,
  solve,
  stepLevel,
} from "./index";

const seeds = Array.from({ length: 15 }, (_, i) => i + 1);

describe.each([4, 5, 6])("size %i", (size) => {
  test.each(seeds)("seed %i: solvable by deduction, with exactly one solution", (seed) => {
    const puzzle = generatePuzzle({ size, seed });
    const { board, people, victim, clues, solution, murderer } = puzzle;

    expect(people).toHaveLength(size);
    // no room is so small that standing in it gives the answer away
    for (const room of board.roomKinds.keys()) {
      const cells = board.rooms.flatMap((r, cell) => (r === room ? [cell] : []));
      expect(cells.filter((cell) => isStandable(board, cell)).length).toBeGreaterThanOrEqual(2);
    }
    expect(isValidSolution(puzzle, solution)).toBe(true);
    expect(solve(puzzle)).toMatchObject({ solved: true, solution });
    expect(bruteForceSolutions(puzzle, 2)).toEqual([solution]);

    expect(murderer).not.toBe(victim);
    expect(board.rooms[solution[murderer]!]).toBe(board.rooms[solution[victim]!]);
    for (let p = 0; p < size; p++) expect(clues.some((c) => c.person === p)).toBe(p !== victim);
  });

  test.each(seeds)("seed %i: no clue is redundant", (seed) => {
    const puzzle = generatePuzzle({ size, seed });
    for (const clue of puzzle.clues) {
      const clues = puzzle.clues.filter((c) => c !== clue);
      if (clues.some((c) => c.person === clue.person))
        expect(solve({ ...puzzle, clues }, { maxLevel: 3 }).solved).toBe(false);
    }
  });
});

test("same seed gives the same puzzle", () => {
  expect(generatePuzzle({ seed: 42 })).toEqual(generatePuzzle({ seed: 42 }));
  expect(generatePuzzle({ seed: 42 })).not.toEqual(generatePuzzle({ seed: 43 }));
});

test("sizes 7 to 9 generate and solve", () => {
  for (const size of [7, 8, 9]) {
    const puzzle = generatePuzzle({ size, seed: size });
    expect(solve(puzzle).solution).toEqual(puzzle.solution);
  }
});

test("rejects sizes outside 4 to 9", () => {
  expect(() => generatePuzzle({ size: 3 })).toThrow(RangeError);
  expect(() => generatePuzzle({ size: 10 })).toThrow(RangeError);
});

// The deduction rules must never rule out a real solution, even when the
// puzzle is under-constrained and they cannot finish.
describe.each([3, MAX_LEVEL])("techniques up to level %i", (maxLevel) => {
  test.each(seeds)("seed %i: deduction never removes a real solution", (seed) => {
    const full = generatePuzzle({ size: 5, seed, maxLevel });
    for (const keepEvery of [2, 3]) {
      const puzzle = { ...full, clues: full.clues.filter((_, i) => i % keepEvery === 0) };
      const { candidates } = solve(puzzle, { maxLevel });
      const solutions = bruteForceSolutions(puzzle);
      expect(solutions.length).toBeGreaterThan(0);
      for (const solution of solutions)
        solution.forEach((cell, person) => expect(candidates[person]).toContain(cell));
    }
  });

  test.each(seeds)("seed %i: generated puzzles stay within the level and are unique", (seed) => {
    const puzzle = generatePuzzle({ size: 5, seed, maxLevel });
    expect(puzzle.level).toBeLessThanOrEqual(maxLevel);
    expect(puzzle.level).toBe(Math.max(...puzzle.steps.map(stepLevel)));
    expect(bruteForceSolutions(puzzle, 2)).toEqual([puzzle.solution]);
    // easier rules always go first, so allowing harder ones changes nothing here
    expect(solve(puzzle).level).toBe(puzzle.level);
  });
});

test("harder techniques solve puzzles the easier ones cannot", () => {
  const levels = seeds.map((seed) => generatePuzzle({ size: 6, seed, maxLevel: MAX_LEVEL }).level);
  expect(Math.max(...levels)).toBeGreaterThan(3);
  for (const seed of seeds) {
    const puzzle = generatePuzzle({ size: 6, seed, maxLevel: MAX_LEVEL });
    if (puzzle.level > 3) expect(solve(puzzle, { maxLevel: 3 }).solved).toBe(false);
  }
});

test("a higher level never leaves more candidates than a lower one", () => {
  for (const seed of seeds) {
    const full = generatePuzzle({ size: 6, seed });
    const puzzle = { ...full, clues: full.clues.filter((_, i) => i % 2 === 0) };
    const low = solve(puzzle, { maxLevel: 3 }).candidates;
    const high = solve(puzzle).candidates;
    high.forEach((cells, person) => expect(low[person]).toEqual(expect.arrayContaining(cells)));
  }
});

test("rejects levels outside 2 to the maximum", () => {
  expect(() => generatePuzzle({ maxLevel: 1 })).toThrow(RangeError);
  expect(() => generatePuzzle({ maxLevel: MAX_LEVEL + 1 })).toThrow(RangeError);
});
