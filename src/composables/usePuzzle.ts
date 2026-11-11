import { onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { GeneratedPuzzle, GenerateOptions } from "../core";
import type { GenerateReply } from "../workers/generate";

/**
 * Generates the puzzle for `options` in a Web Worker, so a slow one (a hard 9×9 can take
 * a second) never freezes the page. `puzzle` keeps showing the previous one while the
 * next is on its way; `version` changes whenever a new puzzle arrives.
 */
export function usePuzzle(options: MaybeRefOrGetter<GenerateOptions>) {
  const puzzle = shallowRef<GeneratedPuzzle | null>(null);
  const version = shallowRef(0);
  const loading = shallowRef(false);
  const error = shallowRef<string | null>(null);
  let worker: Worker | undefined;

  const stop = () => {
    worker?.terminate();
    worker = undefined;
  };

  watch(
    () => toValue(options),
    (request) => {
      // a request still running is for a puzzle nobody wants any more
      if (loading.value) stop();
      worker ??= new Worker(new URL("../workers/generate.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }: MessageEvent<GenerateReply>) => {
        loading.value = false;
        if ("error" in data) {
          error.value = data.error;
          return;
        }
        puzzle.value = data.puzzle;
        version.value++;
      };
      worker.onerror = (event) => {
        loading.value = false;
        error.value = event.message;
        stop();
      };
      loading.value = true;
      error.value = null;
      worker.postMessage(request);
    },
    { immediate: true },
  );
  onScopeDispose(stop);

  return { puzzle, version, loading, error };
}
