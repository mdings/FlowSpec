/**
 * FlowSpec v1 linter — structural rules FS001–FS017.
 */

const { ID_PATTERN, RECOMMENDED_SECTION_ORDER } = require("./constants");
const {
  createDiagnostic,
  sortDiagnostics,
  countDiagnostics,
} = require("./diagnostics");
const { parseTree, walkNodes, isStructural, isSection } = require("./parse");

const ACTION_ONLY_SECTION_TYPES = new Set([
  "receives",
  "rules",
  "uses",
  "steps",
  "outcome",
]);

const CONTROL_TYPES = new Set(["once", "if", "otherwise", "ifFails"]);
const CONTROL_OR_WHEN_TYPES = new Set(["when", "once", "if", "otherwise", "ifFails"]);

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

    // FS007 — section placement (indentation-based ownership only)
    if (isSection(node)) {
      if (node.type === "shows") {
        lintShowsPlacement(node, filePath, diagnostics);
      } else if (ACTION_ONLY_SECTION_TYPES.has(node.type)) {
        lintActionOnlySectionPlacement(node, filePath, diagnostics);
      }
    }

    // FS008 — duplicate section under Action or Screen
    if (node.type === "action" || node.type === "screen") {
      const seen = new Map();
      for (const child of node.children || []) {
        if (!isSection(child)) continue;
        // Screen may only contain Shows; other sections are handled by FS007
        if (node.type === "screen" && child.type !== "shows") continue;
        if (seen.has(child.type)) {
          diagnostics.push(
            createDiagnostic(duplicateSectionDiagnostic(node, child, seen.get(child.type), filePath))
          );
        } else {
          seen.set(child.type, child);
        }
      }
    }

    // FS009 / FS010 — Action-only
    if (node.type === "action") {
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
              message: `${child.value} appears out of the recommended order (Receives → Rules → Uses → Steps → control-flow → Shows → Outcome).`,
              filePath,
              line: child.location.line,
              column: child.location.column,
              suggestion:
                "Preferred order: Receives, Rules, Uses, Steps, action-level control-flow, Shows, Outcome.",
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
              "Action is empty. Add Receives, Rules, Uses, Steps, Shows, Outcome, a nested control instruction, or Go to.",
            filePath,
            line: node.location.line,
            column: node.location.column,
          })
        );
      }

      // FS017 — Outcome should be the final direct child of an Action
      warnOutcomeNotFinal(node, filePath, diagnostics);
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
            message: `${label} cannot appear inside Receives, Rules, Uses, Shows, or Outcome.`,
            filePath,
            line: node.location.line,
            column: node.location.column,
            suggestion:
              "Place this directive inside Steps, or directly inside a Flow, Screen, or Action.",
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
          message: `Unresolved Go to target "${ref}". Expected a Flow, Screen, or Action with this name or Id in any loaded FlowSpec file.`,
          filePath,
          line: node.location.line,
          column: node.location.column,
        })
      );
      return;
    }

    if (uniqueMatches.length > 1) {
      const list = uniqueMatches
        .map(
          (m) =>
            `- ${m.kind}: ${m.name}${m.id ? ` (${m.id})` : ""} — ${m.filePath}`
        )
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
      n.type === "uses" ||
      n.type === "shows" ||
      n.type === "outcome"
  );
  if (banned) return false;

  if (findAncestor(node, (n) => n.type === "steps")) return true;

  // Directly inside Flow, Screen, or Action (including nested under When / Once / If).
  return Boolean(
    findAncestor(
      node,
      (n) => n.type === "flow" || n.type === "screen" || n.type === "action"
    )
  );
}

/**
 * Receives / Rules / Uses / Steps / Outcome must be direct children of an Action.
 * @param {object} node
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintActionOnlySectionPlacement(node, filePath, diagnostics) {
  if (node.parent?.type === "action") return;

  const label = node.value || node.type;
  const preceding = findPrecedingStructuralSibling(node);
  /** @type {string|undefined} */
  let suggestion;

  if (preceding?.type === "action") {
    const name = (preceding.value || "").trim() || "Action";
    suggestion = `Indent "${label}" under "Action ${name}" if it belongs to that action.`;
  } else if (
    node.parent &&
    (isSection(node.parent) ||
      CONTROL_OR_WHEN_TYPES.has(node.parent.type) ||
      node.parent.type === "parallel")
  ) {
    suggestion = `"${label}" may only appear as a direct section inside an Action.`;
  }

  diagnostics.push(
    createDiagnostic({
      code: "FS007",
      severity: "error",
      message: `"${label}" must be nested inside an Action.`,
      filePath,
      line: node.location.line,
      column: node.location.column,
      suggestion,
    })
  );
}

