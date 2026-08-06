import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-ignore release.mjs is an executable Node script with named testable exports.
import { buildReleaseCommands, parseReleaseArgs, resolveBin, resolveReleaseVersion, updateReleaseVersionFiles, validateSemver } from "../../scripts/release.mjs";

interface ReleaseCommand {
  bin: string;
  args: string[];
}

describe("release script", () => {
  it("accepts only x.y.z release versions", () => {
    expect(validateSemver("0.3.0")).toBe("0.3.0");
    expect(() => validateSemver("v0.3.0")).toThrow(/x\.y\.z/);
    expect(() => validateSemver("0.3")).toThrow(/x\.y\.z/);
  });

  it("resolves fixed version increment words from the current version", () => {
    expect(resolveReleaseVersion("major", "0.2.3")).toBe("1.0.0");
    expect(resolveReleaseVersion("minor", "0.2.3")).toBe("0.3.0");
    expect(resolveReleaseVersion("patch", "0.2.3")).toBe("0.2.4");
    expect(resolveReleaseVersion("0.3.0", "0.2.3")).toBe("0.3.0");
    expect(parseReleaseArgs(["minor"], "0.2.3").version).toBe("0.3.0");
  });

  it("resolves Windows command shims used by spawnSync without a shell", () => {
    expect(resolveBin("npm", "win32")).toBe("npm.cmd");
    expect(resolveBin("npx", "win32")).toBe("npx.cmd");
    expect(resolveBin("git", "win32")).toBe("git");
    expect(resolveBin("npm", "linux")).toBe("npm");
  });

  it("builds a normal release plan without force operations", () => {
    const options = parseReleaseArgs(["0.3.0", "--notes", "Release notes"]);
    const commands = buildReleaseCommands(options)
      .map((command: ReleaseCommand) => command.args.join(" "));

    expect(commands).toContain("0.3.0");
    expect(commands).toContain("tag 0.3.0");
    expect(commands).toContain("push origin master 0.3.0");
    expect(commands).toContain("release create 0.3.0 release/community/main.js release/community/manifest.json release/community/styles.css --title 0.3.0 --notes Release notes");
    expect(commands.join("\n")).not.toContain("--force");
    expect(commands.join("\n")).not.toContain("--clobber");

    const versionIndex = commands.indexOf("0.3.0");
    const commitIndex = commands.indexOf("commit -m chore: release 0.3.0");
    expect(versionIndex).toBeLessThan(commitIndex);
    expect(commitIndex).toBeLessThan(commands.indexOf("run check"));
    expect(commitIndex).toBeLessThan(commands.indexOf("run build"));
    expect(commitIndex).toBeLessThan(commands.indexOf("run package:release"));
    expect(commitIndex).toBeLessThan(commands.indexOf("tag 0.3.0"));
  });

  it("builds a replace release plan with explicit force and clobber operations", () => {
    const options = parseReleaseArgs(["0.3.0", "--replace"]);
    const commands = buildReleaseCommands(options)
      .map((command: ReleaseCommand) => command.args.join(" "));

    expect(commands).toContain("tag -f 0.3.0");
    expect(commands).toContain("push origin 0.3.0 --force");
    expect(commands).toContain("release upload 0.3.0 release/community/main.js release/community/manifest.json release/community/styles.css --clobber");
  });

  it("resumes after an existing release version commit", () => {
    const options = { ...parseReleaseArgs(["0.3.0"]), versionCommitted: true };
    const plan = buildReleaseCommands(options);
    const commands = plan.map((command: ReleaseCommand) => command.args.join(" "));

    expect(plan.map((command: ReleaseCommand) => command.bin)).not.toContain("release-version-files");
    expect(commands).not.toContain("commit -m chore: release 0.3.0");
    expect(commands).toContain("run check");
    expect(commands).toContain("run build");
    expect(commands).toContain("run package:release");
    expect(commands).toContain("tag 0.3.0");
    expect(commands).toContain("push origin master 0.3.0");
  });

  it("updates package, manifest, and Obsidian version map together", async () => {
    const releaseRoot = await mkdtemp(join(tmpdir(), "obsidian-ssh-release-"));
    await writeFile(join(releaseRoot, "package.json"), json({ name: "plugin", version: "0.2.0" }));
    await writeFile(join(releaseRoot, "package-lock.json"), json({
      name: "plugin",
      version: "0.2.0",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "plugin",
          version: "0.2.0"
        }
      }
    }));
    await writeFile(join(releaseRoot, "manifest.json"), json({
      id: "ssh-terminal",
      version: "0.2.0",
      minAppVersion: "1.8.7"
    }));
    await writeFile(join(releaseRoot, "versions.json"), json({ "0.2.0": "1.8.7" }));

    await updateReleaseVersionFiles("0.3.0", releaseRoot);

    expect(JSON.parse(await readFile(join(releaseRoot, "package.json"), "utf8")).version).toBe("0.3.0");
    const packageLock = JSON.parse(await readFile(join(releaseRoot, "package-lock.json"), "utf8"));
    expect(packageLock.version).toBe("0.3.0");
    expect(packageLock.packages[""].version).toBe("0.3.0");
    expect(JSON.parse(await readFile(join(releaseRoot, "manifest.json"), "utf8")).version).toBe("0.3.0");
    expect(JSON.parse(await readFile(join(releaseRoot, "versions.json"), "utf8"))).toMatchObject({
      "0.2.0": "1.8.7",
      "0.3.0": "1.8.7"
    });
  });
});

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
