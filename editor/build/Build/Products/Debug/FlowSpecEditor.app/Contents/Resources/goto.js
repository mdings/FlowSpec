/**
 * Shared Go to target indexing, definition resolution, and linked rename.
 * Used by the linter (FS014/FS015), the VS Code Definition Provider, and editors
 * that keep unique Go to references in sync when a destination name or Id changes.
 *
 * Go to may only resolve to top-level Flow / Screen / Action nodes:
 * - Flow as a document child
 * - Screen as a direct child of a Flow
 * - Action as a direct child of a Flow or Screen
 *
 * Actions nested under When / Once / If / Section / other containers are not targets.
 * Section and Layout are never Go to destinations.
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
 * True when a structural node is a valid Go to destination.
 * @param {object} node
 * @returns {boolean}
 */
function isTopLevelGoToTarget(node) {
  if (!isStructural(node)) return false;
  const parent = node.parent;
  if (!parent) return false;
  if (node.type === "flow") return parent.type === "document";
  if (node.type === "screen") return parent.type === "flow";
  if (node.type === "action") {
    return parent.type === "flow" || parent.type === "screen";
  }
  return false;
}

/**
 * Collect top-level Flow / Screen / Action targets from a parsed document tree.
 * Nested Actions (for example under When) are excluded.
 * @param {object} root
 * @param {string} filePath
 * @param {FlowSpecTarget[]} targets
 */
