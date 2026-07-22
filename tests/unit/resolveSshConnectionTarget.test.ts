import { describe, expect, it, vi } from "vitest";
import { resolveSshConnectionTarget } from "../../src/block/resolveSshConnectionTarget";
import type { CredentialStore } from "../../src/profile/CredentialStore";
import {
  createInlineHostKeyId,
  parseInlineHostKeyId
} from "../../src/ssh/SshConnectionTarget";

function createCredentials(): CredentialStore {
  return {
    isAvailable: vi.fn(async () => false),
    getPassword: vi.fn(async () => "stored-secret"),
    setPassword: vi.fn(async () => undefined),
    deletePassword: vi.fn(async () => undefined)
  };
}

describe("resolveSshConnectionTarget", () => {
  it("resolves inline config without touching the credential store", async () => {
    const credentials = createCredentials();
    const target = resolveSshConnectionTarget({
      mode: "inline",
      host: "Host.Example.COM",
      port: 2222,
      username: "root",
      password: "never-leak-me",
      height: 360,
      timeoutMs: 15_000
    }, {
      profiles: { get: () => undefined },
      credentials
    });

    expect(target).toMatchObject({
      displayName: "root@Host.Example.COM:2222",
      host: "Host.Example.COM",
      port: 2222,
      username: "root",
      timeoutMs: 15_000,
      hostKeyId: "inline:v1:host.example.com:2222"
    });
    expect(await target.getPassword()).toBe("never-leak-me");
    expect(credentials.isAvailable).not.toHaveBeenCalled();
    expect(credentials.getPassword).not.toHaveBeenCalled();
    expect(credentials.setPassword).not.toHaveBeenCalled();
  });

  it("resolves profile config through the credential store", async () => {
    const credentials = createCredentials();
    const profile = {
      id: "prod",
      name: "Production",
      host: "prod.example.com",
      port: 22,
      username: "ops",
      timeoutMs: 20_000
    };
    const target = resolveSshConnectionTarget({
      mode: "profile",
      profileId: "prod",
      height: 360
    }, {
      profiles: { get: (id) => id === "prod" ? profile : undefined },
      credentials
    });

    expect(target).toMatchObject({
      displayName: "Production",
      hostKeyId: "prod",
      host: "prod.example.com",
      username: "ops"
    });
    expect(await target.getPassword()).toBe("stored-secret");
    expect(credentials.getPassword).toHaveBeenCalledWith("prod");
  });

  it("rejects a missing profile", () => {
    expect(() => resolveSshConnectionTarget({
      mode: "profile",
      profileId: "missing",
      height: 360
    }, {
      profiles: { get: () => undefined },
      credentials: createCredentials()
    })).toThrowError(expect.objectContaining({ code: "PROFILE_NOT_FOUND" }));
  });
});

describe("inline host key ids", () => {
  it.each([
    ["[::1]", 22, "inline:v1:%3A%3A1:22", { host: "::1", port: 22 }],
    ["SERVER.EXAMPLE.COM", 2200, "inline:v1:server.example.com:2200", { host: "server.example.com", port: 2200 }]
  ])("normalizes %s", (host, port, expected, parsed) => {
    expect(createInlineHostKeyId(host, port)).toBe(expected);
    expect(parseInlineHostKeyId(expected)).toEqual(parsed);
  });

  it("rejects malformed inline ids", () => {
    expect(parseInlineHostKeyId("prod")).toBeNull();
    expect(parseInlineHostKeyId("inline:v1:server:not-a-port")).toBeNull();
    expect(parseInlineHostKeyId("inline:v1:%ZZ:22")).toBeNull();
  });
});
