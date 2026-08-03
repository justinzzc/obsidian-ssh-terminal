import { PluginError, type PersistedPluginData } from "../model";

/** Password storage abstraction. Implementations must never store plaintext in plugin data. */
export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  getPassword(profileId: string): Promise<string | null>;
  setPassword(profileId: string, password: string): Promise<void>;
  deletePassword(profileId: string): Promise<void>;
}

export interface SafeStorageApi {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface CredentialDataRepository {
  snapshot(): PersistedPluginData;
  update(mutator: (data: PersistedPluginData) => void): Promise<void>;
}

export class SafeStorageCredentialStore implements CredentialStore {
  constructor(
    private readonly repository: CredentialDataRepository,
    private readonly safeStorage: SafeStorageApi
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.safeStorage.isEncryptionAvailable();
  }

  async getPassword(profileId: string): Promise<string | null> {
    const encrypted = this.repository.snapshot().encryptedCredentials?.[profileId];
    if (!encrypted) return null;
    return this.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  }

  async setPassword(profileId: string, password: string): Promise<void> {
    this.requireEncryption();
    const encrypted = this.safeStorage.encryptString(password).toString("base64");
    await this.repository.update((data) => {
      data.encryptedCredentials ??= {};
      data.encryptedCredentials[profileId] = encrypted;
    });
  }

  async deletePassword(profileId: string): Promise<void> {
    await this.repository.update((data) => {
      if (!data.encryptedCredentials) return;
      delete data.encryptedCredentials[profileId];
      if (Object.keys(data.encryptedCredentials).length === 0) delete data.encryptedCredentials;
    });
  }

  private requireEncryption(): void {
    if (this.safeStorage.isEncryptionAvailable()) return;
    throw new PluginError(
      "CREDENTIAL_STORE_UNAVAILABLE",
      "The operating system credential store is unavailable."
    );
  }
}
