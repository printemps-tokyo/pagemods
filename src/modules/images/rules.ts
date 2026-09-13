// What to grab off a page and what to call the files, with no DOM involved.
//
// Chrome can only write inside the browser's download directory: the
// `filename` of chrome.downloads.download is a path relative to it, and
// absolute paths or ".." are rejected (chrome.downloads reference). So the
// "directory" here is a folder under Downloads. Inside it, files either sit
// side by side or rebuild the site's own path, depending on the layout.

export type ImageKind = "img" | "background" | "poster";

export interface ImageItem {
  url: string;
  /** Natural size when known, else the rendered size; 0 when neither is. */
  width: number;
  height: number;
  kind: ImageKind;
}

/** Where the files go inside the folder. */
export type Layout = "flat" | "mirror";

export interface ImagesSettings {
  /** Folder under the browser's download directory. Supports {host} and {date}. */
  folder: string;
  /** "flat": every file side by side. "mirror": rebuild the site's own path. */
  layout: Layout;
  minWidth: number;
  minHeight: number;
  includeBackgrounds: boolean;
  /** Prefix files with 001-, 002-, ... so the page order survives. */
  numberFiles: boolean;
  /** Free-text prefix in front of every file name. */
  prefix: string;
}

export const DEFAULTS: ImagesSettings = {
  folder: "pagemods/{host}",
  layout: "flat",
  minWidth: 100,
  minHeight: 100,
  includeBackgrounds: false,
  numberFiles: true,
  prefix: "",
};

/** More than this in one go is a mistake, not a wish. */
export const MAX_FILES = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function int(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(10000, Math.round(n));
}

export function normalizeImages(raw: unknown): ImagesSettings {
  const s = isRecord(raw) ? raw : {};
  return {
    folder: typeof s.folder === "string" && s.folder.trim() !== "" ? s.folder.trim() : DEFAULTS.folder,
    layout: s.layout === "mirror" ? "mirror" : "flat",
    minWidth: int(s.minWidth, DEFAULTS.minWidth),
    minHeight: int(s.minHeight, DEFAULTS.minHeight),
    includeBackgrounds: s.includeBackgrounds === true,
    numberFiles: s.numberFiles !== false,
    prefix: typeof s.prefix === "string" ? s.prefix : "",
  };
}

/** One path segment Chrome will accept: no separators, no dot-only names. */
export function sanitizeSegment(text: string, fallback = "page"): string {
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 60);
  return cleaned === "" ? fallback : cleaned;
}

/** Turn the folder template into a relative path under the download directory. */
export function resolveFolder(template: string, pageUrl: string, now = new Date()): string {
  let host = "page";
  try {
    host = new URL(pageUrl).host || "page";
  } catch {
    // Keep the fallback.
  }
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const filled = template.replace(/\{host\}/g, host).replace(/\{date\}/g, date);
  const segments = filled
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .map((segment) => sanitizeSegment(segment))
    .slice(0, 5);
  return segments.join("/");
}

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "svg",
  "bmp",
  "ico",
  "jxl",
  "tif",
  "tiff",
]);

/** The file name a URL suggests, without the extension logic. */
export function baseNameFor(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // A relative or malformed URL: fall back to the raw string.
  }
  const last = path.split("/").filter((p) => p !== "").pop() ?? "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // Percent sequences that are not valid UTF-8: keep them as typed.
  }
  return decoded;
}

/** Split a name into stem and a known image extension (empty when there is none). */
export function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  const ext = name.slice(dot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? { stem: name.slice(0, dot), ext } : { stem: name, ext: "" };
}

export interface PlannedDownload {
  url: string;
  /** Path relative to the download directory: the folder plus the file's place in it. */
  filename: string;
  item: ImageItem;
}

export interface Plan {
  downloads: PlannedDownload[];
  folder: string;
  /** Why items were left out, as counts by reason. */
  skipped: { tooSmall: number; duplicate: number; unsupported: number; overLimit: number };
}

const DOWNLOADABLE = /^https?:$/;

