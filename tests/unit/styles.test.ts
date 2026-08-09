import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SSH error notice styles", () => {
  it("uses a neutral background instead of a solid error background", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const noticeRule = styles.match(/\.ssh-error-notice\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(noticeRule).toContain("background: var(--background-secondary)");
    expect(noticeRule).not.toContain("background: var(--background-modifier-error)");
  });
});
