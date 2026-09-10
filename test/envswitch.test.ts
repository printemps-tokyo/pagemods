import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeText,
  contrastText,
  cornerCss,
  defaultColorFor,
  locate,
  nextEnv,
  normalizeBase,
  normalizeColor,
  normalizeEnvswitch,
  normalizeOpacity,
  siteFromUrl,
  switchUrl,
  type EnvEntry,
  type EnvSite,
} from "../src/modules/envswitch/rules.js";

function env(label: string, base: string, extra: Partial<EnvEntry> = {}): EnvEntry {
  return {
    id: label,
    label,
    base,
    match: "",
    badge: { enabled: true, corner: "top-right", color: defaultColorFor(label, base), opacity: 0.9, text: "" },
    ...extra,
  };
}

const site: EnvSite = {
  id: "s1",
  name: "example",
  enabled: true,
  environments: [
    env("local", "http://localhost:3000"),
    env("staging", "https://stg.example.com"),
    env("production", "https://example.com"),
  ],
};

test("locate picks the site and environment, longest prefix first", () => {
  const settings = { sites: [site] };
  assert.equal(locate(settings, "https://example.com/a/b?x=1")?.env.label, "production");
  assert.equal(locate(settings, "http://localhost:3000/a")?.env.label, "local");
  assert.equal(locate(settings, "https://stg.example.com/")?.env.label, "staging");
  assert.equal(locate(settings, "https://other.example/"), null);

  // A base with a path beats the bare origin it sits under.
  const nested: EnvSite = {
    ...site,
    id: "s2",
    environments: [env("production", "https://example.com"), env("app", "https://example.com/app")],
  };
  assert.equal(locate({ sites: [nested] }, "https://example.com/app/x")?.env.label, "app");
  assert.equal(locate({ sites: [nested] }, "https://example.com/x")?.env.label, "production");

  // A disabled site is invisible.
  assert.equal(locate({ sites: [{ ...site, enabled: false }] }, "https://example.com/"), null);
});

test("switchUrl carries path, query and hash across", () => {
  const [local, staging, production] = site.environments as [EnvEntry, EnvEntry, EnvEntry];
  assert.equal(
    switchUrl("https://example.com/products/3?ref=a#top", production, local),
    "http://localhost:3000/products/3?ref=a#top",
  );
  assert.equal(switchUrl("https://example.com", production, staging), "https://stg.example.com/");
  assert.equal(switchUrl("https://example.com/", production, staging), "https://stg.example.com/");
  assert.equal(
    switchUrl("http://localhost:3000/a", local, env("production", "https://example.com/")),
    "https://example.com/a",
  );
  // Base with a path prefix on either side.
  assert.equal(
    switchUrl("https://example.com/app/page", env("app", "https://example.com/app"), local),
    "http://localhost:3000/page",
  );
  // No base to switch to.
  assert.equal(switchUrl("https://example.com/a", production, env("empty", "  ")), null);
  // A custom pattern that matches elsewhere falls back to swapping the origin.
  const custom = env("prod", "https://example.com", { match: "example\\.com" });
  assert.equal(switchUrl("https://example.com/a?b=1", custom, local), "http://localhost:3000/a?b=1");
});

test("cycling skips environments without a base and wraps around", () => {
  const [local, staging, production] = site.environments as [EnvEntry, EnvEntry, EnvEntry];
  assert.equal(nextEnv(site, local)?.label, "staging");
  assert.equal(nextEnv(site, production)?.label, "local");
  assert.equal(nextEnv({ ...site, environments: [production, env("blank", "")] }, production), null);
  assert.equal(nextEnv({ ...site, environments: [staging] }, staging), null);
});

test("badge colours, text and placement", () => {
  assert.equal(defaultColorFor("production"), "#f7768e");
  assert.equal(defaultColorFor("staging"), "#e0af68");
  assert.equal(defaultColorFor("local"), "#9ece6a");
  assert.equal(defaultColorFor("", "http://localhost:8080"), "#9ece6a");
  assert.equal(defaultColorFor("preview"), "#7aa2f7");

  assert.equal(contrastText("#f7768e"), "#16161e");
  assert.equal(contrastText("#e0af68"), "#16161e");
  assert.equal(contrastText("#7aa2f7"), "#16161e");
  assert.equal(contrastText("#1a1b26"), "#ffffff");
  assert.equal(contrastText("#3d59a1"), "#ffffff");

  assert.equal(badgeText(env("staging", "https://stg.example.com")), "staging");
  assert.equal(badgeText(env("", "https://stg.example.com")), "stg.example.com");
  assert.equal(
    badgeText(env("staging", "https://stg.example.com", { badge: { enabled: true, corner: "top-left", color: "#fff", opacity: 1, text: "STG " } })),
    "STG",
  );

  assert.match(cornerCss("top-right"), /top:10px;right:10px/);
  assert.match(cornerCss("bottom-left"), /bottom:10px;left:10px/);
  assert.match(cornerCss("middle-left"), /top:50%;left:10px;transform:translateY\(-50%\)/);
  assert.match(cornerCss("bottom-center"), /bottom:10px;left:50%;transform:translateX\(-50%\)/);
});

test("normalize tolerates junk and clamps", () => {
  assert.equal(normalizeColor("#ABC"), "#aabbcc");
  assert.equal(normalizeColor("red"), "#7aa2f7");
  assert.equal(normalizeColor(42, "#000000"), "#000000");
  assert.equal(normalizeOpacity(5), 1);
  assert.equal(normalizeOpacity(0), 0.1);
  assert.equal(normalizeOpacity("0.5"), 0.5);
  assert.equal(normalizeOpacity(undefined), 0.9);
  assert.equal(normalizeBase("https://example.com/"), "https://example.com");

  const s = normalizeEnvswitch({
    sites: [{ name: 5, environments: [{ label: "prod", base: "https://x", badge: { corner: "nope", opacity: "9" } }, null] }, 7],
  });
  assert.equal(s.sites.length, 2);
  assert.equal(s.sites[0]?.name, "");
  assert.equal(s.sites[0]?.enabled, true);
  assert.equal(s.sites[0]?.environments.length, 2);
  assert.equal(s.sites[0]?.environments[0]?.badge.corner, "top-right");
  assert.equal(s.sites[0]?.environments[0]?.badge.opacity, 1);
  assert.ok(s.sites[0]?.environments[0]?.id);
});

test("a site built from the page you are on", () => {
  const built = siteFromUrl("https://www.example.com/a/b?x=1");
  assert.equal(built.name, "example.com");
  assert.equal(built.environments[0]?.base, "https://www.example.com");
  assert.equal(built.environments[0]?.label, "production");
  assert.equal(siteFromUrl("http://localhost:3000/x").environments[0]?.label, "local");
});
