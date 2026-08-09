import { parseSshBlock } from "../block/parseSshBlock";
import { createTerminalBlockKey } from "../terminal/TerminalOrigin";

export interface MarkdownSshBlock {
  from: number;
  to: number;
  lineStart: number;
  source: string;
  identityKey: string;
  occurrence: number;
}

/** 使用统一规则扫描 Reading View 与 Live Preview 的 ssh fenced blocks。 */
export function findSshBlocksInMarkdown(markdown: string): MarkdownSshBlock[] {
  const blocks: MarkdownSshBlock[] = [];
  const occurrences = new Map<string, number>();
  const lines = markdown.split("\n");
  let offset = 0;
  let opening: { from: number; lineStart: number; contentFrom: number } | undefined;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber] ?? "";
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const marker = line.trim();
    const lineFrom = offset;
    const lineTo = lineFrom + rawLine.length;

    if (!opening && marker === "```ssh") {
      opening = {
        from: lineFrom,
        lineStart: lineNumber,
        contentFrom: Math.min(lineTo + 1, markdown.length)
      };
    } else if (opening && marker === "```") {
      const source = markdown
        .slice(opening.contentFrom, lineFrom)
        .replace(/\r?\n$/, "");
      const identityKey = createIdentityKey(source);
      const occurrence = occurrences.get(identityKey) ?? 0;
      occurrences.set(identityKey, occurrence + 1);
      blocks.push({
        from: opening.from,
        to: lineTo,
        lineStart: opening.lineStart,
        source,
        identityKey,
        occurrence
      });
      opening = undefined;
    }

    offset = lineTo + 1;
  }

  return blocks;
}

function createIdentityKey(source: string): string {
  try {
    const keyWithOccurrence = createTerminalBlockKey(parseSshBlock(source), 0);
    return keyWithOccurrence.slice(0, keyWithOccurrence.lastIndexOf(":"));
  } catch {
    return `invalid:${fnv1a(source)}`;
  }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
