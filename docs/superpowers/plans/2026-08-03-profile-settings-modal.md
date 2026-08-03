# Profile Settings Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expanded Profile forms in the Obsidian settings page with a compact Profile list and a reusable modal for creating, viewing, and editing connections.

**Architecture:** Add a focused `ProfileModal` that owns form state and delegates save, delete, and host-key operations through callbacks. Keep `SshSettingsTab` responsible for rendering the list, opening the modal, and refreshing the page after mutations; keep `SshSettingsController`, Profile persistence, credential storage, and Inline SSH trust behavior unchanged.

**Tech Stack:** TypeScript 5.8, Obsidian 1.8.7 UI APIs, Vitest 3 with jsdom, existing CSS theme variables.

## Global Constraints

- Do not change the `SshProfile` schema or persisted data format.
- Do not change SSH connection, session reuse, terminal, password storage, or Inline SSH trust behavior.
- Never read or render an existing saved password; an empty password while editing means retain the saved password.
- Reuse `SshSettingsController.save`, `delete`, and `forgetHostKey`; do not duplicate persistence logic.
- Use Obsidian components and theme variables, with no new runtime dependency.
- Follow TDD: add a focused failing test, observe the expected failure, implement the smallest behavior, then rerun the focused test.

## File Structure

- Create `src/settings/ProfileModal.ts`: reusable create/edit form, local error feedback, and modal actions.
- Modify `src/settings/SshSettingsTab.ts`: compact list, empty state, modal creation, and Inline SSH section preservation.
- Modify `src/settings/obsidianApi.ts`: expose `Modal` through the existing test seam.
- Modify `tests/mocks/obsidian.ts`: provide modal lifecycle and interactive text-component behavior for jsdom tests.
- Create `tests/unit/ProfileModal.test.ts`: form, password, error, delete, and host-key behavior.
- Modify `tests/unit/SshSettingsTab.test.ts`: list rendering, empty state, and modal-opening integration.
- Modify `src/styles.css`: compact Profile list, modal error, and responsive action layout.

---

### Task 1: Create the reusable Profile modal and save flow

**Files:**
- Create: `src/settings/ProfileModal.ts`
- Modify: `src/settings/obsidianApi.ts:1-2`
- Modify: `tests/mocks/obsidian.ts:1-70`
- Create: `tests/unit/ProfileModal.test.ts`

**Interfaces:**
- Consumes: `SshProfile` from `src/model.ts`; Obsidian `App`, `Modal`, `Notice`, and `Setting` from `src/settings/obsidianApi.ts`.
- Produces: `ProfileModalActions` and `ProfileModal(app, existing, hasHostKey, actions)` for `SshSettingsTab`.
- `ProfileModalActions.save(profile: SshProfile, password: string): Promise<void>` performs the existing controller save.
- `ProfileModalActions.delete(profileId: string): Promise<void>` deletes an existing Profile.
- `ProfileModalActions.forgetHostKey(profileId: string): Promise<void>` forgets an existing Profile host key.
- `ProfileModalActions.onChanged(): void` refreshes the parent settings page after save or delete.

- [ ] **Step 1: Write failing save-flow tests**

Create `tests/unit/ProfileModal.test.ts` with jsdom and the existing API seam:

