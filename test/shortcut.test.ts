import { test } from "node:test";
import assert from "node:assert/strict";
import { comboFromEvent, formatShortcut, matchesShortcut, parseShortcut } from "../src/lib/shortcut.js";

function ev(key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) {
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
  };
}

test("parses the default shortcut and punctuation", () => {
  const c = parseShortcut("Ctrl+;");
  assert.deepEqual(c, { ctrl: true, alt: false, shift: false, meta: false, key: ";" });
  assert.equal(formatShortcut(c!), "Ctrl+;");
  assert.deepEqual(parseShortcut("ctrl+shift+p")?.key, "p");
  assert.equal(formatShortcut(parseShortcut("ctrl+shift+p")!), "Ctrl+Shift+P");
  assert.deepEqual(parseShortcut("Ctrl++")?.key, "+");
  assert.equal(parseShortcut("Alt+Space")?.key, " ");
  assert.equal(formatShortcut(parseShortcut("Alt+Space")!), "Alt+Space");
  assert.equal(parseShortcut("Cmd+Esc")?.key, "Escape");
  assert.equal(parseShortcut("F5")?.key, "F5");
});

test("rejects unusable text", () => {
  assert.equal(parseShortcut(""), null);
  assert.equal(parseShortcut("Ctrl+"), null);
  assert.equal(parseShortcut("Ctrl"), null);
  assert.equal(parseShortcut("Ctrl+Shift"), null);
  assert.equal(parseShortcut("Ctrl+Nope"), null);
  assert.equal(parseShortcut("A+B"), null);
});

test("matches keydown events by key and exact modifiers", () => {
  const c = parseShortcut("Ctrl+;")!;
  assert.ok(matchesShortcut(c, ev(";", { ctrl: true })));
  assert.ok(!matchesShortcut(c, ev(";", { ctrl: true, shift: true })));
  assert.ok(!matchesShortcut(c, ev(";")));
  assert.ok(!matchesShortcut(c, ev("Control", { ctrl: true })));
  const p = parseShortcut("Ctrl+Shift+P")!;
  assert.ok(matchesShortcut(p, ev("P", { ctrl: true, shift: true })));
  assert.ok(matchesShortcut(p, ev("p", { ctrl: true, shift: true })));
  assert.equal(comboFromEvent(ev("Shift", { shift: true })), null);
  assert.equal(comboFromEvent(ev("Dead")), null);
});
