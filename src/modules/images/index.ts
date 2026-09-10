// Image grab: scan the page, download every image into one folder.

import type { DownloadResult } from "../../lib/messages.js";
import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, clear, h, row } from "../../content/ui.js";
import { collectImages } from "./content.js";
import {
  DEFAULTS,
  MAX_FILES,
  describeSkipped,
  normalizeImages,
  planDownloads,
  resolveFolder,
  type ImagesSettings,
  type Plan,
} from "./rules.js";

export const IMAGES_ID = "images";

function current(ctx: ModuleContext): ImagesSettings {
  return moduleSettings(ctx.settings(), IMAGES_ID, normalizeImages);
}

async function save(ctx: ModuleContext, update: (s: ImagesSettings) => ImagesSettings): Promise<void> {
  await ctx.store.updateModule(IMAGES_ID, DEFAULTS, (raw) => update(normalizeImages(raw)));
}

function planNow(ctx: ModuleContext): Plan {
  const settings = current(ctx);
  return planDownloads(collectImages(settings.includeBackgrounds), settings, location.href);
}

async function send(plan: Plan, urls?: Set<string>): Promise<DownloadResult> {
  const items = plan.downloads
    .filter((d) => urls === undefined || urls.has(d.url))
    .map((d) => ({ url: d.url, filename: d.filename }));
  const reply: unknown = await chrome.runtime.sendMessage({
    type: "images:download",
    request: { items },
  });
  if (typeof reply === "object" && reply !== null && "started" in reply) return reply as DownloadResult;
  return { started: 0, failed: items.length, errors: ["the extension did not answer"] };
}

async function downloadAll(ctx: ModuleContext, urls?: Set<string>): Promise<void> {
  const plan = planNow(ctx);
  const count = urls === undefined ? plan.downloads.length : urls.size;
  if (count === 0) {
    ctx.notify("No image on this page passed the filters", "warn");
    return;
  }
  ctx.notify(`Downloading ${count} image(s) into ${plan.folder || "the download folder"}...`);
  const result = await send(plan, urls);
  const detail = result.failed > 0 ? `, ${result.failed} failed (${result.errors.join("; ")})` : "";
  ctx.notify(
    `${result.started} image(s) sent to ${plan.folder || "the download folder"}${detail}`,
    result.failed > 0 ? "warn" : "ok",
  );
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = current(ctx);

  const folder = h("input", {
    type: "text",
    class: "pm-mono",
    value: settings.folder,
    placeholder: "pagemods/{host}",
    spellcheck: "false",
    onchange: () => void save(ctx, (s) => ({ ...s, folder: folder.value })),
  });
  const preview = h("div", { class: "pm-note" });
  const updatePreview = () => {
    const resolved = resolveFolder(folder.value, location.href);
    preview.textContent = `Files go to <downloads>/${resolved}/ side by side. {host} and {date} are filled in.`;
  };
  folder.addEventListener("input", updatePreview);
  updatePreview();
  root.appendChild(row("Folder", h("div", null, folder, preview), "Under the browser's download directory."));

  const minW = h("input", {
    type: "number",
    min: "0",
    step: "10",
    value: String(settings.minWidth),
    style: "max-width:90px",
    onchange: () => void save(ctx, (s) => ({ ...s, minWidth: Number(minW.value) })),
  });
  const minH = h("input", {
    type: "number",
    min: "0",
    step: "10",
    value: String(settings.minHeight),
    style: "max-width:90px",
    onchange: () => void save(ctx, (s) => ({ ...s, minHeight: Number(minH.value) })),
  });
  root.appendChild(
    row(
      "Minimum size",
      h("div", { class: "pm-env-line" }, minW, h("span", { class: "pm-note" }, "x"), minH, h("span", { class: "pm-note" }, "px")),
      "Skips icons and spacers. Images whose size is unknown are kept.",
    ),
  );

  const prefix = h("input", {
    type: "text",
    value: settings.prefix,
    placeholder: "optional file name prefix",
    onchange: () => void save(ctx, (s) => ({ ...s, prefix: prefix.value })),
  });
  root.appendChild(row("File prefix", prefix));

  const numbered = h("input", {
    type: "checkbox",
    checked: settings.numberFiles,
    onchange: () => void save(ctx, (s) => ({ ...s, numberFiles: numbered.checked })),
  });
  root.appendChild(
    h("label", { class: "pm-check" }, numbered, h("span", null, "Number the files (001-, 002-) to keep page order")),
  );
  const backgrounds = h("input", {
    type: "checkbox",
    checked: settings.includeBackgrounds,
    onchange: () => void save(ctx, (s) => ({ ...s, includeBackgrounds: backgrounds.checked })),
  });
  root.appendChild(
    h(
      "label",
      { class: "pm-check" },
      backgrounds,
      h("span", null, "Include CSS background images ", h("span", { class: "pm-note" }, "(slower scan; sizes are the element's, not the file's)")),
    ),
  );

  const list = h("div", { class: "pm-img-list" });
  const summary = h("div", { class: "pm-note" });
  const selected = new Set<string>();

  const scan = () => {
    const plan = planNow(ctx);
    selected.clear();
    for (const d of plan.downloads) selected.add(d.url);
    clear(list);
    const skippedText = describeSkipped(plan.skipped);
    summary.textContent = `${plan.downloads.length} image(s) ready${skippedText === "" ? "" : `; skipped ${skippedText}`}.`;
    for (const d of plan.downloads) {
      const box = h("input", {
        type: "checkbox",
        checked: true,
        onchange: () => {
          if (box.checked) selected.add(d.url);
          else selected.delete(d.url);
        },
      });
      const thumb = h("img", { class: "pm-img-thumb", src: d.url, alt: "", loading: "lazy" });
      const size = d.item.width > 0 ? `${d.item.width}x${d.item.height}` : "size unknown";
      list.appendChild(
        h(
          "label",
          { class: "pm-img-row" },
          box,
          thumb,
          h(
            "span",
            { class: "pm-img-meta" },
            h("span", { class: "pm-img-name" }, d.filename.split("/").pop() ?? d.filename),
            h("span", { class: "pm-note" }, `${size}${d.item.kind === "img" ? "" : ` (${d.item.kind})`}`),
          ),
        ),
      );
    }
    if (plan.downloads.length >= MAX_FILES) {
      list.appendChild(h("p", { class: "pm-note" }, `Only the first ${MAX_FILES} are listed.`));
    }
  };

  root.appendChild(
    h(
      "div",
      { class: "pm-actions", style: "margin-top:12px" },
      button("Scan this page", scan),
      button("Download selected", () => void downloadAll(ctx, new Set(selected)), "primary"),
    ),
  );
  root.appendChild(summary);
  root.appendChild(list);
  scan();
}

export const imagesModule: ContentModule = {
  id: IMAGES_ID,
  title: "Image grab",
  description:
    "Download every image on the page into one folder under the browser's download directory, flat, with size and type filters.",
  actions: [{ id: "download", label: "Download all images", run: (ctx) => downloadAll(ctx) }],
  async onMessage(message, ctx) {
    if (message.type !== "images:grab") return { handled: false };
    await downloadAll(ctx);
    return { handled: true };
  },
  renderSettings,
};
