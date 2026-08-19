#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEME="FlowSpecEditor"
PROJECT="$ROOT/FlowSpecEditor.xcodeproj"
DIST="${DIST:-$ROOT/dist}"
SPARKLE_VERSION="${SPARKLE_VERSION:-2.9.6}"
SPARKLE_TOOLS="${SPARKLE_TOOLS:-$ROOT/.sparkle-tools}"
FEED_HOST="https://github.com/mdings/FlowSpec"

usage() {
  cat <<EOF
Usage: $(basename "$0") [command]

Commands:
  keys     One-time Sparkle EdDSA key generation (prints SUPublicEDKey)
  package  Archive, notarize, zip, and generate appcast (default)

Environment:
  APPLE_TEAM_ID              10-character Apple Team ID (required for package)
  APPLE_ID                   Apple ID for notarization (required for package)
  APPLE_PASSWORD             App-specific password for notarization (required for package)
  SPARKLE_PRIVATE_KEY        EdDSA private key (or SPARKLE_PRIVATE_KEY_FILE)
  SPARKLE_PRIVATE_KEY_FILE   Path to the exported Sparkle private key
  TAG                        GitHub release tag (default: editor-v<MARKETING_VERSION>)
  DIST                       Output directory (default: editor/dist)
  SKIP_NOTARIZE              Set to 1 to skip notarization (local dry run)

Examples:
  ./scripts/release.sh keys
  ./scripts/release.sh package
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

ensure_sparkle_tools() {
  if [[ -x "$SPARKLE_TOOLS/bin/generate_appcast" && -x "$SPARKLE_TOOLS/bin/generate_keys" ]]; then
    return
  fi

  require_cmd curl
  mkdir -p "$SPARKLE_TOOLS"
  echo "Downloading Sparkle $SPARKLE_VERSION tools..."
  curl -fsSL "https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz" \
    | tar -xJ -C "$SPARKLE_TOOLS"
}

read_public_ed_key() {
  /usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$ROOT/FlowSpecEditor/Info.plist"
}

generate_keys() {
  ensure_sparkle_tools
  echo "Generating or looking up the Sparkle EdDSA key in your login keychain..."
  echo
  "$SPARKLE_TOOLS/bin/generate_keys"
  echo
  echo "Next steps:"
  echo "  1. Copy the SUPublicEDKey string into editor/FlowSpecEditor/Info.plist"
  echo "  2. Export the private key:"
  echo "       $SPARKLE_TOOLS/bin/generate_keys -x sparkle_private.key"
  echo "  3. Store the file contents as GitHub secret SPARKLE_PRIVATE_KEY"
  echo "  4. Delete sparkle_private.key from disk after adding the secret"
}

resolve_private_key() {
  if [[ -n "${SPARKLE_PRIVATE_KEY_FILE:-}" ]]; then
    if [[ ! -f "$SPARKLE_PRIVATE_KEY_FILE" ]]; then
      echo "error: SPARKLE_PRIVATE_KEY_FILE not found: $SPARKLE_PRIVATE_KEY_FILE" >&2
      exit 1
    fi
    SPARKLE_PRIVATE_KEY="$(cat "$SPARKLE_PRIVATE_KEY_FILE")"
  fi

  if [[ -z "${SPARKLE_PRIVATE_KEY:-}" ]]; then
    echo "error: set SPARKLE_PRIVATE_KEY or SPARKLE_PRIVATE_KEY_FILE" >&2
    exit 1
  fi
}

package_app() {
  require_cmd xcodebuild
  require_cmd ditto
  require_cmd xcrun
  ensure_sparkle_tools
  resolve_private_key

  local public_key
  public_key="$(read_public_ed_key)"
  if [[ -z "$public_key" || "$public_key" == "REPLACE_WITH_SPARKLE_PUBLIC_ED_KEY" ]]; then
    echo "error: SUPublicEDKey is not set in Info.plist. Run: ./scripts/release.sh keys" >&2
    exit 1
  fi

  : "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"

  local identity="${CODE_SIGN_IDENTITY:-Developer ID Application}"
  local archive_path="$DIST/FlowSpecEditor.xcarchive"
  local app_path="$archive_path/Products/Applications/FlowSpecEditor.app"
  local zip_path="$DIST/archives/FlowSpecEditor.zip"

  rm -rf "$DIST"
  mkdir -p "$DIST/archives"

  echo "Archiving $SCHEME (Release, universal)..."
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$archive_path" \
    -destination "generic/platform=macOS" \
    ARCHS="arm64 x86_64" \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="$identity" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    archive

  if [[ ! -d "$app_path" ]]; then
    echo "error: expected app at $app_path" >&2
    exit 1
  fi

  echo "Zipping app bundle..."
  ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"

  if [[ "${SKIP_NOTARIZE:-0}" != "1" ]]; then
    : "${APPLE_ID:?Set APPLE_ID}"
    : "${APPLE_PASSWORD:?Set APPLE_PASSWORD}"

    echo "Submitting for notarization..."
    xcrun notarytool submit "$zip_path" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait

    echo "Stapling ticket..."
    xcrun stapler staple "$app_path"

    echo "Re-zipping stapled app..."
    rm -f "$zip_path"
    ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"
  else
    echo "Skipping notarization (SKIP_NOTARIZE=1)."
  fi

  local marketing_version
  marketing_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Contents/Info.plist")"
  local tag="${TAG:-editor-v${marketing_version}}"
  local download_prefix="${FEED_HOST}/releases/download/${tag}/"

  echo "Generating appcast for $tag..."
  printf '%s' "$SPARKLE_PRIVATE_KEY" | "$SPARKLE_TOOLS/bin/generate_appcast" \
    --ed-key-file - \
    --download-url-prefix "$download_prefix" \
    --maximum-deltas 0 \
    --link "$FEED_HOST" \
    -o "$DIST/appcast.xml" \
    "$DIST/archives"

  cp "$zip_path" "$DIST/FlowSpecEditor.zip"

  echo "$tag" > "$DIST/TAG"
  echo "Packaged:"
  echo "  $DIST/FlowSpecEditor.zip"
  echo "  $DIST/appcast.xml"
  echo "  tag: $tag"
}

command="${1:-package}"

case "$command" in
  keys)
    generate_keys
    ;;
  package)
    package_app
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "error: unknown command '$command'" >&2
    usage
    exit 1
    ;;
esac
