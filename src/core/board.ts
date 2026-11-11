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

/**
 * Rooms grown outward from random seed cells, objects on ~30% of cells.
 *
 * There are fewer rooms than people (two thirds of `size`) so that people share rooms,
 * and each room grows at its own pace, so a board ends up with a hall or two and some
 * small rooms rather than equal shares.
 */
function randomBoard(size: number, rng: Rng): Board {
  const count = size * size;
  const roomCount = Math.round((size * 2) / 3);
  const rooms: number[] = Array.from({ length: count }, () => -1);
  shuffle(range(count), rng)
    .slice(0, roomCount)
    .forEach((cell, id) => (rooms[cell] = id));
  // a room four times as eager claims its neighbouring cells four times as often
  const eagerness = range(roomCount).map(() => 1 + 3 * rng());
  for (let open = count - roomCount; open > 0; open--) {
    // every unclaimed cell beside a room, once for each room it touches
    const frontier = range(count).flatMap((cell) =>
      rooms[cell] !== -1
        ? []
        : [...new Set(neighbors(size, cell).map((n) => rooms[n]!))]
            .filter((room) => room !== -1)
            .map((room) => ({ cell, room })),
    );
    let roll = rng() * frontier.reduce((sum, claim) => sum + eagerness[claim.room]!, 0);
    const won = frontier.find((claim) => (roll -= eagerness[claim.room]!) < 0) ?? frontier[0]!;
    rooms[won.cell] = won.room;
  }
  return {
    size,
    rooms,
    roomKinds: shuffle(ROOM_KINDS, rng).slice(0, roomCount),
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
