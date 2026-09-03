import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureFields,
  checkboxState,
  mergeCapture,
  normalizeFormfill,
  planFill,
  selectOption,
  splitMultiple,
  urlPatternFor,
  type Control,
  type FillRule,
} from "../src/modules/formfill/rules.js";

function control(partial: Partial<Control>): Control {
  return {
    kind: "text",
    name: "",
    id: "",
    label: "",
    value: "",
    checked: false,
    options: [],
    selected: [],
    ...partial,
  };
}

const noCss = () => false;

const page: Control[] = [
  control({ name: "email", id: "email-input", value: "" }),
  control({ name: "user[name]", label: "Full name" }),
  control({ kind: "checkbox", name: "agree", value: "yes" }),
  control({ kind: "radio", name: "plan", value: "free" }),
  control({ kind: "radio", name: "plan", value: "pro" }),
  control({
    kind: "select",
    id: "country",
    options: [
      { value: "jp", text: "Japan" },
      { value: "us", text: "United States" },
    ],
  }),
  control({ kind: "password", name: "password" }),
  control({ kind: "other", name: "submit" }),
];

test("rules match by URL regex and fields by name/id/label", () => {
  const rules: FillRule[] = [
    {
      id: "r1",
      name: "signup",
      url: "^https://example\\.com/signup",
      enabled: true,
      fields: [
        { id: "f1", by: "auto", match: "^email$", value: "dev@printemps.tokyo", enabled: true },
        { id: "f2", by: "label", match: "Full name", value: "Printemps", enabled: true },
        { id: "f3", by: "name", match: "^agree$", value: "true", enabled: true },
        { id: "f4", by: "name", match: "^plan$", value: "pro", enabled: true },
        { id: "f5", by: "id", match: "^country$", value: "Japan", enabled: true },
        { id: "f6", by: "name", match: "^missing$", value: "x", enabled: true },
        { id: "f7", by: "name", match: "^password$", value: "off", enabled: false },
      ],
    },
    { id: "r2", name: "elsewhere", url: "^https://other\\.example/", enabled: true, fields: [] },
    { id: "r3", name: "broken", url: "(", enabled: true, fields: [] },
  ];
  const plan = planFill(rules, "https://example.com/signup?x=1", page, noCss);
  assert.deepEqual(
    plan.rules.map((r) => r.id),
    ["r1"],
  );
  const filled = plan.assignments.map((a) => [a.control.name || a.control.id, a.field.id, a.control.value]);
  assert.deepEqual(filled, [
    ["email", "f1", ""],
    ["user[name]", "f2", ""],
    ["agree", "f3", "yes"],
    ["plan", "f4", "pro"],
    ["country", "f5", ""],
  ]);
  assert.deepEqual(
    plan.unmatched.map((u) => u.field.id),
    ["f6"],
  );
});

test("later rules and fields override earlier ones for the same control", () => {
  const rules: FillRule[] = [
    {
      id: "a",
      name: "",
      url: ".",
      enabled: true,
      fields: [{ id: "x", by: "auto", match: ".", value: "broad", enabled: true }],
    },
    {
      id: "b",
      name: "",
      url: ".",
      enabled: true,
      fields: [{ id: "y", by: "name", match: "^email$", value: "specific", enabled: true }],
    },
    {
      id: "c",
      name: "",
      url: ".",
      enabled: false,
      fields: [{ id: "z", by: "name", match: "^email$", value: "disabled", enabled: true }],
    },
  ];
  const plan = planFill(rules, "https://x/", [control({ name: "email" })], noCss);
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0]?.field.value, "specific");
});

