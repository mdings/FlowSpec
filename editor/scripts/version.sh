#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBXPROJ="$ROOT/FlowSpecEditor.xcodeproj/project.pbxproj"
GIT_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel)"

usage() {
  cat <<EOF
Usage: $(basename "$0") <major|minor|patch|current>

Commands:
  major    Bump major version (e.g. 1.2.3 -> 2.0.0)
  minor    Bump minor version (e.g. 1.2.3 -> 1.3.0)
  patch    Bump patch version (e.g. 1.2.3 -> 1.2.4)
  current  Display the current marketing and build versions

Also available as:
  npm run release:major | release:minor | release:patch
EOF
}

plist_value() {
  local key="$1"
  grep -m1 "$key =" "$PBXPROJ" | sed -E "s/.*$key = ([^;]+);/\1/"
}

get_marketing_version() {
  plist_value "MARKETING_VERSION"
}

get_build_version() {
  plist_value "CURRENT_PROJECT_VERSION"
}

normalize_semver() {
  local version="$1"
  local major=0 minor=0 patch=0
  IFS='.' read -r major minor patch <<< "$version"
  printf '%s.%s.%s' "${major:-0}" "${minor:-0}" "${patch:-0}"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

COMMAND="$1"

if [[ "$COMMAND" == "current" ]]; then
  echo "editor-v$(normalize_semver "$(get_marketing_version)") ($(get_build_version))"
  exit 0
fi

if [[ "$COMMAND" != "major" && "$COMMAND" != "minor" && "$COMMAND" != "patch" ]]; then
  echo "error: unknown command '$COMMAND'" >&2
  echo "" >&2
  usage
  exit 1
fi

BRANCH="$(git -C "$GIT_ROOT" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: version bumps are only allowed on the main branch." >&2
  echo "Current branch: $BRANCH" >&2
  exit 1
fi

if [[ -n "$(git -C "$GIT_ROOT" status --porcelain)" ]]; then
  echo "error: working directory has uncommitted changes." >&2
  echo "Please commit or stash all changes before bumping the version." >&2
  exit 1
fi

CURRENT_MARKETING="$(get_marketing_version)"
CURRENT_BUILD="$(get_build_version)"
NORMALIZED="$(normalize_semver "$CURRENT_MARKETING")"
IFS='.' read -r MAJOR MINOR PATCH <<< "$NORMALIZED"

case "$COMMAND" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_BUILD=$((CURRENT_BUILD + 1))
TAG="editor-v$NEW_VERSION"

echo "Bumping FlowSpec Editor: $CURRENT_MARKETING ($CURRENT_BUILD) -> $NEW_VERSION ($NEW_BUILD)"

sed -i '' "s/MARKETING_VERSION = ${CURRENT_MARKETING};/MARKETING_VERSION = ${NEW_VERSION};/g" "$PBXPROJ"
sed -i '' "s/CURRENT_PROJECT_VERSION = ${CURRENT_BUILD};/CURRENT_PROJECT_VERSION = ${NEW_BUILD};/g" "$PBXPROJ"

git -C "$GIT_ROOT" add "$PBXPROJ"
git -C "$GIT_ROOT" commit -m "release: $TAG"
git -C "$GIT_ROOT" tag "$TAG"
git -C "$GIT_ROOT" push origin main
git -C "$GIT_ROOT" push origin "$TAG"

echo ""
echo "Released $TAG and pushed to origin."
echo "The Release Editor workflow will notarize and publish the Sparkle update."
