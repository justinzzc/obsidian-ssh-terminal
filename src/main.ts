import { Notice, Platform, Plugin } from "./settings/obsidianApi";
import type { TAbstractFile, TFile } from "./settings/obsidianApi";
import { safeStorage } from "electron";
import { SafeStorageCredentialStore } from "./profile/CredentialStore";
import { HostKeyStore } from "./profile/HostKeyStore";
import { PluginDataRepository, ProfileStore } from "./profile/ProfileStore";
import { createLivePreviewExtension } from "./render/livePreview";
import { registerReadingView } from "./render/readingView";
import { SshSettingsController } from "./settings/SshSettingsController";
import { SshSettingsTab } from "./settings/SshSettingsTab";
import { SessionManager } from "./ssh/SessionManager";
import { Ssh2ClientAdapter } from "./ssh/SshClientAdapter";
import { SshSession } from "./ssh/SshSession";
import { TerminalInstanceRegistry } from "./terminal/TerminalInstanceRegistry";
import { confirmHostKey } from "./ui/HostKeyConfirmModal";
import { PersistentTerminalItemView } from "./ui/PersistentTerminalItemView";
import { SshSessionsView } from "./ui/SshSessionsView";
import { TerminalView } from "./ui/TerminalView";
import {
  SSH_SESSIONS_VIEW_TYPE,
  SSH_TERMINAL_VIEW_TYPE,
  TerminalWorkspaceController
} from "./ui/TerminalWorkspaceController";

/** 插件入口：装配安全存储、SSH 会话以及阅读视图/实时预览渲染器。 */
export default class SshTerminalPlugin extends Plugin {
  private sessionManager: SessionManager | undefined;
  private registry: TerminalInstanceRegistry | undefined;
  private workspaceController: TerminalWorkspaceController | undefined;

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
    const credentials = new SafeStorageCredentialStore(repository, safeStorage);
    const hostKeys = new HostKeyStore(repository);

    // 每个渲染块创建独立 SshSession，但共享 profile、凭据与主机信任存储。
    this.sessionManager = new SessionManager((target) => new SshSession({
      target,
      hostKeys,
      clientFactory: () => new Ssh2ClientAdapter(),
      confirmHostKey: (prompt) => confirmHostKey(this.app, prompt)
    }));

    this.registry = new TerminalInstanceRegistry({
      sessionManager: this.sessionManager,
      terminalFactory: (container, options) => TerminalView.mount(container, options)
    });
    this.workspaceController = new TerminalWorkspaceController(this.app, this.registry);
    const registry = this.registry;
    const workspaceController = this.workspaceController;

    this.registerView(
      SSH_SESSIONS_VIEW_TYPE,
      (leaf) => new SshSessionsView(leaf, registry, workspaceController)
    );
    this.registerView(
      SSH_TERMINAL_VIEW_TYPE,
      (leaf) => new PersistentTerminalItemView(leaf, registry, workspaceController)
    );
    this.addRibbonIcon("square-terminal", "SSH Sessions", () => {
      void workspaceController.openSessions();
    });

    const dependencies = {
      profiles,
      credentials,
      registry,
      openTerminal: (instanceId: string) => workspaceController.openTerminal(instanceId),
      readSource: async (sourcePath: string): Promise<string> => {
        const file = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!file) throw new Error(`Source document not found: ${sourcePath}`);
        return this.app.vault.cachedRead(file as TFile);
      }
    };
    registerReadingView(this, dependencies);
    this.registerEditorExtension(createLivePreviewExtension({
      ...dependencies,
      sourcePath: () => this.app.workspace.getActiveFile()?.path ?? "untitled"
    }));

    this.registerEvent(this.app.vault.on(
      "rename",
      (file: TAbstractFile, oldPath: string) => registry.renameSource(oldPath, file.path)
    ));
    this.registerEvent(this.app.vault.on(
      "delete",
      (file: TAbstractFile) => registry.markSourceUnavailable(file.path)
    ));

    const controller = new SshSettingsController(profiles, credentials, hostKeys);
    this.addSettingTab(new SshSettingsTab(this.app, this, profiles, hostKeys, controller));
  }

  async onunload(): Promise<void> {
    // 插件禁用或卸载时，主动关闭所有仍在运行的远端 Shell。
    await this.registry?.closeAll();
    this.workspaceController = undefined;
    this.registry = undefined;
    this.sessionManager = undefined;
  }
}
