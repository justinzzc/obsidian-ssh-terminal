import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "./obsidianApi";
import type { SshProfile } from "../model";
import type { HostKeyStore } from "../profile/HostKeyStore";
import type { ProfileStore } from "../profile/ProfileStore";
import { SshSettingsController } from "./SshSettingsController";

/** Obsidian 设置页：管理非敏感连接字段，并把密码交给系统钥匙串。 */
export class SshSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly profiles: ProfileStore,
    private readonly hostKeys: HostKeyStore,
    private readonly controller: SshSettingsController
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "SSH Terminal 连接配置" });
    containerEl.createEl("p", {
      text: "profile 模式的密码只保存到操作系统钥匙串；inline 模式会写入 Markdown 明文。"
    });

    for (const profile of this.profiles.list()) this.renderProfile(containerEl, profile);
    this.renderProfile(containerEl);
    this.renderInlineHostKeys(containerEl);
  }

  private renderProfile(container: HTMLElement, existing?: SshProfile): void {
    const section = container.createDiv({ cls: "ssh-settings-profile" });
    section.createEl("h3", { text: existing ? existing.name : "新增连接" });
    const values = {
      id: existing?.id ?? "",
      name: existing?.name ?? "",
      host: existing?.host ?? "",
      port: String(existing?.port ?? 22),
      username: existing?.username ?? "",
      timeoutMs: String(existing?.timeoutMs ?? 15_000),
      password: ""
    };

    addTextSetting(section, "Profile ID", "例如 production-server；保存后不建议修改", values.id, (value) => values.id = value, Boolean(existing));
    addTextSetting(section, "显示名称", "用于设置页展示", values.name, (value) => values.name = value);
    addTextSetting(section, "主机", "主机名或 IP 地址", values.host, (value) => values.host = value);
    addTextSetting(section, "端口", "默认 22", values.port, (value) => values.port = value);
    addTextSetting(section, "用户名", "SSH 登录用户名", values.username, (value) => values.username = value);
    addTextSetting(section, "超时（毫秒）", "1000 到 120000", values.timeoutMs, (value) => values.timeoutMs = value);
    addTextSetting(section, "密码", existing ? "留空表示保留已保存密码" : "保存到系统钥匙串", "", (value) => values.password = value, false, true);

    new Setting(section).addButton((button) => button
      .setButtonText("保存")
      .setCta()
      .onClick(async () => {
        try {
          await this.controller.save({
            id: values.id.trim(),
            name: values.name.trim(),
            host: values.host.trim(),
            port: Number(values.port),
            username: values.username.trim(),
            timeoutMs: Number(values.timeoutMs)
          }, values.password);
          new Notice("SSH 配置已保存");
          this.display();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "SSH 配置保存失败");
        }
      }));

    if (!existing) return;
    new Setting(section)
      .addButton((button) => button.setButtonText("忘记主机指纹").onClick(async () => {
        if (!this.hostKeys.get(existing.id)) return;
        await this.controller.forgetHostKey(existing.id);
        new Notice("已忘记主机指纹，下次连接将重新确认");
        this.display();
      }))
      .addButton((button) => button.setButtonText("删除").setWarning().onClick(async () => {
        // 删除会同时清理 profile、系统密码和已信任主机指纹。
        if (!window.confirm(`确定删除 SSH 配置“${existing.name}”吗？`)) return;
        await this.controller.delete(existing.id);
        this.display();
      }));
  }

  private renderInlineHostKeys(container: HTMLElement): void {
    const trustedHosts = this.hostKeys.listInline();
    if (trustedHosts.length === 0) return;

    container.createEl("h2", { text: "Inline SSH 主机信任" });
    container.createEl("p", {
      text: "以下主机指纹来自 Markdown 中的 inline SSH 连接；忘记后，下次连接需要重新确认。"
    });
    for (const trusted of trustedHosts) {
      new Setting(container)
        .setName(`${trusted.host}:${trusted.port}`)
        .setDesc(`${trusted.algorithm} ${trusted.fingerprint}`)
        .addButton((button) => button.setButtonText("忘记").setWarning().onClick(async () => {
          if (!window.confirm(`确定忘记 ${trusted.host}:${trusted.port} 的主机指纹吗？`)) return;
          await this.controller.forgetInlineHostKey(trusted.id);
          new Notice("已忘记 inline SSH 主机指纹，下次连接将重新确认");
          this.display();
        }));
    }
  }
}

function addTextSetting(
  container: HTMLElement,
  name: string,
  description: string,
  value: string,
  onChange: (value: string) => void,
  disabled = false,
  password = false
): void {
  new Setting(container)
    .setName(name)
    .setDesc(description)
    .addText((text) => {
      text.setValue(value).onChange(onChange);
      text.inputEl.disabled = disabled;
      if (password) text.inputEl.type = "password";
    });
}
