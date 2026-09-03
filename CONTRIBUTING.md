# Contributing

Thanks for your interest in contributing to pagemods.

## Development

1. Fork / clone the repository
2. Install Node 20 or later and run `npm install`
3. Create a branch: `git switch -c feat/your-change`
4. Verify locally:
   ```bash
   npm run check
   ```
5. Load `dist/` as an unpacked extension and try the change on a real page
6. Commit and open a pull request

## Ground rules

- Nothing leaves the device. There is no network request in the codebase and
  a change that adds one (telemetry, remote config, a crash reporter) is not
  a change to this project.
- A mod is a module. New features go into `src/modules/<name>/` behind the
  `ContentModule` interface and are listed in `src/modules/index.ts`; the
  panel, the storage document and the message router stay generic.
- Decide in pure code, act in thin DOM code. Anything that decides what to
  do (matching, merging, parsing) lives in a file without DOM access and has
  tests under `test/`. Files that touch elements only read and write them.
- Settings are tolerant. Every read goes through a `normalize` function that
  accepts missing, extra and malformed fields, so a document from another
  version or a hand edit still loads.
- The panel is built with `createElement` and `textContent`. No `innerHTML`
  with page or settings data.
- Keep the permission list minimal and explain every entry in the README.

## Reporting bugs

Open an issue with the page (or a reduced HTML snippet), the rule that
misbehaves, and what you expected. Exported settings JSON helps, after you
remove anything private from it.