/**
 * Shows must be indented under a Screen or Action (or under control-flow inside one).
 * Adjacency / same-indent siblings are not owners.
 * @param {object} node
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintShowsPlacement(node, filePath, diagnostics) {
  if (isValidShowsPlacement(node)) return;

  const preceding = findPrecedingStructuralSibling(node);
  /** @type {string|undefined} */
  let suggestion;
  if (preceding?.type === "screen") {
    const name = (preceding.value || "").trim() || "Screen";
    suggestion = `Indent "Shows" under "Screen ${name}" if it describes that screen.`;
  } else if (preceding?.type === "action") {
    const name = (preceding.value || "").trim() || "Action";
    suggestion = `Indent "Shows" under "Action ${name}" if it belongs to that action.`;
  }

  diagnostics.push(
    createDiagnostic({
      code: "FS007",
      severity: "error",
      message: '"Shows" must be nested inside a Screen or Action.',
      filePath,
      line: node.location.line,
      column: node.location.column,
      suggestion,
    })
  );
}

/**
 * @param {object} node
 * @returns {boolean}
 */
function isValidShowsPlacement(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "action" || parent.type === "screen") return true;
  // Shows may nest under action/screen-level control-flow (e.g. If ... fails).
  if (CONTROL_OR_WHEN_TYPES.has(parent.type)) {
    return Boolean(
      findAncestor(node, (n) => n.type === "action" || n.type === "screen")
    );
  }
  return false;
}

/**
 * @param {object} node
 * @returns {object|null}
 */
function findPrecedingStructuralSibling(node) {
  const parent = node.parent;
  if (!parent) return null;
  const siblings = parent.children || [];
  const index = siblings.indexOf(node);
  for (let i = index - 1; i >= 0; i--) {
    if (isStructural(siblings[i])) return siblings[i];
  }
  return null;
}

/**
 * @param {object} owner
 * @param {object} duplicate
 * @param {object} first
 * @param {string} filePath
 */
function duplicateSectionDiagnostic(owner, duplicate, first, filePath) {
  const ownerLabel = owner.type === "action" ? "Action" : "Screen";
  const ownerName = (owner.value || "").trim() || ownerLabel;
  const section = duplicate.value;

  if (duplicate.type === "uses") {
    return {
      code: "FS008",
      severity: "error",
      message: `Duplicate "Uses" section inside Action "${ownerName}".\nCombine execution dependencies into one Uses section.`,
      filePath,
      line: duplicate.location.line,
      column: duplicate.location.column,
      suggestion: "Combine execution dependencies into one Uses section.",
      relatedLocations: [
        {
          message: 'First "Uses" defined here',
          filePath,
          line: first.location.line,
          column: first.location.column,
        },
      ],
    };
  }

  return {
    code: "FS008",
    severity: "error",
    message: `Duplicate "${section}" section inside ${ownerLabel} "${ownerName}".`,
    filePath,
    line: duplicate.location.line,
    column: duplicate.location.column,
    relatedLocations: [
      {
        message: `First "${section}" defined here`,
        filePath,
        line: first.location.line,
        column: first.location.column,
      },
    ],
  };
}

/**
 * When Outcome is present, it should be the last direct child of the Action.
 * @param {object} action
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnOutcomeNotFinal(action, filePath, diagnostics) {
  const children = action.children || [];
  let outcomeIndex = -1;
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === "outcome") {
      outcomeIndex = i;
      break;
    }
  }
  if (outcomeIndex === -1) return;

  const actionName = (action.value || "").trim() || "Action";
  for (let i = outcomeIndex + 1; i < children.length; i++) {
    const child = children[i];
    if (child.type === "id") continue;
    const label = describeActionChild(child);
    diagnostics.push(
      createDiagnostic({
        code: "FS017",
        severity: "warning",
        message: `Outcome should be the final section of Action "${actionName}".\nMove "${label}" before Outcome.`,
        filePath,
        line: child.location.line,
        column: child.location.column,
        suggestion: `Move "${label}" before Outcome.`,
        relatedLocations: [
          {
            message: "Outcome defined here",
            filePath,
            line: children[outcomeIndex].location.line,
            column: children[outcomeIndex].location.column,
          },
        ],
      })
    );
  }
}

/**
 * @param {object} node
 * @returns {string}
 */
function describeActionChild(node) {
  if (node.type === "ifFails") {
    const text = (node.value || "").trim();
    if (/^If\b/i.test(text)) return text;
    return text ? `If ${text}` : "If ... fails";
  }
  if (node.type === "if") {
    const text = (node.value || "").trim();
    return text ? `If ${text}` : "If";
  }
  if (node.type === "once") {
    const text = (node.value || "").trim();
    return text ? `Once ${text}` : "Once";
  }
  if (node.type === "otherwise") return "Otherwise";
  if (node.type === "parallel") return "At the same time";
  if (node.type === "goTo") {
    const text = (node.value || "").trim();
    return text ? `Go to ${text}` : "Go to";
  }
  if (node.type === "when") {
    const text = (node.value || "").trim();
    return text ? `When ${text}` : "When";
  }
  if (
    node.type === "receives" ||
    node.type === "rules" ||
    node.type === "uses" ||
    node.type === "steps" ||
    node.type === "shows" ||
    node.type === "outcome"
  ) {
    return node.value || node.type;
  }
  if (node.type === "content") return node.value || "content";
  return node.value || node.type;
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
