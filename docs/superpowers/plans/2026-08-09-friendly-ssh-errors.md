# Friendly SSH Error Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace solid red SSH error blocks with a shared neutral card that shows a safe reason and actionable recovery guidance for configuration, connection, and unavailable-instance errors.

**Architecture:** Add `renderSshErrorNotice()` as the single DOM renderer and error-code guidance mapper. Reading View, Live Preview, `TerminalView`, and `PersistentTerminalItemView` call it with context-specific titles, while existing parsers and SSH layers continue producing the original safe `PluginError` values.

**Tech Stack:** TypeScript, Obsidian Plugin API, DOM, CodeMirror 6, Vitest, jsdom, CSS

## Global Constraints

- Do not change SSH parsing, authentication, host-key validation, retry, persistence, or session lifecycle behavior.
- Never display passwords, command input, terminal output, stack traces, or serialized error objects.
- Render only `Error.message`, known `PluginError.code`, or fixed fallback text.
- Use Obsidian CSS variables and do not use a solid error-colored background for the notice.
- Follow strict TDD: observe each focused test fail for the expected reason before adding production code.
- Keep community README files free of build, test, and release instructions.

---

### Task 1: Shared SSH error notice

**Files:**
- Create: `src/ui/SshErrorNotice.ts`
- Create: `tests/unit/SshErrorNotice.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `PluginError` and `PluginErrorCode` from `src/model.ts`.
- Produces:

```typescript
export interface SshErrorNoticeOptions {
  title: string;
  error: unknown;
  fallbackMessage?: string;
}

export function renderSshErrorNotice(
  container: HTMLElement,
  options: SshErrorNoticeOptions
): void;
```

- DOM contract:
  - Root: `.ssh-error-notice`, `role="alert"`.
  - Title: `.ssh-error-notice__title`.
  - Reason: `.ssh-error-notice__reason`.
  - Guidance: `.ssh-error-notice__guidance`.

- [ ] **Step 1: Write the failing renderer tests**

Create `tests/unit/SshErrorNotice.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { PluginError } from "../../src/model";
import { renderSshErrorNotice } from "../../src/ui/SshErrorNotice";

