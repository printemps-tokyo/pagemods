// Service worker: the pieces that have to live outside the page.
//
// Context menu items and keyboard commands are turned into messages for the
// content script of the tab they were invoked on; the toolbar button toggles
// the panel; module background parts (auto-reload's per-tab registry) are
// installed here and answer the page's questions.

import { isMessage, type Message } from "./lib/messages.js";
import { handleAutoreloadMessage, installAutoreload } from "./modules/autoreload/background.js";

interface Entry {
  id: string;
  title: string;
  message: Message;
}

/** Context-menu entries and the command ids of the manifest, by id. */
const ENTRIES: Entry[] = [
  { id: "toggle-panel", title: "Open the pagemods panel", message: { type: "panel:toggle" } },
  { id: "formfill-fill", title: "Fill the forms on this page", message: { type: "formfill:fill" } },
  { id: "formfill-capture", title: "Capture this page's form into a rule", message: { type: "formfill:capture" } },
  { id: "autoreload-toggle", title: "Start / stop auto-reload for this tab", message: { type: "autoreload:toggle" } },
];

async function send(tabId: number | undefined, message: Message): Promise<void> {
  let id = tabId;
  if (id === undefined) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    id = tab?.id;
  }
  if (id === undefined) return;
  try {
    await chrome.tabs.sendMessage(id, message);
  } catch {
    // No content script here (chrome://, the Web Store, a PDF viewer).
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    for (const entry of ENTRIES) {
      chrome.contextMenus.create({
        id: entry.id,
        title: `pagemods: ${entry.title}`,
        contexts: ["page", "editable", "selection"],
      });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const entry = ENTRIES.find((e) => e.id === info.menuItemId);
  if (entry) void send(tab?.id, entry.message);
});

chrome.commands.onCommand.addListener((command, tab) => {
  const entry = ENTRIES.find((e) => e.id === command);
  if (entry) void send(tab?.id, entry.message);
});

chrome.action.onClicked.addListener((tab) => {
  void send(tab.id, { type: "panel:toggle" });
});

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (!isMessage(raw)) return false;
  handleAutoreloadMessage(raw, sender).then(
    (result) => sendResponse(result ?? null),
    (error: unknown) => sendResponse({ error: String(error) }),
  );
  return true;
});

installAutoreload();
