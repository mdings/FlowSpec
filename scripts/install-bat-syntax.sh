#!/usr/bin/env bash
# Install the FlowSpec syntax definition for bat (syntect).
# Safe to run repeatedly. Does not modify unrelated bat configuration.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNTAX_SRC="${ROOT}/syntaxes/FlowSpec.sublime-syntax"

if ! command -v bat >/dev/null 2>&1; then
  echo "error: bat is not installed or not on PATH." >&2
  echo "Install bat first, e.g.: brew install bat" >&2
  exit 1
fi

if [[ ! -f "${SYNTAX_SRC}" ]]; then
  echo "error: missing syntax definition: ${SYNTAX_SRC}" >&2
  exit 1
fi

CONFIG_DIR="$(bat --config-dir)"
SYNTAXES_DIR="${CONFIG_DIR}/syntaxes"
DEST="${SYNTAXES_DIR}/FlowSpec.sublime-syntax"

mkdir -p "${SYNTAXES_DIR}"
cp "${SYNTAX_SRC}" "${DEST}"
bat cache --build

echo
echo "FlowSpec syntax installed for bat."
echo "  ${DEST}"
echo
echo "Try:"
echo "  bat example.flowspec"
echo "  bat \"${ROOT}/examples/fixtures/terminal-highlighting.flowspec\""
