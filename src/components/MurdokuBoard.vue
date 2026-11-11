<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { isStandable, type Board, type ObjectKind, type Person } from "../core";
import { OBJECT_ICONS, OBJECT_NAMES, ROOM_NAMES, personLabel } from "../utils/labels";

const props = defineProps<{
  board: Board;
  people: Person[];
  victim: number;
  /** Cell of each person; null while unplaced. */
  positions: (number | null)[];
  /** Per cell, the people pencilled in as possible there. */
  candidates?: number[][];
  /** Per cell, whether it is marked as holding nobody. */
  empty?: boolean[];
  /** The person a long press would place; without one, holding does nothing. */
  holdPerson?: number | null;
  /** Placed people to flag as breaking a rule or standing on the wrong cell. */
  conflicts?: number[];
  /** A cell to point the player at. */
  hintCell?: number | null;
  /** Object kinds to make stand out, e.g. the ones the active person's clues mention. */
  litObjects?: ObjectKind[];
  /** Rooms to make stand out. */
  litRooms?: number[];
  /** Person to ring as the murderer, when revealing the solution. */
  murderer?: number;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  /** A press began on a cell. */
  strokeStart: [cell: number];
  /** The press was dragged onto another cell. */
  strokeMove: [cell: number];
  /** The press stayed on its first cell long enough to count as a long press. */
  strokeHold: [];
  strokeEnd: [];
}>();

const ROOM_TINTS = 9; // --room-0 to --room-8 in style.css, one set per theme

// Lines are drawn once over the whole board rather than as cell borders: borders of
// different widths meet badly at corners, and a neighbour's thin line cuts into a wall.
const lines = computed(() => {
  const { size, rooms } = props.board;
  let grid = "";
  for (let i = 1; i < size; i++) grid += `M${i} 0V${size}M0 ${i}H${size}`;
  let walls = "";
  rooms.forEach((room, cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    if (col < size - 1 && rooms[cell + 1] !== room) walls += `M${col + 1} ${row}v1`;
    if (row < size - 1 && rooms[cell + size] !== room) walls += `M${col} ${row + 1}h1`;
  });
  return { grid, walls, frame: `M0 0H${size}V${size}H0Z` };
});

const cells = computed(() => {
  const { size, rooms, roomKinds, objects } = props.board;
  // Each person owns one slot on the rim of a cell, so the middle stays free for the object.
  // The rim is 3 rows of `rimCols`; slots fill the bottom row, then the sides, then the top.
  const rimCols = Math.max(3, Math.ceil((props.people.length - 2) / 2));
  const slot = (person: number) =>
    person < rimCols
      ? { gridRow: 3, gridColumn: person + 1 }
      : person < rimCols + 2
        ? { gridRow: 2, gridColumn: person === rimCols ? 1 : rimCols }
        : { gridRow: 1, gridColumn: person - rimCols - 1 };
  const who = (person: number) => ({
    index: person,
    slot: slot(person),
    label: personLabel(person, props.victim),
    gender: props.people[person]!.gender,
    victim: person === props.victim,
    murderer: person === props.murderer,
    conflict: props.conflicts?.includes(person) ?? false,
  });
  return rooms.map((room, cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const object = objects[cell] ?? null;
    const occupant = props.positions.indexOf(cell);
    const person = occupant < 0 ? null : who(occupant);
    const candidates = (props.candidates?.[cell] ?? []).map(who);
    const empty = props.empty?.[cell] ?? false;
    const roomName = ROOM_NAMES[roomKinds[room]!];
    return {
      cell,
      object,
      person,
      candidates,
      empty,
      blocked: !isStandable(props.board, cell),
      litObject: object !== null && (props.litObjects?.includes(object) ?? false),
      litRoom: props.litRooms?.includes(room) ?? false,
      // label a room once, on its first cell in reading order
      roomLabel: rooms.indexOf(room) === cell ? roomName : "",
      rim: { gridTemplateColumns: `repeat(${rimCols}, 1fr)` },
      title: [
        `第 ${row + 1} 列第 ${col + 1} 行`,
        roomName,
        object && OBJECT_NAMES[object],
        person?.label,
        candidates.length > 0 && `候選 ${candidates.map((c) => c.label).join("、")}`,
        empty && "無人",
      ]
        .filter(Boolean)
        .join("，"),
      style: { backgroundColor: `var(--room-${room % ROOM_TINTS})` },
    };
  });
});

/** The cell under the pointer during a press; null when no press is in progress. */
let pressed: number | null = null;
const HOLD_MS = 300;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
/** The cell whose long press is counting down, shown as a pie filling into a full circle. */
const holding = shallowRef<number | null>(null);
const pieStyle = computed(() => {
  const person = props.holdPerson;
  if (person == null) return undefined;
  const kind = person === props.victim ? "victim" : props.people[person]!.gender;
  return { "--pie": `var(--${kind})`, animationDuration: `${HOLD_MS}ms` };
});

