// Page meta: the pure part. content.ts reads the page into PageMeta; the
// checks and the Markdown output are decided here, testable without a DOM.
//
// Every check cites what it is based on (read 2026-10-06):
// - canonical: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
//   "Use absolute paths rather than relative paths"; the link element "is only
//   accepted if it appears in the <head> section"; "rel="canonical"
//   annotations with hreflang, lang, media, and type attributes are not used
//   for canonicalization"; noindex is not recommended for choosing a canonical.
// - hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
//   the <link> tags "must be inside a well-formed <head> section"; "Each
//   language version must list itself as well as all other language
//   versions"; "Alternate URLs must be fully-qualified"; language code in ISO
//   639-1, optional region in ISO 3166-1 Alpha 2; x-default "recommended".
// - robots: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
//   robots applies to all crawlers, googlebot to Google's text results,
//   googlebot-news to news results; name and content are case-insensitive.
// - Open Graph: https://ogp.me/ requires og:title, og:type, og:image, og:url;
//   og:image:url is "Identical to og:image".
// - HTML: https://html.spec.whatwg.org/multipage/semantics.html#the-title-element
//   "There must be no more than one title element per document."

/** A <link rel=canonical>. */
export interface CanonicalLink {
  /** The href attribute as written ("" when missing). */
  href: string;
  /** The href resolved against the document base URL ("" when missing or it does not parse). */
  resolved: string;
  /** Whether the element sits inside <head>. */
  inHead: boolean;
  /** Which of hreflang, lang, media and type the element carries; any of them makes Google ignore it. */
  altAttributes: string[];
}

