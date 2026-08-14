/**
 * Indentation-aware FlowSpec v1 parser.
 * Directives are recognized only at line start after optional indentation.
 * Colons after directives are optional.
 *
 * Under a Screen or Section, direct named interactions with nested behavior are
 * promoted to Action nodes (implicit Actions) before Id association.
 */

const {
  DEPRECATED_STRUCTURAL,
  DIRECTIVE_SUGGESTIONS,
  SECTION_DIRECTIVES,
  FLOW_CONTROL,
} = require("./constants");
const { directives, literalSpellings, regexAlternation } = require("./language");
const { createDiagnostic } = require("./diagnostics");

const STRUCTURAL_RE = new RegExp(`^(${regexAlternation(literalSpellings("structural"))})\\b\\s*:?\\s*(.*)$`);
const ID_RE = new RegExp(`^(${regexAlternation(["Id", "ID"])})\\b\\s*:?\\s*(.*)$`);
const SECTION_RE = new RegExp(`^(${regexAlternation(literalSpellings("section"))})\\b\\s*:?\\s*(.*)$`);
const IF_FAILS_RE = /^If\b.+?\bfails\b\s*:?\s*(.*)$/;
const AT_SAME_TIME_RE = /^At the same time\b\s*:?\s*(.*)$/;
const GO_TO_RE = /^Go to\b\s*:?\s*(.*)$/;
const FLOW_CONTROL_NAMES = directives("control")
  .filter((directive) => ["when", "once", "if", "otherwise"].includes(directive.type))
  .map((directive) => directive.name);
const FLOW_CONTROL_RE = new RegExp(`^(${regexAlternation(FLOW_CONTROL_NAMES)})\\b\\s*:?\\s*(.*)$`);

const STRUCTURAL_NORMALIZE = Object.fromEntries(
  directives("structural").flatMap((directive) =>
    [directive.name, ...(directive.deprecated || [])].map((name) => [name, directive.name])
  )
);

const STRUCTURAL_TYPE = Object.fromEntries(
  directives("structural").map((directive) => [directive.name, directive.type])
);

const SECTION_TYPE = Object.fromEntries(
  directives("section").map((directive) => [directive.name, directive.type])
);

/**
 * @param {string} source
 * @param {string} [filePath]
 * @returns {{ root: object, diagnostics: object[], lines: string[] }}
 */
function parseTree(source, filePath = "<stdin>") {
  const lines = String(source).split(/\r?\n/);
  /** @type {object[]} */
  const diagnostics = [];
  const indentStyle = detectIndentStyle(lines);

  const root = {
    type: "document",
    indentation: -1,
    location: { filePath, line: 1, column: 1 },
    children: [],
    parent: null,
  };

  /** @type {object[]} */
  const stack = [root];
  /** @type {Set<number>} */
  const reportedMixed = new Set();

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const indentText = (raw.match(/^[ \t]*/) || [""])[0];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (indentText.includes("\t") && / /.test(indentText)) {
      if (!reportedMixed.has(lineNumber)) {
        reportedMixed.add(lineNumber);
        diagnostics.push(
          createDiagnostic({
            code: "FS003",
            severity: "error",
            message: "Mixed tabs and spaces on the same line.",
            filePath,
            line: lineNumber,
            column: 1,
            suggestion: "Use either tabs or spaces consistently.",
          })
        );
      }
    } else if (indentStyle.mixedFile && indentText.length > 0) {
      const lineHasTab = indentText.includes("\t");
      const lineHasSpace = / /.test(indentText);
      if (
        (indentStyle.preferred === "spaces" && lineHasTab) ||
        (indentStyle.preferred === "tabs" && lineHasSpace)
      ) {
        diagnostics.push(
          createDiagnostic({
            code: "FS003",
            severity: "error",
            message: "Mixed tabs and spaces in this file.",
            filePath,
            line: lineNumber,
            column: 1,
            suggestion: `Use ${indentStyle.preferred} consistently for indentation.`,
          })
        );
      }
    }

    const indentation = indentWidth(indentText, indentStyle);
    const column = indentation + 1;

    const classified = classifyLine(trimmed);
    const location = {
      filePath,
      line: lineNumber,
      column,
      endLine: lineNumber,
      endColumn: column + trimmed.length,
    };

    const node = makeNode(classified, trimmed, indentation, location);

    // Id at the same indentation as a Flow/Screen/Action belongs to that
    // structural node as a child, so following indented sections stay under it.
    // Section and Layout cannot own Ids.
    // Behavioral sections and Screens/Actions do NOT use adjacency/same-indent
    // ownership — they must be indented deeper than their owner.
    // Indentation alone determines ownership (except this Id association rule).
    if (node.type === "id") {
      const owner = findSameIndentStructural(stack, indentation);
      if (owner && canOwnId(owner)) {
        while (
          stack.length > 1 &&
          stack[stack.length - 1] !== owner &&
          stack[stack.length - 1].indentation >= indentation
        ) {
          stack.pop();
        }
        node.parent = owner;
        owner.children.push(node);
        continue;
      }
    }

    while (stack.length > 1 && indentation <= stack[stack.length - 1].indentation) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Child must be indented beyond parent (except document children at any indent >= 0)
    if (parent.type !== "document" && indentation <= parent.indentation) {
      diagnostics.push(
        createDiagnostic({
          code: "FS003",
          severity: "error",
          message: "Invalid indentation: child block is not indented beyond its parent.",
          filePath,
          line: lineNumber,
          column,
        })
      );
    }

    node.parent = parent;
    parent.children.push(node);

    if (canHaveChildren(node)) {
      stack.push(node);
    }
  }

  // Under a Screen or Section, a direct named interaction (content with a nested
  // body) is treated as an implicit Action before Ids are associated.
  promoteImplicitActions(root);
  associateIds(root);
  return { root, diagnostics, lines };
}

