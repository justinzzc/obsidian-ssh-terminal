export interface SshConnectionTarget {
  displayName: string;
  host: string;
  port: number;
  username: string;
  timeoutMs: number;
  hostKeyId: string;
  getPassword(): Promise<string | null>;
}

type ConnectionSignature = readonly (string | number)[];

const connectionSignatures = new WeakMap<SshConnectionTarget, ConnectionSignature>();

/** 记录仅用于当前进程内会话复用判断的连接字段；不会进入日志或持久化数据。 */
export function registerSshConnectionSignature(
  target: SshConnectionTarget,
  signature: ConnectionSignature
): SshConnectionTarget {
  connectionSignatures.set(target, signature);
  return target;
}

/** 比较两个运行时目标是否代表同一条 SSH 连接，展示参数不参与判断。 */
export function haveSameSshConnection(
  left: SshConnectionTarget,
  right: SshConnectionTarget
): boolean {
  if (left === right) return true;
  const leftSignature = connectionSignatures.get(left);
  const rightSignature = connectionSignatures.get(right);
  return leftSignature !== undefined &&
    rightSignature !== undefined &&
    leftSignature.length === rightSignature.length &&
    leftSignature.every((value, index) => value === rightSignature[index]);
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
