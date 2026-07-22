---
change: support-inline-ssh-credentials
design-doc: docs/superpowers/specs/2026-07-22-inline-ssh-credentials-design.md
base-ref: 4f114369c4ff8af38a68df49aa015c864806850d
---

# SSH Block 明文直连 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Obsidian `ssh` block 在保留 profile + 系统钥匙串模式的同时，支持直接填写 host、port、username 和明文 password，并继续执行严格的主机密钥校验。

**Architecture:** 解析器返回 profile/inline 判别联合；共享 resolver 把两种配置转换为统一 `SshConnectionTarget`。renderer 向 TerminalView 提供基于当前 Markdown source 的 target 工厂，TerminalView 每次连接创建临时 target，SessionManager 和 SshSession 消费 target，密码来源通过 `getPassword()` 隔离；inline 主机信任以规范化 host+port 的非秘密键持久化。

**Tech Stack:** TypeScript 5.8、Obsidian Plugin API、CodeMirror 6、ssh2、yaml、Vitest/jsdom、Docker/OpenSSH、esbuild。

## Global Constraints

- 产物与用户可见新增文案使用中文；稳定错误码使用英文大写下划线。
- 不新增运行时依赖，不改变 `PersistedPluginData.schemaVersion: 1`。
- inline password 不得写入 keytar、`data.json`、HostKeyStore、日志、错误信息或快照。
- profile 模式外部行为必须兼容；profile 与 inline 字段严格互斥。
- `port` 默认 22、范围 1..65535；`height` 默认 360、范围 180..900；inline timeout 固定 15000ms。
- password 必须是长度大于零的 YAML string，且不得 trim 或类型转换。
- 每个实现任务遵循 Red-Green-Refactor，并在相关测试通过后单独提交。

---

### Task 1: Block 判别联合与严格解析

**Files:**
- Modify: `src/model.ts`
- Modify: `src/block/parseSshBlock.ts`
- Test: `tests/unit/parseSshBlock.test.ts`

**Interfaces:**
- Produces: `ProfileSshBlockConfig`、`InlineSshBlockConfig`、`SshBlockConfig` 判别联合。
- Produces: `parseSshBlock(source: string): SshBlockConfig`，供 Task 2 resolver 消费。

- [x] **Step 1: 写入失败的 parser 矩阵测试**

将现有成功断言更新为带 `mode` 的返回值，并加入以下核心用例：

```ts
it("parses inline credentials without changing the password", () => {
  expect(parseSshBlock([
    "host: server.example.com",
    "username: root",
    "password: ' secret: value '",
  ].join("\n"))).toEqual({
    mode: "inline",
    host: "server.example.com",
    port: 22,
    username: "root",
    password: " secret: value ",
    height: 360,
    timeoutMs: 15_000
  });
});

it.each([
  ["profile: prod\nhost: host\nusername: ops\npassword: secret", "BLOCK_MODE_CONFLICT"],
  ["host: host\nusername: ops", "BLOCK_PASSWORD_REQUIRED"],
  ["host: host\nusername: ops\npassword: 123456", "BLOCK_PASSWORD_INVALID"],
  ["host: host\nusername: ops\npassword: secret\nport: 0", "BLOCK_PORT_INVALID"],
  ["host: host\nusername: ops\npassword: secret\nprivateKey: key", "BLOCK_SECRET_FORBIDDEN"]
])("rejects %s", (source, code) => {
  expect(() => parseSshBlock(source)).toThrowError(expect.objectContaining({ code }));
});
```

保留现有 invalid YAML、unknown field、height 179/901 和 profile 默认值测试；额外断言任何错误消息不包含哨兵密码 `never-leak-me`。

- [x] **Step 2: 运行测试并确认 Red**

Run: `npm run test:unit -- tests/unit/parseSshBlock.test.ts`

Expected: FAIL，因为返回值尚无 `mode`，inline 字段仍被拒绝，新错误码不存在。

- [x] **Step 3: 定义判别联合与错误码**

在 `src/model.ts` 中将 block 类型替换为：

