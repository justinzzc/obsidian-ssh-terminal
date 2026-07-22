export class App {}
export class Plugin {}
export class Notice {}

export class PluginSettingTab {
  containerEl = document.createElement("div");
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

  onChange(_handler: (value: string) => void): this {
    return this;
  }
}

class MockButtonComponent {
  constructor(private readonly element: HTMLButtonElement) {}

  setButtonText(text: string): this {
    this.element.textContent = text;
    return this;
  }

  setCta(): this { return this; }
  setWarning(): this { return this; }

  onClick(handler: () => void | Promise<void>): this {
    this.element.addEventListener("click", () => void handler());
    return this;
  }
}
