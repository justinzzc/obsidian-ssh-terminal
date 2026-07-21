import { describe, expect, it } from "vitest";
import { parseSshBlock } from "../../src/block/parseSshBlock";

describe("parseSshBlock", () => {
  it("parses a profile with the default height", () => {
    expect(parseSshBlock("profile: production-server")).toEqual({
      profileId: "production-server",
      height: 360
    });
  });

  it("accepts an explicit height", () => {
    expect(parseSshBlock("profile: production-server\nheight: 480")).toEqual({
      profileId: "production-server",
      height: 480
    });
  });

  it.each([
    ["", "BLOCK_PROFILE_REQUIRED"],
    ["profile: prod\nextra: value", "BLOCK_UNKNOWN_FIELD"],
    ["profile: prod\npassword: secret", "BLOCK_SECRET_FORBIDDEN"],
    ["profile: prod\nheight: 179", "BLOCK_HEIGHT_INVALID"],
    ["profile: prod\nheight: 901", "BLOCK_HEIGHT_INVALID"],
    ["- profile: prod", "BLOCK_INVALID_YAML"],
    ["profile: [", "BLOCK_INVALID_YAML"]
  ])("rejects invalid source %# with %s", (source, code) => {
    expect(() => parseSshBlock(source)).toThrowError(
      expect.objectContaining({ code })
    );
  });
});
