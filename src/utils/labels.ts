import type { Clue, Direction, Gender, ObjectKind, Puzzle, RoomKind, Step } from "../core";

export const ROOM_NAMES: Record<RoomKind, string> = {
  kitchen: "廚房",
  livingRoom: "客廳",
  bedroom: "臥室",
  bathroom: "浴室",
  study: "書房",
  diningRoom: "餐廳",
  hallway: "走廊",
  garden: "花園",
  garage: "車庫",
};

export const OBJECT_NAMES: Record<ObjectKind, string> = {
  table: "桌子",
  plant: "植物",
  shelf: "書櫃",
  chair: "椅子",
  bed: "床",
  carpet: "地毯",
};

export const OBJECT_ICONS: Record<ObjectKind, string> = {
  table: "🍽️",
  plant: "🪴",
  shelf: "📚",
  chair: "🪑",
  bed: "🛏️",
  carpet: "🧶",
};

export const GENDER_NAMES: Record<Gender, string> = { male: "男性", female: "女性" };

const DIRECTION_NAMES: Record<Direction, string> = {
  north: "北",
  south: "南",
  east: "東",
  west: "西",
};

export function cellName(size: number, cell: number): string {
  return `第 ${Math.floor(cell / size) + 1} 列第 ${(cell % size) + 1} 行`;
}

export function personLabel(person: number, victim: number): string {
  return person === victim ? "死者" : String.fromCharCode(65 + person);
}

/** The clue as a sentence fragment, without its subject. */
export function describeClue(clue: Clue, { board, people, victim }: Puzzle): string {
  switch (clue.type) {
    case "inRoom":
      return `在${ROOM_NAMES[board.roomKinds[clue.room]!]}`;
    case "alone":
      return "獨自一人在房間裡";
    case "withPerson":
      return `與 ${personLabel(clue.other, victim)} 在同一個房間`;
    case "beside":
      return `緊鄰${OBJECT_NAMES[clue.object]}`;
    case "on":
      return `在${OBJECT_NAMES[clue.object]}上`;
    case "direction":
      return `在 ${personLabel(clue.other, victim)} 的${DIRECTION_NAMES[clue.direction]}方`;
    case "withGender":
      return `與一名${GENDER_NAMES[clue.gender]}在同一個房間`;
    case "onlyOfGender":
      return `是房間裡唯一的${GENDER_NAMES[people[clue.person]!.gender]}`;
  }
}

/** Why a deduction step could remove candidates. */
export function describeStep(step: Step, puzzle: Puzzle): string {
  if (step.clue)
    return `線索「${personLabel(step.clue.person, puzzle.victim)} ${describeClue(step.clue, puzzle)}」`;
  if (!step.line) return "死者的房間恰好兩個人";
  const line = `第 ${step.line.index + 1} ${step.line.axis === "row" ? "列" : "行"}`;
  if (step.by === undefined) return `${line}只剩這個人能站`;
  const by = personLabel(step.by, puzzle.victim);
  return step.rule === "placed"
    ? `${by} 已確定位置，${line}不能再站人`
    : `${by} 只可能在${line}，其他人不能在${line}`;
}
