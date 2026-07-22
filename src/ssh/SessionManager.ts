import type { SshSession } from "./SshSession";
import type { SshConnectionTarget } from "./SshConnectionTarget";

export type ManagedSession = Pick<SshSession, "connect" | "close" | "write" | "resize" | "onData" | "onStateChange">;
export type ManagedSessionFactory = (target: SshConnectionTarget) => ManagedSession;

interface SessionEntry {
  session: ManagedSession;
  connecting: Promise<ManagedSession>;
}

/**
 * 按“渲染块实例”拥有会话；同一 profile 在不同文档块中仍使用独立 PTY。
 */
export class SessionManager {
  private readonly entries = new Map<string, SessionEntry>();

  constructor(private readonly sessionFactory: ManagedSessionFactory) {}

  connect(instanceId: string, target: SshConnectionTarget): Promise<ManagedSession> {
    // 保存并复用正在进行的 Promise，抑制双击连接造成的并发会话。
    const existing = this.entries.get(instanceId);
    if (existing) return existing.connecting;

    const session = this.sessionFactory(target);
    const connecting = session.connect().then(
      () => session,
      (error: unknown) => {
        this.entries.delete(instanceId);
        throw error;
      }
    );
    this.entries.set(instanceId, { session, connecting });
    return connecting;
  }

  write(instanceId: string, data: string): void {
    this.entries.get(instanceId)?.session.write(data);
  }

  resize(instanceId: string, rows: number, cols: number, height: number, width: number): void {
    this.entries.get(instanceId)?.session.resize(rows, cols, height, width);
  }

  async close(instanceId: string): Promise<void> {
    const entry = this.entries.get(instanceId);
    if (!entry) return;
    // 先删除所有权再等待关闭，使并发清理天然幂等。
    this.entries.delete(instanceId);
    await entry.session.close();
  }

  async closeAll(): Promise<void> {
    const instanceIds = [...this.entries.keys()];
    await Promise.all(instanceIds.map((instanceId) => this.close(instanceId)));
  }
}