function stopHold() {
  clearTimeout(holdTimer);
  holding.value = null;
}

function cellAt(event: PointerEvent): number | null {
  const el = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-cell]");
  return el ? Number(el.dataset.cell) : null;
}

function onPointerDown(event: PointerEvent) {
  const cell = cellAt(event);
  if (props.readonly || event.button !== 0 || cell === null) return;
  // keep receiving move/up even when the pointer leaves the board
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pressed = cell;
  emit("strokeStart", cell);
  if (props.holdPerson == null) return;
  holding.value = cell;
  holdTimer = setTimeout(() => {
    holding.value = null;
    emit("strokeHold");
  }, HOLD_MS);
}

function onPointerMove(event: PointerEvent) {
  const cell = cellAt(event);
  if (pressed === null || cell === null || cell === pressed) return;
  stopHold();
  // a fast drag skips cells between two events: walk the straight line between them
  const { size } = props.board;
  const [row, col] = [Math.floor(pressed / size), pressed % size];
  const [dRow, dCol] = [Math.floor(cell / size) - row, (cell % size) - col];
  const steps = Math.max(Math.abs(dRow), Math.abs(dCol));
  for (let i = 1; i <= steps; i++)
    emit(
      "strokeMove",
      Math.round(row + (dRow * i) / steps) * size + Math.round(col + (dCol * i) / steps),
    );
  pressed = cell;
}

function onPointerUp() {
  if (pressed === null) return;
  stopHold();
  pressed = null;
  emit("strokeEnd");
}

/** Keyboard activation arrives as a click with no pointer press behind it; Shift stands in for holding. */
function onKeyboardClick(event: MouseEvent, cell: number) {
  if (event.detail !== 0) return;
  emit("strokeStart", cell);
  if (event.shiftKey) emit("strokeHold");
  emit("strokeEnd");
}
</script>

<template>
  <div class="plan">
    <!-- column and row numbers, the same ones the hints and steps refer to -->
    <div class="ruler cols" aria-hidden="true">
      <span v-for="n in board.size" :key="n">{{ n }}</span>
    </div>
    <div class="ruler rows" aria-hidden="true">
      <span v-for="n in board.size" :key="n">{{ n }}</span>
    </div>
    <div
      class="board"
      :style="{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu.prevent
    >
      <button
        v-for="c in cells"
        :key="c.cell"
        type="button"
        class="cell"
        :class="{ blocked: c.blocked, 'lit-room': c.litRoom, hint: c.cell === hintCell }"
        :style="c.style"
        :data-cell="c.cell"
        :title="c.title"
        :aria-label="c.title"
        :disabled="readonly"
        @click="onKeyboardClick($event, c.cell)"
      >
        <span v-if="c.roomLabel" class="room-label">{{ c.roomLabel }}</span>
        <span v-if="c.object" class="object" :class="{ lit: c.litObject }">
          {{ OBJECT_ICONS[c.object] }}
        </span>
        <span
          v-if="c.person"
          class="person"
          :class="[
            c.person.gender,
            {
              victim: c.person.victim,
              murderer: c.person.murderer,
              conflict: c.person.conflict,
              over: c.object,
            },
          ]"
        >
          {{ c.person.label }}
        </span>
        <span v-else-if="c.candidates.length > 0" class="candidates" :style="c.rim">
          <span
            v-for="p in c.candidates"
            :key="p.index"
            class="candidate"
            :class="[p.gender, { victim: p.victim }]"
            :style="p.slot"
          >
            {{ p.label[0] }}
          </span>
        </span>
        <span v-else-if="c.empty" class="cross" aria-hidden="true" />
        <span v-if="c.cell === holding" class="hold-pie" :style="pieStyle" aria-hidden="true" />
      </button>
      <svg
        class="lines"
        :viewBox="`0 0 ${board.size} ${board.size}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path class="grid" :d="lines.grid" />
        <g class="drafted">
          <path class="walls" :d="lines.walls" />
          <path class="walls frame" :d="lines.frame" />
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* the plan with its rulers: column numbers along the top, row numbers down the side */
.plan {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  grid-template-rows: 1.25rem auto;
}

