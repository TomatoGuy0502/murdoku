import { isBeside, isStandable } from "./board";
import { isValidSolution, related } from "./clues";
import { range } from "./rng";
import type { Clue, Puzzle, Solution } from "./types";

/**
 * Which deduction removed candidates: a clue type, or one of the board rules.
 * - placed: someone's cell is known, so nobody else is in that row/column
 * - confined: someone's candidates all lie in one row/column, so nobody else is in it
 * - lastInLine: only one person can still be in a row/column, so they are in it
 * - murder: the victim's room holds exactly two people
 */
export type Rule = Clue["type"] | "placed" | "confined" | "lastInLine" | "murder";

export interface Step {
  rule: Rule;
  /** The person who lost candidates. */
  person: number;
  removed: number[];
  /** The clue used, when `rule` is a clue type. */
  clue?: Clue;
  /** For placed/confined: the person whose position ruled the line out. */
  by?: number;
  /** For placed/confined/lastInLine: the row or column concerned. */
  line?: { axis: "row" | "col"; index: number };
}

export interface SolveResult {
  /** True when deduction alone, with no guessing, pins everyone to one cell. */
  solved: boolean;
  solution: Solution | null;
  /** Cells each person could still be on when deduction stopped. */
  candidates: number[][];
  steps: Step[];
}

/**
 * Solves by constraint propagation only: every rule removes candidates that are
 * impossible given the current candidates, and rules repeat until nothing changes.
 * No rule ever assumes a placement, so `solved` means solvable without guessing
 * (and therefore uniquely solvable).
 */
export function solve(puzzle: Puzzle): SolveResult {
  const { board, people, victim, clues } = puzzle;
  const { size, rooms } = board;
  const everyone = range(people.length);
  const standable = range(size * size).filter((c) => isStandable(board, c));
  const cand = everyone.map(() => new Set(standable));
  const steps: Step[] = [];

  const keep = (
    rule: Rule,
    person: number,
    ok: (cell: number) => boolean,
    detail?: Pick<Step, "clue" | "by" | "line">,
  ) => {
    const removed = [...cand[person]!].filter((c) => !ok(c));
    if (removed.length === 0) return;
    for (const c of removed) cand[person]!.delete(c);
    steps.push({ rule, person, removed, ...detail });
  };
  const others = (p: number) => everyone.filter((q) => q !== p);
  const canBeIn = (p: number, room: number) => [...cand[p]!].some((c) => rooms[c] === room);
  /** The room a person is certainly in, if their candidates agree on one. */
  const knownRoom = (p: number) => {
    const set = new Set([...cand[p]!].map((c) => rooms[c]!));
    return set.size === 1 ? [...set][0] : undefined;
  };

  /** `p` shares a room with nobody in `group`. */
  const exclusive = (clue: Clue, p: number, group: number[]) => {
    keep(clue.type, p, (c) => !group.some((q) => knownRoom(q) === rooms[c]), { clue });
    const room = knownRoom(p);
    if (room !== undefined)
      for (const q of group) keep(clue.type, q, (c) => rooms[c] !== room, { clue });
  };

  const applyClue = (clue: Clue) => {
    const p = clue.person;
    switch (clue.type) {
      case "inRoom":
        return keep(clue.type, p, (c) => rooms[c] === clue.room, { clue });
      case "on":
        return keep(clue.type, p, (c) => board.objects[c] === clue.object, { clue });
      case "beside":
        return keep(clue.type, p, (c) => isBeside(board, c, clue.object), { clue });
      case "withPerson":
      case "direction": {
        // a cell survives only if the other person still has a compatible cell
        const fits = (a: number, b: number) =>
          Math.floor(a / size) !== Math.floor(b / size) &&
          a % size !== b % size &&
          related(board, clue, a, b);
        keep(clue.type, p, (a) => [...cand[clue.other]!].some((b) => fits(a, b)), { clue });
        keep(clue.type, clue.other, (b) => [...cand[p]!].some((a) => fits(a, b)), { clue });
        return;
      }
      case "alone":
        return exclusive(clue, p, others(p));
      case "onlyOfGender":
        return exclusive(
          clue,
          p,
          others(p).filter((q) => people[q]!.gender === people[p]!.gender),
        );
      case "withGender": {
        const mates = others(p).filter((q) => people[q]!.gender === clue.gender);
        keep(clue.type, p, (c) => mates.some((q) => canBeIn(q, rooms[c]!)), { clue });
        const room = knownRoom(p);
        if (room === undefined) return;
        const able = mates.filter((q) => canBeIn(q, room));
        if (able.length === 1) keep(clue.type, able[0]!, (c) => rooms[c] === room, { clue });
      }
    }
  };

  const applyLines = () => {
    const axes = [
      ["row", (c: number) => Math.floor(c / size)],
      ["col", (c: number) => c % size],
    ] as const;
    for (const [axis, line] of axes) {
      for (const p of everyone) {
        const lines = new Set([...cand[p]!].map(line));
        if (lines.size !== 1) continue;
        const index = [...lines][0]!;
        const rule = cand[p]!.size === 1 ? "placed" : "confined";
        for (const q of others(p))
          keep(rule, q, (c) => line(c) !== index, { by: p, line: { axis, index } });
      }
      for (const index of range(size)) {
        const able = everyone.filter((p) => [...cand[p]!].some((c) => line(c) === index));
        if (able.length === 1)
          keep("lastInLine", able[0]!, (c) => line(c) === index, { line: { axis, index } });
      }
    }
  };

  const applyMurder = () => {
    const suspects = others(victim);
    keep(
      "murder",
      victim,
      (c) =>
        suspects.some((q) => canBeIn(q, rooms[c]!)) &&
        suspects.filter((q) => knownRoom(q) === rooms[c]).length < 2,
    );
    const room = knownRoom(victim);
    if (room === undefined) return;
    const able = suspects.filter((q) => canBeIn(q, room));
    if (able.length === 1) keep("murder", able[0]!, (c) => rooms[c] === room);
    const sure = suspects.filter((q) => knownRoom(q) === room);
    if (sure.length === 1)
      for (const q of suspects) if (q !== sure[0]) keep("murder", q, (c) => rooms[c] !== room);
  };

  let before: number;
  do {
    before = steps.length;
    clues.forEach(applyClue);
    applyLines();
    applyMurder();
  } while (steps.length > before && cand.every((set) => set.size > 0));

  const candidates = cand.map((set) => [...set]);
  const solution = candidates.map((cells) => cells[0]!);
  const solved = cand.every((set) => set.size === 1) && isValidSolution(puzzle, solution);
  return { solved, solution: solved ? solution : null, candidates, steps };
}
