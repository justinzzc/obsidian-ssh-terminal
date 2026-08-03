// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));

import { SshSettingsTab } from "../../src/settings/SshSettingsTab";

const styles = readFileSync("src/styles.css", "utf8");

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

function profileRow(tab: SshSettingsTab): HTMLElement {
  const row = tab.containerEl.querySelector<HTMLElement>(".ssh-settings-profile-row");
  if (!row) throw new Error("Missing Profile row");
  return row;
}

function editButton(tab: SshSettingsTab): HTMLButtonElement {
  const button = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === "\u67e5\u770b/\u7f16\u8f91");
  if (!button) throw new Error("Missing edit button");
  return button;
}

function activateWithKeyboard(element: HTMLElement, key: "Enter" | " "): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  element.click();
}

describe("SshSettingsTab", () => {
  it("renders Profiles as compact rows instead of expanded forms", () => {
    const tab = makeTab();

    tab.display();

    const row = profileRow(tab);
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("type")).toBe("button");
    expect(editButton(tab).getAttribute("type")).toBe("button");
    expect(tab.containerEl.textContent).toContain("Production");
    expect(tab.containerEl.textContent).toContain("deploy@server.example.com:2222");
    expect(tab.containerEl.textContent).toContain("production-server");
    expect(tab.containerEl.textContent).not.toContain("\u8d85\u65f6\uff08\u6beb\u79d2\uff09");
    expect(tab.containerEl.querySelectorAll("input")).toHaveLength(0);
  });

  it("shows one add button and an empty state when there are no Profiles", () => {
    const tab = makeTab([]);

    tab.display();

    expect([...tab.containerEl.querySelectorAll("button")]
      .filter((candidate) => candidate.textContent === "\u65b0\u589e\u8fde\u63a5")).toHaveLength(1);
    expect(tab.containerEl.querySelector(".ssh-settings-profile-empty")?.textContent)
      .toContain("\u65b0\u589e\u8fde\u63a5");
  });

  it("opens the reusable modal for an existing Profile", () => {
    const tab = makeTab();
    tab.display();

    editButton(tab).click();

    expect(document.body.textContent).toContain("\u7f16\u8f91 SSH \u8fde\u63a5");
    expect(document.querySelector<HTMLInputElement>("[data-profile-field=id]")?.value)
      .toBe("production-server");
    expect(document.querySelectorAll(".modal")).toHaveLength(1);
  });

  it("opens exactly one modal when the Profile row is clicked", () => {
    const tab = makeTab();
    tab.display();

    profileRow(tab).click();

    expect(document.querySelectorAll(".modal")).toHaveLength(1);
  });

  it("opens exactly one modal when Enter activates the Profile row", () => {
    const tab = makeTab();
    tab.display();

    activateWithKeyboard(profileRow(tab), "Enter");

    expect(document.querySelectorAll(".modal")).toHaveLength(1);
  });

  it("opens exactly one modal when Space activates the Profile row", () => {
    const tab = makeTab();
    tab.display();

    activateWithKeyboard(profileRow(tab), " ");

    expect(document.querySelectorAll(".modal")).toHaveLength(1);
  });

  it("opens exactly one modal when the edit button is keyboard-activated", () => {
    const tab = makeTab();
    tab.display();

    activateWithKeyboard(editButton(tab), "Enter");

    expect(document.querySelectorAll(".modal")).toHaveLength(1);
  });

  it("opens a blank reusable modal from the add button", () => {
    const tab = makeTab([]);
    tab.display();

    const addButton = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent === "\u65b0\u589e\u8fde\u63a5");
    addButton!.click();

    expect(document.body.textContent).toContain("\u65b0\u589e SSH \u8fde\u63a5");
    expect(document.querySelector<HTMLInputElement>("[data-profile-field=id]")?.value).toBe("");
  });

  it("lets Profile row buttons grow with multi-line content", () => {
    const rowRule = styles.match(/\.ssh-settings-profile-row\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(rowRule).toContain("height: auto");
    expect(rowRule).toContain("min-height: 0");
    expect(rowRule).toContain("box-shadow: none");
  });

  it("shows inline host trust and forgets it after confirmation", async () => {
    const forgetInlineHostKey = vi.fn(async () => undefined);
    const tab = new SshSettingsTab(
      {} as never,
      {} as never,
      { list: () => [] } as never,
      {
        listInline: () => [{
          id: "inline:v1:server.example.com:2222",
          host: "server.example.com",
          port: 2222,
          algorithm: "ssh-ed25519",
          fingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        }]
      } as never,
      { forgetInlineHostKey } as never
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    tab.display();

    expect(tab.containerEl.textContent).toContain("profile 模式的密码");
    expect(tab.containerEl.textContent).toContain("inline 模式会写入 Markdown");
    expect(tab.containerEl.textContent).toContain("Inline SSH 主机信任");
    expect(tab.containerEl.textContent).toContain("server.example.com:2222");
    expect(tab.containerEl.textContent).toContain("ssh-ed25519 SHA256:AAAAAAAA");
    expect(tab.containerEl.textContent).not.toContain("never-leak-me");
    const forgetButton = [...tab.containerEl.querySelectorAll("button")]
      .find((button) => button.textContent === "忘记");
    expect(forgetButton).toBeDefined();
    forgetButton!.click();

    await vi.waitFor(() => expect(forgetInlineHostKey)
      .toHaveBeenCalledWith("inline:v1:server.example.com:2222"));
  });
});
