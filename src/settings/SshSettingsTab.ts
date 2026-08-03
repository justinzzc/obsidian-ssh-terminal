import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "./obsidianApi";
import type { SshProfile } from "../model";
import type { HostKeyStore } from "../profile/HostKeyStore";
import type { ProfileStore } from "../profile/ProfileStore";
import { ProfileModal } from "./ProfileModal";
import { SshSettingsController } from "./SshSettingsController";

/** Obsidian 设置页：管理非敏感连接字段，并把密码交给系统钥匙串。 */
export class SshSettingsTab extends PluginSettingTab {
  constructor(
    private readonly appRef: App,
    plugin: Plugin,
    private readonly profiles: ProfileStore,
    private readonly hostKeys: HostKeyStore,
    private readonly controller: SshSettingsController
  ) {
    super(appRef, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("SSH Terminal 连接配置")
      .setDesc("profile 模式的密码只保存到操作系统钥匙串；inline 模式会写入 Markdown 明文。")
      .setHeading();

    const header = containerEl.createDiv({ cls: "ssh-settings-profile-header" });
    new Setting(header)
      .setName("Profiles")
      .setHeading()
      .addButton((button) => button
        .setButtonText("新增连接")
        .setCta()
        .onClick(() => this.openProfileModal()));

    const list = containerEl.createDiv({ cls: "ssh-settings-profile-list" });
    const profiles = this.profiles.list();
    if (profiles.length === 0) {
      list.createDiv({
        cls: "ssh-settings-profile-empty",
        text: "暂无连接配置，点击“新增连接”创建第一个 Profile。"
      });
    } else {
      for (const profile of profiles) this.renderProfileRow(list, profile);
    }

    this.renderInlineHostKeys(containerEl);
  }

  private renderProfileRow(container: HTMLElement, profile: SshProfile): void {
    const item = container.createDiv({ cls: "ssh-settings-profile-item" });
    const row = item.createEl("button", { cls: "ssh-settings-profile-row" });
    row.setAttribute("type", "button");
    row.setAttribute("aria-label", `查看或编辑 ${profile.name}`);

    const details = row.createEl("span", { cls: "ssh-settings-profile-details" });
    details.createEl("span", { cls: "ssh-settings-profile-name", text: profile.name });
    details.createEl("span", {
      cls: "ssh-settings-profile-endpoint",
      text: `${profile.username}@${profile.host}:${profile.port}`
    });
    details.createEl("span", { cls: "ssh-settings-profile-id", text: profile.id });

    const editButton = item.createEl("button", {
      text: "查看/编辑"
    });
    editButton.setAttribute("type", "button");
    editButton.addEventListener("click", () => this.openProfileModal(profile));
    row.addEventListener("click", () => this.openProfileModal(profile));
  }

  private openProfileModal(profile?: SshProfile): void {
    new ProfileModal(
      this.appRef,
      profile,
      Boolean(profile && this.hostKeys.get(profile.id)),
      {
        save: (next, password) => this.controller.save(next, password),
        delete: (profileId) => this.controller.delete(profileId),
        forgetHostKey: (profileId) => this.controller.forgetHostKey(profileId),
        onChanged: () => this.display()
      }
    ).open();
  }

  private renderInlineHostKeys(container: HTMLElement): void {
    const trustedHosts = this.hostKeys.listInline();
    if (trustedHosts.length === 0) return;

    new Setting(container)
      .setName("Inline SSH 主机信任")
      .setDesc("以下主机指纹来自 Markdown 中的 inline SSH 连接；忘记后，下次连接需要重新确认。")
      .setHeading();
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
