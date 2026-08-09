// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));
import { App, WorkspaceLeaf } from "../mocks/obsidian";
import {
  SSH_SESSIONS_VIEW_TYPE,
  SSH_TERMINAL_VIEW_TYPE,
  TerminalWorkspaceController
} from "../../src/ui/TerminalWorkspaceController";

function makeController() {
  const sessionLeaf = new WorkspaceLeaf();
  const terminalLeaf = new WorkspaceLeaf();
  const leavesByType = new Map<string, WorkspaceLeaf[]>();
  const workspace = {
    getLeavesOfType: vi.fn((type: string) => leavesByType.get(type) ?? []),
    getLeftLeaf: vi.fn(() => sessionLeaf),
    getLeaf: vi.fn(() => terminalLeaf),
    revealLeaf: vi.fn(async () => undefined),
    openLinkText: vi.fn(async () => undefined)
  };
  const registry = {
    get: vi.fn(() => ({
      id: "instance-1",
      origin: { sourcePath: "ops/server.md", blockKey: "profile:prod:0" },
      sourceAvailable: true
    })),
    requestSourceActivation: vi.fn()
  };
  const controller = new TerminalWorkspaceController(
    new App(workspace) as never,
    registry as never
  );
  return { controller, workspace, registry, sessionLeaf, terminalLeaf, leavesByType };
}

describe("TerminalWorkspaceController", () => {
  it("creates one sessions leaf and reuses it", async () => {
    const { controller, workspace, sessionLeaf, leavesByType } = makeController();

    await controller.openSessions();
    leavesByType.set(SSH_SESSIONS_VIEW_TYPE, [sessionLeaf]);
    await controller.openSessions();

    expect(workspace.getLeftLeaf).toHaveBeenCalledOnce();
    expect(sessionLeaf.state).toEqual({ type: SSH_SESSIONS_VIEW_TYPE, active: true });
    expect(workspace.revealLeaf).toHaveBeenCalledTimes(2);
  });

  it("reuses the terminal leaf for the same instance", async () => {
    const { controller, workspace, terminalLeaf } = makeController();

    await controller.openTerminal("instance-1");
    await controller.openTerminal("instance-1");

    expect(workspace.getLeaf).toHaveBeenCalledOnce();
    expect(terminalLeaf.state).toEqual({
      type: SSH_TERMINAL_VIEW_TYPE,
      active: true,
      state: { instanceId: "instance-1" }
    });
    expect(workspace.revealLeaf).toHaveBeenCalledTimes(2);
  });

  it("requests source activation before opening the source document", async () => {
    const { controller, workspace, registry } = makeController();

    await controller.activateInSource("instance-1");

    expect(registry.requestSourceActivation).toHaveBeenCalledWith("instance-1");
    expect(workspace.openLinkText).toHaveBeenCalledWith("ops/server.md", "", false);
  });
});