/**
 * Promote Screen/Section-direct content lines that own a deeper-indented body into
 * Action nodes, so they are equivalent to an explicit `Action …`.
 *
 * Boundaries:
 * - Only direct children of a Screen or Section (never Flow, Action, Layout, or
 *   Receives/Rules/… bodies).
 * - Body must include nested behavior (Shows/Rules/…, control-flow, Go to, etc.).
 * - Nested prose alone is not promoted (avoids treating ordinary notes as Actions).
 *
 * @param {object} root
 */
function promoteImplicitActions(root) {
  /** @type {object[]} */
  const containers = [];
  walkNodes(root, (node) => {
    if (node.type === "screen" || node.type === "section") containers.push(node);
  });
  for (const container of containers) {
    promoteImplicitActionsInContainer(container);
  }
}

/**
 * True when the collected body looks like Action behavior rather than nested notes.
 * @param {object[]} body
 * @returns {boolean}
 */
function bodyHasActionBehavior(body) {
  for (const node of body) {
    if (isActionSection(node)) return true;
    if (
      node.type === "when" ||
      node.type === "once" ||
      node.type === "if" ||
      node.type === "otherwise" ||
      node.type === "ifFails" ||
      node.type === "parallel" ||
      node.type === "goTo" ||
      node.type === "action"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object} container screen or section
 */
function promoteImplicitActionsInContainer(container) {
  const children = container.children || [];
  if (children.length === 0) return;

  /** @type {object[]} */
  const next = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== "content") {
      next.push(child);
      continue;
    }

    /** @type {object[]} */
    const body = [];
    let j = i + 1;
    while (j < children.length && children[j].indentation > child.indentation) {
      body.push(children[j]);
      j += 1;
    }

    if (body.length === 0 || !bodyHasActionBehavior(body)) {
      next.push(child);
      continue;
    }

    const action = {
      type: "action",
      value: child.value,
      rawKind: "Action",
      deprecatedCasing: false,
      implicit: true,
      indentation: child.indentation,
      location: child.location,
      children: body,
      parent: container,
      id: undefined,
      idNode: null,
    };
    for (const bodyChild of body) {
      bodyChild.parent = action;
    }
    next.push(action);
    i = j - 1;
  }

  container.children = next;
}

/**
 * Legacy flat parse API used by existing tests.
 * @param {string} source
 */
function parse(source) {
  const { root } = parseTree(source, "<stdin>");
  return { type: "document", elements: flattenForLegacy(root), root };
}

