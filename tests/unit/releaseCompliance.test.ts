import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release compliance", () => {
  it("does not use require-style imports for Electron APIs", () => {
    const main = readFileSync("src/main.ts", "utf8");

    expect(main).not.toContain('require("electron")');
    expect(main).toContain('from "electron"');
  });
});
