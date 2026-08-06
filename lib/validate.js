/**
 * Backwards-compatible validate() wrapper around the FlowSpec linter.
 */

const { lintFlowSpecFile } = require("./lint");
const { parse } = require("./parse");
const { ID_PATTERN } = require("./constants");

/**
 * @param {string} source
 * @param {string} [filePath]
 * @returns {{ document: object, diagnostics: object[] }}
 */
function validate(source, filePath = "<stdin>") {
  const document = parse(source);
  const lintDiagnostics = lintFlowSpecFile(source, filePath);

  // Attach Ids onto legacy structural elements (parse already associates on tree).
  for (const el of document.elements) {
    if (
      (el.type === "flow" || el.type === "screen" || el.type === "action") &&
      el.node
    ) {
      el.id = el.node.id || null;
      el.idLine = el.node.idNode ? el.node.idNode.location.line : null;
    }
  }

  const diagnostics = lintDiagnostics.map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
    line: d.line,
    column: d.column,
    filePath: d.filePath,
    suggestion: d.suggestion,
    relatedLocations: d.relatedLocations,
  }));

  return { document, diagnostics };
}

module.exports = {
  validate,
  ID_PATTERN,
};
