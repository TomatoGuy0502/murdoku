<script setup lang="ts">
import { computed } from "vue";
import { isStandable, type GeneratedPuzzle } from "../core";
import { describeStep, personLabel } from "../utils/labels";

const props = defineProps<{ puzzle: GeneratedPuzzle }>();

const rows = computed(() => {
  const { board, people, victim, steps, solution } = props.puzzle;
  const standable = board.rooms.filter((_, cell) => isStandable(board, cell)).length;
  const left = people.map(() => standable);
  return steps.map((step, index) => {
    const remaining = (left[step.person]! -= step.removed.length);
    const cell = solution[step.person]!;
    return {
      index,
      label: personLabel(step.person, victim),
      gender: people[step.person]!.gender,
      victim: step.person === victim,
      reason: describeStep(step, props.puzzle),
      removed: step.removed.length,
      remaining,
      placedAt:
        remaining === 1
          ? `第 ${Math.floor(cell / board.size) + 1} 列第 ${(cell % board.size) + 1} 行`
          : "",
    };
  });
});
</script>

<template>
  <ol class="steps">
    <li v-for="row in rows" :key="row.index" class="step" :class="{ placed: row.placedAt }">
      <span class="badge" :class="[row.gender, { victim: row.victim }]">{{ row.label }}</span>
      <span class="reason">{{ row.reason }}</span>
      <span class="effect">
        排除 {{ row.removed }} 格，
        <strong v-if="row.placedAt">確定在{{ row.placedAt }}</strong>
        <template v-else>剩 {{ row.remaining }} 格</template>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  margin: 0;
  padding: 0 0 0 2rem;
  display: grid;
  gap: 6px;
  font-size: 0.9rem;
}

.step::marker {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.step {
  color: var(--ink);
}

.step > * {
  vertical-align: middle;
}

.badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 4px;
  box-sizing: border-box;
  margin-right: 8px;
  border-radius: 999px;
  color: var(--on-person);
  font-weight: 700;
  font-size: 0.75rem;
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

.effect {
  margin-left: 8px;
  color: var(--ink-soft);
}

.effect strong {
  color: var(--ink);
  box-shadow: inset 0 -0.5em 0 var(--marker-wash);
}
</style>