```ts
export interface ProfileSshBlockConfig {
  mode: "profile";
  profileId: string;
  height: number;
}

export interface InlineSshBlockConfig {
  mode: "inline";
  host: string;
  port: number;
  username: string;
  password: string;
  height: number;
  timeoutMs: number;
}

export type SshBlockConfig = ProfileSshBlockConfig | InlineSshBlockConfig;
```

向 `PluginErrorCode` 增加：

```ts
| "BLOCK_MODE_CONFLICT"
| "BLOCK_HOST_REQUIRED"
| "BLOCK_USERNAME_REQUIRED"
| "BLOCK_PASSWORD_REQUIRED"
| "BLOCK_PASSWORD_INVALID"
| "BLOCK_PORT_INVALID"
```

- [x] **Step 4: 最小实现严格 parser**

在 `parseSshBlock.ts` 中定义：

```ts
const PROFILE_FIELDS = new Set(["profile", "height"]);
const INLINE_FIELDS = new Set(["host", "port", "username", "password", "height"]);
const INLINE_ONLY_FIELDS = ["host", "port", "username", "password"] as const;
const DEFAULT_HEIGHT = 360;
const DEFAULT_PORT = 22;
const DEFAULT_TIMEOUT_MS = 15_000;
```

解析 mapping 后先检测：

```ts
const hasProfile = Object.hasOwn(values, "profile");
const hasInline = INLINE_ONLY_FIELDS.some((key) => Object.hasOwn(values, key));
if (hasProfile && hasInline) {
  throw new PluginError("BLOCK_MODE_CONFLICT", "profile cannot be combined with inline SSH fields.");
}
```

profile 分支复用现有 profile/height 校验并返回 `mode: "profile"`。inline 分支逐项校验：host/username 为 trim 后非空字符串；password 为 `typeof === "string" && length > 0`，保存原字符串；port/height 为范围内整数。错误仅描述字段名。

- [x] **Step 5: 运行 parser 测试和类型检查**

Run: `npm run test:unit -- tests/unit/parseSshBlock.test.ts && npx tsc --noEmit`

Expected: parser tests PASS；TypeScript 可能因下游仍假设 `profileId` 必有而 FAIL，失败位置应限定在 Task 2/4 将修改的消费者。

- [x] **Step 6: 提交 Task 1**

```bash
git add src/model.ts src/block/parseSshBlock.ts tests/unit/parseSshBlock.test.ts
git commit -m "feat: parse inline ssh block credentials"
```

### Task 2: 统一连接目标与 endpoint 信任键

**Files:**
- Create: `src/ssh/SshConnectionTarget.ts`
- Create: `src/block/resolveSshConnectionTarget.ts`
- Create: `tests/unit/resolveSshConnectionTarget.test.ts`

**Interfaces:**
- Consumes: `SshBlockConfig`、`SshProfile`、`CredentialStore`。
- Produces: `SshConnectionTarget`、`createInlineHostKeyId(host, port)`、`parseInlineHostKeyId(id)`。
- Produces: `resolveSshConnectionTarget(config, { profiles, credentials }): SshConnectionTarget`。

- [x] **Step 1: 写入失败的 resolver 与标识测试**

```ts
it("resolves inline config without touching the credential store", async () => {
  const credentials = {
    isAvailable: vi.fn(async () => false),
    getPassword: vi.fn(async () => null),
    setPassword: vi.fn(async () => undefined),
    deletePassword: vi.fn(async () => undefined)
  };
  const target = resolveSshConnectionTarget({
    mode: "inline", host: "Host.Example.COM", port: 2222,
    username: "root", password: "never-leak-me", height: 360, timeoutMs: 15_000
  }, { profiles: { get: () => undefined }, credentials });

  expect(target.hostKeyId).toBe("inline:v1:host.example.com:2222");
  expect(await target.getPassword()).toBe("never-leak-me");
  expect(credentials.getPassword).not.toHaveBeenCalled();
  expect(credentials.setPassword).not.toHaveBeenCalled();
});

it.each([
  ["[::1]", 22, "inline:v1:%3A%3A1:22"],
  ["SERVER.EXAMPLE.COM", 2200, "inline:v1:server.example.com:2200"]
])("normalizes endpoint %s", (host, port, expected) => {
  expect(createInlineHostKeyId(host, port)).toBe(expected);
  expect(parseInlineHostKeyId(expected)).toEqual({ host: host.replace(/^\[|\]$/g, "").toLowerCase(), port });
});
```