.ruler {
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.cols {
  grid-column: 2;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

.rows {
  grid-row: 2;
  grid-auto-rows: 1fr;
}

.board {
  grid-area: 2 / 2;
  position: relative;
  display: grid;
  width: 100%;
  /* a drag on the board paints cells instead of scrolling the page */
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.lines path {
  fill: none;
  /* keep line widths in screen pixels whatever the board size */
  vector-effect: non-scaling-stroke;
}

.grid {
  stroke: color-mix(in srgb, var(--ink) 22%, transparent);
  stroke-width: 1px;
}

/* a new plan is drawn in from the left, the way a plotter lays down its lines */
.drafted {
  animation: draft 0.7s ease-out;
}

@keyframes draft {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0);
  }
}

.walls {
  stroke: var(--ink);
  stroke-width: 3px;
  /* square caps run half a width past each end, so corners and T-junctions close up */
  stroke-linecap: square;
  stroke-linejoin: miter;
}

/* the outer wall sits on the edge and loses its outer half to clipping: double it to match */
.frame {
  stroke-width: 6px;
}

.cell {
  position: relative;
  border: 0;
  aspect-ratio: 1;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
  /* lets the marks inside scale with the cell */
  container-type: inline-size;
}

/* the object never moves; a placed person sits on top of it */
.object,
.person {
  grid-area: 1 / 1;
}

.cell:disabled,
.cell.blocked {
  cursor: default;
}

.cell:focus-visible {
  outline: 3px solid var(--marker);
  outline-offset: -3px;
  z-index: 1;
}

.cell.blocked {
  background-image: repeating-linear-gradient(
    45deg,
    color-mix(in srgb, var(--ink) 16%, transparent) 0 2px,
    transparent 2px 8px
  );
}

.room-label {
  position: absolute;
  /* clear of the wall drawn over the cell's edge */
  top: 6px;
  left: 7px;
  font-size: clamp(8px, 12cqw, 13px);
  line-height: 1;
  font-weight: 600;
  opacity: 0.75;
}

/* Everything inside a cell is sized in cqw, a share of the cell's width, so it keeps
   its proportions from a roomy 4×4 down to a tight 10×10. */
.object {
  /* a square box whatever the glyph's own proportions, so the ring around it is a true circle */
  display: grid;
  place-items: center;
  width: 1.4em;
  aspect-ratio: 1;
  font-size: 34cqw;
  line-height: 1;
}

.cell.lit-room::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--marker-wash);
  pointer-events: none;
}

.object.lit {
  border-radius: 50%;
  background: color-mix(in srgb, var(--marker) 45%, var(--sheet));
  box-shadow: 0 0 0 3px var(--marker);
  z-index: 1;
}

.person {
  display: grid;
  place-items: center;
  width: 62%;
  aspect-ratio: 1;
  border-radius: 50%;
  font-weight: 700;
  font-size: 24cqw;
  color: var(--on-person);
  z-index: 1;
}

.male {
  background: var(--male);
}

.female {
  background: var(--female);
}

.victim {
  background: var(--victim);
}

.person.victim {
  font-size: 18cqw;
}

.person.murderer {
  outline: 3px solid var(--alarm);
  outline-offset: 2px;
}

.person.conflict {
  box-shadow:
    0 0 0 3px var(--sheet),
    0 0 0 6px var(--alarm);
}

.cell.hint::before {
  content: "";
  position: absolute;
  inset: 3px;
  z-index: 2;
  border: 4px solid var(--marker);
  pointer-events: none;
  animation: hint-pulse 1s ease-in-out infinite alternate;
}

@keyframes hint-pulse {
  to {
    opacity: 0.35;
  }
}

/* placed over an object: let it show through */
.person.over:not(.conflict) {
  opacity: 0.55;
}

.candidates {
  position: absolute;
  inset: 2%;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  place-items: center;
  pointer-events: none;
}

.candidate {
  display: grid;
  place-items: center;
  width: 84%;
  aspect-ratio: 1;
  border-radius: 50%;
  color: var(--on-person);
  font-size: clamp(7px, 13cqw, 16px);
  font-weight: 700;
  line-height: 1;
}

/* long-press countdown: a pie sweeps round until it is the full circle of a placed person */
@property --sweep {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.hold-pie {
  position: absolute;
  inset: 19%;
  z-index: 3;
  border-radius: 50%;
  background: conic-gradient(var(--pie) var(--sweep), transparent 0);
  animation: sweep linear forwards;
  pointer-events: none;
}

@keyframes sweep {
  to {
    --sweep: 360deg;
  }
}

/* two thick diagonals drawn over whatever the cell shows */
.cross {
  position: absolute;
  inset: 26%;
  z-index: 2;
  pointer-events: none;
  opacity: 0.85;
  background:
    linear-gradient(
      45deg,
      transparent calc(50% - 3px),
      var(--ink) calc(50% - 3px) calc(50% + 3px),
      transparent calc(50% + 3px)
    ),
    linear-gradient(
      -45deg,
      transparent calc(50% - 3px),
      var(--ink) calc(50% - 3px) calc(50% + 3px),
      transparent calc(50% + 3px)
    );
}
</style>
