# Community README Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the English and Chinese README files community-facing, preserve contributor instructions in `DEVELOP.md`, and use a preview image URL that renders reliably in the Obsidian community listing.

**Architecture:** This is a documentation-only change. The two README files remain parallel user guides, while a new root-level `DEVELOP.md` becomes the single home for build, packaging, release, manual-installation, and integration-test instructions.

**Tech Stack:** Markdown, GitHub Raw content URLs, PowerShell verification commands

## Global Constraints

- Do not change plugin behavior or source code.
- Do not redesign, regenerate, or move `docs/terminal.png`.
- Do not include contributor-oriented build, release, packaging, or test instructions in either README.
- Use `https://raw.githubusercontent.com/justinzzc/obsidian-ssh-terminal/0.4.0/docs/terminal.png` in both README files.

---

### Task 1: Separate community and contributor documentation

**Files:**
- Create: `DEVELOP.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Interfaces:**
- Consumes: Existing English and Chinese README development sections and the existing `docs/terminal.png` asset.
- Produces: Two community-facing README files and one contributor-facing development guide.

- [ ] **Step 1: Create the contributor guide**

Create `DEVELOP.md` with English contributor instructions covering:

````markdown
# Development

## Requirements

- Node.js 20+
- Docker for the SSH integration test

## Install and Verify

```powershell
npm install
npm run check
npm run build
```

## Build Community Release Assets

```powershell
npm run package:release
```

Release assets are written to `release/community/`:

- `main.js`
- `manifest.json`
- `styles.css`

For manual installation, copy these files to `<vault>/.obsidian/plugins/ssh-terminal/`.

## Release

```powershell
npm run release -- 0.3.0 --notes "Release 0.3.0"
npm run release -- minor --notes "Release next minor version"
```

To rebuild an existing version after an Obsidian review fix:

```powershell
npm run release -- 0.3.0 --replace --skip-integration --notes "Release 0.3.0"
```

Use `--skip-integration` only when Docker is unavailable.

## Integration Test

```powershell
docker build -t obsidian-ssh-test tests/fixtures/sshd
$env:OBSIDIAN_SSH_TEST_PASSWORD='<temporary-local-password>'
npm run test:integration
```

The test password is injected only through an environment variable and must not be written to repository files.
````

- [ ] **Step 2: Make the English README community-facing**

In `README.md`:

- Replace `![SSH Terminal preview](docs/terminal.png)` with `![SSH Terminal preview](https://raw.githubusercontent.com/justinzzc/obsidian-ssh-terminal/0.4.0/docs/terminal.png)`.
- Remove the complete `Build`, `Release`, and `Integration Test` sections.
- Keep `Highlights`, inline-mode usage, profile-mode usage, security notes, and `First Release Scope` unchanged.

- [ ] **Step 3: Make the Chinese README community-facing**

In `README.zh-CN.md`:

- Replace `![SSH Terminal 预览](docs/terminal.png)` with `![SSH Terminal 预览](https://raw.githubusercontent.com/justinzzc/obsidian-ssh-terminal/0.4.0/docs/terminal.png)`.
- Remove the complete `构建`, `发版`, and `集成测试` sections.
- Keep `功能亮点`, inline 模式用法, Profile 模式用法, `安全说明`, and `首版范围` unchanged.

- [ ] **Step 4: Verify the documentation split**

Run:

```powershell
rg -n "npm install|npm run check|npm run build|npm run release|test:integration|docker build" README.md README.zh-CN.md
```

Expected: no matches.

Run:

```powershell
rg -n "npm install|npm run check|npm run build|npm run release|test:integration|docker build" DEVELOP.md
```

Expected: all command families are present in `DEVELOP.md`.

Run:

```powershell
rg -n "raw.githubusercontent.com/justinzzc/obsidian-ssh-terminal/0.4.0/docs/terminal.png" README.md README.zh-CN.md
```

Expected: exactly one match in each README.

Run:

```powershell
git diff --check
```

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 5: Commit the documentation change**

```powershell
git add README.md README.zh-CN.md DEVELOP.md docs/superpowers/plans/2026-08-09-community-readme-cleanup.md
git commit -m "docs: separate community and development guides"
```
