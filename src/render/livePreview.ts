import { StateField, type Extension, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
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
  mountTerminal?: (container: HTMLElement, options: TerminalViewOptions) => { dispose(): void | Promise<void> };
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
  return StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, dependencies),
    update: (decorations, transaction) => {
      if (transaction.docChanged || transaction.selection) {
        return buildDecorations(transaction.state, dependencies);
      }
      return decorations.map(transaction.changes);
    },
    // block decoration 会改变编辑器垂直布局，因此必须由 StateField 提供。
    provide: (field) => EditorView.decorations.from(field)
  });
}

class SshTerminalWidget extends WidgetType {
  private mounted: { dispose(): void | Promise<void> } | undefined;

  constructor(
    private readonly block: SshFenceBlock,
    private readonly dependencies: LivePreviewDependencies
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
      const target = resolveSshConnectionTarget(config, this.dependencies);
      const mountTerminal = this.dependencies.mountTerminal ?? TerminalView.mount;
      this.mounted = mountTerminal(container, {
        instanceId: `${this.dependencies.sourcePath()}:live:${this.block.from}:${this.block.to}`,
        target,
        height: config.height,
        manager: this.dependencies.manager,
        returnFocus: () => view.focus()
      });
    } catch (error) {
      container.classList.add("ssh-terminal__error");
      container.textContent = error instanceof Error ? error.message : "Invalid SSH block.";
    }
    return container;
  }

  destroy(): void {
    // CodeMirror 可能因编辑、切换文档或销毁编辑器调用这里，统一释放 SSH 会话。
    void this.mounted?.dispose();
    this.mounted = undefined;
  }
}

function buildDecorations(state: EditorState, dependencies: LivePreviewDependencies): DecorationSet {
  const ranges = findSshBlocks(state).map((block) =>
    Decoration.replace({
      widget: new SshTerminalWidget(block, dependencies),
      block: true
    }).range(block.from, block.to)
  );
  return Decoration.set(ranges, true);
}

function overlaps(left: DocumentRange, right: DocumentRange): boolean {
  return left.from <= right.to && left.to >= right.from;
}
