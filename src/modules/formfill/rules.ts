// Form-fill rules and the pure logic that applies them.
//
// Nothing in this file touches the DOM. A page is handed in as a list of
// `Control` snapshots (built by content.ts), the plan says which control
// gets which value, and capture turns the same snapshots back into rules.
// That split keeps the matching logic testable under node.

export type MatchBy = "auto" | "name" | "id" | "label" | "css";

export interface FieldRule {
  id: string;
  /** What the pattern is matched against. "auto" tries name, then id. */
  by: MatchBy;
  /** JavaScript regular expression source (or a CSS selector for "css"). */
  match: string;
  value: string;
  enabled: boolean;
}

export interface FillRule {
  id: string;
  name: string;
  /** JavaScript regular expression source matched against the page URL. */
  url: string;
  enabled: boolean;
  fields: FieldRule[];
}

export interface FormfillSettings {
  rules: FillRule[];
  /** Capture password fields too. Off by default: storage is plain text. */
  capturePasswords: boolean;
}

export const DEFAULTS: FormfillSettings = { rules: [], capturePasswords: false };

export type ControlKind =
  | "text"
  | "password"
  | "textarea"
  | "checkbox"
  | "radio"
  | "select"
  | "select-multiple"
  | "other";

/** A DOM-free snapshot of one form control. */
export interface Control {
  kind: ControlKind;
  name: string;
  id: string;
  /** Label text, aria-label and placeholder, joined. */
  label: string;
  value: string;
  checked: boolean;
  options: { value: string; text: string }[];
  /** Values of the selected options of a multiple select. */
  selected: string[];
}

export interface Assignment {
  control: Control;
  field: FieldRule;
  rule: FillRule;
}

export interface FillPlan {
  assignments: Assignment[];
  /** Enabled fields of matching rules that matched no control. */
  unmatched: { rule: FillRule; field: FieldRule }[];
  /** Rules that matched the URL, in order. */
  rules: FillRule[];
}

const MATCH_BY: MatchBy[] = ["auto", "name", "id", "label", "css"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeField(raw: unknown): FieldRule {
  const f = isRecord(raw) ? raw : {};
  const by = MATCH_BY.includes(f.by as MatchBy) ? (f.by as MatchBy) : "auto";
  return {
    id: str(f.id) || newId(),
    by,
    match: str(f.match),
    value: str(f.value),
    enabled: f.enabled !== false,
  };
}

export function normalizeRule(raw: unknown): FillRule {
  const r = isRecord(raw) ? raw : {};
  return {
    id: str(r.id) || newId(),
    name: str(r.name),
    url: str(r.url),
    enabled: r.enabled !== false,
    fields: Array.isArray(r.fields) ? r.fields.map(normalizeField) : [],
  };
}

export function normalizeFormfill(raw: unknown): FormfillSettings {
  const s = isRecord(raw) ? raw : {};
  return {
    rules: Array.isArray(s.rules) ? s.rules.map(normalizeRule) : [],
    capturePasswords: s.capturePasswords === true,
  };
}

/** Compile a pattern; null when it is empty or invalid. */
export function compilePattern(source: string): RegExp | null {
  if (source.trim() === "") return null;
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIALS, "\\$&");
}

/** A URL pattern for the page a capture came from: origin and path, anchored at the start. */
export function urlPatternFor(href: string): string {
  try {
    const url = new URL(href);
    return "^" + escapeRegex(url.origin + url.pathname);
  } catch {
    return "^" + escapeRegex(href);
  }
}

export function ruleMatchesUrl(rule: FillRule, href: string): boolean {
  const re = compilePattern(rule.url);
  return re !== null && re.test(href);
}

export function matchingRules(rules: FillRule[], href: string): FillRule[] {
  return rules.filter((rule) => rule.enabled && ruleMatchesUrl(rule, href));
}

export type CssMatcher = (control: Control, selector: string) => boolean;

