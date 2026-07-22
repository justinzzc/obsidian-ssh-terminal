/** 插件跨模块共享的安全错误码；消息中禁止携带密码或终端内容。 */
export type PluginErrorCode =
  | "BLOCK_INVALID_YAML"
  | "BLOCK_PROFILE_REQUIRED"
  | "BLOCK_UNKNOWN_FIELD"
  | "BLOCK_SECRET_FORBIDDEN"
  | "BLOCK_HEIGHT_INVALID"
  | "BLOCK_MODE_CONFLICT"
  | "BLOCK_HOST_REQUIRED"
  | "BLOCK_USERNAME_REQUIRED"
  | "BLOCK_PASSWORD_REQUIRED"
  | "BLOCK_PASSWORD_INVALID"
  | "BLOCK_PORT_INVALID"
  | "PROFILE_INVALID"
  | "PROFILE_NOT_FOUND"
  | "CREDENTIAL_STORE_UNAVAILABLE"
  | "CREDENTIAL_MISSING"
  | "HOST_KEY_REJECTED"
  | "HOST_KEY_MISMATCH"
  | "CONNECT_TIMEOUT"
  | "NETWORK_ERROR"
  | "AUTH_FAILED"
  | "SHELL_OPEN_FAILED"
  | "SESSION_STATE_INVALID"
  | "REMOTE_CLOSED";

export class PluginError extends Error {
  constructor(
    public readonly code: PluginErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PluginError";
  }
}

export interface ProfileSshBlockConfig {
  mode: "profile";
  profileId: string;
  height: number;
}

export interface InlineSshBlockConfig {
  mode: "inline";
  host: string;
  port: number;
  username: string;
  password: string;
  height: number;
  timeoutMs: number;
}

/** Markdown 中 ssh 代码块解析后的配置。 */
export type SshBlockConfig = ProfileSshBlockConfig | InlineSshBlockConfig;

/** 只包含非敏感信息的 SSH 连接配置。 */
export interface SshProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
}

export interface TrustedHostKey {
  algorithm: string;
  fingerprint: string;
}

export interface PersistedPluginData {
  schemaVersion: 1;
  profiles: SshProfile[];
  hostKeys: Record<string, TrustedHostKey>;
}