另加 profile 测试：target 使用 profile 字段，`hostKeyId === profile.id`，`getPassword()` 调用 `credentials.getPassword(profile.id)`；缺失 profile 抛 `PROFILE_NOT_FOUND`。

- [x] **Step 2: 运行测试并确认 Red**

Run: `npm run test:unit -- tests/unit/resolveSshConnectionTarget.test.ts`

Expected: FAIL，因为两个新模块不存在。

- [x] **Step 3: 实现 target 类型与 inline ID 编解码**

`src/ssh/SshConnectionTarget.ts`：

```ts
export interface SshConnectionTarget {
  displayName: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
  hostKeyId: string;
  getPassword(): Promise<string | null>;
}

const INLINE_PREFIX = "inline:v1:";

export function createInlineHostKeyId(host: string, port: number): string {
  const normalized = host.trim().replace(/^\[(.*)\]$/, "$1").toLowerCase();
  return `${INLINE_PREFIX}${encodeURIComponent(normalized)}:${port}`;
}

export function parseInlineHostKeyId(id: string): { host: string; port: number } | null {
  if (!id.startsWith(INLINE_PREFIX)) return null;
  const separator = id.lastIndexOf(":");
  const port = Number(id.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  try { return { host: decodeURIComponent(id.slice(INLINE_PREFIX.length, separator)), port }; }
  catch { return null; }
}
```

- [x] **Step 4: 实现共享 resolver**

`resolveSshConnectionTarget` 对 profile 创建钥匙串 closure，对 inline 创建只返回捕获密码的 async closure。不得调用 `isAvailable()` 或 `setPassword()`。`displayName` 分别使用 profile name 和 `${username}@${host}:${port}`。

- [x] **Step 5: 运行测试与类型检查**

Run: `npm run test:unit -- tests/unit/resolveSshConnectionTarget.test.ts && npx tsc --noEmit`

Expected: resolver tests PASS；类型检查仅允许剩余旧 consumer 错误。

- [x] **Step 6: 提交 Task 2**

```bash
git add src/ssh/SshConnectionTarget.ts src/block/resolveSshConnectionTarget.ts tests/unit/resolveSshConnectionTarget.test.ts
git commit -m "feat: resolve ssh connection targets"
```

### Task 3: SshSession 与 SessionManager 消费统一 target

**Files:**
- Modify: `src/ssh/SshSession.ts`
- Modify: `src/ssh/SessionManager.ts`
- Modify: `src/main.ts`
- Modify: `tests/unit/SshSession.test.ts`
- Modify: `tests/unit/SessionManager.test.ts`

**Interfaces:**
- Consumes: `SshConnectionTarget`。
- Produces: `SessionManager.connect(instanceId: string, target: SshConnectionTarget)`。
- Produces: `SshSessionDependencies { target, hostKeys, clientFactory, confirmHostKey }`。

- [x] **Step 1: 先把 session 测试 fixture 改为 target**

用以下 target 替换 `profile + credentials`：

```ts
const target: SshConnectionTarget = {
  displayName: "Prod",
  host: "localhost",
  port: 22,
  username: "ops",
  timeoutMs: 15_000,
  hostKeyId: "prod",
  getPassword: vi.fn(async () => "secret")
};
```

新增断言：`getPassword` 在 `clientFactory` 之前调用；null 时 client 不创建；host key check/trust 使用 `target.hostKeyId`；失败错误不包含哨兵密码。

SessionManager 测试改为直接传 target，并断言同 instance 双击复用 Promise、失败后可重试、closeAll 移除所有 entry。

- [x] **Step 2: 运行测试并确认 Red**

Run: `npm run test:unit -- tests/unit/SshSession.test.ts tests/unit/SessionManager.test.ts`

Expected: FAIL，因为生产接口仍接收 profile ID/credentials。

- [x] **Step 3: 重构 SshSession**

将依赖改为：

