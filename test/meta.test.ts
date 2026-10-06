import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPage,
  isAbsoluteHttpUrl,
  isValidHreflang,
  jsonLdTypes,
  parseJsonLd,
  resolveUrl,
  robotsDirectives,
  samePage,
  toMarkdown,
  type PageMeta,
} from "../src/modules/meta/rules.js";

function page(extra: Partial<PageMeta> = {}): PageMeta {
  return {
    url: "https://example.com/ja/page",
    title: "Example",
    titleCount: 1,
    lang: "ja",
    charset: "UTF-8",
    viewport: "width=device-width, initial-scale=1",
    descriptions: ["An example page"],
    robots: [],
    canonicals: [{ href: "https://example.com/ja/page", resolved: "https://example.com/ja/page", inHead: true }],
    alternates: [],
    openGraph: [],
    twitter: [],
    jsonLd: [],
    microdata: [],
    h1: ["Example"],
    ...extra,
  };
}

const texts = (meta: PageMeta) => checkPage(meta).map((i) => `${i.severity}: ${i.text}`);

test("a tidy page has no issues", () => {
  assert.deepEqual(checkPage(page()), []);
});

test("JSON-LD types, including @graph and arrays, and parse errors", () => {
  assert.deepEqual(
    jsonLdTypes({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite" }, { "@type": ["Organization", "Brand"] }] }),
    ["WebSite", "Organization", "Brand"],
  );
  assert.deepEqual(jsonLdTypes([{ "@type": "BreadcrumbList" }, { "@type": "Article" }]), ["BreadcrumbList", "Article"]);
  assert.deepEqual(parseJsonLd('{"@type":"Product"}'), { types: ["Product"] });
  const broken = parseJsonLd('{"@type": "Product",}');
  assert.deepEqual(broken.types, []);
  assert.ok(broken.error);
  assert.match(texts(page({ jsonLd: [broken] })).join("\n"), /error: JSON-LD block 1 does not parse/);
});

test("URL helpers", () => {
  assert.equal(resolveUrl("/x", "https://example.com/a/b"), "https://example.com/x");
  assert.equal(resolveUrl("http://[bad", "https://example.com/"), "");
  assert.equal(isAbsoluteHttpUrl("https://example.com/"), true);
  assert.equal(isAbsoluteHttpUrl("//example.com/"), false);
  assert.equal(isAbsoluteHttpUrl("/foo"), false);
  assert.equal(samePage("https://example.com/a#x", "https://example.com/a"), true);
  assert.equal(samePage("https://example.com/a?b=1", "https://example.com/a"), false);
});

test("robots: case-insensitive, combined across robots and googlebot", () => {
  const meta = page({ robots: [{ name: "robots", content: "NoIndex, follow" }, { name: "googlebot", content: "nosnippet" }] });
  assert.deepEqual(robotsDirectives(meta), ["noindex", "follow", "nosnippet"]);
  const t = texts(meta).join("\n");
  assert.match(t, /warn: Robots meta says noindex/);
  assert.match(t, /info: noindex together with rel=canonical/);
  assert.match(texts(page({ robots: [{ name: "robots", content: "none" }] })).join("\n"), /noindex/);
});

test("canonical checks", () => {
  assert.match(texts(page({ canonicals: [] })).join("\n"), /info: No rel=canonical/);
  const relative = { href: "/ja/page", resolved: "https://example.com/ja/page", inHead: true };
  assert.match(texts(page({ canonicals: [relative] })).join("\n"), /warn: rel=canonical is not an absolute URL/);
  const body = { href: "https://example.com/ja/page", resolved: "https://example.com/ja/page", inHead: false };
  assert.match(texts(page({ canonicals: [body] })).join("\n"), /error: rel=canonical outside <head>/);
  const other = { href: "https://example.com/en/page", resolved: "https://example.com/en/page", inHead: true };
  const t = texts(page({ canonicals: [page().canonicals[0]!, other] })).join("\n");
  assert.match(t, /error: 2 rel=canonical links pointing to different URLs/);
  assert.match(t, /info: Canonical points to another URL: https:\/\/example.com\/en\/page/);
});

test("hreflang checks follow Google's rules", () => {
  assert.equal(isValidHreflang("ja"), true);
  assert.equal(isValidHreflang("en-GB"), true);
  assert.equal(isValidHreflang("zh-Hant-TW"), true);
  assert.equal(isValidHreflang("x-default"), true);
  assert.equal(isValidHreflang("jp-ja"), true); // shape-valid; Google's rule is about the code lists
  assert.equal(isValidHreflang("english"), false);
  assert.equal(isValidHreflang("en_US"), false);

  const ok = page({
    alternates: [
      { hreflang: "ja", href: "https://example.com/ja/page", resolved: "https://example.com/ja/page" },
      { hreflang: "en", href: "https://example.com/en/page", resolved: "https://example.com/en/page" },
      { hreflang: "x-default", href: "https://example.com/page", resolved: "https://example.com/page" },
    ],
  });
  assert.deepEqual(checkPage(ok), []);

  const bad = page({
    alternates: [
      { hreflang: "en_US", href: "/en/page", resolved: "https://example.com/en/page" },
    ],
  });
  const t = texts(bad).join("\n");
  assert.match(t, /warn: hreflang "en_US" is not a language code/);
  assert.match(t, /warn: hreflang URL is not fully qualified: \/en\/page/);
  assert.match(t, /warn: hreflang links do not include this page itself/);
  assert.match(t, /info: No hreflang x-default/);
});

test("Open Graph: missing required properties only when some og:* exist", () => {
  assert.deepEqual(checkPage(page()), []);
  const t = texts(page({ openGraph: [{ property: "og:title", content: "x" }] })).join("\n");
  assert.match(t, /info: Open Graph is missing og:type, og:image, og:url/);
});

test("title and description checks", () => {
  assert.match(texts(page({ title: "", titleCount: 0 })).join("\n"), /warn: No <title>/);
  assert.match(texts(page({ descriptions: [] })).join("\n"), /info: No meta description/);
  assert.match(texts(page({ descriptions: ["a", "b"] })).join("\n"), /warn: 2 meta descriptions/);
});

test("issues are ordered error, warn, info", () => {
  const severities = checkPage(
    page({
      descriptions: [],
      robots: [{ name: "robots", content: "noindex" }],
      jsonLd: [{ types: [], error: "Unexpected token" }],
    }),
  ).map((i) => i.severity);
  assert.deepEqual(severities, [...severities].sort((a, b) => ["error", "warn", "info"].indexOf(a) - ["error", "warn", "info"].indexOf(b)));
  assert.equal(severities[0], "error");
});

test("markdown report", () => {
  const md = toMarkdown(
    page({
      title: "A | B",
      openGraph: [{ property: "og:title", content: "A" }],
      jsonLd: [{ types: ["Article"] }],
      microdata: ["https://schema.org/Product"],
    }),
  );
  assert.match(md, /^# Page meta: https:\/\/example.com\/ja\/page/);
  assert.match(md, /\| title \| A \\\| B \|/);
  assert.match(md, /## Open Graph/);
  assert.match(md, /- JSON-LD 1: Article/);
  assert.match(md, /- Microdata: https:\/\/schema.org\/Product/);
});
