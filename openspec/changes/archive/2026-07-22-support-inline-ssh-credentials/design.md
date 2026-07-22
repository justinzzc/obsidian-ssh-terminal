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
4. 运行单元、类型、构建和 Docker SSH 集成验证。

回滚时可恢复只接受 `profile` 的解析路径；持久化 profile schema 未变化。已经保存的 inline 主机密钥记录属于非秘密数据，旧版本会忽略这些无匹配 profile 的记录，但回滚说明应提示用户可手动清理。

## Open Questions

无。用户已明确选择允许 Markdown 中的字面量明文密码，并接受其落盘与同步风险。

## Implementation Divergence

### TerminalView 使用 target factory 而非长期保存 target

实施期间的 standard code review 发现：如果 `TerminalView` 长期保存 `SshConnectionTarget`，用户断开会话后仍会通过 `getPassword()` 闭包保留 inline 密码引用，与“会话关闭后释放连接目标引用”的规格要求冲突；但直接清空 target 又会破坏 Connect/Reconnect。

最终实现把 `TerminalViewOptions.target` 调整为 `createTarget()`。阅读视图与实时预览保存当前 Markdown source，并在每次连接时重新调用共享 parser/resolver 创建临时 target。target 仅由本次连接 Promise、`SessionManager` 和 `SshSession` 持有；断开时 manager entry、session 订阅和 target 引用一并释放。Markdown 明文本身仍由文档/编辑器持有，这属于用户已接受的风险边界，不会额外复制到插件持久化数据或凭据存储。

该偏差不改变 delta spec 的外部行为：profile 与 inline 模式、默认值、错误、TOFU、手动连接和重连行为保持一致，并缩短了 inline password provider 的引用生命周期。
