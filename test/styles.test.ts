import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSelector,
  buildStylesheet,
  escapeIdent,
  matchingRules,
  normalizeStyles,
  ruleForUrl,
  withSelector,
  type ElementLike,
  type StyleRule,
} from "../src/modules/styles/rules.js";

function rule(partial: Partial<StyleRule> = {}): StyleRule {
  return { id: "r1", name: "", url: ".", enabled: true, hide: [], css: "", ...partial };
}

function node(tag: string, partial: Partial<ElementLike> = {}): ElementLike {
  return { tag, id: "", classes: [], parent: null, nthOfType: 1, ...partial };
}

/** A counter where the listed selectors are unique and everything else is common. */
const unique =
  (...selectors: string[]) =>
  (selector: string): number =>
    selectors.includes(selector) ? 1 : 5;

test("rules apply by URL pattern", () => {
  const rules = [
    rule({ id: "a", url: "^https://example\\.com" }),
    rule({ id: "b", url: "^https://other\\.example" }),
    rule({ id: "c", url: "^https://example\\.com", enabled: false }),
    rule({ id: "d", url: "(" }),
  ];
  assert.deepEqual(
    matchingRules(rules, "https://example.com/a").map((r) => r.id),
    ["a"],
  );
});

test("the stylesheet hides each selector on its own and keeps our UI", () => {
  const rules = [
    rule({ id: "a", name: "ads", url: ".", hide: [".banner", "  ", "#promo"], css: "body { color: red; }" }),
    rule({ id: "b", name: "off", url: "nowhere", hide: [".x"] }),
  ];
  const { css, matched } = buildStylesheet(rules, "https://example.com/");
  assert.deepEqual(
    matched.map((r) => r.id),
    ["a"],
  );
  const lines = css.split("\n");
  assert.deepEqual(lines, [
    "/* pagemods: ads */",
    ".banner { display: none !important; }",
    "#promo { display: none !important; }",
    "body { color: red; }",
    "/* pagemods: keep our own UI reachable */",
    "#pagemods-host, #pagemods-env-badge, #pagemods-picker { display: block !important; }",
  ]);
  // One bad selector must not take the others with it.
  assert.ok(!css.includes(".banner, #promo"));
});

test("a rule name cannot close the comment, and nothing renders without a match", () => {
  const sneaky = buildStylesheet([rule({ name: "a */ body { display: none }", hide: [".x"] })], "https://x/");
  assert.ok(!sneaky.css.includes("*/ body"));
  assert.ok(sneaky.css.includes("/* pagemods: a * / body { display: none } */"));
  assert.equal(buildStylesheet([rule({ url: "nope" })], "https://x/").css, "");
});

test("identifiers are escaped for use in a selector", () => {
  assert.equal(escapeIdent("card"), "card");
  assert.equal(escapeIdent("Button_root__2x9"), "Button_root__2x9");
  assert.equal(escapeIdent("a:b"), "a\\:b");
  assert.equal(escapeIdent("w-1/2"), "w-1\\/2");
  assert.equal(escapeIdent("見出し"), "見出し");
  assert.equal(escapeIdent("2col"), "\\32 col");
});

test("selectors prefer an id, then classes, then an ancestor chain", () => {
  const withId = node("div", { id: "main" });
  assert.equal(buildSelector(withId, unique("#main")), "#main");

  const card = node("div", { classes: ["card", "promo"] });
  assert.equal(buildSelector(card, unique("div.card.promo")), "div.card.promo");

  // Not unique on its own: climb to the parent.
  const parent = node("section", { classes: ["main"] });
  const child = node("div", { classes: ["card"], parent });
  assert.equal(buildSelector(child, unique("section.main > div.card")), "section.main > div.card");

  // An ancestor with an id anchors it without the whole chain.
  const wrap = node("section", { id: "wrap" });
  const inner = node("div", { classes: ["card"], parent: wrap });
  assert.equal(buildSelector(inner, unique("#wrap div.card")), "#wrap div.card");

  // Same classes everywhere: position tells them apart.
  const second = node("li", { classes: ["row"], nthOfType: 2 });
  assert.equal(buildSelector(second, unique("li.row:nth-of-type(2)")), "li.row:nth-of-type(2)");
});

test("an id that is not unique is not trusted", () => {
  const duplicated = node("div", { id: "item", classes: ["card"] });
  assert.equal(buildSelector(duplicated, unique("div.card")), "div.card");
});

test("when nothing is unique the full positional chain comes back", () => {
  const top = node("main", { nthOfType: 1 });
  const middle = node("ul", { parent: top, nthOfType: 2 });
  const leaf = node("li", { classes: ["row"], parent: middle, nthOfType: 3 });
  const selector = buildSelector(leaf, () => 5);
  assert.equal(selector, "main:nth-of-type(1) > ul:nth-of-type(2) > li.row:nth-of-type(3)");
});

test("a rule built for a page covers its origin", () => {
  const built = ruleForUrl("https://example.com/a/b?x=1");
  assert.equal(built.name, "example.com");
  assert.equal(built.url, "^https://example\\.com");
  assert.ok(new RegExp(built.url).test("https://example.com/elsewhere"));
  assert.ok(!new RegExp(built.url).test("https://other.example/"));

  const once = withSelector(built, ".ad");
  assert.deepEqual(once.hide, [".ad"]);
  assert.deepEqual(withSelector(once, " .ad ").hide, [".ad"]);
  assert.deepEqual(withSelector(once, "").hide, [".ad"]);
  assert.deepEqual(withSelector(once, ".promo").hide, [".ad", ".promo"]);
});

test("normalize tolerates junk", () => {
  const s = normalizeStyles({ rules: [{ name: 5, hide: [".a", 7, null], css: 9 }, "junk"] });
  assert.equal(s.rules.length, 2);
  assert.equal(s.rules[0]?.name, "");
  assert.equal(s.rules[0]?.enabled, true);
  assert.deepEqual(s.rules[0]?.hide, [".a"]);
  assert.equal(s.rules[0]?.css, "");
  assert.ok(s.rules[0]?.id);
  assert.deepEqual(normalizeStyles(undefined).rules, []);
});
