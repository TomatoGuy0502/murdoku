<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { BLOCKING_OBJECTS, OBJECT_KINDS, nextHint, type GeneratedPuzzle } from "../core";
import MurdokuBoard from "./MurdokuBoard.vue";
import MurdokuClues from "./MurdokuClues.vue";
import {
  GENDER_NAMES,
  OBJECT_ICONS,
  OBJECT_NAMES,
  cellName,
  describeStep,
  personLabel,
} from "../utils/labels";
import { usePlay } from "../composables/usePlay";

// The parent keys this component by puzzle, so a new puzzle starts from a clean state.
const props = defineProps<{ puzzle: GeneratedPuzzle; showSolution: boolean }>();

const play = usePlay(props.puzzle);
const { state, selected, canUndo, conflicts, placedCount, complete, correct } = play;
const accused = shallowRef<number | null>(null);

const name = (person: number) => personLabel(person, props.puzzle.victim);
const TOOLS = [
  { value: "empty", label: "無人", hint: "點或拖曳格子，標記這格沒有人" },
  { value: "erase", label: "橡皮擦", hint: "點或拖曳格子，清掉上面的標記與人" },
] as const;
/** The selected person; null while the nobody-here mark or the eraser is picked instead. */
const active = computed(() => (typeof selected.value === "number" ? selected.value : null));
const usage = computed(() =>
  active.value === null
    ? TOOLS.find((t) => t.value === selected.value)!.hint
    : `單擊或拖曳標記 ${name(active.value)} 的候選，長按放置`,
);

/** What the active person's clues point at, to make it stand out on the board. */
const lit = computed(() => {
  const clues = props.puzzle.clues.filter((clue) => clue.person === active.value);
  return {
    objects: clues.flatMap((clue) => ("object" in clue ? [clue.object] : [])),
    rooms: clues.flatMap((clue) => (clue.type === "inRoom" ? [clue.room] : [])),
  };
});

// Each press of the hint button says a little more: who is next, why, then where.
const HINT_BUTTON = ["", "為什麼？", "在哪裡？", "在哪裡？"];
const hintLevel = shallowRef(0);
const hint = computed(() =>
  hintLevel.value === 0
    ? null
    : nextHint(props.puzzle, props.puzzle.solution, state.value.positions),
);
// a hint is about the board as it stood; any change to who is placed retires it
watch(
  () => state.value.positions.join(),
  () => (hintLevel.value = 0),
);
const hintReasons = computed(() =>
  hint.value?.kind === "next"
    ? [...new Set(hint.value.reasons.map((step) => describeStep(step, props.puzzle)))]
    : [],
);
function askHint() {
  hintLevel.value = Math.min(hintLevel.value + 1, 3);
  if (hint.value?.kind === "next") selected.value = hint.value.person;
}
/** People to ring in red: rule breakers, plus anyone a hint has exposed as misplaced. */
const flagged = computed(() => [
  ...conflicts.value,
  ...(hint.value?.kind === "wrong" ? hint.value.people : []),
]);

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
    // leave the browser's own undo alone while typing in the seed field
    if (event.target instanceof HTMLInputElement || props.showSolution) return;
    event.preventDefault();
    play.undo();
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
const suspects = computed(() =>
  props.puzzle.people.map((_, index) => index).filter((index) => index !== props.puzzle.victim),
);

const legend = OBJECT_KINDS.map((kind) => ({
  kind,
  icon: OBJECT_ICONS[kind],
  name: OBJECT_NAMES[kind],
  blocking: (BLOCKING_OBJECTS as readonly string[]).includes(kind),
}));
</script>

