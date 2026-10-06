// Form inspector: list every form control on the page with its type, id and
// name, grouped by form, and copy the list as Markdown or TSV.

import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, clear, copyText, h } from "../../content/ui.js";
import { pointAt, scanForms } from "./content.js";
import {
  DEFAULTS,
  displayValue,
  flags,
  formTitle,
  normalizeForms,
  summarize,
  toMarkdown,
  toTsv,
  typeLabel,
  visibleForms,
  type FormsSettings,
} from "./rules.js";

export const FORMS_ID = "forms";

function current(ctx: ModuleContext): FormsSettings {
  return moduleSettings(ctx.settings(), FORMS_ID, normalizeForms);
}

async function save(ctx: ModuleContext, update: (s: FormsSettings) => FormsSettings): Promise<void> {
  await ctx.store.updateModule(FORMS_ID, DEFAULTS, (raw) => update(normalizeForms(raw)));
}

async function copy(ctx: ModuleContext, format: "markdown" | "tsv"): Promise<void> {
  const settings = current(ctx);
  const { forms } = scanForms();
  const text = format === "markdown" ? toMarkdown(forms, settings, location.href) : toTsv(forms, settings);
  try {
    // The list is read from this page, so the page-DOM fallback leaks nothing new.
    await copyText(text, { pageFallback: true });
    ctx.notify(`Copied the form list as ${format === "markdown" ? "Markdown" : "TSV"}`, "ok");
  } catch (err) {
    ctx.notify(`Could not copy: ${(err as Error).message}`, "error");
  }
}

function checkbox(label: string, checked: boolean, onchange: (value: boolean) => void): HTMLElement {
  const box = h("input", { type: "checkbox", checked, onchange: () => onchange(box.checked) });
  return h("label", { class: "pm-check" }, box, h("span", null, label));
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = current(ctx);

  root.appendChild(
    checkbox("Include hidden controls (type=hidden and controls not rendered)", settings.includeHidden, (v) =>
      void save(ctx, (s) => ({ ...s, includeHidden: v })),
    ),
  );
  root.appendChild(
    checkbox("Include buttons (submit, reset, button)", settings.includeButtons, (v) =>
      void save(ctx, (s) => ({ ...s, includeButtons: v })),
    ),
  );
  root.appendChild(
    checkbox("Show current values (passwords are never shown)", settings.showValues, (v) =>
      void save(ctx, (s) => ({ ...s, showValues: v })),
    ),
  );

  const summary = h("div", { class: "pm-note" });
  const list = h("div", { class: "pm-form-list" });

  const scan = () => {
    const { forms, elements } = scanForms();
    clear(list);
    summary.textContent = `${summarize(forms, settings)}. Click a row to show the control on the page.`;
    const shown = visibleForms(forms, settings);
    if (shown.length === 0) {
      list.appendChild(h("p", { class: "pm-note" }, "No form controls to list on this page."));
      return;
    }
    for (const form of shown) {
      list.appendChild(h("h3", null, formTitle(form)));
      const head = ["#", "type", "id", "name", "label", "flags"];
      if (settings.showValues) head.push("value");
      const tbody = h("tbody");
      form.fields.forEach((field, i) => {
        const cells = [
          String(i + 1),
          typeLabel(field),
          field.id,
          field.name,
          field.label || (field.placeholder ? `(${field.placeholder})` : ""),
          flags(field).join(", "),
        ];
        if (settings.showValues) cells.push(displayValue(field));
        const tr = h(
          "tr",
          {
            class: field.hidden ? "pm-form-hidden" : "",
            title: field.autocomplete ? `autocomplete=${field.autocomplete}` : null,
            onclick: () => {
              const el = elements.get(field);
              if (!el || !pointAt(el)) ctx.notify("That control is not rendered on the page", "warn");
            },
          },
          ...cells.map((text, col) => h("td", { class: col >= 1 && col <= 3 ? "pm-mono" : "" }, text)),
        );
        tbody.appendChild(tr);
      });
      list.appendChild(
        h(
          "table",
          { class: "pm-form-table" },
          h("thead", null, h("tr", null, ...head.map((t) => h("th", null, t)))),
          tbody,
        ),
      );
    }
  };

  root.appendChild(
    h(
      "div",
      { class: "pm-actions", style: "margin-top:12px" },
      button("Rescan", scan),
      button("Copy as Markdown", () => void copy(ctx, "markdown"), "primary"),
      button("Copy as TSV", () => void copy(ctx, "tsv")),
    ),
  );
  root.appendChild(summary);
  root.appendChild(list);
  scan();
}

export const formsModule: ContentModule = {
  id: FORMS_ID,
  title: "Form inspector",
  description:
    "List every form control on this page with its type, id, name and label, grouped by form, and copy the list as Markdown or TSV.",
  actions: [{ id: "copy", label: "Copy form list as Markdown", run: (ctx) => copy(ctx, "markdown") }],
  renderSettings,
};
