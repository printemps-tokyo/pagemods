import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  displayValue,
  flags,
  formTitle,
  isButton,
  normalizeForms,
  summarize,
  toMarkdown,
  toTsv,
  typeLabel,
  visibleForms,
  type FieldInfo,
  type FormInfo,
} from "../src/modules/forms/rules.js";

function field(extra: Partial<FieldInfo>): FieldInfo {
  return {
    tag: "input",
    type: "text",
    id: "",
    name: "",
    label: "",
    placeholder: "",
    autocomplete: "",
    value: "",
    checked: false,
    required: false,
    disabled: false,
    readOnly: false,
    hidden: false,
    options: 0,
    ...extra,
  };
}

const login: FormInfo = {
  index: 0,
  id: "login",
  name: "",
  action: "/session",
  method: "post",
  fields: [
    field({ type: "email", id: "email", name: "user[email]", label: "Email", required: true, value: "a@example.com" }),
    field({ type: "password", id: "pw", name: "user[password]", label: "Password", value: "secret" }),
    field({ type: "hidden", name: "authenticity_token", value: "tok", hidden: true }),
    field({ type: "checkbox", name: "remember", label: "Remember me", value: "1", checked: true }),
    field({ tag: "button", type: "submit", label: "" }),
  ],
};
const loose: FormInfo = {
  index: null,
  id: "",
  name: "",
  action: "",
  method: "",
  fields: [field({ tag: "select", type: "select-one", name: "lang", options: 3, label: "Language | lang" })],
};

test("normalizeForms defaults and keeps booleans", () => {
  assert.deepEqual(normalizeForms(undefined), DEFAULTS);
  assert.deepEqual(normalizeForms({ includeHidden: false, includeButtons: false, showValues: true }), {
    includeHidden: false,
    includeButtons: false,
    showValues: true,
  });
});

test("type labels, buttons and flags", () => {
  assert.equal(typeLabel(field({ type: "email" })), "email");
  assert.equal(typeLabel(field({ tag: "select", type: "select-multiple" })), "select[multiple]");
  assert.equal(typeLabel(field({ tag: "button", type: "submit" })), "button[submit]");
  assert.equal(typeLabel(field({ tag: "textarea", type: "textarea" })), "textarea");
  assert.equal(isButton(field({ type: "submit" })), true);
  assert.equal(isButton(field({ tag: "button", type: "button" })), true);
  assert.equal(isButton(field({ type: "text" })), false);
  assert.deepEqual(flags(field({ required: true, readOnly: true, hidden: true })), ["required", "readonly", "hidden"]);
  assert.deepEqual(flags(loose.fields[0]!), ["3 options"]);
});

test("values never show a password and mark checkboxes", () => {
  assert.equal(displayValue(field({ type: "password", value: "secret" })), "(filled)");
  assert.equal(displayValue(field({ type: "password", value: "" })), "");
  assert.equal(displayValue(field({ type: "checkbox", value: "1", checked: true })), "[x] 1");
  assert.equal(displayValue(field({ type: "radio", value: "a" })), "[ ] a");
  assert.equal(displayValue(field({ value: "x".repeat(100) })).length, 60);
});

test("form titles", () => {
  assert.equal(formTitle(login), "Form 1 #login — POST /session");
  assert.equal(formTitle({ ...login, id: "", name: "search", action: "", method: "get" }), "Form 1 name=search — GET");
  assert.equal(formTitle(loose), "Outside any form");
});

test("filters drop hidden controls and buttons, and empty forms", () => {
  const settings = { includeHidden: false, includeButtons: false, showValues: false };
  const shown = visibleForms([login, loose], settings);
  assert.deepEqual(
    shown[0]!.fields.map((f) => f.name),
    ["user[email]", "user[password]", "remember"],
  );
  const onlyHidden: FormInfo = { ...login, fields: [login.fields[2]!] };
  assert.deepEqual(visibleForms([onlyHidden], settings), []);
  assert.equal(summarize([login, loose], settings), "1 form(s), 6 control(s), 1 hidden; 2 not listed by the filters");
});

test("markdown lists every form, escapes pipes, and hides values by default", () => {
  const md = toMarkdown([login, loose], DEFAULTS, "https://example.com/login");
  assert.match(md, /^# Forms on https:\/\/example.com\/login\n/);
  assert.match(md, /## Form 1 #login — POST \/session/);
  assert.match(md, /\| # \| type \| id \| name \| label \| flags \|\n/);
  assert.match(md, /\| 1 \| email \| email \| user\[email\] \| Email \| required \|/);
  assert.match(md, /## Outside any form/);
  assert.match(md, /\| 1 \| select \|  \| lang \| Language \\\| lang \| 3 options \|/);
  assert.doesNotMatch(md, /a@example.com/);
  assert.doesNotMatch(md, /secret/);
});

test("markdown and tsv include values only when asked, never the password", () => {
  const settings = { ...DEFAULTS, showValues: true };
  const md = toMarkdown([login], settings, "u");
  assert.match(md, /\| value \|/);
  assert.match(md, /a@example.com/);
  assert.match(md, /\(filled\)/);
  assert.doesNotMatch(md, /secret/);
  const tsv = toTsv([login, loose], settings).split("\n");
  assert.equal(tsv[0], "form\ttype\tid\tname\tlabel\tplaceholder\tautocomplete\tflags\tvalue");
  assert.equal(tsv[1], "1\temail\temail\tuser[email]\tEmail\t\t\trequired\ta@example.com");
  assert.ok(tsv.some((line) => line.startsWith("(none)\tselect\t\tlang")));
  assert.ok(!tsv.join("\n").includes("secret"));
});

test("no controls says so", () => {
  assert.match(toMarkdown([], DEFAULTS, "u"), /No form controls on this page./);
  assert.equal(toTsv([], DEFAULTS), "form\ttype\tid\tname\tlabel\tplaceholder\tautocomplete\tflags\n");
});
