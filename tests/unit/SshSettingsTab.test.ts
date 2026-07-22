// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/settings/obsidianApi", () => import("../mocks/obsidian"));

import { SshSettingsTab } from "../../src/settings/SshSettingsTab";

beforeAll(() => {
  HTMLElement.prototype.empty = function (this: HTMLElement) { this.replaceChildren(); };
  HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, options?: { text?: string }) {
    const element = document.createElement(tag);
    if (options?.text) element.textContent = options.text;
    this.append(element);
    return element;
  } as never;
  HTMLElement.prototype.createDiv = function (this: HTMLElement, options?: { cls?: string }) {
    const element = document.createElement("div");
    if (options?.cls) element.className = options.cls;
    this.append(element);
    return element;
  };
});

describe("SshSettingsTab", () => {
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
