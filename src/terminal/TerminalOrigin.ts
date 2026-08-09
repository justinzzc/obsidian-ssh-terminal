import type { SshBlockConfig } from "../model";

export interface TerminalOrigin {
  sourcePath: string;
  blockKey: string;
}

export function createTerminalBlockKey(
  config: SshBlockConfig,
  occurrence: number
): string {
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new RangeError("Terminal block occurrence must be a non-negative integer.");
  }

  if (config.mode === "profile") {
    return `profile:${encodeURIComponent(config.profileId)}:${occurrence}`;
  }

  const normalizedHost = config.host
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .toLowerCase();
  return [
    "inline",
    encodeURIComponent(normalizedHost),
    config.port,
    encodeURIComponent(config.username),
    config.timeoutMs,
    occurrence
  ].join(":");
}

export function createTerminalOrigin(
  sourcePath: string,
  config: SshBlockConfig,
  occurrence: number
): TerminalOrigin {
  return {
    sourcePath,
    blockKey: createTerminalBlockKey(config, occurrence)
  };
}

export function haveSameTerminalOrigin(
  left: TerminalOrigin,
  right: TerminalOrigin
): boolean {
  return left.sourcePath === right.sourcePath && left.blockKey === right.blockKey;
}
