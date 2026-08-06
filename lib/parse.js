/**
 * Minimal line-oriented FlowSpec v1 parser.
 * Parses structural directives, IDs, action sections, and flow-control phrases.
 * Does not interpret natural-language contents of Rules/Steps.
 */

const {
  SECTION_DIRECTIVES,
  FLOW_CONTROL,
} = require("./constants");

const STRUCTURAL_RE =
  /^(FLOW|SCREEN|ACTION)\b\s*:?\s*(.*)$/;
const ID_RE = /^ID\b\s*:?\s*(.*)$/;
const SECTION_RE = /^(Receives|Rules|Steps|Shows|Outcome)\b\s*:?\s*(.*)$/;
const IF_FAILS_RE = /^If\b.+?\bfails\b\s*:?\s*(.*)$/;
const AT_SAME_TIME_RE = /^At the same time\b\s*:?\s*(.*)$/;
const GO_TO_RE = /^Go to\b\s*:?\s*(.*)$/;
const FLOW_CONTROL_RE = /^(When|Once|If|Otherwise)\b\s*:?\s*(.*)$/;

/**
 * @param {string} source
 * @returns {{ type: 'document', elements: object[], diagnostics: never[] }}
 */
function parse(source) {
  const lines = String(source).split(/\r?\n/);
  const elements = [];
  /** @type {object | null} */
  let currentStructural = null;
  /** @type {object | null} */
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const indent = raw.match(/^[ \t]*/)[0].length;
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const structural = trimmed.match(STRUCTURAL_RE);
    if (structural) {
      currentSection = null;
      currentStructural = {
        type: structural[1].toLowerCase(),
        kind: structural[1],
        name: structural[2].replace(/\s+#.*$/, "").trim(),
        id: null,
        idLine: null,
        line: lineNumber,
        indent,
        sections: [],
        sectionOrder: [],
      };
      elements.push(currentStructural);
      continue;
    }

    const idMatch = trimmed.match(ID_RE);
    if (idMatch) {
      currentSection = null;
      const value = idMatch[1].replace(/\s+#.*$/, "").trim();
      elements.push({
        type: "id",
        value,
        line: lineNumber,
        indent,
        owner: currentStructural,
      });
      if (currentStructural) {
        currentStructural.sectionOrder.push({ name: "ID", line: lineNumber });
      }
      continue;
    }

    const sectionMatch = trimmed.match(SECTION_RE);
    if (sectionMatch) {
      const name = sectionMatch[1];
      currentSection = {
        type: "section",
        name,
        key: name.toLowerCase(),
        line: lineNumber,
        indent,
        items: [],
      };
      if (currentStructural) {
        currentStructural.sections.push(currentSection);
        currentStructural.sectionOrder.push({ name, line: lineNumber });
      } else {
        elements.push(currentSection);
      }
      continue;
    }

    if (IF_FAILS_RE.test(trimmed)) {
      currentSection = null;
      const rest = trimmed.replace(/^If\b.+?\bfails\b\s*:?\s*/, "").trim();
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.ifFails,
        text: rest || trimmed,
        line: lineNumber,
        indent,
      });
      continue;
    }

    if (AT_SAME_TIME_RE.test(trimmed)) {
      currentSection = null;
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.atTheSameTime,
        text: "",
        line: lineNumber,
        indent,
      });
      continue;
    }

    const goTo = trimmed.match(GO_TO_RE);
    if (goTo) {
      currentSection = null;
      elements.push({
        type: "flow-control",
        kind: FLOW_CONTROL.goTo,
        text: goTo[1].replace(/\s+#.*$/, "").trim(),
        line: lineNumber,
        indent,
      });
      continue;
    }

    const flowControl = trimmed.match(FLOW_CONTROL_RE);
    if (flowControl) {
      currentSection = null;
      elements.push({
        type: "flow-control",
        kind: flowControl[1],
        text: flowControl[2].replace(/\s+#.*$/, "").trim(),
        line: lineNumber,
        indent,
      });
      continue;
    }

    // Ordinary descriptive prose / list items
    if (currentSection && indent > currentSection.indent) {
      currentSection.items.push({
        text: trimmed,
        line: lineNumber,
      });
      continue;
    }

    elements.push({
      type: "text",
      text: trimmed,
      line: lineNumber,
      indent,
    });
  }

  return {
    type: "document",
    elements,
  };
}

function isValidIdFormat(value) {
  const { ID_PATTERN } = require("./constants");
  return ID_PATTERN.test(value);
}

module.exports = {
  parse,
  isValidIdFormat,
  SECTION_DIRECTIVES,
};
