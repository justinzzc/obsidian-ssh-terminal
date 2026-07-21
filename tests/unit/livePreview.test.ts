// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

import { createLivePreviewExtension, findSshBlocks } from "../../src/render/livePreview";

const documentText = "before\n```ssh\nprofile: prod\n```\nafter";

describe("findSshBlocks", () => {
  it("finds ssh fences and ignores other languages", () => {
    const state = EditorState.create({ doc: `${documentText}\n\n\`\`\`js\nalert(1)\n\`\`\`` });
    const blocks = findSshBlocks(state, []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe("profile: prod");
  });

  it("shows source while a selection overlaps the block", () => {
    const state = EditorState.create({ doc: documentText });
    expect(findSshBlocks(state, [{ from: 12, to: 12 }])).toHaveLength(0);
  });
});

describe("createLivePreviewExtension", () => {
  it("mounts outside the cursor and disposes the widget on editor destroy", () => {
    const mountTerminal = vi.fn(() => ({ dispose: vi.fn() }));
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: documentText.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => ({ id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 }) },
        manager: {} as never,
        mountTerminal
      })]
    });
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({ state, parent });
    expect(mountTerminal).toHaveBeenCalledOnce();
    const disposable = mountTerminal.mock.results[0]!.value;
    view.destroy();
    expect(disposable.dispose).toHaveBeenCalledOnce();
  });
});
