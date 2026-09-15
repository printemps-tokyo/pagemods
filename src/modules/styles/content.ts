// The DOM side of site styles: inject the stylesheet, describe an element
// for the selector builder, and run the picker.

import { buildSelector, type ElementLike } from "./rules.js";

const STYLE_ID = "pagemods-styles";
const PICKER_ID = "pagemods-picker";
/** Our own elements are never a target and never get hidden by the picker. */
const OURS = new Set(["pagemods-host", "pagemods-env-badge", PICKER_ID, STYLE_ID]);

let styleEl: HTMLStyleElement | null = null;

export function applyStylesheet(css: string): void {
  if (css.trim() === "") {
    removeStylesheet();
    return;
  }
  if (styleEl === null || !styleEl.isConnected) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    // Last in the document, so it wins ties against the page's own sheets.
    (document.head ?? document.documentElement).appendChild(styleEl);
  }
  if (styleEl.textContent !== css) styleEl.textContent = css;
}

export function removeStylesheet(): void {
  if (styleEl !== null) styleEl.remove();
  styleEl = null;
}

/** How many elements a selector matches; -1 when it is not a valid selector. */
export function countMatches(selector: string): number {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return -1;
  }
}

function isOurs(el: Element | null): boolean {
  for (let node = el; node !== null; node = node.parentElement) {
    if (OURS.has(node.id)) return true;
  }
  return false;
}

function describe(el: Element): ElementLike {
  const parent = el.parentElement;
  let nth = 1;
  if (parent !== null) {
    for (const sibling of Array.from(parent.children)) {
      if (sibling === el) break;
      if (sibling.tagName === el.tagName) nth++;
    }
  }
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id ?? "",
    classes: Array.from(el.classList),
    parent: parent === null || parent === document.documentElement ? null : describe(parent),
    nthOfType: nth,
  };
}

export function selectorFor(el: Element): string {
  return buildSelector(describe(el), countMatches);
}

/** The element the last right-click landed on, for the context-menu entry. */
let contextTarget: Element | null = null;

export function watchContextMenu(): () => void {
  const onContext = (event: MouseEvent) => {
    const target = event.target;
    contextTarget = target instanceof Element && !isOurs(target) ? target : null;
  };
  document.addEventListener("contextmenu", onContext, true);
  return () => document.removeEventListener("contextmenu", onContext, true);
}

export function lastContextTarget(): Element | null {
  return contextTarget !== null && contextTarget.isConnected ? contextTarget : null;
}

// --- picker -----------------------------------------------------------------

interface Picker {
  stop(): void;
}

let picker: Picker | null = null;

export function pickerRunning(): boolean {
  return picker !== null;
}

export function stopPicker(): void {
  picker?.stop();
  picker = null;
}

/**
 * Highlight what the pointer is over until a click picks it. The overlay is
 * in its own closed shadow root and never takes pointer events, so what is
 * under the cursor is always the page's own element.
 */
export function startPicker(onPick: (el: Element, selector: string) => void, onCancel: () => void): void {
  stopPicker();
  const host = document.createElement("div");
  host.id = PICKER_ID;
  host.setAttribute(
    "style",
    "position:fixed;inset:0;z-index:2147483645;pointer-events:none;display:block;",
  );
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .box { position: fixed; border: 2px solid #7aa2f7; background: rgba(122,162,247,.18); box-sizing: border-box; pointer-events: none; }
    .tip { position: fixed; max-width: 70vw; padding: 4px 8px; border-radius: 4px; background: #1a1b26; color: #c0caf5;
           font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; overflow: hidden;
           text-overflow: ellipsis; box-shadow: 0 4px 14px rgba(0,0,0,.5); pointer-events: none; }
    .hint { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); padding: 6px 12px; border-radius: 6px;
            background: #1a1b26; color: #a9b1d6; font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  `;
  const box = document.createElement("div");
  box.className = "box";
  const tip = document.createElement("div");
  tip.className = "tip";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Click an element to hide it. Esc cancels.";
  shadow.append(style, box, tip, hint);
  (document.body ?? document.documentElement).appendChild(host);

  let current: Element | null = null;

  const paint = (el: Element | null) => {
    current = el;
    if (el === null) {
      box.style.display = "none";
      tip.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    tip.style.display = "block";
    tip.style.top = `${rect.top > 26 ? rect.top - 24 : rect.bottom + 4}px`;
    tip.style.left = `${Math.max(4, rect.left)}px`;
    tip.textContent = selectorFor(el);
  };

  const onMove = (event: MouseEvent) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    paint(el !== null && !isOurs(el) ? el : null);
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const el = current;
    stop();
    if (el === null) onCancel();
    else onPick(el, selectorFor(el));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
    onCancel();
  };
  const onScroll = () => paint(current);

  function stop(): void {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    host.remove();
    picker = null;
  }

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  picker = { stop };
}
