export type PluginErrorCode =
  | "BLOCK_INVALID_YAML"
  | "BLOCK_PROFILE_REQUIRED"
  | "BLOCK_UNKNOWN_FIELD"
  | "BLOCK_SECRET_FORBIDDEN"
  | "BLOCK_HEIGHT_INVALID";

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