function makeNode(classified, trimmed, indentation, location) {
  if (classified.kind === "structural") {
    return {
      type: STRUCTURAL_TYPE[classified.normalized],
      value: classified.rest,
      rawKind: classified.rawKind,
      deprecatedCasing: Boolean(DEPRECATED_STRUCTURAL[classified.rawKind]),
      indentation,
      location,
      children: [],
      parent: null,
      id: undefined,
      idNode: null,
    };
  }
  if (classified.kind === "id") {
    return {
      type: "id",
      value: classified.rest,
      rawKind: classified.rawKind,
      deprecatedCasing: classified.rawKind === "ID",
      indentation,
      location,
      children: [],
      parent: null,
      owner: null,
    };
  }
  if (classified.kind === "section") {
    return {
      type: SECTION_TYPE[classified.name],
      value: classified.name,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  if (classified.kind === "ifFails") {
    return {
      type: "ifFails",
      value: classified.rest || trimmed,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  if (classified.kind === "parallel") {
    return {
      type: "parallel",
      value: FLOW_CONTROL.atTheSameTime,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  if (classified.kind === "goTo") {
    return {
      type: "goTo",
      value: classified.rest,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  if (classified.kind === "control") {
    const typeMap = {
      When: "when",
      Once: "once",
      If: "if",
      Otherwise: "otherwise",
    };
    return {
      type: typeMap[classified.name],
      value: classified.rest,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  if (classified.kind === "unknown") {
    return {
      type: "unknown",
      value: trimmed,
      rawKind: classified.raw,
      suggestion: classified.suggestion,
      indentation,
      location,
      children: [],
      parent: null,
    };
  }
  return {
    type: "content",
    value: trimmed,
    indentation,
    location,
    children: [],
    parent: null,
  };
}

/**
 * Id belongs to the directly preceding Flow, Screen, or Action.
 * Section and Layout never own Ids.
 * When parsed as a child of a structural node, that node is the owner.
 * When parsed as a sibling, only an immediately preceding structural counts.
 * @param {object} root
 */
function associateIds(root) {
  walkNodes(root, (node) => {
    if (isStructural(node) && canOwnId(node)) {
      for (const child of node.children || []) {
        if (child.type !== "id") continue;
        // Id is only valid when it appears before any non-Id children.
        const index = node.children.indexOf(child);
        const earlier = node.children.slice(0, index);
        const blocked = earlier.some((c) => c.type !== "id");
        if (blocked) {
          child.owner = null;
          continue;
        }
        child.owner = node;
        if (!node.idNode) {
          node.idNode = child;
          node.id = child.value || undefined;
        }
      }
    }

    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type !== "id") continue;
      if (child.owner) continue;

      let owner = null;
      for (let j = i - 1; j >= 0; j--) {
        const prev = children[j];
        if (prev.type === "id") continue;
        if (isStructural(prev) && canOwnId(prev)) owner = prev;
        break;
      }
      child.owner = owner;
      if (owner && !owner.idNode) {
        owner.idNode = child;
        owner.id = child.value || undefined;
      }
    }
  });
}

/**
 * @param {object[]} stack
 * @param {number} indentation
 * @param {string} [type]
 */
function findSameIndentStructural(stack, indentation, type) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i];
    if (node.indentation < indentation) return null;
    if (!isStructural(node)) continue;
    if (node.indentation !== indentation) continue;
    if (type && node.type !== type) continue;
    return node;
  }
  return null;
}

function isSectionType(type) {
  return (
    type === "receives" ||
    type === "rules" ||
    type === "uses" ||
    type === "steps" ||
    type === "shows" ||
    type === "outcome"
  );
}

function flattenForLegacy(root) {
  /** @type {object[]} */
  const elements = [];
  /** @type {Map<object, object>} */
  const structuralMap = new Map();

  function walk(node) {
    if (node.type === "document") {
      for (const child of node.children) walk(child);
      return;
    }

    if (isStructural(node)) {
      const kind =
        node.type === "flow"
          ? "Flow"
          : node.type === "screen"
            ? "Screen"
            : node.type === "section"
              ? "Section"
              : node.type === "layout"
                ? "Layout"
                : "Action";
      const structural = {
        type: node.type,
        kind,
        rawKind: node.rawKind || kind,
        deprecatedCasing: Boolean(node.deprecatedCasing),
        name: node.value || "",
        id: node.id || null,
        idLine: node.idNode ? node.idNode.location.line : null,
        line: node.location.line,
        indent: node.indentation,
        sections: [],
        sectionOrder: [],
        node,
      };
      structuralMap.set(node, structural);
      if (node.idNode) {
        structural.sectionOrder.push({
          name: "Id",
          line: node.idNode.location.line,
        });
      }
      for (const child of node.children) {
        if (isActionSection(child)) {
          const section = {
            type: "section",
            name: child.value,
            key: child.type,
            line: child.location.line,
            indent: child.indentation,
            items: [],
            node: child,
          };
          collectSectionItems(child, section);
          structural.sections.push(section);
          structural.sectionOrder.push({
            name: child.value,
            line: child.location.line,
          });
        }
      }
      elements.push(structural);
      for (const child of node.children) {
        if (child.type === "id") {
          elements.push(idElement(child, structural));
        } else if (isActionSection(child)) {
          for (const grand of child.children) {
            if (grand.type !== "content") walk(grand);
          }
        } else {
          walk(child);
        }
      }
      return;
    }

    if (node.type === "id") {
      const ownerEl = node.owner ? structuralMap.get(node.owner) || null : null;
      elements.push(idElement(node, ownerEl));
      return;
    }

    if (isActionSection(node)) {
      const section = {
        type: "section",
        name: node.value,
        key: node.type,
        line: node.location.line,
        indent: node.indentation,
        items: [],
        node,
      };
      for (const item of node.children) {
        if (item.type === "content") {
          section.items.push({ text: item.value, line: item.location.line });
        } else {
          walk(item);
        }
      }
      elements.push(section);
      return;
    }

    if (node.type === "parallel") {
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.atTheSameTime,
        text: "",
        line: node.location.line,
        indent: node.indentation,
        node,
      });
      for (const child of node.children) walk(child);
      return;
    }

    if (node.type === "goTo") {
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.goTo,
        text: node.value || "",
        line: node.location.line,
        indent: node.indentation,
        node,
      });
      return;
    }

    if (node.type === "ifFails") {
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.ifFails,
        text: node.value || "",
        line: node.location.line,
        indent: node.indentation,
        node,
      });
      for (const child of node.children) walk(child);
      return;
    }

    if (
      node.type === "when" ||
      node.type === "once" ||
      node.type === "if" ||
      node.type === "otherwise"
    ) {
      const kindMap = {
        when: "When",
        once: "Once",
        if: "If",
        otherwise: "Otherwise",
      };
      elements.push({
        type: "flow-control",
        kind: kindMap[node.type],
        text: node.value || "",
        line: node.location.line,
        indent: node.indentation,
        node,
      });
      for (const child of node.children) walk(child);
      return;
    }

    if (node.type === "unknown") {
      elements.push({
        type: "unknown-directive",
        raw: node.rawKind || node.value,
        suggestion: node.suggestion,
        line: node.location.line,
        indent: node.indentation,
        text: node.value,
        node,
      });
      return;
    }

    if (node.type === "content") {
      elements.push({
        type: "text",
        text: node.value,
        line: node.location.line,
        indent: node.indentation,
        node,
      });
      return;
    }

    for (const child of node.children || []) walk(child);
  }

  walk(root);
  return elements;
}

