# Comet Design Handoff

- Change: support-inline-ssh-credentials
- Phase: design
- Mode: compact
- Context hash: 1531db132040593d79464063c88e09de3461c985a15069b4c3b90148b7741765

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/support-inline-ssh-credentials/proposal.md

- Source: openspec/changes/support-inline-ssh-credentials/proposal.md
- Lines: 1-29
- SHA256: 1fec118f793158e82e9f57f0cda9fbc4241d14a54b56c101d7c279611f989daf

```md
## Why

当前 `ssh` block 只能引用预先在插件设置中保存的 profile，临时服务器或希望笔记自包含的用户必须先离开文档创建配置。需要增加一种显式的明文直连模式，让用户可以直接在 block 中提供包括密码在内的连接信息，同时清楚承担 Markdown 明文保存与同步带来的风险。

## What Changes

- 为 `ssh` block 增加直连模式，接受 `host`、`username`、`password` 以及可选的 `port`、`height` 等非秘密运行参数。
- 保留现有 `profile` 引用模式，并拒绝在同一个 block 中混用 `profile` 与直连字段，避免凭据来源和优先级歧义。
- 直连密码只在解析结果和当前 SSH 会话的短生命周期内存中使用，不复制到系统钥匙串、插件 `data.json`、日志、错误信息或主机密钥记录。
- 在文档与错误提示中明确说明：直连密码会作为 Markdown 明文保存，并可能进入 Obsidian Sync、云盘、备份及版本控制历史。
- 让阅读视图与实时预览使用同一套解析、校验、主机密钥验证和会话生命周期行为。
- 增加解析、渲染、会话与回归测试，覆盖有效直连、缺失/非法字段、模式混用、秘密不泄露以及原有 profile 模式兼容性。

## Capabilities

### New Capabilities

- `inline-ssh-credentials`: 定义 SSH block 的明文直连语法、模式互斥规则、短生命周期凭据处理、安全提示、主机密钥信任标识和视图一致性要求。

### Modified Capabilities

无。当前仓库尚无已发布的 OpenSpec capability；现有 profile 行为作为新 capability 的兼容性要求记录。

## Impact

- 影响 block 模型与 YAML 解析器、阅读视图和实时预览的 profile 解析路径、`SessionManager`/`SshSession` 的连接输入与凭据解析边界。
- 需要为不依赖持久化 profile 的直连会话定义稳定但不包含密码的主机密钥信任标识。
- 不新增外部依赖，不改变现有持久化 profile schema，也不把明文密码写入插件存储。
- 安全模型发生显式扩展：插件仍保护设置模式的密码，但用户选择直连模式时，Markdown 文件本身不具备秘密保护能力。

```

## openspec/changes/support-inline-ssh-credentials/design.md

- Source: openspec/changes/support-inline-ssh-credentials/design.md
- Lines: 1-87
- SHA256: d07ff917d51837e6ca0b34ec82e016c752afad54635b68dad46ba4ddf2ab2442

[TRUNCATED]

