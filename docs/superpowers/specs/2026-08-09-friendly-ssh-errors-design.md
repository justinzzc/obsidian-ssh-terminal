# Friendly SSH Error Messages Design

## Goal

Replace the current solid red SSH error block with a clear, neutral error card that explains what failed and how the user can recover. Apply the same presentation to Markdown configuration errors and SSH connection failures.

## Scope

The change covers errors shown in:

- Reading View SSH blocks.
- Live Preview SSH blocks.
- The mounted terminal when target resolution or connection fails.
- The independent Terminal view when its runtime instance is unavailable.

It does not change parsing rules, SSH retry behavior, authentication, host-key validation, persistence, or session lifecycle.

## Presentation

Each error card contains:

1. A short context-specific title:
   - `Unable to start SSH terminal` for block configuration and target-resolution errors.
   - `SSH connection failed` for connection and session errors.
   - `SSH terminal unavailable` when an independent runtime instance no longer exists.
2. The existing safe error message as the reason.
3. A concise recovery suggestion derived from the error category.

The card uses Obsidian theme variables with a neutral secondary background, normal text, a subtle border, and a small error-colored accent. It must not use a solid error-colored background.

## Error Guidance

Known `PluginError` codes map to actionable guidance:

- Block/YAML/field errors: review the SSH block fields and YAML syntax.
- Missing profile or credentials: open plugin settings and verify the referenced profile and password.
- Network and timeout errors: verify the host, port, network access, and remote SSH service.
- Authentication failures: verify the username and password.
- Host-key errors: review the host fingerprint before retrying.
- Remote/session failures: reconnect after checking the remote server.

Unknown errors use a generic suggestion without exposing internal objects or stack traces.

## Architecture

Add a small shared renderer in `src/ui/SshErrorNotice.ts`. It accepts a container, title, unknown error value, and optional fallback message. It normalizes the safe reason, derives guidance from `PluginError.code`, and renders semantic child elements with scoped CSS classes.

Reading View, Live Preview, `TerminalView`, and `PersistentTerminalItemView` call this renderer instead of assigning `.ssh-terminal__error` and raw text independently. `TerminalView` keeps a dedicated error container so successful reconnect attempts can hide or clear the notice without recreating the terminal.

## Security

- Never render passwords, command input, terminal output, stack traces, or serialized error objects.
- Only use `Error.message`, known `PluginError.code`, or a fixed fallback.
- Existing error producers remain responsible for not embedding secrets in their messages.
- Guidance text contains no connection secrets or terminal content.

## Testing

Use TDD and add focused tests that prove:

- The shared renderer creates title, reason, and guidance elements.
- Known error codes select the expected guidance.
- Unknown values use a safe fallback and are not serialized.
- Reading View and Live Preview use the friendly configuration-error title.
- `TerminalView` uses the connection-error title and clears the notice on a new attempt or successful connection.
- The unavailable independent Terminal view uses the shared neutral card.
- CSS no longer gives the error notice a solid error background.

Run the full TypeScript and unit-test suite, then rebuild the plugin assets.
