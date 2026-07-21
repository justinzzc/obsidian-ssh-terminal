import { PluginError } from "../model";

const SERVICE_NAME = "obsidian-ssh-terminal";

export interface CredentialStore {
  isAvailable(): Promise<boolean>;
  getPassword(profileId: string): Promise<string | null>;
  setPassword(profileId: string, password: string): Promise<void>;
  deletePassword(profileId: string): Promise<void>;
}

export interface KeytarApi {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export type KeytarLoader = () => Promise<KeytarApi>;

export class KeytarCredentialStore implements CredentialStore {
  private apiPromise?: Promise<KeytarApi | null>;

  constructor(private readonly loader: KeytarLoader = loadKeytar) {}

  async isAvailable(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async getPassword(profileId: string): Promise<string | null> {
    return (await this.requireApi()).getPassword(SERVICE_NAME, profileId);
  }

  async setPassword(profileId: string, password: string): Promise<void> {
    await (await this.requireApi()).setPassword(SERVICE_NAME, profileId, password);
  }

  async deletePassword(profileId: string): Promise<void> {
    await (await this.requireApi()).deletePassword(SERVICE_NAME, profileId);
  }

  private async load(): Promise<KeytarApi | null> {
    this.apiPromise ??= this.loader().catch(() => null);
    return this.apiPromise;
  }

  private async requireApi(): Promise<KeytarApi> {
    const api = await this.load();
    if (!api) {
      throw new PluginError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "The operating system credential store is unavailable."
      );
    }
    return api;
  }
}

async function loadKeytar(): Promise<KeytarApi> {
  const imported = await import("keytar");
  return ("default" in imported ? imported.default : imported) as KeytarApi;
}
