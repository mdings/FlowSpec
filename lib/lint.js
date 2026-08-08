/**
 * FlowSpec v1 linter — structural rules FS001–FS017 and style warnings FS101–FS105.
 */

const { ID_PATTERN, RECOMMENDED_SECTION_ORDER } = require("./constants");
const {
  createDiagnostic,
  sortDiagnostics,
  countDiagnostics,
} = require("./diagnostics");
const { parseTree, walkNodes, isStructural, isSection } = require("./parse");
const {
  collectStructuralTargets,
  matchGoToTargets,
} = require("./goto");

const ACTION_ONLY_SECTION_TYPES = new Set([
  "receives",
  "uses",
  "steps",
  "outcome",
]);

const CONTROL_TYPES = new Set(["once", "if", "otherwise", "ifFails"]);
const CONTROL_OR_WHEN_TYPES = new Set(["when", "once", "if", "otherwise", "ifFails"]);

/** Layout statement filler words — not part of a Section name guess. */
const LAYOUT_NAME_FILLERS = new Set([
  "across",
  "top",
  "bottom",
  "left",
  "right",
  "narrow",
  "wide",
  "flexible",
  "fixed",
  "the",
  "a",
  "an",
]);

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
    // FS004 / FS005 / FS019 Id rules
    if (node.type === "id") {
      const parentUi =
        node.parent?.type === "section" ||
        node.parent?.type === "layout" ||
        (node.parent?.type === "action" && node.parent.implicit);
      const preceding = findPrecedingStructuralSibling(node);
      const precedingUi =
        preceding &&
        (preceding.type === "section" ||
          preceding.type === "layout" ||
          (preceding.type === "action" && preceding.implicit));

      if (parentUi || precedingUi) {
        const ownerNode = parentUi ? node.parent : preceding;
        const ownerKind =
          ownerNode.type === "section"
            ? "Section"
            : ownerNode.type === "layout"
              ? "Layout"
              : "implicit Action";
        diagnostics.push(
          createDiagnostic({
            code: "FS019",
            severity: "error",
            message: `Id is not allowed on ${ownerKind}.`,
            filePath,
            line: node.location.line,
            column: node.location.column,
            suggestion:
              "Only Flow, Screen, and explicit Action may have an Id. Model navigable destinations as Screen or explicit Action.",
          })
        );
      } else if (!node.owner) {
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
      const suggestion = structuralLabel(node.type);
      diagnostics.push(
        createDiagnostic({
          code: "FS016",
          severity: "warning",
          message: `Unknown directive "${node.rawKind}". Did you mean "${suggestion}"?`,
          filePath,
          line: node.location.line,
          column: node.location.column,
          suggestion,
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

    // FS007 — action-section / Shows placement (indentation-based ownership only)
    if (isSection(node)) {
      if (node.type === "shows") {
        lintShowsPlacement(node, filePath, diagnostics);
      } else if (node.type === "rules") {
        lintRulesPlacement(node, filePath, diagnostics);
      } else if (ACTION_ONLY_SECTION_TYPES.has(node.type)) {
        lintActionOnlySectionPlacement(node, filePath, diagnostics);
      }
    }

    // FS008 — duplicate section under Action, Screen, Section, or Layout
    if (
      node.type === "action" ||
      node.type === "screen" ||
      node.type === "section" ||
      node.type === "layout"
    ) {
      const seen = new Map();
      for (const child of node.children || []) {
        if (!isSection(child)) continue;
        if (node.type === "screen" && child.type !== "shows") continue;
        if (node.type === "section" && child.type !== "shows") continue;
        if (node.type === "layout" && child.type !== "rules") continue;
        if (seen.has(child.type)) {
          diagnostics.push(
            createDiagnostic(
              duplicateSectionDiagnostic(node, child, seen.get(child.type), filePath)
            )
          );
        } else {
          seen.set(child.type, child);
        }
      }
    }

    // FS023 — Section ownership (Screen or Section only)
    if (node.type === "section") {
      lintSectionPlacement(node, filePath, diagnostics);
    }

    // FS018 / FS020 / FS021 / FS022 — Layout ownership, duplicates, name refs
    if (node.type === "layout") {
      lintLayoutPlacement(node, filePath, diagnostics);
    }
    if (node.type === "screen" || node.type === "section") {
      lintDuplicateLayouts(node, filePath, diagnostics);
      lintLayoutSectionReferences(node, filePath, diagnostics);
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

      // FS101–FS103 / FS105 — concise-style suggestions (warnings only)
      warnRedundantOutcome(node, filePath, diagnostics);
      warnRedundantReceives(node, filePath, diagnostics);
      warnTriggerRepeatsAction(node, filePath, diagnostics);
      warnSingleStepWrapper(node, filePath, diagnostics);
    }

    // FS104 — identical Rules across sibling Actions in a Flow or Screen
    if (node.type === "flow" || node.type === "screen") {
      warnRepeatedRulesAcrossSiblingActions(node, filePath, diagnostics);
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
  // Go to destinations are top-level Flow / Screen / Action only.
  collectStructuralTargets(root, filePath, targets);

  // Ids remain unique across all structural nodes, including nested Actions.
  walkNodes(root, (node) => {
    if (!isStructural(node)) return;
    if (!(node.id && node.idNode && ID_PATTERN.test(node.id))) return;

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
          message: 'Unresolved Go to target "". Expected a top-level Flow, Screen, or Action with this name or Id.',
          filePath,
          line: node.location.line,
          column: node.location.column,
        })
      );
      return;
    }

    const uniqueMatches = matchGoToTargets(ref, targets);

    if (uniqueMatches.length === 0) {
      diagnostics.push(
        createDiagnostic({
          code: "FS014",
          severity: "warning",
          message: `Unresolved Go to target "${ref}". Expected a top-level Flow, Screen, or Action with this name or Id in any loaded FlowSpec file.`,
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

  // Layout owns When for alternate layouts, but not Once / If / Otherwise / If … fails.
  if (node.parent?.type === "layout") return false;

  if (findAncestor(node, (n) => n.type === "steps")) return true;

  // Directly inside Flow, Screen, Action, or Section (including nested under When / Once / If).
  return Boolean(
    findAncestor(
      node,
      (n) =>
        n.type === "flow" ||
        n.type === "screen" ||
        n.type === "action" ||
        n.type === "section"
    )
  );
}

/**
 * Receives / Uses / Steps / Outcome must be direct children of an Action.
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
      node.parent.type === "parallel" ||
      node.parent.type === "layout" ||
      node.parent.type === "section")
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
 * Rules may be a direct child of an Action or a Layout.
 * @param {object} node
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintRulesPlacement(node, filePath, diagnostics) {
  if (node.parent?.type === "action" || node.parent?.type === "layout") return;

  const preceding = findPrecedingStructuralSibling(node);
  /** @type {string|undefined} */
  let suggestion;
  if (preceding?.type === "action") {
    const name = (preceding.value || "").trim() || "Action";
    suggestion = `Indent "Rules" under "Action ${name}" if it belongs to that action.`;
  } else if (preceding?.type === "layout") {
    suggestion = 'Indent "Rules" under the Layout if it constrains that layout.';
  }

  diagnostics.push(
    createDiagnostic({
      code: "FS007",
      severity: "error",
      message: '"Rules" must be nested inside an Action or a Layout.',
      filePath,
      line: node.location.line,
      column: node.location.column,
      suggestion,
    })
  );
}

/**
 * Shows must be indented under a Screen, Section, or Action (or under control-flow inside one).
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
  } else if (preceding?.type === "section") {
    const name = (preceding.value || "").trim() || "Section";
    suggestion = `Indent "Shows" under "Section ${name}" if it describes that section.`;
  } else if (preceding?.type === "action") {
    const name = (preceding.value || "").trim() || "Action";
    suggestion = `Indent "Shows" under "Action ${name}" if it belongs to that action.`;
  }

  diagnostics.push(
    createDiagnostic({
      code: "FS007",
      severity: "error",
      message: '"Shows" must be nested inside a Screen, Section, or Action.',
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
  if (
    parent.type === "action" ||
    parent.type === "screen" ||
    parent.type === "section"
  ) {
    return true;
  }
  if (CONTROL_OR_WHEN_TYPES.has(parent.type)) {
    return Boolean(
      findAncestor(
        node,
        (n) =>
          n.type === "action" || n.type === "screen" || n.type === "section"
      )
    );
  }
  return false;
}

/**
 * Section may only be a direct child of Screen or Section.
 * @param {object} node
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintSectionPlacement(node, filePath, diagnostics) {
  const parent = node.parent;
  if (parent?.type === "screen" || parent?.type === "section") return;

  diagnostics.push(
    createDiagnostic({
      code: "FS023",
      severity: "error",
      message: "Section may only be nested inside a Screen or another Section.",
      filePath,
      line: node.location.line,
      column: node.location.column,
    })
  );
}

/**
 * Layout may be a direct child of Screen or Section, or of a When whose parent is Layout.
 * @param {object} node
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintLayoutPlacement(node, filePath, diagnostics) {
  const parent = node.parent;
  if (parent?.type === "screen" || parent?.type === "section") return;
  if (parent?.type === "when" && parent.parent?.type === "layout") return;

  diagnostics.push(
    createDiagnostic({
      code: "FS020",
      severity: "error",
      message:
        "Layout may only appear inside a Screen or Section, or inside a When that belongs to a Layout.",
      filePath,
      line: node.location.line,
      column: node.location.column,
    })
  );
}

/**
 * At most one direct default Layout under a Screen or Section.
 * @param {object} owner
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintDuplicateLayouts(owner, filePath, diagnostics) {
  const layouts = (owner.children || []).filter((c) => c.type === "layout");
  if (layouts.length < 2) return;
  const first = layouts[0];
  for (let i = 1; i < layouts.length; i++) {
    diagnostics.push(
      createDiagnostic({
        code: "FS018",
        severity: "error",
        message: `Duplicate Layout inside ${structuralLabel(owner.type)} "${(owner.value || "").trim() || structuralLabel(owner.type)}".`,
        filePath,
        line: layouts[i].location.line,
        column: layouts[i].location.column,
        relatedLocations: [
          {
            message: "First Layout defined here",
            filePath,
            line: first.location.line,
            column: first.location.column,
          },
        ],
      })
    );
  }
}

/**
 * Resolve Layout statement names against direct child Sections of the owner.
 * @param {object} owner screen or section
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintLayoutSectionReferences(owner, filePath, diagnostics) {
  const layouts = (owner.children || []).filter((c) => c.type === "layout");
  if (layouts.length === 0) return;

  /** @type {Map<string, object[]>} */
  const sectionsByName = new Map();
  for (const child of owner.children || []) {
    if (child.type !== "section") continue;
    const name = (child.value || "").trim();
    if (!name) continue;
    if (!sectionsByName.has(name)) sectionsByName.set(name, []);
    sectionsByName.get(name).push(child);
  }

  for (const layout of layouts) {
    lintLayoutStatements(layout, sectionsByName, filePath, diagnostics);
  }
}

/**
 * @param {object} layout
 * @param {Map<string, object[]>} sectionsByName
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function lintLayoutStatements(layout, sectionsByName, filePath, diagnostics) {
  for (const child of layout.children || []) {
    if (child.type === "content") {
      validateLayoutStatement(child, sectionsByName, filePath, diagnostics);
      continue;
    }
    if (child.type === "when") {
      for (const nested of child.children || []) {
        if (nested.type === "layout") {
          lintLayoutStatements(nested, sectionsByName, filePath, diagnostics);
        }
      }
    }
  }
}

/**
 * @param {object} statement content node
 * @param {Map<string, object[]>} sectionsByName
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function validateLayoutStatement(statement, sectionsByName, filePath, diagnostics) {
  const text = (statement.value || "").trim();
  if (!text) return;
  const knownNames = [...sectionsByName.keys()].sort((a, b) => b.length - a.length);
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const matched = matchLayoutSectionName(part, knownNames);
    if (matched) {
      const hits = sectionsByName.get(matched) || [];
      if (hits.length > 1) {
        diagnostics.push(
          createDiagnostic({
            code: "FS022",
            severity: "warning",
            message: `Ambiguous Layout reference "${matched}". Multiple sibling Sections share this name.`,
            filePath,
            line: statement.location.line,
            column: statement.location.column,
          })
        );
      }
      continue;
    }

    const guessed = guessLayoutSectionName(part);
    diagnostics.push(
      createDiagnostic({
        code: "FS021",
        severity: "warning",
        message: `Unresolved Layout reference "${guessed}". Expected a direct child Section of the owning Screen or Section.`,
        filePath,
        line: statement.location.line,
        column: statement.location.column,
      })
    );
  }
}

/**
 * @param {string} part
 * @param {string[]} knownNames longest-first
 * @returns {string|null}
 */
function matchLayoutSectionName(part, knownNames) {
  for (const name of knownNames) {
    if (part === name || part.startsWith(`${name} `)) return name;
  }
  return null;
}

/**
 * @param {string} part
 * @returns {string}
 */
function guessLayoutSectionName(part) {
  const words = part.split(/\s+/).filter(Boolean);
  const nameWords = [];
  for (const word of words) {
    if (LAYOUT_NAME_FILLERS.has(word.toLowerCase()) && nameWords.length > 0) {
      break;
    }
    nameWords.push(word);
  }
  return nameWords.join(" ") || part;
}

/**
 * @param {string} type
 * @returns {string}
 */
function structuralLabel(type) {
  if (type === "flow") return "Flow";
  if (type === "screen") return "Screen";
  if (type === "action") return "Action";
  if (type === "section") return "Section";
  if (type === "layout") return "Layout";
  return type;
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
  const ownerLabel = structuralLabel(owner.type);
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
 * FS101 — Outcome that merely restates the Action name (conservative).
 * Matches Action "Verb object" with a single Outcome line like "object is verbed".
 * @param {object} action
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnRedundantOutcome(action, filePath, diagnostics) {
  const outcome = (action.children || []).find((c) => c.type === "outcome");
  if (!outcome) return;

  const contentLines = (outcome.children || []).filter((c) => c.type === "content");
  if (contentLines.length !== 1) return;

  const actionName = (action.value || "").trim();
  const outcomeText = (contentLines[0].value || "").trim().replace(/\.+$/, "");
  if (!actionName || !outcomeText) return;
  if (!outcomeRestatesAction(actionName, outcomeText)) return;

  diagnostics.push(
    createDiagnostic({
      code: "FS101",
      severity: "warning",
      message: `Outcome may be redundant because it restates Action "${actionName}".`,
      filePath,
      line: outcome.location.line,
      column: outcome.location.column,
    })
  );
}

/**
 * @param {string} actionName
 * @param {string} outcomeText
 * @returns {boolean}
 */
function outcomeRestatesAction(actionName, outcomeText) {
  const actionTokens = actionName.toLowerCase().split(/\s+/).filter(Boolean);
  if (actionTokens.length < 2) return false;

  const verb = actionTokens[0];
  const object = actionTokens.slice(1).join(" ");
  if (!object) return false;

  const past = regularPastParticiple(verb);
  if (!past) return false;

  const outcome = outcomeText.toLowerCase().trim();
  const candidates = [
    `${object} is ${past}`,
    `${object} was ${past}`,
    `${object} are ${past}`,
    `${object} were ${past}`,
    `the ${object} is ${past}`,
    `the ${object} was ${past}`,
    `a ${object} is ${past}`,
    `a ${object} was ${past}`,
  ];
  return candidates.includes(outcome);
}

/**
 * Regular English past-participle guess only (no irregular verbs).
 * @param {string} verb
 * @returns {string|null}
 */
function regularPastParticiple(verb) {
  if (!verb || verb.length < 2) return null;
  // Skip forms that are unlikely to be simple imperative verbs in Action names.
  if (verb.endsWith("ing") || verb.endsWith("ed")) return null;
  if (verb.endsWith("e")) return `${verb}d`;
  if (verb.endsWith("y") && verb.length > 2 && !/[aeiou]y$/.test(verb)) {
    return `${verb.slice(0, -1)}ied`;
  }
  return `${verb}ed`;
}

/**
 * FS102 — Receives that clearly repeats an input already named in a When trigger.
 * Only obvious singular-noun cases: one Receives line matching "a/the {noun}" in When.
 * @param {object} action
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnRedundantReceives(action, filePath, diagnostics) {
  if (action.parent?.type !== "when") return;

  const receives = (action.children || []).find((c) => c.type === "receives");
  if (!receives) return;

  const contentLines = (receives.children || []).filter((c) => c.type === "content");
  if (contentLines.length !== 1) return;

  const received = (contentLines[0].value || "").trim();
  if (!received) return;
  // Single obvious noun token only (no multi-word phrases).
  if (/\s/.test(received) || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(received)) return;

  const trigger = (action.parent.value || "").trim();
  if (!triggerProvidesSingularNoun(trigger, received)) return;

  const nounLower = received.toLowerCase();
  diagnostics.push(
    createDiagnostic({
      code: "FS102",
      severity: "warning",
      message: `"Receives ${received}" may be redundant because the trigger already provides the ${nounLower}.`,
      filePath,
      line: receives.location.line,
      column: receives.location.column,
    })
  );
}

/**
 * @param {string} trigger
 * @param {string} noun
 * @returns {boolean}
 */
function triggerProvidesSingularNoun(trigger, noun) {
  const t = trigger.toLowerCase();
  const n = noun.toLowerCase();
  // Require an article so we only catch "selects a voice" / "taps the button", not weak substring hits.
  const articleNoun = new RegExp(`\\b(?:a|an|the)\\s+${escapeRegExp(n)}\\b`);
  return articleNoun.test(t);
}

/**
 * FS103 — When trigger and nested Action describe the same interaction.
 * @param {object} action
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnTriggerRepeatsAction(action, filePath, diagnostics) {
  if (action.parent?.type !== "when") return;

  const trigger = (action.parent.value || "").trim();
  const actionName = (action.value || "").trim();
  if (!trigger || !actionName) return;

  const triggerTokens = normalizeInteractionTokens(trigger);
  const actionTokens = normalizeInteractionTokens(actionName);
  if (triggerTokens.length === 0 || actionTokens.length === 0) return;
  // Require exact token-sequence match after normalization (high similarity only).
  if (triggerTokens.length !== actionTokens.length) return;
  for (let i = 0; i < triggerTokens.length; i++) {
    if (triggerTokens[i] !== actionTokens[i]) return;
  }

  diagnostics.push(
    createDiagnostic({
      code: "FS103",
      severity: "warning",
      message:
        "Trigger and Action appear to describe the same interaction. Consider simplifying the structure.",
      filePath,
      line: action.location.line,
      column: action.location.column,
      relatedLocations: [
        {
          message: "Matching trigger",
          filePath,
          line: action.parent.location.line,
          column: action.parent.location.column,
        },
      ],
    })
  );
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function normalizeInteractionTokens(text) {
  let t = text.toLowerCase();
  t = t.replace(/\bthe user\b/g, " ");
  t = t.replace(/\b(a|an|the|to|of|with|for|in|on)\b/g, " ");
  return t
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9_-]/g, ""))
    .filter(Boolean)
    .map(lightInflectionStem);
}

/**
 * Very light inflection stripping for select/selects, focus/focuses.
 * @param {string} word
 * @returns {string}
 */
function lightInflectionStem(word) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("es") && word.length > 4) {
    // focuses → focus; leaves "selects" to the plain -s rule below
    const withoutEs = word.slice(0, -2);
    if (withoutEs.endsWith("s") || withoutEs.endsWith("x") || withoutEs.endsWith("z") || withoutEs.endsWith("ch") || withoutEs.endsWith("sh")) {
      return withoutEs;
    }
  }
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * FS104 — identical Rules lists repeated across sibling Actions in a Flow or Screen.
 * @param {object} container flow or screen
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnRepeatedRulesAcrossSiblingActions(container, filePath, diagnostics) {
  const peers = collectPeerActions(container);
  if (peers.length < 2) return;

  /** @type {Map<string, { action: object, rules: object }[]>} */
  const bySignature = new Map();

  for (const action of peers) {
    const rules = (action.children || []).find((c) => c.type === "rules");
    if (!rules) continue;
    const lines = (rules.children || [])
      .filter((c) => c.type === "content")
      .map((c) => (c.value || "").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const signature = lines.join("\n");
    if (!bySignature.has(signature)) bySignature.set(signature, []);
    bySignature.get(signature).push({ action, rules });
  }

  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    // Warn on each later duplicate; point at the first occurrence.
    const first = group[0];
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      diagnostics.push(
        createDiagnostic({
          code: "FS104",
          severity: "warning",
          message:
            "These Rules are repeated across sibling Actions. Consider defining the shared behavior at a higher level or combining the Actions.",
          filePath,
          line: dup.rules.location.line,
          column: dup.rules.location.column,
          relatedLocations: [
            {
              message: `Same Rules on Action "${(first.action.value || "").trim()}"`,
              filePath,
              line: first.rules.location.line,
              column: first.rules.location.column,
            },
          ],
        })
      );
    }
  }
}

/**
 * Peer Actions under a Flow/Screen: direct Action children, plus Actions nested
 * directly under a When/control child of the container.
 * @param {object} container
 * @returns {object[]}
 */
function collectPeerActions(container) {
  /** @type {object[]} */
  const actions = [];
  for (const child of container.children || []) {
    if (child.type === "action") {
      actions.push(child);
      continue;
    }
    if (CONTROL_OR_WHEN_TYPES.has(child.type) || child.type === "parallel") {
      for (const gc of child.children || []) {
        if (gc.type === "action") actions.push(gc);
      }
    }
  }
  return actions;
}

/**
 * FS105 — Action that only wraps a single simple Step (optional Id allowed).
 * @param {object} action
 * @param {string} filePath
 * @param {object[]} diagnostics
 */
function warnSingleStepWrapper(action, filePath, diagnostics) {
  const children = action.children || [];
  /** @type {object|null} */
  let steps = null;

  for (const child of children) {
    if (child.type === "id") continue;
    if (child.type === "steps") {
      if (steps) return; // duplicate Steps is an error elsewhere; skip style warn
      steps = child;
      continue;
    }
    // Any other section, control-flow, Go to, content, etc. makes the Action meaningful.
    return;
  }

  if (!steps) return;

  const stepChildren = steps.children || [];
  if (stepChildren.length !== 1) return;

  const only = stepChildren[0];
  if (only.type !== "content" && only.type !== "goTo") return;
  // Nested structure under the single step means it is not a simple wrapper.
  if ((only.children || []).length > 0) return;

  diagnostics.push(
    createDiagnostic({
      code: "FS105",
      severity: "warning",
      message:
        "This Action only wraps a single Step. Consider expressing the transition directly if the Action is not independently meaningful.",
      filePath,
      line: action.location.line,
      column: action.location.column,
    })
  );
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
