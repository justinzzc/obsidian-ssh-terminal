# Spaced SSH Fence Compatibility Design

## Goal

Make Reading View and Live Preview recognize SSH fenced code blocks written with either ` ```ssh ` or ` ``` ssh ` opening syntax.

## Root Cause

Obsidian accepts a space between the opening backticks and the `ssh` info string when dispatching the registered code-block processor. The plugin's shared full-document scanner currently accepts only the exact trimmed marker ` ```ssh `. Reading View then cannot find the block returned by Obsidian and reports `SSH block location changed while rendering.` every time the document opens.

## Behavior

The shared scanner accepts opening markers with:

- Three backticks followed immediately by `ssh`.
- Three backticks followed by horizontal whitespace and then `ssh`.
- Optional horizontal whitespace after `ssh`.

It must not match other language names such as `ssh2`, `shell`, or `bash`. Closing-fence behavior, source extraction, line offsets, identity keys, and occurrence calculation remain unchanged.

Because Reading View and Live Preview both use `findSshBlocksInMarkdown()`, the compatibility fix belongs only in that shared scanner.

## Security

- Tests use placeholder hosts, usernames, and passwords only.
- No user-provided credential is copied into source, tests, logs, or documentation.
- Parsing and credential-storage behavior do not change.

## Testing

Use TDD to prove:

- ` ```ssh ` remains supported.
- ` ``` ssh ` is recognized with the same source and occurrence behavior.
- Trailing horizontal whitespace is accepted.
- Similar language names such as `ssh2` are ignored.
- Reading View resolves a spaced SSH fence without rendering a location error.
- Existing scanner, Reading View, and Live Preview tests remain green.
