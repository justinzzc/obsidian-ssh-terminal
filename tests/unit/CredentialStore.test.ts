import { describe, expect, it, vi } from "vitest";
import { SafeStorageCredentialStore } from "../../src/profile/CredentialStore";
import {
  PluginDataRepository,
  type PluginDataPersistence
} from "../../src/profile/ProfileStore";

function createPersistence(): PluginDataPersistence & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    load: vi.fn(async () => null),
    save: vi.fn(async (data) => {
      saved.push(structuredClone(data));
    })
  };
}

describe("SafeStorageCredentialStore", () => {
  it("stores only encrypted password blobs in plugin data", async () => {
    const persistence = createPersistence();
    const repository = await PluginDataRepository.load(persistence);
    const safeStorage = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`, "utf8")),
      decryptString: vi.fn((value: Buffer) => value.toString("utf8").replace("encrypted:", ""))
    };
    const store = new SafeStorageCredentialStore(repository, safeStorage);

    await store.setPassword("prod", "secret");

    expect(await store.getPassword("prod")).toBe("secret");
    expect(JSON.stringify(persistence.saved)).not.toContain("secret");
    expect(JSON.stringify(persistence.saved)).toContain(Buffer.from("encrypted:secret").toString("base64"));
  });

  it("deletes encrypted password blobs from plugin data", async () => {
    const persistence = createPersistence();
    const repository = await PluginDataRepository.load(persistence);
    const store = new SafeStorageCredentialStore(repository, {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value, "utf8"),
      decryptString: (value) => value.toString("utf8")
    });

    await store.setPassword("prod", "secret");
    await store.deletePassword("prod");

    expect(await store.getPassword("prod")).toBeNull();
    expect(JSON.stringify(repository.snapshot())).not.toContain("prod");
  });

  it("fails securely when Electron safeStorage encryption is unavailable", async () => {
    const repository = await PluginDataRepository.load(createPersistence());
    const store = new SafeStorageCredentialStore(repository, {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from("unused"),
      decryptString: () => "unused"
    });

    expect(await store.isAvailable()).toBe(false);
    await expect(store.setPassword("prod", "secret")).rejects.toMatchObject({
      code: "CREDENTIAL_STORE_UNAVAILABLE"
    });
  });
});