```ts
export interface SshSessionDependencies {
  target: SshConnectionTarget;
  hostKeys: HostKeyAccess;
  clientFactory: SshClientFactory;
  confirmHostKey(prompt: HostKeyPrompt): Promise<boolean>;
}
```

`connect()` 调用 `target.getPassword()`，然后使用 target 的 host/port/username/timeout。`verifyHostKey()` 使用 `target.hostKeyId`；可保留 HostKeyPrompt 的内部字段名或将其改为 `hostKeyId`，但 Modal 只显示 host、port、algorithm、fingerprint。

- [x] **Step 4: 重构 SessionManager 和 main 装配**

`SessionManager` 移除 ProfileLookup 构造参数：

```ts
export type ManagedSessionFactory = (target: SshConnectionTarget) => ManagedSession;
constructor(private readonly sessionFactory: ManagedSessionFactory) {}
connect(instanceId: string, target: SshConnectionTarget): Promise<ManagedSession>;
```

`main.ts` 创建 manager 时把 target 直接传给 `new SshSession({ target, hostKeys, ... })`。ProfileStore/CredentialStore 仍提供给 renderer resolver 和设置页。

- [x] **Step 5: 运行 session/manager 测试和类型检查**

Run: `npm run test:unit -- tests/unit/SshSession.test.ts tests/unit/SessionManager.test.ts && npx tsc --noEmit`

Expected: 两个测试文件 PASS；类型错误只剩 TerminalView/renderers 的旧接口。

- [x] **Step 6: 提交 Task 3**

```bash
git add src/ssh/SshSession.ts src/ssh/SessionManager.ts src/main.ts tests/unit/SshSession.test.ts tests/unit/SessionManager.test.ts
git commit -m "refactor: pass ssh connection targets to sessions"
```

### Task 4: TerminalView 与两个 renderer 接入 inline target

**Files:**
- Modify: `src/ui/TerminalView.ts`
- Modify: `src/render/readingView.ts`
- Modify: `src/render/livePreview.ts`
- Modify: `src/main.ts`
- Modify: `tests/unit/TerminalView.test.ts`
- Modify: `tests/unit/readingView.test.ts`
- Modify: `tests/unit/livePreview.test.ts`

**Interfaces:**
- Consumes: `resolveSshConnectionTarget`、`SshConnectionTarget`。
- Produces: 两种视图对相同 block 生成相同 target/error。

- [x] **Step 1: 更新 TerminalView 失败测试**

把 options 中的 profile 换为 target，并断言：

```ts
expect(manager.connect).toHaveBeenCalledWith("note:reading:1", target);
```

保留连接、断开、重连、resize、Escape focus 与 dispose 幂等测试。

- [x] **Step 2: 更新 renderer 失败测试**

为 reading/live preview 增加 inline source：

```ts
const source = "host: server.example.com\nusername: root\npassword: 'never-leak-me'";
```

断言 mount options 的 target host/port/username 正确、`await target.getPassword()` 返回哨兵、错误 DOM 不包含哨兵；混用模式不 mount terminal。保留 profile block 与 widget 编辑销毁回归测试。

- [x] **Step 3: 运行三个测试文件确认 Red**

Run: `npm run test:unit -- tests/unit/TerminalView.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts`

Expected: FAIL，因为 UI 仍传 profile/profileId。

- [x] **Step 4: 修改 TerminalView**

`TerminalViewOptions` 使用 `createTarget(): SshConnectionTarget`，避免断开后继续持有包含 inline 密码 provider 的 target；`TerminalSessionManager.connect` 接收本次连接创建的 target：

```ts
this.options.manager.connect(this.options.instanceId, this.options.createTarget())
```

不要把 target 序列化到 status/error。

- [x] **Step 5: 修改 reading/live preview 共享 resolver 路径**

两个 dependencies 均包含 `profiles`、`credentials`、`manager`。renderer 用当前 source 创建共享 parser/resolver 工厂并传给 mount，使 Connect/Reconnect 每次得到新 target。`main.ts` 的 renderer dependencies 增加 credentials。

- [x] **Step 6: 运行 renderer 测试、全量单测与类型检查**

