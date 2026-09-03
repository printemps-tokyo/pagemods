// Keyboard shortcut text ("Ctrl+Shift+;") to a key combo and back, plus
// matching against a keydown event.
//
// Chrome's own commands API cannot bind punctuation like ";", so the in-page
// shortcut is matched by the content script from KeyboardEvent.key. Single
// characters compare case-insensitively; named keys (Escape, F5, ArrowUp)
// compare by their DOM name.

export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Lower-cased single character, or a DOM key name such as "Escape". */
  key: string;
}

const MODIFIER_NAMES: Record<string, keyof Omit<KeyCombo, "key">> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  super: "meta",
};

const NAMED_KEYS = new Map(
  [
    "Escape",
    "Enter",
    "Tab",
    "Backspace",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ].map((name) => [name.toLowerCase(), name]),
);

const ALIASES: Record<string, string> = {
  esc: "Escape",
  return: "Enter",
  space: " ",
  spacebar: " ",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  plus: "+",
  semicolon: ";",
  comma: ",",
  period: ".",
};

export function normalizeKey(key: string): string | null {
  if (key === "") return null;
  if (key === " ") return " ";
  const lower = key.toLowerCase();
  if (ALIASES[lower] !== undefined) return ALIASES[lower] as string;
  const named = NAMED_KEYS.get(lower);
  if (named !== undefined) return named;
  if ([...key].length === 1) return lower;
  return null;
}

/** "Ctrl+Shift+;" -> combo, or null when the text is not a usable shortcut. */
export function parseShortcut(text: string): KeyCombo | null {
  const combo: KeyCombo = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  // "Ctrl++" is the plus key itself: two empty parts at the end. A single
  // trailing "+" ("Ctrl+") is an unfinished shortcut and yields no key.
  const parts = text.trim().split("+");
  const tokens: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (part === "" && i === parts.length - 1 && i >= 2 && parts[i - 1] === "") {
      tokens.push("+");
    } else if (part !== "") {
      tokens.push(part.trim());
    }
  }
  if (tokens.length === 0) return null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    const modifier = MODIFIER_NAMES[token.toLowerCase()];
    if (modifier !== undefined && i < tokens.length - 1) {
      combo[modifier] = true;
      continue;
    }
    if (i !== tokens.length - 1) return null;
    const key = normalizeKey(token);
    if (key === null) return null;
    combo.key = key;
  }
  if (combo.key === "") return null;
  return combo;
}

export function formatShortcut(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  if (combo.meta) parts.push("Meta");
  const key = combo.key === " " ? "Space" : combo.key.length === 1 ? combo.key.toUpperCase() : combo.key;
  parts.push(key);
  return parts.join("+");
}

/** The subset of KeyboardEvent the matcher reads. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEY_NAMES = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock", "Dead", "Unidentified"]);

/** The combo a keydown represents, or null for a lone modifier press. */
export function comboFromEvent(event: KeyLike): KeyCombo | null {
  if (MODIFIER_KEY_NAMES.has(event.key)) return null;
  const key = normalizeKey(event.key);
  if (key === null) return null;
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key,
  };
}

export function matchesShortcut(combo: KeyCombo, event: KeyLike): boolean {
  const pressed = comboFromEvent(event);
  if (pressed === null) return false;
  return (
    pressed.ctrl === combo.ctrl &&
    pressed.alt === combo.alt &&
    pressed.shift === combo.shift &&
    pressed.meta === combo.meta &&
    pressed.key === combo.key
  );
}
