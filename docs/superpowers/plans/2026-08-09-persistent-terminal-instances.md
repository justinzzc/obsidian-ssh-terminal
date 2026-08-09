# 运行期终端实例与独立终端视图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加左侧 SSH Sessions 入口，使从 Markdown 启动的 SSH 会话在切换文档后继续运行，并能在唯一独立 Terminal 标签页与初始来源 block 之间迁移。

**Architecture:** 新增纯内存 `TerminalInstanceRegistry` 作为实例、来源、状态和 Host 迁移的唯一事实源；现有 `TerminalView` 改造成可 attach/detach 的唯一 xterm 界面。阅读视图和实时预览只注册来源 Host，Obsidian ItemView 负责左侧列表和独立终端标签页，SSH 连接仍复用现有 `SessionManager` 与 `SshSession`。

**Tech Stack:** TypeScript、Obsidian Plugin API、CodeMirror 6、xterm.js、Vitest、jsdom

## Global Constraints

- 只保证单次 Obsidian 运行期间保活；不得把活动实例写入 `data.json`。
- 一个实例同一时间最多一个 SSH 会话，并始终只有一个 xterm 实例。
- 终端界面同一时间只挂载在来源文档、独立 Terminal 标签页或后台中的一个位置。
- 初始来源在首次从 Markdown 启动时确定，界面迁移不得改变来源。
- 不得在实例快照、View state、日志、Notice 或持久化数据中包含 password、命令输入或终端输出。
- 关闭独立 Terminal 标签页不得断开 SSH；插件卸载或 Obsidian 退出必须关闭全部会话。
- Remove 只允许移除已断开的实例；活动实例必须显式 Disconnect。
- 原有 inline/profile 解析、主机指纹确认、凭据存储和错误映射行为保持兼容。

---

### Task 1: 定义非敏感来源身份

**Files:**
- Create: `src/terminal/TerminalOrigin.ts`
- Create: `tests/unit/TerminalOrigin.test.ts`

**Interfaces:**
- Consumes: `SshBlockConfig` from `src/model.ts`。
- Produces: `TerminalOrigin`, `createTerminalBlockKey()`, `createTerminalOrigin()`, `haveSameTerminalOrigin()`，供统一 block 扫描、注册表和两个 Markdown 渲染器使用。

- [ ] **Step 1: 写来源身份失败测试**

创建 `tests/unit/TerminalOrigin.test.ts`，覆盖以下实际行为：

```typescript
import { describe, expect, it } from "vitest";
import {
  createTerminalOrigin,
  haveSameTerminalOrigin
} from "../../src/terminal/TerminalOrigin";

describe("TerminalOrigin", () => {
  it("creates a stable non-secret key for profile blocks", () => {
    const origin = createTerminalOrigin("ops/server.md", {
      mode: "profile",
      profileId: "production",
      height: 360
    }, 0);

    expect(origin).toEqual({
      sourcePath: "ops/server.md",
      blockKey: "profile:production:0"
    });
  });

  it("does not include inline passwords or presentation height", () => {
    const first = createTerminalOrigin("ops/server.md", {
      mode: "inline",
      host: "Server.Example.com",
      port: 22,
      username: "root",
      password: "first-secret",
      height: 360,
      timeoutMs: 15_000
    }, 1);
    const second = createTerminalOrigin("ops/server.md", {
      mode: "inline",
      host: "server.example.com",
      port: 22,
      username: "root",
      password: "second-secret",
      height: 600,
      timeoutMs: 15_000
    }, 1);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("secret");
  });

  it("distinguishes duplicate blocks by occurrence", () => {
    const config = { mode: "profile", profileId: "production", height: 360 } as const;
    expect(haveSameTerminalOrigin(
      createTerminalOrigin("ops/server.md", config, 0),
      createTerminalOrigin("ops/server.md", config, 1)
    )).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/unit/TerminalOrigin.test.ts`

Expected: FAIL，因为 `src/terminal/TerminalOrigin.ts` 尚不存在。

- [ ] **Step 3: 实现来源身份**

创建以下公开接口：

