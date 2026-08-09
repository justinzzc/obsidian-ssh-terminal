// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mountTerminalBlock } from "../../src/render/TerminalBlockMount";
import {
  TerminalInstanceRegistry,
  type TerminalInstanceSnapshot
} from "../../src/terminal/TerminalInstanceRegistry";

const connectedInTab: TerminalInstanceSnapshot = {
  id: "ssh-terminal-1",
  displayName: "Production",
  origin: { sourcePath: "note.md", blockKey: "profile:prod:0" },
  sourceAvailable: true,
  status: "connected",
  location: { kind: "terminal-tab", hostId: "terminal-tab:one" },
  lastActiveAt: 1
};

function dependencies(snapshot?: TerminalInstanceSnapshot) {
  const hostDisposable = { dispose: vi.fn() };
  const preparedDisposable = vi.fn();
  const preparedAttach = vi.fn(() => hostDisposable);
  const registry = {
    findByOrigin: vi.fn(() => snapshot),
    prepare: vi.fn(() => ({
      instanceId: "ssh-terminal-1",
      attach: preparedAttach,
      connect: vi.fn(),
      disposeIfUnused: preparedDisposable
    })),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    registerHost: vi.fn(() => hostDisposable),
    activate: vi.fn(),
    reconnect: vi.fn(),
    remove: vi.fn()
  };
  return {
    sourcePath: "note.md",
    source: "profile: prod",
    occurrence: 0,
    profiles: {
      get: () => ({
        id: "prod",
        name: "Production",
        host: "server.example.com",
        port: 22,
        username: "root",
        timeoutMs: 15_000
      })
    },
    credentials: {} as never,
    registry: registry as never,
    registryMock: registry,
    openTerminal: vi.fn(async () => undefined),
    hostDisposable,
    preparedDisposable,
    preparedAttach
  };
}

describe("mountTerminalBlock", () => {
  it("renders missing-profile guidance without throwing during preparation", () => {
    const container = document.createElement("div");
    const registry = new TerminalInstanceRegistry({
      sessionManager: {} as never,
      terminalFactory: vi.fn(() => {
        throw new Error("terminal factory must not run for a missing profile");
      })
    });

    expect(() => mountTerminalBlock(container, {
      sourcePath: "note.md",
      source: "profile: missing",
      occurrence: 0,
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry,
      openTerminal: vi.fn(async () => undefined)
    })).not.toThrow();

    expect(container.querySelector(".ssh-error-notice__title")?.textContent)
      .toBe("Unable to start SSH terminal");
    expect(container.querySelector(".ssh-error-notice__reason")?.textContent)
      .toBe("SSH profile not found: missing");
    expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toContain("SSH Terminal settings");
  });

  it("attaches a prepared terminal before an instance has started", () => {
    const container = document.createElement("div");
    const deps = dependencies();
    const mount = mountTerminalBlock(container, deps);

    expect(deps.preparedAttach).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-action="activate"]')).toBeNull();

    mount.dispose();
    expect(deps.hostDisposable.dispose).toHaveBeenCalledOnce();
    expect(deps.preparedDisposable).toHaveBeenCalledOnce();
  });

  it("shows and performs activation for an instance in another host", () => {
    const container = document.createElement("div");
    const deps = dependencies(connectedInTab);
    const mount = mountTerminalBlock(container, deps);

    expect(container.textContent).toContain("Connected");
    container.querySelector<HTMLButtonElement>('[data-action="activate"]')!.click();

    expect(deps.registryMock.registerHost).toHaveBeenCalledOnce();
    expect(deps.registryMock.activate).toHaveBeenCalledWith(
      connectedInTab.id,
      expect.stringContaining("document:")
    );
    mount.dispose();
  });

  it("opens the independent terminal without disconnecting the session", async () => {
    const container = document.createElement("div");
    const deps = dependencies(connectedInTab);
    const mount = mountTerminalBlock(container, deps);

    container.querySelector<HTMLButtonElement>('[data-action="open-terminal"]')!.click();
    await Promise.resolve();

    expect(deps.openTerminal).toHaveBeenCalledWith(connectedInTab.id);
    expect("disconnect" in deps.registryMock).toBe(false);
    mount.dispose();
  });
});
