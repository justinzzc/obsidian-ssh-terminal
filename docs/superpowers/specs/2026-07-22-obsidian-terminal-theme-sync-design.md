# Obsidian SSH Terminal 主题同步设计

## 目标

SSH 终端的背景、正文、光标和选区颜色跟随当前 Obsidian 主题。用户切换明暗主题或第三方主题时，已打开的终端立即更新，不重新连接、不清空屏幕。

## 范围

- 背景读取 `--background-primary`。
- 前景读取 `--text-normal`。
- 光标读取 `--text-accent`，缺失时回退到前景色。
- 选区读取 `--text-selection`，缺失时使用可见的半透明回退色。
- 工具栏继续由现有 CSS 使用 `--background-secondary`。
- 保留 xterm 的 ANSI 调色板，不覆盖远端程序主动输出的颜色。
- 不新增用户设置，不保存颜色配置。

## 设计

主题读取和监听封装在 `XtermAdapter` 内部，避免渲染视图、SSH 会话层感知主题细节。

终端打开时：

1. 从终端容器的计算样式读取 Obsidian CSS 变量。
2. 将解析后的颜色写入 xterm `theme` 配置。
3. 打开 xterm。
4. 监听 `document.documentElement` 和 `document.body` 的 `class`、`style` 属性变化。

主题变化时重新读取计算样式，并更新同一个 xterm 实例的 `options.theme`。不销毁终端，不操作 SSH 连接，也不修改终端缓冲区。

终端释放时断开 `MutationObserver`，然后释放 xterm，避免文档切换后遗留监听器。

## 回退与错误处理

- CSS 变量为空时使用适合明暗主题的稳定回退颜色。
- 多次主题属性变化允许重复更新；更新操作不产生网络行为。
- 环境不支持 `MutationObserver` 时仍应用首次读取的主题，只是不支持运行时同步。

## 测试

- 验证 Obsidian CSS 变量可映射为 xterm 背景、前景、光标和选区颜色。
- 验证缺失变量使用回退色。
- 验证主题属性变化后更新 xterm 主题。
- 验证终端释放时断开主题监听器。
- 运行现有完整单元测试、TypeScript 检查和生产构建。
- 在隔离 Obsidian 中切换主题类，确认已挂载终端颜色更新且 Connect 工具栏仍存在。

## 非目标

- 不根据 Obsidian 主题重写 ANSI 16 色或 256 色调色板。
- 不提供每个 SSH Profile 的自定义配色。
- 不因主题变化重建或重连 SSH 会话。
