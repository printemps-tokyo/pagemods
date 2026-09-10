// Environment switching and badge rules, with no DOM in sight.
//
// A site is one project with several environments (local, staging,
// production). An environment is a base URL: everything after that prefix --
// path, query, hash -- is carried over when switching, so the same page
// opens in the other environment. Which environment you are on is decided by
// the same prefix, or by an explicit pattern when a project needs one.

import { newId } from "../../lib/ids.js";
import { compilePattern, escapeRegex } from "../../lib/regex.js";

/** The eight places a badge can sit: four corners and the middle of each edge. */
export type BadgeCorner =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const BADGE_CORNERS: BadgeCorner[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const BADGE_CORNER_LABELS: Record<BadgeCorner, string> = {
  "top-left": "Top left",
  "top-center": "Top center",
  "top-right": "Top right",
  "middle-left": "Middle left",
  "middle-right": "Middle right",
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom center",
  "bottom-right": "Bottom right",
};

export interface BadgeSettings {
  enabled: boolean;
  corner: BadgeCorner;
  /** #rrggbb. */
  color: string;
  /** 0.1 .. 1. */
  opacity: number;
  /** Badge text; the environment label when empty. */
  text: string;
}

export interface EnvEntry {
  id: string;
  /** "production", "staging", "local", ... */
  label: string;
  /** Base URL, e.g. https://example.com or http://localhost:3000/app. */
  base: string;
  /** Optional pattern that decides "am I on this environment"; derived from `base` when empty. */
  match: string;
  badge: BadgeSettings;
}

export interface EnvSite {
  id: string;
  name: string;
  enabled: boolean;
  environments: EnvEntry[];
}

export interface EnvswitchSettings {
  sites: EnvSite[];
}

export const DEFAULTS: EnvswitchSettings = { sites: [] };

/** Tokyo Night hues: red for production, yellow for staging, green for local. */
export const COLOR_PRODUCTION = "#f7768e";
export const COLOR_STAGING = "#e0af68";
export const COLOR_LOCAL = "#9ece6a";
export const COLOR_OTHER = "#7aa2f7";

const PRODUCTION_WORDS = /prod|production|本番|honban|live/i;
const STAGING_WORDS = /stag|staging|stg|test|検証|dev(?:elop)?\b|開発/i;
const LOCAL_WORDS = /local|localhost|127\.0\.0\.1|ローカル/i;

/** The colour a new environment starts with, guessed from its label and base URL. */
export function defaultColorFor(label: string, base = ""): string {
  const text = `${label} ${base}`;
  if (LOCAL_WORDS.test(text)) return COLOR_LOCAL;
  if (STAGING_WORDS.test(text)) return COLOR_STAGING;
  if (PRODUCTION_WORDS.test(text)) return COLOR_PRODUCTION;
  return COLOR_OTHER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function normalizeColor(value: unknown, fallback = COLOR_OTHER): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (HEX.test(text)) return text.toLowerCase();
  // #abc is valid CSS; expand it rather than throw the user's choice away.
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    const [r, g, b] = [text[1], text[2], text[3]] as [string, string, string];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

/** Clamp to 0.1 .. 1: a badge at zero would be invisible with no way to find it. */
export function normalizeOpacity(value: unknown, fallback = 0.9): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.1, Math.round(n * 100) / 100));
}

export function normalizeBadge(raw: unknown, label = "", base = ""): BadgeSettings {
  const b = isRecord(raw) ? raw : {};
  const corner = BADGE_CORNERS.includes(b.corner as BadgeCorner)
    ? (b.corner as BadgeCorner)
    : "top-right";
  return {
    enabled: b.enabled !== false,
    corner,
    color: normalizeColor(b.color, defaultColorFor(label, base)),
    opacity: normalizeOpacity(b.opacity),
    text: str(b.text),
  };
}

export function normalizeEnv(raw: unknown): EnvEntry {
  const e = isRecord(raw) ? raw : {};
  const label = str(e.label);
  const base = str(e.base);
  return {
    id: str(e.id) || newId(),
    label,
    base,
    match: str(e.match),
    badge: normalizeBadge(e.badge, label, base),
  };
}

export function normalizeSite(raw: unknown): EnvSite {
  const s = isRecord(raw) ? raw : {};
  return {
    id: str(s.id) || newId(),
    name: str(s.name),
    enabled: s.enabled !== false,
    environments: Array.isArray(s.environments) ? s.environments.map(normalizeEnv) : [],
  };
}

export function normalizeEnvswitch(raw: unknown): EnvswitchSettings {
  const s = isRecord(raw) ? raw : {};
  return { sites: Array.isArray(s.sites) ? s.sites.map(normalizeSite) : [] };
}

