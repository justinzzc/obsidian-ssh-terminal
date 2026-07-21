import { App, Modal, Setting } from "obsidian";
import type { HostKeyPrompt } from "../ssh/SshSession";

/** 首次连接时展示完整指纹；用户未明确确认就视为拒绝。 */
export function confirmHostKey(app: App, prompt: HostKeyPrompt): Promise<boolean> {
  return new Promise((resolve) => {
    new HostKeyConfirmModal(app, prompt, resolve).open();
  });
}

class HostKeyConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly prompt: HostKeyPrompt,
    private readonly resolveResult: (accepted: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("确认 SSH 服务器主机密钥");
    this.contentEl.createEl("p", {
      text: `${this.prompt.host}:${this.prompt.port} 首次连接，请通过可信渠道核对以下指纹：`
    });
    this.contentEl.createEl("code", {
      text: `${this.prompt.algorithm} ${this.prompt.fingerprint}`
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.finish(false)))
      .addButton((button) => button.setButtonText("信任并连接").setCta().onClick(() => this.finish(true)));
  }

  onClose(): void {
    if (!this.resolved) this.finish(false);
    this.contentEl.empty();
  }

  private finish(accepted: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(accepted);
    this.close();
  }
}
