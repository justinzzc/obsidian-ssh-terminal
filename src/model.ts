export type PluginErrorCode =
  | "BLOCK_INVALID_YAML"
  | "BLOCK_PROFILE_REQUIRED"
  | "BLOCK_UNKNOWN_FIELD"
  | "BLOCK_SECRET_FORBIDDEN"
  | "BLOCK_HEIGHT_INVALID"
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

export interface SshBlockConfig {
  profileId: string;
  height: number;
}

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
