import { describe, expect, it } from "vitest";
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
});
