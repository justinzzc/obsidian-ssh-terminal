# Obsidian SSH Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-only Obsidian plugin that renders manually connected, interactive SSH terminals inside `ssh` Markdown blocks in reading view and Live Preview.

**Architecture:** The plugin separates persisted profiles, OS-backed credentials, host-key trust, SSH session lifecycle, and terminal rendering behind small TypeScript interfaces. Reading view and Live Preview both mount the same `TerminalView`, while every rendered block owns an isolated `SshSession` that is closed when its view is destroyed.

**Tech Stack:** TypeScript, Obsidian Plugin API, CodeMirror 6, `ssh2`, `@xterm/xterm`, `@xterm/addon-fit`, `keytar`, `yaml`, Vitest, jsdom, esbuild, Docker/OpenSSH integration fixture.

## Global Constraints

- Target Obsidian desktop only; set `isDesktopOnly: true` in `manifest.json`.
- Support Windows, macOS, and Linux desktop builds.
- Never store a password in Markdown, `data.json`, logs, snapshots, or test fixtures.
- Never provide an option to bypass host-key verification.
- Connections are manual; rendering a document must not initiate network traffic.
- First release supports password authentication only.
- `ssh` blocks accept only `profile` and optional `height`; height defaults to `360` and must be between `180` and `900`.
- Reading view and Live Preview must use the same terminal component and cleanup contract.
- No SFTP, port forwarding, jump hosts, private keys, SSH Agent, persistent command history, or mobile fallback in the first release.
- Use Node.js 20 or newer for development and release builds.

## Planned File Structure

```text
manifest.json                         Obsidian plugin metadata
versions.json                         Obsidian version compatibility
package.json                          scripts and dependencies
tsconfig.json                         strict TypeScript settings
esbuild.config.mjs                    plugin bundle and release copy logic
styles.css                            terminal and settings styles
src/main.ts                           plugin lifecycle and dependency wiring
src/model.ts                          shared domain types and error codes
src/block/parseSshBlock.ts            strict YAML block parsing
src/profile/ProfileStore.ts           non-secret profile persistence
src/profile/CredentialStore.ts        credential interface and keytar adapter
src/profile/HostKeyStore.ts           TOFU host-key persistence
src/settings/SshSettingsTab.ts        profile management UI
src/ssh/SshClientAdapter.ts           ssh2 boundary for testability
src/ssh/SshSession.ts                 SSH state machine and PTY lifecycle
src/ssh/SessionManager.ts             rendered-block session ownership
src/ui/TerminalView.ts                shared xterm-based DOM component
src/render/readingView.ts             Markdown code-block processor
src/render/livePreview.ts             CodeMirror 6 widget extension
tests/unit/*.test.ts                  unit and DOM tests
tests/integration/ssh.test.ts         real SSH integration test
tests/fixtures/sshd/Dockerfile        deterministic local SSH server
tests/fixtures/sshd/entrypoint.sh     fixture account and sshd startup
```

---

### Task 1: Project Skeleton and Strict SSH Block Parser

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `src/model.ts`
- Create: `src/block/parseSshBlock.ts`
- Test: `tests/unit/parseSshBlock.test.ts`

**Interfaces:**
- Produces: `SshBlockConfig`, `PluginError`, and `parseSshBlock(source: string): SshBlockConfig`.
- Consumers: Tasks 3, 5, and 6.

- [ ] **Step 1: Add the build/test skeleton and failing parser tests**

Create `package.json` with scripts `test`, `test:unit`, `test:integration`, `build`, and `check`. Pin compatible dependency families and keep `obsidian`, CodeMirror, esbuild, TypeScript, jsdom, and Vitest in `devDependencies`; keep runtime libraries in `dependencies`; place `keytar` in `optionalDependencies` so unsupported developer machines can still run pure unit tests.

```json
{
  "name": "obsidian-ssh-terminal",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run tests/unit",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "build": "node esbuild.config.mjs production",
    "check": "tsc --noEmit && vitest run tests/unit && node esbuild.config.mjs production"
  },
  "dependencies": {
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/xterm": "^5.5.0",
    "ssh2": "^1.16.0",
    "yaml": "^2.7.0"
  },
  "optionalDependencies": {
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "@codemirror/language": "^6.10.8",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.36.5",
    "@types/node": "^22.15.0",
    "@types/ssh2": "^1.15.5",
    "esbuild": "^0.25.0",
    "jsdom": "^26.1.0",
    "obsidian": "^1.8.7",
    "typescript": "^5.8.3",
    "vitest": "^3.1.1"
  }
}
```

