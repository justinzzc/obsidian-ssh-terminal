# Obsidian SSH Terminal

在 Obsidian 桌面版文档中嵌入完整交互式 SSH 终端。插件支持阅读视图与实时预览，连接必须由用户手动发起。

## 使用方法

SSH block 支持两种互斥模式。需要保护密码时，推荐使用 profile + 系统钥匙串：

1. 在插件设置中创建连接配置并把密码保存到系统钥匙串。
2. 首次连接时，通过可信渠道核对服务器主机密钥指纹。
3. 在文档中加入：

   ````markdown
   ```ssh
   profile: production-server
   height: 360
   ```
   ````

4. 在渲染出的终端中点击“Connect”。按 `Escape` 可把键盘焦点交还给 Obsidian。

也可以直接在 block 中填写连接信息和明文密码：

> **警告：下面的密码会作为 Markdown 明文保存，可能进入 Obsidian Sync、云盘、备份和 Git 历史。需要保护秘密时，请使用上面的 profile + 系统钥匙串模式。**

````markdown
```ssh
host: server.example.com
port: 22
username: root
password: "replace-with-password"
height: 360
```
````

inline 模式要求 `host`、`username` 和字符串类型的 `password`；`port` 默认 `22`，`height` 默认 `360`，连接超时固定为 `15000ms`。纯数字、布尔值或含特殊 YAML 字符的密码应加引号，密码解析后会保持原值，不会被裁剪。`profile` 不能与任何 inline 字段混用。

inline 连接同样执行严格的主机指纹确认。已信任的 inline 主机按规范化的 `host + port` 记录，可在插件设置的“Inline SSH 主机信任”区域查看和忘记。

## 安全说明

- profile 模式不会把密码写入 Markdown 明文；密码通过 Electron `safeStorage` 使用操作系统加密能力加密后，以密文写入插件 `data.json`。
- inline 模式会把密码直接保存在 Markdown 中，但不会复制到系统钥匙串、插件 `data.json` 或主机指纹记录。
- 系统钥匙串不可用时，插件拒绝保存密码，不会降级为明文。
- 首次连接采用 TOFU；已确认的主机指纹发生变化时，连接会被阻止。
- 插件日志、错误信息和状态文本不记录密码、输入命令或终端输出。

## 构建

需要 Node.js 20+：

```powershell
npm install
npm run check
npm run build
npm run package:release
```

发布目录位于 `release/community/`，其中包含 Obsidian 社区插件发布需要的 `main.js`、`manifest.json` 和 `styles.css`。将其中内容复制到 Vault 的 `.obsidian/plugins/ssh-terminal/`，然后在 Obsidian 中启用插件。

## 集成测试

```powershell
docker build -t obsidian-ssh-test tests/fixtures/sshd
$env:OBSIDIAN_SSH_TEST_PASSWORD='<temporary-local-password>'
npm run test:integration
```

测试密码只通过环境变量注入，不应写入仓库文件。

## 首版限制

- 仅支持 Obsidian 桌面版。
- 仅支持密码认证。
- 暂不支持 SFTP、端口转发、跳板机、私钥、SSH Agent 和移动端。
