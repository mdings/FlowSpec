/**
 * FlowSpec v1 shared constants.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const STRUCTURAL_DIRECTIVES = ["FLOW", "SCREEN", "ACTION"];

const SECTION_DIRECTIVES = ["Receives", "Rules", "Steps", "Shows", "Outcome"];

/** Recommended order of metadata + action sections under a structural element. */
const RECOMMENDED_SECTION_ORDER = [
  "ID",
  "Receives",
  "Rules",
  "Steps",
  "Shows",
  "Outcome",
];

const FLOW_CONTROL = {
  ifFails: "If ... fails",
  atTheSameTime: "At the same time",
  goTo: "Go to",
  when: "When",
  once: "Once",
  if: "If",
  otherwise: "Otherwise",
};

module.exports = {
  ID_PATTERN,
  STRUCTURAL_DIRECTIVES,
  SECTION_DIRECTIVES,
  RECOMMENDED_SECTION_ORDER,
  FLOW_CONTROL,
};
