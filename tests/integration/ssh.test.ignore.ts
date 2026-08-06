import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HostKeyDecision } from "../../src/profile/HostKeyStore";
import { Ssh2ClientAdapter } from "../../src/ssh/SshClientAdapter";
import { createInlineHostKeyId } from "../../src/ssh/SshConnectionTarget";
import { SshSession } from "../../src/ssh/SshSession";

const password = process.env.OBSIDIAN_SSH_TEST_PASSWORD;
if (!password) throw new Error("OBSIDIAN_SSH_TEST_PASSWORD is required for integration tests.");

const containerName = `obsidian-ssh-test-${process.pid}`;
let port = 0;

beforeAll(async () => {
  assertSafeContainerName(containerName);
  execFileSync("docker", [
    "run", "--rm", "-d", "-P",
    "--name", containerName,
    "-e", `TEST_PASSWORD=${password}`,
    "obsidian-ssh-test"
  ], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", containerName, "22/tcp"], { encoding: "utf8" }).trim();
  port = Number(mapping.match(/:(\d+)$/)?.[1]);
  if (!Number.isInteger(port)) throw new Error(`Cannot parse Docker SSH port: ${mapping}`);
  await waitForSshBanner(port);
}, 30_000);

afterAll(() => {
  assertSafeContainerName(containerName);
  try {
    execFileSync("docker", ["stop", containerName], { stdio: "pipe" });
  } catch {
    // 容器已经退出时无需再次清理。
  }
});

describe("production SSH adapter", () => {
  it("opens a verified PTY and exchanges terminal data", async () => {
    let trusted: { algorithm: string; fingerprint: string } | undefined;
    let checkedHostKeyId: string | undefined;
    const hostKeys = {
      check: (hostKeyId: string, algorithm: string, fingerprint: string): HostKeyDecision => {
        checkedHostKeyId = hostKeyId;
        if (!trusted) return { kind: "unknown" };
        return trusted.algorithm === algorithm && trusted.fingerprint === fingerprint
          ? { kind: "trusted" }
          : { kind: "mismatch", expected: trusted.fingerprint, received: fingerprint };
      },
      trust: async (_profileId: string, algorithm: string, fingerprint: string) => {
        trusted = { algorithm, fingerprint };
      }
    };
    const session = new SshSession({
      target: {
        displayName: `obsidian-test@127.0.0.1:${port}`,
        host: "127.0.0.1",
        port,
        username: "obsidian-test",
        timeoutMs: 10_000,
        hostKeyId: createInlineHostKeyId("127.0.0.1", port),
        getPassword: async () => password
      },
      hostKeys,
      clientFactory: () => new Ssh2ClientAdapter(),
      confirmHostKey: async () => true
    });
    let output = "";
    session.onData((data) => output += data);

    await session.connect();
    session.resize(30, 100, 600, 900);
    session.write("printf 'ready\\n'\n");
    await waitFor(() => output.includes("ready"));
    expect(output).toContain("ready");
    expect(trusted?.fingerprint).toMatch(/^SHA256:/);
    expect(checkedHostKeyId).toBe(`inline:v1:127.0.0.1:${port}`);
    await session.close();
  }, 20_000);
});

function assertSafeContainerName(name: string): void {
  if (!/^obsidian-ssh-test-\d+$/.test(name)) throw new Error(`Unsafe container name: ${name}`);
}

async function waitForSshBanner(targetPort: number): Promise<void> {
  await waitFor(() => new Promise<boolean>((resolve) => {
    const socket = connect(targetPort, "127.0.0.1");
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      resolve(ready);
    };
    timer = setTimeout(() => finish(false), 500);
    socket.once("data", (data) => finish(data.toString("utf8").startsWith("SSH-")));
    socket.once("error", () => finish(false));
  }));
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for integration condition.");
}
