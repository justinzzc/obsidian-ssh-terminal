import { describe, expect, it } from "vitest";
// @ts-ignore release.mjs is an executable Node script with named testable exports.
import { buildReleaseCommands, parseReleaseArgs, validateSemver } from "../../scripts/release.mjs";

interface ReleaseCommand {
  args: string[];
}

describe("release script", () => {
  it("accepts only x.y.z release versions", () => {
    expect(validateSemver("0.3.0")).toBe("0.3.0");
    expect(() => validateSemver("v0.3.0")).toThrow(/x\.y\.z/);
    expect(() => validateSemver("0.3")).toThrow(/x\.y\.z/);
  });

  it("builds a normal release plan without force operations", () => {
    const options = parseReleaseArgs(["0.3.0", "--notes", "Release notes"]);
    const commands = buildReleaseCommands(options)
      .map((command: ReleaseCommand) => command.args.join(" "));

    expect(commands).toContain("tag 0.3.0");
    expect(commands).toContain("push origin master 0.3.0");
    expect(commands).toContain("release create 0.3.0 release/community/main.js release/community/manifest.json release/community/styles.css --title 0.3.0 --notes Release notes");
    expect(commands.join("\n")).not.toContain("--force");
    expect(commands.join("\n")).not.toContain("--clobber");
  });

  it("builds a replace release plan with explicit force and clobber operations", () => {
    const options = parseReleaseArgs(["0.3.0", "--replace"]);
    const commands = buildReleaseCommands(options)
      .map((command: ReleaseCommand) => command.args.join(" "));

    expect(commands).toContain("tag -f 0.3.0");
    expect(commands).toContain("push origin 0.3.0 --force");
    expect(commands).toContain("release upload 0.3.0 release/community/main.js release/community/manifest.json release/community/styles.css --clobber");
  });
});
