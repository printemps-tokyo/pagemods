// The DOM side of form filling: snapshot the page's controls, apply a plan,
// capture a rule. Everything decided here is decided in rules.ts; this file
// only reads and writes elements.

import {
  captureFields,
  checkboxState,
  mergeCapture,
  planFill,
  selectOption,
  splitMultiple,
  urlPatternFor,
  type Control,
  type ControlKind,
  type FillPlan,
  type FillRule,
  type FormfillSettings,
} from "./rules.js";

export type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface Bound {
  control: Control;
  el: FormElement;
}

const SKIPPED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file"]);

function kindOf(el: FormElement): ControlKind {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return el.multiple ? "select-multiple" : "select";
  const type = el.type.toLowerCase();
  if (SKIPPED_INPUT_TYPES.has(type)) return "other";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (type === "password") return "password";
  return "text";
}

function labelText(el: FormElement): string {
  const parts: string[] = [];
  const labels = el.labels;
  if (labels) {
    for (const label of Array.from(labels)) {
      const text = label.textContent?.trim();
      if (text) parts.push(text);
    }
  }
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) parts.push(aria);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const text = document.getElementById(id)?.textContent?.trim();
      if (text) parts.push(text);
    }
  }
  const placeholder = el.getAttribute("placeholder")?.trim();
  if (placeholder) parts.push(placeholder);
  return parts.join(" | ");
}

export function snapshot(el: FormElement): Control {
  const kind = kindOf(el);
  const options =
    el instanceof HTMLSelectElement
      ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text }))
      : [];
  const selected =
    el instanceof HTMLSelectElement ? Array.from(el.selectedOptions).map((o) => o.value) : [];
  return {
    kind,
    name: el.name ?? "",
    id: el.id ?? "",
    label: labelText(el),
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : false,
    options,
    selected,
  };
}

/** Every fillable control in the document, in DOM order. */
export function collectControls(root: ParentNode = document): Bound[] {
  const bound: Bound[] = [];
  for (const el of Array.from(root.querySelectorAll<FormElement>("input, textarea, select"))) {
    bound.push({ control: snapshot(el), el });
  }
  return bound;
}

function setNativeValue(el: FormElement, value: string): void {
  // React and friends track the instance's value setter; writing through the
  // prototype's setter and then firing input/change lets them notice.
  const proto = Object.getPrototypeOf(el) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) descriptor.set.call(el, value);
  else el.value = value;
}

function fire(el: FormElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface FillResult {
  filled: number;
  /** Fields that matched nothing on the page, as "rule: pattern". */
  unmatched: string[];
  /** Controls a field matched but whose value could not be applied. */
  skipped: string[];
  rulesMatched: number;
}

export function applyPlan(bound: Bound[], plan: FillPlan): FillResult {
  const byControl = new Map(bound.map((b) => [b.control, b.el]));
  let filled = 0;
  const skipped: string[] = [];
  for (const { control, field } of plan.assignments) {
    const el = byControl.get(control);
    if (!el) continue;
    const name = control.name || control.id || field.match;
    try {
      switch (control.kind) {
        case "checkbox": {
          const input = el as HTMLInputElement;
          const want = checkboxState(control, field.value);
          if (input.checked !== want) input.click();
          filled++;
          break;
        }
        case "radio": {
          const input = el as HTMLInputElement;
          if (!input.checked) input.click();
          filled++;
          break;
        }
        case "select": {
          const select = el as HTMLSelectElement;
          const value = selectOption(control, field.value);
          if (value === null) {
            skipped.push(`${name}: no option "${field.value}"`);
            break;
          }
          select.value = value;
          fire(select);
          filled++;
          break;
        }
        case "select-multiple": {
          const select = el as HTMLSelectElement;
          const requested = splitMultiple(field.value);
          const resolved = requested.map((v) => selectOption(control, v));
          const missing = requested.filter((_, i) => resolved[i] === null);
          if (requested.length > 0 && missing.length === requested.length) {
            skipped.push(`${name}: no option among "${field.value}"`);
            break;
          }
          if (missing.length > 0) skipped.push(`${name}: no option "${missing.join('", "')}"`);
          const wanted = new Set(resolved.filter((v): v is string => v !== null));
          for (const option of Array.from(select.options)) option.selected = wanted.has(option.value);
          fire(select);
          filled++;
          break;
        }
        default: {
          setNativeValue(el, field.value);
          fire(el);
          filled++;
        }
      }
    } catch (error) {
      skipped.push(`${name}: ${String(error)}`);
    }
  }
  return {
    filled,
    unmatched: plan.unmatched.map((u) => `${u.rule.name || u.rule.url}: ${u.field.match}`),
    skipped,
    rulesMatched: plan.rules.length,
  };
}

export function fillPage(settings: FormfillSettings, href = location.href): FillResult {
  const bound = collectControls();
  const byControl = new Map(bound.map((b) => [b.control, b.el]));
  const plan = planFill(
    settings.rules,
    href,
    bound.map((b) => b.control),
    (control, selector) => byControl.get(control)?.matches(selector) ?? false,
  );
  return applyPlan(bound, plan);
}

/** Dry run: the same plan, without touching the page. */
export function planPage(settings: FormfillSettings, href = location.href): FillPlan {
  const bound = collectControls();
  const byControl = new Map(bound.map((b) => [b.control, b.el]));
  return planFill(
    settings.rules,
    href,
    bound.map((b) => b.control),
    (control, selector) => byControl.get(control)?.matches(selector) ?? false,
  );
}

export interface CaptureResult {
  rule: FillRule;
  captured: number;
  created: boolean;
}

/** Build (or extend) the rule for this page from what is filled in right now. */
export function capturePage(settings: FormfillSettings): CaptureResult {
  const controls = collectControls().map((b) => b.control);
  const fields = captureFields(controls, { includePasswords: settings.capturePasswords });
  const url = urlPatternFor(location.href);
  const existing = settings.rules.find((r) => r.url === url);
  const name = existing?.name || document.title.trim() || location.hostname;
  const rule = mergeCapture(existing, url, name, fields);
  return { rule, captured: fields.length, created: existing === undefined };
}
