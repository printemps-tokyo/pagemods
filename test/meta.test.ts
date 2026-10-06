import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPage,
  directivesFor,
  hasHreflangShape,
  hasHttpScheme,
  isAbsoluteHttpUrl,
  jsonLdTypes,
  mdCell,
  ogValue,
  parseJsonLd,
  resolveUrl,
  samePage,
  toMarkdown,
  usableCanonicals,
  type AlternateLink,
  type CanonicalLink,
  type PageMeta,
} from "../src/modules/meta/rules.js";

const URL0 = "https://example.com/ja/page";

function canonical(href: string, extra: Partial<CanonicalLink> = {}): CanonicalLink {
  return { href, resolved: resolveUrl(href, URL0), inHead: true, altAttributes: [], ...extra };
}

function alternate(hreflang: string, href: string, extra: Partial<AlternateLink> = {}): AlternateLink {
  return { hreflang, href, resolved: resolveUrl(href, URL0), inHead: true, ...extra };
}

function page(extra: Partial<PageMeta> = {}): PageMeta {
  return {
    url: URL0,
    title: "Example",
    titleCount: 1,
    lang: "ja",
    charset: "UTF-8",
    viewport: "width=device-width, initial-scale=1",
    descriptions: ["An example page"],
    robots: [],
    canonicals: [canonical(URL0)],
    alternates: [],
    openGraph: [],
    twitter: [],
    jsonLd: [],
    microdata: [],
    h1: ["Example"],
    ...extra,
  };
}

/** "severity: text subject" lines, for matching. */
const texts = (meta: PageMeta) =>
  checkPage(meta)
    .map((i) => `${i.severity}: ${i.text}${i.subject !== undefined ? ` ${i.subject}` : ""}`)
    .join("\n");

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
  assert.match(texts(page({ jsonLd: [broken] })), /error: JSON-LD block 1 does not parse:/);
});

test("URL helpers: scheme and parsing are separate", () => {
  assert.equal(resolveUrl("/x", "https://example.com/a/b"), "https://example.com/x");
  assert.equal(resolveUrl("http://[bad", "https://example.com/"), "");
  assert.equal(resolveUrl("", "https://example.com/"), "");
  assert.equal(hasHttpScheme("https://[bad"), true);
  assert.equal(isAbsoluteHttpUrl("https://[bad"), false);
  assert.equal(isAbsoluteHttpUrl("https://example.com/"), true);
  assert.equal(isAbsoluteHttpUrl("//example.com/"), false);
  assert.equal(isAbsoluteHttpUrl("/foo"), false);
  assert.equal(samePage("https://example.com/a#x", "https://example.com/a"), true);
  assert.equal(samePage("https://example.com/a?b=1", "https://example.com/a"), false);
});

test("robots: per crawler, case-insensitive; news-only noindex is not a Search noindex", () => {
  const meta = page({ robots: [{ name: "robots", content: "NoIndex, follow" }, { name: "googlebot", content: "nosnippet" }] });
  assert.deepEqual(directivesFor(meta, "googlebot"), ["noindex", "follow", "nosnippet"]);
  const t = texts(meta);
  assert.match(t, /warn: noindex for Google Search/);
  assert.match(t, /info: noindex together with rel=canonical/);
  assert.match(texts(page({ robots: [{ name: "robots", content: "none" }] })), /warn: noindex for Google Search/);

  const newsOnly = texts(page({ robots: [{ name: "googlebot-news", content: "noindex" }] }));
  assert.match(newsOnly, /info: noindex for Google News only/);
  assert.doesNotMatch(newsOnly, /Google Search|together with rel=canonical/);
});

