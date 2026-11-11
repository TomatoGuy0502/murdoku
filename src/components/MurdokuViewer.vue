<script setup lang="ts">
import { computed, shallowRef, watchEffect } from "vue";
import { generatePuzzle } from "../core";
import MurdokuGame from "./MurdokuGame.vue";
import MurdokuSteps from "./MurdokuSteps.vue";

const SIZES = [4, 5, 6, 7, 8, 9];
const randomSeed = () => Math.floor(Math.random() * 1_000_000);

// The puzzle lives in the URL so a reload or a shared link gives the same one.
const params = new URLSearchParams(location.search);
const urlSize = Number(params.get("size"));
const urlSeed = Number(params.get("seed") ?? NaN);

const size = shallowRef(SIZES.includes(urlSize) ? urlSize : 6);
const seedInput = shallowRef<number | "">(
  Number.isInteger(urlSeed) && urlSeed >= 0 ? urlSeed : randomSeed(),
);
const showSolution = shallowRef(false);

// an emptied number input yields ""
const seed = computed(() => seedInput.value || 0);
const puzzle = computed(() => generatePuzzle({ size: size.value, seed: seed.value }));

watchEffect(() => history.replaceState(null, "", `?size=${size.value}&seed=${seed.value}`));
</script>

<template>
  <main class="viewer">
    <header class="header">
      <h1>Murdoku</h1>
      <form class="controls" @submit.prevent>
        <label>
          大小
          <select v-model.number="size">
            <option v-for="n in SIZES" :key="n" :value="n">{{ n }} × {{ n }}</option>
          </select>
        </label>
        <label>
          Seed
          <input v-model.number="seedInput" type="number" min="0" step="1" />
        </label>
        <button type="button" @click="seedInput = randomSeed()">隨機一題</button>
        <label class="check">
          <input v-model="showSolution" type="checkbox" />
          顯示解答
        </label>
      </form>
    </header>

    <MurdokuGame :key="`${size}-${seed}`" :puzzle="puzzle" :show-solution="showSolution" />

    <details class="panel">
      <summary>推理步驟（{{ puzzle.steps.length }} 步，會透露解答）</summary>
      <MurdokuSteps :puzzle="puzzle" />
    </details>

    <p class="note">
      {{ puzzle.clues.length }} 條線索，推理 {{ puzzle.steps.length }} 步可解，不需假設。
    </p>
  </main>
</template>

<style scoped>
.viewer {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: grid;
  gap: 24px;
}

.header {
  display: grid;
  gap: 12px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: center;
}

.controls label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.controls select,
.controls input[type="number"],
.controls button {
  font: inherit;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-h);
}

.controls input[type="number"] {
  width: 7rem;
}

.controls button {
  cursor: pointer;
  border-color: var(--accent);
  color: var(--accent);
}

.panel {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}

summary {
  cursor: pointer;
  color: var(--text-h);
  font-weight: 600;
}

.note {
  margin: 0;
  font-size: 0.875rem;
}
</style>