Create a strict ES2022 `tsconfig.json`, an esbuild entry for `src/main.ts` that externalizes `obsidian`, `electron`, and `keytar`, and the following manifest:

```json
{
  "id": "ssh-terminal",
  "name": "SSH Terminal",
  "version": "0.1.0",
  "minAppVersion": "1.8.7",
  "description": "Interactive SSH terminals embedded in Markdown documents.",
  "author": "Obsidian SSH contributors",
  "isDesktopOnly": true
}
```

Write parser tests covering valid defaults, explicit height, missing profile, unknown keys, invalid YAML, forbidden `password`, and height values `179` and `901`.

```ts
import { describe, expect, it } from "vitest";
import { parseSshBlock } from "../../src/block/parseSshBlock";

describe("parseSshBlock", () => {
  it("parses a profile with the default height", () => {
    expect(parseSshBlock("profile: production-server")).toEqual({
      profileId: "production-server",
      height: 360,
    });
  });

  it.each([
    ["", "BLOCK_PROFILE_REQUIRED"],
    ["profile: prod\nextra: value", "BLOCK_UNKNOWN_FIELD"],
    ["profile: prod\npassword: secret", "BLOCK_SECRET_FORBIDDEN"],
    ["profile: prod\nheight: 179", "BLOCK_HEIGHT_INVALID"],
    ["profile: prod\nheight: 901", "BLOCK_HEIGHT_INVALID"],
  ])("rejects invalid source", (source, code) => {
    expect(() => parseSshBlock(source)).toMatchObject({ code });
  });
});
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run: `npm install && npm run test:unit -- tests/unit/parseSshBlock.test.ts`

Expected: FAIL because `src/block/parseSshBlock.ts` does not exist.

- [ ] **Step 3: Implement shared types and the minimal strict parser**

Define `PluginError` with a stable `code` and safe message, then parse YAML as a mapping. Explicitly reject arrays, scalars, unknown keys, empty profile IDs, secrets, non-integer heights, and heights outside the allowed range.

```ts
export type PluginErrorCode =
  | "BLOCK_INVALID_YAML"
  | "BLOCK_PROFILE_REQUIRED"
  | "BLOCK_UNKNOWN_FIELD"
  | "BLOCK_SECRET_FORBIDDEN"
  | "BLOCK_HEIGHT_INVALID";

export class PluginError extends Error {
  constructor(public readonly code: PluginErrorCode, message: string) {
    super(message);
    this.name = "PluginError";
  }
}

export interface SshBlockConfig {
  profileId: string;
  height: number;
}
```

Use `YAML.parse`, check `Object.getPrototypeOf(value) === Object.prototype`, allow only `profile` and `height`, and return `{ profileId: profile.trim(), height: height ?? 360 }`.

- [ ] **Step 4: Run parser tests and the production build**

Run: `npm run test:unit -- tests/unit/parseSshBlock.test.ts && npm run build`

Expected: parser tests PASS and `main.js` is generated without bundling `obsidian` or `keytar`.

- [ ] **Step 5: Commit Task 1**

```powershell
git add package.json package-lock.json tsconfig.json esbuild.config.mjs manifest.json versions.json src/model.ts src/block/parseSshBlock.ts tests/unit/parseSshBlock.test.ts
git commit -m "chore: scaffold Obsidian SSH plugin"
```

---

### Task 2: Profiles, OS Credentials, and Host-Key Trust

**Files:**
- Modify: `src/model.ts`
- Create: `src/profile/ProfileStore.ts`
- Create: `src/profile/CredentialStore.ts`
- Create: `src/profile/HostKeyStore.ts`
- Test: `tests/unit/ProfileStore.test.ts`
- Test: `tests/unit/HostKeyStore.test.ts`
- Test: `tests/unit/CredentialStore.test.ts`

**Interfaces:**
- Produces: `SshProfile`, `PersistedPluginData`, `ProfileStore`, `CredentialStore`, `KeytarCredentialStore`, `HostKeyStore`, and `HostKeyDecision`.
- Consumers: Tasks 3 and 7.

- [ ] **Step 1: Write failing persistence and trust tests**

Use an injected persistence adapter so tests never import Obsidian or keytar.

```ts
const persistence = new MemoryPersistence({ schemaVersion: 1, profiles: [], hostKeys: {} });
const store = new ProfileStore(persistence);