test("canonical checks", () => {
  assert.match(texts(page({ canonicals: [] })), /info: No rel=canonical link\./);
  assert.match(texts(page({ canonicals: [canonical("/ja/page")] })), /warn: rel=canonical is not an absolute URL .* \/ja\/page/);
  assert.match(texts(page({ canonicals: [canonical(URL0, { inHead: false })] })), /error: rel=canonical outside `<head>` is ignored/);
  const t = texts(page({ canonicals: [canonical(URL0), canonical("https://example.com/en/page")] }));
  assert.match(t, /error: 2 rel=canonical links pointing to different URLs/);
  assert.match(t, /info: Canonical points to another URL: https:\/\/example.com\/en\/page/);
});

test("a canonical that does not parse, or has no href, is an error, not silence", () => {
  assert.match(texts(page({ canonicals: [canonical("https://[bad")] })), /error: rel=canonical has no usable URL: https:\/\/\[bad/);
  assert.match(texts(page({ canonicals: [canonical("")] })), /error: rel=canonical has no usable URL: \(no href\)/);
  assert.match(texts(page({ canonicals: [canonical("https://[bad")] })), /info: No rel=canonical link Google would use/);
});

test("a canonical with hreflang, lang, media or type is not used", () => {
  const alt = canonical(URL0, { altAttributes: ["hreflang"] });
  assert.deepEqual(usableCanonicals(page({ canonicals: [alt] })), []);
  const t = texts(page({ canonicals: [alt] }));
  assert.match(t, /error: rel=canonical with hreflang is not used for canonicalization/);
  assert.match(t, /info: No rel=canonical link Google would use/);
  // Only usable canonicals count towards "more than one".
  assert.doesNotMatch(texts(page({ canonicals: [canonical(URL0), canonical("https://example.com/m", { altAttributes: ["media"] })] })), /2 rel=canonical/);
});

test("hreflang checks follow Google's rules", () => {
  assert.equal(hasHreflangShape("ja"), true);
  assert.equal(hasHreflangShape("en-GB"), true);
  assert.equal(hasHreflangShape("zh-Hant-TW"), true);
  assert.equal(hasHreflangShape("x-default"), true);
  assert.equal(hasHreflangShape("jp"), true); // shape only: code lists are not checked (README says so)
  assert.equal(hasHreflangShape("english"), false);
  assert.equal(hasHreflangShape("en_US"), false);

  const ok = page({
    alternates: [
      alternate("ja", URL0),
      alternate("en", "https://example.com/en/page"),
      alternate("x-default", "https://example.com/page"),
    ],
  });
  assert.deepEqual(checkPage(ok), []);

  const t = texts(page({ alternates: [alternate("en_US", "/en/page")] }));
  assert.match(t, /warn: hreflang value is not shaped like a language code .* en_US \/en\/page/);
  assert.match(t, /warn: hreflang URL is not fully qualified: \/en\/page/);
  assert.match(t, /warn: hreflang links do not include this page itself/);
  assert.match(t, /info: No hreflang x-default/);
});

test("hreflang links outside <head> are flagged and do not satisfy the checks", () => {
  const t = texts(
    page({
      alternates: [
        alternate("ja", URL0, { inHead: false }),
        alternate("x-default", "https://example.com/page", { inHead: false }),
        alternate("en", "https://example.com/en/page"),
      ],
    }),
  );
  assert.match(t, /warn: hreflang link outside `<head>` .* ja https:\/\/example.com\/ja\/page/);
  assert.match(t, /warn: hreflang links do not include this page itself/);
  assert.match(t, /info: No hreflang x-default/);
});

test("Open Graph: og:image:url counts as og:image, blanks count as missing", () => {
  assert.deepEqual(checkPage(page()), []);
  assert.match(texts(page({ openGraph: [{ property: "og:title", content: "x" }] })), /info: Open Graph is missing og:type, og:image, og:url/);
  const full = page({
    openGraph: [
      { property: "og:title", content: "x" },
      { property: "og:type", content: "website" },
      { property: "og:image:url", content: "https://example.com/og.png" },
      { property: "og:url", content: URL0 },
    ],
  });
  assert.equal(ogValue(full, "og:image"), "https://example.com/og.png");
  assert.deepEqual(checkPage(full), []);
  const blank = page({ openGraph: REQUIRED.map((property) => ({ property, content: "  " })) });
  assert.match(texts(blank), /info: Open Graph is missing og:title, og:type, og:image, og:url/);
  const relative = page({
    openGraph: [...full.openGraph.slice(0, 2), { property: "og:image", content: "/og.png" }, { property: "og:url", content: URL0 }],
  });
  assert.match(texts(relative), /warn: og:image is not an absolute http\(s\) URL: \/og.png/);
});

const REQUIRED = ["og:title", "og:type", "og:image", "og:url"];

test("title and description checks", () => {
  assert.match(texts(page({ title: "", titleCount: 0 })), /warn: No `<title>`/);
  assert.match(texts(page({ titleCount: 2 })), /warn: 2 `<title>` elements; HTML allows one per document/);
  assert.match(texts(page({ descriptions: [] })), /info: No meta description/);
  assert.match(texts(page({ descriptions: ["a", "b"] })), /warn: 2 meta descriptions/);
});

test("issues are ordered error, warn, info", () => {
  const severities = checkPage(
    page({
      descriptions: [],
      robots: [{ name: "robots", content: "noindex" }],
      jsonLd: [{ types: [], error: "Unexpected token" }],
    }),
  ).map((i) => i.severity);
  const rank = (s: string) => ["error", "warn", "info"].indexOf(s);
  assert.deepEqual(severities, [...severities].sort((a, b) => rank(a) - rank(b)));
  assert.equal(severities[0], "error");
});

test("markdown escapes page text and keeps markup in code spans", () => {
  assert.equal(mdCell("Using <div> &copy; *x* | y"), "Using &lt;div&gt; &amp;copy; \\*x\\* \\| y");
  const md = toMarkdown(
    page({
      title: "A | <b>B</b>",
      canonicals: [canonical(URL0, { inHead: false })],
      openGraph: [{ property: "og:title", content: "A" }],
      jsonLd: [{ types: ["Article"] }],
      microdata: ["https://schema.org/Product"],
    }),
    "2026-10-06 10:00",
  );
  assert.match(md, /^# Page meta: https:\/\/example.com\/ja\/page/);
  assert.match(md, /Scanned 2026-10-06 10:00\./);
  assert.match(md, /\| title \| A \\\| &lt;b&gt;B&lt;\/b&gt; \|/);
  assert.match(md, /- error: rel=canonical outside `<head>` is ignored by Google: https:\/\/example.com\/ja\/page/);
  assert.match(md, /## Open Graph/);
  assert.match(md, /- JSON-LD 1: Article/);
  assert.match(md, /- Microdata: https:\/\/schema.org\/Product/);
});

test("robots directives are page text: escaped in Markdown, not part of the sentence", () => {
  const meta = page({ robots: [{ name: "robots", content: 'noindex, <img src="https://evil.test/x.png">\n# Injected' }] });
  const issue = checkPage(meta).find((i) => i.text.startsWith("noindex for Google Search"));
  assert.ok(issue);
  assert.doesNotMatch(issue.text, /img|Injected/);
  const md = toMarkdown(meta);
  assert.doesNotMatch(md, /<img/);
  assert.doesNotMatch(md, /^# Injected/m);
  assert.match(md, /&lt;img src="https:\/\/evil.test\/x.png"&gt; # Injected/);
});

test("non-http canonicals and hreflang URLs are errors and do not count", () => {
  const js = canonical("javascript:void(0)");
  assert.deepEqual(usableCanonicals(page({ canonicals: [js] })), []);
  const t = texts(page({ canonicals: [js, canonical(URL0)] }));
  assert.match(t, /error: rel=canonical is not an http\(s\) URL: javascript:void\(0\)/);
  assert.doesNotMatch(t, /2 rel=canonical/);
  const mail = texts(page({ alternates: [alternate("ja", URL0), alternate("en", "mailto:a@example.com")] }));
  assert.match(mail, /error: hreflang link is not an http\(s\) URL: en mailto:a@example.com/);
});