/** A <link rel=alternate hreflang>. */
export interface AlternateLink {
  hreflang: string;
  href: string;
  resolved: string;
  inHead: boolean;
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
  /** HTML <title> elements in the document (SVG titles are not counted). */
  titleCount: number;
  lang: string;
  charset: string;
  viewport: string;
  descriptions: string[];
  /** robots, googlebot and googlebot-news metas, names lowercased, in document order. */
  robots: { name: string; content: string }[];
  canonicals: CanonicalLink[];
  alternates: AlternateLink[];
  /** og:* properties, lowercased, in document order. */
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
  /** A fixed sentence; markup in it is in `code` spans. */
  text: string;
  /** The page-supplied value the issue is about (a URL, an hreflang), shown after the text. */
  subject?: string;
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

/** Resolve an href against a base URL; "" when it is empty or does not parse. */
export function resolveUrl(href: string, base: string): string {
  if (href.trim() === "") return "";
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

/** Written with an http(s) scheme, not "//host/x" or "/x". Parsing is checked separately. */
export function hasHttpScheme(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

/** An absolute http(s) URL that parses. */
export function isAbsoluteHttpUrl(href: string): boolean {
  if (!hasHttpScheme(href)) return false;
  try {
    new URL(href.trim());
    return true;
  } catch {
    return false;
  }
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
 * Whether an hreflang value has the shape Google describes: "x-default", or
 * a two-letter language with an optional two-letter region (a four-letter
 * script subtag such as "zh-Hant" is allowed too). Only the shape is checked:
 * whether the codes exist in ISO 639-1 / ISO 3166-1 is not, so "jp" passes.
 */
export function hasHreflangShape(value: string): boolean {
  if (value.toLowerCase() === "x-default") return true;
  return /^[a-z]{2}(-[a-z]{4})?(-[a-z]{2})?$/i.test(value);
}

/** Directives of one meta content attribute, lowercased. */
function directivesOf(content: string): string[] {
  return content
    .toLowerCase()
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

/**
 * The directives that apply to one crawler token: the generic robots metas
 * plus the metas for that token, de-duplicated.
 */
export function directivesFor(meta: PageMeta, token: "googlebot" | "googlebot-news"): string[] {
  const all = meta.robots.filter((r) => r.name === "robots" || r.name === token).flatMap((r) => directivesOf(r.content));
  return [...new Set(all)];
}

function blocksIndexing(directives: string[]): boolean {
  return directives.includes("noindex") || directives.includes("none");
}

/** A resolved URL a crawler can follow: http or https. */
export function isHttpUrl(resolved: string): boolean {
  return /^https?:/i.test(resolved);
}

/** The canonical links Google would consider: in <head>, without alternate-version attributes, with an http(s) URL. */
export function usableCanonicals(meta: PageMeta): CanonicalLink[] {
  return meta.canonicals.filter((c) => c.inHead && c.altAttributes.length === 0 && isHttpUrl(c.resolved));
}

/** The og:* value for a property, treating og:image:url as og:image; "" when absent or blank. */
export function ogValue(meta: PageMeta, property: string): string {
  const names = property === "og:image" ? ["og:image", "og:image:url"] : [property];
  return meta.openGraph.find((o) => names.includes(o.property) && o.content.trim() !== "")?.content.trim() ?? "";
}

const REQUIRED_OG = ["og:title", "og:type", "og:image", "og:url"];

/** The issues worth pointing out, most severe first. */
export function checkPage(meta: PageMeta): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, text: string, subject?: string) =>
    issues.push(subject === undefined ? { severity, text } : { severity, text, subject });

  if (meta.titleCount === 0 || meta.title.trim() === "") add("warn", "No `<title>`.");
  if (meta.titleCount > 1) add("warn", `${meta.titleCount} \`<title>\` elements; HTML allows one per document.`);
  if (meta.descriptions.length === 0) add("info", "No meta description.");
  if (meta.descriptions.length > 1) add("warn", `${meta.descriptions.length} meta descriptions.`);

  const googlebot = directivesFor(meta, "googlebot");
  const news = directivesFor(meta, "googlebot-news");
  const noindex = blocksIndexing(googlebot);
  if (noindex) add("warn", "noindex for Google Search; robots/googlebot directives:", googlebot.join(", "));
  else if (blocksIndexing(news)) add("info", "noindex for Google News only; googlebot-news directives:", news.join(", "));

  // Canonical: each link's own problems, then the set Google would use.
  for (const c of meta.canonicals) {
    const shown = c.href || "(no href)";
    if (!c.inHead) add("error", "rel=canonical outside `<head>` is ignored by Google:", shown);
    if (c.altAttributes.length > 0) {
      add("error", `rel=canonical with ${c.altAttributes.join(", ")} is not used for canonicalization by Google:`, shown);
    }
    if (c.resolved === "") add("error", `rel=canonical has no usable URL:`, shown);
    else if (!isHttpUrl(c.resolved)) add("error", "rel=canonical is not an http(s) URL:", shown);
    else if (!hasHttpScheme(c.href)) add("warn", `rel=canonical is not an absolute URL (Google recommends absolute):`, shown);
  }
  const usable = usableCanonicals(meta);
  if (usable.length === 0) add("info", meta.canonicals.length === 0 ? "No rel=canonical link." : "No rel=canonical link Google would use.");
  if (usable.length > 1) {
    const targets = new Set(usable.map((c) => c.resolved));
    add(targets.size > 1 ? "error" : "warn", `${usable.length} rel=canonical links${targets.size > 1 ? " pointing to different URLs" : ""}.`);
  }
  for (const c of usable) {
    if (!samePage(c.resolved, meta.url)) add("info", `Canonical points to another URL:`, c.resolved);
  }
  if (noindex && usable.length > 0) {
    add("info", "noindex together with rel=canonical: Google prefers rel=canonical alone for choosing a canonical.");
  }

  // hreflang: only links in <head> count.
  if (meta.alternates.length > 0) {
    for (const a of meta.alternates) {
      const shown = a.href || "(no href)";
      if (!a.inHead) add("warn", "hreflang link outside `<head>` (Google requires it inside):", `${a.hreflang} ${shown}`);
      if (!hasHreflangShape(a.hreflang)) {
        add("warn", "hreflang value is not shaped like a language code (ISO 639-1, optional region):", `${a.hreflang} ${shown}`);
      }
      if (a.resolved === "") add("error", "hreflang link has no usable URL:", `${a.hreflang} ${shown}`);
      else if (!isHttpUrl(a.resolved)) add("error", "hreflang link is not an http(s) URL:", `${a.hreflang} ${shown}`);
      else if (!isAbsoluteHttpUrl(a.href)) add("warn", `hreflang URL is not fully qualified:`, shown);
    }
    const valid = meta.alternates.filter((a) => a.inHead && isHttpUrl(a.resolved));
    if (valid.length > 0) {
      const self = usable[0]?.resolved || meta.url;
      if (!valid.some((a) => samePage(a.resolved, self) || samePage(a.resolved, meta.url))) {
        add("warn", "hreflang links do not include this page itself; each language version must list itself.");
      }
      if (!valid.some((a) => a.hreflang.toLowerCase() === "x-default")) {
        add("info", "No hreflang x-default (recommended as the fallback).");
      }
    }
  }

  // Open Graph: once a page uses it, the four basic properties, non-empty.
  if (meta.openGraph.length > 0) {
    const missing = REQUIRED_OG.filter((p) => ogValue(meta, p) === "");
    if (missing.length > 0) add("info", `Open Graph is missing ${missing.join(", ")} (required by ogp.me).`);
    for (const p of ["og:image", "og:url"]) {
      const v = ogValue(meta, p);
      if (v !== "" && !isAbsoluteHttpUrl(v)) add("warn", `${p} is not an absolute http(s) URL:`, v);
    }
  }

  for (const [i, block] of meta.jsonLd.entries()) {
    if (block.error) add("error", `JSON-LD block ${i + 1} does not parse:`, block.error);
  }

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Text for a Markdown table cell: pipes escaped, characters that Markdown or
 * inline HTML would interpret (< > & * _ ` [ ] \) escaped, whitespace folded.
 */
export function mdCell(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_[\]|]/g, "\\$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The whole report as Markdown, for copying. */
export function toMarkdown(meta: PageMeta, scannedAt?: string): string {
  const lines: string[] = [`# Page meta: ${mdCell(meta.url)}`, ""];
  if (scannedAt) lines.push(`Scanned ${scannedAt}.`, "");
  const issues = checkPage(meta);
  lines.push("## Issues", "");
  if (issues.length === 0) lines.push("None found.");
  // Issue texts are fixed sentences with `code` spans for markup; the
  // page-supplied subject is escaped like a table cell.
  for (const i of issues) lines.push(`- ${i.severity}: ${i.text}${i.subject !== undefined ? ` ${mdCell(i.subject)}` : ""}`);
  lines.push("", "## Basics", "", "| Item | Value |", "| --- | --- |");
  const rows: [string, string][] = [
    ["title", meta.title],
    ["description", meta.descriptions.join(" / ")],
    ["canonical", meta.canonicals.map((c) => c.href).join(" / ")],
    ...meta.robots.map((r): [string, string] => [r.name, r.content]),
    ["lang", meta.lang],
    ["charset", meta.charset],
    ["viewport", meta.viewport],
    ["h1", meta.h1.join(" / ")],
  ];
  for (const [k, v] of rows) lines.push(`| ${mdCell(k)} | ${mdCell(v)} |`);
  if (meta.alternates.length > 0) {
    lines.push("", "## hreflang", "", "| hreflang | URL |", "| --- | --- |");
    for (const a of meta.alternates) lines.push(`| ${mdCell(a.hreflang)} | ${mdCell(a.href)} |`);
  }
  if (meta.openGraph.length > 0) {
    lines.push("", "## Open Graph", "", "| Property | Content |", "| --- | --- |");
    for (const o of meta.openGraph) lines.push(`| ${mdCell(o.property)} | ${mdCell(o.content)} |`);
  }
  if (meta.twitter.length > 0) {
    lines.push("", "## Twitter", "", "| Name | Content |", "| --- | --- |");
    for (const t of meta.twitter) lines.push(`| ${mdCell(t.name)} | ${mdCell(t.content)} |`);
  }
  if (meta.jsonLd.length > 0 || meta.microdata.length > 0) {
    lines.push("", "## Structured data", "");
    meta.jsonLd.forEach((b, i) =>
      lines.push(`- JSON-LD ${i + 1}: ${b.error ? `does not parse (${mdCell(b.error)})` : mdCell(b.types.join(", ")) || "(no @type)"}`),
    );
    if (meta.microdata.length > 0) lines.push(`- Microdata: ${mdCell(meta.microdata.join(", "))}`);
  }
  return lines.join("\n") + "\n";
}
