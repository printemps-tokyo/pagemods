// What a mod is, from the content script's point of view.
//
// A module contributes: an entry in the panel (its settings UI), optional
// quick actions (buttons at the top of its panel entry, also reachable from
// the context menu and keyboard commands through messages), optional page
// setup on load, and optional message handling. Adding a feature means
// writing one module and appending it to `src/modules/index.ts`; the panel,
// the storage document and the message router need no change.

import type { Message } from "./messages.js";
import type { Settings, SettingsStore } from "./settings.js";

export type NoticeKind = "ok" | "warn" | "error";

export interface ModuleContext {
  store: SettingsStore;
  /** The settings document as last loaded; refreshed on every change. */
  settings(): Settings;
  openPanel(moduleId?: string): void;
  closePanel(): void;
  /** Short transient message in the panel (and the console when closed). */
  notify(text: string, kind?: NoticeKind): void;
  /** Re-render the panel after a settings change. */
  refreshPanel(): void;
}

export interface ModuleAction {
  id: string;
  label: string;
  run(ctx: ModuleContext): void | Promise<void>;
}

export interface ContentModule {
  id: string;
  title: string;
  description: string;
  actions?: ModuleAction[];
  /** Called once per page load when the module is enabled, and again if it is switched on later. */
  init?(ctx: ModuleContext): void | Promise<void>;
  /** Called when the module is switched off in the panel: stop timers, undo page changes. */
  dispose?(ctx: ModuleContext): void | Promise<void>;
  /** Called after any settings change while the module stays enabled. */
  onSettingsChanged?(ctx: ModuleContext): void | Promise<void>;
  /** Return `{ handled: true }` (optionally with a result) to claim a message. */
  onMessage?(
    message: Message,
    ctx: ModuleContext,
  ): { handled: boolean; result?: unknown } | Promise<{ handled: boolean; result?: unknown }>;
  /** Render the settings UI into an empty container inside the panel. */
  renderSettings(root: HTMLElement, ctx: ModuleContext): void | Promise<void>;
}
