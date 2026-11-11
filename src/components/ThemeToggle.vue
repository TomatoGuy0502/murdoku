<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "../composables/useTheme";

const { theme, toggle } = useTheme();
// the button names what pressing it will do, not what is showing now
const label = computed(() => (theme.value === "dark" ? "改用亮色主題" : "改用暗色主題"));
</script>

<template>
  <button type="button" class="btn toggle" :aria-label="label" :title="label" @click="toggle">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <!-- sun while dark (press for light), moon while light (press for dark) -->
      <g v-if="theme === 'dark'" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4" />
        <path
          stroke-linecap="round"
          d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        />
      </g>
      <path v-else fill="currentColor" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  </button>
</template>

<style scoped>
.toggle {
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
}
</style>
