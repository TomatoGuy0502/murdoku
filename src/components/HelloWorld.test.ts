import { expect, test } from "vite-plus/test";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import HelloWorld from "./HelloWorld.vue";

// shortcut: SSR render only, no click interaction; add @vue/test-utils + a DOM env when testing behavior
test("HelloWorld renders heading and initial count", async () => {
  const html = await renderToString(createSSRApp(HelloWorld));
  expect(html).toContain("Get started");
  expect(html).toContain("Count is 0");
});
