import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FILES,
  baseNameFor,
  describeSkipped,
  isDownloadable,
  normalizeImages,
  planDownloads,
  resolveFolder,
  sanitizeSegment,
  splitExtension,
  type ImageItem,
  type ImagesSettings,
} from "../src/modules/images/rules.js";

function image(url: string, width = 800, height = 600, kind: ImageItem["kind"] = "img"): ImageItem {
  return { url, width, height, kind };
}

const settings: ImagesSettings = {
  folder: "pagemods/{host}",
  minWidth: 100,
  minHeight: 100,
  includeBackgrounds: false,
  numberFiles: true,
  prefix: "",
};

const NOW = new Date(2026, 8, 11);

test("folder templates resolve under the download directory", () => {
  assert.equal(resolveFolder("pagemods/{host}", "https://example.com/a", NOW), "pagemods/example.com");
  assert.equal(resolveFolder("shots/{host}/{date}", "https://example.com/a", NOW), "shots/example.com/2026-09-11");
  // Escapes and absolute paths cannot leave the download directory.
  assert.equal(resolveFolder("../../etc", "https://example.com/", NOW), "etc");
  assert.equal(resolveFolder("/tmp/x", "https://example.com/", NOW), "tmp/x");
  assert.equal(resolveFolder("a//b/./c", "https://example.com/", NOW), "a/b/c");
  assert.equal(resolveFolder("  ", "https://example.com/", NOW), "");
  assert.equal(resolveFolder("{host}", "not a url", NOW), "page");
});

test("segments and file names are safe and keep their extension", () => {
  assert.equal(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j'), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(sanitizeSegment("  hello world  "), "hello-world");
  assert.equal(sanitizeSegment("..."), "page");
  assert.equal(sanitizeSegment("x".repeat(200)).length, 60);

  assert.equal(baseNameFor("https://example.com/img/photo%20one.jpg?v=2"), "photo one.jpg");
  assert.equal(baseNameFor("https://example.com/"), "");
  assert.deepEqual(splitExtension("photo.JPG"), { stem: "photo", ext: "jpg" });
  assert.deepEqual(splitExtension("logo.php"), { stem: "logo.php", ext: "" });
  assert.deepEqual(splitExtension(".htaccess"), { stem: ".htaccess", ext: "" });
});

test("only http(s) can be handed to the downloads API", () => {
  assert.ok(isDownloadable("https://example.com/a.png"));
  assert.ok(isDownloadable("http://example.com/a.png"));
  assert.ok(!isDownloadable("data:image/png;base64,AAAA"));
  assert.ok(!isDownloadable("blob:https://example.com/x"));
  assert.ok(!isDownloadable("/relative.png"));
});

test("planning numbers files, drops small ones and collapses duplicates", () => {
  const items = [
    image("https://cdn.example.com/photo.jpg"),
    image("https://cdn.example.com/photo.jpg"),
    image("https://cdn.example.com/icon.png", 16, 16),
    image("data:image/gif;base64,AAA", 500, 500),
    image("https://cdn.example.com/other/photo.jpg"),
    image("https://cdn.example.com/hero.webp", 0, 0),
  ];
  const plan = planDownloads(items, settings, "https://example.com/gallery", NOW);
  assert.deepEqual(
    plan.downloads.map((d) => d.filename),
    [
      "pagemods/example.com/001-photo.jpg",
      "pagemods/example.com/002-photo.jpg",
      "pagemods/example.com/003-hero.webp",
    ],
  );
  assert.deepEqual(plan.skipped, { tooSmall: 1, duplicate: 1, unsupported: 1, overLimit: 0 });
  assert.equal(describeSkipped(plan.skipped), "1 too small, 1 duplicate, 1 not http(s)");
  // Every file sits directly in the folder: one separator after it.
  for (const d of plan.downloads) assert.equal(d.filename.split("/").length, 3);
});

test("names collide as little as possible without numbering", () => {
  const items = [
    image("https://a.example/x/photo.jpg"),
    image("https://b.example/y/photo.jpg"),
    image("https://c.example/z/photo.jpg"),
    image("https://d.example/trailing-slash/"),
  ];
  const plan = planDownloads(items, { ...settings, numberFiles: false, prefix: "shop" }, "https://example.com/", NOW);
  assert.deepEqual(
    plan.downloads.map((d) => d.filename.split("/").pop()),
    ["shop-photo.jpg", "shop-photo-2.jpg", "shop-photo-3.jpg", "shop-trailing-slash"],
  );
});

test("the run is capped", () => {
  const many = Array.from({ length: MAX_FILES + 5 }, (_, i) => image(`https://a.example/${i}.png`));
  const plan = planDownloads(many, settings, "https://example.com/", NOW);
  assert.equal(plan.downloads.length, MAX_FILES);
  assert.equal(plan.skipped.overLimit, 5);
});

test("normalize tolerates junk", () => {
  const s = normalizeImages({ folder: "   ", minWidth: -5, minHeight: "abc", numberFiles: "no", prefix: 7 });
  assert.equal(s.folder, "pagemods/{host}");
  assert.equal(s.minWidth, 100);
  assert.equal(s.minHeight, 100);
  assert.equal(s.numberFiles, true);
  assert.equal(s.includeBackgrounds, false);
  assert.equal(s.prefix, "");
  assert.equal(normalizeImages(undefined).folder, "pagemods/{host}");
  assert.equal(normalizeImages({ minWidth: 0 }).minWidth, 0);
});
