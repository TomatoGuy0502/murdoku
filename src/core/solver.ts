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
 * - nakedSet: k people can only be in k rows/columns, so nobody else is in those
 * - hiddenSet: only k people can be in k rows/columns, so they are nowhere else
 * - roomCapacity: a room cannot hold as many people as someone there would need
 * - roomCount: rows/columns that lie wholly in a room force people into it
 */
export type Rule =
  | Clue["type"]
  | "placed"
  | "confined"
  | "lastInLine"
  | "murder"
  | "nakedSet"
  | "hiddenSet"
  | "roomCapacity"
  | "roomCount";

export type Axis = "row" | "col";

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
  line?: { axis: Axis; index: number };
  /** For nakedSet/hiddenSet: the people who share the lines. */
  group?: number[];
  /** For nakedSet/hiddenSet/roomCount: the rows or columns concerned. */
  lines?: { axis: Axis; indexes: number[] };
  /** For roomCapacity/roomCount: the room concerned. */
  room?: number;
  /** For roomCapacity: the most people the room can hold. For roomCount: the fewest. */
  count?: number;
}

export const MAX_LEVEL = 5;

/** How hard a step is for a person to find, from 1 (read it off a clue) to `MAX_LEVEL`. */
export function stepLevel(step: Pick<Step, "rule" | "group" | "lines">): number {
  switch (step.rule) {
    case "inRoom":
    case "on":
    case "beside":
    case "placed":
      return 1;
    case "lastInLine":
    case "withPerson":
    case "direction":
      return 2;
    case "confined":
    case "alone":
    case "onlyOfGender":
    case "withGender":
    case "murder":
      return 3;
    case "nakedSet":
    case "hiddenSet":
      // pairs are level 4, triples level 5
      return (step.group ?? step.lines?.indexes ?? []).length <= 2 ? 4 : 5;
    case "roomCapacity":
      return 4;
    case "roomCount":
      return 5;
  }
}

export interface SolveOptions {
  /** People whose cell is already settled (null or missing = not yet). */
  known?: (number | null)[];
  /** Hardest technique allowed, 1 to `MAX_LEVEL`. Defaults to all of them. */
  maxLevel?: number;
}

export interface SolveResult {
  /** True when deduction alone, with no guessing, pins everyone to one cell. */
  solved: boolean;
  solution: Solution | null;
  /** Cells each person could still be on when deduction stopped. */
  candidates: number[][];
  steps: Step[];
  /** The hardest technique the steps needed; 0 when there were no steps. */
  level: number;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) =>
    combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]),
  );
}

/**
 * Solves by constraint propagation only: every rule removes candidates that are
 * impossible given the current candidates, and rules repeat until nothing changes.
 * No rule ever assumes a placement, so `solved` means solvable without guessing
 * (and therefore uniquely solvable).
 *
 * Easier rules always go first: a harder level is tried only when every easier one is
 * stuck, so `level` is the difficulty the puzzle really needs and the steps read the
 * way a person would solve it.
 */