```ts
// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));

import type { SshProfile } from "../../src/model";
import { ProfileModal, type ProfileModalActions } from "../../src/settings/ProfileModal";

beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) { this.replaceChildren(); };
  HTMLElement.prototype.setText = function (this: HTMLElement, text: string) { this.textContent = text; };
  HTMLElement.prototype.createEl = function (
    this: HTMLElement,
    tag: string,
    options?: { text?: string; cls?: string }
  ) {
    const element = document.createElement(tag);
    if (options?.text) element.textContent = options.text;
    if (options?.cls) element.className = options.cls;
    this.append(element);
    return element;
  } as never;
  HTMLElement.prototype.createDiv = function (
    this: HTMLElement,
    options?: { text?: string; cls?: string }
  ) {
    const element = document.createElement("div");
    if (options?.text) element.textContent = options.text;
    if (options?.cls) element.className = options.cls;
    this.append(element);
    return element;
  };
});

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const existing: SshProfile = {
  id: "production-server",
  name: "Production",
  host: "server.example.com",
  port: 2222,
  username: "deploy",
  timeoutMs: 20_000
};

function actions(overrides: Partial<ProfileModalActions> = {}): ProfileModalActions {
  return {
    save: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    forgetHostKey: vi.fn(async () => undefined),
    onChanged: vi.fn(),
    ...overrides
  };
}

function input(field: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`[data-profile-field="${field}"]`);
  if (!element) throw new Error(`Missing Profile field: ${field}`);
  return element;
}

function change(field: string, value: string): void {
  const element = input(field);
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(text: string): HTMLButtonElement {
  const element = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === text);
  if (!element) throw new Error(`Missing button: ${text}`);
  return element;
}

describe("ProfileModal", () => {
  it("opens a prefilled edit form without exposing the saved password", () => {
    const modal = new ProfileModal({} as never, existing, true, actions());

    modal.open();

    expect(document.body.textContent).toContain("编辑 SSH 连接");
    expect(input("id").value).toBe("production-server");
    expect(input("id").disabled).toBe(true);
    expect(input("host").value).toBe("server.example.com");
    expect(input("password").value).toBe("");
    expect(input("password").type).toBe("password");
    expect(document.body.textContent).toContain("留空表示保留已保存密码");
  });

  it("submits trimmed values and closes after a successful save", async () => {
    const save = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    const modal = new ProfileModal(
      {} as never,
      undefined,
      false,
      actions({ save, onChanged })
    );
    modal.open();

    change("id", " staging-server ");
    change("name", " Staging ");
    change("host", " staging.example.com ");
    change("port", "2200");
    change("username", " deploy ");
    change("timeoutMs", "30000");
    change("password", "secret-value");
    button("保存").click();

    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({
      id: "staging-server",
      name: "Staging",
      host: "staging.example.com",
      port: 2200,
      username: "deploy",
      timeoutMs: 30_000
    }, "secret-value"));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(document.querySelector(".modal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```powershell
npx vitest run tests/unit/ProfileModal.test.ts
```

Expected: FAIL because `src/settings/ProfileModal.ts` does not exist.

- [ ] **Step 3: Expose `Modal` through the settings API seam**

Replace `src/settings/obsidianApi.ts` with:

```ts
export { Modal, Notice, PluginSettingTab, Setting } from "obsidian";
export type { App, Plugin } from "obsidian";
```

- [ ] **Step 4: Extend the Obsidian mock with modal lifecycle and input events**

Update `tests/mocks/obsidian.ts` so its public behavior is:

```ts
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
```

- [ ] **Step 5: Implement the minimal modal form and save behavior**

Create `src/settings/ProfileModal.ts`:

```ts
import type { SshProfile } from "../model";
import { Modal, Notice, Setting, type App } from "./obsidianApi";

export interface ProfileModalActions {
  save(profile: SshProfile, password: string): Promise<void>;
  delete(profileId: string): Promise<void>;
  forgetHostKey(profileId: string): Promise<void>;
  onChanged(): void;
}

interface ProfileFormValues {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  timeoutMs: string;
  password: string;
}

export class ProfileModal extends Modal {
  private readonly values: ProfileFormValues;

  constructor(
    app: App,
    private readonly existing: SshProfile | undefined,
    private readonly hasHostKey: boolean,
    private readonly actions: ProfileModalActions
  ) {
    super(app);
    this.values = {
      id: existing?.id ?? "",
      name: existing?.name ?? "",
      host: existing?.host ?? "",
      port: String(existing?.port ?? 22),
      username: existing?.username ?? "",
      timeoutMs: String(existing?.timeoutMs ?? 15_000),
      password: ""
    };
  }

