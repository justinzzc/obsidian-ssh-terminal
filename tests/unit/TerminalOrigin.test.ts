import { describe, expect, it } from "vitest";
import {
  createTerminalOrigin,
  haveSameTerminalOrigin
} from "../../src/terminal/TerminalOrigin";

describe("TerminalOrigin", () => {
  it("creates a stable non-secret key for profile blocks", () => {
    const origin = createTerminalOrigin("ops/server.md", {
      mode: "profile",
      profileId: "production",
      height: 360
    }, 0);

    expect(origin).toEqual({
      sourcePath: "ops/server.md",
      blockKey: "profile:production:0"
    });
  });

  it("does not include inline passwords or presentation height", () => {
    const first = createTerminalOrigin("ops/server.md", {
      mode: "inline",
      host: "Server.Example.com",
      port: 22,
      username: "root",
      password: "first-secret",
      height: 360,
      timeoutMs: 15_000
    }, 1);
    const second = createTerminalOrigin("ops/server.md", {
      mode: "inline",
      host: "server.example.com",
      port: 22,
      username: "root",
      password: "second-secret",
      height: 600,
      timeoutMs: 15_000
    }, 1);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("secret");
  });

  it("distinguishes duplicate blocks by occurrence", () => {
    const config = {
      mode: "profile",
      profileId: "production",
      height: 360
    } as const;

    expect(haveSameTerminalOrigin(
      createTerminalOrigin("ops/server.md", config, 0),
      createTerminalOrigin("ops/server.md", config, 1)
    )).toBe(false);
  });

  it("rejects invalid occurrence values", () => {
    expect(() => createTerminalOrigin("ops/server.md", {
      mode: "profile",
      profileId: "production",
      height: 360
    }, -1)).toThrow(RangeError);
  });
});
