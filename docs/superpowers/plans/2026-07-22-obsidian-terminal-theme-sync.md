# Obsidian SSH Terminal Theme Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an already-mounted xterm terminal immediately follow Obsidian background, foreground, cursor, and selection colors without reconnecting or clearing state.

**Architecture:** Add a focused `ObsidianTerminalThemeSync` lifecycle object that maps computed Obsidian CSS variables to xterm `ITheme`. `XtermAdapter` owns it, starts it before `Terminal.open()`, and disposes it with xterm. A `MutationObserver` watches `class` and `style` changes on `html` and `body`.

**Tech Stack:** TypeScript, Obsidian CSS variables, xterm.js, MutationObserver, Vitest/jsdom, esbuild.

## Global Constraints

- Background: `--background-primary`.
- Foreground: `--text-normal`.
- Cursor: `--text-accent`, falling back to foreground.
- Selection: `--text-selection`, falling back to `rgba(127, 127, 127, 0.35)`.
- Keep ANSI colors unchanged.
- Never reconnect, clear, or rebuild xterm during a theme change.
- Disconnect observers on terminal disposal.
- Add Chinese comments to production code.
- Do not modify `manifest.json`; its author change is already committed separately.

---

### Task 1: Theme Reader and Live Synchronizer

**Files:**
- Create: `src/ui/ObsidianTerminalThemeSync.ts`
- Create: `tests/unit/ObsidianTerminalThemeSync.test.ts`

**Interfaces:**
- Produces: `readObsidianTerminalTheme(container: HTMLElement): ITheme`
- Produces: `ObsidianTerminalThemeSync.start(): void`
- Produces: `ObsidianTerminalThemeSync.dispose(): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ObsidianTerminalThemeSync.test.ts` with:

```typescript
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObsidianTerminalThemeSync,
  readObsidianTerminalTheme
} from "../../src/ui/ObsidianTerminalThemeSync";

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: MutationCallback) {
    FakeMutationObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as MutationObserver);
  }
}

afterEach(() => {
  FakeMutationObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("ObsidianTerminalThemeSync", () => {
  it("maps Obsidian variables to xterm colors", () => {
    const container = document.createElement("div");
    container.style.setProperty("--background-primary", "rgb(1, 2, 3)");
    container.style.setProperty("--text-normal", "rgb(4, 5, 6)");
    container.style.setProperty("--text-accent", "rgb(7, 8, 9)");
    container.style.setProperty("--text-selection", "rgba(10, 11, 12, 0.4)");

    expect(readObsidianTerminalTheme(container)).toMatchObject({
      background: "rgb(1, 2, 3)",
      foreground: "rgb(4, 5, 6)",
      cursor: "rgb(7, 8, 9)",
      cursorAccent: "rgb(1, 2, 3)",
      selectionBackground: "rgba(10, 11, 12, 0.4)"
    });
  });

  it("updates the same terminal and disconnects the observer", () => {
    vi.stubGlobal("MutationObserver", FakeMutationObserver);
    const container = document.createElement("div");
    container.style.setProperty("--background-primary", "rgb(20, 20, 20)");
    container.style.setProperty("--text-normal", "rgb(230, 230, 230)");
    const terminal = { options: { theme: {} } };
    const sync = new ObsidianTerminalThemeSync(container, terminal);

    sync.start();
    container.style.setProperty("--background-primary", "rgb(250, 250, 250)");
    container.style.setProperty("--text-normal", "rgb(10, 10, 10)");
    FakeMutationObserver.instances[0].trigger();

    expect(terminal.options.theme).toMatchObject({
      background: "rgb(250, 250, 250)",
      foreground: "rgb(10, 10, 10)"
    });
    sync.dispose();
    expect(FakeMutationObserver.instances[0].disconnect).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npx vitest run tests/unit/ObsidianTerminalThemeSync.test.ts
```

Expected: FAIL because `src/ui/ObsidianTerminalThemeSync.ts` does not exist.

- [ ] **Step 3: Implement the synchronizer**

Create `src/ui/ObsidianTerminalThemeSync.ts`:

```typescript
import type { ITheme } from "@xterm/xterm";

interface ThemeAwareTerminal {
  options: { theme?: ITheme };
}

/** 从 Obsidian 计算样式中提取 xterm 可直接使用的颜色。 */
export function readObsidianTerminalTheme(container: HTMLElement): ITheme {
  const style = getComputedStyle(container);
  const background = readColor(style, "--background-primary", "#1e1e1e");
  const foreground = readColor(style, "--text-normal", "#d4d4d4");
  return {
    background,
    foreground,
    cursor: readColor(style, "--text-accent", foreground),
    cursorAccent: background,
    selectionBackground: readColor(
      style,
      "--text-selection",
      "rgba(127, 127, 127, 0.35)"
    )
  };
}

/** 监听 Obsidian 主题属性变化，并更新现有 xterm 实例。 */
export class ObsidianTerminalThemeSync {
  private observer: MutationObserver | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly terminal: ThemeAwareTerminal
  ) {}

  start(): void {
    this.applyTheme();
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => this.applyTheme());
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "style"]
    };
    this.observer.observe(document.documentElement, options);
    this.observer.observe(document.body, options);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private applyTheme(): void {
    this.terminal.options.theme = readObsidianTerminalTheme(this.container);
  }
}

function readColor(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
npx vitest run tests/unit/ObsidianTerminalThemeSync.test.ts
```

