import { expect, test } from "vite-plus/test";
import { generatePuzzle } from "../../murdoku";
import { isStandable } from "../../murdoku/board";
import { usePlay, type Selection } from "./usePlay";

const puzzle = generatePuzzle({ size: 5, seed: 7 });
const { board, solution } = puzzle;
const cells = board.rooms.map((_, cell) => cell);
const [free1, free2, free3] = cells.filter((c) => isStandable(board, c)) as [
  number,
  number,
  number,
];
const blocked = cells.find((c) => !isStandable(board, c))!;

function setup() {
  const play = usePlay(puzzle);
  /** Press the first cell, drag across the rest, release. */
  const stroke = (choice: Selection, ...path: number[]) => {
    play.selected.value = choice;
    play.strokeStart(path[0]!);
    path.slice(1).forEach(play.strokeMove);
    play.strokeEnd();
  };
  /** Long-press a cell with a person selected. */
  const hold = (person: number, cell: number) => {
    play.selected.value = person;
    play.strokeStart(cell);
    play.strokeHold();
    play.strokeEnd();
  };
  return { play, stroke, hold, s: () => play.state.value };
}

test("holding places, moves, replaces and picks up people", () => {
  const { hold, s } = setup();
  hold(0, free1);
  hold(0, free2);
  expect(s().positions[0]).toBe(free2);

  hold(1, free2);
  expect(s().positions.slice(0, 2)).toEqual([null, free2]);

  hold(1, free2);
  expect(s().positions[1]).toBeNull();
});

test("holding leaves no pencil mark behind and is one undo step", () => {
  const { play, stroke, hold, s } = setup();
  stroke(0, free1);
  hold(0, free1);
  expect([s().positions[0], s().candidates[free1]]).toEqual([free1, []]);
  play.undo();
  expect([s().positions[0], s().candidates[free1]]).toEqual([null, [0]]);
});

test("a tap toggles a candidate and keeps people in order", () => {
  const { stroke, s } = setup();
  stroke(2, free1);
  stroke(0, free1);
  expect(s().candidates[free1]).toEqual([0, 2]);
  stroke(0, free1);
  expect(s().candidates[free1]).toEqual([2]);
});

test("a drag applies what its first cell did to every cell it crosses", () => {
  const { stroke, s } = setup();
  stroke(0, free2);
  stroke(0, free1, free2, free3);
  expect([free1, free2, free3].map((c) => s().candidates[c])).toEqual([[0], [0], [0]]);
  stroke(0, free1, free2, free3);
  expect([free1, free2, free3].map((c) => s().candidates[c])).toEqual([[], [], []]);
});

test("candidates and the empty mark replace each other", () => {
  const { stroke, s } = setup();
  stroke(0, free1);
  stroke("empty", free1);
  expect([s().empty[free1], s().candidates[free1]]).toEqual([true, []]);
  stroke(0, free1);
  expect([s().empty[free1], s().candidates[free1]]).toEqual([false, [0]]);
});

test("placing clears the cell's marks and that person's candidates elsewhere", () => {
  const { stroke, hold, s } = setup();
  stroke(0, free1, free2);
  stroke(1, free1, free2);
  hold(1, free1);
  expect(s().candidates[free1]).toEqual([]);
  expect(s().candidates[free2]).toEqual([0]);
  // an occupied cell takes no marks
  stroke(0, free1);
  stroke("empty", free1);
  expect([s().candidates[free1], s().empty[free1]]).toEqual([[], false]);
});

test("the eraser clears marks and people", () => {
  const { stroke, hold, s } = setup();
  hold(0, free1);
  stroke(1, free2);
  stroke("empty", free3);
  stroke("erase", free1, free2, free3);
  expect(s().positions[0]).toBeNull();
  expect([s().candidates[free2], s().empty[free3]]).toEqual([[], false]);
});

test("holding with the empty mark or the eraser places nobody", () => {
  const { play, s } = setup();
  for (const choice of ["empty", "erase"] as const) {
    play.selected.value = choice;
    play.strokeStart(free1);
    play.strokeHold();
    play.strokeEnd();
  }
  expect(s().positions.every((cell) => cell === null)).toBe(true);
});

test("cells that cannot be stood on take nothing", () => {
  const { play, stroke, hold, s } = setup();
  for (const choice of [0, "empty", "erase"] as const) stroke(choice, blocked);
  hold(0, blocked);
  expect([s().positions[0], s().candidates[blocked], s().empty[blocked]]).toEqual([
    null,
    [],
    false,
  ]);
  expect(play.canUndo.value).toBe(false);
});

test("undo reverts one whole stroke, and no-op strokes leave no history", () => {
  const { play, stroke, hold, s } = setup();
  stroke(0, free1, free2, free3);
  hold(1, free1);
  stroke("erase", free3, free3);
  stroke("erase", free3);
  play.undo();
  expect(s().candidates[free3]).toEqual([0]);
  play.undo();
  expect(s().positions[1]).toBeNull();
  expect(s().candidates[free1]).toEqual([0]);
  play.undo();
  expect(s().candidates[free1]).toEqual([]);
  expect(play.canUndo.value).toBe(false);
});

test("is correct only once everyone stands on the solution", () => {
  const { play, hold } = setup();
  solution.forEach((cell, person) => {
    expect(play.correct.value).toBe(false);
    hold(person, cell);
  });
  expect(play.complete.value).toBe(true);
  expect(play.correct.value).toBe(true);
});

test("flags placed people who share a row or column, or crowd the victim's room", () => {
  const { play, hold } = setup();
  const size = board.size;
  const free = cells.filter((c) => isStandable(board, c));
  const sameRow = free.find(
    (c) => c !== free[0] && Math.floor(c / size) === Math.floor(free[0]! / size),
  )!;
  hold(0, free[0]!);
  expect(play.conflicts.value).toEqual([]);
  hold(1, sameRow);
  expect(play.conflicts.value).toEqual([0, 1]);
  hold(1, sameRow);
  expect(play.conflicts.value).toEqual([]);

  // the solution itself breaks no rule, until a third person joins the victim's room
  const fresh = setup();
  solution.forEach((cell, person) => fresh.hold(person, cell));
  expect(fresh.play.conflicts.value).toEqual([]);
  const { victim, murderer } = puzzle;
  const room = board.rooms[solution[victim]!];
  const spare = free.find((c) => board.rooms[c] === room && !solution.includes(c))!;
  const intruder = solution.findIndex((_, person) => person !== victim && person !== murderer);
  fresh.hold(intruder, spare);
  expect(fresh.play.conflicts.value).toEqual(expect.arrayContaining([victim, murderer, intruder]));
});