Run: `npm run test:unit -- tests/unit/TerminalView.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts && npm run check`

Expected: PASS。

- [x] **Step 7: 提交 Task 4**

```bash
git add src/ui/TerminalView.ts src/render/readingView.ts src/render/livePreview.ts src/main.ts tests/unit/TerminalView.test.ts tests/unit/readingView.test.ts tests/unit/livePreview.test.ts
git commit -m "feat: render inline ssh connection blocks"
```

### Task 5: Inline 主机信任设置管理

**Files:**
- Modify: `src/profile/HostKeyStore.ts`
- Modify: `src/settings/SshSettingsController.ts`
- Modify: `src/settings/SshSettingsTab.ts`
- Modify: `tests/unit/HostKeyStore.test.ts`
- Modify: `tests/unit/SshSettingsController.test.ts`
- Create: `tests/unit/SshSettingsTab.test.ts`

**Interfaces:**
- Consumes: `parseInlineHostKeyId`。
- Produces: `HostKeyStore.listInline(): InlineTrustedHostKey[]`。
- Produces: `SshSettingsController.forgetInlineHostKey(hostKeyId)`。

- [x] **Step 1: 写入 HostKeyStore 失败测试**

```ts
await store.trust("inline:v1:server.example.com:22", "ssh-ed25519", "SHA256:test");
expect(store.listInline()).toEqual([{
  id: "inline:v1:server.example.com:22",
  host: "server.example.com",
  port: 22,
  algorithm: "ssh-ed25519",
  fingerprint: "SHA256:test"
}]);
```

加入损坏 inline key 被忽略、profile key 不出现在 listInline、forget 只删除目标记录测试。

- [x] **Step 2: 写入 controller/tab 失败测试**

Controller 断言 `forgetInlineHostKey(id)` 调用 hostKeys.forget(id)。Tab 测试用 jsdom/Obsidian mocks 断言 endpoint 与 fingerprint 可见，点击“忘记”经确认后调用 controller，密码字段或值从不出现。

- [x] **Step 3: 运行设置相关测试确认 Red**

Run: `npm run test:unit -- tests/unit/HostKeyStore.test.ts tests/unit/SshSettingsController.test.ts tests/unit/SshSettingsTab.test.ts`

Expected: FAIL，因为 listInline/UI 尚不存在。

- [x] **Step 4: 实现 HostKeyStore 枚举和 controller 方法**

新增：

```ts
export interface InlineTrustedHostKey extends TrustedHostKey {
  id: string;
  host: string;
  port: number;
}

listInline(): InlineTrustedHostKey[] {
  return Object.entries(this.repository.snapshot().hostKeys).flatMap(([id, key]) => {
    const endpoint = parseInlineHostKeyId(id);
    return endpoint ? [{ id, ...endpoint, ...key }] : [];
  });
}
```

Controller 只代理 `hostKeys.forget(id)`，不得接触 credentials。

- [x] **Step 5: 实现设置页区域**

在 profile UI 后渲染“Inline SSH 主机信任”。每条显示 `${host}:${port}` 与 `${algorithm} ${fingerprint}`，忘记按钮复用项目现有确认模式；删除后重新 `display()`。无记录时隐藏区域或显示空状态。

- [x] **Step 6: 运行设置测试和全量 check**

Run: `npm run test:unit -- tests/unit/HostKeyStore.test.ts tests/unit/SshSettingsController.test.ts tests/unit/SshSettingsTab.test.ts && npm run check`

Expected: PASS。

- [x] **Step 7: 提交 Task 5**

```bash
git add src/profile/HostKeyStore.ts src/settings/SshSettingsController.ts src/settings/SshSettingsTab.ts tests/unit/HostKeyStore.test.ts tests/unit/SshSettingsController.test.ts tests/unit/SshSettingsTab.test.ts
git commit -m "feat: manage inline ssh host trust"
```

### Task 6: 文档、真实 SSH 集成与交付验证

**Files:**
- Modify: `README.md`
- Modify: `tests/integration/ssh.test.ts`
- Modify: `openspec/changes/support-inline-ssh-credentials/tasks.md`