  onOpen(): void {
    this.titleEl.setText(this.existing ? "编辑 SSH 连接" : "新增 SSH 连接");
    this.contentEl.empty();

    addTextSetting(this.contentEl, "id", "Profile ID", "例如 production-server；保存后不可修改", this.values.id, (value) => this.values.id = value, Boolean(this.existing));
    addTextSetting(this.contentEl, "name", "显示名称", "用于设置页展示", this.values.name, (value) => this.values.name = value);
    addTextSetting(this.contentEl, "host", "主机", "主机名或 IP 地址", this.values.host, (value) => this.values.host = value);
    addTextSetting(this.contentEl, "port", "端口", "默认 22", this.values.port, (value) => this.values.port = value);
    addTextSetting(this.contentEl, "username", "用户名", "SSH 登录用户名", this.values.username, (value) => this.values.username = value);
    addTextSetting(this.contentEl, "timeoutMs", "超时（毫秒）", "1000 到 120000", this.values.timeoutMs, (value) => this.values.timeoutMs = value);
    addTextSetting(this.contentEl, "password", "密码", this.existing ? "留空表示保留已保存密码" : "保存到系统钥匙串", "", (value) => this.values.password = value, false, true);

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("保存").setCta().onClick(() => this.save()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    try {
      await this.actions.save({
        id: this.values.id.trim(),
        name: this.values.name.trim(),
        host: this.values.host.trim(),
        port: Number(this.values.port),
        username: this.values.username.trim(),
        timeoutMs: Number(this.values.timeoutMs)
      }, this.values.password);
      new Notice("SSH 配置已保存");
      this.close();
      this.actions.onChanged();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "SSH 配置保存失败");
    }
  }
}

function addTextSetting(
  container: HTMLElement,
  field: keyof ProfileFormValues,
  name: string,
  description: string,
  value: string,
  onChange: (value: string) => void,
  disabled = false,
  password = false
): void {
  new Setting(container)
    .setName(name)
    .setDesc(description)
    .addText((text) => {
      text.setValue(value).onChange(onChange);
      text.inputEl.dataset.profileField = field;
      text.inputEl.disabled = disabled;
      if (password) text.inputEl.type = "password";
    });
}
```

The constructor already accepts the destructive-operation callbacks so Task 2 can add those controls without changing the integration contract. `hasHostKey` is stored now and used in Task 2.

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```powershell
npx vitest run tests/unit/ProfileModal.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit the modal save flow**

```powershell
git add src/settings/ProfileModal.ts src/settings/obsidianApi.ts tests/mocks/obsidian.ts tests/unit/ProfileModal.test.ts
git commit -m "feat: add profile settings modal"
```

---

### Task 2: Add modal error feedback and existing-Profile actions

**Files:**
- Modify: `src/settings/ProfileModal.ts`
- Modify: `tests/unit/ProfileModal.test.ts`

**Interfaces:**
- Consumes: the `ProfileModalActions` contract created in Task 1.
- Produces: inline `.ssh-profile-modal-error` feedback; existing-only “忘记主机指纹” and “删除连接” actions.
- Keeps the modal open after failed operations and after forgetting a host key.
- Closes and calls `onChanged()` only after save or delete succeeds.

- [ ] **Step 1: Add failing tests for errors and destructive actions**

Append inside the `describe("ProfileModal", ...)` block in `tests/unit/ProfileModal.test.ts`:

