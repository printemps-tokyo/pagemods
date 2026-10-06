// Page meta: the pure part. content.ts reads the page into PageMeta; the
// checks and the Markdown/JSON output are decided here, testable without a
// DOM.
//
// Every check cites what it is based on (read 2026-10-06):
// - hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
//   "Each language version must list itself as well as all other language
//   versions"; "Alternate URLs must be fully-qualified"; language code in ISO
//   639-1, optional region in ISO 3166-1 Alpha 2; x-default "recommended".
// - canonical: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
//   "Use absolute paths rather than relative paths"; the link element "is only
//   accepted if it appears in the <head> section"; noindex is not recommended
//   for choosing a canonical.
// - robots: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
//   name values robots, googlebot, googlebot-news; name and content are
//   case-insensitive.
// - Open Graph: https://ogp.me/ requires og:title, og:type, og:image, og:url.

/** A <link rel=canonical>. */
export interface CanonicalLink {
  /** The href attribute as written. */
  href: string;
  /** The href resolved against the page URL ("" when it does not parse). */
  resolved: string;
  /** Whether the element sits inside <head>. */
  inHead: boolean;
}

/** A <link rel=alternate hreflang>. */
export interface AlternateLink {
  hreflang: string;
  href: string;
  resolved: string;
}

/** One <script type=application/ld+json> block. */
export interface JsonLdBlock {
  /** The @type values found, including inside @graph. Empty when the block does not parse. */
  types: string[];
  /** The parse error, when the block is not valid JSON. */
  error?: string;
}

/** Everything the module reads from a page. */
export interface PageMeta {
  url: string;
  title: string;
  titleCount: number;
  lang: string;
  charset: string;
  viewport: string;
  descriptions: string[];
  /** name -> content for robots, googlebot and googlebot-news (names lowercased). */
  robots: { name: string; content: string }[];
  canonicals: CanonicalLink[];
  alternates: AlternateLink[];
  /** og:* properties, in document order. */
  openGraph: { property: string; content: string }[];
  /** twitter:* meta, in document order. */
  twitter: { name: string; content: string }[];
  jsonLd: JsonLdBlock[];
  /** itemtype values of top-level microdata items. */
  microdata: string[];
  h1: string[];
}

export type Severity = "error" | "warn" | "info";

export interface Issue {
  severity: Severity;
  text: string;
}

/** Collect the @type values of a JSON-LD value, looking into @graph and arrays. */
export function jsonLdTypes(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    const obj = v as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
    if (obj["@graph"] !== undefined) visit(obj["@graph"]);
  };
  visit(value);
  return out;
}

/** Parse one JSON-LD block. */
export function parseJsonLd(text: string): JsonLdBlock {
  try {
    return { types: jsonLdTypes(JSON.parse(text)) };
  } catch (err) {
    return { types: [], error: (err as Error).message };
  }
}

/** Resolve an href against a base URL; "" when it does not parse. */
export function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

/** Fully qualified: an absolute http(s) URL with a scheme, not "//host/x" or "/x". */
export function isAbsoluteHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/** Two URLs are the same page when they match without the fragment. */
export function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = "";
    y.hash = "";
    return x.href === y.href;
  } catch {
    return false;
  }
}

/**
 * An hreflang value Google accepts: "x-default", or an ISO 639-1 language
 * (two letters) with an optional region (two letters). A four-letter script
 * subtag ("zh-Hant") is let through rather than flagged, since BCP 47 allows
 * it; only clearly malformed values are reported.
 */
export function isValidHreflang(value: string): boolean {
  if (value.toLowerCase() === "x-default") return true;
  return /^[a-z]{2}(-[a-z]{4})?(-[a-z]{2})?$/i.test(value);
}

/** The robots directives in effect, lowercased and de-duplicated, from all robots-type metas. */
export function robotsDirectives(meta: PageMeta): string[] {
  const all = meta.robots.flatMap((r) => r.content.toLowerCase().split(",").map((d) => d.trim()));
  return [...new Set(all.filter(Boolean))];
}

const REQUIRED_OG = ["og:title", "og:type", "og:image", "og:url"];

