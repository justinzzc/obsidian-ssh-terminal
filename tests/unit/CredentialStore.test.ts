import { describe, expect, it, vi } from "vitest";
import { KeytarCredentialStore } from "../../src/profile/CredentialStore";

describe("KeytarCredentialStore", () => {
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
