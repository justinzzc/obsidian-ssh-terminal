import {
  PluginError,
  type SshBlockConfig,
  type SshProfile
} from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import {
  createInlineHostKeyId,
  registerSshConnectionSignature,
  type SshConnectionTarget
} from "../ssh/SshConnectionTarget";

export interface SshConnectionTargetDependencies {
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
}

/** 把 Markdown 配置解析为下游会话使用的统一运行时连接目标。 */
export function resolveSshConnectionTarget(
  config: SshBlockConfig,
  dependencies: SshConnectionTargetDependencies
): SshConnectionTarget {
  if (config.mode === "profile") {
    const profile = dependencies.profiles.get(config.profileId);
    if (!profile) {
      throw new PluginError(
        "PROFILE_NOT_FOUND",
        `SSH profile not found: ${config.profileId}`
      );
    }
    return resolveProfile(profile, dependencies.credentials);
  }

  const password = config.password;
  return registerSshConnectionSignature({
    displayName: `${config.username}@${config.host}:${config.port}`,
    host: config.host,
    port: config.port,
    username: config.username,
    timeoutMs: config.timeoutMs,
    hostKeyId: createInlineHostKeyId(config.host, config.port),
    getPassword: async () => password
  }, ["inline", config.host, config.port, config.username, password, config.timeoutMs]);
}

function resolveProfile(
  profile: SshProfile,
  credentials: CredentialStore
): SshConnectionTarget {
  return registerSshConnectionSignature({
    displayName: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    timeoutMs: profile.timeoutMs,
    hostKeyId: profile.id,
    getPassword: () => credentials.getPassword(profile.id)
  }, [
    "profile",
    profile.id,
    profile.host,
    profile.port,
    profile.username,
    profile.timeoutMs
  ]);
}
