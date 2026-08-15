const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse, parseTree, lintFlowSpecFile, DIRECTIVES } = require("../lib");
const language = require("../lib/language");

const root = path.join(__dirname, "..");
const completionSwift = fs.readFileSync(
  path.join(root, "editor", "FlowSpecEditor", "FlowSpecCompletion.swift"),
  "utf8"
);
const grammar = JSON.parse(
  fs.readFileSync(
    path.join(root, "vscode-extension", "syntaxes", "flowspec.tmLanguage.json"),
    "utf8"
  )
);
const sublime = fs.readFileSync(
  path.join(root, "syntaxes", "FlowSpec.sublime-syntax"),
  "utf8"
);

function codes(diagnostics) {
  return diagnostics.map((d) => d.code);
}

function findEntries(rootNode) {
  const entries = [];
  const { walkNodes } = require("../lib/parse");
  walkNodes(rootNode, (node) => {
    if (node.type === "entry") entries.push(node);
  });
  return entries;
}

function allowedSetFromSwift(kindPattern) {
  const match = completionSwift.match(
    new RegExp(`case \\.${kindPattern}:\\s*\\n\\s*\\[([^\\]]+)\\]`)
  );
  assert.ok(match, `expected allowedDirectives case .${kindPattern}`);
  return new Set(
    [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1])
  );
}

describe("Entry language definition", () => {
  it("declares canonical Entry metadata", () => {
    const entry = DIRECTIVES.find((directive) => directive.type === "entry");
    assert.ok(entry);
    assert.equal(entry.name, "Entry");
    assert.equal(entry.category, "metadata");
    assert.equal(
      entry.description,
      "An external trigger through which the owning Flow can begin."
    );
    assert.equal(entry.example, "Entry App launch");
    assert.equal(entry.trailingSpace, true);
    assert.equal(entry.deprecated, undefined);
  });
});

describe("Entry parser", () => {
  it("parses a valid Entry directly under a Flow", () => {
    const source = ["Flow User enters Jack Hunt app", "", "  Entry App launch"].join("\n");
    const { root: tree } = parseTree(source);
    const flow = tree.children.find((node) => node.type === "flow");
    const entry = flow.children.find((node) => node.type === "entry");
    assert.ok(entry);
    assert.equal(entry.value, "App launch");
    assert.equal(entry.parent.type, "flow");
    assert.equal(entry.children.length, 0);

    const doc = parse(source);
    const parsed = doc.elements.find((element) => element.type === "entry");
    assert.ok(parsed);
    assert.equal(parsed.value, "App launch");
  });

  it("supports optional-colon syntax", () => {
    const source = ["Flow Example", "  Entry: App launch"].join("\n");
    const { root: tree } = parseTree(source);
    const entry = findEntries(tree)[0];
    assert.equal(entry.value, "App launch");
    assert.equal(entry.parent.type, "flow");
  });

  it("parses multiple Entries on one Flow", () => {
    const source = [
      "Flow User opens a conversation",
      "  Entry Push notification",
      "  Entry Conversation deep link",
    ].join("\n");
    const { root: tree } = parseTree(source);
    const flow = tree.children.find((node) => node.type === "flow");
    const entries = flow.children.filter((node) => node.type === "entry");
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((node) => node.value),
      ["Push notification", "Conversation deep link"]
    );
  });

  it("preserves Entry values in the parse tree", () => {
    const source = [
      "Flow Example",
      "Id example.flow",
      "  Entry App launch",
      "  Entry Deep link",
    ].join("\n");
    const { root: tree } = parseTree(source);
    const flow = tree.children.find((node) => node.type === "flow");
    assert.equal(flow.id, "example.flow");
    assert.deepEqual(
      flow.children.filter((node) => node.type === "entry").map((node) => node.value),
      ["App launch", "Deep link"]
    );
  });

  it("keeps a Flow with no Entry valid", () => {
    const source = ["Flow Example", "  Screen Home"].join("\n");
    const { root: tree } = parseTree(source);
    const flow = tree.children.find((node) => node.type === "flow");
    assert.equal(flow.children.some((node) => node.type === "entry"), false);
    const diagnostics = lintFlowSpecFile(source, "none.flowspec");
    assert.equal(
      diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );
  });
});