/** Can chrome.downloads fetch this? data: and blob: cannot cross into the worker. */
export function isDownloadable(url: string): boolean {
  try {
    return DOWNLOADABLE.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** How deep a mirrored path may go before the rest is dropped. */
export const MAX_MIRROR_DEPTH = 8;

/**
 * The directories an image's URL path implies, sanitized. The file name
 * itself is not included; `baseNameFor` gives that.
 */
export function pathDirsFor(url: string): string[] {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    return [];
  }
  const segments = path.split("/").filter((s) => s !== "");
  // The last segment is the file name, not a directory.
  segments.pop();
  return segments
    .filter((s) => s !== "." && s !== "..")
    .map((s) => {
      let decoded = s;
      try {
        decoded = decodeURIComponent(s);
      } catch {
        // Keep the raw segment when it is not valid UTF-8.
      }
      return sanitizeSegment(decoded, "dir");
    })
    .slice(0, MAX_MIRROR_DEPTH);
}

/**
 * Decide the file list. Items keep page order, duplicates by URL collapse,
 * and names collide as little as possible before Chrome's own uniquifying
 * has to step in.
 *
 * In "mirror" layout the site's own path and file name are rebuilt under the
 * folder, so `/assets/img/hero.jpg` arrives as `assets/img/hero.jpg`.
 * Numbering and the prefix are ignored there: they would change the very
 * names the layout exists to preserve.
 */
export function planDownloads(
  items: ImageItem[],
  settings: ImagesSettings,
  pageUrl: string,
  now = new Date(),
): Plan {
  const folder = resolveFolder(settings.folder, pageUrl, now);
  const mirror = settings.layout === "mirror";
  const prefix = mirror || settings.prefix.trim() === "" ? "" : sanitizeSegment(settings.prefix, "") + "-";
  const seenUrls = new Set<string>();
  const usedPaths = new Set<string>();
  const downloads: PlannedDownload[] = [];
  const skipped = { tooSmall: 0, duplicate: 0, unsupported: 0, overLimit: 0 };

  for (const item of items) {
    if (!isDownloadable(item.url)) {
      skipped.unsupported++;
      continue;
    }
    if (seenUrls.has(item.url)) {
      skipped.duplicate++;
      continue;
    }
    // A zero size means the image never loaded, so its real size is unknown:
    // let it through rather than drop it for failing a test it cannot take.
    const known = item.width > 0 && item.height > 0;
    if (known && (item.width < settings.minWidth || item.height < settings.minHeight)) {
      skipped.tooSmall++;
      continue;
    }
    if (downloads.length >= MAX_FILES) {
      skipped.overLimit++;
      continue;
    }
    seenUrls.add(item.url);
    const { stem, ext } = splitExtension(baseNameFor(item.url));
    const number = !mirror && settings.numberFiles ? String(downloads.length + 1).padStart(3, "0") + "-" : "";
    const base = sanitizeSegment(`${number}${prefix}${stem}`, `${number}${prefix}image`);
    const dirs = mirror ? pathDirsFor(item.url) : [];
    const dir = dirs.length === 0 ? "" : dirs.join("/") + "/";
    const withExt = (stemText: string): string => (ext === "" ? stemText : `${stemText}.${ext}`);
    // Two URLs can still want one path (a query-string variant, or the same
    // name under two hosts), so the second one gets a suffix.
    let relative = dir + withExt(base);
    if (usedPaths.has(relative)) {
      let n = 2;
      while (usedPaths.has(dir + withExt(`${base}-${n}`))) n++;
      relative = dir + withExt(`${base}-${n}`);
    }
    usedPaths.add(relative);
    downloads.push({ url: item.url, filename: folder === "" ? relative : `${folder}/${relative}`, item });
  }
  return { downloads, folder, skipped };
}

export function describeSkipped(skipped: Plan["skipped"]): string {
  const parts: string[] = [];
  if (skipped.tooSmall > 0) parts.push(`${skipped.tooSmall} too small`);
  if (skipped.duplicate > 0) parts.push(`${skipped.duplicate} duplicate`);
  if (skipped.unsupported > 0) parts.push(`${skipped.unsupported} not http(s)`);
  if (skipped.overLimit > 0) parts.push(`${skipped.overLimit} over the ${MAX_FILES} limit`);
  return parts.join(", ");
}
