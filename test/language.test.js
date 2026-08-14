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
  });

  it("provides presentation-neutral UTF-16 highlight ranges", () => {
    const source = "Flow Emoji 😀\n  Shows\n    # note\n  If search fails\n";
    const highlights = language.syntaxHighlights(source);
    assert.deepEqual(highlights.map(({ category }) => category), [
      "structural", "section", "comment", "control",
    ]);
    for (const highlight of highlights) {
      assert.ok(highlight.location >= 0);
      assert.ok(highlight.length > 0);
      assert.ok(highlight.location + highlight.length <= source.length);
    }
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