describe("Entry linter", () => {
  it("rejects an empty Entry trigger", () => {
    const source = ["Flow Example", "  Entry"].join("\n");
    const diagnostics = lintFlowSpecFile(source, "empty.flowspec");
    const error = diagnostics.find((diagnostic) => diagnostic.code === "FS026");
    assert.ok(error, JSON.stringify(diagnostics, null, 2));
    assert.equal(error.severity, "error");
    assert.match(error.message, /non-empty trigger/);
  });

  it("rejects a root-level Entry", () => {
    const diagnostics = lintFlowSpecFile("Entry App launch\n", "root.flowspec");
    assert.ok(
      diagnostics.some((diagnostic) => diagnostic.code === "FS001"),
      JSON.stringify(diagnostics, null, 2)
    );
    assert.ok(
      diagnostics.some((diagnostic) => diagnostic.code === "FS025"),
      JSON.stringify(diagnostics, null, 2)
    );
  });

  it("rejects an unindented Entry after a Flow", () => {
    const source = ["Flow Example", "", "Entry App launch"].join("\n");
    const diagnostics = lintFlowSpecFile(source, "root-after-flow.flowspec");
    assert.ok(codes(diagnostics).includes("FS024"));
    assert.ok(codes(diagnostics).includes("FS025"));
  });

  it("rejects Entry beneath a Screen", () => {
    const source = ["Flow Example", "  Screen Home", "    Entry App launch"].join("\n");
    const diagnostics = lintFlowSpecFile(source, "screen.flowspec");
    const error = diagnostics.find((diagnostic) => diagnostic.code === "FS025");
    assert.ok(error, JSON.stringify(diagnostics, null, 2));
    assert.equal(error.severity, "error");
    assert.match(error.message, /direct child of a Flow/);
  });

  it("rejects Entry beneath an Action", () => {
    const source = [
      "Flow Example",
      "  Action Bootstrap",
      "    Entry App launch",
    ].join("\n");
    const diagnostics = lintFlowSpecFile(source, "action.flowspec");
    assert.ok(
      diagnostics.some((diagnostic) => diagnostic.code === "FS025"),
      JSON.stringify(diagnostics, null, 2)
    );
  });

  it("rejects Entry beneath a behavioral or control-flow directive", () => {
    const behavioral = lintFlowSpecFile(
      ["Flow Example", "  Receives", "    Entry App launch"].join("\n"),
      "receives.flowspec"
    );
    const control = lintFlowSpecFile(
      ["Flow Example", "  Once signed in", "    Entry App launch"].join("\n"),
      "once.flowspec"
    );
    assert.ok(codes(behavioral).includes("FS025"), JSON.stringify(behavioral, null, 2));
    assert.ok(codes(control).includes("FS025"), JSON.stringify(control, null, 2));
  });

  it("rejects children nested beneath Entry", () => {
    const source = [
      "Flow Example",
      "  Entry App launch",
      "    Go to Home",
    ].join("\n");
    const { root: tree } = parseTree(source);
    const entry = findEntries(tree)[0];
    assert.ok(entry.children.length > 0);
    const diagnostics = lintFlowSpecFile(source, "children.flowspec");
    const error = diagnostics.find((diagnostic) => diagnostic.code === "FS027");
    assert.ok(error, JSON.stringify(diagnostics, null, 2));
    assert.equal(error.severity, "error");
    assert.match(error.message, /cannot own indented children/);
  });

  it("suggests Entry for incorrect casing", () => {
    const source = ["Flow Example", "  entry App launch"].join("\n");
    const diagnostics = lintFlowSpecFile(source, "casing.flowspec");
    const warning = diagnostics.find((diagnostic) => diagnostic.code === "FS016");
    assert.ok(warning, JSON.stringify(diagnostics, null, 2));
    assert.equal(warning.severity, "warning");
    assert.match(warning.message, /Did you mean "Entry"/);
    assert.equal(warning.suggestion, "Entry");
  });

  it("warns on exact duplicate Entry values within the same Flow", () => {
    const source = [
      "Flow Example",
      "  Entry App launch",
      "  Entry App launch",
    ].join("\n");
    const diagnostics = lintFlowSpecFile(source, "duplicate.flowspec");
    const warning = diagnostics.find((diagnostic) => diagnostic.code === "FS108");
    assert.ok(warning, JSON.stringify(diagnostics, null, 2));
    assert.equal(warning.severity, "warning");
    assert.match(warning.message, /Duplicate Entry "App launch"/);
  });

  it("does not warn on distinct Entry values", () => {
    const source = [
      "Flow Example",
      "  Entry App launch",
      "  Entry Deep link",
    ].join("\n");
    const diagnostics = lintFlowSpecFile(source, "distinct.flowspec");
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === "FS108"),
      false
    );
  });
});

