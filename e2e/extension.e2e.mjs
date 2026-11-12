// End-to-end checks of the built extension (dist/) in a real Chromium:
// the manifest, the content-script loader and the module wiring, which the
// unit tests cannot reach. Needs `npm run build` and Playwright's Chromium
// (`npx playwright install chromium`), or any Chromium build named by
// E2E_CHROMIUM; run with `npm run e2e`.

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const EXTENSION = resolve(import.meta.dirname, "..", "dist");

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>pagemods e2e</title></head>
<body>
  <h1>Test page</h1>
  <div id="ad">an advert</div>
  <form><label>Email <input name="email" id="email"></label></form>
</body></html>`;

let server;
let origin;
let context;
let worker;
let profile;

/** Replace the whole settings document, as the panel would save it. */
async function setSettings(modules) {
  await worker.evaluate(
    (doc) => chrome.storage.local.set({ pagemods: doc }),
    { version: 1, core: { shortcut: "Ctrl+;", panelSide: "right", disabledModules: [] }, modules },
  );
}

/** Open the test page and wait until the content script has booted. */
async function openPage() {
  const page = await context.newPage();
  await page.goto(`${origin}/`);
  await page.waitForSelector("html[data-pagemods]", { state: "attached", timeout: 10_000 });
  return page;
}

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;

  profile = await mkdtemp(join(tmpdir(), "pagemods-e2e-"));
  context = await chromium.launchPersistentContext(profile, {
    // The Chromium build, unlike branded Chrome, still loads unpacked
    // extensions from the command line, also headless.
    channel: "chromium",
    // Another Chromium build than the one this Playwright downloads.
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
});

after(async () => {
  await context?.close();
  await new Promise((done) => server?.close(done));
  if (profile) await rm(profile, { recursive: true, force: true });
});

describe("pagemods", () => {
  beforeEach(async () => {
    await setSettings({});
  });

  test("the service worker is the extension's", () => {
    assert.match(worker.url(), /^chrome-extension:\/\/[a-p]{32}\/src\/background\.js$/);
  });

  test("the content script boots and the shortcut opens the panel", async () => {
    const page = await openPage();
    // A synthetic event from the page is not a shortcut.
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: ";", code: "Semicolon", ctrlKey: true })),
    );
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#pagemods-host").count(), 0);
    await page.locator("body").click();
    await page.keyboard.press("Control+;");
    await page.waitForSelector("#pagemods-host", { state: "attached", timeout: 5_000 });
    await page.close();
  });

  test("a styles rule hides an element and adds CSS on the matching site", async () => {
    await setSettings({
      styles: {
        rules: [
          {
            id: "r1",
            name: "e2e",
            url: "^http://127\\.0\\.0\\.1:\\d+/",
            enabled: true,
            hide: ["#ad"],
            css: "h1 { color: rgb(1, 2, 3); }",
          },
        ],
      },
    });
    const page = await openPage();
    await page.waitForSelector("#pagemods-styles", { state: "attached", timeout: 5_000 });
    assert.equal(await page.locator("#ad").evaluate((el) => getComputedStyle(el).display), "none");
    assert.equal(await page.locator("h1").evaluate((el) => getComputedStyle(el).color), "rgb(1, 2, 3)");
    await page.close();
  });

  test("a rule for another site leaves the page alone", async () => {
    await setSettings({
      styles: {
        rules: [{ id: "r1", name: "other", url: "^https://example\\.com/", enabled: true, hide: ["#ad"], css: "" }],
      },
    });
    const page = await openPage();
    assert.equal(await page.locator("#pagemods-styles").count(), 0);
    assert.equal(await page.locator("#ad").evaluate((el) => getComputedStyle(el).display), "block");
    await page.close();
  });

  test("envswitch shows the environment badge", async () => {
    await setSettings({
      envswitch: {
        sites: [
          {
            id: "s1",
            name: "e2e",
            enabled: true,
            environments: [
              {
                id: "e1",
                label: "local",
                base: origin,
                match: "",
                badge: { enabled: true, corner: "top-right", color: "#9ece6a", opacity: 1, text: "" },
              },
            ],
          },
        ],
      },
    });
    const page = await openPage();
    await page.waitForSelector("#pagemods-env-badge", { state: "attached", timeout: 5_000 });
    await page.close();
  });
});
