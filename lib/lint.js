/**
 * FlowSpec v1 linter — structural rules FS001–FS016.
 */

const { ID_PATTERN, RECOMMENDED_SECTION_ORDER } = require("./constants");
const {
  createDiagnostic,
  sortDiagnostics,
  countDiagnostics,
} = require("./diagnostics");
const { parseTree, walkNodes, isStructural, isSection } = require("./parse");

const ACTION_SECTION_TYPES = new Set([
  "receives",
  "rules",
  "steps",
  "shows",
  "outcome",
]);

const CONTROL_TYPES = new Set(["once", "if", "otherwise", "ifFails"]);

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {import("./diagnostics").FlowSpecDiagnostic[]}
 */
function lintFlowSpecFile(source, filePath) {
  return lintFlowSpecProject([{ source, filePath }]);
}

/**
 * @param {Array<{ source: string, filePath: string }>} files
 * @returns {import("./diagnostics").FlowSpecDiagnostic[]}
 */
function lintFlowSpecProject(files) {
  /** @type {import("./diagnostics").FlowSpecDiagnostic[]} */
  const diagnostics = [];
  /** @type {Array<{ filePath: string, root: object, parseDiagnostics: object[] }>} */
  const parsed = [];

  for (const file of files) {
    const { root, diagnostics: parseDiagnostics } = parseTree(
      file.source,
      file.filePath
    );
    parsed.push({
      filePath: file.filePath,
      root,
      parseDiagnostics,
    });
    diagnostics.push(...parseDiagnostics);
  }

  /** @type {Map<string, { filePath: string, line: number, column: number, node: object }>} */
  const idIndex = new Map();
  /** @type {Array<{ kind: string, name: string, id?: string, filePath: string, line: number, column: number, node: object }>} */
  const targets = [];

  for (const { filePath, root } of parsed) {
    lintFileStructure(root, filePath, diagnostics);
    collectTargetsAndIds(root, filePath, idIndex, targets, diagnostics);
  }

  for (const { filePath, root } of parsed) {
    lintGoToReferences(root, filePath, targets, diagnostics);
  }

  return sortDiagnostics(diagnostics);
}

