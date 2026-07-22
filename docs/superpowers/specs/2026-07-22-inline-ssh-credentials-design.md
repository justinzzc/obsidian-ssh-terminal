---
comet_change: support-inline-ssh-credentials
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-22-support-inline-ssh-credentials
status: final
---

# SSH Block 明文直连技术设计

## 1. 背景与约束

插件当前只允许 Markdown `ssh` block 引用设置页中的 profile。`parseSshBlock` 只接受 `profile` 和 `height`，并明确拒绝密码；阅读视图和实时预览通过 profile ID 获取 `SshProfile`，`TerminalView` 再把 profile ID 传给 `SessionManager`；`SshSession` 固定从系统钥匙串读取密码。

本变更增加用户明确选择的明文直连模式。inline 密码必然存在于 Markdown 文档及其可能的同步、备份和版本历史中，这部分不属于插件能够保护的秘密边界。插件必须保证密码不会再次进入钥匙串、插件 `data.json`、日志、错误文本、主机信任记录或测试快照。

OpenSpec delta spec 是行为需求的唯一事实源。本文只描述实现边界、数据结构、控制流、错误处理和测试策略。

## 2. Block Schema 与解析模型

### 2.1 判别联合

`SshBlockConfig` 改为判别联合：

```ts
interface ProfileSshBlockConfig {
  mode: "profile";
  profileId: string;
  height: number;
}

interface InlineSshBlockConfig {
  mode: "inline";
  host: string;
  port: number;
  username: string;
  password: string;
  height: number;
  timeoutMs: number;
}

type SshBlockConfig = ProfileSshBlockConfig | InlineSshBlockConfig;
```

profile 模式只允许 `profile`、`height`。inline 模式只允许 `host`、`port`、`username`、`password`、`height`。出现 `profile` 与任一直连字段时返回模式冲突错误，不定义字段优先级。

inline 模式的默认值为：

- `port`: `22`
- `height`: `360`
- `timeoutMs`: `15000`，暂不暴露为 block 字段

### 2.2 校验顺序

解析器按以下顺序工作：

1. YAML 必须是 mapping；拒绝空值、scalar 和 array。
2. 根据是否出现 `profile` 及任一直连字段判定模式或模式冲突。
3. 按模式检查允许字段，拒绝未知字段、`privateKey` 和 `passphrase`。
4. 校验必填字段与类型。
5. 校验 `port` 为 `1..65535` 的整数，`height` 为 `180..900` 的整数。
6. 返回规范化配置。

`host` 与 `username` 去除首尾空白后必须非空。`password` 必须是长度大于零的 YAML 字符串，但不得裁剪或转换；这使空格和特殊字符密码保持精确。YAML 解析为 number、boolean 或 null 的密码必须被拒绝，并提示用户用引号声明字符串。

错误消息只包含错误类别或字段名，不得包含原始 block、字段值或密码。

## 3. 统一运行时连接目标

### 3.1 目标模型

新增与 Markdown schema 解耦的运行时目标：

```ts
interface SshConnectionTarget {
  displayName: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
  hostKeyId: string;
  getPassword(): Promise<string | null>;
}
```

该类型不提供序列化、日志格式化或持久化 API。消费者不得输出整个 target。

### 3.2 Target Resolver

新增纯逻辑 `resolveSshConnectionTarget(config, dependencies)`：

- profile 配置从 `ProfileStore` 查找 profile。`hostKeyId` 使用 profile ID；`getPassword` 闭包调用 `CredentialStore.getPassword(profile.id)`。
- inline 配置直接复制非敏感连接参数。`getPassword` 闭包返回 block 中的精确密码，不调用 `CredentialStore`。
- profile 不存在时返回现有 `PROFILE_NOT_FOUND` 安全错误。

阅读视图和实时预览必须共同调用该 resolver，避免各自实现字段默认值、profile 查找或密码来源逻辑。

