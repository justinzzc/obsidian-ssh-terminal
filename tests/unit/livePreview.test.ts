// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { PluginError } from "../../src/model";
import { createLivePreviewExtension, findSshBlocks } from "../../src/render/livePreview";
import type { TerminalBlockMountDependencies } from "../../src/render/TerminalBlockMount";

const documentText = "before\n```ssh\nprofile: prod\n```\nafter";

describe("findSshBlocks", () => {
  it("finds ssh fences and ignores other languages", () => {
    const state = EditorState.create({ doc: `${documentText}\n\n\`\`\`js\nalert(1)\n\`\`\`` });
    const blocks = findSshBlocks(state, []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe("profile: prod");
    expect(blocks[0]?.occurrence).toBe(0);
  });

  it("shows source while a selection overlaps the block", () => {
    const state = EditorState.create({ doc: documentText });
    expect(findSshBlocks(state, [{ from: 12, to: 12 }])).toHaveLength(0);
  });
});

describe("createLivePreviewExtension", () => {
  it("renders a helpful notice when an SSH block is invalid", () => {
    const mountBlock = vi.fn(() => {
      throw new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.");
    });
    const invalidDocument = "```ssh\n\n```\nafter";
    const state = EditorState.create({
      doc: invalidDocument,
      selection: { anchor: invalidDocument.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => undefined },
        credentials: {} as never,
        registry: {} as never,
        openTerminal: vi.fn(),
        mountBlock
      })]
    });
    const parent = document.createElement("div");
    const view = new EditorView({ state, parent });

    expect(parent.querySelector(".ssh-error-notice__title")?.textContent)
      .toBe("Unable to start SSH terminal");
    expect(parent.querySelector(".ssh-error-notice__reason")?.textContent)
      .toBe("SSH block requires a profile.");
    view.destroy();
  });

  it("uses the shared block mount and disposes only the widget host", () => {
    const dispose = vi.fn();
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => ({ dispose }));
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: documentText.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => undefined },
        credentials: {} as never,
        registry: {} as never,
        openTerminal: vi.fn(),
        mountBlock
      })]
    });
    const parent = document.createElement("div");
    const view = new EditorView({ state, parent });

    expect(mountBlock).toHaveBeenCalledOnce();
    expect(mountBlock.mock.calls[0]?.[1]).toMatchObject({
      sourcePath: "note.md",
      source: "profile: prod",
      occurrence: 0
    });
    view.destroy();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("recreates only the document host when the block leaves preview", () => {
    const disposables: ReturnType<typeof vi.fn>[] = [];
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => {
      const dispose = vi.fn();
      disposables.push(dispose);
      return { dispose };
    });
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: documentText.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => undefined },
        credentials: {} as never,
        registry: {} as never,
        openTerminal: vi.fn(),
        mountBlock
      })]
    });
    const view = new EditorView({ state, parent: document.createElement("div") });

    view.dispatch({ selection: { anchor: 16 } });

    expect(disposables[0]).toHaveBeenCalledOnce();
    view.destroy();
  });
});