describe("Entry Go to resolution", () => {
  it("resolves Go to to Flow, Screen, and Action names, not Entry text", () => {
    const source = [
      "Flow User enters Jack Hunt app",
      "  Entry App launch",
      "  Screen Login options",
      "  Once authentication state is known",
      "    Go to Login options",
      "    Go to Load signed-in experience",
      "    Go to App launch",
      "  Action Load signed-in experience",
      "    Steps",
      "      Hide the splash screen",
    ].join("\n");
    const diagnostics = lintFlowSpecFile(source, "goto.flowspec");
    assert.equal(
      diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );
    const unresolved = diagnostics.filter((diagnostic) => diagnostic.code === "FS014");
    assert.equal(unresolved.length, 1, JSON.stringify(unresolved, null, 2));
    assert.match(unresolved[0].message, /App launch/);
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === "FS014" && /Login options/.test(diagnostic.message)),
      false
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "FS014" && /Load signed-in experience/.test(diagnostic.message)
      ),
      false
    );
  });
});

describe("Entry contextual autocomplete", () => {
  it("offers Entry only beneath Flow and keeps it after the first occurrence", () => {
    assert.match(completionSwift, /directive: "Entry"/);
    assert.match(
      completionSwift,
      /directive: "Entry", detail: "Mark an external trigger that can begin this Flow", addsTrailingSpace: true/
    );

    const document = allowedSetFromSwift("document");
    const flow = allowedSetFromSwift("flow");
    const screen = allowedSetFromSwift("screen");
    const action = allowedSetFromSwift("action");
    const section = allowedSetFromSwift("section");
    const steps = allowedSetFromSwift("steps, \\.parallel");

    assert.equal(document.has("Entry"), false);
    assert.equal(flow.has("Entry"), true);
    assert.equal(screen.has("Entry"), false);
    assert.equal(action.has("Entry"), false);
    assert.equal(section.has("Entry"), false);
    assert.equal(steps.has("Entry"), false);

    const unique = completionSwift.match(/for uniqueDirective in \[([^\]]+)\]/);
    assert.ok(unique);
    assert.equal(unique[1].includes('"Entry"'), false);
  });
});

describe("Entry syntax grammars", () => {
  it("recognizes Entry only at the beginning of a line after indentation", () => {
    const tmBegin = grammar.repository["entry-directive"].begin;
    assert.equal(tmBegin.startsWith("^"), true);
    assert.match(tmBegin, /\\s\*\)\(Entry\)/);
    assert.ok(sublime.includes("entry-directive"));
    assert.match(sublime, /^\s+- match: '\^\(\\s\*\)\(Entry\)\\b/m);

    const pattern = new RegExp(tmBegin);
    assert.equal(pattern.test("  Entry App launch"), true);
    assert.equal(pattern.test("Entry App launch"), true);
    assert.equal(pattern.test("    Entry: Password reset link"), true);
    assert.equal(pattern.test("Record the catalog entry for the user"), false);
    assert.equal(pattern.test("  Record the catalog entry for the user"), false);
    assert.equal(pattern.test("  Continue after the entry point"), false);
  });

  it("treats directive-like uses of entry in ordinary prose as ordinary prose", () => {
    const source = [
      "Flow Demo",
      "  Action Demo",
      "    Rules",
      "      Record the catalog entry for the user",
      "      Continue after the entry point",
    ].join("\n");
    const { root: tree } = parseTree(source);
    assert.equal(findEntries(tree).length, 0);
    const diagnostics = lintFlowSpecFile(source, "prose.flowspec");
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === "FS016"),
      false,
      JSON.stringify(diagnostics, null, 2)
    );

    const highlights = language.syntaxHighlights(source).map((highlight) =>
      source.slice(highlight.location, highlight.location + highlight.length)
    );
    assert.equal(highlights.includes("Entry"), false);
    assert.ok(highlights.includes("Flow"));
    assert.ok(highlights.includes("Rules"));
  });
});

describe("canonical Entry example", () => {
  it("parses the Jack Hunt app launch example without structural errors", () => {
    const source = fs.readFileSync(
      path.join(root, "examples", "fixtures", "user-enters-jack-hunt-app.flowspec"),
      "utf8"
    );
    const { root: tree } = parseTree(source);
    const flow = tree.children.find((node) => node.type === "flow");
    const entry = flow.children.find((node) => node.type === "entry");
    const screen = flow.children.find((node) => node.type === "screen");
    assert.equal(flow.value, "User enters Jack Hunt app");
    assert.equal(entry.value, "App launch");
    assert.equal(entry.parent.type, "flow");
    assert.equal(screen.value, "Login options");
    assert.equal(screen.parent.type, "flow");

    const diagnostics = lintFlowSpecFile(
      source,
      "examples/fixtures/user-enters-jack-hunt-app.flowspec"
    );
    assert.equal(
      diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );
  });
});