/** The issues worth pointing out, most severe first. */
export function checkPage(meta: PageMeta): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, text: string) => issues.push({ severity, text });

  if (meta.titleCount === 0 || meta.title.trim() === "") add("warn", "No <title>.");
  if (meta.descriptions.length === 0) add("info", "No meta description.");
  if (meta.descriptions.length > 1) add("warn", `${meta.descriptions.length} meta descriptions.`);

  const directives = robotsDirectives(meta);
  const noindex = directives.includes("noindex") || directives.includes("none");
  if (noindex) add("warn", `Robots meta says noindex (${directives.join(", ")}).`);

  if (meta.canonicals.length === 0) add("info", "No rel=canonical link.");
  if (meta.canonicals.length > 1) {
    const targets = new Set(meta.canonicals.map((c) => c.resolved));
    add(targets.size > 1 ? "error" : "warn", `${meta.canonicals.length} rel=canonical links${targets.size > 1 ? " pointing to different URLs" : ""}.`);
  }
  for (const c of meta.canonicals) {
    if (!c.inHead) add("error", `rel=canonical outside <head> is ignored by Google: ${c.href}`);
    if (!isAbsoluteHttpUrl(c.href)) add("warn", `rel=canonical is not an absolute URL (Google recommends absolute): ${c.href}`);
    if (c.resolved && !samePage(c.resolved, meta.url)) add("info", `Canonical points to another URL: ${c.resolved}`);
  }
  if (noindex && meta.canonicals.length > 0) {
    add("info", "noindex together with rel=canonical: Google prefers rel=canonical alone for choosing a canonical.");
  }

  if (meta.alternates.length > 0) {
    for (const a of meta.alternates) {
      if (!isValidHreflang(a.hreflang)) add("warn", `hreflang "${a.hreflang}" is not a language code (ISO 639-1, optional region): ${a.href}`);
      if (!isAbsoluteHttpUrl(a.href)) add("warn", `hreflang URL is not fully qualified: ${a.href}`);
    }
    const self = meta.canonicals[0]?.resolved || meta.url;
    if (!meta.alternates.some((a) => samePage(a.resolved, self) || samePage(a.resolved, meta.url))) {
      add("warn", "hreflang links do not include this page itself; each language version must list itself.");
    }
    if (!meta.alternates.some((a) => a.hreflang.toLowerCase() === "x-default")) {
      add("info", "No hreflang x-default (recommended as the fallback).");
    }
  }

  const og = new Set(meta.openGraph.map((o) => o.property));
  if (meta.openGraph.length > 0) {
    const missing = REQUIRED_OG.filter((p) => !og.has(p));
    if (missing.length > 0) add("info", `Open Graph is missing ${missing.join(", ")} (required by ogp.me).`);
  }

  for (const [i, block] of meta.jsonLd.entries()) {
    if (block.error) add("error", `JSON-LD block ${i + 1} does not parse: ${block.error}`);
  }

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** The whole report as Markdown, for copying. */
export function toMarkdown(meta: PageMeta): string {
  const lines: string[] = [`# Page meta: ${meta.url}`, ""];
  const issues = checkPage(meta);
  lines.push("## Issues", "");
  if (issues.length === 0) lines.push("None found.");
  for (const i of issues) lines.push(`- ${i.severity}: ${i.text}`);
  lines.push("", "## Basics", "", "| Item | Value |", "| --- | --- |");
  const rows: [string, string][] = [
    ["title", meta.title],
    ["description", meta.descriptions.join(" / ")],
    ["canonical", meta.canonicals.map((c) => c.href).join(" / ")],
    ["robots", meta.robots.map((r) => `${r.name}: ${r.content}`).join(" / ")],
    ["lang", meta.lang],
    ["charset", meta.charset],
    ["viewport", meta.viewport],
    ["h1", meta.h1.join(" / ")],
  ];
  for (const [k, v] of rows) lines.push(`| ${k} | ${cell(v)} |`);
  if (meta.alternates.length > 0) {
    lines.push("", "## hreflang", "", "| hreflang | URL |", "| --- | --- |");
    for (const a of meta.alternates) lines.push(`| ${cell(a.hreflang)} | ${cell(a.href)} |`);
  }
  if (meta.openGraph.length > 0) {
    lines.push("", "## Open Graph", "", "| Property | Content |", "| --- | --- |");
    for (const o of meta.openGraph) lines.push(`| ${cell(o.property)} | ${cell(o.content)} |`);
  }
  if (meta.twitter.length > 0) {
    lines.push("", "## Twitter", "", "| Name | Content |", "| --- | --- |");
    for (const t of meta.twitter) lines.push(`| ${cell(t.name)} | ${cell(t.content)} |`);
  }
  if (meta.jsonLd.length > 0 || meta.microdata.length > 0) {
    lines.push("", "## Structured data", "");
    meta.jsonLd.forEach((b, i) =>
      lines.push(`- JSON-LD ${i + 1}: ${b.error ? `does not parse (${b.error})` : b.types.join(", ") || "(no @type)"}`),
    );
    if (meta.microdata.length > 0) lines.push(`- Microdata: ${meta.microdata.join(", ")}`);
  }
  return lines.join("\n") + "\n";
}
