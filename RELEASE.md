# Release Process

This document outlines the process for creating new releases of `@belsar-ai/joplin-mcp`.

## TL;DR

- **For a simple patch/minor/major release from `main`:**
  1. Ensure `main` is up-to-date and stable.
  2. Run `make release-patch`, `make release-minor`, or `make release-major`.
  3. Run `git push origin main --tags`.

- **For a beta release from `main`:**
  1. Ensure `main` has the features you want to test.
  2. Run `make release-beta`.
  3. Run `git push origin main --tags`.

## Release Strategy

This project uses a release strategy based on industry best practices like [Git Flow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow). Releases are automated using `npm version` scripts and a GitHub Actions workflow.

### Versioning with Makefile

All versioning is handled by the Makefile targets which call the `scripts/release.sh` script. These commands automatically update the `package.json` version, create a new commit, and create a new git tag.

- `make release-patch`: For bug fixes (e.g., `v0.2.2` -> `v0.2.3`).
- `make release-minor`: For new features (e.g., `v0.2.2` -> `v0.3.0`).
- `make release-major`: For breaking changes (e.g., `v0.2.2` -> `v1.0.0`).
- `make release-beta`: For pre-releases (e.g., `v0.2.2` -> `v0.2.3-beta.0`).

### Automated Publishing

Publishing to npm is handled automatically by a GitHub Actions workflow. The workflow is triggered when a new tag matching the pattern `v*` is pushed to the repository.

- Tags containing "beta" (e.g., `v0.2.3-beta.0`) are published to the `beta` dist-tag on npm.
- All other tags are published to the `latest` dist-tag on npm.

### Promoting a Beta to a Stable Release

A stable release should always be created from a specific, well-tested commit that was previously a beta release. This ensures that only approved code is published as `latest`.

1.  **Identify the beta commit:** Find the tag of the beta you want to promote (e.g., `v0.3.0-beta.1`).

2.  **Checkout the beta tag:**

    ```bash
    git checkout v0.3.0-beta.1
    ```

3.  **Create the stable tag without the beta suffix:**

    ```bash
    git tag v0.3.0
    ```

4.  **Push the new tag to publish:**

    ```bash
    git push origin v0.3.0
    ```

This will trigger the GitHub Actions workflow to publish the stable release to npm with the `latest` tag.
