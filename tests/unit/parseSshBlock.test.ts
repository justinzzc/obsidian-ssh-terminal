import { describe, expect, it } from "vitest";
import { parseSshBlock } from "../../src/block/parseSshBlock";

describe("parseSshBlock", () => {
  it("parses a profile with the default height", () => {
    expect(parseSshBlock("profile: production-server")).toEqual({
      mode: "profile",
      profileId: "production-server",
      height: 360
    });
  });

  it("accepts an explicit height", () => {
    expect(parseSshBlock("profile: production-server\nheight: 480")).toEqual({
      mode: "profile",
      profileId: "production-server",
      height: 480
    });
  });

  it("parses inline credentials without changing the password", () => {
    expect(parseSshBlock([
      "host: server.example.com",
      "username: root",
      "password: ' secret: value '"
    ].join("\n"))).toEqual({
      mode: "inline",
      host: "server.example.com",
      port: 22,
      username: "root",
      password: " secret: value ",
      height: 360,
      timeoutMs: 15_000
    });
  });

  it("accepts explicit inline port and height", () => {
    expect(parseSshBlock([
      "host: server.example.com",
      "port: 2222",
      "username: root",
      "password: secret",
      "height: 480"
    ].join("\n"))).toMatchObject({
      mode: "inline",
      port: 2222,
      height: 480
    });
  });

  it.each([
    ["", "BLOCK_PROFILE_REQUIRED"],
    ["profile: prod\nextra: value", "BLOCK_UNKNOWN_FIELD"],
    ["profile: prod\npassword: secret", "BLOCK_MODE_CONFLICT"],
    ["profile: prod\nheight: 179", "BLOCK_HEIGHT_INVALID"],
    ["profile: prod\nheight: 901", "BLOCK_HEIGHT_INVALID"],
    ["host: host\nusername: ops", "BLOCK_PASSWORD_REQUIRED"],
    ["host: host\npassword: secret", "BLOCK_USERNAME_REQUIRED"],
    ["username: ops\npassword: secret", "BLOCK_HOST_REQUIRED"],
    ["host: host\nusername: ops\npassword: 123456", "BLOCK_PASSWORD_INVALID"],
    ["host: host\nusername: ops\npassword: secret\nport: 0", "BLOCK_PORT_INVALID"],
    ["host: host\nusername: ops\npassword: secret\nport: 65536", "BLOCK_PORT_INVALID"],
    ["host: host\nusername: ops\npassword: secret\nprivateKey: key", "BLOCK_SECRET_FORBIDDEN"],
    ["host: host\nusername: ops\npassword: secret\npassphrase: phrase", "BLOCK_SECRET_FORBIDDEN"],
    ["host: host\nusername: ops\npassword: secret\nextra: value", "BLOCK_UNKNOWN_FIELD"],
    ["- profile: prod", "BLOCK_INVALID_YAML"],
    ["profile: [", "BLOCK_INVALID_YAML"]
  ])("rejects invalid source %# with %s", (source, code) => {
    expect(() => parseSshBlock(source)).toThrowError(
      expect.objectContaining({ code })
    );
  });

  it("does not include inline passwords in validation errors", () => {
    const password = "never-leak-me";
    try {
      parseSshBlock(`profile: prod\npassword: ${password}`);
    } catch (error) {
      expect(String(error)).not.toContain(password);
    }
  });
});
