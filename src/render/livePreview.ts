import { StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
  WidgetType
} from "@codemirror/view";
import type { SshProfile } from "../model";
import type { CredentialStore } from "../profile/CredentialStore";
import type { TerminalInstanceRegistry } from "../terminal/TerminalInstanceRegistry";
import { renderSshErrorNotice } from "../ui/SshErrorNotice";
import {
  mountTerminalBlock,
  type TerminalBlockMountDependencies
} from "./TerminalBlockMount";
import { findSshBlocksInMarkdown } from "./findSshBlocksInMarkdown";

export interface DocumentRange {
  from: number;
  to: number;
}

export interface SshFenceBlock extends DocumentRange {
  source: string;
  lineStart: number;
  occurrence: number;
}

export interface LivePreviewDependencies {
  sourcePath(): string;
  profiles: { get(profileId: string): SshProfile | undefined };
  credentials: CredentialStore;
  registry: TerminalInstanceRegistry;
  openTerminal(instanceId: string): Promise<void>;
  mountBlock?: (
    container: HTMLElement,
    dependencies: TerminalBlockMountDependencies
  ) => { dispose(): void };
}

export function findSshBlocks(
  state: EditorState,
  selections: readonly DocumentRange[] = state.selection.ranges
): SshFenceBlock[] {
  return findSshBlocksInMarkdown(state.doc.toString())
    .filter((block) => !selections.some((selection) => overlaps(selection, block)))
    .map(({ from, to, source, lineStart, occurrence }) => ({
      from,
      to,
      source,
      lineStart,
      occurrence
    }));
}

/** 创建 Obsidian 实时预览使用的 CodeMirror block widget 扩展。 */
export function createLivePreviewExtension(dependencies: LivePreviewDependencies): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, dependencies),
    update: (current, transaction) => {
      if (transaction.docChanged || transaction.selection) {
        return buildDecorations(transaction.state, dependencies);
      }
      return current.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field)
  });
  return [decorations];
}

class SshTerminalWidget extends WidgetType {
  private mounted: { dispose(): void } | undefined;

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
      this.block.occurrence === other.block.occurrence &&
      this.dependencies.sourcePath() === other.dependencies.sourcePath();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "ssh-terminal-live-preview";
    try {
      const mountBlock = this.dependencies.mountBlock ?? mountTerminalBlock;
      this.mounted = mountBlock(container, {
        sourcePath: this.dependencies.sourcePath(),
        source: this.block.source,
        occurrence: this.block.occurrence,
        profiles: this.dependencies.profiles,
        credentials: this.dependencies.credentials,
        registry: this.dependencies.registry,
        openTerminal: this.dependencies.openTerminal,
        returnFocus: () => view.focus()
      });
    } catch (error) {
      renderSshErrorNotice(container, {
        title: "Unable to start SSH terminal",
        error,
        fallbackMessage: "Invalid SSH block."
      });
    }
    return container;
  }

  destroy(): void {
    this.mounted?.dispose();
    this.mounted = undefined;
  }
}

function buildDecorations(
  state: EditorState,
  dependencies: LivePreviewDependencies
): DecorationSet {
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
