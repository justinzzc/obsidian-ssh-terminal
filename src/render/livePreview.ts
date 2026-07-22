import { StateField, type Extension, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  ViewPlugin,
  WidgetType
} from "@codemirror/view";
import { parseSshBlock } from "../block/parseSshBlock";
import { resolveSshConnectionTarget } from "../block/resolveSshConnectionTarget";
import type { SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { SessionManager } from "../ssh/SessionManager";
import { TerminalView, type TerminalViewOptions } from "../ui/TerminalView";

export interface DocumentRange {
  from: number;
  to: number;
}

export interface SshFenceBlock extends DocumentRange {
  source: string;
}

export interface LivePreviewDependencies {
  sourcePath(): string;
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
  manager: SessionManager;
  mountTerminal?: (container: HTMLElement, options: TerminalViewOptions) => {
    dispose(options?: { preserveSession?: boolean }): void | Promise<void>;
  };
}

/**
 * 逐行扫描 fenced code block，避免整篇正则在嵌套内容和未闭合围栏上产生回溯误判。
 * 光标或选区与块重叠时不返回该块，让用户直接编辑原始 Markdown。
 */
export function findSshBlocks(
  state: EditorState,
  selections: readonly DocumentRange[] = state.selection.ranges
): SshFenceBlock[] {
  const blocks: SshFenceBlock[] = [];
  let opening: { from: number; contentFrom: number } | undefined;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const marker = line.text.trim();
    if (!opening && marker === "```ssh") {
      opening = { from: line.from, contentFrom: Math.min(line.to + 1, state.doc.length) };
      continue;
    }
    if (opening && marker === "```") {
      const block = {
        from: opening.from,
        to: line.to,
        source: state.doc.sliceString(opening.contentFrom, Math.max(opening.contentFrom, line.from - 1))
      };
      if (!selections.some((selection) => overlaps(selection, block))) blocks.push(block);
      opening = undefined;
    }
  }

  return blocks;
}

/** 创建 Obsidian 实时预览使用的 CodeMirror block widget 扩展。 */
export function createLivePreviewExtension(dependencies: LivePreviewDependencies): Extension {
  const sessionIdsByView = new WeakMap<EditorView, Set<string>>();
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, dependencies, sessionIdsByView),
    update: (decorations, transaction) => {
      if (transaction.docChanged || transaction.selection) {
        return buildDecorations(transaction.state, dependencies, sessionIdsByView);
      }
      return decorations.map(transaction.changes);
    },
    // block decoration 会改变编辑器垂直布局，因此必须由 StateField 提供。
    provide: (field) => EditorView.decorations.from(field)
  });
  const lifecycle = ViewPlugin.define((view) => ({
    update: () => {
      const activeIds = new Set(
        findSshBlocks(view.state, []).map((block) => createInstanceId(dependencies, block))
      );
      const mountedIds = sessionIdsByView.get(view);
      if (!mountedIds) return;
      for (const instanceId of [...mountedIds]) {
        if (activeIds.has(instanceId)) continue;
        mountedIds.delete(instanceId);
        void dependencies.manager.close(instanceId);
      }
    },
    destroy: () => {
      const mountedIds = sessionIdsByView.get(view);
      sessionIdsByView.delete(view);
      if (!mountedIds) return;
      for (const instanceId of mountedIds) void dependencies.manager.close(instanceId);
    }
  }));
  return [decorations, lifecycle];
}

class SshTerminalWidget extends WidgetType {
  private mounted: {
    dispose(options?: { preserveSession?: boolean }): void | Promise<void>;
  } | undefined;

  constructor(
    private readonly block: SshFenceBlock,
    private readonly dependencies: LivePreviewDependencies,
    private readonly sessionIdsByView: WeakMap<EditorView, Set<string>>
  ) {
    super();
  }

  eq(other: SshTerminalWidget): boolean {
    return this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      this.block.source === other.block.source &&
      this.dependencies.sourcePath() === other.dependencies.sourcePath();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "ssh-terminal-live-preview";
    try {
      const config = parseSshBlock(this.block.source);
      const mountTerminal = this.dependencies.mountTerminal ?? TerminalView.mount;
      const instanceId = createInstanceId(this.dependencies, this.block);
      let sessionIds = this.sessionIdsByView.get(view);
      if (!sessionIds) {
        sessionIds = new Set();
        this.sessionIdsByView.set(view, sessionIds);
      }
      sessionIds.add(instanceId);
      this.mounted = mountTerminal(container, {
        instanceId,
        createTarget: () => resolveSshConnectionTarget(
          parseSshBlock(this.block.source),
          this.dependencies
        ),
        height: config.height,
        manager: this.dependencies.manager,
        returnFocus: () => view.focus(),
        resumeExistingSession: true
      });
    } catch (error) {
      const instanceId = createInstanceId(this.dependencies, this.block);
      this.sessionIdsByView.get(view)?.delete(instanceId);
      void this.dependencies.manager.close(instanceId);
      container.classList.add("ssh-terminal__error");
      container.textContent = error instanceof Error ? error.message : "Invalid SSH block.";
    }
    return container;
  }

  destroy(): void {
    // 编辑和重绘只拆除终端 UI；block 删除或编辑器销毁由 lifecycle 关闭会话。
    void this.mounted?.dispose({ preserveSession: true });
    this.mounted = undefined;
  }
}

function buildDecorations(
  state: EditorState,
  dependencies: LivePreviewDependencies,
  sessionIdsByView: WeakMap<EditorView, Set<string>>
): DecorationSet {
  const ranges = findSshBlocks(state).map((block) =>
    Decoration.replace({
      widget: new SshTerminalWidget(block, dependencies, sessionIdsByView),
      block: true
    }).range(block.from, block.to)
  );
  return Decoration.set(ranges, true);
}

function createInstanceId(
  dependencies: LivePreviewDependencies,
  block: SshFenceBlock
): string {
  return `${dependencies.sourcePath()}:live:${block.from}`;
}

function overlaps(left: DocumentRange, right: DocumentRange): boolean {
  return left.from <= right.to && left.to >= right.from;
}
