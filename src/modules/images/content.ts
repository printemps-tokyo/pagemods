// Finding the images a page actually uses.
//
// `img` elements report what the browser picked (currentSrc), which already
// resolves srcset and picture. Background images are opt-in because reading
// computed styles for every element is the expensive part of a scan.

import type { ImageItem } from "./rules.js";

/** Elements scanned for background images before the scan gives up. */
const BACKGROUND_SCAN_LIMIT = 4000;

const URL_IN_CSS = /url\((['"]?)(.*?)\1\)/g;

function absolute(url: string): string | null {
  const text = url.trim();
  if (text === "" || text.startsWith("#")) return null;
  try {
    return new URL(text, document.baseURI).href;
  } catch {
    return null;
  }
}

/** Every image on the page, in document order. */
export function collectImages(includeBackgrounds: boolean): ImageItem[] {
  const items: ImageItem[] = [];

  for (const img of Array.from(document.images)) {
    const href = absolute(img.currentSrc || img.src);
    if (href === null) continue;
    items.push({
      url: href,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      kind: "img",
    });
  }

  for (const video of Array.from(document.querySelectorAll("video[poster]"))) {
    const href = absolute(video.getAttribute("poster") ?? "");
    if (href === null) continue;
    items.push({
      url: href,
      width: (video as HTMLVideoElement).videoWidth || 0,
      height: (video as HTMLVideoElement).videoHeight || 0,
      kind: "poster",
    });
  }

  if (includeBackgrounds) {
    const all = Array.from(document.querySelectorAll<HTMLElement>("*")).slice(0, BACKGROUND_SCAN_LIMIT);
    for (const el of all) {
      if (el.id === "pagemods-host" || el.id === "pagemods-env-badge") continue;
      const style = getComputedStyle(el);
      const value = style.backgroundImage;
      if (value === "none" || value === "") continue;
      URL_IN_CSS.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = URL_IN_CSS.exec(value)) !== null) {
        const href = absolute(match[2] ?? "");
        if (href === null) continue;
        const rect = el.getBoundingClientRect();
        items.push({
          url: href,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          kind: "background",
        });
      }
    }
  }

  return items;
}
