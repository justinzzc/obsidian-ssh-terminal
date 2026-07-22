// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

const xtermMocks = vi.hoisted(() => ({
  options: { theme: {} as Record<string, string> },
  open: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  fit: vi.fn()
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    rows = 24;
    cols = 80;
    options = xtermMocks.options;
    open = xtermMocks.open;
    write = xtermMocks.write;
    clear = xtermMocks.clear;
    focus = xtermMocks.focus;
    dispose = xtermMocks.dispose;
    loadAddon = xtermMocks.loadAddon;
    onData = xtermMocks.onData;
  }
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class { fit = xtermMocks.fit; }
}));

import { TerminalView, type TerminalAdapter } from "../../src/ui/TerminalView";
import type { SshConnectionTarget } from "../../src/ssh/SshConnectionTarget";

const target: SshConnectionTarget = {
  displayName: "Prod",
  host: "host",
  port: 22,
  username: "ops",
  timeoutMs: 15_000,
  hostKeyId: "prod",
  getPassword: async () => "secret"
};

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
    dataDispose: vi.fn(),
    stateDispose: vi.fn(),
    onData: vi.fn(),
    onStateChange: vi.fn()
  };
  session.onData.mockReturnValue({ dispose: session.dataDispose });
  session.onStateChange.mockReturnValue({ dispose: session.stateDispose });
  const manager = {
    connect: vi.fn(async () => session),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(async () => undefined)
  };
  const returnFocus = vi.fn();
  const createTarget = vi.fn(() => target);
  const view = TerminalView.mount(container, {
    instanceId: "block-1",
    createTarget,
    height: 360,
    manager,
    terminalFactory: () => terminal,
    returnFocus
  });
  return { container, terminal, manager, session, view, returnFocus, createTarget };
}

describe("TerminalView", () => {
  it("applies Obsidian colors when using the real xterm adapter", async () => {
    const styleSpy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => ({
        "--background-primary": "rgb(12, 13, 14)",
        "--text-normal": "rgb(220, 221, 222)",
        "--text-accent": "rgb(100, 110, 120)",
        "--text-selection": "rgba(80, 90, 100, 0.4)"
      })[name] ?? ""
    } as CSSStyleDeclaration);
    const container = document.createElement("div");
    document.body.append(container);
    const manager = {
      connect: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(async () => undefined)
    };
    const view = TerminalView.mount(container, {
      instanceId: "theme-block",
      createTarget: () => target,
      height: 360,
      manager
    });

    expect(xtermMocks.options.theme).toMatchObject({
      background: "rgb(12, 13, 14)",
      foreground: "rgb(220, 221, 222)"
    });
    await view.dispose();
    expect(xtermMocks.dispose).toHaveBeenCalledOnce();
    styleSpy.mockRestore();
  });

  it("does not create a network session while rendering", () => {
    const { container, manager } = mountTerminal();
    expect(manager.connect).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("secret");
  });

  it("deduplicates rapid connect clicks", async () => {
    const { container, manager } = mountTerminal();
    const connect = container.querySelector<HTMLButtonElement>("[data-action=connect]")!;
    connect.click();
    connect.click();
    await flushPromises();
    expect(manager.connect).toHaveBeenCalledTimes(1);
    expect(manager.connect).toHaveBeenCalledWith("block-1", target);
  });

  it("keeps the host visible and uses one button for the connection lifecycle", async () => {
    const { container, manager } = mountTerminal();
    const toolbar = container.querySelector<HTMLElement>(".ssh-terminal__toolbar")!;
    const connectionButtons = Array.from(toolbar.querySelectorAll("button")).filter((button) =>
      ["connect", "disconnect", "reconnect"].includes(button.dataset.action ?? "")
    );
    const connectionButton = connectionButtons[0] as HTMLButtonElement;

    expect(connectionButtons).toHaveLength(1);
    expect(toolbar.textContent).toContain("Prod");
    expect(connectionButton.textContent).toBe("Connect");

    connectionButton.click();
    expect(connectionButton.textContent).toBe("Connecting…");
    expect(toolbar.textContent).toContain("Prod");
    await flushPromises();

    expect(connectionButton.textContent).toBe("Disconnect");
    expect(toolbar.textContent).toContain("Prod");

    connectionButton.click();
    await flushPromises();
    expect(manager.close).toHaveBeenCalledOnce();
    expect(connectionButton.textContent).toBe("Connect");
    expect(toolbar.textContent).toContain("Prod");
  });

  it("clears the terminal", () => {
    const { container, terminal } = mountTerminal();
    container.querySelector<HTMLButtonElement>("[data-action=clear]")!.click();
    expect(terminal.clear).toHaveBeenCalledOnce();
  });

  it("leaves Escape to the terminal without returning focus", () => {
    const { container, terminal, returnFocus } = mountTerminal();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    });
    const dispatched = container.querySelector<HTMLElement>(".ssh-terminal")!.dispatchEvent(event);

    expect(dispatched).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(returnFocus).not.toHaveBeenCalled();
    expect(terminal.focus).not.toHaveBeenCalled();
  });

  it("closes the session and terminal exactly once when disposed", async () => {
    const { container, terminal, manager, view } = mountTerminal();
    container.querySelector<HTMLButtonElement>("[data-action=connect]")!.click();
    await flushPromises();
    await Promise.all([view.dispose(), view.dispose()]);
    expect(manager.close).toHaveBeenCalledTimes(1);
    expect(terminal.dispose).toHaveBeenCalledTimes(1);
  });

  it("releases session subscriptions on disconnect before reconnecting", async () => {
    const { container, createTarget, manager, session } = mountTerminal();
    const connectionButton = container.querySelector<HTMLButtonElement>("[data-action=connect]")!;
    connectionButton.click();
    await flushPromises();

    connectionButton.click();
    await flushPromises();
    connectionButton.click();
    await flushPromises();

    expect(session.dataDispose).toHaveBeenCalledTimes(1);
    expect(session.stateDispose).toHaveBeenCalledTimes(1);
    expect(manager.connect).toHaveBeenCalledTimes(2);
    expect(createTarget).toHaveBeenCalledTimes(3);
  });
});
