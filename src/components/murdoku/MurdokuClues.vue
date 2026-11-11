<script setup lang="ts">
import { computed } from "vue";
import type { Puzzle } from "../../murdoku";
import { describeClue, personLabel } from "./labels";

const props = defineProps<{ puzzle: Puzzle }>();

const suspects = computed(() => {
  const { people, victim, clues } = props.puzzle;
  return people.flatMap((person, index) =>
    index === victim
      ? []
      : [
          {
            index,
            label: personLabel(index, victim),
            gender: person.gender,
            clues: clues
              .filter((clue) => clue.person === index)
              .map((clue) => describeClue(clue, props.puzzle)),
          },
        ],
  );
});
</script>

<template>
  <ul class="clues">
    <li v-for="s in suspects" :key="s.index" class="suspect">
      <span class="badge" :class="s.gender">{{ s.label }}</span>
      <span>{{ s.clues.join("；") }}</span>
    </li>
  </ul>
</template>

<style scoped>
.clues {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.suspect {
  display: flex;
  gap: 10px;
  align-items: baseline;
  color: var(--text-h);
}

.badge {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
}

.badge.male {
  background: #2f6fd6;
}

.badge.female {
  background: #d6457f;
}
</style>