/**
 * @param {object} root
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintFileStructure(root, filePath, diagnostics) {
  const top = root.children || [];

  // FS001 — first meaningful top-level directive must be Flow
  const firstStructuralOrDirective = top.find(
    (n) =>
      isStructural(n) ||
      isSection(n) ||
      n.type === "when" ||
      n.type === "once" ||
      n.type === "if" ||
      n.type === "otherwise" ||
      n.type === "ifFails" ||
      n.type === "parallel" ||
      n.type === "goTo" ||
      n.type === "id" ||
      n.type === "unknown"
  );

  if (!firstStructuralOrDirective) {
    // empty / comments-only file — still requires Flow
    diagnostics.push(
      createDiagnostic({
        code: "FS001",
        severity: "error",
        message: "File must start with a Flow directive.",
        filePath,
        line: 1,
        column: 1,
        suggestion: "Add a top-level Flow directive.",
      })
    );
  } else if (firstStructuralOrDirective.type !== "flow") {
    diagnostics.push(
      createDiagnostic({
        code: "FS001",
        severity: "error",
        message: "File must start with a Flow directive.",
        filePath,
        line: firstStructuralOrDirective.location.line,
        column: firstStructuralOrDirective.location.column,
        suggestion: "Move or add a Flow directive at the beginning of the file.",
      })
    );
  }

  // FS002 — one top-level Flow
  const topFlows = top.filter((n) => n.type === "flow");
  for (let i = 1; i < topFlows.length; i++) {
    diagnostics.push(
      createDiagnostic({
        code: "FS002",
        severity: "error",
        message: "Only one top-level Flow is allowed per file.",
        filePath,
        line: topFlows[i].location.line,
        column: topFlows[i].location.column,
        relatedLocations: [
          {
            message: "First Flow defined here",
            filePath,
            line: topFlows[0].location.line,
            column: topFlows[0].location.column,
          },
        ],
      })
    );
  }

  // Nested Flow directives
  walkNodes(root, (node) => {
    if (node.type !== "flow" || node.parent?.type === "document") return;
    diagnostics.push(
      createDiagnostic({
        code: "FS002",
        severity: "error",
        message: "Nested Flow directives are not allowed.",
        filePath,
        line: node.location.line,
        column: node.location.column,
      })
    );
  });

  walkNodes(root, (node) => {
    // FS004 / FS005 / multiple ids handled in collect + here for orphan format
    if (node.type === "id") {
      if (!node.owner) {
        diagnostics.push(
          createDiagnostic({
            code: "FS004",
            severity: "error",
            message:
              "Id may only belong to the directly preceding Flow, Screen, or Action.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      } else if (node.owner.idNode && node.owner.idNode !== node) {
        diagnostics.push(
          createDiagnostic({
            code: "FS004",
            severity: "error",
            message: `Multiple Ids assigned to the same ${node.owner.type}.`,
            filePath,
            line: node.location.line,
            column: node.location.column,
            relatedLocations: [
              {
                message: "First Id defined here",
                filePath,
                line: node.owner.idNode.location.line,
                column: node.owner.idNode.location.column,
              },
            ],
          })
        );
      }

      if (node.value) {
        if (!ID_PATTERN.test(node.value)) {
          diagnostics.push(
            createDiagnostic({
              code: "FS005",
              severity: "error",
              message: `Invalid Id "${node.value}". Ids must match ^[a-z0-9][a-z0-9._-]*$.`,
              filePath,
              line: node.location.line,
              column: node.location.column,
              suggestion:
                "Use lowercase letters, numbers, hyphens, underscores, and periods only.",
            })
          );
        }
      } else {
        diagnostics.push(
          createDiagnostic({
            code: "FS005",
            severity: "error",
            message: "Id value is empty.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }

      // Deprecated uppercase ID → FS016 warning
      if (node.deprecatedCasing) {
        diagnostics.push(
          createDiagnostic({
            code: "FS016",
            severity: "warning",
            message: 'Unknown directive "ID". Did you mean "Id"?',
            filePath,
            line: node.location.line,
            column: node.location.column,
            suggestion: "Id",
          })
        );
      }
    }

    if (isStructural(node) && node.deprecatedCasing) {
      diagnostics.push(
        createDiagnostic({
          code: "FS016",
          severity: "warning",
          message: `Unknown directive "${node.rawKind}". Did you mean "${
            node.type === "flow" ? "Flow" : node.type === "screen" ? "Screen" : "Action"
          }"?`,
          filePath,
          line: node.location.line,
          column: node.location.column,
          suggestion:
            node.type === "flow"
              ? "Flow"
              : node.type === "screen"
                ? "Screen"
                : "Action",
        })
      );
    }

    if (node.type === "unknown") {
      diagnostics.push(
        createDiagnostic({
          code: "FS016",
          severity: "warning",
          message: `Unknown directive "${node.rawKind}". Did you mean "${node.suggestion}"?`,
          filePath,
          line: node.location.line,
          column: node.location.column,
          suggestion: node.suggestion,
        })
      );
    }

    // FS007 — action sections only inside Action
    if (isSection(node)) {
      const action = findAncestor(node, (n) => n.type === "action");
      if (!action) {
        diagnostics.push(
          createDiagnostic({
            code: "FS007",
            severity: "error",
            message: `${node.value} may only appear inside an Action.`,
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }
    }

    // FS008 — duplicate action section
    if (node.type === "action") {
      const seen = new Map();
      for (const child of node.children || []) {
        if (!isSection(child)) continue;
        if (seen.has(child.type)) {
          diagnostics.push(
            createDiagnostic({
              code: "FS008",
              severity: "error",
              message: `Duplicate ${child.value} section in the same Action.`,
              filePath,
              line: child.location.line,
              column: child.location.column,
              relatedLocations: [
                {
                  message: `First ${child.value} defined here`,
                  filePath,
                  line: seen.get(child.type).location.line,
                  column: seen.get(child.type).location.column,
                },
              ],
            })
          );
        } else {
          seen.set(child.type, child);
        }
      }

      // FS009 — recommended section order
      const sectionChildren = (node.children || []).filter(isSection);
      let maxIndex = -1;
      for (const child of sectionChildren) {
        const idx = RECOMMENDED_SECTION_ORDER.indexOf(child.value);
        if (idx === -1) continue;
        if (idx < maxIndex) {
          diagnostics.push(
            createDiagnostic({
              code: "FS009",
              severity: "warning",
              message: `${child.value} appears out of the recommended order (Receives → Rules → Steps → Shows → Outcome).`,
              filePath,
              line: child.location.line,
              column: child.location.column,
              suggestion:
                "Preferred order: Receives, Rules, Steps, Shows, Outcome.",
            })
          );
        } else {
          maxIndex = idx;
        }
      }

      // FS010 — empty Action
      if (!actionHasMeaningfulContent(node)) {
        diagnostics.push(
          createDiagnostic({
            code: "FS010",
            severity: "warning",
            message:
              "Action is empty. Add Receives, Rules, Steps, Shows, Outcome, a nested control instruction, or Go to.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }
    }

    // FS011 — At the same time only inside Steps
    if (node.type === "parallel") {
      const steps = findAncestor(node, (n) => n.type === "steps");
      if (!steps) {
        diagnostics.push(
          createDiagnostic({
            code: "FS011",
            severity: "error",
            message: "At the same time may only appear inside Steps.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }
    }

    // FS012 — control-flow placement
    if (CONTROL_TYPES.has(node.type)) {
      if (!isValidControlPlacement(node)) {
        const label =
          node.type === "ifFails"
            ? "If ... fails"
            : node.type === "once"
              ? "Once"
              : node.type === "if"
                ? "If"
                : "Otherwise";
        diagnostics.push(
          createDiagnostic({
            code: "FS012",
            severity: "error",
            message: `${label} cannot appear inside Receives, Rules, Shows, or Outcome.`,
            filePath,
            line: node.location.line,
            column: node.location.column,
            suggestion:
              "Place this directive inside Steps, or directly inside a Screen or Flow.",
          })
        );
      }
    }

    // FS013 — Otherwise matching
    if (node.type === "otherwise") {
      const parent = node.parent;
      const siblings = parent?.children || [];
      const index = siblings.indexOf(node);
      let matched = false;
      for (let i = index - 1; i >= 0; i--) {
        const prev = siblings[i];
        if (prev.type === "otherwise") break;
        if (prev.type === "if" && prev.indentation === node.indentation) {
          matched = true;
          break;
        }
        if (prev.type === "ifFails") {
          // If ... fails does not create an Otherwise branch
          continue;
        }
      }
      if (!matched) {
        diagnostics.push(
          createDiagnostic({
            code: "FS013",
            severity: "error",
            message:
              "Otherwise must follow a preceding If at the same indentation level within the same parent block.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }
    }
  });
}

/**
 * @param {object} root
 * @param {string} filePath
 * @param {Map<string, object>} idIndex
 * @param {object[]} targets
 * @param {object[]} diagnostics
 */
