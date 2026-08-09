// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { PluginError } from "../../src/model";
import { registerReadingView, type ReadingViewPlugin } from "../../src/render/readingView";
import type { TerminalBlockMountDependencies } from "../../src/render/TerminalBlockMount";

function captureProcessor() {
  let processor: Parameters<ReadingViewPlugin["registerMarkdownCodeBlockProcessor"]>[1] | undefined;
  const plugin: ReadingViewPlugin = {
    registerMarkdownCodeBlockProcessor: vi.fn((_language, callback) => {
      processor = callback;
    })
  };
  return { plugin, processor: () => processor! };
}

describe("registerReadingView", () => {
  it("resolves an SSH block whose opening fence contains a space", async () => {
    const captured = captureProcessor();
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => ({ dispose: vi.fn() }));
    registerReadingView(captured.plugin, {
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry: {} as never,
      openTerminal: vi.fn(),
      readSource: async () => "``` ssh\nprofile: production\n```",
      mountBlock
    });
    const container = document.createElement("div");

    captured.processor()("profile: production", container, {
      sourcePath: "note.md",
      getSectionInfo: () => ({ lineStart: 0 }),
      addChild: (child) => child.load()
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mountBlock).toHaveBeenCalledOnce();
    expect(mountBlock.mock.calls[0]?.[1].occurrence).toBe(0);
    expect(container.textContent).not.toContain("location changed while rendering");
  });

  it("renders a helpful notice when asynchronous block mounting throws", async () => {
    const captured = captureProcessor();
    registerReadingView(captured.plugin, {
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry: {} as never,
      openTerminal: vi.fn(),
      mountBlock: () => {
        throw new PluginError("PROFILE_NOT_FOUND", "SSH profile not found: missing");
      }
    });
    const container = document.createElement("div");

    captured.processor()("profile: missing", container, {
      sourcePath: "note.md",
      addChild: (child) => child.load()
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelector(".ssh-error-notice__reason")?.textContent)
      .toBe("SSH profile not found: missing");
    expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toContain("SSH Terminal settings");
  });

  it("uses the shared block mount and only disposes its document host", async () => {
    const captured = captureProcessor();
    const dispose = vi.fn();
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => ({ dispose }));
    registerReadingView(captured.plugin, {
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry: {} as never,
      openTerminal: vi.fn(),
      readSource: vi.fn(async () => "```ssh\nprofile: prod\n```"),
      mountBlock
    });
    let child: { unload(): void } | undefined;
    const container = document.createElement("div");

    captured.processor()("profile: prod", container, {
      sourcePath: "note.md",
      getSectionInfo: () => ({ lineStart: 0 }),
      addChild: (value) => {
        value.load();
        child = value;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mountBlock).toHaveBeenCalledOnce();
    expect(mountBlock.mock.calls[0]?.[1]).toMatchObject({
      sourcePath: "note.md",
      source: "profile: prod",
      occurrence: 0
    });
    child!.unload();
    child!.unload();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("uses the full document to resolve duplicate occurrence", async () => {
    const captured = captureProcessor();
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => ({ dispose: vi.fn() }));
    const markdown = [
      "```ssh",
      "profile: prod",
      "```",
      "text",
      "```ssh",
      "profile: prod",
      "```"
    ].join("\n");
    registerReadingView(captured.plugin, {
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry: {} as never,
      openTerminal: vi.fn(),
      readSource: async () => markdown,
      mountBlock
    });

    captured.processor()("profile: prod", document.createElement("div"), {
      sourcePath: "note.md",
      getSectionInfo: () => ({ lineStart: 4 }),
      addChild: (child) => child.load()
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mountBlock.mock.calls[0]?.[1].occurrence).toBe(1);
  });

  it("renders a safe error and never mounts invalid blocks", () => {
    const captured = captureProcessor();
    const mountBlock = vi.fn((
      _container: HTMLElement,
      _dependencies: TerminalBlockMountDependencies
    ) => ({ dispose: vi.fn() }));
    registerReadingView(captured.plugin, {
      profiles: { get: () => undefined },
      credentials: {} as never,
      registry: {} as never,
      openTerminal: vi.fn(),
      mountBlock
    });
    const container = document.createElement("div");

    captured.processor()("profile: prod\npassword: unsafe", container, {
      sourcePath: "note.md",
      addChild: vi.fn()
    });

    expect(container.querySelector(".ssh-error-notice__title")?.textContent)
      .toBe("Unable to start SSH terminal");
    expect(container.querySelector(".ssh-error-notice__reason")?.textContent)
      .toContain("cannot be combined");
    expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toContain("SSH block");
    expect(container.querySelector(".ssh-terminal__error")).toBeNull();
    expect(container.textContent).toContain("cannot be combined");
    expect(container.textContent).not.toContain("unsafe");
    expect(mountBlock).not.toHaveBeenCalled();
  });
});
