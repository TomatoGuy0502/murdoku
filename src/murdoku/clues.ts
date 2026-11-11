import { isBeside, isStandable } from "./board";
import {
  DIRECTIONS,
  GENDERS,
  OBJECT_KINDS,
  type Board,
  type Clue,
  type Puzzle,
  type Solution,
} from "./types";

export type PairClue = Extract<Clue, { other: number }>;

/** Does a pair clue hold with `clue.person` on cell `a` and `clue.other` on cell `b`? */
export function related(board: Board, clue: PairClue, a: number, b: number): boolean {
  const { size } = board;
  if (clue.type === "withPerson") return board.rooms[a] === board.rooms[b];
  switch (clue.direction) {
    case "north":
      return Math.floor(a / size) < Math.floor(b / size);
    case "south":
      return Math.floor(a / size) > Math.floor(b / size);
    case "west":
      return a % size < b % size;
    case "east":
      return a % size > b % size;
  }
}

export function satisfies(
  { board, people }: Pick<Puzzle, "board" | "people">,
  clue: Clue,
  solution: Solution,
): boolean {
  const cell = solution[clue.person]!;
  const room = board.rooms[cell];
  const roommates = solution.flatMap((c, p) =>
    p !== clue.person && board.rooms[c] === room ? [p] : [],
  );
  switch (clue.type) {
    case "inRoom":
      return room === clue.room;
    case "alone":
      return roommates.length === 0;
    case "withPerson":
    case "direction":
      return related(board, clue, cell, solution[clue.other]!);
    case "beside":
      return isBeside(board, cell, clue.object);
    case "on":
      return board.objects[cell] === clue.object;
    case "withGender":
      return roommates.some((p) => people[p]!.gender === clue.gender);
    case "onlyOfGender":
      return roommates.every((p) => people[p]!.gender !== people[clue.person]!.gender);
  }
}

export function isValidSolution(puzzle: Puzzle, solution: Solution): boolean {
  const { board, victim, clues } = puzzle;
  const { size, rooms } = board;
  return (
    solution.length === size &&
    new Set(solution.map((c) => Math.floor(c / size))).size === size &&
    new Set(solution.map((c) => c % size)).size === size &&
    solution.every((c) => isStandable(board, c)) &&
    solution.filter((c) => rooms[c] === rooms[solution[victim]!]).length === 2 &&
    clues.every((clue) => satisfies(puzzle, clue, solution))
  );
}

/** Every clue that is true of `person` in `solution`. */
export function trueClues(
  puzzle: Pick<Puzzle, "board" | "people" | "victim">,
  solution: Solution,
  person: number,
): Clue[] {
  const all: Clue[] = [
    { type: "inRoom", person, room: puzzle.board.rooms[solution[person]!]! },
    { type: "alone", person },
    { type: "onlyOfGender", person },
    ...OBJECT_KINDS.flatMap((object): Clue[] => [
      { type: "beside", person, object },
      { type: "on", person, object },
    ]),
    ...GENDERS.map((gender): Clue => ({ type: "withGender", person, gender })),
    ...puzzle.people.flatMap((_, other): Clue[] =>
      other === person
        ? []
        : [
            // "with the victim" would name the murderer outright
            ...(other === puzzle.victim ? [] : [{ type: "withPerson", person, other } as const]),
            ...DIRECTIONS.map((direction): Clue => ({
              type: "direction",
              person,
              other,
              direction,
            })),
          ],
    ),
  ];
  return all.filter((clue) => satisfies(puzzle, clue, solution));
}
