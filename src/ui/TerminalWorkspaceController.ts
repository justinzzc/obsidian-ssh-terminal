import { Notice, type App, type WorkspaceLeaf } from "../settings/obsidianApi";
import type { TerminalInstanceRegistry } from "../terminal/TerminalInstanceRegistry";

export const SSH_SESSIONS_VIEW_TYPE = "ssh-terminal-sessions";
export const SSH_TERMINAL_VIEW_TYPE = "ssh-terminal-instance";

export class TerminalWorkspaceController {
  private readonly terminalLeaves = new Map<string, WorkspaceLeaf>();

  constructor(
    private readonly app: App,
    private readonly registry: TerminalInstanceRegistry
  ) {}

  async openSessions(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SSH_SESSIONS_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) {
      new Notice("Unable to open SSH Sessions.");
      return;
    }
    if (!existing) {
      await leaf.setViewState({ type: SSH_SESSIONS_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async openTerminal(instanceId: string): Promise<void> {
    let leaf = this.terminalLeaves.get(instanceId);
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      this.terminalLeaves.set(instanceId, leaf);
      await leaf.setViewState({
        type: SSH_TERMINAL_VIEW_TYPE,
        active: true,
        state: { instanceId }
      });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async openSource(instanceId: string): Promise<void> {
    const instance = this.registry.get(instanceId);
    if (!instance || !instance.sourceAvailable) {
      new Notice("The source document is no longer available.");
      return;
    }
    await this.app.workspace.openLinkText(instance.origin.sourcePath, "", false);
  }

  async activateInSource(instanceId: string): Promise<void> {
    const instance = this.registry.get(instanceId);
    if (!instance || !instance.sourceAvailable) {
      new Notice("The source document is no longer available.");
      return;
    }
    this.registry.requestSourceActivation(instanceId);
    await this.app.workspace.openLinkText(instance.origin.sourcePath, "", false);
  }

  forgetTerminalLeaf(instanceId: string, leaf: WorkspaceLeaf): void {
    if (this.terminalLeaves.get(instanceId) === leaf) {
      this.terminalLeaves.delete(instanceId);
    }
  }
}