```md
## Context

当前解析器只接受 `profile` 与 `height`，并主动拒绝 `password`、`passphrase` 和 `privateKey`。渲染器把 profile ID 解析为持久化 `SshProfile`，`TerminalView` 再把 profile ID 交给 `SessionManager`；`SshSession` 固定从系统钥匙串读取密码。这个结构保证了密码不进入 Markdown，但也使 block 无法自包含连接信息。

本变更允许用户显式选择风险更高的明文直连模式。Markdown、同步服务、备份和版本控制不在插件的秘密保护边界内；插件能保证的是不把 block 密码再次复制到插件数据、钥匙串、日志、错误信息或主机密钥记录。

## Goals / Non-Goals

**Goals:**

- 同时支持现有 profile 模式与新的明文直连模式。
- 为直连模式提供严格、可测试且无隐式优先级的 YAML schema。
- 复用现有 SSH、PTY、TOFU 主机密钥校验和终端生命周期。
- 将“连接参数来源”与 `SshSession` 解耦，使 profile 密码和 inline 密码通过同一个短生命周期接口提供。
- 保证阅读视图与实时预览行为一致，并提供明确的明文风险说明。

**Non-Goals:**

- 不加密、混淆或自动清除 Markdown 中的密码。
- 不支持私钥、passphrase、SSH agent、跳板机或键盘交互认证。
- 不把 inline 密码导入系统钥匙串，也不自动创建持久化 profile。
- 不迁移或改写已有 `profile` block 和持久化 profile 数据。
- 第一版不在 block 中暴露 SSH 算法、代理、keepalive 等高级连接选项。

## Decisions

### 1. 使用互斥的判别联合表示两种 block 模式

`SshBlockConfig` 改为以 `mode` 判别的联合：

- profile 模式：`profile` 必填，`height` 可选。
- inline 模式：`host`、`username`、`password` 必填，`port` 与 `height` 可选；`port` 默认 `22`，连接超时沿用插件默认值 `15000ms`。

两种模式不得混用；出现 `profile` 与任一直连字段时返回专用的安全错误。未知字段继续被拒绝。密码必须是非空 YAML 字符串，纯数字或包含 YAML 特殊字符的密码需要显式加引号。

选择顶层字段而不是嵌套 `connection:`，是为了保持现有 block 简短，并符合用户“直接在 block 里面写入连接信息”的目标。选择严格互斥而不是定义字段优先级，是为了避免用户以为使用了 inline 密码、实际却连接了 profile，或反之。

### 2. 在渲染边界解析为统一的运行时连接目标

新增运行时 `SshConnectionTarget`，包含非敏感连接参数、显示标签、主机密钥标识和一个密码提供器。profile 模式由渲染器通过 `ProfileStore` 解析目标，密码提供器调用 `CredentialStore.getPassword(profileId)`；inline 模式直接从 block 构造目标，密码提供器只返回当前 block 的密码。

`TerminalView` 与 `SessionManager.connect` 接收连接目标而不是 profile ID；`SshSession` 不再直接依赖整个 `CredentialStore`，只在发起网络连接前调用目标的密码提供器。这样 profile 模式仍走系统钥匙串，而 inline 模式无需伪造 profile 或把密码写入任何持久化接口。

备选方案是在 `CredentialStore` 中加入临时密码。该方案会把持久化秘密存储与文档内秘密混合，容易产生误保存和清理问题，因此不采用。

### 3. inline 密码只保留在渲染目标与活动会话的引用中

inline 密码从 YAML 解析结果传到对应渲染实例的连接目标，连接时传给 `ssh2`，视图销毁或会话关闭后通过释放 widget、terminal、manager entry 和 session 引用使其可被垃圾回收。JavaScript 字符串不可原地清零，因此不宣称提供内存擦除。

错误映射、主机确认提示、状态文本、调试输出和测试快照不得拼接连接目标或原始 block。测试使用哨兵密码断言插件数据、错误文本和日志输出不包含该值。

### 4. 使用不含密码的稳定 endpoint 标识保存 inline 主机密钥信任

profile 模式继续以 profile ID 作为 TOFU 信任键。inline 模式基于规范化的 `host + port` 生成稳定的 `inline:` 标识，不包含用户名或密码；同一 SSH endpoint 的不同账号共享服务器主机密钥信任。标识格式应能在设置页安全展示 endpoint，并避免 IPv6/大小写造成歧义。

首次连接仍显示算法和 SHA256 指纹并要求用户确认；后续不匹配仍阻断连接。设置页增加 inline endpoint 信任记录的查看与“忘记”操作，使主机密钥合法轮换后能够恢复，而不提供忽略校验的选项。

备选方案是每次 inline 连接都重新确认指纹。该方案不保存状态但会削弱用户对指纹变化的感知，因此不采用。

### 5. 两个渲染器共享解析与目标解析函数

抽取无 UI 的 block-to-target 解析边界，由阅读视图和实时预览共同调用。两者对有效配置、错误码、默认值、profile 查找和 inline 目标生成保持一致；每个渲染实例仍拥有独立 PTY，并在销毁时关闭会话。

### 6. 文档明确标记明文模式，而不是制造“安全存储”错觉

README 同时展示 profile 模式和 inline 模式示例，并在 inline 示例附近明确提示密码会进入 Markdown、同步、备份和版本历史。设置页的钥匙串安全说明继续只描述 profile 模式，不暗示其覆盖 inline 密码。

## Risks / Trade-offs

- [密码会被 Obsidian、同步工具、备份或 Git 以明文复制] → 在 README、示例和相关校验信息中明确警告；保持 profile 模式为安全选项。
- [YAML 类型推断导致数字密码被解析为 number] → 要求密码为字符串并给出“请加引号”的安全错误，不做可能改变密码的隐式转换。
- [密码在 JavaScript 内存中的生命周期无法精确清零] → 限制引用范围，销毁视图时释放连接目标，不记录、不缓存、不持久化，并如实记录该限制。
- [主机密钥标识规范化错误导致信任冲突] → 使用集中、单测覆盖的 endpoint 标识函数，覆盖域名大小写、IPv4、IPv6 和非默认端口。
- [重构 SessionManager 输入影响现有 profile 模式] → 保留 profile 兼容场景，并为 parser、renderer、manager、session 与集成连接分别增加回归测试。

## Migration Plan

1. 先引入判别联合、连接目标与测试，保持现有 profile block 的外部行为不变。
2. 接入 inline 解析、渲染和会话密码提供器。
3. 增加 inline 主机密钥信任管理与文档警告。

```

