/**
 * Shared Go to target indexing and definition resolution.
 * Used by the linter (FS014/FS015) and the VS Code Definition Provider.
 */

const { parseTree, walkNodes, isStructural } = require("./parse");

/**
 * @typedef {object} FlowSpecTarget
 * @property {"Flow"|"Screen"|"Action"} kind
 * @property {string} name
 * @property {string} [id]
 * @property {string} filePath
 * @property {number} line
 * @property {number} column
 * @property {number} [endLine]
 * @property {number} [endColumn]
 * @property {object} node
 */

/**
 * Collect Flow / Screen / Action targets from a parsed document tree.
 * @param {object} root
 * @param {string} filePath
 * @param {FlowSpecTarget[]} targets
 */
function collectStructuralTargets(root, filePath, targets) {
  walkNodes(root, (node) => {
    if (!isStructural(node)) return;
    const kind =
      node.type === "flow" ? "Flow" : node.type === "screen" ? "Screen" : "Action";
    targets.push({
      kind,
      name: (node.value || "").trim(),
      id: node.id,
      filePath,
      line: node.location.line,
      column: node.location.column,
      endLine: node.location.endLine,
      endColumn: node.location.endColumn,
      node,
    });
  });
}

/**
 * Match a Go to reference against indexed targets by display name or Id.
 * Returns unique matches (same kind/name/id/file/line deduped).
 * @param {string} ref
 * @param {FlowSpecTarget[]} targets
 * @returns {FlowSpecTarget[]}
 */
function matchGoToTargets(ref, targets) {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return [];

  const matches = targets.filter(
    (t) => t.name === trimmed || (t.id && t.id === trimmed)
  );

  /** @type {FlowSpecTarget[]} */
  const uniqueMatches = [];
  const seen = new Set();
  for (const m of matches) {
    const key = `${m.kind}|${m.name}|${m.id || ""}|${m.filePath}|${m.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueMatches.push(m);
  }
  return uniqueMatches;
}

/**
 * Compute the 1-based column range of the target text after `Go to`.
 * @param {string} lineText
 * @param {string} targetValue
 * @returns {{ startColumn: number, endColumn: number } | null}
 */
function getGoToTargetRange(lineText, targetValue) {
  const indentMatch = String(lineText || "").match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0].length : 0;
  const trimmed = String(lineText || "").slice(indent);
  const prefix = trimmed.match(/^Go to\b\s*:?\s*/);
  if (!prefix) return null;

  const target = String(targetValue || "").trim();
  if (!target) return null;

  const remainder = trimmed.slice(prefix[0].length);
  let offset = 0;
  if (remainder.startsWith(target)) {
    offset = 0;
  } else {
    const idx = remainder.indexOf(target);
    if (idx === -1) return null;
    offset = idx;
  }

  const startColumn = indent + prefix[0].length + offset + 1;
  return {
    startColumn,
    endColumn: startColumn + target.length,
  };
}

/**
 * If the 1-based position sits on a Go to target (not the `Go to` keyword),
 * return the reference and its range.
 * @param {object} root
 * @param {string[]} lines
 * @param {number} line 1-based
 * @param {number} column 1-based
 * @returns {{ node: object, ref: string, range: { line: number, startColumn: number, endColumn: number } } | null}
 */
function findGoToAtPosition(root, lines, line, column) {
  /** @type {object|null} */
  let hit = null;
  walkNodes(root, (node) => {
    if (node.type !== "goTo") return;
    if (node.location.line !== line) return;
    hit = node;
  });
  if (!hit) return null;

  const lineText = lines[line - 1] ?? "";
  const range = getGoToTargetRange(lineText, hit.value);
  if (!range) return null;
  // Range is half-open: [startColumn, endColumn)
  if (column < range.startColumn || column >= range.endColumn) return null;

  return {
    node: hit,
    ref: String(hit.value || "").trim(),
    range: { line, startColumn: range.startColumn, endColumn: range.endColumn },
  };
}

/**
 * Resolve Go to definitions across a set of FlowSpec files.
 * Only resolves when `position` is on the target text after `Go to`.
 *
 * `originRange` spans the full target (including spaces) so editors can
 * underline the whole reference, not just a single word.
 *
 * @param {Array<{ source: string, filePath: string }>} files
 * @param {{ filePath: string, line: number, column: number }} position 1-based line/column
 * @returns {{ originRange: { line: number, startColumn: number, endColumn: number }, definitions: FlowSpecTarget[] } | null}
 */
function resolveGoToDefinitions(files, position) {
  /** @type {FlowSpecTarget[]} */
  const targets = [];
  /** @type {Map<string, { root: object, lines: string[] }>} */
  const byPath = new Map();

  for (const file of files) {
    const { root, lines } = parseTree(file.source, file.filePath);
    byPath.set(file.filePath, { root, lines });
    collectStructuralTargets(root, file.filePath, targets);
  }

  const tree = byPath.get(position.filePath);
  if (!tree) return null;

  const goTo = findGoToAtPosition(
    tree.root,
    tree.lines,
    position.line,
    position.column
  );
  if (!goTo) return null;

  return {
    originRange: goTo.range,
    definitions: matchGoToTargets(goTo.ref, targets),
  };
}

module.exports = {
  collectStructuralTargets,
  matchGoToTargets,
  getGoToTargetRange,
  findGoToAtPosition,
  resolveGoToDefinitions,
};
