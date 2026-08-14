// @minybear/dsh-plugin-finder — host-side tool plugin.
//
// Registers the model-facing `find_dsh_plugin` tool against the
// dsh.lanshuagent.com plugin hub catalog (data source: awesome-dsh-plugin.com).
// The plugin mounts at the HOST level (via the bundle patch in
// `cordis.patch.yml`), so the tool registers into the host `tools` registry's
// global layer and is visible to every agent/preset.

import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  CATALOG_CATEGORIES,
  DEFAULT_CATALOG_URL,
  clampLimit,
  fetchCatalog,
  formatPlugin,
  listCategories,
  searchPlugins,
} from "./catalog.js";

/** Cordis plugin name used by loader diagnostics. */
const name = "dsh-plugin-finder";

/** Hard dependencies: the tool + system-prompt registries (both host-plane). */
const inject = ["tools", "systemPrompt"];

const Config = z.object({
  catalogUrl: z.string().default(DEFAULT_CATALOG_URL),
  cacheTtlMs: z.number().default(300000),
  timeoutMs: z.number().default(20000),
  defaultLimit: z.number().default(10),
  maxLimit: z.number().default(30),
});

function assertPositiveInteger(label, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name}: ${label} must be a positive integer`);
  }
}

/** Render the model-facing result text from the canonical output value. */
function formatResult(value) {
  const parts = [];
  parts.push(
    `DSH plugin hub catalog: ${value.catalog.url} (updated ${value.catalog.updated}, ${value.catalog.count} plugins)`,
  );
  if (value.categories.length > 0) {
    parts.push("Categories: " + value.categories.map((c) => `${c.id}(${c.zh}·${c.count})`).join("  "));
  }
  const scope = [];
  if (value.query) scope.push(`query "${value.query}"`);
  if (value.category) scope.push(`category "${value.category}"`);
  const scopeText = scope.length > 0 ? ` for ${scope.join(" and ")}` : "";

  if (value.matches === 0) {
    parts.push(`No plugins matched${scopeText}. Try a broader query or a different category.`);
    return parts.join("\n\n");
  }
  parts.push(
    `Found ${value.matches} plugin${value.matches === 1 ? "" : "s"}${scopeText}` +
      (value.truncated ? ` — showing ${value.plugins.length}` : "") +
      ":",
  );
  parts.push(value.plugins.map(formatPlugin).join("\n\n"));
  if (value.truncated) {
    parts.push(`(Showing ${value.plugins.length} of ${value.matches}. Refine the query or category to narrow results.)`);
  }
  return parts.join("\n\n");
}

/**
 * Register the tool. All registrations are effect-scoped to this plugin, so
 * they are removed automatically when the plugin is stopped/updated/removed.
 */
export function apply(ctx, config) {
  const resolved = config;
  assertPositiveInteger("cacheTtlMs", resolved.cacheTtlMs);
  assertPositiveInteger("timeoutMs", resolved.timeoutMs);
  assertPositiveInteger("defaultLimit", resolved.defaultLimit);
  assertPositiveInteger("maxLimit", resolved.maxLimit);
  if (resolved.maxLimit < resolved.defaultLimit) {
    throw new Error(`${name}: maxLimit must be >= defaultLimit`);
  }

  // In-memory catalog cache, scoped to this plugin instance (not module scope).
  let cache = null;
  async function loadCatalog(signal) {
    const now = Date.now();
    if (cache !== null && now - cache.at < resolved.cacheTtlMs) return cache.catalog;
    const catalog = await fetchCatalog(resolved.catalogUrl, { signal });
    cache = { catalog, at: now };
    return catalog;
  }

  ctx.systemPrompt.section({
    name: "tool:find_dsh_plugin",
    order: 112,
    text:
      "Use the find_dsh_plugin tool to discover DSH plugins from the dsh.lanshuagent.com plugin hub " +
      "(data source: awesome-dsh-plugin.com). Search by keyword or category, and install a found " +
      "plugin with its returned install command.",
  });

  ctx.tools.register(
    defineTool({
      name: "find_dsh_plugin",
      description:
        "Search the DSH plugin hub (dsh.lanshuagent.com) catalog for plugins. Returns matching plugins " +
        "with name, author, category, description, GitHub URL, and the exact install command. Use this " +
        "to discover DSH plugins before installing them.",
      parameters: {
        query: {
          type: "string",
          description:
            "Free-text keyword matched against plugin name, owner, category, and description (Chinese and English). Omit to browse a category or the whole catalog.",
        },
        category: {
          type: "string",
          enum: CATALOG_CATEGORIES,
          description:
            "Restrict results to one category: ui, theme, session, memory, tools, workflow, notify, model, dev, fun.",
        },
        limit: {
          type: "integer",
          description: `Maximum number of plugins to return (1–${resolved.maxLimit}, default ${resolved.defaultLimit}).`,
        },
      },
      timeoutMs: resolved.timeoutMs,
      isConcurrencySafe: () => true,
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            catalog: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: {
                url: { type: "string", required: true },
                updated: { type: "string", required: true },
                count: { type: "integer", required: true },
              },
            },
            categories: {
              type: "array",
              required: true,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", required: true },
                  zh: { type: "string", required: true },
                  en: { type: "string", required: true },
                  count: { type: "integer", required: true },
                },
              },
            },
            matches: { type: "integer", required: true },
            truncated: { type: "boolean", required: true },
            plugins: {
              type: "array",
              required: true,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string", required: true },
                  url: { type: "string", required: true },
                  category: { type: "string", required: true },
                  owner: { type: "string" },
                  descriptionZh: { type: "string" },
                  descriptionEn: { type: "string" },
                  npm: { type: "string" },
                  install: { type: "string" },
                  added: { type: "string" },
                },
              },
            },
            query: { type: "string" },
            category: { type: "string" },
          },
        },
        render: (_args, value) => [{ type: "text", text: formatResult(value) }],
      },
      async execute(args, exec) {
        const catalog = await loadCatalog(exec.signal);
        const limit = clampLimit(args.limit, resolved.defaultLimit, resolved.maxLimit);
        const result = searchPlugins(catalog, {
          query: args.query,
          category: args.category,
          limit,
        });
        return {
          catalog: { url: catalog.url, updated: catalog.updated, count: catalog.count },
          categories: listCategories(catalog),
          matches: result.matches,
          truncated: result.truncated,
          plugins: result.plugins,
          ...(typeof args.query === "string" ? { query: args.query } : {}),
          ...(typeof args.category === "string" ? { category: args.category } : {}),
        };
      },
      presentCall: (args) => ({
        card: "generic",
        title: args.query ?? args.category ?? "Browse plugins",
        kind: "search",
        rawInput: args.query ?? "",
      }),
    }),
  );
}

export { Config, inject, name };
