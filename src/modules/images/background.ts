// Image downloads, service-worker side.
//
// Only the worker may call chrome.downloads, and its `filename` is a path
// relative to the browser's download directory, so that is where the
// "directory" from the panel lives.

import type { DownloadRequest, DownloadResult, Message } from "../../lib/messages.js";

async function one(url: string, filename: string): Promise<string | null> {
  try {
    await chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
    return null;
  } catch (error) {
    return `${filename}: ${String(error)}`;
  }
}

export async function downloadAll(request: DownloadRequest): Promise<DownloadResult> {
  const errors: string[] = [];
  let started = 0;
  // Sequential on purpose: a few hundred parallel downloads make Chrome's
  // shelf and the target server unhappy, and the ordering keeps numbered
  // file names in page order.
  for (const item of request.items) {
    const error = await one(item.url, item.filename);
    if (error === null) started++;
    else errors.push(error);
  }
  return { started, failed: errors.length, errors: errors.slice(0, 5) };
}

/** Route the module's messages; undefined for messages it does not own. */
export async function handleImagesMessage(message: Message): Promise<DownloadResult | undefined> {
  if (message.type !== "images:download") return undefined;
  return downloadAll(message.request);
}
