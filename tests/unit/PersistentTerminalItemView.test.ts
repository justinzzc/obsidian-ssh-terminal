// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));
import { WorkspaceLeaf } from "../mocks/obsidian";
import { PersistentTerminalItemView } from "../../src/ui/PersistentTerminalItemView";

function makeView(location: "background" | "document" | "terminal-tab" = "background") {
  const hostDisposable = { dispose: vi.fn() };
  const registry = {
    get: vi.fn(() => ({
      id: "instance-1",
      displayName: "Production",
      origin: { sourcePath: "ops/server.md", blockKey: "profile:prod:0" },
      sourceAvailable: true,
      status: "connected",
      location: location === "background"
        ? { kind: "background" }
        : { kind: location, hostId: `${location}:one` },
      lastActiveAt: 10
    })),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    registerHost: vi.fn(() => hostDisposable),
    activate: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
    disconnect: vi.fn(async () => undefined)
  };
  const controller = {
    openSource: vi.fn(async () => undefined),
    forgetTerminalLeaf: vi.fn()
  };
  const leaf = new WorkspaceLeaf();
  const view = new PersistentTerminalItemView(
    leaf as never,
    registry as never,
    controller as never
  );
  return { view, registry, controller, hostDisposable, leaf };
}

describe("PersistentTerminalItemView", () => {
  it("registers a terminal host and activates it on demand", async () => {
    const { view, registry } = makeView();
    await view.setState({ instanceId: "instance-1" }, { history: false } as never);
    await view.onOpen();

    expect(registry.registerHost).toHaveBeenCalledOnce();
    view.containerEl.querySelector<HTMLButtonElement>('[data-action="activate-here"]')!.click();
    expect(registry.activate).toHaveBeenCalledWith(
      "instance-1",
      "terminal-tab:instance-1"
    );
  });

  it("closes only the host and never disconnects the session", async () => {
    const { view, registry, controller, hostDisposable, leaf } = makeView();
    await view.setState({ instanceId: "instance-1" }, { history: false } as never);
    await view.onOpen();

    await view.onClose();

    expect(hostDisposable.dispose).toHaveBeenCalledOnce();
    expect(registry.disconnect).not.toHaveBeenCalled();
    expect(controller.forgetTerminalLeaf).toHaveBeenCalledWith("instance-1", leaf);
  });
});
