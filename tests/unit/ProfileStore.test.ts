import { describe, expect, it, vi } from "vitest";
import {
  PluginDataRepository,
  ProfileStore,
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

describe("ProfileStore", () => {
  it("persists only non-secret profile data", async () => {
    const persistence = createPersistence();
    const repository = await PluginDataRepository.load(persistence);
    const store = new ProfileStore(repository);

    await store.save({
      id: "prod",
      name: "Production",
      host: "10.0.0.8",
      port: 22,
      username: "ops",
      timeoutMs: 15_000
    });

    expect(store.get("prod")?.host).toBe("10.0.0.8");
    expect(JSON.stringify(persistence.saved)).not.toContain("password");
  });

  it.each(["UPPER", "-prod", "prod space", "a".repeat(65)])(
    "rejects invalid profile id %s",
    async (id) => {
      const repository = await PluginDataRepository.load(createPersistence());
      const store = new ProfileStore(repository);

      await expect(
        store.save({ id, name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 })
      ).rejects.toMatchObject({ code: "PROFILE_INVALID" });
    }
  );

  it("deletes profile metadata, credentials, and trusted host key", async () => {
    const repository = await PluginDataRepository.load(createPersistence());
    const store = new ProfileStore(repository);
    await store.save({ id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 });
    const credentials = { deletePassword: vi.fn(async () => undefined) };
    const hostKeys = { forget: vi.fn(async () => undefined) };

    await store.delete("prod", credentials, hostKeys);

    expect(store.get("prod")).toBeUndefined();
    expect(credentials.deletePassword).toHaveBeenCalledWith("prod");
    expect(hostKeys.forget).toHaveBeenCalledWith("prod");
  });
});
