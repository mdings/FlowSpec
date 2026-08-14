/**
 * Canonical FlowSpec language definition.
 *
 * Parser recognition, editor highlighting, generated documentation, completion
 * metadata, and portable grammars all derive from this module. Keep semantic
 * lint algorithms in lint.js; do not duplicate language vocabulary in a surface.
 */

const DIRECTIVES = [
  { name: "Flow", type: "flow", category: "structural", description: "Names a complete user journey, capability, or process. May own behavioral sections directly.", example: "Flow: Bootstrap conversation", trailingSpace: true, deprecated: ["FLOW"] },
  { name: "Screen", type: "screen", category: "structural", description: "Defines the screen, page, modal, or UI context.", example: "Screen: Conversation", trailingSpace: true, deprecated: ["SCREEN"] },
  { name: "Action", type: "action", category: "structural", description: "Independently meaningful behavior inside or alongside a Flow. The keyword may be omitted for a local interaction under a Screen or Section.", example: "Action: Create quick replies", trailingSpace: true, deprecated: ["ACTION"] },
  { name: "Section", type: "section", category: "structural", description: "A meaningful, non-navigable region within a Screen or nested Section.", example: "Section: Sidebar", trailingSpace: true, deprecated: ["SECTION"] },
  { name: "Layout", type: "layout", category: "structural", description: "Describes spatial relationships between direct child Sections of a Screen or Section.", example: "Layout", trailingSpace: false, deprecated: ["LAYOUT"] },
  { name: "Id", type: "id", category: "metadata", description: "Optional stable machine-readable reference for a Flow, Screen, or explicit Action.", example: "Id: conversation.create-quick-replies", trailingSpace: true, deprecated: ["ID"] },
  { name: "Receives", type: "receives", category: "section", description: "Information the Flow or Action needs before it can run.", example: "Receives", trailingSpace: false },
  { name: "Rules", type: "rules", category: "section", description: "Constraints that must remain true within the owning Flow, Action, or Layout.", example: "Rules", trailingSpace: false },
  { name: "Uses", type: "uses", category: "section", description: "Services, models, tools, or runtime configuration used by a Flow or Action.", example: "Uses", trailingSpace: false },
  { name: "Steps", type: "steps", category: "section", description: "Required functional work, without technical or test details.", example: "Steps", trailingSpace: false },
  { name: "Shows", type: "shows", category: "section", description: "What becomes visible on a Flow, Screen, Section, or Action.", example: "Shows", trailingSpace: false },
  { name: "Outcome", type: "outcome", category: "section", description: "An observable or reusable result that other behavior can wait for.", example: "Outcome", trailingSpace: false },
  { name: "When", type: "when", category: "control", description: "Behavioral trigger that starts activity.", example: "When the user sends a message", trailingSpace: true },
  { name: "Once", type: "once", category: "control", description: "Starts after an outcome or dependency is available.", example: "Once product results are available", trailingSpace: true },
  { name: "If", type: "if", category: "control", description: "Conditional path.", example: "If the best result is a brand", trailingSpace: true },
  { name: "Otherwise", type: "otherwise", category: "control", description: "Alternate path for the preceding If.", example: "Otherwise", trailingSpace: false },
  { name: "At the same time", type: "parallel", category: "control", description: "Parallel work inside Steps.", example: "At the same time", trailingSpace: false },
  { name: "If ... fails", type: "ifFails", category: "control", description: "Fallback when something cannot complete successfully.", example: "If product search fails", trailingSpace: true, variable: true },
  { name: "Go to", type: "goTo", category: "control", description: "Navigates to a top-level Flow, Screen, or Action name or Id.", example: "Go to: Verify login code", trailingSpace: true },
];
const HIGHLIGHT_DIRECTIVES = [
  ...DIRECTIVES.filter((directive) => directive.variable),
  ...DIRECTIVES.filter((directive) => !directive.variable),
];

