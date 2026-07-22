import { describe, expect, it, vi } from "vitest";
import { resolveSshConnectionTarget } from "../../src/block/resolveSshConnectionTarget";
import { HostKeyStore } from "../../src/profile/HostKeyStore";
import { PluginDataRepository } from "../../src/profile/ProfileStore";

const fingerprint = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const changed = "SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

async function createStore() {
  const repository = await PluginDataRepository.load({
    load: async () => null,
    save: async () => undefined
  });
  return new HostKeyStore(repository);
}

describe("HostKeyStore", () => {
  it("requires confirmation for a first-seen host key", async () => {
    const store = await createStore();
    expect(store.check("prod", "ssh-ed25519", fingerprint)).toEqual({ kind: "unknown" });
  });

  it("recognizes a trusted host key", async () => {
    const store = await createStore();
    await store.trust("prod", "ssh-ed25519", fingerprint);
    expect(store.check("prod", "ssh-ed25519", fingerprint)).toEqual({ kind: "trusted" });
  });

  it("blocks a changed host key", async () => {
    const store = await createStore();
    await store.trust("prod", "ssh-ed25519", fingerprint);
    expect(store.check("prod", "ssh-ed25519", changed)).toEqual({
      kind: "mismatch",
      expected: fingerprint,
      received: changed
    });
  });

  it("lists only valid inline endpoint trust records", async () => {
    const store = await createStore();
    await store.trust("prod", "ssh-ed25519", fingerprint);
    await store.trust("inline:v1:server.example.com:2222", "ssh-ed25519", fingerprint);
    await store.trust("inline:v1:broken:not-a-port", "ssh-ed25519", changed);

    expect(store.listInline()).toEqual([{
      id: "inline:v1:server.example.com:2222",
      host: "server.example.com",
      port: 2222,
      algorithm: "ssh-ed25519",
      fingerprint
    }]);
    expect(JSON.stringify(store.listInline())).not.toContain("password");
  });

  it("forgets only the selected inline endpoint", async () => {
    const store = await createStore();
    const first = "inline:v1:first.example.com:22";
    const second = "inline:v1:second.example.com:22";
    await store.trust(first, "ssh-ed25519", fingerprint);
    await store.trust(second, "ssh-ed25519", changed);

    await store.forget(first);

    expect(store.listInline()).toEqual([expect.objectContaining({ id: second })]);
    expect(store.check(first, "ssh-ed25519", fingerprint)).toEqual({ kind: "unknown" });
  });

  it("never persists an inline block password with host trust", async () => {
    const saved: unknown[] = [];
    const repository = await PluginDataRepository.load({
      load: async () => null,
      save: async (data) => { saved.push(structuredClone(data)); }
    });
    const store = new HostKeyStore(repository);
    const password = "never-leak-me";
    const credentials = {
      isAvailable: vi.fn(async () => false),
      getPassword: vi.fn(async () => null),
      setPassword: vi.fn(async () => undefined),
      deletePassword: vi.fn(async () => undefined)
    };
    const target = resolveSshConnectionTarget({
      mode: "inline",
      host: "server.example.com",
      port: 22,
      username: "ops",
      password,
      height: 360,
      timeoutMs: 15_000
    }, { profiles: { get: () => undefined }, credentials });

    await store.trust(target.hostKeyId, "ssh-ed25519", fingerprint);

    expect(JSON.stringify(saved)).not.toContain(password);
    expect(credentials.setPassword).not.toHaveBeenCalled();
  });
});