/** Trim and drop a trailing slash, so bases join predictably. */
export function normalizeBase(base: string): string {
  const text = base.trim();
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

/** The pattern that decides whether a URL is on this environment. */
export function envPattern(env: EnvEntry): string {
  const custom = env.match.trim();
  if (custom !== "") return custom;
  const base = normalizeBase(env.base);
  return base === "" ? "" : "^" + escapeRegex(base);
}

export interface Located {
  site: EnvSite;
  env: EnvEntry;
  /** Length of the matched prefix; 0 when the pattern matched elsewhere in the URL. */
  prefix: number;
}

function matchLength(env: EnvEntry, url: string): number | null {
  const re = compilePattern(envPattern(env));
  if (re === null) return null;
  const m = re.exec(url);
  if (m === null) return null;
  return m.index === 0 ? m[0].length : 0;
}

/**
 * Which site and environment this URL belongs to. The longest matching
 * prefix wins, so a base with a path (https://example.com/app) beats the
 * bare origin it sits under.
 */
export function locate(settings: EnvswitchSettings, url: string): Located | null {
  let best: Located | null = null;
  for (const site of settings.sites) {
    if (!site.enabled) continue;
    for (const env of site.environments) {
      const length = matchLength(env, url);
      if (length === null) continue;
      if (best === null || length > best.prefix) best = { site, env, prefix: length };
    }
  }
  return best;
}

/**
 * The same page in another environment: replace the matched prefix with the
 * target base and keep path, query and hash. Null when the target has no
 * usable base.
 */
export function switchUrl(url: string, from: EnvEntry, to: EnvEntry): string | null {
  const target = normalizeBase(to.base);
  if (target === "") return null;
  const length = matchLength(from, url);
  let rest: string;
  if (length !== null && length > 0) {
    rest = url.slice(length);
  } else {
    // A custom pattern that did not anchor at the start: fall back to
    // swapping the origin, which is what "the same page over there" means.
    try {
      rest = url.slice(new URL(url).origin.length);
    } catch {
      return null;
    }
  }
  if (rest === "") return target + "/";
  return target + (rest.startsWith("/") ? rest : "/" + rest);
}

/** The environment after `current` in the site's list, wrapping around. */
export function nextEnv(site: EnvSite, current: EnvEntry): EnvEntry | null {
  const usable = site.environments.filter((e) => normalizeBase(e.base) !== "");
  if (usable.length < 2) return null;
  const index = usable.findIndex((e) => e.id === current.id);
  return usable[(index + 1) % usable.length] ?? null;
}

/**
 * Black or white, whichever stays readable on `hex`. The crossover is where
 * the two WCAG contrast ratios meet, at a relative luminance of
 * sqrt(1.05 * 0.05) - 0.05, not at the midpoint: on Tokyo Night's pink and
 * blue, white would look washed out where black reads cleanly.
 */
export function contrastText(hex: string): string {
  const color = normalizeColor(hex);
  const channel = (i: number): number => {
    const v = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.179 ? "#16161e" : "#ffffff";
}

/** Inline CSS that puts the badge host in its corner. */
export function cornerCss(corner: BadgeCorner, margin = 10): string {
  const parts: string[] = ["position:fixed"];
  const transforms: string[] = [];
  if (corner.startsWith("top")) parts.push(`top:${margin}px`);
  else if (corner.startsWith("bottom")) parts.push(`bottom:${margin}px`);
  else {
    parts.push("top:50%");
    transforms.push("translateY(-50%)");
  }
  if (corner.endsWith("left")) parts.push(`left:${margin}px`);
  else if (corner.endsWith("right")) parts.push(`right:${margin}px`);
  else {
    parts.push("left:50%");
    transforms.push("translateX(-50%)");
  }
  if (transforms.length > 0) parts.push(`transform:${transforms.join(" ")}`);
  return parts.join(";") + ";";
}

/** What the badge says: its own text, else the environment label, else the host. */
export function badgeText(env: EnvEntry): string {
  const text = env.badge.text.trim();
  if (text !== "") return text;
  if (env.label.trim() !== "") return env.label.trim();
  try {
    return new URL(env.base).host;
  } catch {
    return "env";
  }
}

/** A site built from the page you are on, ready to have more environments added. */
export function siteFromUrl(url: string): EnvSite {
  let origin = url;
  let host = url;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    host = parsed.host;
  } catch {
    // Keep the raw string; the user can correct it in the panel.
  }
  const label = LOCAL_WORDS.test(host) ? "local" : "production";
  return {
    id: newId(),
    name: host.replace(/^www\./, ""),
    enabled: true,
    environments: [
      {
        id: newId(),
        label,
        base: origin,
        match: "",
        badge: normalizeBadge({ color: defaultColorFor(label, origin) }, label, origin),
      },
    ],
  };
}

export function newEnv(label = ""): EnvEntry {
  return {
    id: newId(),
    label,
    base: "",
    match: "",
    badge: normalizeBadge({ color: defaultColorFor(label) }, label),
  };
}
