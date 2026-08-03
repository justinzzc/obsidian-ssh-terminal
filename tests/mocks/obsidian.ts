export class App {}
export class Plugin {}
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
