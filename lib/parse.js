/**
 * Minimal line-oriented FlowSpec v1 parser.
 * Accepts Title Case directives; also accepts deprecated uppercase FLOW/SCREEN/ACTION/ID.
 * Normalizes structural kind names to Title Case in the AST.
 */

const {
  FLOW_CONTROL,
  DEPRECATED_STRUCTURAL,
  DIRECTIVE_SUGGESTIONS,
  SECTION_DIRECTIVES,
} = require("./constants");

const STRUCTURAL_RE =
  /^(Flow|FLOW|Screen|SCREEN|Action|ACTION)\b\s*:?\s*(.*)$/;
const ID_RE = /^(Id|ID)\b\s*:?\s*(.*)$/;
const SECTION_RE = /^(Receives|Rules|Steps|Shows|Outcome)\b\s*:?\s*(.*)$/;
const IF_FAILS_RE = /^If\b.+?\bfails\b\s*:?\s*(.*)$/;
const AT_SAME_TIME_RE = /^At the same time\b\s*:?\s*(.*)$/;
const GO_TO_RE = /^Go to\b\s*:?\s*(.*)$/;
const FLOW_CONTROL_RE = /^(When|Once|If|Otherwise)\b\s*:?\s*(.*)$/;

const STRUCTURAL_NORMALIZE = {
  Flow: "Flow",
  FLOW: "Flow",
  Screen: "Screen",
  SCREEN: "Screen",
  Action: "Action",
  ACTION: "Action",
};

/**
 * @param {string} source
 * @returns {{ type: 'document', elements: object[] }}
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
      const rawKind = structural[1];
      const kind = STRUCTURAL_NORMALIZE[rawKind];
      currentStructural = {
        type: kind.toLowerCase(),
        kind,
        rawKind,
        deprecatedCasing: Boolean(DEPRECATED_STRUCTURAL[rawKind]),
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
      const rawKind = idMatch[1];
      const value = idMatch[2].replace(/\s+#.*$/, "").trim();
      elements.push({
        type: "id",
        value,
        rawKind,
        deprecatedCasing: rawKind === "ID",
        line: lineNumber,
        indent,
        owner: currentStructural,
      });
      if (currentStructural) {
        currentStructural.sectionOrder.push({ name: "Id", line: lineNumber });
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

    // Ordinary descriptive prose / list items (before near-miss checks)
    if (currentSection && indent > currentSection.indent) {
      currentSection.items.push({
        text: trimmed,
        line: lineNumber,
      });
      continue;
    }

    const nearMiss = detectIncorrectDirectiveCasing(trimmed);
    if (nearMiss) {
      currentSection = null;
      elements.push({
        type: "unknown-directive",
        raw: nearMiss.raw,
        suggestion: nearMiss.suggestion,
        line: lineNumber,
        indent,
        text: trimmed,
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

/**
 * Detect incorrectly cased directive lookalikes at line start.
 * Does not match mid-line prose (caller only passes trimmed full lines that failed exact matches).
 * @param {string} trimmed
 * @returns {{ raw: string, suggestion: string } | null}
 */
function detectIncorrectDirectiveCasing(trimmed) {
  if (/^at\s+the\s+same\s+time\b/i.test(trimmed) && !/^At the same time\b/.test(trimmed)) {
    const raw = trimmed.match(/^at\s+the\s+same\s+time/i)[0];
    return { raw, suggestion: "At the same time" };
  }

  if (/^go\s+to\b/i.test(trimmed) && !/^Go to\b/.test(trimmed)) {
    const raw = trimmed.match(/^go\s+to/i)[0];
    return { raw, suggestion: "Go to" };
  }

  // "If ... fails" with wrong If casing
  if (/^if\b.+\bfails\b/i.test(trimmed) && !/^If\b/.test(trimmed)) {
    const raw = trimmed.match(/^if\b/i)[0];
    return { raw, suggestion: "If" };
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

  // Near-miss plurals / suffixes, e.g. ACTIONs → Action
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

module.exports = {
  parse,
  isValidIdFormat,
  detectIncorrectDirectiveCasing,
  SECTION_DIRECTIVES,
};
