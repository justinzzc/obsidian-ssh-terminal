// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObsidianTerminalThemeSync,
  readObsidianTerminalTheme
} from "../../src/ui/ObsidianTerminalThemeSync";

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: MutationCallback) {
    FakeMutationObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as MutationObserver);
  }
}

afterEach(() => {
  FakeMutationObserver.instances = [];
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("ObsidianTerminalThemeSync", () => {
  it("maps Obsidian variables to xterm colors", () => {
    const container = document.createElement("div");
    container.style.setProperty("--background-primary", "rgb(1, 2, 3)");
    container.style.setProperty("--text-normal", "rgb(4, 5, 6)");
    container.style.setProperty("--text-accent", "rgb(7, 8, 9)");
    container.style.setProperty("--text-selection", "rgba(10, 11, 12, 0.4)");

    expect(readObsidianTerminalTheme(container)).toMatchObject({
      background: "rgb(1, 2, 3)",
      foreground: "rgb(4, 5, 6)",
      cursor: "rgb(7, 8, 9)",
      cursorAccent: "rgb(1, 2, 3)",
      selectionBackground: "rgba(10, 11, 12, 0.4)"
    });
  });

  it("updates the same terminal and disconnects the observer", () => {
    vi.stubGlobal("MutationObserver", FakeMutationObserver);
    const container = document.createElement("div");
    container.style.setProperty("--background-primary", "rgb(20, 20, 20)");
    container.style.setProperty("--text-normal", "rgb(230, 230, 230)");
    document.body.append(container);
    const terminal = { options: { theme: {} } };
    const sync = new ObsidianTerminalThemeSync(container, terminal);

    sync.start();
    container.style.setProperty("--background-primary", "rgb(250, 250, 250)");
    container.style.setProperty("--text-normal", "rgb(10, 10, 10)");
    const observer = FakeMutationObserver.instances[0]!;
    observer.trigger();

    expect(terminal.options.theme).toMatchObject({
      background: "rgb(250, 250, 250)",
      foreground: "rgb(10, 10, 10)"
    });
    sync.dispose();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
