import { parse } from "yaml";
import { PluginError, type SshBlockConfig } from "../model";

const PROFILE_FIELDS = new Set(["profile", "height"]);
const INLINE_FIELDS = new Set(["host", "port", "username", "password", "height"]);
const INLINE_ONLY_FIELDS = ["host", "port", "username", "password"] as const;
const FORBIDDEN_SECRET_FIELDS = new Set(["passphrase", "privateKey"]);
const DEFAULT_HEIGHT = 360;
const DEFAULT_PORT = 22;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * 严格解析文档中的 ssh 代码块，同时支持 profile 与显式 inline 凭据模式。
 */
export function parseSshBlock(source: string): SshBlockConfig {
  let parsed: unknown;

  try {
    parsed = parse(source);
  } catch {
    throw new PluginError("BLOCK_INVALID_YAML", "SSH block must contain valid YAML.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    if (source.trim() === "") {
      throw new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.");
    }
    throw new PluginError("BLOCK_INVALID_YAML", "SSH block must be a YAML mapping.");
  }

  const values = parsed as Record<string, unknown>;
  const hasProfile = Object.hasOwn(values, "profile");
  const hasInline = INLINE_ONLY_FIELDS.some((key) => Object.hasOwn(values, key));
  if (hasProfile && hasInline) {
    throw new PluginError(
      "BLOCK_MODE_CONFLICT",
      "profile cannot be combined with inline SSH fields."
    );
  }

  const allowedFields = hasInline ? INLINE_FIELDS : PROFILE_FIELDS;
  for (const key of Object.keys(values)) {
    if (FORBIDDEN_SECRET_FIELDS.has(key)) {
      throw new PluginError(
        "BLOCK_SECRET_FORBIDDEN",
        `Unsupported secret field in SSH block: ${key}`
      );
    }
    if (!allowedFields.has(key)) {
      throw new PluginError("BLOCK_UNKNOWN_FIELD", `Unknown SSH block field: ${key}`);
    }
  }

  const height = values.height ?? DEFAULT_HEIGHT;
  if (!Number.isInteger(height) || (height as number) < 180 || (height as number) > 900) {
    throw new PluginError(
      "BLOCK_HEIGHT_INVALID",
      "SSH terminal height must be an integer between 180 and 900."
    );
  }

  if (hasInline) {
    const host = requireTrimmedString(values.host, "BLOCK_HOST_REQUIRED", "host");
    const username = requireTrimmedString(
      values.username,
      "BLOCK_USERNAME_REQUIRED",
      "username"
    );
    if (!Object.hasOwn(values, "password")) {
      throw new PluginError("BLOCK_PASSWORD_REQUIRED", "Inline SSH block requires password.");
    }
    if (typeof values.password !== "string" || values.password.length === 0) {
      throw new PluginError(
        "BLOCK_PASSWORD_INVALID",
        "password must be a non-empty YAML string; quote numeric passwords."
      );
    }

    const port = values.port ?? DEFAULT_PORT;
    if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65_535) {
      throw new PluginError(
        "BLOCK_PORT_INVALID",
        "port must be an integer between 1 and 65535."
      );
    }

    return {
      mode: "inline",
      host,
      port: port as number,
      username,
      password: values.password,
      height: height as number,
      timeoutMs: DEFAULT_TIMEOUT_MS
    };
  }

  if (typeof values.profile !== "string" || values.profile.trim() === "") {
    throw new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.");
  }

  return {
    mode: "profile",
    profileId: values.profile.trim(),
    height: height as number
  };
}

function requireTrimmedString(
  value: unknown,
  code: "BLOCK_HOST_REQUIRED" | "BLOCK_USERNAME_REQUIRED",
  field: string
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PluginError(code, `Inline SSH block requires ${field}.`);
  }
  return value.trim();
}
