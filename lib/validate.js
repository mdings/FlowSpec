/**
 * FlowSpec v1 validation — IDs, section order, and directive casing.
 * Does not validate natural-language contents of Rules or Steps.
 */

const { ID_PATTERN, RECOMMENDED_SECTION_ORDER } = require("./constants");
const { parse } = require("./parse");

/**
 * @typedef {{ severity: 'error' | 'warning', code: string, message: string, line: number }} Diagnostic
 */

/**
 * @param {string} source
 * @returns {{ document: object, diagnostics: Diagnostic[] }}
 */
function validate(source) {
  const document = parse(source);
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  /** @type {Map<string, number>} */
  const seenIds = new Map();

  for (const el of document.elements) {
    if (el.type === "flow" || el.type === "screen" || el.type === "action") {
      if (el.deprecatedCasing) {
        diagnostics.push({
          severity: "warning",
          code: "deprecated-casing",
          message: `Deprecated directive casing: "${el.rawKind}". Use "${el.kind}" instead.`,
          line: el.line,
        });
      }
    }

    if (el.type === "id" && el.deprecatedCasing) {
      diagnostics.push({
        severity: "warning",
        code: "deprecated-casing",
        message: `Deprecated directive casing: "${el.rawKind}". Use "Id" instead.`,
        line: el.line,
      });
    }

    if (el.type === "unknown-directive") {
      diagnostics.push({
        severity: "error",
        code: "unknown-directive",
        message: `Unknown directive "${el.raw}". Did you mean "${el.suggestion}"?`,
        line: el.line,
      });
    }
  }

  for (const el of document.elements) {
    if (el.type !== "id") continue;

    if (!el.owner) {
      diagnostics.push({
        severity: "error",
        code: "orphaned-id",
        message: "Id must follow a Flow, Screen, or Action directive.",
        line: el.line,
      });
      continue;
    }

    if (el.owner.id !== null) {
      diagnostics.push({
        severity: "error",
        code: "multiple-ids",
        message: `Multiple Ids assigned to the same ${el.owner.kind} (first at line ${el.owner.idLine}).`,
        line: el.line,
      });
      continue;
    }

    if (!el.value) {
      diagnostics.push({
        severity: "error",
        code: "invalid-id",
        message: "Id value is empty.",
        line: el.line,
      });
      continue;
    }

    if (!ID_PATTERN.test(el.value)) {
      diagnostics.push({
        severity: "error",
        code: "invalid-id",
        message:
          `Invalid Id "${el.value}". Ids must match ${ID_PATTERN} ` +
          "(lowercase letters, numbers, hyphens, underscores, periods; must start with a letter or digit).",
        line: el.line,
      });
      continue;
    }

    if (seenIds.has(el.value)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-id",
        message: `Duplicate Id "${el.value}" (first seen at line ${seenIds.get(el.value)}).`,
        line: el.line,
      });
      continue;
    }

    seenIds.set(el.value, el.line);
    el.owner.id = el.value;
    el.owner.idLine = el.line;
  }

  for (const el of document.elements) {
    if (!el.sectionOrder || el.sectionOrder.length < 2) continue;
    warnSectionOrder(el, diagnostics);
  }

  return { document, diagnostics };
}

/**
 * @param {object} structural
 * @param {Diagnostic[]} diagnostics
 */
function warnSectionOrder(structural, diagnostics) {
  const orderIndex = (name) => RECOMMENDED_SECTION_ORDER.indexOf(name);
  let maxIndex = -1;

  for (const entry of structural.sectionOrder) {
    const idx = orderIndex(entry.name);
    if (idx === -1) continue;
    if (idx < maxIndex) {
      diagnostics.push({
        severity: "warning",
        code: "section-order",
        message:
          `${entry.name} appears out of the recommended order ` +
          `(Id → Receives → Rules → Steps → Shows → Outcome) under ${structural.kind}.`,
        line: entry.line,
      });
    } else {
      maxIndex = idx;
    }
  }
}

module.exports = {
  validate,
  ID_PATTERN,
};
