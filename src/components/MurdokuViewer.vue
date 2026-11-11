<script setup lang="ts">
import { computed, shallowRef, watchEffect } from "vue";
import { usePuzzle } from "../composables/usePuzzle";
import { MAX_SIZE, MIN_SIZE } from "../core";
import MurdokuGame from "./MurdokuGame.vue";
import MurdokuSteps from "./MurdokuSteps.vue";
import ThemeToggle from "./ThemeToggle.vue";

const SIZES = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => MIN_SIZE + i);
// A difficulty is the range of deduction levels a puzzle must need; see `stepLevel` in core.
const DIFFICULTIES = [
  { value: "easy", label: "簡單", minLevel: 1, maxLevel: 2 },
  { value: "normal", label: "普通", minLevel: 3, maxLevel: 3 },
  { value: "hard", label: "困難", minLevel: 4, maxLevel: 5 },
] as const;
type Difficulty = (typeof DIFFICULTIES)[number]["value"];
const randomSeed = () => Math.floor(Math.random() * 1_000_000);

// The puzzle lives in the URL so a reload or a shared link gives the same one.
const params = new URLSearchParams(location.search);
const urlSize = Number(params.get("size"));
const urlSeed = Number(params.get("seed") ?? NaN);

const size = shallowRef(SIZES.includes(urlSize) ? urlSize : 6);
const seedInput = shallowRef<number | "">(
  Number.isInteger(urlSeed) && urlSeed >= 0 ? urlSeed : randomSeed(),
);
const difficulty = shallowRef<Difficulty>(
  DIFFICULTIES.find((d) => d.value === params.get("difficulty"))?.value ?? "normal",
);
const showSolution = shallowRef(false);

// an emptied number input yields ""
const seed = computed(() => seedInput.value || 0);
const { puzzle, version, loading, error } = usePuzzle(() => {
  const { minLevel, maxLevel } = DIFFICULTIES.find((d) => d.value === difficulty.value)!;
  return { size: size.value, seed: seed.value, minLevel, maxLevel };
});

watchEffect(() =>
  history.replaceState(
    null,
    "",
    `?size=${size.value}&difficulty=${difficulty.value}&seed=${seed.value}`,
  ),
);
</script>

<template>
  <div class="page">
    <header class="masthead">
      <div class="title">
        <h1>Murdoku</h1>
        <p class="tagline">把每個人放回案發當時的位置，找出誰和死者共處一室。</p>
      </div>
      <form class="controls" @submit.prevent>
        <label class="field">
          大小
          <select v-model.number="size">
            <option v-for="n in SIZES" :key="n" :value="n">{{ n }} × {{ n }}</option>
          </select>
        </label>
        <label class="field">
          難度
          <select v-model="difficulty">
            <option v-for="d in DIFFICULTIES" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </label>
        <label class="field">
          題號
          <input v-model.number="seedInput" type="number" min="0" step="1" />
        </label>
        <!-- the button that asks for a puzzle also says when one is on its way -->
        <button
          type="button"
          class="btn solid next"
          :aria-busy="loading"
          @click="seedInput = randomSeed()"
        >
          {{ loading ? "出題中…" : "換一題" }}
        </button>
        <label class="field">
          <input v-model="showSolution" type="checkbox" />
          顯示解答
        </label>
        <ThemeToggle />
      </form>
    </header>

    <main class="content">
      <p v-if="error" class="error" role="alert">
        這一題出不來：{{ error }} 換一個題號或難度再試。
      </p>

      <div v-if="puzzle" class="puzzle" :class="{ stale: loading }">
        <MurdokuGame :key="version" :puzzle="puzzle" :show-solution="showSolution" />

        <details class="steps">
          <summary>推理步驟，共 {{ puzzle.steps.length }} 步（會透露解答）</summary>
          <MurdokuSteps :puzzle="puzzle" />
        </details>

        <p class="note">
          這一題有 {{ puzzle.clues.length }} 條線索，不需要假設就能解開，最難的一步是第
          {{ puzzle.level }} 級推理。進度會自動存在這台裝置上。
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  /* Wide enough for the plan at its largest plus the clue column at two thirds of it.
     On a narrower window the two simply share what there is, still 3:2. */
  max-width: calc(var(--plan) * 5 / 3 + var(--gutter));
  margin: 0 auto;
  padding: 20px 16px 48px;
  display: grid;
  gap: 20px;
}

.masthead {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 12px 32px;
  padding-bottom: 16px;
  /* the sheet's title block sits above a ruled line */
  border-bottom: 1px solid var(--line);
}

.tagline {
  margin-top: 2px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

.controls input[type="number"] {
  width: 6.5rem;
}

.content {
  display: grid;
  gap: 20px;
}

/* wide enough for either label, so the row does not shift while a puzzle is made */
.next {
  min-width: 5.5em;
}

.note {
  font-size: 0.875rem;
}

.error {
  color: var(--alarm);
}

.puzzle {
  display: grid;
  gap: 20px;
}

/* the puzzle on screen is about to be replaced */
.puzzle.stale {
  opacity: 0.45;
  pointer-events: none;
}

.steps {
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.steps[open] summary {
  margin-bottom: 12px;
}

summary {
  cursor: pointer;
  width: fit-content;
  color: var(--ink);
  font-weight: 500;
}

.note {
  max-width: 60ch;
}
</style>
