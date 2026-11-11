import { expect, test } from "vite-plus/test";
import { generatePuzzle } from "./index";
import { nextHint } from "./hint";

test.each([1, 2, 3, 4, 5])("seed %i: following the hints solves the puzzle", (seed) => {
  const puzzle = generatePuzzle({ size: 6, seed });
  const positions: (number | null)[] = puzzle.people.map(() => null);
  for (let i = 0; i < puzzle.people.length; i++) {
    const hint = nextHint(puzzle, puzzle.solution, positions);
    if (hint?.kind !== "next") throw new Error("expected a next-step hint");
    expect(positions[hint.person]).toBeNull();
    expect(hint.reasons.length).toBeGreaterThan(0);
    positions[hint.person] = hint.cell;
  }
  expect(positions).toEqual(puzzle.solution);
  expect(nextHint(puzzle, puzzle.solution, positions)).toBeNull();
});

test("points out people placed on the wrong cell before anything else", () => {
  const puzzle = generatePuzzle({ size: 6, seed: 1 });
  const positions: (number | null)[] = puzzle.people.map(() => null);
  positions[2] = puzzle.solution[3]!;
  expect(nextHint(puzzle, puzzle.solution, positions)).toEqual({ kind: "wrong", people: [2] });
});
