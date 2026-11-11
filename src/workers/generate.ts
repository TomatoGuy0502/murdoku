import { generatePuzzle, type GeneratedPuzzle, type GenerateOptions } from "../core";

export type GenerateReply = { puzzle: GeneratedPuzzle } | { error: string };

// Runs in a Web Worker: one request in, one puzzle (or the reason there is none) out.
self.addEventListener("message", ({ data }: MessageEvent<GenerateOptions>) => {
  let reply: GenerateReply;
  try {
    reply = { puzzle: generatePuzzle(data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
});
