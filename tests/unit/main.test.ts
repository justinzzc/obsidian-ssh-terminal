import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, Plugin, WorkspaceLeaf } from "../mocks/obsidian";

vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  }
}));
vi.mock("../../src/ui/TerminalView", () => ({
  TerminalView: { mount: vi.fn() }
}));
vi.mock("../../src/ui/HostKeyConfirmModal", () => ({
  confirmHostKey: vi.fn()
}));
vi.mock("../../src/settings/SshSettingsTab", () => ({
  SshSettingsTab: class {}
}));

import SshTerminalPlugin from "../../src/main";
import { TerminalInstanceRegistry } from "../../src/terminal/TerminalInstanceRegistry";

class VaultStub {
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();

  on(event: string, handler: (...args: never[]) => void): { dispose(): void } {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return { dispose: () => undefined };
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args as never[]);
    }
  }

  getAbstractFileByPath(path: string): { path: string } | null {
    return { path };
  }

  async cachedRead(file: { path: string }): Promise<string> {
    return `source:${file.path}`;
  }
}

function createWorkspace() {
  return {
    getActiveFile: vi.fn(() => ({ path: "notes/source.md" })),
    getLeavesOfType: vi.fn(() => []),
    getLeftLeaf: vi.fn(() => new WorkspaceLeaf()),
    getLeaf: vi.fn(() => new WorkspaceLeaf()),
    revealLeaf: vi.fn(async () => undefined),
    openLinkText: vi.fn(async () => undefined)
  };
}

describe("SshTerminalPlugin workspace wiring", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("registers the sessions ribbon and both workspace views", async () => {
    const plugin = new SshTerminalPlugin(
      new App(createWorkspace(), new VaultStub()) as never,
      {} as never
    ) as unknown as Plugin;

    await (plugin as unknown as SshTerminalPlugin).onload();

    expect(plugin.registerView).toHaveBeenCalledWith(
      "ssh-terminal-sessions",
      expect.any(Function)
    );
    expect(plugin.registerView).toHaveBeenCalledWith(
      "ssh-terminal-instance",
      expect.any(Function)
    );
    expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
      "square-terminal",
      "SSH Sessions",
      expect.any(Function)
    );
  });

  it("renames and invalidates instance origins from vault events", async () => {
    const vault = new VaultStub();
    const renameSource = vi.spyOn(TerminalInstanceRegistry.prototype, "renameSource");
    const markSourceUnavailable = vi.spyOn(TerminalInstanceRegistry.prototype, "markSourceUnavailable");
    const plugin = new SshTerminalPlugin(new App(createWorkspace(), vault) as never, {} as never);

    await plugin.onload();
    vault.emit("rename", { path: "new.md" }, "old.md");
    vault.emit("delete", { path: "new.md" });

    expect(renameSource).toHaveBeenCalledWith("old.md", "new.md");
    expect(markSourceUnavailable).toHaveBeenCalledWith("new.md");
  });

  it("closes every runtime terminal instance on unload", async () => {
    const closeAll = vi.spyOn(TerminalInstanceRegistry.prototype, "closeAll")
      .mockResolvedValue(undefined);
    const plugin = new SshTerminalPlugin(
      new App(createWorkspace(), new VaultStub()) as never,
      {} as never
    );

    await plugin.onload();
    await plugin.onunload();

    expect(closeAll).toHaveBeenCalledOnce();
  });
});
