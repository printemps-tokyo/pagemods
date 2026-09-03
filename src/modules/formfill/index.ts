// Form fill: rules per URL pattern, fields per name/id pattern.

import type { Message } from "../../lib/messages.js";
import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, clear, confirmButton, h } from "../../content/ui.js";
import { capturePage, fillPage, planPage } from "./content.js";
import {
  DEFAULTS,
  escapeRegex,
  newId,
  normalizeFormfill,
  ruleMatchesUrl,
  type FieldRule,
  type FillRule,
  type FormfillSettings,
  type MatchBy,
} from "./rules.js";

export const FORMFILL_ID = "formfill";

const MATCH_BY_LABELS: Record<MatchBy, string> = {
  auto: "name or id",
  name: "name",
  id: "id",
  label: "label",
  css: "CSS selector",
};

function current(ctx: ModuleContext): FormfillSettings {
  return moduleSettings(ctx.settings(), FORMFILL_ID, normalizeFormfill);
}

async function save(ctx: ModuleContext, update: (s: FormfillSettings) => FormfillSettings): Promise<void> {
  await ctx.store.updateModule(FORMFILL_ID, DEFAULTS, (raw) => update(normalizeFormfill(raw)));
}

function fillNow(ctx: ModuleContext): void {
  const result = fillPage(current(ctx));
  if (result.rulesMatched === 0) {
    ctx.notify("No rule matches this URL", "warn");
    return;
  }
  const extra: string[] = [];
  if (result.unmatched.length > 0) extra.push(`${result.unmatched.length} field(s) matched nothing`);
  if (result.skipped.length > 0) extra.push(`${result.skipped.length} skipped`);
  ctx.notify(
    `Filled ${result.filled} control(s) from ${result.rulesMatched} rule(s)${extra.length ? ` (${extra.join(", ")})` : ""}`,
    result.filled > 0 ? "ok" : "warn",
  );
}

async function captureNow(ctx: ModuleContext): Promise<void> {
  const settings = current(ctx);
  const result = capturePage(settings);
  if (result.captured === 0) {
    ctx.notify("Nothing to capture: no filled-in control with a name or id", "warn");
    return;
  }
  await save(ctx, (s) => {
    const rules = s.rules.filter((r) => r.id !== result.rule.id);
    return { ...s, rules: [...rules, result.rule] };
  });
  ctx.notify(`Captured ${result.captured} field(s) into ${result.created ? "a new rule" : "the existing rule"} "${result.rule.name}"`);
  ctx.openPanel(FORMFILL_ID);
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = current(ctx);
  const href = location.href;
  const matching = settings.rules.filter((r) => r.enabled && ruleMatchesUrl(r, href)).length;

  root.appendChild(
    h(
      "p",
      { class: "pm-note" },
      `${settings.rules.length} rule(s), ${matching} matching this page. `,
      "Patterns are JavaScript regular expressions, case-sensitive; ",
      h("code", null, "(?i:...)"),
      " makes a group case-insensitive.",
    ),
  );

  const passwords = h("input", {
    type: "checkbox",
    checked: settings.capturePasswords,
    onchange: () => void save(ctx, (s) => ({ ...s, capturePasswords: passwords.checked })),
  });
  root.appendChild(
    h("label", { class: "pm-check" }, passwords, h("span", null, "Capture password fields too ", h("span", { class: "pm-note" }, "(stored as plain text in this browser profile)"))),
  );

  root.appendChild(
    h(
      "div",
      { class: "pm-actions" },
      button("Add rule for this page", () => {
        const rule: FillRule = {
          id: newId(),
          name: document.title.trim() || location.hostname,
          url: "^" + escapeRegex(location.origin) + "/",
          enabled: true,
          fields: [{ id: newId(), by: "auto", match: "", value: "", enabled: true }],
        };
        void save(ctx, (s) => ({ ...s, rules: [...s.rules, rule] }));
      }),
    ),
  );

  if (settings.rules.length === 0) {
    root.appendChild(h("p", { class: "pm-note" }, 'Fill in a form on a page, then click "Capture this page" to turn it into a rule.'));
  }
  for (const rule of settings.rules) {
    root.appendChild(renderRule(rule, ctx, href));
  }
}

