import { PluginError, type SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { HostKeyDecision } from "../profile/HostKeyStore";
import type {
  Disposable,
  SshClientAdapter,
  SshClientFactory,
  SshShellStream
} from "./SshClientAdapter";

export type SshSessionState =
  | "idle"
  | "verifying-host"
  | "authenticating"
  | "connected"
  | "disconnecting"
  | "closed"
  | "failed";

export interface HostKeyPrompt {
  profileId: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
}

export interface HostKeyAccess {
  check(profileId: string, algorithm: string, fingerprint: string): HostKeyDecision;
  trust(profileId: string, algorithm: string, fingerprint: string): Promise<void>;
}

export interface SshSessionDependencies {
  profile: SshProfile;
  credentials: CredentialStore;
  hostKeys: HostKeyAccess;
  clientFactory: SshClientFactory;
  confirmHostKey(prompt: HostKeyPrompt): Promise<boolean>;
}

/**
 * 单个 SSH 交互会话的状态机。
 * 它负责凭据读取、主机密钥验证、PTY 生命周期和资源幂等释放。
 */
export class SshSession {
  state: SshSessionState = "idle";
  private client: SshClientAdapter | undefined;
  private stream: SshShellStream | undefined;
  private closePromise: Promise<void> | undefined;
  private streamDisposables: Disposable[] = [];
  private readonly dataHandlers = new Set<(data: string) => void>();
  private readonly stateHandlers = new Set<(state: SshSessionState) => void>();

  constructor(private readonly dependencies: SshSessionDependencies) {}

  onData(handler: (data: string) => void): Disposable {
    this.dataHandlers.add(handler);
    return { dispose: () => this.dataHandlers.delete(handler) };
  }

  onStateChange(handler: (state: SshSessionState) => void): Disposable {
    this.stateHandlers.add(handler);
    return { dispose: () => this.stateHandlers.delete(handler) };
  }

  async connect(): Promise<void> {
    if (this.state !== "idle" && this.state !== "failed") {
      throw new PluginError("SESSION_STATE_INVALID", `Cannot connect from state ${this.state}.`);
    }

    this.resetConnection();
    try {
      // 在创建网络客户端之前读取凭据，缺少密码时不会产生任何网络请求。
      const password = await this.dependencies.credentials.getPassword(this.dependencies.profile.id);
      if (password === null) {
        throw new PluginError("CREDENTIAL_MISSING", "No password is saved for this SSH profile.");
      }

      const client = this.dependencies.clientFactory();
      this.client = client;
      this.setState("verifying-host");
      await client.connect({
        host: this.dependencies.profile.host,
        port: this.dependencies.profile.port,
        username: this.dependencies.profile.username,
        password,
        timeoutMs: this.dependencies.profile.timeoutMs,
        verifyHostKey: (algorithm, fingerprint) => this.verifyHostKey(algorithm, fingerprint)
      });

      this.setState("authenticating");
      const stream = await client.openShell("xterm-256color", 24, 80);
      this.stream = stream;
      this.streamDisposables = [
        stream.onData((data) => this.dataHandlers.forEach((handler) => handler(data))),
        stream.onClose(() => {
          if (this.state === "connected") this.setState("closed");
        })
      ];
      this.setState("connected");
    } catch (error) {
      this.setState("failed");
      this.disposeConnection();
      throw mapConnectionError(error);
    }
  }

  write(data: string): void {
    if (this.state !== "connected" || !this.stream) {
      throw new PluginError("SESSION_STATE_INVALID", "SSH session is not connected.");
    }
    this.stream.write(data);
  }

  resize(rows: number, cols: number, height: number, width: number): void {
    if (this.state === "connected") this.stream?.setWindow(rows, cols, height, width);
  }

  close(): Promise<void> {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  }

  private async verifyHostKey(algorithm: string, fingerprint: string): Promise<void> {
    const profile = this.dependencies.profile;
    const decision = this.dependencies.hostKeys.check(profile.id, algorithm, fingerprint);
    if (decision.kind === "mismatch") {
      // 指纹变化必须阻断，普通重连不能绕过。
      throw new PluginError("HOST_KEY_MISMATCH", "The SSH server host key has changed.");
    }
    if (decision.kind === "trusted") return;

    const accepted = await this.dependencies.confirmHostKey({
      profileId: profile.id,
      host: profile.host,
      port: profile.port,
      algorithm,
      fingerprint
    });
    if (!accepted) {
      throw new PluginError("HOST_KEY_REJECTED", "The SSH server host key was not trusted.");
    }
    await this.dependencies.hostKeys.trust(profile.id, algorithm, fingerprint);
  }

  private async performClose(): Promise<void> {
    if (this.state !== "closed") this.setState("disconnecting");
    this.disposeConnection();
    this.setState("closed");
  }

  private resetConnection(): void {
    this.closePromise = undefined;
    this.disposeConnection();
  }

  private disposeConnection(): void {
    // 先解除监听，再关闭流和客户端，避免关闭事件重复触发状态更新。
    for (const disposable of this.streamDisposables.splice(0)) disposable.dispose();
    this.stream?.close();
    this.stream = undefined;
    this.client?.close();
    this.client = undefined;
  }

  private setState(state: SshSessionState): void {
    this.state = state;
    this.stateHandlers.forEach((handler) => handler(state));
  }
}

function mapConnectionError(error: unknown): PluginError {
  if (error instanceof PluginError) return error;
  const candidate = error as { level?: string; message?: string };
  if (candidate.level === "client-authentication") {
    return new PluginError("AUTH_FAILED", "SSH authentication failed.");
  }
  if (candidate.message?.toLowerCase().includes("timeout")) {
    return new PluginError("CONNECT_TIMEOUT", "SSH connection timed out.");
  }
  return new PluginError("NETWORK_ERROR", "SSH connection failed.");
}
