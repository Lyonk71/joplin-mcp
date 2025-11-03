#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Usage: $0 <patch|minor|major|beta> [--dry-run]"
    echo ""
    echo "Examples:"
    echo "  $0 patch          # 0.2.2 -> 0.2.3"
    echo "  $0 minor          # 0.2.0 -> 0.3.0"
    echo "  $0 major          # 0.2.0 -> 1.0.0"
    echo "  $0 beta           # 0.2.2 -> 0.2.3-beta.0"
    echo "  $0 patch --dry-run  # Show what would happen without making changes"
    exit 1
}

# Parse arguments
BUMP_TYPE="${1:-}"
DRY_RUN=false

if [[ "$BUMP_TYPE" == "" ]]; then
    usage
fi

if [[ "${2:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# Validate bump type
case "$BUMP_TYPE" in
    patch|minor|major|beta)
        ;;
    *)
        echo -e "${RED}❌ Invalid bump type: $BUMP_TYPE${NC}"
        usage
        ;;
esac

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")

echo -e "${BLUE}📦 Current version: $CURRENT_VERSION${NC}"
echo ""

# Calculate new version using npm version (in a temp dir to avoid modifying files)
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo '{"version":"'$CURRENT_VERSION'"}' > "$TEMP_DIR/package.json"
cd "$TEMP_DIR"

if [[ "$BUMP_TYPE" == "beta" ]]; then
    npm version prerelease --preid=beta --no-git-tag-version > /dev/null 2>&1
else
    npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null 2>&1
fi

NEW_VERSION=$(node -p "require('$TEMP_DIR/package.json').version")
cd "$PROJECT_ROOT"

echo -e "${GREEN}🚀 New version: $NEW_VERSION${NC}"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}🔍 DRY RUN - No changes will be made${NC}"
    echo ""
    echo "Would update:"
    echo "  - package.json: $CURRENT_VERSION -> $NEW_VERSION"
    echo ""
    echo "Would create:"
    echo "  - Git commit: 'Release v$NEW_VERSION'"
    echo "  - Git tag: 'v$NEW_VERSION'"
    exit 0
fi

# Update package.json
echo -e "${BLUE}📝 Updating package.json...${NC}"
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null 2>&1

# Stage changes
echo -e "${BLUE}💾 Staging changes...${NC}"
git add package.json package-lock.json 2>/dev/null || true

# Create commit
echo -e "${BLUE}💾 Creating commit...${NC}"
git commit -m "Release v$NEW_VERSION"

# Create tag
echo -e "${BLUE}🏷️  Creating tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo -e "${GREEN}✅ Release v$NEW_VERSION ready!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "  1. Review the changes:"
echo -e "     ${BLUE}git show${NC}"
echo ""
echo "  2. Push to trigger release:"
echo -e "     ${BLUE}git push origin main --tags${NC}"
echo ""
echo "This will trigger CI to:"
echo "  • Build and test the package"
echo "  • Publish @belsar-ai/joplin-mcp to npm"
echo "  • Create a GitHub release"
