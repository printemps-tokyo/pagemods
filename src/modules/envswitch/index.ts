// Environment switcher: open the same page in another environment, and mark
// which one you are on.

import type { ContentModule, ModuleContext } from "../../lib/registry.js";
import { moduleSettings } from "../../lib/settings.js";
import { button, confirmButton, h } from "../../content/ui.js";
import { goTo, removeBadge, renderBadge } from "./content.js";
import {
  BADGE_CORNERS,
  BADGE_CORNER_LABELS,
  DEFAULTS,
  badgeText,
  contrastText,
  locate,
  newEnv,
  nextEnv,
  normalizeBase,
  normalizeColor,
  normalizeEnvswitch,
  normalizeOpacity,
  siteFromUrl,
  switchUrl,
  type BadgeCorner,
  type EnvEntry,
  type EnvSite,
  type EnvswitchSettings,
} from "./rules.js";

export const ENVSWITCH_ID = "envswitch";

function current(ctx: ModuleContext): EnvswitchSettings {
  return moduleSettings(ctx.settings(), ENVSWITCH_ID, normalizeEnvswitch);
}

async function save(
  ctx: ModuleContext,
  update: (s: EnvswitchSettings) => EnvswitchSettings,
): Promise<void> {
  await ctx.store.updateModule(ENVSWITCH_ID, DEFAULTS, (raw) => update(normalizeEnvswitch(raw)));
}

function refreshBadge(ctx: ModuleContext): void {
  const found = locate(current(ctx), location.href);
  if (found === null) {
    removeBadge();
    return;
  }
  renderBadge(found.site, found.env);
}

function switchTo(ctx: ModuleContext, to: EnvEntry): void {
  const found = locate(current(ctx), location.href);
  if (found === null) {
    ctx.notify("No environment matches this page", "warn");
    return;
  }
  const target = goTo(found.env, to);
  if (target === null) {
    ctx.notify(`Already on ${to.label || "that environment"}, or its base URL is empty`, "warn");
  }
}

function cycle(ctx: ModuleContext): void {
  const found = locate(current(ctx), location.href);
  if (found === null) {
    ctx.notify("No environment matches this page", "warn");
    return;
  }
  const to = nextEnv(found.site, found.env);
  if (to === null) {
    ctx.notify("This site needs a second environment with a base URL", "warn");
    return;
  }
  switchTo(ctx, to);
}

function renderSettings(root: HTMLElement, ctx: ModuleContext): void {
  const settings = current(ctx);
  const found = locate(settings, location.href);

  if (found === null) {
    root.appendChild(
      h(
        "p",
        { class: "pm-note" },
        "No environment matches this page. Add the site below, then give it the other environments' base URLs.",
      ),
    );
  } else {
    root.appendChild(
      h(
        "p",
        { class: "pm-note" },
        "This page is ",
        h("b", null, found.env.label || badgeText(found.env)),
        " of ",
        h("b", null, found.site.name || "this site"),
        ".",
      ),
    );
    const buttons = found.site.environments
      .filter((env) => env.id !== found.env.id && normalizeBase(env.base) !== "")
      .map((env) =>
        button(`Open in ${env.label || normalizeBase(env.base)}`, () => switchTo(ctx, env), "primary"),
      );
    if (buttons.length > 0) root.appendChild(h("div", { class: "pm-actions" }, ...buttons));
  }

  root.appendChild(
    h(
      "div",
      { class: "pm-actions" },
      button("Add site from this page", () => {
        void save(ctx, (s) => ({ ...s, sites: [...s.sites, siteFromUrl(location.href)] }));
      }),
    ),
  );

  for (const site of settings.sites) {
    root.appendChild(renderSite(site, ctx, found?.env.id));
  }
}

function renderSite(site: EnvSite, ctx: ModuleContext, currentEnvId: string | undefined): HTMLElement {
  const here = site.environments.some((e) => e.id === currentEnvId);
  const patch = (update: (s: EnvSite) => EnvSite) =>
    void save(ctx, (s) => ({ ...s, sites: s.sites.map((x) => (x.id === site.id ? update(x) : x)) }));

  const enabled = h("input", {
    type: "checkbox",
    checked: site.enabled,
    title: "Enabled",
    onchange: () => patch((s) => ({ ...s, enabled: enabled.checked })),
  });
  const name = h("input", {
    type: "text",
    value: site.name,
    placeholder: "Project name",
    onchange: () => patch((s) => ({ ...s, name: name.value })),
  });

  return h(
    "div",
    { class: `pm-card${here ? " pm-match" : ""}` },
    h(
      "div",
      { class: "pm-card-head" },
      enabled,
      name,
      h("span", { class: `pm-badge${here ? "" : " pm-badge-muted"}` }, here ? "this page" : "other site"),
    ),
    ...site.environments.map((env) => renderEnv(env, site, ctx, patch, env.id === currentEnvId)),
    h(
      "div",
      { class: "pm-actions", style: "margin-top:8px" },
      button("Add environment", () => patch((s) => ({ ...s, environments: [...s.environments, newEnv()] }))),
      confirmButton("Delete site", "Really delete?", () =>
        void save(ctx, (s) => ({ ...s, sites: s.sites.filter((x) => x.id !== site.id) })),
      ),
    ),
  );
}

