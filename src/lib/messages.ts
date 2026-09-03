// Messages between the content script and the service worker, in both
// directions. Each module owns the messages prefixed with its id.

export type Message =
  | { type: "panel:toggle" }
  | { type: "panel:open"; module?: string }
  | { type: "formfill:fill" }
  | { type: "formfill:capture" }
  | { type: "autoreload:get" }
  | { type: "autoreload:set"; intervalSec: number | null }
  | { type: "autoreload:toggle" };

export type MessageType = Message["type"];

export interface AutoreloadState {
  intervalSec: number;
  /** Epoch milliseconds when auto-reload was switched on for the tab. */
  startedAt: number;
}

export function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
