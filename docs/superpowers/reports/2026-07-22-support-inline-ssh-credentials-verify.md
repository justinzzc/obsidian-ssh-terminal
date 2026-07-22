# support-inline-ssh-credentials 验证报告

验证日期：2026-07-22  
验证模式：full  
基准提交：`4f114369c4ff8af38a68df49aa015c864806850d`  
实现提交：`72ae38d`

## 总结

| 维度 | 状态 | 证据 |
|---|---|---|
| 完整性 | PASS | OpenSpec tasks 14/14 完成；8/8 requirements 有实现与测试证据 |
| 正确性 | PASS | 18/18 scenarios 已由单元、渲染或真实 SSH 集成测试覆盖 |
| 一致性 | PASS | 实现遵循统一 parser/resolver、临时 target、TOFU 与无秘密持久化设计；target factory 偏差已记录 |
| 构建与测试 | PASS | TypeScript、76 个单元测试、生产构建、Docker SSH 集成测试均通过 |
| 安全审查 | PASS | standard code review 最终结论 Ready to merge；无 Critical/Important 问题 |

## 完整性

- `openspec instructions apply --change support-inline-ssh-credentials --json`：14 个任务全部为 `done: true`。
- Delta spec 共 8 项 Requirement，均可映射到生产实现：
  - 模式互斥、默认值和严格校验：`src/block/parseSshBlock.ts:15`
  - profile/inline 统一目标：`src/block/resolveSshConnectionTarget.ts:18`
  - host + port 信任标识：`src/ssh/SshConnectionTarget.ts:14`
  - 会话取密、安全错误与 TOFU：`src/ssh/SshSession.ts:65`
  - 会话所有权和释放：`src/ssh/SessionManager.ts:20`
  - 每次连接创建临时 target：`src/ui/TerminalView.ts:105`
  - 两种渲染视图共享 parser/resolver：`src/render/readingView.ts:39`、`src/render/livePreview.ts:96`
  - inline 信任管理：`src/profile/HostKeyStore.ts:46`、`src/settings/SshSettingsTab.ts:89`
  - 明文风险文档：`README.md`

## 正确性与场景覆盖

### Block 语法与默认值

- profile 兼容、inline 最小/完整配置、精确密码字符串：`tests/unit/parseSshBlock.test.ts:21`
- 模式混用、缺失字段、未知/禁止字段、YAML 类型、端口和高度边界、安全错误：`tests/unit/parseSshBlock.test.ts`

### 凭据与生命周期

- inline 不访问或写入 CredentialStore；profile 继续从钥匙串取密：`tests/unit/resolveSshConnectionTarget.test.ts:19`
- 断开/重连释放旧 session 订阅，并重新创建 target：`tests/unit/TerminalView.test.ts:167`
- 阅读视图和实时预览使用短生命周期 inline target：`tests/unit/readingView.test.ts:74`、`tests/unit/livePreview.test.ts:57`
- HostKeyStore 持久化数据不包含 inline 密码：`tests/unit/HostKeyStore.test.ts`

### 错误与秘密泄露

- 认证、网络、超时、主机密钥变化和拒绝均返回不含密码的分类错误：`tests/unit/SshSession.test.ts:132`、`tests/unit/SshSession.test.ts:180`、`tests/unit/SshSession.test.ts:201`
- 状态/错误 DOM、设置页和渲染错误不包含密码哨兵：`tests/unit/TerminalView.test.ts`、`tests/unit/readingView.test.ts`、`tests/unit/livePreview.test.ts`、`tests/unit/SshSettingsTab.test.ts`
- `temporary-inline-test-value` 与 `never-leak-me` 对生产源码、README、`main.js`、`styles.css` 的扫描无匹配。

### 主机密钥信任

- 首次确认、已信任复用、指纹变化阻断：`tests/unit/SshSession.test.ts:115`、`tests/unit/SshSession.test.ts:132`
- 域名大小写、IPv6 和非默认端口规范化：`tests/unit/resolveSshConnectionTarget.test.ts:89`
- inline endpoint 列出、忘记和设置页确认：`tests/unit/HostKeyStore.test.ts:39`、`tests/unit/SshSettingsTab.test.ts:26`

### 真实连接

- `tests/integration/ssh.test.ts:39` 使用生产 `Ssh2ClientAdapter` 和 inline target 完成 host-key 确认、密码认证、PTY 数据交换、resize 与关闭。
- fixture 等待真实 `SSH-` banner，避免 Docker 端口代理早于 sshd 就绪的启动竞态。

## 设计一致性

- OpenSpec delta spec 与实现行为一致。
- Superpowers Design Doc 已描述 `createTarget()` 的临时 target 架构。
- OpenSpec `design.md` 原先描述 TerminalView 直接接收并保留 target；按用户选择，已追加 `Implementation Divergence`，说明改用 source-backed target factory 的原因、边界和兼容性。
- 该偏差不改变任何外部场景，只缩短 inline password provider 的引用生命周期并保留 Connect/Reconnect。

## 验证命令

| 命令 | 结果 |
|---|---|
| `npm run check` | PASS：TypeScript 通过，13 个测试文件、76 个单元测试通过 |
| `npm run build` | PASS：生成 `main.js` 与 `styles.css` |
| `$env:OBSIDIAN_SSH_TEST_PASSWORD='temporary-inline-test-value'; npm run test:integration` | PASS：1/1 真实 SSH 集成测试通过 |
| `openspec validate support-inline-ssh-credentials --json` | PASS：`valid: true`，0 issues |
| standard code review + 两轮 follow-up review | PASS：最终无 Critical/Important，Ready to merge |
| 哨兵秘密扫描 | PASS：生产源码、文档和构建产物无匹配 |

## 问题分级

### CRITICAL

无。

### WARNING

无。设计偏差已按用户选择记录并消解。

### SUGGESTION

无阻塞建议。

## 最终结论

完整性、正确性、一致性、构建、测试和安全审查全部通过。该 change 已准备进入 archive 阶段。