function renderEnv(
  env: EnvEntry,
  site: EnvSite,
  ctx: ModuleContext,
  patchSite: (update: (s: EnvSite) => EnvSite) => void,
  isCurrent: boolean,
): HTMLElement {
  const patch = (update: (e: EnvEntry) => EnvEntry) =>
    patchSite((s) => ({ ...s, environments: s.environments.map((e) => (e.id === env.id ? update(e) : e)) }));
  const patchBadge = (update: (b: EnvEntry["badge"]) => EnvEntry["badge"]) =>
    patch((e) => ({ ...e, badge: update(e.badge) }));

  const label = h("input", {
    type: "text",
    value: env.label,
    placeholder: "production",
    style: "max-width:120px",
    onchange: () => patch((e) => ({ ...e, label: label.value })),
  });
  const base = h("input", {
    type: "text",
    class: "pm-mono",
    value: env.base,
    placeholder: "https://example.com",
    spellcheck: "false",
    onchange: () => patch((e) => ({ ...e, base: base.value })),
  });
  const open = button("Open", () => {
    const found = locate(current(ctx), location.href);
    if (found === null) {
      ctx.notify("No environment matches this page", "warn");
      return;
    }
    const target = switchUrl(location.href, found.env, env);
    if (target === null) {
      ctx.notify("This environment needs a base URL", "warn");
      return;
    }
    location.assign(target);
  });
  open.classList.add("pm-btn-small");
  open.disabled = isCurrent || normalizeBase(env.base) === "";

  const remove = h(
    "button",
    {
      class: "pm-btn pm-btn-small",
      type: "button",
      title: "Remove environment",
      onclick: () => patchSite((s) => ({ ...s, environments: s.environments.filter((e) => e.id !== env.id) })),
    },
    "x",
  );

  // Badge controls.
  const on = h("input", {
    type: "checkbox",
    checked: env.badge.enabled,
    title: "Show the badge on this environment",
    onchange: () => patchBadge((b) => ({ ...b, enabled: on.checked })),
  });
  const corner = h(
    "select",
    {
      title: "Badge position",
      style: "max-width:130px",
      onchange: () => patchBadge((b) => ({ ...b, corner: corner.value as BadgeCorner })),
    },
    ...BADGE_CORNERS.map((c) =>
      h("option", { value: c, selected: c === env.badge.corner }, BADGE_CORNER_LABELS[c]),
    ),
  );
  const color = h("input", {
    type: "color",
    value: normalizeColor(env.badge.color),
    title: "Badge colour",
    onchange: () => patchBadge((b) => ({ ...b, color: normalizeColor(color.value) })),
  });
  const opacity = h("input", {
    type: "number",
    min: "0.1",
    max: "1",
    step: "0.05",
    value: String(env.badge.opacity),
    title: "Badge opacity (0.1 to 1)",
    style: "max-width:80px",
    onchange: () => patchBadge((b) => ({ ...b, opacity: normalizeOpacity(Number(opacity.value)) })),
  });
  const text = h("input", {
    type: "text",
    value: env.badge.text,
    placeholder: env.label || "badge text",
    title: "Badge text; the label when empty",
    style: "max-width:120px",
    onchange: () => patchBadge((b) => ({ ...b, text: text.value })),
  });
  const preview = h(
    "span",
    {
      class: "pm-env-preview",
      style: `background:${normalizeColor(env.badge.color)};color:${contrastText(env.badge.color)};opacity:${env.badge.opacity}`,
    },
    badgeText(env),
  );
  const match = h("input", {
    type: "text",
    class: "pm-mono",
    value: env.match,
    placeholder: "optional match regex, e.g. ^https://(www\\.)?example\\.com",
    spellcheck: "false",
    onchange: () => patch((e) => ({ ...e, match: match.value })),
  });

  return h(
    "div",
    { class: `pm-env${isCurrent ? " pm-env-current" : ""}` },
    h("div", { class: "pm-env-line" }, label, base, open, remove),
    h(
      "div",
      { class: "pm-env-line" },
      h("span", { class: "pm-env-tag" }, "Badge"),
      on,
      corner,
      color,
      opacity,
      text,
      preview,
    ),
    h("div", { class: "pm-env-line" }, match),
  );
}

export const envswitchModule: ContentModule = {
  id: ENVSWITCH_ID,
  title: "Environments",
  description:
    "Open the same page in another environment (local, staging, production) and mark which one you are on with a corner badge.",
  actions: [{ id: "cycle", label: "Switch to the next environment", run: (ctx) => cycle(ctx) }],
  init(ctx) {
    refreshBadge(ctx);
    // Same-document navigation keeps the badge honest when a base URL
    // includes a path. A pushState-only SPA is not covered; the origin
    // rarely changes there, so the badge stays correct anyway.
    listen(ctx);
  },
  dispose() {
    unlisten();
    removeBadge();
  },
  onSettingsChanged(ctx) {
    refreshBadge(ctx);
  },
  onMessage(message, ctx) {
    if (message.type !== "envswitch:cycle") return { handled: false };
    cycle(ctx);
    return { handled: true };
  },
  renderSettings,
};

let onNav: (() => void) | undefined;

function listen(ctx: ModuleContext): void {
  unlisten();
  onNav = () => refreshBadge(ctx);
  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);
}

function unlisten(): void {
  if (onNav === undefined) return;
  window.removeEventListener("popstate", onNav);
  window.removeEventListener("hashchange", onNav);
  onNav = undefined;
}
