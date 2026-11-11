import { generateBoard, isStandable } from "./board";
import { trueClues } from "./clues";
import { createRng, range, shuffle, type Rng } from "./rng";
import { MAX_LEVEL, solve, type Step } from "./solver";
import type { Board, Clue, Person, Puzzle, Solution } from "./types";

export interface GenerateOptions {
  /** 4 to 9, default 6. Ignored when `board` is given. */
  size?: number;
  /** Same seed (and board), same puzzle. Defaults to the current time. */
  seed?: number;
  /** Use this board instead of generating one. */
  board?: Board;
  /**
   * Hardest deduction technique a solver may need, 2 to `MAX_LEVEL`; see `stepLevel`.
   * Higher levels let more clues be dropped, so puzzles get harder. Defaults to 3.
   */
  maxLevel?: number;
  /** Only return a puzzle that needs at least this level, at most `maxLevel`. Defaults to 1. */
  minLevel?: number;
}

export interface GeneratedPuzzle extends Puzzle {
  solution: Solution;
  murderer: number;
  seed: number;
  /** The deductions that solve the puzzle, in the order the solver made them. */
  steps: Step[];
  /** The hardest technique those deductions use, at most the `maxLevel` asked for. */
  level: number;
}

/** A random placement: one person per row and column, exactly two in the victim's room. */
function randomSolution(board: Board, victim: number, rng: Rng): Solution | null {
  const { size, rooms } = board;
  for (let i = 0; i < 500; i++) {
    const cols = shuffle(range(size), rng);
    const cells = shuffle(
      cols.map((col, row) => row * size + col),
      rng,
    );
    if (
      cells.every((c) => isStandable(board, c)) &&
      cells.filter((c) => rooms[c] === rooms[cells[victim]!]).length === 2
    )
      return cells;
  }
  return null;
}

/**
 * Generates a puzzle that `solve` finishes, i.e. one solvable by deduction alone.
 * Every suspect gets at least one clue, the victim gets none, and no clue can be
 * dropped without breaking that guarantee.
 */
export function generatePuzzle(options: GenerateOptions = {}): GeneratedPuzzle {
  const seed = options.seed ?? Date.now();
  const size = options.board?.size ?? options.size ?? 6;
  if (!Number.isInteger(size) || size < 4 || size > 9)
    throw new RangeError(`size must be an integer from 4 to 9, got ${size}`);
  const maxLevel = options.maxLevel ?? 3;
  // level 1 has no rule that uses two-person clues, so it cannot always reach a solution
  if (!Number.isInteger(maxLevel) || maxLevel < 2 || maxLevel > MAX_LEVEL)
    throw new RangeError(`maxLevel must be an integer from 2 to ${MAX_LEVEL}, got ${maxLevel}`);
  const minLevel = options.minLevel ?? 1;
  if (!Number.isInteger(minLevel) || minLevel < 1 || minLevel > maxLevel)
    throw new RangeError(`minLevel must be an integer from 1 to maxLevel, got ${minLevel}`);
  const rng = createRng(seed);
  const victim = size - 1;
  const suspects = range(size - 1);

  for (let attempt = 0; attempt < 200; attempt++) {
    const board = options.board ?? generateBoard(size, rng);
    const people = range(size).map((): Person => ({ gender: rng() < 0.5 ? "male" : "female" }));
    const solution = randomSolution(board, victim, rng);
    if (!solution) continue;
    const base = { board, people, victim };
    const solves = (clues: Clue[]) => solve({ ...base, clues }, { maxLevel }).solved;

    // Direction clues go last: they are plentiful and always sufficient, so
    // putting them first would make every puzzle nothing but "A is north of B".
    const pool = shuffle(
      suspects.flatMap((p) => trueClues(base, solution, p)),
      rng,
    );
    const ordered = [
      ...pool.filter((c) => c.type !== "direction"),
      ...pool.filter((c) => c.type === "direction"),
    ];

    const clues = suspects.map((p) => ordered.find((c) => c.person === p)!);
    const rest = ordered.filter((c) => !clues.includes(c));
    // each added clue only narrows things further, so carry the candidates forward
    let reached = solve({ ...base, clues }, { maxLevel });
    while (rest.length > 0 && !reached.solved) {
      clues.push(rest.shift()!);
      reached = solve({ ...base, clues }, { maxLevel, from: reached.candidates });
    }
    if (!reached.solved) continue;

    // drop redundant clues, newest first, keeping at least one per suspect
    for (const clue of [...clues].reverse()) {
      const without = clues.filter((c) => c !== clue);
      if (without.some((c) => c.person === clue.person) && solves(without))
        clues.splice(clues.indexOf(clue), 1);
    }

    const room = board.rooms[solution[victim]!];
    const murderer = suspects.find((p) => board.rooms[solution[p]!] === room)!;
    const { steps, level } = solve({ ...base, clues }, { maxLevel });
    if (level < minLevel) continue;
    return { ...base, clues, solution, murderer, seed, steps, level };
  }
  throw new Error(
    "could not generate a puzzle; the given board may leave no valid placement or never need minLevel",
  );
}
