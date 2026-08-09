# Development

## Requirements

- Node.js 20+
- Docker for the SSH integration test

## Install and Verify

```powershell
npm install
npm run check
npm run build
```

## Build Community Release Assets

```powershell
npm run package:release
```

Release assets are written to `release/community/`:

- `main.js`
- `manifest.json`
- `styles.css`

For manual installation, copy these files to `<vault>/.obsidian/plugins/ssh-terminal/`.

## Release

Use the release script to update `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, run verification, build release assets, push the tag, and create the GitHub release. The version argument can be an explicit `x.y.z` version or one of `major`, `minor`, or `patch`:

```powershell
npm run release -- 0.3.0 --notes "Release 0.3.0"
npm run release -- minor --notes "Release next minor version"
```

To rebuild an existing version after an Obsidian review fix:

```powershell
npm run release -- 0.3.0 --replace --skip-integration --notes "Release 0.3.0"
```

Use `--skip-integration` only when Docker is unavailable.

## Integration Test

```powershell
docker build -t obsidian-ssh-test tests/fixtures/sshd
$env:OBSIDIAN_SSH_TEST_PASSWORD='<temporary-local-password>'
npm run test:integration
```

The test password is injected only through an environment variable and must not be written to repository files.

## Manual Verification: Runtime Terminal Sessions

1. Connect one terminal from Reading View and another from Live Preview.
2. Switch to another document and confirm remote commands continue running.
3. Open **SSH Sessions** from the ribbon and open each session in its independent Terminal tab.
4. Close a Terminal tab, reopen it from **SSH Sessions**, and confirm the SSH session remains connected.
5. Return to the original source document, click **Activate**, and confirm scrollback and shell state are preserved.
6. Rename and delete source documents and confirm the source information and availability state update correctly.
7. Disconnect a session before removing it, and confirm an active session cannot be removed directly.
8. Restart Obsidian and confirm previous runtime sessions are not restored.
