// Form inspector: the DOM side. Reads every form control into the shapes in
// rules.ts and points at one on the page. Nothing here writes to a control.

import type { FieldInfo, FormInfo } from "./rules.js";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;

export interface Scan {
  forms: FormInfo[];
  /** The page element behind each listed field, for "show on page". */
  elements: Map<FieldInfo, Element>;
}

function labelText(el: Control): string {
  const parts: string[] = [];
  for (const label of Array.from(el.labels ?? [])) {
    const text = label.textContent?.replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) parts.push(aria);
  for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
    const text = document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  return parts.join(" | ");
}

/** What a button says: its text, or the value of an input button. */
function buttonText(el: Control): string {
  if (el instanceof HTMLButtonElement) return el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type)) return el.value;
  return "";
}

function isHidden(el: Control): boolean {
  if (el instanceof HTMLInputElement && el.type === "hidden") return true;
  // checkVisibility covers display:none on the element or any ancestor and
  // content-visibility; it is in every Chrome this extension supports (125+).
  return !el.checkVisibility();
}

function read(el: Control): FieldInfo {
  const tag = el.tagName.toLowerCase();
  return {
    tag,
    type: el.type,
    id: el.id,
    name: el.getAttribute("name") ?? "",
    label: labelText(el) || buttonText(el),
    placeholder: el.getAttribute("placeholder") ?? "",
    autocomplete: el.getAttribute("autocomplete") ?? "",
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : false,
    required: "required" in el ? el.required : false,
    disabled: el.disabled,
    readOnly: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.readOnly : false,
    hidden: isHidden(el),
    options: el instanceof HTMLSelectElement ? el.options.length : 0,
  };
}

/**
 * Every form control in the document, grouped by the form it belongs to (the
 * `form` attribute counts, as the browser resolves it), forms in document
 * order and controls outside any form last. Shadow roots and iframes are not
 * entered.
 */
export function scanForms(root: Document = document): Scan {
  const formList = Array.from(root.forms);
  const byForm = new Map<HTMLFormElement | null, FieldInfo[]>();
  const elements = new Map<FieldInfo, Element>();
  for (const el of Array.from(root.querySelectorAll<Control>("input, textarea, select, button"))) {
    const info = read(el);
    elements.set(info, el);
    const key = el.form;
    const list = byForm.get(key) ?? [];
    list.push(info);
    byForm.set(key, list);
  }
  const forms: FormInfo[] = formList.map((form, index) => ({
    index,
    id: form.id,
    name: form.getAttribute("name") ?? "",
    action: form.getAttribute("action") ?? "",
    method: (form.getAttribute("method") ?? "get").toLowerCase(),
    fields: byForm.get(form) ?? [],
  }));
  const loose = byForm.get(null);
  if (loose && loose.length > 0) {
    forms.push({ index: null, id: "", name: "", action: "", method: "", fields: loose });
  }
  return { forms, elements };
}

/** Scroll a control into view and outline it for a moment. False when it is not rendered. */
export function pointAt(el: Element): boolean {
  if (!(el instanceof HTMLElement) || !el.checkVisibility()) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  const previous = { outline: el.style.outline, offset: el.style.outlineOffset };
  el.style.outline = "3px solid #7aa2f7";
  el.style.outlineOffset = "2px";
  window.setTimeout(() => {
    el.style.outline = previous.outline;
    el.style.outlineOffset = previous.offset;
  }, 1600);
  return true;
}