it("persists only non-secret profile data", async () => {
  await store.save({ id: "prod", name: "Production", host: "10.0.0.8", port: 22, username: "ops", timeoutMs: 15000 });
  expect(JSON.stringify(persistence.value)).not.toContain("password");
  expect(store.get("prod")?.host).toBe("10.0.0.8");
});

it("requires confirmation for a first-seen host key", async () => {
  expect(await hostKeys.check("prod", "ssh-ed25519", fingerprint)).toEqual({ kind: "unknown" });
  await hostKeys.trust("prod", "ssh-ed25519", fingerprint);
  expect(await hostKeys.check("prod", "ssh-ed25519", fingerprint)).toEqual({ kind: "trusted" });
});

it("blocks a changed host key", async () => {
  await hostKeys.trust("prod", "ssh-ed25519", fingerprint);
  expect(await hostKeys.check("prod", "ssh-ed25519", changed)).toEqual({
    kind: "mismatch",
    expected: fingerprint,
    received: changed,
  });
});
```

Credential tests must use an injected keytar-like object and assert the fixed service name `obsidian-ssh-terminal` plus profile ID account key.

- [ ] **Step 2: Run the three test files and verify failure**

Run: `npm run test:unit -- tests/unit/ProfileStore.test.ts tests/unit/HostKeyStore.test.ts tests/unit/CredentialStore.test.ts`

Expected: FAIL because the stores are undefined.

- [ ] **Step 3: Implement profile persistence and deletion cleanup**

Add exact domain types:

```ts
export interface SshProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
}

export interface TrustedHostKey {
  algorithm: string;
  fingerprint: string;
}

export interface PersistedPluginData {
  schemaVersion: 1;
  profiles: SshProfile[];
  hostKeys: Record<string, TrustedHostKey>;
}
```

`ProfileStore.save` validates slug IDs with `/^[a-z0-9][a-z0-9-]{0,63}$/`, non-empty host and username, port `1..65535`, and timeout `1000..120000`. `delete(id, credentials, hostKeys)` removes profile metadata, its host key, and its credential before persisting.

- [ ] **Step 4: Implement secure adapters**

Define:

```ts
export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  getPassword(profileId: string): Promise<string | null>;
  setPassword(profileId: string, password: string): Promise<void>;
  deletePassword(profileId: string): Promise<void>;
}

export type HostKeyDecision =
  | { kind: "unknown" }
  | { kind: "trusted" }
  | { kind: "mismatch"; expected: string; received: string };
```

`KeytarCredentialStore` dynamically imports `keytar`, returns `false` from `isAvailable()` when loading fails, and throws `CREDENTIAL_STORE_UNAVAILABLE` rather than falling back to plugin data. `HostKeyStore` stores only algorithm and `SHA256:<base64>` fingerprint.

Extend `PluginErrorCode` with the exact persistence/security codes used by this task: `PROFILE_INVALID`, `PROFILE_NOT_FOUND`, `CREDENTIAL_STORE_UNAVAILABLE`, and `CREDENTIAL_MISSING`.

- [ ] **Step 5: Run store tests and type checking**

Run: `npm run test:unit -- tests/unit/ProfileStore.test.ts tests/unit/HostKeyStore.test.ts tests/unit/CredentialStore.test.ts && npx tsc --noEmit`

Expected: all tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/model.ts src/profile tests/unit/ProfileStore.test.ts tests/unit/HostKeyStore.test.ts tests/unit/CredentialStore.test.ts
git commit -m "feat: add secure SSH profile storage"
```

---

### Task 3: SSH Session State Machine and PTY Lifecycle

**Files:**
- Modify: `src/model.ts`
- Create: `src/ssh/SshClientAdapter.ts`
- Create: `src/ssh/SshSession.ts`
- Test: `tests/unit/SshSession.test.ts`

**Interfaces:**
- Consumes: `SshProfile`, `CredentialStore`, `HostKeyStore`, and `PluginError`.
- Produces: `SshSession`, `SshSessionState`, `SshSessionEvents`, `HostKeyPrompt`, and `SshClientFactory`.
- Consumers: Task 4.

- [ ] **Step 1: Write failing state-machine tests with a fake SSH adapter**

Test the exact observable behavior:

