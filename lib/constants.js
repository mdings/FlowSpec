/**
 * FlowSpec v1 shared constants.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** Canonical visible forms (Title Case). */
const STRUCTURAL_DIRECTIVES = ["Flow", "Screen", "Action"];

const ID_DIRECTIVE = "Id";

const SECTION_DIRECTIVES = [
  "Receives",
  "Rules",
  "Uses",
  "Steps",
  "Shows",
  "Outcome",
];

/** Recommended order of action sections (Id is separate). */
const RECOMMENDED_SECTION_ORDER = [
  "Receives",
  "Rules",
  "Uses",
  "Steps",
  "Shows",
  "Outcome",
];

/** Deprecated uppercase forms still accepted for backwards-compatible parsing. */
const DEPRECATED_STRUCTURAL = {
  FLOW: "Flow",
  SCREEN: "Screen",
  ACTION: "Action",
  ID: "Id",
};

const FLOW_CONTROL = {
  ifFails: "If ... fails",
  atTheSameTime: "At the same time",
  goTo: "Go to",
  when: "When",
  once: "Once",
  if: "If",
  otherwise: "Otherwise",
};

/** All canonical directive spellings for suggestion lookup (lowercase key → Title Case). */
const DIRECTIVE_SUGGESTIONS = {
  flow: "Flow",
  screen: "Screen",
  action: "Action",
  id: "Id",
  receives: "Receives",
  rules: "Rules",
  uses: "Uses",
  steps: "Steps",
  shows: "Shows",
  outcome: "Outcome",
  when: "When",
  once: "Once",
  if: "If",
  otherwise: "Otherwise",
};

module.exports = {
  ID_PATTERN,
  STRUCTURAL_DIRECTIVES,
  ID_DIRECTIVE,
  SECTION_DIRECTIVES,
  DEPRECATED_STRUCTURAL,
  RECOMMENDED_SECTION_ORDER,
  FLOW_CONTROL,
  DIRECTIVE_SUGGESTIONS,
};
