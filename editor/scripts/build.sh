#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEME="FlowSpecEditor"
CONFIG="${CONFIG:-Debug}"
DERIVED_DATA="${DERIVED_DATA:-$ROOT/build}"
APP="$DERIVED_DATA/Build/Products/$CONFIG/FlowSpecEditor.app"

usage() {
  cat <<EOF
Usage: $(basename "$0") [command]

Commands:
  build   Build FlowSpecEditor (default)
  run     Build, then launch the app
  clean   Remove local build artifacts
  path    Print the built app bundle path

Environment:
  CONFIG        Debug or Release (default: Debug)
  DERIVED_DATA  Build output directory (default: ./build)

Examples:
  ./scripts/build.sh
  ./scripts/build.sh run
  CONFIG=Release ./scripts/build.sh build
EOF
}

require_xcodebuild() {
  if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "error: xcodebuild not found." >&2
    echo "Install Xcode from the App Store, or run: xcode-select --install" >&2
    exit 1
  fi
}

build_app() {
  require_xcodebuild
  mkdir -p "$DERIVED_DATA"

  echo "Building $SCHEME ($CONFIG)..."
  xcodebuild \
    -project "$ROOT/FlowSpecEditor.xcodeproj" \
    -scheme "$SCHEME" \
    -configuration "$CONFIG" \
    -derivedDataPath "$DERIVED_DATA" \
    build

  if [[ ! -d "$APP" ]]; then
    echo "error: expected app bundle at $APP" >&2
    exit 1
  fi

  echo "Built: $APP"
}

run_app() {
  build_app
  echo "Launching FlowSpecEditor..."
  open "$APP"
}

clean_build() {
  rm -rf "$DERIVED_DATA"
  echo "Removed: $DERIVED_DATA"
}

command="${1:-build}"

case "$command" in
  build)
    build_app
    ;;
  run)
    run_app
    ;;
  clean)
    clean_build
    ;;
  path)
    echo "$APP"
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
