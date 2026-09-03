// Auto-reload, page side.
//
// The service worker remembers which tabs reload and how often (see
// background.ts); the page asks on every load and arms a timer for one
// interval. Keeping the timer in the page means no alarms-API minimum and
// no service-worker lifetime to worry about, and a reload naturally re-arms.

import type { AutoreloadState, Message } from "../../lib/messages.js";
import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, h, row } from "../../content/ui.js";

export const AUTORELOAD_ID = "autoreload";

export interface AutoreloadSettings {
  defaultIntervalSec: number;
}

const DEFAULTS: AutoreloadSettings = { defaultIntervalSec: 60 };
const MIN_SEC = 1;
const MAX_SEC = 24 * 60 * 60;

export function normalizeAutoreload(raw: unknown): AutoreloadSettings {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const n = typeof r.defaultIntervalSec === "number" ? r.defaultIntervalSec : DEFAULTS.defaultIntervalSec;
  return { defaultIntervalSec: clampSeconds(n) };
}

export function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.defaultIntervalSec;
  return Math.min(MAX_SEC, Math.max(MIN_SEC, Math.round(n)));
}

let state: AutoreloadState | null = null;
let timer: number | undefined;
let dueAt = 0;

async function ask(message: Message): Promise<AutoreloadState | null> {
  const reply: unknown = await chrome.runtime.sendMessage(message);
  if (typeof reply === "object" && reply !== null && "intervalSec" in reply) return reply as AutoreloadState;
  return null;
}

function arm(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (state === null) return;
  dueAt = Date.now() + state.intervalSec * 1000;
  timer = window.setTimeout(() => location.reload(), state.intervalSec * 1000);
}

async function start(ctx: ModuleContext, seconds: number): Promise<void> {
  state = await ask({ type: "autoreload:set", intervalSec: clampSeconds(seconds) });
  arm();
  ctx.notify(state ? `Auto-reload every ${state.intervalSec} s in this tab` : "Could not start auto-reload", state ? "ok" : "error");
  ctx.refreshPanel();
}

async function stop(ctx: ModuleContext): Promise<void> {
  await ask({ type: "autoreload:set", intervalSec: null });
  state = null;
  arm();
  ctx.notify("Auto-reload stopped");
  ctx.refreshPanel();
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = moduleSettings(ctx.settings(), AUTORELOAD_ID, normalizeAutoreload);
  const seconds = h("input", {
    type: "number",
    min: String(MIN_SEC),
    max: String(MAX_SEC),
    step: "1",
    value: String(state?.intervalSec ?? settings.defaultIntervalSec),
  });
  const status = h("div", { class: state ? "pm-ok" : "pm-note" });
  const tick = () => {
    if (!status.isConnected) {
      clearInterval(ticker);
      return;
    }
    if (state === null) {
      status.textContent = "Off in this tab.";
      return;
    }
    const left = Math.max(0, Math.ceil((dueAt - Date.now()) / 1000));
    status.textContent = `On: reloading in ${left} s (every ${state.intervalSec} s). Stays on for this tab until stopped, across navigations.`;
  };
  const ticker = window.setInterval(tick, 500);

  const startBtn = button(state ? "Restart with this interval" : "Start in this tab", () => void start(ctx, Number(seconds.value)), "primary");
  const stopBtn = button("Stop", () => void stop(ctx));
  stopBtn.disabled = state === null;
  const saveDefault = button("Save as default", () => {
    const value = clampSeconds(Number(seconds.value));
    void ctx.store.updateModule(AUTORELOAD_ID, DEFAULTS, () => ({ defaultIntervalSec: value })).then(() => ctx.notify(`Default interval is now ${value} s`));
  });

  root.appendChild(row("Interval (seconds)", h("div", { style: "display:flex;gap:6px;align-items:center" }, seconds, saveDefault), `Default ${settings.defaultIntervalSec} s. The keyboard command and context menu use the default.`));
  root.appendChild(row("This tab", h("div", null, h("div", { class: "pm-actions" }, startBtn, stopBtn), status)));
  // First tick only after the status element is in the panel: `tick` stops
  // the ticker when it finds the element detached, i.e. after a re-render.
  tick();
  root.appendChild(
    h("p", { class: "pm-note" }, "The toolbar icon shows a badge while a tab reloads itself. Pages that ask before unloading will still ask."),
  );
}

export const autoreloadModule: ContentModule = {
  id: AUTORELOAD_ID,
  title: "Auto reload",
  description: "Reload the current tab every N seconds until you stop it.",
  actions: [
    {
      id: "toggle",
      label: "Start / stop",
      run: async (ctx) => {
        if (state) await stop(ctx);
        else await start(ctx, moduleSettings(ctx.settings(), AUTORELOAD_ID, normalizeAutoreload).defaultIntervalSec);
      },
    },
  ],
  async init() {
    try {
      state = await ask({ type: "autoreload:get" });
    } catch {
      state = null;
    }
    arm();
  },
  async dispose() {
    // Switched off in the panel: stop this tab for good, not just until the
    // next load.
    if (state !== null) {
      try {
        await ask({ type: "autoreload:set", intervalSec: null });
      } catch {
        // The service worker may be unreachable; the timer stops regardless.
      }
    }
    state = null;
    arm();
  },
  async onMessage(message, ctx) {
    if (message.type !== "autoreload:toggle") return { handled: false };
    if (state) await stop(ctx);
    else await start(ctx, moduleSettings(ctx.settings(), AUTORELOAD_ID, normalizeAutoreload).defaultIntervalSec);
    return { handled: true, result: state };
  },
  renderSettings,
};