<template>
  <div class="layout">
    <div class="main">
      <div class="modes" role="group" aria-label="點格子時的動作">
        <button
          v-for="t in TOOLS"
          :key="t.value"
          type="button"
          class="mode"
          :class="{ active: selected === t.value }"
          :aria-pressed="selected === t.value"
          @click="selected = t.value"
        >
          {{ t.label }}
        </button>
        <button
          type="button"
          class="mode ask"
          :disabled="showSolution || hintLevel === 3 || (hintLevel > 0 && hint?.kind !== 'next')"
          @click="askHint"
        >
          {{ hint?.kind === "next" ? HINT_BUTTON[hintLevel] : "提示" }}
        </button>
        <button type="button" class="mode" :disabled="!canUndo" @click="play.undo()">復原</button>
      </div>
      <p class="hint">{{ usage }}</p>

      <MurdokuBoard
        :board="puzzle.board"
        :people="puzzle.people"
        :victim="puzzle.victim"
        :positions="showSolution ? puzzle.solution : state.positions"
        :candidates="showSolution ? undefined : state.candidates"
        :empty="showSolution ? undefined : state.empty"
        :hold-person="active"
        :conflicts="showSolution ? undefined : flagged"
        :hint-cell="!showSolution && hintLevel === 3 && hint?.kind === 'next' ? hint.cell : null"
        :lit-objects="showSolution ? undefined : lit.objects"
        :lit-rooms="showSolution ? undefined : lit.rooms"
        :murderer="showSolution ? puzzle.murderer : undefined"
        :readonly="showSolution"
        @stroke-start="play.strokeStart"
        @stroke-move="play.strokeMove"
        @stroke-hold="play.strokeHold"
        @stroke-end="play.strokeEnd"
      />

      <div class="status" role="status">
        <template v-if="showSolution">兇手：{{ name(puzzle.murderer) }}</template>
        <template v-else-if="!complete">
          已放置 {{ placedCount }} / {{ puzzle.people.length }} 人
          <span v-if="conflicts.length > 0" class="warn">
            ，{{ conflicts.map(name).join("、") }} 違反規則（同列、同行，或死者房間超過兩人）
          </span>
        </template>
        <template v-else-if="!correct">所有人都放好了，但有地方不符合線索或規則。</template>
        <template v-else-if="accused === puzzle.murderer">
          破案！兇手就是 {{ name(puzzle.murderer) }}。
        </template>
        <template v-else>
          <span>
            位置全部正確！
            {{ accused === null ? "兇手是誰？" : `不是 ${name(accused)}，再想想。` }}
          </span>
          <button
            v-for="person in suspects"
            :key="person"
            type="button"
            class="accuse"
            @click="accused = person"
          >
            {{ name(person) }}
          </button>
        </template>
      </div>

      <section v-if="hintLevel > 0 && !showSolution" class="panel hint-box" role="status">
        <h2>提示</h2>
        <p v-if="!hint">所有人都放對了。</p>
        <p v-else-if="hint.kind === 'wrong'">
          {{ hint.people.map(name).join("、") }} 放錯位置了（已用紅圈標出）。
        </p>
        <template v-else>
          <p>接下來可以確定 {{ name(hint.person) }} 的位置。</p>
          <ol v-if="hintLevel >= 2" class="reasons">
            <li v-for="reason in hintReasons" :key="reason">{{ reason }}</li>
          </ol>
          <p v-if="hintLevel >= 3" class="where">
            {{ name(hint.person) }} 在{{ cellName(puzzle.board.size, hint.cell) }}（盤面上的橘框）。
          </p>
        </template>
      </section>
    </div>

    <aside class="side">
      <section class="panel">
        <h2>人物與線索</h2>
        <MurdokuClues
          :puzzle="puzzle"
          :active="active"
          :positions="state.positions"
          @select="selected = $event"
        />
        <p class="note">
          選一個人、無人或橡皮擦，再點格子。死者是{{
            GENDER_NAMES[puzzle.people[puzzle.victim]!.gender]
          }}； 兇手是唯一與死者同房間的人。
        </p>
      </section>

      <section class="panel">
        <h2>物件</h2>
        <ul class="legend">
          <li v-for="item in legend" :key="item.kind">
            {{ item.icon }} {{ item.name }}
            <small>{{ item.blocking ? "不可站" : "可站" }}</small>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 560px) minmax(240px, 1fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 760px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.main,
.side {
  display: grid;
  /* without this the single column grows to its widest child and spills out of the layout */
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.mode,
.accuse {
  font: inherit;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-h);
  cursor: pointer;
}

.mode.active {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.mode:disabled {
  opacity: 0.45;
  cursor: default;
}

.ask {
  margin-left: auto;
}

.warn {
  color: #e02424;
}

.hint-box p {
  margin: 0;
  color: var(--text-h);
}

.reasons {
  margin: 0;
  padding-left: 1.4rem;
  display: grid;
  gap: 4px;
  font-size: 0.9rem;
}

.where {
  font-weight: 700;
}

.hint {
  margin: 0;
  font-size: 0.875rem;
}

.status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-height: 2rem;
  color: var(--text-h);
  font-weight: 600;
}

.panel {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px 12px;
  color: var(--text-h);
}

.legend small {
  color: var(--text);
}

.note {
  margin: 0;
  font-size: 0.875rem;
}
</style>