function renderRule(rule: FillRule, ctx: ModuleContext, href: string): HTMLElement {
  const matches = rule.enabled && ruleMatchesUrl(rule, href);
  const patch = (update: (r: FillRule) => FillRule) =>
    void save(ctx, (s) => ({ ...s, rules: s.rules.map((r) => (r.id === rule.id ? update(r) : r)) }));

  const enabled = h("input", { type: "checkbox", checked: rule.enabled, title: "Enabled", onchange: () => patch((r) => ({ ...r, enabled: enabled.checked })) });
  const name = h("input", { type: "text", value: rule.name, placeholder: "Rule name", onchange: () => patch((r) => ({ ...r, name: name.value })) });
  const url = h("input", { type: "text", class: "pm-mono", value: rule.url, placeholder: "^https://example\\.com/signup", spellcheck: "false", onchange: () => patch((r) => ({ ...r, url: url.value })) });
  const urlError = h("div", { class: "pm-error" });
  try {
    if (rule.url.trim() !== "") new RegExp(rule.url);
  } catch (error) {
    urlError.textContent = `Invalid regular expression: ${(error as Error).message}`;
  }

  const testOut = h("div", { class: "pm-note" });
  const testBtn = button("Test on this page", () => {
    const plan = planPage({ rules: [{ ...rule, enabled: true }], capturePasswords: false }, href);
    clear(testOut);
    if (plan.rules.length === 0) {
      testOut.appendChild(h("span", { class: "pm-error" }, "The URL pattern does not match this page."));
      return;
    }
    const counts = new Map<string, number>();
    for (const a of plan.assignments) counts.set(a.field.id, (counts.get(a.field.id) ?? 0) + 1);
    const lines = rule.fields
      .filter((f) => f.enabled)
      .map((f) => `${f.match || "(empty)"}: ${counts.get(f.id) ?? 0} control(s)`);
    testOut.appendChild(h("span", { class: plan.assignments.length > 0 ? "pm-ok" : "pm-error" }, lines.join("; ") || "No fields."));
  });

  const table = h(
    "table",
    { class: "pm-fields" },
    h("tr", null, h("th", null, "On"), h("th", null, "By"), h("th", null, "Pattern"), h("th", null, "Value"), h("th", null, "")),
    ...rule.fields.map((field) => renderField(field, patch)),
  );

  const card = h(
    "div",
    { class: `pm-card${matches ? " pm-match" : ""}` },
    h(
      "div",
      { class: "pm-card-head" },
      enabled,
      name,
      h("span", { class: `pm-badge${matches ? "" : " pm-badge-muted"}` }, matches ? "matches this page" : "no match"),
    ),
    h("div", null, url, urlError),
    table,
    h(
      "div",
      { class: "pm-actions", style: "margin-top:8px" },
      button("Add field", () => patch((r) => ({ ...r, fields: [...r.fields, { id: newId(), by: "auto", match: "", value: "", enabled: true }] }))),
      testBtn,
      confirmButton("Delete rule", "Really delete?", () => void save(ctx, (s) => ({ ...s, rules: s.rules.filter((r) => r.id !== rule.id) }))),
    ),
    testOut,
  );
  return card;
}

function renderField(field: FieldRule, patch: (update: (r: FillRule) => FillRule) => void): HTMLElement {
  const patchField = (update: (f: FieldRule) => FieldRule) =>
    patch((r) => ({ ...r, fields: r.fields.map((f) => (f.id === field.id ? update(f) : f)) }));
  const on = h("input", { type: "checkbox", checked: field.enabled, onchange: () => patchField((f) => ({ ...f, enabled: on.checked })) });
  const by = h(
    "select",
    { onchange: () => patchField((f) => ({ ...f, by: by.value as MatchBy })) },
    ...(Object.keys(MATCH_BY_LABELS) as MatchBy[]).map((key) => h("option", { value: key, selected: key === field.by }, MATCH_BY_LABELS[key])),
  );
  const match = h("input", { type: "text", class: "pm-mono", value: field.match, placeholder: field.by === "css" ? "input.email" : "^email$", spellcheck: "false", onchange: () => patchField((f) => ({ ...f, match: match.value })) });
  const value = h("input", { type: "text", value: field.value, placeholder: "value", onchange: () => patchField((f) => ({ ...f, value: value.value })) });
  const del = h("button", { class: "pm-btn pm-btn-small", type: "button", title: "Remove field", onclick: () => patch((r) => ({ ...r, fields: r.fields.filter((f) => f.id !== field.id) })) }, "x");
  return h("tr", null, h("td", null, on), h("td", null, by), h("td", null, match), h("td", null, value), h("td", null, del));
}

export const formfillModule: ContentModule = {
  id: FORMFILL_ID,
  title: "Form fill",
  description:
    "Fill forms from rules: a URL pattern picks the rule, a name/id pattern picks the field, the value goes in. Capture turns what you typed into a rule.",
  actions: [
    { id: "fill", label: "Fill now", run: (ctx) => fillNow(ctx) },
    { id: "capture", label: "Capture this page", run: (ctx) => captureNow(ctx) },
  ],
  async onMessage(message: Message, ctx: ModuleContext) {
    switch (message.type) {
      case "formfill:fill":
        fillNow(ctx);
        return { handled: true };
      case "formfill:capture":
        await captureNow(ctx);
        return { handled: true };
      default:
        return { handled: false };
    }
  },
  renderSettings,
};