```ts
it("does not connect until connect is called", () => {
  const session = createSession();
  expect(session.state).toBe("idle");
  expect(fakeFactory.created).toBe(0);
});

it("streams PTY data in both directions", async () => {
  const session = createSession({ trustedHost: true });
  const output: string[] = [];
  session.onData((chunk) => output.push(chunk));
  await session.connect();
  fakeStream.emitData("ready\r\n");
  session.write("whoami\r");
  expect(output).toEqual(["ready\r\n"]);
  expect(fakeStream.writes).toEqual(["whoami\r"]);
});

it("blocks a mismatched host key before authentication", async () => {
  const session = createSession({ hostKeyDecision: { kind: "mismatch", expected: "SHA256:old", received: "SHA256:new" } });
  await expect(session.connect()).rejects.toMatchObject({ code: "HOST_KEY_MISMATCH" });
  expect(session.state).toBe("failed");
});

it("closes idempotently", async () => {
  const session = createSession({ trustedHost: true });
  await session.connect();
  await Promise.all([session.close(), session.close()]);
  expect(fakeClient.endCalls).toBe(1);
  expect(session.state).toBe("closed");
});
```

Also test connection timeout, authentication failure mapping, unknown host-key confirmation, resize forwarding, and remote close.

- [ ] **Step 2: Run the SSH session tests and verify failure**

Run: `npm run test:unit -- tests/unit/SshSession.test.ts`

Expected: FAIL because `SshSession` and the adapter interfaces do not exist.

- [ ] **Step 3: Implement the ssh2 boundary**

Define small adapter interfaces rather than exposing `ssh2` types throughout the plugin:

```ts
export interface SshShellStream {
  write(data: string): void;
  setWindow(rows: number, cols: number, height: number, width: number): void;
  onData(handler: (data: string) => void): Disposable;
  onClose(handler: (error?: Error) => void): Disposable;
  close(): void;
}

export interface SshClientAdapter {
  connect(options: SshConnectOptions): Promise<void>;
  openShell(term: "xterm-256color", rows: number, cols: number): Promise<SshShellStream>;
  close(): void;
}

export type SshClientFactory = () => SshClientAdapter;
```

The production adapter wraps `ssh2.Client`, converts the raw host key to `SHA256:${createHash("sha256").update(key).digest("base64")}`, and exposes it to `SshSession` before password authentication is accepted.

- [ ] **Step 4: Implement `SshSession` minimally against the tests**

Use states `idle`, `verifying-host`, `authenticating`, `connected`, `disconnecting`, `closed`, and `failed`. `connect()` must reject if state is not `idle` or `failed`; a retry resets disposed client/stream state. Unknown host keys call an injected asynchronous `confirmHostKey(prompt)` and persist trust only after `true`. All caught errors are converted to safe `PluginError` codes without embedding the password or raw connection options.

Extend `PluginErrorCode` with the exact session codes `HOST_KEY_REJECTED`, `HOST_KEY_MISMATCH`, `CONNECT_TIMEOUT`, `NETWORK_ERROR`, `AUTH_FAILED`, `SHELL_OPEN_FAILED`, `SESSION_STATE_INVALID`, and `REMOTE_CLOSED`.

- [ ] **Step 5: Run session tests and all unit tests**

Run: `npm run test:unit -- tests/unit/SshSession.test.ts && npm test`

Expected: all SSH session tests and the complete unit suite PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/model.ts src/ssh/SshClientAdapter.ts src/ssh/SshSession.ts tests/unit/SshSession.test.ts
git commit -m "feat: implement verified SSH sessions"
```

---

### Task 4: Session Manager and Shared Terminal Component

**Files:**
- Create: `src/ssh/SessionManager.ts`
- Create: `src/ui/TerminalView.ts`
- Create: `styles.css`
- Test: `tests/unit/SessionManager.test.ts`
- Test: `tests/unit/TerminalView.test.ts`

**Interfaces:**
- Consumes: `SshSession`, `SshProfile`, and `SshBlockConfig`.
- Produces: `SessionManager.open(instanceId, profileId, callbacks)`, `SessionManager.close(instanceId)`, and `TerminalView.mount(container, options)` returning a `Disposable`.
- Consumers: Tasks 5 and 6.

- [ ] **Step 1: Write failing ownership and DOM interaction tests**

Use jsdom and fake sessions. Verify that rendering alone creates no session, double-clicking Connect creates one session, Disconnect closes it, Clear calls `terminal.clear()`, ResizeObserver forwards dimensions, Escape returns focus to the supplied editor target, and disposing the view closes the session exactly once.

```ts
it("does not create a network session while rendering", () => {
  mountTerminal();
  expect(sessionFactory.calls).toBe(0);
});

