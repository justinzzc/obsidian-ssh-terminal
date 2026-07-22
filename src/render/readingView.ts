import { parseSshBlock } from "../block/parseSshBlock";
import { resolveSshConnectionTarget } from "../block/resolveSshConnectionTarget";
import type { SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { SessionManager } from "../ssh/SessionManager";
import { TerminalView, type TerminalViewOptions } from "../ui/TerminalView";

export interface ReadingRenderChild {
  load(): void;
  unload(): void;
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
  credentials: CredentialStore;
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
      const target = resolveSshConnectionTarget(block, dependencies);

      // sourcePath 与单调计数器共同标识本次渲染，避免同文档多块共享会话。
      const instanceId = `${context.sourcePath}:reading:${nextInstanceId++}`;
      const terminal = mountTerminal(container, {
        instanceId,
        target,
        height: block.height,
        manager: dependencies.manager
      });
      // MarkdownRenderContext.addChild 只接受 Obsidian Component；普通对象缺少 load()，
      // 会在阅读视图初始化时直接抛错并把已经挂载的终端替换成错误块。
      context.addChild(new TerminalRenderChild(terminal));
    } catch (error) {
      renderError(container, error instanceof Error ? error.message : "Invalid SSH block.");
    }
  });
}

/** 把终端清理逻辑接入 Obsidian 的 Component 生命周期。 */
class TerminalRenderChild implements ReadingRenderChild {
  private unloaded = false;
  private terminal: { dispose(): void | Promise<void> } | undefined;

  constructor(terminal: { dispose(): void | Promise<void> }) {
    this.terminal = terminal;
  }

  /** Obsidian addChild() 会立即调用 load；本适配器没有额外的加载动作。 */
  load(): void {}

  /** 模拟 Component 的幂等卸载语义，避免同一终端重复释放。 */
  unload(): void {
    if (this.unloaded) return;
    this.unloaded = true;
    this.onunload();
  }

  onunload(): void {
    const terminal = this.terminal;
    this.terminal = undefined;
    void terminal?.dispose();
  }
}

function renderError(container: HTMLElement, message: string): void {
  const error = document.createElement("div");
  error.className = "ssh-terminal__error";
  error.textContent = message;
  container.replaceChildren(error);
}
