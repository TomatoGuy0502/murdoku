export const BLOCKING_OBJECTS = ["table", "plant", "shelf"] as const;
export const STANDABLE_OBJECTS = ["chair", "bed", "carpet"] as const;
export const OBJECT_KINDS = [...BLOCKING_OBJECTS, ...STANDABLE_OBJECTS] as const;
export const ROOM_KINDS = [
  "kitchen",
  "livingRoom",
  "bedroom",
  "bathroom",
  "study",
  "diningRoom",
  "hallway",
  "garden",
  "garage",
] as const;
export const GENDERS = ["male", "female"] as const;
export const DIRECTIONS = ["north", "south", "east", "west"] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];
export type RoomKind = (typeof ROOM_KINDS)[number];
export type Gender = (typeof GENDERS)[number];
export type Direction = (typeof DIRECTIONS)[number];

/** Every per-cell array is indexed by `row * size + col`. */
export interface Board {
  size: number;
  /** Room id of each cell. */
  rooms: number[];
  /** Label of each room id; has no effect on the rules. */
  roomKinds: RoomKind[];
  objects: (ObjectKind | null)[];
}

export interface Person {
  gender: Gender;
}

/** `person` / `other` are indexes into `Puzzle.people`. */
export type Clue =
  | { type: "inRoom"; person: number; room: number }
  | { type: "alone"; person: number }
  | { type: "withPerson"; person: number; other: number }
  /** Next to the object (orthogonally) and in the same room as it. */
  | { type: "beside"; person: number; object: ObjectKind }
  | { type: "on"; person: number; object: ObjectKind }
  /** `person` is strictly `direction` of `other`, in any column/row. */
  | { type: "direction"; person: number; other: number; direction: Direction }
  /** Shares the room with at least one other person of `gender`. */
  | { type: "withGender"; person: number; gender: Gender }
  /** Nobody else of the person's own gender is in their room. */
  | { type: "onlyOfGender"; person: number };

export interface Puzzle {
  board: Board;
  people: Person[];
  /** Index of the victim; the murderer is the only other person in the victim's room. */
  victim: number;
  clues: Clue[];
}

/** Cell of each person, indexed like `Puzzle.people`. */
export type Solution = number[];
