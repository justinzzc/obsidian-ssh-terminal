import { createHash } from "node:crypto";
import { Client, utils, type ClientChannel, type ConnectConfig } from "ssh2";

export interface Disposable {
  dispose(): void;
}

export interface SshConnectOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  timeoutMs: number;
  verifyHostKey(algorithm: string, fingerprint: string): Promise<void>;
}

export interface SshShellStream {
  write(data: string): void;
  setWindow(rows: number, cols: number, height: number, width: number): void;
  onData(handler: (data: string) => void): Disposable;
  onClose(handler: (error?: Error) => void): Disposable;
  close(): void;
}

export interface SshClientAdapter {
  connect(options: SshConnectOptions): Promise<void>;
  openShell(term: "xterm-256color", rows: number, cols: number): Promise<SshShellStream>;
  close(): void;
}

export type SshClientFactory = () => SshClientAdapter;

/** 将 ssh2 的事件式 API 收敛成会话层使用的 Promise/Disposable 接口。 */
export class Ssh2ClientAdapter implements SshClientAdapter {
  private readonly client = new Client();

  connect(options: SshConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      let verificationError: Error | undefined;
      const onError = (error: Error) => reject(verificationError ?? error);

      this.client.once("ready", resolve);
      this.client.once("error", onError);

      const config: ConnectConfig = {
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        readyTimeout: options.timeoutMs,
        hostVerifier: (key: Buffer, callback: (valid: boolean) => void) => {
          // ssh2 在认证前回调这里；只有上层验证或确认指纹后才允许继续握手。
          const fingerprint = `SHA256:${createHash("sha256").update(key).digest("base64")}`;
          const algorithm = readKeyAlgorithm(key);
          void options.verifyHostKey(algorithm, fingerprint).then(
            () => callback(true),
            (error: unknown) => {
              verificationError = error instanceof Error ? error : new Error("Host key verification failed.");
              callback(false);
            }
          );
        }
      };

      this.client.connect(config);
    });
  }

  openShell(term: "xterm-256color", rows: number, cols: number): Promise<SshShellStream> {
    return new Promise((resolve, reject) => {
      this.client.shell({ term, rows, cols }, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(new Ssh2ShellStream(stream));
      });
    });
  }

  close(): void {
    this.client.end();
  }
}

class Ssh2ShellStream implements SshShellStream {
  constructor(private readonly stream: ClientChannel) {}

  write(data: string): void {
    this.stream.write(data);
  }

  setWindow(rows: number, cols: number, height: number, width: number): void {
    this.stream.setWindow(rows, cols, height, width);
  }

  onData(handler: (data: string) => void): Disposable {
    const listener = (data: Buffer) => handler(data.toString("utf8"));
    this.stream.on("data", listener);
    return { dispose: () => this.stream.off("data", listener) };
  }

  onClose(handler: (error?: Error) => void): Disposable {
    const listener = () => handler();
    this.stream.on("close", listener);
    return { dispose: () => this.stream.off("close", listener) };
  }

  close(): void {
    this.stream.end();
  }
}

function readKeyAlgorithm(key: Buffer): string {
  const parsed = utils.parseKey(key);
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (candidate instanceof Error || !candidate) return "unknown";
  return candidate.type;
}
