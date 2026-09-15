// Per-site CSS and hidden elements, decided without touching the DOM.
//
// A rule is picked by a URL pattern, the same way form fill picks one. It
// carries a list of selectors to hide and a block of CSS to add. Building
// the stylesheet is pure string work, and so is turning an element into a
// selector: `ElementLike` is the little the algorithm needs to know about a
// node, and the caller says how many elements a selector matches.

import { newId } from "../../lib/ids.js";
import { compilePattern } from "../../lib/regex.js";

export interface StyleRule {
  id: string;
  name: string;
  /** JavaScript regular expression source matched against the page URL. */
  url: string;
  enabled: boolean;
  /** Selectors hidden with display: none. */
  hide: string[];
  /** Extra CSS, appended as typed. */
  css: string;
}

export interface StylesSettings {
  rules: StyleRule[];
}

export const DEFAULTS: StylesSettings = { rules: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeRule(raw: unknown): StyleRule {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id) || newId(),
    name: str(r.name),
    url: str(r.url),
    enabled: r.enabled !== false,
    hide: Array.isArray(r.hide) ? r.hide.filter((s): s is string => typeof s === "string") : [],
    css: str(r.css),
  };
}

export function normalizeStyles(raw: unknown): StylesSettings {
  const s = isRecord(raw) ? raw : {};
  return { rules: Array.isArray(s.rules) ? s.rules.map(normalizeRule) : [] };
}

export function ruleMatchesUrl(rule: StyleRule, href: string): boolean {
  const re = compilePattern(rule.url);
  return re !== null && re.test(href);
}

export function matchingRules(rules: StyleRule[], href: string): StyleRule[] {
  return rules.filter((rule) => rule.enabled && ruleMatchesUrl(rule, href));
}

/** A rule name can say anything, so it must not be able to close the comment. */
function safeComment(text: string): string {
  return text.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ").slice(0, 120);
}

/**
 * The stylesheet for this page. Each hidden selector becomes its own rule:
 * one invalid selector in a list would take the whole list down with it,
 * and a hand-written selector is invalid often enough to matter.
 *
 * The last block keeps the extension's own UI visible, so a broad selector
 * (`div`, `[class*="banner"]`) cannot hide the panel that would undo it.
 */
export function buildStylesheet(rules: StyleRule[], href: string): { css: string; matched: StyleRule[] } {
  const matched = matchingRules(rules, href);
  const parts: string[] = [];
  for (const rule of matched) {
    parts.push(`/* pagemods: ${safeComment(rule.name || rule.id)} */`);
    for (const selector of rule.hide) {
      const trimmed = selector.trim();
      if (trimmed === "") continue;
      parts.push(`${trimmed} { display: none !important; }`);
    }
    const css = rule.css.trim();
    if (css !== "") parts.push(css);
  }
  if (parts.length > 0) {
    parts.push("/* pagemods: keep our own UI reachable */");
    parts.push("#pagemods-host, #pagemods-env-badge, #pagemods-picker { display: block !important; }");
  }
  return { css: parts.join("\n"), matched };
}

/** Escape a string so it can be used as a CSS identifier (id or class). */
export function escapeIdent(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (/[a-zA-Z0-9_-]/.test(ch) || code > 0x7f) out += ch;
    else out += "\\" + ch;
  }
  // An identifier may not start with a digit; the numeric escape keeps it
  // readable where a backslash would not be allowed.
  if (/^[0-9]/.test(out)) out = `\\3${out[0]} ${out.slice(1)}`;
  return out;
}

/** The little this algorithm needs to know about an element. */
export interface ElementLike {
  tag: string;
  id: string;
  classes: string[];
  parent: ElementLike | null;
  /** Position among siblings of the same tag, 1-based. */
  nthOfType: number;
}

/** How many classes go into a selector before it is more brittle than useful. */
const MAX_CLASSES = 3;
/** How many ancestors the selector may climb. */
const MAX_DEPTH = 6;

function localSelector(el: ElementLike, withNth: boolean): string {
  const classes = el.classes
    .filter((c) => c.trim() !== "")
    .slice(0, MAX_CLASSES)
    .map((c) => "." + escapeIdent(c))
    .join("");
  const nth = withNth ? `:nth-of-type(${el.nthOfType})` : "";
  return `${el.tag}${classes}${nth}`;
}

/**
 * A selector for one element: its id when that is enough, else the shortest
 * ancestor chain that picks it out on its own. `count` says how many
 * elements a selector matches right now (-1 when the selector is invalid).
 */
export function buildSelector(el: ElementLike, count: (selector: string) => number): string {
  if (el.id.trim() !== "") {
    const byId = "#" + escapeIdent(el.id.trim());
    if (count(byId) === 1) return byId;
  }
  for (const withNth of [false, true]) {
    let selector = localSelector(el, withNth);
    if (count(selector) === 1) return selector;
    let parent = el.parent;
    for (let depth = 0; depth < MAX_DEPTH && parent !== null; depth++) {
      if (parent.id.trim() !== "") {
        const anchored = `#${escapeIdent(parent.id.trim())} ${selector}`;
        if (count(anchored) === 1) return anchored;
      }
      selector = `${localSelector(parent, withNth)} > ${selector}`;
      if (count(selector) === 1) return selector;
      parent = parent.parent;
    }
  }
  // Nothing was unique; the nth-of-type chain is still the best description
  // of where the element sits, and the user can edit it.
  const chain: string[] = [];
  let node: ElementLike | null = el;
  for (let depth = 0; depth <= MAX_DEPTH && node !== null; depth++) {
    chain.unshift(localSelector(node, true));
    node = node.parent;
  }
  return chain.join(" > ");
}

/** A rule for the origin of `href`, ready to collect selectors. */
export function ruleForUrl(href: string): StyleRule {
  let origin = href;
  let host = href;
  try {
    const url = new URL(href);
    origin = url.origin;
    host = url.host;
  } catch {
    // Keep the raw string; the user can correct the pattern in the panel.
  }
  return {
    id: newId(),
    name: host,
    url: "^" + origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    enabled: true,
    hide: [],
    css: "",
  };
}

/** Add a selector to a rule, without repeating one it already has. */
export function withSelector(rule: StyleRule, selector: string): StyleRule {
  const trimmed = selector.trim();
  if (trimmed === "" || rule.hide.includes(trimmed)) return rule;
  return { ...rule, hide: [...rule.hide, trimmed] };
}
