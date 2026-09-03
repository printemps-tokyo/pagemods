# pagemods

Small, pluggable mods for the page you are on, with a settings panel that
opens inside the page.

Two mods ship today:

- Form fill. A rule is picked by a URL pattern, a field by a name/id pattern,
  and the value goes in. Fill from a button, the context menu or a keyboard
  command. Capture turns what you have already typed into a rule, so the
  usual way to write one is to fill the form once and press Capture.
- Auto reload. Reload the current tab every N seconds until you stop it, with
  a countdown in the panel and a badge on the toolbar icon.

Everything is local: one settings document in `chrome.storage.local`, no
network requests, no analytics, no remote code. TypeScript, Manifest V3, no
bundler and no runtime dependency.

## Install

There is no store listing yet. Build and load the unpacked extension:

```sh
npm install
npm run build
```

Then open `chrome://extensions`, switch on Developer mode, choose Load
unpacked and select the `dist/` directory. For `file://` pages, also switch on
"Allow access to file URLs" on the extension's card.

Requires Chrome 125 or later.

## Use

Press `Ctrl+;` on any page to open the panel (change the shortcut in the
General tab; the toolbar icon and `Alt+Shift+P` open it as well). The panel
has one tab per mod plus General.

### Form fill

1. Open the page, fill the form the way you want it filled next time.
2. Open the panel, Form fill tab, click Capture this page (or use the context
   menu entry). A rule appears for this page: the URL pattern is the page's
   origin and path, anchored at the start, and every filled-in control with a
   `name` or `id` became a field with an anchored pattern and the value you
   typed. Password fields are skipped unless you switch that on.
3. Next time, click Fill now (or the context menu, or the command you bound
   at `chrome://extensions/shortcuts`). Every enabled rule whose URL pattern
   matches the page is applied, in order.

Edit anything in place: the URL regex, each field's pattern, what it matches
against (name, id, name-or-id, label text, or a CSS selector) and its value.
Changes save when you leave the input. Test on this page tells you how many
controls each field would hit right now, without filling anything.

Values:

- Text, textarea, email, number and the like: the value as typed. The
  extension writes through the element's native setter and fires `input` and
  `change`, so React, Vue and similar frameworks pick it up.
- Checkbox: `true`/`false` (also `yes`/`no`, `on`/`off`, `1`/`0`); any other
  value checks the box when it equals the box's own `value`.
- Radio: the value of the button to select. A pattern that matches the whole
  group selects exactly that button.
- Select: an option's value, or its visible text.
- Multiple select: values separated by `|`.

Patterns are JavaScript regular expressions and case-sensitive; write
`(?i:signup)` for a case-insensitive part. A later rule, or a later field in
the same rule, wins when two of them hit the same control, so put broad
patterns first and specific ones after.

### Auto reload

Open the Auto reload tab, set the seconds, click Start in this tab. The tab
reloads itself on that interval until you click Stop, close the tab, or quit
the browser. The state follows the tab, not the URL, so it keeps going after
you navigate. The default interval is what the context menu entry and the
keyboard command use.

### General

- In-page shortcut: type it or click Record and press the keys. Chrome's own
  shortcut list cannot bind punctuation, which is why this one is matched in
  the page and why `Ctrl+;` can be the default.
- Panel side, per-mod on/off switches, export and import of the whole
  settings document as JSON, reset.

## Adding a mod

A mod is one object implementing `ContentModule` (`src/lib/registry.ts`):

```ts
export const myModule: ContentModule = {
  id: "mymod",
  title: "My mod",
  description: "One line for the General tab.",
  actions: [{ id: "go", label: "Do it", run: (ctx) => doIt(ctx) }],
  init(ctx) {
    /* runs once per page load when enabled */
  },
  onMessage(message, ctx) {
    /* claim messages prefixed with your id; return { handled: true } */
    return { handled: false };
  },
  renderSettings(root, ctx) {
    /* build your UI with the helpers in src/content/ui.ts */
  },
};
```

Append it to `MODULES` in `src/modules/index.ts`. Its settings live under
`settings.modules.mymod`; read them with `moduleSettings(ctx.settings(),
"mymod", normalizeMyMod)` and write them with `ctx.store.updateModule(...)`.
The panel re-renders from storage after every write, so UIs are plain
functions of the settings and keep no state of their own. If the mod needs
the service worker (a per-tab registry, alarms, tabs), put that part in a
`background.ts` next to it and wire its install function and message handler
into `src/background.ts`, and add a context-menu/command entry there if it
should be reachable without the panel.

## Development

```sh
npm run typecheck
npm test          # node --test over the pure logic: rules, shortcuts, settings
npm run build     # dist/ ready for Load unpacked
npm run check     # all three
```

The DOM-facing code is deliberately thin: `rules.ts` decides what to fill
from a list of control snapshots and is fully unit-tested; `content.ts` only
reads and writes elements.

## Permissions

- `storage`: the settings document (`local`) and the auto-reload registry
  (`session`).
- `contextMenus`: the right-click entries.
- Content script on `http`, `https` and `file` pages: the panel and the
  shortcut have to be available on any page you might want to fill or reload.
  Nothing is read from a page until you click Fill, Capture or Test.

## Limitations

- Fields inside cross-origin iframes are not filled; the content script runs
  in the top frame only.
- Rules and values are stored as plain text in the browser profile. Keep
  secrets out of them, or at least keep password capture off (the default).
- Pages that prompt before unloading will still prompt on auto-reload.

## License

MIT
