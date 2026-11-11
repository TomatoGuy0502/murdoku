import { isBeside, isStandable } from "./board";
import { isValidSolution } from "./clues";
import { range } from "./rng";
import {
  OBJECT_KINDS,
  type Board,
  type Clue,
  type ObjectKind,
  type Puzzle,
  type Solution,
} from "./types";

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
  /**
   * Candidates to start from instead of every standable cell: the `candidates` of an
   * earlier solve of the same puzzle with fewer clues. Deduction only ever removes
   * candidates, so picking up from there reaches the same result with less work.
   */
  from?: number[][];
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
 * A set of cells as one bitmask of columns per row. Deduction is almost all set
 * intersection and counting, which this turns into a handful of integer operations.
 */
type Grid = Uint16Array;

function popcount(bits: number): number {
  let n = 0;
  for (; bits; bits &= bits - 1) n++;
  return n;
}

function bitsOf(bits: number): number[] {
  const out: number[] = [];
  for (let i = 0; bits; i++, bits >>>= 1) if (bits & 1) out.push(i);
  return out;
}

/** Cell sets that depend only on the board, worked out once per board. */
interface Tables {
  /** A full row: one bit per column. */
  all: number;
  standable: Grid;
  rooms: Grid[];
  notRooms: Grid[];
  objects: Map<ObjectKind, Grid>;
  beside: Map<ObjectKind, Grid>;
}

// A board is never changed after it is made, so its tables can be reused across solves.
const tableCache = new WeakMap<Board, Tables>();

function tablesFor(board: Board): Tables {
  const cached = tableCache.get(board);
  if (cached) return cached;
  const { size, rooms } = board;
  const all = (1 << size) - 1;
  const grid = (ok: (cell: number) => boolean) => {
    const g = new Uint16Array(size);
    for (let cell = 0; cell < size * size; cell++)
      if (ok(cell)) g[Math.floor(cell / size)]! |= 1 << (cell % size);
    return g;
  };
  const roomGrids = range(Math.max(...rooms) + 1).map((room) => grid((c) => rooms[c] === room));
  const tables: Tables = {
    all,
    standable: grid((c) => isStandable(board, c)),
    rooms: roomGrids,
    notRooms: roomGrids.map((g) => g.map((row) => all & ~row)),
    objects: new Map(OBJECT_KINDS.map((kind) => [kind, grid((c) => board.objects[c] === kind)])),
    beside: new Map(OBJECT_KINDS.map((kind) => [kind, grid((c) => isBeside(board, c, kind))])),
  };
  tableCache.set(board, tables);
  return tables;
}

/** Where the other person of a two-person clue must be, seen from one of them. */
type Where = "room" | "above" | "below" | "left" | "right";

