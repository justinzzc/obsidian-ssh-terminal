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

  it("does not reuse a password typed before closing and reopening", async () => {
    const save = vi.fn(async () => undefined);
    const modal = new ProfileModal(
      {} as never,
      existing,
      true,
      actions({ save })
    );
    modal.open();

    change("password", "discarded-password");
    button("取消").click();
    modal.open();

    expect(input("password").value).toBe("");
    button("保存").click();

    await vi.waitFor(() => expect(save).toHaveBeenCalledWith(existing, ""));
  });
});
