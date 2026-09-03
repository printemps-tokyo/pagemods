// Auto-reload, service-worker side: which tabs reload and how often.
//
// chrome.storage.session survives service-worker restarts and is cleared
// when the browser closes, which is exactly the lifetime of "this tab
// reloads itself". It is not exposed to content scripts, so the page goes
// through messages.

import type { AutoreloadState, Message } from "../../lib/messages.js";

const KEY = "autoreload:tabs";

type Registry = Record<string, AutoreloadState>;

async function readAll(): Promise<Registry> {
  const items = await chrome.storage.session.get(KEY);
  const value = items[KEY];
  return typeof value === "object" && value !== null ? (value as Registry) : {};
}

async function writeAll(registry: Registry): Promise<void> {
  await chrome.storage.session.set({ [KEY]: registry });
}

// Registry mutations run one after another; two tabs toggling at the same
// moment must not overwrite each other's entry.
let chain: Promise<unknown> = Promise.resolve();
function mutate<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

async function badge(tabId: number, on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: on ? "R" : "" });
    if (on) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f46e5" });
  } catch {
    // The tab may be gone already.
  }
}

export async function getState(tabId: number): Promise<AutoreloadState | null> {
  const registry = await readAll();
  const state = registry[String(tabId)] ?? null;
  await badge(tabId, state !== null);
  return state;
}

export function setState(tabId: number, intervalSec: number | null): Promise<AutoreloadState | null> {
  return mutate(async () => {
    const registry = await readAll();
    const key = String(tabId);
    let state: AutoreloadState | null = null;
    if (intervalSec === null) {
      delete registry[key];
    } else {
      state = { intervalSec, startedAt: Date.now() };
      registry[key] = state;
    }
    await writeAll(registry);
    await badge(tabId, state !== null);
    return state;
  });
}

/** Route the module's messages; returns undefined for messages it does not own. */
export async function handleAutoreloadMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
): Promise<AutoreloadState | null | undefined> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return undefined;
  switch (message.type) {
    case "autoreload:get":
      return getState(tabId);
    case "autoreload:set":
      return setState(tabId, message.intervalSec);
    default:
      return undefined;
  }
}

export function installAutoreload(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void mutate(async () => {
      const registry = await readAll();
      if (String(tabId) in registry) {
        delete registry[String(tabId)];
        await writeAll(registry);
      }
    });
  });
}
