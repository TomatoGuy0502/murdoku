import { pick, range, shuffle, type Rng } from "./rng";
import { OBJECT_KINDS, ROOM_KINDS, STANDABLE_OBJECTS, type Board, type ObjectKind } from "./types";

export function neighbors(size: number, cell: number): number[] {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(([r, c]) => r! >= 0 && r! < size && c! >= 0 && c! < size)
    .map(([r, c]) => r! * size + c!);
}

export function isStandable(board: Board, cell: number): boolean {
  const object = board.objects[cell];
  return object == null || (STANDABLE_OBJECTS as readonly string[]).includes(object);
}

export function isBeside(board: Board, cell: number, object: ObjectKind): boolean {
  return neighbors(board.size, cell).some(
    (n) => board.objects[n] === object && board.rooms[n] === board.rooms[cell],
  );
}

/** `size` contiguous rooms grown from random seed cells, objects on ~30% of cells. */
function randomBoard(size: number, rng: Rng): Board {
  const count = size * size;
  const rooms: number[] = Array.from({ length: count }, () => -1);
  shuffle(range(count), rng)
    .slice(0, size)
    .forEach((cell, id) => (rooms[cell] = id));
  for (let open = count - size; open > 0;) {
    const cell = Math.floor(rng() * count);
    if (rooms[cell] !== -1) continue;
    const assigned = neighbors(size, cell).filter((n) => rooms[n] !== -1);
    if (assigned.length === 0) continue;
    rooms[cell] = rooms[pick(assigned, rng)]!;
    open--;
  }
  return {
    size,
    rooms,
    roomKinds: shuffle(ROOM_KINDS, rng).slice(0, size),
    objects: range(count).map(() => (rng() < 0.3 ? pick(OBJECT_KINDS, rng) : null)),
  };
}

/** A random board in which every room has at least two cells a person can stand on. */
export function generateBoard(size: number, rng: Rng): Board {
  for (;;) {
    const board = randomBoard(size, rng);
    const standable = board.roomKinds.map(() => 0);
    board.rooms.forEach((room, cell) => {
      if (isStandable(board, cell)) standable[room]!++;
    });
    if (standable.every((n) => n >= 2)) return board;
  }
}