function idElement(node, owner) {
  return {
    type: "id",
    value: node.value || "",
    rawKind: node.rawKind || "Id",
    deprecatedCasing: Boolean(node.deprecatedCasing),
    line: node.location.line,
    indent: node.indentation,
    owner,
    node,
  };
}

function collectSectionItems(sectionNode, section) {
  for (const item of sectionNode.children) {
    if (item.type === "content") {
      section.items.push({ text: item.value, line: item.location.line });
    }
  }
}

function classifyLine(trimmed) {
  const structural = trimmed.match(STRUCTURAL_RE);
  if (structural) {
    return {
      kind: "structural",
      rawKind: structural[1],
      normalized: STRUCTURAL_NORMALIZE[structural[1]],
      rest: stripInlineComment(structural[2]),
    };
  }

  const idMatch = trimmed.match(ID_RE);
  if (idMatch) {
    return {
      kind: "id",
      rawKind: idMatch[1],
      rest: stripInlineComment(idMatch[2]),
    };
  }

  const sectionMatch = trimmed.match(SECTION_RE);
  if (sectionMatch) {
    return {
      kind: "section",
      name: sectionMatch[1],
      rest: stripInlineComment(sectionMatch[2]),
    };
  }

  if (IF_FAILS_RE.test(trimmed)) {
    const rest = trimmed.replace(/^If\b.+?\bfails\b\s*:?\s*/, "").trim();
    return { kind: "ifFails", rest: stripInlineComment(rest) };
  }

  if (AT_SAME_TIME_RE.test(trimmed)) {
    return { kind: "parallel", rest: "" };
  }

  const goTo = trimmed.match(GO_TO_RE);
  if (goTo) {
    return { kind: "goTo", rest: stripInlineComment(goTo[1]) };
  }

  const flowControl = trimmed.match(FLOW_CONTROL_RE);
  if (flowControl) {
    return {
      kind: "control",
      name: flowControl[1],
      rest: stripInlineComment(flowControl[2]),
    };
  }

  const nearMiss = detectIncorrectDirectiveCasing(trimmed);
  if (nearMiss) {
    return {
      kind: "unknown",
      raw: nearMiss.raw,
      suggestion: nearMiss.suggestion,
    };
  }

  return { kind: "content", rest: trimmed };
}

