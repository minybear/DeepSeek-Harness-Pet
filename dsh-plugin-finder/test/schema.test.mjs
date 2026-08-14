// Contract test: the tool schema must compile through @deepseek-ai/dsh-tools.
// `dsh-tools` is a peer dependency provided by the DSH host, so this test
// SKIPS when it (or schemastery) is not installed in this checkout — e.g. a
// standalone clone without `pnpm install` or the dev node_modules junction.
import test from "node:test";
import assert from "node:assert/strict";

let defineTool;
let apply;
let Config;
try {
  ({ defineTool } = await import("@deepseek-ai/dsh-tools"));
  ({ apply, Config } = await import("../lib/index.js"));
} catch (error) {
  defineTool = undefined;
}

test("tool schema compiles and apply registers a tool", { skip: defineTool === undefined }, async () => {
  const config = Config({});
  let registered = null;
  const ctx = {
    tools: { register: (tool) => { registered = tool; } },
    systemPrompt: { section: () => {} },
  };
  apply(ctx, config);

  assert.ok(registered, "a tool should be registered");
  assert.equal(registered.name, "find_dsh_plugin");
  assert.equal(registered.parameters.type, "object");
  assert.ok(registered.parameters.properties.category.enum, "category param must carry an enum");
  assert.equal(registered.parameters.properties.category.enum[0], "ui");
  assert.equal(registered.output.schema.type, "object");
  assert.ok(Array.isArray(registered.output.schema.required));
  assert.ok(registered.output.schema.required.includes("plugins"));
  assert.equal(typeof registered.execute, "function");
  assert.equal(typeof registered.output.render, "function");

  // Validate the argument schema rejects a bad enum at the boundary.
  const violations = [];
  // defineTool wraps validation inside execute; drive a minimal bad-args call.
  await assert.rejects(
    registered.execute({ category: "not-a-category" }, { signal: new AbortController().signal }),
    /invalid arguments|INVALID_ARGS|not-a-category/,
  );
});