```ts
it("keeps the modal open and displays a save error without losing input", async () => {
  const save = vi.fn(async () => { throw new Error("SSH profile contains invalid fields."); });
  const modal = new ProfileModal({} as never, undefined, false, actions({ save }));
  modal.open();
  change("host", "still-here.example.com");

  button("保存").click();

  await vi.waitFor(() => expect(document.body.textContent)
    .toContain("SSH profile contains invalid fields."));
  expect(input("host").value).toBe("still-here.example.com");
  expect(document.querySelector(".modal")).not.toBeNull();
});

it("forgets a trusted host key without closing the edit modal", async () => {
  const forgetHostKey = vi.fn(async () => undefined);
  const modal = new ProfileModal(
    {} as never,
    existing,
    true,
    actions({ forgetHostKey })
  );
  modal.open();

  button("忘记主机指纹").click();

  await vi.waitFor(() => expect(forgetHostKey).toHaveBeenCalledWith("production-server"));
  expect(document.querySelector(".modal")).not.toBeNull();
});

it("confirms deletion, closes, and refreshes after success", async () => {
  const deleteProfile = vi.fn(async () => undefined);
  const onChanged = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const modal = new ProfileModal(
    {} as never,
    existing,
    false,
    actions({ delete: deleteProfile, onChanged })
  );
  modal.open();

  button("删除连接").click();

  await vi.waitFor(() => expect(deleteProfile).toHaveBeenCalledWith("production-server"));
  expect(onChanged).toHaveBeenCalledOnce();
  expect(document.querySelector(".modal")).toBeNull();
});

it("does not render existing-only actions while creating a Profile", () => {
  const modal = new ProfileModal({} as never, undefined, false, actions());
  modal.open();

  expect(document.body.textContent).not.toContain("忘记主机指纹");
  expect(document.body.textContent).not.toContain("删除连接");
});
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```powershell
npx vitest run tests/unit/ProfileModal.test.ts
```

Expected: FAIL because inline error content and existing-only action buttons are not rendered.

- [ ] **Step 3: Add inline errors and existing-only action rendering**

In `ProfileModal.onOpen()`, immediately after `this.contentEl.empty()`, create the hidden error element:

```ts
const errorEl = this.contentEl.createDiv({ cls: "ssh-profile-modal-error" });
errorEl.hidden = true;
```

Pass `errorEl` to the action handlers and replace the final action rendering with:

```ts
if (this.existing) {
  const dangerActions = new Setting(this.contentEl);
  if (this.hasHostKey) {
    dangerActions.addButton((button) => button
      .setButtonText("忘记主机指纹")
      .onClick(() => this.forgetHostKey(errorEl)));
  }
  dangerActions.addButton((button) => button
    .setButtonText("删除连接")
    .setWarning()
    .onClick(() => this.deleteProfile(errorEl)));
}

new Setting(this.contentEl)
  .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
  .addButton((button) => button.setButtonText("保存").setCta().onClick(() => this.save(errorEl)));
```

Change `save()` to accept the error element, clear stale errors before the operation, and show an inline error in the catch branch:

```ts
private async save(errorEl: HTMLElement): Promise<void> {
  clearError(errorEl);
  try {
    await this.actions.save({
      id: this.values.id.trim(),
      name: this.values.name.trim(),
      host: this.values.host.trim(),
      port: Number(this.values.port),
      username: this.values.username.trim(),
      timeoutMs: Number(this.values.timeoutMs)
    }, this.values.password);
    new Notice("SSH 配置已保存");
    this.close();
    this.actions.onChanged();
  } catch (error) {
    showError(errorEl, error, "SSH 配置保存失败");
  }
}
```

Add these methods to `ProfileModal`:

```ts
private async forgetHostKey(errorEl: HTMLElement): Promise<void> {
  if (!this.existing) return;
  clearError(errorEl);
  try {
    await this.actions.forgetHostKey(this.existing.id);
    new Notice("已忘记主机指纹，下次连接将重新确认");
  } catch (error) {
    showError(errorEl, error, "忘记主机指纹失败");
  }
}

