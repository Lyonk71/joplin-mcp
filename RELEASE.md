# Release Process

This document outlines the process for creating new releases of `joplin-mcp`.

## TL;DR

- **For a simple patch/minor/major release from `main`:**
  1. Ensure `main` is up-to-date and stable.
  2. Run `npm run release:patch`, `npm run release:minor`, or `npm run release:major`.
  3. Run `git push --follow-tags`.

- **For a beta release from `main`:**
  1. Ensure `main` has the features you want to test.
  2. Run `npm run release:beta`.
  3. Run `git push --follow-tags`.

## Release Strategy

This project uses a release strategy based on industry best practices like [Git Flow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow). Releases are automated using `npm version` scripts and a GitHub Actions workflow.

### Versioning Scripts

All versioning is handled by the `release:*` scripts in `package.json`. These scripts automatically update the `package.json` version, create a new commit, and create a new git tag.

- `npm run release:patch`: For bug fixes (e.g., `v0.2.2` -> `v0.2.3`).
- `npm run release:minor`: For new features (e.g., `v0.2.2` -> `v0.3.0`).
- `npm run release:major`: For breaking changes (e.g., `v0.2.2` -> `v1.0.0`).
- `npm run release:beta`: For pre-releases (e.g., `v0.2.2` -> `v0.2.3-beta.0`).

### Automated Publishing

Publishing to npm is handled automatically by a GitHub Actions workflow. The workflow is triggered when a new tag matching the pattern `v*` is pushed to the repository.

- Tags containing "beta" (e.g., `v0.2.3-beta.0`) are published to the `beta` dist-tag on npm.
- All other tags are published to the `latest` dist-tag on npm.

### Promoting a Beta to a Stable Release

A stable release should always be created from a specific, well-tested commit that was previously a beta release. This ensures that only approved code is published as `latest`.

1.  **Identify the beta commit:** Find the tag of the beta you want to promote (e.g., `v0.3.0-beta.1`).

2.  **Create a release branch from the beta tag:**

    ```bash
    git checkout v0.3.0-beta.1
    git switch -c release/v0.3.0
    ```

3.  **Create the stable release:** Run the appropriate `release:*` command. `npm version` will automatically remove the `-beta.1` suffix and create a new commit and tag for the stable version (e.g., `v0.3.0`).

    ```bash
    npm run release:minor
    ```

4.  **Push the new tag to publish:**

    ```bash
    git push origin v0.3.0
    ```

5.  **Merge back to main:** Merge the release branch back into `main` to update the version in its `package.json`.

    ```bash
    git checkout main
    git merge release/v0.3.0
    git push
    ```

6.  **Clean up:** You can now delete the local release branch.
    ```bash
    git branch -d release/v0.3.0
    ```
