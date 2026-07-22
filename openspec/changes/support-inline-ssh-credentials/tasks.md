## 1. Block 模型与解析

- [x] 1.1 先扩展 `parseSshBlock` 单元测试，覆盖 profile 兼容、最小/完整 inline 配置、默认值、模式混用、缺失字段、YAML 密码类型、端口/高度边界与安全错误文本
- [x] 1.2 将 `SshBlockConfig` 改为 profile/inline 判别联合并实现严格解析，确保密码值不裁剪、不回显且未知字段继续被拒绝

## 2. 统一连接目标

- [x] 2.1 为 profile 与 inline block 增加无 UI 的 `SshConnectionTarget` 解析器及测试，分别连接钥匙串密码提供器和短生命周期 inline 密码提供器
- [x] 2.2 实现基于规范化 host + port、且不含用户名或密码的稳定 inline 主机密钥标识，并覆盖域名大小写、IPv4、IPv6 与非默认端口测试

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
