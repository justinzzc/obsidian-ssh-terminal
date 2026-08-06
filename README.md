# Obsidian SSH Terminal

[中文文档](README.zh-CN.md)

Run interactive SSH terminals directly inside Obsidian Markdown. SSH Terminal renders `ssh` code blocks in Reading View and Live Preview, so a note can become a runnable operations snippet, lab guide, or server runbook.

![SSH Terminal preview](docs/terminal.png)

## Highlights

- Write connection details directly in Markdown, including plaintext passwords when that tradeoff is useful.
- Click to connect only when you choose. Rendering a note never starts an SSH session automatically.
- Use strict host-key confirmation for both inline and profile-based connections.
- Keep terminals scoped to their rendered block, with resize support and clean disconnect behavior.
- Use profile mode when you want encrypted password storage instead of Markdown plaintext.

## Quick Start: Inline Passwords in Markdown

The fastest way to make a note runnable is to put the SSH connection fields in the block:

````markdown
```ssh
host: server.example.com
port: 22
username: root
password: "replace-with-password"
height: 360
```
````

Open the note in Reading View or Live Preview, then click **Connect** in the rendered terminal.

Inline mode requires `host`, `username`, and string `password`. `port` defaults to `22`, `height` defaults to `360`, and the connection timeout is `15000ms`. Quote passwords that look like numbers, booleans, or contain YAML-special characters.

> Warning: inline passwords are saved as plaintext in Markdown. They may be synced, backed up, indexed, or committed to Git along with the note. Use profile mode for secrets you do not want stored in Markdown.

## Profile Mode

Profiles keep reusable host settings out of Markdown and store the password through Electron `safeStorage`, using the operating system's encryption support.

1. Open the plugin settings.
2. Create a profile with host, port, username, timeout, and password.
3. Reference the profile from Markdown:

   ````markdown
   ```ssh
   profile: production-server
   height: 360
   ```
   ````

4. Click **Connect** in the rendered terminal.

`profile` cannot be mixed with inline fields such as `host`, `username`, or `password`.

## Security Notes

- Inline mode stores passwords directly in Markdown and does not copy them into plugin data.
- Profile mode stores encrypted password blobs in plugin `data.json`; plaintext passwords are not written to Markdown.
- If operating system encryption is unavailable, the plugin refuses to save profile passwords instead of falling back to plaintext.
- First connection uses TOFU host-key confirmation. A later host-key mismatch blocks the connection.
- Logs, notices, status text, and errors do not record passwords, typed commands, or terminal output.

## Build

Requires Node.js 20+.

```powershell
npm install
npm run check
npm run build
npm run package:release
```

Release assets are written to `release/community/`:

- `main.js`
- `manifest.json`
- `styles.css`

Copy those files into `<vault>/.obsidian/plugins/ssh-terminal/` for manual installation.

## Release

Use the release script to update versions, run verification, build release assets, push the tag, and create the GitHub release:

```powershell
npm run release -- 0.3.0 --notes "Release 0.3.0"
```

If a release needs to be rebuilt after an Obsidian review fix, replace the existing tag and assets explicitly:

```powershell
npm run release -- 0.3.0 --replace --skip-integration --notes "Release 0.3.0"
```

`--skip-integration` is only for environments where Docker is unavailable.

## Integration Test

```powershell
docker build -t obsidian-ssh-test tests/fixtures/sshd
$env:OBSIDIAN_SSH_TEST_PASSWORD='<temporary-local-password>'
npm run test:integration
```

The test password is injected only through an environment variable and should not be written to repository files.

## First Release Scope

- Desktop Obsidian only.
- Password authentication only.
- SFTP, port forwarding, jump hosts, private keys, SSH Agent, and mobile are not supported yet.
