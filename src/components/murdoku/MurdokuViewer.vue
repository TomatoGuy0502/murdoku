<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { BLOCKING_OBJECTS, OBJECT_KINDS, generatePuzzle } from "../../murdoku";
import MurdokuBoard from "./MurdokuBoard.vue";
import MurdokuClues from "./MurdokuClues.vue";
import MurdokuSteps from "./MurdokuSteps.vue";
import { GENDER_NAMES, OBJECT_ICONS, OBJECT_NAMES, personLabel } from "./labels";

const SIZES = [4, 5, 6, 7, 8, 9];
const randomSeed = () => Math.floor(Math.random() * 1_000_000);

const size = shallowRef(6);
const seed = shallowRef(randomSeed());
const showSolution = shallowRef(false);

const puzzle = computed(() => generatePuzzle({ size: size.value, seed: seed.value || 0 }));

const legend = OBJECT_KINDS.map((kind) => ({
  kind,
  icon: OBJECT_ICONS[kind],
  name: OBJECT_NAMES[kind],
  blocking: (BLOCKING_OBJECTS as readonly string[]).includes(kind),
}));
</script>

<template>
  <main class="viewer">
    <header class="header">
      <h1>Murdoku 出題器</h1>
      <form class="controls" @submit.prevent>
        <label>
          大小
          <select v-model.number="size">
            <option v-for="n in SIZES" :key="n" :value="n">{{ n }} × {{ n }}</option>
          </select>
        </label>
        <label>
          Seed
          <input v-model.number="seed" type="number" min="0" step="1" />
        </label>
        <button type="button" @click="seed = randomSeed()">隨機一題</button>
        <label class="check">
          <input v-model="showSolution" type="checkbox" />
          顯示解答
        </label>
      </form>
    </header>

    <div class="layout">
      <MurdokuBoard
        :board="puzzle.board"
        :people="puzzle.people"
        :victim="puzzle.victim"
        :murderer="puzzle.murderer"
        :solution="showSolution ? puzzle.solution : null"
      />

      <aside class="side">
        <section class="panel">
          <h2>線索</h2>
          <MurdokuClues :puzzle="puzzle" />
          <p class="note">
            死者是{{ GENDER_NAMES[puzzle.people[puzzle.victim]!.gender] }}，沒有線索；
            兇手是唯一與死者同房間的人。
          </p>
          <p v-if="showSolution" class="answer">
            兇手：{{ personLabel(puzzle.murderer, puzzle.victim) }}
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

        <p class="note">
          {{ puzzle.clues.length }} 條線索，推理 {{ puzzle.steps.length }} 步可解，不需假設。
        </p>
      </aside>
    </div>

    <details class="panel">
      <summary>推理步驟（{{ puzzle.steps.length }} 步，會透露解答）</summary>
      <MurdokuSteps :puzzle="puzzle" />
    </details>
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

.side {
  display: grid;
  gap: 16px;
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

.answer {
  margin: 0;
  font-weight: 700;
  color: #e02424;
}

summary {
  cursor: pointer;
  color: var(--text-h);
  font-weight: 600;
}
</style>
