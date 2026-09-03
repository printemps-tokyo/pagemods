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
import { CSS } from "./theme.js";
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
    for (const side of ["right", "left", "bottom"] as const) {
      drawer.classList.toggle(`pm-${side}`, settings.core.panelSide === side);
    }
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
          const value = side.value === "left" || side.value === "bottom" ? side.value : "right";
          void ctx.store.updateCore((core) => ({ ...core, panelSide: value }));
        },
      },
      h("option", { value: "right", selected: settings.core.panelSide === "right" }, "Right"),
      h("option", { value: "left", selected: settings.core.panelSide === "left" }, "Left"),
      h("option", { value: "bottom", selected: settings.core.panelSide === "bottom" }, "Bottom"),
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