function detectIncorrectDirectiveCasing(trimmed) {
  if (
    /^at\s+the\s+same\s+time\b/i.test(trimmed) &&
    !/^At the same time\b/.test(trimmed)
  ) {
    return {
      raw: trimmed.match(/^at\s+the\s+same\s+time/i)[0],
      suggestion: "At the same time",
    };
  }

  if (/^go\s+to\b/i.test(trimmed) && !/^Go to\b/.test(trimmed)) {
    return {
      raw: trimmed.match(/^go\s+to/i)[0],
      suggestion: "Go to",
    };
  }

  if (/^if\b.+\bfails\b/i.test(trimmed) && !/^If\b/.test(trimmed)) {
    return {
      raw: trimmed.match(/^if\b/i)[0],
      suggestion: "If",
    };
  }

  const token = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\b/);
  if (!token) return null;

  const raw = token[1];
  const lower = raw.toLowerCase();
  const suggestion = DIRECTIVE_SUGGESTIONS[lower];

  if (suggestion) {
    if (raw === suggestion) return null;
    if (DEPRECATED_STRUCTURAL[raw]) return null;
    return { raw, suggestion };
  }

  const stem = lower.replace(/s$/, "");
  if (DIRECTIVE_SUGGESTIONS[stem] && raw !== DIRECTIVE_SUGGESTIONS[stem]) {
    return { raw, suggestion: DIRECTIVE_SUGGESTIONS[stem] };
  }

  return null;
}

function isValidIdFormat(value) {
  const { ID_PATTERN } = require("./constants");
  return ID_PATTERN.test(value);
}

function stripInlineComment(text) {
  return String(text || "")
    .replace(/\s+#.*$/, "")
    .trim();
}

function indentWidth(indentText, style) {
  if (style.preferred === "tabs") {
    return [...indentText].filter((c) => c === "\t").length;
  }
  let width = 0;
  for (const ch of indentText) {
    width += ch === "\t" ? 2 : 1;
  }
  return width;
}

function detectIndentStyle(lines) {
  let spaceLines = 0;
  let tabLines = 0;
  for (const raw of lines) {
    const m = raw.match(/^([ \t]+)\S/);
    if (!m) continue;
    const onlyTabs = /^\t+$/.test(m[1]);
    const onlySpaces = /^ +$/.test(m[1]);
    if (onlyTabs) tabLines += 1;
    else if (onlySpaces) spaceLines += 1;
    else {
      // mixed on one line counted later
      spaceLines += 1;
      tabLines += 1;
    }
  }
  const mixedFile = spaceLines > 0 && tabLines > 0;
  const preferred = tabLines > spaceLines ? "tabs" : "spaces";
  return { preferred, mixedFile, tabWidth: 2 };
}

function isStructural(node) {
  return (
    node &&
    (node.type === "flow" ||
      node.type === "screen" ||
      node.type === "action" ||
      node.type === "section" ||
      node.type === "layout")
  );
}

/** True for Flow / Screen / explicit Action — the only entities that may own an Id. */
function canOwnId(node) {
  return (
    node &&
    (node.type === "flow" ||
      node.type === "screen" ||
      (node.type === "action" && !node.implicit))
  );
}

/** Receives / Rules / Uses / Steps / Shows / Outcome blocks (not structural Section). */
function isActionSection(node) {
  return node && isSectionType(node.type);
}

/** @deprecated Use isActionSection; kept for existing call sites. */
function isSection(node) {
  return isActionSection(node);
}

function canHaveChildren(node) {
  return (
    node.type === "document" ||
    isStructural(node) ||
    isActionSection(node) ||
    node.type === "when" ||
    node.type === "once" ||
    node.type === "if" ||
    node.type === "otherwise" ||
    node.type === "ifFails" ||
    node.type === "parallel" ||
    node.type === "id"
  );
}

function walkNodes(node, fn) {
  fn(node);
  for (const child of node.children || []) walkNodes(child, fn);
}

module.exports = {
  parse,
  parseTree,
  isValidIdFormat,
  detectIncorrectDirectiveCasing,
  SECTION_DIRECTIVES,
  walkNodes,
  isStructural,
  isSection,
  isActionSection,
  canOwnId,
};