```typescript
import type { SshBlockConfig } from "../model";

export interface TerminalOrigin {
  sourcePath: string;
  blockKey: string;
}

export function createTerminalBlockKey(
  config: SshBlockConfig,
  occurrence: number
): string;

export function createTerminalOrigin(
  sourcePath: string,
  config: SshBlockConfig,
  occurrence: number
): TerminalOrigin;

export function haveSameTerminalOrigin(
  left: TerminalOrigin,
  right: TerminalOrigin
): boolean;
```

`blockKey` 使用 URL 编码字段组成，不使用原始 YAML：

- profile：`profile:<encoded profileId>:<occurrence>`。
- inline：`inline:<encoded normalizedHost>:<port>:<encoded username>:<timeoutMs>:<occurrence>`。
- host 去除 IPv6 方括号并转小写。
- password 和 height 不参与 key，也不得保存在 `TerminalOrigin` 中。
- `occurrence` 必须是非负整数；无效值抛出 `RangeError`。

- [ ] **Step 4: 运行来源身份测试**

Run: `npx vitest run tests/unit/TerminalOrigin.test.ts`

Expected: 3 tests PASS，输出无 warning。

- [ ] **Step 5: 提交来源身份**

```powershell
git add src/terminal/TerminalOrigin.ts tests/unit/TerminalOrigin.test.ts
git commit -m "feat: add terminal origin identity"
```

---

### Task 2: 让 TerminalView 支持界面迁移

**Files:**
- Modify: `src/ui/TerminalView.ts`
- Modify: `tests/unit/TerminalView.test.ts`

**Interfaces:**
- Consumes: 现有 `TerminalAdapter`、`TerminalSessionManager` 和 `TerminalViewOptions`。
- Produces: `TerminalView.attach()`, `TerminalView.detach()`, `TerminalView.isAttached()`；后续注册表使用同一个对象在 Host 之间移动。

- [ ] **Step 1: 为 attach/detach 写失败测试**

在 `tests/unit/TerminalView.test.ts` 增加：

```typescript
it("moves the same terminal root between hosts without disposing it", () => {
  const firstHost = document.createElement("div");
  const secondHost = document.createElement("div");
  const terminal = makeTerminalView(firstHost);
  const root = firstHost.querySelector(".ssh-terminal");

  terminal.detach();
  expect(firstHost).toBeEmptyDOMElement();
  expect(terminal.isAttached()).toBe(false);

  terminal.attach(secondHost);
  expect(secondHost.querySelector(".ssh-terminal")).toBe(root);
  expect(terminal.isAttached()).toBe(true);
  expect(fakeTerminal.dispose).not.toHaveBeenCalled();
});
```

同时增加：重复 attach 同一 Host 幂等；`dispose()` 后 `attach()` 不重新挂载；detach 不关闭 `SessionManager` 会话。

- [ ] **Step 2: 运行聚焦测试并确认失败**

Run: `npx vitest run tests/unit/TerminalView.test.ts`

Expected: FAIL，缺少 `attach`、`detach` 和 `isAttached`。

- [ ] **Step 3: 实现可迁移 TerminalView**

新增公开方法：

```typescript
attach(container: HTMLElement): void;
detach(): void;
isAttached(): boolean;
focus(): void;
clear(): void;
```

实现约束：

- 构造时仍挂载到传入 container，保持现有调用兼容。
- `detach()` 只把 `.ssh-terminal` root 从当前 DOM 移除，并暂停基于容器尺寸的 ResizeObserver；不得清理 xterm、会话订阅或 SSH。
- `attach()` 使用 `container.replaceChildren(this.root)` 迁移同一 root，重新观察屏幕容器，执行 `fit()` 并聚焦。
- 主题同步必须在 root 跨容器后继续工作；不得创建第二个 `TerminalAdapter`。
- `dispose({ preserveSession })` 保持原语义，并成为唯一释放 xterm 的方法。
- `focus()` 和 `clear()` 供独立标签页工具栏调用。

- [ ] **Step 4: 运行 TerminalView 测试**

Run: `npx vitest run tests/unit/TerminalView.test.ts`

Expected: 全部 PASS，新增迁移测试证明同一 root 和同一 adapter 被复用。

