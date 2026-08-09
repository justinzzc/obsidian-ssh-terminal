import { parseSshBlock } from "../block/parseSshBlock";
import { resolveSshConnectionTarget } from "../block/resolveSshConnectionTarget";
import type { SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { Disposable } from "../ssh/SshClientAdapter";
import type {
  PreparedTerminalInstance,
  TerminalInstanceRegistry
} from "../terminal/TerminalInstanceRegistry";
import { createTerminalOrigin } from "../terminal/TerminalOrigin";

export interface TerminalBlockMountDependencies {
  sourcePath: string;
  source: string;
  occurrence: number;
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
  registry: TerminalInstanceRegistry;
  openTerminal(instanceId: string): Promise<void>;
  returnFocus?: () => void;
}

let nextDocumentHostId = 1;

export function mountTerminalBlock(
  container: HTMLElement,
  dependencies: TerminalBlockMountDependencies
): { dispose(): void } {
  const config = parseSshBlock(dependencies.source);
  const origin = createTerminalOrigin(
    dependencies.sourcePath,
    config,
    dependencies.occurrence
  );
  const hostId = `document:${origin.sourcePath}:${origin.blockKey}:${nextDocumentHostId++}`;
  let disposed = false;
  let activated = false;
  let hostDisposable: Disposable | undefined;
  let prepared: PreparedTerminalInstance | undefined;

  const subscription = dependencies.registry.subscribe(() => render());

  const render = (): void => {
    if (disposed || activated) return;
    const instance = dependencies.registry.findByOrigin(origin);
    if (!instance) {
      prepared ??= dependencies.registry.prepare({
        origin,
        createTarget: () => resolveSshConnectionTarget(
          parseSshBlock(dependencies.source),
          dependencies
        ),
        height: config.height
      });
      hostDisposable ??= prepared.attach({
        id: hostId,
        kind: "document",
        container
      });
      return;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "ssh-terminal-placeholder";
    const title = document.createElement("strong");
    title.textContent = instance.displayName;
    const meta = document.createElement("span");
    meta.textContent = `${capitalize(instance.status)} · ${formatLocation(instance.location.kind)}`;
    const actions = document.createElement("div");
    actions.className = "ssh-terminal-placeholder__actions";
    actions.append(
      button("Activate", "activate", () => {
        activated = true;
        hostDisposable = dependencies.registry.registerHost(instance.id, {
          id: hostId,
          kind: "document",
          container
        });
        dependencies.registry.activate(instance.id, hostId);
      }),
      button("Open terminal", "open-terminal", () => {
        void dependencies.openTerminal(instance.id);
      })
    );
    if (instance.status === "disconnected" || instance.status === "failed") {
      actions.append(
        button("Reconnect", "reconnect", () => {
          void dependencies.registry.reconnect(instance.id);
        }),
        button("Remove", "remove", () => {
          dependencies.registry.remove(instance.id);
          prepared = undefined;
          render();
        })
      );
    }
    placeholder.append(title, meta, actions);
    container.replaceChildren(placeholder);
  };

  render();

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      subscription.dispose();
      hostDisposable?.dispose();
      prepared?.disposeIfUnused();
    }
  };
}

function button(
  label: string,
  action: string,
  handler: () => void
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset.action = action;
  element.addEventListener("click", handler);
  return element;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatLocation(kind: "document" | "terminal-tab" | "background"): string {
  if (kind === "terminal-tab") return "Terminal tab";
  if (kind === "document") return "Document";
  return "Background";
}
