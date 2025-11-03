.PHONY: help release-patch release-minor release-major release-beta check-git-clean build test typecheck

# Default target
help:
	@echo "Available release commands:"
	@echo "  make release-patch    - Bump patch version (0.2.2 -> 0.2.3)"
	@echo "  make release-minor    - Bump minor version (0.2.0 -> 0.3.0)"
	@echo "  make release-major    - Bump major version (0.2.0 -> 1.0.0)"
	@echo "  make release-beta     - Bump to beta prerelease (0.2.2 -> 0.2.3-beta.0)"
	@echo ""
	@echo "Build and test commands:"
	@echo "  make build            - Build the project"
	@echo "  make test             - Run tests"
	@echo "  make typecheck        - Run typecheck"

# Check if git working directory is clean
check-git-clean:
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "❌ Error: Git working directory is not clean."; \
		echo "Please commit or stash changes first."; \
		git status --short; \
		exit 1; \
	fi

# Release commands
release-patch: check-git-clean
	@./scripts/release.sh patch

release-minor: check-git-clean
	@./scripts/release.sh minor

release-major: check-git-clean
	@./scripts/release.sh major

release-beta: check-git-clean
	@./scripts/release.sh beta

# Build commands (wrappers for npm scripts)
build:
	@echo "🔨 Building package..."
	@npm run build

test:
	@echo "🧪 Testing package..."
	@npm test

typecheck:
	@echo "🔍 Typechecking package..."
	@npm run typecheck