it("deduplicates concurrent connect clicks", async () => {
  const view = mountTerminal();
  view.connectButton.click();
  view.connectButton.click();
  await flushPromises();
  expect(sessionFactory.calls).toBe(1);
});

it("closes the owned session when disposed", async () => {
  const view = mountTerminal();
  view.connectButton.click();
  await flushPromises();
  view.dispose();
  expect(fakeSession.closeCalls).toBe(1);
});
```

- [ ] **Step 2: Run the manager/view tests and verify failure**

Run: `npm run test:unit -- tests/unit/SessionManager.test.ts tests/unit/TerminalView.test.ts`

Expected: FAIL because the manager and view do not exist.

- [ ] **Step 3: Implement isolated session ownership**

`SessionManager` stores `Map<string, { session: SshSession; connecting?: Promise<void> }>` and exposes `connect`, `write`, `resize`, `disconnect`, and `closeAll`. `connect` returns the in-flight promise for duplicate calls. `close` removes the entry before awaiting session shutdown so concurrent cleanup remains idempotent.

- [ ] **Step 4: Implement the terminal DOM component**

Instantiate `Terminal` and `FitAddon`, render status text plus Connect/Disconnect/Reconnect/Clear buttons, and subscribe to terminal input only after connection. Use a debounced `ResizeObserver` to call `fit()` and then `SessionManager.resize(instanceId, terminal.rows, terminal.cols)`. Display categorized errors in a `.ssh-terminal__error` region and never interpolate credential values.

Create CSS using Obsidian variables such as `--background-primary`, `--background-secondary`, `--text-normal`, `--text-error`, `--interactive-accent`, and a fixed terminal font stack.

- [ ] **Step 5: Run DOM tests and check resource cleanup**

Run: `npm run test:unit -- tests/unit/SessionManager.test.ts tests/unit/TerminalView.test.ts && npm test`

Expected: all tests PASS; the cleanup tests show one session close and one terminal dispose per mounted component.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/ssh/SessionManager.ts src/ui/TerminalView.ts styles.css tests/unit/SessionManager.test.ts tests/unit/TerminalView.test.ts
git commit -m "feat: add embedded terminal component"
```

---

### Task 5: Reading View Renderer

**Files:**
- Create: `src/render/readingView.ts`
- Test: `tests/unit/readingView.test.ts`

**Interfaces:**
- Consumes: `parseSshBlock`, `ProfileStore`, `TerminalView`, and Obsidian `MarkdownPostProcessorContext`.
- Produces: `registerReadingView(plugin, dependencies): void`.
- Consumers: Task 7.

- [ ] **Step 1: Write failing renderer tests**

Mock `plugin.registerMarkdownCodeBlockProcessor` and assert registration for language `ssh`. Invoke the captured processor with valid source and assert a terminal mount with the resolved profile. Invoke it with an invalid block and assert an inline safe error with no terminal mount. Trigger the registered child cleanup and assert the terminal disposable runs once.

- [ ] **Step 2: Run the reading-view test and verify failure**

Run: `npm run test:unit -- tests/unit/readingView.test.ts`

Expected: FAIL because `registerReadingView` does not exist.

- [ ] **Step 3: Implement the code-block processor**

Register `ssh`, parse before resolving profiles, create a unique instance ID from source path plus a monotonically increasing counter, and mount `TerminalView`. Attach cleanup through a `MarkdownRenderChild` whose `onunload()` disposes the mounted terminal. Invalid configuration or missing profiles render an error card only and never call `SessionManager.connect`.

- [ ] **Step 4: Run reading-view and complete unit tests**

Run: `npm run test:unit -- tests/unit/readingView.test.ts && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/render/readingView.ts tests/unit/readingView.test.ts
git commit -m "feat: render SSH blocks in reading view"
```

---

### Task 6: Live Preview CodeMirror Widget

**Files:**
- Create: `src/render/livePreview.ts`
- Test: `tests/unit/livePreview.test.ts`

**Interfaces:**
- Consumes: `parseSshBlock`, `ProfileStore`, `TerminalView`, CodeMirror `ViewPlugin`, and Obsidian editor extensions.
- Produces: `createLivePreviewExtension(dependencies): Extension`.
- Consumers: Task 7.