function collectStructuralTargets(root, filePath, targets) {
  walkNodes(root, (node) => {
    if (!isTopLevelGoToTarget(node)) return;
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
 * Escape a directive keyword for use in a line-start regex.
 * @param {string} keyword
 * @returns {string}
 */
function escapeKeyword(keyword) {
  return String(keyword || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 1-based column range of `value` after an optional indented keyword and colon.
 * An empty value yields a zero-width range at the insertion point after the prefix.
 * @param {string} lineText
 * @param {string|null} keyword
 * @param {string} value
 * @returns {{ startColumn: number, endColumn: number } | null}
 */
function getKeywordValueRange(lineText, keyword, value) {
  const indentMatch = String(lineText || "").match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0].length : 0;
  const trimmed = String(lineText || "").slice(indent);
  const target = String(value || "").trim();

  let prefixLength = 0;
  if (keyword) {
    const prefix = trimmed.match(
      new RegExp(`^${escapeKeyword(keyword)}\\b\\s*:?\\s*`)
    );
    if (!prefix) return null;
    prefixLength = prefix[0].length;
  }

  const remainder = trimmed.slice(prefixLength);
  if (!target) {
    const startColumn = indent + prefixLength + 1;
    return { startColumn, endColumn: startColumn };
  }

  let offset = 0;
  if (remainder.startsWith(target)) {
    offset = 0;
  } else {
    const idx = remainder.indexOf(target);
    if (idx === -1) return null;
    offset = idx;
  }

  const startColumn = indent + prefixLength + offset + 1;
  return {
    startColumn,
    endColumn: startColumn + target.length,
  };
}

/**
 * Compute the 1-based column range of the target text after `Go to`.
 * @param {string} lineText
 * @param {string} targetValue
 * @returns {{ startColumn: number, endColumn: number } | null}
 */
function getGoToTargetRange(lineText, targetValue) {
  const target = String(targetValue || "").trim();
  if (!target) return null;
  return getKeywordValueRange(lineText, "Go to", target);
}

/**
 * Display-name range for a top-level Flow / Screen / Action.
 * @param {string} lineText
 * @param {object} node
 * @returns {{ startColumn: number, endColumn: number } | null}
 */
function getStructuralNameRange(lineText, node) {
  const value = String(node?.value || "").trim();
  if (node?.implicit) {
    return getKeywordValueRange(lineText, null, value);
  }
  const keyword = node?.rawKind;
  if (!keyword) return null;
  return getKeywordValueRange(lineText, keyword, value);
}

/**
 * Id value range for the optional Id belonging to a structural node.
 * @param {string} lineText
 * @param {object} idNode
 * @returns {{ startColumn: number, endColumn: number } | null}
 */
function getIdValueRange(lineText, idNode) {
  const keyword = idNode?.rawKind || "Id";
  return getKeywordValueRange(lineText, keyword, String(idNode?.value || ""));
}

/**
 * True when the 1-based half-open edit sits inside a field, including a caret
 * at either edge so names and Ids can be extended.
 * @param {{ startColumn: number, endColumn: number }} edit
 * @param {{ startColumn: number, endColumn: number }} field
 * @returns {boolean}
 */
function isEditInsideField(edit, field) {
  return edit.startColumn >= field.startColumn && edit.endColumn <= field.endColumn;
}

/**
 * Apply a same-line column edit to the exact field substring.
 * @param {string} value
 * @param {{ startColumn: number, endColumn: number }} field
 * @param {{ startColumn: number, endColumn: number }} edit
 * @param {string} replacementText
 * @returns {string}
 */
function applyEditToField(value, field, edit, replacementText) {
  const start = edit.startColumn - field.startColumn;
  const end = edit.endColumn - field.startColumn;
  return value.slice(0, start) + replacementText + value.slice(end);
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

/**
 * Declaration locations in `filePath` for Flow / Screen / Action nodes
 * that are referenced by at least one Go to in the project, with the
 * originating Go to statements.
 *
 * @param {Array<{ source: string, filePath: string }>} files
 * @param {string} filePath
 * @returns {Array<{
 *   line: number,
 *   column: number,
 *   endLine: number,
 *   endColumn: number,
 *   references: Array<{ filePath: string, line: number, statement: string, ref: string }>
 * }>}
 */
function referencedGoToDestinations(files, filePath) {
  /** @type {FlowSpecTarget[]} */
  const targets = [];
  /** @type {Array<{ filePath: string, root: object, lines: string[] }>} */
  const parsedFiles = [];

  for (const file of files) {
    const parsed = parseTree(file.source, file.filePath);
    collectStructuralTargets(parsed.root, file.filePath, targets);
    parsedFiles.push({
      filePath: file.filePath,
      root: parsed.root,
      lines: parsed.lines,
    });
  }

  /** @type {Map<string, {
   *   line: number,
   *   column: number,
   *   endLine: number,
   *   endColumn: number,
   *   references: Array<{ filePath: string, line: number, statement: string, ref: string }>
   * }>} */
  const byTarget = new Map();

  for (const origin of parsedFiles) {
    walkNodes(origin.root, (node) => {
      if (node.type !== "goTo") return;
      const ref = String(node.value || "").trim();
      if (!ref) return;
      const statement = String(origin.lines[node.location.line - 1] || "").trim()
        || `Go to ${ref}`;
      for (const target of matchGoToTargets(ref, targets)) {
        if (target.filePath !== filePath) continue;
        const key = `${target.line}:${target.column}`;
        let destination = byTarget.get(key);
        if (!destination) {
          destination = {
            line: target.line,
            column: target.column,
            endLine: target.endLine ?? target.line,
            endColumn: target.endColumn ?? target.column,
            references: [],
          };
          byTarget.set(key, destination);
        }
        destination.references.push({
          filePath: origin.filePath,
          line: node.location.line,
          statement,
          ref,
        });
      }
    });
  }

  return [...byTarget.values()];
}

/**
 * Follow-up `Go to` replacements when a top-level Flow / Screen / Action name
 * or Id is edited in place.
 *
 * Only unique references that already resolved to this destination through the
 * edited field are updated. The original edit is not included; ranges are
 * 1-based and refer to sources before that edit.
 *
 * @param {Array<{ source: string, filePath: string }>} files
 * @param {{
 *   filePath: string,
 *   line: number,
 *   startColumn: number,
 *   endColumn: number,
 *   replacementText: string
 * }} edit
 * @returns {{
 *   field: "name"|"id",
 *   oldValue: string,
 *   newValue: string,
 *   edits: Array<{
 *     filePath: string,
 *     line: number,
 *     startColumn: number,
 *     endColumn: number,
 *     newText: string
 *   }>
 * } | null}
 */
function renameGoToReferences(files, edit) {
  if (!edit || !edit.filePath || !Number.isInteger(edit.line)) return null;
  const replacementText = String(edit.replacementText ?? "");
  if (/[\r\n]/.test(replacementText)) return null;

  const startColumn = Number(edit.startColumn);
  const endColumn = Number(edit.endColumn);
  if (!Number.isFinite(startColumn) || !Number.isFinite(endColumn)) return null;
  if (startColumn < 1 || endColumn < startColumn) return null;

  const columnEdit = { startColumn, endColumn };

  /** @type {FlowSpecTarget[]} */
  const targets = [];
  /** @type {Array<{ filePath: string, root: object, lines: string[] }>} */
  const parsedFiles = [];

  for (const file of files) {
    const parsed = parseTree(file.source, file.filePath);
    collectStructuralTargets(parsed.root, file.filePath, targets);
    parsedFiles.push({
      filePath: file.filePath,
      root: parsed.root,
      lines: parsed.lines,
    });
  }

  const current = parsedFiles.find((file) => file.filePath === edit.filePath);
  if (!current) return null;
  const lineText = current.lines[edit.line - 1];
  if (lineText == null) return null;

  /** @type {{ field: "name"|"id", oldValue: string, fieldRange: { startColumn: number, endColumn: number }, target: FlowSpecTarget } | null} */
  let hit = null;
  for (const target of targets) {
    if (target.filePath !== edit.filePath) continue;
    if (target.line === edit.line) {
      const fieldRange = getStructuralNameRange(lineText, target.node);
      if (fieldRange && isEditInsideField(columnEdit, fieldRange)) {
        hit = {
          field: "name",
          oldValue: String(target.name || "").trim(),
          fieldRange,
          target,
        };
        break;
      }
    }
    if (target.node?.idNode && target.node.idNode.location.line === edit.line) {
      const fieldRange = getIdValueRange(lineText, target.node.idNode);
      if (fieldRange && isEditInsideField(columnEdit, fieldRange)) {
        hit = {
          field: "id",
          oldValue: String(target.id || "").trim(),
          fieldRange,
          target,
        };
        break;
      }
    }
  }
  if (!hit || !hit.oldValue) return null;

  const nextValue = applyEditToField(
    hit.oldValue,
    hit.fieldRange,
    columnEdit,
    replacementText
  ).trim();
  if (nextValue === hit.oldValue) return null;

  /** @type {Array<{ filePath: string, line: number, startColumn: number, endColumn: number, newText: string }>} */
  const edits = [];
  for (const origin of parsedFiles) {
    walkNodes(origin.root, (node) => {
      if (node.type !== "goTo") return;
      const ref = String(node.value || "").trim();
      if (ref !== hit.oldValue) return;
      if (hit.field === "name" && ref !== hit.target.name) return;
      if (hit.field === "id" && ref !== hit.target.id) return;

      const matches = matchGoToTargets(ref, targets);
      if (matches.length !== 1) return;
      const match = matches[0];
      if (
        match.filePath !== hit.target.filePath ||
        match.line !== hit.target.line
      ) {
        return;
      }

      const range = getGoToTargetRange(
        origin.lines[node.location.line - 1] || "",
        ref
      );
      if (!range) return;
      edits.push({
        filePath: origin.filePath,
        line: node.location.line,
        startColumn: range.startColumn,
        endColumn: range.endColumn,
        newText: nextValue,
      });
    });
  }

  if (edits.length === 0) return null;
  return {
    field: hit.field,
    oldValue: hit.oldValue,
    newValue: nextValue,
    edits,
  };
}

module.exports = {
  collectStructuralTargets,
  isTopLevelGoToTarget,
  matchGoToTargets,
  getKeywordValueRange,
  getGoToTargetRange,
  getStructuralNameRange,
  findGoToAtPosition,
  resolveGoToDefinitions,
  referencedGoToDestinations,
  renameGoToReferences,
};
