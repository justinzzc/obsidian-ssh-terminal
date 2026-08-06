# Community README Design

## Goal

Make both repository README files suitable for display in the Obsidian community plugin listing and ensure the preview image renders there.

## Scope

- Update `README.md` and `README.zh-CN.md` together.
- Remove contributor-only build, release, packaging, and integration-test instructions.
- Keep the user-facing overview, features, usage examples, security guidance, and current support limitations.
- Keep `docs/terminal.png` in its existing location.
- Reference the screenshot with a version-pinned GitHub Raw URL under the `0.4.0` tag so the community page does not depend on relative-link rewriting or future branch changes.

## Non-goals

- Do not change plugin behavior or source code.
- Do not redesign or regenerate the screenshot.
- Do not move the removed development instructions elsewhere as part of this change.

## Verification

- Confirm neither README contains the removed development sections or commands.
- Confirm both image URLs target the existing `docs/terminal.png` asset at the `0.4.0` tag.
- Review both README files for consistent English and Chinese structure.
