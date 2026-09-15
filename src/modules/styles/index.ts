// Site styles: hide elements and add CSS, per URL pattern.

import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, clear, confirmButton, debounce, h, row } from "../../content/ui.js";
import {
  applyStylesheet,
  countMatches,
  lastContextTarget,
  removeStylesheet,
  selectorFor,
  startPicker,
  stopPicker,
  watchContextMenu,
} from "./content.js";
import {
  DEFAULTS,
  buildStylesheet,
  matchingRules,
  normalizeStyles,
  ruleForUrl,
  ruleMatchesUrl,
  withSelector,
  type StyleRule,
  type StylesSettings,
} from "./rules.js";

export const STYLES_ID = "styles";

function current(ctx: ModuleContext): StylesSettings {
  return moduleSettings(ctx.settings(), STYLES_ID, normalizeStyles);
}

async function save(ctx: ModuleContext, update: (s: StylesSettings) => StylesSettings): Promise<void> {
  await ctx.store.updateModule(STYLES_ID, DEFAULTS, (raw) => update(normalizeStyles(raw)));
}

function apply(ctx: ModuleContext): void {
  const { css } = buildStylesheet(current(ctx).rules, location.href);
  applyStylesheet(css);
}

/** Add a selector to the rule for this page, making one when there is none. */
async function hideSelector(ctx: ModuleContext, selector: string): Promise<void> {
  let ruleName = "";
  await save(ctx, (s) => {
    const index = s.rules.findIndex((r) => r.enabled && ruleMatchesUrl(r, location.href));
    if (index === -1) {
      const rule = withSelector(ruleForUrl(location.href), selector);
      ruleName = rule.name;
      return { ...s, rules: [...s.rules, rule] };
    }
    const rules = s.rules.map((r, i) => (i === index ? withSelector(r, selector) : r));
    ruleName = rules[index]?.name ?? "";
    return { ...s, rules };
  });
  ctx.notify(`Hiding ${selector} on ${ruleName || "this site"}`);
}

function pick(ctx: ModuleContext): void {
  const wasOpen = true;
  ctx.closePanel();
  startPicker(
    (_el, selector) => {
      void hideSelector(ctx, selector).then(() => {
        if (wasOpen) ctx.openPanel(STYLES_ID);
      });
    },
    () => {
      if (wasOpen) ctx.openPanel(STYLES_ID);
    },
  );
}

async function hideContextTarget(ctx: ModuleContext): Promise<void> {
  const el = lastContextTarget();
  if (el === null) {
    ctx.notify("Right-click the element you want to hide, then choose the menu entry", "warn");
    return;
  }
  await hideSelector(ctx, selectorFor(el));
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = current(ctx);
  const here = matchingRules(settings.rules, location.href);

  root.appendChild(
    h(
      "p",
      { class: "pm-note" },
      `${settings.rules.length} rule(s), ${here.length} applying to this page. `,
      "Styles are injected when the page has loaded, so an element can flash before it is hidden.",
    ),
  );

  root.appendChild(
    h(
      "div",
      { class: "pm-actions" },
      button("Add rule for this page", () => {
        void save(ctx, (s) => ({ ...s, rules: [...s.rules, ruleForUrl(location.href)] }));
      }),
    ),
  );

  if (settings.rules.length === 0) {
    root.appendChild(
      h(
        "p",
        { class: "pm-note" },
        'Use "Pick an element to hide", or right-click anything on the page and choose "pagemods: hide this element".',
      ),
    );
  }
  for (const rule of settings.rules) {
    root.appendChild(renderRule(rule, ctx));
  }
}

