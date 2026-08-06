/**
 * Stable diagnostic helpers for FlowSpec linting.
 */

/**
 * @typedef {"error" | "warning"} DiagnosticSeverity
 *
 * @typedef {object} RelatedLocation
 * @property {string} message
 * @property {string} filePath
 * @property {number} line
 * @property {number} column
 *
 * @typedef {object} FlowSpecDiagnostic
 * @property {string} code
 * @property {DiagnosticSeverity} severity
 * @property {string} message
 * @property {string} filePath
 * @property {number} line
 * @property {number} column
 * @property {number} [endLine]
 * @property {number} [endColumn]
 * @property {string} [suggestion]
 * @property {RelatedLocation[]} [relatedLocations]
 */

/**
 * @param {Partial<FlowSpecDiagnostic> & Pick<FlowSpecDiagnostic, "code" | "severity" | "message" | "filePath" | "line" | "column">} partial
 * @returns {FlowSpecDiagnostic}
 */
function createDiagnostic(partial) {
  /** @type {FlowSpecDiagnostic} */
  const diagnostic = {
    code: partial.code,
    severity: partial.severity,
    message: partial.message,
    filePath: partial.filePath,
    line: partial.line,
    column: partial.column,
  };
  if (partial.endLine != null) diagnostic.endLine = partial.endLine;
  if (partial.endColumn != null) diagnostic.endColumn = partial.endColumn;
  if (partial.suggestion != null) diagnostic.suggestion = partial.suggestion;
  if (partial.relatedLocations != null) {
    diagnostic.relatedLocations = partial.relatedLocations;
  }
  return diagnostic;
}

/**
 * @param {FlowSpecDiagnostic[]} diagnostics
 * @returns {FlowSpecDiagnostic[]}
 */
function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath < b.filePath ? -1 : 1;
    }
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}

/**
 * @param {FlowSpecDiagnostic[]} diagnostics
 * @returns {{ errors: number, warnings: number }}
 */
function countDiagnostics(diagnostics) {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

module.exports = {
  createDiagnostic,
  sortDiagnostics,
  countDiagnostics,
};