Full source: openspec/changes/support-inline-ssh-credentials/design.md

## openspec/changes/support-inline-ssh-credentials/tasks.md

- Source: openspec/changes/support-inline-ssh-credentials/tasks.md
- Lines: 1-31
- SHA256: 0cb07e50442b1cde4d87f8f6af322bcb349faad3ffd07a9e1fc9b371b8268033

```md
## 1. Block 模型与解析

- [ ] 1.1 先扩展 `parseSshBlock` 单元测试，覆盖 profile 兼容、最小/完整 inline 配置、默认值、模式混用、缺失字段、YAML 密码类型、端口/高度边界与安全错误文本
- [ ] 1.2 将 `SshBlockConfig` 改为 profile/inline 判别联合并实现严格解析，确保密码值不裁剪、不回显且未知字段继续被拒绝

## 2. 统一连接目标

- [ ] 2.1 为 profile 与 inline block 增加无 UI 的 `SshConnectionTarget` 解析器及测试，分别连接钥匙串密码提供器和短生命周期 inline 密码提供器
- [ ] 2.2 实现基于规范化 host + port、且不含用户名或密码的稳定 inline 主机密钥标识，并覆盖域名大小写、IPv4、IPv6 与非默认端口测试

## 3. 会话与管理器重构

- [ ] 3.1 先更新 `SshSession` 和 `SessionManager` 测试，使连接入口接受统一目标，并证明 profile 模式仍从钥匙串取密、inline 模式不依赖或写入 `CredentialStore`
- [ ] 3.2 重构 `SessionManager`、`SshSession` 与插件装配以使用连接目标和密码提供器，同时保持网络前取密、TOFU 校验、安全错误映射与幂等释放
- [ ] 3.3 增加秘密泄露回归断言，确保认证/网络/主机校验失败及插件持久化数据、状态文本和测试快照均不包含 inline 密码哨兵值

## 4. 阅读视图与实时预览

- [ ] 4.1 更新 `TerminalView` 及其测试，使终端按统一连接目标发起连接并在 dispose 时释放会话引用
- [ ] 4.2 更新阅读视图和实时预览测试与实现，共享 block-to-target 解析逻辑，并覆盖有效 inline block、混用错误、编辑重建和原有 profile block

## 5. Inline 主机密钥管理

- [ ] 5.1 扩展 `HostKeyStore` 测试与接口，使 inline endpoint 信任记录可安全识别、列出和忘记，且记录中不包含密码
- [ ] 5.2 在设置页展示并允许确认删除 inline endpoint 信任记录，覆盖首次确认、匹配复用、指纹变化阻断与忘记后重新确认流程

## 6. 文档与验证

- [ ] 6.1 更新 README，加入 profile 与 inline 两种 block 示例、字段/default 说明、密码加引号提示以及 Markdown/同步/备份/Git 明文风险警告
- [ ] 6.2 运行完整单元测试、TypeScript 检查与生产构建，并修复所有回归
- [ ] 6.3 使用 Docker SSH fixture 增加或更新 inline 密码集成场景，并执行秘密扫描确认仓库产物未意外包含测试密码

```

