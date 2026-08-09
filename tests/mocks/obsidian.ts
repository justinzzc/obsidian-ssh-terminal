import { vi } from "vitest";

export class WorkspaceLeaf {
  view: unknown;
  state: unknown;

  async setViewState(state: unknown): Promise<void> {
    this.state = state;
  }
}

export class ItemView {
  readonly containerEl = document.createElement("div");

  constructor(readonly leaf: WorkspaceLeaf) {}
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class App {
  workspace: unknown;
  vault: unknown;

  constructor(workspace?: unknown, vault?: unknown) {
    this.workspace = workspace;
    this.vault = vault;
  }
}

export class Plugin {
  readonly registeredViews = new Map<string, (leaf: WorkspaceLeaf) => unknown>();
  readonly ribbonCallbacks = new Map<string, () => void>();
  readonly app: App;

  constructor(app = new App()) {
    this.app = app;
  }

  loadData = vi.fn(async (): Promise<unknown> => null);
  saveData = vi.fn(async (_data: unknown): Promise<void> => {});
  registerMarkdownCodeBlockProcessor = vi.fn();
  registerEditorExtension = vi.fn();
  addSettingTab = vi.fn();
  registerEvent = vi.fn((event: unknown) => event);
  registerView = vi.fn((type: string, creator: (leaf: WorkspaceLeaf) => unknown) => {
    this.registeredViews.set(type, creator);
  });
  addRibbonIcon = vi.fn((icon: string, _label: string, callback: () => void) => {
    this.ribbonCallbacks.set(icon, callback);
  });
}

export const Platform = { isDesktopApp: true };
export class Notice {
  constructor(readonly message: unknown) {}
}

export class Modal {
  readonly modalEl = document.createElement("div");
  readonly titleEl = document.createElement("h2");
  readonly contentEl = document.createElement("div");
  private opened = false;

  constructor(readonly app: App) {
    this.modalEl.className = "modal";
    this.modalEl.append(this.titleEl, this.contentEl);
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    document.body.append(this.modalEl);
    this.onOpen();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.onClose();
    this.modalEl.remove();
  }

  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  containerEl = document.createElement("div");

  constructor(readonly app: App, readonly plugin: Plugin) {}
}

export class Setting {
  private readonly element: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    container.append(this.element);
  }

  setName(name: string): this {
    this.element.append(document.createTextNode(name));
    return this;
  }

  setDesc(description: string): this {
    this.element.append(document.createTextNode(description));
    return this;
  }

  setHeading(): this {
    this.element.dataset.settingHeading = "true";
    return this;
  }

  addText(callback: (text: MockTextComponent) => void): this {
    const inputEl = document.createElement("input");
    this.element.append(inputEl);
    callback(new MockTextComponent(inputEl));
    return this;
  }

  addButton(callback: (button: MockButtonComponent) => void): this {
    const element = document.createElement("button");
    this.element.append(element);
    callback(new MockButtonComponent(element));
    return this;
  }
}

class MockTextComponent {
  constructor(readonly inputEl: HTMLInputElement) {}

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  onChange(handler: (value: string) => void): this {
    this.inputEl.addEventListener("input", () => handler(this.inputEl.value));
    return this;
  }
}

class MockButtonComponent {
  constructor(readonly buttonEl: HTMLButtonElement) {}

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  setCta(): this { return this; }
  setWarning(): this { return this; }

  onClick(handler: () => void | Promise<void>): this {
    this.buttonEl.addEventListener("click", () => void handler());
    return this;
  }
}
