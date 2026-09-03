// The few DOM helpers the panel and the module UIs share. No framework: the
// panel re-renders a whole tab from settings whenever settings change, which
// is cheap at this size and keeps every module UI a plain function.

export type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown>;

/** Create an element. Keys starting with "on" become listeners; "class" is the class list. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2), value as EventListener);
      } else if (key === "class") {
        el.className = String(value);
      } else if (key === "value" || key === "checked" || key === "disabled" || key === "selected") {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else if (key === "dataset" && typeof value === "object") {
        Object.assign(el.dataset, value as Record<string, string>);
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** A labelled control row: label on the left, control on the right. */
export function row(label: string, control: Child, hint?: string): HTMLElement {
  return h(
    "div",
    { class: "pm-row" },
    h("div", { class: "pm-row-label" }, label, hint ? h("div", { class: "pm-hint" }, hint) : null),
    h("div", { class: "pm-row-control" }, control),
  );
}

export function button(label: string, onclick: () => void, kind: "primary" | "normal" | "danger" = "normal"): HTMLButtonElement {
  return h("button", { class: `pm-btn pm-btn-${kind}`, type: "button", onclick }, label);
}

/** Two-step destructive button: the first click arms it, the second runs it. */
export function confirmButton(label: string, confirmLabel: string, run: () => void): HTMLButtonElement {
  let armed = false;
  const btn = button(label, () => {
    if (!armed) {
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add("pm-btn-danger");
      setTimeout(() => {
        armed = false;
        btn.textContent = label;
        btn.classList.remove("pm-btn-danger");
      }, 4000);
      return;
    }
    armed = false;
    run();
  });
  return btn;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}
