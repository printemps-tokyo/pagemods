// The badge, and the navigation that switches environments.
//
// The badge sits in its own host element with a closed shadow root, apart
// from the panel, so a page's stylesheet cannot restyle it and it survives
// the panel opening and closing. It never takes pointer events: a marker
// that swallows clicks in the corner of a page would be worse than no
// marker at all.

import { badgeText, contrastText, cornerCss, switchUrl, type EnvEntry, type EnvSite } from "./rules.js";

const HOST_ID = "pagemods-env-badge";

let host: HTMLDivElement | null = null;
let pill: HTMLSpanElement | null = null;

function ensureHost(): HTMLSpanElement {
  if (host !== null && pill !== null && host.isConnected) return pill;
  host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .pill {
      display: inline-block;
      font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 5px 9px;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
      white-space: nowrap;
    }
  `;
  pill = document.createElement("span");
  pill.className = "pill";
  shadow.appendChild(style);
  shadow.appendChild(pill);
  (document.body ?? document.documentElement).appendChild(host);
  return pill;
}

export function removeBadge(): void {
  if (host !== null) host.remove();
  host = null;
  pill = null;
}

export function renderBadge(site: EnvSite, env: EnvEntry): void {
  if (!env.badge.enabled) {
    removeBadge();
    return;
  }
  const span = ensureHost();
  const text = badgeText(env);
  span.textContent = text;
  span.style.background = env.badge.color;
  span.style.color = contrastText(env.badge.color);
  span.style.opacity = String(env.badge.opacity);
  if (host !== null) {
    host.setAttribute("style", `${cornerCss(env.badge.corner)}z-index:2147483646;pointer-events:none;`);
    // The page can see the host element anyway, so name what it is: it makes
    // the badge findable in screenshots, tests and bug reports.
    host.dataset.env = text;
    host.dataset.site = site.name;
  }
}

/** Go to the same page in `to`. Returns the URL it navigated to, or null. */
export function goTo(from: EnvEntry, to: EnvEntry, href = location.href): string | null {
  const target = switchUrl(href, from, to);
  if (target === null || target === href) return null;
  location.assign(target);
  return target;
}
