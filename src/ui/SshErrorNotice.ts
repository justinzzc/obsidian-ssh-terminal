import { PluginError, type PluginErrorCode } from "../model";

export interface SshErrorNoticeOptions {
  title: string;
  error: unknown;
  fallbackMessage?: string;
}

export function renderSshErrorNotice(
  container: HTMLElement,
  options: SshErrorNoticeOptions
): void {
  const notice = document.createElement("div");
  notice.className = "ssh-error-notice";
  notice.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.className = "ssh-error-notice__title";
  title.textContent = options.title;

  const reason = document.createElement("div");
  reason.className = "ssh-error-notice__reason";
  reason.textContent = options.error instanceof Error
    ? options.error.message
    : options.fallbackMessage ?? "An unexpected SSH error occurred.";

  const guidance = document.createElement("div");
  guidance.className = "ssh-error-notice__guidance";
  guidance.textContent = guidanceFor(options.error);

  notice.append(title, reason, guidance);
  container.replaceChildren(notice);
}

function guidanceFor(error: unknown): string {
  return error instanceof PluginError
    ? guidanceForCode(error.code)
    : "Review the SSH configuration and try again.";
}

function guidanceForCode(code: PluginErrorCode): string {
  if (code === "AUTH_FAILED") {
    return "Verify the SSH username and password, then try again.";
  }
  if (code.startsWith("BLOCK_")) {
    return "Review the SSH block fields and YAML syntax, then try again.";
  }
  if (
    code === "PROFILE_NOT_FOUND" ||
    code === "CREDENTIAL_MISSING" ||
    code === "CREDENTIAL_STORE_UNAVAILABLE"
  ) {
    return "Open SSH Terminal settings and verify the referenced profile and password.";
  }
  if (code === "NETWORK_ERROR" || code === "CONNECT_TIMEOUT") {
    return "Verify the host, port, network access, and remote SSH service.";
  }
  if (code === "HOST_KEY_REJECTED" || code === "HOST_KEY_MISMATCH") {
    return "Review the server host fingerprint before trying again.";
  }
  return "Check the remote server, then reconnect the SSH session.";
}