function renderRule(rule: StyleRule, ctx: ModuleContext): HTMLElement {
  const matches = rule.enabled && ruleMatchesUrl(rule, location.href);
  const patch = (update: (r: StyleRule) => StyleRule) =>
    void save(ctx, (s) => ({ ...s, rules: s.rules.map((r) => (r.id === rule.id ? update(r) : r)) }));

  const enabled = h("input", {
    type: "checkbox",
    checked: rule.enabled,
    title: "Enabled",
    onchange: () => patch((r) => ({ ...r, enabled: enabled.checked })),
  });
  const name = h("input", {
    type: "text",
    value: rule.name,
    placeholder: "Rule name",
    onchange: () => patch((r) => ({ ...r, name: name.value })),
  });
  const url = h("input", {
    type: "text",
    class: "pm-mono",
    value: rule.url,
    placeholder: "^https://example\\.com",
    spellcheck: "false",
    onchange: () => patch((r) => ({ ...r, url: url.value })),
  });
  const urlError = h("div", { class: "pm-error" });
  try {
    if (rule.url.trim() !== "") new RegExp(rule.url);
  } catch (error) {
    urlError.textContent = `Invalid regular expression: ${(error as Error).message}`;
  }

  const hidden = h("div", { class: "pm-hide-list" });
  for (const [index, selector] of rule.hide.entries()) {
    hidden.appendChild(renderSelector(selector, index, rule, patch, matches));
  }

  const css = h("textarea", {
    class: "pm-mono",
    value: rule.css,
    placeholder: "body { font-family: system-ui; }",
    spellcheck: "false",
  });
  // Typing applies as you go: seeing the page change is the whole point.
  css.addEventListener(
    "input",
    debounce(() => patch((r) => ({ ...r, css: css.value })), 400),
  );

  return h(
    "div",
    { class: `pm-card${matches ? " pm-match" : ""}` },
    h(
      "div",
      { class: "pm-card-head" },
      enabled,
      name,
      h("span", { class: `pm-badge${matches ? "" : " pm-badge-muted"}` }, matches ? "applies here" : "other pages"),
    ),
    h("div", null, url, urlError),
    h("div", { class: "pm-env-tag", style: "margin-top:8px" }, "Hidden elements"),
    hidden,
    h(
      "div",
      { class: "pm-actions", style: "margin-top:6px" },
      button("Pick an element to hide", () => pick(ctx)),
      button("Add selector", () => patch((r) => ({ ...r, hide: [...r.hide, ""] }))),
    ),
    h("div", { class: "pm-env-tag" }, "CSS"),
    css,
    h(
      "div",
      { class: "pm-actions", style: "margin-top:8px" },
      confirmButton("Delete rule", "Really delete?", () =>
        void save(ctx, (s) => ({ ...s, rules: s.rules.filter((r) => r.id !== rule.id) })),
      ),
    ),
  );
}

function renderSelector(
  selector: string,
  index: number,
  rule: StyleRule,
  patch: (update: (r: StyleRule) => StyleRule) => void,
  applies: boolean,
): HTMLElement {
  const input = h("input", {
    type: "text",
    class: "pm-mono",
    value: selector,
    placeholder: ".ad-banner",
    spellcheck: "false",
  });
  const count = h("span", { class: "pm-note" });
  const recount = () => {
    const text = input.value.trim();
    if (!applies || text === "") {
      count.textContent = "";
      count.className = "pm-note";
      return;
    }
    const n = countMatches(text);
    if (n < 0) {
      count.textContent = "invalid selector";
      count.className = "pm-error";
      return;
    }
    // The elements are hidden, not removed, so they still count.
    count.textContent = n === 1 ? "1 element" : `${n} elements`;
    count.className = n === 0 ? "pm-error" : "pm-ok";
  };
  input.addEventListener("input", debounce(recount, 250));
  input.addEventListener("change", () =>
    patch((r) => ({ ...r, hide: r.hide.map((s, i) => (i === index ? input.value : s)) })),
  );
  recount();

  const remove = h(
    "button",
    {
      class: "pm-btn pm-btn-small",
      type: "button",
      title: "Stop hiding this",
      onclick: () => patch((r) => ({ ...r, hide: r.hide.filter((_, i) => i !== index) })),
    },
    "x",
  );
  return h("div", { class: "pm-env-line" }, input, count, remove);
}

export const stylesModule: ContentModule = {
  id: STYLES_ID,
  title: "Site styles",
  description:
    "Hide elements and add CSS per site. Pick an element on the page or right-click it, and it stays hidden on every visit.",
  actions: [{ id: "pick", label: "Pick an element to hide", run: (ctx) => pick(ctx) }],
  init(ctx) {
    apply(ctx);
    unwatch = watchContextMenu();
  },
  dispose() {
    stopPicker();
    removeStylesheet();
    unwatch?.();
    unwatch = undefined;
  },
  onSettingsChanged(ctx) {
    apply(ctx);
  },
  async onMessage(message, ctx) {
    switch (message.type) {
      case "styles:pick":
        pick(ctx);
        return { handled: true };
      case "styles:hide-target":
        await hideContextTarget(ctx);
        return { handled: true };
      default:
        return { handled: false };
    }
  },
  renderSettings,
};

let unwatch: (() => void) | undefined;
