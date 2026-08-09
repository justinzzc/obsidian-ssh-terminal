import { describe, expect, it } from "vitest";
import { findSshBlocksInMarkdown } from "../../src/render/findSshBlocksInMarkdown";

describe("findSshBlocksInMarkdown", () => {
  it("recognizes spaces around the ssh info string", () => {
    const markdown = [
      "``` ssh   ",
      "profile: production",
      "```"
    ].join("\n");

    expect(findSshBlocksInMarkdown(markdown)).toMatchObject([{
      lineStart: 0,
      source: "profile: production",
      occurrence: 0
    }]);
  });

  it.each(["ssh2", "shell", "bash"])("does not match the %s language", (language) => {
    const markdown = [
      `\`\`\` ${language}`,
      "profile: production",
      "```"
    ].join("\n");

    expect(findSshBlocksInMarkdown(markdown)).toEqual([]);
  });

  it("accepts tabs and preserves identity across compact and spaced fences", () => {
    const blocks = findSshBlocksInMarkdown([
      "```ssh\t",
      "profile: production",
      "```",
      "```\tssh\t",
      "profile: production",
      "```"
    ].join("\n"));

    expect(blocks.map((block) => block.source)).toEqual([
      "profile: production",
      "profile: production"
    ]);
    expect(blocks.map((block) => block.occurrence)).toEqual([0, 1]);
    expect(blocks[0]?.identityKey).toBe(blocks[1]?.identityKey);
  });

  it("assigns duplicate occurrences in document order", () => {
    const blocks = findSshBlocksInMarkdown([
      "before",
      "```ssh",
      "profile: production",
      "```",
      "middle",
      "```ssh",
      "profile: production",
      "```"
    ].join("\n"));

    expect(blocks.map(({ lineStart, occurrence }) => ({ lineStart, occurrence })))
      .toEqual([
        { lineStart: 1, occurrence: 0 },
        { lineStart: 5, occurrence: 1 }
      ]);
  });

  it("does not split occurrences by password or height", () => {
    const blocks = findSshBlocksInMarkdown([
      "```ssh",
      "host: server.example.com",
      "username: root",
      "password: first-secret",
      "height: 360",
      "```",
      "```ssh",
      "host: server.example.com",
      "username: root",
      "password: second-secret",
      "height: 600",
      "```"
    ].join("\n"));

    expect(blocks.map((block) => block.occurrence)).toEqual([0, 1]);
    expect(JSON.stringify(blocks.map((block) => block.identityKey))).not.toContain("secret");
  });

  it("tracks offsets and ignores non-ssh fences", () => {
    const markdown = "before\n```js\n1\n```\n```ssh\nprofile: prod\n```\nafter";
    const blocks = findSshBlocksInMarkdown(markdown);

    expect(blocks).toHaveLength(1);
    expect(markdown.slice(blocks[0]!.from, blocks[0]!.to)).toContain("```ssh");
    expect(blocks[0]!.source).toBe("profile: prod");
  });
});