private async deleteProfile(errorEl: HTMLElement): Promise<void> {
  if (!this.existing) return;
  if (!window.confirm(`确定删除 SSH 配置“${this.existing.name}”吗？`)) return;
  clearError(errorEl);
  try {
    await this.actions.delete(this.existing.id);
    this.close();
    this.actions.onChanged();
  } catch (error) {
    showError(errorEl, error, "SSH 配置删除失败");
  }
}
```

Add these file-level helpers:

```ts
function clearError(errorEl: HTMLElement): void {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function showError(errorEl: HTMLElement, error: unknown, fallback: string): void {
  errorEl.textContent = error instanceof Error ? error.message : fallback;
  errorEl.hidden = false;
}
```

- [ ] **Step 4: Run modal tests and verify all behavior passes**

Run:

```powershell
npx vitest run tests/unit/ProfileModal.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit modal actions and feedback**

```powershell
git add src/settings/ProfileModal.ts tests/unit/ProfileModal.test.ts
git commit -m "feat: add profile modal actions"
```

---

### Task 3: Replace expanded settings forms with the compact Profile list

**Files:**
- Modify: `src/settings/SshSettingsTab.ts:1-128`
- Modify: `tests/unit/SshSettingsTab.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ProfileModal` and `ProfileModalActions` from Task 1; existing `ProfileStore`, `HostKeyStore`, and `SshSettingsController` methods.
- Produces: `SshSettingsTab.display()` rendering `.ssh-settings-profile-list`, `.ssh-settings-profile-row`, and `.ssh-settings-profile-empty`.
- `openProfileModal(profile?: SshProfile)` constructs the modal with callbacks and refreshes through `display()` only after save or delete.

- [ ] **Step 1: Add failing settings-list and modal-integration tests**

Keep the existing Inline SSH trust test in `tests/unit/SshSettingsTab.test.ts`, then add helpers and tests inside its `describe` block:

```ts
const profile = {
  id: "production-server",
  name: "Production",
  host: "server.example.com",
  port: 2222,
  username: "deploy",
  timeoutMs: 20_000
};

function makeTab(profiles = [profile]) {
  return new SshSettingsTab(
    {} as never,
    {} as never,
    { list: () => profiles } as never,
    { get: () => undefined, listInline: () => [] } as never,
    {
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      forgetHostKey: vi.fn(async () => undefined),
      forgetInlineHostKey: vi.fn(async () => undefined)
    } as never
  );
}

it("renders Profiles as compact rows instead of expanded forms", () => {
  const tab = makeTab();

  tab.display();

  expect(tab.containerEl.querySelectorAll(".ssh-settings-profile-row")).toHaveLength(1);
  expect(tab.containerEl.textContent).toContain("Production");
  expect(tab.containerEl.textContent).toContain("deploy@server.example.com:2222");
  expect(tab.containerEl.textContent).toContain("production-server");
  expect(tab.containerEl.textContent).not.toContain("超时（毫秒）");
  expect(tab.containerEl.querySelectorAll("input")).toHaveLength(0);
});

it("shows one add button and an empty state when there are no Profiles", () => {
  const tab = makeTab([]);

  tab.display();

  expect([...tab.containerEl.querySelectorAll("button")]
    .filter((candidate) => candidate.textContent === "新增连接")).toHaveLength(1);
  expect(tab.containerEl.querySelector(".ssh-settings-profile-empty")?.textContent)
    .toContain("新增连接");
});

it("opens the reusable modal for an existing Profile", () => {
  const tab = makeTab();
  tab.display();

  const editButton = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === "查看/编辑");
  editButton!.click();

  expect(document.body.textContent).toContain("编辑 SSH 连接");
  expect(document.querySelector<HTMLInputElement>("[data-profile-field=id]")?.value)
    .toBe("production-server");
  expect(document.querySelectorAll(".modal")).toHaveLength(1);
});

it("opens a blank reusable modal from the add button", () => {
  const tab = makeTab([]);
  tab.display();

  const addButton = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === "新增连接");
  addButton!.click();

  expect(document.body.textContent).toContain("新增 SSH 连接");
  expect(document.querySelector<HTMLInputElement>("[data-profile-field=id]")?.value).toBe("");
});
```

Extend the existing `beforeEach` or add one so every test starts with `document.body.replaceChildren()` and `vi.restoreAllMocks()`. Update the existing `createEl` test polyfill to apply `options.cls` as well as `options.text`; update the `createDiv` polyfill to apply both `options.cls` and `options.text`; and add a `setText` polyfill matching the one in `ProfileModal.test.ts`.

- [ ] **Step 2: Run the focused settings test and verify it fails on expanded forms**

Run:

```powershell
npx vitest run tests/unit/SshSettingsTab.test.ts
```

Expected: FAIL because `display()` still renders one complete form per Profile and an expanded create form.

- [ ] **Step 3: Refactor `SshSettingsTab` to render and open the compact list**

Replace the imports and Profile rendering portions of `src/settings/SshSettingsTab.ts` with the following structure, while leaving `renderInlineHostKeys()` behavior unchanged:

```ts
import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "./obsidianApi";
import type { SshProfile } from "../model";
import type { HostKeyStore } from "../profile/HostKeyStore";
import type { ProfileStore } from "../profile/ProfileStore";
import { ProfileModal } from "./ProfileModal";
import { SshSettingsController } from "./SshSettingsController";

/** Obsidian 设置页：管理非敏感连接字段，并把密码交给系统钥匙串。 */
export class SshSettingsTab extends PluginSettingTab {
  constructor(
    private readonly appRef: App,
    plugin: Plugin,
    private readonly profiles: ProfileStore,
    private readonly hostKeys: HostKeyStore,
    private readonly controller: SshSettingsController
  ) {
    super(appRef, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "SSH Terminal 连接配置" });
    containerEl.createEl("p", {
      text: "profile 模式的密码只保存到操作系统钥匙串；inline 模式会写入 Markdown 明文。"
    });

    const header = containerEl.createDiv({ cls: "ssh-settings-profile-header" });
    header.createEl("h3", { text: "Profiles" });
    const addButton = header.createEl("button", { text: "新增连接", cls: "mod-cta" });
    addButton.addEventListener("click", () => this.openProfileModal());

    const list = containerEl.createDiv({ cls: "ssh-settings-profile-list" });
    const profiles = this.profiles.list();
    if (profiles.length === 0) {
      list.createDiv({
        cls: "ssh-settings-profile-empty",
        text: "暂无连接配置，点击“新增连接”创建第一个 Profile。"
      });
    } else {
      for (const profile of profiles) this.renderProfileRow(list, profile);
    }

    this.renderInlineHostKeys(containerEl);
  }

  private renderProfileRow(container: HTMLElement, profile: SshProfile): void {
    const row = container.createDiv({ cls: "ssh-settings-profile-row" });
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `查看或编辑 ${profile.name}`);

    const details = row.createDiv({ cls: "ssh-settings-profile-details" });
    details.createDiv({ cls: "ssh-settings-profile-name", text: profile.name });
    details.createDiv({
      cls: "ssh-settings-profile-endpoint",
      text: `${profile.username}@${profile.host}:${profile.port}`
    });
    details.createDiv({ cls: "ssh-settings-profile-id", text: profile.id });

    const editButton = row.createEl("button", { text: "查看/编辑" });
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openProfileModal(profile);
    });
    row.addEventListener("click", () => this.openProfileModal(profile));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.openProfileModal(profile);
    });
  }

  private openProfileModal(profile?: SshProfile): void {
    new ProfileModal(
      this.appRef,
      profile,
      Boolean(profile && this.hostKeys.get(profile.id)),
      {
        save: (next, password) => this.controller.save(next, password),
        delete: (profileId) => this.controller.delete(profileId),
        forgetHostKey: (profileId) => this.controller.forgetHostKey(profileId),
        onChanged: () => this.display()
      }
    ).open();
  }

  private renderInlineHostKeys(container: HTMLElement): void {
    const trustedHosts = this.hostKeys.listInline();
    if (trustedHosts.length === 0) return;

    container.createEl("h2", { text: "Inline SSH 主机信任" });
    container.createEl("p", {
      text: "以下主机指纹来自 Markdown 中的 inline SSH 连接；忘记后，下次连接需要重新确认。"
    });
    for (const trusted of trustedHosts) {
      new Setting(container)
        .setName(`${trusted.host}:${trusted.port}`)
        .setDesc(`${trusted.algorithm} ${trusted.fingerprint}`)
        .addButton((button) => button.setButtonText("忘记").setWarning().onClick(async () => {
          if (!window.confirm(`确定忘记 ${trusted.host}:${trusted.port} 的主机指纹吗？`)) return;
          await this.controller.forgetInlineHostKey(trusted.id);
          new Notice("已忘记 inline SSH 主机指纹，下次连接将重新确认");
          this.display();
        }));
    }
  }
}
```

Delete the old `renderProfile()` method and its file-level `addTextSetting()` helper. Do not change the existing `renderInlineHostKeys()` implementation.

- [ ] **Step 4: Add compact list and modal feedback styles**

Append to `src/styles.css`:

```css
.ssh-settings-profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.ssh-settings-profile-header h3 {
  margin: 0;
}

.ssh-settings-profile-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.ssh-settings-profile-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background: var(--background-primary-alt);
  cursor: pointer;
}

.ssh-settings-profile-row:hover,
.ssh-settings-profile-row:focus-visible {
  border-color: var(--interactive-accent);
  outline: none;
}

.ssh-settings-profile-details {
  min-width: 0;
  flex: 1;
}

.ssh-settings-profile-name {
  font-weight: var(--font-semibold);
  color: var(--text-normal);
}

.ssh-settings-profile-endpoint,
.ssh-settings-profile-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-settings-profile-endpoint {
  color: var(--text-muted);
  font-family: var(--font-monospace);
}

.ssh-settings-profile-id {
  margin-top: 0.15rem;
  color: var(--text-faint);
  font-size: var(--font-ui-smaller);
}

.ssh-settings-profile-empty {
  padding: 1rem;
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-s);
  color: var(--text-muted);
  text-align: center;
}

.ssh-profile-modal-error {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-s);
  color: var(--text-error);
  background: var(--background-modifier-error);
}

@media (max-width: 500px) {
  .ssh-settings-profile-row {
    align-items: stretch;
    flex-direction: column;
  }

  .ssh-settings-profile-row > button {
    align-self: flex-end;
  }
}
```

- [ ] **Step 5: Run focused Profile settings tests**

Run:

```powershell
npx vitest run tests/unit/ProfileModal.test.ts tests/unit/SshSettingsTab.test.ts
```

Expected: all Profile modal and settings tests PASS, including the pre-existing Inline SSH trust test.

- [ ] **Step 6: Run the complete verification suite**

Run:

```powershell
npm run check
npm run test:integration
npm run build
```

Expected:

- `npm run check`: TypeScript compilation succeeds and all unit tests PASS.
- `npm run test:integration`: all integration tests PASS.
- `npm run build`: production bundle completes without errors.

- [ ] **Step 7: Review the final diff for scope and secret safety**

Run:

```powershell
git diff --check
git diff -- src/settings/ProfileModal.ts src/settings/SshSettingsTab.ts src/settings/obsidianApi.ts tests/mocks/obsidian.ts tests/unit/ProfileModal.test.ts tests/unit/SshSettingsTab.test.ts src/styles.css
```

Confirm from the diff that:

- No Profile schema, controller, credential store, SSH session, or Inline SSH host-key behavior changed.
- No saved password is read, logged, placed in an error, or prefilled.
- There is exactly one “新增连接” entry point.
- Existing Profile IDs are disabled in the modal.
- Failed operations leave the modal and user inputs intact.

- [ ] **Step 8: Commit the compact Profile settings UI**

```powershell
git add src/settings/SshSettingsTab.ts tests/unit/SshSettingsTab.test.ts src/styles.css
git commit -m "feat: simplify profile settings UI"
```

## Final Acceptance Checklist

- The settings page renders compact Profile rows and no expanded Profile forms.
- Clicking a row or its “查看/编辑” button opens exactly one directly editable modal.
- “新增连接” opens the same modal with editable Profile ID and default port/timeout values.
- Existing Profile ID is read-only and the password field is blank with retain-password copy.
- Save and delete close the modal and refresh the list only after success.
- Forgetting a host key keeps the modal open.
- Failures are visible inside the modal and retain entered values.
- Inline SSH host trust rendering and forgetting still pass their existing test.
- Unit tests, integration tests, TypeScript checks, and production build all pass.
