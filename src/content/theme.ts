// Panel stylesheet, after the Tokyo Night VS Code theme
// (https://github.com/tokyo-night/tokyo-night-vscode-theme). Palette values
// are the theme's own: editor background #1a1b26, sidebar #16161e, input
// #14141b, foreground #a9b1d6, bright foreground #c0caf5, comments #565f89,
// sidebar foreground #787c99, terminal black #414868, blue #7aa2f7, cyan
// #7dcfff, magenta #bb9af7, green #9ece6a, yellow #e0af68, red #f7768e,
// button #3d59a1. Read from the repository README and
// themes/tokyo-night-color-theme.json on 2026-09-03.

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.pm-drawer {
  --bg: #1a1b26;
  --bg-side: #16161e;
  --bg-input: #14141b;
  --bg-card: #16161e;
  --bg-hover: #1f2335;
  --border: #101014;
  --border-soft: #414868;
  --fg: #a9b1d6;
  --fg-bright: #c0caf5;
  --fg-muted: #787c99;
  --fg-comment: #565f89;
  --blue: #7aa2f7;
  --cyan: #7dcfff;
  --magenta: #bb9af7;
  --green: #9ece6a;
  --yellow: #e0af68;
  --red: #f7768e;
  --button: #3d59a1;
  color-scheme: dark;
  position: fixed; top: 0; bottom: 0; width: min(460px, 100vw);
  background: var(--bg); color: var(--fg);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  border-left: 1px solid var(--border);
  box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 16px 48px rgba(0,0,0,.6);
  display: flex; flex-direction: column; z-index: 2147483647;
}
.pm-drawer.pm-right { right: 0; }
.pm-drawer.pm-left { left: 0; border-left: 0; border-right: 1px solid var(--border); }
.pm-drawer.pm-bottom { left: 0; right: 0; top: auto; width: 100%; height: min(50vh, 460px); border-left: 0; border-top: 1px solid var(--border); }
.pm-drawer.pm-bottom .pm-row { grid-template-columns: 160px 1fr; }
.pm-drawer.pm-bottom textarea { min-height: 80px; }
.pm-drawer.pm-bottom .pm-toast { left: auto; right: 12px; max-width: 520px; }
.pm-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-side); border-bottom: 1px solid var(--border); }
.pm-title { font-weight: 700; font-size: 14px; color: var(--fg-bright); letter-spacing: .02em; }
.pm-title::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--blue); margin-right: 8px; vertical-align: 1px; }
.pm-version { color: var(--fg-comment); font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pm-spacer { flex: 1; }
.pm-tabs { display: flex; gap: 2px; padding: 4px 10px 0; background: var(--bg-side); border-bottom: 1px solid var(--border); overflow-x: auto; }
.pm-tab { border: 0; background: none; padding: 8px 10px; cursor: pointer; font: inherit; color: var(--fg-muted); border-bottom: 2px solid transparent; white-space: nowrap; }
.pm-tab:hover { color: var(--fg); }
.pm-tab.pm-active { color: var(--blue); border-bottom-color: var(--blue); font-weight: 600; }
.pm-body { flex: 1; overflow: auto; padding: 12px 14px 24px; scrollbar-color: #868bc433 transparent; }
.pm-desc { color: var(--fg-muted); margin: 0 0 12px; }
.pm-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.pm-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; align-items: start; margin: 8px 0; }
.pm-row-label { font-weight: 600; padding-top: 5px; color: var(--fg-bright); }
.pm-hint { font-weight: 400; color: var(--fg-muted); font-size: 11px; }
.pm-row-control { min-width: 0; }
input[type=text], input[type=number], input[type=url], select, textarea {
  width: 100%; font: inherit; padding: 5px 7px; border: 1px solid var(--border-soft); border-radius: 4px;
  background: var(--bg-input); color: var(--fg);
}
input::placeholder, textarea::placeholder { color: var(--fg-comment); }
input[type=text]:focus, input[type=number]:focus, select:focus, textarea:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 2px rgba(122,162,247,.25); }
input[type=checkbox] { accent-color: var(--blue); }
textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.pm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--cyan); }
.pm-btn { font: inherit; padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border-soft); background: var(--bg-side); color: var(--fg); cursor: pointer; }
.pm-btn:hover { background: var(--bg-hover); color: var(--fg-bright); border-color: var(--fg-comment); }
.pm-btn:disabled { opacity: .45; cursor: default; }
.pm-btn-primary { background: var(--button); border-color: var(--button); color: #ffffff; }
.pm-btn-primary:hover { background: var(--blue); border-color: var(--blue); color: var(--bg); }
.pm-btn-danger { background: rgba(247,118,142,.15); border-color: var(--red); color: var(--red); }
.pm-btn-small { padding: 2px 7px; font-size: 12px; }
.pm-card { border: 1px solid var(--border-soft); border-radius: 6px; padding: 10px 12px; margin: 10px 0; background: var(--bg-card); }
.pm-card.pm-match { border-color: var(--blue); background: #1e2030; }
.pm-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pm-card-head input[type=text] { flex: 1; color: var(--fg-bright); }
.pm-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: rgba(122,162,247,.18); color: var(--blue); white-space: nowrap; }
.pm-badge-muted { background: #7e83b230; color: #acb0d0; }
.pm-fields { width: 100%; border-collapse: collapse; margin-top: 6px; }
.pm-fields th { text-align: left; font-weight: 600; font-size: 11px; color: var(--fg-comment); padding: 2px 4px; text-transform: uppercase; letter-spacing: .04em; }
.pm-fields td { padding: 2px 4px; vertical-align: top; }
.pm-fields input[type=text], .pm-fields select { padding: 3px 5px; }
.pm-check { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.pm-check b { color: var(--fg-bright); font-weight: 600; }
.pm-note { font-size: 12px; color: var(--fg-muted); }
.pm-note code { color: var(--magenta); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pm-error { color: var(--red); font-size: 12px; }
.pm-ok { color: var(--green); font-size: 12px; }
.pm-toast { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px; background: var(--bg-side); box-shadow: 0 8px 24px rgba(0,0,0,.6); display: none; border-left: 3px solid var(--blue); }
.pm-toast.pm-show { display: block; }
.pm-toast-ok { border-color: var(--green); color: var(--green); }
.pm-toast-warn { border-color: var(--yellow); color: var(--yellow); }
.pm-toast-error { border-color: var(--red); color: var(--red); }
input[type=color] { width: 34px; height: 26px; padding: 1px; border: 1px solid var(--border-soft); border-radius: 4px; background: var(--bg-input); cursor: pointer; }
.pm-env { border-top: 1px solid var(--border); padding: 8px 0 4px; }
.pm-env:first-of-type { border-top: 0; }
.pm-env-current { box-shadow: inset 2px 0 0 var(--blue); padding-left: 8px; }
.pm-env-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.pm-env-line > input[type=text] { flex: 1; min-width: 120px; }
.pm-env-tag { font-size: 11px; color: var(--fg-comment); text-transform: uppercase; letter-spacing: .06em; min-width: 42px; }
.pm-env-preview { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; white-space: nowrap; }
.pm-hide-list { display: flex; flex-direction: column; gap: 2px; }
.pm-hide-list .pm-note, .pm-hide-list .pm-ok, .pm-hide-list .pm-error { white-space: nowrap; }
.pm-img-list { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
.pm-img-row { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 4px; cursor: pointer; }
.pm-img-row:hover { background: var(--bg-hover); }
.pm-img-thumb { width: 36px; height: 36px; object-fit: contain; background: var(--bg-input); border: 1px solid var(--border); border-radius: 3px; flex: none; }
.pm-img-meta { display: flex; flex-direction: column; min-width: 0; }
.pm-img-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--fg-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h3 { font-size: 11px; margin: 18px 0 6px; color: var(--fg-comment); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
kbd { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 5px; border: 1px solid var(--border-soft); border-bottom-width: 2px; border-radius: 4px; background: var(--bg-input); color: var(--fg-bright); }
`;
