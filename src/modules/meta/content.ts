// Page meta: the DOM side. Reads the current document into PageMeta. Read-only.

import { parseJsonLd, resolveUrl, type PageMeta } from "./rules.js";

const ROBOTS_NAMES = new Set(["robots", "googlebot", "googlebot-news"]);

const XHTML = "http://www.w3.org/1999/xhtml";

/** The attributes that make Google ignore a rel=canonical. */
const CANONICAL_ALT_ATTRIBUTES = ["hreflang", "lang", "media", "type"];

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Read the page. `doc` is injectable for tests; it defaults to the current document. */
export function readPageMeta(doc: Document = document): PageMeta {
  const url = doc.location?.href ?? doc.URL;
  const base = doc.baseURI || url;
  const metas = Array.from(doc.querySelectorAll<HTMLMetaElement>("meta"));
  const named = (pred: (name: string) => boolean) =>
    metas.filter((m) => pred((m.getAttribute("name") ?? "").toLowerCase()));

  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel]"));
  const rels = (l: HTMLLinkElement) => (l.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);

  return {
    url,
    title: doc.title,
    // HTML titles only: an inline SVG has <title> elements of its own.
    titleCount: Array.from(doc.getElementsByTagName("title")).filter((t) => t.namespaceURI === XHTML).length,
    lang: doc.documentElement.getAttribute("lang") ?? "",
    charset: doc.characterSet,
    viewport: named((n) => n === "viewport")[0]?.getAttribute("content") ?? "",
    descriptions: named((n) => n === "description").map((m) => m.getAttribute("content") ?? ""),
    robots: named((n) => ROBOTS_NAMES.has(n)).map((m) => ({
      name: (m.getAttribute("name") ?? "").toLowerCase(),
      content: m.getAttribute("content") ?? "",
    })),
    canonicals: links
      .filter((l) => rels(l).includes("canonical"))
      .map((l) => {
        const href = l.getAttribute("href") ?? "";
        return {
          href,
          resolved: resolveUrl(href, base),
          inHead: l.closest("head") !== null,
          altAttributes: CANONICAL_ALT_ATTRIBUTES.filter((a) => l.hasAttribute(a)),
        };
      }),
    alternates: links
      .filter((l) => rels(l).includes("alternate") && l.hasAttribute("hreflang"))
      .map((l) => {
        const href = l.getAttribute("href") ?? "";
        return {
          hreflang: l.getAttribute("hreflang") ?? "",
          href,
          resolved: resolveUrl(href, base),
          inHead: l.closest("head") !== null,
        };
      }),
    openGraph: metas
      .filter((m) => (m.getAttribute("property") ?? "").toLowerCase().startsWith("og:"))
      .map((m) => ({ property: (m.getAttribute("property") ?? "").toLowerCase(), content: m.getAttribute("content") ?? "" })),
    twitter: metas
      .filter((m) => (m.getAttribute("name") ?? m.getAttribute("property") ?? "").toLowerCase().startsWith("twitter:"))
      .map((m) => ({
        name: (m.getAttribute("name") ?? m.getAttribute("property") ?? "").toLowerCase(),
        content: m.getAttribute("content") ?? "",
      })),
    jsonLd: Array.from(doc.querySelectorAll('script[type="application/ld+json" i]')).map((s) =>
      parseJsonLd(s.textContent ?? ""),
    ),
    // Top-level items only: per the HTML microdata model, an item that is
    // also an itemprop is a property of another item, not an item of its own.
    microdata: Array.from(doc.querySelectorAll("[itemscope][itemtype]"))
      .filter((el) => !el.hasAttribute("itemprop"))
      .flatMap((el) => (el.getAttribute("itemtype") ?? "").split(/\s+/).filter(Boolean)),
    h1: Array.from(doc.querySelectorAll("h1")).map((h) => text(h)),
  };
}