## openspec/changes/support-inline-ssh-credentials/specs/inline-ssh-credentials/spec.md

- Source: openspec/changes/support-inline-ssh-credentials/specs/inline-ssh-credentials/spec.md
- Lines: 1-97
- SHA256: b2790f71a31774c8d719b93dc0dda448e27f80e432226dcaf61a85b7bddb5e1f

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: SSH block 支持互斥的 profile 与明文直连模式
系统 SHALL 支持现有 `profile` 引用模式和新的明文直连模式，并 SHALL 根据字段集合把每个 block 解析为唯一模式。`profile` 与任一 `host`、`port`、`username`、`password` 字段同时出现时，系统 MUST 拒绝该 block，且不得定义隐式优先级。

#### Scenario: 现有 profile block 保持兼容
- **WHEN** block 包含非空 `profile` 和可选的有效 `height`
- **THEN** 系统 SHALL 按现有 profile 引用模式解析并连接，且 SHALL 从系统钥匙串读取该 profile 的密码

#### Scenario: profile 与直连字段混用
- **WHEN** block 同时包含 `profile` 和任一直连字段
- **THEN** 系统 SHALL 返回模式冲突错误，不创建终端会话，且错误文本 MUST NOT 包含密码值

### Requirement: 明文直连模式提供严格的连接字段与默认值
明文直连 block MUST 接受非空字符串 `host`、非空字符串 `username`、非空字符串 `password`，并 MAY 接受整数 `port` 与整数 `height`。省略 `port` 时系统 SHALL 使用 `22`；省略 `height` 时系统 SHALL 使用 `360`；SSH 连接超时 SHALL 使用 `15000ms` 的默认值。

#### Scenario: 使用最小直连配置
- **WHEN** block 只提供有效的 `host`、`username` 和 `password`
- **THEN** 系统 SHALL 创建使用端口 `22`、高度 `360` 和超时 `15000ms` 的直连目标

#### Scenario: 使用显式端口与高度
- **WHEN** block 提供有效的 `host`、`username`、`password`、`port` 和 `height`
- **THEN** 系统 SHALL 原样使用连接字段，并使用指定端口与高度

#### Scenario: 保留密码字符串的精确值
- **WHEN** `password` 是非空 YAML 字符串，包括前导空格、尾随空格或特殊字符
- **THEN** 系统 SHALL 不裁剪、不转换并按解析后的精确字符串进行认证

### Requirement: 明文直连字段执行安全且确定的校验
系统 MUST 拒绝缺失的必填字段、非字符串的 `host`/`username`/`password`、范围 `1..65535` 之外或非整数的 `port`、范围 `180..900` 之外或非整数的 `height`、未知字段以及不支持的 `privateKey` 或 `passphrase`。校验错误 SHALL 使用稳定错误码和不含秘密的消息。