export function fieldMatches(field: FieldRule, control: Control, cssMatch: CssMatcher): boolean {
  if (field.by === "css") {
    if (field.match.trim() === "") return false;
    try {
      return cssMatch(control, field.match);
    } catch {
      return false;
    }
  }
  const re = compilePattern(field.match);
  if (re === null) return false;
  switch (field.by) {
    case "name":
      return control.name !== "" && re.test(control.name);
    case "id":
      return control.id !== "" && re.test(control.id);
    case "label":
      return control.label !== "" && re.test(control.label);
    default:
      return (control.name !== "" && re.test(control.name)) || (control.id !== "" && re.test(control.id));
  }
}

/**
 * Decide what to fill. Rules are applied in order and later rules win for a
 * control matched by more than one field; within a rule, later fields win
 * too, so a specific field can follow a broad one. Radio buttons are only
 * assigned when their own value equals the field value, so a name pattern
 * covering a radio group picks exactly one button.
 */
export function planFill(rules: FillRule[], href: string, controls: Control[], cssMatch: CssMatcher): FillPlan {
  const active = matchingRules(rules, href);
  const chosen = new Map<Control, Assignment>();
  const unmatched: { rule: FillRule; field: FieldRule }[] = [];
  for (const rule of active) {
    for (const field of rule.fields) {
      if (!field.enabled) continue;
      let hit = false;
      for (const control of controls) {
        if (control.kind === "other") continue;
        if (!fieldMatches(field, control, cssMatch)) continue;
        if (control.kind === "radio" && control.value !== field.value) continue;
        hit = true;
        chosen.set(control, { control, field, rule });
      }
      if (!hit) unmatched.push({ rule, field });
    }
  }
  return { assignments: [...chosen.values()], unmatched, rules: active };
}

const TRUE_WORDS = new Set(["true", "1", "on", "yes", "checked"]);
const FALSE_WORDS = new Set(["false", "0", "off", "no", "unchecked", ""]);

/** How a field value maps onto a checkbox: explicit words, else compare with the box's own value. */
export function checkboxState(control: Control, value: string): boolean {
  const word = value.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return control.value === value;
}

/** Which option a select should end on: by value first, then by visible text. Null when none fits. */
export function selectOption(control: Control, value: string): string | null {
  const byValue = control.options.find((o) => o.value === value);
  if (byValue) return byValue.value;
  const wanted = value.trim();
  const byText = control.options.find((o) => o.text.trim() === wanted);
  return byText ? byText.value : null;
}

/** Multiple selection values are separated by "|" in the rule value. */
export function splitMultiple(value: string): string[] {
  return value
    .split("|")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

export interface CaptureOptions {
  includePasswords: boolean;
}

/** Turn what is on the page into field rules. Empty text is skipped; checkboxes are kept either way. */
export function captureFields(controls: Control[], opts: CaptureOptions): FieldRule[] {
  const fields: FieldRule[] = [];
  const seenRadio = new Set<string>();
  for (const control of controls) {
    if (control.kind === "other") continue;
    if (control.kind === "password" && !opts.includePasswords) continue;
    const by: MatchBy = control.name !== "" ? "name" : control.id !== "" ? "id" : "auto";
    const key = by === "name" ? control.name : control.id;
    if (key === "") continue;
    let value: string;
    switch (control.kind) {
      case "checkbox":
        value = control.checked ? "true" : "false";
        break;
      case "radio": {
        if (!control.checked || seenRadio.has(key)) continue;
        seenRadio.add(key);
        value = control.value;
        break;
      }
      case "select-multiple": {
        value = control.selected.join("|");
        if (value === "") continue;
        break;
      }
      default:
        if (control.value === "") continue;
        value = control.value;
    }
    fields.push({ id: newId(), by, match: "^" + escapeRegex(key) + "$", value, enabled: true });
  }
  return fields;
}

/** Merge captured fields into an existing rule for the same page, or make a new one. */
export function mergeCapture(existing: FillRule | undefined, url: string, name: string, fields: FieldRule[]): FillRule {
  if (existing === undefined) {
    return { id: newId(), name, url, enabled: true, fields };
  }
  const merged = existing.fields.map((f) => ({ ...f }));
  for (const field of fields) {
    const index = merged.findIndex((f) => f.by === field.by && f.match === field.match);
    if (index === -1) {
      merged.push(field);
    } else {
      merged[index] = { ...(merged[index] as FieldRule), value: field.value, enabled: true };
    }
  }
  return { ...existing, fields: merged };
}
