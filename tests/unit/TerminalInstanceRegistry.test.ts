// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { SshConnectionTarget } from "../../src/ssh/SshConnectionTarget";
import type { TerminalViewOptions } from "../../src/ui/TerminalView";
import {
  TerminalInstanceRegistry,
  type MovableTerminalView,
  type TerminalHostRegistration
} from "../../src/terminal/TerminalInstanceRegistry";
import type { TerminalOrigin } from "../../src/terminal/TerminalOrigin";

const origin: TerminalOrigin = {
  sourcePath: "ops/server.md",
  blockKey: "profile:production:0"
};

const target: SshConnectionTarget = {
  displayName: "Production",
  host: "server.example.com",
  port: 22,
  username: "root",
  timeoutMs: 15_000,
  hostKeyId: "production",
  getPassword: async () => "secret-password"
};

class FakeSession {
  private readonly stateHandlers = new Set<(state: string) => void>();
  onData = vi.fn(() => ({ dispose: vi.fn() }));
  onStateChange = vi.fn((handler: (state: string) => void) => {
    this.stateHandlers.add(handler);
    return { dispose: () => this.stateHandlers.delete(handler) };
  });

  emitState(state: string): void {
    for (const handler of this.stateHandlers) handler(state);
  }
}

class FakeTerminal implements MovableTerminalView {
  readonly attach = vi.fn((container: HTMLElement) => { this.container = container; });
  readonly detach = vi.fn(() => { this.container = undefined; });
  readonly focus = vi.fn();
  readonly clear = vi.fn();
  readonly dispose = vi.fn(async () => undefined);
  container: HTMLElement | undefined;

  constructor(private readonly options: TerminalViewOptions) {}

  async connect(): Promise<void> {
    await this.options.manager.connect(
      this.options.instanceId,
      this.options.createTarget()
    );
  }
}

function host(
  id: string,
  kind: TerminalHostRegistration["kind"]
): TerminalHostRegistration {
  return { id, kind, container: document.createElement("div") };
}

function makeRegistry() {
  const sessions: FakeSession[] = [];
  const sessionManager = {
    connect: vi.fn(async () => {
      const session = new FakeSession();
      sessions.push(session);
      return session;
    }),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(async () => {
      sessions.at(-1)?.emitState("closed");
    }),
    closeAll: vi.fn(async () => undefined)
  };
  const terminals: FakeTerminal[] = [];
  let now = 100;
  const registry = new TerminalInstanceRegistry({
    sessionManager,
    terminalFactory: (_container, options) => {
      const terminal = new FakeTerminal(options);
      terminals.push(terminal);
      return terminal;
    },
    now: () => now++
  });
  const prepare = (nextOrigin = origin) => registry.prepare({
    origin: nextOrigin,
    createTarget: () => target,
    height: 360
  });
  return { registry, sessionManager, sessions, terminals, prepare };
}