- [ ] **Step 5: 提交可迁移终端**

```powershell
git add src/ui/TerminalView.ts tests/unit/TerminalView.test.ts
git commit -m "feat: make terminal views movable"
```

---

### Task 3: 实现运行时 TerminalInstanceRegistry

**Files:**
- Create: `src/terminal/TerminalInstanceRegistry.ts`
- Create: `tests/unit/TerminalInstanceRegistry.test.ts`

**Interfaces:**
- Consumes: `TerminalOrigin`, `TerminalView`, `SshConnectionTarget`, `SessionManager`。
- Produces: 实例快照、Host 注册、连接、迁移、断开、重连、移除、来源重命名/删除和订阅 API。

- [ ] **Step 1: 写注册表生命周期失败测试**

创建测试用 fake `SessionManager` 与 fake movable terminal，至少覆盖：

```typescript
it("publishes an instance only after connect starts", async () => {
  const prepared = registry.prepare({
    origin,
    createTarget,
    height: 360
  });
  expect(registry.list()).toEqual([]);

  await prepared.connect();
  expect(registry.list()).toMatchObject([{
    id: prepared.instanceId,
    displayName: "root@server.example.com:22",
    origin,
    status: "connected",
    location: { kind: "background" }
  }]);
});

it("moves one terminal between document and item-view hosts", async () => {
  const instance = await connectedInstance();
  registry.registerHost(instance.id, documentHost);
  registry.activate(instance.id, documentHost.id);
  registry.registerHost(instance.id, itemViewHost);
  registry.activate(instance.id, itemViewHost.id);

  expect(terminal.attach).toHaveBeenLastCalledWith(itemViewHost.container);
  expect(registry.get(instance.id)?.location).toEqual({
    kind: "terminal-tab",
    hostId: itemViewHost.id
  });
});
```

再覆盖：相同来源 prepare 去重、同一来源注册多个 document Host 时只有被激活 Host 承载终端、Host 注销转后台、pending source activation 在来源 Host 注册后自动迁移、远端 closed 状态同步为 Disconnected、Disconnect 保留记录、Reconnect 替换会话但复用 terminal、活动实例 Remove 抛错、已断开 Remove 释放 terminal、renameSource、markSourceUnavailable、closeAll。

- [ ] **Step 2: 运行注册表测试并确认失败**

Run: `npx vitest run tests/unit/TerminalInstanceRegistry.test.ts`

Expected: FAIL，因为注册表模块不存在。

- [ ] **Step 3: 定义注册表公开类型**

使用以下稳定接口：

```typescript
export type TerminalInstanceStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export type TerminalLocation =
  | { kind: "document"; hostId: string }
  | { kind: "terminal-tab"; hostId: string }
  | { kind: "background" };

export interface TerminalInstanceSnapshot {
  id: string;
  displayName: string;
  origin: TerminalOrigin;
  sourceAvailable: boolean;
  status: TerminalInstanceStatus;
  location: TerminalLocation;
  lastActiveAt: number;
}

export interface TerminalHostRegistration {
  id: string;
  kind: "document" | "terminal-tab";
  container: HTMLElement;
}

export interface PreparedTerminalInstance {
  instanceId: string;
  attach(host: TerminalHostRegistration): Disposable;
  connect(): Promise<void>;
  disposeIfUnused(): void;
}
```

`TerminalInstanceRegistry` 至少提供：

```typescript
prepare(options: {
  origin: TerminalOrigin;
  createTarget(): SshConnectionTarget;
  height: number;
}): PreparedTerminalInstance;
list(): TerminalInstanceSnapshot[];
get(instanceId: string): TerminalInstanceSnapshot | undefined;
findByOrigin(origin: TerminalOrigin): TerminalInstanceSnapshot | undefined;
subscribe(handler: () => void): Disposable;
registerHost(instanceId: string, host: TerminalHostRegistration): Disposable;
activate(instanceId: string, hostId: string): void;
requestSourceActivation(instanceId: string): void;
clear(instanceId: string): void;
focus(instanceId: string): void;
disconnect(instanceId: string): Promise<void>;
reconnect(instanceId: string): Promise<void>;
remove(instanceId: string): void;
renameSource(oldPath: string, newPath: string): void;
markSourceUnavailable(sourcePath: string): void;
closeAll(): Promise<void>;
```

