// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

import { createLivePreviewExtension, findSshBlocks } from "../../src/render/livePreview";
import type { TerminalViewOptions } from "../../src/ui/TerminalView";

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
    const mountTerminal = vi.fn((_container: HTMLElement, _options: TerminalViewOptions) => ({ dispose: vi.fn() }));
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: documentText.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => ({ id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 }) },
        credentials: {
          isAvailable: async () => true,
          getPassword: async () => "stored",
          setPassword: async () => undefined,
          deletePassword: async () => undefined
        },
        manager: { close: vi.fn(async () => undefined) } as never,
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

  it("mounts inline blocks with an ephemeral password target", async () => {
    const mountTerminal = vi.fn((_container: HTMLElement, _options: TerminalViewOptions) => ({ dispose: vi.fn() }));
    const inlineDocument = "```ssh\nhost: host\nusername: ops\npassword: never-leak-me\n```\nafter";
    const state = EditorState.create({
      doc: inlineDocument,
      selection: { anchor: inlineDocument.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => undefined },
        credentials: {} as never,
        manager: { close: vi.fn(async () => undefined) } as never,
        mountTerminal
      })]
    });
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({ state, parent });

    const mountedTarget = mountTerminal.mock.calls[0]?.[1].createTarget();
    if (!mountedTarget) throw new Error("Expected inline terminal to mount.");
    expect(mountedTarget).toMatchObject({ host: "host", username: "ops" });
    expect(await mountedTarget.getPassword()).toBe("never-leak-me");
    expect(parent.textContent).not.toContain("never-leak-me");
    view.destroy();
  });

  it("preserves a connected session through block editing and height changes", () => {
    const disposables: ReturnType<typeof vi.fn>[] = [];
    const mountTerminal = vi.fn((_container: HTMLElement, _options: TerminalViewOptions) => {
      const dispose = vi.fn();
      disposables.push(dispose);
      return { dispose };
    });
    const manager = { close: vi.fn(async () => undefined) };
    const state = EditorState.create({
      doc: documentText,
      selection: { anchor: documentText.length },
      extensions: [createLivePreviewExtension({
        sourcePath: () => "note.md",
        profiles: { get: () => ({ id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 }) },
        credentials: {} as never,
        manager: manager as never,
        mountTerminal
      })]
    });
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({ state, parent });
    const firstOptions = mountTerminal.mock.calls[0]![1];

    view.dispatch({ selection: { anchor: 16 } });
    expect(disposables[0]!).toHaveBeenCalledWith({ preserveSession: true });

    const closingFence = documentText.lastIndexOf("\n```") + 1;
    view.dispatch({
      changes: { from: closingFence, insert: "height: 640\n" },
      selection: { anchor: 0 }
    });
    const secondOptions = mountTerminal.mock.calls[1]![1];

    expect(secondOptions.instanceId).toBe(firstOptions.instanceId);
    expect(secondOptions.resumeExistingSession).toBe(true);
    expect(manager.close).not.toHaveBeenCalled();

    view.destroy();
    expect(manager.close).toHaveBeenCalledWith(firstOptions.instanceId);
  });
});