- [ ] **Step 1: Write failing syntax-range and widget-lifecycle tests**

Build CodeMirror editor states containing fenced `ssh` blocks. Assert that a block outside the selection is replaced with one widget, a cursor inside the block shows source instead of a widget, unrelated code fences are ignored, document edits recreate the widget, and widget destruction disposes the terminal once.

```ts
it("shows source while the cursor edits the ssh block", () => {
  const view = createEditor("```ssh\nprofile: prod\n```", { anchor: 10 });
  expect(view.dom.querySelector(".ssh-terminal")).toBeNull();
  expect(view.state.doc.toString()).toContain("profile: prod");
});
```

- [ ] **Step 2: Run the Live Preview tests and verify failure**

Run: `npm run test:unit -- tests/unit/livePreview.test.ts`

Expected: FAIL because the extension does not exist.

- [ ] **Step 3: Implement fenced-block discovery and `WidgetType`**

Use Obsidian/CodeMirror syntax-tree nodes to identify fenced code blocks whose info string is exactly `ssh`; do not use a whole-document regular expression. Create block decorations only when no selection range overlaps the fence. `SshTerminalWidget.toDOM()` mounts `TerminalView`; `destroy()` disposes it. `eq()` compares source path, block range, and block source so profile edits recreate the widget.

- [ ] **Step 4: Run Live Preview tests and all unit tests**

Run: `npm run test:unit -- tests/unit/livePreview.test.ts && npm test`

