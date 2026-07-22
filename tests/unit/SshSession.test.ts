import { describe, expect, it, vi } from "vitest";
import type { HostKeyDecision } from "../../src/profile/HostKeyStore";
import {
  SshSession,
  type SshSessionDependencies
} from "../../src/ssh/SshSession";
import type {
  SshClientAdapter,
  SshConnectOptions,
  SshShellStream
} from "../../src/ssh/SshClientAdapter";
import type { SshConnectionTarget } from "../../src/ssh/SshConnectionTarget";

class FakeStream implements SshShellStream {
  writes: string[] = [];
  windows: Array<[number, number, number, number]> = [];
  closeCalls = 0;
  private dataHandlers = new Set<(data: string) => void>();
  private closeHandlers = new Set<(error?: Error) => void>();

  write(data: string): void { this.writes.push(data); }
  setWindow(rows: number, cols: number, height: number, width: number): void {
    this.windows.push([rows, cols, height, width]);
  }
  onData(handler: (data: string) => void) {
    this.dataHandlers.add(handler);
    return { dispose: () => this.dataHandlers.delete(handler) };
  }
  onClose(handler: (error?: Error) => void) {
    this.closeHandlers.add(handler);
    return { dispose: () => this.closeHandlers.delete(handler) };
  }
  close(): void { this.closeCalls += 1; }
  emitData(data: string): void { this.dataHandlers.forEach((handler) => handler(data)); }
  emitClose(error?: Error): void { this.closeHandlers.forEach((handler) => handler(error)); }
}

class FakeClient implements SshClientAdapter {
  closeCalls = 0;
  connectCalls = 0;
  readonly stream = new FakeStream();
  decision: HostKeyDecision = { kind: "trusted" };
  connectError?: Error;
  options?: SshConnectOptions;

  async connect(options: SshConnectOptions): Promise<void> {
    this.connectCalls += 1;
    this.options = options;
    await options.verifyHostKey("ssh-ed25519", "SHA256:test");
    if (this.connectError) throw this.connectError;
  }
  async openShell(): Promise<SshShellStream> { return this.stream; }
  close(): void { this.closeCalls += 1; }
}

function createSession(overrides: Partial<SshSessionDependencies> = {}) {
  const client = new FakeClient();
  const target: SshConnectionTarget = {
    displayName: "Prod",
    host: "localhost",
    port: 22,
    username: "ops",
    timeoutMs: 15_000,
    hostKeyId: "prod",
    getPassword: vi.fn(async () => "secret")
  };
  let decision: HostKeyDecision = { kind: "trusted" };
  const hostKeys = {
    check: vi.fn(() => decision),
    trust: vi.fn(async () => undefined)
  };
  const dependencies: SshSessionDependencies = {
    target,
    hostKeys,
    clientFactory: () => client,
    confirmHostKey: async () => true,
    ...overrides
  };
  return {
    session: new SshSession(dependencies),
    client,
    hostKeys,
    setDecision: (next: HostKeyDecision) => { decision = next; }
  };
}

describe("SshSession", () => {
  it("does not connect until connect is called", () => {
    const { session, client } = createSession();
    expect(session.state).toBe("idle");
    expect(client.connectCalls).toBe(0);
  });

  it("streams PTY data in both directions", async () => {
    const { session, client } = createSession();
    const output: string[] = [];
    session.onData((chunk) => output.push(chunk));

    await session.connect();
    client.stream.emitData("ready\r\n");
    session.write("whoami\r");

    expect(output).toEqual(["ready\r\n"]);
    expect(client.stream.writes).toEqual(["whoami\r"]);
    expect(client.options).toMatchObject({
      host: "localhost",
      port: 22,
      username: "ops",
      password: "secret",
      timeoutMs: 15_000
    });
    expect(session.state).toBe("connected");
  });

  it("trusts a first-seen host key only after confirmation", async () => {
    const confirmHostKey = vi.fn(async () => true);
    const created = createSession({ confirmHostKey });
    created.setDecision({ kind: "unknown" });

    await created.session.connect();

    expect(confirmHostKey).toHaveBeenCalledWith({
      profileId: "prod",
      host: "localhost",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:test"
    });
    expect(created.hostKeys.trust).toHaveBeenCalledWith("prod", "ssh-ed25519", "SHA256:test");
  });

  it("blocks a mismatched host key before opening a shell", async () => {
    const created = createSession();
    created.setDecision({ kind: "mismatch", expected: "SHA256:old", received: "SHA256:test" });

    await expect(created.session.connect()).rejects.toMatchObject({ code: "HOST_KEY_MISMATCH" });
    expect(created.session.state).toBe("failed");
  });

  it("forwards terminal resize", async () => {
    const { session, client } = createSession();
    await session.connect();
    session.resize(30, 100, 600, 900);
    expect(client.stream.windows).toEqual([[30, 100, 600, 900]]);
  });

  it("closes idempotently", async () => {
    const { session, client } = createSession();
    await session.connect();
    await Promise.all([session.close(), session.close()]);
    expect(client.closeCalls).toBe(1);
    expect(client.stream.closeCalls).toBe(1);
    expect(session.state).toBe("closed");
  });

  it("reports a missing credential without contacting the server", async () => {
    const { session, client } = createSession({
      target: {
        displayName: "Missing",
        host: "localhost",
        port: 22,
        username: "ops",
        timeoutMs: 15_000,
        hostKeyId: "missing",
        getPassword: async () => null
      }
    });
    await expect(session.connect()).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });
    expect(client.connectCalls).toBe(0);
  });

  it("never includes an inline password in mapped errors", async () => {
    const password = "never-leak-me";
    const created = createSession({
      target: {
        displayName: "Inline",
        host: "localhost",
        port: 22,
        username: "ops",
        timeoutMs: 15_000,
        hostKeyId: "inline:v1:localhost:22",
        getPassword: async () => password
      }
    });
    created.client.connectError = Object.assign(new Error(password), {
      level: "client-authentication"
    });

    await expect(created.session.connect()).rejects.toMatchObject({
      code: "AUTH_FAILED",
      message: expect.not.stringContaining(password)
    });
  });
});