test("css matching goes through the matcher and swallows bad selectors", () => {
  const rules: FillRule[] = [
    {
      id: "a",
      name: "",
      url: ".",
      enabled: true,
      fields: [{ id: "x", by: "css", match: "input.magic", value: "v", enabled: true }],
    },
  ];
  const c = control({ name: "n" });
  const plan = planFill(rules, "https://x/", [c], (ctl, sel) => ctl === c && sel === "input.magic");
  assert.equal(plan.assignments.length, 1);
  const bad = planFill(rules, "https://x/", [c], () => {
    throw new Error("invalid selector");
  });
  assert.equal(bad.assignments.length, 0);
  assert.equal(bad.unmatched.length, 1);
});

test("checkbox, select and multiple value semantics", () => {
  const box = control({ kind: "checkbox", value: "newsletter" });
  assert.equal(checkboxState(box, "true"), true);
  assert.equal(checkboxState(box, "No"), false);
  assert.equal(checkboxState(box, "newsletter"), true);
  assert.equal(checkboxState(box, "other"), false);
  const sel = page[5] as Control;
  assert.equal(selectOption(sel, "us"), "us");
  assert.equal(selectOption(sel, " Japan "), "jp");
  assert.equal(selectOption(sel, "France"), null);
  assert.deepEqual(splitMultiple(" a | b ||c"), ["a", "b", "c"]);
});

test("capture builds anchored rules from what is on the page", () => {
  const filled: Control[] = [
    control({ name: "email", value: "dev@printemps.tokyo" }),
    control({ name: "note", value: "" }),
    control({ id: "only-id", value: "by id" }),
    control({ kind: "checkbox", name: "agree", value: "yes", checked: true }),
    control({ kind: "checkbox", name: "spam", value: "yes", checked: false }),
    control({ kind: "radio", name: "plan", value: "free", checked: false }),
    control({ kind: "radio", name: "plan", value: "pro", checked: true }),
    control({ kind: "password", name: "pw", value: "secret" }),
    control({ name: "q[a.b]", value: "x" }),
    control({ kind: "select-multiple", name: "tags", selected: ["a", "b"] }),
    control({ kind: "select-multiple", name: "none", selected: [] }),
  ];
  const fields = captureFields(filled, { includePasswords: false });
  assert.deepEqual(
    fields.map((f) => [f.by, f.match, f.value]),
    [
      ["name", "^email$", "dev@printemps.tokyo"],
      ["id", "^only-id$", "by id"],
      ["name", "^agree$", "true"],
      ["name", "^spam$", "false"],
      ["name", "^plan$", "pro"],
      ["name", "^q\\[a\\.b\\]$", "x"],
      ["name", "^tags$", "a|b"],
    ],
  );
  assert.ok(captureFields(filled, { includePasswords: true }).some((f) => f.match === "^pw$"));

  const url = urlPatternFor("https://example.com/signup?step=2#top");
  assert.equal(url, "^https://example\\.com/signup");
  assert.ok(new RegExp(url).test("https://example.com/signup?step=3"));

  const first = mergeCapture(undefined, url, "Sign up", fields);
  assert.equal(first.fields.length, 7);
  const again = mergeCapture(first, url, "Sign up", [
    { id: "n", by: "name", match: "^email$", value: "new@printemps.tokyo", enabled: true },
    { id: "m", by: "name", match: "^extra$", value: "1", enabled: true },
  ]);
  assert.equal(again.id, first.id);
  assert.equal(again.fields.length, 8);
  assert.equal(again.fields.find((f) => f.match === "^email$")?.value, "new@printemps.tokyo");
});

test("normalize tolerates junk", () => {
  const s = normalizeFormfill({
    rules: [{ name: 1, url: "x", fields: [{ by: "nope", match: 5 }, null] }, "junk"],
    capturePasswords: "yes",
  });
  assert.equal(s.capturePasswords, false);
  assert.equal(s.rules.length, 2);
  assert.equal(s.rules[0]?.url, "x");
  assert.equal(s.rules[0]?.fields[0]?.by, "auto");
  assert.equal(s.rules[0]?.fields[0]?.match, "");
  assert.equal(s.rules[0]?.fields.length, 2);
  assert.ok(s.rules[0]?.id);
});
