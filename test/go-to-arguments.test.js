const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTree, lintFlowSpecFile } = require("../lib");

describe("Go to arguments", () => {
  const source = [
    "Flow Campaign reply",
    "  Action Continue",
    "    Steps",
    "      Go to Generate assistant reply",
    "        With campaign AI instructions from the campaign",
    "        Without user input",
    "  Action Generate assistant reply",
    "    Steps",
    "      Generate the reply",
  ].join("\n");

  it("owns indented argument clauses on the Go to node", () => {
    const { root } = parseTree(source, "arguments.flowspec");
    const flow = root.children.find((node) => node.type === "flow");
    const start = flow.children.find((node) => node.value === "Continue");
    const goTo = start.children[0].children.find((node) => node.type === "goTo");

    assert.ok(goTo);
    assert.deepEqual(
      goTo.children.map((node) => node.value),
      [
        "With campaign AI instructions from the campaign",
        "Without user input",
      ]
    );
    assert.ok(goTo.children.every((node) => node.type === "content"));
    assert.ok(goTo.children.every((node) => node.parent === goTo));
  });

  it("keeps target resolution and linting valid", () => {
    const diagnostics = lintFlowSpecFile(source, "arguments.flowspec");
    assert.equal(
      diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      0,
      JSON.stringify(diagnostics, null, 2)
    );
    assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "FS014"), false);
  });
});
