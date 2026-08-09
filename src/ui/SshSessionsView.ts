import { ItemView, type WorkspaceLeaf } from "../settings/obsidianApi";
import type { Disposable } from "../ssh/SshClientAdapter";
import type {
  TerminalInstanceRegistry,
  TerminalInstanceSnapshot
} from "../terminal/TerminalInstanceRegistry";
import { SSH_SESSIONS_VIEW_TYPE } from "./TerminalWorkspaceController";

interface SessionsWorkspaceController {
  openTerminal(instanceId: string): Promise<void>;
  openSource(instanceId: string): Promise<void>;
}

export class SshSessionsView extends ItemView {
  private subscription: Disposable | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly registry: TerminalInstanceRegistry,
    private readonly controller: SessionsWorkspaceController
  ) {
    super(leaf);
  }

  getViewType(): string {
    return SSH_SESSIONS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "SSH Sessions";
  }

  async onOpen(): Promise<void> {
    this.render();
    this.subscription = this.registry.subscribe(() => this.render());
  }

  async onClose(): Promise<void> {
    this.subscription?.dispose();
    this.subscription = undefined;
  }

  private render(): void {
    this.containerEl.className = "ssh-sessions-view";
    const instances = this.registry.list();
    if (instances.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ssh-sessions-view__empty";
      empty.textContent = "No SSH sessions";
      this.containerEl.replaceChildren(empty);
      return;
    }
    this.containerEl.replaceChildren(...instances.map((instance) => this.renderItem(instance)));
  }

  private renderItem(instance: TerminalInstanceSnapshot): HTMLElement {
    const item = document.createElement("div");
    item.className = "ssh-session-item";
    const header = document.createElement("div");
    header.className = "ssh-session-item__header";
    const name = document.createElement("strong");
    name.textContent = instance.displayName;
    const status = document.createElement("span");
    status.textContent = capitalize(instance.status);
    header.append(name, status);

    const meta = document.createElement("div");
    meta.className = "ssh-session-item__meta";
    meta.textContent = `${instance.origin.sourcePath} · ${formatLocation(instance.location.kind)}`;

    const actions = document.createElement("div");
    actions.className = "ssh-session-item__actions";
    actions.append(
      actionButton("Open terminal", "open-terminal", () => {
        void this.controller.openTerminal(instance.id);
      }),
      actionButton("Open source", "open-source", () => {
        void this.controller.openSource(instance.id);
      })
    );
    if (instance.status === "connected" || instance.status === "connecting") {
      actions.append(actionButton("Disconnect", "disconnect", () => {
        void this.registry.disconnect(instance.id);
      }));
    } else {
      actions.append(
        actionButton("Reconnect", "reconnect", () => {
          void this.registry.reconnect(instance.id);
        }),
        actionButton("Remove", "remove", () => this.registry.remove(instance.id))
      );
    }
    item.append(header, meta, actions);
    return item;
  }
}

function actionButton(label: string, action: string, callback: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.addEventListener("click", callback);
  return button;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatLocation(kind: "document" | "terminal-tab" | "background"): string {
  if (kind === "terminal-tab") return "Terminal tab";
  if (kind === "document") return "Document";
  return "Background";
}
