// Bundles the Chrome helper into extension/dist, the folder you load unpacked.
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "dist");
mkdirSync(out, { recursive: true });

// AILI_URL: the hosted AILI this helper is for, e.g. https://aili.example.com.
// Read from the environment or the project's .env. Without it the helper is for
// a local AILI only. It must be one exact address: the page script runs there,
// and a wildcard would let any site on that domain talk to the helper.
const envFile = join(here, "..", ".env");
if (!process.env.AILI_URL && existsSync(envFile)) {
  const line = readFileSync(envFile, "utf8").match(/^\s*AILI_URL\s*=\s*"?([^"\n#]*)"?/m);
  if (line) process.env.AILI_URL = line[1].trim();
}
const hosted = hostedOrigin(process.env.AILI_URL);

function hostedOrigin(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`AILI_URL is not an address: ${value}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) throw new Error(`AILI_URL must start with https:// (${value})`);
  if (url.hostname.includes("*")) throw new Error("AILI_URL must be one exact address, not a wildcard.");
  return local ? "" : url.origin;
}

const define = { __AILI_URL__: JSON.stringify(hosted) };

await build({
  entryPoints: [join(here, "src/background.ts"), join(here, "src/popup.ts")],
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: out,
  sourcemap: false,
  logLevel: "warning",
  define,
});

// The AILI page script is a classic content script, so it is its own bundle.
await build({
  entryPoints: [join(here, "src/aili-page.ts")],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: out,
  sourcemap: false,
  logLevel: "warning",
  define,
});

for (const file of ["popup.html", "icon-16.png", "icon-48.png", "icon-128.png"]) {
  copyFileSync(join(here, file), join(out, file));
}

const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
if (hosted) {
  manifest.host_permissions.push(`${hosted}/*`);
  manifest.content_scripts[0].matches.push(`${hosted}/*`);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Helper built into ${out}${hosted ? ` for ${hosted}` : " for a local AILI"}`);
