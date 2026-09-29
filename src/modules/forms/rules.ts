// Form inspector: the pure part. content.ts reads the page into these shapes;
// everything decided about what to show, how to group it and how to copy it
// is decided here, so it can be tested without a DOM.

/** One form control as read from the page. */
export interface FieldInfo {
  /** input, textarea, select or button. */
  tag: string;
  /** The type attribute as the browser resolves it (text for a bare input, select-one, submit, ...). */
  type: string;
  id: string;
  name: string;
  /** Label text: <label>, aria-label, aria-labelledby, joined with " | ". */
  label: string;
  placeholder: string;
  autocomplete: string;
  value: string;
  checked: boolean;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** Not rendered: type=hidden, display:none, or inside a hidden ancestor. */
  hidden: boolean;
  /** Number of <option>s, for a select. */
  options: number;
}

/** A form and its controls. `index` is null for controls outside any form. */
export interface FormInfo {
  index: number | null;
  id: string;
  name: string;
  action: string;
  method: string;
  fields: FieldInfo[];
}

export interface FormsSettings {
  /** List hidden controls (type=hidden and controls that are not rendered). */
  includeHidden: boolean;
  /** List buttons (button elements and input type=submit/button/reset/image). */
  includeButtons: boolean;
  /** Show current values. Passwords are never shown. */
  showValues: boolean;
}

export const DEFAULTS: FormsSettings = {
  includeHidden: true,
  includeButtons: true,
  showValues: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeForms(raw: unknown): FormsSettings {
  const s = isRecord(raw) ? raw : {};
  return {
    includeHidden: s.includeHidden !== false,
    includeButtons: s.includeButtons !== false,
    showValues: s.showValues === true,
  };
}

const BUTTON_INPUT_TYPES = new Set(["submit", "button", "reset", "image"]);

export function isButton(field: FieldInfo): boolean {
  return field.tag === "button" || (field.tag === "input" && BUTTON_INPUT_TYPES.has(field.type));
}

/** Whether a field is listed under the current settings. */
export function isListed(field: FieldInfo, settings: FormsSettings): boolean {
  if (!settings.includeHidden && field.hidden) return false;
  if (!settings.includeButtons && isButton(field)) return false;
  return true;
}

/** Longest value shown before it is cut. */
export const MAX_VALUE_CHARS = 60;

/**
 * The value column. Passwords are never shown, only whether they are filled.
 * Checkboxes and radios show their checked state next to their value.
 */
export function displayValue(field: FieldInfo): string {
  if (field.type === "password") return field.value === "" ? "" : "(filled)";
  if (field.type === "checkbox" || field.type === "radio") {
    return `${field.checked ? "[x]" : "[ ]"} ${field.value}`.trimEnd();
  }
  const flat = field.value.replace(/\s+/g, " ");
  return flat.length > MAX_VALUE_CHARS ? flat.slice(0, MAX_VALUE_CHARS - 3) + "..." : flat;
}

/** The short flags a field carries: required, disabled, readonly, hidden, options. */
export function flags(field: FieldInfo): string[] {
  const out: string[] = [];
  if (field.required) out.push("required");
  if (field.disabled) out.push("disabled");
  if (field.readOnly) out.push("readonly");
  if (field.hidden) out.push("hidden");
  if (field.tag === "select") out.push(`${field.options} options`);
  return out;
}

/** The type column: the tag for textarea/select/button, the input type otherwise. */
export function typeLabel(field: FieldInfo): string {
  if (field.tag === "input") return field.type;
  if (field.tag === "select") return field.type === "select-multiple" ? "select[multiple]" : "select";
  if (field.tag === "button") return `button[${field.type}]`;
  return field.tag;
}

/** A heading for a form: its id or name when it has one, and where it posts. */
export function formTitle(form: FormInfo): string {
  if (form.index === null) return "Outside any form";
  const ident = form.id ? `#${form.id}` : form.name ? `name=${form.name}` : "";
  const target = form.action ? ` ${form.method.toUpperCase()} ${form.action}` : ` ${form.method.toUpperCase()}`;
  return `Form ${form.index + 1}${ident ? ` ${ident}` : ""} —${target}`;
}

/** Forms with their listed fields, dropping forms left with none (pure). */
export function visibleForms(forms: FormInfo[], settings: FormsSettings): FormInfo[] {
  return forms
    .map((f) => ({ ...f, fields: f.fields.filter((field) => isListed(field, settings)) }))
    .filter((f) => f.fields.length > 0);
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Markdown: one table per form. Values only when `showValues` is on. */
export function toMarkdown(forms: FormInfo[], settings: FormsSettings, pageUrl: string): string {
  const lines: string[] = [`# Forms on ${pageUrl}`, ""];
  const shown = visibleForms(forms, settings);
  if (shown.length === 0) {
    lines.push("No form controls on this page.");
    return lines.join("\n") + "\n";
  }
  for (const form of shown) {
    lines.push(`## ${cell(formTitle(form))}`, "");
    const head = ["#", "type", "id", "name", "label", "flags"];
    if (settings.showValues) head.push("value");
    lines.push(`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`);
    form.fields.forEach((field, i) => {
      const cols = [
        String(i + 1),
        typeLabel(field),
        field.id,
        field.name,
        field.label || field.placeholder,
        flags(field).join(", "),
      ];
      if (settings.showValues) cols.push(displayValue(field));
      lines.push(`| ${cols.map(cell).join(" | ")} |`);
    });
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

/** Tab-separated values with a header row, one line per field, for a spreadsheet. */
export function toTsv(forms: FormInfo[], settings: FormsSettings): string {
  const head = ["form", "type", "id", "name", "label", "placeholder", "autocomplete", "flags"];
  if (settings.showValues) head.push("value");
  const clean = (t: string) => t.replace(/[\t\r\n]+/g, " ").trim();
  const lines = [head.join("\t")];
  for (const form of visibleForms(forms, settings)) {
    for (const field of form.fields) {
      const cols = [
        form.index === null ? "(none)" : String(form.index + 1),
        typeLabel(field),
        field.id,
        field.name,
        field.label,
        field.placeholder,
        field.autocomplete,
        flags(field).join(", "),
      ];
      if (settings.showValues) cols.push(displayValue(field));
      lines.push(cols.map(clean).join("\t"));
    }
  }
  return lines.join("\n") + "\n";
}

/** "3 forms, 24 controls (5 hidden)". */
export function summarize(forms: FormInfo[], settings: FormsSettings): string {
  const all = forms.flatMap((f) => f.fields);
  const listed = visibleForms(forms, settings);
  const shownCount = listed.reduce((n, f) => n + f.fields.length, 0);
  const formCount = forms.filter((f) => f.index !== null).length;
  const hidden = all.filter((f) => f.hidden).length;
  const omitted = all.length - shownCount;
  return (
    `${formCount} form(s), ${all.length} control(s)` +
    (hidden > 0 ? `, ${hidden} hidden` : "") +
    (omitted > 0 ? `; ${omitted} not listed by the filters` : "")
  );
}