/** For "`person` is `direction` of `other`": where `other` is from `person`, and the reverse. */
const OPPOSITE: Record<Extract<Clue, { type: "direction" }>["direction"], [Where, Where]> = {
  north: ["below", "above"],
  south: ["above", "below"],
  west: ["right", "left"],
  east: ["left", "right"],
};

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
  const { known = [], maxLevel = MAX_LEVEL, from } = options;
  const { size, rooms } = board;
  const tables = tablesFor(board);
  const { all } = tables;
  const everyone = range(people.length);
  const roomIds = range(tables.rooms.length);

  const none = () => new Uint16Array(size);
  const toGrid = (cells: number[]) => {
    const g = none();
    for (const c of cells) g[Math.floor(c / size)]! |= 1 << (c % size);
    return g;
  };
  const cellsOf = (g: Grid) => {
    const out: number[] = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (g[r]! & (1 << c)) out.push(r * size + c);
    return out;
  };
  const count = (g: Grid) => {
    let n = 0;
    for (let r = 0; r < size; r++) n += popcount(g[r]!);
    return n;
  };
  const hits = (a: Grid, b: Grid) => {
    for (let r = 0; r < size; r++) if (a[r]! & b[r]!) return true;
    return false;
  };
  const add = (into: Grid, g: Grid) => {
    for (let r = 0; r < size; r++) into[r]! |= g[r]!;
  };
  /** Which rows a set touches, as bits. */
  const rowBits = (g: Grid) => {
    let bits = 0;
    for (let r = 0; r < size; r++) if (g[r]) bits |= 1 << r;
    return bits;
  };
  /** Which columns a set touches, as bits. */
  const colBits = (g: Grid) => {
    let bits = 0;
    for (let r = 0; r < size; r++) bits |= g[r]!;
    return bits;
  };
  const axes = [
    ["row", rowBits],
    ["col", colBits],
  ] as const;
  /** Every cell on the rows (or columns) whose bits are set. */
  const linesGrid = (axis: Axis, bits: number) => {
    const g = none();
    for (let r = 0; r < size; r++) g[r] = axis === "col" ? bits : bits & (1 << r) ? all : 0;
    return g;
  };

  const cand: Grid[] = everyone.map((p) => {
    const cell = known[p];
    if (cell != null) return toGrid([cell]);
    return from?.[p] ? toGrid(from[p]) : tables.standable.slice();
  });
  const steps: Step[] = [];

  /** Restrict a person to the cells in `ok`, recording what that removed. */
  const keep = (
    rule: Rule,
    person: number,
    ok: Grid,
    detail?: Omit<Step, "rule" | "person" | "removed">,
  ) => {
    const mine = cand[person]!;
    let removed: number[] | undefined;
    for (let r = 0; r < size; r++) {
      const gone = mine[r]! & ~ok[r]!;
      if (!gone) continue;
      mine[r]! &= ok[r]!;
      removed ??= [];
      for (let c = 0; c < size; c++) if (gone & (1 << c)) removed.push(r * size + c);
    }
    if (removed) steps.push({ rule, person, removed, ...detail });
  };
  const others = (p: number) => everyone.filter((q) => q !== p);
  const canBeIn = (p: number, room: number) => hits(cand[p]!, tables.rooms[room]!);
  /** The room a person is certainly in, if their candidates agree on one. */
  const knownRoom = (p: number) => {
    let found: number | undefined;
    for (const room of roomIds) {
      if (!canBeIn(p, room)) continue;
      if (found !== undefined) return undefined;
      found = room;
    }
    return found;
  };
  /** The cells of every room that passes `test`. */
  const roomsWhere = (test: (room: number) => boolean) => {
    const g = none();
    for (const room of roomIds) if (test(room)) add(g, tables.rooms[room]!);
    return g;
  };
  /** Every cell somebody could still be on. */
  const openCells = () => {
    const g = none();
    for (const mine of cand) add(g, mine);
    return g;
  };

  /** The cells of `own` from which `partner` still has a cell lying `where`, in another row and column. */
  const supported = (own: Grid, partner: Grid, where: Where) => {
    const ok = none();
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const bit = 1 << c;
        if (!(own[r]! & bit)) continue;
        const cols =
          where === "left" ? bit - 1 : where === "right" ? all & ~(bit | (bit - 1)) : all & ~bit;
        const room = where === "room" ? tables.rooms[rooms[r * size + c]!]! : undefined;
        for (let r2 = 0; r2 < size; r2++) {
          if (r2 === r || (where === "above" && r2 > r) || (where === "below" && r2 < r)) continue;
          if (partner[r2]! & cols & (room ? room[r2]! : all)) {
            ok[r]! |= bit;
            break;
          }
        }
      }
    return ok;
  };

  /** `p` shares a room with nobody in `group`. */
  const exclusive = (clue: Clue, p: number, group: number[]) => {
    const taken = group.map(knownRoom);
    keep(
      clue.type,
      p,
      roomsWhere((room) => !taken.includes(room)),
      { clue },
    );
    const room = knownRoom(p);
    if (room !== undefined)
      for (const q of group) keep(clue.type, q, tables.notRooms[room]!, { clue });
  };

  const applyClue = (clue: Clue) => {
    const p = clue.person;
    switch (clue.type) {
      case "inRoom":
        return keep(clue.type, p, tables.rooms[clue.room] ?? none(), { clue });
      case "on":
        return keep(clue.type, p, tables.objects.get(clue.object)!, { clue });
      case "beside":
        return keep(clue.type, p, tables.beside.get(clue.object)!, { clue });
      case "withPerson":
      case "direction": {
        // a cell survives only if the other person still has a compatible cell
        const [mine, theirs] =
          clue.type === "withPerson" ? (["room", "room"] as const) : OPPOSITE[clue.direction];
        const o = clue.other;
        keep(clue.type, p, supported(cand[p]!, cand[o]!, mine), { clue });
        keep(clue.type, o, supported(cand[o]!, cand[p]!, theirs), { clue });
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
        keep(
          clue.type,
          p,
          roomsWhere((room) => mates.some((q) => canBeIn(q, room))),
          { clue },
        );
        const room = knownRoom(p);
        if (room === undefined) return;
        const able = mates.filter((q) => canBeIn(q, room));
        if (able.length === 1) keep(clue.type, able[0]!, tables.rooms[room]!, { clue });
      }
    }
  };

  /** placed (their cell is known) or confined (only their row/column is): nobody else is on that line. */
  const applyOwnedLines = (rule: "placed" | "confined") => {
    for (const [axis, lineBits] of axes)
      for (const p of everyone) {
        const bits = lineBits(cand[p]!);
        if (popcount(bits) !== 1 || (count(cand[p]!) === 1) !== (rule === "placed")) continue;
        const detail = { by: p, line: { axis, index: bitsOf(bits)[0]! } };
        const ok = linesGrid(axis, all & ~bits);
        for (const q of others(p)) keep(rule, q, ok, detail);
      }
  };

  const applyLastInLine = () => {
    for (const [axis, lineBits] of axes)
      for (const index of range(size)) {
        const able = everyone.filter((p) => lineBits(cand[p]!) & (1 << index));
        if (able.length === 1)
          keep("lastInLine", able[0]!, linesGrid(axis, 1 << index), { line: { axis, index } });
      }
  };

  /** k people who between them can only be on k lines fill those lines. */
  const applyNakedSets = (k: number) => {
    for (const [axis, lineBits] of axes) {
      const open = everyone.filter((p) => popcount(lineBits(cand[p]!)) > 1);
      for (const group of combinations(open, k)) {
        let bits = 0;
        for (const p of group) bits |= lineBits(cand[p]!);
        if (popcount(bits) !== k) continue;
        const detail = { group, lines: { axis, indexes: bitsOf(bits) } };
        const ok = linesGrid(axis, all & ~bits);
        for (const q of everyone) if (!group.includes(q)) keep("nakedSet", q, ok, detail);
      }
    }
  };

  /** k lines that only k people can be on take all of those people. */
  const applyHiddenSets = (k: number) => {
    for (const [axis, lineBits] of axes)
      for (const indexes of combinations(range(size), k)) {
        let bits = 0;
        for (const i of indexes) bits |= 1 << i;
        const group = everyone.filter((p) => lineBits(cand[p]!) & bits);
        if (group.length !== k) continue;
        const ok = linesGrid(axis, bits);
        for (const p of group) keep("hiddenSet", p, ok, { group, lines: { axis, indexes } });
      }
  };

  const applyMurder = () => {
    const suspects = others(victim);
    keep(
      "murder",
      victim,
      roomsWhere(
        (room) =>
          suspects.some((q) => canBeIn(q, room)) &&
          suspects.filter((q) => knownRoom(q) === room).length < 2,
      ),
    );
    const room = knownRoom(victim);
    if (room === undefined) return;
    const able = suspects.filter((q) => canBeIn(q, room));
    if (able.length === 1) keep("murder", able[0]!, tables.rooms[room]!);
    const sure = suspects.filter((q) => knownRoom(q) === room);
    if (sure.length === 1)
      for (const q of suspects) if (q !== sure[0]) keep("murder", q, tables.notRooms[room]!);
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

  /** People known to be in `room`, and the most it can hold: one per row and per column it still offers. */
  const roomLimit = (room: number) => {
    const open = openCells();
    const inRoom = tables.rooms[room]!;
    let rowCount = 0;
    let cols = 0;
    for (let r = 0; r < size; r++) {
      const here = open[r]! & inRoom[r]!;
      if (here) rowCount++;
      cols |= here;
    }
    const sure = everyone.filter((p) => knownRoom(p) === room);
    let cap = Math.min(everyone.filter((p) => canBeIn(p, room)).length, rowCount, popcount(cols));
    if (sure.includes(victim)) cap = Math.min(cap, 2);
    if (sure.some((p) => loners.includes(p))) cap = Math.min(cap, 1);
    return { sure, cap };
  };

  const applyRoomCapacity = () => {
    for (const room of roomIds) {
      const { sure, cap } = roomLimit(room);
      const detail = { room, count: cap };
      const notHere = tables.notRooms[room]!;
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
      const inRoom = tables.rooms[room]!;
      const notHere = tables.notRooms[room]!;
      for (const [axis] of axes) {
        // lines whose every open cell is in this room: whoever is on them is in the room
        const open = openCells();
        let bits = 0;
        if (axis === "row") {
          for (let r = 0; r < size; r++) if (open[r] && !(open[r]! & ~inRoom[r]!)) bits |= 1 << r;
        } else {
          let outside = 0;
          for (let r = 0; r < size; r++) outside |= open[r]! & ~inRoom[r]!;
          bits = colBits(open) & ~outside;
        }
        if (bits === 0) continue;
        const indexes = bitsOf(bits);
        const detail = { room, count: indexes.length, lines: { axis, indexes } };
        if (indexes.length >= 2) for (const p of loners) keep("roomCount", p, notHere, detail);
        if (indexes.length >= 3) keep("roomCount", victim, notHere, detail);
        // as many forced in as the room can hold: they are its only occupants
        if (indexes.length === cap) {
          const ok = linesGrid(axis, bits);
          add(ok, notHere);
          for (const p of everyone) keep("roomCount", p, ok, detail);
        }
      }
    }
  };

  const cluesAt = (level: number) => {
    const mine = clues.filter((clue) => stepLevel({ rule: clue.type }) === level);
    return () => mine.forEach(applyClue);
  };
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
  while (cand.every((mine) => rowBits(mine) !== 0) && progress());

  const candidates = cand.map(cellsOf);
  const solution = candidates.map((cells) => cells[0]!);
  const solved =
    candidates.every((cells) => cells.length === 1) && isValidSolution(puzzle, solution);
  return {
    solved,
    solution: solved ? solution : null,
    candidates,
    steps,
    level: Math.max(0, ...steps.map(stepLevel)),
  };
}
