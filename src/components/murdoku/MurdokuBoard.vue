<script setup lang="ts">
import { computed } from "vue";
import type { Board, Person, Solution } from "../../murdoku";
import { isStandable } from "../../murdoku/board";
import { OBJECT_ICONS, OBJECT_NAMES, ROOM_NAMES, personLabel } from "./labels";

const props = defineProps<{
  board: Board;
  people: Person[];
  victim: number;
  murderer: number;
  /** Where everyone stands; null hides the people. */
  solution: Solution | null;
}>();

const ROOM_COLORS = [
  "#fde2e2",
  "#dcefd9",
  "#dbe7fb",
  "#fbf0cf",
  "#e9defa",
  "#d5f0ee",
  "#fbe3cf",
  "#e6e9ee",
  "#f6dcee",
];
const WALL = "3px solid #2b2733";
const LINE = "1px solid #2b273333";

const cells = computed(() => {
  const { size, rooms, roomKinds, objects } = props.board;
  return rooms.map((room, cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const edge = (wall: boolean) => (wall ? WALL : LINE);
    const object = objects[cell] ?? null;
    const person = props.solution?.indexOf(cell) ?? -1;
    const roomName = ROOM_NAMES[roomKinds[room]!];
    return {
      cell,
      object,
      blocked: !isStandable(props.board, cell),
      // label a room once, on its first cell in reading order
      roomLabel: rooms.indexOf(room) === cell ? roomName : "",
      title: `第 ${row + 1} 列第 ${col + 1} 行，${roomName}${object ? `，${OBJECT_NAMES[object]}` : ""}`,
      person:
        person < 0
          ? null
          : {
              label: personLabel(person, props.victim),
              gender: props.people[person]!.gender,
              victim: person === props.victim,
              murderer: person === props.murderer,
            },
      style: {
        background: ROOM_COLORS[room % ROOM_COLORS.length],
        borderTop: edge(row === 0 || rooms[cell - size] !== room),
        borderBottom: edge(row === size - 1 || rooms[cell + size] !== room),
        borderLeft: edge(col === 0 || rooms[cell - 1] !== room),
        borderRight: edge(col === size - 1 || rooms[cell + 1] !== room),
      },
    };
  });
});
</script>

<template>
  <div class="board" :style="{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }">
    <div
      v-for="c in cells"
      :key="c.cell"
      class="cell"
      :class="{ blocked: c.blocked }"
      :style="c.style"
      :title="c.title"
    >
      <span v-if="c.roomLabel" class="room-label">{{ c.roomLabel }}</span>
      <span v-if="c.object" class="object" :class="{ under: c.person }">
        {{ OBJECT_ICONS[c.object] }}
      </span>
      <span
        v-if="c.person"
        class="person"
        :class="[c.person.gender, { victim: c.person.victim, murderer: c.person.murderer }]"
      >
        {{ c.person.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  width: min(100%, 560px);
}

.cell {
  position: relative;
  aspect-ratio: 1;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  color: #2b2733;
}

.cell.blocked {
  background-image: repeating-linear-gradient(
    45deg,
    #2b273322 0 2px,
    transparent 2px 8px
  ) !important;
}

.room-label {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 0.65rem;
  line-height: 1;
  font-weight: 600;
  opacity: 0.75;
}

.object {
  font-size: 1.6rem;
  line-height: 1;
}

/* someone is standing on it: shrink into the corner */
.object.under {
  position: absolute;
  right: 3px;
  bottom: 3px;
  font-size: 0.9rem;
}

.person {
  display: grid;
  place-items: center;
  width: 62%;
  aspect-ratio: 1;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.95rem;
  color: #fff;
}

.person.male {
  background: #2f6fd6;
}

.person.female {
  background: #d6457f;
}

.person.victim {
  background: #2b2733;
  font-size: 0.7rem;
}

.person.murderer {
  outline: 3px solid #e02424;
  outline-offset: 2px;
}
</style>