### 3.3 下游接口变化

`TerminalViewOptions.profile` 替换为 `createTarget()`。renderer 通过当前 Markdown source 每次重新解析临时 target，TerminalView 不长期保存 target/password provider。`TerminalSessionManager.connect(instanceId, profileId)` 改为 `connect(instanceId, target)`。`ManagedSessionFactory` 接受 target 并构造 `SshSession`。

`SessionManager` 继续只负责每个渲染实例的并发抑制、会话所有权和关闭，不访问 Markdown、ProfileStore 或 CredentialStore。

`SshSessionDependencies` 使用 target，而不是独立的 profile 与 CredentialStore。`connect()` 在创建 `SshClientAdapter` 前调用 `target.getPassword()`；返回 null 时保持现有“网络前失败”行为。随后只把 host、port、username、password 和 timeout 传给 adapter。

## 4. 密码生命周期与泄露防护

inline 密码的数据路径为：

```text
CodeMirror/Markdown source
  → parsed InlineSshBlockConfig
  → per-connect SshConnectionTarget.getPassword closure
  → SshSession local password
  → ssh2 ConnectConfig
```

密码不经过 ProfileStore、CredentialStore、HostKeyStore 或插件持久化仓库。系统钥匙串不可用不得阻止 inline 连接。

TerminalView 仅保存从当前 Markdown source 重新解析 target 的工厂；连接期间创建的 target 由 manager/session 临时持有。视图销毁、block 编辑重建、用户断开或插件卸载时，清理链关闭 manager entry、session、stream 和 client，并释放对 target 的引用。JavaScript 字符串不可可靠原地清零，因此实现和文档不得声称提供内存擦除。

禁止以下行为：

- 将 block、target 或 connect options 整体插值到错误或日志。
- 在 `PluginError`、Notice、状态文本或主机确认 Modal 中显示密码。
- 把 inline 密码写入 `CredentialStore.setPassword`、`saveData`、HostKeyStore 或测试 snapshot。
- 为调试方便增加包含连接对象的 `console.log`。

## 5. Inline 主机密钥信任

### 5.1 稳定标识

profile 模式继续以 profile ID 为 `hostKeyId`。inline 模式使用：

```text
inline:v1:<encodeURIComponent(normalizedHost)>:<port>
```

`normalizedHost` 规则：

1. 去除首尾空白。
2. 若是 `[IPv6]` 形式，去除最外层方括号。
3. 转换为小写。

用户名不参与标识，因为 SSH host key 表示服务器 endpoint 身份；密码绝不参与。`inline:v1:` 与 profile ID 的 slug 规则不会冲突。

### 5.2 信任与恢复

`HostKeyStore` 继续使用现有 `hostKeys` record 保存算法和指纹，不改变 profile 数据 schema。设置页识别 `inline:v1:` key，解码并展示 `host:port`，提供带确认的“忘记”操作。

首次连接仍在认证前显示算法和 SHA256 指纹。已保存记录匹配时继续；算法或指纹变化时阻断。用户必须先在设置页忘记该 endpoint，下一次连接才重新进入首次确认，不提供绕过验证选项。

## 6. 渲染与生命周期

阅读视图处理流程：

1. `parseSshBlock(source)`。
2. 创建按当前 source 调用 `parseSshBlock` 与 `resolveSshConnectionTarget` 的 target 工厂。
3. 创建唯一 instance ID。
4. `TerminalView.mount` 接收 target 工厂，并在每次连接时创建临时 target。
5. `MarkdownRenderChild.onunload` 释放 terminal 和会话。

实时预览保持现有 fenced block 识别与选区行为。widget 的等价性仍比较 block 范围、源码和 source path；编辑任何 inline 字段都会销毁旧 widget、释放旧 target 和会话，并用新源码创建新 widget。

两种视图对相同 block 必须产生相同 target 或相同安全错误。

## 7. 错误模型

