import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSettingsStore,
  exportSettings,
  importSettings,
  memoryArea,
  normalize,
  STORAGE_KEY,
} from "../src/lib/settings.js";

test("normalize fills defaults and drops junk", () => {
  const s = normalize(undefined);
  assert.equal(s.core.shortcut, "Ctrl+;");
  assert.equal(s.core.panelSide, "right");
  assert.deepEqual(s.core.disabledModules, []);
  assert.deepEqual(s.modules, {});

  const t = normalize({
    core: { shortcut: "  Alt+K ", panelSide: "bogus", disabledModules: ["a", 3, null] },
    modules: { formfill: { rules: [] } },
    extra: true,
  });
  assert.equal(t.core.shortcut, "Alt+K");
  assert.equal(t.core.panelSide, "right");
  assert.deepEqual(t.core.disabledModules, ["a"]);
  assert.equal(normalize({ core: { panelSide: "bottom" } }).core.panelSide, "bottom");
  assert.equal(normalize({ core: { panelSide: "left" } }).core.panelSide, "left");
  assert.deepEqual(t.modules, { formfill: { rules: [] } });
});

test("store round-trips through the area and updates one namespace", async () => {
  const area = memoryArea();
  const store = createSettingsStore(area);
  const before = await store.load();
  assert.equal(before.core.shortcut, "Ctrl+;");

  const next = await store.updateModule("demo", { n: 0 }, (cur) => ({ n: cur.n + 1 }));
  assert.deepEqual(next, { n: 1 });
  const again = await store.updateModule("demo", { n: 0 }, (cur) => ({ n: cur.n + 1 }));
  assert.deepEqual(again, { n: 2 });

  await store.updateCore((core) => ({ ...core, shortcut: "Ctrl+Shift+P", panelSide: "left" }));
  const stored = (await area.get(STORAGE_KEY))[STORAGE_KEY] as { core: { shortcut: string; panelSide: string } };
  assert.equal(stored.core.shortcut, "Ctrl+Shift+P");
  assert.equal(stored.core.panelSide, "left");
  const loaded = await store.load();
  assert.deepEqual(loaded.modules.demo, { n: 2 });
});

test("concurrent updates are serialized, none is lost", async () => {
  const store = createSettingsStore(memoryArea());
  await Promise.all([
    store.updateModule("a", { n: 0 }, (cur) => ({ n: cur.n + 1 })),
    store.updateModule("b", { n: 0 }, (cur) => ({ n: cur.n + 10 })),
    store.updateCore((core) => ({ ...core, panelSide: "left" })),
    store.updateModule("a", { n: 0 }, (cur) => ({ n: cur.n + 1 })),
  ]);
  const s = await store.load();
  assert.deepEqual(s.modules.a, { n: 2 });
  assert.deepEqual(s.modules.b, { n: 10 });
  assert.equal(s.core.panelSide, "left");
});

test("import rejects non-documents and accepts exports", () => {
  assert.ok("error" in importSettings("{"));
  assert.ok("error" in importSettings("[]"));
  assert.ok("error" in importSettings('{"hello":1}'));
  const doc = normalize({ modules: { x: { a: 1 } } });
  const round = importSettings(exportSettings(doc));
  assert.ok("settings" in round);
  assert.deepEqual(round.settings.modules, { x: { a: 1 } });
});
