const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const language = require("../lib/language");
const constants = require("../lib/constants");

describe("canonical language definition", () => {
  it("drives exported parser constants", () => {
    assert.deepEqual(
      constants.STRUCTURAL_DIRECTIVES,
      language.directives("structural").map((directive) => directive.name)
    );
    assert.deepEqual(
      constants.SECTION_DIRECTIVES,
      language.directives("section").map((directive) => directive.name)
    );
    assert.deepEqual(constants.RECOMMENDED_SECTION_ORDER, language.RECOMMENDED_SECTION_ORDER);
    assert.equal(constants.ENTRY_DIRECTIVE, "Entry");
  });

  it("provides presentation-neutral UTF-16 highlight ranges", () => {
    const source = "Flow Emoji 😀\n  Entry App launch\n  Screen Result\n    Shows\n      # note\n  If search fails\n";
    const highlights = language.syntaxHighlights(source);
    assert.deepEqual(highlights.map(({ category }) => category), [
      "structural", "section", "structural", "section", "comment", "control",
    ]);
    for (const highlight of highlights) {
      assert.ok(highlight.location >= 0);
      assert.ok(highlight.length > 0);
      assert.ok(highlight.location + highlight.length <= source.length);
    }
  });

  it("highlights With and Without only beneath Go to", () => {
    const source = [
      "Flow Demo",
      "  With ordinary prose outside a handoff",
      "  Go to Destination",
      "    With campaign context",
      "    Without user input",
      "  Without ordinary prose after the handoff",
    ].join("\n");
    const highlightedText = language.syntaxHighlights(source).map((highlight) =>
      source.slice(highlight.location, highlight.location + highlight.length)
    );

    assert.deepEqual(highlightedText, ["Flow", "Go to", "With", "Without"]);
  });

  it("is represented in the generated documentation and TextMate grammar", () => {
    const root = path.join(__dirname, "..");
    const docs = fs.readFileSync(path.join(root, "docs/language-reference.md"), "utf8");
    const grammar = fs.readFileSync(
      path.join(root, "vscode-extension/syntaxes/flowspec.tmLanguage.json"),
      "utf8"
    );
    for (const directive of language.DIRECTIVES) {
      assert.ok(docs.includes(`| \`${directive.name}\` |`));
      if (!directive.variable) assert.ok(grammar.includes(directive.name));
    }
    for (const requirement of language.LANGUAGE_REQUIREMENTS) {
      assert.ok(docs.includes(requirement));
    }
  });
});
