// Build the loadable extension, with no bundler in the way.
//
// Chrome runs ES modules in the service worker, and the content script is a
// five-line classic loader that imports the real entry point as a module, so
// tsc alone is enough: compile, then copy what TypeScript does not touch (the
// manifest, the loader, the icons). `--tests` compiles the test tree instead,
// which is the only reason a second output directory exists.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsOnly = process.argv.includes("--tests");
const outDir = testsOnly ? "dist-test" : "dist";
const project = testsOnly ? "tsconfig.json" : "tsconfig.build.json";

await rm(join(root, outDir), { recursive: true, force: true });

const tsc = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsc", "-p", project, "--outDir", outDir],
  { cwd: root, stdio: "inherit" },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

// A compile that emits nothing exits 0, and the failure then surfaces
// somewhere unrelated. Check the output is there while we still know why it
// would not be.
const expected = join(root, outDir, testsOnly ? "test" : "src");
try {
  const emitted = await stat(expected);
  if (!emitted.isDirectory()) throw new Error("not a directory");
} catch {
  console.error(`pagemods: tsc reported success but ${expected} is not there`);
  process.exit(1);
}

if (!testsOnly) {
  await mkdir(join(root, outDir, "src", "content"), { recursive: true });
  await cp(join(root, "manifest.json"), join(root, outDir, "manifest.json"));
  await cp(
    join(root, "src", "content", "loader.js"),
    join(root, outDir, "src", "content", "loader.js"),
  );
  await cp(join(root, "icons"), join(root, outDir, "icons"), { recursive: true });
  console.log(`pagemods: built ${outDir}/ -- load it with chrome://extensions -> Load unpacked`);
}
