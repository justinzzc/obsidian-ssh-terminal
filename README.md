# Obsidian SSH Terminal

在 Obsidian 桌面版文档中嵌入完整交互式 SSH 终端。插件支持阅读视图与实时预览，连接必须由用户手动发起。

## 使用方法

1. 在插件设置中创建连接配置并保存密码。
2. 首次连接时，通过可信渠道核对服务器主机密钥指纹。
3. 在文档中加入：

   ````markdown
   ```ssh
   profile: production-server
   height: 360
   ```
   ````

4. 在渲染出的终端中点击“Connect”。按 `Escape` 可把键盘焦点交还给 Obsidian。

## 安全说明

- Markdown 和插件 `data.json` 不保存密码。
- 密码通过 `keytar` 写入 Windows Credential Manager、macOS Keychain 或 Linux Secret Service。
- 系统钥匙串不可用时，插件拒绝保存密码，不会降级为明文。
- 首次连接采用 TOFU；已确认的主机指纹发生变化时，连接会被阻止。
- 插件日志不记录密码、输入命令或终端输出。

## 构建

需要 Node.js 20+：

```powershell
npm install
npm run check
npm run build
npm run package:release
```

发布目录位于 `release/<platform>-<arch>/`。将其中内容复制到 Vault 的 `.obsidian/plugins/ssh-terminal/`，然后在 Obsidian 中启用插件。原生 `keytar` 文件必须与运行 Obsidian 的操作系统和 CPU 架构一致。

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
