import { shallowRef } from "vue";

export type Theme = "light" | "dark";

// Same key the inline script in index.html reads before first paint.
const KEY = "murdoku:theme";

/** The page's theme, which index.html has already applied to <html> by the time this runs. */
export function useTheme() {
  const root = document.documentElement;
  const theme = shallowRef<Theme>(root.dataset.theme === "dark" ? "dark" : "light");

  function toggle() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    root.dataset.theme = theme.value;
    try {
      localStorage.setItem(KEY, theme.value);
    } catch {
      // storage blocked: the choice still holds until the page is closed
    }
  }

  return { theme, toggle };
}