function collectTargetsAndIds(root, filePath, idIndex, targets, diagnostics) {
  walkNodes(root, (node) => {
    if (!isStructural(node)) return;

    const kind =
      node.type === "flow" ? "Flow" : node.type === "screen" ? "Screen" : "Action";
    const name = (node.value || "").trim();
    targets.push({
      kind,
      name,
      id: node.id,
      filePath,
      line: node.location.line,
      column: node.location.column,
      node,
    });

    if (node.id && ID_PATTERN.test(node.id) && node.idNode === node.idNode) {
      // only index the primary id node
    }
    if (node.id && node.idNode && ID_PATTERN.test(node.id)) {
      if (idIndex.has(node.id)) {
        const first = idIndex.get(node.id);
        diagnostics.push(
          createDiagnostic({
            code: "FS006",
            severity: "error",
            message: `Duplicate Id "${node.id}".`,
            filePath,
            line: node.idNode.location.line,
            column: node.idNode.location.column,
            relatedLocations: [
              {
                message: "First definition",
                filePath: first.filePath,
                line: first.line,
                column: first.column,
              },
            ],
          })
        );
      } else {
        idIndex.set(node.id, {
          filePath,
          line: node.idNode.location.line,
          column: node.idNode.location.column,
          node,
        });
      }
    }
  });
}