const LANGUAGE_REQUIREMENTS = [
  "A file must start with a single top-level Flow; blank lines and # comments may precede it.",
  "Hierarchy and ownership are indentation-based. Adjacency never implies ownership, and tabs and spaces must not be mixed.",
  "Directives are recognized only at the beginning of a line after optional indentation; trailing colons are optional.",
  "Flow, Screen, Action, Section, Layout, Id, behavioral sections, and control flow use the canonical casing shown in the directive reference.",
  "Id is optional on Flow, Screen, and explicit Action only. Section, Layout, and implicit Actions cannot own an Id.",
  "Receives, Rules, Uses, Steps, Shows, and Outcome are optional.",
  "A Flow or explicit Action may own behavioral sections directly.",
  "Section is a non-navigable region inside a Screen or Section; Layout describes direct child Sections.",
  "A named interaction directly under a Screen or Section becomes an implicit Action when it has nested behavior.",
  "Once, If, Otherwise, and If ... fails may appear in Flow, Screen, Action, or Steps; At the same time belongs only inside Steps.",
  "Go to resolves only to top-level Flow, Screen, or Action names and Ids, never Section or Layout.",
];

const AUTHORING_GUIDELINES = [
  "Omit information that can be safely inferred from structural context.",
  "Prefer concise Screen interactions over verbose When plus Action for local UI.",
  "Keep When for system, external, lifecycle, or otherwise meaningful triggers.",
  "Omit Outcome when it merely restates its Flow or Action.",
  "Omit Receives when the input is already obvious from context.",
  "Prefer one Action with If and Otherwise for variants of the same decision.",
  "Avoid duplicated Rules and single-step wrapper Actions.",
  "Keep Steps functional rather than technical or test-oriented.",
];

const RECOMMENDED_SECTION_ORDER = ["Receives", "Rules", "Uses", "Steps", "Shows", "Outcome"];

function directives(category) {
  return DIRECTIVES.filter((directive) => directive.category === category);
}

function canonicalNames(category) {
  return directives(category).map((directive) => directive.name);
}

function regexAlternation(values) {
  return [...values]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function literalSpellings(category) {
  return directives(category).flatMap((directive) => [
    directive.name,
    ...(directive.deprecated || []),
  ]);
}

function authoringGuide() {
  const supported = DIRECTIVES.map((directive) => directive.name).join(", ");
  return [
    "FlowSpec is a human-readable behavioral specification for application logic.",
    "It defines what an application must do, not how to implement it.",
    "",
    "Language requirements:",
    ...LANGUAGE_REQUIREMENTS.map((rule) => `- ${rule}`),
    "",
    `Supported directives: ${supported}.`,
    `Recommended section order: ${RECOMMENDED_SECTION_ORDER.join(" → ")}.`,
    "",
    "Authoring guidelines:",
    ...AUTHORING_GUIDELINES.map((rule) => `- ${rule}`),
    "",
    "Return valid FlowSpec only. Preserve meaningful Ids and comments and do not invent unrelated flows.",
  ].join("\n");
}

/** Return presentation-neutral directive ranges, using JavaScript/NSString UTF-16 offsets. */
function syntaxHighlights(source) {
  const text = String(source);
  const result = [];
  let offset = 0;
  for (const line of text.split(/\n/)) {
    const indent = (line.match(/^[ \t]*/) || [""])[0].length;
    const body = line.slice(indent);
    if (body.startsWith("#")) {
      result.push({ location: offset + indent, length: line.length - indent, category: "comment" });
    } else {
      // Variable phrases (If ... fails) must win over their shorter prefix (If).
      const directive = HIGHLIGHT_DIRECTIVES.find((candidate) => {
        if (candidate.variable) return /^If\b.+?\bfails\b(?:\s*:)?(?=\s|$)/.test(body);
        const spellings = [candidate.name, ...(candidate.deprecated || [])];
        return spellings.some((name) => body === name || body.startsWith(`${name}:`) || body.startsWith(`${name} `));
      });
      if (directive) {
        const matchedName = directive.variable
          ? (body.match(/^If\b.+?\bfails\b/) || [directive.name])[0]
          : [directive.name, ...(directive.deprecated || [])].find((name) => body === name || body.startsWith(`${name}:`) || body.startsWith(`${name} `));
        result.push({
          location: offset + indent,
          length: matchedName.length,
          category: directive.category === "structural" ? "structural" : directive.category === "control" ? "control" : "section",
        });
      }
      const comment = line.indexOf("#");
      if (comment >= 0) result.push({ location: offset + comment, length: line.length - comment, category: "comment" });
    }
    offset += line.length + 1;
  }
  return result;
}

module.exports = {
  DIRECTIVES,
  LANGUAGE_REQUIREMENTS,
  AUTHORING_GUIDELINES,
  RECOMMENDED_SECTION_ORDER,
  directives,
  canonicalNames,
  literalSpellings,
  regexAlternation,
  authoringGuide,
  syntaxHighlights,
};