- [ ] **Step 4: 实现注册表状态机**

实现规则：

- `prepare()` 在一个脱离文档的 staging container 中创建唯一 TerminalView，并可以创建不出现在 `list()` 的 dormant 实例；`attach()` 把该 TerminalView 挂载到初始 document Host。
- TerminalView 使用注册表提供的 `TerminalSessionManager` adapter；无论用户点击 TerminalView 内部 Connect 按钮还是调用 prepared handle 的 `connect()`，adapter 都会在首次连接时立即发布 Connecting，成功后 Connected，失败后 Failed。
- adapter 订阅返回 session 的 `onStateChange`；远端进入 `closed` 时更新为 Disconnected，`failed` 时更新为 Failed，并通知所有 UI 订阅者。
- 同一 `TerminalOrigin` 只返回同一 dormant/active 实例。
- 实例内部保存 `createTarget` closure，但公开快照只复制非敏感字段。
- `activate()` 必须先确认目标 Host 仍注册，再调用同一 `TerminalView.attach()`；没有 Host 时抛出可安全展示的错误。
- Host disposable 只注销 Host；当前 Host 被注销时 `TerminalView.detach()` 并转 Background。
- `requestSourceActivation()` 记录一次性 pending intent；如果匹配来源的 document Host 已注册则立即激活，否则在该 Host 随后注册时自动激活并清除 intent。
- `clear()` 和 `focus()` 只代理到实例唯一 TerminalView，不暴露 TerminalView 对象。
- `disconnect()` 调用 `SessionManager.close()`，状态变 Disconnected，不释放 TerminalView。
- `reconnect()` 只允许 Disconnected/Failed；复用 instance ID 与 TerminalView，通过 `SessionManager.connect()` 创建替代会话。
- `remove()` 在 Connecting/Connected 时抛出 `PluginError("SESSION_STATE_INVALID", ...)`；其他状态 dispose TerminalView 并删除索引。
- `list()` 按 `lastActiveAt` 降序，并返回深复制快照。
- `closeAll()` 关闭全部会话、dispose 全部终端、清空订阅和索引。

- [ ] **Step 5: 运行注册表测试**

Run: `npx vitest run tests/unit/TerminalInstanceRegistry.test.ts`

Expected: 全部 PASS，并且隐私断言确认 JSON 快照不包含测试 password 或 terminal output。

- [ ] **Step 6: 提交注册表**

```powershell
git add src/terminal/TerminalInstanceRegistry.ts tests/unit/TerminalInstanceRegistry.test.ts
git commit -m "feat: manage runtime terminal instances"
```

---

### Task 4: 将 Markdown 渲染器接入来源 Host

**Files:**
- Modify: `src/render/readingView.ts`
- Modify: `src/render/livePreview.ts`
- Create: `src/render/findSshBlocksInMarkdown.ts`
- Create: `src/render/TerminalBlockMount.ts`
- Modify: `tests/unit/readingView.test.ts`
- Modify: `tests/unit/livePreview.test.ts`
- Create: `tests/unit/findSshBlocksInMarkdown.test.ts`
- Create: `tests/unit/TerminalBlockMount.test.ts`

**Interfaces:**
- Consumes: `TerminalInstanceRegistry`, `createTerminalOrigin()`, `parseSshBlock()`, `resolveSshConnectionTarget()`。
- Produces: 阅读视图和实时预览共享的 block 状态 UI 与 Host 生命周期。

- [ ] **Step 1: 写统一 fenced block 扫描失败测试**

`findSshBlocksInMarkdown.test.ts` 使用完整 Markdown 文本断言：

```typescript
const blocks = findSshBlocksInMarkdown([
  "before",
  "```ssh",
  "profile: production",
  "```",
  "middle",
  "```ssh",
  "profile: production",
  "```"
].join("\n"));

expect(blocks.map(({ lineStart, occurrence }) => ({ lineStart, occurrence })))
  .toEqual([
    { lineStart: 1, occurrence: 0 },
    { lineStart: 5, occurrence: 1 }
  ]);
