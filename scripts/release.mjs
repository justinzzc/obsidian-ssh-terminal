import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const releaseAssets = [
  "release/community/main.js",
  "release/community/manifest.json",
  "release/community/styles.css"
];

export function validateSemver(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Release version must use x.y.z format, received: ${version}`);
  }
  return version;
}

export function resolveReleaseVersion(value, currentVersion) {
  if (!["major", "minor", "patch"].includes(value)) return validateSemver(value);

  const [major, minor, patch] = validateSemver(currentVersion).split(".").map(Number);
  if (value === "major") return `${major + 1}.0.0`;
  if (value === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function parseReleaseArgs(argv, currentVersion = readCurrentPackageVersion()) {
  const [versionArg, ...rest] = argv;
  if (!versionArg || versionArg === "--help" || versionArg === "-h") {
    throw new Error(usage());
  }
  const version = resolveReleaseVersion(versionArg, currentVersion);

  const options = {
    version,
    notes: `Release ${version}.`,
    replace: false,
    skipIntegration: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--replace") {
      options.replace = true;
    } else if (arg === "--skip-integration") {
      options.skipIntegration = true;
    } else if (arg === "--notes") {
      const notes = rest[index + 1];
      if (!notes) throw new Error("--notes requires a value");
      options.notes = notes;
      index += 1;
    } else {
      throw new Error(`Unknown release option: ${arg}\n${usage()}`);
    }
  }

  return options;
}

export function buildReleaseCommands(options) {
  const commands = [
    command("git", ["status", "--short"]),
    command("release-version-files", [options.version]),
    command("git", ["diff", "--check"]),
    command("git", ["add", "manifest.json", "versions.json", "package.json", "package-lock.json"]),
    command("git", ["commit", "-m", `chore: release ${options.version}`]),
    command("npm", ["run", "check"]),
    command("npm", ["run", "build"])
  ];
  if (!options.skipIntegration) {
    commands.push(command("npm", ["run", "test:integration"]));
  }
  commands.push(command("npm", ["run", "package:release"]));

  if (options.replace) {
    commands.push(
      command("git", ["tag", "-f", options.version]),
      command("git", ["push", "origin", "master"]),
      command("git", ["push", "origin", options.version, "--force"]),
      command("gh", ["release", "upload", options.version, ...releaseAssets, "--clobber"])
    );
  } else {
    commands.push(
      command("git", ["tag", options.version]),
      command("git", ["push", "origin", "master", options.version]),
      command("gh", ["release", "create", options.version, ...releaseAssets, "--title", options.version, "--notes", options.notes])
    );
  }

  return commands;
}

async function main(argv) {
  const options = parseReleaseArgs(argv);
  assertCleanWorktree();
  assertGhAuthenticated();
  assertVersionDoesNotExist(options);

  await updateReleaseVersionFiles(options.version);

  const commands = buildReleaseCommands(options)
    .filter((item) => !(item.bin === "git" && item.args.join(" ") === "status --short"))
    .filter((item) => item.bin !== "release-version-files");

  for (const item of commands) run(item);
}

export async function updateReleaseVersionFiles(version, baseDir = root) {
  const packagePath = path.join(baseDir, "package.json");
  const packageLockPath = path.join(baseDir, "package-lock.json");
  const manifestPath = path.join(baseDir, "manifest.json");
  const versionsPath = path.join(baseDir, "versions.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const versions = JSON.parse(await readFile(versionsPath, "utf8"));

  packageJson.version = version;
  packageLock.version = version;
  if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
  manifest.version = version;
  versions[version] = manifest.minAppVersion;

  await writeJson(packagePath, packageJson);
  await writeJson(packageLockPath, packageLock);
  await writeJson(manifestPath, manifest);
  await writeJson(versionsPath, versions);
}

function readCurrentPackageVersion() {
  const packagePath = path.join(root, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  return packageJson.version;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertCleanWorktree() {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.trim()) {
    throw new Error(`Working tree is not clean:\n${status}`);
  }
}

function assertGhAuthenticated() {
  run(command("gh", ["auth", "status"]));
}

function assertVersionDoesNotExist(options) {
  if (options.replace) return;
  const localTag = execFileSync("git", ["tag", "--list", options.version], { cwd: root, encoding: "utf8" }).trim();
  if (localTag) throw new Error(`Local tag already exists: ${options.version}. Use --replace to update it.`);
}

function command(bin, args) {
  return { bin, args };
}

function run(item) {
  const result = spawnSync(resolveBin(item.bin), item.args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${item.bin} ${item.args.join(" ")}`);
  }
}

function resolveBin(bin) {
  if (bin !== "gh" || process.platform !== "win32") return bin;
  return "C:\\Program Files\\GitHub CLI\\gh.exe";
}

function usage() {
  return [
    "Usage: node scripts/release.mjs <x.y.z|major|minor|patch> [--notes <text>] [--replace] [--skip-integration]",
    "",
    "Examples:",
    "  node scripts/release.mjs 0.3.0 --notes \"Release 0.3.0\"",
    "  node scripts/release.mjs minor --notes \"Release next minor version\"",
    "  node scripts/release.mjs 0.3.0 --replace --skip-integration"
  ].join("\n");
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(usage());
  } else main(args).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
