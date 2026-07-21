import { PluginError, type TrustedHostKey } from "../model";
import type { PluginDataRepository } from "./ProfileStore";

export type HostKeyDecision =
  | { kind: "unknown" }
  | { kind: "trusted" }
  | { kind: "mismatch"; expected: string; received: string };

export class HostKeyStore {
  constructor(private readonly repository: PluginDataRepository) {}

  check(profileId: string, algorithm: string, fingerprint: string): HostKeyDecision {
    // 首次使用采用 TOFU；之后算法或指纹任一变化都视为潜在中间人攻击。
    const trusted = this.repository.snapshot().hostKeys[profileId];
    if (!trusted) return { kind: "unknown" };
    if (trusted.algorithm === algorithm && trusted.fingerprint === fingerprint) {
      return { kind: "trusted" };
    }
    return { kind: "mismatch", expected: trusted.fingerprint, received: fingerprint };
  }

  async trust(profileId: string, algorithm: string, fingerprint: string): Promise<void> {
    validateHostKey(algorithm, fingerprint);
    await this.repository.update((data) => {
      data.hostKeys[profileId] = { algorithm, fingerprint };
    });
  }

  async forget(profileId: string): Promise<void> {
    await this.repository.update((data) => {
      delete data.hostKeys[profileId];
    });
  }

  get(profileId: string): TrustedHostKey | undefined {
    return this.repository.snapshot().hostKeys[profileId];
  }
}

function validateHostKey(algorithm: string, fingerprint: string): void {
  if (algorithm.trim() === "" || !/^SHA256:[A-Za-z0-9+/]+={0,2}$/.test(fingerprint)) {
    throw new PluginError("PROFILE_INVALID", "Invalid SSH host key fingerprint.");
  }
}
