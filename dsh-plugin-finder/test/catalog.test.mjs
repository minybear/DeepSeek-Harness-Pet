// Unit tests for @minybear/dsh-plugin-finder/lib/catalog.js.
// Pure logic only — no network, no DSH/Cordis imports. Run with `node test/catalog.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CatalogError,
  clampLimit,
  formatPlugin,
  listCategories,
  normalizeCatalog,
  searchPlugins,
} from "../lib/catalog.js";

const FIXTURE = {
  name: "awesome-dsh-plugin",
  url: "https://awesome-dsh-plugin.com",
  updated: "2026-08-14",
  categories: {
    ui: { en: "UI Enhancements", zh: "UI 增强" },
    tools: { en: "Tools & Capabilities", zh: "工具与能力" },
    fun: { en: "Just for Fun", zh: "娱乐" },
  },
  plugins: [
    {
      name: "dsh-visualize",
      owner: "Nagi-ovo",
      url: "https://github.com/Nagi-ovo/dsh-visualize",
      category: "tools",
      description: { en: "Visualize data.", zh: "可视化数据。" },
      npm: null,
      install: "dsh plugin --profile web add github:Nagi-ovo/dsh-visualize",
      added: "2026-08-13",
    },
    {
      name: "dsh-TUI",
      owner: "ccch1mneyyy",
      url: "https://github.com/ccch1mneyyy/dsh-TUI",
      category: "ui",
      description: { en: "Full-screen terminal UI.", zh: "全屏终端 UI。" },
      npm: "@ccch1mneyyy/dsh-tui",
      install: "dsh plugin --profile web add github:ccch1mneyyy/dsh-TUI",
      added: "2026-08-12",
    },
    {
      name: "dsh-auto-chess",
      owner: "omdsh-dev",
      url: "https://github.com/omdsh-dev/dsh-auto-chess",
      category: "fun",
      description: { en: "Auto chess.", zh: "自走棋。" },
      npm: null,
      install: "dsh plugin --profile web add github:omdsh-dev/dsh-auto-chess",
      added: "2026-08-13",
    },
    // malformed: missing url → skipped
    { name: "broken", owner: "x", category: "ui" },
    // malformed: not an object → skipped
    "not-an-object",
  ],
};

test("normalizeCatalog projects plugins and drops malformed entries", () => {
  const catalog = normalizeCatalog(FIXTURE);
  assert.equal(catalog.count, 3);
  assert.equal(catalog.plugins.length, 3);
  assert.equal(catalog.url, "https://awesome-dsh-plugin.com");
  assert.equal(catalog.updated, "2026-08-14");
  assert.deepEqual(catalog.categories.tools, { id: "tools", zh: "工具与能力", en: "Tools & Capabilities" });

  // null npm must be omitted, not emitted as undefined
  const visualize = catalog.plugins[0];
  assert.equal(visualize.name, "dsh-visualize");
  assert.equal(visualize.descriptionZh, "可视化数据。");
  assert.ok(!("npm" in visualize));
  assert.deepEqual(JSON.parse(JSON.stringify(visualize)), visualize); // lossless JSON
});

test("normalizeCatalog rejects a non-object root", () => {
  assert.throws(() => normalizeCatalog([]), CatalogError);
  assert.throws(() => normalizeCatalog("x"), CatalogError);
});

test("searchPlugins ranks by name relevance and keeps source order on ties", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const byName = searchPlugins(catalog, { query: "dsh-" });
  // both dsh-visualize and dsh-TUI start with "dsh-"; dsh-auto-chess too (name includes)
  assert.equal(byName.matches, 3);
  // exact/startsWith ranking: "dsh-visualize" has no "dsh-TUI" vs "dsh-auto-chess" — all start with "dsh-", source order kept
  assert.deepEqual(
    byName.plugins.map((p) => p.name),
    ["dsh-visualize", "dsh-TUI", "dsh-auto-chess"],
  );
});

test("searchPlugins matches Chinese description", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const result = searchPlugins(catalog, { query: "可视化" });
  assert.equal(result.matches, 1);
  assert.equal(result.plugins[0].name, "dsh-visualize");
});

test("searchPlugins filters by category", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const result = searchPlugins(catalog, { category: "ui" });
  assert.equal(result.matches, 1);
  assert.equal(result.plugins[0].name, "dsh-TUI");
});

test("searchPlugins applies limit and reports truncation", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const result = searchPlugins(catalog, { limit: 2 });
  assert.equal(result.matches, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.plugins.length, 2);
});

test("listCategories returns known categories with counts", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const categories = listCategories(catalog);
  assert.deepEqual(categories, [
    { id: "ui", zh: "UI 增强", en: "UI Enhancements", count: 1 },
    { id: "tools", zh: "工具与能力", en: "Tools & Capabilities", count: 1 },
    { id: "fun", zh: "娱乐", en: "Just for Fun", count: 1 },
  ]);
});

test("formatPlugin emits the install command", () => {
  const catalog = normalizeCatalog(FIXTURE);
  const text = formatPlugin(catalog.plugins[0]);
  assert.match(text, /dsh-visualize/);
  assert.match(text, /dsh plugin --profile web add github:Nagi-ovo\/dsh-visualize/);
});

test("clampLimit defaults and clamps", () => {
  assert.equal(clampLimit(undefined, 10, 30), 10);
  assert.equal(clampLimit(5, 10, 30), 5);
  assert.equal(clampLimit(100, 10, 30), 30);
  assert.equal(clampLimit(0, 10, 30), 1);
  assert.equal(clampLimit(2.5, 10, 30), 10); // non-integer falls back to default
});
