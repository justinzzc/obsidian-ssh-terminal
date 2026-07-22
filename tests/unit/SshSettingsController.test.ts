import { describe, expect, it, vi } from "vitest";
import { SshSettingsController } from "../../src/settings/SshSettingsController";

describe("SshSettingsController", () => {
  it("saves metadata separately from the password", async () => {
    const profiles = { save: vi.fn(async () => undefined) };
    const credentials = {
      isAvailable: vi.fn(async () => true),
      setPassword: vi.fn(async () => undefined)
    };
    const controller = new SshSettingsController(profiles as never, credentials as never, {} as never);
    const profile = { id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 };

    await controller.save(profile, "sensitive-value");

    expect(profiles.save).toHaveBeenCalledWith(profile);
    expect(JSON.stringify(profiles.save.mock.calls)).not.toContain("sensitive-value");
    expect(credentials.setPassword).toHaveBeenCalledWith("prod", "sensitive-value");
  });

  it("refuses password saving when the OS credential store is unavailable", async () => {
    const profiles = { save: vi.fn(async () => undefined) };
    const credentials = {
      isAvailable: vi.fn(async () => false),
      setPassword: vi.fn(async () => undefined)
    };
    const controller = new SshSettingsController(profiles as never, credentials as never, {} as never);

    await expect(controller.save(
      { id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 },
      "secret"
    )).rejects.toMatchObject({ code: "CREDENTIAL_STORE_UNAVAILABLE" });
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it("forgets inline host trust without touching credentials", async () => {
    const credentials = { deletePassword: vi.fn(async () => undefined) };
    const hostKeys = { forget: vi.fn(async () => undefined) };
    const controller = new SshSettingsController({} as never, credentials as never, hostKeys as never);

    await controller.forgetInlineHostKey("inline:v1:server.example.com:22");

    expect(hostKeys.forget).toHaveBeenCalledWith("inline:v1:server.example.com:22");
    expect(credentials.deletePassword).not.toHaveBeenCalled();
  });
});
