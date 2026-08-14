// @minybear/dsh-plugin-finder — pure, Node-testable catalog logic.
//
// The dsh.lanshuagent.com plugin hub serves its catalog as a plain JSON file
// (the site's own `sources.curated.url` points at it). This module owns:
//   - fetching + normalizing that catalog into a stable projection,
//   - keyword/category search with a simple relevance score,
//   - category counting and model-facing markdown formatting.
// It has no DSH/Cordis imports, so it can be unit-tested with plain `node`.

/** Default catalog endpoint — the data source behind dsh.lanshuagent.com. */
export const DEFAULT_CATALOG_URL = "https://awesome-dsh-plugin.com/plugins.json";

/** Known categories, in the order the hub presents them. */
export const CATALOG_CATEGORIES = [
  "ui",
  "theme",
  "session",
  "memory",
  "tools",
  "workflow",
  "notify",
  "model",
  "dev",
  "fun",
];

/** A stable, typed catalog failure (surfaced as a tool `isError` result). */
export class CatalogError extends Error {
  constructor(message, code = "CATALOG_ERROR", options) {
    super(message, options);
    this.name = "CatalogError";
    this.code = code;
  }
}

/**
 * Fetch and normalize the catalog from `url`.
 * @param {string} url - the catalog endpoint.
 * @param {{ signal?: AbortSignal }} [options] - cooperative abort from the tool-call timeout.
 * @returns {Promise<object>} the normalized catalog.
 */
export async function fetchCatalog(url, { signal } = {}) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "application/json",
        "user-agent": "dsh-plugin-finder/0.1.0",
      },
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new CatalogError("catalog fetch aborted", "CATALOG_ABORTED", { cause: error });
    }
    throw new CatalogError(`catalog fetch failed: ${String(error)}`, "CATALOG_FETCH_FAILED", { cause: error });
  }
  if (!response.ok) {
    throw new CatalogError(`catalog fetch failed (HTTP ${response.status})`, "CATALOG_HTTP_ERROR");
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new CatalogError("catalog returned unparseable JSON", "CATALOG_INVALID_JSON", { cause: error });
  }
  return normalizeCatalog(data);
}

/**
 * Validate and project an arbitrary parsed catalog into a stable shape.
 * Unknown or malformed fields are dropped; malformed plugin entries are
 * skipped rather than failing the whole catalog.
 */
export function normalizeCatalog(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new CatalogError("catalog root must be a JSON object", "CATALOG_INVALID_SHAPE");
  }
  const plugins = [];
  const rawPlugins = Array.isArray(data.plugins) ? data.plugins : [];
  for (const raw of rawPlugins) {
    const plugin = normalizePlugin(raw);
    if (plugin !== undefined) plugins.push(plugin);
  }
  return {
    url: typeof data.url === "string" && data.url.length > 0 ? data.url : DEFAULT_CATALOG_URL,
    updated: typeof data.updated === "string" ? data.updated : "",
    count: plugins.length,
    categories: normalizeCategories(data.categories),
    plugins,
  };
}

function normalizeCategories(categories) {
  const out = {};
  if (typeof categories !== "object" || categories === null || Array.isArray(categories)) return out;
  for (const [id, value] of Object.entries(categories)) {
    if (typeof value !== "object" || value === null) continue;
    out[id] = {
      id,
      zh: typeof value.zh === "string" && value.zh.length > 0 ? value.zh : id,
      en: typeof value.en === "string" && value.en.length > 0 ? value.en : id,
    };
  }
  return out;
}

/**
 * Project one raw plugin entry. Returns `undefined` for entries lacking the
 * minimum identity (name + url). Absent optional fields are OMITTED (never
 * `undefined`) so the result is always lossless JSON.
 */
function normalizePlugin(raw) {
  if (typeof raw !== "object" || raw === null) return undefined;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (name.length === 0 || url.length === 0) return undefined;

  const description = typeof raw.description === "object" && raw.description !== null ? raw.description : {};
  const owner = typeof raw.owner === "string" ? raw.owner.trim() : "";
  const npm = typeof raw.npm === "string" ? raw.npm.trim() : "";
  const descriptionZh = typeof description.zh === "string" ? description.zh.trim() : "";
  const descriptionEn = typeof description.en === "string" ? description.en.trim() : "";
  const install = typeof raw.install === "string" ? raw.install.trim() : "";
  const added = typeof raw.added === "string" ? raw.added.trim() : "";

  return {
    name,
    url,
    category: typeof raw.category === "string" ? raw.category.trim() : "",
    ...(owner.length > 0 ? { owner } : {}),
    ...(descriptionZh.length > 0 ? { descriptionZh } : {}),
    ...(descriptionEn.length > 0 ? { descriptionEn } : {}),
    ...(npm.length > 0 ? { npm } : {}),
    ...(install.length > 0 ? { install } : {}),
    ...(added.length > 0 ? { added } : {}),
  };
}