Expected: all tests PASS, including one-time disposal after document edits.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/render/livePreview.ts tests/unit/livePreview.test.ts
git commit -m "feat: render SSH terminals in live preview"
```

---

### Task 7: Settings UI and Plugin Lifecycle Wiring

**Files:**
- Create: `src/settings/SshSettingsTab.ts`
- Create: `src/main.ts`
- Modify: `styles.css`
- Test: `tests/unit/SshSettingsTab.test.ts`
- Test: `tests/unit/main.test.ts`

**Interfaces:**
- Consumes: all stores, renderers, `SessionManager`, and Obsidian plugin lifecycle APIs.
- Produces: the loadable Obsidian plugin entry point.

- [ ] **Step 1: Write failing settings and lifecycle tests**

Test profile creation/editing, unique slug validation, password save through `CredentialStore`, secure failure when keytar is unavailable, profile deletion confirmation, credential/host-key cleanup, renderer registration on load, and `SessionManager.closeAll()` on unload.

```ts
it("never writes the password through plugin.saveData", async () => {
  await settings.submit({ profile, password: "sensitive-value" });
  expect(JSON.stringify(plugin.savedData)).not.toContain("sensitive-value");
  expect(credentials.setPassword).toHaveBeenCalledWith("prod", "sensitive-value");
});
```

- [ ] **Step 2: Run settings/lifecycle tests and verify failure**

Run: `npm run test:unit -- tests/unit/SshSettingsTab.test.ts tests/unit/main.test.ts`

Expected: FAIL because settings and the plugin entry point do not exist.

- [ ] **Step 3: Implement the settings tab**

Provide a profile list and an edit form for stable ID, display name, host, port, username, timeout, and password. Never prefill an existing password; show only “password saved” state. Disable password saving and show a platform-specific explanation when `CredentialStore.isAvailable()` is false. Deletion requires an explicit confirmation modal and calls the coordinated profile cleanup method. A profile with a trusted key also exposes “Forget trusted host key”; it requires confirmation and removes only that profile's stored fingerprint so the next connection returns to the first-use confirmation flow.

- [ ] **Step 4: Wire plugin load/unload**

`onload()` loads or initializes `{ schemaVersion: 1, profiles: [], hostKeys: {} }`, creates stores and factories, adds settings, registers reading view, and registers the Live Preview editor extension. `onunload()` awaits or initiates `sessionManager.closeAll()` and disposes remaining listeners. Guard desktop-only APIs with `Platform.isDesktopApp` and show a notice instead of importing keytar on unsupported platforms.

- [ ] **Step 5: Run the full unit suite and production build**

Run: `npm run check`

Expected: TypeScript, all unit tests, and esbuild PASS; `main.js`, `manifest.json`, and `styles.css` form a loadable development plugin.

- [ ] **Step 6: Commit Task 7**

```powershell
git add src/main.ts src/settings/SshSettingsTab.ts styles.css tests/unit/SshSettingsTab.test.ts tests/unit/main.test.ts
git commit -m "feat: wire SSH terminal plugin lifecycle"
```

---

### Task 8: Docker SSH Integration, Native Packaging, and Acceptance Verification

**Files:**
- Modify: `esbuild.config.mjs`
- Modify: `package.json`
- Create: `tests/fixtures/sshd/Dockerfile`
- Create: `tests/fixtures/sshd/entrypoint.sh`
- Create: `tests/integration/ssh.test.ts`
- Create: `scripts/package-release.mjs`
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Consumes: the production SSH adapter and built plugin.
- Produces: repeatable integration evidence and platform-specific release directories.

- [ ] **Step 1: Add a deterministic SSH server fixture and failing integration test**

Build an Alpine/OpenSSH image with user `obsidian-test`, password supplied through the container environment, password authentication enabled, and a persisted host key volume. The test obtains the mapped localhost port, connects through the production adapter, executes `printf 'ready\\n'`, verifies output, resizes the PTY, and disconnects. A second test recreates host keys and asserts `HOST_KEY_MISMATCH`.

The password must come from `OBSIDIAN_SSH_TEST_PASSWORD`; do not place it in source or snapshots.

- [ ] **Step 2: Run the integration test and verify the expected initial failure**

Run: `docker build -t obsidian-ssh-test tests/fixtures/sshd` followed by `$env:OBSIDIAN_SSH_TEST_PASSWORD='<temporary local value>'; npm run test:integration`

Expected: the test initially FAILS until the fixture port/lifecycle helpers and production adapter path are complete.

- [ ] **Step 3: Complete the fixture and make integration tests pass**

Use test hooks to start `docker run --rm -d -P --name obsidian-ssh-test-<pid>`, resolve the mapped port with `docker port`, and remove only that exact named container in `afterAll`. Validate the computed container name before cleanup. Keep the host key volume for the trusted-key test and use a fresh isolated container for the mismatch test.

- [ ] **Step 4: Implement platform release packaging**

`scripts/package-release.mjs` creates `release/<platform>-<arch>/`, copies `main.js`, `manifest.json`, `versions.json`, `styles.css`, and the installed `keytar` package including its matching native `.node` binary. It exits with a clear error if the current platform binary is absent. It never packages a binary for a different OS/architecture under a misleading directory name.

Add scripts:

```json
{
  "package:release": "npm run build && node scripts/package-release.mjs",
  "verify": "npm run check && npm run test:integration && npm run package:release"
}
```

- [ ] **Step 5: Document installation and security behavior**

README must include manual installation of the matching release directory, the `ssh` block example, desktop-only status, password/keychain behavior, first-connect fingerprint confirmation, fingerprint mismatch recovery through settings, supported platforms, and explicit first-release exclusions.

- [ ] **Step 6: Run final verification**

Run: `npm run verify`

Expected:

- TypeScript check PASS.
- All unit tests PASS.
- Docker SSH integration tests PASS.
- Production bundle PASS.
- A platform-matching release directory contains `main.js`, metadata, CSS, and the keytar native binary.
- `rg -n "sensitive-value|OBSIDIAN_SSH_TEST_PASSWORD=.*[^']" . -g '!node_modules' -g '!docs/superpowers/plans/**'` finds no committed password value.

- [ ] **Step 7: Perform Obsidian acceptance checks**

Install the matching release directory into a test vault and verify both reading view and Live Preview, first host-key confirmation, interactive commands, copy/paste, resize, Escape focus release, reconnect, multiple blocks, view switching, document close, profile deletion, plugin disable, and keychain-unavailable messaging on each target OS before publishing that OS build.

- [ ] **Step 8: Commit Task 8**

```powershell
git add esbuild.config.mjs package.json package-lock.json tests/fixtures tests/integration scripts/package-release.mjs README.md .gitignore
git commit -m "test: verify and package SSH terminal plugin"
```

## Final Completion Gate

Before claiming the plugin complete:

1. Run `npm run verify` and retain the command output.
2. Run `git status --short` and confirm only intentional files remain.
3. Compare every acceptance criterion in `docs/superpowers/specs/2026-07-21-obsidian-ssh-terminal-design.md` with test or manual evidence.
4. Use the `superpowers:verification-before-completion` skill before reporting success.
