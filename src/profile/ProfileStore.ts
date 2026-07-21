import {
  PluginError,
  type PersistedPluginData,
  type SshProfile
} from "../model";

const EMPTY_DATA: PersistedPluginData = {
  schemaVersion: 1,
  profiles: [],
  hostKeys: {}
};

export interface PluginDataPersistence {
  load(): Promise<unknown>;
  save(data: PersistedPluginData): Promise<void>;
}

export class PluginDataRepository {
  private constructor(
    private readonly persistence: PluginDataPersistence,
    private data: PersistedPluginData
  ) {}

  static async load(persistence: PluginDataPersistence): Promise<PluginDataRepository> {
    const loaded = await persistence.load();
    return new PluginDataRepository(persistence, isPluginData(loaded) ? loaded : structuredClone(EMPTY_DATA));
  }

  snapshot(): PersistedPluginData {
    return structuredClone(this.data);
  }

  async update(mutator: (data: PersistedPluginData) => void): Promise<void> {
    const next = structuredClone(this.data);
    mutator(next);
    await this.persistence.save(next);
    this.data = next;
  }
}

interface CredentialDeletion {
  deletePassword(profileId: string): Promise<void>;
}

interface HostKeyDeletion {
  forget(profileId: string): Promise<void>;
}

export class ProfileStore {
  constructor(private readonly repository: PluginDataRepository) {}

  list(): SshProfile[] {
    return this.repository.snapshot().profiles;
  }

  get(profileId: string): SshProfile | undefined {
    return this.list().find((profile) => profile.id === profileId);
  }

  async save(profile: SshProfile): Promise<void> {
    validateProfile(profile);
    await this.repository.update((data) => {
      const index = data.profiles.findIndex((candidate) => candidate.id === profile.id);
      if (index === -1) {
        data.profiles.push(structuredClone(profile));
      } else {
        data.profiles[index] = structuredClone(profile);
      }
    });
  }

  async delete(
    profileId: string,
    credentials: CredentialDeletion,
    hostKeys: HostKeyDeletion
  ): Promise<void> {
    if (!this.get(profileId)) {
      throw new PluginError("PROFILE_NOT_FOUND", `SSH profile not found: ${profileId}`);
    }

    await credentials.deletePassword(profileId);
    await hostKeys.forget(profileId);
    await this.repository.update((data) => {
      data.profiles = data.profiles.filter((profile) => profile.id !== profileId);
    });
  }
}

function validateProfile(profile: SshProfile): void {
  const valid =
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(profile.id) &&
    profile.name.trim() !== "" &&
    profile.host.trim() !== "" &&
    profile.username.trim() !== "" &&
    Number.isInteger(profile.port) &&
    profile.port >= 1 &&
    profile.port <= 65_535 &&
    Number.isInteger(profile.timeoutMs) &&
    profile.timeoutMs >= 1_000 &&
    profile.timeoutMs <= 120_000;

  if (!valid) {
    throw new PluginError("PROFILE_INVALID", "SSH profile contains invalid fields.");
  }
}

function isPluginData(value: unknown): value is PersistedPluginData {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedPluginData>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.profiles) && isHostKeyRecord(candidate.hostKeys);
}

function isHostKeyRecord(value: unknown): value is Record<string, { algorithm: string; fingerprint: string }> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
