import { parseSshBlock } from "../block/parseSshBlock";
import type { SshProfile } from "../model";
import type { SessionManager } from "../ssh/SessionManager";
import { TerminalView, type TerminalViewOptions } from "../ui/TerminalView";

export interface ReadingRenderChild {
  onunload(): void;
}

export interface ReadingRenderContext {
  sourcePath: string;
  addChild(child: ReadingRenderChild): void;
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
  manager: SessionManager;
  mountTerminal?: (container: HTMLElement, options: TerminalViewOptions) => { dispose(): void | Promise<void> };
}

let nextInstanceId = 0;

/** 注册阅读视图中的 ```ssh 代码块处理器。 */
export function registerReadingView(
  plugin: ReadingViewPlugin,
  dependencies: ReadingViewDependencies
): void {
  const mountTerminal = dependencies.mountTerminal ?? TerminalView.mount;

  plugin.registerMarkdownCodeBlockProcessor("ssh", (source, container, context) => {
    try {
      const block = parseSshBlock(source);
      const profile = dependencies.profiles.get(block.profileId);
      if (!profile) {
        renderError(container, `SSH profile not found: ${block.profileId}`);
        return;
      }

      // sourcePath 与单调计数器共同标识本次渲染，避免同文档多块共享会话。
      const instanceId = `${context.sourcePath}:reading:${nextInstanceId++}`;
      const terminal = mountTerminal(container, {
        instanceId,
        profile,
        height: block.height,
        manager: dependencies.manager
      });
      context.addChild({
        onunload: () => {
          void terminal.dispose();
        }
      });
    } catch (error) {
      renderError(container, error instanceof Error ? error.message : "Invalid SSH block.");
    }
  });
}

function renderError(container: HTMLElement, message: string): void {
  const error = document.createElement("div");
  error.className = "ssh-terminal__error";
  error.textContent = message;
  container.replaceChildren(error);
}
