/**
 * FlowSpec v1 shared constants.
 */

const {
  DIRECTIVES,
  LANGUAGE_REQUIREMENTS,
  AUTHORING_GUIDELINES,
  RECOMMENDED_SECTION_ORDER,
  canonicalNames,
} = require("./language");

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** Canonical visible forms (Title Case). */
const STRUCTURAL_DIRECTIVES = canonicalNames("structural");

const ID_DIRECTIVE = DIRECTIVES.find((directive) => directive.type === "id").name;

const ENTRY_DIRECTIVE = DIRECTIVES.find((directive) => directive.type === "entry").name;

const SECTION_DIRECTIVES = canonicalNames("section");

/** Deprecated uppercase forms still accepted for backwards-compatible parsing. */
const DEPRECATED_STRUCTURAL = Object.fromEntries(
  DIRECTIVES.filter((directive) =>
    directive.category === "structural" || directive.category === "metadata"
  ).flatMap((directive) =>
    (directive.deprecated || []).map((spelling) => [spelling, directive.name])
  )
);

const controlByType = Object.fromEntries(
  DIRECTIVES.filter((directive) => directive.category === "control")
    .map((directive) => [directive.type, directive.name])
);
const FLOW_CONTROL = {
  ifFails: controlByType.ifFails,
  atTheSameTime: controlByType.parallel,
  goTo: controlByType.goTo,
  when: controlByType.when,
  once: controlByType.once,
  if: controlByType.if,
  otherwise: controlByType.otherwise,
};

/** All canonical directive spellings for suggestion lookup (lowercase key → Title Case). */
const DIRECTIVE_SUGGESTIONS = Object.fromEntries(
  DIRECTIVES.filter((directive) => !directive.variable && !directive.parent).map((directive) => [
    directive.name.toLowerCase(),
    directive.name,
  ])
);

module.exports = {
  ID_PATTERN,
  STRUCTURAL_DIRECTIVES,
  ID_DIRECTIVE,
  ENTRY_DIRECTIVE,
  SECTION_DIRECTIVES,
  DEPRECATED_STRUCTURAL,
  RECOMMENDED_SECTION_ORDER,
  FLOW_CONTROL,
  DIRECTIVE_SUGGESTIONS,
  DIRECTIVES,
  LANGUAGE_REQUIREMENTS,
  AUTHORING_GUIDELINES,
};
