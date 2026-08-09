import { parseSshBlock } from "../block/parseSshBlock";
import type { SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { TerminalInstanceRegistry } from "../terminal/TerminalInstanceRegistry";
import {
  mountTerminalBlock,
  type TerminalBlockMountDependencies
} from "./TerminalBlockMount";
import { findSshBlocksInMarkdown } from "./findSshBlocksInMarkdown";

export interface ReadingRenderChild {
  load(): void;
  unload(): void;
  onunload(): void;
}

export interface ReadingRenderContext {
  sourcePath: string;
  addChild(child: ReadingRenderChild): void;
  getSectionInfo?(container: HTMLElement): { lineStart: number } | null;
}

export type ReadingBlockProcessor = (
  source: string,
  container: HTMLElement,
  context: ReadingRenderContext
) => void;

export interface ReadingViewPlugin {
  registerMarkdownCodeBlockProcessor(language: string, processor: ReadingBlockProcessor): void;
}

export interface ReadingViewDependencies {
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
  registry: TerminalInstanceRegistry;
  openTerminal(instanceId: string): Promise<void>;
  readSource?(sourcePath: string): Promise<string>;
  mountBlock?: (
    container: HTMLElement,
    dependencies: TerminalBlockMountDependencies
  ) => { dispose(): void };
}

/** 注册阅读视图中的 ```ssh 代码块处理器。 */
export function registerReadingView(
  plugin: ReadingViewPlugin,
  dependencies: ReadingViewDependencies
): void {
  const mountBlock = dependencies.mountBlock ?? mountTerminalBlock;

  plugin.registerMarkdownCodeBlockProcessor("ssh", (source, container, context) => {
    try {
      parseSshBlock(source);
    } catch (error) {
      renderError(container, error instanceof Error ? error.message : "Invalid SSH block.");
      return;
    }

    const child = new TerminalRenderChild();
    context.addChild(child);
    void resolveOccurrence(source, container, context, dependencies).then(
      (occurrence) => {
        if (child.isUnloaded()) return;
        child.setMount(mountBlock(container, {
          sourcePath: context.sourcePath,
          source,
          occurrence,
          profiles: dependencies.profiles,
          credentials: dependencies.credentials,
          registry: dependencies.registry,
          openTerminal: dependencies.openTerminal
        }));
      },
      (error: unknown) => {
        if (!child.isUnloaded()) {
          renderError(container, error instanceof Error ? error.message : "Unable to locate SSH block.");
        }
      }
    );
  });
}

async function resolveOccurrence(
  source: string,
  container: HTMLElement,
  context: ReadingRenderContext,
  dependencies: ReadingViewDependencies
): Promise<number> {
  const section = context.getSectionInfo?.(container);
  if (!section || !dependencies.readSource) return 0;
  const markdown = await dependencies.readSource(context.sourcePath);
  const block = findSshBlocksInMarkdown(markdown)
    .find((candidate) => candidate.lineStart === section.lineStart);
  if (!block || block.source !== source) {
    throw new Error("SSH block location changed while rendering.");
  }
  return block.occurrence;
}

class TerminalRenderChild implements ReadingRenderChild {
  private unloaded = false;
  private mount: { dispose(): void } | undefined;

  load(): void {}

  setMount(mount: { dispose(): void }): void {
    if (this.unloaded) {
      mount.dispose();
      return;
    }
    this.mount = mount;
  }

  isUnloaded(): boolean {
    return this.unloaded;
  }

  unload(): void {
    if (this.unloaded) return;
    this.unloaded = true;
    this.onunload();
  }

  onunload(): void {
    const mount = this.mount;
    this.mount = undefined;
    mount?.dispose();
  }
}

function renderError(container: HTMLElement, message: string): void {
  const error = document.createElement("div");
  error.className = "ssh-terminal__error";
  error.textContent = message;
  container.replaceChildren(error);
}
