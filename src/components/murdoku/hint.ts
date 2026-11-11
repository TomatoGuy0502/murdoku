import { solve, type Puzzle, type Solution } from "../../murdoku";
import { isStandable } from "../../murdoku/board";
import { describeStep } from "./labels";

export type Hint =
  /** Some placed people are not where the solution has them. */
  | { kind: "wrong"; people: number[] }
  /** The next person whose cell can be deduced, and the deductions that pin them down. */
  | { kind: "next"; person: number; cell: number; reasons: string[] };

/** What to tell a stuck player, given who they have placed; null once everyone is placed right. */
export function nextHint(
  puzzle: Puzzle,
  solution: Solution,
  positions: (number | null)[],
): Hint | null {
  const wrong = positions.flatMap((cell, person) =>
    cell !== null && cell !== solution[person] ? [person] : [],
  );
  if (wrong.length > 0) return { kind: "wrong", people: wrong };

  // replay the deductions still to make and stop at the first person they settle
  const { steps } = solve(puzzle, positions);
  const standable = puzzle.board.rooms.filter((_, cell) => isStandable(puzzle.board, cell)).length;
  const left = positions.map((cell) => (cell === null ? standable : 1));
  for (const [index, step] of steps.entries()) {
    const person = step.person;
    left[person]! -= step.removed.length;
    if (left[person] !== 1 || positions[person] !== null) continue;
    const reasons = steps
      .slice(0, index + 1)
      .filter((s) => s.person === person)
      .map((s) => describeStep(s, puzzle));
    return { kind: "next", person, cell: solution[person]!, reasons: [...new Set(reasons)] };
  }
  return null;
}
