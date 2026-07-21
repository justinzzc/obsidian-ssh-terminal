// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

import { TerminalView, type TerminalAdapter } from "../../src/ui/TerminalView";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountTerminal() {
  const container = document.createElement("div");
  document.body.append(container);
  const dataHandlers = new Set<(data: string) => void>();
  const terminal: TerminalAdapter = {
    rows: 24,
    cols: 80,
    open: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    fit: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn((handler) => {
      dataHandlers.add(handler);
      return { dispose: () => dataHandlers.delete(handler) };
    })
  };
  const session = {
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onStateChange: vi.fn(() => ({ dispose: vi.fn() }))
  };
  const manager = {
    connect: vi.fn(async () => session),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(async () => undefined)
  };
  const returnFocus = vi.fn();
  const view = TerminalView.mount(container, {
    instanceId: "block-1",
    profile: { id: "prod", name: "Prod", host: "host", port: 22, username: "ops", timeoutMs: 15_000 },
    height: 360,
    manager,
    terminalFactory: () => terminal,
    returnFocus
  });
  return { container, terminal, manager, view, returnFocus };
}

describe("TerminalView", () => {
  it("does not create a network session while rendering", () => {
    const { manager } = mountTerminal();
    expect(manager.connect).not.toHaveBeenCalled();
  });

  it("deduplicates rapid connect clicks", async () => {
    const { container, manager } = mountTerminal();
    const connect = container.querySelector<HTMLButtonElement>("[data-action=connect]")!;
    connect.click();
    connect.click();
    await flushPromises();
    expect(manager.connect).toHaveBeenCalledTimes(1);
  });

  it("clears the terminal and returns focus on Escape", () => {
    const { container, terminal, returnFocus } = mountTerminal();
    container.querySelector<HTMLButtonElement>("[data-action=clear]")!.click();
    container.querySelector<HTMLElement>(".ssh-terminal")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(terminal.clear).toHaveBeenCalledOnce();
    expect(returnFocus).toHaveBeenCalledOnce();
  });

  it("closes the session and terminal exactly once when disposed", async () => {
    const { container, terminal, manager, view } = mountTerminal();
    container.querySelector<HTMLButtonElement>("[data-action=connect]")!.click();
    await flushPromises();
    await Promise.all([view.dispose(), view.dispose()]);
    expect(manager.close).toHaveBeenCalledTimes(1);
    expect(terminal.dispose).toHaveBeenCalledTimes(1);
  });
});
