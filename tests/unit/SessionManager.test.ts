import { describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/ssh/SessionManager";

function createManager() {
  const profile = { id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 };
  const profileStore = { get: vi.fn((id: string) => id === "prod" ? profile : undefined) };
  const session = {
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onStateChange: vi.fn(() => ({ dispose: vi.fn() }))
  };
  const sessionFactory = vi.fn(() => session);
  return { manager: new SessionManager(profileStore, sessionFactory), sessionFactory, session };
}

describe("SessionManager", () => {
  it("deduplicates concurrent connect calls for one rendered block", async () => {
    const { manager, sessionFactory, session } = createManager();
    await Promise.all([
      manager.connect("block-1", "prod"),
      manager.connect("block-1", "prod")
    ]);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(session.connect).toHaveBeenCalledTimes(1);
  });

  it("keeps separate sessions for separate rendered blocks", async () => {
    const { manager, sessionFactory } = createManager();
    await manager.connect("block-1", "prod");
    await manager.connect("block-2", "prod");
    expect(sessionFactory).toHaveBeenCalledTimes(2);
  });

  it("removes ownership before closing so cleanup is idempotent", async () => {
    const { manager, session } = createManager();
    await manager.connect("block-1", "prod");
    await Promise.all([manager.close("block-1"), manager.close("block-1")]);
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});
