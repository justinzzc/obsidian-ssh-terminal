# Spaced SSH Fence Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize both ` ```ssh ` and ` ``` ssh ` opening fences so Reading View can locate the same SSH block Obsidian renders.

**Architecture:** Change only the shared `findSshBlocksInMarkdown()` opening-marker predicate. Reading View and Live Preview inherit the behavior without separate parsing logic, while source extraction, identity, and occurrence calculation remain unchanged.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest, jsdom

## Global Constraints

- Do not change SSH configuration parsing, credentials, block identity, occurrence numbering, or session lifecycle.
- Accept optional horizontal whitespace between the three backticks and `ssh`, plus optional trailing horizontal whitespace.
- Do not match language names such as `ssh2`, `shell`, or `bash`.
- Tests must use placeholder credentials only and must not contain user-provided secrets.
- Follow strict TDD and observe the focused test fail before modifying production code.

---

### Task 1: Shared scanner compatibility

**Files:**
- Modify: `tests/unit/findSshBlocksInMarkdown.test.ts`
- Modify: `src/render/findSshBlocksInMarkdown.ts`

**Interfaces:**
- Consumes: Markdown text passed to `findSshBlocksInMarkdown(markdown: string)`.
- Produces: the existing `MarkdownSshBlock[]` result for compact and spaced SSH opening fences.

- [ ] **Step 1: Write failing scanner tests**

Add to `tests/unit/findSshBlocksInMarkdown.test.ts`:

```typescript
it("recognizes spaces around the ssh info string", () => {
  const markdown = [
    "``` ssh   ",
    "profile: production",
    "```"
  ].join("\n");

  expect(findSshBlocksInMarkdown(markdown)).toMatchObject([{
    lineStart: 0,
    source: "profile: production",
    occurrence: 0
  }]);
});

it("does not match similar language names", () => {
  const markdown = [
    "``` ssh2",
    "profile: production",
    "```"
  ].join("\n");

  expect(findSshBlocksInMarkdown(markdown)).toEqual([]);
});
```

Keep the existing compact-fence tests unchanged to protect ` ```ssh ` compatibility.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/findSshBlocksInMarkdown.test.ts`

Expected: the spaced-fence test FAILS because the scanner currently compares the marker to the exact string ` ```ssh `; existing compact and non-SSH tests continue to pass.

- [ ] **Step 3: Implement the minimal opening-marker predicate**

In `src/render/findSshBlocksInMarkdown.ts`, add:

```typescript
const SSH_OPENING_FENCE = /^```[\t ]*ssh[\t ]*$/;
```

Replace:

```typescript
if (!opening && marker === "```ssh") {
```

with:

```typescript
if (!opening && SSH_OPENING_FENCE.test(marker)) {
```

Do not change the closing-fence condition or block extraction logic.

- [ ] **Step 4: Run scanner tests and verify GREEN**

Run: `npx vitest run tests/unit/findSshBlocksInMarkdown.test.ts`

Expected: all scanner tests PASS.

- [ ] **Step 5: Commit scanner compatibility**

```powershell
git add src/render/findSshBlocksInMarkdown.ts tests/unit/findSshBlocksInMarkdown.test.ts
git commit -m "fix: support spaced ssh fences"
```

---

### Task 2: Reading View regression and full verification

**Files:**
- Modify: `tests/unit/readingView.test.ts`
- Verify: `tests/unit/livePreview.test.ts`
- Generated and ignored: root `main.js`, root `styles.css`, `release/community/`.

**Interfaces:**
- Consumes: spaced-fence results from Task 1.
- Produces: regression evidence that Reading View resolves the correct occurrence without showing the location error.

- [ ] **Step 1: Write a Reading View regression test**

Add a test using a full document whose opening fence contains a space:

```typescript
it("resolves an SSH block whose opening fence contains a space", async () => {
  const captured = captureProcessor();
  const mountBlock = vi.fn(() => ({ dispose: vi.fn() }));
  registerReadingView(captured.plugin, {
    profiles: { get: () => undefined },
    credentials: {} as never,
    registry: {} as never,
    openTerminal: vi.fn(),
    readSource: async () => "``` ssh\nprofile: production\n```",
    mountBlock
  });
  const container = document.createElement("div");

  captured.processor()("profile: production", container, {
    sourcePath: "note.md",
    getSectionInfo: () => ({ lineStart: 0 }),
    addChild: (child) => child.load()
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(mountBlock).toHaveBeenCalledOnce();
  expect(mountBlock.mock.calls[0]?.[1].occurrence).toBe(0);
  expect(container.textContent).not.toContain("location changed while rendering");
});
```

- [ ] **Step 2: Verify the regression test passes with Task 1**

Run: `npx vitest run tests/unit/readingView.test.ts tests/unit/findSshBlocksInMarkdown.test.ts tests/unit/livePreview.test.ts`

Expected: all tests PASS. The Reading View regression depends on the scanner change already proven RED in Task 1.

- [ ] **Step 3: Commit the Reading View regression**

```powershell
git add tests/unit/readingView.test.ts
git commit -m "test: cover spaced ssh fences in reading view"
```

- [ ] **Step 4: Run the complete suite**

Run: `npm run check`

Expected: TypeScript exits 0 and all unit tests PASS.

- [ ] **Step 5: Build production and community assets**

Run:

```powershell
npm run build
npm run package:release
```

Expected: root `main.js` and `styles.css` build successfully, then `release/community/main.js`, `manifest.json`, and `styles.css` are generated.

- [ ] **Step 6: Inspect final repository state**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted tracked files.

- [ ] **Step 7: Manual Obsidian verification**

Open a note containing a placeholder block written as ` ``` ssh ` in Reading View. Confirm the terminal UI renders instead of `SSH block location changed while rendering.` Do not use or share a real password during verification.
