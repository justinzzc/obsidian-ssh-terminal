## Context

`TerminalView` 当前同时维护主机/状态文本和三个连接按钮。连接生命周期会直接覆盖状态文本，而根节点的 Escape 监听器会调用 `preventDefault`、`stopPropagation` 与 `returnFocus`。

## 修复方案

保留一个固定显示 `displayName` 的主机标签，并让唯一的连接按钮同时表示状态与下一步操作：

- 未连接或失败：`Connect`，点击发起连接。
- 连接中：`Connecting…`，按钮禁用。
- 已连接：`Disconnect`，点击关闭当前会话。

会话状态回调仅更新按钮，不修改主机标签。断开后清理会话订阅并恢复 `Connect`。删除 Reconnect 方法与按钮；用户需要重连时通过同一按钮先断开再连接。

删除终端根节点的 Escape 键监听器及其注册/注销逻辑。Escape 由 xterm 和终端内程序原样处理；`returnFocus` 选项暂不扩大修改范围，可保留为兼容字段，但终端不再因 Escape 调用它。

## 风险与控制

- 异步连接失败或状态变化可能让按钮与真实状态不同步：集中使用小型按钮状态更新方法，并覆盖成功、失败、断开测试。
- 移除 Reconnect 改变原有测试操作路径：用同一按钮的连接→断开→再连接验证 target 重建和订阅释放行为。
