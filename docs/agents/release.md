# Release: tag push, CI publishes

Releases ship exclusively through GitHub Actions. **Never run `npm publish`
locally** — this machine holds no npm credentials, and local publishes skip
the workflow's changelog validation and provenance attestation.

## Flow

1. Land the changes on `main` (tests + `bun run check` green).
2. Update `CHANGELOG.md` with a `## [<version>] - <YYYY-MM-DD>` section.
   The release workflow fails if the section for the tag's version is
   missing.
3. Bump `package.json` (`npm version patch --no-git-tag-version` or a
   manual edit) and commit.
4. `npm run release` — tags the head commit `v<version>` (version read
   from `package.json`) and pushes the tag. Publishing happens only in CI.
5. Monitor: `gh run list --limit 3`, then `gh run watch <run-id>` on the
   **Release** workflow run for the tag.
6. Confirm: `npm view <pkg> version` shows the new version.

## Mechanics

- Trigger: `.github/workflows/release.yml` on `push: tags: v*`.
- `npm run release` never touches npm — it is exactly
  `git tag v$(node -p 'require("./package.json").version') && git push
  origin v<version>`. Bump the version first; a re-run on an existing tag
  fails safely without pushing.
- Steps: parse the version from the tag → validate the `CHANGELOG.md`
  section for it → `prepublishOnly` checks (typecheck + tests) →
  `npm publish --provenance --access public` with the repo secret
  `NPM_TOKEN`.
- `package.json` `files` whitelist, not git state, decides tarball contents;
  the tarball test (`tests/tarball.test.ts`) guards it.
