// Bundles the Chrome helper into extension/dist, the folder you load unpacked.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, "src/background.ts"), join(here, "src/popup.ts")],
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: out,
  sourcemap: false,
  logLevel: "warning",
});

for (const file of ["manifest.json", "popup.html", "icon-16.png", "icon-48.png", "icon-128.png"]) {
  copyFileSync(join(here, file), join(out, file));
}
console.log(`Helper built into ${out}`);