**Interfaces:**
- Consumes: 生产 `SshConnectionTarget`、`SshSession`、`Ssh2ClientAdapter`。
- Produces: 用户可复制的 inline block 文档与真实连接证据。

- [x] **Step 1: 先增加 inline 集成测试**

在现有 Docker fixture 测试中构造：

```ts
const target: SshConnectionTarget = {
  displayName: "obsidian-test@127.0.0.1",
  host: "127.0.0.1",
  port,
  username: "obsidian-test",
  timeoutMs: 10_000,
  hostKeyId: `inline:v1:127.0.0.1:${port}`,
  getPassword: async () => password
};
```

通过生产 adapter 建立 session、确认 host key、执行 `printf 'ready\n'`、验证输出、resize 并关闭。密码继续仅来自 `OBSIDIAN_SSH_TEST_PASSWORD`。

- [x] **Step 2: 构建 Docker fixture 并确认测试状态**

Run: `docker build -t obsidian-ssh-test tests/fixtures/sshd`

Run: `$env:OBSIDIAN_SSH_TEST_PASSWORD='temporary-inline-test-value'; npm run test:integration`

Expected: PASS；若因接口尚未完全接入而 FAIL，修正仅限测试 fixture/target 装配，不改变 spec。

- [x] **Step 3: 更新 README**

加入 profile 示例和以下 inline 示例：

```ssh
host: server.example.com
port: 22
username: root
password: "replace-with-password"
height: 360
```

在示例紧邻位置明确说明密码会进入 Markdown、Obsidian Sync、云盘、备份和 Git 历史；需要保护秘密时使用 profile + 系统钥匙串。说明数字/特殊字符密码需要 YAML 引号、两种模式不得混用、inline 仍执行主机指纹确认。

- [x] **Step 4: 运行全量验证**

Run: `npm run check`

Expected: PASS。

Run: `npm run build`

Expected: PASS 并生成生产 bundle。

Run: `$env:OBSIDIAN_SSH_TEST_PASSWORD='temporary-inline-test-value'; npm run test:integration`

Expected: PASS。

Run: `rg -n -S "never-leak-me|temporary-inline-test-value" . -g '!node_modules/**' -g '!docs/superpowers/**' -g '!openspec/**'`

Expected: 不在生产源码、README、构建产物或测试 snapshot 中发现密码；测试源码中的明确哨兵断言可以逐项审核后保留。

- [x] **Step 5: 勾选 OpenSpec tasks 并核对变更范围**

把 `openspec/changes/support-inline-ssh-credentials/tasks.md` 中已由测试和提交证明完成的 15 项全部改为 `[x]`。运行：

Run: `openspec validate support-inline-ssh-credentials --json`

Expected: `valid: true`，无 issues。

- [x] **Step 6: 提交 Task 6**

```bash
git add README.md tests/integration/ssh.test.ts openspec/changes/support-inline-ssh-credentials/tasks.md
git commit -m "docs: document inline ssh credentials"
```

### Task 7: 最终安全回归与构建证据

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1-6

**Interfaces:**
- Produces: build 阶段可审计的测试、构建与秘密扫描证据。

- [ ] **Step 1: 运行干净的完整验证序列**

Run: `npm run check`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

Run: `git status --short`

Expected: 只包含预期的 Comet 状态/计划产物；没有未提交源码或测试修改。

- [ ] **Step 2: 检查提交与任务对应关系**

Run: `git log --oneline 4f114369c4ff8af38a68df49aa015c864806850d..HEAD`

Expected: 至少包含 parser、target、session、renderer、host trust、docs/integration 的独立提交。

- [x] **Step 3: 若验证触发修复，遵循调试门禁**

任何失败先加载 `superpowers:systematic-debugging` 确认根因，再新增最小失败测试、实现修复、重跑相关测试和全量 check，并以 `fix:` 提交。不得通过放宽安全断言或删除测试绕过失败。

- [ ] **Step 4: 记录 review/verification 结果**

按 Comet 选择的 `review_mode` 完成代码审查；CRITICAL 问题必须修复，非 CRITICAL 接受项写入持久化验证记录。确认 OpenSpec tasks 全部 `[x]` 后才能运行 build guard。