export function solve(puzzle: Puzzle, options: SolveOptions = {}): SolveResult {
  const { board, people, victim, clues } = puzzle;
  const { known = [], maxLevel = MAX_LEVEL } = options;
  const { size, rooms } = board;
  const everyone = range(people.length);
  const standable = range(size * size).filter((c) => isStandable(board, c));
  const cand = everyone.map((p) => {
    const cell = known[p];
    return new Set(cell == null ? standable : [cell]);
  });
  const steps: Step[] = [];
  const axes = [
    ["row", (c: number) => Math.floor(c / size)],
    ["col", (c: number) => c % size],
  ] as const;

  const keep = (
    rule: Rule,
    person: number,
    ok: (cell: number) => boolean,
    detail?: Omit<Step, "rule" | "person" | "removed">,
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
  const linesOf = (p: number, line: (c: number) => number) => new Set([...cand[p]!].map(line));

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

  /** placed (their cell is known) or confined (only their row/column is): nobody else is on that line. */
  const applyOwnedLines = (rule: "placed" | "confined") => {
    for (const [axis, line] of axes)
      for (const p of everyone) {
        const lines = linesOf(p, line);
        if (lines.size !== 1 || (cand[p]!.size === 1) !== (rule === "placed")) continue;
        const index = [...lines][0]!;
        for (const q of others(p))
          keep(rule, q, (c) => line(c) !== index, { by: p, line: { axis, index } });
      }
  };

  const applyLastInLine = () => {
    for (const [axis, line] of axes)
      for (const index of range(size)) {
        const able = everyone.filter((p) => linesOf(p, line).has(index));
        if (able.length === 1)
          keep("lastInLine", able[0]!, (c) => line(c) === index, { line: { axis, index } });
      }
  };

  /** k people who between them can only be on k lines fill those lines. */
  const applyNakedSets = (k: number) => {
    for (const [axis, line] of axes) {
      const open = everyone.filter((p) => linesOf(p, line).size > 1);
      for (const group of combinations(open, k)) {
        const indexes = [...new Set(group.flatMap((p) => [...linesOf(p, line)]))];
        if (indexes.length !== k) continue;
        for (const q of everyone)
          if (!group.includes(q))
            keep("nakedSet", q, (c) => !indexes.includes(line(c)), {
              group,
              lines: { axis, indexes: indexes.sort((a, b) => a - b) },
            });
      }
    }
  };

  /** k lines that only k people can be on take all of those people. */
  const applyHiddenSets = (k: number) => {
    for (const [axis, line] of axes)
      for (const indexes of combinations(range(size), k)) {
        const group = everyone.filter((p) => indexes.some((i) => linesOf(p, line).has(i)));
        if (group.length !== k) continue;
        for (const p of group)
          keep("hiddenSet", p, (c) => indexes.includes(line(c)), {
            group,
            lines: { axis, indexes },
          });
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

  const loners = clues.flatMap((clue) => (clue.type === "alone" ? [clue.person] : []));
  /** People whose clue puts someone else in their room, so the room must hold two. */
  const paired = clues.flatMap((clue) =>
    clue.type === "withPerson"
      ? [clue.person, clue.other]
      : clue.type === "withGender"
        ? [clue.person]
        : [],
  );
  const roomIds = range(board.roomKinds.length);
  /** Every cell somebody could still be on. */
  const openCells = () => [...new Set(cand.flatMap((set) => [...set]))];

  /** People known to be in `room`, and the most it can hold: one per row and per column it still offers. */
  const roomLimit = (room: number) => {
    const cells = openCells().filter((c) => rooms[c] === room);
    const sure = everyone.filter((p) => knownRoom(p) === room);
    let cap = Math.min(
      everyone.filter((p) => canBeIn(p, room)).length,
      ...axes.map(([, line]) => new Set(cells.map(line)).size),
    );
    if (sure.includes(victim)) cap = Math.min(cap, 2);
    if (sure.some((p) => loners.includes(p))) cap = Math.min(cap, 1);
    return { sure, cap };
  };

  const applyRoomCapacity = () => {
    for (const room of roomIds) {
      const { sure, cap } = roomLimit(room);
      const detail = { room, count: cap };
      const notHere = (c: number) => rooms[c] !== room;
      // too small for the victim and murderer, or for anyone who has company
      if (cap < 2) for (const p of [victim, ...paired]) keep("roomCapacity", p, notHere, detail);
      // already full
      if (sure.length >= cap)
        for (const q of everyone) if (!sure.includes(q)) keep("roomCapacity", q, notHere, detail);
    }
  };

  const applyRoomCount = () => {
    for (const room of roomIds) {
      const { cap } = roomLimit(room);
      for (const [axis, line] of axes) {
        // lines whose every open cell is in this room: whoever is on them is in the room
        const open = openCells();
        const indexes = range(size).filter((i) => {
          const cells = open.filter((c) => line(c) === i);
          return cells.length > 0 && cells.every((c) => rooms[c] === room);
        });
        if (indexes.length === 0) continue;
        const detail = { room, count: indexes.length, lines: { axis, indexes } };
        const notHere = (c: number) => rooms[c] !== room;
        if (indexes.length >= 2) for (const p of loners) keep("roomCount", p, notHere, detail);
        if (indexes.length >= 3) keep("roomCount", victim, notHere, detail);
        // as many forced in as the room can hold: they are its only occupants
        if (indexes.length === cap)
          for (const p of everyone)
            keep("roomCount", p, (c) => notHere(c) || indexes.includes(line(c)), detail);
      }
    }
  };

  const cluesAt = (level: number) => () =>
    clues.filter((clue) => stepLevel({ rule: clue.type }) === level).forEach(applyClue);
  const levels: (() => void)[][] = [
    [cluesAt(1), () => applyOwnedLines("placed")],
    [cluesAt(2), applyLastInLine],
    [cluesAt(3), () => applyOwnedLines("confined"), applyMurder],
    [() => applyNakedSets(2), () => applyHiddenSets(2), applyRoomCapacity],
    [() => applyNakedSets(3), () => applyHiddenSets(3), applyRoomCount],
  ].slice(0, maxLevel);

  // run the easiest level that still makes progress, then start over from the easiest
  const progress = () =>
    levels.some((rules) => {
      const before = steps.length;
      for (const rule of rules) rule();
      return steps.length > before;
    });
  while (cand.every((set) => set.size > 0) && progress());

  const candidates = cand.map((set) => [...set]);
  const solution = candidates.map((cells) => cells[0]!);
  const solved = cand.every((set) => set.size === 1) && isValidSolution(puzzle, solution);
  return {
    solved,
    solution: solved ? solution : null,
    candidates,
    steps,
    level: Math.max(0, ...steps.map(stepLevel)),
  };
}
