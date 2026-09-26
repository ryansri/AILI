import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELPER_VERSION, helperOutdated } from "./helper-version";

describe("helperOutdated", () => {
  it("flags a missing or older version, not an equal or newer one", () => {
    expect(helperOutdated(undefined)).toBe(true);
    expect(helperOutdated("0.1.0")).toBe(true);
    expect(helperOutdated(HELPER_VERSION)).toBe(false);
    expect(helperOutdated("9.0.0")).toBe(false);
  });

  it("matches the version in the extension manifest", () => {
    const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as { version: string };
    expect(manifest.version).toBe(HELPER_VERSION);
  });
});
