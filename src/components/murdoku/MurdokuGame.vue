<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import { BLOCKING_OBJECTS, OBJECT_KINDS, type GeneratedPuzzle } from "../../murdoku";
import MurdokuBoard from "./MurdokuBoard.vue";
import MurdokuClues from "./MurdokuClues.vue";
import { GENDER_NAMES, OBJECT_ICONS, OBJECT_NAMES, personLabel } from "./labels";
import { usePlay } from "./usePlay";

// The parent keys this component by puzzle, so a new puzzle starts from a clean state.
const props = defineProps<{ puzzle: GeneratedPuzzle; showSolution: boolean }>();

const play = usePlay(props.puzzle);
const { state, selected, canUndo, placedCount, complete, correct } = play;
const accused = shallowRef<number | null>(null);

const name = (person: number) => personLabel(person, props.puzzle.victim);
const TOOLS = [
  { value: "empty", label: "無人", hint: "點或拖曳格子，標記這格沒有人" },
  { value: "erase", label: "橡皮擦", hint: "點或拖曳格子，清掉上面的標記與人" },
] as const;
/** The selected person; null while the nobody-here mark or the eraser is picked instead. */
const active = computed(() => (typeof selected.value === "number" ? selected.value : null));
const hint = computed(() =>
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
        <button type="button" class="mode undo" :disabled="!canUndo" @click="play.undo()">
          復原
        </button>
      </div>
      <p class="hint">{{ hint }}</p>

      <MurdokuBoard
        :board="puzzle.board"
        :people="puzzle.people"
        :victim="puzzle.victim"
        :positions="showSolution ? puzzle.solution : state.positions"
        :candidates="showSolution ? undefined : state.candidates"
        :empty="showSolution ? undefined : state.empty"
        :hold-person="active"
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

.undo {
  margin-left: auto;
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