/**
 * @param {object} root
 * @param {string} filePath
 * @param {object[]} targets
 * @param {object[]} diagnostics
 */
function lintGoToReferences(root, filePath, targets, diagnostics) {
  walkNodes(root, (node) => {
    if (node.type !== "goTo") return;
    const ref = (node.value || "").trim();
    if (!ref) {
      diagnostics.push(
        createDiagnostic({
          code: "FS014",
          severity: "warning",
          message: 'Unresolved Go to target "". Expected a Flow, Screen, or Action with this name or Id.',
          filePath,
          line: node.location.line,
          column: node.location.column,
        })
      );
      return;
    }

    const matches = targets.filter(
      (t) => t.name === ref || (t.id && t.id === ref)
    );

    // Deduplicate identical targets (same kind, name, id, file, line).
    const uniqueMatches = [];
    const seen = new Set();
    for (const m of matches) {
      const key = `${m.kind}|${m.name}|${m.id || ""}|${m.filePath}|${m.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueMatches.push(m);
    }

    if (uniqueMatches.length === 0) {
      diagnostics.push(
        createDiagnostic({
          code: "FS014",
          severity: "warning",
          message: `Unresolved Go to target "${ref}". Expected a Flow, Screen, or Action with this name or Id.`,
          filePath,
          line: node.location.line,
          column: node.location.column,
        })
      );
      return;
    }

    if (uniqueMatches.length > 1) {
      const list = uniqueMatches
        .map((m) => `- ${m.kind}: ${m.name}${m.id ? ` (${m.id})` : ""}`)
        .join("\n");
      diagnostics.push(
        createDiagnostic({
          code: "FS015",
          severity: "warning",
          message: `Ambiguous Go to target "${ref}".\n\nMatches:\n${list}\n\nUse an Id to disambiguate the target.`,
          filePath,
          line: node.location.line,
          column: node.location.column,
          suggestion: "Use an Id to disambiguate the target.",
        })
      );
    }
  });
}

function actionHasMeaningfulContent(action) {
  for (const child of action.children || []) {
    if (child.type === "id") continue;
    if (isSection(child)) return true;
    if (child.type === "goTo") return true;
    if (
      child.type === "when" ||
      child.type === "once" ||
      child.type === "if" ||
      child.type === "otherwise" ||
      child.type === "ifFails" ||
      child.type === "parallel"
    ) {
      return true;
    }
    // Nested controls/goTo deeper than direct children still count
    let found = false;
    walkNodes(child, (n) => {
      if (n === child) return;
      if (
        isSection(n) ||
        n.type === "goTo" ||
        CONTROL_TYPES.has(n.type) ||
        n.type === "parallel" ||
        n.type === "when"
      ) {
        found = true;
      }
    });
    if (found) return true;
    if (child.type === "content") return true;
  }
  return false;
}

function isValidControlPlacement(node) {
  const banned = findAncestor(
    node,
    (n) =>
      n.type === "receives" ||
      n.type === "rules" ||
      n.type === "shows" ||
      n.type === "outcome"
  );
  if (banned) return false;

  if (findAncestor(node, (n) => n.type === "steps")) return true;

  // Directly inside Flow or Screen (including under When / Once / If / parallel).
  const flowOrScreen = findAncestor(
    node,
    (n) => n.type === "flow" || n.type === "screen"
  );
  if (!flowOrScreen) return false;

  const action = findAncestor(node, (n) => n.type === "action");
  // Bare Action (outside Steps) is not an allowed parent context.
  if (action) return false;

  return true;
}

function findAncestor(node, predicate) {
  let cur = node.parent;
  while (cur) {
    if (predicate(cur)) return cur;
    cur = cur.parent;
  }
  return null;
}

module.exports = {
  lintFlowSpecFile,
  lintFlowSpecProject,
  countDiagnostics,
};
