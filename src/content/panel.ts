// The settings panel that opens inside the page.
//
// It lives in a shadow root on a fixed-position host, so the page's CSS
// cannot restyle it and ours cannot leak out. One tab per enabled module,
// plus "General" for the panel's own settings, module switches and
// export/import. A tab is rendered from the current settings every time it
// is shown or the settings change; module UIs are therefore stateless
// functions of the settings document.

import type { ContentModule, ModuleContext, NoticeKind } from "../lib/registry.js";
import type { Settings } from "../lib/settings.js";
import { exportSettings, importSettings, normalize } from "../lib/settings.js";
import { comboFromEvent, formatShortcut, parseShortcut } from "../lib/shortcut.js";
import { button, clear, confirmButton, h, row } from "./ui.js";

export interface PanelHost {
  open(moduleId?: string): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  notify(text: string, kind?: NoticeKind): void;
  refresh(): void;
  /** The shadow root, for tests and for modules that need to focus something. */
  root: ShadowRoot;
}

export interface PanelOptions {
  allModules: ContentModule[];
  enabledModules(): ContentModule[];
  settings(): Settings;
  ctx(): ModuleContext;
  version: string;
}

const GENERAL = "general";

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.pm-drawer {
  position: fixed; top: 0; bottom: 0; width: min(460px, 100vw);
  background: #ffffff; color: #1f2937; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 12px 40px rgba(0,0,0,.25);
  display: flex; flex-direction: column; z-index: 2147483647;
}
.pm-drawer.pm-right { right: 0; }
.pm-drawer.pm-left { left: 0; }
.pm-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; }
.pm-title { font-weight: 700; font-size: 14px; }
.pm-version { color: #6b7280; font-size: 11px; }
.pm-spacer { flex: 1; }
.pm-tabs { display: flex; gap: 2px; padding: 6px 10px 0; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
.pm-tab { border: 0; background: none; padding: 8px 10px; cursor: pointer; font: inherit; color: #374151; border-bottom: 2px solid transparent; white-space: nowrap; }
.pm-tab:hover { color: #111827; }
.pm-tab.pm-active { color: #4f46e5; border-bottom-color: #4f46e5; font-weight: 600; }
.pm-body { flex: 1; overflow: auto; padding: 12px 14px 24px; }
.pm-desc { color: #6b7280; margin: 0 0 12px; }
.pm-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.pm-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; align-items: start; margin: 8px 0; }
.pm-row-label { font-weight: 600; padding-top: 5px; }
.pm-hint { font-weight: 400; color: #6b7280; font-size: 11px; }
.pm-row-control { min-width: 0; }
input[type=text], input[type=number], input[type=url], select, textarea {
  width: 100%; font: inherit; padding: 5px 7px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: inherit;
}
input[type=text]:focus, input[type=number]:focus, select:focus, textarea:focus { outline: 2px solid #c7d2fe; border-color: #6366f1; }
textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.pm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.pm-btn { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #d1d5db; background: #f9fafb; color: #111827; cursor: pointer; }
.pm-btn:hover { background: #f3f4f6; }
.pm-btn-primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.pm-btn-primary:hover { background: #4338ca; }
.pm-btn-danger { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.pm-btn-small { padding: 2px 7px; font-size: 12px; }
.pm-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin: 10px 0; background: #fafafa; }
.pm-card.pm-match { border-color: #a5b4fc; background: #eef2ff; }
.pm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pm-card-head input[type=text] { flex: 1; }
.pm-badge { font-size: 11px; padding: 1px 6px; border-radius: 999px; background: #e0e7ff; color: #3730a3; white-space: nowrap; }
.pm-badge-muted { background: #f3f4f6; color: #6b7280; }
.pm-fields { width: 100%; border-collapse: collapse; margin-top: 6px; }
.pm-fields th { text-align: left; font-weight: 600; font-size: 11px; color: #6b7280; padding: 2px 4px; }
.pm-fields td { padding: 2px 4px; vertical-align: top; }
.pm-fields input[type=text], .pm-fields select { padding: 3px 5px; }
.pm-check { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.pm-note { font-size: 12px; color: #6b7280; }
.pm-error { color: #b91c1c; font-size: 12px; }
.pm-ok { color: #047857; font-size: 12px; }
.pm-toast { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 8px 12px; border-radius: 8px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.2); display: none; }
.pm-toast.pm-show { display: block; }
.pm-toast-ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.pm-toast-warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.pm-toast-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
h3 { font-size: 13px; margin: 16px 0 6px; }
kbd { font: 11px ui-monospace, monospace; padding: 1px 5px; border: 1px solid #d1d5db; border-bottom-width: 2px; border-radius: 4px; background: #f9fafb; }
`;

export function createPanel(opts: PanelOptions): PanelHost {
  const host = document.createElement("div");
  host.id = "pagemods-host";
  // Closed: the panel lists rules for every site, so a page's own scripts
  // must not be able to walk into it through host.shadowRoot. The content
  // script keeps the only reference (see the isolated-world hook below).
  const root = host.attachShadow({ mode: "closed" });
  root.appendChild(h("style", null, CSS));

  const body = h("div", { class: "pm-body" });
  const tabs = h("div", { class: "pm-tabs" });
  const toast = h("div", { class: "pm-toast" });
  const drawer = h(
    "div",
    { class: "pm-drawer pm-right", role: "dialog", "aria-label": "pagemods settings" },
    h(
      "div",
      { class: "pm-header" },
      h("span", { class: "pm-title" }, "pagemods"),
      h("span", { class: "pm-version" }, `v${opts.version}`),
      h("span", { class: "pm-spacer" }),
      button("Close", () => close()),
    ),
    tabs,
    body,
    toast,
  );
  root.appendChild(drawer);

  let mounted = false;
  let current = GENERAL;
  let toastTimer: number | undefined;
  // The shortcut recorder's listener, so a second click or a re-render
  // replaces it instead of stacking listeners that keep preventDefault-ing.
  let recorder: ((event: KeyboardEvent) => void) | undefined;

  function stopRecorder(): void {
    if (recorder) window.removeEventListener("keydown", recorder, true);
    recorder = undefined;
  }

  function mount(): void {
    if (mounted) return;
    (document.body ?? document.documentElement).appendChild(host);
    mounted = true;
  }

  function isOpen(): boolean {
    return mounted && host.isConnected;
  }

  function open(moduleId?: string): void {
    if (moduleId !== undefined) current = moduleId;
    mount();
    if (!host.isConnected) (document.body ?? document.documentElement).appendChild(host);
    render();
  }

  function close(): void {
    stopRecorder();
    if (host.isConnected) host.remove();
  }

  function toggle(): void {
    if (isOpen()) close();
    else open();
  }

  function notify(text: string, kind: NoticeKind = "ok"): void {
    if (!isOpen()) {
      const log = kind === "error" ? console.error : kind === "warn" ? console.warn : console.info;
      log(`pagemods: ${text}`);
      return;
    }
    toast.textContent = text;
    toast.className = `pm-toast pm-show pm-toast-${kind}`;
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("pm-show"), kind === "error" ? 6000 : 3000);
  }

  function render(): void {
    stopRecorder();
    const settings = opts.settings();
    drawer.classList.toggle("pm-right", settings.core.panelSide === "right");
    drawer.classList.toggle("pm-left", settings.core.panelSide === "left");
    const modules = opts.enabledModules();
    if (current !== GENERAL && !modules.some((m) => m.id === current)) current = GENERAL;

    clear(tabs);
    const entries: { id: string; title: string }[] = [{ id: GENERAL, title: "General" }, ...modules];
    for (const entry of entries) {
      tabs.appendChild(
        h(
          "button",
          {
            class: `pm-tab${entry.id === current ? " pm-active" : ""}`,
            type: "button",
            onclick: () => {
              current = entry.id;
              render();
            },
          },
          entry.title,
        ),
      );
    }

    clear(body);
    if (current === GENERAL) {
      renderGeneral(body, settings);
      return;
    }
    const module = modules.find((m) => m.id === current);
    if (!module) return;
    body.appendChild(h("p", { class: "pm-desc" }, module.description));
    if (module.actions && module.actions.length > 0) {
      body.appendChild(
        h(
          "div",
          { class: "pm-actions" },
          ...module.actions.map((action) =>
            button(
              action.label,
              () => {
                void Promise.resolve(action.run(opts.ctx())).catch((error: unknown) => {
                  notify(`${action.label}: ${String(error)}`, "error");
                });
              },
              "primary",
            ),
          ),
        ),
      );
    }
    const container = h("div");
    body.appendChild(container);
    void Promise.resolve(module.renderSettings(container, opts.ctx())).catch((error: unknown) => {
      container.appendChild(h("p", { class: "pm-error" }, `This module failed to render: ${String(error)}`));
    });
  }

  function renderGeneral(container: HTMLElement, settings: Settings): void {
    const ctx = opts.ctx();

    // Shortcut recorder.
    const shortcutInput = h("input", { type: "text", class: "pm-mono", value: settings.core.shortcut, spellcheck: "false" });
    const shortcutStatus = h("span", { class: "pm-note" });
    const recordBtn = button("Record", () => {
      stopRecorder();
      shortcutStatus.textContent = "Press the key combination now (Esc to cancel).";
      shortcutStatus.className = "pm-note";
      recorder = (event: KeyboardEvent) => {
        if (!event.isTrusted) return;
        event.preventDefault();
        event.stopPropagation();
        const combo = comboFromEvent(event);
        if (combo === null) return;
        stopRecorder();
        if (combo.key === "Escape" && !combo.ctrl && !combo.alt && !combo.meta && !combo.shift) {
          shortcutStatus.textContent = "Cancelled.";
          return;
        }
        shortcutInput.value = formatShortcut(combo);
        shortcutStatus.textContent = "Recorded. Click Save to keep it.";
      };
      window.addEventListener("keydown", recorder, true);
    });
    const saveShortcut = button(
      "Save",
      () => {
        const combo = parseShortcut(shortcutInput.value);
        if (combo === null) {
          shortcutStatus.textContent = "Not a usable shortcut. Example: Ctrl+; or Alt+Shift+K";
          shortcutStatus.className = "pm-error";
          return;
        }
        if (!combo.ctrl && !combo.alt && !combo.meta && combo.key.length === 1) {
          shortcutStatus.textContent = "A single character would fire while typing; add Ctrl, Alt or Meta.";
          shortcutStatus.className = "pm-error";
          return;
        }
        void ctx.store.updateCore((core) => ({ ...core, shortcut: formatShortcut(combo) })).then(() => {
          notify(`Shortcut is now ${formatShortcut(combo)}`);
        });
      },
      "primary",
    );
    container.appendChild(h("h3", null, "Panel"));
    container.appendChild(
      row(
        "In-page shortcut",
        h("div", null, h("div", { style: "display:flex;gap:6px" }, shortcutInput, recordBtn, saveShortcut), shortcutStatus),
        "Toggles this panel while a page has focus.",
      ),
    );
    container.appendChild(
      row(
        "Browser shortcut",
        h(
          "div",
          { class: "pm-note" },
          "Chrome also binds ",
          h("kbd", null, "Alt+Shift+P"),
          " to this panel and lets you assign keys to Fill, Capture and Auto-reload at chrome://extensions/shortcuts.",
        ),
      ),
    );
    const side = h(
      "select",
      {
        onchange: () => {
          const value = side.value === "left" ? "left" : "right";
          void ctx.store.updateCore((core) => ({ ...core, panelSide: value }));
        },
      },
      h("option", { value: "right", selected: settings.core.panelSide === "right" }, "Right"),
      h("option", { value: "left", selected: settings.core.panelSide === "left" }, "Left"),
    );
    container.appendChild(row("Panel side", side));

    // Module switches.
    container.appendChild(h("h3", null, "Modules"));
    for (const module of opts.allModules) {
      const enabled = !settings.core.disabledModules.includes(module.id);
      const box = h("input", {
        type: "checkbox",
        checked: enabled,
        onchange: () => {
          void ctx.store.updateCore((core) => {
            const disabled = core.disabledModules.filter((id) => id !== module.id);
            if (!box.checked) disabled.push(module.id);
            return { ...core, disabledModules: disabled };
          });
        },
      });
      container.appendChild(
        h(
          "label",
          { class: "pm-check" },
          box,
          h("span", null, h("b", null, module.title), " ", h("span", { class: "pm-note" }, module.description)),
        ),
      );
    }
    container.appendChild(
      h("p", { class: "pm-note" }, "Switching a module off hides its tab and stops it in this tab right away."),
    );

    // Export / import.
    container.appendChild(h("h3", null, "Export / import"));
    const exportArea = h("textarea", { readonly: "", spellcheck: "false" }, exportSettings(settings));
    const copyBtn = button("Copy", () => {
      void navigator.clipboard.writeText(exportArea.value).then(
        () => notify("Settings copied to the clipboard"),
        () => {
          exportArea.select();
          notify("Clipboard blocked here; the text is selected, copy it manually", "warn");
        },
      );
    });
    container.appendChild(row("Export", h("div", null, exportArea, h("div", { class: "pm-actions", style: "margin-top:6px" }, copyBtn))));
    const importArea = h("textarea", { placeholder: "Paste a pagemods settings document here", spellcheck: "false" });
    const importStatus = h("div", { class: "pm-note" });
    const importBtn = confirmButton("Import (replaces everything)", "Click again to replace all settings", () => {
      const result = importSettings(importArea.value);
      if ("error" in result) {
        importStatus.textContent = result.error;
        importStatus.className = "pm-error";
        return;
      }
      void ctx.store.save(result.settings).then(() => notify("Settings imported"));
    });
    container.appendChild(row("Import", h("div", null, importArea, h("div", { class: "pm-actions", style: "margin-top:6px" }, importBtn), importStatus)));
    const resetBtn = confirmButton("Reset to defaults", "Click again to erase all settings", () => {
      void ctx.store.save(normalize(undefined)).then(() => notify("Settings reset", "warn"));
    });
    container.appendChild(row("Reset", resetBtn));
  }

  // Esc closes the panel when the focus is inside it.
  root.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape") {
      event.stopPropagation();
      close();
    }
  });

  return {
    open,
    close,
    toggle,
    isOpen,
    notify,
    refresh: () => {
      if (isOpen()) render();
    },
    root,
  };
}
