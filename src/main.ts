import { Notice, Platform, Plugin } from "obsidian";
import { SafeStorageCredentialStore, type SafeStorageApi } from "./profile/CredentialStore";
import { HostKeyStore } from "./profile/HostKeyStore";
import { PluginDataRepository, ProfileStore } from "./profile/ProfileStore";
import { createLivePreviewExtension } from "./render/livePreview";
import { registerReadingView } from "./render/readingView";
import { SshSettingsController } from "./settings/SshSettingsController";
import { SshSettingsTab } from "./settings/SshSettingsTab";
import { SessionManager } from "./ssh/SessionManager";
import { Ssh2ClientAdapter } from "./ssh/SshClientAdapter";
import { SshSession } from "./ssh/SshSession";
import { confirmHostKey } from "./ui/HostKeyConfirmModal";

/** 插件入口：装配安全存储、SSH 会话以及阅读视图/实时预览渲染器。 */
export default class SshTerminalPlugin extends Plugin {
  private sessionManager: SessionManager | undefined;

  async onload(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice("SSH Terminal 仅支持 Obsidian 桌面版");
      return;
    }

    const repository = await PluginDataRepository.load({
      load: () => this.loadData(),
      save: (data) => this.saveData(data)
    });
    const profiles = new ProfileStore(repository);
    const { safeStorage } = require("electron") as { safeStorage: SafeStorageApi };
    const credentials = new SafeStorageCredentialStore(repository, safeStorage);
    const hostKeys = new HostKeyStore(repository);

    // 每个渲染块创建独立 SshSession，但共享 profile、凭据与主机信任存储。
    this.sessionManager = new SessionManager((target) => new SshSession({
      target,
      hostKeys,
      clientFactory: () => new Ssh2ClientAdapter(),
      confirmHostKey: (prompt) => confirmHostKey(this.app, prompt)
    }));

    const dependencies = { profiles, credentials, manager: this.sessionManager };
    registerReadingView(this, dependencies);
    this.registerEditorExtension(createLivePreviewExtension({
      ...dependencies,
      sourcePath: () => this.app.workspace.getActiveFile()?.path ?? "untitled"
    }));

    const controller = new SshSettingsController(profiles, credentials, hostKeys);
    this.addSettingTab(new SshSettingsTab(this.app, this, profiles, hostKeys, controller));
  }

  async onunload(): Promise<void> {
    // 插件禁用或卸载时，主动关闭所有仍在运行的远端 Shell。
    await this.sessionManager?.closeAll();
    this.sessionManager = undefined;
  }
}
