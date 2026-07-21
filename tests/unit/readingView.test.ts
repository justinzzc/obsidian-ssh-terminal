// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

import { registerReadingView, type ReadingViewPlugin } from "../../src/render/readingView";

describe("registerReadingView", () => {
  it("registers ssh blocks and disposes the mounted terminal", async () => {
    let processor: Parameters<ReadingViewPlugin["registerMarkdownCodeBlockProcessor"]>[1] | undefined;
    const plugin: ReadingViewPlugin = {
      registerMarkdownCodeBlockProcessor: vi.fn((language, callback) => {
        expect(language).toBe("ssh");
        processor = callback;
      })
    };
    const disposable = { dispose: vi.fn(async () => undefined) };
    const mountTerminal = vi.fn(() => disposable);
    registerReadingView(plugin, {
      profiles: { get: () => ({ id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 }) },
      manager: {} as never,
      mountTerminal
    });
    const container = document.createElement("div");
    let child: { onunload(): void } | undefined;
    processor!("profile: prod", container, {
      sourcePath: "note.md",
      addChild: (value) => { child = value; }
    });

    expect(mountTerminal).toHaveBeenCalledOnce();
    child!.onunload();
    expect(disposable.dispose).toHaveBeenCalledOnce();
  });

  it("renders a safe error and never mounts for invalid blocks", () => {
    let processor: Parameters<ReadingViewPlugin["registerMarkdownCodeBlockProcessor"]>[1] | undefined;
    const mountTerminal = vi.fn();
    registerReadingView({
      registerMarkdownCodeBlockProcessor: (_language, callback) => { processor = callback; }
    }, {
      profiles: { get: () => undefined },
      manager: {} as never,
      mountTerminal
    });
    const container = document.createElement("div");
    processor!("password: unsafe", container, { sourcePath: "note.md", addChild: vi.fn() });
    expect(container.textContent).toContain("Secrets are not allowed");
    expect(mountTerminal).not.toHaveBeenCalled();
  });
});
