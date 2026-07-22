## Why

当前终端工具栏在连接后会用 `Connected` 等状态覆盖主机显示名，用户无法继续确认当前连接目标；同时工具栏提供 Connect、Disconnect、Reconnect 三个相近操作，界面冗余。终端根节点还会拦截 Escape 并把焦点交还编辑器，导致 Vim 等依赖 Escape 的终端程序无法正常进入普通模式。

## What Changes

- 主机显示名始终保留，不再承载连接状态。
- 将连接状态与操作合并到一个按钮：未连接时连接、连接中禁用、已连接时断开、失败后允许重试。
- 移除独立的 Disconnect 和 Reconnect 按钮。
- 不再拦截 Escape，不阻止其默认行为或传播，也不主动把焦点移出终端。
- 增加终端工具栏与 Escape 行为的回归测试。

## Impact

- 仅影响 `TerminalView` 的工具栏状态机和键盘事件处理。
- 不改变 SSH 会话、连接目标、持久化数据或 block 语法。