```

扫描结果必须包含 `from`、`to`、`lineStart`、原始 block `source` 和按非敏感连接 identity 计算的 `occurrence`。password 和 height 不影响 occurrence 分组。

- [ ] **Step 2: 运行扫描测试并确认失败**

Run: `npx vitest run tests/unit/findSshBlocksInMarkdown.test.ts`

Expected: FAIL，因为统一扫描模块不存在。

- [ ] **Step 3: 实现统一 fenced block 扫描**

把现有 Live Preview 的逐行 fenced block 扫描移入 `findSshBlocksInMarkdown()`。扫描器对每个合法 `ssh` block 调用 `parseSshBlock()`，按 Task 1 的非敏感 block key 计数 occurrence；非法 block 仍返回位置和 source，但 occurrence 使用同一原始 source 在当前文档内的序号，供错误 UI 稳定渲染。

- [ ] **Step 4: 写共享 block mount 失败测试**

`TerminalBlockMount.test.ts` 覆盖三种状态：

```typescript
it("shows Connect before an instance has started", () => {
  const mount = mountTerminalBlock(container, dependencies);
  expect(container.querySelector('[data-action="connect"]')).not.toBeNull();
  expect(container.querySelector('[data-action="activate"]')).toBeNull();
  mount.dispose();
});

it("shows Activate when the origin instance is in another host", () => {
  registry.findByOrigin.mockReturnValue(connectedInTab);
  mountTerminalBlock(container, dependencies);
  expect(container.textContent).toContain("Connected");
  expect(container.querySelector('[data-action="activate"]')).not.toBeNull();
});

