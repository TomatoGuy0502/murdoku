<script setup lang="ts">
import { computed } from "vue";
import type { Puzzle } from "../../murdoku";
import { describeClue, personLabel } from "./labels";

const props = defineProps<{
  puzzle: Puzzle;
  /** The person the next board press applies to, if one is selected. */
  active: number | null;
  positions: (number | null)[];
}>();

const emit = defineEmits<{ select: [person: number] }>();

const rows = computed(() => {
  const { people, victim, clues } = props.puzzle;
  return people.map((person, index) => ({
    index,
    label: personLabel(index, victim),
    gender: person.gender,
    victim: index === victim,
    placed: props.positions[index] != null,
    text:
      index === victim
        ? "沒有線索"
        : clues
            .filter((clue) => clue.person === index)
            .map((clue) => describeClue(clue, props.puzzle))
            .join("；"),
  }));
});
</script>

<template>
  <ul class="clues">
    <li v-for="row in rows" :key="row.index">
      <button
        type="button"
        class="row"
        :class="{ active: row.index === active }"
        :aria-pressed="row.index === active"
        @click="emit('select', row.index)"
      >
        <span class="badge" :class="[row.gender, { victim: row.victim }]">{{ row.label }}</span>
        <span class="text">{{ row.text }}</span>
        <span v-if="row.placed" class="placed" title="已放置">✓</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.clues {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.row {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--text-h);
  cursor: pointer;
}

.row:hover {
  border-color: var(--border);
}

.row.active {
  border-color: var(--accent);
  background: var(--bg);
}

.text {
  flex: 1;
}

.placed {
  color: var(--accent);
  font-weight: 700;
}

.badge {
  flex: none;
  display: inline-grid;
  place-items: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px;
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
}

.badge.male {
  background: #2f6fd6;
}

.badge.female {
  background: #d6457f;
}

.badge.victim {
  background: #2b2733;
  outline: 1px solid var(--border);
}
</style>