/** Clamp a model-provided limit into `[1, maxLimit]`, defaulting to `defaultLimit`. */
export function clampLimit(limit, defaultLimit, maxLimit) {
  if (limit === undefined) return defaultLimit;
  if (!Number.isInteger(limit)) return defaultLimit;
  return Math.min(Math.max(limit, 1), maxLimit);
}

/**
 * Search the catalog.
 * @param {object} catalog - normalized catalog.
 * @param {{ query?: string, category?: string, limit?: number }} [options]
 * @returns {{ matches: number, truncated: boolean, plugins: object[] }}
 */
export function searchPlugins(catalog, { query, category, limit } = {}) {
  let matches = catalog.plugins;
  const q = normalizeQuery(query);
  if (q !== "") {
    matches = matches
      .map((plugin) => ({ plugin, score: scorePlugin(plugin, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.plugin);
  }
  if (typeof category === "string" && category.trim().length > 0) {
    matches = matches.filter((plugin) => plugin.category === category.trim());
  }
  const capped = matches.slice(0, limit ?? matches.length);
  return {
    matches: matches.length,
    truncated: matches.length > capped.length,
    plugins: capped,
  };
}

function normalizeQuery(query) {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase();
}

/** Simple relevance score; `Array.prototype.sort` is stable, so ties keep source order. */
function scorePlugin(plugin, q) {
  const name = plugin.name.toLowerCase();
  const owner = (plugin.owner ?? "").toLowerCase();
  const category = (plugin.category ?? "").toLowerCase();
  const npm = (plugin.npm ?? "").toLowerCase();
  const zh = (plugin.descriptionZh ?? "").toLowerCase();
  const en = (plugin.descriptionEn ?? "").toLowerCase();

  let score = 0;
  if (name === q) score = Math.max(score, 100);
  if (name.startsWith(q)) score = Math.max(score, 80);
  if (name.includes(q)) score = Math.max(score, 60);
  if (category === q) score = Math.max(score, 40);
  if (owner.includes(q)) score = Math.max(score, 35);
  if (npm.includes(q)) score = Math.max(score, 25);
  if (zh.includes(q)) score = Math.max(score, 20);
  if (en.includes(q)) score = Math.max(score, 20);
  return score;
}

/**
 * Build the category list with per-category plugin counts, in a stable order
 * (known categories first, then any extras found in the data).
 * @returns {Array<{ id: string, zh: string, en: string, count: number }>}
 */
export function listCategories(catalog) {
  const counts = {};
  for (const plugin of catalog.plugins) {
    if (plugin.category.length > 0) counts[plugin.category] = (counts[plugin.category] ?? 0) + 1;
  }
  const entries = [];
  const seen = new Set();
  for (const id of CATALOG_CATEGORIES) {
    if (catalog.categories[id] === undefined && counts[id] === undefined) continue;
    const meta = catalog.categories[id];
    entries.push({ id, zh: meta?.zh ?? id, en: meta?.en ?? id, count: counts[id] ?? 0 });
    seen.add(id);
  }
  for (const id of Object.keys(counts)) {
    if (seen.has(id)) continue;
    const meta = catalog.categories[id];
    entries.push({ id, zh: meta?.zh ?? id, en: meta?.en ?? id, count: counts[id] });
  }
  return entries;
}

/** Format one plugin as a compact, model-friendly markdown block. */
export function formatPlugin(plugin) {
  const meta = [];
  if (plugin.owner) meta.push(`by ${plugin.owner}`);
  if (plugin.npm) meta.push(`npm: ${plugin.npm}`);
  const head = `- ${plugin.name} (${plugin.category || "uncategorized"})${meta.length > 0 ? " " + meta.join(" · ") : ""}`;
  const lines = [head];
  const desc = plugin.descriptionZh || plugin.descriptionEn;
  if (desc) lines.push(`  ${desc}`);
  lines.push(`  ${plugin.url}`);
  if (plugin.install) lines.push(`  install: ${plugin.install}`);
  return lines.join("\n");
}

export function formatPlugins(plugins) {
  return plugins.map(formatPlugin).join("\n\n");
}
