import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/ssh/SessionManager";
import type { SshConnectionTarget } from "../../src/ssh/SshConnectionTarget";

function createManager() {
  const target: SshConnectionTarget = {
    displayName: "Prod",
    host: "host",
    port: 22,
    username: "ops",
    timeoutMs: 15_000,
    hostKeyId: "prod",
    getPassword: async () => "secret"
  };
  const session = {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onStateChange: vi.fn(() => ({ dispose: vi.fn() }))
  };
  const sessionFactory = vi.fn(() => session);
  return { manager: new SessionManager(sessionFactory), sessionFactory, session, target };
}

describe("SessionManager", () => {
  it("deduplicates concurrent connect calls for one rendered block", async () => {
    const { manager, sessionFactory, session, target } = createManager();
    await Promise.all([
      manager.connect("block-1", target),
      manager.connect("block-1", target)
    ]);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(sessionFactory).toHaveBeenCalledWith(target);
    expect(session.connect).toHaveBeenCalledTimes(1);
  });

  it("keeps separate sessions for separate rendered blocks", async () => {
    const { manager, sessionFactory, target } = createManager();
    await manager.connect("block-1", target);
    await manager.connect("block-2", target);
    expect(sessionFactory).toHaveBeenCalledTimes(2);
  });

  it("removes ownership before closing so cleanup is idempotent", async () => {
    const { manager, session, target } = createManager();
    await manager.connect("block-1", target);
    await Promise.all([manager.close("block-1"), manager.close("block-1")]);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it("resumes the existing session only for the same connection target", async () => {
    const { manager, sessionFactory, session, target } = createManager();
    await manager.connect("block-1", target);

    await expect(manager.resume("block-1", target)).resolves.toBe(session);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(session.close).not.toHaveBeenCalled();

    await expect(manager.resume("block-1", { ...target, host: "other-host" })).resolves.toBeUndefined();
    expect(session.close).toHaveBeenCalledOnce();
  });
});
