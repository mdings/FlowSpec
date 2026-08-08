const { parse, parseTree, isValidIdFormat } = require("./parse");
const { validate, ID_PATTERN } = require("./validate");
const {
  lintFlowSpecFile,
  lintFlowSpecProject,
  countDiagnostics,
} = require("./lint");
const {
  createDiagnostic,
  sortDiagnostics,
} = require("./diagnostics");
const {
  collectStructuralTargets,
  isTopLevelGoToTarget,
  matchGoToTargets,
  getGoToTargetRange,
  findGoToAtPosition,
  resolveGoToDefinitions,
} = require("./goto");
const constants = require("./constants");

module.exports = {
  parse,
  parseTree,
  validate,
  isValidIdFormat,
  ID_PATTERN,
  lintFlowSpecFile,
  lintFlowSpecProject,
  countDiagnostics,
  createDiagnostic,
  sortDiagnostics,
  collectStructuralTargets,
  isTopLevelGoToTarget,
  matchGoToTargets,
  getGoToTargetRange,
  findGoToAtPosition,
  resolveGoToDefinitions,
  ...constants,
};
