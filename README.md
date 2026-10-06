# pagemods

Small, pluggable mods for the page you are on, with a settings panel that
opens inside the page.

Seven mods ship today:

- Form fill. A rule is picked by a URL pattern, a field by a name/id pattern,
  and the value goes in. Fill from a button, the context menu or a keyboard
  command. Capture turns what you have already typed into a rule, so the
  usual way to write one is to fill the form once and press Capture.
- Form inspector. List every form control on the page with its type, id,
  name and label, grouped by form, and copy the list as Markdown or TSV.
- Page meta. What the page tells search engines and link previews: title,
  description, canonical, robots, hreflang, Open Graph, Twitter cards and
  structured data, with checks that cite Google's and ogp.me's rules.
- Site styles. Hide an element by picking it or right-clicking it, and add
  your own CSS, per site. The page stays that way on every visit.
- Environments. Open the same page in local, staging or production, and wear
  a corner badge that says which one you are on. Position, colour, opacity,
  text and on/off are set per environment.
- Image grab. Download every image on the page into one folder, either side
  by side or in the site's own directory structure, with size and type
  filters.
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

### Form inspector

Open the Form inspector tab to see every `input`, `textarea`, `select` and
`button` on the page, one table per form (with the form's id or name, method
and action) and a last table for controls outside any form. A control tied to
a form by its `form` attribute is listed under that form. Columns: type, id,
name, label (from `<label>`, `aria-label` or `aria-labelledby`; the
placeholder in parentheses when there is none; a button's own text) and flags
(required, disabled, readonly, hidden, number of options).

- Click a row to scroll to the control and outline it for a moment.
- Hidden controls (`type=hidden`, or not rendered because of `display:none`
  on it or an ancestor) and buttons can be left out with the checkboxes.
- Current values are off by default. When switched on, passwords still show
  only `(filled)`.
- Copy as Markdown (a table per form) or TSV (one row per control, for a
  spreadsheet). Rescan after the page changes.

Shadow DOM and iframes are not entered.

### Page meta

Open the Page meta tab to see, read from the page as it is now:

- Basics: title, meta description, rel=canonical, the robots directives in
  effect (`robots`, `googlebot` and `googlebot-news` metas, case-insensitive),
  `lang`, charset, viewport and every `h1`.
- hreflang alternates, Open Graph (`og:*`, with the `og:image` previewed),
  Twitter cards (`twitter:*`), JSON-LD blocks with their `@type`s (including
  `@graph`) and top-level microdata item types.
- Issues, most severe first. Each check comes from a published rule:
  - [Google, canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls):
    a rel=canonical outside `<head>` is ignored; absolute URLs are
    recommended; noindex is not the way to choose a canonical. More than one
    canonical is flagged, as an error when they point to different URLs.
  - [Google, hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions):
    each language version must list itself; alternate URLs must be fully
    qualified; codes are ISO 639-1 with an optional region; `x-default` is
    recommended.
  - [Google, robots meta](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag):
    `noindex` (or `none`) is pointed out.
  - [ogp.me](https://ogp.me/): `og:title`, `og:type`, `og:image` and `og:url`
    are required once a page uses Open Graph.
  - A JSON-LD block that is not valid JSON; a missing `<title>`; more than one
    meta description.

  There are no length rules for titles or descriptions: Google does not
  publish any.
- Copy as Markdown or JSON (the JSON includes the issues).

HTTP headers, such as `X-Robots-Tag`, are not visible to the page and are not
checked.

### Site styles

Two ways to hide something:

- Right-click it and choose "pagemods: hide this element on this site".
- Open the Site styles tab and click "Pick an element to hide", then click the
  element. The panel steps aside, the element under the pointer is outlined,
  and Esc cancels.

Either way a selector is added to the rule for that origin, one is created if
there is none, and the element is hidden from then on. The tab lists every
selector with how many elements it matches right now, so a selector that has
gone stale is visible at a glance; an invalid one says so instead of failing
quietly. Remove a selector and the element comes back.

The CSS box below the list is injected as typed, and applies while you type.
Both hiding and CSS are per rule, and a rule is picked by a URL pattern, so
one rule can cover a whole site and another only its checkout.

Hiding uses `display: none`, so nothing is removed from the page and a script
that expects the element still finds it. Each selector becomes its own CSS
rule: one invalid selector cannot take the rest of the list down with it. The
extension's own panel and badge are always kept visible, so a broad selector
cannot hide the thing you would undo it with.

Selectors are generated from what the element has: its id when that is unique,
otherwise its tag and classes, otherwise the shortest ancestor chain that
picks it out. Sites that generate class names per build (`Button_root__2x9Kz`)
will need the selector edited by hand once, since the generated name changes
on the next deploy.

### Environments

A site is one project with several environments; an environment is a base URL.
Everything after that prefix -- path, query and hash -- carries over when you
switch, so the page you are looking at opens as the same page over there.

1. Open the project in any environment, then Environments tab, Add site from
   this page. The origin becomes the first environment.
2. Add the others and give each a base URL, for example `http://localhost:3000`,
   `https://stg.example.com` and `https://example.com`. A base may include a
   path (`https://example.com/app`); the longer prefix wins when two overlap.
3. Switch with the buttons at the top of the tab, the context menu, or a key
   you bind to "Switch to the next environment" at `chrome://extensions/shortcuts`.

Each environment carries its own badge: on/off, one of eight positions (four
corners, and the middle of each edge), colour, opacity from 0.1 to 1, and text
that defaults to the environment label. New environments start red for
production, yellow for staging and green for local, and the badge picks black
or white text for readability on the colour you choose. The badge never takes
pointer events, so it cannot swallow a click meant for the page.

When a project needs it, an environment can carry an explicit match pattern
instead of the base prefix, for example `^https://(www\.)?example\.com` to
treat both hosts as production.

### Image grab

Image grab tab, Scan this page, then Download selected. Files land in a folder
under the browser's download directory.

- Folder: a path under the download directory, with `{host}` and `{date}`
  filled in. Chrome only lets an extension write there, so an absolute path
  elsewhere is not possible; change the download directory in Chrome's
  settings if you need another root.
- Layout: `Flat` puts every file directly in the folder, numbered in page
  order. `Mirror` rebuilds the image's own URL path and file name under the
  folder, so `https://example.com/assets/img/hero.jpg` arrives as
  `<folder>/assets/img/hero.jpg`. Numbering and the file prefix are ignored
  in mirror mode, since they would rewrite the names it exists to keep;
  paths are capped at eight directories deep.
- Minimum size skips icons and spacers. An image whose size the browser does
  not know is kept rather than dropped.
- Duplicated URLs collapse, names keep their extension, and colliding names
  get a numeric suffix before Chrome's own uniquifying has to step in. Two
  images that want one path (the same name on another host, or a
  query-string variant) are separated that way in mirror mode too.
- CSS background images are opt-in: finding them means reading computed styles
  for every element.
- `data:` and `blob:` images are skipped; the downloads API cannot fetch them.
- At most 300 files per run.

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
- Panel position (right, left or a drawer along the bottom), per-mod on/off switches, export and import of the whole
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
- `downloads`: image grab, which is the only thing that writes files.
- Content script on `http`, `https` and `file` pages: the panel and the
  shortcut have to be available on any page you might want to fill or reload.
  Nothing is read from a page until you click Fill, Capture or Test.

## Limitations

- Fields inside cross-origin iframes are not filled; the content script runs
  in the top frame only.
- Rules and values are stored as plain text in the browser profile. Keep
  secrets out of them, or at least keep password capture off (the default).
- Pages that prompt before unloading will still prompt on auto-reload.
- Site styles are injected once the page has loaded, so a hidden element can
  flash before it disappears.
- Downloaded images go under the browser's download directory and nowhere
  else; that is a Chrome rule, not a choice this extension makes.
- Images behind hotlink protection may fail: the downloads API fetches them
  again rather than reusing what the page already loaded.
- The environment badge follows the URL on ordinary navigations and on
  history changes; a single-page app that only calls `pushState` under a base
  URL with a path can leave it stale until the next load.

## License

MIT
