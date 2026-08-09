// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { PluginError } from "../../src/model";
import { renderSshErrorNotice } from "../../src/ui/SshErrorNotice";

describe("renderSshErrorNotice", () => {
  it("renders a structured notice with a safe reason and block guidance", () => {
    const container = document.createElement("div");

    renderSshErrorNotice(container, {
      title: "Unable to start SSH terminal",
      error: new PluginError("BLOCK_PROFILE_REQUIRED", "SSH block requires a profile.")
    });

    const notice = container.querySelector<HTMLElement>(".ssh-error-notice");
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(notice?.querySelector(".ssh-error-notice__title")?.textContent)
      .toBe("Unable to start SSH terminal");
    expect(notice?.querySelector(".ssh-error-notice__reason")?.textContent)
      .toBe("SSH block requires a profile.");
    expect(notice?.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toContain("SSH block");
  });

  it("maps authentication failures to credential guidance", () => {
    const container = document.createElement("div");

    renderSshErrorNotice(container, {
      title: "SSH connection failed",
      error: new PluginError("AUTH_FAILED", "SSH authentication failed.")
    });

    expect(container.querySelector(".ssh-error-notice__guidance")?.textContent)
      .toBe("Verify the SSH username and password, then try again.");
  });

  it("uses a fixed fallback for unknown values without serializing them", () => {
    const container = document.createElement("div");

    renderSshErrorNotice(container, {
      title: "SSH connection failed",
      error: { password: "do-not-render" },
      fallbackMessage: "Unable to connect to the SSH server."
    });

    expect(container.textContent).toContain("Unable to connect to the SSH server.");
    expect(container.textContent).not.toContain("do-not-render");
  });
});