it("unregisters the document host without disconnecting", () => {
  const mount = mountTerminalBlock(container, dependencies);
  mount.dispose();
  expect(hostDisposable.dispose).toHaveBeenCalledOnce();
  expect(registry.disconnect).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: 运行 block mount 测试并确认失败**

Run: `npx vitest run tests/unit/TerminalBlockMount.test.ts`

Expected: FAIL，因为共享 mount 模块不存在。

- [ ] **Step 6: 实现共享 TerminalBlockMount**

公开接口：

```typescript
export interface TerminalBlockMountDependencies {
  sourcePath: string;
  source: string;
  occurrence: number;
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
  registry: TerminalInstanceRegistry;
  openTerminal(instanceId: string): Promise<void>;
  returnFocus?: () => void;
}

export function mountTerminalBlock(
  container: HTMLElement,
  dependencies: TerminalBlockMountDependencies
): { dispose(): void };
```

实现行为：

- 解析 config 并创建来源 identity。
- 没有 active/dormant 实例时创建 `prepare()` handle，渲染可连接终端；连接成功后注册 document Host 并激活。
- 已有实例且当前 Host 不是本 block 时，只渲染状态、当前位置、Activate、打开终端入口；打开终端调用注入的 `openTerminal(instanceId)`。
- Activate 注册当前 Host 并调用 registry.activate。
- Disconnected/Failed 显示 Reconnect 和 Remove。
- dispose 取消注册表订阅、注销 Host、清理未使用 dormant 实例；不得调用 disconnect。

- [ ] **Step 7: 改造 Reading View**

- 将 `ReadingViewDependencies.manager` 替换为 `registry`。
- 删除递增 `nextInstanceId`。
- 给 `ReadingRenderContext` 增加 `getSectionInfo(container): { lineStart: number } | null`；给 dependencies 增加 `readSource(sourcePath): Promise<string>`。
- processor 先读取完整来源 Markdown，使用 `findSshBlocksInMarkdown()`，再用 `lineStart` 找到与当前 processor 对应的 occurrence。这样与 Live Preview 使用同一身份规则，并能在文档其他位置增删普通文本后继续匹配。
- 在异步读取完成前显示轻量占位；如果文档或 section 已卸载，忽略迟到结果，不挂载 Host。
- `TerminalRenderChild.onunload()` 只调用共享 mount 的 `dispose()`。

- [ ] **Step 8: 改造 Live Preview**

- `LivePreviewDependencies.manager` 替换为 `registry`。
- `findSshBlocks()` 使用 `findSshBlocksInMarkdown(state.doc.toString())` 的位置、source 和 occurrence，再应用 selection overlap 过滤。
- widget `toDOM()` 使用 `mountTerminalBlock()`。
- widget destroy 和 EditorView destroy 只注销 Host/订阅，不关闭会话。
- 删除原 `sessionIdsByView` 和基于 block 删除直接 `manager.close()` 的逻辑。

- [ ] **Step 9: 运行 Markdown 渲染测试**

Run: `npx vitest run tests/unit/findSshBlocksInMarkdown.test.ts tests/unit/TerminalBlockMount.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts`

Expected: 全部 PASS；测试明确证明切换/销毁文档不会调用 SessionManager.close。

- [ ] **Step 10: 提交 Markdown 集成**

```powershell
git add src/render/findSshBlocksInMarkdown.ts src/render/TerminalBlockMount.ts src/render/readingView.ts src/render/livePreview.ts tests/unit/findSshBlocksInMarkdown.test.ts tests/unit/TerminalBlockMount.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts
git commit -m "feat: keep terminal instances across documents"
```

---

### Task 5: 实现左侧列表与独立 Terminal 标签页

**Files:**
- Create: `src/ui/SshSessionsView.ts`
- Create: `src/ui/PersistentTerminalItemView.ts`
- Create: `src/ui/TerminalWorkspaceController.ts`
- Create: `tests/unit/SshSessionsView.test.ts`
- Create: `tests/unit/PersistentTerminalItemView.test.ts`
- Create: `tests/unit/TerminalWorkspaceController.test.ts`
- Modify: `tests/mocks/obsidian.ts`

**Interfaces:**
- Consumes: Obsidian `ItemView`, `WorkspaceLeaf`, `Workspace`, `TerminalInstanceRegistry`。
- Produces: view type 常量、workspace controller、列表 UI、唯一实例 Terminal leaf。

- [ ] **Step 1: 扩展 Obsidian 测试 mock**

为 `tests/mocks/obsidian.ts` 增加最小可测试 API：

```typescript
export class WorkspaceLeaf {
  view: unknown;
  state: unknown;
  async setViewState(state: unknown): Promise<void> { this.state = state; }
}

export class ItemView {
  readonly containerEl = document.createElement("div");
  constructor(readonly leaf: WorkspaceLeaf) {}
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}
```

并让 `Plugin` mock 记录 `registerView()` 与 `addRibbonIcon()` 回调，使主装配测试可以断言。

- [ ] **Step 2: 写 workspace controller 失败测试**

覆盖：打开唯一侧边栏、按 instance ID 复用已有 Terminal leaf、聚焦已有 leaf、打开来源文档、来源不可用时 Notice。

```typescript
it("reuses the terminal leaf for the same instance", async () => {
  await controller.openTerminal("instance-1");
  await controller.openTerminal("instance-1");
  expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
  expect(workspace.revealLeaf).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: 实现 TerminalWorkspaceController**

导出常量：

```typescript
export const SSH_SESSIONS_VIEW_TYPE = "ssh-terminal-sessions";
export const SSH_TERMINAL_VIEW_TYPE = "ssh-terminal-instance";
```

Controller 提供：

```typescript
openSessions(): Promise<void>;
openTerminal(instanceId: string): Promise<void>;
openSource(instanceId: string): Promise<void>;
activateInSource(instanceId: string): Promise<void>;
```

- Sessions view 使用左侧 leaf。
- Terminal view state 只包含 `{ instanceId }`，不得包含连接目标或 secret。
- 维护 `Map<instanceId, WorkspaceLeaf>`；ItemView close 时删除映射但不 disconnect。
- `openSource()` 使用快照的 `origin.sourcePath`，文件不可用时 Notice。
- `activateInSource()` 先调用 registry.requestSourceActivation(instanceId)，再打开来源文件；来源 block Host 注册后由 registry 自动完成迁移。若来源已经打开且 Host 已注册，则立即激活。

- [ ] **Step 4: 写并实现 SshSessionsView**

测试并实现：

- 空状态显示 `No SSH sessions`。
- 订阅 registry 后按 `lastActiveAt` 渲染。
- 每项显示 displayName、状态、来源路径和 location。
- 按钮使用 `data-action="open-terminal|open-source|disconnect|reconnect|remove"`。
- Connected/Connecting 隐藏 Remove；Disconnected/Failed 显示 Remove 和 Reconnect。
- `onClose()` 取消订阅。

- [ ] **Step 5: 写并实现 PersistentTerminalItemView**

测试并实现：

- `setState({ instanceId })` 后获取实例并注册 `terminal-tab:<instanceId>` Host。
- 实例当前在其他 Host 时显示 `Activate here`；点击后调用 registry.activate。
- 显示来源路径及 Open source。
- Clear 调用 registry.clear；终端激活后调用 registry.focus；Disconnect 调用 registry.disconnect。
- `onClose()` 只 dispose Host registration 并通知 controller 忘记 leaf；不得 disconnect。
- 实例已移除时显示 `SSH terminal instance is no longer available.`。

- [ ] **Step 6: 运行 Workspace UI 测试**

Run: `npx vitest run tests/unit/TerminalWorkspaceController.test.ts tests/unit/SshSessionsView.test.ts tests/unit/PersistentTerminalItemView.test.ts`

Expected: 全部 PASS，关闭 leaf 的测试明确断言没有调用 disconnect。

- [ ] **Step 7: 提交 Workspace UI**

```powershell
git add src/ui/SshSessionsView.ts src/ui/PersistentTerminalItemView.ts src/ui/TerminalWorkspaceController.ts tests/unit/SshSessionsView.test.ts tests/unit/PersistentTerminalItemView.test.ts tests/unit/TerminalWorkspaceController.test.ts tests/mocks/obsidian.ts
git commit -m "feat: add ssh sessions workspace views"
```

---

### Task 6: 装配插件入口、Ribbon 与文档事件

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `tests/unit/main.test.ts`
- Modify: `tests/unit/releaseCompliance.test.ts`

**Interfaces:**
- Consumes: Registry、两个 ItemView、Workspace controller、现有 profiles/credentials/host keys/session factory。
- Produces: 完整插件运行时装配、Ribbon 入口、vault rename/delete 同步和卸载清理。

- [ ] **Step 1: 写插件装配失败测试**

`main.test.ts` 使用增强后的 Obsidian mock，断言：

```typescript
it("registers the sessions ribbon and both workspace views", async () => {
  await plugin.onload();
  expect(plugin.registerView).toHaveBeenCalledWith(
    "ssh-terminal-sessions",
    expect.any(Function)
  );
  expect(plugin.registerView).toHaveBeenCalledWith(
    "ssh-terminal-instance",
    expect.any(Function)
  );
  expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
    "square-terminal",
    "SSH Sessions",
    expect.any(Function)
  );
});

it("renames and invalidates instance origins from vault events", async () => {
  await plugin.onload();
  vault.emit("rename", { path: "new.md" }, "old.md");
  vault.emit("delete", { path: "new.md" });
  expect(registry.renameSource).toHaveBeenCalledWith("old.md", "new.md");
  expect(registry.markSourceUnavailable).toHaveBeenCalledWith("new.md");
});
```

另测 `onunload()` 调用 registry.closeAll，且 view/ribbon 注册不在移动端执行。

- [ ] **Step 2: 运行主装配测试并确认失败**

Run: `npx vitest run tests/unit/main.test.ts`

Expected: FAIL，当前主入口未注册这些功能。

- [ ] **Step 3: 改造 main.ts**

装配顺序：

1. 加载 repository、profiles、credentials、hostKeys。
2. 创建现有 `SessionManager`。
3. 创建 `TerminalInstanceRegistry`，注入 SessionManager 和 TerminalView factory。
4. 创建 `TerminalWorkspaceController`。
5. `registerView(SSH_SESSIONS_VIEW_TYPE, ...)`。
6. `registerView(SSH_TERMINAL_VIEW_TYPE, ...)`。
7. `addRibbonIcon("square-terminal", "SSH Sessions", () => void controller.openSessions())`。
8. 将 registry 注入 Reading View 与 Live Preview。
9. 使用 `registerEvent(this.app.vault.on("rename", ...))` 和 delete 事件同步来源。
10. `onunload()` 先关闭 registry，再清空字段；不要再单独重复 `SessionManager.closeAll()`。

- [ ] **Step 4: 添加布局样式**

在 `src/styles.css` 增加有作用域的类：

- `.ssh-sessions-view`
- `.ssh-sessions-view__empty`
- `.ssh-session-item`
- `.ssh-session-item__header`
- `.ssh-session-item__meta`
- `.ssh-session-item__actions`
- `.ssh-terminal-placeholder`
- `.ssh-terminal-item-view`
- `.ssh-terminal-item-view__header`

要求：使用 Obsidian CSS 变量；按钮可键盘聚焦；窄侧边栏中 action 自动换行；Terminal ItemView 主体使用 flex column 且终端区域 `min-height: 0`。

- [ ] **Step 5: 更新发布合规测试**

确认 `styles.css` 和构建产物仍满足社区发布要求；不得把运行时实例写入 manifest 或 data schema。

- [ ] **Step 6: 运行装配与合规测试**

Run: `npx vitest run tests/unit/main.test.ts tests/unit/releaseCompliance.test.ts`

Expected: 全部 PASS。

- [ ] **Step 7: 提交插件装配**

```powershell
git add src/main.ts src/styles.css tests/unit/main.test.ts tests/unit/releaseCompliance.test.ts
git commit -m "feat: wire persistent terminal workspace"
```

---

### Task 7: 完整回归、隐私检查与用户文档

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `DEVELOP.md`

**Interfaces:**
- Consumes: 已完成的运行期实例功能。
- Produces: 社区用户说明、开发验证说明和完整发布前证据。

- [ ] **Step 1: 更新社区 README**

在中英文 README 的 Highlights 后增加用户功能说明：

- Ribbon 打开 SSH Sessions。
- 已连接终端在切换文档后继续运行。
- 从列表打开独立 Terminal 标签页。
- 回到初始来源文档后可用 Activate 把活动终端迁回原 block。
- 明确实例只在本次 Obsidian 运行期间保留。

不得加入构建、测试或发版命令。

- [ ] **Step 2: 更新 DEVELOP.md 验证说明**

增加手动验证清单：

1. 从 Reading View 和 Live Preview 分别连接一个终端。
2. 切换文档并确认远端命令继续运行。
3. 从 Ribbon 列表打开独立 Terminal 标签页。
4. 关闭标签页再重新打开，确认会话未断开。
5. 回到来源文档并点击 Activate，确认滚动历史与 shell 状态保留。
6. 重命名和删除来源文档，确认列表状态正确。
7. Disconnect 后 Remove；确认活动实例不能直接 Remove。

- [ ] **Step 3: 运行聚焦隐私扫描**

Run:

```powershell
rg -n "password|terminal output|command input" src/terminal src/ui/SshSessionsView.ts src/ui/PersistentTerminalItemView.ts
```

Expected: 只出现安全注释、类型边界或测试说明；任何把 secret/output/input 写入快照、View state、日志或持久化的代码都必须移除。

- [ ] **Step 4: 运行完整静态检查和单元测试**

Run: `npm run check`

Expected: TypeScript 无错误；全部 unit test PASS。

- [ ] **Step 5: 构建并检查社区产物**

Run: `npm run package:release`

Expected: `release/community/main.js`、`manifest.json`、`styles.css` 成功生成。

- [ ] **Step 6: 检查最终差异**

Run:

```powershell
git diff --check
git status --short
```

Expected: 无 whitespace error；status 只包含本任务预期的 README/DEVELOP 修改和生成产物策略允许的文件。

- [ ] **Step 7: 提交文档与最终验证**

```powershell
git add README.md README.zh-CN.md DEVELOP.md
git commit -m "docs: explain persistent terminal sessions"
```

- [ ] **Step 8: 记录最终验证证据**

Run:

```powershell
npm run check
npm run build
git status --short
```

Expected: 全部命令 exit 0，所有测试通过，工作区干净。
