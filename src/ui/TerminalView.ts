import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { SshProfile } from "../model";
import type { Disposable } from "../ssh/SshClientAdapter";
import type { ManagedSession } from "../ssh/SessionManager";
import { ObsidianTerminalThemeSync } from "./ObsidianTerminalThemeSync";

export interface TerminalAdapter {
  readonly rows: number;
  readonly cols: number;
  open(container: HTMLElement): void;
  write(data: string): void;
  clear(): void;
  fit(): void;
  focus(): void;
  dispose(): void;
  onData(handler: (data: string) => void): Disposable;
}

export interface TerminalSessionManager {
  connect(instanceId: string, profileId: string): Promise<Pick<ManagedSession, "onData" | "onStateChange">>;
  write(instanceId: string, data: string): void;
  resize(instanceId: string, rows: number, cols: number, height: number, width: number): void;
  close(instanceId: string): Promise<void>;
}

export interface TerminalViewOptions {
  instanceId: string;
  profile: SshProfile;
  height: number;
  manager: TerminalSessionManager;
  terminalFactory?: () => TerminalAdapter;
  returnFocus?: () => void;
}

/** 阅读视图和实时预览共用的终端 DOM 组件。 */
export class TerminalView {
  static mount(container: HTMLElement, options: TerminalViewOptions): TerminalView {
    return new TerminalView(container, options);
  }

  private readonly terminal: TerminalAdapter;
  private readonly root: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly error: HTMLDivElement;
  private readonly connectButton: HTMLButtonElement;
  private readonly disconnectButton: HTMLButtonElement;
  private readonly disposables: Disposable[] = [];
  private connecting: Promise<void> | undefined;
  private disposePromise: Promise<void> | undefined;
  private resizeObserver: ResizeObserver | undefined;

  private constructor(
    container: HTMLElement,
    private readonly options: TerminalViewOptions
  ) {
    this.terminal = (options.terminalFactory ?? createXtermAdapter)();
    this.root = document.createElement("div");
    this.root.className = "ssh-terminal";
    this.root.style.height = `${options.height}px`;
    this.root.tabIndex = -1;

    const toolbar = document.createElement("div");
    toolbar.className = "ssh-terminal__toolbar";
    this.status = document.createElement("span");
    this.status.className = "ssh-terminal__status";
    this.status.textContent = `${options.profile.username}@${options.profile.host}:${options.profile.port} · Disconnected`;
    toolbar.append(this.status);

    this.connectButton = createButton("Connect", "connect", () => void this.connect());
    this.disconnectButton = createButton("Disconnect", "disconnect", () => void this.disconnect());
    this.disconnectButton.disabled = true;
    toolbar.append(
      this.connectButton,
      this.disconnectButton,
      createButton("Reconnect", "reconnect", () => void this.reconnect()),
      createButton("Clear", "clear", () => this.terminal.clear())
    );

    this.error = document.createElement("div");
    this.error.className = "ssh-terminal__error";
    this.error.hidden = true;
    const terminalContainer = document.createElement("div");
    terminalContainer.className = "ssh-terminal__screen";
    this.root.append(toolbar, this.error, terminalContainer);
    container.replaceChildren(this.root);
    this.terminal.open(terminalContainer);

    // xterm 输入只交给当前渲染实例；未连接时 SessionManager 会安全忽略。
    this.disposables.push(this.terminal.onData((data) => options.manager.write(options.instanceId, data)));
    this.root.addEventListener("keydown", this.onKeyDown);
    this.installResizeObserver(terminalContainer);
  }

  dispose(): Promise<void> {
    // 缓存清理 Promise，防止 CodeMirror 销毁和文档关闭同时重复释放资源。
    this.disposePromise ??= this.performDispose();
    return this.disposePromise;
  }

  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.error.hidden = true;
    this.connectButton.disabled = true;
    this.status.textContent = "Connecting…";
    this.connecting = this.options.manager.connect(this.options.instanceId, this.options.profile.id).then(
      (session) => {
        this.disposables.push(
          session.onData((data) => this.terminal.write(data)),
          session.onStateChange((state) => {
            this.status.textContent = state === "connected" ? "Connected" : state;
          })
        );
        this.status.textContent = "Connected";
        this.disconnectButton.disabled = false;
        this.terminal.focus();
        this.fit();
      },
      (error: unknown) => {
        this.showError(error);
        this.connectButton.disabled = false;
      }
    ).finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async disconnect(): Promise<void> {
    await this.options.manager.close(this.options.instanceId);
    this.status.textContent = "Disconnected";
    this.connectButton.disabled = false;
    this.disconnectButton.disabled = true;
  }

  private async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  private async performDispose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.root.removeEventListener("keydown", this.onKeyDown);
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    await this.options.manager.close(this.options.instanceId);
    this.terminal.dispose();
    this.root.remove();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.options.returnFocus?.();
  };

  private installResizeObserver(container: HTMLElement): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);
  }

  private fit(): void {
    // 先让 xterm 计算行列数，再把同一尺寸同步给远端 PTY。
    this.terminal.fit();
    this.options.manager.resize(
      this.options.instanceId,
      this.terminal.rows,
      this.terminal.cols,
      this.root.clientHeight,
      this.root.clientWidth
    );
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : "SSH connection failed.";
    this.error.textContent = message;
    this.error.hidden = false;
    this.status.textContent = "Failed";
  }
}

class XtermAdapter implements TerminalAdapter {
  private readonly terminal = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: "var(--font-monospace)"
  });
  private readonly fitAddon = new FitAddon();
  private themeSync: ObsidianTerminalThemeSync | undefined;

  constructor() {
    this.terminal.loadAddon(this.fitAddon);
  }

  get rows(): number { return this.terminal.rows; }
  get cols(): number { return this.terminal.cols; }
  open(container: HTMLElement): void {
    // xterm 使用 Canvas/DOM 自己绘制文字，必须把 Obsidian 计算后的主题色显式传入。
    this.themeSync = new ObsidianTerminalThemeSync(container, this.terminal);
    this.themeSync.start();
    this.terminal.open(container);
  }
  write(data: string): void { this.terminal.write(data); }
  clear(): void { this.terminal.clear(); }
  fit(): void { this.fitAddon.fit(); }
  focus(): void { this.terminal.focus(); }
  dispose(): void {
    this.themeSync?.dispose();
    this.themeSync = undefined;
    this.terminal.dispose();
  }
  onData(handler: (data: string) => void): Disposable { return this.terminal.onData(handler); }
}

function createXtermAdapter(): TerminalAdapter {
  return new XtermAdapter();
}

function createButton(label: string, action: string, handler: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.addEventListener("click", handler);
  return button;
}
