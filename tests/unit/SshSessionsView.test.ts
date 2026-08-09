// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));
import { WorkspaceLeaf } from "../mocks/obsidian";
import { SshSessionsView } from "../../src/ui/SshSessionsView";

function makeView(instances: unknown[] = []) {
  const registry = {
    list: vi.fn(() => instances),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    disconnect: vi.fn(async () => undefined),
    reconnect: vi.fn(async () => undefined),
    remove: vi.fn()
  };
  const controller = {
    openTerminal: vi.fn(async () => undefined),
    openSource: vi.fn(async () => undefined)
  };
  const view = new SshSessionsView(
    new WorkspaceLeaf() as never,
    registry as never,
    controller as never
  );
  return { view, registry, controller };
}

describe("SshSessionsView", () => {
  it("renders an empty state", async () => {
    const { view } = makeView();
    await view.onOpen();
    expect(view.containerEl.textContent).toContain("No SSH sessions");
  });

  it("renders source metadata and routes item actions", async () => {
    const { view, registry, controller } = makeView([{
      id: "instance-1",
      displayName: "Production",
      origin: { sourcePath: "ops/server.md", blockKey: "profile:prod:0" },
      sourceAvailable: true,
      status: "connected",
      location: { kind: "background" },
      lastActiveAt: 10
    }]);
    await view.onOpen();

    expect(view.containerEl.textContent).toContain("Production");
    expect(view.containerEl.textContent).toContain("ops/server.md");
    view.containerEl.querySelector<HTMLButtonElement>('[data-action="open-terminal"]')!.click();
    view.containerEl.querySelector<HTMLButtonElement>('[data-action="open-source"]')!.click();
    view.containerEl.querySelector<HTMLButtonElement>('[data-action="disconnect"]')!.click();

    expect(controller.openTerminal).toHaveBeenCalledWith("instance-1");
    expect(controller.openSource).toHaveBeenCalledWith("instance-1");
    expect(registry.disconnect).toHaveBeenCalledWith("instance-1");
    expect(view.containerEl.querySelector('[data-action="remove"]')).toBeNull();
  });
});
