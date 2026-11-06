# Release versioning policy — Uorqui

**Beta baseline: `v0.1.0-beta.1` (November 6, 2026).** This establishes a reproducible reference for code, UI Kit, API and documentation. **Beta does not mean production stability** or replace real-device, email and voice testing.

## Mandatory rule after baseline

**Every subsequent pull request must introduce a new version, including docs-only, CSS-only or copy changes.**

1. Set **the same SemVer value** in `package.json`, `apps/web/package.json` and `apps/api/package.json`.
2. Add a matching numbered entry to **`CHANGELOG.md` and `CHANGELOG.pt-BR.md`** covering changes, impacts, migrations, risks and relevant tests. Keep the `[Unreleased]` heading.
3. Update affected English and Portuguese documentation; update the UI Kit for visual changes and architecture docs for structural changes.
4. Submit a PR and check **Version policy**, **Web UI** and relevant **API/integration** jobs. The version check compares PR and `main` and rejects equal or lower versions.
5. `Publish tagged beta releases` attempts to create the immutable tag `v<version>` and a GitHub Release on `main`. Reusing an existing version/tag for a different commit fails: **never rewrite version tags**.

Example progression: `0.1.0-beta.1` → `0.1.0-beta.2` → `0.1.0-beta.3` → `0.1.0` (only after stable release is approved). Incompatible changes or milestones may bump the SemVer minor/major number as appropriate.

## CI and branch protection

The version workflow runs on **every PR** (including documentation-only PRs) and on pushes to `main`. To make the check **merge-blocking**, a maintainer must mark **Verify release version** as a *required status check* in branch rules. CI can report failures but cannot by itself prevent an administrator from overriding an unprotected branch.

GitHub Release/tag publishing depends on `GITHUB_TOKEN` write permissions and repository settings; a successful build/deployment alone does not prove a release was tagged. Never overwrite published versions: increase the version for a follow-up.

## Beta consolidation scope

- CSS: one global Dark/Light token declaration, with the signed-in palette intentionally scoped in `sprintrix.css`.
- Frontend: shared `lib/apiClient.ts` transport for direct messages, communities and moderation, preserving existing error/204 contracts.
- Backend: strict same-origin validation extracted into `request-origin.ts`; no database, URL or authorization behavior change.
- UI Kit and feature documentation updated to match the actual product at this baseline.

See the [UI Kit](ui-kit.md) and [release notes](../../CHANGELOG.md).
