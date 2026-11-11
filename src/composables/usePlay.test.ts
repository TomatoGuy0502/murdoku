import { expect, test } from "vite-plus/test";
import { generatePuzzle, isStandable } from "../core";
import { usePlay, type ProgressStore, type Selection } from "./usePlay";

const puzzle = generatePuzzle({ size: 5, seed: 7 });
const { board, solution } = puzzle;
const cells = board.rooms.map((_, cell) => cell);
const [free1, free2, free3] = cells.filter((c) => isStandable(board, c)) as [
  number,
  number,
  number,
];
const blocked = cells.find((c) => !isStandable(board, c))!;

function memoryStore() {
  const items = new Map<string, string>();
  const store: ProgressStore = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { items, store };
}

function setup(store?: ProgressStore, of = puzzle) {
  const play = usePlay(of, store);
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

test("progress survives a reload of the same puzzle, and only that puzzle", () => {
  const { items, store } = memoryStore();
  const first = setup(store);
  first.stroke(1, free2);
  first.stroke("empty", free3);
  first.hold(0, free1);
  expect(items.size).toBe(1);

  const again = setup(store);
  expect(again.s()).toEqual(first.s());
  // history is not kept, so there is nothing to undo straight after a reload
  expect(again.play.canUndo.value).toBe(false);

  const other = setup(store, generatePuzzle({ size: 5, seed: 8 }));
  expect(other.play.started.value).toBe(false);
});

test("undo and restart are saved too, and an empty board leaves nothing behind", () => {
  const { items, store } = memoryStore();
  const { play, stroke, hold } = setup(store);
  hold(0, free1);
  stroke(1, free2);
  play.undo();
  expect(setup(store).s().candidates[free2]).toEqual([]);
  expect(setup(store).s().positions[0]).toBe(free1);

  play.restart();
  expect(play.started.value).toBe(false);
  expect(items.size).toBe(0);
  play.undo();
  expect(setup(store).s().positions[0]).toBe(free1);
});

test("a corrupt or unavailable store just means starting fresh", () => {
  const { items, store } = memoryStore();
  setup(store).hold(0, free1);
  for (const key of items.keys()) items.set(key, "{not json");
  expect(setup(store).play.started.value).toBe(false);

  const broken: ProgressStore = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    },
    removeItem: () => {},
  };
  const { play, hold } = setup(broken);
  hold(0, free1);
  expect(play.state.value.positions[0]).toBe(free1);
});
