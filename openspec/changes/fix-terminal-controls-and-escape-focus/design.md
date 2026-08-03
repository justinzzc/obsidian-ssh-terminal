## Context

`TerminalView` 当前同时维护主机/状态文本和三个连接按钮。连接生命周期会直接覆盖状态文本，而根节点的 Escape 监听器会调用 `preventDefault`、`stopPropagation` 与 `returnFocus`。

## 修复方案

保留一个固定显示 `displayName` 的主机标签，并让唯一的连接按钮同时表示状态与下一步操作：

- 未连接或失败：`Connect`，点击发起连接。
- 连接中：`Connecting…`，按钮禁用。
- 已连接：`Disconnect`，点击关闭当前会话。

会话状态回调仅更新按钮，不修改主机标签。断开后清理会话订阅并恢复 `Connect`。删除 Reconnect 方法与按钮；用户需要重连时通过同一按钮先断开再连接。

终端根节点只拦截 Escape 的冒泡：不调用 `preventDefault`，确保 xterm/Vim 仍收到按键；调用 `stopPropagation`，阻止 Obsidian/CodeMirror 把同一个 Escape 解释为退出 block；不调用 `returnFocus`。监听器随终端视图销毁而注销。

实时预览使用不含 block 结束位置的稳定实例标识。widget 因进入编辑模式或内容重绘而销毁时，仅释放 xterm 和事件订阅，暂时保留 `SessionManager` 中的 SSH 会话；返回预览后通过 `resume` 尝试重新挂接。编辑器销毁、block 删除或配置无效时仍关闭对应会话，避免泄漏。

连接目标使用仅存在于内存 WeakMap 中的等价签名比较。profile 比较实际 profile 连接字段；inline 比较 host、port、username、password 和 timeout，明确排除 `height`。签名不会成为对象可枚举字段、日志或持久化数据。目标不等价时，`SessionManager.resume` 关闭旧会话并返回未连接状态。

## 风险与控制

- 异步连接失败或状态变化可能让按钮与真实状态不同步：集中使用小型按钮状态更新方法，并覆盖成功、失败、断开测试。
- 移除 Reconnect 改变原有测试操作路径：用同一按钮的连接→断开→再连接验证 target 重建和订阅释放行为。
- 临时保留会话可能在 block 删除或编辑器销毁时泄漏：实时预览生命周期插件集中关闭已登记实例，并覆盖删除与 destroy 测试。

## Hotfix 范围确认

该修复需要协调实时预览、终端视图和会话管理器，命中跨模块 tripwire。用户于 2026-07-22 明确选择继续 hotfix，以最小内部接口扩展完成修复，不升级完整流程。
