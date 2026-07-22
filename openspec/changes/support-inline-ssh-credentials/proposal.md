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
