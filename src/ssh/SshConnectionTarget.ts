export interface SshConnectionTarget {
  displayName: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
  hostKeyId: string;
  getPassword(): Promise<string | null>;
}

const INLINE_PREFIX = "inline:v1:";

/** 为 inline endpoint 生成不含用户名和密码的稳定主机信任键。 */
export function createInlineHostKeyId(host: string, port: number): string {
  const normalizedHost = host.trim().replace(/^\[(.*)\]$/, "$1").toLowerCase();
  return `${INLINE_PREFIX}${encodeURIComponent(normalizedHost)}:${port}`;
}

/** 解析设置页可管理的 inline 主机信任键；损坏或非 inline key 返回 null。 */
export function parseInlineHostKeyId(
  id: string
): { host: string; port: number } | null {
  if (!id.startsWith(INLINE_PREFIX)) return null;
  const separator = id.lastIndexOf(":");
  if (separator <= INLINE_PREFIX.length) return null;
  const port = Number(id.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;

  try {
    const host = decodeURIComponent(id.slice(INLINE_PREFIX.length, separator));
    return host === "" ? null : { host, port };
  } catch {
    return null;
  }
}