在现有 `PluginErrorCode` 基础上增加明确的 block 错误码，例如：

- `BLOCK_MODE_CONFLICT`
- `BLOCK_HOST_REQUIRED`
- `BLOCK_USERNAME_REQUIRED`
- `BLOCK_PASSWORD_REQUIRED`
- `BLOCK_PASSWORD_INVALID`
- `BLOCK_PORT_INVALID`

未知字段、YAML、height、profile 不存在、凭据缺失、认证失败、网络失败和主机密钥错误继续使用现有分类。所有新消息均为静态文本或仅包含字段名，不包含连接值。

profile 模式缺少钥匙串密码时继续返回 `CREDENTIAL_MISSING`。inline 模式在 parser 阶段保证密码存在，因此正常情况下不会返回该错误；target provider 仍使用可空返回类型以保持统一接口和防御式检查。

## 8. 设置页变化

现有 profile 管理 UI 不变。新增“Inline SSH 主机信任”区域：

- 从 HostKeyStore 枚举 `inline:v1:` 记录。
- 显示解码后的 endpoint 和已保存指纹。
- 每项提供“忘记”按钮，并使用现有确认交互风格。
- 忘记操作只删除主机信任，不涉及 Markdown 或密码。

如果没有 inline 记录，该区域可以隐藏或显示空状态，不影响 profile 设置。

## 9. 测试设计

### 9.1 Parser 与模型

- profile 默认值与现有行为回归。
- 最小和完整 inline 配置。
- 模式混用、缺失字段、未知字段、privateKey/passphrase。
- 数字、boolean、null 和空字符串密码。
- 保留带空格与特殊字符密码的精确值。
- port、height 的边界与非整数。
- 所有错误文本不包含密码哨兵。

### 9.2 Target Resolver

- profile target 使用 ProfileStore 数据并按 profile ID 读取钥匙串。
- inline target 在 keytar 不可用时仍返回 block 密码。
- target 不调用 `setPassword`，也不触发插件持久化。
- host key ID 覆盖域名大小写、IPv4、带方括号 IPv6、裸 IPv6 和非默认端口。

### 9.3 Session 与 Manager

- adapter 创建前调用密码提供器；null 时不产生网络请求。
- inline target 成功认证、认证失败、网络失败、重连和关闭。
- 并发双击继续复用连接 Promise。
- close/closeAll 幂等并移除 target/session entry。
- 捕获的错误和状态不包含密码哨兵。

### 9.4 Renderer 与设置页

- 阅读视图和实时预览对 profile/inline 产生相同 target。
- 无效配置不挂载终端、不连接网络。
- 编辑 block 销毁旧 widget 并使用新密码构建新 target。
- inline host key 记录正确列出、展示和删除。
- 指纹不匹配必须阻断，忘记后重新确认。

### 9.5 集成与交付验证

Docker OpenSSH fixture 使用环境变量提供测试密码。集成测试通过生产 adapter 和 inline target 建立连接、确认 host key、打开 PTY、交换数据、resize 并关闭。测试密码不得硬编码进源码、镜像层或 snapshot。

最终验证包括：完整单元测试、`tsc --noEmit`、生产构建、Docker 集成测试，以及针对哨兵密码和意外秘密模式的仓库扫描。

## 10. 实施顺序与回滚

1. 先以测试定义 parser 判别联合和错误模型。
2. 引入 target/resolver 和 endpoint 标识，不改变现有 profile 外部行为。
3. 重构 TerminalView、SessionManager、SshSession 使用 target。
4. 接入两个 renderer 的 inline 流程。
5. 增加 inline host key 设置页管理。
6. 更新 README 并执行完整验证。

若需要回滚，可恢复只允许 profile 的 parser 与 renderer 路径。持久化 profile schema 未改变；残留的 `inline:v1:` host key 项只包含非秘密 endpoint 指纹，旧版本不会引用它们，可由用户或后续清理逻辑删除。