describe("renderSshErrorNotice", () => {
  it("renders a neutral structured notice with a safe reason and block guidance", () => {
    const container = document.createElement("div");

    renderSshErrorNotice(container, {
      title: "Unable to start SSH terminal",
      error: new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.")
    });

    const notice = container.querySelector<HTMLElement>(".ssh-error-notice");
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.querySelector(".ssh-error-notice__title")?.textContent)
      .toBe("Unable to start SSH terminal");
    expect(notice?.querySelector(".ssh-error-notice__reason")?.textContent)
      .toBe("SSH block requires a profile.");
    expect(notice?.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toContain("SSH block");
  });

  it("maps authentication failures to credential guidance", () => {
    const container = document.createElement("div");
    renderSshErrorNotice(container, {
      title: "SSH connection failed",
      error: new PluginError("AUTH_FAILED", "SSH authentication failed.")
    });
    expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toBe("Verify the SSH username and password, then try again.");
  });

  it("uses a fixed fallback for unknown non-error values without serializing them", () => {
    const container = document.createElement("div");
    renderSshErrorNotice(container, {
      title: "SSH connection failed",
      error: { password: "do-not-render" },
      fallbackMessage: "Unable to connect to the SSH server."
    });
    expect(container.textContent).toContain("Unable to connect to the SSH server.");
    expect(container.textContent).not.toContain("do-not-render");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/SshErrorNotice.test.ts`

Expected: FAIL because `src/ui/SshErrorNotice.ts` does not exist.

- [ ] **Step 3: Implement the minimal shared renderer**

Create `src/ui/SshErrorNotice.ts`:

```typescript
import { PluginError, type PluginErrorCode } from "../model";

export interface SshErrorNoticeOptions {
  title: string;
  error: unknown;
  fallbackMessage?: string;
}

export function renderSshErrorNotice(
  container: HTMLElement,
  options: SshErrorNoticeOptions
): void {
  const notice = document.createElement("div");
  notice.className = "ssh-error-notice";
  notice.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.className = "ssh-error-notice__title";
  title.textContent = options.title;

  const reason = document.createElement("div");
  reason.className = "ssh-error-notice__reason";
  reason.textContent = options.error instanceof Error
    ? options.error.message
    : options.fallbackMessage ?? "An unexpected SSH error occurred.";

  const guidance = document.createElement("div");
  guidance.className = "ssh-error-notice__guidance";
  guidance.textContent = guidanceFor(options.error);

  notice.append(title, reason, guidance);
  container.replaceChildren(notice);
}

function guidanceFor(error: unknown): string {
  return error instanceof PluginError
    ? guidanceForCode(error.code)
    : "Review the SSH configuration and try again.";
}

function guidanceForCode(code: PluginErrorCode): string {
  if (code === "AUTH_FAILED") {
    return "Verify the SSH username and password, then try again.";
  }
  if (code.startsWith("BLOCK_")) {
    return "Review the SSH block fields and YAML syntax, then try again.";
  }
  if (code === "PROFILE_NOT_FOUND" || code === "CREDENTIAL_MISSING" ||
      code === "CREDENTIAL_STORE_UNAVAILABLE") {
    return "Open SSH Terminal settings and verify the referenced profile and password.";
  }
  if (code === "NETWORK_ERROR" || code === "CONNECT_TIMEOUT") {
    return "Verify the host, port, network access, and remote SSH service.";
  }
  if (code === "HOST_KEY_REJECTED" || code === "HOST_KEY_MISMATCH") {
    return "Review the server host fingerprint before trying again.";
  }
  return "Check the remote server, then reconnect the SSH session.";
}
```

- [ ] **Step 4: Add neutral notice styles**

Replace the visual role of `.ssh-terminal__error` with these scoped classes in `src/styles.css`:

```css
.ssh-error-notice {
  display: grid;
  gap: 0.35rem;
  padding: 0.75rem;
  border: 1px solid var(--background-modifier-border);
  border-left: 3px solid var(--text-error);
  border-radius: var(--radius-s);
  color: var(--text-normal);
  background: var(--background-secondary);
}

.ssh-error-notice__title {
  color: var(--text-normal);
}

.ssh-error-notice__reason {
  overflow-wrap: anywhere;
  color: var(--text-muted);
}

.ssh-error-notice__guidance {
  color: var(--text-faint);
  font-size: var(--font-ui-smaller);
}
```

Keep `.ssh-terminal__error` only if a later task still requires it during the red-green migration; remove it after all callers move to the shared renderer.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npx vitest run tests/unit/SshErrorNotice.test.ts`

Expected: 3 tests PASS with no warnings.

- [ ] **Step 6: Commit the shared notice**

```powershell
git add src/ui/SshErrorNotice.ts src/styles.css tests/unit/SshErrorNotice.test.ts
git commit -m "feat: add friendly ssh error notice"
```

---

### Task 2: Markdown configuration error integration

**Files:**
- Modify: `src/render/readingView.ts`
- Modify: `src/render/livePreview.ts`
- Modify: `tests/unit/readingView.test.ts`
- Modify: `tests/unit/livePreview.test.ts`

**Interfaces:**
- Consumes: `renderSshErrorNotice(container, options)` from Task 1.
- Produces: consistent `Unable to start SSH terminal` cards for invalid blocks and block-location errors in both Markdown modes.

- [ ] **Step 1: Add a failing Reading View assertion**

Extend the existing invalid-block test in `tests/unit/readingView.test.ts` so it asserts:

```typescript
expect(container.querySelector(".ssh-error-notice__title")?.textContent)
  .toBe("Unable to start SSH terminal");
expect(container.querySelector(".ssh-error-notice__reason")?.textContent)
  .toContain("profile");
expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
  .toContain("SSH block");
expect(container.querySelector(".ssh-terminal__error")).toBeNull();
```

- [ ] **Step 2: Add a failing Live Preview assertion**

Extend the invalid-widget test in `tests/unit/livePreview.test.ts`:

```typescript
const notice = dom.querySelector(".ssh-error-notice");
expect(notice?.querySelector(".ssh-error-notice__title")?.textContent)
  .toBe("Unable to start SSH terminal");
expect(notice?.querySelector(".ssh-error-notice__reason")?.textContent)
  .toContain("profile");
```

- [ ] **Step 3: Run both tests and verify RED**

Run: `npx vitest run tests/unit/readingView.test.ts tests/unit/livePreview.test.ts`

Expected: FAIL because both paths still render the old `.ssh-terminal__error` text block.

- [ ] **Step 4: Replace Reading View error rendering**

Import `renderSshErrorNotice` and replace `renderError()` with:

```typescript
function renderError(container: HTMLElement, error: unknown, fallbackMessage: string): void {
  renderSshErrorNotice(container, {
    title: "Unable to start SSH terminal",
    error,
    fallbackMessage
  });
}
```

Pass the original caught error instead of converting it to a string before rendering, so `PluginError.code` remains available for guidance selection.

- [ ] **Step 5: Replace Live Preview error rendering**

In `SshTerminalWidget.toDOM()`, replace the class/text assignment with:

```typescript
renderSshErrorNotice(container, {
  title: "Unable to start SSH terminal",
  error,
  fallbackMessage: "Invalid SSH block."
});
```

- [ ] **Step 6: Run Markdown tests and verify GREEN**

Run: `npx vitest run tests/unit/readingView.test.ts tests/unit/livePreview.test.ts tests/unit/SshErrorNotice.test.ts`

Expected: all tests PASS.

- [ ] **Step 7: Commit Markdown integration**

```powershell
git add src/render/readingView.ts src/render/livePreview.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts
git commit -m "fix: show helpful ssh block errors"
```

---

### Task 3: Terminal connection and unavailable-instance errors

**Files:**
- Modify: `src/ui/TerminalView.ts`
- Modify: `src/ui/PersistentTerminalItemView.ts`
- Modify: `tests/unit/TerminalView.test.ts`
- Modify: `tests/unit/PersistentTerminalItemView.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `renderSshErrorNotice()` from Task 1.
- Produces: friendly `SSH connection failed` and `SSH terminal unavailable` cards, while preserving connect/reconnect and terminal lifecycle behavior.

- [ ] **Step 1: Add a failing TerminalView connection-error test**

Add to `tests/unit/TerminalView.test.ts` using the existing fake manager and terminal setup:

```typescript
it("shows a helpful notice when the SSH connection fails", async () => {
  manager.connect.mockRejectedValueOnce(
    new PluginError("AUTH_FAILED", "SSH authentication failed.")
  );
  const container = document.createElement("div");
  const terminal = makeTerminalView(container);

  await terminal.connect();

  expect(container.querySelector(".ssh-error-notice__title")?.textContent)
    .toBe("SSH connection failed");
  expect(container.querySelector(".ssh-error-notice__reason")?.textContent)
    .toBe("SSH authentication failed.");
  expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
    .toContain("username and password");
});
```

Add a second assertion to the retry/success path proving the notice becomes hidden and its children are cleared before or after a successful new connection.

- [ ] **Step 2: Add a failing unavailable-instance test**

Extend `tests/unit/PersistentTerminalItemView.test.ts`:

```typescript
expect(view.containerEl.querySelector(".ssh-error-notice__title")?.textContent)
  .toBe("SSH terminal unavailable");
expect(view.containerEl.querySelector(".ssh-error-notice__reason")?.textContent)
  .toBe("SSH terminal instance is no longer available.");
```

- [ ] **Step 3: Run focused UI tests and verify RED**

Run: `npx vitest run tests/unit/TerminalView.test.ts tests/unit/PersistentTerminalItemView.test.ts`

Expected: FAIL because both components still use `.ssh-terminal__error` and raw text.

- [ ] **Step 4: Integrate the renderer into TerminalView**

Keep the existing `this.error` container, but give it a neutral wrapper role rather than the old red class. Update `showError()`:

```typescript
private showError(error: unknown): void {
  renderSshErrorNotice(this.error, {
    title: "SSH connection failed",
    error,
    fallbackMessage: "Unable to connect to the SSH server."
  });
  this.error.hidden = false;
  this.connected = false;
  this.connectButton.textContent = "Connect";
  this.connectButton.disabled = false;
}
```

At the start of `connect()` and after a successful connection, set `this.error.hidden = true` and call `this.error.replaceChildren()` so stale details are not retained.

- [ ] **Step 5: Integrate the renderer into PersistentTerminalItemView**

Replace `renderUnavailable()` with:

```typescript
private renderUnavailable(): void {
  this.header.replaceChildren();
  renderSshErrorNotice(this.terminalHost, {
    title: "SSH terminal unavailable",
    error: new Error("SSH terminal instance is no longer available."),
    fallbackMessage: "SSH terminal instance is no longer available."
  });
}
```

- [ ] **Step 6: Remove the obsolete solid-red style**

Delete `.ssh-terminal__error` from `src/styles.css` after `rg -n "ssh-terminal__error" src tests` confirms no remaining production or test callers.

- [ ] **Step 7: Run focused and related tests**

Run:

```powershell
npx vitest run tests/unit/SshErrorNotice.test.ts tests/unit/TerminalView.test.ts tests/unit/PersistentTerminalItemView.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts
```

Expected: all tests PASS with no warnings.

- [ ] **Step 8: Commit terminal integration**

```powershell
git add src/ui/TerminalView.ts src/ui/PersistentTerminalItemView.ts src/styles.css tests/unit/TerminalView.test.ts tests/unit/PersistentTerminalItemView.test.ts
git commit -m "fix: improve ssh connection error feedback"
```

---

### Task 4: Full verification and build

**Files:**
- Verify: all modified source and test files.
- Generated and ignored: root `main.js`, root `styles.css`, `release/community/`.

**Interfaces:**
- Consumes: completed friendly error rendering from Tasks 1-3.
- Produces: compiler, test, build, privacy, and release-asset evidence.

- [ ] **Step 1: Run the privacy scan**

Run:

```powershell
rg -n "password|command input|terminal output|JSON.stringify" src/ui/SshErrorNotice.ts src/render/readingView.ts src/render/livePreview.ts src/ui/TerminalView.ts src/ui/PersistentTerminalItemView.ts
```

Expected: only fixed guidance text about verifying a password and existing security comments; no serialization or display of credentials, commands, or terminal output.

- [ ] **Step 2: Run the complete static and unit-test suite**

Run: `npm run check`

Expected: TypeScript exits 0 and all unit tests PASS.

- [ ] **Step 3: Build production assets**

Run: `npm run build`

Expected: root `main.js` and `styles.css` are generated successfully.

- [ ] **Step 4: Build community release assets**

Run: `npm run package:release`

Expected: `release/community/main.js`, `manifest.json`, and `styles.css` are generated.

- [ ] **Step 5: Inspect the final diff and repository status**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted tracked files after the final commit.

- [ ] **Step 6: Perform a manual Obsidian check**

Verify these cases in Reading View and Live Preview:

1. Empty `ssh` block shows the configuration title, reason, and YAML/block guidance.
2. Missing profile shows profile/settings guidance.
3. Failed authentication shows credential guidance without showing the password.
4. Network timeout shows host/port/network guidance.
5. The card has a neutral background with a small error accent, not a solid red fill.
6. Fixing the block or reconnecting removes the stale error card.

