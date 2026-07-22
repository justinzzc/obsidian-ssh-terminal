# Brainstorm Summary

- Change: support-inline-ssh-credentials
- Date: 2026-07-22

## 确认的技术方案

- inline block 使用顶层 `host`、`port`、`username`、`password`、`height` 字段；现有 `profile` 模式保持兼容，两种模式严格互斥。
- 渲染边界通过共享的纯逻辑 resolver 把两种配置转换为统一 `SshConnectionTarget`。
- target 承载非敏感连接参数、显示信息、主机信任键和密码提供器；profile 提供器读取钥匙串，inline 提供器只闭包持有当前 block 密码。
- `TerminalView`、`SessionManager` 和 `SshSession` 仅消费统一 target；`SshSession` 在创建网络客户端前才读取密码。
- inline 主机信任键采用 `inline:v1:<URL 编码的规范化 host>:<port>`；设置页列出并允许忘记，指纹变化始终阻断。
- `port` 默认 22，`height` 默认 360，连接超时沿用 15000ms；本次不增加高级 SSH 选项。

## 关键取舍与风险

- 接受 Markdown、同步、备份和 Git 历史中的明文风险，但插件不把密码再次复制到钥匙串、插件数据、日志、错误或主机信任记录。
- 密码必须是非空 YAML 字符串且不裁剪、不转换；数字密码需要加引号。
- JavaScript 字符串无法可靠原地清零，因此仅限制引用范围并在视图/会话销毁时释放对象引用。
- 统一 target 需要重构现有 manager/session 接口，但能保持凭据来源与会话生命周期职责分离。
- endpoint 信任键不包含用户名，因此同一 host+port 的不同账号共享服务器主机密钥信任，符合 SSH host key 的服务器身份语义。

## 测试策略

- parser/model：两种模式、默认值、混用、缺失字段、类型错误、端口/高度边界、未知字段与安全消息。
- target resolver：profile/inline 密码来源、keytar 不可用、密码精确值与 endpoint 标识规范化。
- manager/session：网络前取密、TOFU、错误映射、重连、幂等释放与秘密哨兵不泄露。
- renderer：阅读视图与实时预览一致性、编辑重建、profile 回归。
- host key/settings：首次确认、复用、变化阻断、列出和忘记 inline endpoint。
- Docker 集成：真实 inline 密码认证、PTY 数据交换与主机密钥校验。
- 执行单元测试、TypeScript、生产构建和仓库秘密扫描。

## Spec Patch

无。当前 OpenSpec delta spec 已覆盖确认后的 schema、安全边界、主机密钥恢复和测试验收场景。
