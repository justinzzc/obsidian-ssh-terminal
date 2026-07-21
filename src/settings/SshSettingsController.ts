import { PluginError, type SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { HostKeyStore } from "../profile/HostKeyStore";
import type { ProfileStore } from "../profile/ProfileStore";

/** 设置界面的无 UI 业务层，确保密码与 profile 元数据始终走不同存储通道。 */
export class SshSettingsController {
  constructor(
    private readonly profiles: ProfileStore,
    private readonly credentials: CredentialStore,
    private readonly hostKeys: HostKeyStore
  ) {}

  async save(profile: SshProfile, password: string): Promise<void> {
    if (password !== "" && !(await this.credentials.isAvailable())) {
      throw new PluginError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "系统钥匙串不可用，无法安全保存密码。"
      );
    }
    await this.profiles.save(profile);
    if (password !== "") await this.credentials.setPassword(profile.id, password);
  }

  async delete(profileId: string): Promise<void> {
    await this.profiles.delete(profileId, this.credentials, this.hostKeys);
  }

  async forgetHostKey(profileId: string): Promise<void> {
    await this.hostKeys.forget(profileId);
  }
}
