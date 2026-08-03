## 验证报告：fix-terminal-controls-and-escape-focus

### 摘要

| 维度 | 结果 |
|---|---|
| 完整性 | PASS：10/10 tasks 已完成；hotfix 未引入 delta spec |
| 正确性 | PASS：三个缺陷组均有回归测试，82/82 单元测试通过 |
| 一致性 | PASS：实现遵循单一连接按钮、固定 host 标签、移除 Escape 劫持及编辑时复用会话的设计 |

### 验证证据

- TDD RED：首次运行单元测试时，工具栏测试报告 3 个连接按钮而期望 1 个；Escape 测试报告事件被取消；单按钮断开/重连测试报告会话订阅未释放。共 3 个预期失败。
- 第二轮 TDD RED：连接等价函数与 `SessionManager.resume` 尚不存在；实时预览 widget dispose 未携带保留会话语义。共 3 个预期失败。
- 第三轮 TDD RED：Escape 保持未取消，但向终端外层冒泡一次，复现 Obsidian/CodeMirror 接管并退出 block。
- TDD GREEN：`npm run check` 退出码 0，TypeScript 无错误，13 个测试文件、82 个单元测试全部通过。
- 构建：`npm run build` 退出码 0，生成 `main.js` 与 `styles.css`。
- 差异卫生：`git diff --check 41e5c8882d99f54f7a3d8f5aa2abaaf4ae9baf5a...HEAD` 退出码 0。
- Comet build guard：退出码 0，项目构建检查通过。

### 需求映射

- host 信息固定显示：`src/ui/TerminalView.ts:72`；连接生命周期回归测试：`tests/unit/TerminalView.test.ts:148`。
- 单一连接按钮及状态切换：`src/ui/TerminalView.ts:75`、`src/ui/TerminalView.ts:101`、`src/ui/TerminalView.ts:170`；断开后重连和订阅释放测试：`tests/unit/TerminalView.test.ts:205`。
- Escape 保留给终端：根节点不调用 `preventDefault` 或 `returnFocus`，仅停止向 Obsidian/CodeMirror 冒泡；回归测试同时验证默认行为未取消、焦点未转移、外层监听器未收到事件。
- 编辑 block 时保持会话：实时预览使用稳定实例 ID，临时 widget 销毁仅拆除 UI；返回后 `TerminalView` 调用 `SessionManager.resume` 重新挂接现有会话。
- 展示参数不触发重连：连接目标等价签名排除 `height`；inline 的 host、port、username、password 与 timeout 变化会被识别，profile 比较实际连接字段。
- 生命周期清理：block 删除、配置无效或编辑器销毁时，实时预览 lifecycle 关闭对应 manager 会话。

### 安全与边界检查

- 未新增持久化、网络协议或 SSH 传输层改动。
- inline 密码只作为 WeakMap 内存签名的一部分参与严格相等比较，不成为目标对象可枚举字段，不写入日志或持久化数据。
- 未新增 unsafe 操作、日志输出或敏感信息处理路径。
- `review_mode: off`，按 Comet 配置跳过自动代码审查；构建、测试、安全和边界检查未跳过。
- 无 delta spec，因此跳过 spec scenario 覆盖与 delta spec 漂移检查。
- 本 hotfix 无 `docs/superpowers/specs/` Design Doc；以 OpenSpec `design.md` 完成一致性核对。

### 问题分级

- CRITICAL：无。
- WARNING：无。
- SUGGESTION：无。

### 最终结论

全部检查通过，可以进入归档确认阶段。
