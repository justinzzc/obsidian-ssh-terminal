import {
  ItemView,
  type ViewStateResult,
  type WorkspaceLeaf
} from "../settings/obsidianApi";
import type { Disposable } from "../ssh/SshClientAdapter";
import type { TerminalInstanceRegistry } from "../terminal/TerminalInstanceRegistry";
import { renderSshErrorNotice } from "./SshErrorNotice";
import { SSH_TERMINAL_VIEW_TYPE } from "./TerminalWorkspaceController";

interface TerminalItemWorkspaceController {
  openSource(instanceId: string): Promise<void>;
  forgetTerminalLeaf(instanceId: string, leaf: WorkspaceLeaf): void;
}

export class PersistentTerminalItemView extends ItemView {
  private instanceId: string | undefined;
  private hostRegistration: Disposable | undefined;
  private subscription: Disposable | undefined;
  private readonly header = document.createElement("div");
  private readonly terminalHost = document.createElement("div");

  constructor(
    leaf: WorkspaceLeaf,
    private readonly registry: TerminalInstanceRegistry,
    private readonly controller: TerminalItemWorkspaceController
  ) {
    super(leaf);
    this.header.className = "ssh-terminal-item-view__header";
    this.terminalHost.className = "ssh-terminal-item-view__terminal";
    this.containerEl.className = "ssh-terminal-item-view";
    this.containerEl.replaceChildren(this.header, this.terminalHost);
  }

  getViewType(): string {
    return SSH_TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    const instance = this.instanceId ? this.registry.get(this.instanceId) : undefined;
    return instance?.displayName ?? "SSH Terminal";
  }

  async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    const instanceId = readInstanceId(state);
    if (!instanceId) return;
    if (this.instanceId && this.instanceId !== instanceId) this.detachInstance();
    this.instanceId = instanceId;
  }

  async onOpen(): Promise<void> {
    this.attachInstance();
  }

  async onClose(): Promise<void> {
    const instanceId = this.instanceId;
    this.detachInstance();
    if (instanceId) this.controller.forgetTerminalLeaf(instanceId, this.leaf);
  }

  private attachInstance(): void {
    const instanceId = this.instanceId;
    if (!instanceId) {
      this.renderUnavailable();
      return;
    }
    this.hostRegistration = this.registry.registerHost(instanceId, {
      id: `terminal-tab:${instanceId}`,
      kind: "terminal-tab",
      container: this.terminalHost
    });
    this.subscription = this.registry.subscribe(() => this.render());
    this.render();
  }

  private detachInstance(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
    this.hostRegistration?.dispose();
    this.hostRegistration = undefined;
  }

  private render(): void {
    const instanceId = this.instanceId;
    const instance = instanceId ? this.registry.get(instanceId) : undefined;
    if (!instance || !instanceId) {
      this.renderUnavailable();
      return;
    }
    this.header.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = instance.displayName;
    const source = document.createElement("span");
    source.textContent = instance.origin.sourcePath;
    this.header.append(
      title,
      source,
      actionButton("Open source", "open-source", () => {
        void this.controller.openSource(instanceId);
      }),
      actionButton("Clear", "clear", () => this.registry.clear(instanceId)),
      actionButton("Disconnect", "disconnect", () => {
        void this.registry.disconnect(instanceId);
      })
    );

    const hostId = `terminal-tab:${instanceId}`;
    const activeHere = instance.location.kind === "terminal-tab" &&
      instance.location.hostId === hostId;
    if (activeHere) return;
    const placeholder = document.createElement("div");
    placeholder.className = "ssh-terminal-placeholder";
    placeholder.textContent = instance.location.kind === "document"
      ? `Currently active in ${instance.origin.sourcePath}`
      : "SSH session is running in the background.";
    placeholder.append(actionButton("Activate here", "activate-here", () => {
      this.registry.activate(instanceId, hostId);
      this.registry.focus(instanceId);
    }));
    this.terminalHost.replaceChildren(placeholder);
  }

  private renderUnavailable(): void {
    this.header.replaceChildren();
    renderSshErrorNotice(this.terminalHost, {
      title: "SSH terminal unavailable",
      error: new Error("SSH terminal instance is no longer available."),
      fallbackMessage: "SSH terminal instance is no longer available."
    });
  }
}

function readInstanceId(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as { instanceId?: unknown }).instanceId;
  return typeof value === "string" && value !== "" ? value : undefined;
}

function actionButton(label: string, action: string, callback: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.addEventListener("click", callback);
  return button;
}
