<script setup lang="ts">
import { computed } from "vue";
import type { Puzzle } from "../core";
import { describeClue, personLabel } from "../utils/labels";

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
  /* ruled like a notebook: one statement to a line */
  border-top: 1px solid var(--line);
}

.clues li {
  border-bottom: 1px solid var(--line);
}

.row {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 9px 10px 9px 12px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--ink);
  cursor: pointer;
}

.row:hover {
  background: var(--sheet);
}

/* the picked-up person is run over with the marker */
.row.active {
  background: var(--marker-wash);
  box-shadow: inset 4px 0 0 var(--marker);
}

.text {
  flex: 1;
  line-height: 1.45;
}

.placed {
  color: var(--ink-soft);
  font-weight: 700;
}

.badge {
  flex: none;
  display: inline-grid;
  place-items: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px;
  color: var(--on-person);
  font-weight: 700;
  font-size: 0.8125rem;
}

.badge.male {
  background: var(--male);
}

.badge.female {
  background: var(--female);
}

.badge.victim {
  background: var(--victim);
}
</style>