describe("TerminalInstanceRegistry", () => {
  it("publishes an instance only after connection starts", async () => {
    const { registry, prepare } = makeRegistry();
    const prepared = prepare();

    expect(registry.list()).toEqual([]);
    await prepared.connect();

    expect(registry.list()).toMatchObject([{
      id: prepared.instanceId,
      displayName: "Production",
      origin,
      sourceAvailable: true,
      status: "connected",
      location: { kind: "background" }
    }]);
  });

  it("deduplicates prepared instances by origin", () => {
    const { registry, prepare, terminals } = makeRegistry();
    const first = prepare();
    const second = prepare({ ...origin });

    expect(second.instanceId).toBe(first.instanceId);
    expect(terminals).toHaveLength(1);
    expect(registry.findByOrigin(origin)).toBeUndefined();
  });

  it("moves one terminal between document and terminal-tab hosts", async () => {
    const { registry, prepare, terminals } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();
    const documentHost = host("document:one", "document");
    const tabHost = host("terminal-tab:one", "terminal-tab");

    const documentRegistration = registry.registerHost(prepared.instanceId, documentHost);
    registry.activate(prepared.instanceId, documentHost.id);
    registry.registerHost(prepared.instanceId, tabHost);
    registry.activate(prepared.instanceId, tabHost.id);

    expect(terminals[0]!.attach).toHaveBeenLastCalledWith(tabHost.container);
    expect(registry.get(prepared.instanceId)?.location).toEqual({
      kind: "terminal-tab",
      hostId: tabHost.id
    });

    documentRegistration.dispose();
  });

  it("moves an instance to the background when its active host is removed", async () => {
    const { registry, prepare, terminals } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();
    const documentHost = host("document:one", "document");
    const registration = registry.registerHost(prepared.instanceId, documentHost);
    registry.activate(prepared.instanceId, documentHost.id);
    const detachCallsBeforeDispose = terminals[0]!.detach.mock.calls.length;

    registration.dispose();

    expect(terminals[0]!.detach).toHaveBeenCalledTimes(detachCallsBeforeDispose + 1);
    expect(registry.get(prepared.instanceId)?.location).toEqual({ kind: "background" });
  });

  it("fulfills pending source activation when the document host registers", async () => {
    const { registry, prepare, terminals } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();
    registry.requestSourceActivation(prepared.instanceId);
    const documentHost = host("document:source", "document");

    registry.registerHost(prepared.instanceId, documentHost);

    expect(terminals[0]!.attach).toHaveBeenLastCalledWith(documentHost.container);
    expect(registry.get(prepared.instanceId)?.location.kind).toBe("document");
  });

  it("keeps a disconnected record and reuses its terminal when reconnecting", async () => {
    const { registry, prepare, terminals, sessionManager } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();

    await registry.disconnect(prepared.instanceId);
    expect(registry.get(prepared.instanceId)?.status).toBe("disconnected");
    expect(registry.list()).toHaveLength(1);

    await registry.reconnect(prepared.instanceId);
    expect(registry.get(prepared.instanceId)?.status).toBe("connected");
    expect(sessionManager.connect).toHaveBeenCalledTimes(2);
    expect(terminals).toHaveLength(1);
  });

  it("updates the instance when the remote session closes", async () => {
    const { registry, prepare, sessions } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();

    sessions[0]!.emitState("closed");

    expect(registry.get(prepared.instanceId)?.status).toBe("disconnected");
  });

  it("rejects removing an active instance and removes a disconnected one", async () => {
    const { registry, prepare, terminals } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();

    expect(() => registry.remove(prepared.instanceId)).toThrow(
      "Disconnect the SSH session before removing it."
    );

    await registry.disconnect(prepared.instanceId);
    registry.remove(prepared.instanceId);
    expect(registry.get(prepared.instanceId)).toBeUndefined();
    expect(terminals[0]!.dispose).toHaveBeenCalledOnce();
  });

  it("updates and invalidates source paths without closing the session", async () => {
    const { registry, prepare, sessionManager } = makeRegistry();
    const prepared = prepare();
    await prepared.connect();

    registry.renameSource("ops/server.md", "ops/renamed.md");
    expect(registry.get(prepared.instanceId)?.origin.sourcePath).toBe("ops/renamed.md");

    registry.markSourceUnavailable("ops/renamed.md");
    expect(registry.get(prepared.instanceId)?.sourceAvailable).toBe(false);
    expect(sessionManager.close).not.toHaveBeenCalled();
  });

  it("does not expose passwords or terminal contents in snapshots", async () => {
    const { registry, prepare } = makeRegistry();
    await prepare().connect();

    const serialized = JSON.stringify(registry.list());
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("terminal output");
  });

  it("closes and disposes every instance on shutdown", async () => {
    const { registry, prepare, terminals, sessionManager } = makeRegistry();
    await prepare().connect();
    await prepare({
      sourcePath: "ops/other.md",
      blockKey: "profile:other:0"
    }).connect();

    await registry.closeAll();

    expect(sessionManager.close).toHaveBeenCalledTimes(2);
    expect(terminals.every((terminal) => terminal.dispose.mock.calls.length === 1)).toBe(true);
    expect(registry.list()).toEqual([]);
  });
});
