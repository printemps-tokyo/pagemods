// Content-script entry point (loaded as a module by loader.js).
//
// Boots the enabled modules, installs the in-page shortcut, routes messages
// from the service worker (context menu, keyboard commands, toolbar button)
// to the panel or to the module that claims them, and re-renders the panel
// whenever the settings document changes in storage.

import { isMessage, type Message } from "../lib/messages.js";
import type { ContentModule, ModuleContext } from "../lib/registry.js";
import { createSettingsStore, normalize, STORAGE_KEY, type Settings } from "../lib/settings.js";
import { matchesShortcut, parseShortcut } from "../lib/shortcut.js";
import { MODULES } from "../modules/index.js";
import { createPanel } from "./panel.js";

/** Set on <html> once everything below is wired up; tests and users can wait for it. */
const MARK = "data-pagemods";

declare global {
  interface Window {
    __pagemodsBooted?: boolean;
    /**
     * The panel's (closed) shadow root, for end-to-end tests that evaluate
     * in the content script's isolated world. Page scripts run in the main
     * world and cannot see this property.
     */
    __pagemodsPanelRoot?: ShadowRoot;
  }
}

async function boot(): Promise<void> {
  if (window.top !== window) return;
  if (window.__pagemodsBooted) return;
  window.__pagemodsBooted = true;

  const store = createSettingsStore({
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
  });
  let settings: Settings = await store.load();

  const enabledModules = (): ContentModule[] =>
    MODULES.filter((m) => !settings.core.disabledModules.includes(m.id));

  const ctx: ModuleContext = {
    store,
    settings: () => settings,
    openPanel: (moduleId) => panel.open(moduleId),
    closePanel: () => panel.close(),
    notify: (text, kind) => panel.notify(text, kind),
    refreshPanel: () => panel.refresh(),
  };

  const panel = createPanel({
    allModules: MODULES,
    enabledModules,
    settings: () => settings,
    ctx: () => ctx,
    version: chrome.runtime.getManifest().version,
  });
  window.__pagemodsPanelRoot = panel.root;

  const booted = enabledModules();
  for (const module of booted) {
    try {
      await module.init?.(ctx);
    } catch (error) {
      console.warn(`pagemods: module ${module.id} failed to start`, error);
    }
  }

  window.addEventListener(
    "keydown",
    (event) => {
      // Only real key presses: a page script must not be able to open the
      // panel with a synthetic event, and IME composition is not a shortcut.
      if (!event.isTrusted || event.isComposing) return;
      const combo = parseShortcut(settings.core.shortcut);
      if (combo === null || !matchesShortcut(combo, event)) return;
      event.preventDefault();
      event.stopPropagation();
      panel.toggle();
    },
    true,
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(STORAGE_KEY in changes)) return;
    const before = settings.core.disabledModules;
    settings = normalize(changes[STORAGE_KEY]?.newValue);
    const after = settings.core.disabledModules;
    // Switch modules on and off without waiting for the next page load.
    for (const module of MODULES) {
      const wasOn = !before.includes(module.id);
      const isOn = !after.includes(module.id);
      if (wasOn && !isOn) {
        void Promise.resolve(module.dispose?.(ctx)).catch((error: unknown) => {
          console.warn(`pagemods: module ${module.id} failed to stop`, error);
        });
      } else if (!wasOn && isOn) {
        void Promise.resolve(module.init?.(ctx)).catch((error: unknown) => {
          console.warn(`pagemods: module ${module.id} failed to start`, error);
        });
      } else if (isOn) {
        void Promise.resolve(module.onSettingsChanged?.(ctx)).catch((error: unknown) => {
          console.warn(`pagemods: module ${module.id} failed to apply settings`, error);
        });
      }
    }
    panel.refresh();
  });

  async function handle(message: Message): Promise<unknown> {
    switch (message.type) {
      case "panel:toggle":
        panel.toggle();
        return true;
      case "panel:open":
        panel.open(message.module);
        return true;
      default:
        break;
    }
    // Modules that were disabled at load time still get a chance if they
    // were enabled since; they just have not run init on this page.
    for (const module of enabledModules()) {
      if (!module.onMessage) continue;
      const outcome = await module.onMessage(message, ctx);
      if (outcome.handled) return outcome.result ?? null;
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    if (!isMessage(raw)) return false;
    handle(raw).then(
      (result) => sendResponse(result),
      (error: unknown) => sendResponse({ error: String(error) }),
    );
    return true;
  });

  document.documentElement.setAttribute(MARK, chrome.runtime.getManifest().version);
}

void boot().catch((error: unknown) => {
  console.warn("pagemods: failed to start", error);
});