#### Scenario: 数字密码未加引号
- **WHEN** YAML 把 `password` 解析为 number、boolean、null 或其他非字符串类型
- **THEN** 系统 SHALL 在任何网络请求前拒绝该 block，并提示密码必须写成 YAML 字符串且必要时加引号

#### Scenario: 直连必填字段缺失
- **WHEN** block 已出现任一直连字段但缺少 `host`、`username` 或 `password`
- **THEN** 系统 SHALL 指出缺失字段，不创建网络客户端，且不得回显其他连接值

#### Scenario: 未知或不支持的秘密字段
- **WHEN** block 包含 schema 未定义的字段、`privateKey` 或 `passphrase`
- **THEN** 系统 SHALL 拒绝该 block，并 SHALL NOT 尝试猜测、忽略或持久化该字段

### Requirement: inline 密码绕过持久化凭据存储并仅供当前会话使用
系统 SHALL 把 inline 密码直接提供给对应渲染实例的 SSH 会话，MUST NOT 调用 `CredentialStore.setPassword`，MUST NOT 把密码写入插件 `data.json` 或主机密钥记录，并 MUST NOT 要求系统钥匙串可用。视图销毁或会话关闭后，系统 SHALL 释放 manager、session、terminal 和 widget 持有的连接目标引用。

#### Scenario: 系统钥匙串不可用时进行 inline 连接
- **WHEN** block 使用有效明文直连模式且系统钥匙串不可用
- **THEN** 系统 SHALL 仍可使用 block 密码发起连接，且 SHALL NOT 降级调用任何持久化凭据接口

#### Scenario: inline 会话结束
- **WHEN** 用户断开连接、关闭文档、编辑 block 导致 widget 重建或禁用插件
- **THEN** 系统 SHALL 幂等关闭 SSH 资源并移除活动会话及其 inline 连接目标引用

### Requirement: 插件输出不得泄露 inline 密码
系统 MUST NOT 在错误消息、状态文本、主机密钥确认内容、Notice、日志、序列化插件数据或测试快照中包含 inline 密码。认证失败与网络失败 SHALL 继续映射为分类后的安全错误。

#### Scenario: inline 认证失败
- **WHEN** 服务器拒绝 block 中的密码
- **THEN** 系统 SHALL 显示通用认证失败错误，且所有用户可见文本和插件持久化数据 MUST NOT 包含该密码

#### Scenario: 连接参数触发异常
- **WHEN** inline 连接在主机校验、超时、网络或 shell 打开阶段失败
- **THEN** 系统 SHALL 映射安全错误，不序列化或插值整个 block、连接目标或密码提供器

### Requirement: inline 连接沿用严格的主机密钥校验
系统 SHALL 为 inline 连接基于规范化 `host + port` 生成稳定且不含用户名或密码的 endpoint 信任标识。首次连接 MUST 显示算法和 SHA256 指纹并等待明确确认；已信任 endpoint 的算法或指纹变化 MUST 阻断连接。用户 MUST 能从设置界面查看并忘记 inline endpoint 的信任记录。

#### Scenario: 首次连接 inline endpoint
- **WHEN** endpoint 没有已保存的主机密钥
- **THEN** 系统 SHALL 在密码认证完成前要求用户核对并确认指纹，确认后才保存 endpoint 信任记录并继续

#### Scenario: 同一 endpoint 的不同用户名
- **WHEN** 两个 inline block 使用相同规范化 host 与 port、不同 username
- **THEN** 系统 SHALL 使用同一服务器主机密钥信任记录，且信任标识 MUST NOT 包含任一密码

#### Scenario: inline endpoint 主机密钥变化
- **WHEN** 已信任 endpoint 返回不同算法或指纹
- **THEN** 系统 SHALL 阻断连接；用户忘记该 endpoint 的记录后，下一次连接 SHALL 重新进入首次确认流程


```

Full source: openspec/changes/support-inline-ssh-credentials/specs/inline-ssh-credentials/spec.md