Expected: 1 file, 2 tests passed.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/ObsidianTerminalThemeSync.ts tests/unit/ObsidianTerminalThemeSync.test.ts
git commit -m "feat: sync terminal colors with Obsidian theme"
```

### Task 2: Attach Sync to Xterm Lifecycle

**Files:**
- Modify: `src/ui/TerminalView.ts:1-5,183-205`
- Modify: `tests/unit/TerminalView.test.ts`

**Interfaces:**
- Consumes: `ObsidianTerminalThemeSync`.
- Produces: `XtermAdapter.open()` starts synchronization.
- Produces: `XtermAdapter.dispose()` stops synchronization.

- [ ] **Step 1: Add a failing adapter integration test**

Replace the two existing xterm mocks at the top of `tests/unit/TerminalView.test.ts` with:

```typescript
const xtermMocks = vi.hoisted(() => ({
  options: { theme: {} as Record<string, string> },
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  fit: vi.fn()
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    options = xtermMocks.options;
    open = xtermMocks.open;
    write = xtermMocks.write;
    clear = xtermMocks.clear;
    focus = xtermMocks.focus;
    dispose = xtermMocks.dispose;
    loadAddon = xtermMocks.loadAddon;
    onData = xtermMocks.onData;
  }
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class { fit = xtermMocks.fit; }
}));
```

Add this exact test inside `describe("TerminalView", ...)`:

```typescript
it("applies Obsidian colors when using the real xterm adapter", async () => {
  const styleSpy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (name: string) => ({
      "--background-primary": "rgb(12, 13, 14)",
      "--text-normal": "rgb(220, 221, 222)",
      "--text-accent": "rgb(100, 110, 120)",
      "--text-selection": "rgba(80, 90, 100, 0.4)"
    })[name] ?? ""
  } as CSSStyleDeclaration);
  const container = document.createElement("div");
  document.body.append(container);
  const manager = {
    connect: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(async () => undefined)
  };
  const view = TerminalView.mount(container, {
    instanceId: "theme-block",
    profile: {
      id: "prod",
      name: "Prod",
      host: "host",
      port: 22,
      username: "ops",
      timeoutMs: 15_000
    },
    height: 360,
    manager
  });

  expect(xtermMocks.options.theme).toMatchObject({
    background: "rgb(12, 13, 14)",
    foreground: "rgb(220, 221, 222)"
  });
  await view.dispose();
  expect(xtermMocks.dispose).toHaveBeenCalledOnce();
  styleSpy.mockRestore();
});
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run tests/unit/TerminalView.test.ts
```

Expected: FAIL because `XtermAdapter` still uses a hard-coded transparent background and has no synchronizer.

- [ ] **Step 3: Integrate the synchronizer**

Add to `src/ui/TerminalView.ts`:

```typescript
import { ObsidianTerminalThemeSync } from "./ObsidianTerminalThemeSync";
```

Update `XtermAdapter` so its terminal options no longer contain `theme: { background: "#00000000" }`. Add:

```typescript
private themeSync: ObsidianTerminalThemeSync | undefined;
```

Replace `open` and `dispose` with:

```typescript
open(container: HTMLElement): void {
  this.themeSync = new ObsidianTerminalThemeSync(container, this.terminal);
  this.themeSync.start();
  this.terminal.open(container);
}

dispose(): void {
  this.themeSync?.dispose();
  this.themeSync = undefined;
  this.terminal.dispose();
}
```

- [ ] **Step 4: Verify focused and full tests**

```powershell
npx vitest run tests/unit/TerminalView.test.ts tests/unit/ObsidianTerminalThemeSync.test.ts
npm run check
```

Expected: focused tests pass; TypeScript succeeds; all unit tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/TerminalView.ts tests/unit/TerminalView.test.ts
git commit -m "feat: apply Obsidian theme to xterm lifecycle"
```

### Task 3: Real Obsidian Verification and Deployment

**Files:**
- Build: `main.js`, `styles.css`
- Deploy: `C:\Users\qiye.zzc\Documents\Personal\Obsidian-Home\Main\我的主知识库\.obsidian\plugins\ssh-terminal\main.js`
- Deploy: `C:\Users\qiye.zzc\Documents\Personal\Obsidian-Home\Main\我的主知识库\.obsidian\plugins\ssh-terminal\styles.css`

- [ ] **Step 1: Build production assets**

```powershell
npm run build
```

Expected: exit code 0.

- [ ] **Step 2: Verify an already-mounted terminal in isolated Obsidian**

Start an isolated Obsidian Vault with CDP. Confirm:

1. `.ssh-terminal` and all four toolbar buttons exist.
2. Record the current xterm background and foreground.
3. Change the test theme CSS variables or switch the body theme class.
4. Confirm the same terminal instance receives new colors.
5. Confirm no reconnect, clear, or xterm reconstruction occurs.
6. Close the isolated instance and remove only the validated temporary paths.

- [ ] **Step 3: Deploy verified files**

```powershell
$installed = 'C:\Users\qiye.zzc\Documents\Personal\Obsidian-Home\Main\我的主知识库\.obsidian\plugins\ssh-terminal'
Copy-Item -LiteralPath '.\main.js' -Destination (Join-Path $installed 'main.js') -Force
Copy-Item -LiteralPath '.\styles.css' -Destination (Join-Path $installed 'styles.css') -Force
```

Do not modify installed `data.json` or `node_modules`.

- [ ] **Step 4: Verify deployed hash and repository state**

```powershell
$installed = 'C:\Users\qiye.zzc\Documents\Personal\Obsidian-Home\Main\我的主知识库\.obsidian\plugins\ssh-terminal'
$local = (Get-FileHash '.\main.js').Hash
$deployed = (Get-FileHash (Join-Path $installed 'main.js')).Hash
if ($local -ne $deployed) { throw 'Installed main.js hash mismatch' }
git diff --check
git status --short
git log -3 --oneline
```

Expected: hashes match and the working tree contains no uncommitted theme-sync changes.
