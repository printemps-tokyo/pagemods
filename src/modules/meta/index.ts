// Page meta: what the page tells search engines and link previews (title,
// description, canonical, robots, hreflang, Open Graph, Twitter, structured
// data), with checks that cite their sources (see rules.ts).

import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { button, clear, copyText, h } from "../../content/ui.js";
import { readPageMeta } from "./content.js";
import { checkPage, isAbsoluteHttpUrl, ogValue, toMarkdown, type PageMeta } from "./rules.js";

export const META_ID = "meta";

/** The scan the panel shows; copies rescan and refresh it, so what is copied is what is shown. */
interface Scan {
  meta: PageMeta;
  at: string;
}

function scanNow(): Scan {
  return { meta: readPageMeta(), at: new Date().toLocaleString() };
}

async function copy(ctx: ModuleContext, format: "markdown" | "json", scan: Scan = scanNow()): Promise<void> {
  const text =
    format === "markdown"
      ? toMarkdown(scan.meta, scan.at)
      : JSON.stringify({ scannedAt: scan.at, ...scan.meta, issues: checkPage(scan.meta) }, null, 2) + "\n";
  try {
    await copyText(text);
    ctx.notify(`Copied the page meta as ${format === "markdown" ? "Markdown" : "JSON"}`, "ok");
  } catch (err) {
    ctx.notify(`Could not copy: ${(err as Error).message}`, "error");
  }
}

function table(head: [string, string], rows: [string, string][]): HTMLElement {
  return h(
    "table",
    { class: "pm-form-table" },
    h("thead", null, h("tr", null, h("th", null, head[0]), h("th", null, head[1]))),
    h(
      "tbody",
      null,
      ...rows.map(([k, v]) =>
        h("tr", { class: "pm-meta-row" }, h("td", { class: "pm-mono", style: "white-space:nowrap" }, k), h("td", null, v || "-")),
      ),
    ),
  );
}

function render(list: HTMLElement, scan: Scan): void {
  const meta = scan.meta;
  clear(list);
  list.appendChild(h("p", { class: "pm-note" }, `${meta.url} — scanned ${scan.at}`));
  const issues = checkPage(meta);
  list.appendChild(h("h3", null, `Issues (${issues.length})`));
  if (issues.length === 0) list.appendChild(h("p", { class: "pm-note" }, "None found."));
  for (const i of issues) {
    list.appendChild(
      h(
        "div",
        { class: `pm-meta-issue pm-meta-${i.severity}` },
        h("b", null, i.severity),
        " ",
        i.text.replace(/`/g, ""),
        i.subject !== undefined ? h("span", { class: "pm-mono" }, ` ${i.subject}`) : null,
      ),
    );
  }

  list.appendChild(h("h3", null, "Basics"));
  list.appendChild(
    table(
      ["item", "value"],
      [
        ["title", meta.title],
        ...meta.descriptions.map((d): [string, string] => ["description", d]),
        ...(meta.descriptions.length === 0 ? [["description", ""] as [string, string]] : []),
        ...meta.canonicals.map((c): [string, string] => ["canonical", c.href]),
        ...meta.robots.map((r): [string, string] => [r.name, r.content]),
        ["lang", meta.lang],
        ["charset", meta.charset],
        ["viewport", meta.viewport],
        ...meta.h1.map((t): [string, string] => ["h1", t]),
      ],
    ),
  );

  if (meta.alternates.length > 0) {
    list.appendChild(h("h3", null, `hreflang (${meta.alternates.length})`));
    list.appendChild(table(["hreflang", "url"], meta.alternates.map((a) => [a.hreflang, a.href])));
  }
  list.appendChild(h("h3", null, "Open Graph"));
  if (meta.openGraph.length > 0) list.appendChild(table(["property", "content"], meta.openGraph.map((o) => [o.property, o.content])));
  else list.appendChild(h("p", { class: "pm-note" }, "No og:* tags."));
  const image = ogValue(meta, "og:image");
  if (image && isAbsoluteHttpUrl(image)) list.appendChild(h("img", { class: "pm-meta-og", src: image, alt: "og:image", loading: "lazy" }));

  if (meta.twitter.length > 0) {
    list.appendChild(h("h3", null, "Twitter"));
    list.appendChild(table(["name", "content"], meta.twitter.map((t) => [t.name, t.content])));
  }
  list.appendChild(h("h3", null, "Structured data"));
  if (meta.jsonLd.length === 0 && meta.microdata.length === 0) {
    list.appendChild(h("p", { class: "pm-note" }, "No JSON-LD or microdata."));
  }
  meta.jsonLd.forEach((b, i) =>
    list.appendChild(
      h("div", { class: "pm-note" }, `JSON-LD ${i + 1}: `, b.error ? h("span", { class: "pm-meta-error" }, `does not parse (${b.error})`) : b.types.join(", ") || "(no @type)"),
    ),
  );
  if (meta.microdata.length > 0) list.appendChild(h("div", { class: "pm-note" }, `Microdata: ${meta.microdata.join(", ")}`));
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const list = h("div", { class: "pm-form-list" });
  let last = scanNow();
  const show = (scan: Scan) => {
    last = scan;
    render(list, scan);
  };
  // Copy rescans first and shows that scan, so the panel and the clipboard agree.
  const copyShown = (format: "markdown" | "json") => {
    const scan = scanNow();
    show(scan);
    void copy(ctx, format, scan);
  };
  root.appendChild(
    h(
      "div",
      { class: "pm-actions" },
      button("Rescan", () => show(scanNow())),
      button("Copy as Markdown", () => copyShown("markdown"), "primary"),
      button("Copy as JSON", () => copyShown("json")),
    ),
  );
  root.appendChild(
    h(
      "p",
      { class: "pm-note" },
      "Read from this document as it is now (after scripts ran). Single-page apps: press Rescan after navigating. HTTP headers such as X-Robots-Tag, iframes and shadow DOM are not read.",
    ),
  );
  root.appendChild(list);
  show(last);
}

export const metaModule: ContentModule = {
  id: META_ID,
  title: "Page meta",
  description:
    "Show what this page tells search engines and link previews: title, description, canonical, robots, hreflang, Open Graph, Twitter and structured data, with checks based on Google's and ogp.me's documentation.",
  actions: [{ id: "copy", label: "Copy page meta as Markdown", run: (ctx) => copy(ctx, "markdown") }],
  renderSettings,
};
