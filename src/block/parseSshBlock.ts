import { parse } from "yaml";
import { PluginError, type SshBlockConfig } from "../model";

const ALLOWED_FIELDS = new Set(["profile", "height"]);
const FORBIDDEN_SECRET_FIELDS = new Set(["password", "passphrase", "privateKey"]);

/**
 * 严格解析文档中的 ssh 代码块。
 * 这里主动拒绝未知字段和凭据字段，避免拼写错误或秘密被写进 Markdown。
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
  // 先检查秘密字段，确保给用户的错误信息明确指出安全风险。
  for (const key of Object.keys(values)) {
    if (FORBIDDEN_SECRET_FIELDS.has(key)) {
      throw new PluginError(
        "BLOCK_SECRET_FORBIDDEN",
        "Secrets are not allowed in SSH blocks. Save credentials in plugin settings."
      );
    }
    if (!ALLOWED_FIELDS.has(key)) {
      throw new PluginError("BLOCK_UNKNOWN_FIELD", `Unknown SSH block field: ${key}`);
    }
  }

  if (typeof values.profile !== "string" || values.profile.trim() === "") {
    throw new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.");
  }

  const height = values.height ?? 360;
  if (!Number.isInteger(height) || (height as number) < 180 || (height as number) > 900) {
    throw new PluginError(
      "BLOCK_HEIGHT_INVALID",
      "SSH terminal height must be an integer between 180 and 900."
    );
  }

  return {
    profileId: values.profile.trim(),
    height: height as number
  };
}
