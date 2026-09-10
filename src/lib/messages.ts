// Messages between the content script and the service worker, in both
// directions. Each module owns the messages prefixed with its id.

export interface DownloadItem {
  url: string;
  /** Path relative to the browser's download directory. */
  filename: string;
}

export interface DownloadRequest {
  items: DownloadItem[];
}

export interface DownloadResult {
  started: number;
  failed: number;
  /** The first few failures, for the panel to show. */
  errors: string[];
}

export type Message =
  | { type: "panel:toggle" }
  | { type: "panel:open"; module?: string }
  | { type: "formfill:fill" }
  | { type: "formfill:capture" }
  | { type: "autoreload:get" }
  | { type: "autoreload:set"; intervalSec: number | null }
  | { type: "autoreload:toggle" }
  | { type: "envswitch:cycle" }
  | { type: "images:grab" }
  | { type: "images:download"; request: DownloadRequest };

export type MessageType = Message["type"];

export interface AutoreloadState {
  intervalSec: number;
  /** Epoch milliseconds when auto-reload was switched on for the tab. */
  startedAt: number;
}

export function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
