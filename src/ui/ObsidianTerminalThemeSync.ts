import type { ITheme } from "@xterm/xterm";

interface ThemeAwareTerminal {
  options: { theme?: ITheme };
}

/** 从 Obsidian 计算样式中提取 xterm 可直接使用的颜色。 */
export function readObsidianTerminalTheme(container: HTMLElement): ITheme {
  const style = getComputedStyle(container);
  const background = readColor(style, "--background-primary", "#1e1e1e");
  const foreground = readColor(style, "--text-normal", "#d4d4d4");
  return {
    background,
    foreground,
    cursor: readColor(style, "--text-accent", foreground),
    cursorAccent: background,
    selectionBackground: readColor(
      style,
      "--text-selection",
      "rgba(127, 127, 127, 0.35)"
    )
  };
}

/** 监听 Obsidian 主题属性变化，并更新现有 xterm 实例。 */
export class ObsidianTerminalThemeSync {
  private observer: MutationObserver | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly terminal: ThemeAwareTerminal
  ) {}

  start(): void {
    this.applyTheme();
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => this.applyTheme());
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "style"]
    };
    this.observer.observe(document.documentElement, options);
    this.observer.observe(document.body, options);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private applyTheme(): void {
    this.terminal.options.theme = readObsidianTerminalTheme(this.container);
  }
}

function readColor(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}
