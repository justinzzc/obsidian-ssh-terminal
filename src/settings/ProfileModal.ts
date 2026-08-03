import type { SshProfile } from "../model";
import { Modal, Notice, Setting, type App } from "./obsidianApi";

export interface ProfileModalActions {
  save(profile: SshProfile, password: string): Promise<void>;
  delete(profileId: string): Promise<void>;
  forgetHostKey(profileId: string): Promise<void>;
  onChanged(): void;
}

interface ProfileFormValues {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  timeoutMs: string;
  password: string;
}

export class ProfileModal extends Modal {
  private readonly values: ProfileFormValues;

  constructor(
    app: App,
    private readonly existing: SshProfile | undefined,
    private readonly hasHostKey: boolean,
    private readonly actions: ProfileModalActions
  ) {
    super(app);
    this.values = {
      id: existing?.id ?? "",
      name: existing?.name ?? "",
      host: existing?.host ?? "",
      port: String(existing?.port ?? 22),
      username: existing?.username ?? "",
      timeoutMs: String(existing?.timeoutMs ?? 15_000),
      password: ""
    };
  }

  onOpen(): void {
    this.values.password = "";
    this.titleEl.setText(this.existing ? "编辑 SSH 连接" : "新增 SSH 连接");
    this.contentEl.empty();

    addTextSetting(this.contentEl, "id", "Profile ID", "例如 production-server；保存后不可修改", this.values.id, (value) => this.values.id = value, Boolean(this.existing));
    addTextSetting(this.contentEl, "name", "显示名称", "用于设置页展示", this.values.name, (value) => this.values.name = value);
    addTextSetting(this.contentEl, "host", "主机", "主机名或 IP 地址", this.values.host, (value) => this.values.host = value);
    addTextSetting(this.contentEl, "port", "端口", "默认 22", this.values.port, (value) => this.values.port = value);
    addTextSetting(this.contentEl, "username", "用户名", "SSH 登录用户名", this.values.username, (value) => this.values.username = value);
    addTextSetting(this.contentEl, "timeoutMs", "超时（毫秒）", "1000 到 120000", this.values.timeoutMs, (value) => this.values.timeoutMs = value);
    addTextSetting(this.contentEl, "password", "密码", this.existing ? "留空表示保留已保存密码" : "保存到系统钥匙串", "", (value) => this.values.password = value, false, true);

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("保存").setCta().onClick(() => this.save()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    try {
      await this.actions.save({
        id: this.values.id.trim(),
        name: this.values.name.trim(),
        host: this.values.host.trim(),
        port: Number(this.values.port),
        username: this.values.username.trim(),
        timeoutMs: Number(this.values.timeoutMs)
      }, this.values.password);
      new Notice("SSH 配置已保存");
      this.close();
      this.actions.onChanged();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "SSH 配置保存失败");
    }
  }
}

function addTextSetting(
  container: HTMLElement,
  field: keyof ProfileFormValues,
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
      text.inputEl.dataset.profileField = field;
      text.inputEl.disabled = disabled;
      if (password) text.inputEl.type = "password";
    });
}
