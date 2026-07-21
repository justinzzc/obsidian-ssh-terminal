import { describe, expect, it, vi } from "vitest";
import {
  KeytarCredentialStore,
  loadKeytarWithRequire
} from "../../src/profile/CredentialStore";

describe("KeytarCredentialStore", () => {
  it("loads the native module through CommonJS require for Obsidian", () => {
    const api = {
      getPassword: vi.fn(async () => null),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => true)
    };
    const requireModule = vi.fn(() => api);

    expect(loadKeytarWithRequire(requireModule)).toBe(api);
    expect(requireModule).toHaveBeenCalledWith("keytar");
  });

  it("uses a fixed service name and the profile id as account", async () => {
    const api = {
      getPassword: vi.fn(async () => "secret"),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => true)
    };
    const store = new KeytarCredentialStore(async () => api);

    await store.setPassword("prod", "secret");
    expect(await store.getPassword("prod")).toBe("secret");
    await store.deletePassword("prod");

    expect(api.setPassword).toHaveBeenCalledWith("obsidian-ssh-terminal", "prod", "secret");
    expect(api.getPassword).toHaveBeenCalledWith("obsidian-ssh-terminal", "prod");
    expect(api.deletePassword).toHaveBeenCalledWith("obsidian-ssh-terminal", "prod");
  });

  it("fails securely when keytar cannot load", async () => {
    const store = new KeytarCredentialStore(async () => {
      throw new Error("native module unavailable");
    });

    expect(await store.isAvailable()).toBe(false);
    await expect(store.setPassword("prod", "secret")).rejects.toMatchObject({
      code: "CREDENTIAL_STORE_UNAVAILABLE"
    });
  });
});
