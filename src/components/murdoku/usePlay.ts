import { computed, ref, shallowRef } from "vue";
import { isValidSolution, type Puzzle } from "../../murdoku";
import { isStandable } from "../../murdoku/board";

/** What the player has picked up: a person, the nobody-here mark, or the eraser. */
export type Selection = number | "empty" | "erase";

interface State {
  /** Cell of each person, or null while unplaced. */
  positions: (number | null)[];
  /** Per cell, the people pencilled in as possible there, in ascending order. */
  candidates: number[][];
  /** Per cell, whether it is marked as holding nobody. */
  empty: boolean[];
}

interface Stroke {
  /** With a person selected a press pencils them in; holding it turns that into placing. */
  action: "candidate" | "place" | "empty" | "erase";
  /** Whether the stroke adds marks or removes them, decided by its first cell. */
  adding: boolean;
  start: number;
}

/** The player's working state for one puzzle. A cell is placed, pencilled or empty, never two. */
export function usePlay(puzzle: Puzzle) {
  const cellCount = puzzle.board.size ** 2;
  const state = ref<State>({
    positions: puzzle.people.map(() => null),
    candidates: Array.from({ length: cellCount }, () => []),
    empty: Array.from({ length: cellCount }, () => false),
  });
  /** Snapshots to undo to, one per stroke that changed something. */
  const history = ref<string[]>([]);
  const selected = shallowRef<Selection>(0);
  let stroke: Stroke | null = null;

  function apply(cell: number) {
    if (!stroke || !isStandable(puzzle.board, cell)) return;
    const s = state.value;
    const { action, adding } = stroke;
    // candidate and place strokes only start while a person is selected
    const person = selected.value as number;
    const occupant = s.positions.indexOf(cell);
    switch (action) {
      case "erase":
        if (occupant >= 0) s.positions[occupant] = null;
        s.candidates[cell] = [];
        s.empty[cell] = false;
        return;
      case "place":
        // whoever stands here leaves; holding your own cell just picks you up
        if (occupant >= 0) s.positions[occupant] = null;
        if (occupant === person) return;
        s.positions[person] = cell;
        s.empty[cell] = false;
        s.candidates = s.candidates.map((list, c) =>
          c === cell ? [] : list.filter((p) => p !== person),
        );
        return;
      case "candidate": {
        if (occupant >= 0) return;
        const rest = s.candidates[cell]!.filter((p) => p !== person);
        s.candidates[cell] = adding ? [...rest, person].sort((a, b) => a - b) : rest;
        if (adding) s.empty[cell] = false;
        return;
      }
      case "empty":
        if (occupant >= 0) return;
        s.empty[cell] = adding;
        if (adding) s.candidates[cell] = [];
    }
  }

  /** Begin a press on `cell`; its current mark decides whether the stroke adds or removes. */
  function strokeStart(cell: number) {
    if (!isStandable(puzzle.board, cell)) return;
    const choice = selected.value;
    history.value.push(JSON.stringify(state.value));
    stroke = {
      action: typeof choice === "number" ? "candidate" : choice,
      adding:
        typeof choice === "number"
          ? !state.value.candidates[cell]!.includes(choice)
          : !state.value.empty[cell],
      start: cell,
    };
    apply(cell);
  }

  /** The press was dragged onto another cell. Placing never drags. */
  function strokeMove(cell: number) {
    if (stroke?.action !== "place") apply(cell);
  }

  /** The press was held still: take back the pencil mark it began with and place the person. */
  function strokeHold() {
    if (stroke?.action !== "candidate") return;
    state.value = JSON.parse(history.value.at(-1)!);
    stroke.action = "place";
    apply(stroke.start);
  }

  function strokeEnd() {
    if (!stroke) return;
    stroke = null;
    if (history.value.at(-1) === JSON.stringify(state.value)) history.value.pop();
  }

  function undo() {
    const last = history.value.pop();
    if (last) state.value = JSON.parse(last);
  }

  const placedCount = computed(() => state.value.positions.filter((cell) => cell !== null).length);
  const complete = computed(() => placedCount.value === puzzle.people.length);
  const correct = computed(
    () => complete.value && isValidSolution(puzzle, state.value.positions as number[]),
  );
  /** Placed people who break a rule: sharing a row or column, or crowding the victim's room. */
  const conflicts = computed(() => {
    const { size, rooms } = puzzle.board;
    const placed = state.value.positions.flatMap((cell, person) =>
      cell === null ? [] : [{ person, cell }],
    );
    const bad = new Set<number>();
    for (const a of placed)
      for (const b of placed)
        if (
          a.person < b.person &&
          (Math.floor(a.cell / size) === Math.floor(b.cell / size) ||
            a.cell % size === b.cell % size)
        )
          bad.add(a.person).add(b.person);
    const victim = placed.find((p) => p.person === puzzle.victim);
    const inVictimRoom = placed.filter((p) => victim && rooms[p.cell] === rooms[victim.cell]);
    if (inVictimRoom.length > 2) for (const p of inVictimRoom) bad.add(p.person);
    return [...bad].sort((a, b) => a - b);
  });
  const canUndo = computed(() => history.value.length > 0);

  return {
    state,
    selected,
    strokeStart,
    strokeMove,
    strokeHold,
    strokeEnd,
    undo,
    canUndo,
    conflicts,
    placedCount,
    complete,
    correct,
  };
}
